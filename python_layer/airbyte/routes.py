# ==============================================================
# Airbyte ↔ Newsconseen API Routes
# ==============================================================
#
# GET  /airbyte/status              — connection health + config check
# GET  /airbyte/sources             — list sources in Airbyte workspace
# GET  /airbyte/connections         — list configured sync connections
# POST /airbyte/sync/{connection_id}— trigger a manual sync
# GET  /airbyte/jobs/{connection_id}— recent sync job history
# GET  /airbyte/supported           — sources Newsconseen can auto-map
#
# POST /airbyte/discover            — auto-discover streams + suggest entity mappings
#   Calls Airbyte's /v1/sources/discover_schema for a source_id, then
#   pattern-matches each field name to Newsconseen canonical fields.
#   Returns suggested mappings the operator can review before running transform.
#
# POST /airbyte/transform           — transform Airbyte raw data → entities
#   Called after a sync completes. Reads from the airbyte.* PostgreSQL schema,
#   maps to Newsconseen entities, writes to raw.*, triggers ETL analytics.
#
# POST /airbyte/webhook             — Airbyte sync completion notification
#   Configure in Airbyte: Notifications → Webhook URL → this endpoint.
#   Automatically transforms the synced data after every successful sync.
#
# POST /airbyte/ingest              — push raw records directly (no Airbyte needed)
#   For custom sources not in Airbyte. n8n or any webhook can call this.
# ==============================================================

import logging
import os
from typing import Any, Optional

import pandas as pd
from fastapi import APIRouter, HTTPException, Header, Query
from pydantic import BaseModel

from airbyte.client import AirbyteClient
from airbyte.mapper import AirbyteMapper, STREAM_MAPPINGS

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/airbyte", tags=["Airbyte Integration"])

RAILWAY_URL = os.getenv(
    "RAILWAY_URL",
    "https://newsconseenwebapp-production.up.railway.app",
)


# ── Auth helper ──────────────────────────────────────────────────────────────

def _check_secret(provided: str | None) -> None:
    expected = os.getenv("AIRBYTE_WEBHOOK_SECRET", "").strip()
    if not expected:
        return
    if provided != expected:
        raise HTTPException(status_code=401, detail="Invalid X-Airbyte-Secret header")


# ── Request models ───────────────────────────────────────────────────────────

class TransformRequest(BaseModel):
    """
    Transform Airbyte-synced data from the airbyte.* PostgreSQL schema
    into Newsconseen entities.

    source_name:  Airbyte source type, e.g. "shopify", "hubspot", "quickbooks"
    streams:      List of stream names to transform, e.g. ["customers", "orders"]
                  Leave empty to transform all streams for this source.
    company_id:   Newsconseen tenant ID to stamp on all records.
    trigger_etl:  If true, refresh analytics after transform.
    """
    source_name:  str
    streams:      list[str] = []
    company_id:   str
    trigger_etl:  bool = True
    airbyte_schema: str = "airbyte"   # PostgreSQL schema where Airbyte writes


class IngestRequest(BaseModel):
    """
    Push records directly into Newsconseen from any source — no Airbyte required.

    source_name:  Identifier for the source (e.g. "mpesa", "google_forms")
    stream_name:  Stream/table name (e.g. "payments", "registrations")
    records:      List of raw records from the source
    company_id:   Newsconseen tenant ID
    entity:       Override the entity type (people/enterprises/transactions/tasks/products)
    mapping:      Custom field mapping {source_field: newsconseen_field}
    defaults:     Fixed values stamped on every record
    trigger_etl:  Refresh analytics after ingest
    """
    source_name:  str
    stream_name:  str
    records:      list[dict[str, Any]]
    company_id:   str
    entity:       Optional[str] = None        # override mapper's entity detection
    mapping:      dict[str, str] = {}         # custom field mapping
    defaults:     dict[str, Any] = {}         # fixed values for all records
    trigger_etl:  bool = True


class AirbyteWebhookPayload(BaseModel):
    """Airbyte sync completion webhook payload."""
    connectionId:   Optional[str] = None
    jobId:          Optional[str] = None
    status:         Optional[str] = None
    startTime:      Optional[str] = None
    attempt:        Optional[int] = None
    # Newsconseen-specific fields (add these in Airbyte webhook body template)
    source_name:    Optional[str] = None
    company_id:     Optional[str] = None


# ── Shared transform pipeline ────────────────────────────────────────────────

def _run_transform_pipeline(
    source_name: str,
    stream_name: str,
    records: list[dict],
    company_id: str,
    trigger_etl: bool,
    custom_mapping: dict = None,
    custom_defaults: dict = None,
    entity_override: str = None,
) -> dict:
    """
    Core pipeline: raw records → mapped DataFrame → raw.* → analytics.*

    Used by /airbyte/transform, /airbyte/ingest, and /airbyte/webhook.
    """
    from etl.load import load_raw, load_dataframe
    from etl import people, enterprises, products, transactions, tasks
    from database import get_engine_safe

    if not records:
        return {"status": "skipped", "reason": "no records", "count": 0}

    mapper = AirbyteMapper(company_id)

    # Use custom mapping if provided, otherwise use STREAM_MAPPINGS
    if custom_mapping is not None or custom_defaults is not None:
        config = {
            "entity":   entity_override or "people",
            "mapping":  custom_mapping or {},
            "defaults": custom_defaults or {},
        }
        mapped_rows = [mapper.map_record(r, config) for r in records]
        entity = entity_override or "people"
        df = pd.DataFrame(mapped_rows)
    else:
        entity, df = mapper.map_stream(source_name, stream_name, records)
        if entity_override:
            entity = entity_override

    if df.empty:
        return {"status": "skipped", "reason": "mapping produced no rows", "count": 0}

    # Map entity name to raw table name
    entity_table_map = {
        "people":       "people",
        "enterprises":  "enterprises",
        "products":     "products",
        "transactions": "transactions",
        "tasks":        "tasks",
    }
    raw_table = entity_table_map.get(entity)
    if not raw_table:
        return {"status": "error", "reason": f"unknown entity: {entity}"}

    # Write to raw schema
    try:
        load_raw(df, raw_table)
        logger.info(
            "airbyte transform: wrote %d rows to raw.%s (source=%s/%s company=%s)",
            len(df), raw_table, source_name, stream_name, company_id,
        )
    except Exception as e:
        return {"status": "error", "reason": f"raw write failed: {e}", "count": 0}

    # Optionally refresh analytics
    etl_result = None
    if trigger_etl:
        transform_map = {
            "people":       people.transform_people,
            "enterprises":  enterprises.transform_enterprises,
            "products":     products.transform_products,
            "transactions": transactions.transform_transactions,
            "tasks":        tasks.transform_tasks,
        }
        transform_fn = transform_map.get(raw_table)
        if transform_fn:
            try:
                engine = get_engine_safe()
                if engine:
                    full_raw = pd.read_sql(
                        f"SELECT * FROM raw.{raw_table} WHERE company_id = %(cid)s",
                        engine,
                        params={"cid": company_id},
                    )
                    if not full_raw.empty:
                        summary    = transform_fn(full_raw)
                        etl_result = load_dataframe(summary, f"{raw_table}_summary", company_id=company_id)
            except Exception as e:
                etl_result = {"status": "error", "detail": str(e)}

    return {
        "status":     "success",
        "source":     source_name,
        "stream":     stream_name,
        "entity":     entity,
        "count":      len(df),
        "company_id": company_id,
        "etl":        etl_result,
    }


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/status")
def airbyte_status():
    """
    Health check — shows Airbyte connection status and configuration guide.
    """
    client = AirbyteClient()
    health = client.health()

    api_url      = os.getenv("AIRBYTE_API_URL", "")
    workspace_id = os.getenv("AIRBYTE_WORKSPACE_ID", "")
    webhook_secret = bool(os.getenv("AIRBYTE_WEBHOOK_SECRET", ""))

    return {
        "status":           "connected" if health.get("ok") else "not_configured",
        "airbyte_api_url":  api_url or None,
        "workspace_id":     workspace_id or None,
        "webhook_secret_set": webhook_secret,
        "health":           health,
        "setup_guide": {
            "step_1": "Deploy Airbyte on Railway (one-click template) or use Airbyte Cloud",
            "step_2": "Add AIRBYTE_API_URL to Railway environment (e.g. http://airbyte:8001)",
            "step_3": "Add AIRBYTE_API_KEY if using Airbyte Cloud",
            "step_4": "Add AIRBYTE_WORKSPACE_ID from your Airbyte workspace settings",
            "step_5": f"Set Airbyte Notification Webhook to: {RAILWAY_URL}/airbyte/webhook",
            "step_6": "Add AIRBYTE_WEBHOOK_SECRET to secure the webhook endpoint",
            "step_7": "In Airbyte, set destination = PostgreSQL with your Railway DATABASE_URL",
        },
        "supported_sources_count": len(STREAM_MAPPINGS),
        "endpoints": {
            "sources":    f"{RAILWAY_URL}/airbyte/sources",
            "connections": f"{RAILWAY_URL}/airbyte/connections",
            "supported":  f"{RAILWAY_URL}/airbyte/supported",
            "transform":  f"{RAILWAY_URL}/airbyte/transform",
            "webhook":    f"{RAILWAY_URL}/airbyte/webhook",
            "ingest":     f"{RAILWAY_URL}/airbyte/ingest",
        },
    }


@router.get("/supported")
def list_supported_sources():
    """
    List all sources that Newsconseen can auto-map to entities.
    No Airbyte connection required — this is purely the mapping registry.
    """
    mapper = AirbyteMapper(company_id="")
    sources = mapper.list_supported_sources()

    entity_counts = {}
    for s in sources:
        for stream in s["streams"]:
            e = stream["entity"]
            entity_counts[e] = entity_counts.get(e, 0) + 1

    return {
        "supported_source_count": len(sources),
        "entity_coverage":        entity_counts,
        "sources":                sources,
        "note": (
            "Sources marked with stream='(any)' accept any table/sheet name "
            "and map columns pass-through. Use /airbyte/ingest with a custom "
            "mapping dict for full control."
        ),
    }


@router.get("/sources")
def list_sources():
    """List sources configured in your Airbyte workspace."""
    client = AirbyteClient()
    if not client._available:
        raise HTTPException(status_code=503, detail="AIRBYTE_API_URL not configured")
    try:
        return {"sources": client.list_sources()}
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Airbyte API error: {e}")


@router.get("/connections")
def list_connections():
    """List sync connections configured in your Airbyte workspace."""
    client = AirbyteClient()
    if not client._available:
        raise HTTPException(status_code=503, detail="AIRBYTE_API_URL not configured")
    try:
        return {"connections": client.list_connections()}
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Airbyte API error: {e}")


@router.post("/sync/{connection_id}")
def trigger_sync(connection_id: str, x_airbyte_secret: Optional[str] = Header(None)):
    """Trigger a manual Airbyte sync for a specific connection."""
    _check_secret(x_airbyte_secret)
    client = AirbyteClient()
    if not client._available:
        raise HTTPException(status_code=503, detail="AIRBYTE_API_URL not configured")
    try:
        job = client.trigger_sync(connection_id)
        return {"triggered": True, "job": job}
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Airbyte sync failed: {e}")


@router.get("/jobs/{connection_id}")
def list_jobs(connection_id: str, limit: int = Query(10, le=50)):
    """Recent sync job history for a connection."""
    client = AirbyteClient()
    if not client._available:
        raise HTTPException(status_code=503, detail="AIRBYTE_API_URL not configured")
    try:
        return {"jobs": client.list_jobs(connection_id, limit=limit)}
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Airbyte API error: {e}")


@router.post("/transform")
def transform_airbyte_data(
    request: TransformRequest,
    x_airbyte_secret: Optional[str] = Header(None),
):
    """
    Read from the airbyte.* PostgreSQL schema and transform into Newsconseen entities.

    Call this after a sync completes to move data from Airbyte's raw tables
    into Newsconseen's analytics pipeline.

    The airbyte schema is where Airbyte writes when you set PostgreSQL as destination.
    """
    _check_secret(x_airbyte_secret)

    from database import get_engine_safe
    engine = get_engine_safe()
    if not engine:
        raise HTTPException(status_code=503, detail="No database connection")

    results = []
    source = request.source_name.lower()

    # Determine which streams to process
    if request.streams:
        streams_to_process = request.streams
    else:
        # Auto-discover from STREAM_MAPPINGS for this source
        source_map = STREAM_MAPPINGS.get(source, {})
        streams_to_process = [s for s in source_map if s != "*"]

    if not streams_to_process:
        return {
            "status":  "skipped",
            "reason":  f"No streams found for source '{source}'. Use /airbyte/ingest for custom sources.",
            "results": [],
        }

    for stream in streams_to_process:
        # Read from airbyte schema table
        # Airbyte names tables as: <stream_name> or _airbyte_raw_<stream_name>
        table_candidates = [
            stream,
            stream.lower().replace("-", "_"),
            f"_airbyte_raw_{stream}",
        ]

        raw_df = pd.DataFrame()
        for table in table_candidates:
            try:
                raw_df = pd.read_sql(
                    f'SELECT * FROM {request.airbyte_schema}."{table}"',
                    engine,
                )
                if not raw_df.empty:
                    break
            except Exception:
                continue

        if raw_df.empty:
            results.append({
                "stream": stream,
                "status": "skipped",
                "reason": f"table not found in {request.airbyte_schema} schema",
            })
            continue

        # Airbyte wraps records in _airbyte_data column (JSON) — unwrap if present
        if "_airbyte_data" in raw_df.columns:
            import json
            raw_df = pd.json_normalize(
                raw_df["_airbyte_data"].apply(
                    lambda x: json.loads(x) if isinstance(x, str) else x
                )
            )

        records = raw_df.to_dict(orient="records")
        result  = _run_transform_pipeline(
            source_name=source,
            stream_name=stream,
            records=records,
            company_id=request.company_id,
            trigger_etl=request.trigger_etl,
        )
        results.append({"stream": stream, **result})

    success = sum(1 for r in results if r.get("status") == "success")
    return {
        "source":   source,
        "streams_processed": len(results),
        "success":  success,
        "results":  results,
    }


@router.post("/webhook")
def airbyte_sync_webhook(
    payload: AirbyteWebhookPayload,
    x_airbyte_secret: Optional[str] = Header(None),
):
    """
    Airbyte sync completion webhook.

    Configure in Airbyte UI:
      Settings → Notifications → Webhook URL → {RAILWAY_URL}/airbyte/webhook

    When a sync job completes successfully, Airbyte calls this endpoint.
    Newsconseen automatically transforms the synced data.

    To pass source_name and company_id, use Airbyte's webhook body template:
      {"connectionId": "{{connectionId}}", "status": "{{status}}",
       "source_name": "shopify", "company_id": "your_company_id"}
    """
    _check_secret(x_airbyte_secret)

    logger.info(
        "Airbyte webhook received: connection=%s job=%s status=%s",
        payload.connectionId, payload.jobId, payload.status,
    )

    # Only act on successful syncs
    if payload.status not in ("succeeded", "success", "complete", None):
        return {
            "status":  "ignored",
            "reason":  f"sync status '{payload.status}' — only acting on success",
            "job_id":  payload.jobId,
        }

    # If source_name and company_id are provided, auto-transform
    if payload.source_name and payload.company_id:
        from database import get_engine_safe
        engine = get_engine_safe()
        if engine:
            source = payload.source_name.lower()
            source_map = STREAM_MAPPINGS.get(source, {})
            streams = [s for s in source_map if s != "*"]

            results = []
            for stream in streams:
                try:
                    raw_df = pd.read_sql(
                        f'SELECT * FROM airbyte."{stream}"',
                        engine,
                    )
                    if not raw_df.empty:
                        records = raw_df.to_dict(orient="records")
                        r = _run_transform_pipeline(
                            source_name=source,
                            stream_name=stream,
                            records=records,
                            company_id=payload.company_id,
                            trigger_etl=True,
                        )
                        results.append({"stream": stream, **r})
                except Exception as e:
                    results.append({"stream": stream, "status": "error", "detail": str(e)})

            return {
                "status":  "transformed",
                "source":  payload.source_name,
                "results": results,
            }

    return {
        "status":        "received",
        "connection_id": payload.connectionId,
        "note":          "Add source_name and company_id to webhook body for auto-transform",
    }


# ── Field-inference helper ───────────────────────────────────────────────────

# Pattern → canonical Newsconseen field. Order: specific before general.
_FIELD_HINTS: list[tuple] = [
    # Identity
    ({"id", "external_id", "record_id", "source_id"},               "external_id"),
    # Name
    ({"first_name", "firstname", "given_name"},                      "first_name"),
    ({"last_name", "lastname", "surname", "family_name"},            "last_name"),
    ({"full_name", "name", "display_name", "customer_name",
      "company_name", "organisation_name", "organization_name"},     "name"),
    # Contact
    ({"email", "email_address", "e_mail"},                           "email"),
    ({"phone", "phone_number", "mobile", "cell", "tel",
      "telephone", "msisdn"},                                         "phone"),
    # Person-specific
    ({"person_type", "role", "type", "member_type",
      "employee_type", "student_type"},                               "person_type"),
    ({"status", "active", "is_active"},                              "status"),
    ({"date_of_birth", "dob", "birthday"},                           "date_of_birth"),
    ({"gender", "sex"},                                              "gender"),
    # Enterprise
    ({"enterprise_type", "org_type", "business_type",
      "organisation_type", "organization_type"},                      "enterprise_type"),
    ({"industry", "sector", "category"},                             "industry"),
    ({"website", "url", "web_address"},                              "website"),
    # Transaction / financial
    ({"amount", "total", "price", "cost", "value",
      "transaction_amount", "trans_amount"},                          "amount"),
    ({"currency"},                                                    "currency"),
    ({"transaction_date", "date", "created_at", "order_date",
      "payment_date", "timestamp"},                                   "date"),
    ({"transaction_type", "payment_type", "order_type"},             "transaction_type"),
    ({"payment_status", "order_status", "fulfillment_status"},       "payment_status"),
    ({"reference_number", "reference", "invoice_number", "order_id"},"reference_number"),
    # Product
    ({"sku", "product_code", "item_code"},                           "sku"),
    ({"price", "unit_price", "sale_price"},                          "unit_price"),
    ({"quantity", "qty", "stock", "inventory"},                      "quantity"),
    ({"item_type", "product_type", "item_class"},                    "item_type"),
    # Address
    ({"address", "street", "street_address", "address_line_1"},     "address_line_1"),
    ({"city", "town"},                                               "city"),
    ({"country", "country_code"},                                    "country"),
    ({"zip_code", "zip", "postal_code", "postcode"},                 "zip_code"),
]

# Stream name keywords → likely Newsconseen entity
_ENTITY_HINTS: list[tuple[set, str]] = [
    ({"customer", "user", "person", "employee", "student",
      "member", "patient", "contact", "staff", "volunteer"},    "people"),
    ({"company", "organisation", "organization", "enterprise",
      "business", "account", "branch", "store", "location"},    "enterprises"),
    ({"order", "transaction", "payment", "invoice", "sale",
      "purchase", "receipt", "charge"},                         "transactions"),
    ({"product", "item", "inventory", "sku", "catalogue",
      "catalog", "listing", "variant"},                         "products"),
    ({"task", "activity", "appointment", "visit",
      "job", "ticket", "event"},                                "tasks"),
]


def _infer_entity(stream_name: str) -> str:
    """Guess Newsconseen entity from stream name keywords."""
    lower = stream_name.lower()
    for keywords, entity in _ENTITY_HINTS:
        if any(kw in lower for kw in keywords):
            return entity
    return "people"   # safe default


def _suggest_field_mapping(fields: list[str]) -> dict[str, str]:
    """
    Pattern-match a list of source field names to Newsconseen canonical fields.
    Returns {source_field: canonical_field} for matched fields only.
    """
    mapping = {}
    for field in fields:
        lower = field.lower().replace("-", "_").replace(" ", "_")
        for keyword_set, canonical in _FIELD_HINTS:
            if lower in keyword_set or any(kw in lower for kw in keyword_set):
                mapping[field] = canonical
                break
    return mapping


# ── Discover endpoint ────────────────────────────────────────────────────────

class DiscoverRequest(BaseModel):
    """
    Discover streams and auto-suggest field mappings for an Airbyte source.

    source_id:   Airbyte source UUID (from GET /airbyte/sources)
    source_name: Optional label to check STREAM_MAPPINGS first for known sources.

    Returns per-stream:
      - fields discovered from Airbyte schema
      - suggested entity type (people/enterprises/products/transactions/tasks)
      - suggested field mapping {source_field → newsconseen_canonical_field}
      - whether the mapping is from STREAM_MAPPINGS (known) or auto-inferred (new)
    """
    source_id:   str
    source_name: Optional[str] = None


@router.post("/discover")
def discover_streams(
    request: DiscoverRequest,
    x_airbyte_secret: Optional[str] = Header(None),
):
    """
    Auto-discover Airbyte source streams and suggest Newsconseen entity mappings.

    For operators connecting a new source not yet in STREAM_MAPPINGS:
      1. Call POST /airbyte/discover with source_id
      2. Review the suggested mappings in the Connectors UI
      3. Confirm or adjust, then call POST /airbyte/transform using the
         confirmed mapping via the IngestRequest.mapping field

    For known sources (shopify, hubspot, etc.) the response includes
    the existing STREAM_MAPPINGS config alongside the live schema so
    operators can see if new fields were added upstream.
    """
    _check_secret(x_airbyte_secret)

    client = AirbyteClient()
    if not client._available:
        raise HTTPException(status_code=503, detail="AIRBYTE_API_URL not configured")

    try:
        schema_response = client.get_stream_schema(request.source_id)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Airbyte schema discovery failed: {e}")

    # Airbyte returns: {"catalog": {"streams": [{"stream": {"name": "...", "jsonSchema": {...}}}]}}
    catalog = schema_response.get("catalog", {})
    raw_streams = catalog.get("streams", [])

    source_name = (request.source_name or "").lower()
    known_source = STREAM_MAPPINGS.get(source_name, {})

    discovered = []
    for entry in raw_streams:
        stream_info  = entry.get("stream", entry)  # handle both wrapper formats
        stream_name  = stream_info.get("name", "unknown")
        json_schema  = stream_info.get("jsonSchema", stream_info.get("json_schema", {}))

        # Extract field names from the JSON schema
        props  = json_schema.get("properties", {})
        fields = list(props.keys()) if props else []

        # Check STREAM_MAPPINGS first — use known config if available
        known_config = known_source.get(stream_name) or known_source.get("*")
        if known_config:
            discovered.append({
                "stream":        stream_name,
                "fields":        fields,
                "entity":        known_config.get("entity", "people"),
                "mapping":       known_config.get("mapping", {}),
                "source":        "stream_mappings",
                "note":          "Using existing Newsconseen mapping. Verify fields match.",
            })
            continue

        # Auto-infer from field names and stream name
        entity  = _infer_entity(stream_name)
        mapping = _suggest_field_mapping(fields)

        discovered.append({
            "stream":   stream_name,
            "fields":   fields,
            "entity":   entity,
            "mapping":  mapping,
            "source":   "auto_inferred",
            "note":     (
                "Auto-inferred mapping. Review and adjust before running transform. "
                "Unmapped fields are ignored unless you add them to the mapping."
            ),
        })

    mapped_count = sum(1 for s in discovered if s["source"] == "stream_mappings")
    inferred_count = len(discovered) - mapped_count

    return {
        "source_id":      request.source_id,
        "source_name":    source_name or None,
        "streams_found":  len(discovered),
        "known_streams":  mapped_count,
        "inferred_streams": inferred_count,
        "streams":        discovered,
        "next_steps": {
            "transform": "POST /airbyte/transform with source_name + streams list",
            "ingest":    "POST /airbyte/ingest with mapping dict for custom sources",
        },
    }


@router.post("/ingest")
def ingest_records(
    request: IngestRequest,
    x_airbyte_secret: Optional[str] = Header(None),
):
    """
    Push records from ANY source directly — no Airbyte deployment required.

    This is the universal data ingestion endpoint. Use it for:
    - Sources not in Airbyte (MPESA, custom APIs, local databases)
    - n8n workflows pushing data from any connected service
    - Manual data imports via script or curl

    If source_name matches a known source in /airbyte/supported, the
    mapping is applied automatically. Otherwise use the mapping and
    defaults fields to define your own.

    Example — MPESA payment:
      POST /airbyte/ingest
      {
        "source_name": "mpesa",
        "stream_name": "payments",
        "company_id":  "abc123",
        "entity":      "transactions",
        "mapping": {
          "TransID":     "external_id",
          "TransAmount": "amount",
          "TransTime":   "date",
          "MSISDN":      "phone",
          "BillRefNumber": "reference_number"
        },
        "defaults": {
          "transaction_type": "payment",
          "payment_method":   "mobile_money",
          "payment_status":   "paid",
          "currency":         "KES"
        },
        "records": [
          {"TransID": "QHN8LXYZ", "TransAmount": "5000", "TransTime": "20260323120000", ...}
        ]
      }
    """
    _check_secret(x_airbyte_secret)

    result = _run_transform_pipeline(
        source_name=request.source_name,
        stream_name=request.stream_name,
        records=request.records,
        company_id=request.company_id,
        trigger_etl=request.trigger_etl,
        custom_mapping=request.mapping or None,
        custom_defaults=request.defaults or None,
        entity_override=request.entity,
    )

    return result
