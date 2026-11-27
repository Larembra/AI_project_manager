import uuid
from datetime import date, datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.models.ai_tool_call import AIToolCall
from app.models.ai_conversation import AIConversation
from app.models.project import Project, ProjectTask, ProjectDocument
from app.models.user import User
from app.utils.auth import get_current_user
from app.utils.audit import actor_source
from app.schemas.project import TaskCreate
from app.services.tasks import create_project_task as create_project_task_service
from app.services.tasks import update_project_task_record
from app.services.projects import update_project_record
from app.services.documents import create_project_document, update_project_document
from app.schemas.project import DocumentCreate
from app.schemas.invitation import InvitationCreate
from app.services.members import create_organization_invitation
from app.schemas.project import ProjectCreate
from app.services.access import is_project_organizer_or_privileged

router = APIRouter(prefix="/api/ai/actions", tags=["ai-actions"])


async def _owned_pending(db: AsyncSession, user: User, action_id: uuid.UUID) -> AIToolCall:
    result = await db.execute(select(AIToolCall).where(AIToolCall.id == action_id, AIToolCall.user_id == user.id).with_for_update())
    action = result.scalar_one_or_none()
    if not action:
        raise HTTPException(status_code=404, detail="Действие не найдено")
    if action.status not in {"pending_confirmation", "expired"}:
        raise HTTPException(status_code=409, detail="Действие уже обработано")
    if action.expires_at and action.expires_at <= datetime.now(timezone.utc):
        action.status = "expired"
    return action


@router.post("/{action_id}/reject")
async def reject_action(action_id: uuid.UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    action = await _owned_pending(db, user, action_id)
    if action.status == "expired":
        return {"id": str(action.id), "status": action.status}
    action.status = "rejected"
    action.resolved_by = user.id
    action.resolved_at = datetime.now(timezone.utc)
    return {"id": str(action.id), "status": action.status}


@router.post("/{action_id}/confirm")
async def confirm_action(action_id: uuid.UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    action = await _owned_pending(db, user, action_id)
    if action.status == "expired":
        return {"id": str(action.id), "status": action.status}
    conversation = (await db.execute(select(AIConversation).where(AIConversation.id == action.conversation_id, AIConversation.user_id == user.id))).scalar_one_or_none()
    if not conversation:
        raise HTTPException(status_code=404, detail="Диалог не найден")
    args = dict(action.args or {})
    token = actor_source.set("agent")
    try:
        if action.name == "create_project":
            if not action.organization_id:
                raise HTTPException(status_code=400, detail="Организация действия не задана")
            from app.routers.projects import create_project
            created_project = await create_project(action.organization_id, ProjectCreate(**args), current_user=user, db=db)
            action.project_id = created_project.id
            action.result = {"project_id": str(created_project.id), "title": created_project.name}
            action.status = "confirmed"
            action.executed_at = datetime.now(timezone.utc)
        elif action.name == "create_invitation":
            if not action.organization_id:
                raise HTTPException(status_code=400, detail="Организация действия не задана")
            invitation = await create_organization_invitation(db, action.organization_id, InvitationCreate(**args), user)
            action.result = {"invitation_id": str(invitation.id), "email": invitation.email}
            action.status = "confirmed"
            action.executed_at = datetime.now(timezone.utc)
        elif action.name == "create_task":
            project = (await db.execute(select(Project).where(Project.id == action.project_id))).scalar_one_or_none()
            if not project:
                raise HTTPException(status_code=404, detail="Проект не найден")
            title = str(args.get("title", "")).strip()
            if not title or len(title) > 250:
                raise HTTPException(status_code=422, detail="Некорректное название задачи")
            priority = args.get("priority", "medium")
            if priority not in {"low", "medium", "high", "urgent"}:
                raise HTTPException(status_code=422, detail="Некорректный приоритет задачи")
            task = await create_project_task_service(db, project, TaskCreate(title=title, description=args.get("description"), priority=priority), user)
            action.result = {"task_id": str(task.id), "title": task.title}
            action.status = "confirmed"
            action.executed_at = datetime.now(timezone.utc)
        elif action.name == "update_project":
            project = (await db.execute(select(Project).where(Project.id == action.project_id))).scalar_one_or_none()
            if not project:
                raise HTTPException(status_code=404, detail="Проект не найден")
            await update_project_record(db, project, user, args)
            action.result = {"project_id": str(project.id), "name": project.name}
            action.status = "confirmed"
            action.executed_at = datetime.now(timezone.utc)
        elif action.name == "update_task":
            project = (await db.execute(select(Project).where(Project.id == action.project_id))).scalar_one_or_none()
            if not project:
                raise HTTPException(status_code=404, detail="Проект не найден")
            task_id = uuid.UUID(str(args.pop("task_id")))
            task = (await db.execute(select(ProjectTask).where(ProjectTask.id == task_id, ProjectTask.project_id == project.id))).scalar_one_or_none()
            if not task:
                raise HTTPException(status_code=404, detail="Задача не найдена в выбранном проекте")
            changes = {key: date.fromisoformat(value) if key in {"start_date", "due_date"} and value else value for key, value in args.items()}
            await update_project_task_record(db, project, task, user, changes)
            action.result = {"task_id": str(task.id), "title": task.title}
            action.status = "confirmed"
            action.executed_at = datetime.now(timezone.utc)
        elif action.name in {"complete_task", "review_task"}:
            project = (await db.execute(select(Project).where(Project.id == action.project_id))).scalar_one_or_none()
            if not project:
                raise HTTPException(status_code=404, detail="Проект не найден")
            task_id = uuid.UUID(str(args.get("task_id", "")))
            task = (await db.execute(select(ProjectTask).where(ProjectTask.id == task_id, ProjectTask.project_id == project.id).with_for_update())).scalar_one_or_none()
            if not task:
                raise HTTPException(status_code=404, detail="Задача не найдена")
            if action.name == "complete_task":
                can_edit = await is_project_organizer_or_privileged(db, project.id, user.id, project.organization_id, "can_edit_tasks")
                if not can_edit and task.assignee_id != user.id:
                    raise HTTPException(status_code=403, detail="permission_denied")
                if task.status == "completed":
                    raise HTTPException(status_code=409, detail="Задача уже выполнена")
                comment = str(args.get("completion_comment", "")).strip()
                if not comment:
                    raise HTTPException(status_code=422, detail="Отчёт о выполнении обязателен")
                await update_project_task_record(db, project, task, user, {"status": "completed"}, allow_status=True)
                task.completion_comment = comment[:4000]
                action.result = {"task_id": str(task.id), "title": task.title, "status": task.status, "completion_comment": task.completion_comment}
            else:
                can_approve = await is_project_organizer_or_privileged(db, project.id, user.id, project.organization_id, "can_approve_tasks")
                if not can_approve:
                    raise HTTPException(status_code=403, detail="Недостаточно прав для приёмки задачи")
                if task.status != "completed":
                    raise HTTPException(status_code=409, detail="Принимать можно только выполненную задачу")
                comment = str(args.get("approval_comment", "")).strip()
                if not comment:
                    raise HTTPException(status_code=422, detail="Комментарий приёмки обязателен")
                approved = args.get("approved") is True
                task.approved_by_id = user.id
                task.approval_comment = comment[:4000]
                task.approval_status = "approved" if approved else "rejected"
                if not approved:
                    task.status = "in_progress"
                await db.flush()
                action.result = {"task_id": str(task.id), "title": task.title, "status": task.status, "approval_status": task.approval_status, "approval_comment": task.approval_comment}
            action.status = "confirmed"
            action.executed_at = datetime.now(timezone.utc)
        elif action.name == "create_document":
            project = (await db.execute(select(Project).where(Project.id == action.project_id))).scalar_one_or_none()
            if not project:
                raise HTTPException(status_code=404, detail="Проект не найден")
            document = await create_project_document(db, project, DocumentCreate(**args), user)
            action.result = {"document_id": str(document.id), "title": document.title}
            action.status = "confirmed"
            action.executed_at = datetime.now(timezone.utc)
        elif action.name == "update_document":
            project = (await db.execute(select(Project).where(Project.id == action.project_id))).scalar_one_or_none()
            if not project:
                raise HTTPException(status_code=404, detail="Проект не найден")
            document_id = uuid.UUID(str(args.pop("document_id")))
            document = (await db.execute(select(ProjectDocument).where(ProjectDocument.id == document_id, ProjectDocument.project_id == project.id))).scalar_one_or_none()
            if not document:
                raise HTTPException(status_code=404, detail="Документ не найден в выбранном проекте")
            await update_project_document(db, document, user, args)
            action.result = {"document_id": str(document.id), "title": document.title}
            action.status = "confirmed"
            action.executed_at = datetime.now(timezone.utc)
        else:
            raise HTTPException(status_code=400, detail="Этот тип действия пока не поддерживается")
    finally:
        actor_source.reset(token)
    action.resolved_by = user.id
    action.resolved_at = datetime.now(timezone.utc)
    return {"id": str(action.id), "status": action.status, "result": action.result}
