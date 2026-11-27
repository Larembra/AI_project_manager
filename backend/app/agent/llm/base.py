from typing import Protocol


class LLMClient(Protocol):
    def generate_text(self, api_key: str, prompt: str, context: str) -> str:
        ...

    def generate_with_tools(self, api_key: str, prompt: str, context: str, github_enabled: bool, organization_only: bool, can_edit_project: bool, can_edit_tasks: bool, can_manage_members: bool, contents: list[dict] | None = None, preferred_model: str | None = None):
        ...
