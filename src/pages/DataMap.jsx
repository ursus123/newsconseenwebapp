/**
 * DataMap — Phase 11
 * Schema-level view of the 7 entity types, their record counts,
 * AI Readiness health scores, and ontological connections.
 *
 * This is the Palantir Foundry "data estate" view for SMEs:
 * one glance shows the entire data model, how healthy it is,
 * and how much data lives in each entity.
 *
 * Data source: GET /dataquality/report (record_counts + by_entity scores)
 * Fallback:    Base44 entity list calls
 */

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useEntityListFn } from "@/components/shared/useDataQuery";
import {
  RefreshCw, ExternalLink, Database, ShieldCheck, AlertTriangle,
  ChevronRight, Info, Layers, TrendingUp,
} from "lucide-react";

const RAILWAY_URL = "https://newsconseenwebapp-production.up.railway.app";
const RAILWAY_API_KEY = import.meta.env.VITE_RAILWAY_API_KEY || "";
const API_HEADERS = RAILWAY_API_KEY
  ? { "Content-Type": "application/json", "x-api-key": RAILWAY_API_KEY }
  : { "Content-Type": "application/json" };

// ── Entity definitions ─────────────────────────────────────────────────────
const ENTITIES = [
  {
    id:       "enterprises",
    label:    "Enterprise",
    plural:   "Enterprises",
    emoji:    "🏢",
    page:     "/Enterprises",
    desc:     "Any organisation, branch, department, franchise or project.",
    base44:   "Enterprise",
  },
  {
    id:       "people",
    label:    "Person",
    plural:   "People",
    emoji:    "👥",
    page:     "/People",
    desc:     "Any human: staff, client, contact or volunteer.",
    base44:   "Person",
  },
  {
    id:       "products",
    label:    "Product",
    plural:   "Products",
    emoji:    "📦",
    page:     "/Products",
    desc:     "Any item, service, resource or deliverable.",
    base44:   "Product",
  },
  {
    id:       "tasks",
    label:    "Task",
    plural:   "Tasks",
    emoji:    "✅",
    page:     "/Tasks",
    desc:     "Any activity, appointment, shift or work order.",
    base44:   "Task",
  },
  {
    id:       "transactions",
    label:    "Transaction",
    plural:   "Transactions",
    emoji:    "💳",
    page:     "/Transactions",
    desc:     "Any financial record: invoice, payment, expense or payroll.",
    base44:   "Transaction",
  },
  {
    id:       "addresses",
    label:    "Address",
    plural:   "Addresses",
    emoji:    "📍",
    page:     "/Addresses",
    desc:     "Any physical or postal location.",
    base44:   "Address",
  },
  {
    id:       "relationships",
    label:    "Relationship",
    plural:   "Relationships",
    emoji:    "🔗",
    page:     "/Relationships",
    desc:     "Links any two entities across the ontology.",
    base44:   "Relationship",
  },
];

// ── Fixed SVG node positions (700 × 500 canvas) ────────────────────────────
// Constellation layout: Enterprise at top-center, others arranged below.
const NODE_POS = {
  enterprises:   { cx: 350, cy: 70  },
  people:        { cx: 90,  cy: 210 },
  products:      { cx: 610, cy: 210 },
  tasks:         { cx: 90,  cy: 390 },
  transactions:  { cx: 610, cy: 390 },
  addresses:     { cx: 230, cy: 470 },
  relationships: { cx: 470, cy: 470 },
};

// ── Ontological edges ──────────────────────────────────────────────────────
const EDGES = [
  { from: "enterprises",   to: "people",        label: "employs / enrolls" },
  { from: "enterprises",   to: "products",       label: "stocks / sells" },
  { from: "enterprises",   to: "tasks",          label: "runs" },
  { from: "enterprises",   to: "transactions",   label: "records" },
  { from: "enterprises",   to: "addresses",      label: "located at" },
  { from: "people",        to: "tasks",          label: "assigned to" },
  { from: "people",        to: "transactions",   label: "pays / receives" },
  { from: "people",        to: "relationships",  label: "linked by" },
  { from: "products",      to: "tasks",          label: "involved in" },
  { from: "products",      to: "transactions",   label: "line items" },
  { from: "enterprises",   to: "relationships",  label: "member of" },
];

// ── Health score → colour ──────────────────────────────────────────────────
function healthColor(score) {
  if (score == null) return { fill: "#94a3b8", stroke: "#64748b", text: "#475569", badge: "bg-slate-100 text-slate-600" };
  if (score >= 90)   return { fill: "#10b981", stroke: "#059669", text: "#065f46", badge: "bg-emerald-100 text-emerald-700" };
  if (score >= 75)   return { fill: "#3b82f6", stroke: "#2563eb", text: "#1e3a8a", badge: "bg-blue-100 text-blue-700" };
  if (score >= 60)   return { fill: "#f59e0b", stroke: "#d97706", text: "#78350f", badge: "bg-amber-100 text-amber-700" };
  return               { fill: "#ef4444", stroke: "#dc2626", text: "#7f1d1d", badge: "bg-rose-100 text-rose-700" };
}

// ── Node radius: log-scale on record count ─────────────────────────────────
function nodeRadius(count) {
  if (!count) return 32;
  return Math.min(54, 28 + Math.log10(Math.max(1, count)) * 9);
}

// ── Format large numbers ───────────────────────────────────────────────────
function fmt(n) {
  if (n == null) return "–";
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

// ── Edge path with a slight curve ─────────────────────────────────────────
function edgePath(from, to) {
  const p1 = NODE_POS[from];
  const p2 = NODE_POS[to];
  const mx  = (p1.cx + p2.cx) / 2;
  const my  = (p1.cy + p2.cy) / 2;
  // Slight quadratic curve for visual clarity
  const dx  = p2.cx - p1.cx;
  const dy  = p2.cy - p1.cy;
  const len = Math.sqrt(dx * dx + dy * dy);
  const curve = len * 0.08; // 8% curve
  const nx  = -dy / len;
  const ny  =  dx / len;
  const qx  = mx + nx * curve;
  const qy  = my + ny * curve;
  return `M ${p1.cx} ${p1.cy} Q ${qx} ${qy} ${p2.cx} ${p2.cy}`;
}

// ── Main component ─────────────────────────────────────────────────────────
export default function DataMap() {
  const navigate = useNavigate();

  const [currentUser,  setCurrentUser]  = useState(null);
  const [report,       setReport]       = useState(null);   // dataquality report
  const [counts,       setCounts]       = useState({});     // record counts per entity
  const [loading,      setLoading]      = useState(true);
  const [refreshing,   setRefreshing]   = useState(false);
  const [selected,     setSelected]     = useState(null);   // entity id
  const [hoveredEdge,  setHoveredEdge]  = useState(null);
  const svgRef = useRef(null);

  const companyId = currentUser?.company_id;
  const listFn    = useEntityListFn(currentUser);

  // Load current user once
  useEffect(() => {
    base44.auth.me().then(setCurrentUser).catch(() => {});
  }, []);

  // Load quality report + record counts
  const loadData = useCallback(async (force = false) => {
    if (!companyId) return;
    force ? setRefreshing(true) : setLoading(true);

    try {
      // Tier 1: dataquality report (has record_counts + by_entity scores)
      const res = await fetch(
        `${RAILWAY_URL}/dataquality/report?company_id=${companyId}${force ? "&force=true" : ""}`,
        { headers: API_HEADERS },
      );
      if (res.ok) {
        const data = await res.json();
        setReport(data);
        if (data.record_counts && Object.keys(data.record_counts).length > 0) {
          setCounts(data.record_counts);
          return; // have what we need
        }
      }
    } catch { /* fall through */ }

    // Tier 2: Base44 live counts — company-scoped via listFn (fallback when report unavailable)
    try {
      const results = await Promise.allSettled(
        ENTITIES.map(e =>
          base44.entities[e.base44]
            ? listFn(base44.entities[e.base44]).then(arr => ({ id: e.id, count: Array.isArray(arr) ? arr.length : 0 }))
            : Promise.resolve({ id: e.id, count: 0 }),
        ),
      );
      const newCounts = {};
      results.forEach(r => {
        if (r.status === "fulfilled") newCounts[r.value.id] = r.value.count;
      });
      setCounts(newCounts);
    } catch { /* silent */ }
  }, [companyId, listFn]);

  useEffect(() => {
    if (companyId) loadData(false).finally(() => { setLoading(false); setRefreshing(false); });
  }, [companyId, loadData]);

  const scores = report?.by_entity || {};
  const issues = report?.issues   || [];

  const totalRecords = Object.values(counts).reduce((s, v) => s + (v || 0), 0);
  const avgScore = Object.values(scores).length
    ? Math.round(Object.values(scores).reduce((s, v) => s + v, 0) / Object.values(scores).length)
    : null;

  const selectedEntity = selected ? ENTITIES.find(e => e.id === selected) : null;
  const selectedIssues = selected ? issues.filter(i => i.entity_type === selected) : [];

  return (
    <div className="flex flex-col h-full min-h-0">

      {/* Header */}
      <div className="flex items-start justify-between mb-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center shadow-sm">
            <Layers className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800">Data Map</h1>
            <p className="text-xs text-slate-500">
              Your entire data estate — entities, connections, and AI readiness
            </p>
          </div>
        </div>
        <button
          onClick={() => loadData(true).finally(() => setRefreshing(false))}
          disabled={refreshing || loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Summary bar */}
      <div className="grid grid-cols-3 gap-3 mb-4 shrink-0">
        <div className="bg-white rounded-xl border border-slate-200 px-4 py-3 flex items-center gap-3">
          <Database className="w-4 h-4 text-slate-400 shrink-0" />
          <div>
            <p className="text-xs text-slate-500">Total Records</p>
            <p className="text-lg font-bold text-slate-800">{totalRecords.toLocaleString()}</p>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 px-4 py-3 flex items-center gap-3">
          <Layers className="w-4 h-4 text-violet-400 shrink-0" />
          <div>
            <p className="text-xs text-slate-500">Entity Types</p>
            <p className="text-lg font-bold text-slate-800">7</p>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 px-4 py-3 flex items-center gap-3">
          <ShieldCheck className={`w-4 h-4 shrink-0 ${avgScore == null ? "text-slate-400" : avgScore >= 80 ? "text-emerald-500" : avgScore >= 60 ? "text-amber-500" : "text-rose-500"}`} />
          <div>
            <p className="text-xs text-slate-500">Avg AI Readiness</p>
            <p className={`text-lg font-bold ${avgScore == null ? "text-slate-400" : avgScore >= 80 ? "text-emerald-600" : avgScore >= 60 ? "text-amber-600" : "text-rose-600"}`}>
              {avgScore != null ? `${avgScore}%` : "–"}
            </p>
          </div>
        </div>
      </div>

      {/* Main canvas + detail panel */}
      <div className="flex-1 min-h-0 flex gap-4">

        {/* SVG graph */}
        <div className="flex-1 min-w-0 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden relative">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/80 z-10">
              <RefreshCw className="w-6 h-6 animate-spin text-violet-500" />
            </div>
          )}

          <svg
            ref={svgRef}
            viewBox="0 0 700 540"
            className="w-full h-full"
            style={{ minHeight: 340 }}
          >
            <defs>
              {/* Subtle grid pattern */}
              <pattern id="dm-grid" width="24" height="24" patternUnits="userSpaceOnUse">
                <path d="M 24 0 L 0 0 0 24" fill="none" stroke="#f1f5f9" strokeWidth="0.8" />
              </pattern>
              {/* Glow filter for selected node */}
              <filter id="dm-glow">
                <feGaussianBlur stdDeviation="4" result="blur" />
                <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
              {/* Radial gradient for each entity colour (generated at render time) */}
              {ENTITIES.map(e => {
                const score  = scores[e.id];
                const colors = healthColor(score != null ? score : null);
                return (
                  <radialGradient key={e.id} id={`dm-grad-${e.id}`} cx="35%" cy="35%" r="65%">
                    <stop offset="0%"   stopColor={colors.fill} stopOpacity="0.95" />
                    <stop offset="100%" stopColor={colors.stroke} stopOpacity="1" />
                  </radialGradient>
                );
              })}
            </defs>

            {/* Background grid */}
            <rect width="700" height="540" fill="url(#dm-grid)" />

            {/* Edges */}
            {EDGES.map((edge, i) => {
              const isHov = hoveredEdge === i;
              const isSel = selected && (edge.from === selected || edge.to === selected);
              const path  = edgePath(edge.from, edge.to);
              return (
                <g key={i}>
                  {/* Hit area */}
                  <path
                    d={path}
                    fill="none"
                    stroke="transparent"
                    strokeWidth="12"
                    style={{ cursor: "default" }}
                    onMouseEnter={() => setHoveredEdge(i)}
                    onMouseLeave={() => setHoveredEdge(null)}
                  />
                  {/* Visible line */}
                  <path
                    d={path}
                    fill="none"
                    stroke={isSel ? "#8b5cf6" : isHov ? "#a78bfa" : "#e2e8f0"}
                    strokeWidth={isSel ? 2.5 : isHov ? 2 : 1.5}
                    strokeDasharray={isSel || isHov ? "none" : "6 4"}
                    opacity={isSel ? 1 : isHov ? 0.9 : 0.6}
                    style={{ transition: "stroke 0.2s, stroke-width 0.2s" }}
                    pointerEvents="none"
                  />
                  {/* Edge label on hover */}
                  {isHov && (() => {
                    const p1 = NODE_POS[edge.from];
                    const p2 = NODE_POS[edge.to];
                    const mx = (p1.cx + p2.cx) / 2;
                    const my = (p1.cy + p2.cy) / 2;
                    return (
                      <text x={mx} y={my - 6} textAnchor="middle"
                        className="text-[9px]" fill="#8b5cf6"
                        style={{ fontSize: 10, fontWeight: 600, pointerEvents: "none" }}>
                        {edge.label}
                      </text>
                    );
                  })()}
                </g>
              );
            })}

            {/* Nodes */}
            {ENTITIES.map(e => {
              const pos    = NODE_POS[e.id];
              const score  = scores[e.id];
              const count  = counts[e.id] || 0;
              const r      = nodeRadius(count);
              const colors = healthColor(score != null ? score : null);
              const isSel  = selected === e.id;
              const hasIssues = issues.some(i => i.entity_type === e.id && i.severity === "critical");

              return (
                <g
                  key={e.id}
                  style={{ cursor: "pointer" }}
                  onClick={() => setSelected(sel => sel === e.id ? null : e.id)}
                  filter={isSel ? "url(#dm-glow)" : undefined}
                >
                  {/* Selection ring */}
                  {isSel && (
                    <circle
                      cx={pos.cx} cy={pos.cy}
                      r={r + 10}
                      fill="none"
                      stroke="#8b5cf6"
                      strokeWidth="2"
                      opacity="0.5"
                      strokeDasharray="4 3"
                    />
                  )}

                  {/* Node circle */}
                  <circle
                    cx={pos.cx} cy={pos.cy} r={r}
                    fill={`url(#dm-grad-${e.id})`}
                    stroke={isSel ? "#8b5cf6" : colors.stroke}
                    strokeWidth={isSel ? 3 : 2}
                    style={{ transition: "r 0.3s" }}
                  />

                  {/* White inner circle (card effect) */}
                  <circle
                    cx={pos.cx} cy={pos.cy} r={r - 5}
                    fill="white"
                    opacity="0.15"
                  />

                  {/* Emoji */}
                  <text
                    x={pos.cx} y={pos.cy - 4}
                    textAnchor="middle" dominantBaseline="middle"
                    style={{ fontSize: Math.max(14, r * 0.55), pointerEvents: "none", userSelect: "none" }}
                  >
                    {e.emoji}
                  </text>

                  {/* Record count below emoji */}
                  <text
                    x={pos.cx} y={pos.cy + r * 0.38}
                    textAnchor="middle"
                    style={{ fontSize: 9, fontWeight: 700, fill: "white", pointerEvents: "none", userSelect: "none" }}
                  >
                    {fmt(count)}
                  </text>

                  {/* Label below node */}
                  <text
                    x={pos.cx} y={pos.cy + r + 14}
                    textAnchor="middle"
                    style={{ fontSize: 11, fontWeight: 600, fill: "#334155", pointerEvents: "none", userSelect: "none" }}
                  >
                    {e.label}
                  </text>

                  {/* Health score badge (top-right of node) */}
                  {score != null && (
                    <g>
                      <circle cx={pos.cx + r * 0.72} cy={pos.cy - r * 0.72} r={10}
                        fill="white" stroke={colors.stroke} strokeWidth="1.5" />
                      <text
                        x={pos.cx + r * 0.72} y={pos.cy - r * 0.72}
                        textAnchor="middle" dominantBaseline="middle"
                        style={{ fontSize: 7.5, fontWeight: 800, fill: colors.stroke, pointerEvents: "none", userSelect: "none" }}
                      >
                        {score}
                      </text>
                    </g>
                  )}

                  {/* Critical issue dot (top-left) */}
                  {hasIssues && (
                    <circle cx={pos.cx - r * 0.72} cy={pos.cy - r * 0.72} r={6}
                      fill="#ef4444" stroke="white" strokeWidth="1.5" />
                  )}
                </g>
              );
            })}
          </svg>

          {/* Legend */}
          <div className="absolute bottom-3 left-3 flex items-center gap-3 bg-white/90 backdrop-blur-sm rounded-xl border border-slate-100 px-3 py-1.5">
            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Health</span>
            {[
              { color: "bg-emerald-500", label: "≥90%" },
              { color: "bg-blue-500",    label: "≥75%" },
              { color: "bg-amber-500",   label: "≥60%" },
              { color: "bg-rose-500",    label: "<60%" },
            ].map(({ color, label }) => (
              <span key={label} className="flex items-center gap-1">
                <span className={`w-2.5 h-2.5 rounded-full ${color}`} />
                <span className="text-[9px] text-slate-500">{label}</span>
              </span>
            ))}
            <span className="ml-1 text-[9px] text-slate-400">Node size = record count</span>
          </div>
        </div>

        {/* Detail panel */}
        <div className="w-72 shrink-0 flex flex-col gap-3">

          {selectedEntity ? (
            <>
              {/* Entity card */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-3xl">{selectedEntity.emoji}</span>
                  <div>
                    <p className="text-base font-bold text-slate-800">{selectedEntity.plural}</p>
                    <p className="text-xs text-slate-400">{selectedEntity.desc}</p>
                  </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <div className="bg-slate-50 rounded-xl p-2.5 text-center">
                    <p className="text-xs text-slate-500">Records</p>
                    <p className="text-xl font-black text-slate-800">
                      {(counts[selectedEntity.id] || 0).toLocaleString()}
                    </p>
                  </div>
                  <div className={`rounded-xl p-2.5 text-center ${
                    scores[selectedEntity.id] != null
                      ? healthColor(scores[selectedEntity.id]).badge
                      : "bg-slate-50"
                  }`}>
                    <p className="text-xs opacity-70">AI Readiness</p>
                    <p className="text-xl font-black">
                      {scores[selectedEntity.id] != null ? `${scores[selectedEntity.id]}` : "–"}
                    </p>
                  </div>
                </div>

                {/* Health bar */}
                {scores[selectedEntity.id] != null && (
                  <div className="mb-3">
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${healthColor(scores[selectedEntity.id]).fill === "#10b981" ? "bg-emerald-500" : healthColor(scores[selectedEntity.id]).fill === "#3b82f6" ? "bg-blue-500" : healthColor(scores[selectedEntity.id]).fill === "#f59e0b" ? "bg-amber-500" : "bg-rose-500"} rounded-full transition-all`}
                        style={{ width: `${scores[selectedEntity.id]}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Navigate button */}
                <button
                  onClick={() => navigate(selectedEntity.page)}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-violet-600 text-white text-sm font-semibold hover:bg-violet-700 transition-colors"
                >
                  Open {selectedEntity.plural}
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Connected entities */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
                <p className="text-xs font-bold text-slate-600 mb-2 flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5 text-slate-400" />
                  Connects to
                </p>
                <div className="space-y-1.5">
                  {EDGES
                    .filter(e => e.from === selectedEntity.id || e.to === selectedEntity.id)
                    .map((edge, i) => {
                      const otherId  = edge.from === selectedEntity.id ? edge.to : edge.from;
                      const other    = ENTITIES.find(en => en.id === otherId);
                      const direction = edge.from === selectedEntity.id ? "→" : "←";
                      return other ? (
                        <button
                          key={i}
                          onClick={() => setSelected(otherId)}
                          className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg bg-slate-50 hover:bg-violet-50 transition-colors text-left"
                        >
                          <span className="text-base">{other.emoji}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-slate-700 truncate">{other.plural}</p>
                            <p className="text-[10px] text-slate-400 truncate">{direction} {edge.label}</p>
                          </div>
                          <ChevronRight className="w-3 h-3 text-slate-400 shrink-0" />
                        </button>
                      ) : null;
                    })}
                </div>
              </div>

              {/* Issues */}
              {selectedIssues.length > 0 && (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
                  <p className="text-xs font-bold text-slate-600 mb-2 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                    Data Issues
                  </p>
                  <div className="space-y-1.5">
                    {selectedIssues.slice(0, 4).map((issue, i) => (
                      <div key={i} className={`px-3 py-2 rounded-lg text-xs ${
                        issue.severity === "critical" ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-700"
                      }`}>
                        <span className="mr-1">{issue.severity === "critical" ? "🔴" : "🟡"}</span>
                        {issue.message}
                      </div>
                    ))}
                    {selectedIssues.length > 4 && (
                      <p className="text-[10px] text-slate-400 text-center">
                        +{selectedIssues.length - 4} more — see Settings › AI Readiness
                      </p>
                    )}
                  </div>
                </div>
              )}
            </>
          ) : (
            /* Default: instructions */
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex flex-col items-center justify-center text-center gap-3 h-full">
              <div className="w-14 h-14 rounded-2xl bg-violet-50 border border-violet-100 flex items-center justify-center">
                <Layers className="w-7 h-7 text-violet-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-700 mb-1">Your Data Estate</p>
                <p className="text-xs text-slate-400 max-w-[200px]">
                  Click any entity node to explore its records, health score, connections, and data issues.
                </p>
              </div>
              <div className="w-full border-t border-slate-100 pt-3 mt-1 space-y-1.5">
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <Info className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  Node size reflects record volume
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <ShieldCheck className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  Score badge = AI Readiness (0–100)
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <span className="w-3.5 h-3.5 rounded-full bg-rose-500 inline-block shrink-0" />
                  Red dot = critical data issues
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
