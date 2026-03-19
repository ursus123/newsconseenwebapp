import pandas as pd
from etl.base import fetch_json_to_df
from config import settings


def extract_enterprises() -> pd.DataFrame:
    """
    Extract enterprise data from Base44.
    Returns raw DataFrame including company_id for tenant scoping.
    """
    return fetch_json_to_df(settings.base44_enterprises_url)


def transform_enterprises(df: pd.DataFrame) -> pd.DataFrame:
    """
    Transform enterprise data into a summary grouped by
    status and enterprise_type.
    company_id column is preserved if present so the caller
    can scope results per tenant.
    """
    if df.empty:
        return pd.DataFrame(columns=["status", "enterprise_type", "enterprise_count"])

    summary = df.groupby(["status", "enterprise_type"]).agg(
        enterprise_count=("id", "count")
    ).reset_index()

    return summary