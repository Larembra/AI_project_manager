import uuid
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, ForeignKey, Boolean, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class OrgRoleDefinition(Base):
    """
    Кастомные роли организации с гранулярными чекбоксами прав.
    Организатор (Owner) всегда имеет все права безусловно.
    """
    __tablename__ = "org_roles"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Чекбоксы полномочий
    can_manage_roles: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    can_create_projects: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    can_edit_tasks: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    can_approve_tasks: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    can_view_org_analytics: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    can_manage_members: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    organization = relationship("Organization", back_populates="custom_roles")
    members = relationship("Member", back_populates="custom_role")
