/**
 * Presentation-only Company Graph ontology registry.
 *
 * This registry never changes canonical meaning or authorization. It translates
 * graph-safe semantic records into consistent visual and accessible cues. Its
 * serializable shape is intentionally suitable for the future Newsconseen
 * Ontology SDK; React icon components remain a UI-layer concern.
 */
export const COMPANY_GRAPH_PRESENTATION_VERSION = "company-graph-presentation.v1";

const entry = (label, iconKey, shape, accent, preferredLayouts = []) => Object.freeze({
  label,
  iconKey,
  shape,
  accent,
  surface: "#ffffff",
  primaryLabelField: "label",
  secondaryLabelField: "sublabel",
  statusField: "status",
  warningField: "risk_level",
  importanceField: "importance",
  accessibleName: ({ label: primary, sublabel, status }) =>
    [label.replace(/s$/, ""), primary, sublabel, status && `status ${status}`].filter(Boolean).join(", "),
  preferredLayouts,
});

export const COMPANY_GRAPH_PRESENTATION_REGISTRY = Object.freeze({
  enterprise: entry("Enterprises", "building", "round-rectangle", "#4f46e5", ["customers_suppliers", "operational_flow"]),
  operational_unit: entry("Operational units", "unit", "round-rectangle", "#4338ca", ["organization", "responsibilities"]),
  person: entry("People", "people", "ellipse", "#2563eb", ["organization", "responsibilities"]),
  product: entry("Products", "package", "round-rectangle", "#059669", ["products_services", "operational_flow"]),
  service: entry("Services", "service", "round-rectangle", "#0d9488", ["products_services", "operational_flow"]),
  task: entry("Tasks", "task", "round-diamond", "#ea580c", ["responsibilities", "decisions_actions"]),
  transaction: entry("Transactions", "receipt", "hexagon", "#d97706", ["operational_flow"]),
  address: entry("Addresses", "location", "round-rectangle", "#0f766e", ["customers_suppliers", "external_disruptions"]),
  territory: entry("Territories", "territory", "round-rectangle", "#0f766e", ["external_disruptions"]),
  insight: entry("Insights", "insight", "diamond", "#7c3aed", ["risks_opportunities"]),
  risk: entry("Risks", "risk", "diamond", "#e11d48", ["risks_opportunities"]),
  opportunity: entry("Opportunities", "opportunity", "star", "#16a34a", ["risks_opportunities"]),
  recommendation: entry("Recommendations", "recommendation", "tag", "#d97706", ["decisions_actions"]),
  decision: entry("Decisions", "decision", "octagon", "#4f46e5", ["decisions_actions"]),
  action: entry("Actions", "action", "vee", "#e11d48", ["decisions_actions"]),
  document: entry("Documents", "document", "round-rectangle", "#64748b", ["data_quality"]),
  schedule: entry("Schedules", "schedule", "round-rectangle", "#0284c7", ["responsibilities"]),
  signal: entry("Signals", "signal", "diamond", "#7c3aed", ["risks_opportunities"]),
  observation: entry("Observations", "observation", "triangle", "#7c3aed", ["external_disruptions"]),
  external_observation: entry("External observations", "external", "triangle", "#6d28d9", ["external_disruptions"]),
  animal: entry("Animals", "animal", "ellipse", "#65a30d", ["operational_flow"]),
  plot: entry("Plots", "plot", "round-rectangle", "#4d7c0f", ["operational_flow"]),
  quality_cluster: entry("Summarized records", "cluster", "barrel", "#64748b", ["data_quality"]),
});

export const COMPANY_GRAPH_GLYPHS = Object.freeze({
  enterprise: "▣", operational_unit: "◆", person: "●", product: "□", service: "◇",
  task: "✓", transaction: "$", address: "⌖", territory: "⌖", insight: "✦",
  risk: "!", opportunity: "★", recommendation: "→", decision: "?", action: "▶",
  document: "▤", schedule: "◷", signal: "⌁", observation: "△",
  external_observation: "△", animal: "●", plot: "▱", quality_cluster: "…",
});

export function graphPresentationFor(entityType) {
  return COMPANY_GRAPH_PRESENTATION_REGISTRY[entityType] || entry("Records", "record", "round-rectangle", "#64748b");
}

export function graphAccessibleNodeName(node) {
  return graphPresentationFor(node.entity_type).accessibleName(node);
}

export function graphImportanceBand(value) {
  const importance = Number(value || 0);
  if (importance >= 0.8) return "critical";
  if (importance >= 0.6) return "high";
  if (importance >= 0.4) return "medium";
  return "standard";
}
