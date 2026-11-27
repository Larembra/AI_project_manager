from pydantic import BaseModel, Field
from app.agent.tools.schema import pydantic_to_gemini_schema
from app.agent.context import AgentContext
from app.agent.tools.registry import visible_tools
from app.agent.tools import tasks as task_tools
from app.agent.tools import github as github_tools
from app.agent.tools import projects as project_tools
from app.agent.tools import documents as document_tools
from app.agent.tools import members as member_tools


class NestedArgs(BaseModel):
    label: str = Field(description="Название")


class ToolArgs(BaseModel):
    title: str = Field(min_length=1, max_length=100)
    priority: str = Field(default="medium", description="Приоритет")
    nested: NestedArgs
    tags: list[str] = Field(default_factory=list)


def test_pydantic_schema_converts_for_gemini():
    schema = pydantic_to_gemini_schema(ToolArgs)
    assert schema["type"] == "OBJECT"
    assert schema["properties"]["title"]["type"] == "STRING"
    assert schema["properties"]["nested"]["properties"]["label"]["description"] == "Название"
    assert schema["properties"]["tags"]["items"]["type"] == "STRING"
    assert set(schema["required"]) == {"title", "nested"}


def test_tool_registry_filters_by_agent_context():
    user = object()
    db = object()
    without_project = AgentContext(user=user, db=db, conversation_id="conversation")
    with_project = AgentContext(user=user, db=db, conversation_id="conversation", project_id="project")
    with_github = AgentContext(user=user, db=db, conversation_id="conversation", project_id="project", github_enabled=True)
    with_editor = AgentContext(user=user, db=db, conversation_id="conversation", organization_id="organization", project_id="project", github_enabled=True, can_edit_project=True, can_edit_tasks=True)
    organization_owner = AgentContext(user=user, db=db, conversation_id="conversation", organization_id="organization", can_edit_project=True, can_manage_members=True)
    assert {spec.name for spec in visible_tools(without_project)} == set()
    assert {spec.name for spec in visible_tools(with_project)} == {"list_project_tasks", "get_project_analytics", "update_task", "create_document", "update_document"}
    github_tools = {"github_read_file", "github_list_issues", "github_search_issues", "github_list_pull_requests", "github_search_pull_requests", "github_list_commits", "github_search_code"}
    assert {spec.name for spec in visible_tools(with_github)} == {"list_project_tasks", "get_project_analytics", "update_task", "create_document", "update_document"} | github_tools
    assert {spec.name for spec in visible_tools(with_editor)} == {"list_project_tasks", "get_project_analytics", "update_task", "create_task", "update_project", "create_document", "update_document"} | github_tools
    assert {spec.name for spec in visible_tools(organization_owner)} == {"create_project", "create_invitation"}
