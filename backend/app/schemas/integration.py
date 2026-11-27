from pydantic import BaseModel, Field


class ProjectIntegrationUpdate(BaseModel):
    repo_url: str | None = Field(default=None, max_length=500)
    token: str | None = Field(default=None, max_length=500)
    remove_token: bool = False


class ProjectIntegrationOut(BaseModel):
    repo_url: str | None = None
    token_configured: bool = False
    token_last4: str | None = None
    warning: str | None = None
