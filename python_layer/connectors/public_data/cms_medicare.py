"""
CMS Medicare Part D Public Data Connector
==========================================
Fetches open data from the Centers for Medicare & Medicaid Services (CMS).

All endpoints use the CMS Open Payments / Part D public APIs — no API key required.

Available datasets:
  - Part D prescribers by provider       : drug prescribing patterns by NPI
  - Part D spending by drug              : national drug cost and utilisation
  - Provider of Services (pharmacy)      : CMS-certified pharmacy locations
  - Open Payments (pharma payments)      : payments from drug companies to providers

Usage:
  from connectors.public_data.cms_medicare import CMSMedicareConnector
  conn = CMSMedicareConnector()
  df = conn.get_pharmacy_providers(state="ME", limit=500)
"""

import logging
import urllib.request
import urllib.parse
import json
from typing import Optional

import pandas as pd

logger = logging.getLogger(__name__)

# CMS Socrata Open Data API base
CMS_SOCRATA_BASE = "https://data.cms.gov/resource"

# Dataset identifiers (Socrata resource IDs)
DATASETS = {
    # Provider of Services — includes pharmacies (type = 17)
    "pharmacy_providers":     "j94p-cdkn",
    # Part D prescribers by provider + drug (2022)
    "partd_prescribers":      "zzct-5vmy",
    # Part D drug spending 2022
    "partd_spending":         "4s6u-r4yg",
    # Open Payments — general payments to providers
    "open_payments":          "5xe5-bgxg",
    # Medicare utilization by provider
    "provider_utilization":   "7pus-r447",
}

HEADERS = {
    "User-Agent":    "newsconseen-public-data/1.0 (contact@newsconseen.com)",
    "Accept":        "application/json",
}


def _socrata_fetch(dataset_id: str, params: dict, limit: int = 100) -> list:
    """Fetch from CMS Socrata API with SoQL parameters."""
    base = f"{CMS_SOCRATA_BASE}/{dataset_id}.json"
    params["$limit"] = limit
    url = f"{base}?{urllib.parse.urlencode(params)}"
    try:
        req = urllib.request.Request(url, headers=HEADERS)
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read().decode())
    except Exception as e:
        logger.warning("CMS Socrata fetch failed (%s): %s", dataset_id, e)
        return []


class CMSMedicareConnector:
    """
    Fetches CMS Medicare open data for pharmacy market research.
    All data is publicly available — no authentication required.
    """

    def get_pharmacy_providers(
        self,
        state: Optional[str] = None,
        city: Optional[str] = None,
        limit: int = 200,
    ) -> pd.DataFrame:
        """
        Return CMS-certified pharmacy locations from Provider of Services file.
        Filters to pharmacy provider type (prvdr_ctgry_sbtyp_cd = '17').

        Args:
            state: Two-letter state code (e.g. "ME" for Maine)
            city:  City name filter
            limit: Max records

        Returns DataFrame with columns:
            npi, provider_name, address, city, state, zip, phone,
            certification_date, provider_type
        """
        params = {
            "$where": "prvdr_ctgry_sbtyp_cd='17'",
            "$select": (
                "npi,fac_name,st_adr,city_name,state_cd,zip_cd,"
                "phne_num,prvdr_ctgry_sbtyp_cd,crtfctn_dt"
            ),
        }
        if state:
            params["$where"] += f" AND state_cd='{state.upper()}'"
        if city:
            params["$where"] += f" AND upper(city_name)='{city.upper()}'"

        rows = _socrata_fetch(DATASETS["pharmacy_providers"], params, limit)
        if not rows:
            return pd.DataFrame()

        df = pd.DataFrame(rows).rename(columns={
            "fac_name":             "provider_name",
            "st_adr":               "address",
            "city_name":            "city",
            "state_cd":             "state",
            "zip_cd":               "zip",
            "phne_num":             "phone",
            "crtfctn_dt":           "certification_date",
            "prvdr_ctgry_sbtyp_cd": "provider_type",
        })
        logger.info("CMSMedicareConnector: %d pharmacy providers (state=%s)", len(df), state)
        return df

    def get_partd_drug_spending(
        self,
        drug_name: Optional[str] = None,
        limit: int = 100,
    ) -> pd.DataFrame:
        """
        Return Medicare Part D drug spending and utilisation data.
        Useful for understanding pharmacy revenue potential and drug mix.

        Returns: drug_name, total_spending, total_claims, total_beneficiaries,
                 avg_spending_per_claim, avg_spending_per_beneficiary
        """
        params = {
            "$select": (
                "brnd_name,gnrc_name,tot_spndng,tot_clms,tot_benes,"
                "avg_spnd_per_clm,avg_spnd_per_bene_wtop"
            ),
            "$order": "tot_spndng DESC",
        }
        if drug_name:
            params["$where"] = f"upper(brnd_name) LIKE '%{drug_name.upper()}%' OR upper(gnrc_name) LIKE '%{drug_name.upper()}%'"

        rows = _socrata_fetch(DATASETS["partd_spending"], params, limit)
        if not rows:
            return pd.DataFrame()

        df = pd.DataFrame(rows).rename(columns={
            "brnd_name":              "brand_name",
            "gnrc_name":              "generic_name",
            "tot_spndng":             "total_spending",
            "tot_clms":               "total_claims",
            "tot_benes":              "total_beneficiaries",
            "avg_spnd_per_clm":       "avg_spending_per_claim",
            "avg_spnd_per_bene_wtop": "avg_spending_per_beneficiary",
        })
        for col in ["total_spending", "total_claims", "total_beneficiaries",
                    "avg_spending_per_claim", "avg_spending_per_beneficiary"]:
            if col in df.columns:
                df[col] = pd.to_numeric(df[col], errors="coerce")
        logger.info("CMSMedicareConnector: %d Part D drug spending records", len(df))
        return df

    def get_prescriber_patterns(
        self,
        state: Optional[str] = None,
        drug_name: Optional[str] = None,
        limit: int = 100,
    ) -> pd.DataFrame:
        """
        Return Part D prescriber patterns — which providers prescribe which drugs.
        Useful for understanding prescribing density and referral opportunity.

        Returns: npi, provider_name, specialty, city, state, drug_name,
                 total_claims, total_day_supply, total_drug_cost
        """
        params = {
            "$select": (
                "prscrbr_npi,prscrbr_last_org_name,prscrbr_first_name,"
                "prscrbr_city,prscrbr_state_abrvtn,prscrbr_type,"
                "brnd_name,gnrc_name,tot_clms,tot_day_suply,tot_drug_cst"
            ),
            "$order": "tot_clms DESC",
        }
        where_clauses = []
        if state:
            where_clauses.append(f"prscrbr_state_abrvtn='{state.upper()}'")
        if drug_name:
            where_clauses.append(f"(upper(brnd_name) LIKE '%{drug_name.upper()}%' OR upper(gnrc_name) LIKE '%{drug_name.upper()}%')")
        if where_clauses:
            params["$where"] = " AND ".join(where_clauses)

        rows = _socrata_fetch(DATASETS["partd_prescribers"], params, limit)
        if not rows:
            return pd.DataFrame()

        df = pd.DataFrame(rows).rename(columns={
            "prscrbr_npi":            "npi",
            "prscrbr_last_org_name":  "last_name",
            "prscrbr_first_name":     "first_name",
            "prscrbr_city":           "city",
            "prscrbr_state_abrvtn":   "state",
            "prscrbr_type":           "specialty",
            "brnd_name":              "brand_name",
            "gnrc_name":              "generic_name",
            "tot_clms":               "total_claims",
            "tot_day_suply":          "total_day_supply",
            "tot_drug_cst":           "total_drug_cost",
        })
        for col in ["total_claims", "total_day_supply", "total_drug_cost"]:
            if col in df.columns:
                df[col] = pd.to_numeric(df[col], errors="coerce")
        logger.info("CMSMedicareConnector: %d prescriber pattern records", len(df))
        return df
