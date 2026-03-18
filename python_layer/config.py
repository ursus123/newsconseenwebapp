from pydantic import BaseSettings, Field


class Settings(BaseSettings):
    """
    Centralized configuration for the Newsconseen Python Layer.
    Loads environment variables from .env or Docker environment.
    """

    # -----------------------------
    # Base44 API Endpoints
    # -----------------------------
    base44_tasks_url: str = Field(..., min_length=1)
    base44_transactions_url: str = Field(..., min_length=1)
    base44_services_url: str = Field(..., min_length=1)
    base44_enterprises_url: str = Field(..., min_length=1)
    base44_people_url: str = Field(..., min_length=1)

    # -----------------------------
    # Base44 API Key
    # -----------------------------
    base44_api_key: str = Field(..., min_length=1)

    # -----------------------------
    # Database URL (Postgres)
    # -----------------------------
    database_url: str | None = None

    class Config:
        env_file = ".env"
        case_sensitive = False  # safer for Docker + Linux environments


# Instantiate settings
settings = Settings()


# -----------------------------
# API Headers (lazy-loaded)
# -----------------------------
def get_headers() -> dict:
    """
    Returns authorization headers for Base44 API calls.
    Lazy-loaded to avoid import-time crashes if env vars are missing.
    """
    return {
        "Authorization": f"Bearer {settings.base44_api_key}",
        "Content-Type": "application/json",
    }
