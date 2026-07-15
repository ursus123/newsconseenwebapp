"""
Idjwi execution brain.

This module gives every request a predictable operating mode and an explicit
observe -> understand -> choose -> verify -> explain -> recommend -> act loop.
It is intentionally deterministic so Idjwi keeps this discipline even when no
advisor model is enabled.
"""

from __future__ import annotations

from typing import Any


MODE_SPECS = {
    "product_explanation": {
        "label": "Product explanation",
        "scope": "default_brain",
        "expected_behavior": "Explain Newsconseen or Idjwi from default product and architecture knowledge.",
        "next_step": "Ask for a setup guide, ontology view, or demo workflow if you want to go deeper.",
    },
    "onboarding_help": {
        "label": "Onboarding help",
        "scope": "default_brain",
        "expected_behavior": "Guide the user on what data to add, how to map it, and what becomes analyzable.",
        "next_step": "Choose an entity or enterprise, then upload a file, connect a source, or ask for an import template.",
    },
    "company_data_lookup": {
        "label": "Company data lookup",
        "scope": "tenant_read",
        "expected_behavior": "Read tenant-scoped records or summaries and cite the tool/data source used.",
        "next_step": "Ask for the underlying records, a chart, or the related graph gaps.",
    },
    "graph_reasoning": {
        "label": "Graph reasoning",
        "scope": "tenant_read",
        "expected_behavior": "Inspect relationships, unlinked records, joins, and ontology graph gaps.",
        "next_step": "Review the proposed gaps, then approve relationship or assignment repair actions.",
    },
    "enrichment_planning": {
        "label": "Enrichment planning",
        "scope": "default_or_public",
        "expected_behavior": "Choose public or connector sources, ask for missing inputs, and explain ontology mapping.",
        "next_step": "Provide the missing location, industry, identifier, or entity name needed for enrichment.",
    },
    "statistical_analysis": {
        "label": "Statistical analysis",
        "scope": "tenant_read",
        "expected_behavior": "Calculate trends, comparisons, rankings, outliers, and confidence caveats.",
        "next_step": "Ask for a chart, segment breakdown, or the records behind the statistic.",
    },
    "risk_analysis": {
        "label": "Risk analysis",
        "scope": "tenant_read",
        "expected_behavior": "Score or explain risk with evidence, missing-data caveats, and mitigation options.",
        "next_step": "Ask Idjwi to show the evidence records or propose risk-reduction actions.",
    },
    "report_generation": {
        "label": "Chart and report generation",
        "scope": "tenant_read",
        "expected_behavior": "Choose the right visual output, prepare a renderable spec, and explain why that form fits the decision.",
        "next_step": "Pin the chart to Reports, ask for a downloadable report, or request a different visual form.",
    },
    "action_execution": {
        "label": "Action execution",
        "scope": "tenant_write",
        "expected_behavior": "Create or propose governed actions, using approval gates when required.",
        "next_step": "Confirm the proposed action details or review the approval in the Agents panel.",
    },
    "data_repair": {
        "label": "Data repair",
        "scope": "tenant_write_approval",
        "expected_behavior": "Detect broken mappings, missing stamps, duplicates, and propose safe repairs.",
        "next_step": "Approve repair proposals only after checking the evidence records.",
    },
    "workflow_automation": {
        "label": "Workflow automation",
        "scope": "tenant_write_approval",
        "expected_behavior": "Explain, run, or propose workflow/agent automation with auditability.",
        "next_step": "Choose the workflow or agent and confirm the approval boundary.",
    },
    "public_data_lookup": {
        "label": "Public data lookup",
        "scope": "public_read",
        "expected_behavior": "Query public APIs or explain source options without tenant data.",
        "next_step": "Ask to compare this public result with company records once tenant data is available.",
    },
    "unknown": {
        "label": "General reasoning",
        "scope": "mixed",
        "expected_behavior": "Clarify the request or answer from the safest available context.",
        "next_step": "Ask a more specific product, data, graph, enrichment, risk, or action question.",
    },
}


MODE_TOOL_HINTS = {
    "product_explanation": {"get_ontology_schema", "generate_import_template"},
    "onboarding_help": {"generate_import_template", "execute_ingestion_plan"},
    "company_data_lookup": {
        "get_people_summary", "get_task_summary", "get_transaction_summary",
        "get_product_summary", "get_enterprise_overview", "find_people_records",
        "find_task_records", "find_transaction_records", "find_product_records",
        "find_address_records", "find_ontology_records", "get_entity_join",
    },
    "graph_reasoning": {
        "find_graph_gaps", "find_relationship_records", "get_relationship_summary",
        "get_company_graph_context", "get_entity_join",
    },
    "enrichment_planning": {"search_public_data", "web_search", "get_enrichment_context", "plan_source_enrichment", "route_source_request", "recommend_enrichment_sources"},
    "statistical_analysis": {
        "get_kpi_snapshot", "get_top_clients", "get_staff_leaderboard",
        "get_ar_report", "get_inventory_health", "get_network_kpis",
        "get_operational_trends", "get_anomaly_report", "run_analysis_modules",
    },
    "risk_analysis": {
        "get_entity_risk_report", "get_concentration_risk", "get_person_churn_risk",
        "get_product_at_risk", "get_ml_predictions",
    },
    "report_generation": {"plan_visual_output", "propose_chart"},
    "action_execution": {"request_action", "create_record", "propose_task", "propose_record_update"},
    "data_repair": {"find_graph_gaps", "plan_data_repairs", "propose_record_update", "execute_ingestion_plan"},
    "workflow_automation": {"invoke_agent", "get_agent_status", "get_workflow_summary"},
    "public_data_lookup": {"search_public_data", "web_search"},
}


def _contains_any(text: str, terms: tuple[str, ...]) -> bool:
    return any(term in text for term in terms)


def classify_request(question: str, tools_called: list[str] | None = None, context: dict | None = None) -> str:
    q = (question or "").lower()
    tools = set(tools_called or [])

    for mode, hints in MODE_TOOL_HINTS.items():
        if tools & hints:
            return mode

    if _contains_any(q, ("what is newsconseen", "what is idjwi", "architecture", "how newsconseen works", "ontology", "what can you do")):
        return "product_explanation"
    if _contains_any(q, ("add data", "import", "template", "columns", "spreadsheet", "upload", "connect first", "onboarding")):
        return "onboarding_help"
    if _contains_any(q, ("relationship", "connected", "unlinked", "graph", "assigned to whom", "no assignee", "orphan")):
        return "graph_reasoning"
    if _contains_any(q, ("enrich", "public api", "source", "connector", "market data", "gdp", "weather", "exchange rate")):
        return "public_data_lookup" if _contains_any(q, ("gdp", "weather", "exchange rate")) else "enrichment_planning"
    if _contains_any(q, ("chart", "visualize", "visualise", "plot", "dashboard", "widget", "downloadable report", "report of", "report on")):
        return "report_generation"
    if _contains_any(q, ("trend", "statistics", "average", "compare", "ranking", "outlier", "forecast")):
        return "statistical_analysis"
    if _contains_any(q, ("risk", "churn", "exposure", "concentration", "overdue", "at risk", "anomaly")):
        return "risk_analysis"
    if _contains_any(q, ("create", "update", "assign", "send", "approve", "execute", "mark as", "schedule")):
        return "action_execution"
    if _contains_any(q, ("repair", "fix", "duplicate", "missing", "map", "stamp", "not assigned")):
        return "data_repair"
    if _contains_any(q, ("agent", "workflow", "automation", "run daily", "monitor")):
        return "workflow_automation"
    if _contains_any(q, ("how many", "list", "show me", "name the", "which", "who", "what records")):
        return "company_data_lookup"

    if context and _has_viewport_or_record(context):
        return "company_data_lookup"
    return "unknown"


def build_execution_trace(
    question: str,
    tools_called: list[str] | None,
    data: dict | None,
    *,
    context: dict | None = None,
    tenant_authorized: bool = True,
    advisor_enabled: bool = False,
    memory_used: bool = False,
    error: str | None = None,
) -> dict[str, Any]:
    tools = tools_called or []
    mode = classify_request(question, tools, context)
    spec = MODE_SPECS[mode]
    missing_inputs = _missing_inputs_for_mode(mode, question, context)
    verification = _verification_summary(tools, data or {}, error)
    approval_required = mode in {"action_execution", "data_repair", "workflow_automation"}

    return {
        "mode": mode,
        "label": spec["label"],
        "scope": spec["scope"],
        "loop": {
            "observe": _observe_summary(question, context, tenant_authorized),
            "understand": spec["expected_behavior"],
            "ask_missing": missing_inputs,
            "choose_tool": tools,
            "verify_result": verification,
            "explain": "Answer should state what was found, what evidence was used, and what is uncertain.",
            "recommend_next": spec["next_step"],
            "act_with_approval": approval_required,
        },
        "tenant_authorized": tenant_authorized,
        "advisor_enabled": advisor_enabled,
        "memory_used": memory_used,
        "status": "failed" if error else ("needs_input" if missing_inputs else "complete"),
    }


def apply_execution_style(answer: str, trace: dict[str, Any]) -> str:
    if not answer or not trace:
        return answer
    mode = trace.get("mode")
    if mode in {"product_explanation", "unknown"}:
        return answer
    if "Next step:" in answer or "Recommended Actions" in answer or "Recommended actions" in answer:
        return answer
    next_step = (trace.get("loop") or {}).get("recommend_next")
    if not next_step:
        return answer
    return f"{answer}\n\nNext step: {next_step}"


def _observe_summary(question: str, context: dict | None, tenant_authorized: bool) -> str:
    page = _context_value(context, "current_page")
    entity = _context_value(context, "selected_entity_type")
    base = "Request received"
    if page or entity:
        base += f" from {page or 'current page'}"
        if entity:
            base += f" with selected entity type {entity}"
    return base + ("; tenant data is available." if tenant_authorized else "; tenant data is not authorized.")


def _missing_inputs_for_mode(mode: str, question: str, context: dict | None) -> list[str]:
    q = (question or "").lower()
    missing: list[str] = []
    if mode == "enrichment_planning":
        if not _contains_any(q, ("clinic", "farm", "shop", "enterprise", "company", "product", "person")) and not _context_value(context, "selected_entity_type"):
            missing.append("entity_type or selected entity")
        if not _contains_any(q, (" in ", " usa", " united states", " kenya", " rwanda", " city", " country")):
            missing.append("location or market")
    if mode == "action_execution" and not _contains_any(q, ("create", "update", "assign", "send", "mark", "schedule")):
        missing.append("specific action")
    if mode == "data_repair" and not _contains_any(q, ("relationship", "assign", "enterprise", "duplicate", "missing", "map", "stamp")):
        missing.append("repair target")
    return missing


def _has_viewport_or_record(context: dict | None) -> bool:
    return bool(
        _context_value(context, "current_page") or
        _context_value(context, "selected_entity_type") or
        _context_value(context, "selected_entity_id")
    )


def _context_value(context: dict | None, key: str) -> Any:
    if not context:
        return ""
    if key in context:
        return context.get(key)
    if key == "current_page":
        return (context.get("viewport") or {}).get("current_page")
    if key == "selected_entity_type":
        return (context.get("selected_record") or {}).get("entity_type")
    if key == "selected_entity_id":
        return (context.get("selected_record") or {}).get("entity_id")
    return ""


def _verification_summary(tools: list[str], data: dict, error: str | None) -> str:
    if error:
        return f"Execution failed: {error}"
    if not tools:
        return "No tenant tool was required or no tool matched the request."
    non_empty = []
    empty = []
    for tool in tools:
        result = data.get(tool, {})
        count = None
        if isinstance(result, dict):
            for key in ("count", "total", "total_people", "total_tasks", "gap_count"):
                if key in result:
                    count = result.get(key)
                    break
            if count is None:
                for key in ("records", "gaps", "data", "results", "items"):
                    value = result.get(key)
                    if isinstance(value, list):
                        count = len(value)
                        break
        if count in (0, None):
            empty.append(tool)
        else:
            non_empty.append(f"{tool} returned {count}")
    parts = []
    if non_empty:
        parts.append("; ".join(non_empty))
    if empty:
        parts.append("No rows or uncounted output from " + ", ".join(empty))
    return ". ".join(parts) if parts else "Tool completed."
