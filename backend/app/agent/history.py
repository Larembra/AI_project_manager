from collections import OrderedDict


def build_history(messages, limit: int) -> list[dict[str, str | None]]:
    turns: OrderedDict[str, list] = OrderedDict()
    legacy_index = 0
    open_legacy_turn = None
    for message in messages:
        if message.role not in {"user", "assistant"}:
            continue
        if message.turn_id:
            key = str(message.turn_id)
        elif message.role == "user":
            legacy_index += 1
            open_legacy_turn = f"legacy-{legacy_index}"
            key = open_legacy_turn
        elif open_legacy_turn:
            key = open_legacy_turn
            open_legacy_turn = None
        else:
            continue
        turns.setdefault(key, []).append(message)
    complete = []
    for turn in turns.values():
        users = [message for message in turn if message.role == "user"]
        assistants = [message for message in turn if message.role == "assistant"]
        if users and assistants:
            complete.append((users[-1], assistants[-1]))
    result = []
    for user, assistant in complete[-max(1, limit):]:
        result.append({"role": "user", "content": user.content, "model": user.model})
        result.append({"role": "assistant", "content": assistant.content, "model": assistant.model})
    return result


def history_as_text(history: list[dict[str, str | None]]) -> str:
    return "\n".join(f"{'Пользователь' if item['role'] == 'user' else 'Советник'}{' (' + item['model'] + ')' if item['model'] else ''}: {item['content']}" for item in history)
