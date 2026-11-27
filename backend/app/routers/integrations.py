import uuid
import asyncio
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.models.project_integration import ProjectIntegration
from app.schemas.integration import ProjectIntegrationOut, ProjectIntegrationUpdate
from app.models.user import User
from app.utils.auth import get_current_user
from app.utils.permissions import get_member_or_fail
from app.services.integrations import editable_integration_project, get_github_integration, parse_github_repository, validate_github_token, encrypt_token

router = APIRouter(prefix="/api/projects/{project_id}/integrations/github", tags=["project-integrations"])


def _public_result(integration: ProjectIntegration | None) -> ProjectIntegrationOut:
    if not integration:
        return ProjectIntegrationOut()
    url = f"https://github.com/{integration.repo_owner}/{integration.repo_name}"
    return ProjectIntegrationOut(repo_url=url, token_configured=bool(integration.token_encrypted), token_last4=integration.token_last4)


@router.get("", response_model=ProjectIntegrationOut)
async def read_github_integration(project_id: uuid.UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    from sqlalchemy import select
    from app.models.project import Project
    project = (await db.execute(select(Project).where(Project.id == project_id))).scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="project_not_found")
    await get_member_or_fail(db, user.id, project.organization_id)
    return _public_result(await get_github_integration(db, project_id))


@router.put("", response_model=ProjectIntegrationOut)
async def update_github_integration(project_id: uuid.UUID, data: ProjectIntegrationUpdate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await editable_integration_project(db, user.id, project_id)
    integration = await get_github_integration(db, project_id)
    created = False
    if data.repo_url is None or not data.repo_url.strip():
        if integration:
            await db.delete(integration)
        return ProjectIntegrationOut()
    owner, name = parse_github_repository(data.repo_url)
    if integration is None:
        if not data.token:
            raise HTTPException(status_code=422, detail="Для новой привязки укажите GitHub PAT с доступом только на чтение")
        integration = ProjectIntegration(project_id=project_id, provider="github", repo_owner=owner, repo_name=name, token_encrypted=None, token_last4=None, created_by=user.id)
        db.add(integration)
        created = True
    retained_token_check = True
    if not data.token and integration.token_encrypted and (integration.repo_owner != owner or integration.repo_name != name) and not data.remove_token:
        from app.services.integrations import decrypt_token
        retained_token_check = await asyncio.to_thread(validate_github_token, decrypt_token(integration.token_encrypted), owner, name)
        if retained_token_check is False:
            raise HTTPException(status_code=422, detail="Текущий токен не имеет доступа к выбранному репозиторию")
        if retained_token_check is None:
            if created:
                db.expunge(integration)
            return ProjectIntegrationOut(
                repo_url=f"https://github.com/{integration.repo_owner}/{integration.repo_name}" if integration.token_encrypted else None,
                token_configured=bool(integration.token_encrypted),
                token_last4=integration.token_last4,
                warning="GitHub временно недоступен. Остальные изменения проекта сохранены; привязка репозитория не изменена.",
            )
    if data.remove_token:
        integration.repo_owner = owner
        integration.repo_name = name
        integration.token_encrypted = None
        integration.token_last4 = None
    elif data.token:
        token = data.token.strip()
        if not token:
            raise HTTPException(status_code=422, detail="Укажите GitHub PAT")
        token_check = await asyncio.to_thread(validate_github_token, token, owner, name)
        if token_check is False:
            raise HTTPException(status_code=422, detail="Не удалось проверить токен и доступ на чтение репозитория")
        if token_check is None:
            if created:
                db.expunge(integration)
            return ProjectIntegrationOut(
                repo_url=f"https://github.com/{integration.repo_owner}/{integration.repo_name}" if integration and integration.token_encrypted else None,
                token_configured=bool(integration and integration.token_encrypted),
                token_last4=integration.token_last4 if integration else None,
                warning="GitHub временно недоступен. Остальные изменения проекта сохранены; привязка репозитория не изменена.",
            )
        integration.repo_owner = owner
        integration.repo_name = name
        integration.token_encrypted = encrypt_token(token)
        integration.token_last4 = token[-4:]
    else:
        integration.repo_owner = owner
        integration.repo_name = name
    integration.updated_at = datetime.now(timezone.utc)
    await db.flush()
    return _public_result(integration)
