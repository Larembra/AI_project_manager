import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.models.user import User
from app.models.member import Member, OrgRole
from app.models.invitation import Invitation, InvitationStatus
from app.models.audit import AuditLog
from app.schemas.invitation import InvitationCreate, InvitationOut
from app.utils.auth import get_current_user
from app.utils.permissions import get_member_or_fail, require_moderator
from app.services.members import create_organization_invitation

router = APIRouter(prefix="/api/organizations/{org_id}/invitations", tags=["invitations"])
user_invites_router = APIRouter(prefix="/api/invitations", tags=["invitations"])



@router.post("/", response_model=InvitationOut, status_code=status.HTTP_201_CREATED)
async def create_invitation(
    org_id: uuid.UUID,
    data: InvitationCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    invite = await create_organization_invitation(db, org_id, data, current_user)
    return InvitationOut.model_validate(invite)


@router.get("/", response_model=list[InvitationOut])
async def list_invitations(
    org_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    actor = await get_member_or_fail(db, current_user.id, org_id)
    require_moderator(actor)

    result = await db.execute(
        select(Invitation).where(Invitation.organization_id == org_id).order_by(Invitation.created_at.desc())
    )
    return [InvitationOut.model_validate(i) for i in result.scalars().all()]


@router.post("/{invite_id}/cancel", status_code=status.HTTP_204_NO_CONTENT)
async def cancel_invitation(
    org_id: uuid.UUID,
    invite_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    actor = await get_member_or_fail(db, current_user.id, org_id)
    require_moderator(actor)

    result = await db.execute(
        select(Invitation).where(Invitation.id == invite_id, Invitation.organization_id == org_id)
    )
    invite = result.scalar_one_or_none()
    if not invite:
        raise HTTPException(status_code=404, detail="not_found")
    invite.status = InvitationStatus.EXPIRED
    await db.flush()


@router.post("/accept/{token}")
async def accept_invitation(
    token: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Invitation).where(Invitation.token == token))
    invite = result.scalar_one_or_none()
    if not invite:
        raise HTTPException(status_code=404, detail="invitation_not_found")
    if invite.status != InvitationStatus.PENDING:
        raise HTTPException(status_code=400, detail="invitation_not_pending")
    if invite.expires_at < datetime.now(timezone.utc):
        invite.status = InvitationStatus.EXPIRED
        await db.flush()
        raise HTTPException(status_code=400, detail="invitation_expired")
    if invite.email != current_user.email:
        raise HTTPException(status_code=403, detail="email_mismatch")

    existing = await db.execute(
        select(Member).where(
            Member.user_id == current_user.id,
            Member.organization_id == invite.organization_id,
        )
    )
    if existing.scalar_one_or_none():
        invite.status = InvitationStatus.ACCEPTED
        await db.flush()
        return {"detail": "already_member"}

    member = Member(
        user_id=current_user.id,
        organization_id=invite.organization_id,
        role=OrgRole.EMPLOYEE,
    )
    db.add(member)
    invite.status = InvitationStatus.ACCEPTED
    await db.flush()

    db.add(
        AuditLog(
            user_id=current_user.id,
            organization_id=invite.organization_id,
            action="accept_invitation",
            entity_type="invitation",
            entity_id=str(invite.id),
            details="Invitation accepted",
        )
    )

    return {"detail": "accepted"}


@user_invites_router.get("/my-pending", response_model=list[InvitationOut])
async def my_pending_invitations(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Invitation).where(
            Invitation.email == current_user.email,
            Invitation.status == InvitationStatus.PENDING,
        )
    )
    return [InvitationOut.model_validate(i) for i in result.scalars().all()]
