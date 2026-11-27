import json
import logging
import urllib.error
import urllib.parse
import urllib.request

logger = logging.getLogger(__name__)


class MCPClientError(Exception):
    pass


def call_github_tool(token: str, owner: str, repository: str, tool_name: str, arguments: dict) -> dict:
    headers = {
        "Accept": "application/vnd.github+json",
        "Authorization": f"Bearer {token}",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "Soprano-Project-Advisor",
    }
    base = f"https://api.github.com/repos/{urllib.parse.quote(owner, safe='')}/{urllib.parse.quote(repository, safe='')}"
    query = ""
    if tool_name == "get_file_contents":
        path = str(arguments.get("path", "")).strip("/")
        if not path or any(part in {".", ".."} for part in path.split("/")):
            raise MCPClientError("invalid_path")
        endpoint = f"{base}/contents/{urllib.parse.quote(path, safe='/')}"
    elif tool_name == "list_issues":
        endpoint = f"{base}/issues?state=open&per_page=20"
    elif tool_name == "search_issues":
        query = str(arguments.get("query", "")).strip()
        endpoint = "https://api.github.com/search/issues?q=" + urllib.parse.quote(f"repo:{owner}/{repository} {query}")
    elif tool_name == "list_pull_requests":
        endpoint = f"{base}/pulls?state=open&per_page=20"
    elif tool_name == "search_pull_requests":
        query = str(arguments.get("query", "")).strip()
        endpoint = "https://api.github.com/search/issues?q=" + urllib.parse.quote(f"repo:{owner}/{repository} is:pr {query}")
    elif tool_name == "list_commits":
        endpoint = f"{base}/commits?per_page=20"
    elif tool_name == "search_code":
        query = str(arguments.get("query", "")).strip()
        endpoint = "https://api.github.com/search/code?q=" + urllib.parse.quote(f"repo:{owner}/{repository} {query}")
    else:
        raise MCPClientError("tool_not_allowed")

    request = urllib.request.Request(endpoint, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            payload = json.loads(response.read(1_000_000).decode("utf-8"))
        if tool_name == "get_file_contents" and isinstance(payload, dict):
            import base64
            content = base64.b64decode(payload.get("content", "")).decode("utf-8", errors="replace")
            return {"content": [{"type": "text", "text": content}]}
        return {"content": [{"type": "text", "text": json.dumps(payload, ensure_ascii=False)}]}
    except urllib.error.HTTPError as error:
        status = error.code
        logger.warning("GitHub API rejected read: tool=%s repository=%s/%s status=%s", tool_name, owner, repository, status)
        codes = {401: "github_token_invalid", 403: "github_access_forbidden_or_rate_limited", 404: "github_repository_or_file_not_found"}
        raise MCPClientError(codes.get(status, f"github_http_{status}")) from error
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, UnicodeDecodeError) as error:
        logger.exception("GitHub API read failed: tool=%s repository=%s/%s", tool_name, owner, repository)
        raise MCPClientError("github_api_unavailable") from error
