import { useState } from "react";
import { Database, Zap, Server, RefreshCw, ChevronDown, ChevronUp, CheckCircle2, WifiOff, AlertTriangle } from "lucide-react";

// ── Tier metadata ─────────────────────────────────────────────────────────────
const TIER_META = {
  1: { label: "Analytics",  icon: Zap,      color: "text-emerald-600", bg: "bg-emerald-50",  ring: "border-emerald-200" },
  2: { label: "Raw DB",     icon: Database,  color: "text-blue-600",    bg: "bg-blue-50",     ring: "border-blue-200" },
  3: { label: "Live",       icon: Server,    color: "text-amber-600",   bg: "bg-amber-50",    ring: "border-amber-200" },
  0: { label: "Pending",    icon: RefreshCw, color: "text-slate-400",   bg: "bg-slate-50",    ring: "border-slate-200" },
};

function TierBadge({ tier }) {
  const meta = TIER_META[tier] ?? TIER_META[0];
  const Icon = meta.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${meta.bg} ${meta.color} ${meta.ring}`}>
      <Icon className="w-2.5 h-2.5" />
      T{tier || "?"}
    </span>
  );
}

/**
 * DashboardSyncBanner
 *
 * Props:
 *   sources  { [key]: { label, tier, source, loading } }
 *     tier   1 = analytics, 2 = raw DB, 3 = Base44 live, 0 = pending
 *     source "analytics" | "raw" | "base44" | "none"
 *   onRefresh    () => void
 *   isRefreshing bool
 */
export default function DashboardSyncBanner({ sources = {}, onRefresh, isRefreshing }) {
  const [expanded, setExpanded] = useState(false);

  const entries = Object.values(sources);
  if (entries.length === 0) return null;

  const lowestTier = entries.reduce((min, s) => {
    if (!s.tier) return min;
    return s.tier > min ? s.tier : min;
  }, 0);

  const anyLoading = entries.some(s => s.loading) || isRefreshing;
  const allTier1   = entries.every(s => s.tier === 1);
  const anyTier3   = entries.some(s => s.tier === 3);
  const anyPending = entries.some(s => !s.tier || s.tier === 0);

  // Banner style
  const bannerCls = anyLoading
    ? "bg-slate-50 border-slate-200 text-slate-600"
    : allTier1
    ? "bg-emerald-50 border-emerald-200 text-emerald-700"
    : anyTier3
    ? "bg-amber-50 border-amber-200 text-amber-700"
    : "bg-blue-50 border-blue-200 text-blue-700";

  const SummaryIcon = anyLoading
    ? RefreshCw
    : allTier1
    ? CheckCircle2
    : anyTier3
    ? AlertTriangle
    : Database;

  const summaryText = anyLoading
    ? "Loading analytics data…"
    : allTier1
    ? "All metrics served from analytics engine (Tier 1)"
    : anyTier3
    ? "Some metrics using live Base44 data — analytics not yet synced"
    : "Metrics from raw database snapshot (Tier 2)";

  return (
    <div className={`rounded-xl border px-3 py-2 text-xs ${bannerCls}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <SummaryIcon className={`w-3.5 h-3.5 shrink-0 ${anyLoading ? "animate-spin" : ""}`} />
          <span className="font-medium">{summaryText}</span>
          {!anyLoading && !allTier1 && (
            <span className="opacity-60 hidden sm:inline">
              · Tier 1 available after ETL runs
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={anyLoading}
              title="Retry analytics data fetch"
              className="p-1 rounded hover:bg-black/5 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${anyLoading ? "animate-spin" : ""}`} />
            </button>
          )}
          <button
            onClick={() => setExpanded(v => !v)}
            title="Show data source breakdown"
            className="p-1 rounded hover:bg-black/5 transition-colors"
          >
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="mt-2 pt-2 border-t border-current/10">
          {/* Tier legend */}
          <div className="flex flex-wrap gap-2 mb-2">
            <span className="text-[10px] opacity-60 self-center">Data source tiers:</span>
            {[1, 2, 3].map(t => {
              const m = TIER_META[t];
              const Icon = m.icon;
              return (
                <span key={t} className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full border ${m.bg} ${m.color} ${m.ring}`}>
                  <Icon className="w-2.5 h-2.5" /> T{t} {m.label}
                </span>
              );
            })}
          </div>

          {/* Per-source rows */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1.5">
            {Object.entries(sources).map(([key, s]) => {
              const meta = TIER_META[s.tier ?? 0];
              const Icon = s.loading ? RefreshCw : meta.icon;
              return (
                <div key={key} className="flex items-center gap-1.5">
                  <Icon className={`w-3 h-3 shrink-0 ${s.loading ? "animate-spin text-slate-400" : meta.color}`} />
                  <span className="truncate opacity-80 text-[11px]">{s.label}</span>
                  {!s.loading && <TierBadge tier={s.tier ?? 0} />}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
