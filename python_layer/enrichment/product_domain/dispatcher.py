"""
enrichment/product_domain/dispatcher.py
-----------------------------------------
Maps each product row to the appropriate domain enricher based on:
  1. item_subtype (taxonomy value — most specific)
  2. item_type    (broad ontology classification)
  3. Keyword detection in product name (fallback)

Domains and their enrichers:
  medication / supplement / vaccine → NIH RxNorm
  food / ingredient / crop produce  → USDA FoodData Central
  vehicle / car / truck / equipment → NHTSA
  chemical / fertilizer / pesticide → PubChem
  medical device / instrument       → FDA openFDA
  software / application / package  → npm + PyPI

Returns the domain enrichment dict to be stored as `domain_data` JSON
in analytics.product_enrichment alongside the base Phase A fields.
"""

import re
import json
import logging

logger = logging.getLogger(__name__)

# ── Keyword sets for name-based detection ────────────────────────────────────

_MED_KW = frozenset([
    "medication", "medicine", "drug", "pharmaceutical", "capsule", "tablet",
    "injection", "vaccine", "supplement", "vitamin", "antibiotic", "antiviral",
    "analgesic", "syrup", "ointment", "cream", "gel", "inhaler", "antiretroviral",
    "antimalarial", "antifungal", "paracetamol", "amoxicillin", "ibuprofen",
    "aspirin", "insulin", "metformin", "atorvastatin",
])

_FOOD_KW = frozenset([
    "food", "flour", "oil", "meat", "vegetable", "fruit", "grain", "cereal",
    "beverage", "snack", "dairy", "spice", "sauce", "bread", "sugar", "salt",
    "rice", "wheat", "maize", "corn", "cassava", "sorghum", "millet",
    "bean", "lentil", "soybean", "groundnut", "peanut", "seed oil",
    "ingredient", "additive", "preservative",
])

_VEH_KW = frozenset([
    "vehicle", "car", "truck", "motorcycle", "bus", "van", "trailer",
    "tractor", "bicycle", "automobile", "lorry", "pickup", "suv", "sedan",
    "jeep", "matatu", "boda", "okada",
])

_CHEM_KW = frozenset([
    "chemical", "compound", "fertilizer", "pesticide", "herbicide",
    "insecticide", "fungicide", "reagent", "solvent", "acid", "alkali",
    "polymer", "resin", "adhesive", "lubricant", "disinfectant",
    "bleach", "chlorine", "caustic",
])

_DEV_KW = frozenset([
    "device", "monitor", "scanner", "pump", "ventilator", "catheter",
    "implant", "instrument", "surgical", "stethoscope", "thermometer",
    "glucometer", "sphygmomanometer", "defibrillator", "ultrasound",
    "x-ray", "mri", "ecg", "ekg", "dialysis", "nebulizer",
])

_SW_KW = frozenset([
    "software", "application", "app", "package", "library", "framework",
    "plugin", "license", "subscription", "platform", "saas", "api",
    "sdk", "module", "tool", "utility", "database", "crm", "erp",
])

# ── Taxonomy subtype → domain mapping ────────────────────────────────────────

_SUBTYPE_TO_DOMAIN: dict[str, str] = {}

for kw in ("medication", "supplement", "vaccine", "pharmaceutical",
           "antibiotic", "drug", "medicine"):
    _SUBTYPE_TO_DOMAIN[kw] = "medication"

for kw in ("food", "food ingredient", "ingredient", "cereal",
           "grain", "oil", "beverage", "additive"):
    _SUBTYPE_TO_DOMAIN[kw] = "food"

for kw in ("vehicle", "car", "truck", "motorcycle", "bus",
           "automobile", "tractor"):
    _SUBTYPE_TO_DOMAIN[kw] = "vehicle"

for kw in ("chemical", "fertilizer", "pesticide", "herbicide",
           "insecticide", "reagent", "compound"):
    _SUBTYPE_TO_DOMAIN[kw] = "chemical"

for kw in ("medical device", "device", "equipment", "instrument",
           "surgical instrument", "diagnostic device"):
    _SUBTYPE_TO_DOMAIN[kw] = "device"

for kw in ("software", "application", "license", "subscription",
           "saas", "package", "platform", "course", "ebook", "dataset"):
    _SUBTYPE_TO_DOMAIN[kw] = "software"

# ── item_type → default domain (when subtype not matched) ────────────────────

_ITEM_TYPE_TO_DOMAIN: dict[str, str] = {
    "digital":               "software",
    "service_package":       None,        # no external lookup useful
    "financial_instrument":  None,
    "living":                None,        # livestock/crop — no free API covers all
}


# ── Public dispatcher ─────────────────────────────────────────────────────────

def dispatch_product(name: str, row: dict) -> dict | None:
    """
    Determine and call the correct domain enricher for this product.
    Returns the enrichment dict, or None if no domain match.
    """
    domain = _detect_domain(name, row)
    if domain is None:
        return None

    try:
        if domain == "medication":
            from enrichment.product_domain.medications import enrich_medication
            return enrich_medication(name, row)

        if domain == "food":
            from enrichment.product_domain.food import enrich_food
            return enrich_food(name, row)

        if domain == "vehicle":
            from enrichment.product_domain.vehicles import enrich_vehicle
            return enrich_vehicle(name, row)

        if domain == "chemical":
            from enrichment.product_domain.chemicals import enrich_chemical
            return enrich_chemical(name, row)

        if domain == "device":
            from enrichment.product_domain.devices import enrich_device
            return enrich_device(name, row)

        if domain == "software":
            from enrichment.product_domain.software import enrich_software
            return enrich_software(name, row)

    except Exception as exc:
        logger.warning("product_domain.dispatch: domain=%s name=%s — %s", domain, name, exc)
        return {"domain_status": "error", "domain_error": str(exc)[:120], "_source": domain}

    return None


def _detect_domain(name: str, row: dict) -> str | None:
    """Return the domain string, or None if no match."""
    # 1. Subtype match (most reliable — comes from taxonomy)
    subtype = str(row.get("item_subtype", "") or "").lower().strip()
    for key, domain in _SUBTYPE_TO_DOMAIN.items():
        if key in subtype:
            return domain

    # 2. item_type default
    item_type = str(row.get("item_type", "") or "").lower()
    if item_type in _ITEM_TYPE_TO_DOMAIN:
        mapped = _ITEM_TYPE_TO_DOMAIN[item_type]
        if mapped:
            return mapped

    # 3. Product name keyword scan
    name_lower = name.lower()
    name_words = set(re.split(r"[\s\-_/]+", name_lower))

    for kw_set, domain in [
        (_MED_KW,  "medication"),
        (_FOOD_KW, "food"),
        (_VEH_KW,  "vehicle"),
        (_CHEM_KW, "chemical"),
        (_DEV_KW,  "device"),
        (_SW_KW,   "software"),
    ]:
        if name_words & kw_set:
            return domain
        # Also check if any keyword appears as substring in name
        for kw in kw_set:
            if len(kw) > 4 and kw in name_lower:
                return domain

    return None
