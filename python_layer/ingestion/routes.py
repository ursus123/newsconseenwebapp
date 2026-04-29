"""
ingestion/routes.py
FastAPI router for the Ontology Ingestion Agent.

POST /ingestion/upload   → extract + profile + fingerprint + analyse → returns plan (pending review)
GET  /ingestion/plan/{id} → fetch plan for operator review
POST /ingestion/approve/{id} → operator approves plan → queues loader
POST /ingestion/load/{id}   → execute approved plan (called by approve or directly)
GET  /ingestion/plans        → list plans for a company
GET  /ingestion/runs         → list run history for a company
GET  /ingestion/memory       → list remembered source schemas for a company
"""
import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse

from config.settings import get_settings
from database import get_engine_safe

from ingestion.extractors import excel as excel_extractor
from ingestion.extractors import json_xml as json_xml_extractor
from ingestion import profiler
from ingestion import fingerprint as fp_mod
from ingestion import analyser
from ingestion import memory as mem_mod
from ingestion import loader

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ingestion", tags=["ingestion"])

_PLAN_TABLE = "analytics.ingestion_plans"
_RUN_TABLE  = "analytics.ingestion_runs"
_MEM_TABLE  = "analytics.ingestion_memory"

_SUPPORTED_EXTENSIONS = {".csv", ".xlsx", ".xls", ".json", ".xml"}
_CONFIDENCE_AUTO_LOAD = 0.90   # plan auto-loads without review if all splits ≥ this
_CONFIDENCE_REVIEW    = 0.65   # plan requires review if any split ≥ this


def _ext(filename: str) -> str:
    return "." + filename.rsplit(".", 1)[-1].lower() if "." in filename else ""


def _get_extractor(filename: str):
    ext = _ext(filename)
    if ext in {".csv", ".xlsx", ".xls"}:
        return excel_extractor
    if ext in {".json", ".xml"}:
        return json_xml_extractor
    raise HTTPException(400, f"Unsupported file type: {ext}. Supported: {', '.join(_SUPPORTED_EXTENSIONS)}")


def _save_plan(engine, plan_dict: dict) -> None:
    if engine is None:
        return
    try:
        now = datetime.now(timezone.utc)
        with engine.begin() as conn:
            conn.execute(
                f"""INSERT INTO {_PLAN_TABLE}
                    (id, company_id, source_name, source_fingerprint, file_type,
                     row_count, plan_json, status, created_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                (
                    plan_dict["id"],
                    plan_dict["company_id"],
                    plan_dict["source_name"],
                    plan_dict["source_fingerprint"],
                    plan_dict["file_type"],
                    plan_dict["row_count"],
                    json.dumps(plan_dict["analysis"], default=str),
                    plan_dict["status"],
                    now,
                ),
            )
    except Exception as e:
        logger.warning("Could not save plan to DB: %s", e)


def _load_plan_row(engine, plan_id: str) -> dict | None:
    if engine is None:
        return None
    try:
        import pandas as pd
        df = pd.read_sql(
            f"SELECT * FROM {_PLAN_TABLE} WHERE id = %s LIMIT 1",
            engine, params=(plan_id,),
        )
        if df.empty:
            return None
        row = df.iloc[0].to_dict()
        row["analysis"] = json.loads(row.pop("plan_json", "{}") or "{}")
        return row
    except Exception as e:
        logger.warning("Could not load plan: %s", e)
        return None


# ── Routes ────────────────────────────────────────────────────────────────────

@router.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    company_id: str  = Form(...),
    source_name: str = Form(None),
):
    """
    Step 1 + 2 + 3 of the ingestion pipeline:
    Extract → Profile → Fingerprint → (Memory recall OR LLM Analyse) → Save plan

    Returns the plan JSON including entity_splits and field_map for operator review.
    """
    settings = get_settings()
    engine   = get_engine_safe()

    filename    = file.filename or "upload"
    source_name = source_name or filename
    file_bytes  = await file.read()
    ext         = _ext(filename)

    extractor   = _get_extractor(filename)
    try:
        extracted = extractor.extract(file_bytes, filename)
    except ValueError as e:
        raise HTTPException(422, str(e))

    if not extracted["columns"]:
        raise HTTPException(422, "No columns found in uploaded file.")

    columns     = extracted["columns"]
    rows        = extracted["rows"]
    sample_rows = extracted["sample_rows"]
    row_count   = extracted["row_count"]

    # Profile columns
    profiles    = profiler.profile(columns, rows)

    # Fingerprint
    fingerprint = fp_mod.generate(columns, profiles)

    # Memory recall — skip LLM if we've seen this schema before
    cached_mapping = mem_mod.recall(engine, company_id, fingerprint)
    if cached_mapping:
        analysis = cached_mapping
        from_memory = True
    else:
        if not settings.anthropic_api_key:
            raise HTTPException(503, "ANTHROPIC_API_KEY not configured — cannot analyse file.")
        analysis = analyser.analyse(
            source_name  = source_name,
            columns      = columns,
            profiles     = profiles,
            sample_rows  = sample_rows,
            row_count    = row_count,
            api_key      = settings.anthropic_api_key,
        )
        mem_mod.save(engine, company_id, fingerprint, source_name, analysis)
        from_memory = False

    # Determine status
    overall_conf = analysis.get("overall_confidence", 0.0)
    if overall_conf >= _CONFIDENCE_AUTO_LOAD:
        status = "approved"
    elif overall_conf >= _CONFIDENCE_REVIEW:
        status = "pending_review"
    else:
        status = "low_confidence"

    plan_id = str(uuid.uuid4())
    plan = {
        "id":                 plan_id,
        "company_id":         company_id,
        "source_name":        source_name,
        "source_fingerprint": fingerprint,
        "file_type":          ext,
        "row_count":          row_count,
        "status":             status,
        "analysis":           analysis,
        "from_memory":        from_memory,
        "column_profiles":    profiles,
    }

    _save_plan(engine, plan)

    # Store rows in memory for later loading (in production: use a temp store or presigned S3)
    # For Railway: store in DB as JSON blob on the plan record (handled by /load/{id} re-upload flow)
    # Here we return rows in the response for small files; caller should cache or re-upload for large ones.

    return {
        "plan_id":     plan_id,
        "status":      status,
        "from_memory": from_memory,
        "row_count":   row_count,
        "analysis":    analysis,
        "profiles":    profiles,
    }


@router.get("/plan/{plan_id}")
def get_plan(plan_id: str, company_id: str):
    """Fetch a plan for operator review."""
    engine = get_engine_safe()
    plan   = _load_plan_row(engine, plan_id)
    if not plan or plan.get("company_id") != company_id:
        raise HTTPException(404, "Plan not found.")
    return plan


@router.post("/approve/{plan_id}")
def approve_plan(plan_id: str, company_id: str):
    """Operator approves a pending_review plan."""
    engine = get_engine_safe()
    if engine is None:
        raise HTTPException(503, "Database unavailable.")
    try:
        now = datetime.now(timezone.utc)
        with engine.begin() as conn:
            conn.execute(
                f"UPDATE {_PLAN_TABLE} SET status = 'approved', reviewed_at = %s, reviewed_by = %s "
                "WHERE id = %s AND company_id = %s",
                (now, "operator", plan_id, company_id),
            )
    except Exception as e:
        raise HTTPException(500, f"Could not approve plan: {e}")
    return {"plan_id": plan_id, "status": "approved"}


@router.post("/load/{plan_id}")
async def load_plan(
    plan_id: str,
    company_id: str = Form(...),
    file: UploadFile = File(...),
):
    """
    Execute an approved plan.  The operator re-uploads the file (or the frontend
    re-submits cached bytes) so we can reconstruct the rows without a temp store.
    """
    settings = get_settings()
    engine   = get_engine_safe()

    db_plan = _load_plan_row(engine, plan_id)
    if not db_plan or db_plan.get("company_id") != company_id:
        raise HTTPException(404, "Plan not found.")
    if db_plan.get("status") not in ("approved", "pending_review"):
        raise HTTPException(409, f"Plan status is '{db_plan.get('status')}' — cannot load.")

    file_bytes = await file.read()
    filename   = file.filename or "upload"
    extractor  = _get_extractor(filename)
    try:
        extracted = extractor.extract(file_bytes, filename)
    except ValueError as e:
        raise HTTPException(422, str(e))

    if not settings.base44_api_url or not settings.base44_api_key:
        raise HTTPException(503, "BASE44 API not configured.")

    run_stats = loader.execute(
        plan           = db_plan["analysis"],
        rows           = extracted["rows"],
        company_id     = company_id,
        base44_api_url = settings.base44_api_url,
        api_key        = settings.base44_api_key,
        engine         = engine,
        plan_id        = plan_id,
    )

    return run_stats


@router.get("/plans")
def list_plans(company_id: str, status: str = None, limit: int = 50):
    """List ingestion plans for a company."""
    engine = get_engine_safe()
    if engine is None:
        return []
    try:
        import pandas as pd
        where = "WHERE company_id = %s"
        params: list = [company_id]
        if status:
            where += " AND status = %s"
            params.append(status)
        df = pd.read_sql(
            f"SELECT id, source_name, file_type, row_count, status, overall_confidence, "
            f"created_at, reviewed_at, loaded_at FROM {_PLAN_TABLE} {where} "
            f"ORDER BY created_at DESC LIMIT %s",
            engine, params=params + [limit],
        )
        return df.to_dict("records")
    except Exception as e:
        logger.warning("Could not list plans: %s", e)
        return []


@router.get("/runs")
def list_runs(company_id: str, limit: int = 50):
    """List ingestion run history for a company."""
    engine = get_engine_safe()
    if engine is None:
        return []
    try:
        import pandas as pd
        df = pd.read_sql(
            f"SELECT id, plan_id, status, rows_total, entities_created, entities_updated, "
            f"entities_failed, started_at, finished_at FROM {_RUN_TABLE} "
            f"WHERE company_id = %s ORDER BY started_at DESC LIMIT %s",
            engine, params=(company_id, limit),
        )
        return df.to_dict("records")
    except Exception as e:
        logger.warning("Could not list runs: %s", e)
        return []


@router.get("/memory")
def list_memory(company_id: str):
    """List remembered source schemas for a company."""
    engine = get_engine_safe()
    if engine is None:
        return []
    try:
        import pandas as pd
        df = pd.read_sql(
            f"SELECT source_fingerprint, source_name, use_count, last_used_at "
            f"FROM {_MEM_TABLE} WHERE company_id = %s ORDER BY use_count DESC",
            engine, params=(company_id,),
        )
        return df.to_dict("records")
    except Exception as e:
        logger.warning("Could not list memory: %s", e)
        return []
