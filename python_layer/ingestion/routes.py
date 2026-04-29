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
from fastapi.responses import JSONResponse, Response
from sqlalchemy import text

from config.settings import get_settings
from database import get_engine_safe

from ingestion.extractors import excel as excel_extractor
from ingestion.extractors import json_xml as json_xml_extractor
from ingestion import profiler
from ingestion import fingerprint as fp_mod
from ingestion import analyser
from ingestion import memory as mem_mod
from ingestion import loader
from ingestion import schema_registry

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


def _reconcile_fuzzy_mapping(
    cached: dict,
    columns: list[str],
    profiles: list[dict],
    sample_rows: list[dict],
    row_count: int,
    source_name: str,
    api_key: str | None,
) -> dict:
    """
    Reconcile a fuzzy-recalled mapping with the actual incoming columns:

      1. Prune field_map entries whose source_column no longer exists in the file.
      2. If new columns appear that aren't in the cached mapping AND an api_key is
         available, call the analyser for just those columns and merge the result.
         This ensures the returned plan is complete without paying for a full re-analysis.

    Args:
        cached:      The fuzzy-recalled analysis dict.
        columns:     Actual column names in the current upload.
        profiles:    Column profiles for the current upload.
        sample_rows: Sample rows from the current upload (list of dicts).
        api_key:     Anthropic API key; if None, new columns are annotated but not mapped.
    """
    cached_field_map = cached.get("field_map", [])
    cached_cols = {fm["source_column"] for fm in cached_field_map}
    incoming_set = set(columns)

    removed = cached_cols - incoming_set
    new     = incoming_set - cached_cols

    # Always prune removed columns — they'd silently produce empty field values
    pruned_map = [fm for fm in cached_field_map if fm["source_column"] not in removed]

    result = dict(cached)
    result["field_map"] = pruned_map

    # Annotate notes with what changed
    notes = result.get("analyst_notes", "") or ""
    if removed:
        notes += f" [pruned {len(removed)} removed columns: {', '.join(sorted(removed))}]"

    if not new:
        result["analyst_notes"] = notes.strip()
        return result

    if not api_key:
        # Can't analyse without a key — note the gap but return what we have
        notes += f" [{len(new)} new columns not mapped (no API key): {', '.join(sorted(new))}]"
        result["analyst_notes"] = notes.strip()
        return result

    # Run analyser on just the new columns
    try:
        delta_profiles = [p for p in profiles if p.get("column") in new]
        delta_samples  = [
            {k: v for k, v in row.items() if k in new}
            for row in sample_rows[:20]
        ]

        delta = analyser.analyse(
            source_name  = f"{source_name} [delta: {len(new)} new columns]",
            columns      = sorted(new),
            profiles     = delta_profiles,
            sample_rows  = delta_samples,
            row_count    = row_count,
            api_key      = api_key,
        )

        result["field_map"] = pruned_map + delta.get("field_map", [])

        # Merge any new entity_splits detected in delta (e.g. a new entity type appeared)
        existing_types = {s["entity_type"] for s in result.get("entity_splits", [])}
        for ds in delta.get("entity_splits", []):
            if ds["entity_type"] not in existing_types:
                result.setdefault("entity_splits", []).append(ds)

        notes += (
            f" [delta re-analysis: +{len(new)} new columns mapped"
            + (f", {len(removed)} removed" if removed else "")
            + f". {delta.get('analyst_notes', '')}]"
        )
        result["analyst_notes"] = notes.strip()

    except Exception as e:
        logger.warning("Delta re-analysis failed for new columns %s: %s", new, e)
        notes += f" [delta re-analysis failed ({len(new)} new columns unmapped): {e}]"
        result["analyst_notes"] = notes.strip()

    return result


def _save_plan(engine, plan_dict: dict, rows: list | None = None) -> None:
    if engine is None:
        return
    try:
        now           = datetime.now(timezone.utc)
        rows_json     = json.dumps(rows, default=str) if rows is not None else None
        overall_conf  = plan_dict["analysis"].get("overall_confidence")
        with engine.begin() as conn:
            conn.execute(
                text(f"""
                    INSERT INTO {_PLAN_TABLE}
                        (id, company_id, source_name, source_fingerprint, file_type,
                         row_count, plan_json, rows_json, status, overall_confidence, created_at)
                    VALUES
                        (:id, :company_id, :source_name, :source_fingerprint, :file_type,
                         :row_count, :plan_json, :rows_json, :status, :overall_confidence, :created_at)
                """),
                {
                    "id":                 plan_dict["id"],
                    "company_id":         plan_dict["company_id"],
                    "source_name":        plan_dict["source_name"],
                    "source_fingerprint": plan_dict["source_fingerprint"],
                    "file_type":          plan_dict["file_type"],
                    "row_count":          plan_dict["row_count"],
                    "plan_json":          json.dumps(plan_dict["analysis"], default=str),
                    "rows_json":          rows_json,
                    "status":             plan_dict["status"],
                    "overall_confidence": overall_conf,
                    "created_at":         now,
                },
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

    columns      = extracted["columns"]
    rows         = extracted["rows"]           # up to 50k rows — stored in rows_json
    sample_rows  = extracted["sample_rows"]
    row_count    = extracted["row_count"]      # actual total rows in file
    rows_capped  = extracted.get("rows_capped", False)
    analysis_rows = extracted.get("analysis_rows", rows)  # up to 5k for profiler

    # Profile columns using analysis_rows (capped subset for speed)
    profiles    = profiler.profile(columns, analysis_rows)

    # Fingerprint
    fingerprint = fp_mod.generate(columns, profiles)

    # Memory recall — exact fingerprint first, then fuzzy column overlap.
    # Fuzzy hits are reconciled: removed columns pruned, new columns re-analysed.
    # NOTE: memory is saved only AFTER a successful load (not here at analysis time)
    # so that bad mappings never get persisted.
    cached_mapping = mem_mod.recall_fuzzy(engine, company_id, columns, fingerprint)
    if cached_mapping:
        analysis = _reconcile_fuzzy_mapping(
            cached_mapping, columns, profiles, sample_rows, row_count,
            source_name, settings.anthropic_api_key,
        )
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
        from_memory = False

    # Validate LLM field_map against canonical entity schemas
    analysis = schema_registry.annotate_analysis(analysis)

    # Surface row-cap warning in analyst_notes when file was truncated
    if rows_capped:
        cap_note = (
            f"[Warning: file has {row_count:,} rows — only the first 50,000 are stored and will be loaded. "
            "Export a filtered/split file to load additional rows.]"
        )
        analysis["analyst_notes"] = (
            (analysis.get("analyst_notes") or "") + " " + cap_note
        ).strip()

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

    # Persist rows in DB so copilot can trigger load without re-upload.
    # rows_json is capped at 5000 rows × columns. For very large files this
    # could be ~10MB of JSON — acceptable on Railway PostgreSQL.
    _save_plan(engine, plan, rows=rows)

    return {
        "plan_id":     plan_id,
        "status":      status,
        "from_memory": from_memory,
        "row_count":   row_count,
        "rows_stored": extracted.get("rows_stored", len(rows)),
        "rows_capped": rows_capped,
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
                text(
                    f"UPDATE {_PLAN_TABLE} "
                    "SET status = 'approved', reviewed_at = :reviewed_at, reviewed_by = :reviewed_by "
                    "WHERE id = :id AND company_id = :company_id"
                ),
                {"reviewed_at": now, "reviewed_by": "operator", "id": plan_id, "company_id": company_id},
            )
    except Exception as e:
        raise HTTPException(500, f"Could not approve plan: {e}")
    return {"plan_id": plan_id, "status": "approved"}


@router.post("/load/{plan_id}")
async def load_plan(
    plan_id: str,
    company_id: str = Form(...),
    file: UploadFile | None = File(None),
    duplicate_action: str = Form("skip"),
):
    """
    Execute an approved plan.

    Row resolution order (first wins):
      1. Fresh file upload — if the caller provides a file, use it (most current data).
      2. Cached rows_json  — rows stored at upload time; enables copilot-triggered load
         and approve-then-load-later without requiring the original file bytes.

    The file parameter is therefore optional. Callers that cannot re-supply the file
    (e.g. the copilot tool loop, approval workflows) may omit it.

    duplicate_action: "skip" (default) — existing matching records are left unchanged.
                      "update" — incoming fields are merged onto the existing record.
    """
    settings = get_settings()
    engine   = get_engine_safe()

    db_plan = _load_plan_row(engine, plan_id)
    if not db_plan or db_plan.get("company_id") != company_id:
        raise HTTPException(404, "Plan not found.")

    plan_status = db_plan.get("status", "")
    if plan_status == "low_confidence":
        raise HTTPException(
            409,
            "This plan has low confidence and cannot be loaded. "
            "Review and edit the field mapping, then approve it before loading.",
        )
    if plan_status not in ("approved",):
        raise HTTPException(
            409,
            f"Plan status is '{plan_status}' — approve the plan at "
            f"POST /ingestion/approve/{plan_id} before loading.",
        )

    # ── Resolve rows ──────────────────────────────────────────────────────────
    rows: list[dict] | None = None

    if file is not None:
        # Fresh upload takes priority
        file_bytes = await file.read()
        filename   = file.filename or "upload"
        extractor  = _get_extractor(filename)
        try:
            extracted = extractor.extract(file_bytes, filename)
        except ValueError as e:
            raise HTTPException(422, str(e))
        rows = extracted["rows"]
        logger.info("load_plan %s: using %d rows from uploaded file", plan_id, len(rows))
    else:
        # Fall back to cached rows_json written at upload time
        rows_json_str = db_plan.get("rows_json")
        if rows_json_str:
            try:
                rows = json.loads(rows_json_str)
                logger.info("load_plan %s: using %d cached rows from DB", plan_id, len(rows))
            except Exception as e:
                logger.warning("load_plan: could not parse rows_json: %s", e)

        if rows is None:
            raise HTTPException(
                422,
                "No cached rows found for this plan and no file was uploaded. "
                "Re-upload the original file or ensure rows were saved at analysis time.",
            )

    if not settings.base44_api_url or not settings.base44_api_key:
        raise HTTPException(503, "BASE44 API not configured.")

    run_stats = loader.execute(
        plan             = db_plan["analysis"],
        rows             = rows,
        company_id       = company_id,
        base44_api_url   = settings.base44_api_url,
        api_key          = settings.base44_api_key,
        engine           = engine,
        plan_id          = plan_id,
        duplicate_action = duplicate_action,
    )

    # Save mapping to memory only after a clean load — prevents bad mappings
    # from being memorised before they've been proven to work.
    if run_stats.get("entities_failed", 0) == 0:
        fingerprint = db_plan.get("source_fingerprint", "")
        source_name = db_plan.get("source_name", "")
        if fingerprint:
            mem_mod.save(engine, company_id, fingerprint, source_name, db_plan["analysis"])

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


@router.post("/from-connector")
async def ingest_from_connector(request: dict):
    """
    Accept rows from a connector run and pipe them through the full ingestion
    pipeline (profile → fingerprint → memory recall / LLM analyse → load).

    Body:
      company_id   str            — tenant
      source_name  str            — e.g. "QuickBooks sync — 2026-04-29"
      rows         list[dict]     — flat row dicts from connector.transform()
      auto_load    bool = False   — if True and confidence ≥ threshold, load immediately

    Returns the plan JSON (same shape as /upload), plus run stats if auto_load triggered.
    """
    from pydantic import BaseModel
    company_id  = request.get("company_id", "")
    source_name = request.get("source_name", "connector import")
    rows        = request.get("rows", [])
    auto_load   = request.get("auto_load", False)

    settings = get_settings()
    engine   = get_engine_safe()

    if not rows:
        raise HTTPException(422, "No rows provided.")
    if not company_id:
        raise HTTPException(422, "company_id is required.")

    # Derive columns from first row keys
    columns = list(rows[0].keys()) if rows else []
    if not columns:
        raise HTTPException(422, "Rows have no columns.")

    sample_rows = rows[:20]
    row_count   = len(rows)

    profiles    = profiler.profile(columns, rows)
    fingerprint = fp_mod.generate(columns, profiles)

    cached_mapping = mem_mod.recall_fuzzy(engine, company_id, columns, fingerprint)
    if cached_mapping:
        analysis = _reconcile_fuzzy_mapping(
            cached_mapping, columns, profiles, sample_rows[:20], row_count,
            source_name, settings.anthropic_api_key,
        )
        from_memory = True
    else:
        if not settings.anthropic_api_key:
            raise HTTPException(503, "ANTHROPIC_API_KEY not configured.")
        analysis = analyser.analyse(
            source_name  = source_name,
            columns      = columns,
            profiles     = profiles,
            sample_rows  = sample_rows,
            row_count    = row_count,
            api_key      = settings.anthropic_api_key,
        )
        # Memory saved only after successful load — not here
        from_memory = False

    # Validate LLM field_map against canonical entity schemas
    analysis = schema_registry.annotate_analysis(analysis)

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
        "file_type":          "connector",
        "row_count":          row_count,
        "status":             status,
        "analysis":           analysis,
        "from_memory":        from_memory,
    }
    _save_plan(engine, plan, rows=rows)

    result = {
        "plan_id":     plan_id,
        "status":      status,
        "from_memory": from_memory,
        "row_count":   row_count,
        "analysis":    analysis,
    }

    # Auto-load if confidence is high enough and caller requested it
    # Only "approved" status auto-loads — pending_review requires explicit operator approval
    if auto_load and status == "approved":
        if not settings.base44_api_url or not settings.base44_api_key:
            result["auto_load_skipped"] = "BASE44 API not configured"
        else:
            run_stats = loader.execute(
                plan           = analysis,
                rows           = rows,
                company_id     = company_id,
                base44_api_url = settings.base44_api_url,
                api_key        = settings.base44_api_key,
                engine         = engine,
                plan_id        = plan_id,
            )
            # Save mapping to memory only after a clean load
            if run_stats.get("entities_failed", 0) == 0:
                mem_mod.save(engine, company_id, fingerprint, source_name, analysis)
            result["run_stats"] = run_stats

    return result


# ── Webhook endpoint ──────────────────────────────────────────────────────────

@router.get("/template/{entity_type}.csv")
def download_template(entity_type: str):
    """
    Download a blank CSV import template for any entity type.
    Used by the copilot generate_import_template tool and the manual import flow.
    """
    import csv, io as _io
    entity_cap = entity_type.capitalize()
    if entity_cap not in schema_registry.ENTITY_FIELDS:
        raise HTTPException(404, f"Unknown entity type: {entity_type}")

    fields = sorted(schema_registry.ENTITY_FIELDS[entity_cap] - {"company_id"})
    sample: dict[str, str] = {}
    for f in fields:
        if "date" in f:
            sample[f] = "2025-01-15"
        elif f in {"amount", "price", "cost", "stock_quantity", "reorder_point",
                   "weight_kg", "area_ha", "numeric_value", "strength"}:
            sample[f] = "0.00"
        elif f in {"is_primary", "is_anomaly"}:
            sample[f] = "false"
        elif f.endswith("_id"):
            sample[f] = ""
        else:
            sample[f] = f"example_{f}"

    buf = _io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=fields)
    writer.writeheader()
    writer.writerow(sample)

    return Response(
        content=buf.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={entity_type.lower()}_import_template.csv"},
    )


@router.post("/webhook/receive")
async def receive_webhook(
    request: dict,
    x_api_key: str | None = None,
):
    """
    Accept a JSON push from any external system and pipe it through the ingestion pipeline.

    Body:
      company_id   str           — tenant
      source_name  str           — label for this data source (e.g. "CRM push — contacts")
      rows         list[dict]    — flat row dicts
      auto_load    bool = False  — if True and confidence ≥ threshold, load immediately

    Returns the plan JSON (same shape as /from-connector), plus run_stats if auto_load triggered.

    Callers authenticate with the standard x-api-key header (same as all other endpoints).
    Webhook payloads are always piped through analysis → review; auto_load defaults to False
    so that an external push never writes data without operator review unless explicitly opted in.
    """
    # Delegate to from_connector which has identical logic
    return await ingest_from_connector(request)


# ── Scheduled re-ingestion ────────────────────────────────────────────────────

_SCHEDULE_TABLE = "analytics.ingestion_schedules"


@router.post("/schedule")
def create_schedule(
    company_id:         str  = Form(...),
    source_fingerprint: str  = Form(...),
    source_name:        str  = Form(...),
    cron_expression:    str  = Form("0 6 * * 1"),   # default: every Monday 06:00
    auto_approve:       bool = Form(False),
):
    """
    Register a recurring re-ingestion schedule for a known source schema.

    When triggered (by the Phase 7 cron runner or POST /ingestion/schedule/trigger),
    the pipeline recalls the memorised mapping for source_fingerprint and either:
      - auto_approve=False (default): creates a pending_review plan for operator sign-off
      - auto_approve=True: auto-loads if confidence ≥ 0.90

    The schedule stores the source_fingerprint, not the file. The operator must supply
    fresh rows by pointing the connector / webhook to POST /ingestion/webhook/receive
    or POST /ingestion/from-connector with the same source_name.

    cron_expression: standard 5-field cron (minute hour dom month dow).
    """
    engine = get_engine_safe()
    if engine is None:
        raise HTTPException(503, "Database unavailable.")

    schedule_id = str(uuid.uuid4())
    try:
        now = datetime.now(timezone.utc)
        with engine.begin() as conn:
            conn.execute(
                text(f"""
                    INSERT INTO {_SCHEDULE_TABLE}
                        (id, company_id, source_fingerprint, source_name,
                         cron_expression, auto_approve, status, created_at)
                    VALUES
                        (:id, :company_id, :source_fingerprint, :source_name,
                         :cron_expression, :auto_approve, 'active', :created_at)
                    ON CONFLICT (company_id, source_fingerprint)
                    DO UPDATE SET
                        cron_expression = EXCLUDED.cron_expression,
                        auto_approve    = EXCLUDED.auto_approve,
                        source_name     = EXCLUDED.source_name,
                        status          = 'active'
                """),
                {
                    "id":                 schedule_id,
                    "company_id":         company_id,
                    "source_fingerprint": source_fingerprint,
                    "source_name":        source_name,
                    "cron_expression":    cron_expression,
                    "auto_approve":       auto_approve,
                    "created_at":         now,
                },
            )
    except Exception as e:
        raise HTTPException(500, f"Could not save schedule: {e}")

    return {
        "schedule_id":        schedule_id,
        "company_id":         company_id,
        "source_fingerprint": source_fingerprint,
        "source_name":        source_name,
        "cron_expression":    cron_expression,
        "auto_approve":       auto_approve,
        "status":             "active",
    }


@router.get("/schedules")
def list_schedules(company_id: str):
    """List active re-ingestion schedules for a company."""
    engine = get_engine_safe()
    if engine is None:
        return []
    try:
        import pandas as pd
        df = pd.read_sql(
            f"SELECT * FROM {_SCHEDULE_TABLE} WHERE company_id = %s AND status = 'active' ORDER BY created_at DESC",
            engine, params=(company_id,),
        )
        return df.to_dict("records")
    except Exception as e:
        logger.warning("Could not list schedules: %s", e)
        return []


@router.delete("/schedule/{schedule_id}")
def delete_schedule(schedule_id: str, company_id: str):
    """Deactivate a re-ingestion schedule."""
    engine = get_engine_safe()
    if engine is None:
        raise HTTPException(503, "Database unavailable.")
    try:
        with engine.begin() as conn:
            conn.execute(
                text(f"UPDATE {_SCHEDULE_TABLE} SET status = 'inactive' WHERE id = :id AND company_id = :cid"),
                {"id": schedule_id, "cid": company_id},
            )
    except Exception as e:
        raise HTTPException(500, f"Could not deactivate schedule: {e}")
    return {"schedule_id": schedule_id, "status": "inactive"}
