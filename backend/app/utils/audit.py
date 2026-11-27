import uuid
from contextvars import ContextVar
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.audit import AuditLog

actor_source: ContextVar[str] = ContextVar("actor_source", default="user")

async def log_action(
    db: AsyncSession,
    user_id: uuid.UUID,
    organization_id: uuid.UUID | None,
    action: str,
    entity_type: str,
    entity_id: str | None = None,
    details: str | None = None
):
    log = AuditLog(
        user_id=user_id,
        organization_id=organization_id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        details=details,
        via_agent=actor_source.get() == "agent",
    )
    db.add(log)
    # We do not commit here to allow callers to group the log within their transaction


async def log_audit_action(
    db: AsyncSession,
    organization_id: uuid.UUID | None,
    user_id: uuid.UUID,
    action: str,
    entity_type: str,
    entity_id: str | None = None,
    details: str | None = None
):
    return await log_action(db, user_id, organization_id, action, entity_type, entity_id, details)
