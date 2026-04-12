# ==============================================================
# Phase 4E — Deep Market Research Agent
# ==============================================================
# The most sophisticated agent. Runs weekly using Opus (strategy).
# Builds a continuously-updated intelligence picture of the
# operator's market.
#
# Capabilities:
#   1. Competitor monitoring (OSM, web signals, review sentiment)
#   2. Economic + regulatory environment tracking
#   3. Internal vs. external cross-validation (Truth Engine)
#   4. Geographic opportunity detection (PostGIS + demographics)
#   5. Automated weekly market briefing → Reports page
#   6. Competitive profile builder (living documents)
#   7. Strategic scenario modelling
# ==============================================================

import json
import logging
from datetime import datetime, timezone

from ..base_agent import BaseAgent
from ..tool_registry import execute_tool
from ..agent_memory import remember, recall, get_baseline, update_baseline
from ..llm_router import MODEL_OPUS, MODEL_SONNET

logger = logging.getLogger(__name__)

# Competitor profile schema stored in analytics.competitor_profiles
COMPETITOR_DDL = """
CREATE TABLE IF NOT EXISTS analytics.competitor_profiles (
    id              SERIAL PRIMARY KEY,
    company_id      TEXT NOT NULL,
    competitor_name TEXT NOT NULL,
    location_lat    FLOAT,
    location_lng    FLOAT,
    address         TEXT,
    entity_type     TEXT,
    rating          FLOAT,
    review_count    INT,
    signals         JSONB DEFAULT '{}'::jsonb,
    first_seen      TIMESTAMPTZ DEFAULT NOW(),
    last_updated    TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (company_id, competitor_name)
);
CREATE INDEX IF NOT EXISTS idx_competitor_profiles_company
    ON analytics.competitor_profiles (company_id);
"""

MARKET_SIGNAL_DDL = """
CREATE TABLE IF NOT EXISTS analytics.market_signals (
    id          SERIAL PRIMARY KEY,
    company_id  TEXT NOT NULL,
    signal_type TEXT NOT NULL,
    source      TEXT NOT NULL,
    title       TEXT,
    summary     TEXT,
    sentiment   TEXT,
    relevance   FLOAT DEFAULT 0.5,
    detected_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_market_signals_company
    ON analytics.market_signals (company_id, detected_at DESC);
"""

MARKET_BRIEFING_DDL = """
CREATE TABLE IF NOT EXISTS analytics.market_briefings (
    id          SERIAL PRIMARY KEY,
    company_id  TEXT NOT NULL,
    week_of     DATE NOT NULL,
    briefing    TEXT NOT NULL,
    findings    JSONB DEFAULT '[]'::jsonb,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (company_id, week_of)
);
"""


def ensure_market_tables(engine) -> None:
    from sqlalchemy import text
    try:
        with engine.connect() as conn:
            conn.execute(text(COMPETITOR_DDL))
            conn.execute(text(MARKET_SIGNAL_DDL))
            conn.execute(text(MARKET_BRIEFING_DDL))
            conn.commit()
    except Exception as e:
        logger.warning("market_research: table setup failed: %s", e)


class MarketResearchAgent(BaseAgent):
    name      = "market_research"
    task_type = "market_briefing"  # → routes to Opus

    def system_prompt(self, company_id: str, context: dict) -> str:
        return f"""You are the Deep Market Research Agent for company {company_id}.

You are running on Claude Opus — the highest-capability model — because this task requires
strategic reasoning across multiple data sources simultaneously.

Your role: produce a comprehensive weekly market intelligence briefing.

SECTION 1 — COMPETITIVE LANDSCAPE
- Use get_competitor_density to map competitor presence in the operator's territory
- Use search_market to find signals about competitor activity (new openings, closures, reviews)
- Identify competitive threats and their severity
- Note: cross-validate all external claims against internal transaction data

SECTION 2 — INTERNAL vs. EXTERNAL CROSS-VALIDATION (Truth Engine)
- Compare external market signals against internal operational data
- Example: "Economic indicators show purchasing power declining — does the transaction data confirm or contradict?"
- Surface where the operator's reality diverges from market trends
- This is the most valuable intelligence — prioritise it

SECTION 3 — GEOGRAPHIC OPPORTUNITIES
- Use get_density_map to identify underserved territories
- Use get_competitor_density at different coordinates to find gaps in competitor coverage
- Recommend specific expansion opportunities with supporting data

SECTION 4 — ECONOMIC & REGULATORY ENVIRONMENT
- Use search_market to find relevant regulatory changes, economic signals
- Assess impact on the operator's industry

SECTION 5 — STRATEGIC RECOMMENDATIONS
- Based on all sections, provide 3-5 prioritised strategic recommendations
- Each recommendation must cite the specific data that supports it
- Include scenario modelling where relevant

Rules:
- company_id is always {company_id}
- Never speculate — every claim must cite a data source
- Cross-validate before concluding — one data source is evidence, two is confidence
- Rate threats and opportunities: Low / Medium / High / Critical
- Be specific: name competitors, locations, percentages

Produce a JSON response:
{{
  "summary": "weekly brief in 2-3 sentences",
  "week_of": "YYYY-MM-DD",
  "competitive_landscape": {{
    "threat_level": "low | medium | high | critical",
    "new_competitors": [],
    "notable_changes": []
  }},
  "truth_engine": [
    {{
      "external_claim": "...",
      "internal_reality": "...",
      "divergence": "aligned | diverges | contradicts",
      "implication": "..."
    }}
  ],
  "opportunities": [
    {{
      "type": "geographic | segment | pricing | timing",
      "location_or_detail": "...",
      "supporting_data": "...",
      "priority": "low | medium | high"
    }}
  ],
  "recommendations": [
    {{
      "title": "...",
      "rationale": "...",
      "data_source": "...",
      "priority": "low | medium | high | critical"
    }}
  ],
  "findings": [],
  "actions": []
}}"""

    def observe(self, company_id: str) -> dict:
        from concurrent.futures import ThreadPoolExecutor, as_completed

        # Get operator's primary location for geographic queries
        enterprise_data = execute_tool("get_enterprise_summary", {"company_id": company_id})
        lat = enterprise_data.get("primary_lat", -1.2921)  # Nairobi default
        lng = enterprise_data.get("primary_lng",  36.8219)

        calls = {
            "enterprises":        lambda: enterprise_data,
            "transactions_90d":   lambda: execute_tool("get_transaction_summary",
                                                        {"company_id": company_id, "days": 90}),
            "people":             lambda: execute_tool("get_people_summary",
                                                        {"company_id": company_id}),
            "nearby_competitors": lambda: execute_tool("get_competitor_density",
                                                        {"lat": lat, "lng": lng, "radius_km": 10}),
            "density_map":        lambda: execute_tool("get_density_map",
                                                        {"company_id": company_id}),
            "market_search":      lambda: execute_tool("search_market",
                                                        {"company_id": company_id,
                                                         "query": "competitors market trends industry"}),
            "network":            lambda: execute_tool("get_network_overview",
                                                        {"company_id": company_id}),
        }

        results = {}
        with ThreadPoolExecutor(max_workers=7) as pool:
            futures = {pool.submit(fn): key for key, fn in calls.items()}
            for future in as_completed(futures):
                key = futures[future]
                try:
                    results[key] = future.result()
                except Exception as e:
                    results[key] = {"error": str(e)}

        # Load historical market intelligence memories
        past_signals = recall(self.engine, company_id, self.name,
                              memory_type="observation") if self.engine else []
        results["historical_signals"] = past_signals[:5]

        return results

    def _store_observations(self, company_id: str, findings: dict) -> None:
        """Store the weekly briefing in analytics.market_briefings."""
        super()._store_observations(company_id, findings)
        if not self.engine:
            return

        # Store the briefing
        try:
            from sqlalchemy import text
            if self.engine:
                ensure_market_tables(self.engine)
                week_of = findings.get("week_of", datetime.now(timezone.utc).strftime("%Y-%m-%d"))
                briefing_text = findings.get("summary", "")
                with self.engine.connect() as conn:
                    conn.execute(text("""
                        INSERT INTO analytics.market_briefings
                            (company_id, week_of, briefing, findings)
                        VALUES (:company_id, :week_of, :briefing, :findings::jsonb)
                        ON CONFLICT (company_id, week_of)
                        DO UPDATE SET
                            briefing = EXCLUDED.briefing,
                            findings = EXCLUDED.findings,
                            created_at = NOW()
                    """), {
                        "company_id": company_id,
                        "week_of":    week_of,
                        "briefing":   briefing_text,
                        "findings":   json.dumps(findings.get("findings", [])),
                    })
                    conn.commit()
        except Exception as e:
            logger.warning("market_research: failed to store briefing: %s", e)

        # Store threat level as memory for trend tracking
        threat_level = findings.get("competitive_landscape", {}).get("threat_level", "low")
        remember(self.engine, company_id, self.name,
                 "observation", "competitive_threat_level",
                 {"level": threat_level, "week": findings.get("week_of", "")})

        # Store top opportunity for agent calibration
        opportunities = findings.get("opportunities", [])
        if opportunities:
            remember(self.engine, company_id, self.name,
                     "observation", "top_opportunity",
                     opportunities[0])

    def get_recent_briefings(self, company_id: str, limit: int = 4) -> list[dict]:
        """Get the N most recent market briefings for a company."""
        if not self.engine:
            return []
        try:
            from sqlalchemy import text
            ensure_market_tables(self.engine)
            with self.engine.connect() as conn:
                rows = conn.execute(text("""
                    SELECT week_of, briefing, findings, created_at
                    FROM analytics.market_briefings
                    WHERE company_id = :company_id
                    ORDER BY week_of DESC
                    LIMIT :limit
                """), {"company_id": company_id, "limit": limit}).fetchall()
                cols = ["week_of", "briefing", "findings", "created_at"]
                return [dict(zip(cols, r)) for r in rows]
        except Exception as e:
            logger.warning("market_research: get_recent_briefings failed: %s", e)
            return []
