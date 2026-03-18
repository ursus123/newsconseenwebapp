# open_data/medication_routes.py
# ============================================================
# FastAPI routes for medication integration.
# Add these to app.py by importing and including the router.
# ============================================================

from fastapi import APIRouter, HTTPException, Query
from open_data.medications import (
    search_medications,
    get_medication_detail,
    check_interactions,
    check_fda_recalls,
    get_medication_label,
    approximate_search,
)

router = APIRouter(prefix="/medications", tags=["Medications"])


# ----------------------------------------------------------
# Search medications by name
# GET /medications/search?q=metformin
# ----------------------------------------------------------
@router.get("/search")
def medication_search(
    q: str = Query(..., min_length=2, description="Drug name to search"),
    limit: int = Query(20, ge=1, le=50),
):
    """
    Search for medications by name.
    Returns a list suitable for autocomplete in the Item Form.

    Example: GET /medications/search?q=metformin
    """
    results = search_medications(q, limit=limit)
    if not results:
        return {"query": q, "results": [], "count": 0}
    return {"query": q, "results": results, "count": len(results)}


# ----------------------------------------------------------
# Fuzzy / approximate search
# GET /medications/approximate?q=metformin
# ----------------------------------------------------------
@router.get("/approximate")
def medication_approximate(
    q: str = Query(..., min_length=2, description="Partial or misspelled drug name"),
    limit: int = Query(10, ge=1, le=20),
):
    """
    Fuzzy search — handles typos and partial names.
    Use this as fallback when exact search returns nothing.

    Example: GET /medications/approximate?q=metfromin
    """
    results = approximate_search(q, max_entries=limit)
    return {"query": q, "results": results, "count": len(results)}


# ----------------------------------------------------------
# Get full medication detail by RxCUI
# GET /medications/detail/861819
# ----------------------------------------------------------
@router.get("/detail/{rxcui}")
def medication_detail(rxcui: str):
    """
    Get full detail for a medication by RxCUI.
    Returns name, ingredients, dose forms, brand names,
    NDC codes, and drug classes.

    Example: GET /medications/detail/861819
    """
    detail = get_medication_detail(rxcui)
    if not detail or not detail.get("name"):
        raise HTTPException(
            status_code=404,
            detail=f"No medication found for RxCUI '{rxcui}'"
        )
    return detail


# ----------------------------------------------------------
# Check drug interactions
# POST /medications/interactions
# Body: {"rxcuis": ["861819", "1049502"]}
# ----------------------------------------------------------
@router.post("/interactions")
def medication_interactions(payload: dict):
    """
    Check for drug-drug interactions across multiple RxCUIs.
    Use when a patient has multiple medications.

    Body: {"rxcuis": ["rxcui1", "rxcui2", ...]}

    Returns list of interactions sorted by severity (serious first).
    """
    rxcuis = payload.get("rxcuis", [])
    if len(rxcuis) < 2:
        raise HTTPException(
            status_code=400,
            detail="At least 2 RxCUI values required to check interactions."
        )

    interactions = check_interactions(rxcuis)
    serious = [i for i in interactions if i["is_serious"]]
    moderate = [i for i in interactions if not i["is_serious"]]

    return {
        "rxcuis":           rxcuis,
        "total":            len(interactions),
        "serious_count":    len(serious),
        "interactions":     interactions,
        "has_serious":      len(serious) > 0,
    }


# ----------------------------------------------------------
# Check FDA recalls by drug name
# GET /medications/recalls?name=metformin
# ----------------------------------------------------------
@router.get("/recalls")
def medication_recalls(
    name: str = Query(..., min_length=2, description="Drug name to check for recalls"),
    limit: int = Query(5, ge=1, le=20),
):
    """
    Check OpenFDA for active drug recalls.
    Use to flag inventory items that may have been recalled.

    Example: GET /medications/recalls?name=metformin
    """
    recalls = check_fda_recalls(name, limit=limit)
    active = [r for r in recalls if r["is_active"]]

    return {
        "drug_name":     name,
        "total_recalls": len(recalls),
        "active_recalls": len(active),
        "has_active_recall": len(active) > 0,
        "recalls":       recalls,
    }


# ----------------------------------------------------------
# Get medication label (prescribing info)
# GET /medications/label?name=metformin
# ----------------------------------------------------------
@router.get("/label")
def medication_label(
    name: str = Query(..., min_length=2, description="Drug name"),
):
    """
    Get full prescribing information from FDA DailyMed.
    Returns warnings, dosage, contraindications, storage,
    adverse reactions.

    Example: GET /medications/label?name=metformin
    """
    label = get_medication_label(name)
    if not label:
        raise HTTPException(
            status_code=404,
            detail=f"No label found for '{name}'"
        )
    return {"drug_name": name, "label": label}


# ----------------------------------------------------------
# Convenience: full medication info in one call
# GET /medications/full?q=metformin
# ----------------------------------------------------------
@router.get("/full")
def medication_full(
    q: str = Query(..., min_length=2, description="Drug name"),
):
    """
    Get everything about a drug in one call:
    search results + label + recalls.

    Designed for the Item Form's medication selector — when a
    user picks a drug, this endpoint auto-fills all fields.

    Example: GET /medications/full?q=metformin
    """
    # Search
    search_results = search_medications(q, limit=5)

    # Get detail for the top generic result
    detail = {}
    top_rxcui = None
    for r in search_results:
        if r["is_generic"] and r["rxcui"]:
            top_rxcui = r["rxcui"]
            detail = get_medication_detail(top_rxcui)
            break

    # Label
    label = get_medication_label(q)

    # Recalls
    recalls = check_fda_recalls(q, limit=3)
    active_recalls = [r for r in recalls if r["is_active"]]

    return {
        "query":             q,
        "top_rxcui":         top_rxcui,
        "search_results":    search_results,
        "detail":            detail,
        "label":             label,
        "recalls":           recalls,
        "has_active_recall": len(active_recalls) > 0,
        "active_recall_count": len(active_recalls),
    }