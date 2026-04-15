"""
enrichment/person_domain/dispatcher.py
----------------------------------------
Maps person rows to the appropriate domain enricher.

Trigger conditions for NPI lookup (individual healthcare providers):
  - person_subtype contains healthcare provider keywords
  - person_type == "staff" AND subtype matches clinical role
"""

import logging

logger = logging.getLogger(__name__)

_HEALTHCARE_PROVIDER_KW = frozenset([
    "doctor", "physician", "surgeon", "specialist", "consultant",
    "nurse", "nursing", "midwife",
    "pharmacist", "pharmacy technician",
    "dentist", "dental", "orthodontist",
    "physiotherapist", "therapist", "occupational therapist",
    "optometrist", "optician",
    "radiologist", "radiographer",
    "laboratory technician", "lab technician", "pathologist",
    "paramedic", "emergency medical",
    "psychiatrist", "psychologist", "counselor",
    "nutritionist", "dietitian",
    "veterinarian", "vet",
    "medical officer", "clinical officer", "health worker",
])


def dispatch_person(name: str, row: dict) -> dict | None:
    """Return domain enrichment dict or None if no domain match."""
    if _is_healthcare_provider(row):
        try:
            from enrichment.enterprise_domain.npi_lookup import lookup_npi_person
            state = str(row.get("region", row.get("state", row.get("country", ""))) or "")[:2]
            return lookup_npi_person(name, state=state or None)
        except Exception as exc:
            logger.warning("person_domain.dispatch: NPI lookup failed — %s", exc)
            return {"domain_status": "error", "domain_error": str(exc)[:120], "_source": "nppes_npi"}

    return None


def _is_healthcare_provider(row: dict) -> bool:
    person_type    = str(row.get("person_type", "") or "").lower()
    person_subtype = str(row.get("person_subtype", "") or "").lower()
    primary_role   = str(row.get("primary_role", "") or "").lower()

    # Only enrich staff or contact — not clients/volunteers
    if person_type not in ("staff", "contact"):
        return False

    combined = f"{person_subtype} {primary_role}"
    return any(kw in combined for kw in _HEALTHCARE_PROVIDER_KW)
