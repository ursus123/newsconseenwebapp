"""
market/enrichment_planner.py

Scans a company's ontology data and produces a prioritised enrichment plan.
Determines what enrichment is needed, what is stale, and what is missing.
"""

import logging
from typing import Optional
from datetime import datetime, timedelta, timezone
from database import get_engine_safe
from data_sources import supabase_source
from sqlalchemy import text

logger = logging.getLogger(__name__)

# ── Freshness windows (days) ───────────────────────────────────────

FRESHNESS_WINDOWS = {
    "competitors":     30,
    "news":             1,
    "economic":        90,
    "labor":           90,
    "location":       180,
    "industry":       365,
    "risk":            30,
    "opportunity":     30,
}

# ── Field requirements per enrichment type ─────────────────────────

REQUIRED_FIELDS = {
    "enterprise": {
        "location":    ["city", "country"],
        "industry":    ["enterprise_name"],
        "competitors": ["city", "country"],
        "economic":    ["country"],
        "news":        ["enterprise_name"],
    },
    "address": {
        "location":    ["address_line1", "city"],
    },
    "territory": {
        "location":    ["name"],
        "economic":    ["name"],
    },
    "person": {
        "risk":        ["company_id"],
    },
    "product": {
        "risk":        ["item_name"],
        "opportunity": ["item_name"],
    },
}

ENRICHMENT_TYPES_BY_ENTITY = {
    "enterprise": ["location", "industry", "competitors", "economic", "labor", "news", "risk", "opportunity"],
    "address":    ["location"],
    "territory":  ["location", "economic", "opportunity"],
    "person":     ["risk"],
    "product":    ["risk", "opportunity"],
}


def _fetch_supabase(entity: str, company_id: Optional[str]) -> list:
    try:
        return supabase_source.list_records(entity, company_id=company_id, limit=1000)
    except Exception as exc:
        logger.debug("Supabase fetch %s - %s", entity, exc)
        return []


def _load_analytics(table: str, company_id: Optional[str]) -> list:
    engine = get_engine_safe()
    if not engine:
        return []
    try:
        with engine.connect() as conn:
            where = "WHERE company_id = :cid" if company_id else ""
            rows = conn.execute(
                text(f"SELECT * FROM analytics.{table} {where}"),
                {"cid": company_id} if company_id else {},
            ).mappings().all()
            return [dict(r) for r in rows]
    except Exception:
        return []


def _get_last_enriched(engine, company_id: str, entity_type: str, entity_id: str, enrichment_type: str):
    """Return the most recent successful enrichment timestamp for this entity+type."""
    if not engine:
        return None
    try:
        with engine.connect() as conn:
            row = conn.execute(
                text("""
                    SELECT completed_at FROM analytics.enrichment_events
                    WHERE company_id      = :cid
                      AND entity_type     = :etype
                      AND entity_id       = :eid
                      AND enrichment_type = :enrich_type
                      AND status          = 'completed'
                    ORDER BY completed_at DESC
                    LIMIT 1
                """),
                {"cid": company_id, "etype": entity_type, "eid": entity_id, "enrich_type": enrichment_type},
            ).fetchone()
            return row[0] if row else None
    except Exception:
        return None


def _is_stale(last_enriched, enrichment_type: str) -> bool:
    if not last_enriched:
        return True
    window_days = FRESHNESS_WINDOWS.get(enrichment_type, 30)
    if isinstance(last_enriched, str):
        try:
            last_enriched = datetime.fromisoformat(last_enriched.replace("Z", "+00:00"))
        except Exception:
            return True
    if last_enriched.tzinfo is None:
        last_enriched = last_enriched.replace(tzinfo=timezone.utc)
    return datetime.now(timezone.utc) - last_enriched > timedelta(days=window_days)


def _missing_fields(entity: dict, required: list) -> list:
    return [f for f in required if not entity.get(f)]


def _priority_score(entity: dict, enrichment_type: str, missing: list, is_stale: bool) -> str:
    if missing:
        return "high"
    if is_stale:
        return "medium"
    return "low"


def build_enrichment_plan(company_id: str) -> dict:
    """
    Scan all entities for a company and return a prioritised enrichment plan.

    Returns:
        {
            plan: [{ entity_type, entity_id, entity_name, enrichment_needed[], missing_fields[], priority, reason }],
            summary: { total, high_priority, medium_priority, by_type }
        }
    """
    engine = get_engine_safe()
    plan = []

    # ── Enterprises ────────────────────────────────────────────────
    enterprises = _load_analytics("enterprise_summary", company_id)
    if not enterprises:
        enterprises = _fetch_supabase("enterprise", company_id)

    for ent in enterprises[:50]:  # cap at 50 for performance
        entity_id   = str(ent.get("id", ""))
        entity_name = str(ent.get("enterprise_name", ent.get("name", "")))

        enrichment_needed = []
        all_missing = []
        reasons = []

        for etype in ENRICHMENT_TYPES_BY_ENTITY.get("enterprise", []):
            required = REQUIRED_FIELDS.get("enterprise", {}).get(etype, [])
            missing  = _missing_fields(ent, required)
            stale    = _is_stale(_get_last_enriched(engine, company_id, "enterprise", entity_id, etype), etype)

            if missing:
                reasons.append(f"Missing fields for {etype}: {', '.join(missing)}")
            elif stale:
                reasons.append(f"{etype} enrichment is stale")
            else:
                continue

            enrichment_needed.append(etype)
            all_missing.extend(missing)

        if enrichment_needed:
            priority = "high" if any(f in ["city", "country"] for f in all_missing) else "medium" if all_missing else "low"
            plan.append({
                "entity_type":       "enterprise",
                "entity_id":         entity_id,
                "entity_name":       entity_name,
                "enrichment_needed": enrichment_needed,
                "missing_fields":    list(set(all_missing)),
                "priority":          priority,
                "reason":            " · ".join(reasons[:2]) if reasons else "Enrichment stale",
            })

    # ── Addresses ─────────────────────────────────────────────────
    addresses = _load_analytics("address_summary", company_id)
    if not addresses:
        addresses = _fetch_supabase("address", company_id)

    for addr in addresses[:30]:
        entity_id = str(addr.get("id", ""))
        if not addr.get("latitude") or not addr.get("longitude"):
            plan.append({
                "entity_type":       "address",
                "entity_id":         entity_id,
                "entity_name":       addr.get("address_line1") or addr.get("address") or entity_id,
                "enrichment_needed": ["location"],
                "missing_fields":    ["latitude", "longitude"],
                "priority":          "medium",
                "reason":            "Address not geocoded",
            })

    # ── Territories ────────────────────────────────────────────────
    territories = _load_analytics("territory_summary", company_id)
    if not territories:
        territories = _fetch_supabase("territory", company_id)

    for terr in territories[:20]:
        entity_id = str(terr.get("id", ""))
        stale_eco = _is_stale(_get_last_enriched(engine, company_id, "territory", entity_id, "economic"), "economic")
        if stale_eco:
            plan.append({
                "entity_type":       "territory",
                "entity_id":         entity_id,
                "entity_name":       terr.get("name", entity_id),
                "enrichment_needed": ["economic", "opportunity"],
                "missing_fields":    [],
                "priority":          "low",
                "reason":            "Economic context stale",
            })

    # Sort: high → medium → low
    order = {"high": 0, "medium": 1, "low": 2}
    plan.sort(key=lambda x: order.get(x["priority"], 3))

    summary = {
        "total":           len(plan),
        "high_priority":   sum(1 for p in plan if p["priority"] == "high"),
        "medium_priority": sum(1 for p in plan if p["priority"] == "medium"),
        "low_priority":    sum(1 for p in plan if p["priority"] == "low"),
        "by_type": {
            "enterprise": sum(1 for p in plan if p["entity_type"] == "enterprise"),
            "address":    sum(1 for p in plan if p["entity_type"] == "address"),
            "territory":  sum(1 for p in plan if p["entity_type"] == "territory"),
        },
    }

    return {"plan": plan, "summary": summary}


def build_coverage_report(company_id: str) -> dict:
    """
    Returns per-entity-type enrichment coverage percentages.
    """
    engine = get_engine_safe()
    coverage = {}

    entity_configs = [
        ("enterprise", "enterprise_summary"),
        ("address",    "address_summary"),
        ("territory",  "territory_summary"),
        ("product",    "product_summary"),
        ("person",     "people_summary"),
    ]

    for entity_type, analytics_table in entity_configs:
        entities = _load_analytics(analytics_table, company_id) or _fetch_supabase(entity_type, company_id)
        total = len(entities)
        if total == 0:
            coverage[entity_type] = {"total": 0, "enriched": 0, "pct": 0, "stale": 0}
            continue

        enriched = 0
        stale    = 0

        if engine:
            try:
                with engine.connect() as conn:
                    row = conn.execute(
                        text("""
                            SELECT COUNT(DISTINCT entity_id) as enriched_count
                            FROM analytics.enrichment_events
                            WHERE company_id  = :cid
                              AND entity_type = :etype
                              AND status      = 'completed'
                        """),
                        {"cid": company_id, "etype": entity_type},
                    ).fetchone()
                    enriched = int(row[0]) if row else 0

                    row2 = conn.execute(
                        text("""
                            SELECT COUNT(DISTINCT entity_id) as stale_count
                            FROM analytics.enrichment_events
                            WHERE company_id  = :cid
                              AND entity_type = :etype
                              AND status      = 'completed'
                              AND completed_at < NOW() - INTERVAL '30 days'
                        """),
                        {"cid": company_id, "etype": entity_type},
                    ).fetchone()
                    stale = int(row2[0]) if row2 else 0
            except Exception:
                pass

        coverage[entity_type] = {
            "total":    total,
            "enriched": min(enriched, total),
            "pct":      round(min(enriched, total) / total * 100) if total > 0 else 0,
            "stale":    stale,
        }

    return coverage
