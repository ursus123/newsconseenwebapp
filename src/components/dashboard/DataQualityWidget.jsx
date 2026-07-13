import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import {
  ShieldCheck, AlertCircle, AlertTriangle, RefreshCw,
  ChevronRight, Users, Building2, Package, CheckSquare,
  Receipt, Link2, MapPin,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { RAILWAY_URL, authHeaders } from "@/config/api";

const ENTITY_ICONS = {
  people:        Users,
  enterprises:   Building2,
  products:      Package,
  tasks:         CheckSquare,
  transactions:  Receipt,
  relationships: Link2,
  addresses:     MapPin,
};

const ISSUE_LABELS = {
  missing_field:       "Missing required field",
  missing_recommended: "Missing recommended field",
  duplicate:           "Possible duplicates",
  invalid_value:       "Invalid value",
};

function ScoreBadge({ score }) {
  const color =
    score >= 90 ? "bg-emerald-100 text-emerald-700 border-emerald-200" :
    score >= 75 ? "bg-amber-100  text-amber-700  border-amber-200"  :
    score >= 60 ? "bg-orange-100 text-orange-700 border-orange-200" :
                  "bg-rose-100   text-rose-700   border-rose-200";
  const grade =
    score >= 90 ? "A" : score >= 75 ? "B" : score >= 60 ? "C" :
    score >= 40 ? "D" : "F";
  return (
    <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-sm font-bold ${color}`}>
      <span className="text-xl font-black">{grade}</span>
      <span className="text-lg font-bold">{score}</span>
    </div>
  );
}

export default function DataQualityWidget({ companyId }) {
  const [report,    setReport]    = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [refreshing,setRefreshing]= useState(false);

  async function fetchReport(force = false) {
    if (!companyId) return;
    force ? setRefreshing(true) : setLoading(true);
    try {
      const url = `${RAILWAY_URL}/dataquality/report?company_id=${companyId}${force ? "&force=true" : ""}`;
      const res = await fetch(url, { headers: await authHeaders() });
      if (res.ok) setReport(await res.json());
    } catch (_) {
      // silently fail — widget is non-critical
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => { fetchReport(); }, [companyId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-5 flex items-center justify-center h-32">
        <div className="w-5 h-5 border-2 border-slate-200 border-t-indigo-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!report) return null;

  const { overall_score, critical_count, warning_count, total_issues,
          issues = [], evaluated_at, by_entity = {} } = report;

  const topIssues  = issues.slice(0, 5);
  const allClear   = total_issues === 0;
  const checkedAgo = evaluated_at
    ? formatDistanceToNow(new Date(evaluated_at), { addSuffix: true })
    : null;

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-indigo-50 flex items-center justify-center">
            <ShieldCheck className="w-4 h-4 text-indigo-600" />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-800">Data Health</p>
            {checkedAgo && (
              <p className="text-[10px] text-slate-400">Checked {checkedAgo}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ScoreBadge score={overall_score} />
          <button
            onClick={() => fetchReport(true)}
            disabled={refreshing}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            title="Re-evaluate now"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Summary row */}
      <div className="grid grid-cols-3 divide-x divide-slate-100 border-b border-slate-100">
        <div className="px-4 py-3 text-center">
          <p className="text-lg font-bold text-slate-800">{total_issues}</p>
          <p className="text-[10px] text-slate-400 font-medium">Total issues</p>
        </div>
        <div className="px-4 py-3 text-center">
          <p className={`text-lg font-bold ${critical_count > 0 ? "text-rose-600" : "text-slate-400"}`}>
            {critical_count}
          </p>
          <p className="text-[10px] text-slate-400 font-medium">Critical</p>
        </div>
        <div className="px-4 py-3 text-center">
          <p className={`text-lg font-bold ${warning_count > 0 ? "text-amber-600" : "text-slate-400"}`}>
            {warning_count}
          </p>
          <p className="text-[10px] text-slate-400 font-medium">Warnings</p>
        </div>
      </div>

      {/* Issue list or all-clear */}
      <div className="divide-y divide-slate-50">
        {allClear ? (
          <div className="px-5 py-6 text-center">
            <ShieldCheck className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
            <p className="text-xs font-semibold text-emerald-700">All clear — no data quality issues</p>
            <p className="text-[10px] text-slate-400 mt-1">All 7 entities look complete and consistent</p>
          </div>
        ) : (
          topIssues.map((issue, i) => {
            const Icon = ENTITY_ICONS[issue.entity_type] || ShieldCheck;
            const isCritical = issue.severity === "critical";
            return (
              <Link
                key={i}
                to={createPageUrl(issue.page)}
                className="flex items-start gap-3 px-5 py-3 hover:bg-slate-50 transition-colors"
              >
                {/* Severity dot + entity icon */}
                <div className="relative shrink-0 mt-0.5">
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                    isCritical ? "bg-rose-50" : "bg-amber-50"
                  }`}>
                    <Icon className={`w-3.5 h-3.5 ${isCritical ? "text-rose-500" : "text-amber-500"}`} />
                  </div>
                  <span className={`absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white ${
                    isCritical ? "bg-rose-500" : "bg-amber-400"
                  }`} />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-slate-700 truncate">
                    {issue.message}
                  </p>
                  <p className="text-[10px] text-slate-400 truncate mt-0.5">
                    {ISSUE_LABELS[issue.issue_type] || issue.issue_type}
                    {" · "}
                    <span className="capitalize">{issue.entity_type}</span>
                  </p>
                </div>

                {/* Fix link */}
                <div className="flex items-center gap-1 shrink-0">
                  <span className="text-[10px] text-indigo-500 font-semibold">Fix</span>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-300" />
                </div>
              </Link>
            );
          })
        )}
      </div>

      {/* Footer — entity scores */}
      {!allClear && Object.keys(by_entity).length > 0 && (
        <div className="px-5 py-3 border-t border-slate-100 bg-slate-50">
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {Object.entries(by_entity)
              .filter(([, score]) => score < 100)
              .sort(([, a], [, b]) => a - b)
              .map(([entity, score]) => {
                const color =
                  score >= 90 ? "text-emerald-600" :
                  score >= 75 ? "text-amber-600"   :
                                "text-rose-600";
                return (
                  <Link
                    key={entity}
                    to={createPageUrl(entity.charAt(0).toUpperCase() + entity.slice(1))}
                    className="flex items-center gap-1 text-[10px] hover:opacity-75"
                  >
                    <span className="text-slate-500 capitalize">{entity}</span>
                    <span className={`font-bold ${color}`}>{score}</span>
                  </Link>
                );
              })}
          </div>
        </div>
      )}

      {/* View full report — broken relationships, sync freshness, degraded features */}
      <Link
        to={createPageUrl("DataReadiness")}
        className="flex items-center justify-center gap-1 px-5 py-2.5 border-t border-slate-100 text-[11px] font-semibold text-indigo-600 hover:bg-slate-50 transition-colors"
      >
        View full readiness report <ChevronRight className="w-3 h-3" />
      </Link>
    </div>
  );
}
