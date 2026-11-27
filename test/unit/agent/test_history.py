import uuid
from types import SimpleNamespace
from app.agent.history import build_history, history_as_text


def test_history_keeps_complete_recent_turns_and_starts_with_user():
    first_turn = uuid.uuid4()
    second_turn = uuid.uuid4()
    rows = [
        SimpleNamespace(id=uuid.uuid4(), turn_id=first_turn, role="user", content="Вопрос 1", model=None),
        SimpleNamespace(id=uuid.uuid4(), turn_id=first_turn, role="assistant", content="Ответ 1", model="model-a"),
        SimpleNamespace(id=uuid.uuid4(), turn_id=second_turn, role="user", content="Вопрос 2", model=None),
        SimpleNamespace(id=uuid.uuid4(), turn_id=second_turn, role="assistant", content="Ответ 2", model="model-b"),
        SimpleNamespace(id=uuid.uuid4(), turn_id=uuid.uuid4(), role="assistant", content="Осиротевший ответ", model="model-b"),
    ]
    result = build_history(rows, 1)
    assert [item["content"] for item in result] == ["Вопрос 2", "Ответ 2"]
    assert result[0]["role"] == "user"
    assert "model-b" in history_as_text(result)


def test_history_pairs_legacy_messages_without_turn_ids():
    rows = [
        SimpleNamespace(id=uuid.uuid4(), turn_id=None, role="user", content="Вопрос", model=None),
        SimpleNamespace(id=uuid.uuid4(), turn_id=None, role="assistant", content="Ответ", model=None),
    ]
    assert [item["role"] for item in build_history(rows, 5)] == ["user", "assistant"]
