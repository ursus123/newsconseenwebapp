"""
enrichment/enterprise_enrich.py
---------------------------------
Enrich Enterprise records with company registration data from OpenCorporates.
Writes to analytics.enterprise_enrichment — one row per enterprise.
"""

import logging
import pandas as pd

from enrichment.company_lookup import lookup_company

logger = logging.getLogger(__name__)


def enrich_enterprises(enterprises_df: pd.DataFrame, company_id: str, force: bool = False) -> pd.DataFrame:
    """
    For each enterprise in company_id, look up company registration via OpenCorporates.
    Skips enterprises with very short names or obvious non-company names.
    Returns DataFrame ready for analytics.enterprise_enrichment.
    """
    if enterprises_df.empty:
        return pd.DataFrame()

    ents = enterprises_df[enterprises_df["company_id"] == company_id].copy() \
           if "company_id" in enterprises_df.columns else enterprises_df.copy()
    if ents.empty:
        return pd.DataFrame()

    rows = []
    for _, e in ents.iterrows():
        name    = str(e.get("enterprise_name", "") or "").strip()
        country = str(e.get("country", "") or "").strip()
        # Two-letter country code for jurisdiction filter
        country_code = country[:2].lower() if len(country) >= 2 else None

        row: dict = {
            "company_id":       company_id,
            "enterprise_id":    str(e.get("id", "") or ""),
            "enterprise_name":  name,
            "enterprise_type":  str(e.get("enterprise_type", "") or ""),
            "country":          country,
        }

        if name and len(name) >= 3:
            result = lookup_company(name, country_code)
            row.update(result)
        else:
            row["enrichment_status"] = "skipped"
            row["reason"]            = "name_too_short"

        row["enriched_at"] = pd.Timestamp.now(tz="UTC").isoformat()
        rows.append(row)

    logger.info("enterprise_enrich: %d enterprises processed (company=%s)", len(rows), company_id)
    return pd.DataFrame(rows)
