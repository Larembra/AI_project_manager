import os
import json
import ssl
import urllib.request
import urllib.error
import uuid
import hashlib
import threading
import time
import logging
from collections import Counter
from types import SimpleNamespace
from datetime import date, datetime, timedelta, timezone
from typing import Optional, Any
from pydantic import BaseModel, ValidationError
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy import select, and_, func
from sqlalchemy.ext.asyncio import AsyncSession
from app.config import settings
from app.database import get_db
from app.utils.auth import get_current_user
from app.models.user import User
from app.models.organization import Organization
from app.models.project import Project, ProjectTask, ProjectDocument
from app.models.member import Member
from app.models.ai_conversation import AIConversationMessage
from app.models.ai_agent_step import AIAgentStep
from app.models.ai_tool_call import AIToolCall
from app.models.project_integration import ProjectIntegration
from app.agent.safety import mark_untrusted_text
from app.services.tasks import update_project_task_record
from app.agent.history import build_history, history_as_text
from app.agent.prompts import SYSTEM_INSTRUCTION
from app.agent.llm.gemini import GeminiClient
from app.agent.llm.base import LLMClient
from app.agent.context import AgentContext
from app.agent.runner import append_tool_exchange, run_agent
from app.agent.tools.github import GITHUB_TOOL_ALLOWLIST, call_github_tool
from app.agent.tools.tasks import list_project_tasks, get_project_analytics
from app.agent.tools.tasks import list_organization_tasks, list_organization_members, get_organization_analytics
from app.agent.tools.tasks import CompleteTaskArgs, ReviewTaskArgs
from app.agent.tools import projects as project_tools
from app.agent.tools import documents as document_tools
from app.agent.tools import members as member_tools
from app.agent.tools.registry import visible_tools
from app.routers.ai_conversations import owned_conversation, add_message
from app.utils.permissions import get_member_or_fail, get_member_permissions
from app.services.access import is_project_organizer_or_privileged

router = APIRouter(prefix="/api/ai", tags=["ai"])
logger = logging.getLogger(__name__)
_MODEL_CACHE: dict[str, tuple[float, list[str]]] = {}
_MODEL_CACHE_LOCK = threading.Lock()

class AskAIRequest(BaseModel):
    prompt: str
    conversation_id: uuid.UUID
    organization_id: Optional[uuid.UUID] = None
    project_id: Optional[uuid.UUID] = None
    context: Optional[str] = None
    api_key: Optional[str] = None


def _get_ssl_context() -> ssl.SSLContext:
    if not settings.GEMINI_SSL_VERIFY:
        return ssl._create_unverified_context()
    try:
        import certifi
        return ssl.create_default_context(cafile=certifi.where())
    except (ImportError, OSError):
        ctx = ssl.create_default_context()
        ctx.load_default_certs()
        return ctx


def _get_supported_models(api_key: str, ssl_ctx: ssl.SSLContext) -> list[str]:
    """
    Получает список доступных моделей для переданного ключа Gemini API
    и сортирует их с наивысшим приоритетом для версий flash-lite (3.5, 2.5, 2.0).
    """
    cache_key = hashlib.sha256(api_key.encode("utf-8")).hexdigest()
    with _MODEL_CACHE_LOCK:
        cached = _MODEL_CACHE.get(cache_key)
        if cached and cached[0] > time.monotonic():
            return list(cached[1])
    discovered_models = []
    try:
        list_url = "https://generativelanguage.googleapis.com/v1beta/models"
        req = urllib.request.Request(list_url, headers={"Content-Type": "application/json", "x-goog-api-key": api_key})
        with urllib.request.urlopen(req, timeout=10, context=ssl_ctx) as response:
            res_data = json.loads(response.read().decode("utf-8"))
            for m in res_data.get("models", []):
                methods = m.get("supportedGenerationMethods", [])
                if "generateContent" in methods:
                    name = m.get("name", "").replace("models/", "")
                    if name:
                        discovered_models.append(name)
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, UnicodeDecodeError, OSError) as exc:
        logger.warning("Не удалось получить каталог Gemini моделей: %s", type(exc).__name__)

    def model_priority(m: str) -> int:
        m_lower = m.lower()
        if "3.5" in m_lower and "lite" in m_lower:
            return 0
        if "3.5" in m_lower and "flash" in m_lower:
            return 1
        if "3.5" in m_lower:
            return 2
        if "2.5" in m_lower and "lite" in m_lower:
            return 3
        if "2.5" in m_lower and "flash" in m_lower:
            return 4
        if "2.0" in m_lower and "lite" in m_lower:
            return 5
        if "lite" in m_lower and "flash" in m_lower:
            return 6
        if "lite" in m_lower:
            return 7
        if "2.0" in m_lower and "flash" in m_lower:
            return 8
        if "1.5" in m_lower and "flash" in m_lower:
            return 9
        if "flash" in m_lower:
            return 10
        if "pro" in m_lower:
            return 20
        return 30

    if discovered_models:
        discovered_models.sort(key=model_priority)
        with _MODEL_CACHE_LOCK:
            _MODEL_CACHE[cache_key] = (time.monotonic() + settings.AI_MODELS_CACHE_TTL_SECONDS, list(discovered_models))
        return discovered_models

    fallback_models = [
        "gemini-3.5-flash-lite",
        "gemini-2.5-flash-lite",
        "gemini-2.0-flash-lite",
        "gemini-2.0-flash-lite-preview-02-05",
        "gemini-2.0-flash-lite-preview",
        "gemini-2.5-flash",
        "gemini-2.0-flash",
        "gemini-1.5-flash",
        "gemini-1.5-flash-latest",
        "gemini-1.5-flash-8b",
        "gemini-1.5-pro",
        "gemini-1.5-pro-latest",
    ]
    with _MODEL_CACHE_LOCK:
        _MODEL_CACHE[cache_key] = (time.monotonic() + settings.AI_MODELS_CACHE_TTL_SECONDS, list(fallback_models))
    return fallback_models


def _call_gemini_api(api_key: str, prompt: str, system_context: str) -> str:
    ssl_ctx = _get_ssl_context()
    models = _get_supported_models(api_key, ssl_ctx)

    payload = {
        "contents": [
            {
                "parts": [
                    {"text": f"{system_context}\n\nЗапрос пользователя: {prompt}"}
                ]
            }
        ],
        "systemInstruction": {
            "parts": [
                {"text": SYSTEM_INSTRUCTION}
            ]
        },
        "generationConfig": {
            "temperature": 0.35,
            "maxOutputTokens": 2048,
        }
    }

    last_error = None
    for model in models:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
        req_data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=req_data,
            headers={"Content-Type": "application/json", "x-goog-api-key": api_key},
            method="POST"
        )
        try:
            with urllib.request.urlopen(req, timeout=30, context=ssl_ctx) as response:
                res_body = response.read().decode("utf-8")
                data = json.loads(res_body)
                candidates = data.get("candidates", [])
                if candidates:
                    parts = candidates[0].get("content", {}).get("parts", [])
                    if parts and "text" in parts[0]:
                        return parts[0]["text"]
                return "Ответ сформирован, однако содержание отсутствует в ответе модели."
        except urllib.error.HTTPError as e:
            e.read()
            last_error = f"HTTP {e.code} ({model})"
            if e.code == 403:
                raise HTTPException(status_code=400, detail="Gemini API отклонил ключ или недостаточно прав.")
            continue
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, UnicodeDecodeError, OSError) as e:
            last_error = f"{model}: {type(e).__name__}"
            continue

    raise HTTPException(status_code=502, detail=f"Не удалось получить ответ от Gemini API: {last_error}")


def _call_gemini_project_agent(api_key: str, prompt: str, system_context: str, github_enabled: bool = False, organization_only: bool = False, can_edit_project: bool = True, can_edit_tasks: bool = True, can_manage_members: bool = True, contents: list[dict] | None = None, preferred_model: str | None = None) -> tuple[str, list[dict], str, list[dict]]:
    ssl_ctx = _get_ssl_context()
    registry_context = SimpleNamespace(
        project_id=None if organization_only else "selected",
        organization_id="selected",
        github_enabled=github_enabled,
        can_edit_project=can_edit_project,
        can_edit_tasks=can_edit_tasks,
        can_manage_members=can_manage_members,
        can_view_org_analytics=can_manage_members,
        can_approve_tasks=can_manage_members,
    )
    declarations = [spec.gemini_declaration() for spec in visible_tools(registry_context)]
    payload = {
        "contents": contents or [{"role": "user", "parts": [{"text": f"{system_context}\n\nЗапрос пользователя: {prompt}"}]}],
        "systemInstruction": {"parts": [{"text": SYSTEM_INSTRUCTION + " Используй инструменты только для выбранного проекта. Не утверждай, что запись выполнена: запись произойдёт только после подтверждения пользователя."}]},
        "generationConfig": {"temperature": 0.35, "maxOutputTokens": 2048},
    }
    if declarations:
        payload["tools"] = [{"functionDeclarations": declarations}]
    last_error = "нет ответа модели"
    models = _get_supported_models(api_key, ssl_ctx)
    if preferred_model in models:
        models = [preferred_model, *[model for model in models if model != preferred_model]]
    for model in models:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
        request = urllib.request.Request(url, data=json.dumps(payload).encode("utf-8"), headers={"Content-Type": "application/json", "x-goog-api-key": api_key}, method="POST")
        try:
            with urllib.request.urlopen(request, timeout=30, context=ssl_ctx) as response:
                data = json.loads(response.read().decode("utf-8"))
            candidate = (data.get("candidates") or [{}])[0]
            parts = candidate.get("content", {}).get("parts", [])
            answer = "\n".join(part["text"] for part in parts if isinstance(part, dict) and part.get("text"))
            calls = [part["functionCall"] for part in parts if isinstance(part, dict) and isinstance(part.get("functionCall"), dict)]
            return answer, calls, model, parts
        except urllib.error.HTTPError as exc:
            last_error = f"HTTP {exc.code}"
            if exc.code == 403:
                raise HTTPException(status_code=400, detail="Ошибка Gemini API. Проверьте ключ и доступность модели.")
            if exc.code == 400:
                continue
        except Exception as exc:
            last_error = type(exc).__name__
    raise HTTPException(status_code=502, detail=f"Не удалось получить ответ от Gemini API: {last_error}")


llm_client: LLMClient = GeminiClient(lambda *args: _call_gemini_api(*args), lambda *args: _call_gemini_project_agent(*args))


@router.post("/ask")
async def ask_advisor(
    req: AskAIRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    prompt = req.prompt.strip()
    if not prompt:
        raise HTTPException(status_code=400, detail="Запрос не может быть пустым.")

    api_key = req.api_key or settings.GEMINI_API_KEY or os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=400,
            detail="Ключ Gemini API не настроен. Укажите ключ в поле ввода советника или задайте переменную окружения GEMINI_API_KEY."
        )

    conversation = await owned_conversation(db, current_user, req.conversation_id)
    agent_context = AgentContext(user=current_user, db=db, conversation_id=conversation.id, organization_id=req.organization_id, project_id=req.project_id)
    history_result = await db.execute(
        select(AIConversationMessage)
        .where(AIConversationMessage.conversation_id == conversation.id)
        .order_by(AIConversationMessage.created_at.desc(), AIConversationMessage.id.desc())
    )
    previous_messages = list(reversed(history_result.scalars().all()))

    # 1. Сбор контекста организации и проектов (RAG и системный контекст)
    context_parts = []
    proj = None

    if req.project_id:
        p_res = await db.execute(select(Project).where(Project.id == req.project_id))
        proj = p_res.scalar_one_or_none()
        if not proj:
            raise HTTPException(status_code=404, detail="Проект не найден")
        if req.organization_id and proj.organization_id != req.organization_id:
            raise HTTPException(status_code=422, detail="Проект не относится к выбранной организации")
        await get_member_or_fail(db, current_user.id, proj.organization_id)
        if proj:
            context_parts.append(
                f"[Контекст текущего проекта]:\n"
                f"Название проекта: {proj.name}\n"
                f"Категория: {proj.category}\n"
                f"Статус: {proj.status}\n"
                f"Бюджет: {proj.budget} ₽\n"
                f"Описание: {proj.description or 'не указано'}"
            )

            docs_res = await db.execute(select(ProjectDocument.title, ProjectDocument.category).where(ProjectDocument.project_id == proj.id).limit(50))
            docs = docs_res.all()
            if docs:
                context_parts.append("[Документы базы знаний]:\n" + "\n".join(f"- {title} ({category})" for title, category in docs))

    elif req.organization_id:
        org_res = await db.execute(select(Organization).where(Organization.id == req.organization_id))
        org = org_res.scalar_one_or_none()
        if org:
            await get_member_or_fail(db, current_user.id, org.id)
            context_parts.append(
                f"[Контекст организации]:\n"
                f"Организация: {org.name}\n"
                f"Направление: {org.category}\n"
                f"Описание: {org.description or '—'}"
            )

            pr_res = await db.execute(select(Project).where(Project.organization_id == org.id))
            pr_list = pr_res.scalars().all()
            if pr_list:
                p_names = [f"- {p.name} (категория: {p.category}, статус: {p.status}, бюджет: {p.budget} ₽, описание: {p.description or '—'})" for p in pr_list]
                context_parts.append("[Проекты организации]:\n" + "\n".join(p_names))

    if req.context:
        context_parts.append(f"[Дополнительный контекст]:\n{req.context}")

    full_context = "\n\n".join(context_parts) if context_parts else "Контекст организации: платформа Soprano."

    try:
        turn_id = uuid.uuid4()
        response_model = None
        history = build_history(previous_messages, settings.ai_history_limit)
        history_context = "\n\n[Предыдущая переписка этого диалога]:\n" + history_as_text(history) if history else ""
        history_turn_limit = max(0, settings.AI_HISTORY_TOOL_TURNS)
        all_history_turn_ids = list(dict.fromkeys(message.turn_id for message in previous_messages if message.turn_id))
        history_turn_ids = all_history_turn_ids[-history_turn_limit:] if history_turn_limit else []
        if history_turn_ids:
            prior_tools = await db.execute(
                select(AIToolCall.name, AIToolCall.summary, AIToolCall.status, AIToolCall.result)
                .join(AIAgentStep, AIAgentStep.id == AIToolCall.step_id)
                .where(AIToolCall.conversation_id == conversation.id, AIAgentStep.turn_id.in_(history_turn_ids))
                .order_by(AIAgentStep.step_index, AIToolCall.call_index)
            )
            tool_history = [
                {"name": name, "summary": summary, "status": status, "result": result}
                for name, summary, status, result in prior_tools.all()
            ]
            if tool_history:
                history_context += "\n\nРезультаты инструментов недавних ходов:\n" + mark_untrusted_text(json.dumps(tool_history, ensure_ascii=False, default=str), "tool_history", settings.AI_TOOL_RESULT_MAX_CHARS)
        pending_actions = []
        tool_call_cards = []
        if agent_context.project_id or agent_context.organization_id:
            github_enabled = False
            can_edit_project = False
            can_edit_tasks = False
            can_manage_members = False
            if proj:
                github_result = await db.execute(select(ProjectIntegration).where(ProjectIntegration.project_id == proj.id, ProjectIntegration.provider == "github"))
                github_integration = github_result.scalar_one_or_none()
                github_enabled = bool(github_integration and github_integration.token_encrypted)
                agent_context.github_enabled = github_enabled
                member = await get_member_or_fail(db, current_user.id, proj.organization_id)
                permissions = await get_member_permissions(db, member)
                can_edit_project = bool(permissions.get("is_owner") or permissions.get("can_create_projects"))
                can_edit_tasks = await is_project_organizer_or_privileged(db, proj.id, current_user.id, proj.organization_id, "can_edit_tasks")
                can_manage_members = bool(permissions.get("is_owner"))
                agent_context.can_approve_tasks = bool(permissions.get("is_owner") or permissions.get("can_approve_tasks"))
            elif agent_context.organization_id:
                member = await get_member_or_fail(db, current_user.id, agent_context.organization_id)
                permissions = await get_member_permissions(db, member)
                can_edit_project = bool(permissions.get("is_owner") or permissions.get("can_create_projects"))
                can_manage_members = bool(permissions.get("is_owner"))
                can_view_org_analytics = bool(permissions.get("is_owner") or permissions.get("can_view_org_analytics"))
                agent_context.can_view_org_analytics = can_view_org_analytics
            iteration_context = full_context + history_context
            iteration_prompt = prompt
            gemini_contents = None
            for step_index in range(max(1, settings.AI_AGENT_MAX_STEPS)):
                model_result = await run_agent(llm_client, api_key, iteration_prompt, iteration_context, True, github_enabled, not bool(agent_context.project_id), can_edit_project, can_edit_tasks, can_manage_members, gemini_contents, response_model)
                reply, tool_calls, response_model, raw_parts = model_result.answer, model_result.tool_calls, model_result.model, model_result.raw_parts
                step = AIAgentStep(conversation_id=conversation.id, turn_id=turn_id, step_index=step_index, model=response_model, raw_parts=raw_parts)
                db.add(step)
                await db.flush()
                tool_card_start = len(tool_call_cards)
                if tool_calls:
                    for call_index, call in enumerate(tool_calls):
                        name = call.get("name")
                        args = call.get("args") if isinstance(call.get("args"), dict) else {}
                        organization_read_tools = {"list_organization_tasks", "list_organization_members", "get_organization_analytics"}
                        if name != "create_project" and not proj and name not in organization_read_tools:
                            continue
                        if name == "create_project" and req.organization_id and not req.project_id and can_edit_project:
                            title = str(args.get("name", "")).strip()[:200]
                            category = args.get("category", "development")
                            if not title or category not in {"development", "business_analysis", "marketing", "hr", "logistics", "finance", "other"}:
                                continue
                            try:
                                budget = max(0, float(args.get("budget", 0)))
                            except (TypeError, ValueError):
                                continue
                            action = AIToolCall(step_id=step.id, conversation_id=conversation.id, user_id=current_user.id, organization_id=req.organization_id, project_id=None, call_index=call_index, name=name, args={"name": title, "description": str(args.get("description", ""))[:12000], "category": category, "budget": budget}, status="pending_confirmation", risk="write", summary=f"Создать проект «{title}» в выбранной организации", expires_at=datetime.now(timezone.utc) + timedelta(minutes=settings.AI_PENDING_ACTION_TTL_MINUTES))
                            db.add(action)
                            await db.flush()
                            pending_actions.append({"id": str(action.id), "name": name, "summary": action.summary, "status": action.status, "args": action.args})
                            tool_call_cards.append({"id": str(action.id), "name": name, "summary": action.summary, "status": action.status, "args": action.args})
                        elif name == "create_invitation" and req.organization_id and not req.project_id and can_manage_members:
                            from app.schemas.invitation import InvitationCreate
                            try:
                                email = str(InvitationCreate(email=args.get("email", "")).email)
                            except (ValidationError, ValueError, TypeError):
                                continue
                            action = AIToolCall(step_id=step.id, conversation_id=conversation.id, user_id=current_user.id, organization_id=req.organization_id, project_id=None, call_index=call_index, name=name, args={"email": email}, status="pending_confirmation", risk="write", summary=f"Пригласить {email} в выбранную организацию", expires_at=datetime.now(timezone.utc) + timedelta(minutes=settings.AI_PENDING_ACTION_TTL_MINUTES))
                            db.add(action)
                            await db.flush()
                            pending_actions.append({"id": str(action.id), "name": name, "summary": action.summary, "status": action.status, "args": action.args})
                            tool_call_cards.append({"id": str(action.id), "name": name, "summary": action.summary, "status": action.status, "args": action.args})
                        elif name == "create_task" and can_edit_tasks:
                            title = str(args.get("title", "")).strip()[:250]
                            if not title:
                                continue
                            priority = args.get("priority", "medium")
                            if priority not in {"low", "medium", "high", "urgent"}:
                                priority = "medium"
                            action = AIToolCall(
                                step_id=step.id,
                                conversation_id=conversation.id,
                                user_id=current_user.id,
                                organization_id=proj.organization_id,
                                project_id=proj.id,
                                call_index=call_index,
                                name=name,
                                args={"title": title, "description": str(args.get("description", ""))[:4000], "priority": priority},
                                status="pending_confirmation",
                                risk="write",
                                summary=f"Создать задачу «{title}» в проекте «{proj.name}»",
                                expires_at=datetime.now(timezone.utc) + timedelta(minutes=settings.AI_PENDING_ACTION_TTL_MINUTES),
                            )
                            db.add(action)
                            await db.flush()
                            pending_actions.append({"id": str(action.id), "name": action.name, "summary": action.summary, "status": action.status, "args": action.args})
                            tool_call_cards.append({"id": str(action.id), "name": action.name, "summary": action.summary, "status": action.status, "args": action.args})
                        elif name == "update_project" and can_edit_project:
                            allowed = {"name", "description", "category", "budget"}
                            changes = {key: value for key, value in args.items() if key in allowed and value is not None}
                            if not changes:
                                continue
                            if "name" in changes:
                                changes["name"] = str(changes["name"]).strip()[:200]
                                if not changes["name"]:
                                    continue
                            if "description" in changes:
                                changes["description"] = str(changes["description"])[:12000]
                            if "category" in changes and changes["category"] not in {"development", "business_analysis", "marketing", "hr", "logistics", "finance", "other"}:
                                continue
                            if "budget" in changes:
                                try:
                                    changes["budget"] = max(0, float(changes["budget"]))
                                except (TypeError, ValueError):
                                    continue
                            action = AIToolCall(step_id=step.id, conversation_id=conversation.id, user_id=current_user.id, organization_id=proj.organization_id, project_id=proj.id, call_index=call_index, name=name, args=changes, status="pending_confirmation", risk="write", summary=f"Изменить проект «{proj.name}»", expires_at=datetime.now(timezone.utc) + timedelta(minutes=settings.AI_PENDING_ACTION_TTL_MINUTES))
                            db.add(action)
                            await db.flush()
                            pending_actions.append({"id": str(action.id), "name": name, "summary": action.summary, "status": action.status, "args": action.args})
                            tool_call_cards.append({"id": str(action.id), "name": name, "summary": action.summary, "status": action.status, "args": action.args})
                        elif name == "update_task":
                            try:
                                task_id = uuid.UUID(str(args.get("task_id")))
                            except (TypeError, ValueError):
                                continue
                            task = (await db.execute(select(ProjectTask).where(ProjectTask.id == task_id, ProjectTask.project_id == proj.id))).scalar_one_or_none()
                            if not task or (not can_edit_tasks and task.assignee_id != current_user.id):
                                continue
                            allowed = {"title", "description", "priority", "start_date", "due_date"}
                            changes = {key: value for key, value in args.items() if key in allowed and value is not None}
                            if not can_edit_tasks:
                                changes = {key: value for key, value in changes.items() if key in {"start_date", "due_date"}}
                            if not changes:
                                continue
                            if "title" in changes:
                                changes["title"] = str(changes["title"]).strip()[:250]
                                if not changes["title"]:
                                    continue
                            if "description" in changes:
                                changes["description"] = str(changes["description"])[:4000]
                            if "priority" in changes and changes["priority"] not in {"low", "medium", "high", "urgent"}:
                                continue
                            try:
                                for date_key in ("start_date", "due_date"):
                                    if date_key in changes:
                                        changes[date_key] = date.fromisoformat(str(changes[date_key])).isoformat()
                            except ValueError:
                                continue
                            action = AIToolCall(step_id=step.id, conversation_id=conversation.id, user_id=current_user.id, organization_id=proj.organization_id, project_id=proj.id, call_index=call_index, name=name, args={"task_id": str(task.id), **changes}, status="pending_confirmation", risk="write", summary=f"Изменить задачу «{task.title}»", expires_at=datetime.now(timezone.utc) + timedelta(minutes=settings.AI_PENDING_ACTION_TTL_MINUTES))
                            db.add(action)
                            await db.flush()
                            pending_actions.append({"id": str(action.id), "name": name, "summary": action.summary, "status": action.status, "args": action.args})
                            tool_call_cards.append({"id": str(action.id), "name": name, "summary": action.summary, "status": action.status, "args": action.args})
                        elif name in {"complete_task", "review_task"} and proj:
                            try:
                                task_id = uuid.UUID(str(args.get("task_id")))
                            except (TypeError, ValueError):
                                continue
                            task = (await db.execute(select(ProjectTask).where(ProjectTask.id == task_id, ProjectTask.project_id == proj.id))).scalar_one_or_none()
                            if not task:
                                continue
                            if name == "complete_task":
                                can_complete = task.assignee_id == current_user.id or await is_project_organizer_or_privileged(db, proj.id, current_user.id, proj.organization_id, "can_edit_tasks")
                                comment = str(args.get("completion_comment", "")).strip()[:4000]
                                if not can_complete or not comment:
                                    continue
                                summary = f"Отметить задачу «{task.title}» выполненной и добавить отчёт"
                                action_args = {"task_id": str(task.id), "completion_comment": comment}
                            else:
                                if not agent_context.can_approve_tasks or task.status != "completed":
                                    continue
                                approved = args.get("approved") is True
                                comment = str(args.get("approval_comment", "")).strip()[:4000]
                                if not comment:
                                    continue
                                summary = f"{'Принять' if approved else 'Вернуть на доработку'} задачу «{task.title}»: {comment}"
                                action_args = {"task_id": str(task.id), "approved": approved, "approval_comment": comment}
                            action = AIToolCall(step_id=step.id, conversation_id=conversation.id, user_id=current_user.id, organization_id=proj.organization_id, project_id=proj.id, call_index=call_index, name=name, args=action_args, status="pending_confirmation", risk="write", summary=summary, expires_at=datetime.now(timezone.utc) + timedelta(minutes=settings.AI_PENDING_ACTION_TTL_MINUTES))
                            db.add(action)
                            await db.flush()
                            pending_actions.append({"id": str(action.id), "name": name, "summary": action.summary, "status": action.status, "args": action.args})
                            tool_call_cards.append({"id": str(action.id), "name": name, "summary": action.summary, "status": action.status, "args": action.args})
                        elif name == "create_document":
                            title = str(args.get("title", "")).strip()[:200]
                            content = str(args.get("content", ""))[:20000]
                            category = args.get("category", "general")
                            if not title or not content or category not in {"specs", "guidelines", "reports", "general"}:
                                continue
                            action = AIToolCall(step_id=step.id, conversation_id=conversation.id, user_id=current_user.id, organization_id=proj.organization_id, project_id=proj.id, call_index=call_index, name=name, args={"title": title, "content": content, "category": category}, status="pending_confirmation", risk="write", summary=f"Добавить документ «{title}» в базу знаний проекта", expires_at=datetime.now(timezone.utc) + timedelta(minutes=settings.AI_PENDING_ACTION_TTL_MINUTES))
                            db.add(action)
                            await db.flush()
                            pending_actions.append({"id": str(action.id), "name": name, "summary": action.summary, "status": action.status, "args": action.args})
                            tool_call_cards.append({"id": str(action.id), "name": name, "summary": action.summary, "status": action.status, "args": action.args})
                        elif name == "update_document":
                            try:
                                document_id = uuid.UUID(str(args.get("document_id")))
                            except (TypeError, ValueError):
                                continue
                            document = (await db.execute(select(ProjectDocument).where(ProjectDocument.id == document_id, ProjectDocument.project_id == proj.id))).scalar_one_or_none()
                            if not document:
                                continue
                            changes = {key: value for key, value in args.items() if key in {"title", "content", "category"} and value is not None}
                            if not changes:
                                continue
                            if "title" in changes:
                                changes["title"] = str(changes["title"]).strip()[:200]
                                if not changes["title"]:
                                    continue
                            if "content" in changes:
                                changes["content"] = str(changes["content"])[:20000]
                            if "category" in changes and changes["category"] not in {"specs", "guidelines", "reports", "general"}:
                                continue
                            action = AIToolCall(step_id=step.id, conversation_id=conversation.id, user_id=current_user.id, organization_id=proj.organization_id, project_id=proj.id, call_index=call_index, name=name, args={"document_id": str(document.id), **changes}, status="pending_confirmation", risk="write", summary=f"Изменить документ «{document.title}»", expires_at=datetime.now(timezone.utc) + timedelta(minutes=settings.AI_PENDING_ACTION_TTL_MINUTES))
                            db.add(action)
                            await db.flush()
                            pending_actions.append({"id": str(action.id), "name": name, "summary": action.summary, "status": action.status, "args": action.args})
                            tool_call_cards.append({"id": str(action.id), "name": name, "summary": action.summary, "status": action.status, "args": action.args})
                        elif name == "list_project_tasks":
                            result = await list_project_tasks(agent_context)
                            tool_result = AIToolCall(step_id=step.id, conversation_id=conversation.id, user_id=current_user.id, organization_id=proj.organization_id, project_id=proj.id, call_index=call_index, name=name, args={}, result={"tasks": result}, status="ok", risk="read", summary="Список задач проекта")
                            db.add(tool_result)
                            tool_call_cards.append({"name": name, "summary": "Список задач проекта", "status": "ok", "result": {"tasks": result}})
                            if not reply:
                                reply = "Задачи выбранного проекта:\n" + ("\n".join(f"• {task['title']} — {task['status']}, приоритет {task['priority']}" for task in result) or "Задач пока нет.")
                        elif name == "get_project_analytics":
                            analytics = await get_project_analytics(agent_context)
                            db.add(AIToolCall(step_id=step.id, conversation_id=conversation.id, user_id=current_user.id, organization_id=proj.organization_id, project_id=proj.id, call_index=call_index, name=name, args={}, result=analytics, status="ok", risk="read", summary="Сводка показателей проекта"))
                            tool_call_cards.append({"name": name, "summary": "Сводка показателей проекта", "status": "ok", "result": analytics})
                            if not reply:
                                reply = "Сводные показатели проекта:\n" + "\n".join(f"• {key}: {value}" for key, value in analytics.items())
                        elif name == "list_organization_tasks" and agent_context.organization_id and not agent_context.project_id:
                            result = await list_organization_tasks(agent_context)
                            db.add(AIToolCall(step_id=step.id, conversation_id=conversation.id, user_id=current_user.id, organization_id=agent_context.organization_id, call_index=call_index, name=name, args={}, result={"tasks": result}, status="ok", risk="read", summary="Задачи проектов организации"))
                            tool_call_cards.append({"name": name, "summary": "Задачи проектов организации", "status": "ok", "result": {"tasks": result}})
                        elif name == "list_organization_members" and agent_context.organization_id:
                            result = await list_organization_members(agent_context)
                            db.add(AIToolCall(step_id=step.id, conversation_id=conversation.id, user_id=current_user.id, organization_id=agent_context.organization_id, call_index=call_index, name=name, args={}, result={"members": result}, status="ok", risk="read", summary="Сотрудники организации"))
                            tool_call_cards.append({"name": name, "summary": "Сотрудники организации", "status": "ok", "result": {"members": result}})
                        elif name == "get_organization_analytics" and agent_context.organization_id and agent_context.can_view_org_analytics:
                            result = await get_organization_analytics(agent_context)
                            db.add(AIToolCall(step_id=step.id, conversation_id=conversation.id, user_id=current_user.id, organization_id=agent_context.organization_id, call_index=call_index, name=name, args={}, result=result, status="ok", risk="read", summary="Аналитика организации"))
                            tool_call_cards.append({"name": name, "summary": "Аналитика организации", "status": "ok", "result": result})
                        elif name in GITHUB_TOOL_ALLOWLIST:
                            if not github_enabled:
                                continue
                            github_data = await call_github_tool(agent_context, name, args)
                            operation = GITHUB_TOOL_ALLOWLIST[name]
                            stored_result = {"source": "github", "untrusted": True, "data": github_data.get("data"), "error": github_data.get("error")}
                            stored_args = {"path": str(args.get("path", ""))[:500]} if operation == "file" else {"query": str(args.get("query", ""))[:300]} if operation.startswith("search_") else {}
                            db.add(AIToolCall(step_id=step.id, conversation_id=conversation.id, user_id=current_user.id, organization_id=proj.organization_id, project_id=proj.id, call_index=call_index, name=name, args=stored_args, result=stored_result, status="error" if github_data.get("error") else "ok", risk="read", summary="Чтение GitHub", error_code=github_data.get("error")))
                            tool_call_cards.append({"name": name, "summary": "Чтение GitHub", "status": "error" if github_data.get("error") else "ok", "result": stored_result})
                            safe_result = json.dumps(github_data, ensure_ascii=False)[:settings.AI_TOOL_RESULT_MAX_CHARS]
                            if not reply:
                                reply = "Результат GitHub приведён ниже как недоверенные данные.\n" + safe_result
                handled_counts = Counter(card.get("name") for card in tool_call_cards[tool_card_start:])
                for call_index, call in enumerate(tool_calls):
                    name = call.get("name") if isinstance(call, dict) else None
                    if name and handled_counts[name]:
                        handled_counts[name] -= 1
                        continue
                    safe_name = str(name or "unknown")[:100]
                    error_result = {"error": "invalid_arguments_or_unavailable"}
                    action = AIToolCall(
                        step_id=step.id,
                        conversation_id=conversation.id,
                        user_id=current_user.id,
                        organization_id=agent_context.organization_id,
                        project_id=agent_context.project_id,
                        call_index=call_index,
                        name=safe_name,
                        args=call.get("args") if isinstance(call, dict) and isinstance(call.get("args"), dict) else {},
                        result=error_result,
                        status="error",
                        risk="write" if safe_name in {"create_project", "create_invitation", "create_task", "update_project", "update_task", "create_document", "update_document"} else "read",
                        summary=f"Не удалось выполнить вызов инструмента «{safe_name}»",
                        error_code="invalid_arguments_or_unavailable",
                    )
                    db.add(action)
                    tool_call_cards.append({"name": safe_name, "summary": action.summary, "status": "error", "result": error_result})
                await db.flush()
                if pending_actions and not reply:
                    reply = "Подготовил действие. Оно будет выполнено после подтверждения."
                if tool_calls and not pending_actions and not reply:
                    reply = "Инструмент выполнен."
                if not reply:
                    reply = "Не удалось сформировать ответ по результатам вызова инструмента."
                if pending_actions or not tool_calls:
                    break
                if step_index + 1 >= max(1, settings.AI_AGENT_MAX_STEPS):
                    reply = (reply + "\n\n" if reply else "") + "Достигнут лимит шагов агента; полученные результаты сохранены."
                    break
                persisted_calls = await db.execute(select(AIToolCall).where(AIToolCall.step_id == step.id).order_by(AIToolCall.call_index))
                step_cards = [{"name": item.name, "result": item.result, "status": item.status} for item in persisted_calls.scalars().all()]
                initial_tool_text = f"{iteration_context}\n\nЗапрос пользователя: {prompt}"
                gemini_contents = append_tool_exchange(gemini_contents, initial_tool_text, raw_parts, tool_calls, step_cards)
                iteration_prompt = prompt
        else:
            model_result = await run_agent(llm_client, api_key, prompt, full_context + history_context, False)
            reply = model_result.answer
        message_count = await db.scalar(select(func.count()).select_from(AIConversationMessage).where(AIConversationMessage.conversation_id == conversation.id))
        if message_count == 0 and conversation.title.startswith("Диалог "):
            words = prompt.split()
            conversation.title = " ".join(words[:3])[:200] or conversation.title
        await add_message(db, conversation, "user", prompt, settings.AI_HISTORY_MAX_LIMIT, turn_id=turn_id)
        await add_message(db, conversation, "assistant", reply, settings.AI_HISTORY_MAX_LIMIT, turn_id=turn_id, model=response_model)

        return {
            "answer": reply,
            "prompt": prompt,
            "actions": pending_actions,
            "tool_calls": tool_call_cards,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Внутренняя ошибка сервиса советника")
        raise HTTPException(status_code=500, detail="Внутренняя ошибка сервиса советника.") from e
