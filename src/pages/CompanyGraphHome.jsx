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
import { ncClient } from "@/api/ncClient";
import { RAILWAY_URL, authHeaders } from "@/config/api";
import { useEntityListFn } from "@/components/shared/useDataQuery";
import { createPageUrl } from "@/utils";
import {
  Users, Building2, Package, CheckSquare, Receipt, Link2, MapPin,
  Lightbulb, ShieldAlert, TrendingUp, Sparkles, X, ExternalLink,
  Loader2, Zap, Filter, GitBranch, BarChart3,
  Circle, AlertCircle, Unlink, Search, Save, Download,
  CheckCircle2, CloudOff, Maximize2, Minimize2, RotateCcw, Eye,
} from "lucide-react";
import {
  buildGraphData, toCytoscapeElements, filterForMode,
  GRAPH_MODES,
} from "@/services/companyGraphService";
import { getAttentionSignals } from "@/utils/attentionSignals";

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
  document:       { icon: Link2,        label: "Documents",       color: "#64748b" },
  schedule:       { icon: CheckSquare,  label: "Schedules",       color: "#0ea5e9" },
  signal:         { icon: TrendingUp,   label: "Signals",         color: "#8b5cf6" },
  decision:       { icon: CheckCircle2, label: "Decisions",       color: "#2563eb" },
  animal:         { icon: Circle,       label: "Animals",         color: "#84cc16" },
  plot:           { icon: MapPin,       label: "Plots",           color: "#65a30d" },
  observation:    { icon: Eye,          label: "Observations",    color: "#7c3aed" },
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
      "line-color":         "#64748b",
      "width":              "data(width)",
      "opacity":            0.72,
      "curve-style":        "bezier",
      "target-arrow-shape": "triangle",
      "target-arrow-color": "#64748b",
      "arrow-scale":        0.9,
    },
  },
  {
    selector: "edge.edge-derived",
    style: { "line-style": "dashed", "opacity": 0.55 },
  },
  {
    selector: "edge:selected",
    style: {
      "line-color": "#fbbf24", "target-arrow-color": "#fbbf24",
      "width": 4, "opacity": 1, "label": "data(label)", "color": "#f8fafc",
      "font-size": "11px", "font-weight": "700", "text-background-color": "#0f172a",
      "text-background-opacity": 0.9, "text-background-padding": "4px",
      "text-rotation": "autorotate",
    },
  },
  {
    selector: "edge.hovered",
    style: {
      "line-color": "#38bdf8", "target-arrow-color": "#38bdf8", "opacity": 1,
      "label": "data(label)", "color": "#f8fafc", "font-size": "10px",
      "text-background-color": "#0f172a", "text-background-opacity": 0.9,
      "text-background-padding": "3px", "text-rotation": "autorotate",
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
function ContextPanel({ selected, onClose, navigate, companyId, onGraphRefresh, graphContext, insights = [], risks = [], opportunities = [] }) {
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
              onClick={() => window.dispatchEvent(new CustomEvent("open-idjwi-panel", { detail: { initialMessage: q, context: graphContext } }))}
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

  if (selected.edge) {
    const { edge, sourceNode, targetNode } = selected;
    const evidence = edge.evidence || {};
    const isFact = evidence.assertion_type === "fact";
    const govern = async action => {
      const reason = window.prompt(action === "confirm" ? "Why should this relationship become canonical?" : "Why is this connection incorrect?") || "";
      const [sourceType, sourceId] = String(edge.source).split(":");
      const [targetType, targetId] = String(edge.target).split(":");
      const response = await fetch(`${RAILWAY_URL}/company-graph/relationship/${action}`, {
        method: "POST", headers: await authHeaders(),
        body: JSON.stringify({ company_id: companyId, edge_id: edge.id, source_type: sourceType, source_id: sourceId, target_type: targetType, target_id: targetId, predicate: edge.predicate || edge.relationship_type, reason }),
      });
      if (!response.ok) throw new Error(`Relationship ${action} failed`);
      await onGraphRefresh?.();
    };
    return (
      <div className="flex flex-col h-full">
        <div className="p-4 border-b border-slate-100 flex items-start gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isFact ? "bg-emerald-50" : "bg-violet-50"}`}>
            <Link2 className={`w-5 h-5 ${isFact ? "text-emerald-600" : "text-violet-600"}`} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-black text-slate-800">Explain connection</p>
            <p className="text-xs text-slate-500 capitalize">{(edge.predicate || edge.relationship_type || "related to").replaceAll("_", " ")}</p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="rounded-xl bg-slate-950 text-white p-3 text-xs">
            <p className="font-bold">{sourceNode?.label || edge.source}</p>
            <p className="my-2 text-amber-300 font-semibold">→ {(edge.label || edge.predicate || "related to").replaceAll("_", " ")} →</p>
            <p className="font-bold">{targetNode?.label || edge.target}</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${isFact ? "bg-emerald-100 text-emerald-700" : "bg-violet-100 text-violet-700"}`}>{isFact ? "Verified fact" : "Derived connection"}</span>
            <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-slate-100 text-slate-600">{Math.round((evidence.confidence ?? 0) * 100)}% confidence</span>
            <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-slate-100 text-slate-600 capitalize">{edge.status || "active"}</span>
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Why this connection exists</p>
            <p className="text-xs text-slate-700 leading-relaxed">{evidence.explanation || "The graph projection found a canonical reference between these records."}</p>
          </div>
          <div className="rounded-xl border border-slate-200 divide-y divide-slate-100 text-xs">
            {[["Source", evidence.source_table || "Canonical ontology"], ["Record", evidence.source_record_id || "Not provided"], ["Data zone", evidence.source_zone || "canonical"], ["Rule", evidence.derivation_rule || (isFact ? "Direct tenant assertion" : "Canonical reference projection")], ["Valid from", edge.valid_from || "Not specified"], ["Valid to", edge.valid_to || "Current"]].map(([label, value]) => (
              <div key={label} className="flex gap-3 justify-between p-2.5"><span className="text-slate-400">{label}</span><span className="text-slate-700 font-medium text-right break-all">{value}</span></div>
            ))}
          </div>
          <button
            onClick={() => window.dispatchEvent(new CustomEvent("open-idjwi-panel", { detail: { initialMessage: `Explain why ${sourceNode?.label || edge.source} is connected to ${targetNode?.label || edge.target} through ${edge.predicate || edge.relationship_type}.`, context: { ...graphContext, graph_edge: edge } } }))}
            className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700"
          ><Sparkles className="w-3.5 h-3.5" /> Ask Idjwi about this connection</button>
          <div className="grid grid-cols-2 gap-2">
            {!isFact && <button onClick={() => govern("confirm").catch(error => window.alert(error.message))} className="py-2 rounded-xl text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">Confirm</button>}
            {!isFact && <button onClick={() => govern("reject").catch(error => window.alert(error.message))} className="py-2 rounded-xl text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">Reject</button>}
            <button onClick={() => navigate(createPageUrl("Relationships"))} className="py-2 rounded-xl text-xs font-bold bg-slate-50 text-slate-700 border border-slate-200">Correct record</button>
            <button onClick={() => window.dispatchEvent(new CustomEvent("open-idjwi-panel", { detail: { initialMessage: `Record a governed correction for relationship ${edge.id}.`, context: { ...graphContext, graph_edge: edge, correction_requested: true } } }))} className="py-2 rounded-xl text-xs font-bold bg-violet-50 text-violet-700 border border-violet-200">Teach Idjwi</button>
          </div>
        </div>
      </div>
    );
  }

  const { node, connectedNodes, connectedEdges = [] } = selected;

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
                const connection = connectedEdges.find(edge => edge.source === cn.id || edge.target === cn.id);
                return (
                  <div key={cn.id} className="flex items-center gap-2 py-1 border-b border-slate-50 last:border-0">
                    <CIcon className="w-3 h-3 shrink-0" style={{ color: ccfg.color || "#64748b" }} />
                    <div className="min-w-0 flex-1"><p className="text-[11px] text-slate-600 truncate">{cn.label}</p><p className="text-[9px] text-amber-600 capitalize truncate">{(connection?.predicate || connection?.relationship_type || "related to").replaceAll("_", " ")}</p></div>
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
                onClick={() => window.dispatchEvent(new CustomEvent("open-idjwi-panel", { detail: { initialMessage: q, context: { ...graphContext, entity_type: node.entity_type, entity_id: node.id, entity_label: node.label } } }))}
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
          onClick={() => window.dispatchEvent(new CustomEvent("open-idjwi-panel", { detail: { initialMessage: copilotQ, context: { ...graphContext, entity_type: node.entity_type, entity_id: node.id, entity_label: node.label } } }))}
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
function GraphCanvas({ elements, onNodeSelect, onEdgeSelect, highlightTypes, activeFilter, focusNodeId, isFullscreen, onToggleFullscreen }) {
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
      cy.elements().removeClass("highlighted dimmed");
      node.addClass("highlighted");
      // Highlight connected edges + neighbor nodes
      const connectedEdges = node.connectedEdges();
      connectedEdges.addClass("highlighted");
      connectedEdges.connectedNodes().addClass("highlighted");
      cy.elements().not(".highlighted").addClass("dimmed");
      onNodeSelect(node.data());
    });

    cy.on("tap", "edge", evt => {
      const edge = evt.target;
      cy.elements().removeClass("highlighted dimmed");
      edge.select();
      edge.connectedNodes().addClass("highlighted");
      cy.elements().not(edge).not(".highlighted").addClass("dimmed");
      onEdgeSelect(edge.data());
    });
    cy.on("mouseover", "edge", evt => evt.target.addClass("hovered"));
    cy.on("mouseout", "edge", evt => evt.target.removeClass("hovered"));

    cy.on("tap", evt => {
      if (evt.target === cy) {
        cy.elements().removeClass("highlighted dimmed");
        cy.$(":selected").unselect();
        onNodeSelect(null);
      }
    });

    cyRef.current = cy;
    return () => { if (cyRef.current) { cyRef.current.destroy(); cyRef.current = null; } };
  }, [elementsKey]);

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

  useEffect(() => {
    if (!cyRef.current || !focusNodeId) return;
    const node = cyRef.current.getElementById(focusNodeId);
    if (!node.length) return;
    cyRef.current.elements().removeClass("highlighted dimmed");
    node.addClass("highlighted");
    node.connectedEdges().addClass("highlighted");
    cyRef.current.animate({ center: { eles: node }, zoom: 1.35 }, { duration: 350 });
  }, [focusNodeId, elementsKey]);

  return (
    <div className="relative flex-1 min-h-0 bg-slate-950 rounded-2xl overflow-hidden border border-slate-800">
      <div ref={containerRef} className="absolute inset-0" />
      <div className="absolute top-3 left-3 z-20 flex gap-1">
        <button aria-label="Reset graph view" title="Reset graph view" onClick={() => cyRef.current?.fit(undefined, 40)} className="p-2 rounded-lg bg-slate-900/90 border border-slate-700 text-slate-300 hover:text-white"><RotateCcw className="w-3.5 h-3.5" /></button>
        <button aria-label={isFullscreen ? "Exit full screen" : "Open full screen"} title={isFullscreen ? "Exit full screen" : "Open full screen"} onClick={onToggleFullscreen} className="p-2 rounded-lg bg-slate-900/90 border border-slate-700 text-slate-300 hover:text-white">{isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}</button>
      </div>

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
      <div className="absolute bottom-3 right-3 hidden md:flex gap-1.5 pointer-events-none z-10">
        <span className="px-2 py-1 rounded-full bg-slate-900/90 border border-slate-700 text-[9px] text-slate-200">━ Verified fact</span>
        <span className="px-2 py-1 rounded-full bg-slate-900/90 border border-slate-700 text-[9px] text-slate-200">┄ Derived</span>
        <span className="px-2 py-1 rounded-full bg-slate-900/90 border border-slate-700 text-[9px] text-slate-200">→ Direction</span>
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
  const { data: currentUser = null } = useQuery({
    queryKey: ["currentUser"],
    queryFn:  () => ncClient.auth.me(),
    staleTime: 0, refetchOnMount: "always",
  });

  const listFnUser = useEntityListFn(currentUser);

  // ── Graph state ─────────────────────────────────────────────────────────────
  const [graphMode,      setGraphMode]      = useState("operational_focus");
  const [activeFilter,   setActiveFilter]   = useState(null);   // pulse bar filter
  const [selectedNode,   setSelectedNode]   = useState(null);   // clicked node data
  const [visibleTypes,   setVisibleTypes]   = useState(new Set(Object.keys(ENTITY_CONFIG)));
  const [fallbackEnabled, setFallbackEnabled] = useState(false);
  const [scopeId, setScopeId] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [focusNodeId, setFocusNodeId] = useState("");
  const [neighborhoodGraph, setNeighborhoodGraph] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [savedViews, setSavedViews] = useState(() => {
    try { return JSON.parse(localStorage.getItem("newsconseen:company-graph-views") || "[]"); } catch { return []; }
  });

  // ── Entity fetches ───────────────────────────────────────────────────────────
  const enabled = !!currentUser?.company_id || currentUser?.role === "super_admin";

  const governedQuery = useQuery({
    queryKey: ["company-graph-overview", currentUser?.company_id, scopeId],
    enabled: enabled && !!currentUser?.company_id,
    staleTime: 30_000,
    retry: 1,
    queryFn: async () => {
      const scope = scopeId ? `&operational_unit_id=${encodeURIComponent(scopeId)}` : "";
      try {
        const response = await fetch(`${RAILWAY_URL}/company-graph/overview?company_id=${encodeURIComponent(currentUser.company_id)}&limit=500${scope}`, { headers: await authHeaders() });
        if (!response.ok) throw new Error(`Company graph service returned ${response.status}`);
        setFallbackEnabled(false);
        return response.json();
      } catch (error) {
        setFallbackEnabled(true);
        throw error;
      }
    },
  });
  const governedGraph = neighborhoodGraph || governedQuery.data || null;

  const auditGraph = useCallback(async (event, subject = "", metadata = {}) => {
    if (!currentUser?.company_id) return;
    try {
      await fetch(`${RAILWAY_URL}/company-graph/audit`, { method: "POST", headers: await authHeaders(), body: JSON.stringify({ company_id: currentUser.company_id, event, subject, metadata }) });
    } catch { /* Audit transport must not block graph exploration. */ }
  }, [currentUser?.company_id]);

  useEffect(() => { if (governedQuery.data) auditGraph("opened", currentUser?.company_id, { source: "governed" }); }, [governedQuery.data, currentUser?.company_id, auditGraph]);
  useEffect(() => { if (scopeId) auditGraph("scope_changed", scopeId, { scope_type: "operational_unit" }); }, [scopeId, auditGraph]);

  const useE = (key, entity, sort = "-created_date") => useQuery({
    queryKey: [key, currentUser?.company_id],
    queryFn:  () => listFnUser(entity, sort),
    enabled: enabled && fallbackEnabled,
    staleTime: 30_000,
    refetchOnMount: "always",
  });

  const { data: enterprises    = [], isLoading: loadingEnterprises } = useE("g_enterprises",    ncClient.entities.Enterprise);
  const { data: people         = [], isLoading: loadingPeople }      = useE("g_people",         ncClient.entities.Person);
  const { data: products       = [] }                                = useE("g_products",        ncClient.entities.Product);
  const { data: services       = [] }                                = useE("g_services",        ncClient.entities.Service);
  const { data: tasks          = [] }                                = useE("g_tasks",           ncClient.entities.Task);
  const { data: transactions   = [] }                                = useE("g_transactions",    ncClient.entities.Transaction);
  const { data: addresses      = [] }                                = useE("g_addresses",       ncClient.entities.Address);
  const { data: relationships  = [] }                                = useE("g_relationships",   ncClient.entities.Relationship);
  const { data: territories    = [] }                                = useE("g_territories",     ncClient.entities.Territory);
  const { data: insights       = [] }                                = useE("g_insights",        ncClient.entities.Insight);
  const { data: risks          = [] }                                = useE("g_risks",           ncClient.entities.Risk);
  const { data: opportunities  = [] }                                = useE("g_opportunities",   ncClient.entities.Opportunity);
  const { data: recommendations = [] }                               = useE("g_recommendations", ncClient.entities.Recommendation);

  const isLoading = governedQuery.isLoading || (fallbackEnabled && (loadingEnterprises || loadingPeople));

  // ── Build graph ──────────────────────────────────────────────────────────────
  const { nodes, edges, stats } = useMemo(() => {
    if (!enabled || (!governedGraph?.nodes?.length && enterprises.length + people.length === 0)) {
      return { nodes: [], edges: [], stats: {} };
    }
    const local = buildGraphData({
      enterprises, people, products, services, tasks, transactions,
      addresses, territories, relationships,
      insights, risks, opportunities, recommendations,
    });
    if (!governedGraph?.nodes?.length) return local;

    const localNodes = new Map(local.nodes.map(node => [node.id, node]));
    const governedNodes = governedGraph.nodes.map(node => ({
      ...(localNodes.get(node.id) || {}),
      ...node,
      importance: localNodes.get(node.id)?.importance ?? 0.25,
      metadata: { ...(localNodes.get(node.id)?.metadata || {}), ...(node.metadata || {}) },
      is_unconnected: true,
    }));
    const connected = new Set(governedGraph.edges.flatMap(edge => [edge.source, edge.target]));
    governedNodes.forEach(node => { node.is_unconnected = !connected.has(node.id); });
    const governedEdges = governedGraph.edges.map(edge => ({
      ...edge,
      relationship_type: edge.predicate,
      strength: edge.evidence?.assertion_type === "fact" ? 0.9 : 0.65,
    }));
    return {
      nodes: governedNodes,
      edges: governedEdges,
      stats: {
        ...local.stats,
        open_risks: governedGraph.briefing?.high_risks || 0,
        pending_recs: governedGraph.briefing?.pending_recommendations || 0,
        opportunities: governedGraph.counts?.opportunity || 0,
        new_insights: governedGraph.counts?.insight || 0,
        unconnected: governedGraph.quality?.unconnected_count ?? governedNodes.filter(node => node.is_unconnected).length,
      },
    };
  }, [
    enterprises, people, products, services, tasks, transactions,
    addresses, territories, relationships,
    insights, risks, opportunities, recommendations, governedGraph, enabled,
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

  const graphRecords = useMemo(() => ({
    tasks: nodes.filter(node => node.entity_type === "task").map(node => node.metadata || {}),
    transactions: nodes.filter(node => node.entity_type === "transaction").map(node => node.metadata || {}),
    products: nodes.filter(node => node.entity_type === "product").map(node => node.metadata || {}),
  }), [nodes]);

  // ── What needs attention today — ranked, shared with NotificationsBell ──────
  const attentionSignals = useMemo(
    () => getAttentionSignals(
      fallbackEnabled ? tasks : graphRecords.tasks,
      fallbackEnabled ? transactions : graphRecords.transactions,
      fallbackEnabled ? products : graphRecords.products,
    ),
    [tasks, transactions, products, graphRecords, fallbackEnabled]
  );

  const searchResults = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return [];
    return nodes.filter(node => node.label?.toLowerCase().includes(query) || node.entity_type.includes(query)).slice(0, 8);
  }, [nodes, searchTerm]);
  const scopeOptions = useMemo(() => nodes.filter(node => node.entity_type === "enterprise"), [nodes]);

  const graphStatus = governedQuery.isError
    ? { label: "Local projection fallback", color: "bg-amber-50 text-amber-700 border-amber-200", Icon: CloudOff }
    : governedGraph?.unavailable_sources?.length
      ? { label: `Partial graph · ${governedGraph.unavailable_sources.length} sources unavailable`, color: "bg-rose-50 text-rose-700 border-rose-200", Icon: AlertCircle }
      : { label: "Governed graph online", color: "bg-emerald-50 text-emerald-700 border-emerald-200", Icon: CheckCircle2 };

  const exportGraph = () => {
    const blob = new Blob([JSON.stringify({ nodes: filteredNodes, edges: filteredEdges, provenance: governedGraph?.provenance }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = `newsconseen-company-graph-${Date.now()}.json`; anchor.click();
    URL.revokeObjectURL(url);
    auditGraph("exported", scopeId || currentUser?.company_id, { nodes: filteredNodes.length, edges: filteredEdges.length });
  };
  const StatusIcon = graphStatus.Icon;

  const saveCurrentView = () => {
    const name = window.prompt("Name this graph view");
    if (!name?.trim()) return;
    const next = [...savedViews.filter(view => view.name !== name.trim()), { name: name.trim(), graphMode, scopeId, visibleTypes: [...visibleTypes] }].slice(-10);
    setSavedViews(next);
    localStorage.setItem("newsconseen:company-graph-views", JSON.stringify(next));
    auditGraph("view_saved", name.trim(), { graph_mode: graphMode, scope_id: scopeId });
  };

  const applySavedView = value => {
    const view = savedViews.find(item => item.name === value);
    if (!view) return;
    setGraphMode(view.graphMode || "operational_focus");
    setScopeId(view.scopeId || "");
    setVisibleTypes(new Set(view.visibleTypes || Object.keys(ENTITY_CONFIG)));
    setNeighborhoodGraph(null);
  };

  // ── Pulse bar highlight ──────────────────────────────────────────────────────
  const pulseHighlight = useMemo(() => {
    if (!activeFilter) return null;
    const pf = PULSE_FILTERS.find(p => p.key === activeFilter);
    return pf?.highlight || null;
  }, [activeFilter]);

  // ── Node click ───────────────────────────────────────────────────────────────
  const handleNodeSelect = useCallback(async nodeData => {
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
    const connectedEdges = filteredEdges.filter(e => e.source === fullNode.id || e.target === fullNode.id);
    setSelectedNode({ node: fullNode, connectedNodes, connectedEdges });
    auditGraph("node_inspected", fullNode.id, { graph_mode: graphMode, scope_id: scopeId });
    setFocusNodeId(fullNode.id);
    if (currentUser?.company_id && !fallbackEnabled) {
      try {
        const scope = scopeId ? `&operational_unit_id=${encodeURIComponent(scopeId)}` : "";
        const response = await fetch(`${RAILWAY_URL}/company-graph/neighborhood/${encodeURIComponent(fullNode.entity_type)}/${encodeURIComponent(fullNode.entity_id)}?company_id=${encodeURIComponent(currentUser.company_id)}&depth=1${scope}`, { headers: await authHeaders() });
        if (response.ok) setNeighborhoodGraph(await response.json());
      } catch { /* Preserve the visible overview when neighborhood retrieval fails. */ }
    }
  }, [filteredNodes, filteredEdges, currentUser?.company_id, fallbackEnabled, scopeId, graphMode, auditGraph]);

  const handleEdgeSelect = useCallback(edgeData => {
    const edge = filteredEdges.find(candidate => candidate.id === edgeData.id) || edgeData;
    setSelectedNode({
      edge,
      sourceNode: filteredNodes.find(node => node.id === edge.source),
      targetNode: filteredNodes.find(node => node.id === edge.target),
    });
    auditGraph("edge_inspected", edge.id, { predicate: edge.predicate || edge.relationship_type });
  }, [filteredNodes, filteredEdges, auditGraph]);

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
    <div className={`flex flex-col min-h-0 gap-3 ${isFullscreen ? "fixed inset-0 z-50 bg-slate-50 p-3" : "h-full"}`}>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shrink-0" aria-label="Idjwi operational briefing">
        <div className="flex flex-col lg:flex-row lg:items-center gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Sparkles className="w-4 h-4 text-emerald-600" />
              <h1 className="text-sm font-black text-slate-800">Idjwi operational briefing</h1>
              <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full border text-[10px] font-bold ${graphStatus.color}`}><StatusIcon className="w-3 h-3" />{graphStatus.label}</span>
            </div>
            <p className="text-xs text-slate-600 mt-2">{governedGraph?.briefing?.headline || (governedQuery.isLoading ? "Evaluating your operational graph…" : "Using available company records.")}</p>
            <p className="text-[11px] text-slate-400 mt-1">{governedGraph?.briefing?.recommended_focus || "Select a node or relationship to investigate with Idjwi."}</p>
          </div>
          <div className="grid grid-cols-4 gap-2 text-center">
            {[["Open work", governedGraph?.briefing?.open_tasks || 0], ["High risks", governedGraph?.briefing?.high_risks || 0], ["Recommendations", governedGraph?.briefing?.pending_recommendations || 0], ["Data gaps", governedGraph?.briefing?.quality_issues || 0]].map(([label, value]) => (
              <div key={label} className="px-2 py-1.5 rounded-xl bg-slate-50 border border-slate-100"><p className="text-sm font-black text-slate-800">{value}</p><p className="text-[9px] text-slate-400">{label}</p></div>
            ))}
          </div>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-2 shrink-0">
        <div className="relative min-w-[220px] flex-1 max-w-md">
          <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-400" />
          <input aria-label="Find a record in the company graph" value={searchTerm} onChange={event => setSearchTerm(event.target.value)} placeholder="Find people, enterprises, work or risks…" className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 bg-white" />
          {searchResults.length > 0 && <div className="absolute z-40 top-full mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">{searchResults.map(node => <button key={node.id} onClick={() => { setFocusNodeId(node.id); setSearchTerm(""); handleNodeSelect({ id: node.id }); }} className="w-full flex justify-between px-3 py-2 text-xs hover:bg-slate-50"><span className="truncate">{node.label}</span><span className="capitalize text-slate-400">{node.entity_type}</span></button>)}</div>}
        </div>
        <select aria-label="Organization or operational-unit scope" value={scopeId} onChange={event => { setScopeId(event.target.value); setNeighborhoodGraph(null); }} className="text-xs border border-slate-200 rounded-xl px-3 py-2 bg-white"><option value="">Organization-wide</option>{scopeOptions.map(node => <option key={node.id} value={node.entity_id}>{node.label}</option>)}</select>
        {savedViews.length > 0 && <select aria-label="Saved graph views" defaultValue="" onChange={event => applySavedView(event.target.value)} className="text-xs border border-slate-200 rounded-xl px-3 py-2 bg-white"><option value="">Saved views</option>{savedViews.map(view => <option key={view.name}>{view.name}</option>)}</select>}
        <button onClick={saveCurrentView} className="p-2 rounded-xl border border-slate-200 bg-white text-slate-600" title="Save current view" aria-label="Save current graph view"><Save className="w-4 h-4" /></button>
        <button onClick={exportGraph} className="p-2 rounded-xl border border-slate-200 bg-white text-slate-600" title="Export visible graph" aria-label="Export visible graph"><Download className="w-4 h-4" /></button>
        {neighborhoodGraph && <button onClick={() => { setNeighborhoodGraph(null); setSelectedNode(null); governedQuery.refetch(); }} className="text-xs px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-600">Return to overview</button>}
      </div>

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

      {/* ── What needs attention today ──────────────────────────────────────── */}
      <div className="flex items-center gap-2 flex-wrap shrink-0">
        <span className="text-xs font-bold text-slate-400 uppercase tracking-widest mr-1">Needs attention</span>
        {governedQuery.isError && !fallbackEnabled ? (
          <span className="text-xs text-rose-600 font-medium">Operational evaluation unavailable</span>
        ) : attentionSignals.length === 0 && (governedGraph?.provenance?.complete || fallbackEnabled) ? (
          <span className="text-xs text-emerald-600 font-medium flex items-center gap-1">
            <Circle className="w-2 h-2 fill-emerald-400 text-emerald-400" /> No operational alerts detected
          </span>
        ) : attentionSignals.length === 0 ? (
          <span className="text-xs text-amber-600 font-medium">Evaluation incomplete</span>
        ) : (
          attentionSignals.map(s => (
            <button
              key={s.id}
              onClick={() => navigate(createPageUrl(s.page))}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100 transition-colors"
            >
              <AlertCircle className="w-3.5 h-3.5" />
              {s.label}
            </button>
          ))
        )}
        <button
          onClick={() => navigate(createPageUrl("Dashboard"))}
          className="ml-auto text-xs text-slate-400 hover:text-indigo-600 flex items-center gap-1"
        >
          <BarChart3 className="w-3.5 h-3.5" /> View detailed KPIs →
        </button>
      </div>

      {governedGraph?.quality?.issues?.length > 0 && <div className="flex items-center gap-2 overflow-x-auto shrink-0" role="status" aria-label="Graph data-quality issues">
        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Graph quality</span>
        {governedGraph.quality.issues.map(issue => <button key={issue.code} onClick={() => { setGraphMode("data_quality"); setActiveFilter("unconnected"); }} className={`shrink-0 text-[10px] font-bold px-2.5 py-1 rounded-full border ${issue.severity === "critical" ? "bg-rose-50 text-rose-700 border-rose-200" : "bg-amber-50 text-amber-700 border-amber-200"}`}>{issue.code.replaceAll("_", " ")} · {issue.count}</button>)}
      </div>}

      {/* ── Type filter toggles ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-1.5 flex-wrap shrink-0">
        <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        {Object.entries(ENTITY_CONFIG).map(([type, cfg]) => {
          const isOn = visibleTypes.has(type);
          const count = nodes.filter(n => n.entity_type === type).length;
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
      <div className="flex flex-col lg:flex-row gap-3 flex-1 min-h-0">

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
              onEdgeSelect={handleEdgeSelect}
              highlightTypes={pulseHighlight}
              activeFilter={activeFilter}
              focusNodeId={focusNodeId}
              isFullscreen={isFullscreen}
              onToggleFullscreen={() => setIsFullscreen(value => !value)}
            />
          )}
        </div>

        {/* Context panel */}
        <div className={`shrink-0 transition-all duration-200 w-full ${selectedNode ? "lg:w-80" : "lg:w-72"} max-h-[45vh] lg:max-h-none bg-white border border-slate-200 rounded-2xl overflow-hidden flex flex-col`}>
          <ContextPanel
            selected={selectedNode}
            onClose={() => setSelectedNode(null)}
            navigate={navigate}
            companyId={currentUser?.company_id}
            onGraphRefresh={async () => { setNeighborhoodGraph(null); await governedQuery.refetch(); }}
            graphContext={{ graph_scope: scopeId || "organization", graph_mode: graphMode, visible_node_ids: filteredNodes.slice(0, 100).map(node => node.id), visible_edge_ids: filteredEdges.slice(0, 100).map(edge => edge.id), graph_provenance: governedGraph?.provenance, unavailable_sources: governedGraph?.unavailable_sources || [] }}
            insights={insights}
            risks={risks}
            opportunities={opportunities}
          />
        </div>
      </div>
    </div>
  );
}
