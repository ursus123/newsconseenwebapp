import { useState } from "react";
import { Database, Wifi, WifiOff, RefreshCw, ChevronDown, ChevronUp, CheckCircle2 } from "lucide-react";

/**
 * DashboardSyncBanner
 *
 * Shows which data sources are live/fallback and lets the user manually refresh.
 *
 * Props:
 *   sources  { [key]: { label, usingAnalytics, loading, error } }
 *   onRefresh  () => void   — triggers refetch for all analytics queries
 *   isRefreshing  bool
 */
export default function DashboardSyncBanner({ sources = {}, onRefresh, isRefreshing }) {
  const [expanded, setExpanded] = useState(false);

  const entries = Object.values(sources);
  if (entries.length === 0) return null;

  const allLive     = entries.every(s => s.usingAnalytics);
  const allFallback = entries.every(s => !s.usingAnalytics);
  const anyError    = entries.some(s => s.error);
  const anyLoading  = entries.some(s => s.loading) || isRefreshing;

  // Banner colour
  const bannerCls = anyError
    ? "bg-rose-50 border-rose-200 text-rose-700"
    : allLive
    ? "bg-emerald-50 border-emerald-200 text-emerald-700"
    : "bg-amber-50 border-amber-200 text-amber-700";

  const icon = anyError
    ? <WifiOff className="w-3.5 h-3.5 shrink-0" />
    : allLive
    ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
    : <Database className="w-3.5 h-3.5 shrink-0" />;

  const summary = anyLoading
    ? "Syncing analytics…"
    : anyError
    ? "Analytics unreachable — showing live data"
    : allLive
    ? "All metrics from analytics engine"
    : allFallback
    ? "Analytics pending — showing live Base44 data"
    : "Mixed sources: some metrics from analytics, some from live data";

  return (
    <div className={`rounded-xl border px-3 py-2 text-xs ${bannerCls}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          {icon}
          <span className="font-medium">{summary}</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={anyLoading}
              title="Refresh analytics"
              className="p-1 rounded hover:bg-black/5 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${anyLoading ? "animate-spin" : ""}`} />
            </button>
          )}
          <button
            onClick={() => setExpanded(v => !v)}
            className="p-1 rounded hover:bg-black/5 transition-colors"
          >
            {expanded
              ? <ChevronUp className="w-3.5 h-3.5" />
              : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="mt-2 pt-2 border-t border-current/10 grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1">
          {Object.entries(sources).map(([key, s]) => (
            <div key={key} className="flex items-center gap-1">
              {s.loading
                ? <RefreshCw className="w-3 h-3 animate-spin opacity-50" />
                : s.usingAnalytics
                ? <Wifi className="w-3 h-3 text-emerald-500" />
                : <Database className="w-3 h-3 text-amber-500" />}
              <span className="opacity-80 truncate">{s.label}</span>
              <span className="opacity-50 shrink-0">
                {s.loading ? "…" : s.usingAnalytics ? "analytics" : "live"}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
