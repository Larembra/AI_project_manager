import ssl
import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
import pytest
from fastapi import HTTPException
from app.routers.ai import ask_advisor, AskAIRequest, _get_supported_models
from test.factories import make_user
from test.fakes import FakeAsyncSession, FakeResult


@pytest.mark.asyncio
async def test_ask_ai_empty_prompt():
    request = AskAIRequest(prompt="   ", conversation_id=uuid.uuid4())
    with pytest.raises(HTTPException) as error:
        await ask_advisor(req=request, current_user=make_user())
    assert error.value.status_code == 400
    assert "не может быть пустым" in error.value.detail


@pytest.mark.asyncio
async def test_ask_ai_missing_key():
    request = AskAIRequest(prompt="Как повысить дисциплину?", conversation_id=uuid.uuid4())
    with patch("app.routers.ai.settings.GEMINI_API_KEY", ""), patch.dict("os.environ", {}, clear=True):
        with pytest.raises(HTTPException) as error:
            await ask_advisor(req=request, current_user=make_user())
    assert error.value.status_code == 400
    assert "Gemini API не настроен" in error.value.detail


@pytest.mark.asyncio
async def test_ask_ai_success_without_network():
    user = make_user()
    request = AskAIRequest(prompt="Как сократить расходы?", conversation_id=uuid.uuid4(), api_key="test_key_123")
    conversation = SimpleNamespace(id=request.conversation_id, title="Диалог 1")
    db = FakeAsyncSession(results=[FakeResult(scalars=[]), FakeResult(scalars=[]), FakeResult(scalars=[])])
    db.scalar = AsyncMock(return_value=0)
    with patch("app.routers.ai.owned_conversation", new=AsyncMock(return_value=conversation)), patch("app.routers.ai.llm_client.generate_text", return_value="Сократить нецелевой бюджет."):
        result = await ask_advisor(req=request, current_user=user, db=db)
    assert result["prompt"] == "Как сократить расходы?"
    assert "Сократить нецелевой бюджет" in result["answer"]


def test_flash_lite_model_priority_uses_fallback_without_network(monkeypatch):
    import app.routers.ai as ai
    ai._MODEL_CACHE.clear()

    def fail_request(*args, **kwargs):
        raise OSError("offline")

    monkeypatch.setattr(ai.urllib.request, "urlopen", fail_request)
    models = _get_supported_models("test-key", ssl.create_default_context())
    assert "flash-lite" in models[0]
    assert "gemini-pro" not in models
