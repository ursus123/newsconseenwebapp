// ==============================================================
// DataReadiness — consolidated "why is my dashboard empty" screen
// ==============================================================
// Consolidates three previously-scattered diagnostics into one operator-
// visible page (not admin-only — the now-deleted DataRepair.jsx was;
// this page's entity cards absorbed its scan/fix functionality):
//   · Field completeness / duplicates / invalid values — dataquality engine
//   · Broken relationships + per-table sync freshness — new checks
//   · Degraded features — which pages/cards go empty when an entity is 0
//   · Deep diagnose — on-demand /copilot/diagnose drill-down per entity
//
// Fix actions (claiming orphaned records) only render for admin/super_admin,
// via the same EntityCard component DataRepair.jsx uses — read-only scan is
// visible to any authenticated operator.
// ==============================================================

import React, { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { ncClient } from "@/api/ncClient";
import { usePermissions } from "@/components/shared/usePermissions";
import { ENTITY_CONFIG, EntityCard } from "@/components/shared/DataHealthCards";
import {
  ShieldCheck, AlertTriangle, Loader2, RefreshCw, Link2Off,
  Database, Search, ChevronDown, ChevronUp, Sparkles, Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";
import { RAILWAY_URL, authHeaders } from "@/config/api";

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

// ── Deep diagnose — on-demand /copilot/diagnose drill-down ──────────
function DeepDiagnose({ companyId }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const run = async () => {
    setOpen(o => !o);
    if (result || loading) return;
    setLoading(true);
    try {
      const res = await fetch(`${RAILWAY_URL}/copilot/diagnose?company_id=${companyId}`, { headers: await authHeaders() });
      if (res.ok) setResult(await res.json());
    } catch (_) {
      // non-critical drill-down
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="border border-slate-200 rounded-2xl overflow-hidden">
      <button
        onClick={run}
        className="w-full flex items-center justify-between px-4 py-3 bg-white hover:bg-slate-50 transition-colors"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          <Search className="w-4 h-4 text-indigo-500" /> Deep diagnose — does data actually reach Supabase?
        </span>
        {open ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
      </button>
      {open && (
        <div className="border-t border-slate-100 px-4 py-3 bg-slate-50">
          {loading ? (
            <div className="flex items-center gap-2 text-xs text-slate-400 py-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Cross-checking analytics / raw / live Supabase row counts…
            </div>
          ) : result ? (
            <div className="space-y-2">
              <p className={`text-xs font-semibold ${result.has_data ? "text-emerald-700" : "text-rose-700"}`}>
                {result.diagnosis}
              </p>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(result.tools || {}).map(([tool, info]) => (
                  <div key={tool} className="bg-white border border-slate-200 rounded-lg px-2.5 py-2">
                    <p className="text-[10px] font-mono text-slate-500 truncate">{tool}</p>
                    <p className={`text-xs font-bold ${info.ok && info.row_count > 0 ? "text-emerald-600" : "text-slate-400"}`}>
                      {info.ok ? `${info.row_count} rows` : "error"}
                    </p>
                  </div>
                ))}
              </div>
              {result.supabase_probe && Object.keys(result.supabase_probe).length > 0 && (
                <div className="text-[10px] text-slate-500 space-y-1 mt-2">
                  <p className="font-semibold text-slate-600">Supabase live probe (raw company_id match)</p>
                  {Object.entries(result.supabase_probe).map(([entity, probe]) => (
                    probe?.rows_matching_requested_company_id !== undefined && (
                      <p key={entity}>
                        {entity}: {probe.rows_matching_requested_company_id} of {probe.total_rows_sampled} sampled rows match this company_id
                      </p>
                    )
                  ))}
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-rose-500">Could not reach the diagnostic endpoint.</p>
          )}
        </div>
      )}
    </div>
  );
}

export default function DataReadiness() {
  const { data: currentUser = null } = useQuery({
    queryKey: ["currentUser"],
    queryFn: () => ncClient.auth.me(),
    staleTime: 0,
    refetchOnMount: "always",
  });
  const companyId = currentUser?.company_id;
  const perms = usePermissions(currentUser);
  const canFix = perms.isAdmin || perms.isSuperAdmin;

  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [repairKey, setRepairKey] = useState(0);

  async function fetchReadiness(force = false) {
    if (!companyId) return;
    force ? setRefreshing(true) : setLoading(true);
    try {
      const url = `${RAILWAY_URL}/dataquality/readiness?company_id=${companyId}${force ? "&force=true" : ""}`;
      const res = await fetch(url, { headers: await authHeaders() });
      if (res.ok) setReport(await res.json());
    } catch (_) {
      // non-critical
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => { fetchReadiness(); }, [companyId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!currentUser) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!companyId) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
        <AlertTriangle className="w-10 h-10 text-amber-400" />
        <p className="text-slate-600 font-semibold">No company account found</p>
        <p className="text-slate-400 text-sm">Create an Enterprise first to see data readiness.</p>
      </div>
    );
  }

  const brokenRel = report?.broken_relationships || { broken_count: 0, total: 0, examples: [] };
  const syncFreshness = report?.sync_freshness || {};
  const degradedFeatures = report?.degraded_features || [];
  const checkedAgo = report?.evaluated_at
    ? formatDistanceToNow(new Date(report.evaluated_at), { addSuffix: true })
    : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Data Readiness</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Which entities are populated, what's broken, and what's degraded as a result —
            so an empty dashboard is never a mystery.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {report && <ScoreBadge score={report.overall_score} />}
          <Button
            variant="outline"
            size="sm"
            className="rounded-xl"
            disabled={refreshing}
            onClick={() => { fetchReadiness(true); setRepairKey(k => k + 1); }}
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${refreshing ? "animate-spin" : ""}`} /> Re-scan
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
        </div>
      ) : (
        <>
          {checkedAgo && (
            <p className="text-[11px] text-slate-400">Checked {checkedAgo}{report?.cached && " (cached)"}</p>
          )}

          {!canFix && (
            <div className="bg-blue-50 border border-blue-100 rounded-2xl px-4 py-3 flex items-start gap-3">
              <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
              <p className="text-xs text-blue-700">
                You're viewing the read-only scan. Fixing orphaned records requires an admin.
              </p>
            </div>
          )}

          {/* Deep diagnose */}
          <DeepDiagnose companyId={companyId} />

          {/* Broken relationships */}
          <div className={`rounded-2xl border p-4 ${brokenRel.broken_count > 0 ? "border-rose-200 bg-rose-50/30" : "border-slate-200 bg-white"}`}>
            <div className="flex items-center gap-2 mb-2">
              <Link2Off className={`w-4 h-4 ${brokenRel.broken_count > 0 ? "text-rose-500" : "text-slate-400"}`} />
              <p className="text-sm font-bold text-slate-800">Broken Relationships</p>
              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                brokenRel.broken_count > 0 ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-700"
              }`}>
                {brokenRel.broken_count > 0 ? `${brokenRel.broken_count} BROKEN` : "HEALTHY"}
              </span>
            </div>
            {brokenRel.broken_count > 0 ? (
              <div className="space-y-1.5">
                <p className="text-xs text-slate-500">
                  {brokenRel.broken_count} of {brokenRel.total} relationships point at a person/enterprise that no longer exists.
                </p>
                {brokenRel.examples.map((ex, i) => (
                  <div key={i} className="bg-white border border-slate-100 rounded-lg px-3 py-2 text-[11px]">
                    <span className="font-semibold text-slate-600">{ex.relationship_type || "relationship"}</span>
                    <span className="text-slate-400"> — {ex.reasons.join(", ")}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-400">No dangling person/enterprise references found.</p>
            )}
          </div>

          {/* Sync freshness */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex items-center gap-2 mb-3">
              <Database className="w-4 h-4 text-slate-400" />
              <p className="text-sm font-bold text-slate-800">Sync Freshness</p>
              <span className="text-[10px] text-slate-400">— which tables are synced to the datamart, and when</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {Object.entries(syncFreshness).map(([table, info]) => (
                <div key={table} className={`rounded-lg px-2.5 py-2 border ${
                  info.status !== "synced" ? "border-amber-200 bg-amber-50" :
                  info.is_stale ? "border-amber-200 bg-amber-50" : "border-slate-100 bg-slate-50"
                }`}>
                  <p className="text-[10px] font-mono text-slate-500 truncate">raw.{table}</p>
                  <p className={`text-[10px] font-semibold ${
                    info.status !== "synced" || info.is_stale ? "text-amber-600" : "text-emerald-600"
                  }`}>
                    {info.status === "not_created" ? "not created" :
                     info.status === "no_data_for_company" ? "no data yet" :
                     info.status === "error" ? "check failed" :
                     info.is_stale ? "stale" : "fresh"}
                  </p>
                  {info.last_synced && (
                    <p className="text-[9px] text-slate-400">
                      {formatDistanceToNow(new Date(info.last_synced), { addSuffix: true })}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Degraded features */}
          {degradedFeatures.length > 0 && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50/30 p-4">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                <p className="text-sm font-bold text-slate-800">Degraded Features</p>
                <span className="text-[10px] text-slate-400">— these are showing empty because the entity has 0 records</span>
              </div>
              <div className="space-y-2">
                {degradedFeatures.map(({ entity, features }) => (
                  <div key={entity} className="bg-white border border-amber-100 rounded-lg px-3 py-2">
                    <p className="text-xs font-semibold text-amber-700 capitalize mb-1">{entity} is empty →</p>
                    <div className="flex flex-wrap gap-1.5">
                      {features.map((f, i) => (
                        <span key={i} className="text-[10px] bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full border border-amber-100">
                          {f.feature}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Entity scan cards — read-only for non-admins, fixable for admins */}
          <div className="space-y-3">
            {ENTITY_CONFIG.map(cfg => (
              <EntityCard
                key={`${cfg.key}-${repairKey}`}
                cfg={cfg}
                companyId={companyId}
                canFix={canFix}
              />
            ))}
          </div>

          {/* Legend */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs text-slate-600 space-y-1.5">
            <p className="font-semibold text-slate-700 mb-2 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-slate-400" /> Completeness guide
            </p>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
              <span>80–100% — all key fields filled</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
              <span>50–79% — some important fields missing</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-rose-400 shrink-0" />
              <span>0–49% — critical fields absent, agent accuracy will be reduced</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
