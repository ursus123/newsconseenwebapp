/**
 * Object Explorer
 *
 * Sprint 1: Schema mode — 12-node ontology graph, live counts, node detail panel.
 * Sprint 2: Live mode — click entity to expand top-15 record nodes radially;
 *            click record → full detail panel + "Ask Copilot about this" deep-link.
 * Sprint 3: 3D toggle (pending).
 */
import React, { useState, useEffect, useRef, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import cytoscape from "cytoscape";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { ncClient } from "@/api/ncClient";
import { createPageUrl } from "@/utils";
import { useNavigate } from "react-router-dom";
import {
  Search, Users, Building2, Package, CheckSquare, Receipt,
  Link2, MapPin, X, ExternalLink, Loader2,
  ChevronRight, Layers, GitBranch, Maximize2, Sparkles,
  Activity, Box, ShieldCheck, AlertTriangle,
  FileText, Calendar, Zap, MessageSquare, Map,
} from "lucide-react";
import { useEntityListFn } from "@/components/shared/useDataQuery";
import { RAILWAY_URL, authHeaders } from "@/config/api";

// Map ObjectExplorer type keys → dataquality report entity keys
const DQ_KEY_MAP = {
  Person:       "people",
  Enterprise:   "enterprises",
  Product:      "products",
  Task:         "tasks",
  Transaction:  "transactions",
  Address:      "addresses",
  Relationship: "relationships",
  Document:     "documents",
  Schedule:     "schedules",
  Signal:       "signals",
  Channel:      "channels",
  Territory:    "territories",
};

function healthColor(score) {
  if (score == null) return { border: "rgba(255,255,255,0.35)", badge: "bg-slate-100 text-slate-500", label: null };
  if (score >= 90)   return { border: "#10b981", badge: "bg-emerald-100 text-emerald-700", label: "Excellent" };
  if (score >= 75)   return { border: "#3b82f6", badge: "bg-blue-100 text-blue-700",       label: "Good"      };
  if (score >= 60)   return { border: "#f59e0b", badge: "bg-amber-100 text-amber-700",     label: "Fair"      };
  return               { border: "#ef4444", badge: "bg-rose-100 text-rose-700",       label: "Poor"      };
}

// ── Ontology type registry ────────────────────────────────────────────────────
const OBJECT_TYPES = [
  {
    key: "Person", label: "People", icon: Users,
    color: "text-blue-600", bg: "bg-blue-50", border: "border-blue-200",
    badgeBg: "bg-blue-100", badgeText: "text-blue-700",
    entity: "Person",
    searchFields: ["full_name", "email", "phone", "person_type", "person_subtype", "status"],
    primaryField: "full_name", secondaryField: "person_type",
    routePage: "People",
    properties: ["person_type", "person_subtype", "status", "engagement_model", "email", "phone"],
    description: "Any human in any role — staff, clients, contacts, volunteers.",
  },
  {
    key: "Enterprise", label: "Enterprises", icon: Building2,
    color: "text-amber-600", bg: "bg-amber-50", border: "border-amber-200",
    badgeBg: "bg-amber-100", badgeText: "text-amber-700",
    entity: "Enterprise",
    searchFields: ["enterprise_name", "short_name", "email", "city", "country", "enterprise_type"],
    primaryField: "enterprise_name", secondaryField: "enterprise_type",
    routePage: "Enterprises",
    properties: ["enterprise_type", "enterprise_tier", "status", "operating_status", "city", "country"],
    description: "Any organisation, location, or operational unit.",
  },
  {
    key: "Product", label: "Products", icon: Package,
    color: "text-rose-600", bg: "bg-rose-50", border: "border-rose-200",
    badgeBg: "bg-rose-100", badgeText: "text-rose-700",
    entity: "Product",
    searchFields: ["name", "short_name", "item_type", "item_class", "sku", "description"],
    primaryField: "name", secondaryField: "item_type",
    routePage: "Products",
    properties: ["item_type", "item_class", "unit_of_measure", "status", "stock_quantity", "list_price"],
    description: "Any item, service, resource, or deliverable.",
  },
  {
    key: "Task", label: "Tasks", icon: CheckSquare,
    color: "text-violet-600", bg: "bg-violet-50", border: "border-violet-200",
    badgeBg: "bg-violet-100", badgeText: "text-violet-700",
    entity: "Task",
    searchFields: ["title", "enterprise", "assigned_to_name", "task_type", "status"],
    primaryField: "title", secondaryField: "status",
    routePage: "Tasks",
    properties: ["task_type", "status", "priority", "assigned_to_name", "due_date", "enterprise"],
    description: "Any activity, visit, appointment, shift, or work order.",
  },
  {
    key: "Transaction", label: "Transactions", icon: Receipt,
    color: "text-emerald-600", bg: "bg-emerald-50", border: "border-emerald-200",
    badgeBg: "bg-emerald-100", badgeText: "text-emerald-700",
    entity: "Transaction",
    searchFields: ["description", "enterprise", "invoice_number", "transaction_type", "counterparty"],
    primaryField: "description", secondaryField: "transaction_type",
    routePage: "Transactions",
    properties: ["transaction_type", "status", "payment_status", "amount", "currency", "enterprise"],
    description: "Any financial record — invoice, payment, expense, or payroll.",
  },
  {
    key: "Relationship", label: "Relationships", icon: Link2,
    color: "text-indigo-600", bg: "bg-indigo-50", border: "border-indigo-200",
    badgeBg: "bg-indigo-100", badgeText: "text-indigo-700",
    entity: "Relationship",
    searchFields: ["person_name", "enterprise_name", "item_name", "role", "relationship_type"],
    primaryField: "relationship_type", secondaryField: "person_name",
    routePage: "Relationships",
    properties: ["relationship_type", "status", "role", "start_date", "person_name", "enterprise_name"],
    description: "Links any two entities — person↔enterprise, person↔item, etc.",
  },
  {
    key: "Address", label: "Addresses", icon: MapPin,
    color: "text-teal-600", bg: "bg-teal-50", border: "border-teal-200",
    badgeBg: "bg-teal-100", badgeText: "text-teal-700",
    entity: "Address",
    searchFields: ["label", "address_line1", "city", "state_region", "country", "postal_code"],
    primaryField: "label", secondaryField: "city",
    routePage: "Addresses",
    properties: ["label", "address_line1", "city", "state_region", "country", "postal_code"],
    description: "Any physical or postal location.",
  },
  // ── 5 New Canonical Entities (Phase 9) ──────────────────────────────────────
  {
    key: "Document", label: "Documents", icon: FileText,
    color: "text-orange-600", bg: "bg-orange-50", border: "border-orange-200",
    badgeBg: "bg-orange-100", badgeText: "text-orange-700",
    entity: "Document",
    searchFields: ["title", "document_type", "status", "enterprise_id"],
    primaryField: "title", secondaryField: "document_type",
    routePage: "Documents",
    properties: ["document_type", "status", "expires_at", "signed_at", "is_contract", "is_invoice"],
    description: "Any file, record, or formal document — contracts, invoices, policies.",
  },
  {
    key: "Schedule", label: "Schedules", icon: Calendar,
    color: "text-sky-600", bg: "bg-sky-50", border: "border-sky-200",
    badgeBg: "bg-sky-100", badgeText: "text-sky-700",
    entity: "Schedule",
    searchFields: ["title", "schedule_type", "frequency", "status", "assigned_to"],
    primaryField: "title", secondaryField: "frequency",
    routePage: "Schedules",
    properties: ["schedule_type", "frequency", "status", "time_of_day", "starts_on", "ends_on"],
    description: "Any recurring pattern, shift, or calendar rule.",
  },
  {
    key: "Signal", label: "Signals", icon: Zap,
    color: "text-yellow-600", bg: "bg-yellow-50", border: "border-yellow-200",
    badgeBg: "bg-yellow-100", badgeText: "text-yellow-700",
    entity: "Signal",
    searchFields: ["signal_type", "source_entity_type", "unit_of_measure", "is_anomaly"],
    primaryField: "signal_type", secondaryField: "unit_of_measure",
    routePage: "Signals",
    properties: ["signal_type", "value", "unit_of_measure", "is_anomaly", "recorded_at"],
    description: "Any sensor reading, survey response, or telemetry data point.",
  },
  {
    key: "Channel", label: "Channels", icon: MessageSquare,
    color: "text-pink-600", bg: "bg-pink-50", border: "border-pink-200",
    badgeBg: "bg-pink-100", badgeText: "text-pink-700",
    entity: "Channel",
    searchFields: ["name", "channel_type", "purpose", "status", "sentiment"],
    primaryField: "name", secondaryField: "channel_type",
    routePage: "Channels",
    properties: ["channel_type", "purpose", "status", "sentiment", "message_count", "last_message_at"],
    description: "Any communication channel — WhatsApp, email, call log, social.",
  },
  {
    key: "Territory", label: "Territories", icon: Map,
    color: "text-lime-600", bg: "bg-lime-50", border: "border-lime-200",
    badgeBg: "bg-lime-100", badgeText: "text-lime-700",
    entity: "Territory",
    searchFields: ["name", "territory_type", "country", "region", "status"],
    primaryField: "name", secondaryField: "territory_type",
    routePage: "Territories",
    properties: ["territory_type", "status", "country", "region", "area_km2", "population_estimate"],
    description: "Any geographic coverage area — sales zones, delivery zones, catchments.",
  },
];

const TYPE_MAP = Object.fromEntries(OBJECT_TYPES.map(t => [t.key, t]));

// ── Graph constants ───────────────────────────────────────────────────────────
const NODE_COLORS = {
  Person:       "#3b82f6",
  Enterprise:   "#f59e0b",
  Product:      "#f43f5e",
  Task:         "#8b5cf6",
  Transaction:  "#10b981",
  Relationship: "#6366f1",
  Address:      "#14b8a6",
  Document:     "#ea580c",
  Schedule:     "#0284c7",
  Signal:       "#ca8a04",
  Channel:      "#db2777",
  Territory:    "#65a30d",
};

const PRESET_POSITIONS = {
  Relationship: { x: 110,  y: 155 },
  Task:         { x: 420,  y:  95 },
  Person:       { x: 230,  y: 305 },
  Enterprise:   { x: 590,  y: 305 },
  Product:      { x: 820,  y: 145 },
  Transaction:  { x: 420,  y: 470 },
  Address:      { x: 710,  y: 455 },
  // Phase 9 — new canonical entities (lower row)
  Document:     { x: 110,  y: 560 },
  Schedule:     { x: 310,  y: 620 },
  Signal:       { x: 560,  y: 580 },
  Channel:      { x: 780,  y: 560 },
  Territory:    { x: 970,  y: 350 },
};

const ONTOLOGY_EDGES = [
  { id: "e-rel-person",   source: "Relationship", target: "Person",       label: "person_name"      },
  { id: "e-rel-ent",     source: "Relationship", target: "Enterprise",    label: "enterprise_name"  },
  { id: "e-person-task", source: "Person",        target: "Task",         label: "assigned_to"      },
  { id: "e-ent-task",    source: "Enterprise",    target: "Task",         label: "enterprise"       },
  { id: "e-ent-person",  source: "Enterprise",    target: "Person",       label: "employs / serves" },
  { id: "e-person-txn",  source: "Person",        target: "Transaction",  label: "counterparty"     },
  { id: "e-ent-txn",     source: "Enterprise",    target: "Transaction",  label: "enterprise"       },
  { id: "e-prod-txn",    source: "Product",       target: "Transaction",  label: "item_name"        },
  { id: "e-person-addr", source: "Person",        target: "Address",      label: "person_name"      },
  { id: "e-ent-addr",    source: "Enterprise",    target: "Address",      label: "enterprise_name"  },
  // Phase 9 — new entity edges
  { id: "e-doc-ent",     source: "Document",      target: "Enterprise",   label: "enterprise_id"    },
  { id: "e-sched-person",source: "Schedule",      target: "Person",       label: "assigned_to"      },
  { id: "e-sched-ent",   source: "Schedule",      target: "Enterprise",   label: "enterprise_id"    },
  { id: "e-sig-ent",     source: "Signal",        target: "Enterprise",   label: "enterprise_id"    },
  { id: "e-chan-ent",    source: "Channel",        target: "Enterprise",   label: "enterprise_id"    },
  { id: "e-chan-person", source: "Channel",        target: "Person",       label: "person_id"        },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function truncateLabel(str, max = 11) {
  if (!str) return "—";
  const s = String(str);
  return s.length > max ? s.slice(0, max) + "…" : s;
}

function statusDotColor(record) {
  const s = (record.status || record.payment_status || record.operating_status || "").toLowerCase();
  if (["active", "open", "completed", "paid"].includes(s)) return "bg-emerald-400";
  if (["inactive", "closed", "overdue", "cancelled", "failed"].includes(s)) return "bg-red-400";
  if (["pending", "on_leave", "draft", "unpaid", "in_progress"].includes(s)) return "bg-amber-400";
  return "bg-slate-300";
}

function buildCopilotMessage(record, typeDef) {
  const primary   = record[typeDef.primaryField] || "this record";
  const secondary = record[typeDef.secondaryField] || "";
  const status    = record.status || record.payment_status || record.operating_status || "";
  switch (typeDef.key) {
    case "Person":
      return `Tell me about ${primary}${secondary ? `, a ${secondary}` : ""}${status ? ` with status "${status}"` : ""}. What tasks, transactions, or relationships are linked to them?`;
    case "Enterprise":
      return `Give me an overview of ${primary}${secondary ? ` (${secondary})` : ""}. How many people are linked? Any outstanding tasks or transactions?`;
    case "Product":
      return `What is the current status of "${primary}"? Is it at risk of stockout? Are there recent transactions involving it?`;
    case "Task":
      return `Tell me about the task "${primary}"${record.assigned_to_name ? `, assigned to ${record.assigned_to_name}` : ""}. What is its status and priority?`;
    case "Transaction":
      return `Give me details on "${primary}"${record.amount ? ` for ${record.currency || ""}${record.amount}` : ""}. Is it paid? Any follow-up needed?`;
    default:
      return `Tell me more about this ${typeDef.label.slice(0, -1)}: ${primary}.`;
  }
}

// ── ObjectTypeBadge ───────────────────────────────────────────────────────────
function ObjectTypeBadge({ typeKey }) {
  const t = TYPE_MAP[typeKey];
  if (!t) return null;
  const Icon = t.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${t.badgeBg} ${t.badgeText}`}>
      <Icon className="w-2.5 h-2.5" />{typeKey}
    </span>
  );
}

// ── RecordDetailPanel ─────────────────────────────────────────────────────────
function RecordDetailPanel({ selection, navigate, onClose }) {
  const { record, typeDef } = selection;
  const Icon    = typeDef.icon;
  const primary = record[typeDef.primaryField] || record.id?.slice(0, 8) || "—";
  const dotCls  = statusDotColor(record);
  const copilotMsg = buildCopilotMessage(record, typeDef);

  const allProps = Object.entries(record)
    .filter(([k, v]) =>
      !["id", "created_date", "updated_date", "company_id", "__typename"].includes(k)
      && v !== null && v !== undefined && v !== ""
    )
    .slice(0, 22);

  return (
    <div className="w-72 bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-sm flex flex-col shrink-0">
      {/* Header */}
      <div className={`flex items-center gap-3 p-4 border-b ${typeDef.border} ${typeDef.bg}`}>
        <div className={`w-10 h-10 rounded-xl bg-white border ${typeDef.border} flex items-center justify-center shrink-0 relative`}>
          <Icon className={`w-5 h-5 ${typeDef.color}`} />
          <span className={`absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ${dotCls} border-2 border-white`} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-black text-slate-800 truncate">{primary}</p>
          <ObjectTypeBadge typeKey={typeDef.key} />
        </div>
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/60 text-slate-400 hover:text-slate-600 transition-colors shrink-0">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Properties */}
      <div className="flex-1 overflow-y-auto p-4 space-y-1">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Properties</p>
        {allProps.map(([key, value]) => (
          <div key={key} className="flex items-start gap-2 py-1.5 border-b border-slate-50 last:border-0">
            <span className="text-[11px] font-semibold text-slate-400 w-32 shrink-0 pt-0.5 capitalize">
              {key.replace(/_/g, " ")}
            </span>
            <span className="text-[11px] text-slate-700 flex-1 break-words">
              {Array.isArray(value)
                ? value.map((v, i) => (
                    <span key={i} className="inline-block bg-slate-100 rounded px-1.5 py-0.5 mr-1 mb-1 text-[10px] font-medium">{String(v)}</span>
                  ))
                : typeof value === "boolean" ? (value ? "Yes" : "No")
                : String(value)
              }
            </span>
          </div>
        ))}
      </div>

      {/* ID */}
      <div className="px-4 py-2 border-t border-slate-100 bg-slate-50">
        <p className="text-[10px] text-slate-400 font-mono truncate">id: {record.id}</p>
      </div>

      {/* Action buttons */}
      <div className="p-4 border-t border-slate-100 space-y-2">
        <button
          onClick={() => navigate(createPageUrl(typeDef.routePage))}
          className={`w-full flex items-center justify-center gap-2 py-2 px-4 rounded-xl ${typeDef.bg} ${typeDef.color} text-xs font-bold border ${typeDef.border} hover:opacity-80 transition-opacity`}
        >
          <ExternalLink className="w-3.5 h-3.5" />
          View in {typeDef.label}
        </button>
        <button
          onClick={() => navigate(createPageUrl("idjwi"), { state: { prefillMessage: copilotMsg } })}
          className="w-full flex items-center justify-center gap-2 py-2 px-4 rounded-xl bg-emerald-50 text-emerald-700 text-xs font-bold border border-emerald-200 hover:bg-emerald-100 transition-colors"
        >
          <Sparkles className="w-3.5 h-3.5" />
          Ask Idjwi about this
        </button>
      </div>
    </div>
  );
}

// ── NodeDetailPanel (entity node — schema & live) ─────────────────────────────
function NodeDetailPanel({ selection, navigate, onClose, dqScores, dqIssues }) {
  const { typeKey, typeDef, count, isLive } = selection;
  const Icon = typeDef.icon;

  const dqKey   = DQ_KEY_MAP[typeKey];
  const dqScore = dqKey != null ? dqScores?.[dqKey] : null;
  const hc      = healthColor(dqScore != null ? dqScore : null);
  const issues  = (dqIssues || []).filter(i => i.entity_type === dqKey);

  const connectedEdges = ONTOLOGY_EDGES.filter(
    e => e.source === typeKey || e.target === typeKey
  );

  return (
    <div className="w-72 bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-sm flex flex-col shrink-0">
      <div className={`flex items-center gap-3 p-4 border-b ${typeDef.border} ${typeDef.bg}`}>
        <div className={`w-10 h-10 rounded-xl bg-white border ${typeDef.border} flex items-center justify-center shrink-0`}>
          <Icon className={`w-5 h-5 ${typeDef.color}`} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-black text-slate-800">{typeDef.label}</p>
          <p className={`text-xs font-bold ${typeDef.color}`}>
            {count.toLocaleString()} record{count !== 1 ? "s" : ""}
          </p>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/60 text-slate-400 hover:text-slate-600 transition-colors shrink-0">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        <p className="text-xs text-slate-500 leading-relaxed">{typeDef.description}</p>

        {isLive && count > 0 && (
          <div className="rounded-xl bg-violet-50 border border-violet-200 px-3 py-2">
            <p className="text-[11px] text-violet-700 font-semibold">
              Click this node in the canvas to {count > 0 ? "expand" : "load"} up to 15 records.
              Click a record node to inspect it.
            </p>
          </div>
        )}

        <div>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Universal Fields</p>
          <div className="space-y-0.5">
            {typeDef.properties.map(p => (
              <div key={p} className="flex items-center gap-2 py-1 border-b border-slate-50 last:border-0">
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: NODE_COLORS[typeKey] }} />
                <span className="text-[11px] text-slate-600 capitalize">{p.replace(/_/g, " ")}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Data Quality section — shown when report is available */}
        {dqScore != null && (
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Data Quality</p>
            <div className="flex items-center gap-2 mb-2">
              <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${hc.badge}`}>
                <ShieldCheck className="w-3 h-3" />
                AI Readiness {dqScore}% — {hc.label}
              </span>
            </div>
            {issues.length > 0 ? (
              <div className="space-y-0.5">
                {issues.slice(0, 5).map((iss, i) => (
                  <div key={i} className="flex items-start gap-2 py-1 border-b border-slate-50 last:border-0">
                    <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0 mt-0.5" />
                    <span className="text-[11px] text-slate-600 leading-snug">
                      {iss.message || iss.description || iss.issue || JSON.stringify(iss)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-emerald-600">No issues detected</p>
            )}
          </div>
        )}

        <div>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">
            Connects To ({connectedEdges.length})
          </p>
          <div className="space-y-0.5">
            {connectedEdges.map(e => {
              const other    = e.source === typeKey ? e.target : e.source;
              const dir      = e.source === typeKey ? "→" : "←";
              const otherDef = TYPE_MAP[other];
              if (!otherDef) return null;
              const OtherIcon = otherDef.icon;
              return (
                <div key={e.id} className="flex items-center gap-2 py-1 border-b border-slate-50 last:border-0">
                  <OtherIcon className={`w-3 h-3 shrink-0 ${otherDef.color}`} />
                  <span className="text-[11px] text-slate-600 font-medium flex-1">
                    <span className="text-slate-400">{dir}</span> {other}
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono shrink-0">{e.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="p-4 border-t border-slate-100">
        <button
          onClick={() => navigate(createPageUrl(typeDef.routePage))}
          className={`w-full flex items-center justify-center gap-2 py-2 px-4 rounded-xl ${typeDef.bg} ${typeDef.color} text-xs font-bold border ${typeDef.border} hover:opacity-80 transition-opacity`}
        >
          <ExternalLink className="w-3.5 h-3.5" />
          View all {typeDef.label}
        </button>
      </div>
    </div>
  );
}

// ── EdgeDetailPanel ───────────────────────────────────────────────────────────
function EdgeDetailPanel({ selection, navigate, onClose }) {
  const { edgeInfo } = selection;
  const srcDef = TYPE_MAP[edgeInfo.source];
  const tgtDef = TYPE_MAP[edgeInfo.target];
  if (!srcDef || !tgtDef) return null;
  const SrcIcon = srcDef.icon;
  const TgtIcon = tgtDef.icon;

  return (
    <div className="w-72 bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-sm flex flex-col shrink-0">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b border-indigo-200 bg-indigo-50">
        <div className="w-10 h-10 rounded-xl bg-white border border-indigo-200 flex items-center justify-center shrink-0">
          <Link2 className="w-5 h-5 text-indigo-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-black text-slate-800">Relationship</p>
          <p className="text-xs font-mono text-indigo-600 truncate">{edgeInfo.label}</p>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/60 text-slate-400 hover:text-slate-600 transition-colors shrink-0">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5">

        {/* Join visualisation */}
        <div className="flex items-center gap-2">
          <div className={`flex-1 flex items-center gap-2 px-3 py-2 rounded-xl ${srcDef.bg} border ${srcDef.border}`}>
            <SrcIcon className={`w-4 h-4 ${srcDef.color} shrink-0`} />
            <span className={`text-xs font-bold ${srcDef.color} truncate`}>{srcDef.label}</span>
          </div>
          <div className="flex flex-col items-center shrink-0">
            <span className="text-slate-400 text-base leading-none">→</span>
            <span className="text-[9px] text-slate-400 font-mono mt-0.5 max-w-[52px] text-center leading-tight">{edgeInfo.label}</span>
          </div>
          <div className={`flex-1 flex items-center gap-2 px-3 py-2 rounded-xl ${tgtDef.bg} border ${tgtDef.border}`}>
            <TgtIcon className={`w-4 h-4 ${tgtDef.color} shrink-0`} />
            <span className={`text-xs font-bold ${tgtDef.color} truncate`}>{tgtDef.label}</span>
          </div>
        </div>

        {/* Join field */}
        <div>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Join Field</p>
          <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-xl border border-slate-200">
            <span className="text-xs font-mono text-slate-700">{edgeInfo.label}</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1.5 leading-relaxed">
            Records in <span className="font-semibold text-slate-600">{srcDef.label}</span> link to{" "}
            <span className="font-semibold text-slate-600">{tgtDef.label}</span> via the{" "}
            <span className="font-mono text-indigo-600">{edgeInfo.label}</span> field.
          </p>
        </div>

        {/* Entity descriptions */}
        <div className="space-y-3">
          <div>
            <div className={`flex items-center gap-1.5 mb-1`}>
              <SrcIcon className={`w-3 h-3 ${srcDef.color}`} />
              <span className={`text-[10px] font-bold uppercase tracking-widest ${srcDef.color}`}>{srcDef.label}</span>
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed">{srcDef.description}</p>
          </div>
          <div>
            <div className={`flex items-center gap-1.5 mb-1`}>
              <TgtIcon className={`w-3 h-3 ${tgtDef.color}`} />
              <span className={`text-[10px] font-bold uppercase tracking-widest ${tgtDef.color}`}>{tgtDef.label}</span>
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed">{tgtDef.description}</p>
          </div>
        </div>
      </div>

      {/* Footer CTAs */}
      <div className="p-4 border-t border-slate-100 space-y-2">
        <button
          onClick={() => navigate(createPageUrl(srcDef.routePage))}
          className={`w-full flex items-center justify-center gap-2 py-2 px-4 rounded-xl ${srcDef.bg} ${srcDef.color} text-xs font-bold border ${srcDef.border} hover:opacity-80 transition-opacity`}
        >
          <ExternalLink className="w-3.5 h-3.5" />
          View {srcDef.label}
        </button>
        <button
          onClick={() => navigate(createPageUrl(tgtDef.routePage))}
          className={`w-full flex items-center justify-center gap-2 py-2 px-4 rounded-xl ${tgtDef.bg} ${tgtDef.color} text-xs font-bold border ${tgtDef.border} hover:opacity-80 transition-opacity`}
        >
          <ExternalLink className="w-3.5 h-3.5" />
          View {tgtDef.label}
        </button>
      </div>
    </div>
  );
}

// ── Graph3D ───────────────────────────────────────────────────────────────────
const NODE_3D_POSITIONS = {
  Person:       new THREE.Vector3(-200,   0,    0),
  Enterprise:   new THREE.Vector3( 200,   0,    0),
  Product:      new THREE.Vector3( 380,  150,   80),
  Task:         new THREE.Vector3(  40,  220,  -90),
  Transaction:  new THREE.Vector3(  40, -190,   60),
  Relationship: new THREE.Vector3(-370,  120,  -70),
  Address:      new THREE.Vector3( 310, -140,  -90),
};

function makeSpriteTexture(label, countStr, hexColor) {
  const canvas  = document.createElement("canvas");
  canvas.width  = 320;
  canvas.height = 80;
  const ctx     = canvas.getContext("2d");
  // Background pill
  ctx.fillStyle = "rgba(15,23,42,0.82)";
  ctx.beginPath();
  ctx.roundRect(0, 0, 320, 80, 10);
  ctx.fill();
  // Label text
  ctx.font         = "bold 26px system-ui, sans-serif";
  ctx.fillStyle    = hexColor;
  ctx.textAlign    = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(label, 160, 36);
  // Count text
  ctx.font         = "18px system-ui, sans-serif";
  ctx.fillStyle    = "rgba(255,255,255,0.55)";
  ctx.fillText(countStr, 160, 62);
  return new THREE.CanvasTexture(canvas);
}

function Graph3D({ allObjects, loaded, loading, onNodeSelect }) {
  const mountRef = useRef(null);
  const frameRef = useRef(null);

  useEffect(() => {
    if (!mountRef.current || !loaded) return;

    const container = mountRef.current;
    const W = container.clientWidth  || 800;
    const H = container.clientHeight || 520;

    // ── Renderer ─────────────────────────────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(W, H);
    renderer.setClearColor(0x0f172a);
    container.appendChild(renderer.domElement);

    // ── Scene & Camera ───────────────────────────────────────────────────────
    const scene  = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(55, W / H, 1, 6000);
    camera.position.set(0, 120, 780);
    camera.lookAt(0, 0, 0);

    // ── Lights ───────────────────────────────────────────────────────────────
    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const dir = new THREE.DirectionalLight(0xffffff, 0.85);
    dir.position.set(400, 600, 300);
    scene.add(dir);

    // ── OrbitControls ────────────────────────────────────────────────────────
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.autoRotate      = true;
    controls.autoRotateSpeed = 0.45;
    controls.enableDamping   = true;
    controls.dampingFactor   = 0.06;
    controls.minDistance     = 200;
    controls.maxDistance     = 1800;
    controls.target.set(0, 0, 0);

    const toDispose = [];
    const sphereMeshes = [];

    // ── Edges ─────────────────────────────────────────────────────────────────
    const lineMat = new THREE.LineBasicMaterial({ color: 0x334155, transparent: true, opacity: 0.55 });
    toDispose.push(lineMat);

    for (const e of ONTOLOGY_EDGES) {
      const srcPos = NODE_3D_POSITIONS[e.source];
      const tgtPos = NODE_3D_POSITIONS[e.target];
      if (!srcPos || !tgtPos) continue;
      const geom = new THREE.BufferGeometry().setFromPoints([srcPos.clone(), tgtPos.clone()]);
      scene.add(new THREE.Line(geom, lineMat));
      toDispose.push(geom);
    }

    // ── Entity nodes (spheres + label sprites) ────────────────────────────────
    for (const t of OBJECT_TYPES) {
      const pos   = NODE_3D_POSITIONS[t.key];
      const count = (allObjects[t.key] || []).length;

      // Sphere
      const geom   = new THREE.SphereGeometry(34, 36, 36);
      const mat    = new THREE.MeshPhongMaterial({ color: new THREE.Color(NODE_COLORS[t.key]), shininess: 100, specular: new THREE.Color(0x888888) });
      const sphere = new THREE.Mesh(geom, mat);
      sphere.position.copy(pos);
      sphere.userData.typeKey = t.key;
      scene.add(sphere);
      sphereMeshes.push(sphere);
      toDispose.push(geom, mat);

      // Glow ring (torus)
      const tGeom = new THREE.TorusGeometry(38, 2, 8, 48);
      const tMat  = new THREE.MeshBasicMaterial({ color: new THREE.Color(NODE_COLORS[t.key]), transparent: true, opacity: 0.35 });
      const torus = new THREE.Mesh(tGeom, tMat);
      torus.position.copy(pos);
      torus.rotation.x = Math.PI / 2;
      scene.add(torus);
      toDispose.push(tGeom, tMat);

      // Label sprite
      const tex       = makeSpriteTexture(t.label, count.toLocaleString(), NODE_COLORS[t.key]);
      const sMat      = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
      const sprite    = new THREE.Sprite(sMat);
      sprite.scale.set(130, 32, 1);
      sprite.position.copy(pos);
      sprite.position.y += 58;
      scene.add(sprite);
      toDispose.push(tex, sMat);
    }

    // ── Raycaster for clicks ──────────────────────────────────────────────────
    const raycaster = new THREE.Raycaster();
    const pointer   = new THREE.Vector2();
    let   isDragging = false;
    let   dragStart  = { x: 0, y: 0 };

    const onPointerDown = (e) => { dragStart = { x: e.clientX, y: e.clientY }; isDragging = false; };
    const onPointerMove = (e) => {
      if (Math.hypot(e.clientX - dragStart.x, e.clientY - dragStart.y) > 4) isDragging = true;
    };
    const onClick = (e) => {
      if (isDragging) return;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x  = ((e.clientX - rect.left) / rect.width)  *  2 - 1;
      pointer.y  = ((e.clientY - rect.top)  / rect.height) * -2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(sphereMeshes);
      if (hits.length > 0) {
        const typeKey = hits[0].object.userData.typeKey;
        const typeDef = TYPE_MAP[typeKey];
        const count   = (allObjects[typeKey] || []).length;
        onNodeSelect({ type: "entity", typeKey, typeDef, count, isLive: false });
      }
    };
    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("click",       onClick);

    // ── Resize ───────────────────────────────────────────────────────────────
    const onResize = () => {
      if (!container) return;
      const w = container.clientWidth  || 800;
      const h = container.clientHeight || 520;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", onResize);

    // ── Animation loop ────────────────────────────────────────────────────────
    const animate = () => {
      frameRef.current = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(frameRef.current);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("click",       onClick);
      window.removeEventListener("resize", onResize);
      controls.dispose();
      for (const d of toDispose) d.dispose?.();
      renderer.dispose();
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
    };
  }, [loaded]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading || !loaded) {
    return (
      <div className="flex-1 bg-slate-900 rounded-2xl border border-slate-700 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-violet-400 mx-auto mb-3" />
          <p className="text-sm text-slate-400 font-medium">Loading 3D ontology…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex-1 min-h-0 bg-slate-900 rounded-2xl border border-slate-700 overflow-hidden">
      <div ref={mountRef} className="absolute inset-0" style={{ cursor: "grab" }} />

      {/* Color legend */}
      <div className="absolute top-3 left-3 flex flex-wrap gap-1.5 z-10 max-w-xs pointer-events-none">
        {OBJECT_TYPES.map(t => (
          <div key={t.key} className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800/80 border border-slate-700">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: NODE_COLORS[t.key] }} />
            <span style={{ color: NODE_COLORS[t.key] }}>{t.label}</span>
          </div>
        ))}
      </div>

      {/* Hint */}
      <div className="absolute bottom-4 left-4 z-10 pointer-events-none">
        <p className="text-[10px] text-slate-400 bg-slate-900/80 px-2 py-1 rounded-lg border border-slate-700">
          Drag to orbit · Scroll to zoom · Click sphere to inspect
        </p>
      </div>
    </div>
  );
}

// ── OntologyGraph ─────────────────────────────────────────────────────────────
function OntologyGraph({ allObjects, loaded, loading, mode, onNodeSelect, dqScores }) {
  const containerRef    = useRef(null);
  const cyRef           = useRef(null);
  const allObjectsRef   = useRef(allObjects);
  const expandedRef     = useRef(null);           // typeKey of currently expanded entity (live mode)

  // Update ref in render — safe for mutable refs, avoids an extra useEffect
  allObjectsRef.current = allObjects;

  const counts = useMemo(() => {
    const out = {};
    for (const t of OBJECT_TYPES) out[t.key] = (allObjects[t.key] || []).length;
    return out;
  }, [allObjects]);

  const countsKey = useMemo(
    () => OBJECT_TYPES.map(t => counts[t.key]).join(","),
    [counts]
  );

  // ── (Re-)initialise Cytoscape whenever mode, countsKey, or loaded changes ──
  useEffect(() => {
    if (!containerRef.current || !loaded) return;

    if (cyRef.current) { cyRef.current.destroy(); cyRef.current = null; }
    expandedRef.current = null;

    const nodes = OBJECT_TYPES.map(t => ({
      data: {
        id:                t.key,
        label:             `${t.label}\n${counts[t.key].toLocaleString()}`,
        nodeColor:         NODE_COLORS[t.key],
        healthBorderColor: healthColor(dqScores?.[DQ_KEY_MAP[t.key]] ?? null).border,
      },
      position: { ...PRESET_POSITIONS[t.key] },
    }));

    const edges = ONTOLOGY_EDGES.map(e => ({
      data: { id: e.id, source: e.source, target: e.target, label: e.label },
      classes: "schema-edge",
    }));

    const cy = cytoscape({
      container:           containerRef.current,
      elements:            { nodes, edges },
      layout:              { name: "preset" },
      userZoomingEnabled:  true,
      userPanningEnabled:  true,
      boxSelectionEnabled: false,
      autoungrabify:       false,
      minZoom: 0.25,
      maxZoom: 3,
      style: [
        // ── Entity nodes ──
        {
          selector: "node:not(.record)",
          style: {
            "background-color":   "data(nodeColor)",
            "label":              "data(label)",
            "color":              "#ffffff",
            "text-valign":        "center",
            "text-halign":        "center",
            "font-size":          "11px",
            "font-weight":        "bold",
            "text-wrap":          "wrap",
            "text-max-width":     "84px",
            "width":              "92px",
            "height":             "92px",
            "border-width":       "3px",
            "border-color":       "data(healthBorderColor)",
            "shadow-blur":        "18px",
            "shadow-color":       "data(nodeColor)",
            "shadow-opacity":     0.45,
            "shadow-offset-x":    "0px",
            "shadow-offset-y":    "5px",
            "cursor":             "pointer",
          },
        },
        {
          selector: "node:not(.record):selected",
          style: {
            "border-width":   "4px",
            "border-color":   "#ffffff",
            "shadow-blur":    "28px",
            "shadow-opacity": 0.7,
          },
        },
        // ── Record nodes (live mode) ──
        {
          selector: "node.record",
          style: {
            "background-color":   "data(nodeColor)",
            "background-opacity": 0.68,
            "label":              "data(label)",
            "color":              "#ffffff",
            "text-valign":        "center",
            "text-halign":        "center",
            "font-size":          "8px",
            "font-weight":        "600",
            "text-wrap":          "wrap",
            "text-max-width":     "52px",
            "width":              "58px",
            "height":             "58px",
            "border-width":       "1.5px",
            "border-color":       "rgba(255,255,255,0.5)",
            "shadow-blur":        "10px",
            "shadow-color":       "data(nodeColor)",
            "shadow-opacity":     0.3,
            "shadow-offset-x":    "0px",
            "shadow-offset-y":    "3px",
            "cursor":             "pointer",
          },
        },
        {
          selector: "node.record:selected",
          style: {
            "background-opacity": 1,
            "border-width":       "3px",
            "border-color":       "#ffffff",
            "shadow-opacity":     0.6,
          },
        },
        // ── Schema edges ──
        {
          selector: "edge.schema-edge",
          style: {
            "width":                   1.8,
            "line-color":              "#cbd5e1",
            "target-arrow-color":      "#cbd5e1",
            "target-arrow-shape":      "triangle",
            "arrow-scale":             0.9,
            "curve-style":             "bezier",
            "label":                   "data(label)",
            "font-size":               "9px",
            "color":                   "#94a3b8",
            "text-background-color":   "#f8fafc",
            "text-background-opacity": 0.9,
            "text-background-padding": "2px",
            "text-rotation":           "autorotate",
          },
        },
        {
          selector: "edge.schema-edge:selected",
          style: {
            "line-color":          "#6366f1",
            "target-arrow-color":  "#6366f1",
            "width":               2.5,
          },
        },
        // ── Record edges (live mode) ──
        {
          selector: "edge.rec-edge",
          style: {
            "width":                1.2,
            "line-color":          "#e2e8f0",
            "line-style":          "dashed",
            "line-dash-pattern":   [4, 3],
            "target-arrow-shape":  "none",
            "curve-style":         "straight",
            "opacity":             0.7,
          },
        },
        // ── Dimmed state — applied to unfocused elements on selection ──
        {
          selector: ".dimmed",
          style: {
            "opacity": 0.1,
          },
        },
      ],
    });

    // ── Focus helpers ─────────────────────────────────────────────────────────
    const applyFocus = (focusedEles) => {
      cy.elements().addClass("dimmed");
      focusedEles.removeClass("dimmed");
    };
    const clearFocus = () => {
      cy.elements().removeClass("dimmed");
    };

    // ── Event: node tap ───────────────────────────────────────────────────────
    cy.on("tap", "node", evt => {
      const node    = evt.target;
      const nodeId  = node.id();

      // Record node (live mode only)
      if (node.hasClass("record")) {
        const record      = node.data("record");
        const typeKey     = node.data("typeKey");
        const parentNode  = cy.getElementById(typeKey);
        const recEdge     = cy.edges(`[source="${typeKey}"][target="${nodeId}"]`);
        applyFocus(node.union(parentNode).union(recEdge));
        onNodeSelect({ type: "record", record, typeDef: TYPE_MAP[typeKey] });
        return;
      }

      // Entity node — schema mode: highlight neighbourhood
      if (mode === "schema") {
        const typeDef = TYPE_MAP[nodeId];
        if (typeDef) {
          applyFocus(node.closedNeighborhood());
          onNodeSelect({ type: "entity", typeKey: nodeId, typeDef, count: counts[nodeId], isLive: false });
        }
        return;
      }

      // Entity node — live mode: expand / collapse
      const typeDef = TYPE_MAP[nodeId];
      if (!typeDef) return;

      const isExpanded = expandedRef.current === nodeId;

      // Remove all existing record nodes + their edges, clear focus first
      clearFocus();
      cy.elements(".record, .rec-edge").remove();

      if (isExpanded) {
        // Collapse
        expandedRef.current = null;
        onNodeSelect({ type: "entity", typeKey: nodeId, typeDef, count: counts[nodeId], isLive: true });
      } else {
        // Expand: add record nodes radially around entity node
        expandedRef.current = nodeId;
        const records   = (allObjectsRef.current[nodeId] || []).slice(0, 15);
        const parentPos = node.position();
        const n         = records.length;

        if (n > 0) {
          const radius = Math.max(185, 80 + n * 14);
          const newNodes = records.map((r, i) => {
            const angle = (2 * Math.PI / n) * i - Math.PI / 2;
            return {
              group: "nodes",
              data: {
                id:        `rec_${r.id}`,
                label:     truncateLabel(r[typeDef.primaryField] || r.id),
                record:    r,
                typeKey:   nodeId,
                nodeColor: NODE_COLORS[nodeId],
              },
              classes: "record",
              position: {
                x: parentPos.x + radius * Math.cos(angle),
                y: parentPos.y + radius * Math.sin(angle),
              },
            };
          });

          const newEdges = records.map(r => ({
            group: "edges",
            data: { id: `re_${r.id}`, source: nodeId, target: `rec_${r.id}` },
            classes: "rec-edge",
          }));

          cy.add([...newNodes, ...newEdges]);

          // Animate in, then apply focus: entity + all its record nodes + rec-edges
          cy.elements(".record").style({ opacity: 0 });
          cy.elements(".record").animate({ style: { opacity: 1 } }, { duration: 280, complete: () => {
            const expanded = cy.getElementById(nodeId)
              .union(cy.elements(".record"))
              .union(cy.elements(".rec-edge"));
            applyFocus(expanded);
          }});
        } else {
          // No records — focus entity node only
          applyFocus(node.closedNeighborhood());
        }

        onNodeSelect({ type: "entity", typeKey: nodeId, typeDef, count: counts[nodeId], isLive: true });
      }
    });

    // ── Event: edge tap ───────────────────────────────────────────────────────
    cy.on("tap", "edge", evt => {
      const edge     = evt.target;
      const edgeData = edge.data();
      // Highlight the edge + both its endpoint nodes
      applyFocus(edge.union(edge.connectedNodes()));
      const edgeInfo = ONTOLOGY_EDGES.find(e => e.id === edgeData.id);
      if (edgeInfo) {
        onNodeSelect({ type: "edge", edgeInfo });
      }
    });

    // Canvas tap → deselect + clear focus
    cy.on("tap", evt => {
      if (evt.target === cy) {
        clearFocus();
        onNodeSelect(null);
      }
    });

    cy.ready(() => cy.fit(undefined, 48));
    cyRef.current = cy;

    return () => { cy.destroy(); cyRef.current = null; };
  }, [countsKey, loaded, mode, dqScores]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleFit = () => cyRef.current?.fit(undefined, 48);
  const handleZoomIn  = () => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.zoom({ level: Math.min(cy.zoom() * 1.3, 3), renderedPosition: { x: containerRef.current.clientWidth / 2, y: containerRef.current.clientHeight / 2 } });
  };
  const handleZoomOut = () => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.zoom({ level: Math.max(cy.zoom() * 0.75, 0.25), renderedPosition: { x: containerRef.current.clientWidth / 2, y: containerRef.current.clientHeight / 2 } });
  };

  if (loading || !loaded) {
    return (
      <div className="flex-1 bg-white rounded-2xl border border-slate-100 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-violet-400 mx-auto mb-3" />
          <p className="text-sm text-slate-500 font-medium">Loading ontology…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex-1 min-h-0 bg-white rounded-2xl border border-slate-100 overflow-hidden">
      {/* Dot-grid background */}
      <div
        className="absolute inset-0 opacity-30 pointer-events-none"
        style={{
          backgroundImage: "radial-gradient(circle, #cbd5e1 1px, transparent 1px)",
          backgroundSize: "28px 28px",
        }}
      />

      {/* Cytoscape canvas */}
      <div ref={containerRef} className="absolute inset-0" />

      {/* Legend */}
      <div className="absolute top-3 left-3 flex flex-wrap gap-1.5 z-10 max-w-sm pointer-events-none">
        {OBJECT_TYPES.map(t => {
          const Icon = t.icon;
          return (
            <div key={t.key} className={`flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold ${t.bg} ${t.color} border ${t.border}`}>
              <Icon className="w-2.5 h-2.5" />
              {t.label}
              <span className="opacity-60">{(counts[t.key] || 0).toLocaleString()}</span>
            </div>
          );
        })}
      </div>

      {/* Live mode hint banner */}
      {mode === "live" && (
        <div className="absolute top-3 right-3 z-10 bg-violet-600 text-white text-[11px] font-semibold px-3 py-1.5 rounded-full shadow-sm flex items-center gap-1.5">
          <Activity className="w-3 h-3" />
          Click any entity node to expand its records
        </div>
      )}

      {/* Zoom controls */}
      <div className="absolute bottom-4 right-4 flex flex-col gap-1 z-10">
        <button onClick={handleZoomIn}  className="w-8 h-8 bg-white rounded-lg shadow border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-50 font-bold text-base leading-none" title="Zoom in">+</button>
        <button onClick={handleFit}     className="w-8 h-8 bg-white rounded-lg shadow border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-50" title="Fit all"><Maximize2 className="w-3.5 h-3.5" /></button>
        <button onClick={handleZoomOut} className="w-8 h-8 bg-white rounded-lg shadow border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-50 font-bold text-base leading-none" title="Zoom out">−</button>
      </div>

      {/* Hint footer */}
      <div className="absolute bottom-4 left-4 z-10 pointer-events-none">
        <p className="text-[10px] text-slate-400 bg-white/80 px-2 py-1 rounded-lg border border-slate-100">
          {mode === "live"
            ? "Click entity node to expand · Click record to inspect · Scroll to zoom"
            : "Click a node to inspect · Drag to pan · Scroll to zoom"
          }
        </p>
      </div>
    </div>
  );
}

// ── Search sub-components ─────────────────────────────────────────────────────
function matchesQuery(obj, fields, query) {
  const q = query.toLowerCase();
  return fields.some(f => { const v = obj[f]; return v && String(v).toLowerCase().includes(q); });
}

function ResultCard({ result, typeDef, onSelect, isSelected }) {
  const Icon    = typeDef.icon;
  const primary   = result[typeDef.primaryField]   || result.id?.slice(0, 8) || "—";
  const secondary = result[typeDef.secondaryField] || "";
  return (
    <button
      onClick={() => onSelect(result, typeDef)}
      className={`w-full text-left flex items-center gap-3 p-3 rounded-xl border transition-all hover:shadow-sm ${
        isSelected ? `${typeDef.border} ring-2 ring-offset-1 ring-blue-300 ${typeDef.bg}` : "border-slate-100 hover:border-slate-200 bg-white"
      }`}
    >
      <div className={`w-9 h-9 rounded-xl ${typeDef.bg} flex items-center justify-center shrink-0`}>
        <Icon className={`w-4 h-4 ${typeDef.color}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-800 truncate">{primary}</p>
        {secondary && <p className={`text-xs ${typeDef.color} truncate font-medium`}>{secondary}</p>}
      </div>
      <ChevronRight className="w-3.5 h-3.5 text-slate-300 shrink-0" />
    </button>
  );
}

function ObjectViewPanel({ object, typeDef, onClose, navigate }) {
  if (!object || !typeDef) return null;
  const Icon    = typeDef.icon;
  const primary = object[typeDef.primaryField] || "—";
  const allProps = Object.entries(object)
    .filter(([k, v]) => !["id", "created_date", "updated_date", "company_id", "__typename"].includes(k) && v !== null && v !== undefined && v !== "")
    .slice(0, 24);
  return (
    <div className="flex flex-col h-full">
      <div className={`flex items-center gap-3 p-4 border-b ${typeDef.border} ${typeDef.bg}`}>
        <div className={`w-10 h-10 rounded-xl bg-white border ${typeDef.border} flex items-center justify-center shrink-0`}>
          <Icon className={`w-5 h-5 ${typeDef.color}`} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-black text-slate-800 truncate">{primary}</p>
          <ObjectTypeBadge typeKey={typeDef.key} />
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={() => navigate(createPageUrl(typeDef.routePage))} className={`p-1.5 rounded-lg hover:${typeDef.bg} transition-colors`}>
            <ExternalLink className={`w-4 h-4 ${typeDef.color}`} />
          </button>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors text-slate-400 hover:text-slate-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-1">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Properties</p>
        {allProps.map(([key, value]) => (
          <div key={key} className="flex items-start gap-2 py-1.5 border-b border-slate-50">
            <span className="text-[11px] font-semibold text-slate-400 w-36 shrink-0 pt-0.5 capitalize">{key.replace(/_/g, " ")}</span>
            <span className="text-[11px] text-slate-700 flex-1 break-words">
              {Array.isArray(value)
                ? value.map((v, i) => <span key={i} className="inline-block bg-slate-100 rounded px-1.5 py-0.5 mr-1 mb-1 text-[10px] font-medium">{String(v)}</span>)
                : typeof value === "boolean" ? (value ? "Yes" : "No") : String(value)
              }
            </span>
          </div>
        ))}
      </div>
      <div className="px-4 py-2 border-t border-slate-100 bg-slate-50">
        <p className="text-[10px] text-slate-400 font-mono truncate">id: {object.id}</p>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ObjectExplorer() {
  const navigate = useNavigate();

  const { data: currentUser = null } = useQuery({
    queryKey: ["currentUser"],
    queryFn: () => ncClient.auth.me(),
    staleTime: 0,
    refetchOnMount: "always",
  });
  const [mode, setMode]               = useState("schema");    // "schema" | "live" | "3d" | "search"
  const [query, setQuery]             = useState("");
  const [loading, setLoading]         = useState(false);
  const [allObjects, setAllObjects]   = useState({});
  const [loaded, setLoaded]           = useState(false);
  const [selectedType, setSelectedType]   = useState("all");
  // Graph mode selection: { type: "entity"|"record", ... } or null
  const [graphSelection, setGraphSelection]   = useState(null);
  // Search mode selection
  const [searchObject, setSearchObject]       = useState(null);
  const [searchTypeDef, setSearchTypeDef]     = useState(null);
  // Data quality report
  const [dqScores, setDqScores] = useState({});
  const [dqIssues, setDqIssues] = useState([]);
  const [avgScore, setAvgScore] = useState(null);

  const listFn = useEntityListFn(currentUser);


  useEffect(() => {
    if (!currentUser || loaded) return;
    const load = async () => {
      setLoading(true);
      const results = {};
      await Promise.allSettled(
        OBJECT_TYPES.map(async t => {
          try { results[t.key] = (await listFn(ncClient.entities[t.entity])) || []; }
          catch { results[t.key] = []; }
        })
      );
      setAllObjects(results);
      setLoaded(true);
      setLoading(false);
    };
    load();
  }, [currentUser, loaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch data quality report — fire after user loads, best-effort
  useEffect(() => {
    const companyId = currentUser?.company_id;
    if (!companyId) return;
    authHeaders().then(headers => fetch(`${RAILWAY_URL}/dataquality/report?company_id=${companyId}`, { headers }))
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return;
        setDqScores(data.by_entity || {});
        setDqIssues(data.issues || []);
        setAvgScore(data.overall_score ?? null);
      })
      .catch(() => {});
  }, [currentUser]); // eslint-disable-line react-hooks/exhaustive-deps

  const filteredResults = useMemo(() => {
    if (!query.trim() || query.length < 2) return {};
    const out   = {};
    const types = selectedType === "all" ? OBJECT_TYPES : OBJECT_TYPES.filter(t => t.key === selectedType);
    for (const t of types) {
      const matched = (allObjects[t.key] || []).filter(r => matchesQuery(r, t.searchFields, query));
      if (matched.length) out[t.key] = matched.slice(0, 12);
    }
    return out;
  }, [query, allObjects, selectedType]);

  const totalResults = Object.values(filteredResults).reduce((s, a) => s + a.length, 0);
  const totalObjects = Object.values(allObjects).reduce((s, a) => s + a.length, 0);

  const isGraphMode = mode === "schema" || mode === "live";

  // Right-panel component for graph modes
  const graphPanel = graphSelection
    ? graphSelection.type === "record"
      ? <RecordDetailPanel selection={graphSelection} navigate={navigate} onClose={() => setGraphSelection(null)} />
      : graphSelection.type === "edge"
        ? <EdgeDetailPanel  selection={graphSelection} navigate={navigate} onClose={() => setGraphSelection(null)} />
        : <NodeDetailPanel  selection={graphSelection} navigate={navigate} onClose={() => setGraphSelection(null)} dqScores={dqScores} dqIssues={dqIssues} />
    : null;

  return (
    <div className="flex flex-col gap-0 min-h-full">

      {/* Header */}
      <div className="mb-5">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center">
            <Layers className="w-4 h-4 text-white" />
          </div>
          <h1 className="text-2xl font-black text-slate-800">Object Explorer</h1>
          {avgScore != null && (
            <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${healthColor(avgScore).badge}`}>
              <ShieldCheck className="w-3 h-3" />
              AI Readiness {avgScore}%
            </span>
          )}
        </div>
        <p className="text-slate-500 text-sm ml-11">
          {mode === "schema" && "Visualise your operational ontology — entities, relationships, and live record counts."}
          {mode === "live"   && "Explore real records. Click any entity node to expand its top records on the canvas."}
          {mode === "3d"     && "Rotate the 3D ontology sphere — drag to orbit, scroll to zoom, click any sphere to inspect."}
          {mode === "search" && `Search across all ontology objects — People, Enterprises, Products, Tasks, Transactions, Relationships, Addresses.${loaded ? ` ${totalObjects.toLocaleString()} objects indexed.` : ""}`}
        </p>
      </div>

      {/* Mode toggle */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {[
          { id: "schema", label: "Schema",  Icon: GitBranch },
          { id: "live",   label: "Live",    Icon: Activity  },
          { id: "3d",     label: "3D",      Icon: Box       },
          { id: "search", label: "Search",  Icon: Search    },
        ].map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => { setMode(id); setGraphSelection(null); setSearchObject(null); }}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold transition-all ${
              mode === id
                ? "bg-violet-600 text-white shadow-sm"
                : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* ── GRAPH MODES (Schema / Live) ────────────────────────────────────── */}
      {isGraphMode && (
        <div className="flex gap-4 flex-1" style={{ minHeight: "520px" }}>
          <OntologyGraph
            allObjects={allObjects}
            loaded={loaded}
            loading={loading}
            mode={mode}
            onNodeSelect={setGraphSelection}
            dqScores={dqScores}
          />
          {graphPanel}
        </div>
      )}

      {/* ── 3D MODE ──────────────────────────────────────────────────────────── */}
      {mode === "3d" && (
        <div className="flex gap-4 flex-1" style={{ minHeight: "520px" }}>
          <Graph3D
            allObjects={allObjects}
            loaded={loaded}
            loading={loading}
            onNodeSelect={setGraphSelection}
          />
          {graphPanel}
        </div>
      )}

      {/* ── SEARCH MODE ─────────────────────────────────────────────────────── */}
      {mode === "search" && (
        <>
          <div className="relative mb-4">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            {loading && <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 animate-spin" />}
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search by name, email, city, type, invoice number…"
              autoFocus
              className="w-full pl-12 pr-12 py-3.5 rounded-2xl border border-slate-200 bg-white text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-300 shadow-sm"
            />
            {query && (
              <button onClick={() => { setQuery(""); setSearchObject(null); }} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="flex gap-2 overflow-x-auto pb-2 mb-4 scrollbar-hide">
            <button
              onClick={() => setSelectedType("all")}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${selectedType === "all" ? "bg-slate-800 text-white" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"}`}
            >All Types</button>
            {OBJECT_TYPES.map(t => {
              const Icon  = t.icon;
              const count = (allObjects[t.key] || []).length;
              return (
                <button key={t.key} onClick={() => setSelectedType(t.key)}
                  className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${selectedType === t.key ? `${t.bg} ${t.color} border ${t.border}` : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"}`}
                >
                  <Icon className="w-3 h-3" />{t.label}
                  {count > 0 && <span className="text-[10px] opacity-70">({count})</span>}
                </button>
              );
            })}
          </div>

          <div className="flex flex-1 gap-4 min-h-0">
            <div className={`flex flex-col ${searchObject ? "w-full lg:w-1/2" : "w-full"} gap-4`}>
              {!loaded && loading && (
                <div className="flex items-center justify-center py-16 text-slate-400 bg-white rounded-2xl border border-slate-100">
                  <Loader2 className="w-6 h-6 animate-spin mr-3" />
                  <span className="text-sm">Indexing all ontology objects…</span>
                </div>
              )}

              {loaded && !query && (
                <div className="bg-white border border-slate-100 rounded-2xl p-8 text-center">
                  <Layers className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                  <p className="text-sm font-semibold text-slate-500">Start typing to search the ontology</p>
                  <p className="text-xs text-slate-400 mt-1">Search by name, email, city, type, role, status — any field</p>
                  <div className="flex flex-wrap gap-2 justify-center mt-5">
                    {OBJECT_TYPES.map(t => {
                      const Icon  = t.icon;
                      const count = (allObjects[t.key] || []).length;
                      return (
                        <div key={t.key} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border ${t.border} ${t.bg}`}>
                          <Icon className={`w-3.5 h-3.5 ${t.color}`} />
                          <span className={`text-xs font-bold ${t.color}`}>{t.label}</span>
                          <span className="text-[10px] text-slate-400">{count}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {loaded && query.length >= 2 && totalResults === 0 && (
                <div className="bg-white border border-slate-100 rounded-2xl p-8 text-center">
                  <Search className="w-8 h-8 text-slate-300 mx-auto mb-3" />
                  <p className="text-sm font-semibold text-slate-500">No objects found for "{query}"</p>
                  <p className="text-xs text-slate-400 mt-1">Try a different term or check a different object type</p>
                </div>
              )}

              {loaded && query.length >= 2 && totalResults > 0 && (
                <>
                  <p className="text-xs text-slate-400 font-medium px-1">
                    {totalResults} result{totalResults !== 1 ? "s" : ""} for <strong className="text-slate-600">"{query}"</strong>
                  </p>
                  {Object.entries(filteredResults).map(([typeKey, records]) => {
                    const typeDef = TYPE_MAP[typeKey];
                    if (!typeDef) return null;
                    const Icon = typeDef.icon;
                    return (
                      <div key={typeKey} className="bg-white border border-slate-100 rounded-2xl p-4">
                        <div className={`flex items-center gap-2 mb-3 pb-2 border-b ${typeDef.border}`}>
                          <Icon className={`w-4 h-4 ${typeDef.color}`} />
                          <span className={`text-xs font-bold ${typeDef.color}`}>{typeDef.label}</span>
                          <span className="text-[10px] text-slate-400 ml-auto">{records.length} match{records.length !== 1 ? "es" : ""}</span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {records.map(r => (
                            <ResultCard key={r.id} result={r} typeDef={typeDef}
                              onSelect={(obj, td) => { setSearchObject(obj); setSearchTypeDef(td); }}
                              isSelected={searchObject?.id === r.id}
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
            </div>

            {searchObject && searchTypeDef && (
              <div className="hidden lg:flex lg:w-1/2 bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-sm flex-col">
                <ObjectViewPanel
                  object={searchObject} typeDef={searchTypeDef}
                  onClose={() => { setSearchObject(null); setSearchTypeDef(null); }}
                  navigate={navigate}
                />
              </div>
            )}
          </div>

          {searchObject && searchTypeDef && (
            <div className="lg:hidden fixed inset-0 z-50 bg-white overflow-y-auto">
              <ObjectViewPanel
                object={searchObject} typeDef={searchTypeDef}
                onClose={() => { setSearchObject(null); setSearchTypeDef(null); }}
                navigate={navigate}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
