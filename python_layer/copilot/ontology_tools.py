"""
python_layer/copilot/ontology_tools.py
=======================================
Ontology-native read tools for the Copilot:
  get_company_graph_context  — subgraph around any entity
  get_enrichment_context     — enrichment history for an entity
  search_intelligence        — search insights/risks/opportunities/recommendations
  get_ontology_schema        — static schema for all 15 canonical entities
"""

import logging
from typing import Optional

from database import get_engine_safe
from data_sources import supabase_source
from sqlalchemy import text

logger = logging.getLogger(__name__)


def _run(sql: str, params: dict) -> list[dict]:
    engine = get_engine_safe()
    if not engine:
        return []
    try:
        with engine.connect() as conn:
            result = conn.execute(text(sql), params)
            cols = list(result.keys())
            return [dict(zip(cols, row)) for row in result.fetchall()]
    except Exception as e:
        logger.warning("ontology_tools query failed: %s", e)
        return []


# ─── Graph context ────────────────────────────────────────────────────────────

def get_company_graph_context(
    company_id: str,
    subject_type: str,
    subject_id: str,
    depth: int = 1,
    include_types: Optional[list] = None,
) -> dict:
    """
    Build a graph subgraph around a given entity (1-hop by default).
    Returns center entity, connected nodes (relationships/tasks/transactions),
    and edges between them.
    """
    _TABLE = {
        "enterprise":   "enterprises",
        "person":       "people",
        "product":      "products",
        "task":         "tasks",
        "transaction":  "transactions",
        "address":      "addresses",
        "relationship": "relationships",
    }
    table = _TABLE.get(subject_type)
    center: dict = {}
    if table:
        rows = _run(
            f"SELECT * FROM raw.{table} WHERE company_id = :cid AND id = :sid LIMIT 1",
            {"cid": company_id, "sid": subject_id},
        )
        center = rows[0] if rows else {}

    def _label(record: dict) -> str:
        for f in ("name", "title", "full_name", "first_name", "description"):
            if record.get(f):
                return str(record[f])[:60]
        return subject_id[:12]

    nodes: list[dict] = [{"id": subject_id, "type": subject_type,
                           "label": _label(center), "data": center}]
    edges: list[dict] = []
    seen: set = {subject_id}

    # ── Relationships ─────────────────────────────────────────────────────────
    rel_rows = _run(
        """SELECT id, relationship_type, person_id, enterprise_id, status
           FROM raw.relationships
           WHERE company_id = :cid
             AND (person_id = :sid OR enterprise_id = :sid)
           LIMIT 40""",
        {"cid": company_id, "sid": subject_id},
    )
    for r in rel_rows:
        if r.get("enterprise_id") == subject_id:
            other_id   = r.get("person_id")
            other_type = "person"
        else:
            other_id   = r.get("enterprise_id")
            other_type = "enterprise"

        if other_id and other_id not in seen:
            if not include_types or other_type in include_types:
                seen.add(other_id)
                nodes.append({"id": other_id, "type": other_type,
                               "label": other_id[:12], "via": "relationship"})
        edges.append({
            "from": subject_id, "to": other_id or subject_id,
            "type": r.get("relationship_type", "related_to"), "id": r["id"],
        })

    # ── Tasks ─────────────────────────────────────────────────────────────────
    if not include_types or "task" in include_types:
        task_col = "enterprise_id" if subject_type == "enterprise" else "person_id"
        for t in _run(
            f"""SELECT id, title, task_type, status, assigned_to
                FROM raw.tasks WHERE company_id = :cid AND {task_col} = :sid
                LIMIT 20""",
            {"cid": company_id, "sid": subject_id},
        ):
            if t["id"] not in seen:
                seen.add(t["id"])
                nodes.append({"id": t["id"], "type": "task",
                               "label": (t.get("title") or "Task")[:60], "data": t})
            edges.append({"from": subject_id, "to": t["id"], "type": "has_task"})

    # ── Transactions ──────────────────────────────────────────────────────────
    if not include_types or "transaction" in include_types:
        tx_col = "enterprise_id" if subject_type == "enterprise" else "person_id"
        for tx in _run(
            f"""SELECT id, description, transaction_type, amount, status
                FROM raw.transactions WHERE company_id = :cid AND {tx_col} = :sid
                LIMIT 20""",
            {"cid": company_id, "sid": subject_id},
        ):
            if tx["id"] not in seen:
                seen.add(tx["id"])
                nodes.append({"id": tx["id"], "type": "transaction",
                               "label": (tx.get("description") or "Transaction")[:60], "data": tx})
            edges.append({"from": subject_id, "to": tx["id"], "type": "has_transaction"})

    return {
        "subject_type": subject_type,
        "subject_id":   subject_id,
        "center":       center,
        "nodes":        nodes[:60],
        "edges":        edges[:120],
        "node_count":   len(nodes),
        "edge_count":   len(edges),
        "data_source":  "raw",
    }


# ─── Enrichment context ───────────────────────────────────────────────────────

def get_enrichment_context(
    company_id: str,
    entity_type: str,
    entity_id: str,
    enrichment_types: Optional[list] = None,
) -> dict:
    """
    Return enrichment history and freshness for a specific entity.
    Shows what external data has been collected (competitors, news, economic indicators).
    """
    base_params: dict = {"cid": company_id, "etype": entity_type, "eid": entity_id}
    where = "company_id = :cid AND entity_type = :etype AND entity_id = :eid"

    if enrichment_types:
        placeholders = ", ".join(f":et{i}" for i in range(len(enrichment_types)))
        for i, et in enumerate(enrichment_types):
            base_params[f"et{i}"] = et
        where += f" AND enrichment_type IN ({placeholders})"

    events = _run(
        f"""SELECT enrichment_type, status, insights_generated, error_message,
                   data_summary, completed_at
            FROM analytics.enrichment_events
            WHERE {where}
            ORDER BY completed_at DESC LIMIT 20""",
        base_params,
    )
    freshness = _run(
        f"""SELECT enrichment_type, last_enriched_at, is_stale
            FROM analytics.enrichment_freshness
            WHERE company_id = :cid AND entity_type = :etype AND entity_id = :eid""",
        {"cid": company_id, "etype": entity_type, "eid": entity_id},
    )

    completed = [e for e in events if e.get("status") == "completed"]
    return {
        "entity_type":        entity_type,
        "entity_id":          entity_id,
        "enrichment_events":  events,
        "freshness":          freshness,
        "completed_count":    len(completed),
        "insights_generated": sum(e.get("insights_generated", 0) or 0 for e in completed),
        "has_stale_data":     any(f.get("is_stale") for f in freshness),
        "data_source":        "analytics",
    }


# ─── Intelligence entity search ───────────────────────────────────────────────

def search_intelligence(
    company_id: str,
    intelligence_type: str = "insight",
    subject_type: Optional[str] = None,
    subject_id: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = 20,
) -> dict:
    """
    Search insights, risks, opportunities, or recommendations.
    Tries Supabase intelligence tables first, falls back to local analytics tables.
    """
    if intelligence_type in ("insight", "risk", "opportunity", "recommendation"):
        items = supabase_source.list_records(intelligence_type, company_id=company_id, limit=limit)
        if subject_type:
            items = [i for i in items if i.get("subject_type") == subject_type]
        if subject_id:
            items = [i for i in items if i.get("subject_id") == subject_id]
        if status:
            items = [i for i in items if i.get("status") == status]
    else:
        items = []

    if items:
        return {
            "intelligence_type": intelligence_type,
            "items":  items[:limit],
            "count":  len(items),
            "source": "supabase_live",
        }

    # Local fallback — copilot_insights table
    if intelligence_type in ("insight", "risk", "opportunity"):
        rows = _run(
            """SELECT id, insight_type, title, body, subject_type, subject_id,
                      status, created_at, source
               FROM analytics.copilot_insights
               WHERE company_id = :cid
                 AND (:st::text IS NULL OR subject_type = :st)
                 AND (:si::text IS NULL OR subject_id   = :si)
                 AND (:status::text IS NULL OR status    = :status)
               ORDER BY created_at DESC LIMIT :lim""",
            {"cid": company_id, "st": subject_type, "si": subject_id,
             "status": status, "lim": limit},
        )
        return {
            "intelligence_type": intelligence_type,
            "items":  rows,
            "count":  len(rows),
            "source": "local",
            "note":   f"Supabase {intelligence_type} records unavailable - showing local only.",
        }

    # Recommendation fallback — agent_approvals
    if intelligence_type == "recommendation":
        rows = _run(
            """SELECT id, action_type, action_label AS title, reasoning AS rationale,
                      status, risk_level, created_at
               FROM analytics.agent_approvals
               WHERE company_id = :cid
                 AND agent_name = 'copilot'
                 AND (:status::text IS NULL OR status = :status)
               ORDER BY created_at DESC LIMIT :lim""",
            {"cid": company_id, "status": status, "lim": limit},
        )
        return {
            "intelligence_type": "recommendation",
            "items":  rows,
            "count":  len(rows),
            "source": "agent_approvals",
        }

    return {"intelligence_type": intelligence_type, "items": [], "count": 0,
            "note": "No intelligence data available."}


# ─── Static ontology schema ───────────────────────────────────────────────────

def get_ontology_schema(company_id: str = "") -> dict:
    """
    Return the Newsconseen universal ontology schema — all 15 canonical entities
    with key fields and valid enum values. Call before complex entity queries.
    """
    return {
        "entity_types": [
            "enterprise", "person", "product", "task", "transaction",
            "relationship", "address",
            "document", "schedule", "signal", "channel", "territory",
            "animal", "plot", "observation",
        ],
        "intelligence_entities": ["insight", "risk", "opportunity", "recommendation"],
        "schema": {
            "person": {
                "person_type":       ["staff", "client", "contact", "volunteer"],
                "status":            ["active", "inactive", "on_leave"],
                "engagement_model":  ["employed", "contracted", "freelance", "volunteer",
                                      "elected", "appointed", "enrolled", "subscribed"],
                "availability_status": ["available", "busy", "on_leave", "unavailable"],
            },
            "enterprise": {
                "enterprise_type":   ["commercial", "nonprofit", "government",
                                      "household", "cooperative", "trust"],
                "enterprise_tier":   ["headquarters", "regional_office", "branch",
                                      "subsidiary", "franchise", "department", "unit", "project"],
                "operating_status":  ["open", "closed", "temporarily_closed", "seasonal"],
                "status":            ["active", "inactive", "prospect", "archived"],
            },
            "product": {
                "item_type":  ["physical", "living", "digital", "service_package",
                               "financial_instrument"],
                "item_class": ["perishable", "non_perishable", "hazardous", "controlled",
                               "serialized", "consumable", "reusable", "returnable"],
            },
            "task": {
                "status": ["pending", "in_progress", "completed", "overdue", "cancelled"],
            },
            "transaction": {
                "transaction_type": ["invoice", "payment", "expense", "payroll", "refund",
                                     "sale", "purchase", "transfer"],
                "status": ["draft", "sent", "paid", "overdue", "cancelled"],
            },
            "relationship": {
                "relationship_type": ["employs", "client_of", "supplies", "partners_with",
                                      "owns", "manages", "reports_to"],
            },
            "recommendation": {
                "action_type": ["create_task", "create_chart", "update_record",
                                "create_report", "create_workflow", "send_message"],
                "status":      ["proposed", "approved", "rejected", "executed", "deferred"],
                "priority":    ["critical", "high", "medium", "low"],
            },
            "insight": {
                "insight_type": ["explanation", "trend", "anomaly", "correlation",
                                 "forecast", "risk_finding"],
                "status":       ["active", "archived", "superseded"],
            },
        },
        "datamart_tables": [
            "analytics.people_summary", "analytics.enterprise_summary",
            "analytics.product_summary", "analytics.transaction_summary",
            "analytics.task_summary", "analytics.monthly_kpis",
            "analytics.company_scorecard", "analytics.enrichment_events",
            "analytics.enrichment_freshness", "analytics.copilot_insights",
            "analytics.agent_approvals",
        ],
    }
