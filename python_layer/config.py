from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # ----------------------------------------------------------
    # Base44 entity URLs
    # One URL per entity in the six-layer star schema.
    # ----------------------------------------------------------
    base44_tasks_url:          str
    base44_transactions_url:   str
    base44_services_url:       str
    base44_enterprises_url:    str
    base44_people_url:         str
    base44_products_url:       str
    base44_relationships_url:  str
    base44_addresses_url:      str

    # ----------------------------------------------------------
    # Base44 authentication
    # Base44 uses 'api_key' header, not 'Authorization: Bearer'
    # ----------------------------------------------------------
    base44_api_key: str

    # ----------------------------------------------------------
    # Railway PostgreSQL — analytical store
    # Optional so the app still starts locally without a DB.
    # ----------------------------------------------------------
    database_url: str | None = None

    # ----------------------------------------------------------
    # Cron protection secret
    # Railway calls POST /cron/etl-all with this in the
    # X-Cron-Secret header. Prevents unauthorized ETL triggers.
    # ----------------------------------------------------------
    cron_secret: str = ""

    # ----------------------------------------------------------
    # Nominatim contact email
    # Required by Nominatim ToS — must identify the application
    # operator in the User-Agent header of every geocoding request.
    # Set this to a monitored email address. Nominatim may contact
    # you if your usage pattern triggers rate limit concerns.
    # ----------------------------------------------------------
    nominatim_contact_email: str = "contact@newsconseen.com"

    # ----------------------------------------------------------
    # ML feature flag
    # Set ML_ENABLED=true in Railway to enable /ml/* endpoints.
    # Keep false until ML models have been retrained for the
    # current deployment vertical. While false all /ml/* endpoints
    # return 503 with a clear explanation.
    # ----------------------------------------------------------
    ml_enabled: str = "false"

    class Config:
        env_file      = ".env"
        case_sensitive = False
        extra          = "ignore"


settings = Settings()

# ----------------------------------------------------------
# Shared request headers for all Base44 API calls.
# Imported by etl/base.py and anywhere else that calls Base44.
# ----------------------------------------------------------
HEADERS = {
    "api_key":      settings.base44_api_key,
    "Content-Type": "application/json",
}

# ----------------------------------------------------------
# Nominatim User-Agent string
# Built from nominatim_contact_email so it stays in sync with
# whatever is set in Railway environment variables.
# Imported by etl/geospatial.py and etl/addresses.py.
# ----------------------------------------------------------
NOMINATIM_USER_AGENT = f"newsconseen-app/1.0 ({settings.nominatim_contact_email})"
