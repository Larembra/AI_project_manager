from pydantic_settings import BaseSettings
from pathlib import Path


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/ocs"
    SECRET_KEY: str = "supersecretkey_change_in_production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440
    GEMINI_API_KEY: str = ""
    GITHUB_MCP_URL: str = "https://api.githubcopilot.com/mcp/"
    INTEGRATIONS_ENCRYPTION_KEY: str = ""
    GEMINI_SSL_VERIFY: bool = True
    AI_AGENT_MAX_STEPS: int = 8
    AI_TOOL_RESULT_MAX_CHARS: int = 4000
    AI_HISTORY_TOOL_TURNS: int = 2
    AI_PENDING_ACTION_TTL_MINUTES: int = 60
    AI_MODELS_CACHE_TTL_SECONDS: int = 3600
    AI_HISTORY_LIMIT: int = 20
    AI_HISTORY_MAX_LIMIT: int = 100

    @property
    def ai_history_limit(self) -> int:
        return max(1, min(self.AI_HISTORY_LIMIT, self.AI_HISTORY_MAX_LIMIT))

    class Config:
        env_file = Path(__file__).resolve().parent.parent / ".env"


settings = Settings()
