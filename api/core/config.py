from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application configuration loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    app_name: str = "FckSun API"
    environment: Literal["development", "test", "production"] = "development"
    log_level: str = "INFO"
    cors_origins: str = Field(default="http://localhost:5173")

    graphhopper_base_url: str = "https://graphhopper.com/api/1"
    graphhopper_api_key: str | None = None
    shademap_base_url: str = "https://shademap.app"
    shademap_api_key: str | None = None
    external_request_timeout_seconds: float = Field(default=10.0, gt=0)

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings(  # type: ignore[call-arg]  # _env_file is supported at runtime by pydantic-settings.
        _env_file=Path(__file__).resolve().parents[1] / ".env"
    )
