import json
import base64
import hashlib
import re
import ssl
import urllib.error
import urllib.request
from urllib.parse import urlparse
from cryptography.fernet import Fernet, InvalidToken
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.config import settings
from app.models.project import Project
from app.models.project_integration import ProjectIntegration
from app.utils.permissions import get_member_or_fail, get_member_permissions


def encrypt_token(token: str) -> str:
    if not settings.INTEGRATIONS_ENCRYPTION_KEY:
        raise HTTPException(status_code=503, detail="Для подключения GitHub задайте INTEGRATIONS_ENCRYPTION_KEY на сервере")
    try:
        cipher = Fernet(settings.INTEGRATIONS_ENCRYPTION_KEY.encode("ascii"))
        return cipher.encrypt(token.encode("utf-8")).decode("ascii")
    except (ValueError, UnicodeEncodeError) as error:
        raise HTTPException(status_code=503, detail="INTEGRATIONS_ENCRYPTION_KEY имеет неверный формат") from error


def decrypt_token(value: str) -> str:
    if not value.startswith("gAAAA"):
        packed = base64.urlsafe_b64decode(value.encode("ascii"))
        key = hashlib.sha256(settings.SECRET_KEY.encode("utf-8")).digest()
        return AESGCM(key).decrypt(packed[:12], packed[12:], b"project-integrations:github").decode("utf-8")
    if not settings.INTEGRATIONS_ENCRYPTION_KEY:
        raise ValueError("github_encryption_key_missing")
    try:
        cipher = Fernet(settings.INTEGRATIONS_ENCRYPTION_KEY.encode("ascii"))
        return cipher.decrypt(value.encode("ascii")).decode("utf-8")
    except (InvalidToken, ValueError, UnicodeEncodeError) as error:
        raise ValueError("github_token_decryption_failed") from error


def parse_github_repository(value: str) -> tuple[str, str]:
    raw_value = value.strip()
    if "://" not in raw_value:
        segments = raw_value.split("/")
    else:
        parsed = urlparse(raw_value)
        if parsed.scheme != "https" or parsed.hostname not in {"github.com", "www.github.com"} or parsed.query or parsed.fragment:
            raise HTTPException(status_code=422, detail="Укажите ссылку вида https://github.com/owner/repository")
        segments = [segment for segment in parsed.path.strip("/").split("/") if segment]
    if len(segments) != 2:
        raise HTTPException(status_code=422, detail="Ссылка должна вести на конкретный GitHub-репозиторий")
    owner, name = segments
    name = re.sub(r"\.git$", "", name)
    if not re.fullmatch(r"[A-Za-z0-9_.-]{1,100}", owner) or not re.fullmatch(r"[A-Za-z0-9_.-]{1,100}", name):
        raise HTTPException(status_code=422, detail="Некорректная ссылка на репозиторий")
    return owner, name


async def editable_integration_project(db: AsyncSession, user_id, project_id) -> Project:
    project = (await db.execute(select(Project).where(Project.id == project_id))).scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="project_not_found")
    member = await get_member_or_fail(db, user_id, project.organization_id)
    permissions = await get_member_permissions(db, member)
    if not permissions.get("can_create_projects") and not permissions.get("is_owner"):
        raise HTTPException(status_code=403, detail="permission_denied")
    return project


async def get_github_integration(db: AsyncSession, project_id) -> ProjectIntegration | None:
    result = await db.execute(select(ProjectIntegration).where(ProjectIntegration.project_id == project_id, ProjectIntegration.provider == "github"))
    return result.scalar_one_or_none()


def validate_github_token(token: str, owner: str, repository: str) -> bool | None:
    url = f"https://api.github.com/repos/{owner}/{repository}"
    request = urllib.request.Request(url, headers={"Accept": "application/vnd.github+json", "Authorization": f"Bearer {token}", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "Soprano-Agent"})
    try:
        with urllib.request.urlopen(request, timeout=12, context=ssl.create_default_context()) as response:
            return response.status == 200 and bool(json.loads(response.read().decode("utf-8")).get("full_name"))
    except urllib.error.HTTPError as error:
        return False if error.code in {403, 404} else None
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, UnicodeDecodeError, OSError):
        return None
