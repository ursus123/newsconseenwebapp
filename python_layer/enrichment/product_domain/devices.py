"""
enrichment/product_domain/devices.py
--------------------------------------
Enrich medical device products via FDA openFDA device API.
Free, no API key for basic usage (1000 req/day without key).

Returns: fda_device_class, fda_regulation_number, fda_product_code,
         fda_medical_specialty, fda_submission_type,
         fda_device_name, fda_recall_status, domain_status, _source
"""

import time
import logging
import httpx

logger = logging.getLogger(__name__)

_DEVICE_BASE  = "https://api.fda.gov/device"
_LAST_CALL    = 0.0
_MIN_INTERVAL = 0.5   # conservative for no-key tier


def enrich_device(name: str, row: dict) -> dict:
    """Look up FDA device classification and recall status."""
    result: dict = {"_source": "fda_openfda"}
    if not name:
        result["domain_status"] = "no_name"
        return result

    # ── Step 1: device classification ─────────────────────────────────────
    _wait()
    try:
        r = httpx.get(
            f"{_DEVICE_BASE}/classification.json",
            params={"search": f'device_name:"{name}"', "limit": 1},
            timeout=12,
        )
        if r.status_code == 429:
            result["domain_status"] = "rate_limited"
            return result

        results = r.json().get("results", [])
        if not results:
            # Try broader keyword match
            _wait()
            r = httpx.get(
                f"{_DEVICE_BASE}/classification.json",
                params={"search": f"device_name:{name.split()[0]}", "limit": 1},
                timeout=12,
            )
            results = r.json().get("results", [])

        if results:
            cls = results[0]
            result["fda_device_name"]       = cls.get("device_name", "")
            result["fda_device_class"]      = cls.get("device_class", "")  # I, II, III
            result["fda_regulation_number"] = cls.get("regulation_number", "")
            result["fda_product_code"]      = cls.get("product_code", "")
            result["fda_medical_specialty"] = cls.get("medical_specialty_description", "")
            result["fda_submission_type"]   = cls.get("submission_type_id", "")  # 510k, PMA, etc.
        else:
            result["domain_status"] = "not_found"
            return result

    except Exception as exc:
        logger.warning("devices.classify: %s — %s", name, exc)
        result["domain_status"] = "error"
        result["domain_error"]  = str(exc)[:120]
        return result

    # ── Step 2: check recall history ──────────────────────────────────────
    _wait()
    try:
        r2 = httpx.get(
            f"{_DEVICE_BASE}/recall.json",
            params={"search": f"product_description:{name.split()[0]}", "limit": 1},
            timeout=12,
        )
        recalls = r2.json().get("results", [])
        result["fda_recall_count"] = len(recalls)
        if recalls:
            result["fda_recall_status"] = recalls[0].get("event_date_initiated", "")[:10]
    except Exception:
        pass  # recalls endpoint can 404 on no results

    result["domain_status"] = "enriched"
    return result


def _wait():
    global _LAST_CALL
    elapsed = time.time() - _LAST_CALL
    if elapsed < _MIN_INTERVAL:
        time.sleep(_MIN_INTERVAL - elapsed)
    _LAST_CALL = time.time()
