from app.agent.runner import append_tool_exchange


def test_tool_exchange_keeps_raw_parts_and_function_call_signature():
    raw_parts = [{"functionCall": {"name": "list_project_tasks", "id": "call-1", "args": {}}, "thoughtSignature": "signature-value"}]
    contents = append_tool_exchange(
        None,
        "Исходный запрос",
        raw_parts,
        [{"name": "list_project_tasks", "id": "call-1", "args": {}}],
        [{"result": {"tasks": []}}],
    )
    assert contents[1]["parts"] is raw_parts
    assert contents[1]["parts"][0]["thoughtSignature"] == "signature-value"
    assert contents[2]["parts"] == [{"functionResponse": {"name": "list_project_tasks", "id": "call-1", "response": {"result": {"tasks": []}}}}]
    next_contents = append_tool_exchange(
        contents,
        "Исходный запрос",
        [{"text": "Готовый ответ"}],
        [],
        [],
    )
    assert next_contents[1] is contents[1]
    assert next_contents[-1]["parts"] == []
