import uuid
from pydantic import BaseModel


class ProjectStatItem(BaseModel):
    id: uuid.UUID
    name: str
    category: str
    revenue: float
    cost: float
    profit: float
    clients: int
    tasks_total: int
    tasks_completed: int
    tasks_overdue: int


class TimelineItem(BaseModel):
    date: str
    revenue: float
    cost: float
    profit: float
    clients: int


class OrganizationAnalyticsOut(BaseModel):
    total_revenue: float
    total_cost: float
    net_profit: float
    total_clients: int
    total_workers: int
    total_tasks: int
    completed_tasks: int
    overdue_tasks: int
    in_progress_tasks: int
    projects_count: int
    projects_breakdown: list[ProjectStatItem]
    timeline: list[TimelineItem]


class ProjectAnalyticsOut(BaseModel):
    project_id: uuid.UUID
    project_name: str
    category: str
    budget: float
    revenue: float
    cost: float
    profit: float
    clients: int
    tasks_total: int
    tasks_completed: int
    tasks_overdue: int
    tasks_in_progress: int
    timeline: list[TimelineItem]
