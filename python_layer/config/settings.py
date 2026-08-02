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
    app_env: str = "development"
    cors_allowed_origins: str = (
        "http://localhost:5173,"
        "https://staging.news-con-seen.com,"
        "https://news-con-seen.com,"
        "https://www.news-con-seen.com"
    )
    # ----------------------------------------------------------
    # Supabase entity URLs — still live. Read by connectors/base.py (all
    # connector writes), admin/routes.py (tenant provisioning), etl/base.py
    # (analytics fallback), and autotask/engine.py. Migration to Supabase is
    # in progress but NOT complete for these write paths — do not remove.
    # ----------------------------------------------------------
    # New canonical entities
    # Agricultural / ecological entities
    # Intelligence layer entities — write-back targets for enrichment engine

    # ----------------------------------------------------------
    # Supabase authentication
    # ----------------------------------------------------------

    # ----------------------------------------------------------
    # Railway PostgreSQL
    # ----------------------------------------------------------
    database_url: str | None = None

    # ----------------------------------------------------------
    # Cron protection
    # ----------------------------------------------------------
    cron_secret: Optional[str] = None

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
    # Anthropic API key — used by Copilot + Ingestion Agent analyser
    # ----------------------------------------------------------
    anthropic_api_key: Optional[str] = None

    # ----------------------------------------------------------
    # Supabase — server-side entity writes (ingestion loader, enrichment)
    # ----------------------------------------------------------
    supabase_url:              Optional[str] = None
    supabase_service_role_key: Optional[str] = None

    # ----------------------------------------------------------
    # Supabase REST API base URL — kept for backward compat, unused
    # ----------------------------------------------------------

    # ----------------------------------------------------------
    # Platform admin secret — protects /admin/* endpoints
    # Set ADMIN_SECRET in Railway env vars.
    # ----------------------------------------------------------
    admin_secret: Optional[str] = None

    # ----------------------------------------------------------
    # Error monitoring — Sentry (backend). Frontend uses VITE_SENTRY_DSN,
    # a separate Vite-side env var, not this one.
    # ----------------------------------------------------------
    sentry_dsn: Optional[str] = None

    # ----------------------------------------------------------
    # Backup restore drill — scratch database to actually restore into.
    # If unset, restore_drill() falls back to a structural integrity
    # check only (see backup/engine.py).
    # ----------------------------------------------------------
    restore_test_database_url: Optional[str] = None

    class Config:
        env_file       = ".env"
        case_sensitive = False
        extra          = "ignore"


settings = Settings()


def get_settings() -> Settings:
    return settings


# Backward-compatible name for generic JSON transport headers. It contains no
# platform credential and must not be used as an authorization mechanism.
HEADERS = {"Content-Type": "application/json"}

# ----------------------------------------------------------
# Shared request headers for all Supabase API calls
# ----------------------------------------------------------
# ----------------------------------------------------------
# Nominatim User-Agent string
# ----------------------------------------------------------
NOMINATIM_USER_AGENT = (
    f"newsconseen-app/1.0 ({settings.nominatim_contact_email})"
)
