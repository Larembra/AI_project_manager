import uuid
from datetime import datetime, date
from pydantic import BaseModel


# --- Projects ---
class ProjectCreate(BaseModel):
    name: str
    description: str | None = None
    category: str = "development"
    budget: float = 0.0
    start_date: date | None = None
    end_date: date | None = None


class ProjectUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    category: str | None = None
    status: str | None = None
    budget: float | None = None
    start_date: date | None = None
    end_date: date | None = None


class ProjectOut(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    name: str
    description: str | None = None
    category: str
    status: str
    budget: float
    start_date: date | None = None
    end_date: date | None = None
    created_at: datetime
    updated_at: datetime
    member_count: int = 0
    task_count: int = 0
    completed_task_count: int = 0
    board_id: uuid.UUID | None = None

    class Config:
        from_attributes = True


# --- Project Members ---
class ProjectMemberAdd(BaseModel):
    user_id: uuid.UUID
    role_in_project: str = "Сотрудник"


class ProjectMemberUpdate(BaseModel):
    role_in_project: str = "Сотрудник"


class ProjectMemberOut(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    user_id: uuid.UUID
    full_name: str
    email: str
    role_in_project: str
    joined_at: datetime

    class Config:
        from_attributes = True


# --- Project Tasks ---
class TaskCreate(BaseModel):
    title: str
    description: str | None = None
    priority: str = "medium"
    assignee_id: uuid.UUID | None = None
    start_date: date | None = None
    due_date: date | None = None


class TaskUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    status: str | None = None
    priority: str | None = None
    assignee_id: uuid.UUID | None = None
    start_date: date | None = None
    due_date: date | None = None


class TaskComplete(BaseModel):
    revenue_impact: float = 0.0
    cost_impact: float = 0.0
    clients_acquired: int = 0
    completion_comment: str | None = None


class TaskApproval(BaseModel):
    approved: bool # True = approved, False = returned/rejected
    approval_comment: str | None = None


class TaskOut(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    title: str
    description: str | None = None
    status: str
    priority: str
    assignee_id: uuid.UUID | None = None
    assignee_name: str | None = None
    created_by_id: uuid.UUID
    created_by_name: str | None = None
    start_date: date | None = None
    due_date: date | None = None
    completed_at: datetime | None = None
    revenue_impact: float
    cost_impact: float
    clients_acquired: int
    completion_comment: str | None = None
    approval_status: str
    approved_by_id: uuid.UUID | None = None
    approved_by_name: str | None = None
    approval_comment: str | None = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# --- Project Documents (RAG) ---
class DocumentCreate(BaseModel):
    title: str
    content: str
    category: str = "general"


class DocumentUpdate(BaseModel):
    title: str | None = None
    content: str | None = None
    category: str | None = None


class DocumentOut(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    title: str
    content: str
    category: str
    author_id: uuid.UUID
    author_name: str | None = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
