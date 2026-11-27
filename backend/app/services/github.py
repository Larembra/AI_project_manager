import re
from cryptography.exceptions import InvalidTag
from app.config import settings
from app.agent.mcp.client import MCPClientError, call_github_tool
from app.services.integrations import decrypt_token


MAX_RESULT_LENGTH = max(1, settings.AI_TOOL_RESULT_MAX_CHARS)


def read_github_resource(token_encrypted: str, owner: str, repository: str, operation: str, query: str = "") -> dict:
    try:
        token = decrypt_token(token_encrypted)
    except (InvalidTag, ValueError, UnicodeDecodeError):
        return {"source": "github", "untrusted": True, "error": "credential_unavailable"}
    mcp_tools = {
        "file": "get_file_contents",
        "issues": "list_issues",
        "search_issues": "search_issues",
        "pull_requests": "list_pull_requests",
        "search_pull_requests": "search_pull_requests",
        "commits": "list_commits",
        "search_code": "search_code",
    }
    if operation == "file":
        file_path = query.strip("/")
        if not file_path or len(file_path) > 500 or "\\" in file_path or any(part in {".", ".."} for part in file_path.split("/")) or not re.fullmatch(r"[A-Za-z0-9._/@+-]+", file_path):
            return {"source": "github", "untrusted": True, "error": "invalid_path"}
        try:
            mcp_result = call_github_tool(token, owner, repository, "get_file_contents", {"path": file_path})
            contents = mcp_result.get("content", [])
            text_content = "\n".join(item.get("text", "") for item in contents if isinstance(item, dict) and item.get("type") == "text")
            return {"source": "github", "untrusted": True, "data": text_content[:MAX_RESULT_LENGTH]}
        except MCPClientError as error:
            return {"source": "github", "untrusted": True, "error": str(error)}
    elif operation in {"issues", "search_issues", "pull_requests", "search_pull_requests", "commits", "search_code"}:
        arguments = {"owner": owner, "repo": repository, "perPage": 20}
        if operation == "issues":
            arguments.update({"state": "OPEN", "fields": ["number", "title", "state", "url", "body"]})
        elif operation == "pull_requests":
            arguments.update({"state": "open", "fields": ["number", "title", "state", "html_url", "body"]})
        elif operation == "commits":
            arguments.update({"sha": "HEAD"})
        else:
            query = re.sub(r"\s+", " ", query).strip()
            if not query or len(query) > 300:
                return {"source": "github", "untrusted": True, "error": "invalid_query"}
            arguments = {"query": f"repo:{owner}/{repository} {query}", "perPage": 20}
        try:
            mcp_result = call_github_tool(token, owner, repository, mcp_tools[operation], arguments)
            return {"source": "github", "untrusted": True, "data": str(mcp_result)[:MAX_RESULT_LENGTH]}
        except MCPClientError as error:
            return {"source": "github", "untrusted": True, "error": str(error)}
    else:
        return {"source": "github", "untrusted": True, "error": "unsupported_operation"}
