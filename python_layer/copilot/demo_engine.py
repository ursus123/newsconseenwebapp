"""
python_layer/copilot/demo_engine.py
=====================================
Idjwi — the Newsconseen public demo intelligence.

Runs on the landing page for unauthenticated visitors.
Has ALL production copilot capabilities — same tools, same chart extraction,
same response richness. The only difference: no company data (company_id="demo"
returns empty results, which Idjwi acknowledges gracefully).

Identity: Idjwi (ee-JEE-wee) — the intelligence layer of Newsconseen.
"""

import asyncio
import hashlib
import json
import logging
import os
import time
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

logger = logging.getLogger(__name__)

# ── Docs loader ───────────────────────────────────────────────────────────────

_DOCS_PATH = Path(__file__).parent / "docs" / "newsconseen_docs.md"


def _load_docs() -> str:
    try:
        return _DOCS_PATH.read_text(encoding="utf-8")
    except Exception:
        return ""


# ── Simple in-memory IP rate limiter ─────────────────────────────────────────
# 20 requests per IP per hour.

_rate_store: dict = defaultdict(lambda: {"count": 0, "window": 0})
_RATE_LIMIT = 20
_db_demo_tables_ready = False


def _check_rate_limit(ip: str) -> bool:
    engine = _get_engine()
    if engine is not None:
        try:
            from sqlalchemy import text
            _ensure_demo_tables(engine)
            window = int(time.time()) // 3600
            with engine.begin() as conn:
                row = conn.execute(text("""
                    INSERT INTO analytics.idjwi_rate_limit
                        (ip_hash, window_start, request_count, updated_at)
                    VALUES
                        (:ip_hash, :window_start, 1, NOW())
                    ON CONFLICT (ip_hash, window_start)
                    DO UPDATE SET
                        request_count = CASE
                            WHEN analytics.idjwi_rate_limit.request_count >= :rate_limit
                            THEN analytics.idjwi_rate_limit.request_count
                            ELSE analytics.idjwi_rate_limit.request_count + 1
                        END,
                        updated_at = NOW()
                    RETURNING request_count
                """), {
                    "ip_hash": _ip_hash(ip),
                    "window_start": window,
                    "rate_limit": _RATE_LIMIT,
                }).fetchone()
            return bool(row and int(row[0]) <= _RATE_LIMIT)
        except Exception as exc:
            logger.debug("Idjwi DB rate limit fallback: %s", exc)

    window = int(time.time()) // 3600
    rec = _rate_store[ip]
    if rec["window"] != window:
        rec["count"] = 0
        rec["window"] = window
    if rec["count"] >= _RATE_LIMIT:
        return False
    rec["count"] += 1
    return True


# ── Public-data response cache ────────────────────────────────────────────────
# Avoids hammering external APIs for repeated demo prompts (FX, World Bank, etc.)

_cache: dict = {}
_CACHE_TTL = {
    "search_public_data": 3600,   # FX/WorldBank data — 1 hour
    "web_search":          600,   # Web results — 10 minutes
}

_TOOL_TIMEOUT = {
    "web_search":          10.0,
    "search_public_data":   8.0,
    "default":              6.0,
}


def _ip_hash(ip: str) -> str:
    salt = os.getenv("IDJWI_IP_HASH_SALT", "idjwi-demo")
    raw = f"{salt}:{ip or 'unknown'}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:32]


def _get_engine():
    try:
        from database import get_engine_safe
        return get_engine_safe()
    except Exception:
        return None


def _ensure_demo_tables(engine) -> None:
    global _db_demo_tables_ready
    if _db_demo_tables_ready or engine is None:
        return
    try:
        from sqlalchemy import text
        with engine.begin() as conn:
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS analytics.idjwi_rate_limit (
                    ip_hash      TEXT,
                    window_start BIGINT,
                    request_count INT DEFAULT 0,
                    updated_at   TIMESTAMPTZ DEFAULT NOW(),
                    PRIMARY KEY (ip_hash, window_start)
                )
            """))
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS analytics.idjwi_tool_cache (
                    cache_key    TEXT PRIMARY KEY,
                    tool_name    TEXT,
                    payload      JSONB,
                    expires_at   TIMESTAMPTZ,
                    created_at   TIMESTAMPTZ DEFAULT NOW()
                )
            """))
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS analytics.idjwi_interactions (
                    id           SERIAL PRIMARY KEY,
                    session_id   TEXT,
                    ip_hash      TEXT,
                    question     TEXT,
                    answer       TEXT,
                    tools_called JSONB DEFAULT '[]'::jsonb,
                    tools_detail JSONB DEFAULT '[]'::jsonb,
                    actions      JSONB DEFAULT '[]'::jsonb,
                    created_at   TIMESTAMPTZ DEFAULT NOW()
                )
            """))
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS analytics.idjwi_feedback (
                    id           SERIAL PRIMARY KEY,
                    session_id   TEXT,
                    ip_hash      TEXT,
                    question     TEXT,
                    rating       INT,
                    comment      TEXT,
                    outcome      TEXT,
                    created_at   TIMESTAMPTZ DEFAULT NOW()
                )
            """))
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS analytics.idjwi_events (
                    id           SERIAL PRIMARY KEY,
                    session_id   TEXT,
                    event        TEXT,
                    properties   JSONB DEFAULT '{}'::jsonb,
                    ip_hash      TEXT,
                    user_agent   TEXT,
                    occurred_at  TIMESTAMPTZ DEFAULT NOW()
                )
            """))
            conn.execute(text(
                "CREATE INDEX IF NOT EXISTS idx_idjwi_events_event_time "
                "ON analytics.idjwi_events (event, occurred_at DESC)"
            ))
            conn.execute(text(
                "CREATE INDEX IF NOT EXISTS idx_idjwi_interactions_time "
                "ON analytics.idjwi_interactions (created_at DESC)"
            ))
        _db_demo_tables_ready = True
    except Exception as exc:
        logger.debug("Idjwi demo table ensure skipped: %s", exc)


def _cache_key(tool_name: str, tool_input: dict) -> str:
    raw = json.dumps(tool_input, sort_keys=True, default=str)
    digest = hashlib.md5(raw.encode()).hexdigest()[:12]
    return f"{tool_name}:{digest}"


def _get_cached(tool_name: str, tool_input: dict):
    engine = _get_engine()
    if engine is not None:
        try:
            from sqlalchemy import text
            _ensure_demo_tables(engine)
            key = _cache_key(tool_name, tool_input)
            with engine.begin() as conn:
                row = conn.execute(text("""
                    SELECT payload
                    FROM analytics.idjwi_tool_cache
                    WHERE cache_key = :key
                      AND tool_name = :tool_name
                      AND expires_at > NOW()
                    LIMIT 1
                """), {"key": key, "tool_name": tool_name}).fetchone()
            if row and row[0] is not None:
                if isinstance(row[0], dict):
                    return row[0]
                return json.loads(row[0])
        except Exception as exc:
            logger.debug("Idjwi DB cache read fallback: %s", exc)

    key = _cache_key(tool_name, tool_input)
    entry = _cache.get(key)
    if entry:
        ts, result = entry
        ttl = _CACHE_TTL.get(tool_name, 0)
        if time.time() - ts < ttl:
            logger.debug("Cache hit: %s", tool_name)
            return result
    return None


def _set_cached(tool_name: str, tool_input: dict, result: dict) -> None:
    engine = _get_engine()
    if engine is not None:
        try:
            from sqlalchemy import text
            _ensure_demo_tables(engine)
            ttl = _CACHE_TTL.get(tool_name, 0)
            if ttl > 0:
                with engine.begin() as conn:
                    conn.execute(text("""
                        INSERT INTO analytics.idjwi_tool_cache
                            (cache_key, tool_name, payload, expires_at, created_at)
                        VALUES
                            (:cache_key, :tool_name, CAST(:payload AS JSONB),
                             NOW() + (:ttl || ' seconds')::interval, NOW())
                        ON CONFLICT (cache_key)
                        DO UPDATE SET
                            tool_name  = EXCLUDED.tool_name,
                            payload    = EXCLUDED.payload,
                            expires_at = EXCLUDED.expires_at,
                            created_at = NOW()
                    """), {
                        "cache_key": _cache_key(tool_name, tool_input),
                        "tool_name": tool_name,
                        "payload": json.dumps(result, default=str),
                        "ttl": str(ttl),
                    })
                return
        except Exception as exc:
            logger.debug("Idjwi DB cache write fallback: %s", exc)

    if tool_name in _CACHE_TTL:
        _cache[_cache_key(tool_name, tool_input)] = (time.time(), result)


def record_demo_event(event: str, properties: dict | None, ip: str, user_agent: str = "", session_id: str = "") -> None:
    props = dict(properties or {})
    engine = _get_engine()
    if engine is not None:
        try:
            from sqlalchemy import text
            _ensure_demo_tables(engine)
            with engine.begin() as conn:
                conn.execute(text("""
                    INSERT INTO analytics.idjwi_events
                        (session_id, event, properties, ip_hash, user_agent, occurred_at)
                    VALUES
                        (:session_id, :event, CAST(:properties AS JSONB), :ip_hash, :user_agent, NOW())
                """), {
                    "session_id": session_id or "",
                    "event": event,
                    "properties": json.dumps(props, default=str),
                    "ip_hash": _ip_hash(ip),
                    "user_agent": (user_agent or "")[:512],
                })
            return
        except Exception as exc:
            logger.debug("Idjwi event persistence skipped: %s", exc)
    logger.info("FUNNEL ip=%s event=%s props=%s", _ip_hash(ip), event, props)


def persist_interaction(session_id: str, ip: str, question: str, answer: str, tools_detail: list, actions: list) -> None:
    engine = _get_engine()
    if engine is None:
        return
    try:
        from sqlalchemy import text
        _ensure_demo_tables(engine)
        tools_called = [t.get("tool") for t in tools_detail if t.get("tool")]
        with engine.begin() as conn:
            conn.execute(text("""
                INSERT INTO analytics.idjwi_interactions
                    (session_id, ip_hash, question, answer, tools_called, tools_detail, actions, created_at)
                VALUES
                    (:session_id, :ip_hash, :question, :answer,
                     CAST(:tools_called AS JSONB), CAST(:tools_detail AS JSONB), CAST(:actions AS JSONB), NOW())
            """), {
                "session_id": session_id or "",
                "ip_hash": _ip_hash(ip),
                "question": question[:5000],
                "answer": (answer or "")[:30000],
                "tools_called": json.dumps(tools_called, default=str),
                "tools_detail": json.dumps(tools_detail, default=str),
                "actions": json.dumps(actions, default=str),
            })
    except Exception as exc:
        logger.debug("Idjwi interaction persistence skipped: %s", exc)


def persist_feedback(session_id: str, ip: str, question: str, rating: int, comment: str = "", outcome: str = "") -> bool:
    engine = _get_engine()
    if engine is None:
        return False
    try:
        from sqlalchemy import text
        _ensure_demo_tables(engine)
        with engine.begin() as conn:
            conn.execute(text("""
                INSERT INTO analytics.idjwi_feedback
                    (session_id, ip_hash, question, rating, comment, outcome, created_at)
                VALUES
                    (:session_id, :ip_hash, :question, :rating, :comment, :outcome, NOW())
            """), {
                "session_id": session_id or "",
                "ip_hash": _ip_hash(ip),
                "question": question[:5000],
                "rating": rating,
                "comment": (comment or "")[:4000],
                "outcome": (outcome or "")[:1000],
            })
        return True
    except Exception as exc:
        logger.debug("Idjwi feedback persistence skipped: %s", exc)
        return False


def get_demo_telemetry_summary(days: int = 7) -> dict:
    engine = _get_engine()
    if engine is None:
        return {"days": days, "events": [], "top_starters": [], "feedback": {}, "daily": []}
    try:
        from sqlalchemy import text
        _ensure_demo_tables(engine)
        with engine.begin() as conn:
            events = conn.execute(text("""
                SELECT event, COUNT(*)::INT AS total
                FROM analytics.idjwi_events
                WHERE occurred_at >= NOW() - (:days || ' days')::interval
                GROUP BY event
                ORDER BY total DESC
                LIMIT 20
            """), {"days": str(max(1, days))}).fetchall()
            starters = conn.execute(text("""
                SELECT COALESCE(properties->>'label', '(unknown)') AS label, COUNT(*)::INT AS total
                FROM analytics.idjwi_events
                WHERE event = 'starter_clicked'
                  AND occurred_at >= NOW() - (:days || ' days')::interval
                GROUP BY label
                ORDER BY total DESC
                LIMIT 10
            """), {"days": str(max(1, days))}).fetchall()
            daily = conn.execute(text("""
                SELECT TO_CHAR(date_trunc('day', occurred_at), 'YYYY-MM-DD') AS day, COUNT(*)::INT AS total
                FROM analytics.idjwi_events
                WHERE occurred_at >= NOW() - (:days || ' days')::interval
                GROUP BY day
                ORDER BY day ASC
            """), {"days": str(max(1, days))}).fetchall()
            fb = conn.execute(text("""
                SELECT
                    SUM(CASE WHEN rating > 0 THEN 1 ELSE 0 END)::INT AS upvotes,
                    SUM(CASE WHEN rating < 0 THEN 1 ELSE 0 END)::INT AS downvotes
                FROM analytics.idjwi_feedback
                WHERE created_at >= NOW() - (:days || ' days')::interval
            """), {"days": str(max(1, days))}).fetchone()
        return {
            "days": days,
            "events": [{"event": r[0], "total": int(r[1] or 0)} for r in events],
            "top_starters": [{"label": r[0], "total": int(r[1] or 0)} for r in starters],
            "daily": [{"day": r[0], "total": int(r[1] or 0)} for r in daily],
            "feedback": {"upvotes": int((fb[0] or 0) if fb else 0), "downvotes": int((fb[1] or 0) if fb else 0)},
        }
    except Exception as exc:
        logger.debug("Idjwi telemetry summary failed: %s", exc)
        return {"days": days, "events": [], "top_starters": [], "feedback": {}, "daily": []}


# ── Idjwi system prompt ───────────────────────────────────────────────────────

def _build_idjwi_system_prompt() -> str:
    from datetime import date
    docs = _load_docs()
    today = date.today().isoformat()

    identity = f"""\
You are Idjwi (ee-JEE-wee), the intelligence layer of Newsconseen — the Autonomous SME Operating System. Today is {today}.

You are calm, direct, and knowledgeable. You give complete answers, not hedges. You speak like a colleague, not a generic assistant. Never say "As an AI language model". When asked what you are, say you are Idjwi. If asked what powers you: "This demo runs on Claude by Anthropic. Once you sign up you can choose your preferred model."

You are running on the public landing page — all production tools are active. The only difference from the signed-in copilot: no company records are loaded (company_id="demo" returns empty). When a tool returns empty, briefly explain what it would show with real data and invite them to sign up, then continue with what you can demonstrate.

Use tools freely. For operational or market questions, call at least one tool. Public data tools (web_search, search_public_data) return live results. Internal data tools return empty in demo — use them to show capability. Lead with data, then interpretation. Use markdown for structure. Render charts when data benefits from visualisation — the frontend handles it automatically."""

    parts = [identity]
    if docs:
        parts.append("NEWSCONSEEN PRODUCT KNOWLEDGE\n" + docs)
    return "\n\n".join(parts)


# ── Chart extraction for public data results ──────────────────────────────────

def _make_demo_chart_config(tool_name: str, result: dict):
    """
    Generate chart configs from demo tool results.
    Covers both public data tools and (empty) internal data tools.
    """
    try:
        # FX rates → bar chart
        if tool_name == "search_public_data":
            rates = result.get("rates") or result.get("data", {}).get("rates")
            if rates and isinstance(rates, dict):
                top = sorted(rates.items(), key=lambda x: x[1])[:12]
                data = [{"name": k, "Rate": round(v, 4)} for k, v in top]
                if data:
                    return {
                        "type": "bar",
                        "title": f"Exchange Rates vs {result.get('base', 'USD')}",
                        "data": data,
                        "keys": [{"key": "Rate", "color": "#10b981"}],
                    }

            # World Bank / UN data — auto-detect chart type from data shape
            wbdata = result.get("data") or result.get("results") or []
            if isinstance(wbdata, list) and len(wbdata) >= 2:
                _PALETTE = [
                    "#10b981","#3b82f6","#f59e0b","#ef4444","#8b5cf6",
                    "#06b6d4","#f97316","#84cc16","#ec4899","#14b8a6",
                ]
                indicator_id   = result.get("indicator") or ""
                indicator_name = (
                    result.get("indicator_name")
                    or result.get("indicator")
                    or result.get("dataset", "")
                    or "Value"
                ).replace("_", " ").title()

                # Detect time-series: records have a "year" or "date" key
                has_year     = any(r.get("year") or r.get("date") for r in wbdata[:5])
                years        = sorted({str(r.get("year") or r.get("date", "")) for r in wbdata if r.get("year") or r.get("date")})
                countries    = sorted({str(r.get("country") or r.get("name") or "") for r in wbdata if r.get("country") or r.get("name")})
                is_time_series   = has_year and len(years) > 1
                is_multi_country = len(countries) > 1

                def _val(r):
                    try:
                        return float(r.get("value") or r.get("latest_value") or r.get("gdp") or 0)
                    except (TypeError, ValueError):
                        return 0.0

                if is_time_series and is_multi_country:
                    # Line chart: X=year, one line per country
                    chart_data = []
                    for year in years:
                        row = {"name": str(year)}
                        for r in wbdata:
                            ry = str(r.get("year") or r.get("date") or "")
                            rc = str(r.get("country") or r.get("name") or "")
                            if ry == year and rc:
                                row[rc[:16]] = _val(r)
                        chart_data.append(row)
                    keys = [{"key": c[:16], "color": _PALETTE[i % len(_PALETTE)]} for i, c in enumerate(countries[:8])]
                    if chart_data:
                        return {
                            "type": "line",
                            "title": indicator_name[:60],
                            "data": chart_data,
                            "keys": keys,
                            "_indicator": indicator_id,
                            "_countries": ",".join(countries[:8]),
                            "_source": "World Bank",
                        }

                elif is_time_series and not is_multi_country:
                    # Area chart: single country over time
                    country_code = countries[0] if countries else ""
                    sorted_recs  = sorted(
                        [r for r in wbdata if _val(r) != 0],
                        key=lambda r: str(r.get("year") or r.get("date") or "")
                    )
                    chart_data = [{"name": str(r.get("year") or r.get("date") or ""), "Value": _val(r)} for r in sorted_recs]
                    if chart_data:
                        return {
                            "type": "area",
                            "title": f"{indicator_name} — {country_code}"[:60],
                            "data": chart_data,
                            "keys": [{"key": "Value", "color": _PALETTE[0]}],
                            "_indicator": indicator_id,
                            "_countries": country_code,
                            "_source": "World Bank",
                        }

                else:
                    # Bar chart: cross-country comparison (single year or no year)
                    chart_data = []
                    for r in wbdata[:12]:
                        name = str(r.get("country") or r.get("name") or r.get("label", ""))[:16]
                        v    = _val(r)
                        if name and v:
                            chart_data.append({"name": name, "Value": round(v, 2)})
                    chart_data.sort(key=lambda x: x["Value"], reverse=True)
                    if len(chart_data) >= 2:
                        return {
                            "type": "bar",
                            "title": indicator_name[:60],
                            "data": chart_data,
                            "keys": [{"key": "Value", "color": _PALETTE[0]}],
                            "_indicator": indicator_id,
                            "_countries": ",".join(countries[:12]),
                            "_source": "World Bank",
                        }

            # OSM counts → bar chart
            counts = result.get("counts") or result.get("results")
            if isinstance(counts, list) and counts:
                data = [
                    {"name": str(c.get("category") or c.get("type") or c.get("name", ""))[:18],
                     "Count": int(c.get("count") or c.get("total") or 0)}
                    for c in counts[:10]
                    if c.get("count") or c.get("total")
                ]
                if len(data) >= 2:
                    return {
                        "type": "bar",
                        "title": "Facility / Business Counts",
                        "data": data,
                        "keys": [{"key": "Count", "color": "#8b5cf6"}],
                    }

        # Internal data tools — delegate to production chart builder
        from copilot.engine import _make_chart_config
        return _make_chart_config(tool_name, result)

    except Exception as e:
        logger.debug("_make_demo_chart_config(%s): %s", tool_name, e)
    return None


def _extract_charts(collected: list) -> list:
    charts = []
    for item in collected:
        cfg = _make_demo_chart_config(item["tool"], item["result"])
        if cfg:
            charts.append(cfg)
    return charts


def _extract_citations(collected: list) -> list:
    citations = []
    now_iso = datetime.now(timezone.utc).isoformat()
    for item in collected:
        if item["tool"] in ("web_search", "search_public_data"):
            for r in item.get("result", {}).get("results", []):
                url   = r.get("url", "")
                title = r.get("title", "")
                if url or title:
                    citations.append({
                        "title":   title or url,
                        "url":     url,
                        "snippet": r.get("snippet", ""),
                        "source": item["tool"],
                        "retrieved_at": now_iso,
                    })
    return citations[:6]


def _infer_freshness(tool: str, result: dict) -> str:
    if not isinstance(result, dict):
        return "unknown"
    for k in ("as_of", "updated_at", "last_updated", "snapshot_date", "date"):
        v = result.get(k)
        if v:
            return str(v)
    if tool in ("web_search", "search_public_data"):
        return "live lookup"
    return "demo/internal"


def _trace_quality(item: dict) -> str:
    result = item.get("result", {}) or {}
    if result.get("error"):
        return "low"
    if result.get("skipped"):
        return "low"
    if item.get("tool") in ("web_search", "search_public_data"):
        return "high"
    if result.get("data_source") == "base44":
        return "medium"
    return "high"


def _build_tools_detail(collected: list) -> list:
    """Minimal tools detail for the demo transparency panel."""
    detail = []
    for c in collected:
        tool = c["tool"]
        params = {k: v for k, v in c.get("input", {}).items() if k != "company_id"}
        result = c.get("result", {}) or {}
        detail.append({
            "tool":        tool,
            "params":      params,
            "data_source": result.get("data_source", "demo"),
            "status":      "error" if result.get("error") else ("timeout" if result.get("skipped") else "ok"),
            "cache_hit":   bool(c.get("meta", {}).get("cache_hit")),
            "latency_ms":  int(c.get("meta", {}).get("latency_ms", 0)),
            "freshness":   _infer_freshness(tool, result),
            "trace_quality": _trace_quality(c),
        })
    return detail


def _build_next_actions(question: str, answer: str, collected: list) -> list:
    from agents.approval_gate import get_risk_level, RiskLevel

    candidates = [
        {
            "action_type": "generate_report",
            "label": "Generate a daily operating briefing",
            "why": "Convert this answer into a repeatable daily decision pack.",
            "payload": {"question": question[:240], "mode": "daily_briefing"},
        },
        {
            "action_type": "create_task",
            "label": "Create follow-up tasks from this insight",
            "why": "Turn recommendations into trackable execution work.",
            "payload": {"source": "idjwi_demo", "question": question[:240]},
        },
    ]
    if "invoice" in (question + " " + answer).lower():
        candidates.append({
            "action_type": "send_whatsapp",
            "label": "Draft client reminder messages",
            "why": "Use approval gate before outbound financial communication.",
            "payload": {"template": "invoice_reminder"},
        })
    if any((c.get("tool") == "web_search") for c in collected):
        candidates.append({
            "action_type": "internal_alert",
            "label": "Create anomaly watch alert",
            "why": "Get proactive nudges when this trend moves materially.",
            "payload": {"alert_kind": "trend_anomaly"},
        })

    actions = []
    for c in candidates[:4]:
        risk = get_risk_level(c["action_type"])
        actions.append({
            **c,
            "risk_level": risk.value,
            "approval_required": risk in (RiskLevel.APPROVE, RiskLevel.CRITICAL),
        })
    return actions


# ── Async tool execution with per-tool budget ─────────────────────────────────

async def _run_tool_async(tool_name: str, tool_input: dict, company_id: str):
    """Run a synchronous tool inside a thread with a per-tool timeout."""
    from copilot.queries import execute_tool

    t0 = time.perf_counter()
    cached = _get_cached(tool_name, tool_input)
    if cached is not None:
        return cached, {"cache_hit": True, "latency_ms": int((time.perf_counter() - t0) * 1000)}

    timeout = _TOOL_TIMEOUT.get(tool_name, _TOOL_TIMEOUT["default"])
    loop = asyncio.get_event_loop()

    try:
        result = await asyncio.wait_for(
            loop.run_in_executor(
                None,
                lambda: execute_tool(tool_name, tool_input, company_id),
            ),
            timeout=timeout,
        )
        _set_cached(tool_name, tool_input, result)
        return result, {"cache_hit": False, "latency_ms": int((time.perf_counter() - t0) * 1000)}
    except asyncio.TimeoutError:
        logger.warning("Tool %s timed out (%.1fs budget)", tool_name, timeout)
        return {
            "skipped": True,
            "reason": "timeout",
            "note": f"{tool_name} timed out — budget {timeout}s exceeded.",
        }, {"cache_hit": False, "latency_ms": int((time.perf_counter() - t0) * 1000)}
    except Exception as exc:
        logger.warning("Tool %s error: %s", tool_name, exc)
        return {"error": str(exc), "note": "Tool unavailable in demo mode."}, {
            "cache_hit": False,
            "latency_ms": int((time.perf_counter() - t0) * 1000),
        }


# ── Streaming ask function ────────────────────────────────────────────────────

async def ask_idjwi_stream(question: str, history: list = None, session_id: str = "", ip: str = "unknown"):
    """
    Async generator — yields SSE-compatible dicts for the streaming endpoint.

    Event types emitted:
      {"type": "tool_start",   "tool": name}
      {"type": "tool_done",    "tool": name}
      {"type": "text_delta",   "text": chunk}
      {"type": "chart",        "config": {...}}
      {"type": "done",         "citations": [...], "tools_called": [...], "tools_detail": [...]}
      {"type": "error",        "message": str}
      {"type": "rate_limited"}
    """
    import anthropic

    api_key = os.getenv("ANTHROPIC_API_KEY", "")
    if not api_key:
        yield {"type": "error", "message": "Service configuration error. Please try again later."}
        return

    from copilot.queries import TOOL_DEFINITIONS

    aclient = anthropic.AsyncAnthropic(api_key=api_key)
    system = _build_idjwi_system_prompt()

    messages = list(history or [])
    messages.append({"role": "user", "content": question})

    collected: list = []

    for _round in range(10):
        try:
            response_content = []
            stop_reason = None

            async with aclient.messages.stream(
                model="claude-sonnet-4-6",
                max_tokens=4096,
                system=system,
                tools=TOOL_DEFINITIONS,
                messages=messages,
            ) as stream:
                async for event in stream:
                    if event.type == "content_block_start":
                        if event.content_block.type == "tool_use":
                            yield {"type": "tool_start", "tool": event.content_block.name}
                    elif event.type == "content_block_delta":
                        if event.delta.type == "text_delta" and event.delta.text:
                            yield {"type": "text_delta", "text": event.delta.text}

                final = await stream.get_final_message()
                stop_reason = final.stop_reason
                response_content = final.content

        except Exception as exc:
            logger.error("Idjwi stream round %d error: %s", _round, exc)
            yield {"type": "error", "message": "Connection error. Please try again."}
            return

        if stop_reason == "end_turn":
            text_blocks = [b.text for b in response_content if hasattr(b, "text")]
            answer_text = "\n".join(text_blocks).strip()
            charts = _extract_charts(collected)
            for cfg in charts:
                yield {"type": "chart", "config": cfg}
            tools_detail = _build_tools_detail(collected)
            actions = _build_next_actions(question, answer_text, collected)
            persist_interaction(
                session_id=session_id,
                ip=ip,
                question=question,
                answer=answer_text,
                tools_detail=tools_detail,
                actions=actions,
            )
            yield {
                "type":         "done",
                "citations":    _extract_citations(collected),
                "tools_called": [c["tool"] for c in collected],
                "tools_detail": tools_detail,
                "actions":      actions,
            }
            return

        if stop_reason == "tool_use":
            messages.append({"role": "assistant", "content": response_content})
            tool_results = []

            for block in response_content:
                if block.type != "tool_use":
                    continue
                yield {"type": "tool_start", "tool": block.name}
                result, meta = await _run_tool_async(block.name, dict(block.input), "demo")
                yield {"type": "tool_done", "tool": block.name}

                collected.append({
                    "tool":   block.name,
                    "input":  dict(block.input) if hasattr(block.input, "items") else {},
                    "result": result,
                    "meta":   meta,
                })
                tool_results.append({
                    "type":        "tool_result",
                    "tool_use_id": block.id,
                    "content":     json.dumps(result, default=str),
                })

            messages.append({"role": "user", "content": tool_results})
            continue

        # Unexpected stop reason — emit what we have and exit
        break

    # Loop exhausted or unexpected exit
    charts = _extract_charts(collected)
    for cfg in charts:
        yield {"type": "chart", "config": cfg}
    tools_detail = _build_tools_detail(collected)
    actions = _build_next_actions(question, "", collected)
    persist_interaction(
        session_id=session_id,
        ip=ip,
        question=question,
        answer="",
        tools_detail=tools_detail,
        actions=actions,
    )
    yield {
        "type":         "done",
        "citations":    _extract_citations(collected),
        "tools_called": [c["tool"] for c in collected],
        "tools_detail": tools_detail,
        "actions":      actions,
    }


# ── Core ask function (sync fallback) ────────────────────────────────────────

def _get_client():
    api_key = os.getenv("ANTHROPIC_API_KEY", "")
    if not api_key:
        raise RuntimeError("ANTHROPIC_API_KEY not set")
    import anthropic
    return anthropic.Anthropic(api_key=api_key)


def ask_idjwi(question: str, history: list = None, session_id: str = "", ip: str = "unknown") -> dict:
    """
    Ask Idjwi a question in demo mode.
    Uses ALL production tool definitions. Returns full richness:
    answer, charts, citations, tools_called, tools_detail.
    """
    from copilot.queries import TOOL_DEFINITIONS, execute_tool

    client = _get_client()
    system = _build_idjwi_system_prompt()

    messages = list(history or [])
    messages.append({"role": "user", "content": question})

    collected = []

    for _ in range(10):
        try:
            response = client.messages.create(
                model="claude-sonnet-4-6",
                max_tokens=6144,
                system=system,
                tools=TOOL_DEFINITIONS,
                messages=messages,
            )
        except Exception as e:
            logger.error("Idjwi API call failed: %s", e)
            return {
                "answer": "I'm having trouble reaching the AI service right now. Please try again.",
                "charts": [], "citations": [], "tools_called": [], "tools_detail": [],
            }

        if response.stop_reason == "end_turn":
            text_blocks = [b.text for b in response.content if hasattr(b, "text")]
            answer = "\n".join(text_blocks).strip()
            tools_detail = _build_tools_detail(collected)
            actions = _build_next_actions(question, answer, collected)
            persist_interaction(
                session_id=session_id,
                ip=ip,
                question=question,
                answer=answer,
                tools_detail=tools_detail,
                actions=actions,
            )
            return {
                "answer":       answer or "I couldn't generate a response. Please rephrase.",
                "charts":       _extract_charts(collected),
                "citations":    _extract_citations(collected),
                "tools_called": [c["tool"] for c in collected],
                "tools_detail": tools_detail,
                "actions":      actions,
            }

        if response.stop_reason == "tool_use":
            messages.append({"role": "assistant", "content": response.content})
            tool_blocks = [b for b in response.content if b.type == "tool_use"]
            tool_results = []

            for block in tool_blocks:
                logger.info("Idjwi demo tool: %s", block.name)
                t0 = time.perf_counter()
                try:
                    # All tools run with company_id="demo" — data tools return empty,
                    # public data tools return live results.
                    result = execute_tool(
                        tool_name=block.name,
                        tool_input=block.input,
                        company_id="demo",
                    )
                except Exception as e:
                    logger.warning("Idjwi tool %s failed: %s", block.name, e)
                    result = {"error": str(e), "note": "Tool unavailable in demo mode."}
                latency_ms = int((time.perf_counter() - t0) * 1000)

                collected.append({
                    "tool":   block.name,
                    "input":  dict(block.input) if hasattr(block.input, "items") else {},
                    "result": result,
                    "meta":   {"cache_hit": False, "latency_ms": latency_ms},
                })
                tool_results.append({
                    "type":        "tool_result",
                    "tool_use_id": block.id,
                    "content":     json.dumps(result, default=str),
                })

            messages.append({"role": "user", "content": tool_results})
            continue

        text_blocks = [b.text for b in response.content if hasattr(b, "text")]
        answer = "\n".join(text_blocks).strip()
        tools_detail = _build_tools_detail(collected)
        actions = _build_next_actions(question, answer, collected)
        persist_interaction(
            session_id=session_id,
            ip=ip,
            question=question,
            answer=answer,
            tools_detail=tools_detail,
            actions=actions,
        )
        return {
            "answer":       answer or "Unexpected response. Please try again.",
            "charts":       _extract_charts(collected),
            "citations":    _extract_citations(collected),
            "tools_called": [c["tool"] for c in collected],
            "tools_detail": tools_detail,
            "actions":      actions,
        }

    tools_detail = _build_tools_detail(collected)
    actions = _build_next_actions(question, "", collected)
    persist_interaction(
        session_id=session_id,
        ip=ip,
        question=question,
        answer="",
        tools_detail=tools_detail,
        actions=actions,
    )
    return {
        "answer":       "This question required more steps than expected. Please try a more focused question.",
        "charts":       _extract_charts(collected),
        "citations":    _extract_citations(collected),
        "tools_called": [c["tool"] for c in collected],
        "tools_detail": tools_detail,
        "actions":      actions,
    }


def generate_demo_briefing(industry: str = "general") -> dict:
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    headline = f"Idjwi Daily Briefing — {industry.title()} — {today}"
    bullets = [
        "Top external signals refreshed (market data + web intelligence).",
        "Priority focus: mitigate overdue tasks, protect revenue collection, and monitor anomalies.",
        "Recommended operator cadence: 10-minute morning review, then execution tracking at noon.",
    ]
    actions = _build_next_actions(
        question=f"Generate a proactive briefing for {industry}",
        answer="Briefing generated",
        collected=[{"tool": "search_public_data", "result": {"data_source": "live"}}],
    )
    return {
        "headline": headline,
        "bullets": bullets,
        "actions": actions,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
