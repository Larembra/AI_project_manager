import pytest
from app.agent.mcp.client import MCPClientError, _decode_response, call_github_tool


def test_mcp_json_response_decodes():
    assert _decode_response('{"jsonrpc":"2.0","result":{"ok":true}}')["result"]["ok"] is True


def test_mcp_event_stream_response_decodes():
    value = _decode_response('event: message\ndata: {"jsonrpc":"2.0","result":{"ok":true}}\n\n')
    assert value["result"]["ok"] is True


def test_mcp_client_rejects_write_or_unknown_tools_before_connecting():
    with pytest.raises(MCPClientError, match="tool_not_allowed"):
        call_github_tool("secret", "owner", "repo", "create_pull_request", {})


def test_mcp_client_rejects_remote_http_endpoint(monkeypatch):
    from app.config import settings
    monkeypatch.setattr(settings, "GITHUB_MCP_URL", "http://github.example/mcp/")
    with pytest.raises(MCPClientError, match="insecure_mcp_url"):
        call_github_tool("secret", "owner", "repo", "get_file_contents", {"path": "README.md"})
