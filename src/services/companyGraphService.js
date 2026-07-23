/**
 * companyGraphService.js
 *
 * Frontend adapter for the versioned governed Company Graph contract.
 * The local builder is a compatibility fallback and emits the same safe summary
 * shape; it must never use complete canonical rows as graph-node transport.
 *
 * Returns: { nodes, edges }
 *
 * Node: { id, entity_type, entity_id, label, sublabel, group, importance,
 *         risk_level, has_opportunity, is_unconnected, metadata }
 *
 * Edge: { id, source, target, relationship_type, strength, label }
 */

export const NODE_COLORS = {
  enterprise:     "#6366f1",   // indigo
  person:         "#3b82f6",   // blue
  product:        "#10b981",   // emerald
  service:        "#059669",   // green
  transaction:    "#f59e0b",   // amber
  task:           "#f97316",   // orange
  address:        "#14b8a6",   // teal
  territory:      "#0d9488",   // dark teal
  risk:           "#ef4444",   // red
  opportunity:    "#22c55e",   // green
  insight:        "#a855f7",   // purple
  recommendation: "#fb923c",   // light orange
  decision:       "#2563eb",
  action:         "#dc2626",
  operational_unit: "#4f46e5",
  observation:    "#7c3aed",
  external_observation: "#7c3aed",
  quality_cluster: "#475569",
};

export const GRAPH_CONTRACT_VERSION = "company-graph.v1";
export const GRAPH_INTENT_VERSION = "company-graph-intents.v1";
export const IDJWI_GRAPH_INTENTS = Object.freeze({
  EXPLAIN_COMPANY_GRAPH: "explain_company_graph",
  EXPLAIN_OPERATIONAL_UNIT: "explain_operational_unit",
  EXPLAIN_NODE: "explain_node",
  EXPLAIN_RELATIONSHIP: "explain_relationship",
  EXPLAIN_GRAPH_CHANGE: "explain_graph_change",
  FIND_GRAPH_GAPS: "find_graph_gaps",
  RECOMMEND_GRAPH_ACTION: "recommend_graph_action",
  COMPARE_GRAPH_SCOPES: "compare_graph_scopes",
});

export const GRAPH_FIELD_CLASSIFICATION = {
  enterprise: { graph_safe: ["enterprise_name", "name", "enterprise_type", "enterprise_tier", "operating_status", "status", "city", "region", "country"], role_restricted: ["parent_enterprise_id"] },
  operational_unit: { graph_safe: ["name", "unit_name", "unit_type", "status"], role_restricted: ["parent_unit_id", "manager_display_name"] },
  person: { graph_safe: ["person_type", "person_subtype", "status", "availability_status", "engagement_model"], role_restricted: ["first_name", "last_name", "preferred_name", "full_name", "primary_role", "start_date", "end_date"] },
  task: { graph_safe: ["title", "task_name", "task_type", "status", "priority", "due_date", "scheduled_date", "outcome"], role_restricted: ["assigned_to_name", "completed_at", "outcome_reason"] },
  transaction: { graph_safe: ["transaction_type", "status", "payment_status", "transaction_date", "date", "due_date", "currency"], role_restricted: ["reference_number", "description"] },
  product: { graph_safe: ["product_name", "item_name", "name", "item_type", "item_class", "unit_of_measure", "status", "stock_quantity", "reorder_level", "expiry_date"], role_restricted: ["sku", "supplier_display_name"] },
  service: { graph_safe: ["name", "service_name", "service_type", "status", "is_active"], role_restricted: ["service_code", "delivery_owner"] },
  relationship: { graph_safe: ["relationship_type", "status", "start_date", "end_date"], role_restricted: ["role"] },
  address: { graph_safe: ["address_type", "city", "region", "state", "country", "is_primary"], role_restricted: ["postal_code"] },
  document: { graph_safe: ["title", "document_type", "status", "issue_date", "expiry_date"], role_restricted: ["document_number", "issuer"] },
  schedule: { graph_safe: ["name", "title", "schedule_type", "frequency", "status", "is_active", "start_date", "end_date"], role_restricted: ["timezone", "owner_display_name"] },
  risk: { graph_safe: ["title", "risk_type", "status", "severity", "likelihood", "impact"], role_restricted: ["owner_display_name", "mitigation_status"] },
  opportunity: { graph_safe: ["title", "opportunity_type", "status", "confidence"], role_restricted: ["owner_display_name", "stage"] },
  recommendation: { graph_safe: ["title", "recommendation_type", "priority", "status", "is_actioned", "is_dismissed"], role_restricted: ["owner_display_name", "review_due_at"] },
  decision: { graph_safe: ["title", "decision_type", "status", "outcome", "decided_at"], role_restricted: ["decision", "decided_by_display_name"] },
  action: { graph_safe: ["title", "action_type", "action_label", "status", "priority", "risk_level", "created_at", "completed_at"], role_restricted: ["reasoning", "approval_status", "approved_at"] },
  external_observation: { graph_safe: ["observation_type", "status", "severity", "observed_at", "expires_at", "confidence"], role_restricted: ["source_name", "location_label", "summary"] },
  territory: { graph_safe: ["territory_type", "status"], role_restricted: [] },
  insight: { graph_safe: ["insight_type", "severity", "status"], role_restricted: [] },
};

function exposableFields(type) {
  const projectionType = type === "observation" ? "external_observation" : type;
  const definition = GRAPH_FIELD_CLASSIFICATION[projectionType] || { graph_safe: [], role_restricted: [] };
  return [...definition.graph_safe, ...definition.role_restricted];
}

function graphSafeAttributes(entity, type, includeRoleRestricted = false) {
  const projectionType = type === "observation" ? "external_observation" : type;
  const definition = GRAPH_FIELD_CLASSIFICATION[projectionType] || { graph_safe: [], role_restricted: [] };
  const fields = includeRoleRestricted ? exposableFields(type) : definition.graph_safe;
  return Object.fromEntries(fields
    .filter(field => entity[field] != null)
    .map(field => [field, entity[field]]));
}

export const GRAPH_MODES = {
  operational_focus:        { label: "Operational Focus",        types: ["operational_unit","enterprise","person","task","transaction","risk","recommendation","opportunity","decision","action","quality_cluster"] },
  organizational_structure: { label: "Organizational Structure", types: ["operational_unit","enterprise","person","address"] },
  operational_flow:         { label: "Operational Flow",         types: ["operational_unit","enterprise","task","transaction","product","service","action"] },
  responsibilities_work:    { label: "Responsibilities & Work",  types: ["operational_unit","person","task","schedule","action"] },
  customers_suppliers:      { label: "Customers & Suppliers",    types: ["enterprise","person","transaction","product","service"] },
  products_services:        { label: "Products & Services",      types: ["enterprise","product","service","transaction","recommendation"] },
  risks_opportunities:      { label: "Risks & Opportunities",    types: ["operational_unit","enterprise","person","risk","opportunity","recommendation"] },
  decisions_actions:        { label: "Decisions & Actions",      types: ["decision","recommendation","action","task","person","operational_unit"] },
  data_quality:             { label: "Data-quality Gaps",        types: null },
  external_disruptions:     { label: "External Disruptions",     types: ["external_observation","observation","territory","address","enterprise","operational_unit","risk","recommendation","action"] },
  full_graph:               { label: "Full Governed Graph",      types: null },
  company_structure:        { label: "Company Structure (legacy)", types: ["operational_unit","enterprise","person","address"] },
  operations_flow:          { label: "Operations Flow (legacy)",   types: ["enterprise","task","transaction","product","service"] },
  market_context:           { label: "Market Context (legacy)",    types: ["enterprise","address","territory","opportunity","insight"] },
  risk_action:              { label: "Risk & Action (legacy)",     types: ["enterprise","person","risk","recommendation","task","insight"] },
};

export const OPERATIONAL_FOCUS_NODE_BUDGET = 36;

const TYPE_OPERATIONAL_WEIGHT = {
  risk: 100, decision: 96, action: 94, recommendation: 92, task: 88,
  opportunity: 82, operational_unit: 78, enterprise: 72, person: 66,
  transaction: 60, product: 40, service: 40,
};

function isOpenOperationalNode(node) {
  return !["closed", "completed", "done", "inactive", "resolved", "dismissed", "rejected"]
    .includes(String(node.status || node.attributes?.status || "").toLowerCase());
}

export function buildOperationalFocus(nodes, edges, graphPacket, budget = OPERATIONAL_FOCUS_NODE_BUDGET) {
  const degree = new Map();
  edges.forEach(edge => {
    degree.set(edge.source, (degree.get(edge.source) || 0) + 1);
    degree.set(edge.target, (degree.get(edge.target) || 0) + 1);
  });
  const ranked = [...nodes].sort((a, b) => {
    const score = node => (
      (TYPE_OPERATIONAL_WEIGHT[node.entity_type] || 20)
      + (isOpenOperationalNode(node) ? 10 : 0)
      + (["critical", "high"].includes(String(node.risk_level || node.attributes?.severity || "").toLowerCase()) ? 40 : 0)
      + Math.min(20, (degree.get(node.id) || 0) * 2)
      + Math.round((node.importance || 0) * 10)
    );
    return score(b) - score(a) || a.id.localeCompare(b.id);
  });
  const visible = ranked.slice(0, Math.max(1, budget));
  const visibleIds = new Set(visible.map(node => node.id));
  const visibleEdges = edges.filter(edge => visibleIds.has(edge.source) && visibleIds.has(edge.target));
  const omitted = Math.max(0, Number(graphPacket?.truncation?.omitted_nodes || 0) + Math.max(0, nodes.length - visible.length));
  const disconnected = Number(graphPacket?.quality?.unconnected_count || 0);
  if (omitted > 0 || disconnected > 4) {
    visible.push({
      id: "quality_cluster:bounded-overview", entity_type: "quality_cluster", entity_id: "bounded-overview",
      label: `${Math.max(omitted, disconnected)} records summarized`,
      sublabel: "Data-quality and lower-priority records",
      status: graphPacket?.completeness?.state || "partial", importance: 0.35,
      risk_level: graphPacket?.completeness?.state === "complete" ? null : "medium",
      is_unconnected: true, presentation_only: true,
      attributes: {
        omitted_records: omitted, disconnected_records: disconnected,
        explanation: "This presentation cluster summarizes governed records omitted from the bounded operational overview.",
      },
      permitted_actions: [],
    });
  }
  return { nodes: visible, edges: visibleEdges };
}

function stableHash(value) {
  let hash = 2166136261;
  for (const char of String(value)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

const MODE_LANES = {
  organizational_structure: [["operational_unit"], ["enterprise"], ["person"], ["address"]],
  company_structure: [["operational_unit"], ["enterprise"], ["person"], ["address"]],
  operational_flow: [["operational_unit","enterprise"], ["product","service"], ["task","action"], ["transaction"]],
  operations_flow: [["enterprise"], ["product","service"], ["task"], ["transaction"]],
  responsibilities_work: [["operational_unit"], ["person"], ["task","schedule"], ["action"]],
  customers_suppliers: [["enterprise"], ["person"], ["product","service"], ["transaction"]],
  products_services: [["enterprise"], ["product","service"], ["transaction"], ["recommendation"]],
  risks_opportunities: [["operational_unit","enterprise","person"], ["risk"], ["opportunity"], ["recommendation"]],
  decisions_actions: [["recommendation"], ["decision"], ["action"], ["task","person"]],
  data_quality: [["quality_cluster"], ["operational_unit","enterprise"], ["person","product","service"], ["task","transaction","address"]],
  external_disruptions: [["external_observation","observation"], ["territory","address"], ["enterprise","operational_unit"], ["risk","recommendation","action"]],
  operational_focus: [["operational_unit","enterprise"], ["risk","opportunity"], ["person","task"], ["recommendation","decision","action","transaction"], ["quality_cluster"]],
};

export function semanticPositions(nodes, mode = "operational_focus") {
  const lanes = MODE_LANES[mode] || MODE_LANES.operational_focus;
  const laneFor = type => {
    const lane = lanes.findIndex(types => types.includes(type));
    return lane < 0 ? lanes.length : lane;
  };
  return Object.fromEntries(nodes.map(node => {
    const hash = stableHash(`${mode}:${node.id}`);
    return [node.id, {
      x: 130 + laneFor(node.entity_type) * 245 + (Math.floor(hash / 11) % 5) * 18,
      y: 90 + (hash % 11) * 92 + ((hash >>> 8) % 31),
    }];
  }));
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function nodeId(type, id) { return `${type}:${id}`; }

function safeStr(v) { return (v == null || v === "" || v === "null") ? null : String(v); }

function labelFor(entity, type) {
  switch (type) {
    case "enterprise":     return safeStr(entity.enterprise_name) || safeStr(entity.name) || "Enterprise";
    case "person":         return "Person";
    case "product":        return safeStr(entity.item_name) || safeStr(entity.name) || "Product";
    case "service":        return safeStr(entity.name) || safeStr(entity.service_name) || "Service";
    case "task":           return safeStr(entity.title) || safeStr(entity.task_name) || "Task";
    case "transaction":    return "Transaction";
    case "address":        return safeStr(entity.city) || safeStr(entity.country) || "Address";
    case "territory":      return safeStr(entity.name) || safeStr(entity.territory_name) || "Territory";
    case "insight":        return safeStr(entity.title) || "Insight";
    case "risk":           return safeStr(entity.title) || "Risk";
    case "opportunity":    return safeStr(entity.title) || "Opportunity";
    case "recommendation": return safeStr(entity.title) || "Recommendation";
    case "decision":       return safeStr(entity.title) || "Decision";
    case "action":         return safeStr(entity.title) || safeStr(entity.action_label) || "Action";
    case "external_observation": return safeStr(entity.observation_type) || "External observation";
    case "operational_unit": return safeStr(entity.unit_name) || safeStr(entity.name) || "Operational unit";
    default:               return safeStr(entity.name) || safeStr(entity.id) || type;
  }
}

function sublabelFor(entity, type) {
  switch (type) {
    case "enterprise":  return safeStr(entity.enterprise_type) || safeStr(entity.status);
    case "person":      return safeStr(entity.person_type) || safeStr(entity.status);
    case "product":     return safeStr(entity.item_type);
    case "task":        return safeStr(entity.status);
    case "transaction": return safeStr(entity.transaction_type);
    case "address":     return safeStr(entity.city) || safeStr(entity.country);
    case "insight":     return safeStr(entity.insight_type) || safeStr(entity.severity);
    case "risk":        return safeStr(entity.severity);
    case "opportunity": return safeStr(entity.potential_value) ? `$${entity.potential_value}` : null;
    default:            return null;
  }
}

// ── Importance scoring ────────────────────────────────────────────────────────

function scoreImportance(entityId, entityType, { relationships, tasks, transactions, risks, insights, opportunities }) {
  const relCount  = relationships.filter(r =>
    r.enterprise_id === entityId || r.person_id === entityId ||
    r.item_id === entityId        || r.linked_entity_id === entityId
  ).length;

  const txCount   = transactions.filter(t =>
    t.enterprise_id === entityId || t.primary_person_id === entityId || t.person_id === entityId
  ).length;

  const taskCount = tasks.filter(t =>
    (t.enterprise_id === entityId || t.person_id === entityId || t.assigned_to_id === entityId) &&
    t.status !== "completed"
  ).length;

  const riskCount = risks.filter(r => r.subject_id === entityId).length;
  const insiCount = insights.filter(i => i.subject_id === entityId).length;
  const oppoCount = opportunities.filter(o => o.subject_id === entityId).length;

  const relScore  = Math.min(1, relCount  / 10);
  const txScore   = Math.min(1, txCount   / 20);
  const taskScore = Math.min(1, taskCount / 5);
  const riskScore = Math.min(1, riskCount / 3);
  const intelScore = Math.min(1, (insiCount + oppoCount) / 5);

  return Math.max(0.05,
    relScore  * 0.25 +
    txScore   * 0.25 +
    taskScore * 0.15 +
    riskScore * 0.20 +
    intelScore * 0.15,
  );
}

// ── Node builder ─────────────────────────────────────────────────────────────

function buildNodes(entities) {
  const {
    enterprises = [], people = [], products = [], services = [], tasks = [],
    transactions = [], addresses = [], territories = [],
    insights = [], risks = [], opportunities = [], recommendations = [],
    relationships = [],
  } = entities;

  const nodeMap = {};
  const all = [];

  const add = (type, entity, extra = {}) => {
    const id = nodeId(type, entity.id);
    if (nodeMap[id]) return;
    const imp = extra.importance ?? scoreImportance(
      entity.id, type,
      { relationships, tasks, transactions, risks, insights, opportunities }
    );
    const hasRisk = risks.some(r => r.subject_id === entity.id && r.status !== "closed");
    const hasOpp  = opportunities.some(o => o.subject_id === entity.id && o.status === "open");

    const node = {
      id,
      entity_type:    type,
      entity_id:      entity.id,
      label:          labelFor(entity, type),
      sublabel:       sublabelFor(entity, type),
      group:          type,
      importance:     imp,
      risk_level:     hasRisk ? (risks.find(r => r.subject_id === entity.id)?.severity || "medium") : null,
      has_opportunity: hasOpp,
      is_unconnected: false,  // updated below
      status:         entity.status || entity.operating_status || null,
      sensitivity:    "internal",
      attributes:     graphSafeAttributes(entity, type),
      permitted_actions: [
        { action: "inspect", allowed: true, requires_approval: false },
        { action: "ask_idjwi", allowed: true, requires_approval: false },
      ],
    };
    nodeMap[id] = node;
    all.push(node);
  };

  // Core entities — cap counts for performance
  enterprises.slice(0, 80).forEach(e => add("enterprise",     e));
  people.slice(0, 150).forEach(p     => add("person",         p));
  products.slice(0, 80).forEach(p    => add("product",        p));
  services.slice(0, 50).forEach(s    => add("service",        s));
  tasks.slice(0, 100).forEach(t      => add("task",           t));
  transactions.slice(0, 80).forEach(t => add("transaction",   t));
  addresses.slice(0, 50).forEach(a   => add("address",        a));
  territories.slice(0, 30).forEach(t => add("territory",      t));

  // Intelligence layer
  insights.slice(0, 50).forEach(i         => add("insight",        i));
  risks.slice(0, 40).forEach(r            => add("risk",           r));
  opportunities.slice(0, 40).forEach(o   => add("opportunity",     o));
  recommendations.slice(0, 30).forEach(r => add("recommendation",  r));

  return { nodeMap, all };
}

// ── Edge builder ─────────────────────────────────────────────────────────────

function buildEdges(entities, nodeMap) {
  const {
    relationships = [], tasks = [], transactions = [],
    addresses = [], insights = [], risks = [], opportunities = [], recommendations = [],
  } = entities;

  const edges = [];
  const seen  = new Set();

  const addEdge = (sourceId, targetId, relType, strength = 0.5, label = "", evidence = {}) => {
    if (!nodeMap[sourceId] || !nodeMap[targetId]) return;
    if (sourceId === targetId) return;
    const key = [sourceId, targetId, relType].sort().join("|");
    if (seen.has(key)) return;
    seen.add(key);
    edges.push({
      id:                `edge:${edges.length}`,
      source:            sourceId,
      target:            targetId,
      relationship_type: relType,
      predicate:         relType,
      strength,
      label:             label || relType.replaceAll("_", " "),
      assertion_class:   evidence.assertion_class || "canonical_reference_projection",
      status:            evidence.status || "active",
      temporal: {
        status: evidence.status || "active",
        valid_from: evidence.valid_from || null,
        valid_to: evidence.valid_to || null,
        observed_at: evidence.observed_at || null,
        expires_at: evidence.expires_at || null,
      },
      confidence:        evidence.confidence ?? 1,
      verification_state: evidence.verification_state || "verified",
      permitted_actions: [
        { action: "inspect_evidence", allowed: true, requires_approval: false },
        { action: "ask_idjwi", allowed: true, requires_approval: false },
      ],
      evidence: [{
        evidence_id:     `${evidence.source_table || "frontend-projection"}:${String(evidence.source_record_id || "")}`,
        source_zone:      evidence.source_zone || "analytics",
        source_table:     evidence.source_table || "frontend projection",
        source_record_id: String(evidence.source_record_id || ""),
        assertion_class:  evidence.assertion_class || "canonical_reference_projection",
        explanation:      evidence.explanation || `Newsconseen derived this ${relType.replaceAll("_", " ")} connection from canonical record references.`,
        derivation_rule:  evidence.derivation_rule || null,
      }],
    });
  };

  // ── Relationship records ──────────────────────────────────────────────────
  relationships.forEach(rel => {
    const src = rel.enterprise_id || rel.enterprise_name;
    const tgt = rel.person_id     || rel.person_name;
    const srcId = rel.enterprise_id ? nodeId("enterprise", rel.enterprise_id) : null;
    const tgtId = rel.person_id     ? nodeId("person",     rel.person_id)     : null;
    if (srcId && tgtId) {
      addEdge(srcId, tgtId, rel.relationship_type || "relates_to", 0.7, rel.relationship_type || "", {
        source_zone: "canonical", source_table: "public.relationships",
        source_record_id: rel.id, assertion_class: "canonical_relationship", confidence: 1,
        status: rel.status, valid_from: rel.start_date, valid_to: rel.end_date,
        explanation: `A tenant-governed relationship record states this ${String(rel.relationship_type || "relationship").replaceAll("_", " ")} connection.`,
      });
    }
    // Item relationships
    if (rel.enterprise_id && rel.item_id) {
      addEdge(nodeId("enterprise", rel.enterprise_id), nodeId("product", rel.item_id), rel.relationship_type || "uses", 0.5, "", {
        source_zone: "canonical", source_table: "public.relationships", source_record_id: rel.id,
        assertion_class: "canonical_relationship", confidence: 1, status: rel.status,
      });
    }
  });

  // ── Task connections ──────────────────────────────────────────────────────
  tasks.forEach(task => {
    const entId = task.enterprise_id;
    const perId = task.assigned_to_id || task.person_id;
    if (entId) addEdge(nodeId("task", task.id), nodeId("enterprise", entId), "belongs_to", 0.6, "");
    if (perId) addEdge(nodeId("task", task.id), nodeId("person",     perId), "assigned_to", 0.8, "assigned to");
  });

  // ── Transaction connections ───────────────────────────────────────────────
  transactions.forEach(tx => {
    const entId = tx.enterprise_id;
    const perId = tx.primary_person_id || tx.person_id;
    const proId = tx.product_id;
    if (entId) addEdge(nodeId("transaction", tx.id), nodeId("enterprise",  entId), "involves",  0.7, "");
    if (perId) addEdge(nodeId("transaction", tx.id), nodeId("person",      perId), "from",      0.6, "");
    if (proId) addEdge(nodeId("transaction", tx.id), nodeId("product",     proId), "includes",  0.5, "");
  });

  // ── Address connections ───────────────────────────────────────────────────
  addresses.forEach(addr => {
    const entId = addr.enterprise_id || addr.linked_enterprise_id;
    const perId = addr.person_id     || addr.linked_person_id;
    if (entId) addEdge(nodeId("address", addr.id), nodeId("enterprise", entId), "located_at", 0.6, "at");
    if (perId) addEdge(nodeId("address", addr.id), nodeId("person",     perId), "lives_at",   0.4, "at");
  });

  // ── Intelligence connections ──────────────────────────────────────────────
  insights.forEach(ins => {
    const subjId = ins.subject_id;
    const subjType = ins.subject_type;
    if (subjId && subjType) {
      addEdge(nodeId("insight", ins.id), nodeId(subjType, subjId), "identifies", 0.7, "identifies");
    }
  });

  risks.forEach(risk => {
    const subjId = risk.subject_id;
    const subjType = risk.subject_type;
    if (subjId && subjType) {
      addEdge(nodeId("risk", risk.id), nodeId(subjType, subjId), "threatens", 0.8, "threatens");
    }
    if (risk.insight_id) {
      addEdge(nodeId("insight", risk.insight_id), nodeId("risk", risk.id), "flags_risk", 0.7, "flags");
    }
  });

  opportunities.forEach(opp => {
    const subjId = opp.subject_id;
    const subjType = opp.subject_type;
    if (subjId && subjType) {
      addEdge(nodeId("opportunity", opp.id), nodeId(subjType, subjId), "targets", 0.7, "targets");
    }
    if (opp.territory_id) {
      addEdge(nodeId("opportunity", opp.id), nodeId("territory", opp.territory_id), "in", 0.5, "in");
    }
  });

  recommendations.forEach(rec => {
    if (rec.insight_id) {
      addEdge(nodeId("recommendation", rec.id), nodeId("insight", rec.insight_id), "based_on", 0.7, "based on");
    }
    // Recommendation → creates → Task
    if (rec.created_task_id) {
      addEdge(nodeId("recommendation", rec.id), nodeId("task", rec.created_task_id), "creates", 0.8, "creates");
    }
  });

  return edges;
}

// ── Mark unconnected nodes ────────────────────────────────────────────────────

function markUnconnected(nodes, edges) {
  const connectedIds = new Set();
  edges.forEach(e => { connectedIds.add(e.source); connectedIds.add(e.target); });
  nodes.forEach(n => { n.is_unconnected = !connectedIds.has(n.id); });
}

// ── Cytoscape elements builder ────────────────────────────────────────────────

const NODE_SHAPES = {
  operational_unit: "round-rectangle", enterprise: "round-rectangle", person: "ellipse",
  task: "round-diamond", transaction: "hexagon", product: "rectangle", service: "round-rectangle",
  risk: "diamond", opportunity: "star", recommendation: "tag", decision: "octagon",
  action: "vee", quality_cluster: "barrel", external_observation: "triangle", observation: "triangle",
};
const NODE_GLYPHS = {
  operational_unit: "◆", enterprise: "▣", person: "●", task: "✓", transaction: "$",
  product: "□", service: "◇", risk: "!", opportunity: "★", recommendation: "→",
  decision: "?", action: "▶", quality_cluster: "…", external_observation: "△", observation: "△",
};

export function toCytoscapeElements(nodes, edges, positions = {}) {
  const cyNodes = nodes.map(n => {
    const sz = n.importance >= 0.8 ? 112 : n.importance >= 0.6 ? 94 : n.importance >= 0.4 ? 78 : 64;
    const warning = n.risk_level || ["degraded", "partial", "unavailable", "disputed"].includes(String(n.status).toLowerCase());
    return {
      data: {
        id:            n.id,
        label:         `${NODE_GLYPHS[n.entity_type] || "•"} ${n.label}`,
        detailLabel:   `${NODE_GLYPHS[n.entity_type] || "•"} ${n.label}${n.sublabel ? `\n${n.sublabel}` : ""}`,
        sublabel:      n.sublabel || "",
        nodeColor:     NODE_COLORS[n.entity_type] || "#64748b",
        shape:         NODE_SHAPES[n.entity_type] || "ellipse",
        size:          sz,
        entity_type:   n.entity_type,
        importance:    n.importance,
        riskLevel:     n.risk_level,
        hasOpportunity: n.has_opportunity,
        isUnconnected: n.is_unconnected,
        borderColor:   n.risk_level === "critical" || n.risk_level === "high"
          ? "#ef4444"
          : n.has_opportunity ? "#22c55e"
          : n.is_unconnected ? "#94a3b8"
          : "transparent",
        borderWidth:   warning || n.has_opportunity ? 3 : n.is_unconnected ? 1.5 : 0,
        presentationOnly: Boolean(n.presentation_only),
      },
      position: positions[n.id],
      classes: [
        n.entity_type,
        n.risk_level ? "has-risk" : "",
        n.has_opportunity ? "has-opportunity" : "",
        n.is_unconnected ? "unconnected" : "",
        warning ? "has-warning" : "",
        n.presentation_only ? "presentation-cluster" : "",
      ].filter(Boolean).join(" "),
    };
  });

  const cyEdges = edges.map(e => ({
    data: {
      id:    e.id,
      source: e.source,
      target: e.target,
      label:  e.label,
      strength: e.strength,
      width:  Math.max(1, Math.round(e.strength * 3)),
      predicate: e.predicate || e.relationship_type,
      relationship_type: e.relationship_type,
      status: e.status,
      assertion_state: e.assertion_state,
      temporal: e.temporal,
      assertion_class: e.assertion_class,
      confidence: e.confidence,
      verification_state: e.verification_state,
      permitted_actions: e.permitted_actions,
      evidence: e.evidence,
      evidenceCount: e.evidence?.length || 0,
      detailLabel: `${e.label || e.predicate || "relationship"}${e.evidence?.length ? ` · ${e.evidence.length} evidence` : ""}`,
    },
    classes: [
      ["canonical_relationship", "operator_confirmed_assertion"].includes(e.assertion_class) ? "edge-fact" : "edge-derived",
      ["disputed", "rejected"].includes(e.assertion_state || e.status) ? "edge-disputed" : "",
      ["expired", "superseded"].includes(e.assertion_state || e.status) ? "edge-expired" : "",
      e.evidence?.length ? "has-evidence" : "",
    ].filter(Boolean).join(" "),
  }));

  return [...cyNodes, ...cyEdges];
}

// ── Mode filter ───────────────────────────────────────────────────────────────

export function filterForMode(nodes, edges, mode) {
  const modeDef = GRAPH_MODES[mode];
  if (!modeDef || !modeDef.types) return { nodes, edges };

  const allowedTypes = new Set(modeDef.types);
  const filteredNodes = nodes.filter(n => allowedTypes.has(n.entity_type));
  const nodeIds = new Set(filteredNodes.map(n => n.id));
  const filteredEdges = edges.filter(e => nodeIds.has(e.source) && nodeIds.has(e.target));

  return { nodes: filteredNodes, edges: filteredEdges };
}

// ── Main export ───────────────────────────────────────────────────────────────

export function buildGraphData(entities) {
  const { nodeMap, all: allNodes } = buildNodes(entities);
  const edges = buildEdges(entities, nodeMap);
  markUnconnected(allNodes, edges);

  // Sort nodes by importance desc so most-important render on top
  allNodes.sort((a, b) => b.importance - a.importance);

  // Stats for pulse bar
  const stats = {
    total_nodes:       allNodes.length,
    total_edges:       edges.length,
    unconnected:       allNodes.filter(n => n.is_unconnected).length,
    open_risks:        allNodes.filter(n => n.entity_type === "risk").length,
    new_insights:      allNodes.filter(n => n.entity_type === "insight").length,
    open_tasks:        (entities.tasks || []).filter(t => t.status !== "completed" && t.status !== "done").length,
    pending_recs:      (entities.recommendations || []).filter(r => r.status === "pending").length,
    opportunities:     allNodes.filter(n => n.entity_type === "opportunity").length,
  };

  return { nodes: allNodes, edges, stats };
}

export function assertGovernedGraphContract(packet) {
  if (!packet || packet.contract_version !== GRAPH_CONTRACT_VERSION) {
    throw new Error(`Unsupported Company Graph contract: ${packet?.contract_version || "missing"}`);
  }
  if (!packet.scope || !packet.provenance || !packet.completeness || !packet.truncation || !packet.quality) {
    throw new Error("Incomplete governed Company Graph contract");
  }
  return packet;
}

export function sanitizeGraphNode(node) {
  return {
    id: node.id,
    entity_type: node.entity_type,
    entity_id: node.entity_id,
    label: node.label,
    sublabel: node.sublabel || null,
    status: node.status || null,
    sensitivity: node.sensitivity || "internal",
    attributes: graphSafeAttributes(node.attributes || {}, node.entity_type, true),
    permitted_actions: (node.permitted_actions || []).map(action => ({
      action: action.action, allowed: Boolean(action.allowed),
      requires_approval: Boolean(action.requires_approval), reason: action.reason || null,
    })),
  };
}

export function sanitizeGraphEdge(edge) {
  return {
    id: edge.id,
    source: edge.source,
    predicate: edge.predicate,
    target: edge.target,
    direction: edge.direction || "directed",
    label: edge.label,
    assertion_class: edge.assertion_class,
    status: edge.status,
    temporal: {
      status: edge.temporal?.status || edge.status || "active",
      valid_from: edge.temporal?.valid_from || null,
      valid_to: edge.temporal?.valid_to || null,
      observed_at: edge.temporal?.observed_at || null,
      expires_at: edge.temporal?.expires_at || null,
      confirmed_at: edge.temporal?.confirmed_at || null,
      rejected_at: edge.temporal?.rejected_at || null,
      superseded_by: edge.temporal?.superseded_by || null,
      evidence_version: edge.temporal?.evidence_version || 1,
    },
    evidence: (edge.evidence || []).map(item => ({
      evidence_id: item.evidence_id,
      source_zone: item.source_zone,
      source_table: item.source_table,
      source_record_id: item.source_record_id,
      assertion_class: item.assertion_class,
      explanation: item.explanation,
      derivation_rule: item.derivation_rule || null,
      retrieved_at: item.retrieved_at || null,
      freshness_at: item.freshness_at || null,
      requirement: item.requirement || "canonical_record_id",
    })),
    confidence: edge.confidence,
    verification_state: edge.verification_state,
    assertion_key: edge.assertion_key || edge.id,
    assertion_state: edge.assertion_state || (edge.verification_state === "proposed" ? "proposed" : "active"),
    relationship_rule_id: edge.relationship_rule_id || null,
    sensitivity: edge.sensitivity || "internal",
    valid_correction_actions: edge.valid_correction_actions || [],
    permitted_actions: (edge.permitted_actions || []).map(action => ({
      action: action.action, allowed: Boolean(action.allowed),
      requires_approval: Boolean(action.requires_approval), reason: action.reason || null,
    })),
  };
}

export function sanitizeAssertionHistoryEvent(event) {
  return {
    assertion_key: event.assertion_key,
    edge_id: event.edge_id || null,
    source: event.source,
    predicate: event.predicate,
    target: event.target,
    from_state: event.from_state || null,
    to_state: event.to_state,
    reason: event.reason || null,
    actor: "authorized_operator",
    occurred_at: event.occurred_at || null,
    evidence_version: event.evidence_version || 1,
  };
}

export function serializeGovernedGraphPacket(packet, { nodes = packet?.nodes || [], edges = packet?.edges || [] } = {}) {
  assertGovernedGraphContract(packet);
  return {
    contract_version: GRAPH_CONTRACT_VERSION,
    company_id: packet.company_id,
    scope: packet.scope,
    nodes: nodes.map(sanitizeGraphNode),
    edges: edges.map(sanitizeGraphEdge),
    counts: packet.counts || {},
    provenance: packet.provenance,
    source_status: packet.source_status || [],
    completeness: packet.completeness,
    truncation: packet.truncation,
    quality: packet.quality,
    permitted_actions: packet.permitted_actions || [],
    assertion_history: (packet.assertion_history || []).map(sanitizeAssertionHistoryEvent),
  };
}

export function buildIdjwiGraphContext(packet, {
  intent = null,
  selectedNodeId = null,
  selectedEdgeId = null,
  nodes = packet?.nodes || [],
  edges = packet?.edges || [],
  tenantId = packet?.company_id || null,
  role = null,
  page = "CompanyGraphHome",
  productSurface = "web",
} = {}) {
  assertGovernedGraphContract(packet);
  const safeNodes = nodes.map(sanitizeGraphNode);
  const safeEdges = edges.map(sanitizeGraphEdge);
  const counts = safeNodes.reduce((result, node) => ({ ...result, [node.entity_type]: (result[node.entity_type] || 0) + 1 }), {});
  const unavailableSources = (packet.source_status || []).filter(source => ["unavailable", "partial"].includes(source.state)).map(source => source.source_id).sort();
  const predicates = [...new Set(safeEdges.map(edge => edge.predicate).filter(Boolean))].sort();
  const sensitivities = [...new Set([...safeNodes, ...safeEdges].map(item => item.sensitivity).filter(Boolean))].sort();
  return {
    contract_version: GRAPH_CONTRACT_VERSION,
    intent,
    tenant_id: tenantId,
    role,
    scope: packet.scope,
    selected_node_id: selectedNodeId,
    selected_edge_id: selectedEdgeId,
    nodes: safeNodes,
    edges: safeEdges,
    counts,
    semantic_summary: {
      node_count: safeNodes.length,
      edge_count: safeEdges.length,
      disconnected_count: packet.quality?.unconnected_count || 0,
      unavailable_source_count: unavailableSources.length,
    },
    ranked_neighborhood: {
      ranking: "server_operational_priority",
      node_ids: safeNodes.map(node => node.id),
      edge_ids: safeEdges.map(edge => edge.id),
    },
    relationship_predicates: predicates,
    provenance: packet.provenance,
    freshness: {
      generated_at: packet.provenance?.generated_at || null,
      source_last_success_at: Object.fromEntries((packet.source_status || []).filter(source => source.last_success_at).map(source => [source.source_id, source.last_success_at])),
    },
    source_status: packet.source_status || [],
    unavailable_sources: unavailableSources,
    completeness: packet.completeness,
    truncation: packet.truncation,
    quality: packet.quality,
    permitted_actions: packet.permitted_actions || [],
    sensitivity_classes: sensitivities,
    page,
    product_surface: productSurface,
    assertion_history: (packet.assertion_history || []).slice(0, 200).map(sanitizeAssertionHistoryEvent),
  };
}

export function buildIdjwiGraphAction(packet, intent, options = {}) {
  if (!Object.values(IDJWI_GRAPH_INTENTS).includes(intent)) throw new Error(`Unsupported Idjwi graph intent: ${intent}`);
  return {
    intent,
    context: buildIdjwiGraphContext(packet, { ...options, intent }),
  };
}
