from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.project import Project
from app.models.user import User
from app.schemas.project import ProjectCreate
from app.utils.audit import log_audit_action
from app.utils.permissions import get_member_or_fail, get_member_permissions


async def create_project_record(db: AsyncSession, organization_id, data: ProjectCreate, user: User) -> Project:
    member = await get_member_or_fail(db, user.id, organization_id)
    permissions = await get_member_permissions(db, member)
    if not permissions.get("can_create_projects") and not permissions.get("is_owner"):
        raise HTTPException(status_code=403, detail="Недостаточно прав для создания проектов")
    project = Project(organization_id=organization_id, name=data.name.strip(), description=data.description, category=data.category, budget=data.budget, start_date=data.start_date, end_date=data.end_date)
    db.add(project)
    await db.flush()
    from app.models.project import ProjectMember
    db.add(ProjectMember(project_id=project.id, user_id=user.id, role_in_project="Организатор"))
    await db.flush()
    categories = {"development": "Разработка", "business_analysis": "Бизнес-аналитика", "marketing": "Маркетинг", "hr": "HR", "logistics": "Логистика", "finance": "Финансы", "other": "Другое"}
    await log_audit_action(db, organization_id=organization_id, user_id=user.id, action="Создание проекта", entity_type="Проект", entity_id=str(project.id), details=f"Создан проект '{project.name}' (категория: {categories.get(project.category, project.category)})")
    return project


async def update_project_record(db: AsyncSession, project: Project, user: User, changes: dict) -> Project:
    member = await get_member_or_fail(db, user.id, project.organization_id)
    permissions = await get_member_permissions(db, member)
    if not permissions.get("can_create_projects") and not permissions.get("is_owner"):
        raise HTTPException(status_code=403, detail="permission_denied")
    allowed = {"name", "description", "category", "budget", "start_date", "end_date"}
    for key, value in changes.items():
        if key not in allowed:
            raise HTTPException(status_code=422, detail="Недопустимое поле проекта")
        if key == "name" and value is not None:
            value = str(value).strip()
        setattr(project, key, value)
    await db.flush()
    await log_audit_action(db, organization_id=project.organization_id, user_id=user.id, action="Изменение проекта", entity_type="Проект", entity_id=str(project.id), details=f"Изменён проект '{project.name}'")
    return project
