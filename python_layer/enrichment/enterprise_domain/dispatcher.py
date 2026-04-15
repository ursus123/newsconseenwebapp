"""
enrichment/enterprise_domain/dispatcher.py
--------------------------------------------
Maps enterprise rows to the appropriate domain enricher.

Trigger conditions for NPI lookup:
  - sic_sector_id == 16  (Health Care and Social Assistance)
  - enterprise_subtype contains healthcare keywords
  - enterprise_name contains healthcare keywords
"""

import re
import logging

logger = logging.getLogger(__name__)

# Healthcare sector: NAICS sector 16
_HEALTHCARE_SECTOR = 16

_HEALTHCARE_SUBTYPE_KW = frozenset([
    "clinic", "hospital", "pharmacy", "health", "medical", "dental",
    "nursing", "laboratory", "lab", "radiology", "rehabilitation",
    "hospice", "urgent care", "diagnostic", "surgical", "therapy",
    "veterinary", "optical", "psychiatry", "mental health", "oncology",
])

_HEALTHCARE_NAME_KW = frozenset([
    "clinic", "hospital", "pharmacy", "health", "medical", "dental",
    "nursing", "lab", "care", "medicare", "surgical", "therapy",
    "diagnostic", "rehabilitation", "radiology", "hospice", "dispensary",
])


def dispatch_enterprise(name: str, row: dict) -> dict | None:
    """Return domain enrichment dict or None if no domain match."""
    if _is_healthcare(name, row):
        try:
            from enrichment.enterprise_domain.npi_lookup import lookup_npi_organization
            state = str(row.get("region", row.get("state", "")) or "")[:2]
            return lookup_npi_organization(name, state=state or None)
        except Exception as exc:
            logger.warning("enterprise_domain.dispatch: NPI lookup failed — %s", exc)
            return {"domain_status": "error", "domain_error": str(exc)[:120], "_source": "nppes_npi"}

    return None


def _is_healthcare(name: str, row: dict) -> bool:
    # Check sector ID
    sector = row.get("sic_sector_id")
    if sector and int(sector) == _HEALTHCARE_SECTOR:
        return True

    # Check subtype
    subtype = str(row.get("enterprise_subtype", "") or "").lower()
    if any(kw in subtype for kw in _HEALTHCARE_SUBTYPE_KW):
        return True

    # Check enterprise type (not very specific, but "government" health depts)
    # Check name keywords
    name_lower = name.lower()
    name_words = set(re.split(r"[\s\-_/]+", name_lower))
    if name_words & _HEALTHCARE_NAME_KW:
        return True

    return False
