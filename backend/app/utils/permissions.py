import uuid
from fastapi import HTTPException, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.member import Member, OrgRole
from app.models.user import User, PlatformRole
from app.models.organization import Organization
from app.models.role import OrgRoleDefinition


async def get_member_or_fail(
    db: AsyncSession, user_id: uuid.UUID, org_id: uuid.UUID
) -> Member:
    result = await db.execute(
        select(Member).where(
            Member.user_id == user_id,
            Member.organization_id == org_id,
        )
    )
    member = result.scalar_one_or_none()
    if member is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="not_a_member")
    return member


async def get_member_permissions(db: AsyncSession, member: Member) -> dict:
    is_mod = member.role == OrgRole.MODERATOR
    perms = {
        "is_owner": is_mod,
        "can_manage_roles": is_mod,
        "can_create_projects": is_mod,
        "can_edit_tasks": True,
        "can_approve_tasks": is_mod,
        "can_view_org_analytics": is_mod,
        "can_manage_members": is_mod,
    }

    # Если задан custom_role_id, перезаписываем кастомными правами
    if getattr(member, "custom_role_id", None):
        try:
            role_res = await db.execute(select(OrgRoleDefinition).where(OrgRoleDefinition.id == member.custom_role_id))
            r = role_res.scalar_one_or_none()
            if r:
                perms.update({
                    "can_manage_roles": r.can_manage_roles,
                    "can_create_projects": r.can_create_projects,
                    "can_edit_tasks": r.can_edit_tasks,
                    "can_approve_tasks": r.can_approve_tasks,
                    "can_view_org_analytics": r.can_view_org_analytics,
                    "can_manage_members": r.can_manage_members,
                })
        except Exception:
            pass

    return perms


def require_moderator(member: Member):
    if member.role != OrgRole.MODERATOR:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="moderator_required")


def require_admin(user: User):
    if user.platform_role != PlatformRole.ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="admin_required")
