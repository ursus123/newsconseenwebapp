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
    # New canonical entities
    base44_documents_url:      Optional[str] = None
    base44_schedules_url:      Optional[str] = None
    base44_signals_url:        Optional[str] = None
    base44_channels_url:       Optional[str] = None
    base44_territories_url:    Optional[str] = None

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

    # ----------------------------------------------------------
    # n8n Workflow Automation integration
    # ----------------------------------------------------------
    n8n_webhook_url: Optional[str] = None   # n8n webhook URL — Newsconseen fires events here
    n8n_secret:      Optional[str] = None   # shared secret for /n8n/ingest/* endpoints

    # ----------------------------------------------------------
    # pgvector semantic search
    # ----------------------------------------------------------
    openai_api_key:  Optional[str] = None   # text-embedding-3-small (~$0.02/1M tokens)
    voyage_api_key:  Optional[str] = None   # voyage-large-2 (alternative embedder)

    # ----------------------------------------------------------
    # Airbyte data integration
    # ----------------------------------------------------------
    airbyte_api_url:        Optional[str] = None   # e.g. http://localhost:8001 or https://api.airbyte.com
    airbyte_api_key:        Optional[str] = None   # Airbyte Cloud API key
    airbyte_workspace_id:   Optional[str] = None   # Airbyte workspace ID
    airbyte_webhook_secret: Optional[str] = None   # secures /airbyte/webhook endpoint

    # ----------------------------------------------------------
    # Platform admin secret — protects /admin/* endpoints
    # Set ADMIN_SECRET in Railway env vars.
    # ----------------------------------------------------------
    admin_secret: Optional[str] = None

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
