from pydantic_settings import BaseSettings
from pathlib import Path


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/ocs"
    SECRET_KEY: str = "supersecretkey_change_in_production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440
    GEMINI_API_KEY: str = ""
    AI_HISTORY_LIMIT: int = 20
    AI_HISTORY_MAX_LIMIT: int = 100

    @property
    def ai_history_limit(self) -> int:
        return max(1, min(self.AI_HISTORY_LIMIT, self.AI_HISTORY_MAX_LIMIT))

    class Config:
        env_file = Path(__file__).resolve().parent.parent / ".env"


settings = Settings()
