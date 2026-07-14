"""
Structured Idjwi brain primitives.

This module gives Idjwi product, ontology, source, analysis, risk, and answer
policy knowledge before any tenant has company data. It is intentionally
deterministic and can be used by the LLM prompt, API routes, and tool calls.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Optional


GLOBAL_MEMORY_COMPANY_ID = "__global__"
SOURCE_MEMORY_COMPANY_ID = "__source__"
INDUSTRY_MEMORY_COMPANY_ID = "__industry__"

_REGISTRY_PATH = Path(__file__).parent / "docs" / "source_registry.json"


PRODUCT_BRAIN = {
    "identity": "Idjwi is the operational intelligence brain of Newsconseen.",
    "north_star": (
        "Idjwi should understand the business, know the system and available "
        "data sources, explain what matters, and safely help the operator act."
    ),
    "system_model": [
        "Newsconseen is an Autonomous SME Operating System.",
        "The company graph is the center of the product.",
        "Supabase is the live source of truth for ontology entities.",
        "python_layer is the analytics, enrichment, ML, and automation layer.",
        "Idjwi and agents are the intelligence and execution layer.",
        "Forms create reality; the datamart explains reality; agents act on reality.",
    ],
    "brains": ["ontology", "source", "analysis", "memory", "action"],
}


ONTOLOGY_BRAIN = {
    "entities": [
        "Person", "Enterprise", "Product", "Service", "Task", "Transaction",
        "Relationship", "Address", "Document", "Schedule", "Signal",
        "Channel", "Territory", "Animal", "Plot", "Observation", "Insight",
        "Recommendation", "Risk", "Opportunity", "Decision",
    ],
    "connections": [
        "Person works at, manages, serves, or buys from Enterprise.",
        "Product is stocked, sold, supplied, consumed, or produced by Enterprise.",
        "Service is offered by Enterprise and delivered to Person or Enterprise.",
        "Task is assigned to Person and can attach to any operational entity.",
        "Transaction involves Enterprise, Person, Product, or Service.",
        "Relationship is the graph backbone connecting entities.",
        "Address locates Enterprise, Person, Plot, Territory, or service areas.",
        "Observation explains Animal, Plot, Product, Address, or Signal behavior.",
        "Risk, Insight, Recommendation, Opportunity, and Decision attach to any entity.",
    ],
}


ANALYSIS_BRAIN = {
    "graph_methods": [
        "central nodes", "isolated nodes", "missing relationships",
        "dependency risk", "concentration risk", "communities/clusters",
        "path tracing", "duplicate detection", "relationship strength",
    ],
    "statistics": [
        "count", "sum", "average", "median", "trend", "percent change",
        "distribution", "outliers", "ranking", "cohort comparison",
        "correlation", "aging buckets", "completion rate", "conversion rate",
        "rolling average", "sample-size caveats",
    ],
    "chart_rules": {
        "time_series": "line or area",
        "category_comparison": "bar",
        "top_n": "horizontal bar",
        "composition": "donut or pie only for a few categories",
        "location": "map",
        "relationship": "graph/network",
        "risk": "matrix, scatter, or heatmap",
        "aging": "stacked bar",
        "workflow_status": "stacked bar or table",
    },
}


RISK_BRAIN = {
    "formula": "risk = severity x likelihood x exposure x confidence",
    "categories": [
        "operational", "financial", "compliance", "inventory", "geographic",
        "supplier/customer concentration", "staff workload", "data quality",
        "safety/recall", "churn/retention", "fraud/AML/sanctions",
        "document expiry", "automation/action risk",
    ],
    "required_explanation": [
        "trigger", "evidence", "source", "confidence", "impact",
        "recommended action", "whether approval is required",
    ],
}


ANSWER_POLICY = {
    "default_structure": [
        "Direct answer",
        "Evidence used",
        "Meaning",
        "Recommended action",
        "Caveat or missing data",
    ],
    "voice": "Analyst/operator: concrete, evidence-led, action-aware.",
    "avoid": ["generic chatbot behavior", "unsupported numbers", "hidden actions"],
}


QUESTION_ROUTING = [
    {
        "intent": "kpi_snapshot",
        "triggers": ["how are we doing", "overview", "snapshot", "health", "performance"],
        "tools": ["get_kpi_snapshot", "get_company_scorecard", "search_intelligence"],
        "analysis": ["KPI snapshot", "top risks", "recommended actions"],
    },
    {
        "intent": "variance_drilldown",
        "triggers": ["why", "what caused", "reason", "drop", "increase", "decrease"],
        "tools": ["get_operational_trends", "get_transaction_summary", "get_task_summary"],
        "analysis": ["trend", "comparison", "drivers", "missing data caveats"],
    },
    {
        "intent": "graph_importance",
        "triggers": ["who matters most", "most important", "connected", "relationship", "graph"],
        "tools": ["get_company_graph_context", "get_relationship_summary", "get_concentration_risk"],
        "analysis": ["centrality", "dependency risk", "isolated nodes"],
    },
    {
        "intent": "risk_analysis",
        "triggers": ["risk", "worry", "danger", "exposure", "threat", "compliance"],
        "tools": ["get_entity_risk_report", "get_concentration_risk", "search_intelligence"],
        "analysis": ["risk formula", "evidence", "approval requirement"],
    },
    {
        "intent": "visualization",
        "triggers": ["show me", "chart", "graph", "visualize", "plot", "map"],
        "tools": ["propose_chart", "get_ontology_schema"],
        "analysis": ["choose chart type from chart_rules"],
    },
    {
        "intent": "comparison",
        "triggers": ["compare", "versus", "vs", "which is better", "rank"],
        "tools": ["get_network_kpis", "get_top_clients", "get_staff_leaderboard"],
        "analysis": ["ranking", "cohort comparison", "sample-size caveats"],
    },
    {
        "intent": "change_detection",
        "triggers": ["what changed", "trend", "anomaly", "outlier"],
        "tools": ["get_anomaly_report", "get_operational_trends", "get_monthly_kpis"],
        "analysis": ["trend", "outlier detection", "confidence"],
    },
    {
        "intent": "action_recommendation",
        "triggers": ["what should i do", "recommend", "next move", "create", "schedule"],
        "tools": ["propose_task", "propose_record_update", "write_insight"],
        "analysis": ["action proposal", "approval gate", "audit trail"],
    },
    {
        "intent": "enrichment",
        "triggers": ["enrich", "public api", "source", "external data", "what can you know"],
        "tools": ["recommend_enrichment_sources", "get_enrichment_context"],
        "analysis": ["source registry", "required inputs", "confidence"],
    },
]


INDUSTRY_MEMORY = {
    "clinic": {
        "terms": {"clients": "patients", "products": "medications and supplies"},
        "minimum_dataset": ["patients", "staff", "services", "medications", "appointments", "invoices", "licenses"],
        "priority_sources": ["cms", "nppes_npi", "open_fda", "rxnorm", "nominatim"],
        "risks": ["license expiry", "medication stockout", "cold-chain excursions", "unpaid invoices"],
    },
    "farm": {
        "terms": {"enterprises": "farm units or buyers", "products": "crops, feed, inputs"},
        "minimum_dataset": ["plots", "animals", "products", "observations", "tasks", "transactions", "weather/location"],
        "priority_sources": ["soilgrids", "open_meteo", "nasa_power", "faostat", "usda_nass_ams"],
        "risks": ["soil moisture", "weather exposure", "feed stockout", "yield variance"],
    },
    "retail": {
        "terms": {"clients": "customers", "products": "SKUs"},
        "minimum_dataset": ["products", "transactions", "customers", "suppliers", "inventory", "tasks"],
        "priority_sources": ["open_food_facts", "upc_item_db", "osm_overpass", "us_census", "stripe"],
        "risks": ["stockout", "margin compression", "supplier concentration", "slow-moving inventory"],
    },
}


def load_source_registry() -> list[dict[str, Any]]:
    try:
        data = json.loads(_REGISTRY_PATH.read_text(encoding="utf-8"))
        return data if isinstance(data, list) else []
    except Exception:
        return []


def _norm(value: str) -> str:
    return (value or "").strip().lower().replace("_", " ")


def classify_question(question: str) -> dict[str, Any]:
    q = _norm(question)
    matches = []
    for route in QUESTION_ROUTING:
        score = sum(1 for trigger in route["triggers"] if trigger in q)
        if score:
            matches.append({**route, "score": score})
    if not matches:
        return {
            "intent": "general_operational_answer",
            "tools": ["get_operator_context", "get_ontology_schema"],
            "analysis": ["answer directly", "state missing data"],
            "score": 0,
        }
    matches.sort(key=lambda r: r["score"], reverse=True)
    return matches[0]


def recommend_sources(
    entity_type: Optional[str] = None,
    industry: Optional[str] = None,
    risk_category: Optional[str] = None,
    source_type: Optional[str] = None,
    limit: int = 8,
) -> dict[str, Any]:
    registry = load_source_registry()
    entity = _norm(entity_type or "")
    industry_key = _norm(industry or "").replace(" ", "_")
    risk = _norm(risk_category or "")
    stype = _norm(source_type or "")
    priority = set(INDUSTRY_MEMORY.get(industry_key, {}).get("priority_sources", []))

    scored = []
    for src in registry:
        score = 0
        entities = [_norm(e) for e in src.get("entities_enriched", [])]
        risks = [_norm(r) for r in src.get("risk_effects", [])]
        if entity and entity in entities:
            score += 4
        if risk and any(risk in r or r in risk for r in risks):
            score += 3
        if stype and stype == _norm(src.get("source_type", "")):
            score += 2
        if src.get("source_id") in priority:
            score += 2
        if not entity and not risk and not stype and not priority:
            score = 1
        if score:
            scored.append((score, src))
    scored.sort(key=lambda item: (item[0], item[1].get("confidence") == "high"), reverse=True)
    sources = [src for _, src in scored[: max(1, min(int(limit or 8), 30))]]
    return {
        "filters": {
            "entity_type": entity_type,
            "industry": industry,
            "risk_category": risk_category,
            "source_type": source_type,
        },
        "sources": sources,
        "count": len(sources),
        "missing_inputs": sorted({req for src in sources for req in src.get("requires", [])}),
        "answer_hint": (
            "Explain which sources are available, what each can enrich, the inputs needed, "
            "freshness/confidence, and which risk or score each source affects."
        ),
    }


def get_brain_snapshot(
    company_id: str = "",
    question: Optional[str] = None,
    entity_type: Optional[str] = None,
    industry: Optional[str] = None,
) -> dict[str, Any]:
    route = classify_question(question or "") if question else None
    sources = recommend_sources(entity_type=entity_type, industry=industry, limit=6)
    return {
        "company_id": company_id,
        "memory_scopes": [
            "global", "source", "industry", "company", "user", "session", "entity",
        ],
        "reserved_memory_company_ids": {
            "global": GLOBAL_MEMORY_COMPANY_ID,
            "source": SOURCE_MEMORY_COMPANY_ID,
            "industry": INDUSTRY_MEMORY_COMPANY_ID,
        },
        "product_brain": PRODUCT_BRAIN,
        "ontology_brain": ONTOLOGY_BRAIN,
        "analysis_brain": ANALYSIS_BRAIN,
        "risk_brain": RISK_BRAIN,
        "answer_policy": ANSWER_POLICY,
        "question_route": route,
        "source_recommendations": sources,
        "industry_memory": INDUSTRY_MEMORY,
    }


def build_prompt_section(company_id: str) -> str:
    registry = load_source_registry()
    source_lines = []
    for src in registry[:28]:
        entities = ", ".join(src.get("entities_enriched", [])[:5])
        uses = ", ".join(src.get("used_for", [])[:3])
        source_lines.append(
            f"- {src['source_id']} ({src['source_type']}): enriches {entities}; "
            f"needs {', '.join(src.get('requires', []))}; used for {uses}; "
            f"confidence {src.get('confidence', 'unknown')}."
        )

    return "\n".join([
        "IDJWI OPERATING BRAIN",
        "=====================",
        PRODUCT_BRAIN["north_star"],
        "",
        "Product brain:",
        *[f"- {item}" for item in PRODUCT_BRAIN["system_model"]],
        "",
        "Ontology brain:",
        "- Entities: " + ", ".join(ONTOLOGY_BRAIN["entities"]),
        *[f"- {item}" for item in ONTOLOGY_BRAIN["connections"]],
        "",
        "Analysis brain:",
        "- Graph methods: " + ", ".join(ANALYSIS_BRAIN["graph_methods"]),
        "- Statistics: " + ", ".join(ANALYSIS_BRAIN["statistics"]),
        "- Chart rules: " + "; ".join(f"{k} -> {v}" for k, v in ANALYSIS_BRAIN["chart_rules"].items()),
        "",
        "Risk brain:",
        f"- Formula: {RISK_BRAIN['formula']}",
        "- Categories: " + ", ".join(RISK_BRAIN["categories"]),
        "- Every risk answer must explain: " + ", ".join(RISK_BRAIN["required_explanation"]),
        "",
        "Default answer policy:",
        "- Structure: " + " / ".join(ANSWER_POLICY["default_structure"]),
        f"- Voice: {ANSWER_POLICY['voice']}",
        "",
        "Question routing:",
        *[
            f"- {r['intent']}: triggers {', '.join(r['triggers'][:4])}; "
            f"tools {', '.join(r['tools'])}; analysis {', '.join(r['analysis'])}"
            for r in QUESTION_ROUTING
        ],
        "",
        "Source intelligence registry:",
        *source_lines,
        "",
        "Use source intelligence when the operator asks about enrichment, public APIs, missing data, "
        "risk evidence, or what Idjwi can know before company data exists.",
    ])


def seed_bootstrap_memory(engine=None) -> dict[str, Any]:
    """
    Persist core global/source/industry memories into analytics.idjwi_memory.
    Uses reserved company IDs because the current schema requires company_id.
    """
    from copilot.idjwi_memory import remember

    saved = []
    payloads = [
        (GLOBAL_MEMORY_COMPANY_ID, "product_brain", PRODUCT_BRAIN, "product_context", "global"),
        (GLOBAL_MEMORY_COMPANY_ID, "ontology_brain", ONTOLOGY_BRAIN, "ontology_schema", "global"),
        (GLOBAL_MEMORY_COMPANY_ID, "analysis_brain", ANALYSIS_BRAIN, "analysis_capability", "global"),
        (GLOBAL_MEMORY_COMPANY_ID, "risk_brain", RISK_BRAIN, "risk_framework", "global"),
        (GLOBAL_MEMORY_COMPANY_ID, "answer_policy", ANSWER_POLICY, "answer_policy", "global"),
        (INDUSTRY_MEMORY_COMPANY_ID, "industry_memory", INDUSTRY_MEMORY, "industry_context", "industry"),
    ]
    for cid, key, value, memory_type, scope in payloads:
        saved.append(remember(
            company_id=cid,
            key=key,
            value=value,
            memory_type=memory_type,
            scope=scope,
            owner="idjwi",
            source="bootstrap",
            review_status="confirmed",
            metadata={"bootstrap": True},
            engine=engine,
        ))

    for src in load_source_registry():
        saved.append(remember(
            company_id=SOURCE_MEMORY_COMPANY_ID,
            key=src["source_id"],
            value=src,
            memory_type="source_registry",
            scope="source",
            owner="idjwi",
            source="source_registry_json",
            review_status="confirmed",
            metadata={"bootstrap": True, "category": src.get("category")},
            engine=engine,
        ))

    return {
        "attempted": len(saved),
        "saved": sum(1 for item in saved if item.get("saved")),
        "results": saved,
    }
