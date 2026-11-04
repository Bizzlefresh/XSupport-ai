"""Environment-based configuration. No secrets are hardcoded; see .env.example."""
from functools import lru_cache

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_INSECURE_DEFAULT_SECRET = "dev-only-change-me"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "XSupport AI"
    environment: str = "development"  # development | test | production
    database_url: str = "postgresql+psycopg://xsupport:xsupport@localhost:5432/xsupport"

    secret_key: str = _INSECURE_DEFAULT_SECRET
    access_token_minutes: int = 60
    cors_origins: str = "http://localhost:3000"

    # Integrations are disabled by default (project requirement).
    teamdynamix_enabled: bool = False
    teamdynamix_read_only: bool = True
    teamdynamix_base_url: str = ""
    teamdynamix_app_id: str = ""
    teamdynamix_token: str = Field(default="", repr=False)
    external_llm_enabled: bool = False

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @model_validator(mode="after")
    def _reject_insecure_secret_in_production(self) -> "Settings":
        if self.environment == "production" and self.secret_key == _INSECURE_DEFAULT_SECRET:
            raise ValueError("SECRET_KEY must be set to a strong value in production")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
