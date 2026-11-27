from dataclasses import dataclass
from typing import Any, Callable
from pydantic import BaseModel
from app.agent.tools.schema import pydantic_to_gemini_schema


@dataclass(frozen=True, slots=True)
class ToolSpec:
    name: str
    description: str
    args_model: type[BaseModel]
    risk: str
    handler: Callable[..., Any]
    visibility: Callable[[Any], bool]

    def gemini_declaration(self) -> dict:
        return {"name": self.name, "description": self.description, "parameters": pydantic_to_gemini_schema(self.args_model)}


_TOOLS: dict[str, ToolSpec] = {}


def tool(name: str, description: str, args_model: type[BaseModel], risk: str, visible_for: Callable[[Any], bool] | None = None):
    def register(handler: Callable[..., Any]):
        if name in _TOOLS:
            raise ValueError(f"Tool already registered: {name}")
        _TOOLS[name] = ToolSpec(name=name, description=description, args_model=args_model, risk=risk, handler=handler, visibility=visible_for or (lambda _ctx: True))
        return handler
    return register


def visible_tools(context: Any) -> list[ToolSpec]:
    return [spec for spec in _TOOLS.values() if spec.visibility(context)]
