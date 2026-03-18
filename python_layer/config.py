from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    base44_tasks_url: str
    base44_transactions_url: str
    base44_services_url: str
    base44_enterprises_url: str
    base44_people_url: str
    base44_products_url: str
    base44_api_key: str

    database_url: str | None = None

    class Config:
        env_file = ".env"


settings = Settings()

# Base44 uses 'api_key' header — not 'Authorization: Bearer'
HEADERS = {
    "api_key": settings.base44_api_key,
    "Content-Type": "application/json",
}
