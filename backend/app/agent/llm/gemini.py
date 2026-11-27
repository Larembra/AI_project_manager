from collections.abc import Callable


class GeminiClient:
    def __init__(self, text_generator: Callable, tool_generator: Callable):
        self._text_generator = text_generator
        self._tool_generator = tool_generator

    def generate_text(self, api_key: str, prompt: str, context: str) -> str:
        return self._text_generator(api_key, prompt, context)

    def generate_with_tools(self, api_key: str, prompt: str, context: str, github_enabled: bool = False, organization_only: bool = False, can_edit_project: bool = True, can_edit_tasks: bool = True, can_manage_members: bool = True, contents: list[dict] | None = None, preferred_model: str | None = None):
        return self._tool_generator(api_key, prompt, context, github_enabled, organization_only, can_edit_project, can_edit_tasks, can_manage_members, contents, preferred_model)
