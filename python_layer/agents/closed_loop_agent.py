"""
Closed-loop deterministic agents.

These agents make the Agents page operational even when no external adviser/LLM
is configured. Each run returns the same contract:
findings, evidence, proposed_actions, approval_status, executed_actions,
memory_updates, and measurable_outcome.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any

from .approval_gate import RiskLevel, get_risk_level, log_run, submit_action
from .agent_memory import remember

logger = logging.getLogger(__name__)


def normalize_closed_loop_result(
    *,
    agent_name: str,
    company_id: str,
    trigger: str,
    raw: dict | None = None,
    actions: list[dict] | None = None,
    evidence: list[dict] | None = None,
    memory_updates: list[dict] | None = None,
    measurable_outcome: dict | None = None,
) -> dict:
    raw = raw or {}
    findings = raw.get("findings") or []
    action_items = actions if actions is not None else raw.get("actions", [])
    proposed_actions = raw.get("proposed_actions") or [
        action for action in action_items
        if action.get("status") in {"pending", "pending_approval", "notified", "proposed"}
    ]
    executed_actions = raw.get("executed_actions") or [
        action for action in action_items if action.get("status") == "executed"
    ]
    approval_status = raw.get("approval_status") or {
        "pending": len([a for a in proposed_actions if a.get("status") in {"pending", "pending_approval"}]),
        "notified": len([a for a in proposed_actions if a.get("status") == "notified"]),
        "executed": len(executed_actions),
        "rejected": len([a for a in action_items if a.get("status") == "rejected"]),
    }
    memory = memory_updates if memory_updates is not None else raw.get("memory_updates", [])
    outcome = measurable_outcome if measurable_outcome is not None else raw.get("measurable_outcome", {})
    if not outcome:
        outcome = {
            "findings_count": len(findings),
            "proposed_actions_count": len(proposed_actions),
            "executed_actions_count": len(executed_actions),
            "memory_updates_count": len(memory),
        }
    return {
        "agent": agent_name,
        "company_id": company_id,
        "trigger": trigger,
        "run_loop": [
            "observe",
            "analyze",
            "propose",
            "approve_or_execute",
            "remember",
            "measure",
        ],
        "summary": raw.get("summary") or f"{agent_name} completed closed-loop run.",
        "findings": findings,
        "evidence": evidence if evidence is not None else raw.get("evidence", []),
        "proposed_actions": proposed_actions,
        "approval_status": approval_status,
        "executed_actions": executed_actions,
        "memory_updates": memory,
        "measurable_outcome": outcome,
        "actions": action_items,
        "closed_loop": True,
        "_raw": raw,
    }


class ClosedLoopAgent:
    name = "closed_loop"
    task_type = "closed_loop"
    description = "Closed-loop deterministic agent."
    schedule = "manual"
    tool_plan: list[tuple[str, dict]] = []

    def __init__(self, engine=None):
        from database import get_engine_safe
        self.engine = engine or get_engine_safe()

    def system_prompt(self, company_id: str, context: dict) -> str:
        return self.description

    def observe(self, company_id: str) -> dict:
        observations = {}
        for tool_name, payload in self.tool_plan:
            observations[tool_name] = self._tool(company_id, tool_name, payload)
        return observations

    def run(self, company_id: str, trigger: str = "manual") -> dict:
        started = datetime.now(timezone.utc)
        context = self.observe(company_id)
        raw = self.analyze(company_id, context)
        actions = self._route_actions(company_id, raw.get("proposed_actions", []))
        memory_updates = self._store_memory(company_id, raw)
        result = normalize_closed_loop_result(
            agent_name=self.name,
            company_id=company_id,
            trigger=trigger,
            raw=raw,
            actions=actions,
            evidence=raw.get("evidence", []),
            memory_updates=memory_updates,
            measurable_outcome=self.measure(company_id, context, raw, actions, started),
        )
        self._log(company_id, trigger, result)
        return result

    def analyze(self, company_id: str, context: dict) -> dict:
        findings = []
        evidence = []
        for name, payload in context.items():
            evidence.append({"source": name, "summary": self._summarize_payload(payload)})
            if isinstance(payload, dict) and payload.get("error"):
                findings.append({
                    "type": "tool_error",
                    "severity": "warning",
                    "detail": f"{name} could not run: {payload.get('error')}",
                    "evidence": [name],
                })
        return {
            "summary": f"{self.name} checked {len(context)} signal(s).",
            "findings": findings,
            "evidence": evidence,
            "proposed_actions": [],
        }

    def measure(self, company_id: str, context: dict, raw: dict, actions: list[dict], started) -> dict:
        return {
            "signals_checked": len(context),
            "findings_count": len(raw.get("findings", [])),
            "proposed_actions_count": len(raw.get("proposed_actions", [])),
            "executed_actions_count": len([a for a in actions if a.get("status") == "executed"]),
            "pending_actions_count": len([a for a in actions if a.get("status") in {"pending", "pending_approval"}]),
            "run_started_at": started.isoformat(),
            "run_finished_at": datetime.now(timezone.utc).isoformat(),
        }

    def _tool(self, company_id: str, tool_name: str, payload: dict | None = None) -> dict:
        try:
            from copilot.queries import execute_tool
            from copilot.idjwi_security import principal_from_headers
            principal = principal_from_headers(
                company_id=company_id,
                user_id=f"agent:{self.name}",
                role="admin",
                tenant_authorized=True,
            )
            return execute_tool(
                tool_name,
                {"company_id": company_id, **(payload or {})},
                company_id,
                principal=principal,
                llm_available=False,
            )
        except Exception as exc:
            logger.warning("%s tool %s failed: %s", self.name, tool_name, exc)
            return {"error": str(exc)}

    def _route_actions(self, company_id: str, proposed_actions: list[dict]) -> list[dict]:
        routed = []
        for action in proposed_actions:
            action_type = action.get("action_type", "update_record")
            risk = get_risk_level(action_type)
            label = action.get("title") or action.get("action_label") or action_type.replace("_", " ").title()
            payload = action.get("action_payload") or action
            if risk == RiskLevel.AUTO and action.get("execute_now"):
                routed.append({
                    **action,
                    "status": "executed",
                    "risk": risk.value,
                    "execution_result": {"executed": False, "note": "No concrete executor attached to deterministic action."},
                })
                continue
            gate = submit_action(
                self.engine,
                company_id,
                self.name,
                action_type=action_type,
                action_label=label,
                action_payload=payload,
                reasoning=action.get("reasoning") or action.get("detail") or f"{self.name} proposed this action.",
            ) if self.engine else {"status": "proposed", "risk_level": risk.value}
            routed.append({**action, **gate, "risk": getattr(risk, "value", str(risk))})
        return routed

    def _store_memory(self, company_id: str, raw: dict) -> list[dict]:
        if not self.engine:
            return []
        updates = []
        summary = raw.get("summary")
        if summary:
            payload = {"summary": summary, "findings_count": len(raw.get("findings", []))}
            remember(self.engine, company_id, self.name, "observation", "last_closed_loop_summary", payload)
            updates.append({"memory_type": "observation", "key": "last_closed_loop_summary", "value": payload})
        for finding in raw.get("findings", [])[:5]:
            key = f"finding_{finding.get('type', 'general')}"
            payload = {
                "severity": finding.get("severity"),
                "detail": finding.get("detail"),
                "observed_at": datetime.now(timezone.utc).isoformat(),
            }
            remember(self.engine, company_id, self.name, "observation", key, payload)
            updates.append({"memory_type": "observation", "key": key, "value": payload})
        return updates

    def _log(self, company_id: str, trigger: str, result: dict) -> None:
        if not self.engine:
            return
        try:
            log_run(
                self.engine,
                company_id,
                self.name,
                trigger,
                status="completed",
                summary=result.get("summary", ""),
                actions_taken=len(result.get("executed_actions", [])),
                actions_pending=result.get("approval_status", {}).get("pending", 0),
                findings=result.get("findings", []),
            )
        except Exception as exc:
            logger.debug("%s log_run failed: %s", self.name, exc)

    @staticmethod
    def _summarize_payload(payload: Any) -> dict:
        if not isinstance(payload, dict):
            return {"value": str(payload)[:200]}
        summary = {}
        for key, value in payload.items():
            if isinstance(value, (str, int, float, bool)) or value is None:
                summary[key] = value
            elif isinstance(value, list):
                summary[key] = f"{len(value)} item(s)"
            elif isinstance(value, dict):
                summary[key] = f"{len(value)} field(s)"
        return summary


def _finding(type_: str, severity: str, detail: str, evidence: list[str], recommendation: str = "") -> dict:
    return {
        "type": type_,
        "severity": severity,
        "detail": detail,
        "evidence": evidence,
        "recommended_action": recommendation,
    }


def _propose(title: str, action_type: str, detail: str, payload: dict | None = None, priority: str = "medium") -> dict:
    return {
        "title": title,
        "action_type": action_type,
        "detail": detail,
        "reasoning": detail,
        "priority": priority,
        "action_payload": payload or {},
        "status": "proposed",
    }


class DailyHealthCheckAgent(ClosedLoopAgent):
    name = "daily_health_check"
    task_type = "operations_monitor"
    description = "Daily company health check across KPIs, graph gaps, anomalies, and alerts."
    schedule = "0 6 * * *"
    tool_plan = [
        ("get_kpi_snapshot", {}),
        ("find_graph_gaps", {"entity_type": "all", "limit": 30}),
        ("get_anomaly_report", {}),
        ("get_alert_history", {"days_back": 1}),
    ]

    def analyze(self, company_id: str, context: dict) -> dict:
        findings = []
        gaps = context.get("find_graph_gaps", {})
        anomalies = context.get("get_anomaly_report", {})
        snapshot = context.get("get_kpi_snapshot", {}).get("snapshot") or {}
        if gaps.get("gap_count", 0):
            findings.append(_finding("graph_gaps", "warning", f"{gaps.get('gap_count')} graph/data gaps need attention.", ["find_graph_gaps"], "Run relationship repair before relying on dashboards."))
        if anomalies.get("critical_count", 0):
            findings.append(_finding("critical_anomalies", "critical", f"{anomalies.get('critical_count')} critical anomaly signal(s) detected.", ["get_anomaly_report"], "Review anomalies and approve follow-up actions."))
        if snapshot and snapshot.get("health_score") is not None and float(snapshot.get("health_score") or 0) < 60:
            findings.append(_finding("low_health_score", "warning", f"Health score is {snapshot.get('health_score')}.", ["get_kpi_snapshot"], "Run focused operations, revenue, and data repair agents."))
        actions = []
        if findings:
            actions.append(_propose("Create daily health follow-up", "create_task", "Review Idjwi daily health findings and decide repair priorities.", {"task_type": "daily_health_check", "findings": findings}))
        return {
            "summary": f"Daily health check found {len(findings)} issue(s).",
            "findings": findings,
            "evidence": [{"source": k, "summary": self._summarize_payload(v)} for k, v in context.items()],
            "proposed_actions": actions,
        }


class OperationsClosedLoopAgent(ClosedLoopAgent):
    name = "operations"
    task_type = "operations_monitor"
    description = "Monitors overdue work, staff workload, task outcomes, and operational health."
    schedule = "*/15 * * * *"
    tool_plan = [
        ("get_task_summary", {}),
        ("find_task_records", {"overdue_only": True, "limit": 30}),
        ("get_staff_leaderboard", {"top_n": 10}),
        ("get_task_outcomes", {}),
    ]

    def analyze(self, company_id: str, context: dict) -> dict:
        tasks = context.get("get_task_summary", {})
        overdue = context.get("find_task_records", {}).get("records") or []
        findings = []
        overdue_count = tasks.get("overdue_tasks") or len(overdue)
        if overdue_count:
            findings.append(_finding("overdue_tasks", "warning", f"{overdue_count} overdue task(s) need owner review.", ["get_task_summary", "find_task_records"], "Create an operations follow-up and assign likely owners."))
        if tasks.get("completion_rate_pct") is not None and float(tasks.get("completion_rate_pct") or 0) < 70:
            findings.append(_finding("low_completion_rate", "warning", f"Task completion rate is {tasks.get('completion_rate_pct')}%.", ["get_task_summary"], "Review task bottlenecks and staff workload."))
        actions = [_propose("Review overdue operations queue", "create_task", "Review overdue tasks, bottlenecks, and owner assignments.", {"overdue_count": overdue_count})] if findings else []
        return {"summary": f"Operations agent found {len(findings)} issue(s).", "findings": findings, "evidence": [{"source": k, "summary": self._summarize_payload(v)} for k, v in context.items()], "proposed_actions": actions}


class RevenueClosedLoopAgent(ClosedLoopAgent):
    name = "revenue"
    task_type = "revenue_analysis"
    description = "Monitors revenue, unpaid invoices, AR aging, debtors, and cashflow signals."
    schedule = "0 7 * * *"
    tool_plan = [
        ("get_transaction_summary", {}),
        ("get_overdue_invoices", {}),
        ("get_ar_report", {}),
        ("get_top_debtors", {}),
    ]

    def analyze(self, company_id: str, context: dict) -> dict:
        invoices = context.get("get_overdue_invoices", {})
        ar = context.get("get_ar_report", {})
        debtors = context.get("get_top_debtors", {})
        findings = []
        overdue_count = len(invoices.get("invoices") or [])
        if overdue_count:
            findings.append(_finding("overdue_invoices", "warning", f"{overdue_count} overdue invoice(s) need collection review.", ["get_overdue_invoices"], "Prepare follow-up tasks/messages for approval."))
        if ar.get("critical_count") or ar.get("over_90_count"):
            findings.append(_finding("ar_aging_risk", "critical", "Receivables aging has critical/90+ day exposure.", ["get_ar_report"], "Prioritize collections and owner assignment."))
        if (debtors.get("debtors") or [])[:1]:
            findings.append(_finding("top_debtor_exposure", "info", "Top debtor exposure is available for review.", ["get_top_debtors"], "Review concentration before revenue decisions."))
        actions = [_propose("Review revenue collection queue", "create_task", "Review overdue invoices, AR aging, and top debtors.", {"overdue_invoice_count": overdue_count}, "high")] if findings else []
        return {"summary": f"Revenue agent found {len(findings)} revenue signal(s).", "findings": findings, "evidence": [{"source": k, "summary": self._summarize_payload(v)} for k, v in context.items()], "proposed_actions": actions}


class InventoryClosedLoopAgent(ClosedLoopAgent):
    name = "inventory"
    task_type = "inventory_check"
    description = "Monitors inventory health, low-stock products, expiry risk, and reorder needs."
    schedule = "0 6 * * *"
    tool_plan = [
        ("get_product_summary", {}),
        ("get_inventory_health", {}),
        ("get_product_at_risk", {}),
        ("find_product_records", {"low_stock_only": True, "limit": 30}),
    ]

    def analyze(self, company_id: str, context: dict) -> dict:
        at_risk = context.get("get_product_at_risk", {})
        low_stock = context.get("find_product_records", {}).get("records") or []
        findings = []
        risk_count = at_risk.get("count") or at_risk.get("risk_count") or len(low_stock)
        if risk_count:
            findings.append(_finding("inventory_at_risk", "warning", f"{risk_count} product/item(s) appear low stock, expiring, or at reorder risk.", ["get_product_at_risk", "find_product_records"], "Review reorder quantities and supplier links."))
        actions = [_propose("Review inventory reorder list", "create_task", "Review low-stock/expiry risk items and supplier actions.", {"risk_count": risk_count}, "high")] if findings else []
        return {"summary": f"Inventory agent found {len(findings)} inventory issue(s).", "findings": findings, "evidence": [{"source": k, "summary": self._summarize_payload(v)} for k, v in context.items()], "proposed_actions": actions}


class OnboardingClosedLoopAgent(ClosedLoopAgent):
    name = "onboarding"
    task_type = "onboarding"
    description = "Guides first data setup, source choice, import readiness, and onboarding gaps."
    schedule = "event-driven"
    tool_plan = [
        ("plan_onboarding_intake", {"source_name": "company onboarding", "source_kind": "question", "scope_mode": "company"}),
        ("find_graph_gaps", {"entity_type": "all", "limit": 30}),
        ("plan_data_repairs", {"repair_focus": "all", "entity_type": "all", "limit": 20}),
    ]

    def analyze(self, company_id: str, context: dict) -> dict:
        brief = context.get("plan_onboarding_intake", {}).get("brief") or {}
        gaps = context.get("find_graph_gaps", {})
        repairs = context.get("plan_data_repairs", {})
        findings = []
        if brief:
            findings.append(_finding("onboarding_path_ready", "info", "Idjwi has a recommended data onboarding path.", ["plan_onboarding_intake"], "Follow the next data priorities and choose upload vs connector."))
        if gaps.get("gap_count", 0):
            findings.append(_finding("onboarding_graph_gaps", "warning", f"{gaps.get('gap_count')} weakly connected onboarding records.", ["find_graph_gaps"], "Repair links before trusting analytics."))
        if repairs.get("repair_count") or repairs.get("proposals"):
            findings.append(_finding("onboarding_repair_candidates", "info", "Data repair candidates are available after onboarding.", ["plan_data_repairs"], "Submit safe repair proposals for approval."))
        actions = [_propose("Review onboarding readiness", "create_task", "Review onboarding brief, data gaps, and repair candidates.", {"brief": brief}, "medium")] if findings else []
        return {"summary": f"Onboarding agent found {len(findings)} onboarding signal(s).", "findings": findings, "evidence": [{"source": k, "summary": self._summarize_payload(v)} for k, v in context.items()], "proposed_actions": actions}


class ImportCleanupAgent(ClosedLoopAgent):
    name = "import_cleanup"
    task_type = "data_quality"
    description = "Cleans up recent imports by finding unmapped columns, weak links, and load leftovers."
    schedule = "after import"
    tool_plan = [
        ("find_graph_gaps", {"entity_type": "all", "gap_type": "all", "limit": 50}),
        ("plan_data_repairs", {"repair_focus": "imported_column", "entity_type": "all", "limit": 30}),
    ]

    def analyze(self, company_id: str, context: dict) -> dict:
        repairs = context.get("plan_data_repairs", {})
        gaps = context.get("find_graph_gaps", {})
        proposals = repairs.get("proposals") or []
        findings = []
        if proposals:
            findings.append(_finding("import_repair_candidates", "warning", f"{len(proposals)} import cleanup repair candidate(s) found.", ["plan_data_repairs"], "Submit repairs through approval after review."))
        if gaps.get("gap_count", 0):
            findings.append(_finding("post_import_gaps", "warning", f"{gaps.get('gap_count')} records remain weakly connected after import.", ["find_graph_gaps"], "Map missing enterprise/person/product relationships."))
        actions = [
            _propose("Review import cleanup proposals", "update_record", "Review and approve import cleanup/stamping proposals.", {"proposal_count": len(proposals)}, "high")
        ] if proposals else []
        return {"summary": f"Import cleanup found {len(findings)} issue group(s).", "findings": findings, "evidence": [{"source": k, "summary": self._summarize_payload(v)} for k, v in context.items()], "proposed_actions": actions}


class RelationshipRepairAgent(ClosedLoopAgent):
    name = "relationship_repair"
    task_type = "data_quality"
    description = "Finds weak ontology links and proposes safe relationship repairs."
    schedule = "0 3 * * *"
    tool_plan = [
        ("find_graph_gaps", {"entity_type": "all", "gap_type": "relationship", "limit": 60}),
        ("plan_data_repairs", {"repair_focus": "relationship", "entity_type": "all", "limit": 40}),
    ]

    def analyze(self, company_id: str, context: dict) -> dict:
        gaps = context.get("find_graph_gaps", {})
        repairs = context.get("plan_data_repairs", {})
        proposals = repairs.get("proposals") or []
        findings = []
        if gaps.get("gap_count", 0):
            findings.append(_finding("relationship_gaps", "warning", f"{gaps.get('gap_count')} relationship gap(s) detected.", ["find_graph_gaps"], "Approve high-confidence relationship creation/stamping proposals."))
        if proposals:
            findings.append(_finding("repair_proposals", "info", f"{len(proposals)} relationship repair proposal(s) are ready for review.", ["plan_data_repairs"], "Queue approved relationship repairs."))
        actions = [_propose("Approve relationship repairs", "update_record", "Review and approve high-confidence relationship repair proposals.", {"proposal_count": len(proposals)}, "high")] if proposals else []
        return {"summary": f"Relationship repair found {len(proposals)} proposal(s).", "findings": findings, "evidence": [{"source": k, "summary": self._summarize_payload(v)} for k, v in context.items()], "proposed_actions": actions}


class RiskMonitoringAgent(ClosedLoopAgent):
    name = "risk_monitoring"
    task_type = "risk_analysis"
    description = "Monitors churn, concentration, anomaly, and entity risk."
    schedule = "0 7 * * *"
    tool_plan = [
        ("get_person_churn_risk", {}),
        ("get_concentration_risk", {}),
        ("get_anomaly_report", {}),
        ("get_entity_risk_report", {}),
    ]

    def analyze(self, company_id: str, context: dict) -> dict:
        findings = []
        churn = context.get("get_person_churn_risk", {})
        concentration = context.get("get_concentration_risk", {})
        anomalies = context.get("get_anomaly_report", {})
        high = churn.get("high_risk_count") or churn.get("high_risk") or 0
        if high:
            findings.append(_finding("high_churn_risk", "warning", f"{high} high-risk person/client record(s).", ["get_person_churn_risk"], "Create retention follow-up tasks for high-risk clients."))
        if concentration.get("risk_level") in {"high", "critical"}:
            findings.append(_finding("concentration_risk", "warning", "Revenue/client concentration risk is elevated.", ["get_concentration_risk"], "Diversify revenue and review top-client dependency."))
        if anomalies.get("critical_count", 0):
            findings.append(_finding("critical_anomaly_risk", "critical", f"{anomalies.get('critical_count')} critical anomaly/anomalies.", ["get_anomaly_report"], "Investigate anomaly evidence immediately."))
        actions = [_propose("Review risk watchlist", "create_task", "Review high-risk clients/entities/anomalies and assign owners.", {"findings": findings}, "high")] if findings else []
        return {"summary": f"Risk monitoring found {len(findings)} risk signal(s).", "findings": findings, "evidence": [{"source": k, "summary": self._summarize_payload(v)} for k, v in context.items()], "proposed_actions": actions}


class EnrichmentAgent(ClosedLoopAgent):
    name = "enrichment"
    task_type = "market_research"
    description = "Plans safe public/source-registry enrichment for weak records."
    schedule = "0 4 * * *"
    tool_plan = [
        ("plan_source_enrichment", {"question": "Which public and connector sources should enrich this company ontology?", "entity_type": "Enterprise", "limit": 8}),
        ("find_graph_gaps", {"entity_type": "all", "limit": 30}),
    ]

    def analyze(self, company_id: str, context: dict) -> dict:
        plan = context.get("plan_source_enrichment", {})
        gaps = context.get("find_graph_gaps", {})
        sources = plan.get("sources") or []
        findings = []
        if sources:
            findings.append(_finding("enrichment_sources_available", "info", f"{len(sources)} enrichment/source option(s) are available.", ["plan_source_enrichment"], "Collect required inputs, then enrich records through approved source tools."))
        if gaps.get("gap_count", 0):
            findings.append(_finding("enrichment_inputs_missing", "warning", f"{gaps.get('gap_count')} records may need identifiers/locations before enrichment is useful.", ["find_graph_gaps"], "Repair graph gaps before writing enrichment rows."))
        actions = [_propose("Prepare enrichment input checklist", "create_task", "Collect names, addresses, country/city, identifiers, and source permissions for enrichment.", {"source_count": len(sources)})] if findings else []
        return {"summary": f"Enrichment agent found {len(sources)} usable source option(s).", "findings": findings, "evidence": [{"source": k, "summary": self._summarize_payload(v)} for k, v in context.items()], "proposed_actions": actions}
