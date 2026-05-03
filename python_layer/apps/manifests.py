"""
apps/manifests.py

Python mirror of src/components/applications/appManifests.js.
Contains only the requiredMasterData for each app — enough for server-side
readiness scoring. Keep in sync with the JS file when new apps are added.

Keys in each requirement dict:
  key   — one of: staff_exist | clients_exist | products_exist | enterprise_exist
  label — human-readable description shown to the operator
"""

APP_REQUIREMENTS: dict = {

    # ── HR & People ──────────────────────────────────────────────────────────────

    "clockinout": [
        {"key": "staff_exist",      "label": "Staff members added"},
        {"key": "enterprise_exist", "label": "Work locations set up"},
    ],
    "leaverequest": [
        {"key": "staff_exist", "label": "Staff members added"},
    ],
    "staffschedule": [
        {"key": "staff_exist",      "label": "Staff members added"},
        {"key": "enterprise_exist", "label": "Work locations set up"},
    ],
    "expenseclaim": [
        {"key": "staff_exist", "label": "Staff members added"},
    ],
    "performancereview": [
        {"key": "staff_exist", "label": "Staff members added"},
    ],
    "trainingtracker": [
        {"key": "staff_exist", "label": "Staff members added"},
    ],

    # ── Inventory & Assets ───────────────────────────────────────────────────────

    "barcodescanner": [
        {"key": "products_exist", "label": "Products/inventory items added"},
    ],
    "stockcounter": [
        {"key": "products_exist", "label": "Products/inventory items added"},
    ],
    "purchaseorder": [
        {"key": "products_exist",   "label": "Products/inventory items added"},
        {"key": "enterprise_exist", "label": "Supplier/enterprise records set up"},
    ],
    "assetregister": [
        {"key": "enterprise_exist", "label": "Locations/departments set up"},
    ],
    "goodsreceived": [
        {"key": "products_exist", "label": "Products/inventory items added"},
    ],
    "assetmaintenance": [
        {"key": "products_exist",   "label": "Assets added to products"},
        {"key": "enterprise_exist", "label": "Locations set up"},
    ],

    # ── Healthcare ───────────────────────────────────────────────────────────────

    "medadmin": [
        {"key": "clients_exist",  "label": "Patients/clients added"},
        {"key": "products_exist", "label": "Medications added to products"},
    ],
    "incidentreport": [
        {"key": "staff_exist", "label": "Staff members added"},
    ],
    "careplan": [
        {"key": "clients_exist", "label": "Patients/clients added"},
    ],
    "temperaturelog": [
        {"key": "enterprise_exist", "label": "Locations/areas set up"},
    ],
    "fluidintakelog": [
        {"key": "clients_exist", "label": "Patients/clients added"},
    ],
    "woundcarelog": [
        {"key": "clients_exist", "label": "Patients/clients added"},
    ],

    # ── Field & Operations ───────────────────────────────────────────────────────

    "visitorlog": [
        {"key": "enterprise_exist", "label": "Locations/sites set up"},
    ],
    "deliverytracker": [
        {"key": "products_exist", "label": "Products/items added"},
    ],
    "vehiclelog": [
        {"key": "staff_exist", "label": "Staff/drivers added"},
    ],
    "fieldvisitreport": [
        {"key": "clients_exist",    "label": "Clients/beneficiaries added"},
        {"key": "enterprise_exist", "label": "Client locations set up"},
    ],
    "shifthandover": [
        {"key": "staff_exist",      "label": "Staff members added"},
        {"key": "enterprise_exist", "label": "Work locations set up"},
    ],
    "maintenancerequest": [
        {"key": "enterprise_exist", "label": "Locations/facilities set up"},
    ],

    # ── Tools & Utilities (no requirements) ──────────────────────────────────────

    "pdftoexcel": [],

    # ── Finance & Admin ──────────────────────────────────────────────────────────

    "pettycashlog":   [],
    "receiptscanner": [],
    "budgettracker": [
        {"key": "enterprise_exist", "label": "Departments/cost centres set up"},
    ],
    "donationtracker": [],

    # ── Compliance & Quality ─────────────────────────────────────────────────────

    "inspectionchecklist": [
        {"key": "enterprise_exist", "label": "Locations/facilities set up"},
    ],
    "licensetracker": [
        {"key": "enterprise_exist", "label": "Business/entity records set up"},
    ],
    "documentexpiry": [
        {"key": "enterprise_exist", "label": "Business/entity records set up"},
    ],
    "cleaningschedule": [
        {"key": "enterprise_exist", "label": "Areas/locations set up"},
    ],

    # ── Education ────────────────────────────────────────────────────────────────

    "attendanceregister": [
        {"key": "clients_exist",    "label": "Students/members added"},
        {"key": "enterprise_exist", "label": "Classes/groups set up"},
    ],
    "feecollection": [
        {"key": "clients_exist", "label": "Students added"},
    ],
    "librarylog": [
        {"key": "clients_exist",  "label": "Students/members added"},
        {"key": "products_exist", "label": "Books/resources added to products"},
    ],
}


def check_readiness(app_id: str, entity_counts: dict) -> dict:
    """
    Pure function — mirrors checkAppReadiness() in appManifests.js.

    entity_counts: { staff_exist, clients_exist, products_exist, enterprise_exist }
    Returns: { ready: bool, score: 0–100, missing: list[str] }
    """
    requirements = APP_REQUIREMENTS.get(app_id, [])
    if not requirements:
        return {"ready": True, "score": 100, "missing": []}

    missing = [r["label"] for r in requirements if not entity_counts.get(r["key"], 0)]
    score   = round(((len(requirements) - len(missing)) / len(requirements)) * 100)
    return {"ready": len(missing) == 0, "score": score, "missing": missing}
