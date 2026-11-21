import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.models.user import User
from app.models.member import Member, OrgRole
from app.models.role import OrgRoleDefinition
from app.schemas.member import MemberOut, MemberUpdate
from app.utils.auth import get_current_user
from app.utils.permissions import get_member_or_fail, require_moderator, get_member_permissions
from app.utils.audit import log_action

router = APIRouter(prefix="/api/organizations/{org_id}/members", tags=["members"])


@router.get("/", response_model=list[MemberOut])
async def list_members(
    org_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await get_member_or_fail(db, current_user.id, org_id)
    result = await db.execute(
        select(Member, User)
        .join(User, User.id == Member.user_id)
        .where(Member.organization_id == org_id)
    )

    rows = result.all()

    # Считываем роли организации для маппинга названий и прав
    roles_map = {}
    owner_id = None
    try:
        r_res = await db.execute(select(OrgRoleDefinition).where(OrgRoleDefinition.organization_id == org_id))
        for r in r_res.scalars().all():
            roles_map[r.id] = r
        org_res = await db.execute(select(Organization).where(Organization.id == org_id))
        org_obj = org_res.scalar_one_or_none()
        owner_id = org_obj.owner_id if org_obj else None
    except Exception:
        pass

    members = []
    for row in rows:
        m, u = row[0], row[1]
        is_mod = m.role == OrgRole.MODERATOR
        is_owner = bool(owner_id and m.user_id == owner_id)
        perms = {
            "is_owner": is_owner,
            "can_manage_roles": is_mod or is_owner,
            "can_create_projects": is_mod or is_owner,
            "can_edit_tasks": True,
            "can_approve_tasks": is_mod or is_owner,
            "can_view_org_analytics": is_mod or is_owner,
            "can_manage_members": is_mod or is_owner,
        }
        custom_role_name = None
        cid = getattr(m, "custom_role_id", None)
        if cid and cid in roles_map:
            r = roles_map[cid]
            custom_role_name = r.name
            perms = {
                "is_owner": is_owner,
                "can_manage_roles": r.can_manage_roles or is_mod or is_owner,
                "can_create_projects": r.can_create_projects or is_mod or is_owner,
                "can_edit_tasks": r.can_edit_tasks,
                "can_approve_tasks": r.can_approve_tasks or is_mod or is_owner,
                "can_view_org_analytics": r.can_view_org_analytics or is_mod or is_owner,
                "can_manage_members": r.can_manage_members or is_mod or is_owner,
            }

        members.append(
            MemberOut(
                id=m.id,
                user_id=m.user_id,
                organization_id=m.organization_id,
                department_id=m.department_id,
                custom_role_id=cid,
                custom_role_name=custom_role_name,
                role=m.role,
                position=m.position,
                joined_at=m.joined_at,
                username=u.username,
                full_name=u.full_name,
                email=u.email,
                is_owner=is_owner,
                permissions=perms,
            )
        )
    return members


@router.put("/{member_id}", response_model=MemberOut)
async def update_member(
    org_id: uuid.UUID,
    member_id: uuid.UUID,
    data: MemberUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    actor = await get_member_or_fail(db, current_user.id, org_id)
    actor_perms = await get_member_permissions(db, actor)
    if not actor_perms.get("can_manage_members") and not actor_perms.get("is_owner") and actor.role != OrgRole.MODERATOR:
        raise HTTPException(status_code=403, detail="moderator_required")

    result = await db.execute(
        select(Member).where(Member.id == member_id, Member.organization_id == org_id)
    )
    member = result.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=404, detail="member_not_found")

    if data.role is not None:
        member.role = data.role
    if "custom_role_id" in data.model_fields_set:
        member.custom_role_id = data.custom_role_id
    if data.position is not None:
        member.position = data.position
    if data.department_id is not None:
        member.department_id = data.department_id

    await db.flush()
    await db.refresh(member)

    user_result = await db.execute(select(User).where(User.id == member.user_id))
    user = user_result.scalar_one()

    await log_action(
        db, current_user.id, org_id,
        "Изменение сотрудника", "Сотрудник", str(member.id),
        f"Обновлены данные сотрудника '{user.full_name}'"
    )

    is_owner = False
    try:
        org_res = await db.execute(select(Organization).where(Organization.id == org_id))
        org_obj = org_res.scalar_one_or_none()
        is_owner = bool(org_obj and member.user_id == org_obj.owner_id)
    except Exception:
        pass

    is_mod = member.role == OrgRole.MODERATOR
    m_perms = {
        "is_owner": is_owner,
        "can_manage_roles": is_mod or is_owner,
        "can_create_projects": is_mod or is_owner,
        "can_edit_tasks": True,
        "can_approve_tasks": is_mod or is_owner,
        "can_view_org_analytics": is_mod or is_owner,
        "can_manage_members": is_mod or is_owner,
    }
    custom_role_name = None
    if getattr(member, "custom_role_id", None):
        try:
            r_res = await db.execute(select(OrgRoleDefinition).where(OrgRoleDefinition.id == member.custom_role_id))
            r = r_res.scalar_one_or_none()
            if r:
                custom_role_name = r.name
                m_perms = {
                    "is_owner": is_owner,
                    "can_manage_roles": r.can_manage_roles or is_mod or is_owner,
                    "can_create_projects": r.can_create_projects or is_mod or is_owner,
                    "can_edit_tasks": r.can_edit_tasks,
                    "can_approve_tasks": r.can_approve_tasks or is_mod or is_owner,
                    "can_view_org_analytics": r.can_view_org_analytics or is_mod or is_owner,
                    "can_manage_members": r.can_manage_members or is_mod or is_owner,
                }
        except Exception:
            pass

    return MemberOut(
        id=member.id,
        user_id=member.user_id,
        organization_id=member.organization_id,
        department_id=member.department_id,
        custom_role_id=getattr(member, "custom_role_id", None),
        custom_role_name=custom_role_name,
        role=member.role,
        position=member.position,
        joined_at=member.joined_at,
        username=user.username,
        full_name=user.full_name,
        email=user.email,
        is_owner=is_owner,
        permissions=m_perms,
    )


@router.delete("/{member_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_member(
    org_id: uuid.UUID,
    member_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    actor = await get_member_or_fail(db, current_user.id, org_id)
    require_moderator(actor)

    result = await db.execute(
        select(Member).where(Member.id == member_id, Member.organization_id == org_id)
    )
    member = result.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=404, detail="member_not_found")
    if member.user_id == current_user.id:
        raise HTTPException(status_code=400, detail="cannot_remove_self")

    await db.delete(member)
    
    user_result = await db.execute(select(User).where(User.id == member.user_id))
    user = user_result.scalar_one_or_none()
    user_name = user.full_name if user else "Неизвестно"
    
    await log_action(
        db, current_user.id, org_id,
        "Удаление сотрудника", "Сотрудник", str(member.id),
        f"Сотрудник '{user_name}' исключен из организации"
    )
    
    await db.flush()
