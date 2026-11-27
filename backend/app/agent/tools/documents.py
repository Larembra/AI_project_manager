from pydantic import BaseModel, Field
from typing import Literal
from app.agent.tools.registry import tool


class CreateDocumentArgs(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    content: str = Field(min_length=1, max_length=20000)
    category: Literal["specs", "guidelines", "reports", "general"] = "general"


class UpdateDocumentArgs(BaseModel):
    document_id: str = Field(min_length=1, max_length=36)
    title: str | None = Field(default=None, min_length=1, max_length=200)
    content: str | None = Field(default=None, max_length=20000)
    category: Literal["specs", "guidelines", "reports", "general"] | None = None


async def _propose(_context, arguments: BaseModel) -> dict:
    return {"status": "pending_confirmation", "args": arguments.model_dump(exclude_none=True)}


@tool("create_document", "Предлагает добавить документ в базу знаний выбранного проекта. Требует подтверждения.", CreateDocumentArgs, "write", lambda context: context.project_id is not None)
async def create_document_tool(context, arguments: CreateDocumentArgs) -> dict:
    return await _propose(context, arguments)


@tool("update_document", "Предлагает изменить документ выбранного проекта. Требует подтверждения.", UpdateDocumentArgs, "write", lambda context: context.project_id is not None)
async def update_document_tool(context, arguments: UpdateDocumentArgs) -> dict:
    return await _propose(context, arguments)
