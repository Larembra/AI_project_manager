import uuid
from dataclasses import dataclass
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.user import User


@dataclass(slots=True)
class AgentContext:
    user: User
    db: AsyncSession
    conversation_id: uuid.UUID
    organization_id: uuid.UUID | None = None
    project_id: uuid.UUID | None = None
    github_enabled: bool = False
    can_edit_project: bool = False
    can_edit_tasks: bool = False
    can_manage_members: bool = False
    can_view_org_analytics: bool = False
    can_approve_tasks: bool = False
