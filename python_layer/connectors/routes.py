# ==============================================================
# Newsconseen Connector API Routes
# ==============================================================
# FastAPI endpoints for the Connectors UI and automation.
#
# Endpoints:
#   GET  /connectors/catalog            — list all connectors with status
#   GET  /connectors/catalog/{id}       — single connector metadata
#   POST /connectors/run                — execute a connector
#   POST /connectors/preview            — preview without loading to Base44
#   GET  /connectors/suggest-columns    — suggest column mappings for a file
#   POST /connectors/save-mapping       — save an operator taxonomy mapping
#   GET  /connectors/runs               — connector run history
#   GET  /connectors/schedule           — list schedules for a company
#   POST /connectors/schedule           — save/update a connector schedule
#   DELETE /connectors/schedule/{id}    — remove a connector schedule
#   POST /connectors/run-scheduled      — trigger all due scheduled syncs (cron)
# ==============================================================

import json
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, HTTPException, Header, Query, UploadFile, File, Form
from pydantic import BaseModel

from connectors.registry import (
    CONNECTOR_CATALOG,
    get_connector,
    list_available,
    list_by_category,
)
from connectors.mapping_engine import MappingEngine

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/connectors", tags=["Connectors"])


# ── Schedule store ─────────────────────────────────────────────────────────────
# Primary: PostgreSQL connectors.schedules (survives redeploys).
# Fallback: in-memory dict (used when DB is unavailable — temporary only).
# Key: "{company_id}:{connector_id}"
_SCHEDULE_STORE: dict[str, dict] = {}

# Simple run log (also persisted to connectors.run_log when DB is available)
_RUN_LOG: list[dict] = []
_RUN_LOG_MAX = 500

_SCHEDULES_DDL = """
CREATE SCHEMA IF NOT EXISTS connectors;

CREATE TABLE IF NOT EXISTS connectors.schedules (
    key              TEXT PRIMARY KEY,       -- "{company_id}:{connector_id}"
    company_id       TEXT NOT NULL,
    connector_id     TEXT NOT NULL,
    connector_name   TEXT,
    frequency        TEXT NOT NULL DEFAULT 'manual',
    run_at_hour      INT  DEFAULT 0,
    run_at_day       INT  DEFAULT 1,
    entity_type      TEXT DEFAULT 'people',
    is_active        BOOLEAN DEFAULT TRUE,
    credentials_enc  TEXT,                   -- JSON, stored as-is (no PII in creds)
    next_run_at      TIMESTAMPTZ,
    last_run_at      TIMESTAMPTZ,
    created_at       TIMESTAMPTZ DEFAULT NOW(),
    updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS connectors.run_log (
    id           SERIAL PRIMARY KEY,
    company_id   TEXT NOT NULL,
    connector_id TEXT NOT NULL,
    triggered_by TEXT DEFAULT 'manual',
    status       TEXT NOT NULL,
    records_extracted INT DEFAULT 0,
    records_created   INT DEFAULT 0,
    records_updated   INT DEFAULT 0,
    error        TEXT,
    started_at   TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);
"""


def _ensure_schedule_tables() -> bool:
    """Create connectors.schedules and connectors.run_log if not present. Returns True on success."""
    from database import get_engine_safe
    from sqlalchemy import text
    engine = get_engine_safe()
    if not engine:
        return False
    try:
        with engine.connect() as conn:
            conn.execute(text(_SCHEDULES_DDL))
            conn.commit()
        return True
    except Exception as e:
        logger.debug("schedule tables setup skipped — %s", e)
        return False


def _db_load_schedules() -> dict[str, dict]:
    """Load all schedules from PostgreSQL into a dict keyed by '{company_id}:{connector_id}'."""
    from database import get_engine_safe
    from sqlalchemy import text
    engine = get_engine_safe()
    if not engine:
        return {}
    try:
        with engine.connect() as conn:
            rows = conn.execute(text("SELECT * FROM connectors.schedules")).fetchall()
            cols = conn.execute(text("SELECT * FROM connectors.schedules LIMIT 0")).keys()
        result = {}
        for row in rows:
            entry = dict(zip(cols, row))
            # Deserialise credentials
            creds_raw = entry.pop("credentials_enc", None)
            entry["credentials"] = json.loads(creds_raw) if creds_raw else None
            # Convert timestamps to ISO strings
            for ts_col in ("next_run_at", "last_run_at", "created_at", "updated_at"):
                val = entry.get(ts_col)
                if val and hasattr(val, "isoformat"):
                    entry[ts_col] = val.isoformat()
            result[entry["key"]] = entry
        return result
    except Exception as e:
        logger.debug("_db_load_schedules: %s", e)
        return {}


def _db_save_schedule(key: str, entry: dict) -> bool:
    """Upsert a schedule row into PostgreSQL. Returns True on success."""
    from database import get_engine_safe
    from sqlalchemy import text
    engine = get_engine_safe()
    if not engine:
        return False
    try:
        creds_enc = json.dumps(entry.get("credentials")) if entry.get("credentials") else None

        def _parse_ts(val):
            if not val:
                return None
            if hasattr(val, "isoformat"):
                return val
            try:
                return datetime.fromisoformat(str(val))
            except Exception:
                return None

        with engine.connect() as conn:
            conn.execute(text("""
                INSERT INTO connectors.schedules
                    (key, company_id, connector_id, connector_name, frequency,
                     run_at_hour, run_at_day, entity_type, is_active, credentials_enc,
                     next_run_at, last_run_at, updated_at)
                VALUES
                    (:key, :company_id, :connector_id, :connector_name, :frequency,
                     :run_at_hour, :run_at_day, :entity_type, :is_active, :creds,
                     :next_run_at, :last_run_at, NOW())
                ON CONFLICT (key) DO UPDATE SET
                    connector_name   = EXCLUDED.connector_name,
                    frequency        = EXCLUDED.frequency,
                    run_at_hour      = EXCLUDED.run_at_hour,
                    run_at_day       = EXCLUDED.run_at_day,
                    entity_type      = EXCLUDED.entity_type,
                    is_active        = EXCLUDED.is_active,
                    credentials_enc  = COALESCE(EXCLUDED.credentials_enc, connectors.schedules.credentials_enc),
                    next_run_at      = EXCLUDED.next_run_at,
                    last_run_at      = EXCLUDED.last_run_at,
                    updated_at       = NOW()
            """), {
                "key":            key,
                "company_id":     entry["company_id"],
                "connector_id":   entry["connector_id"],
                "connector_name": entry.get("connector_name", ""),
                "frequency":      entry.get("frequency", "manual"),
                "run_at_hour":    entry.get("run_at_hour", 0),
                "run_at_day":     entry.get("run_at_day", 1),
                "entity_type":    entry.get("entity_type", "people"),
                "is_active":      entry.get("is_active", True),
                "creds":          creds_enc,
                "next_run_at":    _parse_ts(entry.get("next_run_at")),
                "last_run_at":    _parse_ts(entry.get("last_run_at")),
            })
            conn.commit()
        return True
    except Exception as e:
        logger.warning("_db_save_schedule: %s", e)
        return False


def _db_delete_schedule(key: str) -> bool:
    from database import get_engine_safe
    from sqlalchemy import text
    engine = get_engine_safe()
    if not engine:
        return False
    try:
        with engine.connect() as conn:
            conn.execute(text("DELETE FROM connectors.schedules WHERE key = :k"), {"k": key})
            conn.commit()
        return True
    except Exception as e:
        logger.warning("_db_delete_schedule: %s", e)
        return False


def _db_append_run_log(entry: dict) -> None:
    from database import get_engine_safe
    from sqlalchemy import text
    engine = get_engine_safe()
    if not engine:
        return
    try:
        def _parse_ts(val):
            if not val:
                return None
            try:
                return datetime.fromisoformat(str(val))
            except Exception:
                return None
        with engine.connect() as conn:
            conn.execute(text("""
                INSERT INTO connectors.run_log
                    (company_id, connector_id, triggered_by, status,
                     records_extracted, records_created, records_updated,
                     error, started_at, completed_at)
                VALUES
                    (:company_id, :connector_id, :triggered_by, :status,
                     :extracted, :created, :updated,
                     :error, :started_at, :completed_at)
            """), {
                "company_id":   entry.get("company_id", ""),
                "connector_id": entry.get("connector_id", ""),
                "triggered_by": entry.get("triggered_by", "manual"),
                "status":       entry.get("status", "unknown"),
                "extracted":    entry.get("records_extracted", 0),
                "created":      entry.get("records_created", 0),
                "updated":      entry.get("records_updated", 0),
                "error":        entry.get("error"),
                "started_at":   _parse_ts(entry.get("started_at")),
                "completed_at": _parse_ts(entry.get("completed_at")),
            })
            conn.commit()
    except Exception as e:
        logger.debug("_db_append_run_log: %s", e)


def _get_schedule_store() -> dict[str, dict]:
    """
    Return the live schedule store.
    On first call (empty in-memory), load from PostgreSQL.
    Falls back to in-memory if DB is unavailable.
    """
    global _SCHEDULE_STORE
    if not _SCHEDULE_STORE:
        loaded = _db_load_schedules()
        if loaded:
            _SCHEDULE_STORE = loaded
            logger.info("schedules: loaded %d schedule(s) from PostgreSQL", len(loaded))
    return _SCHEDULE_STORE


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _compute_next_run(frequency: str, run_at_hour: int = 0, run_at_day: int = 1) -> str:
    """Compute the next UTC run time given a frequency string."""
    now = datetime.now(timezone.utc)
    if frequency == "hourly":
        return (now + timedelta(hours=1)).replace(minute=0, second=0, microsecond=0).isoformat()
    if frequency == "daily":
        nxt = now.replace(hour=run_at_hour, minute=0, second=0, microsecond=0)
        if nxt <= now:
            nxt += timedelta(days=1)
        return nxt.isoformat()
    if frequency == "weekly":
        # run_at_day: 0=Mon, 6=Sun
        days_ahead = (run_at_day - now.weekday()) % 7 or 7
        nxt = (now + timedelta(days=days_ahead)).replace(
            hour=run_at_hour, minute=0, second=0, microsecond=0
        )
        return nxt.isoformat()
    if frequency == "monthly":
        # run_at_day: day of month (1-31)
        nxt = now.replace(day=min(run_at_day, 28), hour=run_at_hour, minute=0, second=0, microsecond=0)
        if nxt <= now:
            # roll forward one month
            if now.month == 12:
                nxt = nxt.replace(year=now.year + 1, month=1)
            else:
                nxt = nxt.replace(month=now.month + 1)
        return nxt.isoformat()
    return ""   # "manual" — no automatic next run


class ConnectorScheduleConfig(BaseModel):
    company_id:     str
    connector_id:   str
    connector_name: Optional[str] = ""
    frequency:      str = "manual"   # manual | hourly | daily | weekly | monthly
    run_at_hour:    int = 0          # hour of day (UTC, 0-23)
    run_at_day:     int = 1          # 0=Mon…6=Sun for weekly; 1-31 for monthly
    entity_type:    Optional[str] = "people"
    is_active:      bool = True
    credentials:    Optional[dict] = None  # stored in-memory, never logged


@router.get("/schedule")
def get_schedules(company_id: str = Query(...)):
    """List all active connector schedules for a company. Credentials are stripped from responses."""
    store = _get_schedule_store()
    prefix = f"{company_id}:"
    schedules = []
    for k, v in store.items():
        if k.startswith(prefix):
            safe = {key: val for key, val in v.items() if key != "credentials"}
            safe["has_credentials"] = bool(v.get("credentials"))
            schedules.append(safe)
    return {"schedules": schedules}


@router.post("/schedule")
def save_schedule(config: ConnectorScheduleConfig):
    """
    Save or update the sync schedule for a connector.
    Persisted to PostgreSQL connectors.schedules — survives Railway redeploys.
    Falls back to in-memory if DB is unavailable.
    """
    _ensure_schedule_tables()
    store = _get_schedule_store()
    key = f"{config.company_id}:{config.connector_id}"
    entry = config.dict()
    entry["key"]         = key
    entry["created_at"]  = entry.get("created_at", _now_iso())
    entry["updated_at"]  = _now_iso()
    entry["next_run_at"] = _compute_next_run(
        config.frequency, config.run_at_hour, config.run_at_day
    )
    entry["last_run_at"] = store.get(key, {}).get("last_run_at")
    # Preserve previously stored credentials if none supplied this call
    if entry.get("credentials") is None:
        entry["credentials"] = store.get(key, {}).get("credentials")
    store[key] = entry

    # Persist to PostgreSQL — credentials stored alongside schedule config
    persisted = _db_save_schedule(key, entry)
    logger.info(
        "schedule saved: company=%s connector=%s freq=%s next=%s has_creds=%s db=%s",
        config.company_id, config.connector_id, config.frequency,
        entry["next_run_at"], bool(entry.get("credentials")), persisted,
    )
    safe = {k: v for k, v in entry.items() if k != "credentials"}
    return {"status": "saved", "persisted_to_db": persisted, **safe}


@router.delete("/schedule/{connector_id}")
def delete_schedule(connector_id: str, company_id: str = Query(...)):
    """Remove a connector schedule from both memory and PostgreSQL."""
    store = _get_schedule_store()
    key = f"{company_id}:{connector_id}"
    removed = store.pop(key, None)
    _db_delete_schedule(key)
    return {"status": "deleted" if removed else "not_found", "connector_id": connector_id}


@router.post("/run-scheduled")
def run_scheduled_connectors(x_cron_secret: Optional[str] = Header(None)):
    """
    Evaluate all active schedules and trigger any that are due.
    Called by Railway cron every hour: POST /connectors/run-scheduled
    Header: x-cron-secret

    Schedules and credentials are loaded from PostgreSQL connectors.schedules
    so this works correctly after Railway redeploys.
    """
    from config.settings import settings
    if not settings.cron_secret:
        raise HTTPException(status_code=503, detail="Cron endpoints disabled — set CRON_SECRET env var")
    if x_cron_secret != settings.cron_secret:
        raise HTTPException(status_code=401, detail="Invalid x-cron-secret")

    _ensure_schedule_tables()
    store = _get_schedule_store()
    triggered = []
    now = datetime.now(timezone.utc)

    for key, sched in list(store.items()):
        if not sched.get("is_active"):
            continue
        if sched.get("frequency") == "manual":
            continue
        next_run = sched.get("next_run_at")
        if next_run:
            try:
                next_dt = datetime.fromisoformat(next_run)
                if next_dt.tzinfo is None:
                    next_dt = next_dt.replace(tzinfo=timezone.utc)
                if next_dt > now:
                    continue
            except ValueError:
                continue

        connector_id = sched["connector_id"]
        company_id   = sched["company_id"]
        entity_type  = sched.get("entity_type", "people")
        logger.info(
            "run-scheduled: triggering %s for company=%s", connector_id, company_id
        )

        run_entry = {
            "connector_id": connector_id,
            "company_id":   company_id,
            "triggered_by": "scheduler",
            "started_at":   _now_iso(),
            "status":       "triggered",
        }

        try:
            connector_class = get_connector(connector_id)
            if connector_class:
                engine = MappingEngine(company_id=company_id)
                # Merge stored credentials with the entity_type hint
                stored_creds = sched.get("credentials") or {}
                runtime_creds = {**stored_creds, "entity_type": entity_type}
                connector = connector_class(
                    company_id=company_id,
                    credentials=runtime_creds,
                    mappings=engine._mappings,
                )
                raw = connector.extract()
                if raw:
                    transformed = connector.transform(raw)
                    result = connector.load(transformed)
                    run_entry.update({
                        "status":            "completed",
                        "records_extracted": len(raw),
                        "records_created":   result.get("created", 0),
                        "records_updated":   result.get("updated", 0),
                        "completed_at":      _now_iso(),
                    })
                else:
                    run_entry.update({"status": "skipped", "completed_at": _now_iso()})
            else:
                run_entry.update({"status": "skipped", "completed_at": _now_iso(),
                                  "error": f"connector class not found: {connector_id}"})
        except Exception as e:
            logger.error("run-scheduled: %s failed — %s", connector_id, e)
            run_entry.update({"status": "failed", "error": str(e), "completed_at": _now_iso()})

        # Update last_run and compute next_run — persist to DB
        store[key]["last_run_at"] = _now_iso()
        store[key]["next_run_at"] = _compute_next_run(
            sched["frequency"], sched.get("run_at_hour", 0), sched.get("run_at_day", 1)
        )
        _db_save_schedule(key, store[key])

        # Persist run log entry to DB + in-memory
        _db_append_run_log(run_entry)
        _RUN_LOG.append(run_entry)
        if len(_RUN_LOG) > _RUN_LOG_MAX:
            del _RUN_LOG[: len(_RUN_LOG) - _RUN_LOG_MAX]

        triggered.append(run_entry)

    return {
        "evaluated":  len(_SCHEDULE_STORE),
        "triggered":  len(triggered),
        "results":    triggered,
    }


@router.get("/runs")
def connector_runs(
    company_id: str = Query(...),
    connector_id: Optional[str] = Query(None),
    limit: int = Query(50, le=200),
):
    """
    Return recent connector run log entries for a company.
    Reads from PostgreSQL connectors.run_log when available,
    falls back to in-memory run log.
    """
    from database import get_engine_safe
    from sqlalchemy import text

    engine = get_engine_safe()
    if engine:
        try:
            sql = """
                SELECT company_id, connector_id, triggered_by, status,
                       records_extracted, records_created, records_updated,
                       error,
                       started_at::text  AS started_at,
                       completed_at::text AS completed_at
                FROM connectors.run_log
                WHERE company_id = :cid
            """
            params: dict = {"cid": company_id}
            if connector_id:
                sql += " AND connector_id = :conn_id"
                params["conn_id"] = connector_id
            sql += " ORDER BY started_at DESC LIMIT :lim"
            params["lim"] = limit
            with engine.connect() as conn:
                rows = conn.execute(text(sql), params).fetchall()
                cols = ["company_id", "connector_id", "triggered_by", "status",
                        "records_extracted", "records_created", "records_updated",
                        "error", "started_at", "completed_at"]
                entries = [dict(zip(cols, row)) for row in rows]
            return {"runs": entries, "total": len(entries), "source": "postgresql"}
        except Exception as e:
            logger.debug("connector_runs: DB read failed, falling back to memory — %s", e)

    # In-memory fallback
    entries = [r for r in _RUN_LOG if r.get("company_id") == company_id]
    if connector_id:
        entries = [r for r in entries if r.get("connector_id") == connector_id]
    entries.sort(key=lambda r: r.get("started_at", ""), reverse=True)
    return {"runs": entries[:limit], "total": len(entries), "source": "memory"}


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
        ext = filename.lower().rsplit(".", 1)[-1] if "." in filename else ""
        is_json_xml = ext in ("json", "xml")

        if is_json_xml:
            from connectors.file.jason_xml import JsonXmlConnector as FileConn
        else:
            from connectors.file.excel import ExcelConnector as FileConn  # type: ignore[assignment]

        # Parse file to get columns and preview rows
        connector = FileConn(
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

        # Auto-detect entity type if not provided; ExcelConnector has this method
        if is_json_xml:
            from connectors.file.excel import ExcelConnector
            detected_entity = entity_type or ExcelConnector._detect_entity_type(None, columns)  # type: ignore[arg-type]
        else:
            detected_entity = entity_type or connector._detect_entity_type(columns)  # type: ignore[attr-defined]

        # Suggest column mappings (always via ExcelConnector helper)
        from connectors.file.excel import ExcelConnector
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
    company_id:       str = Form(...),
    connector_id:     str = Form(...),
    entity_type:      Optional[str] = Form(None),
    credentials_json: Optional[str] = Form(None),
    column_map_json:  Optional[str] = Form(None),
    file:             Optional[UploadFile] = File(None),
    dry_run:          bool = Form(False),
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

    # API connector credentials (JSON-encoded from the Connect modal)
    if credentials_json:
        try:
            extra = json.loads(credentials_json)
            if isinstance(extra, dict):
                credentials.update(extra)
        except Exception as e:
            logger.warning("run_connector: could not parse credentials_json — %s", e)

    # Explicit column mapping — applies to file, DB, and API connectors.
    # Sent by the UI after the operator reviews /connectors/suggest-columns output.
    # Overrides any column_map already present in credentials_json.
    if column_map_json:
        try:
            cmap = json.loads(column_map_json)
            if isinstance(cmap, dict):
                credentials["column_map"] = cmap
        except Exception as e:
            logger.warning("run_connector: could not parse column_map_json — %s", e)

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


# ── Database connector endpoints ─────────────────────────────────────────────

class DbCredentials(BaseModel):
    engine_type: str           # postgresql | mysql | mssql | sqlite
    host:        str = ""
    port:        Optional[int] = None
    database:    str = ""
    username:    str = ""
    password:    str = ""
    schema_name: Optional[str] = None   # renamed to avoid pydantic clash with schema
    ssl:         bool = False
    table:       Optional[str] = None
    query:       Optional[str] = None
    entity_type: Optional[str] = "people"
    column_map:  Optional[dict] = {}

    def to_credentials_dict(self) -> dict:
        return {
            "engine_type": self.engine_type,
            "host":        self.host,
            "port":        self.port,
            "database":    self.database,
            "username":    self.username,
            "password":    self.password,
            "schema":      self.schema_name,
            "ssl":         self.ssl,
            "table":       self.table,
            "query":       self.query,
            "entity_type": self.entity_type,
            "column_map":  self.column_map or {},
        }


@router.post("/db/test")
def db_test_connection(creds: DbCredentials):
    """
    Test an external database connection without extracting any data.
    Returns {ok, message, engine, server_version}.
    Called by the Connect modal after the user fills in credentials.
    """
    from connectors.database.sql import test_connection
    return test_connection(creds.to_credentials_dict())


@router.post("/db/tables")
def db_list_tables(creds: DbCredentials):
    """
    List all tables and views in the connected database/schema.
    Called by the Connect modal after a successful connection test.
    Lets the user pick a table instead of writing raw SQL.
    """
    from connectors.database.sql import list_tables
    return list_tables(creds.to_credentials_dict())


@router.post("/db/schema")
def db_full_schema(creds: DbCredentials):
    """
    Return the full schema of the connected database — all tables and views with
    their column names and data types.  Called by the "Explore Full Schema" step
    in the Connect modal so the operator can see every table before deciding which
    to mirror or import.

    Returns {"ok", "schema": {table: [{"name", "type"}]}, "table_count"}.
    """
    from connectors.database.sql import get_full_schema
    return get_full_schema(creds.to_credentials_dict())


@router.post("/db/mirror")
def db_mirror_table(
    creds:      DbCredentials,
    company_id: str = Query(...),
    table:      str = Query(...),
):
    """
    Mirror a single external table directly into our raw.* PostgreSQL schema so the
    AI copilot can query it with query_external_table.

    Writes to raw.ext_{table_name} with company_id stamped on every row.
    Replaces any previous mirror of the same table.

    Returns {"ok", "table", "rows_mirrored", "columns", "note"}.
    """
    from connectors.database.sql import mirror_table
    return mirror_table(creds.to_credentials_dict(), company_id=company_id, table_name=table)


@router.post("/db/preview")
def db_preview(creds: DbCredentials, limit: int = Query(10, le=100)):
    """
    Run the query/table from credentials and return the first N rows.
    Called by the Connect modal to show a preview before column mapping.
    Returns {ok, columns, rows, total_estimate, sql_used}.
    """
    from connectors.database.sql import preview_query
    return preview_query(creds.to_credentials_dict(), limit=limit)


@router.post("/db/run")
def db_run_sync(
    creds:      DbCredentials,
    company_id: str = Query(...),
    dry_run:    bool = Query(False),
):
    """
    Extract rows from the external database and load them into Base44.

    Steps:
      1. Connect to external DB and run query/table
      2. Apply column_map to translate source columns → entity fields
      3. Load records into Base44 (or dry_run to preview without writing)

    Returns the standard connector run summary.
    """
    from connectors.database.sql import SqlDatabaseConnector
    from connectors.mapping_engine import MappingEngine

    engine = MappingEngine(company_id=company_id)
    connector = SqlDatabaseConnector(
        company_id=company_id,
        credentials=creds.to_credentials_dict(),
        mappings=engine._mappings,
    )

    try:
        raw = connector.extract()
        if not raw:
            return {
                "status":     "skipped",
                "reason":     "query returned no rows",
                "company_id": company_id,
            }

        transformed = connector.transform(raw)

        if dry_run:
            total = sum(len(v) for v in transformed.values())
            return {
                "status":       "dry_run",
                "extracted":    len(raw),
                "would_load":   total,
                "entity_type":  creds.entity_type,
                "unmapped":     connector.run_stats.get("unmapped", []),
                "preview":      {k: v[:5] for k, v in transformed.items() if v},
            }

        result = connector.load(transformed)
        return {
            **result,
            "connector":    f"{creds.engine_type}_db",
            "company_id":   company_id,
            "entity_type":  creds.entity_type,
            "rows_extracted": len(raw),
            "unmapped":     connector.run_stats.get("unmapped", []),
        }

    except Exception as e:
        logger.error("db_run_sync failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


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


# ── Phase 14: Bidirectional Connectors — Write-back routes ────────────────────

class WritebackConfigBody(BaseModel):
    company_id:      str
    connector_id:    str
    entity_types:    list = ["transactions"]
    conflict_policy: str  = "newsconseen_wins"  # newsconseen_wins | external_wins | flag_review
    credentials:     dict = {}
    enabled:         bool = True


class WritebackTestBody(BaseModel):
    company_id:   str
    connector_id: str
    entity_type:  str = "transactions"
    sample_payload: dict = {}


@router.post("/writeback/configure", tags=["Phase 14 — Bidirectional"])
def configure_writeback(body: WritebackConfigBody):
    """
    Save or update a write-back config for a connector.
    Enables Newsconseen to push mutations to the external system.
    """
    from connectors.writeback import save_config, WRITEBACK_CAPABLE
    if body.connector_id not in WRITEBACK_CAPABLE:
        raise HTTPException(
            422,
            f"'{body.connector_id}' does not support write-back. "
            f"Supported: {sorted(WRITEBACK_CAPABLE)}"
        )
    result = save_config(
        company_id=body.company_id,
        connector_id=body.connector_id,
        entity_types=body.entity_types,
        conflict_policy=body.conflict_policy,
        credentials=body.credentials,
        enabled=body.enabled,
    )
    return {"status": "saved", "config": result}


@router.get("/writeback/config", tags=["Phase 14 — Bidirectional"])
def get_writeback_configs(company_id: str = Query(...)):
    """List all active write-back configs for a company (credentials stripped)."""
    from connectors.writeback import get_configs, WRITEBACK_CAPABLE, WRITEBACK_ENTITIES
    configs = get_configs(company_id)
    return {
        "configs":          configs,
        "count":            len(configs),
        "capable":          sorted(WRITEBACK_CAPABLE),
        "capable_entities": WRITEBACK_ENTITIES,
    }


@router.delete("/writeback/{connector_id}", tags=["Phase 14 — Bidirectional"])
def delete_writeback(connector_id: str, company_id: str = Query(...)):
    """Disable write-back for a connector."""
    from connectors.writeback import delete_config
    deleted = delete_config(company_id, connector_id)
    return {"status": "deleted" if deleted else "not_found",
            "connector_id": connector_id}


@router.post("/writeback/test", tags=["Phase 14 — Bidirectional"])
def test_writeback(body: WritebackTestBody):
    """
    Dry-run a write-back push — validates config and connectivity
    without actually writing to the external system.
    """
    from connectors.writeback import push
    result = push(
        company_id=body.company_id,
        connector_id=body.connector_id,
        entity_type=body.entity_type,
        payload=body.sample_payload or {
            "full_name": "Test Record",
            "amount": 100,
            "status": "active",
        },
        dry_run=True,
    )
    return result


@router.get("/writeback/log", tags=["Phase 14 — Bidirectional"])
def writeback_log(
    company_id: str = Query(...),
    limit: int  = Query(50, le=200),
):
    """Recent write-back push events for a company."""
    from connectors.writeback import get_push_log
    events = get_push_log(company_id, limit)
    return {"events": events, "count": len(events)}
