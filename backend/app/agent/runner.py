import asyncio
from dataclasses import dataclass
from app.agent.llm.base import LLMClient


@dataclass(slots=True)
class AgentModelResult:
    answer: str
    tool_calls: list[dict]
    model: str | None
    raw_parts: list[dict]


def append_tool_exchange(contents: list[dict] | None, initial_text: str, raw_parts: list[dict], tool_calls: list[dict], results: list[dict]) -> list[dict]:
    conversation = list(contents) if contents is not None else [{"role": "user", "parts": [{"text": initial_text}]}]
    response_parts = []
    for index, call in enumerate(tool_calls):
        result = results[index] if index < len(results) else None
        response = {"result": result.get("result")} if result and result.get("result") is not None else {"error": "tool_not_available"}
        function_response = {"name": call.get("name", "unknown"), "response": response}
        if call.get("id"):
            function_response["id"] = call["id"]
        response_parts.append({"functionResponse": function_response})
    conversation.extend([
        {"role": "model", "parts": raw_parts},
        {"role": "user", "parts": response_parts},
    ])
    return conversation


async def run_agent(client: LLMClient, api_key: str, prompt: str, context: str, use_tools: bool, github_enabled: bool = False, organization_only: bool = False, can_edit_project: bool = True, can_edit_tasks: bool = True, can_manage_members: bool = True, contents: list[dict] | None = None, preferred_model: str | None = None) -> AgentModelResult:
    if use_tools:
        answer, calls, model, raw_parts = await asyncio.to_thread(client.generate_with_tools, api_key, prompt, context, github_enabled, organization_only, can_edit_project, can_edit_tasks, can_manage_members, contents, preferred_model)
        return AgentModelResult(answer=answer, tool_calls=calls, model=model, raw_parts=raw_parts)
    answer = await asyncio.to_thread(client.generate_text, api_key, prompt, context)
    return AgentModelResult(answer=answer, tool_calls=[], model=None, raw_parts=[])
