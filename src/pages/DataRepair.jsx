// ==============================================================
// DataRepair — Multi-tenant data quality tool
// ==============================================================
// Scans all 7 ontology entities for:
//  · Missing company_id  → auto-fix for current tenant
//  · Profile completeness → per-entity field coverage %
//  · Orphaned records    → records with no company association
// Uses currentUser.company_id — never hardcodes tenant IDs.
//
// Shares its scan/fix UI (EntityCard, CompletenessBar, ENTITY_CONFIG) with
// the newer DataReadiness page via src/components/shared/DataHealthCards.jsx
// — this page keeps its original always-fix-enabled behavior unchanged.
// ==============================================================

import React, { useState, useCallback } from "react";
import { ncClient } from "@/api/ncClient";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck, AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ENTITY_CONFIG, EntityCard } from "@/components/shared/DataHealthCards";

export default function DataRepair() {
  const { data: currentUser = null } = useQuery({
    queryKey: ["currentUser"],
    queryFn: () => ncClient.auth.me(),
    staleTime: 0,
    refetchOnMount: "always",
  });
  const [repairKey, setRepairKey] = useState(0);
  const qc = useQueryClient();

  const handleRepairAll = useCallback(() => {
    setRepairKey(k => k + 1);
    qc.invalidateQueries({ queryKey: ["repair-scan"] });
  }, [qc]);

  const companyId = currentUser?.company_id;

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
        <p className="text-slate-400 text-sm">Create an Enterprise first to use the data repair tool.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Data Quality</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Scan and repair data integrity issues across all ontology entities
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="rounded-xl shrink-0"
          onClick={() => {
            qc.invalidateQueries({ queryKey: ["repair-scan"] });
            setRepairKey(k => k + 1);
          }}
        >
          <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Re-scan
        </Button>
      </div>

      {/* Info strip */}
      <div className="bg-blue-50 border border-blue-100 rounded-2xl px-4 py-3 flex items-start gap-3">
        <ShieldCheck className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
        <div>
          <p className="text-xs font-semibold text-blue-700">Scoping to your organisation</p>
          <p className="text-[10px] text-blue-500 mt-0.5">
            Showing records for company <span className="font-mono">{companyId.slice(0, 8)}…</span> only.
            Orphaned records (missing company_id) can be claimed for your organisation with the Fix button.
          </p>
        </div>
      </div>

      {/* Entity cards */}
      <div className="space-y-3">
        {ENTITY_CONFIG.map(cfg => (
          <EntityCard
            key={`${cfg.key}-${repairKey}`}
            cfg={cfg}
            companyId={companyId}
            onRepair={handleRepairAll}
          />
        ))}
      </div>

      {/* Legend */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs text-slate-600 space-y-1.5">
        <p className="font-semibold text-slate-700 mb-2">Completeness guide</p>
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
    </div>
  );
}
