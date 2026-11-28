from sqlalchemy import func, select
from app.agent.context import AgentContext
from app.models.project import ProjectTask, Project
from app.models.member import Member
from app.models.user import User
from app.models.finance import FinanceRecord
from app.models.absence import Absence
from app.models.department import Department
from pydantic import BaseModel, Field
from typing import Literal
from app.agent.tools.registry import tool


class NoArguments(BaseModel):
    pass


class CreateTaskArgs(BaseModel):
    title: str = Field(min_length=1, max_length=250)
    description: str = Field(default="", max_length=4000)
    priority: Literal["low", "medium", "high", "urgent"] = "medium"


class UpdateTaskArgs(BaseModel):
    task_id: str = Field(min_length=1, max_length=36)
    title: str | None = Field(default=None, min_length=1, max_length=250)
    description: str | None = Field(default=None, max_length=4000)
    priority: Literal["low", "medium", "high", "urgent"] | None = None
    start_date: str | None = None
    due_date: str | None = None


class CompleteTaskArgs(BaseModel):
    task_id: str = Field(min_length=1, max_length=36)
    completion_comment: str = Field(min_length=1, max_length=4000)


class ReviewTaskArgs(BaseModel):
    task_id: str = Field(min_length=1, max_length=36)
    approved: bool
    approval_comment: str = Field(min_length=1, max_length=4000)


async def _propose(arguments: BaseModel) -> dict:
    return {"status": "pending_confirmation", "args": arguments.model_dump(exclude_none=True)}


@tool("list_project_tasks", "Показывает задачи выбранного проекта.", NoArguments, "read", lambda context: context.project_id is not None)
async def list_project_tasks(context: AgentContext) -> list[dict]:
    result = await context.db.execute(select(ProjectTask).where(ProjectTask.project_id == context.project_id).limit(30))
    return [{"task_id": str(task.id), "title": task.title, "status": task.status, "priority": task.priority, "due_date": str(task.due_date) if task.due_date else None} for task in result.scalars().all()]


@tool("get_project_analytics", "Показывает сводные показатели задач и бюджета выбранного проекта.", NoArguments, "read", lambda context: context.project_id is not None)
async def get_project_analytics(context: AgentContext) -> dict:
    project = (await context.db.execute(select(Project).where(Project.id == context.project_id))).scalar_one()
    task_count = await context.db.scalar(select(func.count()).select_from(ProjectTask).where(ProjectTask.project_id == project.id)) or 0
    completed_count = await context.db.scalar(select(func.count()).select_from(ProjectTask).where(ProjectTask.project_id == project.id, ProjectTask.status == "completed", ProjectTask.approval_status == "approved")) or 0
    urgent_count = await context.db.scalar(select(func.count()).select_from(ProjectTask).where(ProjectTask.project_id == project.id, ProjectTask.priority == "urgent", ProjectTask.approval_status == "approved")) or 0
    revenue_total = await context.db.scalar(select(func.coalesce(func.sum(ProjectTask.revenue_impact), 0)).where(ProjectTask.project_id == project.id)) or 0
    cost_total = await context.db.scalar(select(func.coalesce(func.sum(ProjectTask.cost_impact), 0)).where(ProjectTask.project_id == project.id)) or 0
    return {"task_count": task_count, "completed_task_count": completed_count, "open_urgent_task_count": urgent_count, "budget": float(project.budget), "revenue_impact": float(revenue_total), "cost_impact": float(cost_total)}


@tool("list_organization_tasks", "Показывает задачи всех проектов выбранной организации с исполнителями, статусами и сроками.", NoArguments, "read", lambda context: context.organization_id is not None and context.project_id is None)
async def list_organization_tasks(context: AgentContext) -> list[dict]:
    result = await context.db.execute(select(ProjectTask, Project.name).join(Project, Project.id == ProjectTask.project_id).where(Project.organization_id == context.organization_id).order_by(ProjectTask.due_date.asc().nullslast()).limit(200))
    return [{"task_id": str(task.id), "project": project_name, "title": task.title, "status": task.status, "priority": task.priority, "start_date": str(task.start_date) if task.start_date else None, "due_date": str(task.due_date) if task.due_date else None, "assignee": str(task.assignee_id) if task.assignee_id else None} for task, project_name in result.all()]


@tool("list_organization_members", "Показывает сотрудников выбранной организации, должности, подразделения и роли.", NoArguments, "read", lambda context: context.organization_id is not None)
async def list_organization_members(context: AgentContext) -> list[dict]:
    result = await context.db.execute(select(Member, User.full_name, User.email, Department.name).join(User, User.id == Member.user_id).outerjoin(Department, Department.id == Member.department_id).where(Member.organization_id == context.organization_id).order_by(User.full_name).limit(200))
    return [{"name": name, "email": email, "position": member.position, "department": department, "role": member.role.value if hasattr(member.role, "value") else str(member.role)} for member, name, email, department in result.all()]


@tool("get_organization_analytics", "Возвращает точные сводные показатели организации: доходы, расходы, прибыль, задачи, сотрудники, проекты и разбивку по проектам. Доступно только при наличии права просмотра аналитики.", NoArguments, "read", lambda context: context.organization_id is not None and getattr(context, "can_view_org_analytics", False))
async def get_organization_analytics(context: AgentContext) -> dict:
    from app.routers.analytics import get_organization_analytics as analytics_endpoint
    result = await analytics_endpoint(context.organization_id, context.user, context.db)
    return result.model_dump(mode="json")


@tool("create_task", "Предлагает создать задачу в выбранном проекте. Требует подтверждения.", CreateTaskArgs, "write", lambda context: context.project_id is not None and context.can_edit_tasks)
async def create_task_tool(_context: AgentContext, arguments: CreateTaskArgs) -> dict:
    return await _propose(arguments)


@tool("update_task", "Предлагает изменить разрешённые поля задачи проекта. Требует подтверждения.", UpdateTaskArgs, "write", lambda context: context.project_id is not None)
async def update_task_tool(_context: AgentContext, arguments: UpdateTaskArgs) -> dict:
    return await _propose(arguments)


@tool("complete_task", "Предлагает отметить доступную пользователю задачу выполненной и добавить отчёт о выполнении. Требует подтверждения пользователя.", CompleteTaskArgs, "write", lambda context: context.project_id is not None)
async def complete_task_tool(_context: AgentContext, arguments: CompleteTaskArgs) -> dict:
    return await _propose(arguments)


@tool("review_task", "Предлагает подтвердить выполнение задачи или вернуть её на доработку с обязательным комментарием. Требует подтверждения пользователя с правом приёмки.", ReviewTaskArgs, "write", lambda context: context.project_id is not None and getattr(context, "can_approve_tasks", False))
async def review_task_tool(_context: AgentContext, arguments: ReviewTaskArgs) -> dict:
    return await _propose(arguments)
