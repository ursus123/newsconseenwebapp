import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  Target, TrendingUp, TrendingDown, RefreshCw,
  CheckCircle2, AlertTriangle, XCircle, Clock,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

const RAILWAY_URL = "https://newsconseenwebapp-production.up.railway.app";
const RAILWAY_API_KEY = import.meta.env.VITE_RAILWAY_API_KEY || "";
const API_HEADERS = RAILWAY_API_KEY ? { "x-api-key": RAILWAY_API_KEY } : {};

const STATUS_META = {
  exceeded:  { color: "text-emerald-600", bg: "bg-emerald-50",  bar: "bg-emerald-500",  icon: CheckCircle2,    label: "Exceeded"  },
  on_track:  { color: "text-blue-600",    bg: "bg-blue-50",     bar: "bg-blue-500",     icon: TrendingUp,      label: "On track"  },
  at_risk:   { color: "text-amber-600",   bg: "bg-amber-50",    bar: "bg-amber-500",    icon: AlertTriangle,   label: "At risk"   },
  behind:    { color: "text-rose-600",    bg: "bg-rose-50",     bar: "bg-rose-500",     icon: XCircle,         label: "Behind"    },
  unknown:   { color: "text-slate-400",   bg: "bg-slate-50",    bar: "bg-slate-300",    icon: Clock,           label: "Unknown"   },
};

function fmt(val, unit) {
  if (val === null || val === undefined) return "—";
  if (unit === "$") return `$${Number(val).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  if (unit === "%") return `${Number(val).toFixed(1)}%`;
  return Number(val).toLocaleString(undefined, { maximumFractionDigits: 0 });
}

export default function GoalsWidget({ companyId, onSettingsClick }) {
  const [report,     setReport]     = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function fetchReport(force = false) {
    if (!companyId) return;
    force ? setRefreshing(true) : setLoading(true);
    try {
      const url = `${RAILWAY_URL}/goals?company_id=${companyId}&evaluate=true`;
      const res = await fetch(url, { headers: API_HEADERS });
      if (res.ok) setReport(await res.json());
    } catch (_) {}
    finally { setLoading(false); setRefreshing(false); }
  }

  useEffect(() => { fetchReport(); }, [companyId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 flex items-center justify-center h-32">
      <div className="w-5 h-5 border-2 border-slate-200 border-t-emerald-500 rounded-full animate-spin" />
    </div>
  );

  // No goals configured yet
  if (!report || report.goals?.length === 0) return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
      <div className="flex items-center gap-2.5 px-5 py-4 border-b border-slate-100">
        <div className="w-8 h-8 rounded-xl bg-emerald-50 flex items-center justify-center">
          <Target className="w-4 h-4 text-emerald-600" />
        </div>
        <p className="text-sm font-bold text-slate-800">KPI Goals</p>
      </div>
      <div className="px-5 py-8 text-center">
        <Target className="w-8 h-8 text-slate-200 mx-auto mb-2" />
        <p className="text-xs font-semibold text-slate-500">No goals set yet</p>
        <p className="text-[10px] text-slate-400 mt-1 mb-3">
          Set revenue, completion, and client targets — the system tracks progress automatically.
        </p>
        {onSettingsClick && (
          <button
            onClick={onSettingsClick}
            className="text-[11px] font-semibold text-emerald-600 hover:underline"
          >
            Configure goals →
          </button>
        )}
      </div>
    </div>
  );

  const { goals = [], on_track, at_risk, behind, exceeded, evaluated_at } = report;
  const checkedAgo = evaluated_at
    ? formatDistanceToNow(new Date(evaluated_at), { addSuffix: true })
    : null;

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-emerald-50 flex items-center justify-center">
            <Target className="w-4 h-4 text-emerald-600" />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-800">KPI Goals</p>
            {checkedAgo && (
              <p className="text-[10px] text-slate-400">Updated {checkedAgo}</p>
            )}
          </div>
        </div>
        <button
          onClick={() => fetchReport(true)}
          disabled={refreshing}
          className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          title="Refresh goals"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Summary pills */}
      <div className="flex gap-2 px-5 pt-3 pb-1 flex-wrap">
        {exceeded > 0 && (
          <span className="text-[10px] font-bold bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full border border-emerald-200">
            {exceeded} exceeded
          </span>
        )}
        {on_track > 0 && (
          <span className="text-[10px] font-bold bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full border border-blue-200">
            {on_track} on track
          </span>
        )}
        {at_risk > 0 && (
          <span className="text-[10px] font-bold bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full border border-amber-200">
            {at_risk} at risk
          </span>
        )}
        {behind > 0 && (
          <span className="text-[10px] font-bold bg-rose-50 text-rose-700 px-2 py-0.5 rounded-full border border-rose-200">
            {behind} behind
          </span>
        )}
      </div>

      {/* Goal rows */}
      <div className="divide-y divide-slate-50 pb-1">
        {goals.map((goal, i) => {
          const meta   = STATUS_META[goal.status] || STATUS_META.unknown;
          const Icon   = meta.icon;
          const pct    = Math.min(goal.progress_pct ?? 0, 100);
          const isOver = (goal.progress_pct ?? 0) > 100;

          return (
            <div key={i} className="px-5 py-3">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5 min-w-0">
                  <Icon className={`w-3.5 h-3.5 shrink-0 ${meta.color}`} />
                  <p className="text-xs font-semibold text-slate-700 truncate">
                    {goal.label || goal.metric}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-2">
                  <span className="text-xs font-bold text-slate-800">
                    {fmt(goal.actual, goal.unit)}
                  </span>
                  <span className="text-[10px] text-slate-400">/</span>
                  <span className="text-[10px] text-slate-400">
                    {fmt(goal.target, goal.unit)}
                  </span>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${meta.bg} ${meta.color}`}>
                    {goal.progress_pct != null ? `${goal.progress_pct}%` : "—"}
                  </span>
                </div>
              </div>

              {/* Progress bar */}
              <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${meta.bar} ${isOver ? "opacity-80" : ""}`}
                  style={{ width: `${pct}%` }}
                />
              </div>

              {/* Pace hint */}
              {goal.pace_needed != null && goal.pace_needed > 0 && goal.days_remaining > 0 && (
                <p className="text-[10px] text-slate-400 mt-1">
                  Needs {fmt(goal.pace_needed, goal.unit)}/day · {goal.days_remaining}d left
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
