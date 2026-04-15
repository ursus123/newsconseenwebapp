"""
enrichment/product_domain/vehicles.py
---------------------------------------
Enrich vehicle products via NHTSA APIs (free, no key required).

Two modes:
  1. VIN decode  — NHTSA vPIC  (17-char VIN in vin / serial_number field)
  2. Make+Model  — NHTSA Safety recalls API (make + model from row or name)

Returns: vehicle_make, vehicle_model, vehicle_year, vehicle_type,
         vehicle_fuel_type, vehicle_body_class, recall_count,
         latest_recall_date, latest_recall_desc, domain_status, _source
"""

import time
import logging
import httpx

logger = logging.getLogger(__name__)

_VPIC_BASE   = "https://vpic.nhtsa.dot.gov/api/vehicles"
_SAFETY_BASE = "https://api.nhtsa.gov"
_LAST_CALL   = 0.0
_MIN_INTERVAL = 0.4

# Row field names where VIN might live
_VIN_FIELDS = ["vin", "vehicle_vin", "serial_number", "chassis_number"]
# Row field names where make / brand might live
_MAKE_FIELDS  = ["make", "brand", "manufacturer", "item_brand"]
_MODEL_FIELDS = ["model", "item_variant", "vehicle_model"]


def enrich_vehicle(name: str, row: dict) -> dict:
    """Enrich a vehicle product using NHTSA."""
    result: dict = {"_source": "nhtsa"}

    # ── Mode 1: VIN decode ────────────────────────────────────────────────
    vin = _first(row, _VIN_FIELDS)
    if vin and len(vin) == 17:
        return _decode_vin(vin, result)

    # ── Mode 2: Make + Model from row fields ──────────────────────────────
    make  = _first(row, _MAKE_FIELDS)
    model = _first(row, _MODEL_FIELDS)
    if make and model:
        return _get_recalls(make, model, result)

    # ── Mode 3: Guess make/model from product name ────────────────────────
    parts = [p for p in name.split() if len(p) > 1]
    if len(parts) >= 2:
        return _get_recalls(parts[0], " ".join(parts[1:3]), result)

    result["domain_status"] = "insufficient_data"
    return result


# ── Private helpers ──────────────────────────────────────────────────────────

def _decode_vin(vin: str, result: dict) -> dict:
    _wait()
    try:
        r = httpx.get(f"{_VPIC_BASE}/decodevin/{vin}?format=json", timeout=12)
        variables = {v["Variable"]: v["Value"] for v in r.json().get("Results", []) if v.get("Value")}
        result["vehicle_make"]       = variables.get("Make", "")
        result["vehicle_model"]      = variables.get("Model", "")
        result["vehicle_year"]       = variables.get("Model Year", "")
        result["vehicle_type"]       = variables.get("Vehicle Type", "")
        result["vehicle_fuel_type"]  = variables.get("Fuel Type - Primary", "")
        result["vehicle_body_class"] = variables.get("Body Class", "")
        result["vin_decoded"]        = True
        result["domain_status"]      = "enriched"
    except Exception as exc:
        logger.warning("vehicles._decode_vin: %s", exc)
        result["domain_status"] = "error"
        result["domain_error"]  = str(exc)[:120]
    return result


def _get_recalls(make: str, model: str, result: dict) -> dict:
    _wait()
    try:
        r = httpx.get(
            f"{_SAFETY_BASE}/recalls/recallsByVehicle",
            params={"make": make, "model": model},
            timeout=12,
        )
        recalls = r.json().get("results", [])
        result["vehicle_make"]  = make
        result["vehicle_model"] = model
        result["recall_count"]  = len(recalls)
        if recalls:
            latest = recalls[0]
            result["latest_recall_date"] = latest.get("ReportReceivedDate", "")[:10]
            result["latest_recall_desc"] = (latest.get("Summary") or "")[:250]
            result["latest_recall_component"] = latest.get("Component", "")
        result["domain_status"] = "enriched"
    except Exception as exc:
        logger.warning("vehicles._get_recalls: %s", exc)
        result["domain_status"] = "error"
        result["domain_error"]  = str(exc)[:120]
    return result


def _wait():
    global _LAST_CALL
    elapsed = time.time() - _LAST_CALL
    if elapsed < _MIN_INTERVAL:
        time.sleep(_MIN_INTERVAL - elapsed)
    _LAST_CALL = time.time()


def _first(row: dict, fields: list) -> str:
    for f in fields:
        v = row.get(f)
        if v and str(v).strip():
            return str(v).strip()
    return ""
