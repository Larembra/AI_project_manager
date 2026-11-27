from pydantic import BaseModel, Field
from app.agent.tools.registry import tool


class CreateInvitationArgs(BaseModel):
    email: str = Field(min_length=3, max_length=320)


@tool("create_invitation", "Предлагает пригласить сотрудника в выбранную организацию с обычной ролью. Требует подтверждения.", CreateInvitationArgs, "write", lambda context: context.organization_id is not None and context.project_id is None and context.can_manage_members)
async def create_invitation_tool(_context, arguments: CreateInvitationArgs) -> dict:
    return {"status": "pending_confirmation", "args": arguments.model_dump()}
