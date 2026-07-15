"""
Trust, audit, and explainability helpers for Idjwi answers.

The trust packet is intentionally plain JSON so every Idjwi surface can show
what was used, which tenant was queried, and how to verify the answer.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any


PUBLIC_TOOLS = {
    "web_search",
    "search_public_data",
    "route_source_request",
    "plan_source_enrichment",
    "recommend_enrichment_sources",
    "get_ontology_schema",
    "generate_import_template",
}

WRITE_OR_APPROVAL_TOOLS = {
    "request_action",
    "propose_task",
    "propose_chart",
    "propose_record_update",
    "create_record",
    "import_records",
    "execute_ingestion_plan",
    "write_insight",
    "invoke_agent",
}

HIGH_STAKES_TERMS = {
    "risk", "churn", "financial", "finance", "revenue", "invoice", "debt",
    "health", "clinic", "patient", "farm", "compliance", "audit", "legal",
    "medicine", "medication", "crop", "livestock", "safety",
}


def build_trust_packet(
    *,
    question: str,
    company_id: str | None,
    principal: Any = None,
    mode: str = "autonomous",
    operating_mode: str = "",
    collected_tools: list[dict] | None = None,
    tools_detail: list[dict] | None = None,
    citations: list[dict] | None = None,
    confidence: dict | None = None,
    caveats: list[str] | None = None,
    data_freshness: dict | None = None,
    execution_trace: dict | None = None,
    company_context: dict | None = None,
    memory_used: bool = False,
    default_brain_used: bool | None = None,
    tenant_brain_used: bool | None = None,
    error: str | None = None,
) -> dict:
    collected_tools = collected_tools or []
    tools_detail = tools_detail or _tool_details_from_collected(collected_tools)
    citations = citations or []
    caveats = list(caveats or [])
    confidence = confidence or {"score": 0.45, "label": "Limited", "reason": "No confidence estimate was available."}
    tenant_authorized = bool(getattr(principal, "tenant_authorized", True))
    role = getattr(principal, "role", None)
    user_id = getattr(principal, "user_id", None)

    tool_names = [item.get("tool") for item in collected_tools if item.get("tool")]
    public_tools = [name for name in tool_names if name in PUBLIC_TOOLS]
    write_tools = [name for name in tool_names if name in WRITE_OR_APPROVAL_TOOLS]
    tenant_tools = [name for name in tool_names if name not in PUBLIC_TOOLS]
    public_sources_used = bool(public_tools or citations)

    if default_brain_used is None:
        default_brain_used = not tenant_tools or public_sources_used or not tenant_authorized
    if tenant_brain_used is None:
        tenant_brain_used = bool(tenant_tools and tenant_authorized)

    high_stakes = _is_high_stakes(question, operating_mode)
    if high_stakes and not any("Verify" in c or "High-stakes" in c for c in caveats):
        caveats.append("High-stakes answer: verify against source records before acting.")
    if not tenant_authorized and tenant_tools:
        caveats.append("Tenant tools were requested but tenant authorization was not available.")

    verification = _verification_steps(
        tools_detail=tools_detail,
        citations=citations,
        tenant_brain_used=tenant_brain_used,
        public_sources_used=public_sources_used,
        write_tools=write_tools,
        high_stakes=high_stakes,
    )

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "question_type": operating_mode or (execution_trace or {}).get("mode") or "unknown",
        "mode": mode,
        "company_id_queried": company_id or None,
        "tenant_authorized": tenant_authorized,
        "principal": {"user_id": user_id, "role": role},
        "brain_scope": {
            "default_brain_used": bool(default_brain_used),
            "tenant_brain_used": bool(tenant_brain_used),
            "memory_used": bool(memory_used),
            "public_sources_used": public_sources_used,
        },
        "tools_called": tool_names,
        "tools_detail": tools_detail,
        "data_used": _data_used(tools_detail, citations, company_context),
        "public_sources": [
            {"title": c.get("title"), "url": c.get("url"), "source": c.get("source")}
            for c in citations[:8]
        ],
        "confidence": confidence,
        "missing_data_caveats": _dedupe(caveats)[:10],
        "suggested_verification": verification,
        "approval_or_write_tools": write_tools,
        "high_stakes": high_stakes,
        "error": error,
    }


def _tool_details_from_collected(collected_tools: list[dict]) -> list[dict]:
    details = []
    for item in collected_tools:
        result = item.get("result") or {}
        params = {k: v for k, v in (item.get("input") or {}).items() if k != "company_id"}
        details.append({
            "tool": item.get("tool"),
            "params": params,
            "data_source": result.get("data_source") or result.get("source") or result.get("dataset"),
            "data_as_of": result.get("data_as_of"),
            "row_count": _count_rows(result),
        })
    return details


def _count_rows(result: dict) -> int:
    if not isinstance(result, dict):
        return 0
    for key in ("count", "total", "row_count", "gap_count", "high_risk_count"):
        value = result.get(key)
        if isinstance(value, int):
            return value
    for key in ("records", "data", "results", "people", "clients", "products", "tasks", "transactions", "entities", "gaps", "proposals"):
        value = result.get(key)
        if isinstance(value, list):
            return len(value)
    return 0


def _data_used(tools_detail: list[dict], citations: list[dict], company_context: dict | None) -> list[dict]:
    data = []
    for item in tools_detail:
        data.append({
            "kind": "tool",
            "name": item.get("tool"),
            "source": item.get("data_source") or item.get("source"),
            "data_as_of": item.get("data_as_of"),
            "row_count": item.get("row_count"),
        })
    if citations:
        data.append({"kind": "public_source", "name": "citations", "row_count": len(citations)})
    if company_context:
        viewport = company_context.get("viewport") or {}
        if viewport:
            data.append({"kind": "session_context", "name": "viewport", "source": viewport.get("current_page")})
    return data


def _verification_steps(
    *,
    tools_detail: list[dict],
    citations: list[dict],
    tenant_brain_used: bool,
    public_sources_used: bool,
    write_tools: list[str],
    high_stakes: bool,
) -> list[str]:
    steps = []
    if tenant_brain_used and tools_detail:
        if any(item.get("sql") for item in tools_detail):
            steps.append("Open the tool source SQL in Query Builder and rerun it for the same company.")
        else:
            steps.append("Open the named ontology page and verify the records returned by the listed tools.")
    if public_sources_used:
        steps.append("Open cited public sources or rerun the source registry/public-data tool.")
    if write_tools:
        steps.append("Check the approval queue/audit trail before treating proposed actions as executed.")
    if high_stakes:
        steps.append("Have an operator verify financial, health, farm, risk, or compliance conclusions before acting.")
    if not steps:
        steps.append("Ask Idjwi to show the exact source or run a tenant-data lookup if you need record-level proof.")
    return steps


def _is_high_stakes(question: str, operating_mode: str = "") -> bool:
    text = f"{question or ''} {operating_mode or ''}".lower()
    return any(term in text for term in HIGH_STAKES_TERMS)


def _dedupe(values: list[str]) -> list[str]:
    seen = set()
    out = []
    for value in values:
        text = str(value or "").strip()
        if text and text not in seen:
            seen.add(text)
            out.append(text)
    return out
