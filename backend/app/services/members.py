import secrets
from datetime import datetime, timedelta, timezone
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.invitation import Invitation, InvitationStatus
from app.models.member import Member
from app.models.notification import Notification
from app.models.user import User
from app.schemas.invitation import InvitationCreate
from app.utils.audit import log_audit_action
from app.utils.permissions import get_member_or_fail, require_moderator

INVITE_EXPIRY_DAYS = 7


async def create_organization_invitation(db: AsyncSession, organization_id, data: InvitationCreate, user: User) -> Invitation:
    actor = await get_member_or_fail(db, user.id, organization_id)
    require_moderator(actor)
    existing = await db.execute(select(Invitation).where(Invitation.organization_id == organization_id, Invitation.email == data.email, Invitation.status == InvitationStatus.PENDING))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="invitation_already_sent")
    existing_member = await db.execute(select(Member).join(User, User.id == Member.user_id).where(Member.organization_id == organization_id, User.email == data.email))
    if existing_member.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="already_a_member")
    invitation = Invitation(organization_id=organization_id, inviter_id=user.id, email=data.email, token=secrets.token_urlsafe(32), expires_at=datetime.now(timezone.utc) + timedelta(days=INVITE_EXPIRY_DAYS))
    db.add(invitation)
    await db.flush()
    await db.refresh(invitation)
    invited_user = (await db.execute(select(User).where(User.email == data.email))).scalar_one_or_none()
    if invited_user:
        db.add(Notification(user_id=invited_user.id, organization_id=organization_id, title="Приглашение в организацию", message="Вас пригласили в организацию. Проверьте раздел приглашений.", entity_type="invitation", entity_id=str(invitation.id)))
    await log_audit_action(db, organization_id=organization_id, user_id=user.id, action="create_invitation", entity_type="invitation", entity_id=str(invitation.id), details=f"Invite sent to {data.email}")
    return invitation
