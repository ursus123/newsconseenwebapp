"""
enrichment/person_enrich.py
----------------------------
Enrich Person records with phone validation + email validation.
Writes to analytics.person_enrichment — one row per person.
"""

import logging
import pandas as pd

from enrichment.phone       import validate_phone
from enrichment.email_check import validate_email

logger = logging.getLogger(__name__)


def enrich_people(people_df: pd.DataFrame, company_id: str, force: bool = False) -> pd.DataFrame:
    """
    For each person in company_id:
      - Validate phone number (phonenumbers lib, offline)
      - Validate email address (DNS MX check)

    Returns DataFrame ready for analytics.person_enrichment.
    """
    if people_df.empty:
        return pd.DataFrame()

    ppl = people_df[people_df["company_id"] == company_id].copy() \
          if "company_id" in people_df.columns else people_df.copy()
    if ppl.empty:
        return pd.DataFrame()

    rows = []
    for _, p in ppl.iterrows():
        row: dict = {
            "company_id":  company_id,
            "person_id":   str(p.get("id", "") or ""),
            "person_name": str(p.get("full_name") or p.get("person_name") or p.get("name") or ""),
            "person_type": str(p.get("person_type", "") or ""),
        }

        # ── Phone ─────────────────────────────────────────────────────────────
        phone = str(p.get("phone") or p.get("phone_number") or p.get("mobile") or "").strip()
        if phone:
            # Try to detect country from existing data for better parsing
            country_hint = str(p.get("country", "") or "").strip()[:2].upper() or None
            phone_result = validate_phone(phone, default_region=country_hint)
            row.update(phone_result)
        else:
            row["phone_valid"] = None
            row["phone_e164"]  = None

        # ── Email ─────────────────────────────────────────────────────────────
        email = str(p.get("email", "") or "").strip()
        if email:
            email_result = validate_email(email)
            row.update(email_result)
        else:
            row["email_valid"]  = None
            row["email_domain"] = None

        # ── Phase B: domain-specific enrichment (healthcare → NPI) ────────────
        try:
            from enrichment.person_domain.dispatcher import dispatch_person
            person_name = row.get("person_name", "")
            domain_result = dispatch_person(person_name, dict(p))
            if domain_result:
                import json
                row["domain_data"]       = json.dumps(domain_result)
                row["domain_enriched_by"] = domain_result.get("_source", "")
                for key in ("npi_number", "npi_taxonomy_code", "npi_taxonomy_desc",
                            "npi_state", "npi_enumeration_date", "npi_status"):
                    if key in domain_result:
                        row[key] = domain_result[key]
        except Exception as _de:
            logger.debug("person domain dispatch skipped: %s", _de)

        row["enriched_at"] = pd.Timestamp.now(tz="UTC").isoformat()
        rows.append(row)

    logger.info("person_enrich: %d people enriched (company=%s)", len(rows), company_id)
    return pd.DataFrame(rows)
