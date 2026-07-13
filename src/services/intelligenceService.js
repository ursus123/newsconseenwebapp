/**
 * intelligenceService.js
 *
 * Single service layer for the Insight / Recommendation / Decision /
 * Risk / Opportunity / MetricDefinition intelligence entities.
 *
 * Rules:
 *  - Every AI, ML, enrichment, and agent output MUST write through this service
 *  - Evidence is a structured JSON array on each Insight (not a separate entity)
 *  - Decisions are auto-created when a Recommendation is approved or rejected
 *  - All writes stamp company_id + created_by
 */

import { ncClient } from "@/api/ncClient";
import dataService from "@/services/dataService";
import { RAILWAY_URL, authHeaders } from "@/config/api";


const apiHeaders = async (extra = {}) => authHeaders(extra);

// ── Internal helpers ───────────────────────────────────────────────

function _scope(data, currentUser) {
  if (!currentUser) return data;
  const out = { ...data, created_by: currentUser.email };
  if (currentUser.role !== "super_admin" && currentUser.company_id) {
    out.company_id = currentUser.company_id;
  }
  return out;
}

function _now() {
  return new Date().toISOString();
}

function _ffETL(entityName) {
  dataService.triggerEntityETL(entityName);
}

// ── Insight ────────────────────────────────────────────────────────

/**
 * createInsight(data, currentUser)
 *
 * Core method. All intelligence producers call this.
 *
 * data shape:
 *  {
 *    subject_type, subject_id, subject_name,
 *    insight_type,   // risk | opportunity | anomaly | trend | forecast | benchmark | explanation
 *    title, body,
 *    severity,       // low | medium | high | critical
 *    confidence,     // 0–1
 *    source,         // ai | ml_model | enrichment_api | report | agent | manual
 *    source_run_id,
 *    evidence,       // array of evidence items (see evidenceItem helper)
 *    related_metric_id,
 *    expires_at,
 *  }
 */
export async function createInsight(data, currentUser) {
  const payload = _scope(
    {
      status:      "new",
      detected_at: _now(),
      ...data,
      evidence: Array.isArray(data.evidence) ? JSON.stringify(data.evidence) : (data.evidence || "[]"),
    },
    currentUser,
  );
  const created = await ncClient.entities.Insight.create(payload);
  _ffETL("insight");
  return created;
}

export async function acknowledgeInsight(id, currentUser) {
  const updated = await ncClient.entities.Insight.update(id, {
    status: "acknowledged",
    acknowledged_by: currentUser?.email,
    acknowledged_at: _now(),
  });
  _ffETL("insight");
  return updated;
}

export async function dismissInsight(id, currentUser) {
  const updated = await ncClient.entities.Insight.update(id, {
    status: "dismissed",
    dismissed_by:  currentUser?.email,
    dismissed_at:  _now(),
  });
  _ffETL("insight");
  return updated;
}

export async function resolveInsight(id, currentUser, notes) {
  const payload = { status: "resolved", resolved_by: currentUser?.email, resolved_at: _now() };
  if (notes) payload.resolution_notes = notes;
  const updated = await ncClient.entities.Insight.update(id, payload);
  _ffETL("insight");
  return updated;
}

export async function markInsightActioned(id, currentUser) {
  const updated = await ncClient.entities.Insight.update(id, {
    status: "actioned",
    actioned_by: currentUser?.email,
    actioned_at: _now(),
  });
  _ffETL("insight");
  return updated;
}

export async function listInsights(currentUser, filters = {}) {
  if (!currentUser) return [];
  const isSuperAdmin = currentUser.role === "super_admin";

  try {
    const params = new URLSearchParams({
      company_id: currentUser.company_id || "",
      ...filters,
    });
    const res = await fetch(`${RAILWAY_URL}/intelligence/insights?${params}`, {
      headers: await apiHeaders({ "Content-Type": undefined }),
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data?.insights) && data.insights.length > 0) return data.insights;
    }
  } catch (_) {}

  // Fallback to Base44 live
  try {
    if (isSuperAdmin) return ncClient.entities.Insight.list("-detected_at");
    return ncClient.entities.Insight.filter(
      { company_id: currentUser.company_id, ...filters },
      "-detected_at",
    );
  } catch (_) {
    return [];
  }
}

export async function listInsightsForEntity(entityType, entityId, currentUser) {
  return listInsights(currentUser, {
    subject_type: entityType,
    subject_id:   entityId,
  });
}

// ── Recommendation ─────────────────────────────────────────────────

/**
 * createRecommendation(data, currentUser)
 *
 * data shape:
 *  {
 *    insight_id,
 *    title, rationale,
 *    priority,          // low | medium | high | critical
 *    estimated_impact,
 *    confidence,        // 0–1
 *    action_type,       // create_task | adjust_price | contact_customer | restock | investigate | update_record
 *    action_payload,    // JSON with proposed field values
 *    assigned_to,
 *    due_date,
 *    source,
 *    approval_required, // bool
 *  }
 */
export async function createRecommendation(data, currentUser) {
  const payload = _scope(
    {
      status: "proposed",
      ...data,
      action_payload: data.action_payload
        ? (typeof data.action_payload === "string" ? data.action_payload : JSON.stringify(data.action_payload))
        : null,
    },
    currentUser,
  );
  const created = await ncClient.entities.Recommendation.create(payload);
  _ffETL("recommendation");
  return created;
}

export async function approveRecommendation(id, recommendation, currentUser, opts = {}) {
  const { notes, createTask } = opts;

  await ncClient.entities.Recommendation.update(id, {
    status:       "approved",
    approved_by:  currentUser?.email,
    approved_at:  _now(),
  });
  _ffETL("recommendation");

  const decision = await createDecision({
    recommendation_id: id,
    insight_id:        recommendation.insight_id,
    decision:          "approved",
    notes,
  }, currentUser);

  if (recommendation.status === "actioned") {
    await markInsightActioned(recommendation.insight_id, currentUser).catch(() => {});
  }

  let createdTask = null;
  if (createTask || recommendation.action_type === "create_task") {
    const payload = recommendation.action_payload
      ? (typeof recommendation.action_payload === "string"
          ? JSON.parse(recommendation.action_payload)
          : recommendation.action_payload)
      : {};
    createdTask = await dataService.createRecord("task", {
      title:        recommendation.title,
      task_type:    "follow_up",
      status:       "open",
      priority:     recommendation.priority || "medium",
      assigned_to:  recommendation.assigned_to,
      due_date:     recommendation.due_date,
      notes:        recommendation.rationale,
      source:       "recommendation",
      ...payload,
    }, currentUser, {});

    if (createdTask?.id) {
      await ncClient.entities.Recommendation.update(id, { created_task_id: createdTask.id }).catch(() => {});
    }
  }

  return { decision, createdTask };
}

export async function rejectRecommendation(id, recommendation, currentUser, reason) {
  await ncClient.entities.Recommendation.update(id, {
    status:           "rejected",
    rejected_by:      currentUser?.email,
    rejected_at:      _now(),
    rejection_reason: reason,
  });
  _ffETL("recommendation");

  const decision = await createDecision({
    recommendation_id: id,
    insight_id:        recommendation.insight_id,
    decision:          "rejected",
    rejection_reason:  reason,
  }, currentUser);

  return { decision };
}

export async function listRecommendations(currentUser, filters = {}) {
  if (!currentUser) return [];
  try {
    const params = new URLSearchParams({
      company_id: currentUser.company_id || "",
      ...filters,
    });
    const res = await fetch(`${RAILWAY_URL}/intelligence/recommendations?${params}`, {
      headers: await apiHeaders({ "Content-Type": undefined }),
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data?.recommendations) && data.recommendations.length > 0)
        return data.recommendations;
    }
  } catch (_) {}
  try {
    if (currentUser.role === "super_admin") return ncClient.entities.Recommendation.list("-created_date");
    return ncClient.entities.Recommendation.filter(
      { company_id: currentUser.company_id, ...filters },
      "-created_date",
    );
  } catch (_) {
    return [];
  }
}

// ── Decision ───────────────────────────────────────────────────────

export async function createDecision(data, currentUser) {
  const payload = _scope(
    {
      decided_at: _now(),
      ...data,
      modified_payload: data.modified_payload
        ? JSON.stringify(data.modified_payload)
        : null,
    },
    currentUser,
  );
  const created = await ncClient.entities.Decision.create(payload);
  _ffETL("decision");
  return created;
}

// ── Risk ───────────────────────────────────────────────────────────

export async function createRisk(data, currentUser) {
  const payload = _scope(
    {
      status:    "open",
      opened_at: _now(),
      ...data,
    },
    currentUser,
  );
  const created = await ncClient.entities.Risk.create(payload);
  _ffETL("risk");
  return created;
}

export async function updateRiskStatus(id, status, currentUser, notes) {
  const payload = { status };
  if (notes) payload.mitigation = notes;
  if (status === "resolved" || status === "closed") payload.resolved_at = _now();
  const updated = await ncClient.entities.Risk.update(id, payload);
  _ffETL("risk");
  return updated;
}

export async function listRisks(currentUser, filters = {}) {
  if (!currentUser) return [];
  try {
    const params = new URLSearchParams({ company_id: currentUser.company_id || "", ...filters });
    const res = await fetch(`${RAILWAY_URL}/intelligence/risks?${params}`, {
      headers: await apiHeaders({ "Content-Type": undefined }),
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data?.risks) && data.risks.length > 0) return data.risks;
    }
  } catch (_) {}
  try {
    if (currentUser.role === "super_admin") return ncClient.entities.Risk.list("-opened_at");
    return ncClient.entities.Risk.filter(
      { company_id: currentUser.company_id, ...filters }, "-opened_at",
    );
  } catch (_) { return []; }
}

// ── Opportunity ────────────────────────────────────────────────────

export async function createOpportunity(data, currentUser) {
  const payload = _scope(
    {
      status: "identified",
      ...data,
      supporting_evidence: data.supporting_evidence
        ? JSON.stringify(data.supporting_evidence)
        : null,
    },
    currentUser,
  );
  const created = await ncClient.entities.Opportunity.create(payload);
  _ffETL("opportunity");
  return created;
}

export async function updateOpportunityStatus(id, status, currentUser, opts = {}) {
  const payload = { status, ...opts };
  if (status === "won" || status === "lost") payload.closed_at = _now();
  const updated = await ncClient.entities.Opportunity.update(id, payload);
  _ffETL("opportunity");
  return updated;
}

export async function listOpportunities(currentUser, filters = {}) {
  if (!currentUser) return [];
  try {
    const params = new URLSearchParams({ company_id: currentUser.company_id || "", ...filters });
    const res = await fetch(`${RAILWAY_URL}/intelligence/opportunities?${params}`, {
      headers: await apiHeaders({ "Content-Type": undefined }),
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data?.opportunities) && data.opportunities.length > 0)
        return data.opportunities;
    }
  } catch (_) {}
  try {
    if (currentUser.role === "super_admin") return ncClient.entities.Opportunity.list("-created_date");
    return ncClient.entities.Opportunity.filter(
      { company_id: currentUser.company_id, ...filters }, "-created_date",
    );
  } catch (_) { return []; }
}

// ── Structured insight writers (called by ML, agents, reports) ─────

/**
 * createInsightFromMLOutput(modelName, modelVersion, entityType, entityId, entityName, output, currentUser)
 *
 * Standard interface for ML models writing insights.
 * output should include: { insight_type, severity, confidence, title, body, evidence[] }
 */
export async function createInsightFromMLOutput(
  modelName,
  modelVersion,
  entityType,
  entityId,
  entityName,
  output,
  currentUser,
) {
  const insight = await createInsight(
    {
      subject_type:  entityType,
      subject_id:    entityId,
      subject_name:  entityName,
      insight_type:  output.insight_type || "forecast",
      title:         output.title,
      body:          output.body || output.summary,
      severity:      output.severity || "medium",
      confidence:    output.confidence ?? 0.7,
      source:        "ml_model",
      source_run_id: modelVersion ? `${modelName}_${modelVersion}` : modelName,
      evidence:      output.evidence || [],
      model_version: modelVersion,
    },
    currentUser,
  );

  if (output.recommendation) {
    await createRecommendation(
      {
        insight_id:     insight.id,
        title:          output.recommendation.title || output.title,
        rationale:      output.recommendation.rationale || output.body,
        priority:       output.recommendation.priority || output.severity || "medium",
        action_type:    output.recommendation.action_type || "investigate",
        action_payload: output.recommendation.action_payload,
        source:         modelName,
      },
      currentUser,
    );
  }

  if (output.insight_type === "risk" || output.severity === "high" || output.severity === "critical") {
    await createRisk(
      {
        subject_type: entityType,
        subject_id:   entityId,
        category:     output.risk_category || "operational",
        severity:     output.severity || "medium",
        likelihood:   output.likelihood || "medium",
        title:        output.title,
        description:  output.body || output.summary,
        source:       "ml_model",
        insight_id:   insight.id,
      },
      currentUser,
    ).catch(() => {});
  }

  if (output.insight_type === "opportunity") {
    await createOpportunity(
      {
        subject_type:       entityType,
        subject_id:         entityId,
        type:               output.opportunity_type || "growth",
        title:              output.title,
        description:        output.body || output.summary,
        estimated_value:    output.estimated_value,
        confidence:         output.confidence ?? 0.7,
        supporting_evidence: output.evidence || [],
        source:             "ml_model",
        insight_id:         insight.id,
      },
      currentUser,
    ).catch(() => {});
  }

  return insight;
}

/**
 * createInsightFromAgentRun(agentName, runId, findings, currentUser)
 *
 * Standard interface for agents writing insights.
 * findings: array of { type, title, body, severity, confidence, evidence[], recommendation }
 */
export async function createInsightFromAgentRun(agentName, runId, findings, currentUser) {
  const created = [];
  for (const finding of (findings || [])) {
    try {
      const insight = await createInsight(
        {
          insight_type:  finding.type || "trend",
          title:         finding.title,
          body:          finding.body || finding.detail || finding.summary,
          severity:      finding.severity || "medium",
          confidence:    finding.confidence ?? 0.75,
          source:        "agent",
          source_run_id: runId,
          evidence:      finding.evidence || [],
        },
        currentUser,
      );
      created.push(insight);

      if (finding.recommendation) {
        await createRecommendation(
          {
            insight_id:     insight.id,
            title:          finding.recommendation.title || finding.title,
            rationale:      finding.recommendation.rationale || finding.body,
            priority:       finding.recommendation.priority || finding.severity || "medium",
            action_type:    finding.recommendation.action_type || "investigate",
            action_payload: finding.recommendation.action_payload,
            source:         agentName,
            approval_required: true,
          },
          currentUser,
        ).catch(() => {});
      }

      if (finding.type === "risk" || finding.severity === "high" || finding.severity === "critical") {
        await createRisk(
          {
            category:     finding.risk_category || "operational",
            severity:     finding.severity || "medium",
            likelihood:   finding.likelihood || "medium",
            title:        finding.title,
            description:  finding.body || finding.detail,
            source:       agentName,
            insight_id:   insight.id,
          },
          currentUser,
        ).catch(() => {});
      }

      if (finding.type === "opportunity") {
        await createOpportunity(
          {
            type:           finding.opportunity_type || "growth",
            title:          finding.title,
            description:    finding.body || finding.detail,
            estimated_value: finding.estimated_value,
            confidence:     finding.confidence ?? 0.75,
            supporting_evidence: finding.evidence || [],
            source:         agentName,
            insight_id:     insight.id,
          },
          currentUser,
        ).catch(() => {});
      }
    } catch (_) {}
  }
  return created;
}

/**
 * createInsightFromReport(reportName, metric, data, currentUser)
 *
 * Standard interface for report/chart-driven insights.
 */
export async function createInsightFromReport(reportName, metric, data, currentUser) {
  return createInsight(
    {
      insight_type:  data.insight_type || "trend",
      title:         data.title,
      body:          data.body || data.summary,
      severity:      data.severity || "medium",
      confidence:    data.confidence ?? 0.85,
      source:        "report",
      source_run_id: reportName,
      evidence: [
        {
          type:               "internal_metric",
          source:             reportName,
          label:              metric,
          value:              data.value,
          comparison_value:   data.comparison_value,
          comparison_period:  data.comparison_period,
          confidence:         data.confidence ?? 0.85,
        },
      ],
    },
    currentUser,
  );
}

// ── Evidence helpers ───────────────────────────────────────────────

export function evidenceItem(type, source, label, value, extra = {}) {
  return { type, source, label, value, observed_at: _now(), ...extra };
}

export function internalMetricEvidence(source, label, value, comparisonValue, period) {
  return evidenceItem("internal_metric", source, label, value, {
    comparison_value:  comparisonValue,
    comparison_period: period,
  });
}

export function externalApiEvidence(source, label, value, sourceUrl) {
  return evidenceItem("external_api", source, label, value, { source_url: sourceUrl });
}

export function mlFeatureEvidence(modelName, feature, value, importance) {
  return evidenceItem("ml_feature", modelName, feature, value, { feature_importance: importance });
}

// ── Default export ─────────────────────────────────────────────────

const intelligenceService = {
  createInsight,
  acknowledgeInsight,
  dismissInsight,
  resolveInsight,
  markInsightActioned,
  listInsights,
  listInsightsForEntity,

  createRecommendation,
  approveRecommendation,
  rejectRecommendation,
  listRecommendations,

  createDecision,

  createRisk,
  updateRiskStatus,
  listRisks,

  createOpportunity,
  updateOpportunityStatus,
  listOpportunities,

  createInsightFromMLOutput,
  createInsightFromAgentRun,
  createInsightFromReport,

  evidenceItem,
  internalMetricEvidence,
  externalApiEvidence,
  mlFeatureEvidence,
};

export default intelligenceService;
