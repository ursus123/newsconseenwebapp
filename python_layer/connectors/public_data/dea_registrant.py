"""
DEA Registrant Database Connector
===================================
Fetches DEA-licensed pharmacy and practitioner registrant data.

The DEA does not provide a direct public REST API, but the registrant
database is published via the ARCOS (Automation of Reports and Consolidated
Orders System) public data portal and through the DOJ / DEA FOIA releases.

This connector uses:
1. DEA ARCOS public download endpoint (pharmacy retail dispensing data)
2. CMS NPI registry (NPPES) as a proxy for licensed pharmacy locations
   when direct DEA data is unavailable

ARCOS data: retail pharmacy dispensing at county level
  - opioid and other controlled substance volumes by county/state
  - useful for Maine pharmacy market analysis (opioid crisis context)

NPPES (NPI registry): covers all DEA-registered pharmacies that also
  have NPI numbers (virtually all retail pharmacies do).

Usage:
  from connectors.public_data.dea_registrant import DEARegistrantConnector
  conn = DEARegistrantConnector()
  df = conn.get_pharmacies_by_state("ME")
"""

import logging
import urllib.request
import urllib.parse
import json
from typing import Optional

import pandas as pd

logger = logging.getLogger(__name__)

# CMS NPPES NPI Registry (public, no key required)
NPPES_BASE = "https://npiregistry.cms.hhs.gov/api"

# ARCOS public data via CORGIS / Washington Post ARCOS API (research use)
ARCOS_BASE = "https://arcos-api.ext.nile.works/v1"

HEADERS = {
    "User-Agent": "newsconseen-public-data/1.0 (contact@newsconseen.com)",
    "Accept":     "application/json",
}


class DEARegistrantConnector:
    """
    Fetches DEA-associated pharmacy data via NPPES NPI registry and ARCOS.
    All data is publicly available — no authentication required.
    """

    def get_pharmacies_by_state(
        self,
        state: str,
        city: Optional[str] = None,
        limit: int = 200,
    ) -> pd.DataFrame:
        """
        Return pharmacy locations from CMS NPPES NPI registry.
        Taxonomy code 3336C0003X = Community/Retail Pharmacy.

        Args:
            state: Two-letter state code (e.g. "ME")
            city:  Optional city filter
            limit: Max records (NPPES max per call = 200)

        Returns DataFrame with columns:
            npi, organization_name, address_1, city, state, zip,
            phone, taxonomy_code, taxonomy_desc, enumeration_date
        """
        params = {
            "taxonomy_description": "pharmacy",
            "state":                state.upper(),
            "limit":                min(limit, 200),
            "skip":                 0,
            "version":              "2.1",
            "enumeration_type":     "NPI-2",  # organisations only
        }
        if city:
            params["city"] = city

        url = f"{NPPES_BASE}/?{urllib.parse.urlencode(params)}"
        try:
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=15) as resp:
                data = json.loads(resp.read().decode())
        except Exception as e:
            logger.warning("DEARegistrantConnector NPPES failed: %s", e)
            return pd.DataFrame()

        results = data.get("results", [])
        if not results:
            logger.info("DEARegistrantConnector: no results for state=%s", state)
            return pd.DataFrame()

        rows = []
        for r in results:
            basic = r.get("basic", {})
            addresses = r.get("addresses", [{}])
            primary_addr = next((a for a in addresses if a.get("address_purpose") == "LOCATION"), addresses[0] if addresses else {})
            taxonomies = r.get("taxonomies", [{}])
            primary_tax = next((t for t in taxonomies if t.get("primary")), taxonomies[0] if taxonomies else {})
            rows.append({
                "npi":              r.get("number"),
                "organization_name": basic.get("organization_name") or f"{basic.get('first_name','')} {basic.get('last_name','')}".strip(),
                "address_1":        primary_addr.get("address_1", ""),
                "city":             primary_addr.get("city", ""),
                "state":            primary_addr.get("state", state),
                "zip":              primary_addr.get("postal_code", ""),
                "phone":            primary_addr.get("telephone_number", ""),
                "taxonomy_code":    primary_tax.get("code", ""),
                "taxonomy_desc":    primary_tax.get("desc", ""),
                "enumeration_date": basic.get("enumeration_date", ""),
                "status":           basic.get("status", ""),
            })

        df = pd.DataFrame(rows)
        logger.info("DEARegistrantConnector: %d pharmacies in %s", len(df), state)
        return df

    def get_opioid_dispensing_by_county(
        self,
        state: str,
        year: Optional[int] = None,
    ) -> pd.DataFrame:
        """
        Return opioid dispensing volume by county from ARCOS public data.
        Critical context for pharmacy market analysis in states like Maine
        where opioid dispensing patterns significantly affect pharmacy economics.

        Args:
            state: Two-letter state abbreviation (e.g. "ME")
            year:  Optional year filter (2006–2019 available in ARCOS)

        Returns DataFrame with columns:
            county, state, year, drug_name, total_dosage_units, total_grams
        """
        try:
            params: dict = {"state": state.upper()}
            if year:
                params["year"] = year
            url = f"{ARCOS_BASE}/combined_county_annual?{urllib.parse.urlencode(params)}"
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=15) as resp:
                raw = json.loads(resp.read().decode())
        except Exception as e:
            logger.warning("DEARegistrantConnector ARCOS failed: %s", e)
            return pd.DataFrame()

        if not raw:
            return pd.DataFrame()

        df = pd.DataFrame(raw)
        # Normalise column names — ARCOS uses various casings
        df.columns = [c.lower().replace(" ", "_") for c in df.columns]
        logger.info("DEARegistrantConnector: %d ARCOS county records for %s", len(df), state)
        return df

    def get_pharmacy_count_by_city(
        self,
        state: str,
    ) -> pd.DataFrame:
        """
        Aggregate pharmacy count by city for a state.
        Convenience method built on get_pharmacies_by_state().
        """
        df = self.get_pharmacies_by_state(state, limit=200)
        if df.empty or "city" not in df.columns:
            return pd.DataFrame()
        return (
            df.groupby("city")
            .size()
            .reset_index(name="pharmacy_count")
            .sort_values("pharmacy_count", ascending=False)
        )
