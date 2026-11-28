import logging
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.project import Project, ProjectTask
from app.utils.audit import log_audit_action
from app.models.user import User
from app.schemas.project import TaskCreate
from app.services.access import is_project_organizer_or_privileged


async def create_project_task(db: AsyncSession, project: Project, data: TaskCreate, user: User) -> ProjectTask:
    if not await is_project_organizer_or_privileged(db, project.id, user.id, project.organization_id, "can_edit_tasks"):
        raise HTTPException(status_code=403, detail="permission_denied")
    task = ProjectTask(project_id=project.id, title=data.title.strip(), description=data.description, priority=data.priority, assignee_id=data.assignee_id, created_by_id=user.id, start_date=data.start_date, due_date=data.due_date)
    db.add(task)
    await db.flush()
    try:
        async with db.begin_nested():
            from app.utils.kanban_sync import ensure_project_board, map_task_status_to_column
            from app.models.board import BoardColumn, Card, CardPriority
            board = await ensure_project_board(db, project.organization_id, project.id, project.name, user.id)
            result = await db.execute(select(BoardColumn).where(BoardColumn.board_id == board.id).order_by(BoardColumn.position))
            target_column = map_task_status_to_column(task.status, result.scalars().all(), task.approval_status)
            if target_column:
                priority = CardPriority(task.priority) if task.priority in {item.value for item in CardPriority} else CardPriority.MEDIUM
                db.add(Card(board_id=board.id, column_id=target_column.id, project_task_id=task.id, title=task.title, description=task.description, priority=priority, due_date=task.due_date, creator_id=user.id, assignee_id=task.assignee_id, position=0))
                await db.flush()
    except Exception:
        logging.getLogger(__name__).exception("Не удалось синхронизировать задачу с Kanban")
    await log_audit_action(db, organization_id=project.organization_id, user_id=user.id, action="Создание задачи", entity_type="Задача", entity_id=str(task.id), details=f"Создана задача '{task.title}'")
    return task


async def update_project_task_record(db: AsyncSession, project: Project, task: ProjectTask, user: User, changes: dict, allow_status: bool = False) -> ProjectTask:
    if task.project_id != project.id:
        raise HTTPException(status_code=404, detail="task_not_found")
    can_edit = await is_project_organizer_or_privileged(db, project.id, user.id, project.organization_id, "can_edit_tasks")
    is_assignee = task.assignee_id == user.id
    if not can_edit and not is_assignee:
        raise HTTPException(status_code=403, detail="permission_denied")
    allowed = {"title", "description", "priority", "start_date", "due_date"}
    if allow_status:
        allowed.add("status")
    for key, value in changes.items():
        if key not in allowed:
            raise HTTPException(status_code=422, detail="Недопустимое поле задачи")
        if not can_edit and key not in {"start_date", "due_date", "status"}:
            continue
        setattr(task, key, value.strip() if key == "title" and isinstance(value, str) else value)
        if key == "status" and value == "completed" and not task.completed_at:
            from datetime import datetime, timezone
            task.completed_at = datetime.now(timezone.utc)
    await db.flush()
    try:
        async with db.begin_nested():
            from app.models.board import BoardColumn, Card, CardPriority
            result = await db.execute(select(Card).where(Card.project_task_id == task.id))
            card = result.scalar_one_or_none()
            if card:
                card.title = task.title
                card.description = task.description
                if task.priority in {item.value for item in CardPriority}:
                    card.priority = CardPriority(task.priority)
                card.due_date = task.due_date
                card.assignee_id = task.assignee_id
                if allow_status and "status" in changes:
                    from app.utils.kanban_sync import map_task_status_to_column
                    columns = (await db.execute(select(BoardColumn).where(BoardColumn.board_id == card.board_id).order_by(BoardColumn.position))).scalars().all()
                    target_column = map_task_status_to_column(task.status, columns, task.approval_status)
                    if target_column:
                        card.column_id = target_column.id
                await db.flush()
    except Exception:
        logging.getLogger(__name__).exception("Не удалось синхронизировать задачу с Kanban")
    await log_audit_action(db, organization_id=project.organization_id, user_id=user.id, action="Изменение задачи", entity_type="Задача", entity_id=str(task.id), details=f"Изменена задача '{task.title}'")
    return task
