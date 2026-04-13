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


# ── Schedule store ────────────────────────────────────────────────────────────
# In-memory for now. Production would persist to PostgreSQL connectors.schedules.
# Key: "{company_id}:{connector_id}"
_SCHEDULE_STORE: dict[str, dict] = {}

# Simple run log (in addition to Base44 ConnectorRun entity)
_RUN_LOG: list[dict] = []
_RUN_LOG_MAX = 500


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
    company_id:   str
    connector_id: str
    connector_name: Optional[str] = ""
    frequency:    str = "manual"   # manual | hourly | daily | weekly | monthly
    run_at_hour:  int = 0          # hour of day (UTC, 0-23)
    run_at_day:   int = 1          # 0=Mon…6=Sun for weekly; 1-31 for monthly
    entity_type:  Optional[str] = "people"
    is_active:    bool = True


@router.get("/schedule")
def get_schedules(company_id: str = Query(...)):
    """List all active connector schedules for a company."""
    prefix = f"{company_id}:"
    return {
        "schedules": [v for k, v in _SCHEDULE_STORE.items() if k.startswith(prefix)]
    }


@router.post("/schedule")
def save_schedule(config: ConnectorScheduleConfig):
    """
    Save or update the sync schedule for a connector.
    Schedules are stored in-memory (Railway resets clear them — acceptable for now).
    """
    key = f"{config.company_id}:{config.connector_id}"
    entry = config.dict()
    entry["created_at"]  = entry.get("created_at", _now_iso())
    entry["updated_at"]  = _now_iso()
    entry["next_run_at"] = _compute_next_run(
        config.frequency, config.run_at_hour, config.run_at_day
    )
    entry["last_run_at"] = _SCHEDULE_STORE.get(key, {}).get("last_run_at")
    _SCHEDULE_STORE[key] = entry
    logger.info(
        "schedule saved: company=%s connector=%s freq=%s next=%s",
        config.company_id, config.connector_id, config.frequency, entry["next_run_at"],
    )
    return {"status": "saved", **entry}


@router.delete("/schedule/{connector_id}")
def delete_schedule(connector_id: str, company_id: str = Query(...)):
    """Remove a connector schedule."""
    key = f"{company_id}:{connector_id}"
    removed = _SCHEDULE_STORE.pop(key, None)
    return {"status": "deleted" if removed else "not_found", "connector_id": connector_id}


@router.post("/run-scheduled")
def run_scheduled_connectors(x_cron_secret: Optional[str] = Header(None)):
    """
    Evaluate all active schedules and trigger any that are due.
    Called by Railway cron every hour: POST /connectors/run-scheduled
    Header: x-cron-secret

    Note: scheduled runs use the entity_type saved with the schedule.
    Credentials are not stored — scheduled syncs work only for connectors
    that don't require runtime credentials (database connectors with saved
    config, or future credential-vault integration).
    """
    triggered = []
    now = datetime.now(timezone.utc)

    for key, sched in list(_SCHEDULE_STORE.items()):
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
                engine    = MappingEngine(company_id=company_id)
                connector = connector_class(
                    company_id=company_id,
                    credentials={"entity_type": entity_type},
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
        except Exception as e:
            logger.error("run-scheduled: %s failed — %s", connector_id, e)
            run_entry.update({"status": "failed", "error": str(e), "completed_at": _now_iso()})

        # Update last_run and compute next_run
        _SCHEDULE_STORE[key]["last_run_at"] = _now_iso()
        _SCHEDULE_STORE[key]["next_run_at"] = _compute_next_run(
            sched["frequency"], sched.get("run_at_hour", 0), sched.get("run_at_day", 1)
        )

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
    Combines in-memory run log from scheduled runs.
    """
    entries = [r for r in _RUN_LOG if r.get("company_id") == company_id]
    if connector_id:
        entries = [r for r in entries if r.get("connector_id") == connector_id]
    entries.sort(key=lambda r: r.get("started_at", ""), reverse=True)
    return {"runs": entries[:limit], "total": len(entries)}


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
