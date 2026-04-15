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

        # ── Phase B: domain-specific enrichment (healthcare → NPI) ────────────
        try:
            from enrichment.enterprise_domain.dispatcher import dispatch_enterprise
            domain_result = dispatch_enterprise(name, dict(e))
            if domain_result:
                import json
                row["domain_data"]       = json.dumps(domain_result)
                row["domain_enriched_by"] = domain_result.get("_source", "")
                for key in ("npi_number", "npi_taxonomy_code", "npi_taxonomy_desc",
                            "npi_state", "npi_enumeration_date", "npi_status"):
                    if key in domain_result:
                        row[key] = domain_result[key]
        except Exception as _de:
            logger.debug("enterprise domain dispatch skipped: %s", _de)

        # ── Phase C: sanctions screening (OFAC SDN list) ──────────────────────
        try:
            from enrichment.compliance.sanctions import screen_name
            if name:
                sanction_result = screen_name(name)
                row["sanctions_hit"]          = sanction_result.get("sanctions_hit")
                row["sanctions_list"]         = sanction_result.get("sanctions_list", "")
                row["sanctions_score"]        = sanction_result.get("sanctions_score", 0.0)
                row["sanctions_checked_at"]   = sanction_result.get("sanctions_checked_at", "")
        except Exception as _ce:
            logger.debug("enterprise Phase C sanctions skipped: %s", _ce)

        # ── Phase C: country risk (World Bank WGI) ─────────────────────────────
        try:
            from enrichment.compliance.country_risk import get_country_risk
            iso2 = country_code or country[:2].upper() if country else ""
            if iso2:
                risk = get_country_risk(iso2)
                if risk:
                    row["country_risk_score"]      = risk.get("country_risk_score")
                    row["country_risk_label"]      = risk.get("country_risk_label", "")
                    row["country_governance_index"] = risk.get("country_governance_index")
        except Exception as _ce:
            logger.debug("enterprise Phase C country risk skipped: %s", _ce)

        # ── Phase C: news mentions (GDELT) ─────────────────────────────────────
        try:
            from enrichment.compliance.news_mentions import get_news_mentions
            if name and len(name) >= 5:
                news = get_news_mentions(name)
                if news:
                    row["news_mention_count"] = news.get("news_mention_count", 0)
                    row["news_sentiment"]      = news.get("news_sentiment", "neutral")
                    row["news_avg_tone"]       = news.get("news_avg_tone", 0.0)
        except Exception as _ce:
            logger.debug("enterprise Phase C news skipped: %s", _ce)

        row["enriched_at"] = pd.Timestamp.now(tz="UTC").isoformat()
        rows.append(row)

    logger.info("enterprise_enrich: %d enterprises processed (company=%s)", len(rows), company_id)
    return pd.DataFrame(rows)
