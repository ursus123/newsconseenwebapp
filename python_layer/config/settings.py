# ==============================================================
# Newsconseen — python_layer Settings
# Refactored from config.py into config/settings.py
# All imports that previously said `from config import settings`
# should now say `from config.settings import settings`
# or use the re-exported alias in config/__init__.py
# ==============================================================

from typing import Optional

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # ----------------------------------------------------------
    # Base44 entity URLs
    # ----------------------------------------------------------
    base44_tasks_url:          str
    base44_transactions_url:   str
    base44_services_url:       str
    base44_enterprises_url:    str
    base44_people_url:         str
    base44_products_url:       str
    base44_relationships_url:  Optional[str] = None
    base44_addresses_url:      Optional[str] = None

    # ----------------------------------------------------------
    # Base44 authentication
    # ----------------------------------------------------------
    base44_api_key: str

    # ----------------------------------------------------------
    # Railway PostgreSQL
    # ----------------------------------------------------------
    database_url: str | None = None

    # ----------------------------------------------------------
    # Cron protection
    # ----------------------------------------------------------
    cron_secret: str = ""

    # ----------------------------------------------------------
    # Nominatim contact email
    # ----------------------------------------------------------
    nominatim_contact_email: str = "contact@newsconseen.com"

    # ----------------------------------------------------------
    # Public API key (x-api-key header)
    # If set, all non-health endpoints require this key.
    # ----------------------------------------------------------
    api_key: Optional[str] = None

    # ----------------------------------------------------------
    # ML feature flag
    # ----------------------------------------------------------
    ml_enabled: str = "true"

    # ----------------------------------------------------------
    # Web search API keys (all optional — graceful fallback chain)
    # ----------------------------------------------------------
    brave_search_api_key:    Optional[str] = None   # https://brave.com/search/api/
    open_exchange_rates_key: Optional[str] = None   # https://openexchangerates.org/

    class Config:
        env_file       = ".env"
        case_sensitive = False
        extra          = "ignore"


settings = Settings()

# ----------------------------------------------------------
# Shared request headers for all Base44 API calls
# ----------------------------------------------------------
HEADERS = {
    "api_key":      settings.base44_api_key,
    "Content-Type": "application/json",
}

# ----------------------------------------------------------
# Nominatim User-Agent string
# ----------------------------------------------------------
NOMINATIM_USER_AGENT = (
    f"newsconseen-app/1.0 ({settings.nominatim_contact_email})"
)
