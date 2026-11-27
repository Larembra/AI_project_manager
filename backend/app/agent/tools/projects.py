from pydantic import BaseModel, Field
from typing import Literal
from app.agent.tools.registry import tool


class CreateProjectArgs(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=12000)
    category: Literal["development", "business_analysis", "marketing", "hr", "logistics", "finance", "other"] = "development"
    budget: float = Field(default=0, ge=0)


class UpdateProjectArgs(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=12000)
    category: Literal["development", "business_analysis", "marketing", "hr", "logistics", "finance", "other"] | None = None
    budget: float | None = Field(default=None, ge=0)


async def _propose(_context, arguments: BaseModel) -> dict:
    return {"status": "pending_confirmation", "args": arguments.model_dump(exclude_none=True)}


@tool("create_project", "Предлагает создать проект в выбранной организации. Требует подтверждения.", CreateProjectArgs, "write", lambda context: context.organization_id is not None and context.project_id is None and context.can_edit_project)
async def create_project_tool(context, arguments: CreateProjectArgs) -> dict:
    return await _propose(context, arguments)


@tool("update_project", "Предлагает изменить поля выбранного проекта. Требует подтверждения.", UpdateProjectArgs, "write", lambda context: context.project_id is not None and context.can_edit_project)
async def update_project_tool(context, arguments: UpdateProjectArgs) -> dict:
    return await _propose(context, arguments)
