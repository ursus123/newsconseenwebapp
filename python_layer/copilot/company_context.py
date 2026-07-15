"""
Company context awareness for Idjwi.

This module gathers the non-generative context Idjwi needs before answering:
current page, selected entity/record, recent session state, latest import,
connector hints, missing data, and weak graph connections.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import text

from database import get_engine_safe


_SESSION_CONTEXT_CACHE: dict[str, dict[str, Any]] = {}


def build_company_context(
    company_id: str,
    request_context: dict | None = None,
    *,
    history: list | None = None,
    session_id: str = "",
    principal=None,
) -> dict[str, Any]:
    ctx = dict(request_context or {})
    tenant_authorized = bool(getattr(principal, "tenant_authorized", True))
    base = {
        "company_id": company_id,
        "tenant_authorized": tenant_authorized,
        "viewport": _viewport_context(ctx),
        "selected_enterprise": _selected_enterprise(ctx),
        "selected_record": _selected_record(ctx),
        "session": _session_context(company_id, session_id, history or [], ctx),
        "last_import": None,
        "active_connector": _active_connector_from_request(ctx),
        "tenant_data_health": {},
        "weak_connections": [],
        "missing_data": [],
        "changes_since_last_session": [],
    }

    if not company_id or not tenant_authorized:
        base["changes_since_last_session"] = _compare_session_snapshot(company_id, session_id, base)
        return base

    base["last_import"] = _latest_import(company_id)
    base["active_connector"] = base["active_connector"] or _latest_connector(company_id)
    base["tenant_data_health"] = _tenant_data_health(company_id)
    base["weak_connections"] = _weak_connections(company_id)
    base["missing_data"] = _missing_data(base["tenant_data_health"], base["weak_connections"])
    base["changes_since_last_session"] = _compare_session_snapshot(company_id, session_id, base)
    return base


def format_company_context_for_prompt(company_context: dict[str, Any]) -> str:
    if not company_context:
        return ""
    lines = ["Company context available to Idjwi:"]
    viewport = company_context.get("viewport") or {}
    if viewport.get("current_page"):
        lines.append(f"- current_page: {viewport.get('current_page')}")
    selected_record = company_context.get("selected_record") or {}
    if selected_record.get("entity_type") or selected_record.get("entity_id"):
        lines.append(
            "- selected_record: "
            f"{selected_record.get('entity_type') or 'unknown'} "
            f"{selected_record.get('entity_label') or selected_record.get('entity_id') or ''}".strip()
        )
    selected_enterprise = company_context.get("selected_enterprise") or {}
    if selected_enterprise.get("enterprise_name") or selected_enterprise.get("enterprise_id"):
        lines.append(
            "- selected_enterprise: "
            f"{selected_enterprise.get('enterprise_name') or selected_enterprise.get('enterprise_id')}"
        )
    last_import = company_context.get("last_import")
    if last_import:
        lines.append(
            "- last_import: "
            f"{last_import.get('source_name') or last_import.get('plan_id')} "
            f"({last_import.get('status')}, rows={last_import.get('row_count') or last_import.get('rows_total')})"
        )
    connector = company_context.get("active_connector")
    if connector:
        lines.append(
            "- active_connector: "
            f"{connector.get('connector_name') or connector.get('connector_id') or connector.get('source_name')}"
        )
    health = company_context.get("tenant_data_health") or {}
    if health.get("entity_counts"):
        compact_counts = ", ".join(
            f"{k}:{v}" for k, v in health["entity_counts"].items()
            if isinstance(v, int) and v > 0
        )
        if compact_counts:
            lines.append(f"- entity_counts: {compact_counts}")
    missing = company_context.get("missing_data") or []
    if missing:
        lines.append("- missing_data: " + "; ".join(missing[:5]))
    weak = company_context.get("weak_connections") or []
    if weak:
        lines.append(
            "- weak_connections: "
            + "; ".join(
                f"{w.get('entity_type')}:{w.get('gap_type')}:{w.get('record_label')}"
                for w in weak[:5]
            )
        )
    changes = company_context.get("changes_since_last_session") or []
    if changes:
        lines.append("- changes_since_last_session: " + "; ".join(changes[:5]))
    return "\n".join(lines)


def answer_company_context_question(company_context: dict[str, Any], question: str) -> str:
    q = (question or "").lower()
    if not any(term in q for term in (
        "what page", "where am i", "current page", "selected enterprise",
        "which enterprise", "selected record", "record is open", "what record",
        "last import", "import just happened", "active connector", "which connector",
        "what changed since last session", "changed since last session",
        "what data is missing", "data missing", "weakly connected",
        "weak connections", "company context", "what context",
    )):
        return ""

    viewport = company_context.get("viewport") or {}
    selected_enterprise = company_context.get("selected_enterprise") or {}
    selected_record = company_context.get("selected_record") or {}
    last_import = company_context.get("last_import")
    connector = company_context.get("active_connector")
    missing = company_context.get("missing_data") or []
    weak = company_context.get("weak_connections") or []
    changes = company_context.get("changes_since_last_session") or []

    lines = ["**Current company context**"]
    lines.append(f"- Page: {viewport.get('current_page') or viewport.get('route') or 'Unknown'}")
    if selected_enterprise.get("enterprise_name") or selected_enterprise.get("enterprise_id"):
        lines.append(
            f"- Selected enterprise: {selected_enterprise.get('enterprise_name') or selected_enterprise.get('enterprise_id')}"
        )
    else:
        lines.append("- Selected enterprise: none provided by the current view")
    if selected_record.get("entity_type") or selected_record.get("entity_id"):
        label = selected_record.get("entity_label") or selected_record.get("entity_id") or "open record"
        lines.append(f"- Open record: {selected_record.get('entity_type') or 'record'} - {label}")
    else:
        lines.append("- Open record: none provided by the current view")
    if last_import:
        lines.append(
            "- Last import: "
            f"{last_import.get('source_name') or last_import.get('plan_id')} "
            f"({last_import.get('status')}, rows={last_import.get('row_count')})"
        )
    else:
        lines.append("- Last import: none found")
    if connector:
        lines.append(
            "- Active/recent connector: "
            f"{connector.get('connector_name') or connector.get('connector_id') or connector.get('source_name')}"
        )
    else:
        lines.append("- Active/recent connector: none found")
    if changes:
        lines.append("- Changed since this Idjwi session last checked: " + "; ".join(changes))
    else:
        lines.append("- Changed since this Idjwi session last checked: no tracked changes yet")
    if missing:
        lines.append("- Missing data signals:")
        lines.extend(f"  - {item}" for item in missing[:6])
    if weak:
        lines.append("- Weak graph connections sampled:")
        for gap in weak[:6]:
            lines.append(
                f"  - {gap.get('record_label') or gap.get('record_id')} "
                f"({gap.get('entity_type')}) - {str(gap.get('gap_type') or '').replace('_', ' ')}"
            )
    return "\n".join(lines)


def _viewport_context(ctx: dict) -> dict:
    return {
        "current_page": ctx.get("current_page") or ctx.get("page") or "",
        "route": ctx.get("route") or ctx.get("pathname") or "",
        "url": ctx.get("url") or "",
        "surface": ctx.get("surface") or "idjwi_chat",
    }


def _selected_enterprise(ctx: dict) -> dict:
    return {
        "enterprise_id": ctx.get("enterprise_id") or ctx.get("selected_enterprise_id") or "",
        "enterprise_name": ctx.get("enterprise_name") or ctx.get("selected_enterprise_name") or "",
    }


def _selected_record(ctx: dict) -> dict:
    return {
        "entity_type": ctx.get("selected_entity_type") or ctx.get("entity_type") or "",
        "entity_id": ctx.get("selected_entity_id") or ctx.get("entity_id") or "",
        "entity_label": ctx.get("selected_entity_label") or ctx.get("entity_label") or "",
    }


def _session_context(company_id: str, session_id: str, history: list, ctx: dict) -> dict:
    last_user = ""
    for msg in reversed(history or []):
        if msg.get("role") == "user":
            last_user = str(msg.get("content") or "")[:300]
            break
    return {
        "session_id": session_id or ctx.get("session_id") or "",
        "history_message_count": len(history or []),
        "last_user_message": last_user,
    }


def _active_connector_from_request(ctx: dict) -> dict | None:
    connector_id = ctx.get("connector_id") or ctx.get("active_connector_id") or ctx.get("source_id")
    connector_name = ctx.get("connector_name") or ctx.get("active_connector_name") or ctx.get("source_name")
    if not connector_id and not connector_name:
        return None
    return {
        "connector_id": connector_id or "",
        "connector_name": connector_name or "",
        "source_name": ctx.get("source_name") or connector_name or "",
        "source_kind": ctx.get("source_kind") or "connector",
    }


def _table_exists(conn, schema: str, table: str) -> bool:
    row = conn.execute(
        text(
            "SELECT 1 FROM information_schema.tables "
            "WHERE table_schema = :schema AND table_name = :table LIMIT 1"
        ),
        {"schema": schema, "table": table},
    ).fetchone()
    return bool(row)


def _latest_import(company_id: str) -> dict | None:
    engine = get_engine_safe()
    if engine is None:
        return None
    try:
        with engine.connect() as conn:
            if not _table_exists(conn, "analytics", "ingestion_plans"):
                return None
            row = conn.execute(
                text(
                    "SELECT id, source_name, file_type, row_count, status, "
                    "created_at::text, reviewed_at::text, loaded_at::text "
                    "FROM analytics.ingestion_plans "
                    "WHERE company_id = :cid "
                    "ORDER BY COALESCE(loaded_at, reviewed_at, created_at) DESC "
                    "LIMIT 1"
                ),
                {"cid": company_id},
            ).mappings().fetchone()
            if not row:
                return None
            result = dict(row)
            result["plan_id"] = result.pop("id", None)
            return result
    except Exception:
        return None


def _latest_connector(company_id: str) -> dict | None:
    engine = get_engine_safe()
    if engine is None:
        return None
    try:
        with engine.connect() as conn:
            if _table_exists(conn, "public", "connector_runs"):
                row = conn.execute(
                    text(
                        "SELECT id, connector_id, source_name, status, started_at::text, finished_at::text "
                        "FROM public.connector_runs WHERE company_id = :cid "
                        "ORDER BY COALESCE(finished_at, started_at) DESC LIMIT 1"
                    ),
                    {"cid": company_id},
                ).mappings().fetchone()
                if row:
                    return dict(row)
            if _table_exists(conn, "analytics", "ingestion_schedules"):
                row = conn.execute(
                    text(
                        "SELECT id, source_name, status, last_triggered_at::text, created_at::text "
                        "FROM analytics.ingestion_schedules WHERE company_id = :cid "
                        "AND COALESCE(status, 'active') = 'active' "
                        "ORDER BY COALESCE(last_triggered_at, created_at) DESC LIMIT 1"
                    ),
                    {"cid": company_id},
                ).mappings().fetchone()
                if row:
                    return dict(row)
    except Exception:
        return None
    return None


def _tenant_data_health(company_id: str) -> dict:
    tables = {
        "people": ("raw", "people"),
        "enterprises": ("raw", "enterprises"),
        "products": ("raw", "products"),
        "tasks": ("raw", "tasks"),
        "transactions": ("raw", "transactions"),
        "relationships": ("raw", "relationships"),
        "addresses": ("raw", "addresses"),
        "services": ("raw", "services"),
        "documents": ("raw", "documents"),
        "schedules": ("raw", "schedules"),
        "animals": ("raw", "animals"),
        "plots": ("raw", "plots"),
        "observations": ("raw", "observations"),
    }
    counts: dict[str, int] = {}
    engine = get_engine_safe()
    if engine is None:
        return {"entity_counts": counts, "source": "unavailable"}
    try:
        with engine.connect() as conn:
            for label, (schema, table) in tables.items():
                if not _table_exists(conn, schema, table):
                    counts[label] = 0
                    continue
                row = conn.execute(
                    text(f"SELECT COUNT(*) AS count FROM {schema}.{table} WHERE company_id = :cid"),
                    {"cid": company_id},
                ).mappings().fetchone()
                counts[label] = int(row["count"] or 0) if row else 0
    except Exception:
        return {"entity_counts": counts, "source": "partial"}
    return {"entity_counts": counts, "source": "raw"}


def _weak_connections(company_id: str) -> list[dict]:
    try:
        from .queries import find_graph_gaps
        result = find_graph_gaps(company_id=company_id, entity_type="all", gap_type="all", limit=12)
        return [
            {
                "gap_type": gap.get("gap_type"),
                "entity_type": gap.get("entity_type"),
                "record_id": gap.get("record_id"),
                "record_label": gap.get("record_label"),
                "details": gap.get("details"),
            }
            for gap in result.get("gaps", [])[:12]
        ]
    except Exception:
        return []


def _missing_data(health: dict, weak_connections: list[dict]) -> list[str]:
    counts = health.get("entity_counts") or {}
    missing = []
    for entity in ("enterprises", "people", "relationships"):
        if counts.get(entity, 0) == 0:
            missing.append(f"No {entity} records found.")
    if counts.get("transactions", 0) == 0:
        missing.append("No transactions found, so revenue and AR analysis will be limited.")
    if counts.get("tasks", 0) == 0:
        missing.append("No tasks found, so workflow and assignment analysis will be limited.")
    if weak_connections:
        missing.append(f"{len(weak_connections)} weak graph connection(s) detected in the current sample.")
    return missing


def _compare_session_snapshot(company_id: str, session_id: str, current: dict) -> list[str]:
    if not session_id:
        return []
    key = f"{company_id}::{session_id}"
    previous = _SESSION_CONTEXT_CACHE.get(key)
    _SESSION_CONTEXT_CACHE[key] = {
        "seen_at": datetime.now(timezone.utc).isoformat(),
        "viewport": current.get("viewport"),
        "selected_record": current.get("selected_record"),
        "last_import": current.get("last_import"),
        "active_connector": current.get("active_connector"),
        "weak_count": len(current.get("weak_connections") or []),
    }
    if not previous:
        return []
    changes = []
    if previous.get("viewport") != current.get("viewport"):
        changes.append("viewport changed")
    if previous.get("selected_record") != current.get("selected_record"):
        changes.append("selected record changed")
    if previous.get("last_import") != current.get("last_import"):
        changes.append("latest import changed")
    if previous.get("active_connector") != current.get("active_connector"):
        changes.append("active connector changed")
    if previous.get("weak_count") != len(current.get("weak_connections") or []):
        changes.append("weak connection sample changed")
    return changes
