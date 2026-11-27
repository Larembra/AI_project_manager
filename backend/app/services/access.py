import uuid
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.project import ProjectMember
from app.utils.permissions import get_member_or_fail, get_member_permissions


async def is_project_organizer_or_privileged(db: AsyncSession, project_id: uuid.UUID, user_id: uuid.UUID, organization_id: uuid.UUID, permission: str | None = None) -> bool:
    try:
        member = await get_member_or_fail(db, user_id, organization_id)
        permissions = await get_member_permissions(db, member)
        if permissions.get("is_owner") or permissions.get("can_create_projects") or permissions.get("can_manage_members"):
            return True
        if permission and permissions.get(permission):
            return True
        result = await db.execute(select(ProjectMember).where(and_(ProjectMember.project_id == project_id, ProjectMember.user_id == user_id, ProjectMember.role_in_project.in_(["Организатор", "Руководитель проекта"]))))
        return result.scalar_one_or_none() is not None
    except Exception:
        return False
