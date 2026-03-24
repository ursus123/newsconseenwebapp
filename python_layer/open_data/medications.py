# open_data/medications.py
# ============================================================
# Newsconseen Medication Integration
# Sources:
#   - RxNorm API (NIH) — drug names, RxCUI codes, dose forms
#   - OpenFDA API     — drug recalls, labels, adverse events
# No API key required for either source.
# Rate limits: RxNorm 20 req/sec, OpenFDA 240 req/min
# ============================================================

import requests
import time
import logging
from typing import Optional
from functools import lru_cache

logger = logging.getLogger(__name__)

# ------------------------------------------------------------
# Base URLs
# ------------------------------------------------------------
RXNORM_BASE = "https://rxnav.nlm.nih.gov/REST"
OPENFDA_BASE = "https://api.fda.gov/drug"

# Term types we care about:
# IN  = Ingredient (generic, e.g. "metformin")
# SCD = Semantic Clinical Drug (generic + strength + form,
#       e.g. "metformin 500 MG Oral Tablet")
# SBD = Semantic Branded Drug (branded,
#       e.g. "metformin 500 MG Oral Tablet [Glucophage]")
# BN  = Brand Name only (e.g. "Glucophage")
RELEVANT_TTY = {"IN", "SCD", "SBD", "BN"}


# ============================================================
# 1. MEDICATION SEARCH
# ============================================================

def search_medications(query: str, limit: int = 20) -> list[dict]:
    """
    Search for medications by name using RxNorm.

    Returns a clean list of medication options suitable for
    an autocomplete dropdown in the Newsconseen Item Form.

    Args:
        query: Drug name to search (e.g. "metformin", "tylenol")
        limit: Max results to return (default 20)

    Returns:
        List of dicts with keys:
            rxcui, name, synonym, tty, tty_label, is_generic, is_branded
    """
    if not query or len(query.strip()) < 2:
        return []

    try:
        response = requests.get(
            f"{RXNORM_BASE}/drugs.json",
            params={"name": query.strip()},
            timeout=10,
            headers={"Accept": "application/json"},
        )
        response.raise_for_status()
        data = response.json()

        concept_groups = (
            data.get("drugGroup", {}).get("conceptGroup", [])
        )

        results = []
        for group in concept_groups:
            tty = group.get("tty", "")
            if tty not in RELEVANT_TTY:
                continue

            concepts = group.get("conceptProperties", [])
            for concept in concepts:
                results.append({
                    "rxcui":      concept.get("rxcui", ""),
                    "name":       concept.get("name", ""),
                    "synonym":    concept.get("synonym", ""),
                    "tty":        tty,
                    "tty_label":  _tty_label(tty),
                    "is_generic": tty in {"IN", "SCD"},
                    "is_branded": tty in {"SBD", "BN"},
                })

        # Sort: generics first, then branded, then alphabetical
        results.sort(key=lambda x: (not x["is_generic"], x["name"]))

        return results[:limit]

    except requests.RequestException as e:
        logger.error(f"RxNorm search failed for '{query}': {e}")
        return []


# ============================================================
# 2. MEDICATION DETAIL (by RxCUI)
# ============================================================

@lru_cache(maxsize=500)
def get_medication_detail(rxcui: str) -> dict:
    """
    Get full detail for a medication by its RxCUI.

    Cached in memory — same drug won't be fetched twice
    in the same session.

    Returns:
        Dict with name, ingredients, dose_forms, strengths,
        brand_names, ndc_codes, drug_classes
    """
    if not rxcui:
        return {}

    detail = {
        "rxcui":        rxcui,
        "name":         "",
        "ingredients":  [],
        "dose_forms":   [],
        "strengths":    [],
        "brand_names":  [],
        "ndc_codes":    [],
        "drug_classes": [],
    }

    try:
        # --- Name ---
        name_resp = requests.get(
            f"{RXNORM_BASE}/rxcui/{rxcui}/property.json",
            params={"propName": "RxNorm Name"},
            timeout=10,
        )
        name_resp.raise_for_status()
        props = (
            name_resp.json()
            .get("propConceptGroup", {})
            .get("propConcept", [])
        )
        if props:
            detail["name"] = props[0].get("propValue", "")

        # --- Related concepts (ingredients, dose forms, brands) ---
        related_resp = requests.get(
            f"{RXNORM_BASE}/rxcui/{rxcui}/allrelated.json",
            timeout=10,
        )
        related_resp.raise_for_status()
        all_related = (
            related_resp.json()
            .get("allRelatedGroup", {})
            .get("conceptGroup", [])
        )

        for group in all_related:
            tty = group.get("tty", "")
            concepts = group.get("conceptProperties", [])
            names = [c.get("name", "") for c in concepts if c.get("name")]

            if tty == "IN":
                detail["ingredients"] = names
            elif tty == "DF":
                detail["dose_forms"] = names
            elif tty == "BN":
                detail["brand_names"] = names

        # --- NDC codes ---
        ndc_resp = requests.get(
            f"{RXNORM_BASE}/rxcui/{rxcui}/ndcs.json",
            timeout=10,
        )
        ndc_resp.raise_for_status()
        detail["ndc_codes"] = (
            ndc_resp.json()
            .get("ndcGroup", {})
            .get("ndcList", {})
            .get("ndc", [])
        )[:10]  # Limit to 10 NDCs

        # --- Drug classes (ATC) ---
        class_resp = requests.get(
            f"{RXNORM_BASE}/rxclass/class/byRxcui.json",
            params={"rxcui": rxcui},
            timeout=10,
        )
        class_resp.raise_for_status()
        drug_infos = (
            class_resp.json()
            .get("rxclassDrugInfoList", {})
            .get("rxclassDrugInfo", [])
        )
        detail["drug_classes"] = list({
            info["rxclassMinConceptItem"]["className"]
            for info in drug_infos
            if info.get("rxclassMinConceptItem", {}).get("classType", "") == "ATC1-4"
        })

    except requests.RequestException as e:
        logger.error(f"RxNorm detail failed for rxcui '{rxcui}': {e}")

    return detail


# ============================================================
# 3. DRUG INTERACTION CHECK
# ============================================================

def check_interactions(rxcui_list: list[str]) -> list[dict]:
    """
    Check for drug-drug interactions across a list of RxCUIs.

    Use this when a patient has multiple medications — pass all
    their current RxCUIs to check for any dangerous combinations.

    Args:
        rxcui_list: List of RxCUI strings (at least 2)

    Returns:
        List of interaction dicts with keys:
            drug1, drug2, severity, description, source
    """
    if len(rxcui_list) < 2:
        return []

    rxcui_str = "+".join(rxcui_list)
    interactions = []

    try:
        response = requests.get(
            f"{RXNORM_BASE}/interaction/list.json",
            params={"rxcuis": rxcui_str},
            timeout=15,
        )
        response.raise_for_status()
        data = response.json()

        full_interaction_list = (
            data.get("fullInteractionTypeGroup", [])
        )

        for group in full_interaction_list:
            source = group.get("sourceName", "")
            for interaction_type in group.get("fullInteractionType", []):
                comment = interaction_type.get("comment", "")
                for pair in interaction_type.get("interactionPair", []):
                    severity = pair.get("severity", "unknown")
                    description = pair.get("description", "")
                    concepts = pair.get("interactionConcept", [])

                    drug_names = [
                        c.get("minConceptItem", {}).get("name", "")
                        for c in concepts
                    ]

                    interactions.append({
                        "drug1":       drug_names[0] if len(drug_names) > 0 else "",
                        "drug2":       drug_names[1] if len(drug_names) > 1 else "",
                        "severity":    severity,
                        "description": description,
                        "comment":     comment,
                        "source":      source,
                        "is_serious":  severity.lower() in {"high", "major"},
                    })

    except requests.RequestException as e:
        logger.error(f"Interaction check failed for {rxcui_list}: {e}")

    # Sort by severity: serious first
    interactions.sort(key=lambda x: not x["is_serious"])
    return interactions


# ============================================================
# 4. FDA RECALL CHECK
# ============================================================

def check_fda_recalls(drug_name: str, limit: int = 5) -> list[dict]:
    """
    Check OpenFDA for active drug recalls by name.

    Use this to flag any inventory item that may have been recalled.

    Args:
        drug_name: Name of the drug to check
        limit: Max results (default 5)

    Returns:
        List of recall dicts with keys:
            product_description, reason_for_recall, status,
            recall_initiation_date, recalling_firm, classification,
            voluntary_mandated, affected_lots
    """
    if not drug_name:
        return []

    try:
        response = requests.get(
            f"{OPENFDA_BASE}/enforcement.json",
            params={
                "search": f'product_description:"{drug_name}"',
                "limit":  limit,
            },
            timeout=10,
        )

        # 404 means no recalls found — not an error
        if response.status_code == 404:
            return []

        response.raise_for_status()
        results = response.json().get("results", [])

        return [
            {
                "product_description":    r.get("product_description", ""),
                "reason_for_recall":      r.get("reason_for_recall", ""),
                "status":                 r.get("status", ""),
                "recall_initiation_date": r.get("recall_initiation_date", ""),
                "recalling_firm":         r.get("recalling_firm", ""),
                "classification":         r.get("classification", ""),
                "voluntary_mandated":     r.get("voluntary_mandated", ""),
                "affected_lots":          r.get("code_info", ""),
                "is_active":              r.get("status", "").upper() == "ONGOING",
            }
            for r in results
        ]

    except requests.RequestException as e:
        logger.error(f"FDA recall check failed for '{drug_name}': {e}")
        return []


# ============================================================
# 5. MEDICATION LABEL (full prescribing information)
# ============================================================

def get_medication_label(drug_name: str) -> dict:
    """
    Get structured prescribing information from OpenFDA DailyMed.

    Returns dosage instructions, warnings, contraindications,
    storage requirements, and adverse reactions.

    Args:
        drug_name: Generic or brand name

    Returns:
        Dict with label sections — warnings, dosage,
        contraindications, storage, adverse_reactions
    """
    if not drug_name:
        return {}

    try:
        response = requests.get(
            f"{OPENFDA_BASE}/label.json",
            params={
                "search": f'openfda.brand_name:"{drug_name}" '
                          f'OR openfda.generic_name:"{drug_name}"',
                "limit":  1,
            },
            timeout=10,
        )

        if response.status_code == 404:
            return {}

        response.raise_for_status()
        results = response.json().get("results", [])
        if not results:
            return {}

        label = results[0]

        def first(key: str) -> str:
            val = label.get(key, [])
            return val[0] if val else ""

        return {
            "warnings":           first("warnings"),
            "dosage_and_admin":   first("dosage_and_administration"),
            "contraindications":  first("contraindications"),
            "adverse_reactions":  first("adverse_reactions"),
            "storage_conditions": first("storage_and_handling"),
            "drug_interactions":  first("drug_interactions"),
            "pregnancy_category": first("pregnancy"),
            "pediatric_use":      first("pediatric_use"),
            "description":        first("description"),
        }

    except requests.RequestException as e:
        logger.error(f"FDA label fetch failed for '{drug_name}': {e}")
        return {}


# ============================================================
# 6. APPROXIMATE MATCH (fuzzy search)
# ============================================================

def approximate_search(query: str, max_entries: int = 10) -> list[dict]:
    """
    Fuzzy medication search — useful when the user misspells
    a drug name or only remembers part of it.

    Uses RxNorm's approximateTerm endpoint which handles
    typos and partial matches better than exact search.

    Args:
        query: Partial or misspelled drug name
        max_entries: Max results

    Returns:
        List of dicts with rxcui, name, score
    """
    if not query:
        return []

    try:
        response = requests.get(
            f"{RXNORM_BASE}/approximateTerm.json",
            params={
                "term":       query.strip(),
                "maxEntries": max_entries,
            },
            timeout=10,
        )
        response.raise_for_status()

        candidates = (
            response.json()
            .get("approximateGroup", {})
            .get("candidate", [])
        )

        return [
            {
                "rxcui": c.get("rxcui", ""),
                "name":  c.get("name", ""),
                "score": int(c.get("score", 0)),
            }
            for c in candidates
        ]

    except requests.RequestException as e:
        logger.error(f"Approximate search failed for '{query}': {e}")
        return []


# ============================================================
# HELPERS
# ============================================================

def _tty_label(tty: str) -> str:
    """Convert RxNorm TTY code to human-readable label."""
    return {
        "IN":  "Generic Ingredient",
        "SCD": "Generic Drug (with strength & form)",
        "SBD": "Branded Drug (with strength & form)",
        "BN":  "Brand Name",
        "DF":  "Dose Form",
        "MIN": "Multiple Ingredients",
    }.get(tty, tty)
