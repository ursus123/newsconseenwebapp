"""
market/enrichment_engine.py

Unified market enrichment runner.

For a given entity, fetches external data (competitors, news, economic
context, labor market, industry data), logs every enrichment attempt to
analytics.enrichment_events, and writes Intelligence objects (Insight,
Risk, Opportunity) back to Supabase.

Entry point:
    from market.enrichment_engine import run_market_enrichment
    result = run_market_enrichment(company_id, entity_type, entity_id,
                                   enrichment_types, trigger)
"""

from __future__ import annotations

import json
import logging
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from uuid import uuid4

import httpx
from sqlalchemy import text

from database import get_engine_safe
from data_sources import supabase_source

logger = logging.getLogger(__name__)

_WB_BASE  = "https://api.worldbank.org/v2"
_HN_BASE  = "https://hn.algolia.com/api/v1/search"
_OVP_BASE = "https://overpass-api.de/api/interpreter"

_OVERPASS_LAST_CALL = 0.0


# ── Helpers ───────────────────────────────────────────────────────────────────

def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _eid() -> str:
    return str(uuid4())


def _load_entity(entity_type: str, entity_id: str, company_id: str) -> dict:
    """Load a single entity from analytics → raw → Supabase."""
    engine = get_engine_safe()
    if engine:
        table_map = {
            "enterprise": "enterprise_summary",
            "address":    "address_summary",
            "territory":  "territory_summary",
        }
        table = table_map.get(entity_type)
        if table:
            try:
                with engine.connect() as conn:
                    row = conn.execute(
                        text(f"SELECT * FROM analytics.{table} WHERE id = :eid AND company_id = :cid LIMIT 1"),
                        {"eid": entity_id, "cid": company_id},
                    ).mappings().fetchone()
                    if row:
                        return dict(row)
            except Exception:
                pass

    try:
        items = supabase_source.list_records(entity_type, company_id=company_id, limit=1000)
        for item in items:
            if str(item.get("id")) == entity_id:
                return item
    except Exception as exc:
        logger.debug("_load_entity Supabase fallback failed: %s", exc)
    return {}


def _log_enrichment_event(
    company_id: str,
    entity_type: str,
    entity_id: str,
    enrichment_type: str,
    status: str,
    trigger: str,
    insights_generated: int = 0,
    error: Optional[str] = None,
    data_summary: Optional[str] = None,
) -> None:
    engine = get_engine_safe()
    if not engine:
        return
    try:
        with engine.begin() as conn:
            conn.execute(
                text("""
                    INSERT INTO analytics.enrichment_events
                        (id, company_id, entity_type, entity_id, enrichment_type,
                         status, trigger, insights_generated, error_message,
                         data_summary, completed_at)
                    VALUES
                        (:id, :cid, :etype, :eid, :enrich_type,
                         :status, :trigger, :insights, :error,
                         :data_summary, NOW())
                """),
                {
                    "id":           _eid(),
                    "cid":          company_id,
                    "etype":        entity_type,
                    "eid":          entity_id,
                    "enrich_type":  enrichment_type,
                    "status":       status,
                    "trigger":      trigger,
                    "insights":     insights_generated,
                    "error":        error,
                    "data_summary": data_summary,
                },
            )
    except Exception as exc:
        logger.debug("_log_enrichment_event failed: %s", exc)


def _write_insight_to_supabase(payload: dict) -> Optional[str]:
    """Insert a new Insight entity in Supabase. Returns the created id or None."""
    try:
        result = supabase_source.create_record("insight", payload, company_id=payload.get("company_id"))
        return result.get("id") if not result.get("error") else None
    except Exception as exc:
        logger.debug("_write_insight_to_supabase failed: %s", exc)
    return None


def _write_risk_to_supabase(payload: dict) -> Optional[str]:
    try:
        result = supabase_source.create_record("risk", payload, company_id=payload.get("company_id"))
        return result.get("id") if not result.get("error") else None
    except Exception as exc:
        logger.debug("_write_risk_to_supabase failed: %s", exc)
    return None


def _write_opportunity_to_supabase(payload: dict) -> Optional[str]:
    try:
        result = supabase_source.create_record("opportunity", payload, company_id=payload.get("company_id"))
        return result.get("id") if not result.get("error") else None
    except Exception as exc:
        logger.debug("_write_opportunity_to_supabase failed: %s", exc)
    return None


# -- Per-type enrichment functions ─────────────────────────────────────────────

def _enrich_competitors(entity: dict, company_id: str) -> tuple[Optional[dict], str]:
    """Fetch nearby competitors via Overpass for this entity's location."""
    global _OVERPASS_LAST_CALL

    lat = entity.get("latitude") or entity.get("lat")
    lng = entity.get("longitude") or entity.get("lng") or entity.get("lon")
    if not lat or not lng:
        return None, "no geocoordinates on entity"

    wait = 1.1 - (time.time() - _OVERPASS_LAST_CALL)
    if wait > 0:
        time.sleep(wait)
    _OVERPASS_LAST_CALL = time.time()

    try:
        tag_filter = '["amenity"]'
        query = f"""[out:json][timeout:25];
(
  node{tag_filter}(around:2000,{lat},{lng});
  node["shop"](around:2000,{lat},{lng});
  node["office"](around:2000,{lat},{lng});
);
out center 40;"""
        resp = httpx.post(
            _OVP_BASE,
            data={"data": query},
            headers={"User-Agent": "newsconseen-enrichment/1.0 (contact@newsconseen.com)"},
            timeout=30,
        )
        if not resp.is_success:
            return None, f"Overpass error {resp.status_code}"

        elements = resp.json().get("elements", [])
        named = [e for e in elements if e.get("tags", {}).get("name")]
        return {
            "count":       len(named),
            "competitors": named[:10],
            "radius_km":   2.0,
        }, ""
    except Exception as exc:
        return None, str(exc)


def _enrich_news(entity: dict, company_id: str) -> tuple[Optional[dict], str]:
    """Fetch recent news about this enterprise from Hacker News Algolia."""
    name = entity.get("enterprise_name") or entity.get("name", "")
    if not name:
        return None, "no enterprise name"

    try:
        resp = httpx.get(
            _HN_BASE,
            params={"query": name, "hitsPerPage": 10, "tags": "story"},
            timeout=10,
        )
        if not resp.is_success:
            return None, f"HN Algolia error {resp.status_code}"
        hits = resp.json().get("hits", [])
        return {"count": len(hits), "articles": hits[:5]}, ""
    except Exception as exc:
        return None, str(exc)


def _enrich_economic(entity: dict, company_id: str) -> tuple[Optional[dict], str]:
    """Fetch World Bank economic indicators for this entity's country."""
    country = entity.get("country") or entity.get("country_code", "")
    if not country:
        return None, "no country on entity"

    # World Bank uses 2-letter ISO codes
    cc = country[:2].upper()
    indicators = {
        "NY.GDP.MKTP.CD": "gdp_usd",
        "FP.CPI.TOTL.ZG": "inflation_pct",
        "SL.UEM.TOTL.ZS": "unemployment_pct",
    }
    result: Dict[str, Any] = {"country": cc, "indicators": {}}
    for code, label in indicators.items():
        try:
            r = httpx.get(
                f"{_WB_BASE}/country/{cc}/indicator/{code}",
                params={"format": "json", "mrv": 1, "per_page": 1},
                timeout=8,
            )
            if r.is_success:
                body = r.json()
                if isinstance(body, list) and len(body) > 1:
                    rows = body[1] or []
                    for row in rows:
                        if row.get("value") is not None:
                            result["indicators"][label] = {
                                "value": row["value"],
                                "year":  row.get("date"),
                            }
                            break
        except Exception:
            pass

    if not result["indicators"]:
        return None, f"no World Bank data for country {cc}"
    return result, ""


def _enrich_labor(entity: dict, company_id: str) -> tuple[Optional[dict], str]:
    """Fetch World Bank labor indicators for this entity's country."""
    country = entity.get("country") or entity.get("country_code", "")
    if not country:
        return None, "no country on entity"

    cc = country[:2].upper()
    indicators = {
        "SL.TLF.CACT.ZS":  "labor_participation_rate_pct",
        "SL.EMP.SELF.ZS":   "self_employment_pct",
    }
    result: Dict[str, Any] = {"country": cc, "indicators": {}}
    for code, label in indicators.items():
        try:
            r = httpx.get(
                f"{_WB_BASE}/country/{cc}/indicator/{code}",
                params={"format": "json", "mrv": 1, "per_page": 1},
                timeout=8,
            )
            if r.is_success:
                body = r.json()
                if isinstance(body, list) and len(body) > 1:
                    for row in (body[1] or []):
                        if row.get("value") is not None:
                            result["indicators"][label] = {
                                "value": row["value"],
                                "year":  row.get("date"),
                            }
                            break
        except Exception:
            pass

    if not result["indicators"]:
        return None, f"no World Bank labor data for {cc}"
    return result, ""


def _enrich_location(entity: dict, company_id: str) -> tuple[Optional[dict], str]:
    """Geocode this entity via Nominatim if coordinates are missing."""
    if entity.get("latitude") and entity.get("longitude"):
        return {"already_geocoded": True}, ""

    name = entity.get("enterprise_name") or entity.get("name") or entity.get("address_line1", "")
    city = entity.get("city", "")
    country = entity.get("country", "")
    query = ", ".join(p for p in [name, city, country] if p)
    if not query.strip():
        return None, "no address fields to geocode"

    try:
        resp = httpx.get(
            "https://nominatim.openstreetmap.org/search",
            params={"q": query, "format": "json", "limit": 1},
            headers={"User-Agent": "newsconseen-enrichment/1.0 (contact@newsconseen.com)"},
            timeout=8,
        )
        time.sleep(1.1)
        if resp.is_success and resp.json():
            hit = resp.json()[0]
            return {
                "latitude":  float(hit["lat"]),
                "longitude": float(hit["lon"]),
                "display_name": hit.get("display_name"),
                "source": "nominatim",
            }, ""
        return None, "Nominatim returned no results"
    except Exception as exc:
        return None, str(exc)


def _enrich_industry(entity: dict, company_id: str) -> tuple[Optional[dict], str]:
    """Lookup company registration / industry classification."""
    name = entity.get("enterprise_name") or entity.get("name", "")
    if not name:
        return None, "no enterprise name"

    try:
        from enrichment.company_lookup import lookup_company
        result = lookup_company(name)
        return result, ""
    except Exception as exc:
        return None, str(exc)


_ENRICHERS = {
    "competitors": _enrich_competitors,
    "news":        _enrich_news,
    "economic":    _enrich_economic,
    "labor":       _enrich_labor,
    "location":    _enrich_location,
    "industry":    _enrich_industry,
}


# ── Insight builders ──────────────────────────────────────────────────────────

def _build_competitor_insight(entity: dict, data: dict, company_id: str) -> int:
    name = entity.get("enterprise_name") or entity.get("name", "unknown")
    count = data.get("count", 0)
    radius = data.get("radius_km", 2.0)

    severity = "high" if count >= 10 else "medium" if count >= 4 else "low"
    title = f"{count} competitors found within {radius} km of {name}"
    body = (
        f"Market scan found {count} nearby businesses within {radius} km. "
        f"Top competitors: {', '.join(c.get('tags', {}).get('name', '') for c in (data.get('competitors') or [])[:3])}."
    )

    insight_id = _write_insight_to_supabase({
        "company_id":    company_id,
        "insight_type":  "competitive",
        "subject_type":  "enterprise",
        "subject_id":    str(entity.get("id", "")),
        "subject_name":  name,
        "title":         title,
        "body":          body,
        "severity":      severity,
        "confidence":    0.8,
        "source":        "market_enrichment",
        "source_run_id": f"enrichment_{_now()[:10]}",
        "status":        "new",
        "evidence":      json.dumps([{
            "type":   "market_scan",
            "source": "OpenStreetMap Overpass",
            "label":  "Nearby Businesses",
            "value":  count,
        }]),
    })

    created = 0
    if insight_id:
        created += 1

    if severity in ("high", "medium"):
        _write_risk_to_supabase({
            "company_id":   company_id,
            "insight_id":   insight_id,
            "subject_type": "enterprise",
            "subject_id":   str(entity.get("id", "")),
            "title":        f"Competitive pressure: {count} nearby competitors",
            "description":  body,
            "risk_type":    "competitive",
            "severity":     severity,
            "status":       "open",
            "source":       "market_enrichment",
        })

    return created


def _build_news_insight(entity: dict, data: dict, company_id: str) -> int:
    name = entity.get("enterprise_name") or entity.get("name", "unknown")
    count = data.get("count", 0)
    if count == 0:
        return 0

    articles = data.get("articles", [])
    titles = [a.get("title", "") for a in articles[:3] if a.get("title")]

    insight_id = _write_insight_to_supabase({
        "company_id":    company_id,
        "insight_type":  "news",
        "subject_type":  "enterprise",
        "subject_id":    str(entity.get("id", "")),
        "subject_name":  name,
        "title":         f"{count} news mentions found for {name}",
        "body":          f"Recent articles: {'; '.join(titles[:3])}.",
        "severity":      "low",
        "confidence":    0.6,
        "source":        "market_enrichment",
        "source_run_id": f"enrichment_{_now()[:10]}",
        "status":        "new",
        "evidence":      json.dumps([{
            "type":   "news_scan",
            "source": "Hacker News",
            "label":  "Articles Found",
            "value":  count,
        }]),
    })
    return 1 if insight_id else 0


def _build_economic_insight(entity: dict, data: dict, company_id: str) -> int:
    name = entity.get("enterprise_name") or entity.get("name", entity.get("id", ""))
    indicators = data.get("indicators", {})
    if not indicators:
        return 0

    lines = []
    for label, info in indicators.items():
        lines.append(f"{label.replace('_', ' ')}: {info.get('value')} ({info.get('year')})")

    body = f"Economic context for {data.get('country')}: " + "; ".join(lines)

    insight_id = _write_insight_to_supabase({
        "company_id":    company_id,
        "insight_type":  "economic",
        "subject_type":  "enterprise",
        "subject_id":    str(entity.get("id", "")),
        "subject_name":  name,
        "title":         f"Economic profile updated for {data.get('country', '')} market",
        "body":          body,
        "severity":      "low",
        "confidence":    0.9,
        "source":        "market_enrichment",
        "source_run_id": f"enrichment_{_now()[:10]}",
        "status":        "new",
        "evidence":      json.dumps([{
            "type":   "world_bank",
            "source": "World Bank Open Data",
            "label":  "Indicators",
            "value":  len(indicators),
        }]),
    })
    return 1 if insight_id else 0


# ── Main entry point ──────────────────────────────────────────────────────────

def run_market_enrichment(
    company_id: str,
    entity_type: str,
    entity_id: str,
    enrichment_types: List[str],
    trigger: str = "manual",
) -> dict:
    """
    Run market enrichment for a single entity.

    For each requested enrichment_type:
    - Calls the relevant external API
    - Logs the enrichment event to analytics.enrichment_events
    - Writes Intelligence objects (Insight/Risk/Opportunity) to Supabase

    Returns a summary dict: {completed, failed, insights_generated, events: [...]}
    """
    entity = _load_entity(entity_type, entity_id, company_id)
    if not entity:
        logger.warning("run_market_enrichment: entity not found %s/%s", entity_type, entity_id)
        return {"completed": 0, "failed": 0, "insights_generated": 0, "events": []}

    completed = 0
    failed = 0
    total_insights = 0
    events = []

    _insight_builders = {
        "competitors": _build_competitor_insight,
        "news":        _build_news_insight,
        "economic":    _build_economic_insight,
    }

    for etype in enrichment_types:
        enricher = _ENRICHERS.get(etype)
        if not enricher:
            logger.debug("No enricher for type: %s", etype)
            continue

        try:
            data, error = enricher(entity, company_id)
        except Exception as exc:
            data, error = None, str(exc)

        if data and not error:
            builder = _insight_builders.get(etype)
            insights = builder(entity, data, company_id) if builder else 0
            total_insights += insights
            _log_enrichment_event(
                company_id, entity_type, entity_id, etype,
                "completed", trigger, insights_generated=insights,
                data_summary=json.dumps({"result_keys": list(data.keys())}),
            )
            completed += 1
            events.append({"type": etype, "status": "completed", "insights": insights})
        else:
            _log_enrichment_event(
                company_id, entity_type, entity_id, etype,
                "failed", trigger, error=error,
            )
            failed += 1
            events.append({"type": etype, "status": "failed", "error": error})
            logger.debug("Enrichment %s/%s [%s] failed: %s", entity_type, entity_id, etype, error)

    return {
        "company_id":         company_id,
        "entity_type":        entity_type,
        "entity_id":          entity_id,
        "trigger":            trigger,
        "enrichment_types":   enrichment_types,
        "completed":          completed,
        "failed":             failed,
        "insights_generated": total_insights,
        "events":             events,
    }


def run_market_enrichment_batch(
    company_id: str,
    plan: List[dict],
    trigger: str = "scheduled",
    max_entities: int = 10,
) -> dict:
    """
    Run enrichment for a batch of plan items (from build_enrichment_plan).
    Processes high-priority items first, caps at max_entities to avoid timeout.
    """
    processed = 0
    total_insights = 0
    results = []

    for item in plan[:max_entities]:
        if item.get("priority") == "low":
            break  # stop at low-priority items in batch mode

        result = run_market_enrichment(
            company_id=company_id,
            entity_type=item["entity_type"],
            entity_id=item["entity_id"],
            enrichment_types=item.get("enrichment_needed", []),
            trigger=trigger,
        )
        processed += 1
        total_insights += result.get("insights_generated", 0)
        results.append(result)

    return {
        "company_id":         company_id,
        "trigger":            trigger,
        "entities_processed": processed,
        "total_insights":     total_insights,
        "results":            results,
    }
