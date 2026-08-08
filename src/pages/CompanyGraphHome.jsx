/**
 * CompanyGraphHome.jsx
 *
 * Governed operational map for an authorized tenant and operational scope.
 * Projects canonical facts, derived intelligence, and evidence-linked connections;
 * it is not a source of truth and does not infer organizational reality from layout.
 * Answers: "How does this operation fit together, what changed, and what needs attention?"
 *
 * Layout:
 *  - Top:  Company Pulse bar  (clickable filters that highlight graph nodes)
 *  - Left: Cytoscape canvas   (interactive graph)
 *  - Right: Context panel     (node detail, AI prompts, quick actions)
 */

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
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
  Info, ChevronDown, ChevronUp,
  ArrowLeft, Pin,
} from "lucide-react";
import {
  buildGraphData, toCytoscapeElements, filterForMode,
  GRAPH_MODES, GRAPH_CONTRACT_VERSION, assertGovernedGraphContract,
  buildIdjwiGraphContext, IDJWI_GRAPH_INTENTS, buildOperationalFocus,
  buildSemanticClusters, semanticPositions, createLatestGraphRequestCoordinator,
} from "@/services/companyGraphService";
import { getAttentionSignals } from "@/utils/attentionSignals";
import AccessibleInteractionHost, {
  requestConfirmation,
  requestText,
  showNotice,
} from "@/components/shared/AccessibleInteractionDialog";
import AccessibleGraphView from "@/components/companyGraph/AccessibleGraphView";
import {
  DEFAULT_COMPANY_GRAPH_SECTIONS,
  companyGraphDeviceCategory,
  companyGraphSectionPreferenceKey,
  normalizeCompanyGraphSections,
} from "@/services/companyGraphPreferences";
import { COMPANY_GRAPH_PRESENTATION_REGISTRY } from "@/services/companyGraphPresentationRegistry";
import { requestCapability } from "@/services/capabilityState";

// ── Entity type UI config ─────────────────────────────────────────────────────
const ENTITY_ICONS = {
  enterprise: Building2, operational_unit: Building2, person: Users,
  product: Package, service: Package, task: CheckSquare, transaction: Receipt,
  address: MapPin, territory: MapPin, insight: Lightbulb, risk: ShieldAlert,
  opportunity: TrendingUp, recommendation: Zap, document: Link2,
  schedule: CheckSquare, signal: TrendingUp, decision: CheckCircle2, action: Zap,
  animal: Circle, plot: MapPin, observation: Eye, external_observation: Eye,
  quality_cluster: Unlink,
};
const ENTITY_CONFIG = Object.freeze(Object.fromEntries(
  Object.entries(COMPANY_GRAPH_PRESENTATION_REGISTRY).map(([type, presentation]) => [type, {
    icon: ENTITY_ICONS[type] || Circle,
    label: presentation.label,
    color: presentation.accent,
    shape: presentation.shape,
    preferredLayouts: presentation.preferredLayouts,
  }]),
));

const reportGraphError = (title, error) => showNotice({
  title,
  message: error?.message || "The requested Company Graph action could not be completed.",
  tone: "error",
});
const graphMotionDuration = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ? 0 : 350;

// ── Cytoscape graph style ─────────────────────────────────────────────────────
const CY_STYLE = [
  {
    selector: "node",
    style: {
      "background-color":   "data(nodeColor)",
      "shape":              "data(shape)",
      "label":              "data(label)",
      "color":              "#334155",
      "text-valign":        "center",
      "text-halign":        "center",
      "font-size":          "9px",
      "font-weight":        "700",
      "text-wrap":          "ellipsis",
      "text-max-width":     "64px",
      "width":              "data(size)",
      "height":             "data(size)",
      "border-color":       "data(borderColor)",
      "border-width":       "data(borderWidth)",
      "border-opacity":     1,
      "text-outline-width": 0,
      "shadow-blur":        12,
      "shadow-color":       "#64748b",
      "shadow-opacity":     0.14,
      "shadow-offset-y":    3,
      "transition-property": "background-color, border-color, border-width, opacity",
      "transition-duration": "200ms",
    },
  },
  {
    selector: "node.zoom-medium",
    style: {
      "label": "data(mediumLabel)",
      "shape": "round-rectangle",
      "width": "data(cardWidth)",
      "height": 48,
      "text-wrap": "wrap",
      "text-max-width": "140px",
      "font-size": "10px",
    },
  },
  {
    selector: "node.zoom-close",
    style: {
      "label": "data(detailLabel)",
      "shape": "round-rectangle",
      "width": "data(cardWidth)",
      "height": "data(cardHeight)",
      "text-wrap": "wrap",
      "text-max-width": "150px",
      "font-size": "11px",
      "line-height": 1.35,
    },
  },
  {
    selector: "node.presentation-cluster",
    style: {
      "background-fill": "linear-gradient",
      "background-gradient-stop-colors": "#f8fafc #e2e8f0",
      "border-style": "dashed",
      "border-width": 3,
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
      "border-color": "#059669",
      "border-width":  4,
      "shadow-color": "#10b981",
      "shadow-opacity": 0.35,
      "shadow-blur": 18,
    },
  },
  {
    selector: "node.dimmed",
    style: { "opacity": 0.2 },
  },
  {
    selector: "node.highlighted",
    style: {
      "border-color": "#0d9488",
      "border-width":  4,
      "opacity":       1,
    },
  },
  {
    selector: "edge",
    style: {
      "line-color":         "#64748b",
      "width":              "data(width)",
      "opacity":            0.82,
      "curve-style":        "bezier",
      "target-arrow-shape": "triangle",
      "target-arrow-color": "#64748b",
      "arrow-scale":        1.05,
      "transition-property": "line-color, target-arrow-color, width, opacity",
      "transition-duration": "160ms",
    },
  },
  {
    selector: "edge.assertion-operator-confirmed-assertion",
    style: { "line-color": "#059669", "target-arrow-color": "#059669", "line-style": "solid" },
  },
  {
    selector: "edge.assertion-deterministic-derivation, edge.assertion-canonical-reference-projection",
    style: { "line-color": "#2563eb", "target-arrow-color": "#2563eb", "line-style": "dashed" },
  },
  {
    selector: "edge.assertion-analytical-inference",
    style: { "line-color": "#7c3aed", "target-arrow-color": "#7c3aed", "line-style": "dashed" },
  },
  {
    selector: "edge.assertion-external-observation",
    style: { "line-color": "#0891b2", "target-arrow-color": "#0891b2", "line-style": "dashed" },
  },
  {
    selector: "edge.assertion-advisor-proposal, edge.edge-proposed",
    style: { "line-color": "#d97706", "target-arrow-color": "#d97706", "line-style": "dashed" },
  },
  {
    selector: "edge.edge-derived",
    style: { "line-style": "dashed", "opacity": 0.55 },
  },
  {
    selector: "edge.edge-disputed",
    style: {
      "line-color": "#f43f5e", "target-arrow-color": "#f43f5e",
      "line-style": "dotted", "width": 4,
    },
  },
  {
    selector: "edge.edge-expired",
    style: {
      "line-color": "#64748b", "target-arrow-color": "#64748b",
      "line-style": "dashed", "opacity": 0.3,
    },
  },
  {
    selector: "edge.edge-rejected",
    style: { "display": "none" },
  },
  {
    selector: "edge.show-label, edge.highlighted",
    style: {
      "label": "data(label)", "color": "#334155", "font-size": "10px",
      "font-weight": "700", "text-background-color": "#ffffff", "text-background-opacity": 0.94,
      "text-background-padding": "4px", "text-background-shape": "roundrectangle", "text-rotation": "autorotate",
    },
  },
  {
    selector: "edge.has-evidence",
    style: { "source-arrow-shape": "circle", "source-arrow-color": "#4f46e5", "source-arrow-fill": "filled" },
  },
  {
    selector: "edge:selected",
    style: {
      "line-color": "#059669", "target-arrow-color": "#059669",
      "width": 5, "opacity": 1, "label": "data(detailLabel)", "color": "#334155",
      "font-size": "11px", "font-weight": "700", "text-background-color": "#ffffff",
      "text-background-opacity": 0.96, "text-background-padding": "5px", "text-background-shape": "roundrectangle",
      "text-rotation": "autorotate",
    },
  },
  {
    selector: "edge.hovered",
    style: {
      "line-color": "#0d9488", "target-arrow-color": "#0d9488", "opacity": 1,
      "label": "data(detailLabel)", "color": "#334155", "font-size": "10px",
      "text-background-color": "#ffffff", "text-background-opacity": 0.96,
      "text-background-padding": "4px", "text-background-shape": "roundrectangle", "text-rotation": "autorotate",
    },
  },
  {
    selector: "edge.highlighted",
    style: {
      "line-color": "#0d9488",
      "opacity":    0.9,
    },
  },
  {
    selector: "edge.dimmed",
    style: { "opacity": 0.05 },
  },
  {
    selector: ".hover-dim",
    style: { "opacity": 0.08 },
  },
  {
    selector: "node.hover-endpoint",
    style: { "border-color": "#0d9488", "border-width": 4, "opacity": 1 },
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

const COMPANY_GRAPH_PROMPTS = [
  { question: "Explain this company.", intent: IDJWI_GRAPH_INTENTS.EXPLAIN_COMPANY_GRAPH },
  { question: "What changed this week?", intent: IDJWI_GRAPH_INTENTS.EXPLAIN_GRAPH_CHANGE },
  { question: "What is disconnected?", intent: IDJWI_GRAPH_INTENTS.FIND_GRAPH_GAPS },
  { question: "Where are the biggest risks?", intent: IDJWI_GRAPH_INTENTS.RECOMMEND_GRAPH_ACTION },
  { question: "Which opportunities are most actionable?", intent: IDJWI_GRAPH_INTENTS.RECOMMEND_GRAPH_ACTION },
  { question: "What should we do today?", intent: IDJWI_GRAPH_INTENTS.RECOMMEND_GRAPH_ACTION },
  { question: "Which external events may disrupt our operation?", intent: IDJWI_GRAPH_INTENTS.EXPLAIN_EXTERNAL_OBSERVATION },
];

function openIdjwiGraphAction(question, intent, context, extraContext = {}) {
  window.dispatchEvent(new CustomEvent("open-idjwi-panel", {
    detail: { initialMessage: question, context: { ...context, ...extraContext, intent } },
  }));
}
// ── Context Panel ─────────────────────────────────────────────────────────────
function ContextPanel({
  selected, onClose, navigate, companyId, onGraphRefresh, graphContext,
  onInspectNode, onExpand, neighborhoodDepth = 1, inspectionState,
  isPinned, onTogglePin, isCompared, onToggleCompare,
  onExpandCluster, onCreateRepairWork,
  onRestorePrevious, canRestorePrevious = false,
  onCandidateDecision,
  insights = [], risks = [], opportunities = [],
}) {
  if (!selected) {
    return (
      <div className="flex flex-col h-full">
        <div className="p-5 border-b border-slate-100">
          <p className="text-sm font-bold text-slate-700">Company Graph</p>
          <p className="text-xs text-slate-400 mt-1">Inspect authorized records, governed relationships, and their evidence.</p>
        </div>
        <div className="p-4 flex-1 overflow-y-auto space-y-3">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Ask Idjwi</p>
          {COMPANY_GRAPH_PROMPTS.map(({ question, intent }) => (
            <button
              key={question}
              onClick={() => openIdjwiGraphAction(question, intent, graphContext)}
              className="w-full text-left px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700 hover:bg-violet-50 hover:border-violet-200 hover:text-violet-700 transition-colors flex items-center gap-2"
            >
              <Sparkles className="w-3.5 h-3.5 shrink-0 text-violet-400" />
              {question}
            </button>
          ))}
        </div>
        <div className="p-4 border-t border-slate-50">
          <p className="text-[11px] text-slate-300 text-center">Drag to pan · Scroll to zoom · Click node to inspect</p>
        </div>
      </div>
    );
  }

  if (selected.edge) {
    const { edge, sourceNode, targetNode } = selected;
    const relationshipCandidate = selected.relationshipCandidate;
    const evidence = edge.evidence?.[0] || {};
    const isFact = ["canonical_relationship", "operator_confirmed_assertion"].includes(edge.assertion_class);
    const canPropose = edge.permitted_actions?.some(action => action.action === "record_proposal" && action.allowed);
    const canConfirm = edge.permitted_actions?.some(action => action.action === "confirm" && action.allowed);
    const canReject = edge.permitted_actions?.some(action => action.action === "reject" && action.allowed);
    const assertionHistory = (graphContext?.assertion_history || []).filter(event => event.assertion_key === edge.assertion_key);
    const govern = async action => {
      const correctedPredicate = action === "edit"
        ? await requestText({
            title: "Correct relationship predicate",
            message: "Enter the governed predicate that accurately describes this connection.",
            label: "Governed predicate",
            defaultValue: edge.predicate || edge.relationship_type || "",
            confirmLabel: "Continue",
          })
        : null;
      if (action === "edit" && (!correctedPredicate?.trim() || correctedPredicate.trim() === edge.predicate)) return;
      const prompt = action === "confirm"
        ? "Why should this relationship become canonical?"
        : action === "reject"
          ? "Why is this connection incorrect?"
          : action === "edit"
            ? "Why is this relationship correction required?"
            : "Why should this possible relationship be recorded for governed review?";
      const reason = await requestText({
        title: `${action.charAt(0).toUpperCase()}${action.slice(1)} relationship`,
        message: prompt,
        label: "Evidence-based reason",
        confirmLabel: "Continue",
      }) || "";
      if (!reason.trim()) return;
      const approvalConfirmed = !["confirm", "edit"].includes(action) || await requestConfirmation({
        title: "Approve canonical relationship",
        message: "Approve this relationship as a canonical organizational fact? This decision will be recorded in the audit history.",
        confirmLabel: "Approve relationship",
      });
      if (!approvalConfirmed) return;
      const [sourceType, sourceId] = String(edge.source).split(":");
      const [targetType, targetId] = String(edge.target).split(":");
      const response = await fetch(`${RAILWAY_URL}/company-graph/relationship/${action}`, {
        method: "POST", headers: await authHeaders(),
        body: JSON.stringify({ company_id: companyId, edge_id: edge.id, source_type: sourceType, source_id: sourceId, target_type: targetType, target_id: targetId, predicate: edge.predicate || edge.relationship_type, corrected_predicate: correctedPredicate?.trim(), reason: reason.trim(), approval_confirmed: approvalConfirmed }),
      });
      if (!response.ok) {
        const detail = await response.json().catch(() => ({}));
        throw new Error(detail?.detail?.message || `Relationship ${action} failed`);
      }
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
          {canRestorePrevious && <button onClick={onRestorePrevious} className="rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-bold text-slate-600">Previous</button>}
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="rounded-xl bg-slate-950 text-white p-3 text-xs">
            <p className="font-bold">{sourceNode?.label || edge.source}</p>
            <p className="my-2 text-amber-300 font-semibold">→ {(edge.label || edge.predicate || "related to").replaceAll("_", " ")} →</p>
            <p className="font-bold">{targetNode?.label || edge.target}</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <span className={`text-[11px] font-bold px-2 py-1 rounded-full ${isFact ? "bg-emerald-100 text-emerald-700" : "bg-violet-100 text-violet-700"}`}>{isFact ? "Verified fact" : "Derived connection"}</span>
            <span className="text-[11px] font-bold px-2 py-1 rounded-full bg-slate-100 text-slate-600">{Math.round((edge.confidence ?? 0) * 100)}% confidence</span>
            <span className="text-[11px] font-bold px-2 py-1 rounded-full bg-slate-100 text-slate-600 capitalize">{edge.status || "active"}</span>
            <span className="text-[11px] font-bold px-2 py-1 rounded-full bg-slate-100 text-slate-600 capitalize">{(edge.verification_state || "unverified").replaceAll("_", " ")}</span>
          </div>
          <div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">Why this connection exists</p>
            <p className="text-xs text-slate-700 leading-relaxed">{evidence.explanation || "The graph projection found a canonical reference between these records."}</p>
          </div>
          <div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">Evidence ({edge.evidence?.length || 0})</p>
            <div className="space-y-1.5">
              {(edge.evidence || []).map(item => (
                <div key={item.evidence_id} className="rounded-lg border border-slate-200 p-2 text-[11px]">
                  <p className="font-bold text-slate-700 break-all">{item.evidence_id}</p>
                  <p className="text-slate-500 mt-0.5">{item.explanation}</p>
                  <p className="text-slate-400 mt-1">{item.source_zone} · {item.source_table} · record {item.source_record_id}</p>
                </div>
              ))}
              {!edge.evidence?.length && <p className="text-[11px] text-amber-600">No governed evidence record was returned for this relationship.</p>}
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 divide-y divide-slate-100 text-xs">
            {[["Source", evidence.source_table || "Canonical ontology"], ["Record", evidence.source_record_id || "Not provided"], ["Data zone", evidence.source_zone || "canonical"], ["Assertion", (edge.assertion_class || "unclassified").replaceAll("_", " ")], ["Assertion state", (edge.assertion_state || edge.status || "active").replaceAll("_", " ")], ["Contradictions", edge.contradictions?.length ? `${edge.contradictions.length} disclosed` : "None disclosed"], ["Rule", evidence.derivation_rule || (isFact ? "Direct tenant assertion" : "Governed projection")], ["Valid from", edge.temporal?.valid_from || "Not specified"], ["Valid to", edge.temporal?.valid_to || "Current"], ["Observed", edge.temporal?.observed_at || "Not specified"], ["Confirmed", edge.temporal?.confirmed_at || "Not confirmed"], ["Rejected", edge.temporal?.rejected_at || "Not rejected"]].map(([label, value]) => (
              <div key={label} className="flex gap-3 justify-between p-2.5"><span className="text-slate-400">{label}</span><span className="text-slate-700 font-medium text-right break-all">{value}</span></div>
            ))}
          </div>
          <div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">Assertion history</p>
            {assertionHistory.length ? (
              <div className="space-y-1.5">
                {assertionHistory.map((event, index) => (
                  <div key={`${event.occurred_at || "event"}-${index}`} className="rounded-lg border border-slate-200 p-2 text-[11px] text-slate-600">
                    <p className="font-bold capitalize">{event.from_state || "new"} → {event.to_state}</p>
                    <p>{event.reason || "No reason recorded"}</p>
                    <p className="text-slate-400">{event.occurred_at ? new Date(event.occurred_at).toLocaleString() : "Time unavailable"} · evidence v{event.evidence_version || 1}</p>
                  </div>
                ))}
              </div>
            ) : <p className="text-[11px] text-slate-400">No operator state changes have been recorded for this assertion.</p>}
          </div>
          <button
            onClick={() => openIdjwiGraphAction(
              `Explain why ${sourceNode?.label || edge.source} is connected to ${targetNode?.label || edge.target} through ${edge.predicate || edge.relationship_type}.`,
              IDJWI_GRAPH_INTENTS.EXPLAIN_RELATIONSHIP, graphContext,
              { graph_edge: edge, selected_edge_id: edge.id },
            )}
            className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700"
          ><Sparkles className="w-3.5 h-3.5" /> Ask Idjwi about this connection</button>
          <div className="grid grid-cols-2 gap-2">
            {relationshipCandidate?.assertion_state === "proposed" && <>
              <button onClick={() => onCandidateDecision?.(relationshipCandidate, "confirm")} className="py-2 rounded-xl text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">Confirm proposal</button>
              <button onClick={async () => {
                const corrected = await requestText({ title: "Edit relationship predicate", message: "Enter the governed predicate that accurately describes this proposed connection.", label: "Governed predicate", defaultValue: relationshipCandidate.predicate || "", confirmLabel: "Review correction" });
                if (corrected?.trim() && corrected.trim() !== relationshipCandidate.predicate) onCandidateDecision?.(relationshipCandidate, "confirm", corrected.trim());
              }} className="py-2 rounded-xl text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">Edit proposal</button>
              <button onClick={() => onCandidateDecision?.(relationshipCandidate, "reject")} className="py-2 rounded-xl text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">Reject proposal</button>
            </>}
            {canPropose && <button onClick={() => govern("propose").catch(error => showNotice({ title: "Relationship proposal failed", message: error.message, tone: "error" }))} className="py-2 rounded-xl text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">Record proposal</button>}
            {canConfirm && <button onClick={() => govern("confirm").catch(error => showNotice({ title: "Relationship confirmation failed", message: error.message, tone: "error" }))} className="py-2 rounded-xl text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">Confirm</button>}
            {canConfirm && <button onClick={() => govern("edit").catch(error => showNotice({ title: "Relationship correction failed", message: error.message, tone: "error" }))} className="py-2 rounded-xl text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">Edit & confirm</button>}
            {canReject && <button onClick={() => govern("reject").catch(error => showNotice({ title: "Relationship rejection failed", message: error.message, tone: "error" }))} className="py-2 rounded-xl text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">Reject</button>}
            <button onClick={() => navigate(createPageUrl("Relationships"))} className="py-2 rounded-xl text-xs font-bold bg-slate-50 text-slate-700 border border-slate-200">Edit in Relationships</button>
            {!canPropose && <button onClick={() => openIdjwiGraphAction(
              `Recommend the governed next action for relationship ${edge.id}.`,
              IDJWI_GRAPH_INTENTS.RECOMMEND_GRAPH_ACTION, graphContext,
              { graph_edge: edge, selected_edge_id: edge.id, correction_requested: true },
            )} className="py-2 rounded-xl text-xs font-bold bg-violet-50 text-violet-700 border border-violet-200">Ask next action</button>}
          </div>
        </div>
      </div>
    );
  }

  const { node, connectedNodes, connectedEdges = [] } = selected;
  const connectedById = new Map(connectedNodes.map(item => [item.id, item]));
  const relationshipGroups = [
    {
      label: "Outgoing",
      edges: connectedEdges.filter(edge => edge.source === node.id),
      endpoint: edge => connectedById.get(edge.target),
    },
    {
      label: "Incoming",
      edges: connectedEdges.filter(edge => edge.target === node.id),
      endpoint: edge => connectedById.get(edge.source),
    },
  ];
  const operationalGroups = [
    { label: "Risks", types: ["risk"], color: "text-rose-600 bg-rose-50" },
    { label: "Work", types: ["task", "schedule"], color: "text-orange-600 bg-orange-50" },
    { label: "Decisions", types: ["decision", "recommendation"], color: "text-blue-600 bg-blue-50" },
    { label: "Actions", types: ["action"], color: "text-violet-600 bg-violet-50" },
  ].map(group => ({
    ...group,
    nodes: connectedNodes.filter(item => group.types.includes(item.entity_type)),
  }));

  // App-generated signals referencing this entity
  const appSignals = [
    ...risks.filter(r => r.subject_id === node.id).map(r => ({ ...r, _kind: "risk" })),
    ...insights.filter(i => i.subject_id === node.id).map(i => ({ ...i, _kind: "insight" })),
    ...opportunities.filter(o => o.subject_id === node.id).map(o => ({ ...o, _kind: "opportunity" })),
  ].sort((a, b) => new Date(b.created_date || 0) - new Date(a.created_date || 0));

  const cfg = ENTITY_CONFIG[node.entity_type] || {};
  const Icon = cfg.icon || Circle;
  const meta = node.attributes || {};

  const details = [];
  if (meta.enterprise_type || meta.person_type || meta.item_type || meta.task_type || meta.transaction_type)
    details.push({ label: "Type", value: meta.enterprise_type || meta.person_type || meta.item_type || meta.task_type || meta.transaction_type });
  if (meta.status)
    details.push({ label: "Status", value: meta.status });
  if (meta.city || meta.country)
    details.push({ label: "Location", value: [meta.city, meta.country].filter(Boolean).join(", ") });
  if (meta.priority)
    details.push({ label: "Priority", value: meta.priority });
  if (meta.severity)
    details.push({ label: "Severity", value: meta.severity });

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
        <button onClick={() => onTogglePin?.(node)} title={isPinned ? "Unpin node" : "Pin node"} aria-label={isPinned ? "Unpin node" : "Pin node"} className={`p-1.5 rounded-lg border ${isPinned ? "bg-amber-50 text-amber-700 border-amber-200" : "text-slate-400 border-slate-200 hover:bg-slate-50"}`}>
          <Pin className="w-3.5 h-3.5" />
        </button>
        {canRestorePrevious && <button onClick={onRestorePrevious} className="rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-bold text-slate-600">Previous</button>}
        <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 shrink-0">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {inspectionState?.status === "loading" && (
          <div className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-[11px] text-blue-700 flex items-center gap-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading governed neighborhood…
          </div>
        )}
        {inspectionState?.status === "error" && (
          <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] text-rose-700">
            <p className="font-bold">Neighborhood retrieval failed</p>
            <p className="mt-0.5">{inspectionState.error}</p>
          </div>
        )}
        {/* Status badges */}
        <div className="flex flex-wrap gap-1.5">
          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
            importance {Math.round((node.importance || 0) * 100)}%
          </span>
          {node.risk_level && (
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-700">
              {node.risk_level} risk
            </span>
          )}
          {node.has_opportunity && (
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
              opportunity
            </span>
          )}
          {node.is_unconnected && (
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-400">
              unconnected
            </span>
          )}
        </div>

        {node.presentation_only && Array.isArray(meta.member_ids) && meta.member_ids.length > 0 && (
          <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-[11px] text-slate-700">
            <p className="font-black text-indigo-900">Governed summary cluster</p>
            <p className="mt-1 leading-relaxed">{meta.explanation || "Authorized lower-attention records were summarized to preserve an understandable operational view."}</p>
            <p className="mt-2 text-[11px] text-slate-500">Why summarized: {meta.reason || "bounded operational relevance"}</p>
            <p className="text-[11px] text-slate-500">Source pattern: {meta.source_summary || "multiple authorized sources"}</p>
            <p className="text-[11px] text-emerald-700">Critical and high-importance records are never concealed in this cluster.</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button onClick={() => onExpandCluster?.(node)} className="rounded-lg border border-indigo-200 bg-white px-2 py-2 font-bold text-indigo-700">Expand {meta.record_count || ""} records</button>
              <button onClick={() => openIdjwiGraphAction(
                `Explain why these ${meta.record_count || ""} records were summarized and what deserves attention.`,
                IDJWI_GRAPH_INTENTS.EXPLAIN_NODE, graphContext,
                { selected_node_id: node.id, graph_cluster: node },
              )} className="rounded-lg bg-emerald-600 px-2 py-2 font-bold text-white">Ask Idjwi</button>
              {meta.repair_eligible && <button onClick={() => onCreateRepairWork?.(node)} className="col-span-2 rounded-lg border border-amber-200 bg-amber-50 px-2 py-2 font-bold text-amber-800">Create governed repair work</button>}
            </div>
          </div>
        )}
        {node.presentation_only && (!Array.isArray(meta.member_ids) || meta.member_ids.length === 0) && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-[11px] text-slate-700">
            <p className="font-black">Bounded graph summary</p>
            <p className="mt-1">{meta.explanation || "Records outside the bounded operational packet are summarized without exposing or inventing their details."}</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button onClick={() => navigate(createPageUrl("DataReadiness"))} className="rounded-lg border border-slate-200 bg-white px-2 py-2 font-bold">Open Data Readiness</button>
              <button onClick={() => openIdjwiGraphAction(
                `Explain this bounded graph summary: ${node.label}.`,
                IDJWI_GRAPH_INTENTS.EXPLAIN_NODE, graphContext,
                { selected_node_id: node.id, graph_cluster: node },
              )} className="rounded-lg bg-emerald-600 px-2 py-2 font-bold text-white">Ask Idjwi</button>
            </div>
          </div>
        )}

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

        {node.permitted_actions?.length > 0 && <div><p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-slate-400">Permitted actions</p><div className="flex flex-wrap gap-1">{node.permitted_actions.map(action => <span key={action.action} className={`rounded-full px-2 py-1 text-[11px] font-bold ${action.allowed ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-400"}`}>{action.action.replaceAll("_", " ")}{action.requires_approval ? " · approval" : ""}</span>)}</div></div>}

        {relationshipGroups.map(group => group.edges.length > 0 && (
          <div key={group.label}>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">
              {group.label} relationships ({group.edges.length})
            </p>
            <div className="space-y-1">
              {group.edges.slice(0, 10).map(edge => {
                const endpoint = group.endpoint(edge);
                const endpointConfig = ENTITY_CONFIG[endpoint?.entity_type] || {};
                const EndpointIcon = endpointConfig.icon || Circle;
                return (
                  <button key={edge.id} onClick={() => endpoint && onInspectNode?.(endpoint)} className="w-full flex items-center gap-2 p-2 rounded-lg border border-slate-100 hover:bg-slate-50 text-left">
                    <EndpointIcon className="w-3.5 h-3.5 shrink-0" style={{ color: endpointConfig.color || "#64748b" }} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[11px] font-semibold text-slate-700 truncate">{endpoint?.label || (group.label === "Outgoing" ? edge.target : edge.source)}</span>
                      <span className="block text-[11px] text-amber-600 capitalize truncate">{(edge.predicate || edge.relationship_type || "related to").replaceAll("_", " ")}</span>
                    </span>
                    <span className="text-[11px] text-slate-400">{Math.round((edge.confidence ?? 0) * 100)}%</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        {operationalGroups.some(group => group.nodes.length) && (
          <div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">Operational context</p>
            <div className="grid grid-cols-2 gap-2">
              {operationalGroups.map(group => (
                <div key={group.label} className={`rounded-xl p-2.5 ${group.color}`}>
                  <p className="text-[11px] font-black uppercase">{group.label} · {group.nodes.length}</p>
                  {group.nodes.slice(0, 3).map(item => (
                    <button key={item.id} onClick={() => onInspectNode?.(item)} className="block w-full text-left text-[11px] truncate mt-1 hover:underline">{item.label}</button>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* App signals */}
        {appSignals.length > 0 && (
          <div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">
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
                        <span className="text-[11px] font-bold text-slate-400 uppercase">{appLabel}</span>
                        {sev !== "info" && (
                          <span className={`text-[11px] font-bold uppercase ${sevStyle.text} opacity-70`}>
                            {sev}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              {appSignals.length > 6 && (
                <p className="text-[11px] text-slate-400">+{appSignals.length - 6} more signals</p>
              )}
            </div>
          </div>
        )}

        {/* AI prompts */}
        <div>
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">Ask Idjwi</p>
          <div className="space-y-1.5">
            {[
              `Explain this ${node.entity_type}: ${node.label}`,
              `What risks are connected to ${node.label}?`,
              `What actions are open for ${node.label}?`,
              `What external data do we know about ${node.label}?`,
            ].map(q => (
              <button
                key={q}
                onClick={() => openIdjwiGraphAction(q, node.entity_type === "external_observation" ? IDJWI_GRAPH_INTENTS.EXPLAIN_EXTERNAL_OBSERVATION : IDJWI_GRAPH_INTENTS.EXPLAIN_NODE, graphContext, { entity_type: node.entity_type, entity_id: node.id, entity_label: node.label, selected_node_id: node.id })}
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
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => onExpand?.(node)} disabled={neighborhoodDepth >= 3 || inspectionState?.status === "loading"} className="py-2 rounded-xl text-xs font-bold bg-slate-50 text-slate-700 border border-slate-200 disabled:opacity-40">
            Expand one level
          </button>
          <button onClick={() => onToggleCompare?.(node)} className={`py-2 rounded-xl text-xs font-bold border ${isCompared ? "bg-blue-100 text-blue-700 border-blue-300" : "bg-blue-50 text-blue-700 border-blue-200"}`}>
            {isCompared ? "Remove compare" : "Compare node"}
          </button>
        </div>
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
          onClick={() => openIdjwiGraphAction(copilotQ, node.entity_type === "external_observation" ? IDJWI_GRAPH_INTENTS.EXPLAIN_EXTERNAL_OBSERVATION : IDJWI_GRAPH_INTENTS.EXPLAIN_NODE, graphContext, { entity_type: node.entity_type, entity_id: node.id, entity_label: node.label, selected_node_id: node.id })}
          className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold bg-violet-50 text-violet-700 border border-violet-200 hover:bg-violet-100 transition-colors"
        >
          <Sparkles className="w-3.5 h-3.5" />
          Ask Idjwi about this
        </button>
      </div>
    </div>
  );
}
// ── Graph Canvas ──────────────────────────────────────────────────────────────
export function LegacyAccessibleGraphView({ mode, nodes, edges, onInspectNode, onInspectEdge }) {
  const byId = new Map(nodes.map(node => [node.id, node]));
  if (mode === "summary") return <section tabIndex={0} className="h-full overflow-auto rounded-2xl border bg-white p-5" aria-label="Textual graph summary"><h2 className="font-black">Company Graph textual summary</h2><p className="mt-2 text-sm">{nodes.length} authorized records and {edges.length} governed relationships are visible.</p><p className="mt-2 text-sm">{nodes.filter(node => !edges.some(edge => edge.source === node.id || edge.target === node.id)).length} records have no visible connection.</p></section>;
  if (mode === "relationships") return <div className="h-full overflow-auto rounded-2xl border bg-white"><table className="w-full text-left text-xs"><caption className="p-3 text-left font-black">Governed relationships</caption><thead><tr className="border-y bg-slate-50"><th className="p-3">Source</th><th className="p-3">Relationship</th><th className="p-3">Target</th><th className="p-3">State</th></tr></thead><tbody>{edges.map(edge => <tr key={edge.id} tabIndex={0} onClick={() => onInspectEdge(edge)} onKeyDown={event => event.key === "Enter" && onInspectEdge(edge)} className="cursor-pointer border-b focus:bg-indigo-50"><td className="p-3">{byId.get(edge.source)?.label || edge.source}</td><td className="p-3 font-bold">{edge.label || edge.predicate}</td><td className="p-3">{byId.get(edge.target)?.label || edge.target}</td><td className="p-3">{edge.assertion_state}; {Math.round((edge.confidence || 0) * 100)}% confidence</td></tr>)}</tbody></table></div>;
  if (mode === "outline") return <section className="h-full overflow-auto rounded-2xl border bg-white p-4" aria-label="Hierarchical neighborhood outline"><h2 className="font-black">Relationship outline</h2><ul className="mt-3 space-y-3">{nodes.map(node => <li key={node.id}><button onClick={() => onInspectNode(node)} className="font-bold text-indigo-700 focus:ring-2">{node.label}</button><ul className="ml-5 list-disc text-xs">{edges.filter(edge => edge.source === node.id).map(edge => <li key={edge.id}>{edge.label || edge.predicate} → {byId.get(edge.target)?.label || edge.target}</li>)}</ul></li>)}</ul></section>;
  return <section className="h-full overflow-auto rounded-2xl border bg-white p-3" aria-label="Keyboard navigable graph records"><h2 className="px-2 font-black">Authorized records</h2><div className="mt-2 grid gap-2 sm:grid-cols-2">{nodes.map(node => <button key={node.id} onClick={() => onInspectNode(node)} className="rounded-xl border p-3 text-left focus:ring-2"><span className="block text-xs font-black">{node.label}</span><span className="text-[11px]">{node.entity_type}; status {node.status || "not available"}; {edges.filter(edge => edge.source === node.id || edge.target === node.id).length} relationships</span></button>)}</div></section>;
}

function GraphCanvas({ elements, layoutMode, onNodeSelect, onEdgeSelect, highlightTypes, activeFilter, focusNodeId, focusNodeIds = [], focusEdgeId, expansionMode = null, onExpandGraph, onExpandWorkspace, onCloseExpansion, graphExpandButtonRef, workspaceExpandButtonRef, legendExpanded, onToggleLegend, viewportRef }) {
  const containerRef = useRef(null);
  const cyRef        = useRef(null);

  const elementsKey = useMemo(
    () => elements.map(e => e.data.id).join(","),
    [elements],
  );

  // Re-init on element change
  useEffect(() => {
    if (!containerRef.current || elements.length === 0) return;
    const prefersContrast = window.matchMedia?.("(prefers-contrast: more)")?.matches;

    if (cyRef.current) { cyRef.current.destroy(); cyRef.current = null; }

    const cy = cytoscape({
      container:           containerRef.current,
      elements,
      style:               prefersContrast ? [...CY_STYLE, {
        selector: "edge",
        style: { "width": 3, "opacity": 1, "arrow-scale": 1.3 },
      }, {
        selector: "node",
        style: { "border-width": 3, "color": "#0f172a" },
      }] : CY_STYLE,
      layout: {
        name:              "preset",
        fit:               true,
        padding:           70,
        animate:           false,
      },
      userZoomingEnabled:  true,
      userPanningEnabled:  true,
      boxSelectionEnabled: false,
      minZoom:             0.08,
      maxZoom:             3,
    });

    const restoreViewport = () => {
      cy.resize();
      const viewport = viewportRef?.current;
      if (viewport?.zoom && viewport?.pan) {
        cy.viewport({ zoom: viewport.zoom, pan: viewport.pan });
      } else {
        cy.fit(undefined, 70);
      }
    };
    requestAnimationFrame(restoreViewport);
    const rememberViewport = () => {
      if (viewportRef) viewportRef.current = { zoom: cy.zoom(), pan: cy.pan() };
    };
    cy.on("pan zoom", rememberViewport);
    const resizeObserver = new ResizeObserver(entries => {
      const box = entries[0]?.contentRect;
      if (!box || box.width < 1 || box.height < 1) return;
      const viewport = viewportRef?.current;
      cy.resize();
      if (viewport?.zoom && viewport?.pan) cy.viewport({ zoom: viewport.zoom, pan: viewport.pan });
    });
    resizeObserver.observe(containerRef.current);
    window.addEventListener("resize", restoreViewport);

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
    cy.on("mouseover", "edge", evt => {
      const edge = evt.target;
      const endpoints = edge.connectedNodes();
      cy.elements().removeClass("hovered hover-endpoint hover-dim");
      edge.addClass("hovered");
      endpoints.addClass("hover-endpoint");
      cy.elements().not(edge).not(endpoints).addClass("hover-dim");
    });
    cy.on("mouseout", "edge", () => cy.elements().removeClass("hovered hover-endpoint hover-dim"));
    const applyZoomDetail = () => {
      const zoom = cy.zoom();
      cy.nodes().removeClass("zoom-distant zoom-medium zoom-close");
      cy.nodes().addClass(zoom >= 0.9 ? "zoom-close" : zoom >= 0.42 ? "zoom-medium" : "zoom-distant");
    };
    cy.on("zoom", applyZoomDetail);
    if (cy.edges().length <= 30 || layoutMode !== "full_graph") {
      cy.edges().addClass("show-label");
    }
    applyZoomDetail();

    cy.on("tap", evt => {
      if (evt.target === cy) {
        cy.elements().removeClass("highlighted dimmed");
        cy.$(":selected").unselect();
        onNodeSelect(null);
      }
    });

    cyRef.current = cy;
    return () => {
      rememberViewport();
      resizeObserver.disconnect();
      window.removeEventListener("resize", restoreViewport);
      if (cyRef.current) { cyRef.current.destroy(); cyRef.current = null; }
    };
  }, [elementsKey, layoutMode]);

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
    cyRef.current.animate({ center: { eles: node }, zoom: 1.35 }, { duration: graphMotionDuration() });
  }, [focusNodeId, elementsKey]);

  useEffect(() => {
    if (!cyRef.current || !focusNodeIds.length) return;
    const ids = new Set(focusNodeIds);
    const selected = cyRef.current.nodes().filter(node => ids.has(node.id()));
    if (!selected.length) return;
    cyRef.current.elements().removeClass("highlighted dimmed");
    selected.addClass("highlighted");
    selected.connectedEdges().addClass("highlighted");
    cyRef.current.elements().not(".highlighted").addClass("dimmed");
    cyRef.current.animate({ fit: { eles: selected.union(selected.connectedEdges()), padding: 100 } }, { duration: graphMotionDuration() });
  }, [focusNodeIds.join("|"), elementsKey]);

  useEffect(() => {
    if (!cyRef.current || !focusEdgeId) return;
    const edge = cyRef.current.getElementById(focusEdgeId);
    if (!edge.length) return;
    const endpoints = edge.connectedNodes();
    cyRef.current.elements().removeClass("highlighted dimmed");
    edge.addClass("highlighted");
    endpoints.addClass("highlighted");
    cyRef.current.elements().not(edge).not(endpoints).addClass("dimmed");
    cyRef.current.animate({ fit: { eles: edge.union(endpoints), padding: 100 } }, { duration: graphMotionDuration() });
  }, [focusEdgeId, elementsKey]);

  return (
    <div
      data-company-graph-canvas={expansionMode || "embedded"}
      data-layout-mode={layoutMode}
      className="relative flex-1 min-h-0 overflow-hidden rounded-2xl border border-slate-200 bg-[#f8faf9] shadow-inner"
      style={{
        backgroundImage: "radial-gradient(circle at 1px 1px, rgba(100,116,139,0.16) 1px, transparent 0)",
        backgroundSize: "24px 24px",
      }}
    >
      <div ref={containerRef} className="absolute inset-0" />
      <div className="absolute top-3 left-3 z-20 flex gap-1">
        <button aria-label="Reset graph view" title="Reset graph view" onClick={() => { cyRef.current?.fit(undefined, 40); if (cyRef.current && viewportRef) viewportRef.current = { zoom: cyRef.current.zoom(), pan: cyRef.current.pan() }; }} className="rounded-lg border border-slate-200 bg-white/95 p-2 text-slate-600 shadow-sm hover:border-slate-300 hover:text-slate-900"><RotateCcw className="w-3.5 h-3.5" /></button>
        {expansionMode ? (
          <button aria-label="Exit expanded graph" title="Exit expanded graph" onClick={onCloseExpansion} className="rounded-lg border border-slate-200 bg-white/95 p-2 text-slate-600 shadow-sm hover:border-slate-300 hover:text-slate-900"><Minimize2 className="w-3.5 h-3.5" /></button>
        ) : (
          <>
            <button ref={graphExpandButtonRef} aria-label="Expand graph canvas" title="Expand graph canvas" onClick={onExpandGraph} className="rounded-lg border border-slate-200 bg-white/95 p-2 text-slate-600 shadow-sm hover:border-slate-300 hover:text-slate-900"><Maximize2 className="w-3.5 h-3.5" /></button>
            <button ref={workspaceExpandButtonRef} aria-label="Expand graph workspace" title="Expand graph workspace with inspector and Idjwi" onClick={onExpandWorkspace} className="rounded-lg border border-slate-200 bg-white/95 p-2 text-slate-600 shadow-sm hover:border-slate-300 hover:text-slate-900"><ExternalLink className="w-3.5 h-3.5" /></button>
          </>
        )}
      </div>

      {/* Entity type legend */}
      <div className="absolute bottom-3 left-3 flex flex-wrap gap-1 max-w-xs pointer-events-none z-10">
        {Object.entries(ENTITY_CONFIG).filter(([t]) =>
          elements.some(e => e.data.entity_type === t)
        ).map(([type, cfg]) => (
          <div key={type} className="flex items-center gap-1 rounded-full border border-slate-200 bg-white/95 px-1.5 py-0.5 shadow-sm">
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: cfg.color }} />
            <span className="text-[11px] font-bold" style={{ color: cfg.color }}>{cfg.label}</span>
          </div>
        ))}
      </div>
      <div className="absolute bottom-3 right-3 hidden md:flex flex-col items-end gap-1.5 z-10">
        <button
          type="button"
          aria-expanded={legendExpanded}
          onClick={onToggleLegend}
          className="rounded-lg border border-slate-200 bg-white/95 px-2.5 py-1.5 text-[11px] font-bold text-slate-700 shadow-sm hover:border-slate-300"
        >
          Relationship legend {legendExpanded ? "−" : "+"}
        </button>
        {legendExpanded && (
          <div className="w-72 space-y-2 rounded-xl border border-slate-200 bg-white/95 p-3 text-[11px] text-slate-600 shadow-xl">
            <p><span className="font-black text-slate-800">Solid slate</span> — canonical relationship.</p>
            <p><span className="font-black text-emerald-700">Solid emerald</span> — operator-confirmed assertion.</p>
            <p><span className="font-black text-blue-700">Dashed blue</span> — deterministic derivation or reference projection.</p>
            <p><span className="font-black text-violet-700">Dashed violet</span> — analytical inference.</p>
            <p><span className="font-black text-cyan-700">Dashed cyan</span> — external observation.</p>
            <p><span className="font-black text-amber-700">Dashed amber</span> — proposal awaiting review.</p>
            <p><span className="font-black text-rose-700">Dotted rose</span> — disputed assertion; rejected assertions appear only in history.</p>
            <p><span className="font-black text-slate-500">Faded slate</span> — expired or superseded relationship.</p>
            <p><span className="font-black text-indigo-700">Circle at source</span> — governed evidence is attached.</p>
            <p><span className="font-black text-slate-800">Arrow</span> — predicate direction from source to target.</p>
            <p className="border-t border-slate-200 pt-1 text-slate-500">Line weight reflects confidence. Hover to see predicate, state, confidence and evidence count; select to inspect evidence.</p>
          </div>
        )}
      </div>

      {/* Hint */}
      <div className="absolute top-3 right-3 pointer-events-none z-10">
        <p className="rounded-lg border border-slate-200 bg-white/90 px-2 py-1 text-[11px] text-slate-500 shadow-sm">
          Click node to inspect · Drag to pan · Scroll to zoom
        </p>
      </div>

      {elements.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <GitBranch className="mx-auto mb-3 h-10 w-10 text-slate-300" />
            <p className="text-sm text-slate-500">No data to show</p>
            <p className="mt-1 text-xs text-slate-400">Add entities to see your company graph</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function CompanyGraphHome() {
  const navigate  = useNavigate();
  const productSurface = new URLSearchParams(window.location.search).get("surface") === "desktop" ? "desktop" : "web";
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
  const [focusEdgeId, setFocusEdgeId] = useState("");
  const [neighborhoodGraph, setNeighborhoodGraph] = useState(null);
  const [inspectionTrail, setInspectionTrail] = useState([]);
  const [neighborhoodDepth, setNeighborhoodDepth] = useState(1);
  const [neighborhoodState, setNeighborhoodState] = useState({ status: "idle", error: "" });
  const [pinnedNodes, setPinnedNodes] = useState([]);
  const [compareNodes, setCompareNodes] = useState([]);
  const [idjwiWorkspaceWidth, setIdjwiWorkspaceWidth] = useState(0);
  const [continuedOverview, setContinuedOverview] = useState(null);
  const [loadingContinuation, setLoadingContinuation] = useState(false);
  const [expansionMode, setExpansionMode] = useState(null);
  const [expandedClusterIds, setExpandedClusterIds] = useState(new Set());
  const graphViewportRef = useRef(null);
  const graphPositionCacheRef = useRef(new Map());
  const graphExpandButtonRef = useRef(null);
  const workspaceExpandButtonRef = useRef(null);
  const expandedOverlayRef = useRef(null);
  const [sectionPreferences, setSectionPreferences] = useState(DEFAULT_COMPANY_GRAPH_SECTIONS);
  const [sectionPreferencesReady, setSectionPreferencesReady] = useState(false);
  const loadedPreferenceKeyRef = useRef("");
  const [selectedCandidates, setSelectedCandidates] = useState(new Set());
  const [candidateExplanations, setCandidateExplanations] = useState({});
  const [candidateAction, setCandidateAction] = useState("");
  const [lastRelationshipOutcome, setLastRelationshipOutcome] = useState(null);
  const [relationshipQueue, setRelationshipQueue] = useState({ state: "", confidence: "", source: "", age: "", sort: "priority", offset: 0 });
  const [qualityQueue, setQualityQueue] = useState({ severity: "", verification: "", sort: "priority", offset: 0 });
  const [governanceWorkspace, setGovernanceWorkspace] = useState(null);
  const [selectedCandidateId, setSelectedCandidateId] = useState("");
  const [selectedQualityFinding, setSelectedQualityFinding] = useState(null);
  const [expandedEvidence, setExpandedEvidence] = useState(new Set());
  const [graphRepresentation, setGraphRepresentation] = useState("visual");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [citationPreviousSelection, setCitationPreviousSelection] = useState(null);
  const [screenReaderMessage, setScreenReaderMessage] = useState("");
  const deviceCategory = companyGraphDeviceCategory(typeof window === "undefined" ? 1280 : window.innerWidth);
  const sectionPreferenceKey = companyGraphSectionPreferenceKey({
    tenantId: currentUser?.company_id,
    userId: currentUser?.id,
    surface: productSurface,
    deviceCategory,
  });
  useEffect(() => {
    if (!sectionPreferenceKey) { setSectionPreferencesReady(false); return; }
    let stored = {};
    try { stored = JSON.parse(window.localStorage.getItem(sectionPreferenceKey) || "{}"); } catch { stored = {}; }
    setSectionPreferences(normalizeCompanyGraphSections(stored));
    loadedPreferenceKeyRef.current = sectionPreferenceKey;
    setSectionPreferencesReady(true);
  }, [sectionPreferenceKey]);
  useEffect(() => {
    if (!sectionPreferenceKey || loadedPreferenceKeyRef.current !== sectionPreferenceKey) return;
    window.localStorage.setItem(sectionPreferenceKey, JSON.stringify(sectionPreferences));
  }, [sectionPreferenceKey, sectionPreferences]);
  const toggleSection = useCallback(section => {
    setSectionPreferences(current => {
      const next = { ...current, [section]: !current[section] };
      if (sectionPreferenceKey) window.localStorage.setItem(sectionPreferenceKey, JSON.stringify(next));
      return next;
    });
  }, [sectionPreferenceKey]);
  const briefingOpen = sectionPreferences.briefing;
  const relationshipReviewOpen = sectionPreferences.relationshipReview;
  const graphQualityOpen = sectionPreferences.graphQuality;
  const pageGuideOpen = sectionPreferences.pageGuide;
  const graphStatusOpen = sectionPreferences.graphStatus;
  const relationshipLegendOpen = sectionPreferences.relationshipLegend;
  const neighborhoodCoordinatorRef = useRef(null);
  if (!neighborhoodCoordinatorRef.current) {
    neighborhoodCoordinatorRef.current = createLatestGraphRequestCoordinator();
  }
  useEffect(() => () => neighborhoodCoordinatorRef.current?.cancel(), []);
  useEffect(() => {
    const coordinateWorkspace = event => {
      const detail = event.detail || {};
      setIdjwiWorkspaceWidth(detail.open && detail.coordinated ? Number(detail.width || 0) : 0);
    };
    window.addEventListener("idjwi-workspace-state", coordinateWorkspace);
    return () => window.removeEventListener("idjwi-workspace-state", coordinateWorkspace);
  }, []);
  const closeExpansion = useCallback(() => {
    setExpansionMode(current => {
      const restoreTarget = current === "workspace" ? workspaceExpandButtonRef : graphExpandButtonRef;
      requestAnimationFrame(() => {
        window.dispatchEvent(new Event("resize"));
        restoreTarget.current?.focus();
      });
      return null;
    });
  }, []);
  useEffect(() => {
    if (!expansionMode) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => expandedOverlayRef.current?.focus());
    const handleKeyDown = event => {
      if (event.key === "Escape") closeExpansion();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [expansionMode, closeExpansion]);
  useEffect(() => {
    if (!governanceWorkspace) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const close = event => { if (event.key === "Escape") setGovernanceWorkspace(null); };
    window.addEventListener("keydown", close);
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener("keydown", close); };
  }, [governanceWorkspace]);

  // ── Entity fetches ───────────────────────────────────────────────────────────
  const enabled = !!currentUser?.company_id || currentUser?.role === "super_admin";
  const isAdministrator = ["admin", "administrator", "super_admin"].includes(String(currentUser?.role || "").toLowerCase());

  const savedViewsQuery = useQuery({
    queryKey: ["company-graph-saved-views", currentUser?.company_id],
    enabled: enabled && !!currentUser?.company_id,
    staleTime: 30_000,
    queryFn: async () => {
      const response = await fetch(`${RAILWAY_URL}/company-graph/views?company_id=${encodeURIComponent(currentUser.company_id)}`, { headers: await authHeaders() });
      if (!response.ok) throw new Error("Governed saved views are unavailable");
      return response.json();
    },
  });
  const savedViews = savedViewsQuery.data?.views || [];
  const supportingCapabilitiesQuery = useQuery({
    queryKey: ["company-graph-supporting-capabilities", currentUser?.company_id],
    enabled: enabled && !!currentUser?.company_id,
    staleTime: 30_000,
    retry: false,
    queryFn: async () => {
      const headers = await authHeaders();
      const company = encodeURIComponent(currentUser.company_id);
      const entries = await Promise.all([
        requestCapability(`${RAILWAY_URL}/alerts/status?company_id=${company}`, { headers, availableWhen: payload => Boolean(payload?.channels) }),
        requestCapability(`${RAILWAY_URL}/agents/approvals/pending?company_id=${company}`, { headers, collectionKeys: ["pending"] }),
        requestCapability(`${RAILWAY_URL}/intelligence/inbox?company_id=${company}&limit=200`, { headers, collectionKeys: ["insights", "recommendations", "risks", "opportunities"] }),
        requestCapability(`${RAILWAY_URL}/company-graph/audit/status?company_id=${company}`, { headers, availableWhen: payload => payload?.audit_recording === true }),
      ]);
      return Object.fromEntries(["alerts", "approvals", "intelligence", "graph_audit"].map((key, index) => [key, entries[index]]));
    },
  });
  const supportingCapabilities = supportingCapabilitiesQuery.data || {};
  const qualityQuery = useQuery({
    queryKey: ["company-graph-quality-findings", currentUser?.company_id, scopeId, qualityQueue, governanceWorkspace],
    enabled: enabled && !!currentUser?.company_id,
    staleTime: 30_000,
    queryFn: async () => {
      const scope = scopeId ? `&operational_unit_id=${encodeURIComponent(scopeId)}` : "";
      const filters = new URLSearchParams({ limit: governanceWorkspace === "quality" ? "20" : "4", offset: String(qualityQueue.offset), sort: qualityQueue.sort });
      if (qualityQueue.severity) filters.set("severity", qualityQueue.severity);
      if (qualityQueue.verification) filters.set("verification_status", qualityQueue.verification);
      const response = await fetch(
        `${RAILWAY_URL}/company-graph/quality/findings?company_id=${encodeURIComponent(currentUser.company_id)}${scope}&${filters}`,
        { headers: await authHeaders() },
      );
      if (!response.ok) {
        const detail = await response.json().catch(() => ({}));
        const error = new Error(detail?.detail?.message || "Graph-quality work is unavailable.");
        error.action = detail?.detail?.action;
        throw error;
      }
      return response.json();
    },
  });
  const qualityFindings = qualityQuery.data?.findings || [];
  const relationshipCandidatesQuery = useQuery({
    queryKey: ["company-graph-relationship-candidates", currentUser?.company_id, scopeId, relationshipQueue, governanceWorkspace],
    enabled: enabled && isAdministrator && !!currentUser?.company_id,
    staleTime: 15_000,
    queryFn: async () => {
      const scope = scopeId ? `&operational_unit_id=${encodeURIComponent(scopeId)}` : "";
      const filters = new URLSearchParams({ limit: governanceWorkspace === "relationships" ? "25" : "5", offset: String(relationshipQueue.offset), sort: relationshipQueue.sort });
      if (relationshipQueue.state) filters.set("assertion_state", relationshipQueue.state);
      if (relationshipQueue.confidence) filters.set("confidence", relationshipQueue.confidence);
      if (relationshipQueue.source) filters.set("source", relationshipQueue.source);
      if (relationshipQueue.age) filters.set("age", relationshipQueue.age);
      const response = await fetch(
        `${RAILWAY_URL}/company-graph/relationship-candidates?company_id=${encodeURIComponent(currentUser.company_id)}${scope}&${filters}`,
        { headers: await authHeaders() },
      );
      if (!response.ok) throw new Error("Relationship review is unavailable.");
      return response.json();
    },
  });
  const relationshipCandidates = relationshipCandidatesQuery.data?.candidates || [];
  const groupedRelationshipCandidates = useMemo(() => {
    const groups = new Map();
    relationshipCandidates.forEach(candidate => {
      const key = `${candidate.predicate || "unknown"}::${candidate.bulk_group_key || candidate.assertion_key}`;
      if (!groups.has(key)) groups.set(key, { key, predicate: candidate.predicate || "unknown", bulkGroup: candidate.bulk_group_key, candidates: [] });
      groups.get(key).candidates.push(candidate);
    });
    return [...groups.values()];
  }, [relationshipCandidates]);
  const selectedBulkGroup = relationshipCandidates.find(candidate =>
    selectedCandidates.has(candidate.assertion_key)
  )?.bulk_group_key || null;

  const governedQuery = useQuery({
    queryKey: ["company-graph-overview", currentUser?.company_id, scopeId],
    enabled: enabled && !!currentUser?.company_id,
    staleTime: 30_000,
    retry: 1,
    queryFn: async () => {
      const scope = scopeId ? `&operational_unit_id=${encodeURIComponent(scopeId)}` : "";
      try {
        const endpoint = productSurface === "desktop"
          ? `${RAILWAY_URL}/company-graph/surface/desktop?company_id=${encodeURIComponent(currentUser.company_id)}${scope}`
          : `${RAILWAY_URL}/company-graph/overview?company_id=${encodeURIComponent(currentUser.company_id)}&limit=500&node_budget=36&edge_budget=72${scope}`;
        const response = await fetch(endpoint, { headers: await authHeaders() });
        if (!response.ok) {
          const detail = await response.json().catch(() => ({}));
          const error = new Error(detail?.detail?.message || `Company graph service returned ${response.status}`);
          error.status = response.status;
          error.category = detail?.detail?.category || (response.status === 401 || response.status === 403 ? "authorization" : "backend");
          throw error;
        }
        setFallbackEnabled(false);
        const body = await response.json();
        return assertGovernedGraphContract(body.packet || body);
      } catch (error) {
        // A failed governed request never authorizes a broader client-side graph.
        setFallbackEnabled(false);
        throw error;
      }
    },
  });
  const governedGraph = neighborhoodGraph || continuedOverview || governedQuery.data || null;
  useEffect(() => { setContinuedOverview(null); }, [governedQuery.data, scopeId]);

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
      attributes: { ...(localNodes.get(node.id)?.attributes || {}), ...(node.attributes || {}) },
      is_unconnected: true,
    }));
    const connected = new Set(governedGraph.edges.flatMap(edge => [edge.source, edge.target]));
    governedNodes.forEach(node => { node.is_unconnected = !connected.has(node.id); });
    const governedEdges = governedGraph.edges.map(edge => ({
      ...edge,
      relationship_type: edge.predicate,
      strength: ["canonical_relationship", "operator_confirmed_assertion"].includes(edge.assertion_class) ? 0.9 : 0.65,
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
    const clustered = buildSemanticClusters(nodes, edges, {
      expandedClusterIds: [...expandedClusterIds],
    });
    const focused = graphMode === "operational_focus"
      ? buildOperationalFocus(clustered.nodes, clustered.edges, governedGraph)
      : clustered;
    const { nodes: mNodes, edges: mEdges } = filterForMode(focused.nodes, focused.edges, graphMode);
    const visible = mNodes.filter(n => visibleTypes.has(n.entity_type));
    const visibleIds = new Set(visible.map(n => n.id));
    const visibleEdges = mEdges.filter(e => visibleIds.has(e.source) && visibleIds.has(e.target));
    return { nodes: visible, edges: visibleEdges };
  }, [nodes, edges, graphMode, visibleTypes, governedGraph, expandedClusterIds]);

  const selectedCandidate = relationshipCandidates.find(item => item.assertion_key === selectedCandidateId);
  const selectedCandidateEdge = useMemo(() => {
    if (!selectedCandidate) return null;
    const source = selectedCandidate.source_node_id;
    const target = selectedCandidate.target_node_id;
    if (!filteredNodes.some(node => node.id === source) || !filteredNodes.some(node => node.id === target)) return null;
    return {
      id: `proposal:${selectedCandidate.assertion_key}`,
      source, target,
      predicate: selectedCandidate.predicate,
      relationship_type: selectedCandidate.predicate,
      assertion_class: "advisor_proposal",
      assertion_state: selectedCandidate.assertion_state || "proposed",
      confidence: Number(selectedCandidate.candidate_confidence || 0),
      evidence: selectedCandidate.evidence || [],
      presentation_only: true,
    };
  }, [selectedCandidate, filteredNodes]);
  const displayedEdges = useMemo(() => selectedCandidateEdge
    ? [...filteredEdges.filter(edge => edge.id !== selectedCandidateEdge.id), selectedCandidateEdge]
    : filteredEdges, [filteredEdges, selectedCandidateEdge]);

  const effectiveLayoutMode = neighborhoodGraph && selectedNode?.node ? "selected_neighborhood" : graphMode;
  const graphPositions = useMemo(() => {
    const anchorNodeId = selectedNode?.node?.id
      || filteredNodes.find(node => node.entity_type === "operational_unit" && (!scopeId || node.entity_id === scopeId))?.id
      || filteredNodes.find(node => node.entity_type === "enterprise")?.id
      || null;
    const cacheKey = `${currentUser?.company_id || "tenant"}:${scopeId || "organization"}:${effectiveLayoutMode}:${anchorNodeId || "default"}`;
    const previousPositions = graphPositionCacheRef.current.get(cacheKey) || {};
    const positions = semanticPositions(filteredNodes, effectiveLayoutMode, {
      edges: displayedEdges,
      anchorNodeId,
      previousPositions,
    });
    graphPositionCacheRef.current.set(cacheKey, positions);
    return positions;
  }, [filteredNodes, displayedEdges, effectiveLayoutMode, selectedNode?.node?.id, scopeId, currentUser?.company_id]);
  const cyElements = useMemo(
    () => toCytoscapeElements(filteredNodes, displayedEdges, graphPositions),
    [filteredNodes, displayedEdges, graphPositions],
  );

  const graphRecords = useMemo(() => ({
    tasks: nodes.filter(node => node.entity_type === "task").map(node => node.attributes || {}),
    transactions: nodes.filter(node => node.entity_type === "transaction").map(node => node.attributes || {}),
    products: nodes.filter(node => node.entity_type === "product").map(node => node.attributes || {}),
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

  const graphSearchQuery = useQuery({
    queryKey: ["company-graph-search", currentUser?.company_id, scopeId, searchTerm.trim()],
    enabled: enabled && searchTerm.trim().length >= 2,
    staleTime: 30_000,
    queryFn: async () => {
      const scope = scopeId ? `&operational_unit_id=${encodeURIComponent(scopeId)}` : "";
      const response = await fetch(`${RAILWAY_URL}/company-graph/search?company_id=${encodeURIComponent(currentUser.company_id)}&q=${encodeURIComponent(searchTerm.trim())}&limit=25${scope}`, { headers: await authHeaders() });
      if (!response.ok) throw new Error("Graph search is unavailable");
      return response.json();
    },
  });
  const searchResults = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return [];
    const combined = [...(graphSearchQuery.data?.results || []), ...nodes];
    return [...new Map(combined.filter(node => node.label?.toLowerCase().includes(query) || node.entity_type.includes(query)).map(node => [node.id, node])).values()].slice(0, 8);
  }, [nodes, searchTerm, graphSearchQuery.data]);
  const edgeSearchResults = graphSearchQuery.data?.edge_results || [];
  const scopeOptions = useMemo(() => nodes.filter(node => node.entity_type === "operational_unit"), [nodes]);

  const effectiveGraphContract = useMemo(() => governedGraph || {
    contract_version: GRAPH_CONTRACT_VERSION,
    company_id: currentUser?.company_id || "",
    scope: { type: scopeId ? "operational_unit" : "organization", id: scopeId || currentUser?.company_id || null },
    nodes,
    edges,
    counts: {},
    provenance: {
      generated_at: new Date().toISOString(), projection: "unavailable_client_context",
      source_of_truth: "No graph data returned", tenant_verified: !!currentUser?.company_id,
      authorization_enforced: true, authorization_fingerprint: "frontend-fallback",
      policy_version: "graph-policy.v1", contract_version: GRAPH_CONTRACT_VERSION, cache: "none",
    },
    source_status: [{ source_id: "company_graph_service", zone: "projection", table: "company_graph", state: "unavailable", returned_records: 0, retryable: true, message: "The governed graph service is unavailable. No client-side authorization fallback was used." }],
    completeness: { state: "empty", sources_total: 1, sources_available: 0, sources_unavailable: 1, sources_unauthorized: 0, mapping_complete: false, authorization_filtered: false, explanation: "No governed graph packet is available." },
    truncation: { truncated: false, requested_limit_per_source: null, sources_at_limit: [], returned_nodes: nodes.length, returned_edges: edges.length, continuation_available: false },
    quality: { unconnected_count: stats.unconnected || 0, expired_relationship_count: 0, duplicate_edge_count: 0, missing_assignment_count: 0, issues: [] },
    permitted_actions: [
      { action: "search", allowed: true, requires_approval: false },
      { action: "ask_idjwi", allowed: true, requires_approval: false },
      { action: "export", allowed: false, requires_approval: false, reason: "Governed export is unavailable in fallback mode." },
    ],
  }, [governedGraph, currentUser?.company_id, scopeId, nodes, edges, stats.unconnected]);

  const idjwiContextEdges = selectedCandidateEdge
    ? [...edges.filter(edge => edge.id !== selectedCandidateEdge.id), selectedCandidateEdge]
    : edges;
  const idjwiGraphContext = useMemo(() => buildIdjwiGraphContext(effectiveGraphContract, {
    intent: null,
    selectedNodeId: selectedNode?.node?.id || null,
    selectedEdgeId: selectedNode?.edge?.id || null,
    // Idjwi receives the same governed packet as the page. Focus/type filters
    // remain view state and must not silently change graph-quality totals.
    nodes,
    edges: idjwiContextEdges,
    tenantId: currentUser?.company_id || null,
    role: currentUser?.role || "user",
    page: "CompanyGraphHome",
    productSurface,
  }), [effectiveGraphContract, selectedNode, nodes, idjwiContextEdges, currentUser?.company_id, currentUser?.role, productSurface]);

  const unavailableSourceCount = effectiveGraphContract.source_status
    .filter(source => ["unavailable", "partial"].includes(source.state)).length;
  const authorizationFiltered = effectiveGraphContract.completeness.authorization_filtered;
  const canExportGraph = effectiveGraphContract.permitted_actions
    .some(action => action.action === "export" && action.allowed);

  const completenessState = effectiveGraphContract.completeness?.state;
  const graphStatus = governedQuery.isError
    ? { label: governedQuery.error?.category === "authorization" ? "Graph access denied" : "Governed graph unavailable", color: "bg-amber-50 text-amber-700 border-amber-200", Icon: CloudOff }
    : completenessState === "unavailable"
      ? { label: "Graph sources unavailable", color: "bg-rose-50 text-rose-700 border-rose-200", Icon: CloudOff }
      : completenessState === "unauthorized"
        ? { label: "No authorized graph coverage", color: "bg-amber-50 text-amber-700 border-amber-200", Icon: ShieldAlert }
      : completenessState === "empty"
        ? { label: "Authorized graph is empty", color: "bg-slate-50 text-slate-700 border-slate-200", Icon: Info }
      : unavailableSourceCount
      ? { label: `Partial graph · ${unavailableSourceCount} sources unavailable`, color: "bg-rose-50 text-rose-700 border-rose-200", Icon: AlertCircle }
      : authorizationFiltered
        ? { label: "Governed role-filtered graph", color: "bg-indigo-50 text-indigo-700 border-indigo-200", Icon: ShieldAlert }
      : { label: "Governed graph online", color: "bg-emerald-50 text-emerald-700 border-emerald-200", Icon: CheckCircle2 };

  const exportGraph = async () => {
    if (!canExportGraph) return;
    const purpose = await requestText({
      title: "Export governed Company Graph",
      message: "State the operational purpose for this export. The purpose, authorized scope, and redactions will be audited.",
      label: "Export purpose",
      confirmLabel: "Continue to export",
    });
    if (!purpose?.trim()) return;
    const response = await fetch(`${RAILWAY_URL}/company-graph/export`, {
      method: "POST", headers: await authHeaders(),
      body: JSON.stringify({
        company_id: currentUser.company_id,
        operational_unit_id: scopeId || "",
        purpose: purpose.trim(),
        included_object_types: [...new Set(filteredNodes.map(node => node.entity_type))],
        included_node_ids: filteredNodes.map(node => node.id),
      }),
    });
    if (!response.ok) {
      const detail = await response.json().catch(() => ({}));
      throw new Error(detail?.detail?.message || "The governed export was denied.");
    }
    const exportPacket = await response.json();
    const blob = new Blob([JSON.stringify(exportPacket, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = `newsconseen-company-graph-${Date.now()}.json`; anchor.click();
    URL.revokeObjectURL(url);
  };

  const loadNextBoundedPage = async () => {
    const token = effectiveGraphContract.truncation?.continuation_token;
    if (!token || loadingContinuation) return;
    setLoadingContinuation(true);
    try {
      const scope = scopeId ? `&operational_unit_id=${encodeURIComponent(scopeId)}` : "";
      const response = await fetch(`${RAILWAY_URL}/company-graph/overview?company_id=${encodeURIComponent(currentUser.company_id)}&continuation_token=${encodeURIComponent(token)}${scope}`, { headers: await authHeaders() });
      if (!response.ok) throw new Error("The next governed graph page could not be loaded");
      const next = assertGovernedGraphContract(await response.json());
      const current = continuedOverview || governedQuery.data;
      setContinuedOverview({
        ...next,
        nodes: [...new Map([...(current?.nodes || []), ...next.nodes].map(node => [node.id, node])).values()],
        edges: [...new Map([...(current?.edges || []), ...next.edges].map(edge => [edge.id, edge])).values()],
      });
    } finally {
      setLoadingContinuation(false);
    }
  };
  const askIdjwiToFind = async () => {
    const query = searchTerm.trim() || await requestText({
      title: "Ask Idjwi to find graph context",
      message: "Describe the record, relationship, operational condition, or question you want Idjwi to locate.",
      label: "Natural-language graph search",
      confirmLabel: "Ask Idjwi",
    });
    if (!query?.trim()) return;
    openIdjwiGraphAction(
      `Search the governed company graph for: ${query.trim()}`,
      IDJWI_GRAPH_INTENTS.SEARCH_COMPANY_GRAPH,
      idjwiGraphContext,
      { graph_search_query: query.trim() },
    );
  };
  const StatusIcon = graphStatus.Icon;

  const saveCurrentView = async () => {
    const name = await requestText({
      title: "Save governed graph view",
      message: "Give this reusable Company Graph view a clear name.",
      label: "View name",
      confirmLabel: "Continue",
    });
    if (!name?.trim()) return;
    const audience = await requestText({
      title: "Choose the view audience",
      message: "Use private, team, operational_unit, or organization. Access remains subject to backend policy.",
      label: "Audience",
      defaultValue: "private",
      confirmLabel: "Continue",
    }) || "private";
    // Audience vocabulary is governance metadata, not enterprise_type taxonomy.
    // eslint-disable-next-line newsconseen/no-legacy-type-value
    if (!["private", "team", "operational_unit", "organization"].includes(audience)) {
      throw new Error("Choose a supported saved-view audience.");
    }
    if (["team", "operational_unit"].includes(audience) && !scopeId) {
      throw new Error("Select an operational unit before saving a team or unit view.");
    }
    const permissionInput = audience === "private"
      ? ""
      : await requestText({
          title: "Limit the view to roles",
          message: "Optionally enter allowed roles separated by commas, or leave this blank for the full selected audience.",
          label: "Allowed roles",
          required: false,
          confirmLabel: "Save view",
        }) || "";
    const permissions = permissionInput.split(",").map(value => value.trim()).filter(Boolean);
    const response = await fetch(`${RAILWAY_URL}/company-graph/views`, {
      method: "POST", headers: await authHeaders(),
      body: JSON.stringify({
        company_id: currentUser.company_id,
        name: name.trim(), audience,
        scope: { type: scopeId ? "operational_unit" : "organization", id: scopeId || currentUser.company_id },
        filters: {
          visible_types: [...visibleTypes],
          active_filter: activeFilter,
          search_query: searchTerm.trim(),
        },
        layout: graphMode,
        permissions,
        version: 1,
      }),
    });
    if (!response.ok) {
      const detail = await response.json().catch(() => ({}));
      throw new Error(detail?.detail?.message || detail?.detail?.code || "The governed view could not be saved.");
    }
    await savedViewsQuery.refetch();
    auditGraph("view_saved", name.trim(), { graph_mode: graphMode, scope_id: scopeId });
  };

  const applySavedView = value => {
    const view = savedViews.find(item => item.id === value);
    if (!view) return;
    if (view.validation_state !== "valid") {
      showNotice({
        title: "Saved view requires validation",
        message: "This governed view cannot be applied until an authorized operator validates it.",
        tone: "error",
      });
      return;
    }
    const viewScope = view.scope || {};
    setGraphMode(view.layout || "operational_focus");
    setScopeId(viewScope.type === "operational_unit" ? viewScope.id || "" : "");
    setVisibleTypes(new Set(view.filters?.visible_types || Object.keys(ENTITY_CONFIG)));
    setActiveFilter(view.filters?.active_filter || null);
    setSearchTerm(view.filters?.search_query || "");
    setNeighborhoodGraph(null);
    setSelectedNode(null);
    setInspectionTrail([]);
  };

  const runQualityWork = async (finding, action) => {
    let reason = "";
    if (["mark_verified", "resolve"].includes(action)) {
      reason = await requestText({
        title: action === "resolve" ? "Resolve graph-quality finding" : "Verify graph-quality finding",
        message: action === "resolve"
          ? "Describe the evidence showing this finding is resolved."
          : "Describe the evidence used to verify this finding.",
        label: "Verification evidence",
        confirmLabel: action === "resolve" ? "Resolve finding" : "Verify finding",
      }) || "";
      if (!reason.trim()) return;
    }
    const response = await fetch(
      `${RAILWAY_URL}/company-graph/quality/findings/${encodeURIComponent(finding.finding_key)}/work`,
      {
        method: "POST", headers: await authHeaders(),
        body: JSON.stringify({
          company_id: currentUser.company_id,
          operational_unit_id: scopeId || "",
          action, reason,
          owner_user_id: currentUser.id,
          owner_display_name: currentUser.full_name || currentUser.email || "Authorized operator",
        }),
      },
    );
    if (!response.ok) {
      const detail = await response.json().catch(() => ({}));
      throw new Error(detail?.detail?.message || detail?.detail?.code || "Graph-quality work could not be recorded.");
    }
    await Promise.all([qualityQuery.refetch(), governedQuery.refetch()]);
  };

  const detectRelationshipCandidates = async () => {
    setCandidateAction("detect");
    try {
      const response = await fetch(`${RAILWAY_URL}/company-graph/relationship-candidates/detect`, {
        method: "POST", headers: await authHeaders(),
        body: JSON.stringify({
          company_id: currentUser.company_id,
          operational_unit_id: scopeId || "",
          max_per_type: 1000,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result?.detail?.message || result?.detail?.code || "Relationship detection failed.");
      await relationshipCandidatesQuery.refetch();
    } finally {
      setCandidateAction("");
    }
  };

  const explainCandidate = async candidateId => {
    const scope = scopeId ? `&operational_unit_id=${encodeURIComponent(scopeId)}` : "";
    const response = await fetch(
      `${RAILWAY_URL}/company-graph/relationship-candidates/${encodeURIComponent(candidateId)}/explain?company_id=${encodeURIComponent(currentUser.company_id)}${scope}`,
      { headers: await authHeaders() },
    );
    if (!response.ok) throw new Error("Idjwi could not explain this proposal.");
    const explanation = await response.json();
    setCandidateExplanations(current => ({ ...current, [candidateId]: explanation }));
  };

  const decideCandidates = async (candidateIds, decision, correctedPredicate = null) => {
    if (!candidateIds.length) return;
    const verb = decision === "confirm" ? "confirm" : "reject";
    const reason = await requestText({
      title: `${decision === "confirm" ? "Confirm" : "Reject"} relationship proposal${candidateIds.length === 1 ? "" : "s"}`,
      message: `Explain why the operator should ${verb} ${candidateIds.length} relationship proposal${candidateIds.length === 1 ? "" : "s"}.`,
      label: "Decision reason",
      confirmLabel: "Continue",
    });
    if (!reason?.trim()) return;
    if (decision === "confirm" && !await requestConfirmation({
      title: "Apply canonical relationship changes",
      message: `Apply the previewed canonical changes for ${candidateIds.length} proposal${candidateIds.length === 1 ? "" : "s"}? The decision will be audited.`,
      confirmLabel: "Apply changes",
    })) return;
    setCandidateAction(decision);
    try {
      const response = await fetch(`${RAILWAY_URL}/company-graph/relationship-candidates/decide`, {
        method: "POST", headers: await authHeaders(),
        body: JSON.stringify({
          company_id: currentUser.company_id,
          candidate_ids: candidateIds,
          decision,
          reason: reason.trim(),
          approval_confirmed: decision === "confirm",
          corrected_predicate: correctedPredicate,
          operational_unit_id: scopeId || "",
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result?.detail?.message || result?.detail?.code || "Relationship decision failed.");
      const failures = result.results?.filter(item => item.status === "failed") || [];
      setSelectedCandidates(new Set());
      if (candidateIds.includes(selectedCandidateId)) {
        setSelectedCandidateId("");
        setSelectedNode(null);
        setFocusEdgeId("");
      }
      await Promise.all([
        relationshipCandidatesQuery.refetch(),
        governedQuery.refetch(),
        qualityQuery.refetch(),
      ]);
      setLastRelationshipOutcome(result);
      const highlighted = result.highlight?.[0];
      if (highlighted?.source) {
        setFocusNodeId(highlighted.source);
        setFocusEdgeId("");
      }
      if (failures.length) showNotice({
        title: "Some relationship decisions need review",
        message: `${result.summary.successful} succeeded; ${failures.length} require individual review.`,
        tone: "error",
      });
    } finally {
      setCandidateAction("");
    }
  };

  // ── Pulse bar highlight ──────────────────────────────────────────────────────
  const pulseHighlight = useMemo(() => {
    if (!activeFilter) return null;
    const pf = PULSE_FILTERS.find(p => p.key === activeFilter);
    return pf?.highlight || null;
  }, [activeFilter]);

  // ── Node click ───────────────────────────────────────────────────────────────
  const selectionFor = useCallback((fullNode, packetNodes, packetEdges) => {
    const connectedEdges = packetEdges.filter(edge => edge.source === fullNode.id || edge.target === fullNode.id);
    const connectedIds = new Set(connectedEdges
      .flatMap(edge => [edge.source, edge.target])
      .filter(id => id !== fullNode.id));
    return {
      node: fullNode,
      connectedNodes: packetNodes.filter(node => connectedIds.has(node.id)),
      connectedEdges,
    };
  }, []);

  const inspectNode = useCallback(async (fullNode, depth = 1, { recordHistory = true } = {}) => {
    if (!fullNode) return;
    setFocusNodeId(fullNode.id);
    setFocusEdgeId("");
    setScreenReaderMessage(`Inspecting ${fullNode.label}, ${fullNode.entity_type}.`);
    setSelectedNode(selectionFor(fullNode, filteredNodes, filteredEdges));
    setNeighborhoodDepth(depth);
    setNeighborhoodState({ status: "loading", error: "" });
    if (recordHistory) {
      setInspectionTrail(previous => previous.at(-1)?.id === fullNode.id
        ? previous
        : [...previous, fullNode].slice(-10));
    }
    auditGraph("node_inspected", fullNode.id, { graph_mode: graphMode, scope_id: scopeId, depth });
    if (fullNode.presentation_only) {
      neighborhoodCoordinatorRef.current.cancel();
      setNeighborhoodState({ status: "ready", error: "" });
      return;
    }
    if (!currentUser?.company_id || fallbackEnabled) {
      setNeighborhoodState({
        status: fallbackEnabled ? "error" : "ready",
        error: fallbackEnabled ? "Governed neighborhood retrieval is unavailable while the graph service is degraded." : "",
      });
      return;
    }
    try {
      const scope = scopeId ? `&operational_unit_id=${encodeURIComponent(scopeId)}` : "";
      const url = `${RAILWAY_URL}/company-graph/neighborhood/${encodeURIComponent(fullNode.entity_type)}/${encodeURIComponent(fullNode.entity_id)}?company_id=${encodeURIComponent(currentUser.company_id)}&depth=${depth}${scope}`;
      const result = await neighborhoodCoordinatorRef.current.run(url, { headers: await authHeaders() });
      if (result.stale) return;
      if (!result.response?.ok) {
        const detail = await result.response?.json().catch(() => ({}));
        throw new Error(detail?.detail?.message || detail?.detail?.code || `Neighborhood request failed (${result.response?.status || "network"})`);
      }
      const packet = assertGovernedGraphContract(await result.response.json());
      const baseNodes = governedQuery.data?.nodes || [];
      const retainedPins = baseNodes.filter(node => pinnedNodes.some(pin => pin.id === node.id));
      const coordinatedPacket = {
        ...packet,
        nodes: [...new Map([...packet.nodes, ...retainedPins].map(node => [node.id, node])).values()],
      };
      setNeighborhoodGraph(coordinatedPacket);
      const center = coordinatedPacket.nodes.find(node => node.id === fullNode.id) || fullNode;
      setSelectedNode(selectionFor(center, coordinatedPacket.nodes, coordinatedPacket.edges));
      setNeighborhoodState({ status: "ready", error: "" });
    } catch (error) {
      setNeighborhoodState({ status: "error", error: error.message || "The governed neighborhood could not be retrieved." });
      auditGraph("neighborhood_failed", fullNode.id, { depth, message: error.message || "unknown" });
    }
  }, [
    filteredNodes, filteredEdges, selectionFor, currentUser?.company_id,
    fallbackEnabled, scopeId, graphMode, auditGraph, governedQuery.data, pinnedNodes,
  ]);

  const expandSemanticCluster = useCallback(cluster => {
    setExpandedClusterIds(previous => new Set([...previous, cluster.id]));
    setSelectedNode(null);
    setFocusNodeId("");
    setScreenReaderMessage(`${cluster.attributes?.record_count || "The summarized"} authorized records are now expanded.`);
    auditGraph("semantic_cluster_expanded", cluster.id, {
      graph_mode: graphMode,
      scope_id: scopeId,
      member_count: cluster.attributes?.record_count || 0,
    });
  }, [auditGraph, graphMode, scopeId]);

  const createClusterRepairWork = useCallback(async cluster => {
    const key = String(cluster.attributes?.cluster_key || "");
    const finding = qualityFindings.find(item => {
      const code = String(item.issue_code || item.finding_key || "").toLowerCase();
      if (key.includes("disconnected")) return code.includes("disconnected") || code.includes("unconnected");
      return code.includes(key.replaceAll("_", "-")) || code.includes(key);
    });
    if (!finding) {
      openIdjwiGraphAction(
        `Create governed repair work for ${cluster.label}.`,
        IDJWI_GRAPH_INTENTS.RECOMMEND_GRAPH_ACTION,
        idjwiGraphContext,
        { selected_node_id: cluster.id, graph_cluster: cluster, repair_work_requested: true },
      );
      return;
    }
    await runQualityWork(finding, "create_task");
    showNotice({ title: "Repair work created", message: `A governed task now owns the finding represented by ${cluster.label}.`, tone: "success" });
  }, [qualityFindings, idjwiGraphContext]);

  const handleNodeSelect = useCallback(nodeData => {
    if (!nodeData) { setSelectedNode(null); return; }
    const fullNode = filteredNodes.find(node => node.id === nodeData.id);
    if (fullNode) inspectNode(fullNode, 1);
  }, [filteredNodes, inspectNode]);

  const returnToOverview = useCallback(() => {
    neighborhoodCoordinatorRef.current.cancel();
    setNeighborhoodGraph(null);
    setSelectedNode(null);
    setInspectionTrail([]);
    setNeighborhoodDepth(1);
    setNeighborhoodState({ status: "idle", error: "" });
    setFocusNodeId("");
    setFocusEdgeId("");
    governedQuery.refetch();
  }, [governedQuery]);

  const inspectTrailIndex = useCallback(index => {
    const target = inspectionTrail[index];
    if (!target) return;
    setInspectionTrail(previous => previous.slice(0, index + 1));
    inspectNode(target, 1, { recordHistory: false });
  }, [inspectionTrail, inspectNode]);

  const inspectBack = useCallback(() => {
    if (inspectionTrail.length <= 1) returnToOverview();
    else inspectTrailIndex(inspectionTrail.length - 2);
  }, [inspectionTrail, inspectTrailIndex, returnToOverview]);

  const togglePin = useCallback(node => {
    setPinnedNodes(previous => previous.some(item => item.id === node.id)
      ? previous.filter(item => item.id !== node.id)
      : [...previous, node].slice(-8));
  }, []);

  const toggleCompare = useCallback(node => {
    setCompareNodes(previous => previous.some(item => item.id === node.id)
      ? previous.filter(item => item.id !== node.id)
      : [...previous, node].slice(-2));
  }, []);

  const handleEdgeSelect = useCallback(edgeData => {
    neighborhoodCoordinatorRef.current.cancel();
    setNeighborhoodState({ status: "idle", error: "" });
    const edge = filteredEdges.find(candidate => candidate.id === edgeData.id) || edgeData;
    setSelectedNode({
      edge,
      sourceNode: filteredNodes.find(node => node.id === edge.source),
      targetNode: filteredNodes.find(node => node.id === edge.target),
    });
    auditGraph("edge_inspected", edge.id, { predicate: edge.predicate || edge.relationship_type });
  }, [filteredNodes, filteredEdges, auditGraph]);

  const restorePreviousCitationContext = useCallback(() => {
    if (!citationPreviousSelection) return;
    setSelectedNode(citationPreviousSelection);
    if (citationPreviousSelection.edge) {
      setFocusNodeId(citationPreviousSelection.edge.source || "");
      setFocusEdgeId(citationPreviousSelection.edge.id || "");
    } else if (citationPreviousSelection.node) {
      setFocusEdgeId("");
      setFocusNodeId(citationPreviousSelection.node.id || "");
    }
    setCitationPreviousSelection(null);
  }, [citationPreviousSelection]);

  const inspectRelationshipCandidate = useCallback(async candidate => {
    setSelectedCandidateId(candidate.assertion_key);
    setGraphMode("full_graph");
    const edge = {
      id: `proposal:${candidate.assertion_key}`,
      source: candidate.source_node_id,
      target: candidate.target_node_id,
      predicate: candidate.predicate,
      relationship_type: candidate.predicate,
      assertion_class: "advisor_proposal",
      assertion_state: candidate.assertion_state || "proposed",
      confidence: Number(candidate.candidate_confidence || 0),
      evidence: candidate.evidence || [],
      presentation_only: true,
    };
    setFocusNodeId("");
    setFocusEdgeId(edge.id);
    setSelectedNode({
      edge,
      sourceNode: nodes.find(node => node.id === edge.source),
      targetNode: nodes.find(node => node.id === edge.target),
      relationshipCandidate: candidate,
    });
    if (!candidateExplanations[candidate.assertion_key]) await explainCandidate(candidate.assertion_key);
    document.getElementById("company-graph-inspector")?.focus();
    auditGraph("relationship_candidate_inspected", candidate.assertion_key, { predicate: candidate.predicate });
  }, [nodes, candidateExplanations, auditGraph]);

  const findingNodeIds = useCallback(finding => {
    const candidates = [
      ...(finding.affected_node_ids || []), ...(finding.affected_record_ids || []),
      ...(finding.evidence || []).flatMap(item => item.node_ids || item.affected_node_ids || []),
    ];
    return [...new Set(candidates.map(value => String(value)).flatMap(value => {
      if (value.includes(":")) return [value];
      const match = nodes.find(node => String(node.entity_id) === value);
      return match ? [match.id] : [];
    }))];
  }, [nodes]);

  const inspectQualityFinding = useCallback(finding => {
    const ids = findingNodeIds(finding);
    setSelectedQualityFinding(finding);
    setFocusEdgeId("");
    setFocusNodeId(ids[0] || "");
    if (ids[0]) {
      const node = nodes.find(item => item.id === ids[0]);
      if (node) setSelectedNode(selectionFor(node, nodes, edges));
    }
    setScreenReaderMessage(`Inspecting ${finding.issue_code.replaceAll("_", " ")} affecting ${finding.affected_count || ids.length} records.`);
    auditGraph("graph_quality_finding_inspected", finding.finding_key, { affected_node_ids: ids });
  }, [findingNodeIds, nodes, edges, selectionFor, auditGraph]);

  const inspectSearchedEdge = useCallback(async match => {
    setSearchTerm("");
    const response = await fetch(
      `${RAILWAY_URL}/company-graph/edge/explain?company_id=${encodeURIComponent(currentUser.company_id)}&edge_id=${encodeURIComponent(match.id)}&source=${encodeURIComponent(match.source)}&target=${encodeURIComponent(match.target)}`,
      { headers: await authHeaders() },
    );
    if (!response.ok) throw new Error("The governed relationship explanation is unavailable.");
    const result = await response.json();
    setGraphMode("full_graph");
    setSelectedNode({ edge: result.edge, sourceNode: result.source_node, targetNode: result.target_node });
    setFocusNodeId(result.edge.source);
    setFocusEdgeId(result.edge.id);
    auditGraph("edge_inspected", result.edge.id, { source: "advanced_search", predicate: result.edge.predicate });
  }, [currentUser?.company_id, auditGraph]);

  useEffect(() => {
    const inspectCitation = event => {
      const citation = event.detail || {};
      setCitationPreviousSelection(selectedNode);
      const edge = citation.edge_id
        ? edges.find(candidate => candidate.id === citation.edge_id)
        : null;
      const nodeIds = citation.node_ids || [];
      setActiveFilter(null);
      setGraphMode("full_graph");
      setVisibleTypes(new Set(Object.keys(ENTITY_CONFIG)));
      if (edge) {
        const sourceNode = nodes.find(node => node.id === edge.source);
        const targetNode = nodes.find(node => node.id === edge.target);
        setSelectedNode({ edge, sourceNode, targetNode });
        setFocusNodeId(edge.source);
        setFocusEdgeId(edge.id);
        auditGraph("citation_inspected", edge.id, {
          citation_id: citation.citation_id,
          evidence_ids: citation.evidence_ids || [],
        });
      } else if (nodeIds[0]) {
        const node = nodes.find(candidate => candidate.id === nodeIds[0]);
        if (!node) return;
        const incident = edges.filter(candidate => candidate.source === node.id || candidate.target === node.id);
        const connectedIds = new Set(incident.flatMap(candidate => [candidate.source, candidate.target]));
        setSelectedNode({
          node,
          connectedEdges: incident,
          connectedNodes: nodes.filter(candidate => candidate.id !== node.id && connectedIds.has(candidate.id)),
        });
        setFocusEdgeId("");
        setFocusNodeId(node.id);
        auditGraph("citation_inspected", node.id, {
          citation_id: citation.citation_id,
          evidence_ids: citation.evidence_ids || [],
        });
      }
    };
    window.addEventListener("company-graph-citation-selected", inspectCitation);
    return () => window.removeEventListener("company-graph-citation-selected", inspectCitation);
  }, [nodes, edges, auditGraph, selectedNode]);

  useEffect(() => {
    const handleWorkspaceAction = event => {
      const action = event.detail || {};
      const nodeIds = action.node_ids || (action.node_id ? [action.node_id] : []);
      const selectedNodes = nodeIds.map(id => nodes.find(node => node.id === id)).filter(Boolean);
      const edge = action.edge_id ? edges.find(candidate => candidate.id === action.edge_id) : null;
      if ((selectedNodes.length || edge) && selectedNode) setCitationPreviousSelection(selectedNode);

      if (action.action === "highlight_records" && selectedNodes.length) {
        setActiveFilter(null);
        setGraphMode("full_graph");
        setVisibleTypes(new Set(selectedNodes.map(node => node.entity_type)));
        setFocusNodeId(selectedNodes[0].id);
      } else if (action.action === "center_record" && selectedNodes[0]) {
        inspectNode(selectedNodes[0], 1);
      } else if (action.action === "open_edge" && edge) {
        setGraphMode("full_graph");
        setFocusNodeId(edge.source);
        setFocusEdgeId(edge.id);
        handleEdgeSelect(edge);
      } else if (action.action === "compare_neighborhoods" && selectedNodes.length >= 2) {
        setCompareNodes(selectedNodes.slice(0, 2));
        setGraphMode("full_graph");
        setFocusNodeId(selectedNodes[0].id);
      } else if (action.action === "propose_governed_correction" && edge) {
        setGraphMode("full_graph");
        setFocusEdgeId(edge.id);
        handleEdgeSelect(edge);
      } else if (action.action === "create_task") {
        window.dispatchEvent(new CustomEvent("open-idjwi-panel", {
          detail: {
            initialMessage: "Create a governed follow-up task from this graph evidence.",
            context: { ...idjwiGraphContext, requested_action: "create_task" },
          },
        }));
      } else if (action.action === "request_approval") {
        window.dispatchEvent(new CustomEvent("open-idjwi-panel", {
          detail: {
            initialMessage: "Request the required approval for the selected graph action.",
            context: { ...idjwiGraphContext, requested_action: "request_approval" },
          },
        }));
      } else if (action.action === "explain_degraded_data") {
        openIdjwiGraphAction(
          "Explain which graph data is degraded, why, and what the operator can do next.",
          IDJWI_GRAPH_INTENTS.EXPLAIN_COMPANY_GRAPH,
          idjwiGraphContext,
          { requested_action: "explain_degraded_data" },
        );
      }
      auditGraph("idjwi_workspace_action", action.edge_id || action.node_id || action.action, {
        action: action.action, node_ids: nodeIds,
      });
    };
    window.addEventListener("company-graph-workspace-action", handleWorkspaceAction);
    return () => window.removeEventListener("company-graph-workspace-action", handleWorkspaceAction);
  }, [nodes, edges, inspectNode, handleEdgeSelect, idjwiGraphContext, auditGraph, selectedNode]);

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

  const relationshipReviewSummary = relationshipCandidatesQuery.data?.summary || {
    pending: 0, proposed: 0, high_confidence: 0, disputed: 0, critical: 0, oldest_proposal: null,
  };
  relationshipReviewSummary.pending ??= relationshipReviewSummary.proposed || 0;
  relationshipReviewSummary.highConfidence ??= relationshipReviewSummary.high_confidence || 0;
  const graphQualitySummary = qualityQuery.data?.summary || {
    open: 0, critical: 0, unverified: 0, affected_records: 0,
  };
  const graphHealth = graphQualitySummary.critical ? "Critical attention" : graphQualitySummary.open ? "Needs repair" : "Healthy";
  const qualityFocusNodeIds = selectedQualityFinding ? findingNodeIds(selectedQualityFinding) : [];
  const selectedScopeLabel = scopeId
    ? scopeOptions.find(node => node.entity_id === scopeId)?.label || "Selected operational unit"
    : "Organization-wide";

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div
      data-company-graph-root="true"
      data-company-graph-preferences-ready={sectionPreferencesReady ? "true" : "false"}
      className="flex h-full min-h-0 flex-col gap-3 text-[11px] transition-[padding] duration-300 motion-reduce:transition-none [&_button]:min-h-8 [&_button]:focus-visible:outline-none [&_button]:focus-visible:ring-2 [&_button]:focus-visible:ring-emerald-600 [&_input]:min-h-8 [&_input]:focus-visible:ring-2 [&_input]:focus-visible:ring-emerald-600 [&_select]:min-h-8 [&_select]:focus-visible:ring-2 [&_select]:focus-visible:ring-emerald-600"
      style={{ paddingRight: idjwiWorkspaceWidth ? `${idjwiWorkspaceWidth + 12}px` : undefined }}
    >
      <AccessibleInteractionHost />

      <section className="order-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 shrink-0" aria-label="Idjwi operational briefing">
        <div className="flex flex-col lg:flex-row lg:items-center gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Sparkles className="w-4 h-4 text-emerald-600" />
              <h1 className="text-sm font-black text-slate-800">Idjwi operational briefing</h1>
              <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-bold text-slate-600">{selectedScopeLabel}</span>
            </div>
            <p className="text-xs text-slate-600 mt-2">{governedGraph?.briefing?.headline || (governedQuery.isLoading ? "Evaluating your operational graph…" : "Using available company records.")}</p>
            <p className="text-[11px] text-slate-400 mt-1">{governedGraph?.briefing?.recommended_focus || "Select a node or relationship to investigate with Idjwi."}</p>
            {effectiveGraphContract.truncation?.truncated && (
              <p className="text-[11px] text-amber-700 mt-1">
                Bounded view: {effectiveGraphContract.truncation.returned_nodes} nodes and {effectiveGraphContract.truncation.returned_edges} edges returned; at least {effectiveGraphContract.truncation.omitted_nodes || 0} nodes and {effectiveGraphContract.truncation.omitted_edges || 0} edges were omitted.
              </p>
            )}
            <div className="flex flex-wrap gap-2 mt-3">
              <button
                onClick={() => openIdjwiGraphAction(
                  "Give me today's evidence-backed operational briefing.",
                  IDJWI_GRAPH_INTENTS.DAILY_OPERATIONAL_BRIEFING,
                  idjwiGraphContext,
                )}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-black text-white hover:bg-emerald-700"
              >
                <Sparkles className="w-3 h-3" /> Ask Idjwi for the briefing
              </button>
              <button onClick={() => toggleSection("briefing")} aria-expanded={briefingOpen} aria-controls="company-graph-briefing-detail" className="text-[11px] font-bold text-slate-600 hover:text-slate-900">
                {briefingOpen ? "Hide operational detail" : "Show operational detail"}
              </button>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center sm:grid-cols-6">
            {[["Open work", governedGraph?.briefing?.open_tasks || 0], ["High risks", governedGraph?.briefing?.high_risks || 0], ["Recommendations", governedGraph?.briefing?.pending_recommendations || 0], ["Data gaps", governedGraph?.briefing?.quality_issues || 0], ["Relationship review", relationshipReviewSummary.pending], ["Quality work", graphQualitySummary.open]].map(([label, value]) => (
              <div key={label} className="px-2 py-1.5 rounded-xl bg-slate-50 border border-slate-100"><p className="text-sm font-black text-slate-800">{value}</p><p className="text-[11px] text-slate-400">{label}</p></div>
            ))}
          </div>
        </div>
        {briefingOpen && governedGraph?.briefing?.contract_version && (
          <div id="company-graph-briefing-detail" className="mt-4 grid gap-3 lg:grid-cols-3 border-t border-slate-100 pt-4">
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-[11px] font-black uppercase tracking-wider text-slate-500">What changed</p>
              <div className="mt-2 space-y-2">
                {(governedGraph.briefing.what_changed || []).slice(0, 3).map(change => (
                  <button key={`${change.record_type}:${change.record_id}`} onClick={() => {
                    const node = nodes.find(item => item.id === `${change.record_type}:${change.record_id}`);
                    if (node) inspectNode(node, 1);
                  }} className="block w-full text-left">
                    <span className="block text-[11px] font-bold text-slate-700">{change.label}</span>
                    <span className="block text-[11px] text-slate-400">{change.change}</span>
                  </button>
                ))}
                {!governedGraph.briefing.what_changed?.length && <p className="text-[11px] text-slate-400">No authorized change was recorded in the last 24 hours.</p>}
              </div>
            </div>
            <div className="rounded-xl bg-emerald-50/60 p-3">
              <p className="text-[11px] font-black uppercase tracking-wider text-emerald-700">What matters today</p>
              <div className="mt-2 space-y-2">
                {(governedGraph.briefing.what_matters_today || []).slice(0, 3).map(priority => (
                  <button key={priority.priority_id} onClick={() => {
                    const node = nodes.find(item => item.id === priority.priority_id);
                    if (node) inspectNode(node, 1);
                  }} className="block w-full text-left rounded-lg border border-emerald-100 bg-white p-2">
                    <span className="block text-[11px] font-black text-slate-800">{priority.title}</span>
                    <span className="block text-[11px] text-slate-500">{priority.why_it_matters}</span>
                    <span className="block mt-1 text-[11px] font-bold text-emerald-700">{priority.owner?.display_name} · {priority.relationship_explanation?.length || 0} explaining relationships</span>
                  </button>
                ))}
                {!governedGraph.briefing.what_matters_today?.length && <p className="text-[11px] text-emerald-700">No critical priority is visible in this bounded scope.</p>}
              </div>
            </div>
            <div className="rounded-xl bg-amber-50/60 p-3">
              <p className="text-[11px] font-black uppercase tracking-wider text-amber-700">Uncertainty and attention</p>
              <div className="mt-2 space-y-1.5">
                {(governedGraph.briefing.uncertainties || []).slice(0, 3).map((item, index) => (
                  <p key={`${item.type}-${index}`} className="text-[11px] text-amber-800">{item.explanation}</p>
                ))}
                {(governedGraph.briefing.requires_attention || []).slice(0, 3).map(item => (
                  <p key={item.finding_code} className="text-[11px] text-slate-600"><span className="font-black">{item.count}</span> · {item.message}</p>
                ))}
                {!governedGraph.briefing.uncertainties?.length && !governedGraph.briefing.requires_attention?.length && <p className="text-[11px] text-slate-500">No material uncertainty is disclosed.</p>}
              </div>
            </div>
          </div>
        )}
      </section>

      {isAdministrator && (
        <section className="order-4 rounded-2xl border border-indigo-200 bg-white p-4 shrink-0" aria-label="Governed relationship review">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <button type="button" onClick={() => toggleSection("relationshipReview")} aria-expanded={relationshipReviewOpen} aria-controls="company-graph-relationship-review-detail" className="flex min-w-0 flex-1 items-start gap-3 text-left">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600"><GitBranch className="h-4 w-4" /></span>
              <span className="min-w-0 flex-1">
              <p className="text-xs font-black text-slate-800">Relationship review</p>
              <p className="mt-0.5 text-[11px] text-slate-500">
                {relationshipReviewSummary.pending} pending · {relationshipReviewSummary.highConfidence} high confidence · {relationshipReviewSummary.disputed} disputed
              </p>
              <p className="mt-0.5 text-[11px] text-slate-400">{relationshipReviewSummary.critical || 0} critical · oldest {relationshipReviewSummary.oldest_proposal ? new Date(relationshipReviewSummary.oldest_proposal).toLocaleDateString() : "none"}</p>
              </span>
              {relationshipReviewOpen ? <ChevronUp className="mt-1 h-4 w-4 shrink-0 text-slate-400" /> : <ChevronDown className="mt-1 h-4 w-4 shrink-0 text-slate-400" />}
            </button>
            {relationshipReviewOpen && <div className="flex flex-wrap gap-2">
              <button onClick={() => setGovernanceWorkspace("relationships")} className="rounded-lg border border-slate-200 px-3 py-1.5 text-[11px] font-black text-slate-700">Open workspace</button>
              <button
                onClick={() => detectRelationshipCandidates().catch(error => reportGraphError("Relationship detection failed", error))}
                disabled={!!candidateAction}
                className="rounded-lg border border-indigo-200 px-3 py-1.5 text-[11px] font-black text-indigo-700 disabled:opacity-50"
              >
                {candidateAction === "detect" ? "Detecting…" : "Detect relationships"}
              </button>
              <button
                onClick={() => decideCandidates([...selectedCandidates], "confirm").catch(error => reportGraphError("Relationship confirmation failed", error))}
                disabled={!selectedCandidates.size || !!candidateAction}
                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-black text-white disabled:opacity-40"
              >
                Confirm selected ({selectedCandidates.size})
              </button>
            </div>}
          </div>
          {relationshipReviewOpen && <div id="company-graph-relationship-review-detail">
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 p-2" aria-label="Relationship review filters">
            <select aria-label="Filter relationship state" value={relationshipQueue.state} onChange={event => setRelationshipQueue(current => ({ ...current, state: event.target.value, offset: 0 }))} className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px]"><option value="">All states</option><option value="proposed">Proposed</option><option value="disputed">Disputed</option><option value="rejected">Rejected</option></select>
            <select aria-label="Filter relationship confidence" value={relationshipQueue.confidence} onChange={event => setRelationshipQueue(current => ({ ...current, confidence: event.target.value, offset: 0 }))} className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px]"><option value="">All confidence</option><option value="high">High confidence</option><option value="medium">Medium confidence</option><option value="low">Low confidence</option></select>
            <select aria-label="Filter relationship age" value={relationshipQueue.age} onChange={event => setRelationshipQueue(current => ({ ...current, age: event.target.value, offset: 0 }))} className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px]"><option value="">Any age</option><option value="older_30_days">Older than 30 days</option></select>
            <select aria-label="Sort relationship review" value={relationshipQueue.sort} onChange={event => setRelationshipQueue(current => ({ ...current, sort: event.target.value, offset: 0 }))} className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px]"><option value="priority">Risk and impact</option><option value="confidence">Confidence</option><option value="oldest">Oldest first</option></select>
            <input aria-label="Filter relationship source" placeholder="Source or method" value={relationshipQueue.source} onChange={event => setRelationshipQueue(current => ({ ...current, source: event.target.value, offset: 0 }))} className="w-36 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px]" />
            <span className="ml-auto text-[11px] font-semibold text-slate-500">Showing {relationshipCandidatesQuery.data?.pagination?.visible || 0} of {relationshipCandidatesQuery.data?.pagination?.total || 0}</span>
          </div>
          {relationshipCandidatesQuery.isError && (
            <p role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-[11px] text-rose-700">
              {relationshipCandidatesQuery.error.message}
            </p>
          )}
          {!relationshipCandidatesQuery.isError && relationshipCandidates.length === 0 && (
            <p className="mt-3 rounded-xl bg-slate-50 p-3 text-[11px] text-slate-500">
              No durable proposals are queued. Run detection to evaluate currently authorized records.
            </p>
          )}
          <div className="mt-3 space-y-3">
            {groupedRelationshipCandidates.map(group => <section key={group.key} className="rounded-xl border border-slate-200 bg-slate-50/50 p-2" aria-label={`${group.predicate} review group`}>
              <div className="mb-2 flex items-center justify-between gap-2 px-1"><p className="text-[11px] font-black text-slate-700">{group.predicate.replaceAll("_", " ")} · {group.candidates.length} visible</p><span className="text-[11px] text-slate-400">{group.bulkGroup ? "Safe bulk group" : "Individual decisions only"}</span></div>
              <div className="grid gap-2 xl:grid-cols-2">{group.candidates.map(candidate => {
              const fields = candidate.evidence?.[0]?.matching_fields || {};
              const explanation = candidateExplanations[candidate.assertion_key];
              const selectable = candidate.assertion_state === "proposed" && !!candidate.bulk_group_key;
              return (
                <article key={candidate.assertion_key} className={`rounded-xl border p-3 ${selectedCandidateId === candidate.assertion_key ? "border-indigo-400 bg-indigo-50/30" : "border-slate-200"}`}>
                  <div className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      className="mt-1"
                      disabled={!selectable || (!!selectedBulkGroup && selectedBulkGroup !== candidate.bulk_group_key)}
                      checked={selectedCandidates.has(candidate.assertion_key)}
                      onChange={event => setSelectedCandidates(current => {
                        const next = new Set(current);
                        if (event.target.checked) next.add(candidate.assertion_key);
                        else next.delete(candidate.assertion_key);
                        return next;
                      })}
                      aria-label={`Select ${candidate.predicate} relationship proposal`}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-black text-indigo-700">{candidate.assertion_state}</span>
                        <span className="text-[11px] text-slate-400">{candidate.matching_method?.replaceAll("_", " ")}</span>
                      </div>
                      <p className="mt-2 text-[11px] font-black text-slate-800">
                        {fields.source_label || candidate.source_node_id} <span className="text-indigo-600">→ {candidate.predicate?.replaceAll("_", " ")} →</span> {fields.target_label || candidate.target_node_id}
                      </p>
                      <p className="mt-1 text-[11px] text-slate-500">
                        Source: {candidate.carrier_type}:{candidate.carrier_record_id} · {Math.round(Number(candidate.candidate_confidence || 0) * 100)}% confidence · evidence v{candidate.evidence_version || 1}
                      </p>
                      {explanation && (
                        <div className="mt-2 rounded-lg bg-slate-50 p-2 text-[11px] text-slate-600">
                          <p className="font-bold text-slate-700">{explanation.summary}</p>
                          <p className="mt-1">{explanation.reasoning?.uncertainty}</p>
                          <p className="mt-1">{explanation.why_bulk_confirmation}</p>
                          <p className="mt-1 font-semibold">Advisor used: No · Idjwi Core deterministic explanation</p>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <button onClick={() => inspectRelationshipCandidate(candidate).catch(error => reportGraphError("Relationship inspection failed", error))} className="rounded-lg bg-indigo-600 px-2 py-1 text-[11px] font-bold text-white">Inspect records</button>
                    <button onClick={() => explainCandidate(candidate.assertion_key).catch(error => reportGraphError("Relationship explanation failed", error))} className="rounded-lg border border-violet-200 px-2 py-1 text-[11px] font-bold text-violet-700">Why this match?</button>
                    <button onClick={() => setExpandedEvidence(current => { const next = new Set(current); if (next.has(candidate.assertion_key)) next.delete(candidate.assertion_key); else next.add(candidate.assertion_key); return next; })} aria-expanded={expandedEvidence.has(candidate.assertion_key)} className="rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-bold text-slate-600">{expandedEvidence.has(candidate.assertion_key) ? "Hide evidence" : "Evidence"}</button>
                    {candidate.assertion_state === "proposed" && (
                      <>
                        <button onClick={() => decideCandidates([candidate.assertion_key], "confirm").catch(error => reportGraphError("Relationship confirmation failed", error))} className="rounded-lg border border-emerald-200 px-2 py-1 text-[11px] font-bold text-emerald-700">Confirm</button>
                        <button onClick={async () => {
                          const corrected = await requestText({
                            title: "Edit relationship predicate",
                            message: "Enter the governed semantic predicate that accurately describes this proposed connection.",
                            label: "Governed predicate",
                            defaultValue: candidate.predicate || "",
                            confirmLabel: "Review correction",
                          });
                          if (corrected?.trim() && corrected.trim() !== candidate.predicate) {
                            decideCandidates([candidate.assertion_key], "confirm", corrected.trim()).catch(error => reportGraphError("Relationship correction failed", error));
                          }
                        }} className="rounded-lg border border-indigo-200 px-2 py-1 text-[11px] font-bold text-indigo-700">Edit predicate</button>
                        <button onClick={() => decideCandidates([candidate.assertion_key], "reject").catch(error => reportGraphError("Relationship rejection failed", error))} className="rounded-lg border border-rose-200 px-2 py-1 text-[11px] font-bold text-rose-700">Reject</button>
                      </>
                    )}
                    {candidate.assertion_state === "disputed" && <span className="text-[11px] font-bold text-amber-700">Individual semantic review required</span>}
                  </div>
                  {expandedEvidence.has(candidate.assertion_key) && <pre className="mt-2 max-h-40 overflow-auto rounded-lg bg-slate-950 p-2 text-[11px] text-slate-100">{JSON.stringify(candidate.evidence || [], null, 2)}</pre>}
                </article>
              );
            })}</div></section>)}
          </div>
          <div className="mt-3 flex items-center justify-between">
            <button disabled={relationshipQueue.offset === 0} onClick={() => setRelationshipQueue(current => ({ ...current, offset: Math.max(0, current.offset - (governanceWorkspace === "relationships" ? 25 : 5)) }))} className="rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-bold disabled:opacity-40">Previous</button>
            <span className="text-[11px] text-slate-500">Backend page {Math.floor(relationshipQueue.offset / (governanceWorkspace === "relationships" ? 25 : 5)) + 1}</span>
            <button disabled={!relationshipCandidatesQuery.data?.pagination?.has_more} onClick={() => setRelationshipQueue(current => ({ ...current, offset: relationshipCandidatesQuery.data.pagination.next_offset }))} className="rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-bold disabled:opacity-40">Next</button>
          </div>
          {lastRelationshipOutcome?.quality_comparison && (
            <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
              <p className="text-[11px] font-black text-emerald-800">
                Governed review completed · {lastRelationshipOutcome.summary.successful} succeeded · {lastRelationshipOutcome.summary.failed} failed
              </p>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
                {[
                  ["Visible edges", "visible_edges"],
                  ["Connected records", "connected_records"],
                  ["Unconnected", "unconnected_records"],
                  ["Registry gaps", "registry_gaps"],
                  ["Legacy proposals", "legacy_links_requiring_confirmation"],
                ].map(([label, key]) => (
                  <div key={key} className="rounded-lg bg-white p-2">
                    <p className="text-[11px] text-slate-500">{label}</p>
                    <p className="text-xs font-black text-slate-800">
                      {lastRelationshipOutcome.quality_comparison.before[key]} → {lastRelationshipOutcome.quality_comparison.after[key]}
                    </p>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-emerald-700">
                Operational Focus: {lastRelationshipOutcome.quality_comparison.after.selection_strategy?.replaceAll("_", " ")} · {lastRelationshipOutcome.quality_comparison.after.preserved_relationship_edges} relationship edges preserved.
              </p>
            </div>
          )}
          </div>}
        </section>
      )}

      {(qualityFindings.length > 0 || qualityQuery.isError) && (
        <section className="order-5 rounded-2xl border border-amber-200 bg-white p-4 shrink-0" aria-label="Governed graph-quality work">
          <div className="flex items-start justify-between gap-3">
            <button type="button" onClick={() => toggleSection("graphQuality")} aria-expanded={graphQualityOpen} aria-controls="company-graph-quality-detail" className="flex min-w-0 flex-1 items-start gap-3 text-left">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700"><AlertCircle className="h-4 w-4" /></span>
              <span className="min-w-0 flex-1">
              <p className="text-xs font-black text-slate-800">Graph-quality work</p>
              <p className="text-[11px] text-slate-500 mt-0.5">{graphQualitySummary.open} open · {graphQualitySummary.critical} critical · {graphQualitySummary.unverified || 0} unverified · {graphQualitySummary.affected_records || 0} affected</p>
              <p className="mt-0.5 text-[11px] font-bold text-amber-700">Overall health: {graphHealth}</p>
              </span>
              {graphQualityOpen ? <ChevronUp className="mt-1 h-4 w-4 shrink-0 text-slate-400" /> : <ChevronDown className="mt-1 h-4 w-4 shrink-0 text-slate-400" />}
            </button>
            <div className="flex gap-2"><button onClick={() => setGovernanceWorkspace("quality")} className="text-[11px] font-bold text-slate-600 hover:text-slate-900">Open workspace</button><button onClick={() => navigate(createPageUrl("DataReadiness"))} className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800">Open Data Readiness</button></div>
          </div>
          {graphQualityOpen && <div id="company-graph-quality-detail">
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 p-2">
            <select aria-label="Filter graph-quality severity" value={qualityQueue.severity} onChange={event => setQualityQueue(current => ({ ...current, severity: event.target.value, offset: 0 }))} className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px]"><option value="">All severities</option><option value="critical">Critical</option><option value="warning">Warning</option><option value="low">Low</option></select>
            <select aria-label="Filter graph-quality verification" value={qualityQueue.verification} onChange={event => setQualityQueue(current => ({ ...current, verification: event.target.value, offset: 0 }))} className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px]"><option value="">All verification</option><option value="unverified">Unverified</option><option value="verified">Verified</option></select>
            <select aria-label="Sort graph-quality work" value={qualityQueue.sort} onChange={event => setQualityQueue(current => ({ ...current, sort: event.target.value, offset: 0 }))} className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px]"><option value="priority">Severity and consequence</option><option value="affected_records">Affected records</option></select>
            <span className="ml-auto text-[11px] font-semibold text-slate-500">Showing {qualityQuery.data?.pagination?.visible || 0} of {qualityQuery.data?.pagination?.total || 0}</span>
          </div>
          {qualityQuery.isError ? (
            <div role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-[11px] text-rose-700">
              {qualityQuery.error.message}
              {qualityQuery.error.action && <span className="block mt-1 font-bold">Operator action: {qualityQuery.error.action.replaceAll("_", " ")}</span>}
            </div>
          ) : (
            <div className="mt-3 grid gap-2 xl:grid-cols-2">
              {qualityFindings.map(finding => (
                <article key={finding.finding_key} className={`rounded-xl border p-3 ${selectedQualityFinding?.finding_key === finding.finding_key ? "border-amber-400 bg-amber-50/30" : "border-slate-200"}`}>
                  <div className="flex items-start gap-2">
                    <span className={`mt-0.5 rounded-full px-2 py-0.5 text-[11px] font-black uppercase ${finding.severity === "critical" ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700"}`}>{finding.severity}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-black text-slate-800">{finding.affected_count} · {finding.issue_code.replaceAll("_", " ").toLowerCase()}</p>
                      <p className="mt-1 text-[11px] text-slate-500">{finding.business_consequence}</p>
                      <p className="mt-1 text-[11px] font-semibold text-slate-700">Owner: {finding.owner?.display_name || "Unassigned"} · {finding.verification_status} · scope {finding.affected_scope?.label || finding.scope?.id || selectedScopeLabel}</p>
                      <p className="mt-1 text-[11px] text-slate-400">Repair: {finding.suggested_repair}</p>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <button onClick={() => inspectQualityFinding(finding)} className="rounded-lg bg-amber-600 px-2 py-1 text-[11px] font-bold text-white">Inspect affected records</button>
                    {qualityQuery.data?.can_manage && !finding.task_id && <button onClick={() => runQualityWork(finding, "create_task").catch(error => reportGraphError("Task creation failed", error))} className="rounded-lg bg-slate-900 px-2 py-1 text-[11px] font-bold text-white">Create repair task</button>}
                    <button onClick={() => openIdjwiGraphAction(
                      `Explain graph-quality finding ${finding.issue_code} and its safest repair.`,
                      IDJWI_GRAPH_INTENTS.RECOMMEND_GRAPH_ACTION,
                      idjwiGraphContext,
                      { graph_quality_finding: finding },
                    )} className="rounded-lg border border-violet-200 px-2 py-1 text-[11px] font-bold text-violet-700">Ask Idjwi</button>
                    <details className="relative"><summary className="cursor-pointer list-none rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-bold text-slate-600">More actions</summary><div className="absolute right-0 z-30 mt-1 w-40 space-y-1 rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
                      {qualityQuery.data?.can_manage && !finding.recommendation_id && <button onClick={() => runQualityWork(finding, "create_recommendation").catch(error => reportGraphError("Recommendation creation failed", error))} className="block w-full rounded px-2 py-1 text-left text-[11px] font-bold hover:bg-slate-50">Recommend repair</button>}
                      {qualityQuery.data?.can_manage && finding.alert_state === "open" && <button onClick={() => runQualityWork(finding, "acknowledge_alert").catch(error => reportGraphError("Alert acknowledgement failed", error))} className="block w-full rounded px-2 py-1 text-left text-[11px] font-bold text-rose-700 hover:bg-rose-50">Acknowledge alert</button>}
                      {qualityQuery.data?.can_manage && finding.verification_status !== "verified" && <button onClick={() => runQualityWork(finding, "mark_verified").catch(error => reportGraphError("Finding verification failed", error))} className="block w-full rounded px-2 py-1 text-left text-[11px] font-bold text-emerald-700 hover:bg-emerald-50">Verify</button>}
                      {qualityQuery.data?.can_manage && finding.status !== "resolved" && <button onClick={() => runQualityWork(finding, "resolve").catch(error => reportGraphError("Finding resolution failed", error))} className="block w-full rounded px-2 py-1 text-left text-[11px] font-bold text-blue-700 hover:bg-blue-50">Resolve</button>}
                    </div></details>
                  </div>
                  <details className="mt-2 rounded-lg bg-slate-50 p-2"><summary className="cursor-pointer text-[11px] font-bold text-slate-600">Evidence and repair rationale</summary><pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap text-[11px] text-slate-600">{JSON.stringify(finding.evidence || [], null, 2)}</pre></details>
                  {finding.resolution_history?.length > 0 && <p className="mt-2 text-[11px] text-slate-400">{finding.resolution_history.length} audited resolution event{finding.resolution_history.length === 1 ? "" : "s"}</p>}
                </article>
              ))}
            </div>
          )}
          <div className="mt-3 flex items-center justify-between">
            <button disabled={qualityQueue.offset === 0} onClick={() => setQualityQueue(current => ({ ...current, offset: Math.max(0, current.offset - (governanceWorkspace === "quality" ? 20 : 4)) }))} className="rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-bold disabled:opacity-40">Previous</button>
            <button onClick={() => navigate(createPageUrl("DataReadiness"))} className="text-[11px] font-black text-indigo-700">View all in Data Readiness</button>
            <button disabled={!qualityQuery.data?.pagination?.has_more} onClick={() => setQualityQueue(current => ({ ...current, offset: qualityQuery.data.pagination.next_offset }))} className="rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-bold disabled:opacity-40">Next</button>
          </div>
          </div>}
        </section>
      )}

      {isAdministrator && (
        <section className="order-1 rounded-2xl border border-slate-200 bg-white shrink-0" aria-labelledby="company-graph-guide-title">
          <button
            type="button"
            onClick={() => toggleSection("pageGuide")}
            aria-expanded={pageGuideOpen}
            aria-controls="company-graph-guide"
            className="w-full flex items-center gap-3 p-3 text-left hover:bg-slate-50 rounded-2xl"
          >
            <span className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
              <Info className="w-4 h-4" />
            </span>
            <span className="flex-1 min-w-0">
              <span id="company-graph-guide-title" className="block text-xs font-black text-slate-800">What is Company Graph?</span>
              <span className="block text-[11px] text-slate-500 mt-0.5">A governed map of authorized operational records, relationships, evidence, decisions, and actions.</span>
            </span>
            {pageGuideOpen ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
          </button>
          {pageGuideOpen && (
            <div id="company-graph-guide" className="grid gap-3 md:grid-cols-2 xl:grid-cols-4 px-4 pb-4 border-t border-slate-100 pt-3 text-[11px] leading-relaxed">
              <div>
                <p className="font-black text-slate-700">What it maps</p>
                <p className="text-slate-500 mt-1">People, enterprises, work, transactions, products, services, places, observations, recommendations, decisions, actions, and their governed connections in the selected scope.</p>
              </div>
              <div>
                <p className="font-black text-slate-700">Where truth lives</p>
                <p className="text-slate-500 mt-1">Canonical facts remain in Newsconseen's operational system. Derived links and observations retain provenance, freshness, confidence, and status; the graph itself is a projection.</p>
              </div>
              <div>
                <p className="font-black text-slate-700">How Idjwi helps</p>
                <p className="text-slate-500 mt-1">Idjwi uses the same authorized evidence to explain structure, changes, gaps, risks, and permitted next steps. Optional advisors contribute proposals only.</p>
              </div>
              <div>
                <p className="font-black text-slate-700">Administrator responsibility</p>
                <p className="text-slate-500 mt-1">Choose the correct organizational scope, review readiness and partial-source warnings, and confirm or reject corrections only when evidence and permissions support them.</p>
              </div>
            </div>
          )}
        </section>
      )}

      <section className="order-2 flex min-h-[620px] flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50/60 p-3" aria-label="Primary Company Graph workspace">
      <div className="grid shrink-0 gap-2 xl:grid-cols-[auto_minmax(280px,1fr)_auto]" aria-label="Company Graph controls">
        <div className="flex flex-wrap items-end gap-2 rounded-xl border border-slate-200 bg-white p-2" aria-label="Scope controls">
          <label className="text-[11px] font-black uppercase tracking-wider text-slate-400"><span className="mb-1 block">Scope</span><select aria-label="Organization or operational-unit scope" value={scopeId} onChange={event => {
            neighborhoodCoordinatorRef.current.cancel();
            setScopeId(event.target.value);
            setNeighborhoodGraph(null);
            setSelectedNode(null);
            setInspectionTrail([]);
            setNeighborhoodState({ status: "idle", error: "" });
          }} className="min-w-48 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11px] font-semibold normal-case tracking-normal text-slate-700"><option value="">Organization-wide</option>{scopeOptions.map(node => <option key={node.id} value={node.entity_id}>{node.label} · {(node.attributes?.unit_type || "operational unit").replaceAll("_", " ")}</option>)}</select></label>
        </div>

        <div className="flex min-w-0 items-end gap-2 rounded-xl border border-slate-200 bg-white p-2" aria-label="Find controls">
          <div className="relative min-w-[220px] flex-1">
          <span className="mb-1 block text-[11px] font-black uppercase tracking-wider text-slate-400">Find</span>
          <Search className="absolute left-3 top-6 w-3.5 h-3.5 text-slate-400" />
          <input aria-label="Find a record in the company graph" value={searchTerm} onChange={event => setSearchTerm(event.target.value)} placeholder="Find records, references, predicates or status…" className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-9 pr-3 text-[11px]" />
          {searchTerm.trim().length >= 2 && (
            <div className="absolute z-40 top-full mt-1 w-full max-h-96 overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-xl">
              {searchResults.map(node => (
                <button key={node.id} onClick={() => { setSearchTerm(""); inspectNode(node, 1); }} className="w-full flex justify-between gap-2 px-3 py-2 text-xs hover:bg-slate-50 text-left">
                  <span className="truncate"><span className="font-semibold">{node.label}</span><span className="block text-[11px] text-slate-400 truncate">{node.sublabel || node.status || node.entity_id}</span></span>
                  <span className="capitalize text-slate-400 shrink-0">{node.entity_type}</span>
                </button>
              ))}
              {edgeSearchResults.map(edge => (
                <button key={edge.id} onClick={() => inspectSearchedEdge(edge).catch(error => reportGraphError("Relationship inspection failed", error))} className="w-full px-3 py-2 text-xs hover:bg-amber-50 text-left border-t border-slate-100">
                  <span className="font-semibold text-slate-700">{edge.source_label}</span>
                  <span className="mx-1.5 text-amber-600">{edge.label || edge.predicate}</span>
                  <span className="font-semibold text-slate-700">{edge.target_label}</span>
                  <span className="block text-[11px] text-slate-400">{edge.match_reason.replaceAll("_", " ")} · {Math.round((edge.confidence || 0) * 100)}%</span>
                </button>
              ))}
              <button onClick={() => {
                openIdjwiGraphAction(
                  `Search the governed company graph for: ${searchTerm.trim()}`,
                  IDJWI_GRAPH_INTENTS.SEARCH_COMPANY_GRAPH,
                  idjwiGraphContext,
                  { graph_search_query: searchTerm.trim() },
                );
              }} className="w-full flex items-center gap-2 px-3 py-2.5 text-xs font-bold text-violet-700 bg-violet-50 border-t border-violet-100 hover:bg-violet-100">
                <Sparkles className="w-3.5 h-3.5" /> Ask Idjwi to search naturally
              </button>
              {!graphSearchQuery.isLoading && searchResults.length === 0 && edgeSearchResults.length === 0 && <p className="px-3 py-2 text-[11px] text-slate-400">No direct governed match. Idjwi can interpret the question using the visible graph.</p>}
            </div>
          )}
          </div>
          <button onClick={() => askIdjwiToFind().catch(error => reportGraphError("Idjwi graph search failed", error))} className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-violet-50 px-2.5 py-1.5 text-[11px] font-black text-violet-700"><Sparkles className="h-3.5 w-3.5" /> Ask Idjwi</button>
        </div>

        <button type="button" onClick={() => toggleSection("graphStatus")} aria-expanded={graphStatusOpen} aria-controls="company-graph-status-detail" className={`flex min-w-56 items-center gap-2 rounded-xl border px-3 py-2 text-left ${graphStatus.color}`}><StatusIcon className="h-4 w-4 shrink-0" /><span className="min-w-0 flex-1"><span className="block text-[11px] font-black uppercase tracking-wider">Graph health</span><span className="block truncate text-[11px] font-bold">{graphStatus.label}</span></span>{graphStatusOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}</button>

        <div className="flex flex-wrap items-end gap-2 rounded-xl border border-slate-200 bg-white p-2 xl:col-span-3" aria-label="View, navigation, boundary and governance controls">
          <div className="flex flex-wrap items-end gap-1.5 border-r border-slate-200 pr-2"><span className="mb-1 w-full text-[11px] font-black uppercase tracking-wider text-slate-400">View</span><select aria-label="Operational graph question and layout" value={graphMode} onChange={event => setGraphMode(event.target.value)} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11px] font-semibold">{Object.entries(GRAPH_MODES).filter(([, definition]) => !definition.legacy).map(([key, { label }]) => <option key={key} value={key}>{label}</option>)}</select>{savedViews.length > 0 && <select aria-label="Governed saved graph views" defaultValue="" onChange={event => applySavedView(event.target.value)} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11px]"><option value="">Saved views</option>{savedViews.map(view => <option key={view.id} value={view.id}>{view.name} · {view.audience}{view.validation_state !== "valid" ? " · review" : ""}</option>)}</select>}<select aria-label="Accessible graph representation" value={graphRepresentation} onChange={event => setGraphRepresentation(event.target.value)} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11px]"><option value="visual">Visual graph</option><option value="records">Record list</option><option value="relationships">Relationship table</option><option value="outline">Neighborhood outline</option><option value="summary">Text summary</option></select><button onClick={() => setFiltersOpen(value => !value)} aria-expanded={filtersOpen} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1.5 text-[11px] font-bold"><Filter className="h-3 w-3" /> Filters</button></div>

          <div className="flex flex-wrap items-end gap-1.5 border-r border-slate-200 pr-2"><span className="mb-1 w-full text-[11px] font-black uppercase tracking-wider text-slate-400">Navigate</span><button onClick={returnToOverview} className="rounded-lg border border-slate-200 px-2 py-1.5 text-[11px] font-bold">Overview</button><button disabled={!inspectionTrail.length} onClick={inspectBack} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1.5 text-[11px] font-bold disabled:opacity-40"><ArrowLeft className="h-3 w-3" /> Back</button><span className="rounded-lg bg-slate-50 px-2 py-1.5 text-[11px] text-slate-500">{pinnedNodes.length} pinned · {compareNodes.length}/2 compare</span></div>

          <div className="flex flex-wrap items-end gap-1.5 border-r border-slate-200 pr-2"><span className="mb-1 w-full text-[11px] font-black uppercase tracking-wider text-slate-400">Boundary</span><span className="rounded-lg bg-slate-50 px-2 py-1.5 text-[11px] font-semibold text-slate-600">Showing {effectiveGraphContract.truncation?.returned_nodes ?? nodes.length} of at least {(effectiveGraphContract.truncation?.returned_nodes ?? nodes.length) + (effectiveGraphContract.truncation?.omitted_nodes || 0)} authorized records</span>{!neighborhoodGraph && effectiveGraphContract.truncation?.continuation_available && <button disabled={loadingContinuation} onClick={() => loadNextBoundedPage().catch(error => reportGraphError("Additional graph records could not be loaded", error))} className="rounded-lg border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] font-black text-amber-800 disabled:opacity-50">{loadingContinuation ? "Loading…" : `Load ${effectiveGraphContract.truncation?.omitted_nodes || "more"} more`}</button>}</div>

          <div className="flex flex-wrap items-end gap-1.5"><span className="mb-1 w-full text-[11px] font-black uppercase tracking-wider text-slate-400">Governance</span><button onClick={() => saveCurrentView().catch(error => reportGraphError("Saved view could not be created", error))} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1.5 text-[11px] font-bold"><Save className="h-3 w-3" /> Save</button><button disabled={!canExportGraph} onClick={() => exportGraph().catch(error => reportGraphError("Governed export failed", error))} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1.5 text-[11px] font-bold disabled:opacity-40"><Download className="h-3 w-3" /> Export</button>{isAdministrator && <button onClick={() => setGovernanceWorkspace("relationships")} className="rounded-lg border border-indigo-200 px-2 py-1.5 text-[11px] font-bold text-indigo-700">Review queues</button>}</div>
          {savedViewsQuery.isError && <span role="status" className="text-[11px] font-semibold text-amber-700">Saved views unavailable</span>}
        </div>
      </div>

      {graphStatusOpen && <div id="company-graph-status-detail" className="grid gap-2 rounded-xl border border-slate-200 bg-white p-3 text-[11px] text-slate-600 sm:grid-cols-2 lg:grid-cols-4" role="status">
        <p><span className="font-black text-slate-800">Service:</span> {governedQuery.isError ? "Unavailable" : "Available"}</p>
        <p><span className="font-black text-slate-800">Scope:</span> {selectedScopeLabel}</p>
        <p><span className="font-black text-slate-800">Completeness:</span> {effectiveGraphContract.completeness?.state || "unavailable"}</p>
        <p><span className="font-black text-slate-800">Freshness:</span> {effectiveGraphContract.generated_at ? new Date(effectiveGraphContract.generated_at).toLocaleString() : "Not disclosed"}</p>
        <p><span className="font-black text-slate-800">Source failures:</span> {unavailableSourceCount}</p>
        <p><span className="font-black text-slate-800">Boundary:</span> {effectiveGraphContract.truncation?.truncated ? `${effectiveGraphContract.truncation.omitted_nodes || 0} records omitted` : "No disclosed truncation"}</p>
        <p><span className="font-black text-slate-800">Relationship work:</span> {relationshipReviewSummary.pending}</p>
        <p><span className="font-black text-slate-800">Quality work:</span> {graphQualitySummary.open}</p>
        <p className="sm:col-span-2 lg:col-span-4"><span className="font-black text-slate-800">System health:</span> {graphStatus.label}. <span className="font-black text-slate-800">Data quality:</span> {graphHealth}.</p>
        <div className="sm:col-span-2 lg:col-span-4" aria-label="Supporting capability status"><p className="mb-2 font-black text-slate-800">Supporting capabilities</p><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{[["alerts", "Alerts status"], ["approvals", "Pending approvals"], ["intelligence", "Intelligence inbox"], ["graph_audit", "Graph audit"]].map(([key, label]) => {
          const capability = supportingCapabilities[key];
          const state = capability?.state || (supportingCapabilitiesQuery.isLoading ? "checking" : "unavailable");
          const icon = state === "available" ? "✓" : state === "empty" ? "○" : state === "unauthorized" ? "⊘" : state === "degraded" ? "△" : state === "checking" ? "…" : "!";
          return <div key={key} className="rounded-lg border border-slate-200 bg-slate-50 p-2"><p className="font-black text-slate-700"><span aria-hidden="true">{icon} </span>{label}</p><p className="mt-1 capitalize text-slate-500">{state}</p>{capability?.message && <p className="mt-1 text-slate-500">{capability.message}</p>}</div>;
        })}</div></div>
      </div>}

      {(inspectionTrail.length > 0 || pinnedNodes.length > 0) && (
        <div className="flex items-center gap-2 flex-wrap shrink-0" aria-label="Graph inspection navigation">
          <button onClick={returnToOverview} className="text-[11px] font-bold text-slate-500 hover:text-slate-800">Overview</button>
          {inspectionTrail.map((item, index) => (
            <React.Fragment key={`${item.id}-${index}`}>
              <span className="text-slate-300">/</span>
              <button onClick={() => inspectTrailIndex(index)} className={`max-w-36 truncate text-[11px] ${index === inspectionTrail.length - 1 ? "font-black text-slate-800" : "text-slate-500 hover:text-slate-800"}`}>{item.label}</button>
            </React.Fragment>
          ))}
          {pinnedNodes.length > 0 && (
            <div className="ml-auto flex items-center gap-1">
              <Pin className="w-3 h-3 text-amber-600" />
              {pinnedNodes.map(node => (
                <button key={node.id} onClick={() => inspectNode(node, 1)} className="px-2 py-1 rounded-full border border-amber-200 bg-amber-50 text-[11px] font-bold text-amber-800 max-w-28 truncate">{node.label}</button>
              ))}
            </div>
          )}
        </div>
      )}

      {neighborhoodState.status === "error" && (
        <div role="alert" className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 shrink-0">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span className="font-semibold flex-1">Neighborhood unavailable: {neighborhoodState.error}</span>
          {selectedNode?.node && <button onClick={() => inspectNode(selectedNode.node, neighborhoodDepth, { recordHistory: false })} className="font-black underline">Retry</button>}
        </div>
      )}

      {compareNodes.length > 0 && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 shrink-0" aria-label="Node comparison">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] font-black uppercase tracking-widest text-blue-700">Compare nodes · {compareNodes.length}/2</p>
            <button onClick={() => setCompareNodes([])} className="text-[11px] font-bold text-blue-600">Clear</button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {compareNodes.map(node => (
              <button key={node.id} onClick={() => inspectNode(node, 1)} className="rounded-lg bg-white border border-blue-100 p-2 text-left">
                <p className="text-xs font-black text-slate-800 truncate">{node.label}</p>
                <p className="text-[11px] text-slate-500 capitalize">{node.entity_type} · {node.status || "status unavailable"}</p>
                <p className="text-[11px] text-slate-500">Importance {Math.round((node.importance || 0) * 100)}% · {node.risk_level ? `${node.risk_level} risk` : "no flagged risk"}</p>
                <p className="text-[11px] font-semibold text-blue-600">
                  {edges.filter(edge => edge.source === node.id || edge.target === node.id).length} visible relationships
                </p>
              </button>
            ))}
            {compareNodes.length === 1 && <div className="rounded-lg border border-dashed border-blue-200 flex items-center justify-center text-[11px] text-blue-500 p-2">Select another node and choose Compare node</div>}
          </div>
        </div>
      )}

      {/* ── Optional view filters ─────────────────────────────────────────── */}
      {filtersOpen && <div className="flex items-center gap-2 flex-wrap shrink-0 rounded-xl border border-slate-200 bg-white p-2">
        <span className="text-xs font-bold text-slate-400 uppercase tracking-widest mr-1">Focus</span>
        {PULSE_FILTERS.map(pf => {
          const PIcon = pf.icon;
          const count = stats[pf.key] || 0;
          const isActive = activeFilter === pf.key;
          return (
            <button
              key={pf.key}
              onClick={() => pulseClick(pf.key)}
              aria-pressed={isActive}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                isActive
                  ? "bg-slate-800 text-white border-slate-700 shadow-sm"
                  : `${pf.color} hover:opacity-80`
              }`}
            >
              <PIcon className="w-3.5 h-3.5" />
              {pf.label}
              {count > 0 && (
                <span className={`px-1.5 py-0.5 rounded-full text-[11px] font-black ${isActive ? "bg-white/20" : "bg-current/10"}`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}

        <div className="ml-auto flex items-center gap-2">
          {expandedClusterIds.size > 0 && (
            <button onClick={() => setExpandedClusterIds(new Set())} className="rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-[11px] font-bold text-indigo-700">
              Restore {expandedClusterIds.size} summary {expandedClusterIds.size === 1 ? "cluster" : "clusters"}
            </button>
          )}

          {isLoading && <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />}
        </div>
      </div>}

      {/* ── What needs attention today ──────────────────────────────────────── */}
      <div className="flex items-center gap-2 flex-wrap shrink-0">
        <span className="text-xs font-bold text-slate-400 uppercase tracking-widest mr-1">Needs attention</span>
        {governedQuery.isError && !fallbackEnabled ? (
          <span className="text-xs text-rose-600 font-medium">Operational evaluation unavailable</span>
        ) : attentionSignals.length === 0 && effectiveGraphContract.completeness.state === "complete" ? (
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
        <span className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Graph quality</span>
        {governedGraph.quality.issues.map(issue => <button key={issue.code} onClick={() => { setGraphMode("data_quality"); setActiveFilter("unconnected"); }} className={`shrink-0 text-[11px] font-bold px-2.5 py-1 rounded-full border ${issue.severity === "critical" ? "bg-rose-50 text-rose-700 border-rose-200" : "bg-amber-50 text-amber-700 border-amber-200"}`}>{issue.code.replaceAll("_", " ")} · {issue.count}</button>)}
      </div>}

      {/* ── Type filter toggles ─────────────────────────────────────────────── */}
      {filtersOpen && <div className="flex items-center gap-1.5 flex-wrap shrink-0 rounded-xl border border-slate-200 bg-white p-2">
        <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        {Object.entries(ENTITY_CONFIG).map(([type, cfg]) => {
          const isOn = visibleTypes.has(type);
          const count = nodes.filter(n => n.entity_type === type).length;
          if (count === 0) return null;
          return (
            <button
              key={type}
              onClick={() => toggleType(type)}
              className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold border transition-all ${
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
      </div>}

      {/* ── Main area: Graph + Context panel ──────────────────────────────────── */}
      <p className="sr-only" aria-live="polite">{screenReaderMessage}</p>
      <div className={`flex flex-none flex-col gap-3 lg:flex-row ${productSurface === "desktop" ? "h-[calc(100vh-15rem)] min-h-[600px]" : "h-[480px] sm:h-[540px] lg:h-[clamp(600px,68vh,720px)]"}`}>

        {/* Graph canvas */}
        <div className={`flex flex-col flex-1 min-w-0 min-h-0 transition-all ${selectedNode ? "mr-0" : ""}`}>
          {graphRepresentation !== "visual" ? (
            <AccessibleGraphView mode={graphRepresentation} nodes={filteredNodes} edges={filteredEdges} onInspectNode={node => inspectNode(node, 1)} onInspectEdge={handleEdgeSelect} />
          ) : isLoading && enterprises.length === 0 ? (
            <div className="flex-1 flex items-center justify-center bg-slate-950 rounded-2xl border border-slate-800">
              <div className="text-center">
                <Loader2 className="w-8 h-8 text-slate-600 animate-spin mx-auto mb-3" />
                <p className="text-sm text-slate-500">Building company graph…</p>
              </div>
            </div>
          ) : (
            <GraphCanvas
              elements={cyElements}
              layoutMode={effectiveLayoutMode}
              onNodeSelect={handleNodeSelect}
              onEdgeSelect={handleEdgeSelect}
              highlightTypes={pulseHighlight}
              activeFilter={activeFilter}
              focusNodeId={focusNodeId}
              focusNodeIds={qualityFocusNodeIds}
              focusEdgeId={focusEdgeId}
              onExpandGraph={() => setExpansionMode("graph")}
              onExpandWorkspace={() => setExpansionMode("workspace")}
              graphExpandButtonRef={graphExpandButtonRef}
              workspaceExpandButtonRef={workspaceExpandButtonRef}
              legendExpanded={relationshipLegendOpen}
              onToggleLegend={() => toggleSection("relationshipLegend")}
              viewportRef={graphViewportRef}
            />
          )}
        </div>

        {/* Context panel */}
        <div id="company-graph-inspector" tabIndex={-1} className={`shrink-0 transition-all duration-200 w-full ${selectedNode ? "flex max-h-[220px] lg:w-80 lg:max-h-none" : "hidden"} bg-white border border-slate-200 rounded-2xl overflow-hidden flex-col focus:outline-none focus:ring-2 focus:ring-indigo-500`}>
          <ContextPanel
            selected={selectedNode}
            onClose={() => setSelectedNode(null)}
            navigate={navigate}
            companyId={currentUser?.company_id}
            onGraphRefresh={async () => { setNeighborhoodGraph(null); await governedQuery.refetch(); }}
            graphContext={idjwiGraphContext}
            onInspectNode={node => inspectNode(node, 1)}
            onExpand={node => inspectNode(node, Math.min(3, neighborhoodDepth + 1), { recordHistory: false })}
            neighborhoodDepth={neighborhoodDepth}
            inspectionState={neighborhoodState}
            isPinned={Boolean(selectedNode?.node && pinnedNodes.some(node => node.id === selectedNode.node.id))}
            onTogglePin={togglePin}
            isCompared={Boolean(selectedNode?.node && compareNodes.some(node => node.id === selectedNode.node.id))}
            onToggleCompare={toggleCompare}
            onExpandCluster={expandSemanticCluster}
            onCreateRepairWork={createClusterRepairWork}
            onRestorePrevious={restorePreviousCitationContext}
            canRestorePrevious={Boolean(citationPreviousSelection)}
            onCandidateDecision={(candidate, decision, corrected) => decideCandidates([candidate.assertion_key], decision, corrected).catch(error => reportGraphError("Relationship decision failed", error))}
            insights={insights}
            risks={risks}
            opportunities={opportunities}
          />
        </div>
      </div>
      </section>
      {governanceWorkspace && typeof document !== "undefined" && createPortal(
        <div role="dialog" aria-modal="true" aria-label={governanceWorkspace === "relationships" ? "Relationship governance workspace" : "Graph-quality governance workspace"} className="fixed inset-0 z-[75] flex flex-col bg-slate-50 p-4">
          <header className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-3 shadow-sm">
            <div className="min-w-0 flex-1"><h2 className="text-sm font-black text-slate-900">{governanceWorkspace === "relationships" ? "Relationship governance" : "Graph-quality repair workspace"}</h2><p className="text-[11px] text-slate-500">{selectedScopeLabel} · authorized administrator work queue</p></div>
            <button onClick={() => setGovernanceWorkspace(null)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-[11px] font-black">Close</button>
          </header>
          <div className="mt-3 grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(360px,42%)]">
            <div className="overflow-auto rounded-2xl border border-slate-200 bg-white p-4">
              {governanceWorkspace === "relationships" ? relationshipCandidates.map(candidate => (
                <button key={candidate.assertion_key} onClick={() => inspectRelationshipCandidate(candidate).catch(error => reportGraphError("Relationship inspection failed", error))} className="mb-2 block w-full rounded-xl border border-slate-200 p-3 text-left hover:border-indigo-300">
                  <span className="text-[11px] font-black uppercase text-indigo-700">{candidate.assertion_state} · {Math.round(Number(candidate.candidate_confidence || 0) * 100)}%</span>
                  <span className="mt-1 block text-[11px] font-black text-slate-800">{candidate.source_node_id} → {candidate.predicate?.replaceAll("_", " ")} → {candidate.target_node_id}</span>
                  <span className="mt-1 block text-[11px] text-slate-500">Safe bulk group: {candidate.bulk_group_key || "individual review only"}</span>
                </button>
              )) : qualityFindings.map(finding => (
                <button key={finding.finding_key} onClick={() => inspectQualityFinding(finding)} className="mb-2 block w-full rounded-xl border border-slate-200 p-3 text-left hover:border-amber-300">
                  <span className="text-[11px] font-black uppercase text-amber-700">{finding.severity} · {finding.verification_status}</span>
                  <span className="mt-1 block text-[11px] font-black text-slate-800">{finding.issue_code.replaceAll("_", " ")} · {finding.affected_count} affected</span>
                  <span className="mt-1 block text-[11px] text-slate-500">{finding.business_consequence}</span>
                </button>
              ))}
              {!relationshipCandidates.length && governanceWorkspace === "relationships" && <p className="text-xs text-slate-500">No proposals match this authorized page.</p>}
              {!qualityFindings.length && governanceWorkspace === "quality" && <p className="text-xs text-slate-500">No findings match this authorized page.</p>}
            </div>
            <div className="min-h-[420px] overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <GraphCanvas elements={cyElements} layoutMode={effectiveLayoutMode} onNodeSelect={handleNodeSelect} onEdgeSelect={handleEdgeSelect} highlightTypes={pulseHighlight} activeFilter={activeFilter} focusNodeId={focusNodeId} focusNodeIds={qualityFocusNodeIds} focusEdgeId={focusEdgeId} expansionMode="workspace" onCloseExpansion={() => setGovernanceWorkspace(null)} legendExpanded={relationshipLegendOpen} onToggleLegend={() => toggleSection("relationshipLegend")} viewportRef={graphViewportRef} />
            </div>
          </div>
        </div>, document.body,
      )}
      {expansionMode && typeof document !== "undefined" && createPortal(
        <div
          ref={expandedOverlayRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-label={expansionMode === "workspace" ? "Expanded Company Graph workspace" : "Expanded Company Graph canvas"}
          className="fixed inset-0 z-[70] flex min-h-0 flex-col bg-slate-50 p-3 focus:outline-none"
          style={{ paddingRight: expansionMode === "workspace" && idjwiWorkspaceWidth ? `${idjwiWorkspaceWidth + 12}px` : undefined }}
        >
          <header className="mb-3 flex min-h-12 flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 shadow-sm">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-black text-slate-800">{expansionMode === "workspace" ? "Company Graph workspace" : "Company Graph"}</p>
              <p className="truncate text-[11px] text-slate-500">{selectedScopeLabel} · {graphStatus.label} · {filteredNodes.length} nodes · {filteredEdges.length} relationships</p>
            </div>
            {inspectionTrail.length > 0 && <button onClick={inspectBack} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-bold text-slate-600"><ArrowLeft className="h-3.5 w-3.5" /> Back</button>}
            <button onClick={() => openIdjwiGraphAction("Explain the currently visible governed graph.", IDJWI_GRAPH_INTENTS.EXPLAIN_COMPANY_GRAPH, idjwiGraphContext)} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-black text-white"><Sparkles className="h-3.5 w-3.5" /> Ask Idjwi</button>
            <button onClick={closeExpansion} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-[11px] font-black text-slate-700" aria-label="Exit expanded Company Graph"><Minimize2 className="h-3.5 w-3.5" /> Exit</button>
          </header>
          <div className="flex min-h-0 flex-1 flex-col gap-3 lg:flex-row">
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              <GraphCanvas
                elements={cyElements}
                layoutMode={effectiveLayoutMode}
                onNodeSelect={handleNodeSelect}
                onEdgeSelect={handleEdgeSelect}
                highlightTypes={pulseHighlight}
                activeFilter={activeFilter}
                focusNodeId={focusNodeId}
                focusNodeIds={qualityFocusNodeIds}
                focusEdgeId={focusEdgeId}
                expansionMode={expansionMode}
                onCloseExpansion={closeExpansion}
                legendExpanded={relationshipLegendOpen}
                onToggleLegend={() => toggleSection("relationshipLegend")}
                viewportRef={graphViewportRef}
              />
            </div>
            {expansionMode === "workspace" && selectedNode && (
              <aside className={`flex min-h-0 max-h-[40vh] w-full shrink-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white lg:max-h-none lg:w-80 ${idjwiWorkspaceWidth ? "hidden 2xl:flex" : ""}`} aria-label="Expanded graph inspector">
                <ContextPanel
                  selected={selectedNode}
                  onClose={() => setSelectedNode(null)}
                  navigate={navigate}
                  companyId={currentUser?.company_id}
                  onGraphRefresh={async () => { setNeighborhoodGraph(null); await governedQuery.refetch(); }}
                  graphContext={idjwiGraphContext}
                  onInspectNode={node => inspectNode(node, 1)}
                  onExpand={node => inspectNode(node, Math.min(3, neighborhoodDepth + 1), { recordHistory: false })}
                  neighborhoodDepth={neighborhoodDepth}
                  inspectionState={neighborhoodState}
                  isPinned={Boolean(selectedNode?.node && pinnedNodes.some(node => node.id === selectedNode.node.id))}
                  onTogglePin={togglePin}
                  isCompared={Boolean(selectedNode?.node && compareNodes.some(node => node.id === selectedNode.node.id))}
                  onToggleCompare={toggleCompare}
                  onExpandCluster={expandSemanticCluster}
                  onCreateRepairWork={createClusterRepairWork}
                  onRestorePrevious={restorePreviousCitationContext}
                  canRestorePrevious={Boolean(citationPreviousSelection)}
                  onCandidateDecision={(candidate, decision, corrected) => decideCandidates([candidate.assertion_key], decision, corrected).catch(error => reportGraphError("Relationship decision failed", error))}
                  insights={insights}
                  risks={risks}
                  opportunities={opportunities}
                />
              </aside>
            )}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
