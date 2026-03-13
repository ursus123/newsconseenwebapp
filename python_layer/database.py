from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from .config import settings


def get_engine() -> Engine:
    """
    Returns a shared SQLAlchemy engine using DATABASE_URL from .env.
    This engine is reused across ETL modules, FastAPI, and Airflow.
    """
    if not settings.database_url:
        raise ValueError("DATABASE_URL is not set in environment variables.")

    # echo=False prevents SQL spam in logs; set to True for debugging
    engine = create_engine(settings.database_url, echo=False, future=True)
    return engine


# Optional: create a module-level engine instance
# This avoids recreating engines repeatedly across the app.
engine = get_engine()
