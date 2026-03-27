# ==============================================================
# Newsconseen Connector API Routes
# ==============================================================
# FastAPI endpoints for the Connectors UI and automation.
#
# Endpoints:
#   GET  /connectors/catalog          — list all connectors with status
#   GET  /connectors/catalog/{id}     — single connector metadata
#   POST /connectors/run              — execute a connector
#   POST /connectors/preview          — preview without loading to Base44
#   GET  /connectors/suggest-columns  — suggest column mappings for a file
#   POST /connectors/save-mapping     — save an operator taxonomy mapping
#   GET  /connectors/runs             — connector run history
# ==============================================================

import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Query, UploadFile, File, Form

from connectors.registry import (
    CONNECTOR_CATALOG,
    get_connector,
    list_available,
    list_by_category,
)
from connectors.mapping_engine import MappingEngine

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/connectors", tags=["Connectors"])


@router.get("/catalog")
def connector_catalog(
    category: Optional[str] = Query(None, description="Filter by category"),
    sprint:   Optional[int] = Query(None, description="Filter by sprint number"),
    status:   Optional[str] = Query(None, description="available, coming_soon"),
):
    """
    List all available connectors with metadata.
    Used by the Connectors UI to render the connector grid.
    """
    connectors = list_available()

    if category:
        connectors = [c for c in connectors if c["category"] == category]
    if sprint:
        connectors = [c for c in connectors if c["sprint"] == sprint]
    if status:
        connectors = [c for c in connectors if c["status"] == status]

    return {
        "connectors": connectors,
        "total":      len(connectors),
        "categories": list({c["category"] for c in connectors}),
    }


@router.get("/catalog/{connector_id}")
def connector_detail(connector_id: str):
    """Get metadata for a single connector."""
    connector = CONNECTOR_CATALOG.get(connector_id)
    if not connector:
        raise HTTPException(
            status_code=404,
            detail=f"Connector '{connector_id}' not found",
        )
    return connector


@router.post("/suggest-columns")
async def suggest_columns(
    file:          UploadFile = File(...),
    entity_type:   Optional[str] = Form(None),
    connector_id:  str = Form("excel"),
):
    """
    Upload a file and get suggested column mappings.

    Called by the Connectors UI before the operator confirms mappings.
    Returns both the suggested mappings and a preview of the first 5 rows.

    The operator reviews these suggestions in the UI, adjusts any
    incorrect mappings, then submits to /connectors/run.
    """
    content = await file.read()
    filename = file.filename or "upload.csv"

    try:
        from connectors.file.excel import ExcelConnector

        # Parse file to get columns and preview rows
        connector = ExcelConnector(
            company_id="preview",
            credentials={
                "file_content": content,
                "file_name":    filename,
                "entity_type":  entity_type,
            },
            mappings={},
        )

        raw_records = connector.extract()
        if not raw_records:
            raise HTTPException(status_code=400, detail="File is empty or could not be parsed")

        columns = list(raw_records[0].keys())

        # Auto-detect entity type if not provided
        detected_entity = entity_type or connector._detect_entity_type(columns)

        # Suggest column mappings
        suggestions = ExcelConnector.suggest_column_mappings(columns, detected_entity)

        return {
            "file_name":        filename,
            "row_count":        len(raw_records),
            "columns":          columns,
            "detected_entity":  detected_entity,
            "suggested_mappings": suggestions,
            "preview_rows":     raw_records[:5],
            "unmapped_columns": [c for c in columns if c not in suggestions],
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error("suggest_columns: failed — %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/run")
async def run_connector(
    company_id:    str = Form(...),
    connector_id:  str = Form(...),
    entity_type:   Optional[str] = Form(None),
    file:          Optional[UploadFile] = File(None),
    dry_run:       bool = Form(False),
):
    """
    Execute a connector run.

    For file-based connectors (excel, csv, google_sheets):
      - Upload the file via multipart form
      - Optionally specify entity_type

    For API-based connectors (mpesa, adp, etc.):
      - Credentials are loaded from ConnectorConfig in Base44
      - No file upload needed

    dry_run=True runs extract+transform but skips the load step.
    Use this to validate data before committing to Base44.
    """
    connector_class = get_connector(connector_id)
    if not connector_class:
        raise HTTPException(
            status_code=404,
            detail=f"Connector '{connector_id}' not found or not yet implemented",
        )

    credentials = {"entity_type": entity_type}

    # File-based connectors
    if file:
        content = await file.read()
        credentials["file_content"] = content
        credentials["file_name"]    = file.filename or "upload.csv"

    # Load saved operator mappings
    engine = MappingEngine(company_id=company_id)
    mappings = {
        f"{m['field_name']}:{m['source_value'].lower()}": m["taxonomy_value"]
        for m in []  # loaded from Base44 ConnectorMapping in MappingEngine
    }

    connector = connector_class(
        company_id=company_id,
        credentials=credentials,
        mappings=engine._mappings,
    )

    try:
        raw = connector.extract()
        if not raw:
            return {
                "status":    "skipped",
                "reason":    "no records extracted from source",
                "connector": connector_id,
                "company_id": company_id,
            }

        transformed = connector.transform(raw)

        if dry_run:
            total = sum(len(v) for v in transformed.values())
            return {
                "status":        "dry_run",
                "connector":     connector_id,
                "company_id":    company_id,
                "extracted":     len(raw),
                "would_create":  total,
                "unmapped":      connector.run_stats.get("unmapped", []),
                "preview":       {
                    k: v[:3] for k, v in transformed.items() if v
                },
            }

        result = connector.load(transformed)

        return {
            **result,
            "connector":  connector_id,
            "company_id": company_id,
            "unmapped":   connector.run_stats.get("unmapped", []),
        }

    except Exception as e:
        logger.error("run_connector: %s failed — %s", connector_id, e)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/save-mapping")
def save_taxonomy_mapping(payload: dict):
    """
    Save an operator-confirmed taxonomy mapping.

    Called when the operator resolves an unmapped value in the UI:
    "Mwalimu → staff/Teacher"

    Saves to ConnectorMapping entity in Base44 so all future
    syncs use this mapping automatically.

    Payload:
        company_id:     str
        field_name:     str  ("person_type", "person_subtype", etc.)
        source_value:   str  ("Mwalimu")
        taxonomy_value: str  ("Teacher")
        parent_value:   str  ("staff")  — optional
    """
    required = ["company_id", "field_name", "source_value", "taxonomy_value"]
    for field in required:
        if not payload.get(field):
            raise HTTPException(
                status_code=400,
                detail=f"Missing required field: {field}",
            )

    engine = MappingEngine(company_id=payload["company_id"])
    success = engine.save_mapping(
        source_value=payload["source_value"],
        field_name=payload["field_name"],
        taxonomy_value=payload["taxonomy_value"],
        parent_value=payload.get("parent_value"),
    )

    if not success:
        raise HTTPException(status_code=500, detail="Failed to save mapping")

    return {
        "status":        "saved",
        "field_name":    payload["field_name"],
        "source_value":  payload["source_value"],
        "taxonomy_value":payload["taxonomy_value"],
    }


@router.get("/categories")
def connector_categories():
    """List all connector categories with counts."""
    from collections import Counter
    cats = Counter(c["category"] for c in CONNECTOR_CATALOG.values())
    return {
        "categories": [
            {"id": cat, "count": count}
            for cat, count in cats.most_common()
        ]
    }
