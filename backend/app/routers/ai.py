import os
import json
import asyncio
import ssl
import urllib.request
import urllib.error
import uuid
from typing import Optional, Any
from pydantic import BaseModel
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
from app.routers.ai_conversations import owned_conversation, add_message
from app.utils.permissions import get_member_or_fail

router = APIRouter(prefix="/api/ai", tags=["ai"])

SYSTEM_INSTRUCTION = (
    "Вы — единый интеллектуальный AI-ассистент и советник руководства платформы 'Soprano'. "
    "Ваш тон: предельно официальный, строгий, бескомпромиссный, сдержанный и вежливый. "
    "Язык ответа: исключительно русский. "
    "Никакой фамильярности, пустословия или неуверенности. "
    "Вы понимаете контекст всей организации или выбранного проекта, анализируете документацию проекта (RAG), "
    "оцениваете статистику и риски, планируете последовательность действий и предлагаете конкретные решения. "
    "Если пользователь просит создать задачу или спланировать действие, сформулируйте чёткий план и директиву. "
    "Для критических/важных операций (удаление, смена статуса проекта, крупные затраты) обязательно явно запрашивайте подтверждение руководства."
)


class AskAIRequest(BaseModel):
    prompt: str
    conversation_id: uuid.UUID
    organization_id: Optional[uuid.UUID] = None
    project_id: Optional[uuid.UUID] = None
    context: Optional[str] = None
    api_key: Optional[str] = None


def _get_ssl_context() -> ssl.SSLContext:
    try:
        import certifi
        return ssl.create_default_context(cafile=certifi.where())
    except Exception:
        pass
    try:
        ctx = ssl.create_default_context()
        ctx.load_default_certs()
        return ctx
    except Exception:
        pass
    return ssl._create_unverified_context()


def _get_supported_models(api_key: str, ssl_ctx: ssl.SSLContext) -> list[str]:
    """
    Получает список доступных моделей для переданного ключа Gemini API
    и сортирует их с наивысшим приоритетом для версий flash-lite (3.5, 2.5, 2.0).
    """
    discovered_models = []
    try:
        list_url = f"https://generativelanguage.googleapis.com/v1beta/models?key={api_key}"
        req = urllib.request.Request(list_url, headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=10, context=ssl_ctx) as response:
            res_data = json.loads(response.read().decode("utf-8"))
            for m in res_data.get("models", []):
                methods = m.get("supportedGenerationMethods", [])
                if "generateContent" in methods:
                    name = m.get("name", "").replace("models/", "")
                    if name:
                        discovered_models.append(name)
    except Exception:
        pass

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
        return discovered_models

    return [
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
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
        req_data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=req_data,
            headers={"Content-Type": "application/json"},
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
            err_msg = e.read().decode("utf-8", errors="ignore")
            last_error = f"HTTP {e.code} ({model}): {err_msg}"
            if e.code in (400, 403):
                try:
                    err_json = json.loads(err_msg)
                    detail = err_json.get("error", {}).get("message", last_error)
                    raise HTTPException(status_code=400, detail=f"Ошибка Gemini API: {detail}")
                except (json.JSONDecodeError, KeyError):
                    raise HTTPException(status_code=400, detail=f"Ошибка Gemini API: {last_error}")
            continue
        except Exception as e:
            last_error = f"{model}: {str(e)}"
            continue

    raise HTTPException(status_code=502, detail=f"Не удалось получить ответ от Gemini API: {last_error}")


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
    history_result = await db.execute(
        select(AIConversationMessage)
        .where(AIConversationMessage.conversation_id == conversation.id)
        .order_by(AIConversationMessage.created_at.desc(), AIConversationMessage.id.desc())
        .limit(settings.ai_history_limit)
    )
    previous_messages = list(reversed(history_result.scalars().all()))

    # 1. Сбор контекста организации и проектов (RAG и системный контекст)
    context_parts = []

    if req.project_id:
        p_res = await db.execute(select(Project).where(Project.id == req.project_id))
        proj = p_res.scalar_one_or_none()
        if proj:
            await get_member_or_fail(db, current_user.id, proj.organization_id)
            context_parts.append(
                f"[Контекст текущего проекта]:\n"
                f"Название проекта: {proj.name}\n"
                f"Категория: {proj.category}\n"
                f"Статус: {proj.status}\n"
                f"Бюджет: {proj.budget} ₽\n"
                f"Описание: {proj.description or 'не указано'}"
            )

            # Задачи проекта
            tasks_res = await db.execute(
                select(ProjectTask).where(ProjectTask.project_id == proj.id).limit(20)
            )
            tasks = tasks_res.scalars().all()
            if tasks:
                t_list = [
                    f"- '{t.title}' [статус: {t.status}, приоритет: {t.priority}, дедлайн: {t.due_date}]"
                    for t in tasks
                ]
                context_parts.append("[Задачи проекта]:\n" + "\n".join(t_list))

            # Документация проекта (RAG поиск по ключевым словам)
            docs_res = await db.execute(
                select(ProjectDocument).where(ProjectDocument.project_id == proj.id).limit(10)
            )
            docs = docs_res.scalars().all()
            if docs:
                d_list = [f"Документ '{d.title}' ({d.category}):\n{d.content[:400]}" for d in docs]
                context_parts.append("[База знаний и документация проекта]:\n" + "\n---\n".join(d_list))

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

            # Список проектов организации
            pr_res = await db.execute(select(Project).where(Project.organization_id == org.id))
            pr_list = pr_res.scalars().all()
            if pr_list:
                p_names = [f"- {p.name} (категория: {p.category}, статус: {p.status})" for p in pr_list]
                context_parts.append("[Проекты организации]:\n" + "\n".join(p_names))

    if req.context:
        context_parts.append(f"[Дополнительный контекст]:\n{req.context}")

    full_context = "\n\n".join(context_parts) if context_parts else "Контекст организации: платформа Soprano."

    try:
        history_context = "\n\n[Предыдущая переписка этого диалога]:\n" + "\n".join(
            f"{'Пользователь' if message.role == 'user' else 'Советник'}: {message.content}"
            for message in previous_messages
        ) if previous_messages else ""
        reply = await asyncio.to_thread(_call_gemini_api, api_key, prompt, full_context + history_context)
        message_count = await db.scalar(select(func.count()).select_from(AIConversationMessage).where(AIConversationMessage.conversation_id == conversation.id))
        if message_count == 0 and conversation.title.startswith("Диалог "):
            words = prompt.split()
            conversation.title = " ".join(words[:3])[:200] or conversation.title
        await add_message(db, conversation, "user", prompt, settings.AI_HISTORY_MAX_LIMIT)
        await add_message(db, conversation, "assistant", reply, settings.AI_HISTORY_MAX_LIMIT)

        # Детекция предложенного действия (Action Proposal)
        suggested_action = None
        lower_prompt = prompt.lower()
        if any(w in lower_prompt for w in ["создай задачу", "добавь задачу", "создать задачу", "поставь задачу"]) and req.project_id:
            suggested_action = {
                "type": "create_task",
                "label": "Создать задачу в проекте",
                "project_id": str(req.project_id),
                "requires_confirmation": False
            }
        elif any(w in lower_prompt for w in ["удали", "удалить", "очисти", "заблокируй", "закрыть проект"]):
            suggested_action = {
                "type": "sensitive_operation",
                "label": "Требуется подтверждение важной операции",
                "requires_confirmation": True
            }

        return {
            "answer": reply,
            "prompt": prompt,
            "suggested_action": suggested_action,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Внутренняя ошибка сервиса советника: {str(e)}")
