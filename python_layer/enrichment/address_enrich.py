"""
enrichment/address_enrich.py
-----------------------------
Enrich Address records with geocoordinates, timezone, and admin hierarchy.
Uses OSM Nominatim (forward/reverse geocode) + timezonefinder (offline).
Writes to analytics.address_enrichment — one row per address.
"""

import logging
import pandas as pd

from enrichment.geocoder import enrich_address

logger = logging.getLogger(__name__)

# Possible column names for address components across different operators
_STREET_FIELDS  = ["street_address", "address_line1", "address_line_1", "street", "address"]
_CITY_FIELDS    = ["city", "town", "locality"]
_REGION_FIELDS  = ["region", "state", "province", "county"]
_COUNTRY_FIELDS = ["country", "country_name"]
_LAT_FIELDS     = ["latitude",  "lat"]
_LON_FIELDS     = ["longitude", "lon", "lng"]
_POSTCODE_FIELDS = ["postcode", "postal_code", "zip_code", "zip"]


def enrich_addresses(addresses_df: pd.DataFrame, company_id: str, force: bool = False, **_kwargs) -> pd.DataFrame:
    """
    For each address in company_id:
      - If lat/lon present: reverse geocode for admin hierarchy + timezone
      - Else: build address string and forward geocode
    Returns DataFrame ready for analytics.address_enrichment.
    """
    if addresses_df.empty:
        return pd.DataFrame()

    addrs = addresses_df[addresses_df["company_id"] == company_id].copy() \
            if "company_id" in addresses_df.columns else addresses_df.copy()
    if addrs.empty:
        return pd.DataFrame()

    rows = []
    for _, a in addrs.iterrows():
        row: dict = {
            "company_id":  company_id,
            "address_id":  str(a.get("id", "") or ""),
            "entity_type": str(a.get("entity_type", "") or ""),
            "entity_name": str(a.get("entity_name", a.get("person_name", a.get("enterprise_name", ""))) or ""),
        }

        # ── Try using existing coordinates ─────────────────────────────────────
        lat = _numeric(a, _LAT_FIELDS)
        lon = _numeric(a, _LON_FIELDS)

        if lat is not None and lon is not None:
            result = enrich_address(lat=lat, lon=lon)
        else:
            # Build address string from components
            parts = [
                _str(a, _STREET_FIELDS),
                _str(a, _CITY_FIELDS),
                _str(a, _REGION_FIELDS),
                _str(a, _COUNTRY_FIELDS),
            ]
            addr_str = ", ".join(p for p in parts if p)
            if addr_str:
                result = enrich_address(address_str=addr_str)
            else:
                result = {"enrichment_status": "skipped", "reason": "no_address_data"}

        row.update(result)

        # ── Phase C: country risk (World Bank WGI) ─────────────────────────────
        try:
            from enrichment.compliance.country_risk import get_country_risk
            # Prefer iso2 from geocoder result, fall back to raw address field
            iso2 = row.get("country_code") or _str(a, _COUNTRY_FIELDS)[:2]
            if iso2 and len(iso2) == 2:
                risk = get_country_risk(iso2)
                if risk:
                    row["country_risk_score"] = risk.get("country_risk_score")
                    row["country_risk_label"] = risk.get("country_risk_label", "")
        except Exception as _ce:
            logger.debug("address Phase C country risk skipped: %s", _ce)

        row["enriched_at"] = pd.Timestamp.now(tz="UTC").isoformat()
        rows.append(row)

    logger.info("address_enrich: %d addresses processed (company=%s)", len(rows), company_id)
    return pd.DataFrame(rows)


def _str(row, fields: list) -> str:
    for f in fields:
        v = row.get(f)
        if v and str(v).strip():
            return str(v).strip()
    return ""


def _numeric(row, fields: list):
    for f in fields:
        v = row.get(f)
        if v is not None:
            try:
                f_val = float(v)
                if f_val != 0.0:
                    return f_val
            except (ValueError, TypeError):
                pass
    return None
