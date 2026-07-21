/**
 * companyGraphService.js
 *
 * Builds a graph data structure from existing Base44 entity records.
 * No new entities — derives connections from Relationship records,
 * Task/Transaction fields, Address links, and Intelligence layer objects.
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
};

export const GRAPH_MODES = {
  operational_focus: { label: "Operational Focus", types: ["enterprise","person","task","transaction","risk","recommendation","opportunity"] },
  full_graph:        { label: "Full Graph",        types: null },                                         // all
  company_structure: { label: "Company Structure", types: ["enterprise","person","address"] },
  operations_flow:   { label: "Operations Flow",   types: ["enterprise","task","transaction","product","service"] },
  market_context:    { label: "Market Context",    types: ["enterprise","address","territory","opportunity","insight"] },
  risk_action:       { label: "Risk & Action",     types: ["enterprise","person","risk","recommendation","task","insight"] },
  data_quality:      { label: "Data Quality",      types: null },                                         // all but highlights unconnected
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function nodeId(type, id) { return `${type}:${id}`; }

function safeStr(v) { return (v == null || v === "" || v === "null") ? null : String(v); }

function labelFor(entity, type) {
  switch (type) {
    case "enterprise":     return safeStr(entity.enterprise_name) || safeStr(entity.name) || "Enterprise";
    case "person":         return safeStr(entity.full_name) || [entity.first_name, entity.last_name].filter(Boolean).join(" ") || "Person";
    case "product":        return safeStr(entity.item_name) || safeStr(entity.name) || "Product";
    case "service":        return safeStr(entity.name) || safeStr(entity.service_name) || "Service";
    case "task":           return safeStr(entity.title) || safeStr(entity.task_name) || "Task";
    case "transaction":    return safeStr(entity.reference_number) || safeStr(entity.description) || "Transaction";
    case "address":        return safeStr(entity.address_line1) || safeStr(entity.address) || "Address";
    case "territory":      return safeStr(entity.name) || safeStr(entity.territory_name) || "Territory";
    case "insight":        return safeStr(entity.title) || "Insight";
    case "risk":           return safeStr(entity.title) || "Risk";
    case "opportunity":    return safeStr(entity.title) || "Opportunity";
    case "recommendation": return safeStr(entity.title) || "Recommendation";
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
      metadata:       entity,
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
      status:            evidence.status || "active",
      valid_from:        evidence.valid_from || null,
      valid_to:          evidence.valid_to || null,
      evidence: {
        source_zone:      evidence.source_zone || "analytics",
        source_table:     evidence.source_table || "frontend projection",
        source_record_id: String(evidence.source_record_id || ""),
        assertion_type:   evidence.assertion_type || "derived",
        confidence:       evidence.confidence ?? 0.95,
        explanation:      evidence.explanation || `Newsconseen derived this ${relType.replaceAll("_", " ")} connection from canonical record references.`,
        derivation_rule:  evidence.derivation_rule || null,
      },
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
        source_record_id: rel.id, assertion_type: "fact", confidence: 1,
        status: rel.status, valid_from: rel.start_date, valid_to: rel.end_date,
        explanation: `A tenant-governed relationship record states this ${String(rel.relationship_type || "relationship").replaceAll("_", " ")} connection.`,
      });
    }
    // Item relationships
    if (rel.enterprise_id && rel.item_id) {
      addEdge(nodeId("enterprise", rel.enterprise_id), nodeId("product", rel.item_id), rel.relationship_type || "uses", 0.5, "", {
        source_zone: "canonical", source_table: "public.relationships", source_record_id: rel.id,
        assertion_type: "fact", confidence: 1, status: rel.status,
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

export function toCytoscapeElements(nodes, edges) {
  const cyNodes = nodes.map(n => {
    const sz = n.importance >= 0.8 ? 110 : n.importance >= 0.6 ? 88 : n.importance >= 0.4 ? 70 : 55;
    return {
      data: {
        id:            n.id,
        label:         n.label,
        sublabel:      n.sublabel || "",
        nodeColor:     NODE_COLORS[n.entity_type] || "#64748b",
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
        borderWidth:   n.risk_level || n.has_opportunity ? 3 : n.is_unconnected ? 1.5 : 0,
      },
      classes: [
        n.entity_type,
        n.risk_level ? "has-risk" : "",
        n.has_opportunity ? "has-opportunity" : "",
        n.is_unconnected ? "unconnected" : "",
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
      valid_from: e.valid_from,
      valid_to: e.valid_to,
      evidence: e.evidence,
    },
    classes: e.evidence?.assertion_type === "fact" ? "edge-fact" : "edge-derived",
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
