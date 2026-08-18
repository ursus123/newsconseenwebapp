export const INTELLIGENCE_ITEM_CONTRACT = "intelligence-item.v1";
export const INTELLIGENCE_INBOX_CONTRACT = "intelligence-inbox.v1";

export const INTELLIGENCE_SOURCE_CLASSES = Object.freeze([
  "deterministic_rule",
  "analytical_calculation",
  "machine_learning_model",
  "governed_agent",
  "external_observation",
  "data_quality_detector",
  "idjwi_core_reasoning",
  "tenant_llm_advisor",
  "human_operator_report",
]);

export const INTELLIGENCE_ASSERTION_CLASSES = Object.freeze([
  "observed_fact",
  "deterministic_finding",
  "analytical_finding",
  "predictive_finding",
  "external_finding",
  "operator_report",
  "advisor_proposal",
  "idjwi_validated_finding",
]);

const SOURCE_ALIASES = Object.freeze({
  rule: "deterministic_rule", rules: "deterministic_rule",
  analytics: "analytical_calculation", analysis: "analytical_calculation", report: "analytical_calculation",
  ml: "machine_learning_model", ml_model: "machine_learning_model", forecast: "machine_learning_model",
  agent: "governed_agent", external: "external_observation", enrichment_api: "external_observation",
  data_quality: "data_quality_detector", graph_quality: "data_quality_detector",
  idjwi: "idjwi_core_reasoning", idjwi_core: "idjwi_core_reasoning", ai: "idjwi_core_reasoning",
  advisor: "tenant_llm_advisor", llm: "tenant_llm_advisor",
  manual: "human_operator_report", operator: "human_operator_report", human: "human_operator_report",
});

const SOURCE_ASSERTION = Object.freeze({
  deterministic_rule: ["deterministic_finding", "derived"],
  analytical_calculation: ["analytical_finding", "derived"],
  machine_learning_model: ["predictive_finding", "derived"],
  governed_agent: ["analytical_finding", "derived"],
  external_observation: ["external_finding", "evidence"],
  data_quality_detector: ["deterministic_finding", "derived"],
  idjwi_core_reasoning: ["idjwi_validated_finding", "derived"],
  tenant_llm_advisor: ["advisor_proposal", "proposal"],
  human_operator_report: ["operator_report", "operator"],
});

const safeEvidence = (value) => {
  let items = value;
  if (typeof value === "string") {
    try { items = JSON.parse(value); } catch { items = []; }
  }
  return (Array.isArray(items) ? items : []).filter(item => item && typeof item === "object").map((item, index) => ({
    id: String(item.id || item.record_id || `evidence-${index}`),
    type: String(item.type || "record"),
    label: item.label || item.summary || null,
    source: item.source || null,
    observed_at: item.observed_at || item.created_at || null,
  }));
};

function sourceFor(record = {}) {
  const raw = String(record.source_type || record.source || "idjwi_core").toLowerCase().replaceAll("-", "_");
  const type = SOURCE_ALIASES[raw] || "idjwi_core_reasoning";
  const [assertion_class, authority] = SOURCE_ASSERTION[type];
  return {
    type,
    id: String(record.source_id || record.source_run_id || record.model_id || record.rule_id || raw),
    label: record.source_label || record.source || null,
    assertion_class,
    authority,
    model_version: record.model_version || null,
  };
}

export function projectLegacyIntelligenceItem(record = {}, objectType, tenantId) {
  const source = sourceFor(record);
  const intelligenceType = objectType === "insight"
    ? (record.insight_type === "forecast" ? "prediction" : "finding")
    : objectType;
  const evidence = safeEvidence(record.evidence);
  const id = `${objectType}:${record.id || "unknown"}`;
  const advisorContribution = source.type === "tenant_llm_advisor" && Boolean(record.advisor_contribution_proven);
  return {
    contract: INTELLIGENCE_ITEM_CONTRACT,
    id,
    tenant_id: tenantId,
    organization_id: record.organization_id || tenantId,
    operational_unit_id: record.operational_unit_id || null,
    affected_scope: { type: record.subject_id ? "record" : "organization" },
    intelligence_type: intelligenceType,
    subtype: record.insight_type || record.category || record.type || record.action_type || null,
    title: record.title || record.name || "Untitled finding",
    explanation: record.plain_language_explanation || record.body || record.description || record.rationale || "No explanation supplied.",
    severity: record.severity || "medium",
    priority: record.priority || record.severity || "medium",
    operational_impact: record.operational_impact || record.estimated_impact || record.business_consequence || record.mitigation || null,
    source,
    evidence,
    provenance: {},
    confidence: typeof record.confidence === "number" ? record.confidence : null,
    uncertainty: record.uncertainty || record.confidence_explanation || null,
    freshness: { observed_at: record.detected_at || record.created_at || null, stale: Boolean(record.stale) },
    expires_at: record.expires_at || null,
    status: record.status || "new",
    lifecycle: { detected_at: record.detected_at || record.created_at || null },
    owner: null,
    eligible_actors: [],
    required_permissions: intelligenceType === "recommendation" ? ["intelligence.read", "intelligence.decide"] : ["intelligence.read"],
    permitted_actions: [{ action: "read", permission: "intelligence.read", allowed: true }],
    recommended_next_action: { type: record.action_type || "investigate", explanation: record.recommended_next_action || record.mitigation || record.rationale || null, approval_required: Boolean(record.approval_required || intelligenceType === "recommendation") },
    approval: { required: Boolean(record.approval_required || intelligenceType === "recommendation") },
    related_records: [], graph_relationships: [],
    idjwi_context: { contract: INTELLIGENCE_ITEM_CONTRACT, item_id: id, tenant_id: tenantId, source_type: source.type, assertion_class: source.assertion_class, evidence_ids: evidence.map(item => item.id) },
    advisor: { state: source.type === "tenant_llm_advisor" ? (advisorContribution ? "consulted" : "requested") : "not_requested", advisor_ids: source.type === "tenant_llm_advisor" ? [source.id] : [], contribution_proven: advisorContribution },
    contradictions: [], outcome_history: [], resolution_history: [],
    audit_context: { contract: INTELLIGENCE_ITEM_CONTRACT, item_id: id, tenant_id: tenantId, event_type: "intelligence.item.projected" },
  };
}

export function assertIntelligenceItem(item) {
  if (item?.contract !== INTELLIGENCE_ITEM_CONTRACT) throw new Error("Unsupported intelligence item contract");
  if (!item.id || !item.tenant_id || !item.title || !item.source) throw new Error("Incomplete intelligence item contract");
  if (!INTELLIGENCE_SOURCE_CLASSES.includes(item.source.type)) throw new Error("Unsupported intelligence source class");
  if (!INTELLIGENCE_ASSERTION_CLASSES.includes(item.source.assertion_class)) throw new Error("Unsupported intelligence assertion class");
  if (item.source.type === "tenant_llm_advisor" && item.source.assertion_class !== "advisor_proposal") throw new Error("Advisor output must remain a proposal");
  return item;
}

export function normalizeIntelligenceEnvelope(payload = {}, tenantId) {
  if (payload.contract === INTELLIGENCE_INBOX_CONTRACT && Array.isArray(payload.items)) {
    return { ...payload, items: payload.items.map(assertIntelligenceItem) };
  }
  const collections = {
    insight: payload.insights || [], risk: payload.risks || [],
    opportunity: payload.opportunities || [], recommendation: payload.recommendations || [],
  };
  const items = Object.entries(collections).flatMap(([type, records]) =>
    records.map(record => projectLegacyIntelligenceItem(record, type, tenantId)).map(assertIntelligenceItem));
  return {
    contract: INTELLIGENCE_INBOX_CONTRACT,
    item_contract: INTELLIGENCE_ITEM_CONTRACT,
    tenant_id: tenantId,
    organization_id: tenantId,
    items,
    state: items.length ? "available" : "empty",
    summary: payload.summary || {},
    idjwi_context: { contract: INTELLIGENCE_INBOX_CONTRACT, item_ids: items.map(item => item.id), tenant_id: tenantId },
    audit_context: { contract: INTELLIGENCE_INBOX_CONTRACT, item_ids: items.map(item => item.id), tenant_id: tenantId, event_type: "intelligence.inbox.read" },
    authorization: { policy_version: "intelligence-policy.v1", role: "unknown", scope: { type: "organization", id: tenantId }, permissions: ["intelligence.read"] },
    delivery: { mode: "authorized_pull", realtime_enabled: false, reason: "Direct table broadcasts are prohibited." },
  };
}

export function legacyCollectionsFromItems(items = []) {
  const collections = { insights: [], risks: [], opportunities: [], recommendations: [] };
  items.forEach(item => {
    const base = {
      id: item.id.split(":").slice(1).join(":"), title: item.title, status: item.status,
      severity: item.severity, priority: item.priority, confidence: item.confidence,
      source: item.source.label || item.source.type, source_type: item.source.type,
      assertion_class: item.source.assertion_class, evidence: item.evidence,
      detected_at: item.lifecycle?.detected_at, expires_at: item.expires_at,
      operational_impact: item.operational_impact, contract_item: item,
    };
    if (item.intelligence_type === "finding" || item.intelligence_type === "prediction") {
      collections.insights.push({ ...base, body: item.explanation, insight_type: item.subtype || item.intelligence_type });
    } else if (item.intelligence_type === "risk") {
      collections.risks.push({ ...base, description: item.explanation, category: item.subtype, mitigation: item.recommended_next_action?.explanation });
    } else if (item.intelligence_type === "opportunity") {
      collections.opportunities.push({ ...base, description: item.explanation, type: item.subtype, estimated_value: item.operational_impact });
    } else if (item.intelligence_type === "recommendation") {
      collections.recommendations.push({ ...base, rationale: item.explanation, action_type: item.recommended_next_action?.type, approval_required: item.approval?.required, estimated_impact: item.operational_impact });
    }
  });
  return collections;
}
