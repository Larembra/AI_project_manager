import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.models.user import User
from app.models.role import OrgRoleDefinition
from app.models.organization import Organization
from app.schemas.role import RoleCreate, RoleUpdate, RoleOut
from app.utils.auth import get_current_user
from app.utils.permissions import get_member_or_fail, get_member_permissions
from app.utils.audit import log_audit_action

router = APIRouter(prefix="/api/organizations/{org_id}/roles", tags=["roles"])


@router.get("/", response_model=list[RoleOut])
async def list_roles(
    org_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await get_member_or_fail(db, current_user.id, org_id)
    result = await db.execute(
        select(OrgRoleDefinition)
        .where(OrgRoleDefinition.organization_id == org_id)
        .order_by(OrgRoleDefinition.created_at)
    )
    return result.scalars().all()


@router.post("/", response_model=RoleOut, status_code=status.HTTP_201_CREATED)
async def create_role(
    org_id: uuid.UUID,
    data: RoleCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    member = await get_member_or_fail(db, current_user.id, org_id)
    perms = await get_member_permissions(db, member)
    if not perms.get("can_manage_roles") and not perms.get("is_owner"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Недостаточно прав для создания и настройки ролей",
        )

    role = OrgRoleDefinition(
        organization_id=org_id,
        name=data.name.strip(),
        description=data.description,
        can_manage_roles=data.can_manage_roles,
        can_create_projects=data.can_create_projects,
        can_edit_tasks=data.can_edit_tasks,
        can_approve_tasks=data.can_approve_tasks,
        can_view_org_analytics=data.can_view_org_analytics,
        can_manage_members=data.can_manage_members,
    )
    db.add(role)
    await db.flush()

    await log_audit_action(
        db,
        organization_id=org_id,
        user_id=current_user.id,
        action="Создание роли",
        entity_type="Роль",
        entity_id=str(role.id),
        details=f"Создана роль '{role.name}' с кастомными правами",
    )
    return role


@router.put("/{role_id}", response_model=RoleOut)
async def update_role(
    org_id: uuid.UUID,
    role_id: uuid.UUID,
    data: RoleUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    member = await get_member_or_fail(db, current_user.id, org_id)
    perms = await get_member_permissions(db, member)
    if not perms.get("can_manage_roles") and not perms.get("is_owner"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Недостаточно прав для изменения ролей",
        )

    res = await db.execute(
        select(OrgRoleDefinition).where(
            OrgRoleDefinition.id == role_id,
            OrgRoleDefinition.organization_id == org_id,
        )
    )
    role = res.scalar_one_or_none()
    if not role:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="role_not_found")

    if data.name is not None:
        role.name = data.name.strip()
    if data.description is not None:
        role.description = data.description
    if data.can_manage_roles is not None:
        role.can_manage_roles = data.can_manage_roles
    if data.can_create_projects is not None:
        role.can_create_projects = data.can_create_projects
    if data.can_edit_tasks is not None:
        role.can_edit_tasks = data.can_edit_tasks
    if data.can_approve_tasks is not None:
        role.can_approve_tasks = data.can_approve_tasks
    if data.can_view_org_analytics is not None:
        role.can_view_org_analytics = data.can_view_org_analytics
    if data.can_manage_members is not None:
        role.can_manage_members = data.can_manage_members

    await db.flush()

    await log_audit_action(
        db,
        organization_id=org_id,
        user_id=current_user.id,
        action="Изменение роли",
        entity_type="Роль",
        entity_id=str(role.id),
        details=f"Обновлены настройки роли '{role.name}'",
    )
    return role


@router.delete("/{role_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_role(
    org_id: uuid.UUID,
    role_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    member = await get_member_or_fail(db, current_user.id, org_id)
    perms = await get_member_permissions(db, member)
    if not perms.get("can_manage_roles") and not perms.get("is_owner"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Недостаточно прав для удаления ролей",
        )

    res = await db.execute(
        select(OrgRoleDefinition).where(
            OrgRoleDefinition.id == role_id,
            OrgRoleDefinition.organization_id == org_id,
        )
    )
    role = res.scalar_one_or_none()
    if not role:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="role_not_found")

    role_name = role.name
    await db.delete(role)
    await db.flush()

    await log_audit_action(
        db,
        organization_id=org_id,
        user_id=current_user.id,
        action="Удаление роли",
        entity_type="Роль",
        entity_id=str(role_id),
        details=f"Удалена роль '{role_name}'",
    )
    return None
