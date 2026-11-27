from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.project import Project, ProjectDocument
from app.models.user import User
from app.schemas.project import DocumentCreate
from app.utils.permissions import get_member_or_fail, get_member_permissions
from app.utils.audit import log_audit_action


async def create_project_document(db: AsyncSession, project: Project, data: DocumentCreate, user: User) -> ProjectDocument:
    await get_member_or_fail(db, user.id, project.organization_id)
    document = ProjectDocument(project_id=project.id, title=data.title.strip(), content=data.content, category=data.category, author_id=user.id)
    db.add(document)
    await db.flush()
    await log_audit_action(db, organization_id=project.organization_id, user_id=user.id, action="Создание документа", entity_type="Документ", entity_id=str(document.id), details=f"Создан документ '{document.title}'")
    return document


async def update_project_document(db: AsyncSession, document: ProjectDocument, user: User, changes: dict) -> ProjectDocument:
    project = (await db.execute(select(Project).where(Project.id == document.project_id))).scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="project_not_found")
    member = await get_member_or_fail(db, user.id, project.organization_id)
    permissions = await get_member_permissions(db, member)
    if not permissions.get("is_owner") and document.author_id != user.id:
        raise HTTPException(status_code=403, detail="permission_denied")
    for key in {"title", "content", "category"}:
        value = changes.get(key)
        if value is not None:
            setattr(document, key, value.strip() if key == "title" and isinstance(value, str) else value)
    await db.flush()
    await log_audit_action(db, organization_id=project.organization_id, user_id=user.id, action="Изменение документа", entity_type="Документ", entity_id=str(document.id), details=f"Изменён документ '{document.title}'")
    return document
