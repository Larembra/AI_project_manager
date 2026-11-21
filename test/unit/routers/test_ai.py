import pytest
from unittest.mock import patch
from fastapi import HTTPException
from app.routers.ai import ask_advisor, AskAIRequest
from test.factories import make_user


@pytest.mark.asyncio
async def test_ask_ai_empty_prompt():
    user = make_user()
    req = AskAIRequest(prompt="   ")
    with pytest.raises(HTTPException) as exc_info:
        await ask_advisor(req=req, current_user=user)
    assert exc_info.value.status_code == 400
    assert "не может быть пустым" in exc_info.value.detail


@pytest.mark.asyncio
async def test_ask_ai_missing_key():
    user = make_user()
    req = AskAIRequest(prompt="Как повысить дисциплину?")
    with patch("app.routers.ai.settings.GEMINI_API_KEY", ""), patch.dict("os.environ", {}, clear=True):
        with pytest.raises(HTTPException) as exc_info:
            await ask_advisor(req=req, current_user=user)
        assert exc_info.value.status_code == 400
        assert "Gemini API не настроен" in exc_info.value.detail


@pytest.mark.asyncio
async def test_ask_ai_success():
    user = make_user()
    req = AskAIRequest(prompt="Как сократить расходы?", api_key="test_key_123")
    with patch("app.routers.ai._call_gemini_api", return_value="1. Сократить нецелевой бюджет.\n2. Усилить ревизию."):
        res = await ask_advisor(req=req, current_user=user)
        assert res["prompt"] == "Как сократить расходы?"
        assert "Сократить нецелевой бюджет" in res["answer"]


def test_flash_lite_model_priority():
    import ssl
    from app.routers.ai import _get_supported_models
    ctx = ssl._create_unverified_context()
    models = _get_supported_models("invalid_key", ctx)
    # Ensure flash-lite models are prioritized first and gemini-pro is not in list
    assert "gemini-3.5-flash-lite" in models[0] or "flash-lite" in models[0]
    assert "gemini-pro" not in models
