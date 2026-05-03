/**
 * CompanyGraphHome.jsx
 *
 * Main landing page after login — a living Company Graph.
 * Shows every entity as a node, every connection as an edge.
 * Answers: "What is my company made of, what is connected, what needs attention?"
 *
 * Layout:
 *  - Top:  Company Pulse bar  (clickable filters that highlight graph nodes)
 *  - Left: Cytoscape canvas   (interactive graph)
 *  - Right: Context panel     (node detail, AI prompts, quick actions)
 */

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import cytoscape from "cytoscape";
import { base44 } from "@/api/base44Client";
import { useEntityListFn } from "@/components/shared/useDataQuery";
import { createPageUrl } from "@/utils";
import {
  Users, Building2, Package, CheckSquare, Receipt, Link2, MapPin,
  Lightbulb, ShieldAlert, TrendingUp, Sparkles, X, ExternalLink,
  Loader2, AlertTriangle, Zap, Filter, GitBranch, BarChart3,
  RefreshCw, Circle, Eye, AlertCircle, Unlink,
} from "lucide-react";
import {
  buildGraphData, toCytoscapeElements, filterForMode,
  NODE_COLORS, GRAPH_MODES,
} from "@/services/companyGraphService";

const RAILWAY_URL = "https://newsconseenwebapp-production.up.railway.app";

// ── Entity type UI config ─────────────────────────────────────────────────────
const ENTITY_CONFIG = {
  enterprise:     { icon: Building2,   label: "Enterprises",     color: "#6366f1" },
  person:         { icon: Users,        label: "People",          color: "#3b82f6" },
  product:        { icon: Package,      label: "Products",        color: "#10b981" },
  service:        { icon: Package,      label: "Services",        color: "#059669" },
  task:           { icon: CheckSquare,  label: "Tasks",           color: "#f97316" },
  transaction:    { icon: Receipt,      label: "Transactions",    color: "#f59e0b" },
  address:        { icon: MapPin,       label: "Addresses",       color: "#14b8a6" },
  territory:      { icon: MapPin,       label: "Territories",     color: "#0d9488" },
  insight:        { icon: Lightbulb,    label: "Insights",        color: "#a855f7" },
  risk:           { icon: ShieldAlert,  label: "Risks",           color: "#ef4444" },
  opportunity:    { icon: TrendingUp,   label: "Opportunities",   color: "#22c55e" },
  recommendation: { icon: Zap,          label: "Recommendations", color: "#fb923c" },
};

// ── Cytoscape graph style ─────────────────────────────────────────────────────
const CY_STYLE = [
  {
    selector: "node",
    style: {
      "background-color":   "data(nodeColor)",
      "label":              "data(label)",
      "color":              "#ffffff",
      "text-valign":        "center",
      "text-halign":        "center",
      "font-size":          "10px",
      "font-weight":        "600",
      "text-wrap":          "ellipsis",
      "text-max-width":     "80px",
      "width":              "data(size)",
      "height":             "data(size)",
      "border-color":       "data(borderColor)",
      "border-width":       "data(borderWidth)",
      "border-opacity":     1,
      "text-outline-color": "#0f172a",
      "text-outline-width": 1,
      "transition-property": "background-color, border-color, border-width, opacity",
      "transition-duration": "200ms",
    },
  },
  {
    selector: "node.has-risk",
    style: {
      "border-color": "#ef4444",
      "border-width":  4,
      "border-style":  "double",
    },
  },
  {
    selector: "node.has-opportunity",
    style: {
      "border-color": "#22c55e",
      "border-width":  3,
    },
  },
  {
    selector: "node.unconnected",
    style: {
      "opacity":       0.55,
      "border-color": "#94a3b8",
      "border-width":  1,
      "border-style":  "dashed",
    },
  },
  {
    selector: "node:selected",
    style: {
      "border-color": "#ffffff",
      "border-width":  3,
      "box-shadow":   "0 0 0 4px rgba(255,255,255,0.3)",
    },
  },
  {
    selector: "node.dimmed",
    style: { "opacity": 0.2 },
  },
  {
    selector: "node.highlighted",
    style: {
      "border-color": "#fbbf24",
      "border-width":  4,
      "opacity":       1,
    },
  },
  {
    selector: "edge",
    style: {
      "line-color":         "#334155",
      "width":              "data(width)",
      "opacity":            0.55,
      "curve-style":        "bezier",
      "target-arrow-shape": "triangle",
      "target-arrow-color": "#334155",
      "arrow-scale":        0.7,
    },
  },
  {
    selector: "edge.highlighted",
    style: {
      "line-color": "#fbbf24",
      "opacity":    0.9,
    },
  },
  {
    selector: "edge.dimmed",
    style: { "opacity": 0.05 },
  },
];

// ── Pulse button config ───────────────────────────────────────────────────────
const PULSE_FILTERS = [
  { key: "open_risks",    label: "Open Risks",     icon: ShieldAlert,  color: "text-rose-600   bg-rose-50   border-rose-200",   highlight: ["risk"] },
  { key: "new_insights",  label: "Insights",       icon: Lightbulb,    color: "text-violet-600 bg-violet-50 border-violet-200", highlight: ["insight"] },
  { key: "opportunities", label: "Opportunities",  icon: TrendingUp,   color: "text-emerald-600 bg-emerald-50 border-emerald-200", highlight: ["opportunity"] },
  { key: "pending_recs",  label: "Actions",        icon: Zap,          color: "text-orange-600 bg-orange-50 border-orange-200", highlight: ["recommendation"] },
  { key: "unconnected",   label: "Unconnected",    icon: Unlink,       color: "text-slate-500  bg-slate-50  border-slate-200",  highlight: [] },
];

// ── App signal severity colours ───────────────────────────────────────────────
const SEV_STYLE = {
  high:   { bg: "bg-rose-50",    text: "text-rose-700",    border: "border-rose-200"   },
  medium: { bg: "bg-amber-50",   text: "text-amber-700",   border: "border-amber-200"  },
  low:    { bg: "bg-slate-50",   text: "text-slate-500",   border: "border-slate-200"  },
  info:   { bg: "bg-violet-50",  text: "text-violet-700",  border: "border-violet-200" },
};
const SIG_TYPE_STYLE = {
  risk:        { icon: ShieldAlert, color: "text-rose-500",    label: "Risk"        },
  insight:     { icon: Lightbulb,   color: "text-violet-500",  label: "Insight"     },
  opportunity: { icon: TrendingUp,  color: "text-emerald-500", label: "Opportunity" },
};

const APP_LABEL = {
  medadmin:    "Med Admin",
  barcode:     "Barcode",
  stockcounter:"Stock Counter",
  attendance:  "Attendance",
  report:      "Report",
};

// ── Context Panel ─────────────────────────────────────────────────────────────
function ContextPanel({ selected, onClose, navigate, insights = [], risks = [], opportunities = [] }) {
  if (!selected) {
    return (
      <div className="flex flex-col h-full">
        <div className="p-5 border-b border-slate-100">
          <p className="text-sm font-bold text-slate-700">Company Graph</p>
          <p className="text-xs text-slate-400 mt-1">Click any node to inspect it</p>
        </div>
        <div className="p-4 flex-1 overflow-y-auto space-y-3">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Ask AI</p>
          {[
            "Explain this company.",
            "What changed this week?",
            "What is disconnected?",
            "Where are the biggest risks?",
            "Which opportunities are most actionable?",
            "What should we do today?",
          ].map(q => (
            <button
              key={q}
              onClick={() => navigate(createPageUrl("Copilot"), { state: { prefillMessage: q } })}
              className="w-full text-left px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700 hover:bg-violet-50 hover:border-violet-200 hover:text-violet-700 transition-colors flex items-center gap-2"
            >
              <Sparkles className="w-3.5 h-3.5 shrink-0 text-violet-400" />
              {q}
            </button>
          ))}
        </div>
        <div className="p-4 border-t border-slate-50">
          <p className="text-[10px] text-slate-300 text-center">Drag to pan · Scroll to zoom · Click node to inspect</p>
        </div>
      </div>
    );
  }

  const { node, connectedNodes } = selected;

  // App-generated signals referencing this entity
  const appSignals = [
    ...risks.filter(r => r.subject_id === node.id).map(r => ({ ...r, _kind: "risk" })),
    ...insights.filter(i => i.subject_id === node.id).map(i => ({ ...i, _kind: "insight" })),
    ...opportunities.filter(o => o.subject_id === node.id).map(o => ({ ...o, _kind: "opportunity" })),
  ].sort((a, b) => new Date(b.created_date || 0) - new Date(a.created_date || 0));

  const cfg = ENTITY_CONFIG[node.entity_type] || {};
  const Icon = cfg.icon || Circle;
  const meta = node.metadata || {};

  const details = [];
  if (meta.enterprise_type || meta.person_type || meta.item_type || meta.task_type || meta.transaction_type)
    details.push({ label: "Type", value: meta.enterprise_type || meta.person_type || meta.item_type || meta.task_type || meta.transaction_type });
  if (meta.status)
    details.push({ label: "Status", value: meta.status });
  if (meta.city || meta.country)
    details.push({ label: "Location", value: [meta.city, meta.country].filter(Boolean).join(", ") });
  if (meta.amount || meta.total_amount)
    details.push({ label: "Amount", value: `${meta.currency || "$"}${(meta.amount || meta.total_amount || 0).toLocaleString()}` });
  if (meta.priority)
    details.push({ label: "Priority", value: meta.priority });
  if (meta.severity)
    details.push({ label: "Severity", value: meta.severity });
  if (meta.email)
    details.push({ label: "Email", value: meta.email });
  if (meta.phone)
    details.push({ label: "Phone", value: meta.phone });

  const routeMap = {
    enterprise: "Enterprises", person: "People", product: "Products",
    service: "Services", task: "Tasks", transaction: "Transactions",
    address: "Addresses", territory: "Territories", relationship: "Relationships",
  };
  const routePage = routeMap[node.entity_type];

  const copilotQ = `Tell me about this ${node.entity_type}: ${node.label}. What is connected to it, what risks exist, and what actions are open?`;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-slate-100 flex items-start gap-3">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: cfg.color ? `${cfg.color}20` : "#f1f5f9" }}
        >
          <Icon className="w-5 h-5" style={{ color: cfg.color || "#64748b" }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-black text-slate-800 truncate">{node.label}</p>
          <p className="text-xs font-medium capitalize" style={{ color: cfg.color || "#64748b" }}>
            {cfg.label || node.entity_type}
          </p>
        </div>
        <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 shrink-0">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Status badges */}
        <div className="flex flex-wrap gap-1.5">
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
            importance {Math.round((node.importance || 0) * 100)}%
          </span>
          {node.risk_level && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-700">
              {node.risk_level} risk
            </span>
          )}
          {node.has_opportunity && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
              opportunity
            </span>
          )}
          {node.is_unconnected && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-400">
              unconnected
            </span>
          )}
        </div>

        {/* Field details */}
        {details.length > 0 && (
          <div className="space-y-1.5">
            {details.map(d => (
              <div key={d.label} className="flex items-start justify-between gap-2 text-xs">
                <span className="text-slate-400 shrink-0">{d.label}</span>
                <span className="text-slate-700 font-medium text-right truncate max-w-[140px]">{d.value}</span>
              </div>
            ))}
          </div>
        )}

        {/* Connected nodes */}
        {connectedNodes.length > 0 && (
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">
              Connected ({connectedNodes.length})
            </p>
            <div className="space-y-1">
              {connectedNodes.slice(0, 8).map(cn => {
                const ccfg = ENTITY_CONFIG[cn.entity_type] || {};
                const CIcon = ccfg.icon || Circle;
                return (
                  <div key={cn.id} className="flex items-center gap-2 py-1 border-b border-slate-50 last:border-0">
                    <CIcon className="w-3 h-3 shrink-0" style={{ color: ccfg.color || "#64748b" }} />
                    <span className="text-[11px] text-slate-600 truncate flex-1">{cn.label}</span>
                    <span className="text-[10px] text-slate-300 capitalize shrink-0">{cn.entity_type}</span>
                  </div>
                );
              })}
              {connectedNodes.length > 8 && (
                <p className="text-[10px] text-slate-400">+{connectedNodes.length - 8} more</p>
              )}
            </div>
          </div>
        )}

        {/* App signals */}
        {appSignals.length > 0 && (
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">
              App Signals ({appSignals.length})
            </p>
            <div className="space-y-1.5">
              {appSignals.slice(0, 6).map((sig, i) => {
                const kind = SIG_TYPE_STYLE[sig._kind] || SIG_TYPE_STYLE.insight;
                const SigIcon = kind.icon;
                const sev = sig.severity || (sig._kind === "insight" ? "info" : "medium");
                const sevStyle = SEV_STYLE[sev] || SEV_STYLE.low;
                const appLabel = APP_LABEL[sig.source] || sig.source || "App";
                return (
                  <div
                    key={sig.id || i}
                    className={`flex items-start gap-2 p-2 rounded-lg border ${sevStyle.bg} ${sevStyle.border}`}
                  >
                    <SigIcon className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${kind.color}`} />
                    <div className="flex-1 min-w-0">
                      <p className={`text-[11px] font-semibold leading-snug ${sevStyle.text} truncate`}>
                        {sig.title || sig._kind}
                      </p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-[9px] font-bold text-slate-400 uppercase">{appLabel}</span>
                        {sev !== "info" && (
                          <span className={`text-[9px] font-bold uppercase ${sevStyle.text} opacity-70`}>
                            {sev}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              {appSignals.length > 6 && (
                <p className="text-[10px] text-slate-400">+{appSignals.length - 6} more signals</p>
              )}
            </div>
          </div>
        )}

        {/* AI prompts */}
        <div>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Ask AI</p>
          <div className="space-y-1.5">
            {[
              `Explain this ${node.entity_type}: ${node.label}`,
              `What risks are connected to ${node.label}?`,
              `What actions are open for ${node.label}?`,
              `What external data do we know about ${node.label}?`,
            ].map(q => (
              <button
                key={q}
                onClick={() => navigate(createPageUrl("Copilot"), { state: { prefillMessage: q } })}
                className="w-full text-left px-2.5 py-2 rounded-lg bg-slate-50 border border-slate-200 text-[11px] text-slate-600 hover:bg-violet-50 hover:border-violet-200 hover:text-violet-700 transition-colors flex items-center gap-1.5"
              >
                <Sparkles className="w-3 h-3 shrink-0 text-violet-400" />
                <span className="truncate">{q}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Footer actions */}
      <div className="p-3 border-t border-slate-100 space-y-2">
        {routePage && (
          <button
            onClick={() => navigate(createPageUrl(routePage))}
            className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold border transition-colors"
            style={{ background: `${cfg.color}15`, color: cfg.color, borderColor: `${cfg.color}40` }}
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Open in {cfg.label}
          </button>
        )}
        <button
          onClick={() => navigate(createPageUrl("Copilot"), { state: { prefillMessage: copilotQ } })}
          className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold bg-violet-50 text-violet-700 border border-violet-200 hover:bg-violet-100 transition-colors"
        >
          <Sparkles className="w-3.5 h-3.5" />
          Ask AI about this
        </button>
      </div>
    </div>
  );
}

// ── Graph Canvas ──────────────────────────────────────────────────────────────
function GraphCanvas({ elements, onNodeSelect, highlightTypes, activeFilter, graphMode }) {
  const containerRef = useRef(null);
  const cyRef        = useRef(null);

  const elementsKey = useMemo(
    () => elements.map(e => e.data.id).join(","),
    [elements],
  );

  // Re-init on element change
  useEffect(() => {
    if (!containerRef.current || elements.length === 0) return;

    if (cyRef.current) { cyRef.current.destroy(); cyRef.current = null; }

    const cy = cytoscape({
      container:           containerRef.current,
      elements,
      style:               CY_STYLE,
      layout: {
        name:              "cose",
        idealEdgeLength:   120,
        nodeRepulsion:     8000,
        gravity:           0.1,
        numIter:           800,
        animate:           elements.length < 80,
        animationDuration: 600,
        fit:               true,
        padding:           40,
        randomize:         true,
        componentSpacing:  80,
        nodeOverlap:       20,
      },
      userZoomingEnabled:  true,
      userPanningEnabled:  true,
      boxSelectionEnabled: false,
      minZoom:             0.08,
      maxZoom:             3,
    });

    cy.on("tap", "node", evt => {
      const node   = evt.target;
      const nodeId = node.id();
      cy.elements().removeClass("highlighted dimmed");
      node.addClass("highlighted");
      // Highlight connected edges + neighbor nodes
      const connectedEdges = node.connectedEdges();
      connectedEdges.addClass("highlighted");
      connectedEdges.connectedNodes().addClass("highlighted");
      cy.elements().not(".highlighted").addClass("dimmed");
      onNodeSelect(node.data());
    });

    cy.on("tap", evt => {
      if (evt.target === cy) {
        cy.elements().removeClass("highlighted dimmed");
        onNodeSelect(null);
      }
    });

    cyRef.current = cy;
    return () => { if (cyRef.current) { cyRef.current.destroy(); cyRef.current = null; } };
  }, [elementsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Apply highlight filter (from pulse bar)
  useEffect(() => {
    if (!cyRef.current) return;
    const cy = cyRef.current;
    cy.elements().removeClass("highlighted dimmed");

    if (!highlightTypes || highlightTypes.length === 0) {
      if (activeFilter === "unconnected") {
        cy.nodes(".unconnected").addClass("highlighted");
        cy.nodes(":not(.unconnected)").addClass("dimmed");
        cy.edges().addClass("dimmed");
      }
      return;
    }
    const selector = highlightTypes.map(t => `node.${t}`).join(", ");
    if (selector) {
      cy.elements(selector).addClass("highlighted");
      cy.elements().not(".highlighted").addClass("dimmed");
    }
  }, [highlightTypes, activeFilter]);

  return (
    <div className="relative flex-1 min-h-0 bg-slate-950 rounded-2xl overflow-hidden border border-slate-800">
      <div ref={containerRef} className="absolute inset-0" />

      {/* Entity type legend */}
      <div className="absolute bottom-3 left-3 flex flex-wrap gap-1 max-w-xs pointer-events-none z-10">
        {Object.entries(ENTITY_CONFIG).filter(([t]) =>
          elements.some(e => e.data.entity_type === t)
        ).map(([type, cfg]) => (
          <div key={type} className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-slate-900/80 border border-slate-700">
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: cfg.color }} />
            <span className="text-[9px] font-bold" style={{ color: cfg.color }}>{cfg.label}</span>
          </div>
        ))}
      </div>

      {/* Hint */}
      <div className="absolute top-3 right-3 pointer-events-none z-10">
        <p className="text-[10px] text-slate-500 bg-slate-900/80 px-2 py-1 rounded-lg border border-slate-800">
          Click node to inspect · Drag to pan · Scroll to zoom
        </p>
      </div>

      {elements.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <GitBranch className="w-10 h-10 text-slate-700 mx-auto mb-3" />
            <p className="text-sm text-slate-500">No data to show</p>
            <p className="text-xs text-slate-600 mt-1">Add entities to see your company graph</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function CompanyGraphHome() {
  const navigate  = useNavigate();
  const listFn    = useEntityListFn(null);

  const { data: currentUser = null } = useQuery({
    queryKey: ["currentUser"],
    queryFn:  () => base44.auth.me(),
    staleTime: 0, refetchOnMount: "always",
  });

  const listFnUser = useEntityListFn(currentUser);

  // ── Graph state ─────────────────────────────────────────────────────────────
  const [graphMode,      setGraphMode]      = useState("full_graph");
  const [activeFilter,   setActiveFilter]   = useState(null);   // pulse bar filter
  const [selectedNode,   setSelectedNode]   = useState(null);   // clicked node data
  const [visibleTypes,   setVisibleTypes]   = useState(new Set(Object.keys(ENTITY_CONFIG)));

  // ── Entity fetches ───────────────────────────────────────────────────────────
  const enabled = !!currentUser?.company_id || currentUser?.role === "super_admin";

  const useE = (key, entity, sort = "-created_date") => useQuery({
    queryKey: [key, currentUser?.company_id],
    queryFn:  () => listFnUser(entity, sort),
    enabled,
    staleTime: 30_000,
    refetchOnMount: "always",
  });

  const { data: enterprises    = [], isLoading: loadingEnterprises } = useE("g_enterprises",    base44.entities.Enterprise);
  const { data: people         = [], isLoading: loadingPeople }      = useE("g_people",         base44.entities.Person);
  const { data: products       = [] }                                = useE("g_products",        base44.entities.Product);
  const { data: services       = [] }                                = useE("g_services",        base44.entities.Service);
  const { data: tasks          = [] }                                = useE("g_tasks",           base44.entities.Task);
  const { data: transactions   = [] }                                = useE("g_transactions",    base44.entities.Transaction);
  const { data: addresses      = [] }                                = useE("g_addresses",       base44.entities.Address);
  const { data: relationships  = [] }                                = useE("g_relationships",   base44.entities.Relationship);
  const { data: territories    = [] }                                = useE("g_territories",     base44.entities.Territory);
  const { data: insights       = [] }                                = useE("g_insights",        base44.entities.Insight);
  const { data: risks          = [] }                                = useE("g_risks",           base44.entities.Risk);
  const { data: opportunities  = [] }                                = useE("g_opportunities",   base44.entities.Opportunity);
  const { data: recommendations = [] }                               = useE("g_recommendations", base44.entities.Recommendation);

  const isLoading = loadingEnterprises || loadingPeople;

  // ── Build graph ──────────────────────────────────────────────────────────────
  const { nodes, edges, stats } = useMemo(() => {
    if (!enabled || enterprises.length + people.length === 0) {
      return { nodes: [], edges: [], stats: {} };
    }
    return buildGraphData({
      enterprises, people, products, services, tasks, transactions,
      addresses, territories, relationships,
      insights, risks, opportunities, recommendations,
    });
  }, [
    enterprises, people, products, services, tasks, transactions,
    addresses, territories, relationships,
    insights, risks, opportunities, recommendations, enabled,
  ]);

  // ── Apply mode + type filters ────────────────────────────────────────────────
  const { nodes: filteredNodes, edges: filteredEdges } = useMemo(() => {
    const { nodes: mNodes, edges: mEdges } = filterForMode(nodes, edges, graphMode);
    const visible = mNodes.filter(n => visibleTypes.has(n.entity_type));
    const visibleIds = new Set(visible.map(n => n.id));
    const visibleEdges = mEdges.filter(e => visibleIds.has(e.source) && visibleIds.has(e.target));
    return { nodes: visible, edges: visibleEdges };
  }, [nodes, edges, graphMode, visibleTypes]);

  const cyElements = useMemo(
    () => toCytoscapeElements(filteredNodes, filteredEdges),
    [filteredNodes, filteredEdges],
  );

  // ── Pulse bar highlight ──────────────────────────────────────────────────────
  const pulseHighlight = useMemo(() => {
    if (!activeFilter) return null;
    const pf = PULSE_FILTERS.find(p => p.key === activeFilter);
    return pf?.highlight || null;
  }, [activeFilter]);

  // ── Node click ───────────────────────────────────────────────────────────────
  const handleNodeSelect = useCallback(nodeData => {
    if (!nodeData) { setSelectedNode(null); return; }
    const fullNode = filteredNodes.find(n => n.id === nodeData.id);
    if (!fullNode) return;
    // Find connected nodes
    const connectedIds = new Set(
      filteredEdges
        .filter(e => e.source === fullNode.id || e.target === fullNode.id)
        .flatMap(e => [e.source, e.target])
        .filter(id => id !== fullNode.id),
    );
    const connectedNodes = filteredNodes.filter(n => connectedIds.has(n.id));
    setSelectedNode({ node: fullNode, connectedNodes });
  }, [filteredNodes, filteredEdges]);

  // ── Type toggle ──────────────────────────────────────────────────────────────
  const toggleType = useCallback(type => {
    setVisibleTypes(prev => {
      const next = new Set(prev);
      if (next.has(type)) { next.delete(type); } else { next.add(type); }
      return next;
    });
  }, []);

  const pulseClick = key => {
    setActiveFilter(prev => prev === key ? null : key);
    setSelectedNode(null);
  };

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full min-h-0 gap-3">

      {/* ── Company Pulse bar ──────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 flex-wrap shrink-0">
        <span className="text-xs font-bold text-slate-400 uppercase tracking-widest mr-1">Focus</span>
        {PULSE_FILTERS.map(pf => {
          const PIcon = pf.icon;
          const count = stats[pf.key] || 0;
          const isActive = activeFilter === pf.key;
          return (
            <button
              key={pf.key}
              onClick={() => pulseClick(pf.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                isActive
                  ? "bg-slate-800 text-white border-slate-700 shadow-sm"
                  : `${pf.color} hover:opacity-80`
              }`}
            >
              <PIcon className="w-3.5 h-3.5" />
              {pf.label}
              {count > 0 && (
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-black ${isActive ? "bg-white/20" : "bg-current/10"}`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}

        <div className="ml-auto flex items-center gap-2">
          {/* Graph mode selector */}
          <select
            value={graphMode}
            onChange={e => setGraphMode(e.target.value)}
            className="text-xs border border-slate-200 rounded-xl px-3 py-1.5 bg-white text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-slate-300"
          >
            {Object.entries(GRAPH_MODES).map(([key, { label }]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>

          {/* Stats */}
          <div className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-500">
            <BarChart3 className="w-3.5 h-3.5" />
            <span>{filteredNodes.length} nodes · {filteredEdges.length} edges</span>
          </div>

          {isLoading && <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />}
        </div>
      </div>

      {/* ── Type filter toggles ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-1.5 flex-wrap shrink-0">
        <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        {Object.entries(ENTITY_CONFIG).map(([type, cfg]) => {
          const isOn = visibleTypes.has(type);
          const count = filteredNodes.filter(n => n.entity_type === type).length;
          if (count === 0) return null;
          return (
            <button
              key={type}
              onClick={() => toggleType(type)}
              className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border transition-all ${
                isOn ? "opacity-100" : "opacity-35"
              }`}
              style={{
                background:   isOn ? `${cfg.color}18` : "transparent",
                borderColor:  isOn ? `${cfg.color}40` : "#e2e8f0",
                color:        isOn ? cfg.color : "#94a3b8",
              }}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: cfg.color }} />
              {cfg.label} <span className="opacity-60">({count})</span>
            </button>
          );
        })}
      </div>

      {/* ── Main area: Graph + Context panel ──────────────────────────────────── */}
      <div className="flex gap-3 flex-1 min-h-0">

        {/* Graph canvas */}
        <div className={`flex flex-col flex-1 min-w-0 min-h-0 transition-all ${selectedNode ? "mr-0" : ""}`}>
          {isLoading && enterprises.length === 0 ? (
            <div className="flex-1 flex items-center justify-center bg-slate-950 rounded-2xl border border-slate-800">
              <div className="text-center">
                <Loader2 className="w-8 h-8 text-slate-600 animate-spin mx-auto mb-3" />
                <p className="text-sm text-slate-500">Building company graph…</p>
              </div>
            </div>
          ) : (
            <GraphCanvas
              elements={cyElements}
              onNodeSelect={handleNodeSelect}
              highlightTypes={pulseHighlight}
              activeFilter={activeFilter}
              graphMode={graphMode}
            />
          )}
        </div>

        {/* Context panel */}
        <div className={`shrink-0 transition-all duration-200 ${selectedNode ? "w-72" : "w-64"} bg-white border border-slate-200 rounded-2xl overflow-hidden flex flex-col`}>
          <ContextPanel
            selected={selectedNode}
            onClose={() => setSelectedNode(null)}
            navigate={navigate}
            insights={insights}
            risks={risks}
            opportunities={opportunities}
          />
        </div>
      </div>
    </div>
  );
}
