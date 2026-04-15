"""
enrichment/product_domain/medications.py
-----------------------------------------
Enrich medications, supplements, and vaccines via NIH RxNorm.
Free, no API key required. Rate limit: ~20 req/sec (we stay well under).

Returns: rxcui, drug_full_name, drug_term_type, drug_class, drug_class_id,
         drug_ingredients, domain_status, _source
"""

import time
import logging
import httpx

logger = logging.getLogger(__name__)

_BASE = "https://rxnav.nlm.nih.gov/REST"
_LAST_CALL = 0.0
_MIN_INTERVAL = 0.4   # stay ≤150 req/min


def enrich_medication(name: str, row: dict) -> dict:
    """Look up drug info from NIH RxNorm."""
    result: dict = {"_source": "rxnorm"}
    if not name:
        result["domain_status"] = "no_name"
        return result

    try:
        # ── Step 1: resolve name → RxCUI ──────────────────────────────────
        _wait()
        r = httpx.get(
            f"{_BASE}/rxcui.json",
            params={"name": name, "allsrc": 0},
            timeout=12,
        )
        rxcuis = r.json().get("idGroup", {}).get("rxnormId") or []
        if not rxcuis:
            result["domain_status"] = "not_found"
            return result

        rxcui = rxcuis[0]
        result["rxcui"] = rxcui

        # ── Step 2: concept properties ────────────────────────────────────
        _wait()
        r2 = httpx.get(
            f"{_BASE}/rxcui/{rxcui}/allProperties.json",
            params={"prop": "all"},
            timeout=12,
        )
        for prop in r2.json().get("propConceptGroup", {}).get("propConcept", []):
            pname = (prop.get("propName") or "").lower()
            pval  = prop.get("propValue") or ""
            if pname == "rxnorm name":
                result["drug_rxnorm_name"] = pval
            elif pname in ("full name", "complete name"):
                result["drug_full_name"] = pval
            elif pname == "tty":
                result["drug_term_type"] = pval   # IN, BN, SBD, etc.

        # ── Step 3: ATC drug class ────────────────────────────────────────
        _wait()
        r3 = httpx.get(
            f"{_BASE}/rxclass/class/byRxcui.json",
            params={"rxcui": rxcui, "relaSource": "ATC"},
            timeout=12,
        )
        drug_infos = (
            r3.json()
            .get("rxclassDrugInfoList", {})
            .get("rxclassDrugInfo", [])
        )
        if drug_infos:
            cls = drug_infos[0].get("rxclassMinConceptItem", {})
            result["drug_class"]    = cls.get("className", "")
            result["drug_class_id"] = cls.get("classId", "")

        # ── Step 4: active ingredients (for Brand Name entries) ───────────
        _wait()
        r4 = httpx.get(
            f"{_BASE}/rxcui/{rxcui}/related.json",
            params={"tty": "IN"},
            timeout=12,
        )
        ingredient_groups = (
            r4.json()
            .get("relatedGroup", {})
            .get("conceptGroup", [])
        )
        ingredients = []
        for g in ingredient_groups:
            for c in (g.get("conceptProperties") or []):
                n = c.get("name")
                if n:
                    ingredients.append(n)
        if ingredients:
            result["drug_ingredients"] = ", ".join(ingredients[:5])

        result["domain_status"] = "enriched"

    except Exception as exc:
        logger.warning("medications.enrich: %s — %s", name, exc)
        result["domain_status"] = "error"
        result["domain_error"]  = str(exc)[:120]

    return result


def _wait():
    global _LAST_CALL
    elapsed = time.time() - _LAST_CALL
    if elapsed < _MIN_INTERVAL:
        time.sleep(_MIN_INTERVAL - elapsed)
    _LAST_CALL = time.time()
