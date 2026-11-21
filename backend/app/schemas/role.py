import uuid
from datetime import datetime
from pydantic import BaseModel


class RoleCreate(BaseModel):
    name: str
    description: str | None = None
    can_manage_roles: bool = False
    can_create_projects: bool = False
    can_edit_tasks: bool = True
    can_approve_tasks: bool = False
    can_view_org_analytics: bool = False
    can_manage_members: bool = False


class RoleUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    can_manage_roles: bool | None = None
    can_create_projects: bool | None = None
    can_edit_tasks: bool | None = None
    can_approve_tasks: bool | None = None
    can_view_org_analytics: bool | None = None
    can_manage_members: bool | None = None


class RoleOut(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    name: str
    description: str | None = None
    can_manage_roles: bool
    can_create_projects: bool
    can_edit_tasks: bool
    can_approve_tasks: bool
    can_view_org_analytics: bool
    can_manage_members: bool
    created_at: datetime

    class Config:
        from_attributes = True
