import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import {
  Activity, AlertCircle, AlertTriangle, RefreshCw,
  ChevronRight, TrendingDown, TrendingUp, Zap,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

const RAILWAY_URL = "https://newsconseenwebapp-production.up.railway.app";
const RAILWAY_API_KEY = import.meta.env.VITE_RAILWAY_API_KEY || "";
const API_HEADERS = RAILWAY_API_KEY ? { "x-api-key": RAILWAY_API_KEY } : {};

function SeverityIcon({ severity }) {
  if (severity === "critical")
    return <AlertCircle className="w-3.5 h-3.5 text-rose-500" />;
  return <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />;
}

function TrendIcon({ anomaly }) {
  if (anomaly.type === "metric_drift") {
    return (anomaly.change_pct || 0) < 0
      ? <TrendingDown className="w-3.5 h-3.5" />
      : <TrendingUp className="w-3.5 h-3.5" />;
  }
  return <Zap className="w-3.5 h-3.5" />;
}

export default function AnomalyWidget({ companyId }) {
  const [report,     setReport]     = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function fetchReport(force = false) {
    if (!companyId) return;
    force ? setRefreshing(true) : setLoading(true);
    try {
      const url = `${RAILWAY_URL}/anomaly/report?company_id=${companyId}${force ? "&force=true" : ""}`;
      const res = await fetch(url, { headers: API_HEADERS });
      if (res.ok) setReport(await res.json());
    } catch (_) {
      // non-critical widget — fail silently
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => { fetchReport(); }, [companyId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-5 flex items-center justify-center h-32">
        <div className="w-5 h-5 border-2 border-slate-200 border-t-violet-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!report) return null;

  const {
    anomaly_count, critical_count, warning_count,
    anomalies = [], evaluated_at,
  } = report;

  const allClear  = anomaly_count === 0;
  const checkedAgo = evaluated_at
    ? formatDistanceToNow(new Date(evaluated_at), { addSuffix: true })
    : null;
  const topItems = anomalies.slice(0, 5);

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-violet-50 flex items-center justify-center">
            <Activity className="w-4 h-4 text-violet-600" />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-800">Anomaly Detection</p>
            {checkedAgo && (
              <p className="text-[10px] text-slate-400">Scanned {checkedAgo}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl border text-xs font-bold ${
            allClear
              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
              : critical_count > 0
              ? "bg-rose-50 text-rose-700 border-rose-200"
              : "bg-amber-50 text-amber-700 border-amber-200"
          }`}>
            {allClear ? "Clear" : `${anomaly_count} found`}
          </div>
          <button
            onClick={() => fetchReport(true)}
            disabled={refreshing}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            title="Re-scan now"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Summary row */}
      <div className="grid grid-cols-3 divide-x divide-slate-100 border-b border-slate-100">
        <div className="px-4 py-3 text-center">
          <p className="text-lg font-bold text-slate-800">{anomaly_count}</p>
          <p className="text-[10px] text-slate-400 font-medium">Anomalies</p>
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

      {/* Anomaly list or all-clear */}
      <div className="divide-y divide-slate-50">
        {allClear ? (
          <div className="px-5 py-6 text-center">
            <Activity className="w-8 h-8 text-violet-300 mx-auto mb-2" />
            <p className="text-xs font-semibold text-violet-700">No anomalies detected</p>
            <p className="text-[10px] text-slate-400 mt-1">
              All metrics are within normal statistical range
            </p>
          </div>
        ) : (
          topItems.map((anomaly, i) => {
            const isCritical = anomaly.severity === "critical";
            const isDrift    = anomaly.type === "metric_drift";
            return (
              <Link
                key={i}
                to={createPageUrl(anomaly.page || "Dashboard")}
                className="flex items-start gap-3 px-5 py-3 hover:bg-slate-50 transition-colors"
              >
                {/* Icon */}
                <div className="relative shrink-0 mt-0.5">
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                    isCritical ? "bg-rose-50" : "bg-amber-50"
                  }`}>
                    <TrendIcon anomaly={anomaly} />
                  </div>
                  <span className={`absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white ${
                    isCritical ? "bg-rose-500" : "bg-amber-400"
                  }`} />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-slate-700 truncate">
                    {anomaly.title}
                  </p>
                  <p className="text-[10px] text-slate-400 truncate mt-0.5">
                    {isDrift
                      ? `${anomaly.change_pct > 0 ? "+" : ""}${anomaly.change_pct}% change · ${anomaly.entity_type}`
                      : `z-score ${anomaly.z_score > 0 ? "+" : ""}${anomaly.z_score} · ${anomaly.entity_type}`
                    }
                  </p>
                </div>

                {/* Severity badge */}
                <div className="flex items-center gap-1 shrink-0">
                  <span className={`text-[10px] font-semibold ${isCritical ? "text-rose-500" : "text-amber-500"}`}>
                    {isCritical ? "Critical" : "Warning"}
                  </span>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-300" />
                </div>
              </Link>
            );
          })
        )}
      </div>

      {/* Footer — detection methods */}
      {!allClear && (
        <div className="px-5 py-2.5 border-t border-slate-100 bg-slate-50">
          <div className="flex gap-4 flex-wrap">
            {anomalies.some(a => a.type === "point_anomaly") && (
              <span className="text-[10px] text-slate-400">
                <span className="font-semibold text-violet-600">Point anomalies</span> — z-score outliers
              </span>
            )}
            {anomalies.some(a => a.type === "metric_drift") && (
              <span className="text-[10px] text-slate-400">
                <span className="font-semibold text-violet-600">Metric drift</span> — run-over-run change
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
