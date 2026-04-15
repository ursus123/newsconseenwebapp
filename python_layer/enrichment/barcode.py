"""
enrichment/barcode.py
----------------------
EAN/UPC barcode lookup.

Tier 1 — Open Food Facts (free, no key, best for food/FMCG).
Tier 2 — UPC Item DB    (free tier, 100 req/day, broader non-food coverage).

Rate limits respected: 1 req/sec per source.
"""

import time
import logging

import httpx

logger = logging.getLogger(__name__)

_LAST_OFF: float = 0.0
_LAST_UPC: float = 0.0
_MIN_INTERVAL    = 1.1   # seconds between calls to each source


def lookup_barcode(barcode: str) -> dict:
    """
    Look up product info from EAN/UPC barcode string.
    Returns enrichment dict with barcode_name, brand, category, etc.
    enrichment_status values: enriched | not_found | skipped | error
    """
    barcode = str(barcode or "").strip()
    if not barcode:
        return {"enrichment_status": "skipped", "reason": "empty_barcode"}
    # Accept numeric barcodes only
    cleaned = barcode.replace("-", "").replace(" ", "")
    if not cleaned.isdigit():
        return {"enrichment_status": "skipped", "reason": "non_numeric_barcode"}

    result = _off_lookup(cleaned)
    if result.get("barcode_name"):
        return result

    result = _upc_lookup(cleaned)
    return result


def _off_lookup(barcode: str) -> dict:
    """Open Food Facts lookup."""
    global _LAST_OFF
    _throttle(_LAST_OFF)
    _LAST_OFF = time.time()

    try:
        r = httpx.get(
            f"https://world.openfoodfacts.org/api/v0/product/{barcode}.json",
            timeout=10,
            headers={"User-Agent": "Newsconseen/1.0 (contact@newsconseen.com)"},
        )
        if r.status_code == 200:
            data = r.json()
            if data.get("status") == 1:
                p = data.get("product", {})
                cats = p.get("categories_tags", [])
                category = ""
                if cats:
                    # Strip "en:" prefix, use first tag
                    raw = cats[0].replace("en:", "").replace("-", " ")
                    category = raw.title()

                return {
                    "barcode":           barcode,
                    "barcode_name":      p.get("product_name") or p.get("product_name_en") or "",
                    "brand":             p.get("brands", ""),
                    "category":          category,
                    "manufacturer":      p.get("manufacturing_places", ""),
                    "allergens":         p.get("allergens", ""),
                    "nutriscore":        p.get("nutriscore_grade", "").upper(),
                    "ecoscore":          p.get("ecoscore_grade", "").upper(),
                    "quantity":          p.get("quantity", ""),
                    "packaging":         p.get("packaging", ""),
                    "countries":         p.get("countries", ""),
                    "enrichment_source": "openfoodfacts",
                    "enrichment_status": "enriched",
                }
    except Exception as e:
        logger.debug("_off_lookup(%s): %s", barcode, e)
    return {}


def _upc_lookup(barcode: str) -> dict:
    """UPC Item DB lookup."""
    global _LAST_UPC
    _throttle(_LAST_UPC)
    _LAST_UPC = time.time()

    try:
        r = httpx.get(
            "https://api.upcitemdb.com/prod/trial/lookup",
            params={"upc": barcode},
            timeout=10,
            headers={"User-Agent": "Newsconseen/1.0"},
        )
        if r.status_code == 200:
            items = r.json().get("items", [])
            if items:
                item = items[0]
                return {
                    "barcode":           barcode,
                    "barcode_name":      item.get("title", ""),
                    "brand":             item.get("brand", ""),
                    "category":          item.get("category", ""),
                    "manufacturer":      item.get("manufacturer", ""),
                    "allergens":         "",
                    "nutriscore":        "",
                    "ecoscore":          "",
                    "quantity":          "",
                    "packaging":         "",
                    "countries":         "",
                    "enrichment_source": "upcitemdb",
                    "enrichment_status": "enriched",
                }
        elif r.status_code == 429:
            logger.warning("barcode: UPC Item DB rate limit reached")
    except Exception as e:
        logger.debug("_upc_lookup(%s): %s", barcode, e)
    return {"enrichment_status": "not_found"}


def _throttle(last_call: float):
    wait = _MIN_INTERVAL - (time.time() - last_call)
    if wait > 0:
        time.sleep(wait)
