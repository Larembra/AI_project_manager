import uuid
from datetime import date, datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.models.user import User
from app.models.organization import Organization
from app.models.member import Member
from app.models.project import Project, ProjectTask
from app.models.finance import FinanceRecord
from app.models.absence import Absence
from app.schemas.analytics import (
    OrganizationAnalyticsOut, ProjectAnalyticsOut,
    ProjectStatItem, TimelineItem
)
from app.utils.auth import get_current_user
from app.utils.permissions import get_member_or_fail, get_member_permissions

router = APIRouter(tags=["analytics"])


@router.get("/api/organizations/{org_id}/analytics", response_model=OrganizationAnalyticsOut)
async def get_organization_analytics(
    org_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    member = await get_member_or_fail(db, current_user.id, org_id)
    perms = await get_member_permissions(db, member)

    # Проверка прав: обычный работник без чекбокса can_view_org_analytics не имеет доступа к глобальной аналитике
    if not perms.get("can_view_org_analytics") and not perms.get("is_owner"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Доступ к глобальной аналитике организации ограничен вашей ролью",
        )

    # Количество сотрудников
    workers_count = (await db.execute(
        select(func.count(Member.id)).where(Member.organization_id == org_id)
    )).scalar() or 0

    # Все проекты организации
    projects_res = await db.execute(select(Project).where(Project.organization_id == org_id))
    projects = projects_res.scalars().all()
    project_ids = [p.id for p in projects]

    today = date.today()

    total_task_revenue = 0.0
    total_task_cost = 0.0
    total_clients = 0
    total_tasks = 0
    completed_tasks = 0
    overdue_tasks = 0
    in_progress_tasks = 0
    projects_breakdown = []

    # Timeline по дням (последние 30 дней)
    timeline_map = {}
    for i in range(14, -1, -1):
        d_str = (today - timedelta(days=i)).isoformat()
        timeline_map[d_str] = {"revenue": 0.0, "cost": 0.0, "profit": 0.0, "clients": 0}

    for p in projects:
        tasks_res = await db.execute(select(ProjectTask).where(ProjectTask.project_id == p.id))
        tasks = tasks_res.scalars().all()

        p_rev = 0.0
        p_cost = 0.0
        p_clients = 0
        p_total = len(tasks)
        p_completed = 0
        p_overdue = 0

        for t in tasks:
            total_tasks += 1
            if t.status == "completed" and t.approval_status == "approved":
                completed_tasks += 1
                p_completed += 1
                rev = float(t.revenue_impact)
                cost = float(t.cost_impact)
                clients = t.clients_acquired

                total_task_revenue += rev
                total_task_cost += cost
                total_clients += clients

                p_rev += rev
                p_cost += cost
                p_clients += clients

                # Привязка к дате завершения для timeline
                if t.completed_at:
                    c_date = t.completed_at.date().isoformat()
                    if c_date in timeline_map:
                        timeline_map[c_date]["revenue"] += rev
                        timeline_map[c_date]["cost"] += cost
                        timeline_map[c_date]["profit"] += (rev - cost)
                        timeline_map[c_date]["clients"] += clients
            elif t.status == "in_progress":
                in_progress_tasks += 1

            if t.status != "completed" and t.due_date and t.due_date < today:
                overdue_tasks += 1
                p_overdue += 1

        projects_breakdown.append(
            ProjectStatItem(
                id=p.id,
                name=p.name,
                category=p.category,
                revenue=p_rev,
                cost=p_cost,
                profit=p_rev - p_cost,
                clients=p_clients,
                tasks_total=p_total,
                tasks_completed=p_completed,
                tasks_overdue=p_overdue,
            )
        )

    # Учитываем финансовые записи организации (FinanceRecord)
    fin_res = await db.execute(
        select(FinanceRecord).where(
            and_(FinanceRecord.organization_id == org_id, FinanceRecord.status == "approved")
        )
    )
    for f in fin_res.scalars().all():
        amt = float(f.amount)
        if f.category == "income":
            total_task_revenue += amt
        else:
            total_task_cost += amt

    timeline_items = [
        TimelineItem(
            date=d_str,
            revenue=data["revenue"],
            cost=data["cost"],
            profit=data["profit"],
            clients=data["clients"],
        )
        for d_str, data in timeline_map.items()
    ]

    return OrganizationAnalyticsOut(
        total_revenue=total_task_revenue,
        total_cost=total_task_cost,
        net_profit=total_task_revenue - total_task_cost,
        total_clients=total_clients,
        total_workers=workers_count,
        total_tasks=total_tasks,
        completed_tasks=completed_tasks,
        overdue_tasks=overdue_tasks,
        in_progress_tasks=in_progress_tasks,
        projects_count=len(projects),
        projects_breakdown=projects_breakdown,
        timeline=timeline_items,
    )


@router.get("/api/projects/{project_id}/analytics", response_model=ProjectAnalyticsOut)
async def get_project_analytics(
    project_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(select(Project).where(Project.id == project_id))
    p = res.scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="project_not_found")

    await get_member_or_fail(db, current_user.id, p.organization_id)

    today = date.today()
    tasks_res = await db.execute(select(ProjectTask).where(ProjectTask.project_id == project_id))
    tasks = tasks_res.scalars().all()

    rev = 0.0
    cost = 0.0
    clients = 0
    completed = 0
    overdue = 0
    in_progress = 0

    timeline_map = {}
    for i in range(14, -1, -1):
        d_str = (today - timedelta(days=i)).isoformat()
        timeline_map[d_str] = {"revenue": 0.0, "cost": 0.0, "profit": 0.0, "clients": 0}

    for t in tasks:
        if t.status == "completed" and t.approval_status == "approved":
            completed += 1
            r = float(t.revenue_impact)
            c = float(t.cost_impact)
            cl = t.clients_acquired

            rev += r
            cost += c
            clients += cl

            if t.completed_at:
                c_date = t.completed_at.date().isoformat()
                if c_date in timeline_map:
                    timeline_map[c_date]["revenue"] += r
                    timeline_map[c_date]["cost"] += c
                    timeline_map[c_date]["profit"] += (r - c)
                    timeline_map[c_date]["clients"] += cl
        elif t.status == "in_progress":
            in_progress += 1

        if t.status != "completed" and t.due_date and t.due_date < today:
            overdue += 1

    timeline_items = [
        TimelineItem(
            date=d_str,
            revenue=data["revenue"],
            cost=data["cost"],
            profit=data["profit"],
            clients=data["clients"],
        )
        for d_str, data in timeline_map.items()
    ]

    return ProjectAnalyticsOut(
        project_id=p.id,
        project_name=p.name,
        category=p.category,
        budget=float(p.budget),
        revenue=rev,
        cost=cost,
        profit=rev - cost,
        clients=clients,
        tasks_total=len(tasks),
        tasks_completed=completed,
        tasks_overdue=overdue,
        tasks_in_progress=in_progress,
        timeline=timeline_items,
    )


@router.get("/api/organizations/{org_id}/calendar")
async def get_organization_calendar(
    org_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Календарные события по всей организации: дедлайны проектов и задач + отпуска/отсутствия сотрудников.
    """
    await get_member_or_fail(db, current_user.id, org_id)

    events = []

    # 1. Задачи проектов
    projects_res = await db.execute(select(Project).where(Project.organization_id == org_id))
    projects = {p.id: p.name for p in projects_res.scalars().all()}

    if projects:
        tasks_res = await db.execute(
            select(ProjectTask).where(ProjectTask.project_id.in_(list(projects.keys())))
        )
        for t in tasks_res.scalars().all():
            if t.due_date or t.start_date:
                events.append({
                    "id": str(t.id),
                    "type": "task",
                    "title": t.title,
                    "project_name": projects.get(t.project_id),
                    "project_id": str(t.project_id),
                    "status": t.status,
                    "priority": t.priority,
                    "start": t.start_date.isoformat() if t.start_date else t.due_date.isoformat(),
                    "end": t.due_date.isoformat() if t.due_date else t.start_date.isoformat(),
                })

    # 2. Отсутствия сотрудников (Absences)
    abs_res = await db.execute(
        select(Absence, User)
        .join(User, Absence.user_id == User.id)
        .where(Absence.organization_id == org_id)
    )
    for a, u in abs_res.all():
        events.append({
            "id": str(a.id),
            "type": "absence",
            "title": f"Отсутствие: {u.full_name} ({a.absence_type})",
            "user_name": u.full_name,
            "status": a.status,
            "start": a.start_date.isoformat(),
            "end": a.end_date.isoformat(),
        })

    return events


@router.get("/api/projects/{project_id}/calendar")
async def get_project_calendar(
    project_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(select(Project).where(Project.id == project_id))
    p = res.scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="project_not_found")

    await get_member_or_fail(db, current_user.id, p.organization_id)

    tasks_res = await db.execute(select(ProjectTask).where(ProjectTask.project_id == project_id))
    events = []
    for t in tasks_res.scalars().all():
        if t.due_date or t.start_date:
            events.append({
                "id": str(t.id),
                "type": "task",
                "title": t.title,
                "project_id": str(project_id),
                "project_name": p.name,
                "status": t.status,
                "priority": t.priority,
                "start": t.start_date.isoformat() if t.start_date else t.due_date.isoformat(),
                "end": t.due_date.isoformat() if t.due_date else t.start_date.isoformat(),
            })
    return events
