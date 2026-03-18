from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from config import settings


def get_engine() -> Engine:
    if not settings.database_url:
        raise ValueError("DATABASE_URL is not set in environment variables.")
    engine = create_engine(settings.database_url, echo=False, future=True)
    return engine


engine = get_engine()