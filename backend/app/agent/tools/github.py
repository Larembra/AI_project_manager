import asyncio
from sqlalchemy import select
from app.agent.context import AgentContext
from app.models.project_integration import ProjectIntegration
from app.services.github import read_github_resource
from pydantic import BaseModel, Field
from app.agent.tools.registry import tool


GITHUB_TOOL_ALLOWLIST = {
    "github_read_file": "file",
    "github_list_issues": "issues",
    "github_search_issues": "search_issues",
    "github_list_pull_requests": "pull_requests",
    "github_search_pull_requests": "search_pull_requests",
    "github_list_commits": "commits",
    "github_search_code": "search_code",
}


class GitHubFileArgs(BaseModel):
    path: str = Field(min_length=1, max_length=500)


class NoArguments(BaseModel):
    pass


class SearchArgs(BaseModel):
    query: str = Field(min_length=1, max_length=300)


async def call_github_tool(context: AgentContext, name: str, arguments: dict) -> dict:
    operation = GITHUB_TOOL_ALLOWLIST.get(name)
    if not operation or not context.project_id:
        return {"source": "github", "untrusted": True, "error": "tool_not_available"}
    result = await context.db.execute(select(ProjectIntegration).where(ProjectIntegration.project_id == context.project_id, ProjectIntegration.provider == "github"))
    integration = result.scalar_one_or_none()
    if not integration or not integration.token_encrypted:
        return {"source": "github", "untrusted": True, "error": "integration_not_configured"}
    value = arguments.get("path", arguments.get("query", ""))
    return await asyncio.to_thread(read_github_resource, integration.token_encrypted, integration.repo_owner, integration.repo_name, operation, str(value)[:500])


@tool("github_read_file", "Читает файл по пути из привязанного репозитория.", GitHubFileArgs, "read", lambda context: context.project_id is not None and context.github_enabled)
async def read_file_tool(context: AgentContext, arguments: dict) -> dict:
    return await call_github_tool(context, "github_read_file", arguments)


@tool("github_list_issues", "Показывает issues привязанного репозитория.", NoArguments, "read", lambda context: context.project_id is not None and context.github_enabled)
async def list_issues_tool(context: AgentContext, arguments: dict | None = None) -> dict:
    return await call_github_tool(context, "github_list_issues", arguments or {})


@tool("github_list_pull_requests", "Показывает pull requests привязанного репозитория.", NoArguments, "read", lambda context: context.project_id is not None and context.github_enabled)
async def list_pull_requests_tool(context: AgentContext, arguments: dict | None = None) -> dict:
    return await call_github_tool(context, "github_list_pull_requests", arguments or {})


@tool("github_search_issues", "Ищет issues только в привязанном репозитории.", SearchArgs, "read", lambda context: context.project_id is not None and context.github_enabled)
async def search_issues_tool(context: AgentContext, arguments: dict) -> dict:
    return await call_github_tool(context, "github_search_issues", arguments)


@tool("github_search_pull_requests", "Ищет pull requests только в привязанном репозитории.", SearchArgs, "read", lambda context: context.project_id is not None and context.github_enabled)
async def search_pull_requests_tool(context: AgentContext, arguments: dict) -> dict:
    return await call_github_tool(context, "github_search_pull_requests", arguments)


@tool("github_list_commits", "Показывает последние коммиты привязанного репозитория.", NoArguments, "read", lambda context: context.project_id is not None and context.github_enabled)
async def list_commits_tool(context: AgentContext, arguments: dict | None = None) -> dict:
    return await call_github_tool(context, "github_list_commits", arguments or {})


@tool("github_search_code", "Ищет код только в привязанном репозитории.", SearchArgs, "read", lambda context: context.project_id is not None and context.github_enabled)
async def search_code_tool(context: AgentContext, arguments: dict) -> dict:
    return await call_github_tool(context, "github_search_code", arguments)
