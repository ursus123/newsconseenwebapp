from collections import Counter, defaultdict
from datetime import date, datetime, timezone
from decimal import Decimal, InvalidOperation

from tenant_context.data_quality import section_quality
from tenant_context.entity_registry import context_definitions, definition_for
from tenant_context.operational_metrics import deterministic_metrics

from .contracts import ANALYTICS_PRODUCT_CONTRACTS


def _num(value):
    try: return Decimal(str(value or 0))
    except InvalidOperation: return Decimal(0)


def _date(value):
    try: return date.fromisoformat(str(value)[:10]) if value else None
    except ValueError: return None


def _record(contract_name, metrics, *, subject_type="tenant", subject_id=None, confidence=None, limitations=None):
    contract = ANALYTICS_PRODUCT_CONTRACTS[contract_name]
    computed_at = datetime.now(timezone.utc).isoformat()
    record = {
        "product_name": contract.name, "layer": contract.layer.value,
        "grain": contract.grain, "subject_type": subject_type, "subject_id": subject_id,
        "metrics": metrics, "derived_from": list(contract.derived_from),
        "methodology": contract.methodology, "product_version": contract.version,
        "confidence_kind": contract.confidence_kind, "confidence": confidence,
        "limitations": limitations or [], "computed_at": computed_at,
    }
    if contract.layer.value == "predictive_intelligence":
        record["model_metadata"] = {
            "model_version": contract.version,
            "feature_version": "canonical-v1",
            "training_data_window": "not_applicable_baseline",
            "prediction_at": computed_at,
            "input_watermark": computed_at,
        }
    return record


def build_operational_summaries(context, records_by_object):
    rows = []
    for name, definition in context_definitions():
        records = records_by_object.get(name, [])
        metrics = deterministic_metrics(name, records)
        metrics["data_quality"] = section_quality(name, records, context.tenant_id)
        rows.append(_record("operational_object_summary", metrics, subject_type="object", subject_id=name))
    return rows


def build_historical_facts(context, operational_rows, fact_date=None):
    day = str(fact_date or date.today())
    return [
        {**_record("operational_fact_daily", row["metrics"], subject_type="object", subject_id=row["subject_id"]), "fact_date": day}
        for row in operational_rows
    ]


def build_cross_object_intelligence(context, data):
    enterprises, people, tasks, txs = (data.get(k, []) for k in ("enterprise", "person", "task", "transaction"))
    products, services, relationships = (data.get(k, []) for k in ("product", "service", "relationship"))
    active_people = max(1, sum(str(p.get("status") or "").lower() == "active" for p in people))
    open_tasks = [t for t in tasks if str(t.get("status") or "").lower() not in {"completed", "cancelled", "closed"}]
    overdue = [t for t in open_tasks if _date(t.get("due_date")) and _date(t.get("due_date")) < date.today()]
    unassigned = [t for t in open_tasks if not t.get("assigned_to_name")]
    workload = {
        "active_people": active_people, "open_tasks": len(open_tasks), "overdue_tasks": len(overdue),
        "unassigned_tasks": len(unassigned), "open_tasks_per_active_person": round(len(open_tasks) / active_people, 2),
        "risk_level": "high" if len(overdue) > active_people or len(unassigned) > active_people else "moderate" if overdue or unassigned else "low",
    }

    values = defaultdict(Decimal)
    for tx in txs:
        if tx.get("enterprise_id"): values[str(tx["enterprise_id"])] += _num(tx.get("amount"))
    total = sum(values.values(), Decimal(0)); largest = max(values.values(), default=Decimal(0))
    concentration = {"total_value": float(total), "largest_enterprise_share_pct": round(float(largest / total * 100), 2) if total else 0, "enterprises_with_value": len(values)}

    linked_people = {str(r.get("person_id")) for r in relationships if r.get("person_id")}
    linked_enterprises = {str(r.get("enterprise_id")) for r in relationships if r.get("enterprise_id")}
    coverage = {"people_coverage_pct": round(len(linked_people) / len(people) * 100, 2) if people else 100, "enterprise_coverage_pct": round(len(linked_enterprises) / len(enterprises) * 100, 2) if enterprises else 100, "active_relationships": sum(str(r.get("status") or "active").lower() == "active" for r in relationships)}

    low_stock = sum(_num(p.get("stock_quantity")) <= _num(p.get("reorder_level")) for p in products)
    delivery = {"active_services": sum(p.get("is_active") is not False for p in services), "overdue_tasks": len(overdue), "low_stock_products": low_stock, "risk_level": "high" if overdue and low_stock else "moderate" if overdue or low_stock else "low"}

    by_enterprise = []
    for ent in enterprises:
        eid = str(ent.get("id") or "")
        ent_tasks = [task for task in tasks if str(task.get("enterprise_id") or "") == eid]
        ent_overdue = sum(bool(_date(t.get("due_date")) and _date(t.get("due_date")) < date.today() and str(t.get("status") or "").lower() not in {"completed", "cancelled"}) for t in ent_tasks)
        score = max(0, 100 - ent_overdue * 10)
        by_enterprise.append(_record("enterprise_health", {"health_score": score, "task_count": len(ent_tasks), "overdue_tasks": ent_overdue, "transaction_value": float(values[eid])}, subject_type="enterprise", subject_id=eid))
    return by_enterprise + [
        _record("workload_risk", workload), _record("revenue_concentration", concentration),
        _record("relationship_coverage", coverage), _record("service_delivery_risk", delivery),
    ]


def build_governance_intelligence(context, data):
    risks, opportunities, recommendations, decisions = (data.get(k, []) for k in ("risk", "opportunity", "recommendation", "decision"))
    acted = sum(bool(r.get("is_actioned")) for r in recommendations)
    decision_outcomes = sum(bool(d.get("outcome")) for d in decisions)
    portfolio = {
        "open_risks": sum(str(r.get("status") or "open").lower() == "open" for r in risks),
        "high_or_critical_risks": sum(str(r.get("severity") or "").lower() in {"high", "critical"} for r in risks),
        "open_opportunities": sum(str(o.get("status") or "open").lower() in {"open", "pursuing"} for o in opportunities),
        "recommendations": len(recommendations), "recommendation_action_rate_pct": round(acted / len(recommendations) * 100, 2) if recommendations else 0,
        "decisions": len(decisions), "decision_outcome_coverage_pct": round(decision_outcomes / len(decisions) * 100, 2) if decisions else 0,
    }
    return [
        _record("governance_portfolio", portfolio),
        _record("decision_outcomes", {"decisions_recorded": len(decisions), "decisions_with_outcomes": decision_outcomes, "recommendations_actioned": acted}),
    ]


def build_predictive_intelligence(context, data):
    tasks, txs, products, people = (data.get(k, []) for k in ("task", "transaction", "product", "person"))
    predictions = []
    for task in tasks:
        status = str(task.get("status") or "").lower()
        if status in {"completed", "cancelled", "closed"}: continue
        score = 0
        due = _date(task.get("due_date"))
        if due and due < date.today(): score += 55
        elif due and (due - date.today()).days <= 3: score += 25
        if str(task.get("priority") or "").lower() in {"high", "urgent"}: score += 20
        if not task.get("assigned_to_name"): score += 20
        score = min(score, 100)
        predictions.append(_record("task_delay_risk", {"risk_score": score, "risk_band": "high" if score >= 60 else "medium" if score >= 30 else "low"}, subject_type="task", subject_id=str(task.get("id") or ""), confidence=0.65, limitations=["Rule-based baseline; not trained on tenant outcomes."]))
    amounts = [_num(tx.get("amount")) for tx in txs if str(tx.get("status") or "").lower() not in {"void", "voided"}]
    predictions.append(_record("cashflow_outlook", {"observed_transaction_value": float(sum(amounts, Decimal(0))), "baseline_next_period_value": float(sum(amounts, Decimal(0))), "observation_count": len(amounts)}, confidence=0.4, limitations=["Naive persistence baseline; seasonality and payment timing are not modeled."]))
    for product in products:
        stock, reorder = _num(product.get("stock_quantity")), _num(product.get("reorder_level"))
        if stock <= reorder:
            predictions.append(_record("inventory_restock_risk", {"stock_quantity": float(stock), "reorder_level": float(reorder), "risk_band": "high" if stock <= 0 else "medium"}, subject_type="product", subject_id=str(product.get("id") or ""), confidence=0.8, limitations=["Demand velocity is not yet modeled."]))
    active_people = max(1, sum(str(p.get("status") or "").lower() == "active" for p in people))
    active_tasks = sum(str(t.get("status") or "").lower() not in {"completed", "cancelled", "closed"} for t in tasks)
    ratio = active_tasks / active_people
    predictions.append(_record("staffing_pressure", {"open_tasks_per_active_person": round(ratio, 2), "pressure_band": "high" if ratio > 5 else "medium" if ratio > 2 else "low"}, confidence=0.6, limitations=["Schedules and individual capacity are not yet fully modeled."]))
    return predictions
