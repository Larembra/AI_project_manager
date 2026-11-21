import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.models.user import User
from app.models.organization import Organization
from app.models.member import Member
from app.models.project import Project, ProjectMember, ProjectTask, ProjectDocument
from app.schemas.project import (
    ProjectCreate, ProjectUpdate, ProjectOut,
    ProjectMemberAdd, ProjectMemberUpdate, ProjectMemberOut,
    TaskCreate, TaskUpdate, TaskComplete, TaskApproval, TaskOut,
    DocumentCreate, DocumentUpdate, DocumentOut
)
from app.utils.auth import get_current_user
from app.utils.permissions import get_member_or_fail, get_member_permissions
from app.utils.audit import log_audit_action

router = APIRouter(tags=["projects"])


async def _is_project_organizer_or_privileged(
    db: AsyncSession,
    project_id: uuid.UUID,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    perm_name: str | None = None,
) -> bool:
    try:
        member = await get_member_or_fail(db, user_id, organization_id)
        perms = await get_member_permissions(db, member)
        if perms.get("is_owner") or perms.get("can_create_projects") or perms.get("can_manage_members"):
            return True
        if perm_name and perms.get(perm_name):
            return True
        pm = (await db.execute(
            select(ProjectMember).where(
                and_(
                    ProjectMember.project_id == project_id,
                    ProjectMember.user_id == user_id,
                    ProjectMember.role_in_project.in_(["Организатор", "Руководитель проекта"])
                )
            )
        )).scalar_one_or_none()
        return pm is not None
    except Exception:
        return False


# =========================================================================
# 1. PROJECTS
# =========================================================================

@router.get("/api/organizations/{org_id}/projects/", response_model=list[ProjectOut])
async def list_projects(
    org_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await get_member_or_fail(db, current_user.id, org_id)

    res = await db.execute(
        select(Project)
        .where(Project.organization_id == org_id)
        .order_by(Project.created_at.desc())
    )
    projects = res.scalars().all()

    # Считаем количество участников и задач для каждого проекта
    out = []
    for p in projects:
        m_count = (await db.execute(
            select(func.count(ProjectMember.id)).where(ProjectMember.project_id == p.id)
        )).scalar() or 0

        t_count = (await db.execute(
            select(func.count(ProjectTask.id)).where(ProjectTask.project_id == p.id)
        )).scalar() or 0

        c_count = (await db.execute(
            select(func.count(ProjectTask.id)).where(
                and_(ProjectTask.project_id == p.id, ProjectTask.status == "completed")
            )
        )).scalar() or 0

        b_id = None
        try:
            from app.models.board import Board
            b_res = await db.execute(select(Board.id).where(Board.project_id == p.id))
            b_id = b_res.scalar_one_or_none()
        except Exception:
            pass

        p_dict = {
            "id": p.id,
            "organization_id": p.organization_id,
            "name": p.name,
            "description": p.description,
            "category": p.category,
            "status": p.status,
            "budget": float(p.budget),
            "start_date": p.start_date,
            "end_date": p.end_date,
            "created_at": p.created_at,
            "updated_at": p.updated_at,
            "member_count": m_count,
            "task_count": t_count,
            "completed_task_count": c_count,
            "board_id": b_id,
        }
        out.append(ProjectOut(**p_dict))
    return out


@router.post("/api/organizations/{org_id}/projects/", response_model=ProjectOut, status_code=status.HTTP_201_CREATED)
async def create_project(
    org_id: uuid.UUID,
    data: ProjectCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    member = await get_member_or_fail(db, current_user.id, org_id)
    perms = await get_member_permissions(db, member)
    if not perms.get("can_create_projects") and not perms.get("is_owner"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Недостаточно прав для создания проектов",
        )

    project = Project(
        organization_id=org_id,
        name=data.name.strip(),
        description=data.description,
        category=data.category,
        budget=data.budget,
        start_date=data.start_date,
        end_date=data.end_date,
    )
    db.add(project)
    await db.flush()

    # Создатель автоматически добавляется в участники проекта как Организатор
    pm = ProjectMember(
        project_id=project.id,
        user_id=current_user.id,
        role_in_project="Организатор",
    )
    db.add(pm)
    await db.flush()

    cat_map = {
        "development": "Разработка",
        "business_analysis": "Бизнес-аналитика",
        "marketing": "Маркетинг",
        "hr": "HR",
        "logistics": "Логистика",
        "finance": "Финансы",
        "other": "Другое",
    }
    cat_ru = cat_map.get(project.category, project.category)
    await log_audit_action(
        db,
        organization_id=org_id,
        user_id=current_user.id,
        action="Создание проекта",
        entity_type="Проект",
        entity_id=str(project.id),
        details=f"Создан проект '{project.name}' (категория: {cat_ru})",
    )

    board_id = None
    try:
        from app.utils.kanban_sync import ensure_project_board
        board = await ensure_project_board(db, org_id, project.id, project.name, current_user.id)
        board_id = board.id
    except Exception:
        pass

    return ProjectOut(
        id=project.id,
        organization_id=project.organization_id,
        name=project.name,
        description=project.description,
        category=project.category,
        status=project.status or "active",
        budget=float(project.budget or 0.0),
        start_date=project.start_date,
        end_date=project.end_date,
        created_at=project.created_at or datetime.now(timezone.utc),
        updated_at=project.updated_at or datetime.now(timezone.utc),
        member_count=1,
        task_count=0,
        completed_task_count=0,
        board_id=board_id,
    )


@router.get("/api/projects/{project_id}", response_model=ProjectOut)
async def get_project(
    project_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(select(Project).where(Project.id == project_id))
    p = res.scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="project_not_found")

    await get_member_or_fail(db, current_user.id, p.organization_id)

    m_count = (await db.execute(
        select(func.count(ProjectMember.id)).where(ProjectMember.project_id == p.id)
    )).scalar() or 0

    t_count = (await db.execute(
        select(func.count(ProjectTask.id)).where(ProjectTask.project_id == p.id)
    )).scalar() or 0

    c_count = (await db.execute(
        select(func.count(ProjectTask.id)).where(
            and_(ProjectTask.project_id == p.id, ProjectTask.status == "completed")
        )
    )).scalar() or 0

    board_id = None
    try:
        from app.utils.kanban_sync import ensure_project_board
        board = await ensure_project_board(db, p.organization_id, p.id, p.name, current_user.id)
        board_id = board.id
    except Exception:
        pass

    return ProjectOut(
        id=p.id,
        organization_id=p.organization_id,
        name=p.name,
        description=p.description,
        category=p.category,
        status=p.status,
        budget=float(p.budget),
        start_date=p.start_date,
        end_date=p.end_date,
        created_at=p.created_at,
        updated_at=p.updated_at,
        member_count=m_count,
        task_count=t_count,
        completed_task_count=c_count,
        board_id=board_id,
    )


@router.put("/api/projects/{project_id}", response_model=ProjectOut)
async def update_project(
    project_id: uuid.UUID,
    data: ProjectUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(select(Project).where(Project.id == project_id))
    p = res.scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="project_not_found")

    member = await get_member_or_fail(db, current_user.id, p.organization_id)
    perms = await get_member_permissions(db, member)
    if not perms.get("can_create_projects") and not perms.get("is_owner"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="permission_denied")

    if data.name is not None:
        p.name = data.name.strip()
    if data.description is not None:
        p.description = data.description
    if data.category is not None:
        p.category = data.category
    if data.status is not None:
        p.status = data.status
    if data.budget is not None:
        p.budget = data.budget
    if data.start_date is not None:
        p.start_date = data.start_date
    if data.end_date is not None:
        p.end_date = data.end_date

    await db.flush()
    return await get_project(project_id, current_user, db)


@router.delete("/api/projects/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
    project_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(select(Project).where(Project.id == project_id))
    p = res.scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="project_not_found")

    member = await get_member_or_fail(db, current_user.id, p.organization_id)
    perms = await get_member_permissions(db, member)
    if not perms.get("is_owner"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Только организатор может удалять проекты",
        )

    await db.delete(p)
    await db.flush()
    return None


# =========================================================================
# 2. PROJECT MEMBERS
# =========================================================================

@router.get("/api/projects/{project_id}/members", response_model=list[ProjectMemberOut])
async def list_project_members(
    project_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(select(Project).where(Project.id == project_id))
    p = res.scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="project_not_found")

    await get_member_or_fail(db, current_user.id, p.organization_id)

    members_res = await db.execute(
        select(ProjectMember, User)
        .join(User, ProjectMember.user_id == User.id)
        .where(ProjectMember.project_id == project_id)
    )
    results = []
    for pm, u in members_res.all():
        results.append(
            ProjectMemberOut(
                id=pm.id,
                project_id=pm.project_id,
                user_id=pm.user_id,
                full_name=u.full_name,
                email=u.email,
                role_in_project=pm.role_in_project,
                joined_at=pm.joined_at,
            )
        )
    return results


@router.post("/api/projects/{project_id}/members", response_model=ProjectMemberOut, status_code=status.HTTP_201_CREATED)
async def add_project_member(
    project_id: uuid.UUID,
    data: ProjectMemberAdd,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(select(Project).where(Project.id == project_id))
    p = res.scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="project_not_found")

    can_manage = await _is_project_organizer_or_privileged(db, project_id, current_user.id, p.organization_id, "can_create_projects")
    if not can_manage:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="permission_denied")

    # Проверяем, что добавляемый пользователь состоит в организации
    await get_member_or_fail(db, data.user_id, p.organization_id)

    existing = (await db.execute(
        select(ProjectMember).where(
            and_(ProjectMember.project_id == project_id, ProjectMember.user_id == data.user_id)
        )
    )).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="user_already_in_project")

    pm = ProjectMember(
        project_id=project_id,
        user_id=data.user_id,
        role_in_project=data.role_in_project,
    )
    db.add(pm)
    await db.flush()

    user_res = (await db.execute(select(User).where(User.id == data.user_id))).scalar_one()

    return ProjectMemberOut(
        id=pm.id,
        project_id=pm.project_id,
        user_id=pm.user_id,
        full_name=user_res.full_name,
        email=user_res.email,
        role_in_project=pm.role_in_project,
        joined_at=pm.joined_at or datetime.now(timezone.utc),
    )


@router.put("/api/projects/{project_id}/members/{user_id}", response_model=ProjectMemberOut)
async def update_project_member(
    project_id: uuid.UUID,
    user_id: uuid.UUID,
    data: ProjectMemberUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(select(Project).where(Project.id == project_id))
    p = res.scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="project_not_found")

    can_manage = await _is_project_organizer_or_privileged(db, project_id, current_user.id, p.organization_id, "can_manage_members")
    if not can_manage:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="permission_denied")

    pm = (await db.execute(
        select(ProjectMember).where(
            and_(ProjectMember.project_id == project_id, ProjectMember.user_id == user_id)
        )
    )).scalar_one_or_none()
    if not pm:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="project_member_not_found")

    pm.role_in_project = data.role_in_project
    await db.flush()

    user_res = (await db.execute(select(User).where(User.id == user_id))).scalar_one()

    return ProjectMemberOut(
        id=pm.id,
        project_id=pm.project_id,
        user_id=pm.user_id,
        full_name=user_res.full_name,
        email=user_res.email,
        role_in_project=pm.role_in_project,
        joined_at=pm.joined_at or datetime.now(timezone.utc),
    )


@router.delete("/api/projects/{project_id}/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_project_member(
    project_id: uuid.UUID,
    user_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(select(Project).where(Project.id == project_id))
    p = res.scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="project_not_found")

    can_manage = await _is_project_organizer_or_privileged(db, project_id, current_user.id, p.organization_id, "can_create_projects")
    if not can_manage and current_user.id != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="permission_denied")

    pm = (await db.execute(
        select(ProjectMember).where(
            and_(ProjectMember.project_id == project_id, ProjectMember.user_id == user_id)
        )
    )).scalar_one_or_none()
    if pm:
        await db.delete(pm)
        await db.flush()
    return None


# =========================================================================
# 3. PROJECT TASKS (с бизнес-метриками и проверкой)
# =========================================================================

def _task_to_out(t: ProjectTask, assignee_name: str | None = None, created_by_name: str | None = None, approved_by_name: str | None = None) -> TaskOut:
    return TaskOut(
        id=t.id,
        project_id=t.project_id,
        title=t.title,
        description=t.description,
        status=t.status or "todo",
        priority=t.priority or "medium",
        assignee_id=t.assignee_id,
        assignee_name=assignee_name,
        created_by_id=t.created_by_id,
        created_by_name=created_by_name,
        start_date=t.start_date,
        due_date=t.due_date,
        completed_at=t.completed_at,
        revenue_impact=float(t.revenue_impact or 0.0),
        cost_impact=float(t.cost_impact or 0.0),
        clients_acquired=t.clients_acquired or 0,
        completion_comment=t.completion_comment,
        approval_status=t.approval_status or "none",
        approved_by_id=t.approved_by_id,
        approved_by_name=approved_by_name,
        approval_comment=t.approval_comment,
        created_at=t.created_at or datetime.now(timezone.utc),
        updated_at=t.updated_at or datetime.now(timezone.utc),
    )


@router.get("/api/projects/{project_id}/tasks", response_model=list[TaskOut])
async def list_project_tasks(
    project_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(select(Project).where(Project.id == project_id))
    p = res.scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="project_not_found")

    await get_member_or_fail(db, current_user.id, p.organization_id)

    tasks_res = await db.execute(
        select(ProjectTask)
        .where(ProjectTask.project_id == project_id)
        .order_by(ProjectTask.created_at)
    )
    tasks = tasks_res.scalars().all()

    # Загружаем имена пользователей
    users_res = await db.execute(select(User))
    users_map = {u.id: u.full_name for u in users_res.scalars().all()}

    return [
        _task_to_out(
            t,
            assignee_name=users_map.get(t.assignee_id) if t.assignee_id else None,
            created_by_name=users_map.get(t.created_by_id),
            approved_by_name=users_map.get(t.approved_by_id) if t.approved_by_id else None,
        )
        for t in tasks
    ]


@router.post("/api/projects/{project_id}/tasks", response_model=TaskOut, status_code=status.HTTP_201_CREATED)
async def create_project_task(
    project_id: uuid.UUID,
    data: TaskCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(select(Project).where(Project.id == project_id))
    p = res.scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="project_not_found")

    can_edit = await _is_project_organizer_or_privileged(db, project_id, current_user.id, p.organization_id, "can_edit_tasks")
    if not can_edit:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="permission_denied")

    task = ProjectTask(
        project_id=project_id,
        title=data.title.strip(),
        description=data.description,
        priority=data.priority,
        assignee_id=data.assignee_id,
        created_by_id=current_user.id,
        start_date=data.start_date,
        due_date=data.due_date,
    )
    db.add(task)
    await db.flush()

    # Синхронизация: создаем карточку на связанной Kanban-доске
    try:
        from app.utils.kanban_sync import ensure_project_board, map_task_status_to_column
        from app.models.board import Card, BoardColumn, CardPriority
        board = await ensure_project_board(db, p.organization_id, project_id, p.name, current_user.id)
        cols_res = await db.execute(select(BoardColumn).where(BoardColumn.board_id == board.id).order_by(BoardColumn.position))
        cols = cols_res.scalars().all()
        target_col = map_task_status_to_column(task.status, cols)
        if target_col:
            p_val = CardPriority.MEDIUM
            if task.priority in [x.value for x in CardPriority]:
                p_val = CardPriority(task.priority)
            card = Card(
                board_id=board.id,
                column_id=target_col.id,
                project_task_id=task.id,
                title=task.title,
                description=task.description,
                priority=p_val,
                due_date=task.due_date,
                creator_id=task.created_by_id,
                assignee_id=task.assignee_id,
                position=0,
            )
            db.add(card)
            await db.flush()
    except Exception:
        pass

    assignee_name = None
    if task.assignee_id:
        u = (await db.execute(select(User).where(User.id == task.assignee_id))).scalar_one_or_none()
        assignee_name = u.full_name if u else None

    return _task_to_out(task, assignee_name=assignee_name, created_by_name=current_user.full_name)


@router.put("/api/tasks/{task_id}", response_model=TaskOut)
async def update_task(
    task_id: uuid.UUID,
    data: TaskUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    task = (await db.execute(select(ProjectTask).where(ProjectTask.id == task_id))).scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="task_not_found")

    p = (await db.execute(select(Project).where(Project.id == task.project_id))).scalar_one()
    can_edit = await _is_project_organizer_or_privileged(db, task.project_id, current_user.id, p.organization_id, "can_edit_tasks")
    is_assignee = task.assignee_id == current_user.id
    if not can_edit and not is_assignee:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="permission_denied")

    if data.title is not None and can_edit:
        task.title = data.title.strip()
    if data.description is not None and can_edit:
        task.description = data.description
    if data.priority is not None and can_edit:
        task.priority = data.priority
    if data.assignee_id is not None and can_edit:
        task.assignee_id = data.assignee_id
    if data.start_date is not None:
        task.start_date = data.start_date
    if data.due_date is not None:
        task.due_date = data.due_date

    if data.status is not None:
        task.status = data.status
        if data.status == "completed" and not task.completed_at:
            task.completed_at = datetime.now(timezone.utc)

    await db.flush()

    # Синхронизация карточки на Kanban-доске
    try:
        from app.utils.kanban_sync import map_task_status_to_column
        from app.models.board import Card, BoardColumn, CardPriority
        c_res = await db.execute(select(Card).where(Card.project_task_id == task.id))
        card = c_res.scalar_one_or_none()
        if card:
            card.title = task.title
            card.description = task.description
            if task.priority in [x.value for x in CardPriority]:
                card.priority = CardPriority(task.priority)
            card.assignee_id = task.assignee_id
            card.due_date = task.due_date
            if data.status is not None:
                cols_res = await db.execute(select(BoardColumn).where(BoardColumn.board_id == card.board_id).order_by(BoardColumn.position))
                cols = cols_res.scalars().all()
                target_col = map_task_status_to_column(task.status, cols)
                if target_col and card.column_id != target_col.id:
                    card.column_id = target_col.id
            await db.flush()
    except Exception:
        pass

    assignee_name = None
    if task.assignee_id:
        u = (await db.execute(select(User).where(User.id == task.assignee_id))).scalar_one_or_none()
        assignee_name = u.full_name if u else None

    return _task_to_out(task, assignee_name=assignee_name)


@router.post("/api/tasks/{task_id}/complete", response_model=TaskOut)
async def complete_task_with_metrics(
    task_id: uuid.UUID,
    data: TaskComplete,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Завершение задачи работником с фиксацией влияния на аналитику
    (доход, фактические расходы, новые клиенты, комментарий).
    """
    task = (await db.execute(select(ProjectTask).where(ProjectTask.id == task_id))).scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="task_not_found")

    p = (await db.execute(select(Project).where(Project.id == task.project_id))).scalar_one()
    await get_member_or_fail(db, current_user.id, p.organization_id)

    task.status = "completed"
    task.completed_at = datetime.now(timezone.utc)
    task.revenue_impact = data.revenue_impact
    task.cost_impact = data.cost_impact
    task.clients_acquired = data.clients_acquired
    task.completion_comment = data.completion_comment
    task.approval_status = "none" # Ожидает проверки руководителем/модератором

    await db.flush()

    try:
        from app.utils.kanban_sync import map_task_status_to_column
        from app.models.board import Card, BoardColumn
        c_res = await db.execute(select(Card).where(Card.project_task_id == task.id))
        card = c_res.scalar_one_or_none()
        if card:
            cols_res = await db.execute(select(BoardColumn).where(BoardColumn.board_id == card.board_id).order_by(BoardColumn.position))
            cols = cols_res.scalars().all()
            target_col = map_task_status_to_column("completed", cols)
            if target_col and card.column_id != target_col.id:
                card.column_id = target_col.id
            await db.flush()
    except Exception:
        pass

    await log_audit_action(
        db,
        organization_id=p.organization_id,
        user_id=current_user.id,
        action="Завершение задачи",
        entity_type="Задача",
        entity_id=str(task.id),
        details=f"Задача '{task.title}' завершена. Выручка: +{data.revenue_impact}₽, Расход: -{data.cost_impact}₽, Клиенты: +{data.clients_acquired}",
    )

    return _task_to_out(task)


@router.post("/api/tasks/{task_id}/approve", response_model=TaskOut)
async def approve_or_reject_task(
    task_id: uuid.UUID,
    data: TaskApproval,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Проверка задачи другими ролями (модератором/руководителем):
    - подтвердить выполнение (approved)
    - или разотметить / вернуть на доработку (rejected) с опциональным комментарием.
    """
    task = (await db.execute(select(ProjectTask).where(ProjectTask.id == task_id))).scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="task_not_found")

    p = (await db.execute(select(Project).where(Project.id == task.project_id))).scalar_one()
    can_approve = await _is_project_organizer_or_privileged(db, task.project_id, current_user.id, p.organization_id, "can_approve_tasks")
    if not can_approve:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Недостаточно прав для подтверждения или возврата задач",
        )

    task.approved_by_id = current_user.id
    task.approval_comment = data.approval_comment

    if data.approved:
        task.approval_status = "approved"
    else:
        # Разотметить задачу: возврат в работу
        task.approval_status = "rejected"
        task.status = "in_progress"

    await db.flush()

    try:
        from app.utils.kanban_sync import map_task_status_to_column
        from app.models.board import Card, BoardColumn
        c_res = await db.execute(select(Card).where(Card.project_task_id == task.id))
        card = c_res.scalar_one_or_none()
        if card:
            new_st = "completed" if data.approved else "in_progress"
            cols_res = await db.execute(select(BoardColumn).where(BoardColumn.board_id == card.board_id).order_by(BoardColumn.position))
            cols = cols_res.scalars().all()
            target_col = map_task_status_to_column(new_st, cols)
            if target_col and card.column_id != target_col.id:
                card.column_id = target_col.id
            await db.flush()
    except Exception:
        pass

    await log_audit_action(
        db,
        organization_id=p.organization_id,
        user_id=current_user.id,
        action="Подтверждение задачи" if data.approved else "Возврат задачи",
        entity_type="Задача",
        entity_id=str(task.id),
        details=f"Задача '{task.title}' {'подтверждена' if data.approved else 'возвращена на доработку'}. Комментарий: {data.approval_comment or 'без комментария'}",
    )

    return _task_to_out(task, approved_by_name=current_user.full_name)


@router.delete("/api/tasks/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task(
    task_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    task = (await db.execute(select(ProjectTask).where(ProjectTask.id == task_id))).scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="task_not_found")

    p = (await db.execute(select(Project).where(Project.id == task.project_id))).scalar_one()
    can_edit = await _is_project_organizer_or_privileged(db, task.project_id, current_user.id, p.organization_id, "can_edit_tasks")
    if not can_edit and task.created_by_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="permission_denied")

    try:
        from app.models.board import Card
        c_res = await db.execute(select(Card).where(Card.project_task_id == task_id))
        for c in c_res.scalars().all():
            await db.delete(c)
    except Exception:
        pass

    await db.delete(task)
    await db.flush()
    return None


# =========================================================================
# 4. PROJECT DOCUMENTS (База знаний / RAG)
# =========================================================================

@router.get("/api/projects/{project_id}/documents", response_model=list[DocumentOut])
async def list_project_documents(
    project_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(select(Project).where(Project.id == project_id))
    p = res.scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="project_not_found")

    await get_member_or_fail(db, current_user.id, p.organization_id)

    docs_res = await db.execute(
        select(ProjectDocument, User)
        .join(User, ProjectDocument.author_id == User.id)
        .where(ProjectDocument.project_id == project_id)
        .order_by(ProjectDocument.created_at.desc())
    )
    results = []
    for d, u in docs_res.all():
        results.append(
            DocumentOut(
                id=d.id,
                project_id=d.project_id,
                title=d.title,
                content=d.content,
                category=d.category,
                author_id=d.author_id,
                author_name=u.full_name,
                created_at=d.created_at,
                updated_at=d.updated_at,
            )
        )
    return results


@router.post("/api/projects/{project_id}/documents", response_model=DocumentOut, status_code=status.HTTP_201_CREATED)
async def create_project_document(
    project_id: uuid.UUID,
    data: DocumentCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(select(Project).where(Project.id == project_id))
    p = res.scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="project_not_found")

    await get_member_or_fail(db, current_user.id, p.organization_id)

    doc = ProjectDocument(
        project_id=project_id,
        title=data.title.strip(),
        content=data.content,
        category=data.category,
        author_id=current_user.id,
    )
    db.add(doc)
    await db.flush()

    return DocumentOut(
        id=doc.id,
        project_id=doc.project_id,
        title=doc.title,
        content=doc.content,
        category=doc.category,
        author_id=doc.author_id,
        author_name=current_user.full_name,
        created_at=doc.created_at,
        updated_at=doc.updated_at,
    )


@router.put("/api/documents/{doc_id}", response_model=DocumentOut)
async def update_project_document(
    doc_id: uuid.UUID,
    data: DocumentUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    doc = (await db.execute(select(ProjectDocument).where(ProjectDocument.id == doc_id))).scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="doc_not_found")

    p = (await db.execute(select(Project).where(Project.id == doc.project_id))).scalar_one()
    member = await get_member_or_fail(db, current_user.id, p.organization_id)
    perms = await get_member_permissions(db, member)

    if not perms.get("is_owner") and doc.author_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="permission_denied")

    if data.title is not None:
        doc.title = data.title.strip()
    if data.content is not None:
        doc.content = data.content
    if data.category is not None:
        doc.category = data.category

    await db.flush()
    return DocumentOut(
        id=doc.id,
        project_id=doc.project_id,
        title=doc.title,
        content=doc.content,
        category=doc.category,
        author_id=doc.author_id,
        author_name=current_user.full_name,
        created_at=doc.created_at,
        updated_at=doc.updated_at,
    )


@router.delete("/api/documents/{doc_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project_document(
    doc_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    doc = (await db.execute(select(ProjectDocument).where(ProjectDocument.id == doc_id))).scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="doc_not_found")

    p = (await db.execute(select(Project).where(Project.id == doc.project_id))).scalar_one()
    member = await get_member_or_fail(db, current_user.id, p.organization_id)
    perms = await get_member_permissions(db, member)

    if not perms.get("is_owner") and doc.author_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="permission_denied")

    await db.delete(doc)
    await db.flush()
    return None
