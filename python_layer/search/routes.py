"""
python_layer/search/routes.py
==============================
Unified full-text search across all raw entity tables.

Replaces 12 parallel Base44 calls in the frontend with a single
parameterised ILIKE query per entity table. Returns consistent
{id, entity_type, page, title, subtitle, fields} results.

Company_id is always required — no cross-tenant results ever returned.
Missing tables (new entities not yet ETL'd) are silently skipped.
Missing columns (schema evolution) are excluded from the WHERE clause
via the information_schema column cache so the query never crashes.
"""
import logging
from fastapi import APIRouter, Header, HTTPException, Query
from sqlalchemy import text
from database import get_engine_safe
from config import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/search", tags=["search"])

# ── Column cache ──────────────────────────────────────────────────────────────
# Populated on first query per table. Prevents crashing on missing columns
# when a new entity's raw table hasn't been created yet.
_col_cache: dict[str, set] = {}


def _actual_cols(engine, table: str) -> set:
    key = f"raw.{table}"
    if key not in _col_cache:
        try:
            with engine.connect() as conn:
                rows = conn.execute(text(
                    "SELECT column_name FROM information_schema.columns "
                    "WHERE table_schema = 'raw' AND table_name = :t"
                ), {"t": table}).fetchall()
                _col_cache[key] = {r[0] for r in rows}
        except Exception:
            _col_cache[key] = set()
    return _col_cache.get(key, set())


# ── Entity config ─────────────────────────────────────────────────────────────
# search_cols: columns checked with ILIKE (only existing ones used)
# display_cols: extra fields returned for the quick-view panel
# title/subtitle: Python callables over the row dict

def _join(*parts, sep=" • "):
    return sep.join(p for p in parts if p and str(p).strip() not in ("", "nan", "None"))


_ENTITIES = [
    {
        "table":        "people",
        "entity_type":  "person",
        "page":         "People",
        "search_cols":  ["first_name", "last_name", "email", "phone", "primary_role"],
        "display_cols": ["first_name", "last_name", "email", "phone", "person_type",
                         "status", "primary_role", "availability_status"],
        "title":    lambda r: f"{r.get('first_name') or ''} {r.get('last_name') or ''}".strip()
                              or r.get("email") or "Person",
        "subtitle": lambda r: r.get("email") or r.get("person_type") or "Person",
    },
    {
        "table":        "enterprises",
        "entity_type":  "enterprise",
        "page":         "Enterprises",
        "search_cols":  ["enterprise_name", "name", "short_name", "city", "email"],
        "display_cols": ["enterprise_name", "enterprise_type", "status", "operating_status",
                         "city", "country", "email", "phone", "website"],
        "title":    lambda r: r.get("enterprise_name") or r.get("name") or "Enterprise",
        "subtitle": lambda r: r.get("short_name") or r.get("city") or r.get("enterprise_type") or "Enterprise",
    },
    {
        "table":        "products",
        "entity_type":  "product",
        "page":         "Products",
        "search_cols":  ["name", "sku", "brand", "description"],
        "display_cols": ["name", "sku", "item_type", "status", "unit_price", "currency", "brand"],
        "title":    lambda r: r.get("name") or "Product",
        "subtitle": lambda r: (f"SKU: {r['sku']}" if r.get("sku") else None)
                              or r.get("item_type") or "Product",
    },
    {
        "table":        "tasks",
        "entity_type":  "task",
        "page":         "Tasks",
        "search_cols":  ["title", "task_type", "description", "assigned_to"],
        "display_cols": ["title", "task_type", "status", "due_date", "assigned_to", "outcome"],
        "title":    lambda r: r.get("title") or "Task",
        "subtitle": lambda r: _join(
            (r.get("task_type") or "Task").replace("_", " "), r.get("status") or ""
        ),
    },
    {
        "table":        "transactions",
        "entity_type":  "transaction",
        "page":         "Transactions",
        "search_cols":  ["description", "invoice_number", "counterparty_name"],
        "display_cols": ["description", "transaction_type", "amount", "currency",
                         "status", "transaction_date", "invoice_number"],
        "title":    lambda r: r.get("description") or r.get("invoice_number") or "Transaction",
        "subtitle": lambda r: _join(
            (r.get("transaction_type") or "").replace("_", " "), r.get("currency") or ""
        ),
    },
    {
        "table":        "addresses",
        "entity_type":  "address",
        "page":         "Addresses",
        "search_cols":  ["label", "street", "city", "region", "country", "postal_code"],
        "display_cols": ["label", "street", "city", "region", "country", "postal_code"],
        "title":    lambda r: r.get("label") or r.get("street") or "Address",
        "subtitle": lambda r: ", ".join(filter(None, [
            r.get("city"), r.get("region"), r.get("country")
        ])) or "Address",
    },
    {
        "table":        "relationships",
        "entity_type":  "relationship",
        "page":         "Relationships",
        "search_cols":  ["from_name", "to_name", "relationship_type", "role"],
        "display_cols": ["relationship_type", "status", "from_name", "to_name", "role"],
        "title":    lambda r: (
            f"{r['from_name']} → {r['to_name']}"
            if r.get("from_name") and r.get("to_name") else None
        ) or r.get("relationship_type") or "Relationship",
        "subtitle": lambda r: (r.get("relationship_type") or "Relationship").replace("_", " "),
    },
    {
        "table":        "documents",
        "entity_type":  "document",
        "page":         "Documents",
        "search_cols":  ["title", "document_type", "description"],
        "display_cols": ["title", "document_type", "status", "created_date"],
        "title":    lambda r: r.get("title") or "Document",
        "subtitle": lambda r: r.get("document_type") or "Document",
    },
    {
        "table":        "schedules",
        "entity_type":  "schedule",
        "page":         "Schedules",
        "search_cols":  ["title", "name", "schedule_type", "description"],
        "display_cols": ["title", "schedule_type", "frequency", "status"],
        "title":    lambda r: r.get("title") or r.get("name") or "Schedule",
        "subtitle": lambda r: _join(r.get("schedule_type") or "Schedule", r.get("frequency") or ""),
    },
    {
        "table":        "signals",
        "entity_type":  "signal",
        "page":         "Signals",
        "search_cols":  ["name", "signal_type", "source", "description"],
        "display_cols": ["name", "signal_type", "source", "status"],
        "title":    lambda r: r.get("name") or "Signal",
        "subtitle": lambda r: r.get("signal_type") or "Signal",
    },
    {
        "table":        "channels",
        "entity_type":  "channel",
        "page":         "Channels",
        "search_cols":  ["name", "channel_type", "description"],
        "display_cols": ["name", "channel_type", "status"],
        "title":    lambda r: r.get("name") or "Channel",
        "subtitle": lambda r: r.get("channel_type") or "Channel",
    },
    {
        "table":        "territories",
        "entity_type":  "territory",
        "page":         "Territories",
        "search_cols":  ["name", "territory_type", "region", "country"],
        "display_cols": ["name", "territory_type", "region", "country"],
        "title":    lambda r: r.get("name") or "Territory",
        "subtitle": lambda r: _join(
            r.get("territory_type") or "", r.get("region") or "", r.get("country") or ""
        ) or "Territory",
    },
]

_SKIP_FIELD_VALUES = {"", "nan", "None", "none", "null"}


def _search_one(engine, cfg: dict, company_id: str, pattern: str, limit: int) -> list[dict]:
    """Query one raw table. Returns [] silently on any error or missing table."""
    try:
        actual = _actual_cols(engine, cfg["table"])
        if not actual:
            return []

        search_cols = [c for c in cfg["search_cols"] if c in actual]
        if not search_cols:
            return []

        display_cols = [c for c in cfg["display_cols"] if c in actual and c not in search_cols]
        all_cols = ["id"] + [c for c in cfg["display_cols"] if c in actual]
        select = ", ".join(f'"{c}"' for c in dict.fromkeys(all_cols))  # dedupe, preserve order

        where = " OR ".join(
            f'CAST(COALESCE("{c}", \'\') AS TEXT) ILIKE :q' for c in search_cols
        )
        sql = f"""
            SELECT {select}
            FROM raw.{cfg['table']}
            WHERE company_id = :cid AND ({where})
            ORDER BY id
            LIMIT :limit
        """
        with engine.connect() as conn:
            result = conn.execute(text(sql), {"cid": company_id, "q": pattern, "limit": limit})
            keys = list(result.keys())
            rows = [dict(zip(keys, r)) for r in result.fetchall()]
    except Exception as exc:
        logger.debug("search(%s): %s", cfg["table"], exc)
        return []

    out = []
    for row in rows:
        fields = {
            k: str(v)
            for k, v in row.items()
            if k != "id" and v is not None and str(v).strip() not in _SKIP_FIELD_VALUES
        }
        out.append({
            "id":          str(row.get("id") or ""),
            "entity_type": cfg["entity_type"],
            "page":        cfg["page"],
            "title":       cfg["title"](row),
            "subtitle":    cfg["subtitle"](row),
            "fields":      fields,
        })
    return out


@router.get("")
def search(
    q:          str = Query(..., min_length=1, max_length=200),
    company_id: str = Query(...),
    limit:      int = Query(5, ge=1, le=20),
    x_api_key:  str = Header(None),
):
    """
    Search all raw entity tables for q, scoped to company_id.
    Returns up to `limit` results per entity type.
    """
    if settings.api_key and x_api_key != settings.api_key:
        raise HTTPException(status_code=401, detail="Unauthorized")

    engine = get_engine_safe()
    if not engine:
        # Signal to frontend to fall back to Base44 direct calls
        return {"results": [], "query": q, "total": 0, "source": "no_db"}

    pattern = f"%{q.strip()}%"
    results: list[dict] = []
    for cfg in _ENTITIES:
        results.extend(_search_one(engine, cfg, company_id, pattern, limit))

    logger.info("search: q=%r company_id=%s → %d results", q, company_id, len(results))
    return {"results": results, "query": q, "total": len(results), "source": "raw"}
