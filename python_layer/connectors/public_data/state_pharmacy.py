"""
State Pharmacy License Connector
===================================
Fetches state pharmacy board license data.

Sources (all free, no key required):
1. NABP e-Profile Connect — National Association of Boards of Pharmacy
   provides a public pharmacy locator API
2. Maine Board of Pharmacy — direct state data via Maine Open Data Portal
   (Socrata-based, same as most US state data portals)
3. Generic US state open data portal fallback (Socrata) for other states

Maine-specific data (ME):
  - Licensed pharmacies from maine.gov open data
  - License status, expiry, address, pharmacist-in-charge

Generic state fallback:
  - NABP public pharmacy locator (nationwide coverage)

Usage:
  from connectors.public_data.state_pharmacy import StatePharmacyConnector
  conn = StatePharmacyConnector()
  df = conn.get_licensed_pharmacies("ME")
"""

import logging
import urllib.request
import urllib.parse
import json
from typing import Optional

import pandas as pd

logger = logging.getLogger(__name__)

HEADERS = {
    "User-Agent": "newsconseen-public-data/1.0 (contact@newsconseen.com)",
    "Accept":     "application/json",
}

# Maine Open Data Portal (Socrata)
MAINE_OPEN_DATA = "https://data.maine.gov/resource"

# NABP pharmacy locator API (public)
NABP_LOCATOR   = "https://nabp.pharmacy/wp-json/nabp/v1/pharmacies"

# US state open data Socrata endpoints — add more as discovered
STATE_SOCRATA = {
    "ME": "data.maine.gov",
    "MA": "data.mass.gov",
    "NH": "data.nh.gov",
    "VT": "data.vermont.gov",
    "CT": "data.ct.gov",
    "RI": "data.ri.gov",
    "NY": "data.ny.gov",
    "CA": "data.ca.gov",
}

# Maine pharmacy license dataset (Maine DHHS / Board of Pharmacy)
MAINE_PHARMACY_DATASET = "pharmacies-licensed"  # dataset identifier


class StatePharmacyConnector:
    """
    Fetches state pharmacy board license data.
    Supports Maine directly; other states via NABP or state Socrata portals.
    """

    def get_licensed_pharmacies(
        self,
        state: str,
        city: Optional[str] = None,
        active_only: bool = True,
        limit: int = 500,
    ) -> pd.DataFrame:
        """
        Return licensed pharmacies for a state.
        Tries Maine-specific open data first, then NABP locator, then NPPES.

        Args:
            state:       Two-letter state code (e.g. "ME")
            city:        Optional city filter
            active_only: Filter to active licenses only
            limit:       Max records

        Returns DataFrame with columns:
            license_number, facility_name, address, city, state, zip,
            phone, license_type, license_status, expiration_date,
            pharmacist_in_charge (where available)
        """
        state = state.upper()

        # ── Maine-specific ────────────────────────────────────────────────
        if state == "ME":
            df = self._get_maine_pharmacies(city=city, active_only=active_only, limit=limit)
            if not df.empty:
                return df

        # ── NABP public locator (all states) ─────────────────────────────
        df = self._get_nabp_pharmacies(state=state, city=city, limit=limit)
        if not df.empty:
            return df

        # ── Final fallback: NPPES NPI registry ───────────────────────────
        try:
            from connectors.public_data.dea_registrant import DEARegistrantConnector
            dea = DEARegistrantConnector()
            df = dea.get_pharmacies_by_state(state, city=city, limit=limit)
            if not df.empty:
                df = df.rename(columns={"organization_name": "facility_name", "address_1": "address"})
                df["license_type"]   = "NPI-Registered Pharmacy"
                df["license_status"] = "active"
                return df
        except Exception as e:
            logger.warning("StatePharmacyConnector NPPES fallback failed: %s", e)

        return pd.DataFrame()

    def _get_maine_pharmacies(
        self,
        city: Optional[str] = None,
        active_only: bool = True,
        limit: int = 500,
    ) -> pd.DataFrame:
        """Fetch from Maine Open Data Portal."""
        try:
            # Try Maine DHHS licensed facilities (Socrata)
            params: dict = {"$limit": limit, "$select": "*"}
            if city:
                params["$where"] = f"upper(city) LIKE '%{city.upper()}%'"
            if active_only:
                existing_where = params.get("$where", "")
                status_clause = "upper(status) = 'ACTIVE' OR upper(license_status) = 'ACTIVE'"
                params["$where"] = f"{existing_where} AND ({status_clause})" if existing_where else f"({status_clause})"

            # Try multiple possible Maine dataset IDs
            for dataset_id in ["pharmacies", "pharmacy-license", "licensed-pharmacies", "dhhs-pharmacy"]:
                url = f"https://{STATE_SOCRATA['ME']}/resource/{dataset_id}.json?{urllib.parse.urlencode(params)}"
                try:
                    req = urllib.request.Request(url, headers=HEADERS)
                    with urllib.request.urlopen(req, timeout=8) as resp:
                        rows = json.loads(resp.read().decode())
                    if rows and isinstance(rows, list) and len(rows) > 0:
                        df = pd.DataFrame(rows)
                        logger.info("StatePharmacyConnector: %d Maine pharmacies from %s", len(df), dataset_id)
                        return self._normalize_license_df(df, "ME")
                except Exception:
                    continue
        except Exception as e:
            logger.warning("StatePharmacyConnector Maine portal failed: %s", e)
        return pd.DataFrame()

    def _get_nabp_pharmacies(
        self,
        state: str,
        city: Optional[str] = None,
        limit: int = 200,
    ) -> pd.DataFrame:
        """Fetch from NABP public pharmacy locator."""
        try:
            params: dict = {"state": state, "limit": limit}
            if city:
                params["city"] = city
            url = f"{NABP_LOCATOR}?{urllib.parse.urlencode(params)}"
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=10) as resp:
                data = json.loads(resp.read().decode())
            pharmacies = data if isinstance(data, list) else data.get("pharmacies", data.get("results", []))
            if not pharmacies:
                return pd.DataFrame()
            df = pd.DataFrame(pharmacies)
            logger.info("StatePharmacyConnector: %d NABP pharmacies for %s", len(df), state)
            return self._normalize_license_df(df, state)
        except Exception as e:
            logger.warning("StatePharmacyConnector NABP failed: %s", e)
            return pd.DataFrame()

    def _normalize_license_df(self, df: pd.DataFrame, state: str) -> pd.DataFrame:
        """
        Normalize column names to a consistent schema regardless of source.
        Different portals use different field names for the same concepts.
        """
        # Map common variations to canonical names
        rename = {}
        cols_lower = {c.lower(): c for c in df.columns}

        field_map = {
            "facility_name":      ["facility_name", "name", "business_name", "pharmacy_name", "organization_name", "dba_name"],
            "license_number":     ["license_number", "license_no", "license_num", "lic_num", "permit_number"],
            "address":            ["address", "address_1", "street_address", "street", "addr"],
            "city":               ["city", "city_name", "municipality"],
            "zip":                ["zip", "zip_code", "postal_code", "zipcode"],
            "phone":              ["phone", "telephone", "phone_number", "telephone_number"],
            "license_status":     ["license_status", "status", "lic_status", "active_status"],
            "expiration_date":    ["expiration_date", "exp_date", "expire_date", "license_expiry"],
            "license_type":       ["license_type", "type", "permit_type", "facility_type"],
        }

        for canonical, candidates in field_map.items():
            if canonical not in df.columns:
                for candidate in candidates:
                    if candidate in cols_lower:
                        rename[cols_lower[candidate]] = canonical
                        break

        if rename:
            df = df.rename(columns=rename)

        if "state" not in df.columns:
            df["state"] = state

        # Keep only known columns that exist
        keep = [c for c in [
            "license_number", "facility_name", "address", "city", "state", "zip",
            "phone", "license_type", "license_status", "expiration_date",
            "pharmacist_in_charge", "latitude", "longitude",
        ] if c in df.columns]

        return df[keep] if keep else df

    def get_license_summary(self, state: str) -> dict:
        """
        Return summary statistics for pharmacy licenses in a state.
        Used for quick market sizing.
        """
        df = self.get_licensed_pharmacies(state)
        if df.empty:
            return {"state": state, "total": 0, "active": 0, "by_city": {}}

        total  = len(df)
        active = int((df.get("license_status", pd.Series()).str.upper() == "ACTIVE").sum()) if "license_status" in df.columns else total

        by_city = {}
        if "city" in df.columns:
            by_city = df["city"].value_counts().head(20).to_dict()

        return {
            "state":   state,
            "total":   total,
            "active":  active,
            "by_city": by_city,
            "source":  "state_pharmacy_board",
        }
