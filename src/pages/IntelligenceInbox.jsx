import React, { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ncClient } from "@/api/ncClient";
import intelligenceService from "@/services/intelligenceService";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import {
  Lightbulb, AlertTriangle, TrendingUp, CheckCircle2, XCircle,
  Clock, Eye, ChevronRight, RefreshCw, Loader2,
  ThumbsUp, ThumbsDown, Plus, Zap, BarChart2,
  ShieldAlert, Target, Brain, Sparkles, Activity,
} from "lucide-react";
import { RAILWAY_URL, authHeaders } from "@/config/api";
import SharedEmptyState from "@/components/shared/EmptyState";

// ── Tab config ─────────────────────────────────────────────────────

const TABS = [
  { id: "new",             label: "New",            icon: Lightbulb   },
  { id: "risks",           label: "Risks",          icon: ShieldAlert },
  { id: "opportunities",   label: "Opportunities",  icon: Target      },
  { id: "recommendations", label: "Recommendations",icon: Zap         },
  { id: "actioned",        label: "Actioned",       icon: CheckCircle2},
  { id: "dismissed",       label: "Dismissed",      icon: XCircle     },
];

// ── Color maps ─────────────────────────────────────────────────────

const SEVERITY_STYLE = {
  critical: { badge: "bg-rose-100 text-rose-700 border-rose-200",  border: "border-l-rose-500",  dot: "bg-rose-500"   },
  high:     { badge: "bg-amber-100 text-amber-700 border-amber-200", border: "border-l-amber-500", dot: "bg-amber-500"  },
  medium:   { badge: "bg-blue-100 text-blue-700 border-blue-200",  border: "border-l-blue-400",  dot: "bg-blue-400"   },
  low:      { badge: "bg-slate-100 text-slate-600 border-slate-200",border: "border-l-slate-300", dot: "bg-slate-300"  },
};

const TYPE_STYLE = {
  risk:        { icon: ShieldAlert, cls: "text-rose-500",   bg: "bg-rose-50"    },
  opportunity: { icon: Target,      cls: "text-emerald-500",bg: "bg-emerald-50" },
  anomaly:     { icon: AlertTriangle,cls:"text-amber-500",  bg: "bg-amber-50"   },
  trend:       { icon: TrendingUp,  cls: "text-indigo-500", bg: "bg-indigo-50"  },
  forecast:    { icon: BarChart2,   cls: "text-violet-500", bg: "bg-violet-50"  },
  benchmark:   { icon: Activity,    cls: "text-blue-500",   bg: "bg-blue-50"    },
  explanation: { icon: Lightbulb,   cls: "text-amber-500",  bg: "bg-amber-50"   },
};

const STATUS_STYLE = {
  proposed:    "bg-amber-50 text-amber-700",
  approved:    "bg-emerald-50 text-emerald-700",
  rejected:    "bg-rose-50 text-rose-700",
  in_progress: "bg-blue-50 text-blue-700",
  completed:   "bg-slate-100 text-slate-600",
};

const RISK_STATUS_STYLE = {
  open:         "bg-rose-50 text-rose-700",
  acknowledged: "bg-amber-50 text-amber-700",
  mitigated:    "bg-blue-50 text-blue-700",
  accepted:     "bg-slate-100 text-slate-600",
  resolved:     "bg-emerald-50 text-emerald-700",
  closed:       "bg-slate-100 text-slate-400",
};

const OPP_STATUS_STYLE = {
  identified:  "bg-blue-50 text-blue-700",
  evaluating:  "bg-amber-50 text-amber-700",
  pursuing:    "bg-indigo-50 text-indigo-700",
  won:         "bg-emerald-50 text-emerald-700",
  lost:        "bg-rose-50 text-rose-700",
  deferred:    "bg-slate-100 text-slate-500",
};

// ── Evidence viewer ────────────────────────────────────────────────

function EvidenceList({ evidence }) {
  if (!evidence) return null;
  let items = [];
  try { items = typeof evidence === "string" ? JSON.parse(evidence) : evidence; } catch (_) {}
  if (!Array.isArray(items) || items.length === 0) return null;

  return (
    <div className="mt-3 space-y-1.5">
      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Evidence</p>
      {items.map((item, i) => (
        <div key={i} className="flex items-start gap-2 bg-slate-50 rounded-lg px-3 py-2 text-xs text-slate-600">
          <span className="font-medium text-slate-400 shrink-0">{item.source || item.type}</span>
          <span className="flex-1">{item.label}</span>
          {item.value !== undefined && (
            <span className="font-mono font-bold text-slate-700 shrink-0">
              {typeof item.value === "number" ? item.value.toLocaleString() : String(item.value)}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Insight Card ───────────────────────────────────────────────────

function InsightCard({ insight, onAcknowledge, onDismiss, onCreateRec, onMarkActioned, loading }) {
  const [expanded, setExpanded] = useState(false);
  const sev  = SEVERITY_STYLE[insight.severity] || SEVERITY_STYLE.medium;
  const type = TYPE_STYLE[insight.insight_type] || TYPE_STYLE.explanation;
  const TypeIcon = type.icon;

  return (
    <div className={`bg-white border border-slate-200 rounded-xl border-l-4 ${sev.border} shadow-sm hover:shadow-md transition-shadow`}>
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className={`w-8 h-8 rounded-xl ${type.bg} flex items-center justify-center shrink-0`}>
            <TypeIcon className={`w-4 h-4 ${type.cls}`} />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <p className="text-sm font-bold text-slate-800 leading-snug">{insight.title}</p>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${sev.badge}`}>
                  {(insight.severity || "medium").toUpperCase()}
                </span>
                {insight.confidence != null && (
                  <span className="text-[10px] text-slate-400 font-mono">
                    {Math.round(insight.confidence * 100)}% conf
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <Badge className="text-[10px] px-1.5 py-0 bg-slate-100 text-slate-500 capitalize">
                {(insight.insight_type || "insight").replace(/_/g, " ")}
              </Badge>
              {insight.source && (
                <span className="text-[10px] text-slate-400">
                  {(insight.source || "").replace(/_/g, " ")}
                </span>
              )}
              {insight.subject_name && (
                <>
                  <span className="text-[10px] text-slate-300">·</span>
                  <span className="text-[10px] text-slate-500 font-medium">{insight.subject_name}</span>
                </>
              )}
              {insight.detected_at && (
                <>
                  <span className="text-[10px] text-slate-300">·</span>
                  <span className="text-[10px] text-slate-400">
                    {new Date(insight.detected_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
                  </span>
                </>
              )}
            </div>

            {insight.body && (
              <p className={`text-xs text-slate-600 mt-2 leading-relaxed ${expanded ? "" : "line-clamp-2"}`}>
                {insight.body}
              </p>
            )}

            {expanded && <EvidenceList evidence={insight.evidence} />}
          </div>
        </div>

        <div className="flex items-center gap-2 mt-3 flex-wrap">
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-[11px] text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1"
          >
            <Eye className="w-3 h-3" />
            {expanded ? "Less" : "Evidence"}
          </button>

          <button
            onClick={() => window.dispatchEvent(new CustomEvent("open-idjwi-panel", { detail: {
              initialMessage: `Tell me more about this ${(insight.insight_type || "insight").replace(/_/g, " ")}: "${insight.title}". What should I do about it?`,
              context: { entity_type: "insight", entity_id: insight.id, entity_label: insight.title },
            } }))}
            className="text-[11px] text-violet-600 hover:text-violet-800 font-medium flex items-center gap-1"
          >
            <Sparkles className="w-3 h-3" /> Ask Idjwi
          </button>

          {insight.status === "new" && (
            <>
              <button
                onClick={() => onAcknowledge(insight)}
                disabled={loading}
                className="text-[11px] text-slate-600 hover:text-slate-800 border border-slate-200 px-2.5 py-1 rounded-lg flex items-center gap-1"
              >
                <CheckCircle2 className="w-3 h-3" /> Acknowledge
              </button>
              <button
                onClick={() => onCreateRec(insight)}
                className="text-[11px] text-indigo-600 hover:text-indigo-800 border border-indigo-200 px-2.5 py-1 rounded-lg flex items-center gap-1"
              >
                <Plus className="w-3 h-3" /> Recommend
              </button>
              <button
                onClick={() => onDismiss(insight)}
                disabled={loading}
                className="text-[11px] text-rose-500 hover:text-rose-700 flex items-center gap-1 ml-auto"
              >
                <XCircle className="w-3 h-3" /> Dismiss
              </button>
            </>
          )}
          {insight.status === "acknowledged" && (
            <>
              <button
                onClick={() => onCreateRec(insight)}
                className="text-[11px] text-indigo-600 hover:text-indigo-800 border border-indigo-200 px-2.5 py-1 rounded-lg flex items-center gap-1"
              >
                <Plus className="w-3 h-3" /> Recommend
              </button>
              <button
                onClick={() => onMarkActioned(insight)}
                disabled={loading}
                className="text-[11px] text-emerald-600 hover:text-emerald-800 border border-emerald-200 px-2.5 py-1 rounded-lg flex items-center gap-1"
              >
                <CheckCircle2 className="w-3 h-3" /> Mark Actioned
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Recommendation Card ────────────────────────────────────────────

function RecommendationCard({ rec, onApprove, onReject, loading }) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
          <Zap className="w-4 h-4 text-indigo-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <p className="text-sm font-bold text-slate-800 leading-snug">{rec.title}</p>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS_STYLE[rec.status] || "bg-slate-100 text-slate-500"}`}>
              {(rec.status || "proposed").replace(/_/g, " ").toUpperCase()}
            </span>
          </div>

          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {rec.action_type && (
              <Badge className="text-[10px] px-1.5 py-0 bg-violet-50 text-violet-700 capitalize">
                {rec.action_type.replace(/_/g, " ")}
              </Badge>
            )}
            {rec.priority && (
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                rec.priority === "critical" ? "bg-rose-50 text-rose-700" :
                rec.priority === "high"     ? "bg-amber-50 text-amber-700" :
                "bg-slate-50 text-slate-600"
              }`}>{rec.priority}</span>
            )}
            {rec.source && (
              <span className="text-[10px] text-slate-400">{rec.source.replace(/_/g, " ")}</span>
            )}
          </div>

          {rec.rationale && (
            <p className="text-xs text-slate-600 mt-2 leading-relaxed line-clamp-2">{rec.rationale}</p>
          )}

          {rec.estimated_impact && (
            <p className="text-xs text-slate-500 mt-1 italic">{rec.estimated_impact}</p>
          )}

          <button
            onClick={() => window.dispatchEvent(new CustomEvent("open-idjwi-panel", { detail: {
              initialMessage: `Tell me more about this recommendation: "${rec.title}". Is this a good idea?`,
              context: { entity_type: "recommendation", entity_id: rec.id, entity_label: rec.title },
            } }))}
            className="text-[11px] text-violet-600 hover:text-violet-800 font-medium flex items-center gap-1 mt-2"
          >
            <Sparkles className="w-3 h-3" /> Ask Idjwi
          </button>

          {rejecting && (
            <div className="mt-3 space-y-2">
              <Textarea
                placeholder="Reason for rejection (optional)"
                value={reason}
                onChange={e => setReason(e.target.value)}
                className="text-xs min-h-16 resize-none"
              />
              <div className="flex gap-2">
                <Button size="sm" variant="destructive" onClick={() => { onReject(rec, reason); setRejecting(false); }} disabled={loading}>
                  Confirm Reject
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setRejecting(false)}>Cancel</Button>
              </div>
            </div>
          )}

          {rec.status === "proposed" && !rejecting && (
            <div className="flex items-center gap-2 mt-3">
              <Button size="sm" variant="outline" onClick={() => onApprove(rec, { createTask: rec.action_type === "create_task" })} disabled={loading}
                className="text-emerald-700 border-emerald-200 hover:bg-emerald-50 flex items-center gap-1.5">
                <ThumbsUp className="w-3 h-3" /> Approve
              </Button>
              <Button size="sm" variant="outline" onClick={() => onApprove(rec, { createTask: true })} disabled={loading}
                className="text-indigo-700 border-indigo-200 hover:bg-indigo-50 flex items-center gap-1.5">
                <Plus className="w-3 h-3" /> Approve + Task
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setRejecting(true)} disabled={loading}
                className="text-rose-600 hover:bg-rose-50 flex items-center gap-1.5">
                <ThumbsDown className="w-3 h-3" /> Reject
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Risk Card ──────────────────────────────────────────────────────

function RiskCard({ risk, onUpdateStatus, loading }) {
  const sev = SEVERITY_STYLE[risk.severity] || SEVERITY_STYLE.medium;
  return (
    <div className={`bg-white border border-slate-200 rounded-xl border-l-4 ${sev.border} p-4 shadow-sm`}>
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-xl bg-rose-50 flex items-center justify-center shrink-0">
          <ShieldAlert className="w-4 h-4 text-rose-500" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <p className="text-sm font-bold text-slate-800">{risk.title}</p>
            <div className="flex items-center gap-1.5">
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${sev.badge}`}>
                {(risk.severity || "medium").toUpperCase()}
              </span>
              <span className={`text-[10px] px-2 py-0.5 rounded-full ${RISK_STATUS_STYLE[risk.status] || "bg-slate-100 text-slate-500"}`}>
                {(risk.status || "open").replace(/_/g, " ")}
              </span>
            </div>
          </div>
          {risk.category && (
            <Badge className="text-[10px] px-1.5 py-0 bg-slate-100 text-slate-500 mt-1 capitalize">{risk.category}</Badge>
          )}
          {risk.description && (
            <p className="text-xs text-slate-600 mt-2 leading-relaxed line-clamp-2">{risk.description}</p>
          )}
          {risk.mitigation && (
            <p className="text-xs text-emerald-600 mt-1 italic">Mitigation: {risk.mitigation}</p>
          )}
          <button
            onClick={() => window.dispatchEvent(new CustomEvent("open-idjwi-panel", { detail: {
              initialMessage: `Tell me more about this risk: "${risk.title}". What's the best way to address it?`,
              context: { entity_type: "risk", entity_id: risk.id, entity_label: risk.title },
            } }))}
            className="text-[11px] text-violet-600 hover:text-violet-800 font-medium flex items-center gap-1 mt-2"
          >
            <Sparkles className="w-3 h-3" /> Ask Idjwi
          </button>
          {(risk.status === "open" || risk.status === "acknowledged") && (
            <div className="flex items-center gap-2 mt-3">
              <Button size="sm" variant="outline" onClick={() => onUpdateStatus(risk, "acknowledged")} disabled={loading || risk.status === "acknowledged"}
                className="text-amber-700 border-amber-200 hover:bg-amber-50 text-[11px]">
                Acknowledge
              </Button>
              <Button size="sm" variant="outline" onClick={() => onUpdateStatus(risk, "mitigated")} disabled={loading}
                className="text-blue-700 border-blue-200 hover:bg-blue-50 text-[11px]">
                Mitigated
              </Button>
              <Button size="sm" variant="outline" onClick={() => onUpdateStatus(risk, "accepted")} disabled={loading}
                className="text-slate-600 border-slate-200 hover:bg-slate-50 text-[11px]">
                Accept Risk
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Opportunity Card ───────────────────────────────────────────────

function OpportunityCard({ opp, onUpdateStatus, loading }) {
  return (
    <div className="bg-white border border-slate-200 border-l-4 border-l-emerald-400 rounded-xl p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
          <Target className="w-4 h-4 text-emerald-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <p className="text-sm font-bold text-slate-800">{opp.title}</p>
            <div className="flex items-center gap-1.5">
              {opp.confidence != null && (
                <span className="text-[10px] text-slate-400 font-mono">
                  {Math.round(opp.confidence * 100)}% conf
                </span>
              )}
              <span className={`text-[10px] px-2 py-0.5 rounded-full ${OPP_STATUS_STYLE[opp.status] || "bg-slate-100 text-slate-500"}`}>
                {(opp.status || "identified").replace(/_/g, " ")}
              </span>
            </div>
          </div>
          {opp.type && (
            <Badge className="text-[10px] px-1.5 py-0 bg-emerald-50 text-emerald-700 mt-1 capitalize">{opp.type}</Badge>
          )}
          {opp.description && (
            <p className="text-xs text-slate-600 mt-2 leading-relaxed line-clamp-2">{opp.description}</p>
          )}
          {opp.estimated_value && (
            <p className="text-xs text-emerald-600 mt-1 font-medium">
              Est. value: {typeof opp.estimated_value === "number" ? opp.estimated_value.toLocaleString() : opp.estimated_value}
            </p>
          )}
          <button
            onClick={() => window.dispatchEvent(new CustomEvent("open-idjwi-panel", { detail: {
              initialMessage: `Tell me more about this opportunity: "${opp.title}". How should we pursue it?`,
              context: { entity_type: "opportunity", entity_id: opp.id, entity_label: opp.title },
            } }))}
            className="text-[11px] text-violet-600 hover:text-violet-800 font-medium flex items-center gap-1 mt-2"
          >
            <Sparkles className="w-3 h-3" /> Ask Idjwi
          </button>
          {(opp.status === "identified" || opp.status === "evaluating") && (
            <div className="flex items-center gap-2 mt-3">
              <Button size="sm" variant="outline" onClick={() => onUpdateStatus(opp, "pursuing")} disabled={loading}
                className="text-indigo-700 border-indigo-200 hover:bg-indigo-50 text-[11px]">
                Pursue
              </Button>
              <Button size="sm" variant="outline" onClick={() => onUpdateStatus(opp, "won")} disabled={loading}
                className="text-emerald-700 border-emerald-200 hover:bg-emerald-50 text-[11px]">
                Won
              </Button>
              <Button size="sm" variant="outline" onClick={() => onUpdateStatus(opp, "deferred")} disabled={loading}
                className="text-slate-600 border-slate-200 hover:bg-slate-50 text-[11px]">
                Defer
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Create Recommendation Dialog ───────────────────────────────────

function CreateRecDialog({ open, onClose, insight, onSubmit, loading }) {
  const [form, setForm] = useState({
    title: insight ? `Act on: ${insight.title}` : "",
    rationale: insight?.body || "",
    priority: insight?.severity || "medium",
    action_type: "investigate",
    estimated_impact: "",
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-indigo-600" /> Create Recommendation
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 mt-2">
          <div>
            <label className="text-xs font-medium text-slate-600">Title</label>
            <input value={form.title} onChange={e => set("title", e.target.value)}
              className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-600">Priority</label>
              <select value={form.priority} onChange={e => set("priority", e.target.value)}
                className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
                {["low","medium","high","critical"].map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">Action Type</label>
              <select value={form.action_type} onChange={e => set("action_type", e.target.value)}
                className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
                {["investigate","create_task","contact_customer","restock","adjust_price","update_record"].map(t =>
                  <option key={t} value={t}>{t.replace(/_/g, " ")}</option>
                )}
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">Rationale</label>
            <Textarea value={form.rationale} onChange={e => set("rationale", e.target.value)}
              className="mt-1 min-h-20 text-sm resize-none" />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">Expected Impact (optional)</label>
            <input value={form.estimated_impact} onChange={e => set("estimated_impact", e.target.value)}
              className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
              placeholder="e.g. Reduce churn by 15%" />
          </div>
          <div className="flex gap-2 pt-1">
            <Button onClick={() => onSubmit({ ...form, insight_id: insight?.id })} disabled={loading || !form.title}
              className="flex-1">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Create Recommendation"}
            </Button>
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Summary stat strip ─────────────────────────────────────────────

function SummaryStrip({ summary }) {
  const items = [
    { label: "New Insights",   value: summary?.new_insights   || 0, cls: "text-indigo-600"  },
    { label: "Open Risks",     value: summary?.open_risks     || 0, cls: "text-rose-600"    },
    { label: "Opportunities",  value: summary?.active_opps    || 0, cls: "text-emerald-600" },
    { label: "Pending Actions",value: summary?.pending_recs   || 0, cls: "text-amber-600"   },
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
      {items.map(({ label, value, cls }) => (
        <div key={label} className="bg-white border border-slate-100 rounded-2xl px-4 py-3">
          <p className="text-xs text-slate-400">{label}</p>
          <p className={`text-2xl font-black ${cls}`}>{value}</p>
        </div>
      ))}
    </div>
  );
}

// ── Empty state ────────────────────────────────────────────────────
// Uses the shared EmptyState component (src/components/shared/EmptyState.jsx),
// imported above as SharedEmptyState.

// ── Main page ──────────────────────────────────────────────────────

export default function IntelligenceInbox() {
  const [activeTab, setActiveTab] = useState("new");
  const [recDialogOpen, setRecDialogOpen] = useState(false);
  const [recInsight, setRecInsight] = useState(null);
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: currentUser = null } = useQuery({
    queryKey: ["currentUser"],
    queryFn:  () => ncClient.auth.me(),
    staleTime: 0,
    refetchOnMount: "always",
  });

  const companyId = currentUser?.company_id;

  // Fetch all intelligence objects
  const { data: inbox = {}, isLoading, refetch } = useQuery({
    queryKey: ["intelligence-inbox", companyId],
    queryFn:  async () => {
      try {
        const params = new URLSearchParams({ company_id: companyId || "", limit: "200" });
        const res = await fetch(`${RAILWAY_URL}/intelligence/inbox?${params}`, {
          headers: await authHeaders(),
        });
        if (res.ok) {
          const data = await res.json();
          if (data?.insights || data?.recommendations || data?.risks || data?.opportunities) return data;
        }
      } catch (_) {}

      // Fallback: load each entity directly
      const [insights, recommendations, risks, opportunities] = await Promise.allSettled([
        intelligenceService.listInsights(currentUser),
        intelligenceService.listRecommendations(currentUser),
        intelligenceService.listRisks(currentUser),
        intelligenceService.listOpportunities(currentUser),
      ]).then(results => results.map(r => r.status === "fulfilled" ? r.value : []));

      return {
        insights,
        recommendations,
        risks,
        opportunities,
        summary: {
          new_insights:  insights.filter(i => i.status === "new").length,
          open_risks:    risks.filter(r => ["open","acknowledged"].includes(r.status)).length,
          active_opps:   opportunities.filter(o => ["identified","evaluating","pursuing"].includes(o.status)).length,
          pending_recs:  recommendations.filter(r => r.status === "proposed").length,
        },
      };
    },
    enabled:   !!currentUser,
    staleTime: 30000,
    refetchOnMount: "always",
  });

  const insights        = inbox.insights        || [];
  const recommendations = inbox.recommendations || [];
  const risks           = inbox.risks           || [];
  const opportunities   = inbox.opportunities   || [];
  const summary         = inbox.summary         || {};

  // Derived tab lists
  const tabData = useMemo(() => ({
    new:             insights.filter(i => i.status === "new"),
    risks:           risks,
    opportunities:   opportunities,
    recommendations: recommendations.filter(r => r.status === "proposed"),
    actioned:        insights.filter(i => ["actioned","acknowledged","resolved"].includes(i.status)),
    dismissed:       insights.filter(i => i.status === "dismissed"),
  }), [insights, recommendations, risks, opportunities]);

  const badgeCounts = {
    new:             tabData.new.length,
    risks:           risks.filter(r => r.status === "open").length,
    opportunities:   opportunities.filter(o => o.status === "identified").length,
    recommendations: tabData.recommendations.length,
  };

  // ── Mutations ──────────────────────────────────────────────────

  const ackMut = useMutation({
    mutationFn: (insight) => intelligenceService.acknowledgeInsight(insight.id, currentUser),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ["intelligence-inbox"] }); toast({ title: "Insight acknowledged" }); },
  });

  const dismissMut = useMutation({
    mutationFn: (insight) => intelligenceService.dismissInsight(insight.id, currentUser),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ["intelligence-inbox"] }); toast({ title: "Insight dismissed" }); },
  });

  const actionedMut = useMutation({
    mutationFn: (insight) => intelligenceService.markInsightActioned(insight.id, currentUser),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ["intelligence-inbox"] }); toast({ title: "Marked as actioned" }); },
  });

  const createRecMut = useMutation({
    mutationFn: (data) => intelligenceService.createRecommendation(data, currentUser),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ["intelligence-inbox"] });
      setRecDialogOpen(false);
      toast({ title: "Recommendation created" });
    },
  });

  const approveMut = useMutation({
    mutationFn: ({ rec, opts }) => intelligenceService.approveRecommendation(rec.id, rec, currentUser, opts),
    onSuccess:  (result) => {
      qc.invalidateQueries({ queryKey: ["intelligence-inbox"] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
      toast({ title: result?.createdTask ? "Approved — task created" : "Recommendation approved" });
    },
  });

  const rejectMut = useMutation({
    mutationFn: ({ rec, reason }) => intelligenceService.rejectRecommendation(rec.id, rec, currentUser, reason),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ["intelligence-inbox"] }); toast({ title: "Recommendation rejected" }); },
  });

  const riskStatusMut = useMutation({
    mutationFn: ({ risk, status }) => intelligenceService.updateRiskStatus(risk.id, status, currentUser),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ["intelligence-inbox"] }); },
  });

  const oppStatusMut = useMutation({
    mutationFn: ({ opp, status }) => intelligenceService.updateOpportunityStatus(opp.id, status, currentUser),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ["intelligence-inbox"] }); },
  });

  if (!currentUser) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );
  }

  const anyLoading = ackMut.isPending || dismissMut.isPending || actionedMut.isPending ||
    createRecMut.isPending || approveMut.isPending || rejectMut.isPending;

  return (
    <div className="flex flex-col h-full bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
      {/* Header */}
      <div className="px-6 pt-5 pb-0 border-b border-slate-100 shrink-0">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center">
              <Brain className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <h1 className="text-base font-bold text-slate-800">Intelligence Inbox</h1>
              <p className="text-xs text-slate-500">AI, ML, enrichment, and agent outputs — all in one place</p>
            </div>
          </div>
          <button onClick={() => refetch()}
            className="text-xs text-slate-500 hover:text-indigo-600 border border-slate-200 px-2.5 py-1.5 rounded-lg flex items-center gap-1.5">
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>

        {/* Summary strip */}
        <SummaryStrip summary={summary} />

        {/* Tabs */}
        <div className="flex items-center gap-1">
          {TABS.map(tab => {
            const Icon     = tab.icon;
            const isActive = activeTab === tab.id;
            const count    = badgeCounts[tab.id];
            return (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-t-lg border-b-2 transition-colors relative ${
                  isActive
                    ? "border-indigo-500 text-indigo-700 bg-indigo-50"
                    : "border-transparent text-slate-500 hover:text-indigo-600 hover:bg-indigo-50"
                }`}>
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
                {count > 0 && (
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${isActive ? "bg-indigo-200 text-indigo-800" : "bg-slate-200 text-slate-600"}`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
          </div>
        ) : (
          <>
            {/* New insights tab */}
            {activeTab === "new" && (
              <div className="space-y-3">
                {tabData.new.length === 0 ? (
                  <SharedEmptyState icon={Lightbulb} message="No new insights"
                    sub="Insights are written automatically by ML models, agents, enrichment, and reports." />
                ) : tabData.new.map(insight => (
                  <InsightCard key={insight.id} insight={insight}
                    loading={anyLoading}
                    onAcknowledge={(i) => ackMut.mutate(i)}
                    onDismiss={(i) => dismissMut.mutate(i)}
                    onMarkActioned={(i) => actionedMut.mutate(i)}
                    onCreateRec={(i) => { setRecInsight(i); setRecDialogOpen(true); }}
                  />
                ))}
              </div>
            )}

            {/* Risks tab */}
            {activeTab === "risks" && (
              <div className="space-y-3">
                {risks.length === 0 ? (
                  <SharedEmptyState icon={ShieldAlert} message="No risks tracked"
                    sub="Risks are created automatically from high-severity insights or can be added manually." />
                ) : risks.map(risk => (
                  <RiskCard key={risk.id} risk={risk} loading={anyLoading}
                    onUpdateStatus={(r, s) => riskStatusMut.mutate({ risk: r, status: s })} />
                ))}
              </div>
            )}

            {/* Opportunities tab */}
            {activeTab === "opportunities" && (
              <div className="space-y-3">
                {opportunities.length === 0 ? (
                  <SharedEmptyState icon={Target} message="No opportunities identified"
                    sub="Opportunities are written by Market Intelligence, agents, and ML models." />
                ) : opportunities.map(opp => (
                  <OpportunityCard key={opp.id} opp={opp} loading={anyLoading}
                    onUpdateStatus={(o, s) => oppStatusMut.mutate({ opp: o, status: s })} />
                ))}
              </div>
            )}

            {/* Recommendations tab */}
            {activeTab === "recommendations" && (
              <div className="space-y-3">
                <Link to={createPageUrl("agents")} className="flex items-center gap-2 text-xs text-slate-500 hover:text-indigo-600 px-1">
                  <Brain className="w-3.5 h-3.5" /> Agent actions also await approval →
                </Link>
                {tabData.recommendations.length === 0 ? (
                  <SharedEmptyState icon={Zap} message="No pending recommendations"
                    sub="Recommendations are proposed by agents or created from insights." />
                ) : tabData.recommendations.map(rec => (
                  <RecommendationCard key={rec.id} rec={rec} loading={anyLoading}
                    onApprove={(rec, opts) => approveMut.mutate({ rec, opts })}
                    onReject={(rec, reason) => rejectMut.mutate({ rec, reason })}
                  />
                ))}
              </div>
            )}

            {/* Actioned tab */}
            {activeTab === "actioned" && (
              <div className="space-y-3">
                {tabData.actioned.length === 0 ? (
                  <SharedEmptyState icon={CheckCircle2} message="No actioned insights yet" />
                ) : tabData.actioned.map(insight => (
                  <InsightCard key={insight.id} insight={insight}
                    loading={anyLoading}
                    onAcknowledge={() => {}}
                    onDismiss={() => {}}
                    onMarkActioned={() => {}}
                    onCreateRec={(i) => { setRecInsight(i); setRecDialogOpen(true); }}
                  />
                ))}
              </div>
            )}

            {/* Dismissed tab */}
            {activeTab === "dismissed" && (
              <div className="space-y-3">
                {tabData.dismissed.length === 0 ? (
                  <SharedEmptyState icon={XCircle} message="No dismissed insights" />
                ) : tabData.dismissed.map(insight => (
                  <div key={insight.id} className="opacity-60">
                    <InsightCard insight={insight}
                      loading={anyLoading}
                      onAcknowledge={() => {}}
                      onDismiss={() => {}}
                      onMarkActioned={() => {}}
                      onCreateRec={() => {}}
                    />
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Create Recommendation dialog */}
      <CreateRecDialog
        open={recDialogOpen}
        onClose={() => setRecDialogOpen(false)}
        insight={recInsight}
        onSubmit={createRecMut.mutate}
        loading={createRecMut.isPending}
      />
    </div>
  );
}
