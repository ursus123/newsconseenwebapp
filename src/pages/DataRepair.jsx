// ==============================================================
// DataRepair — Multi-tenant data quality tool
// ==============================================================
// Scans all 7 ontology entities for:
//  · Missing company_id  → auto-fix for current tenant
//  · Profile completeness → per-entity field coverage %
//  · Orphaned records    → records with no company association
// Uses currentUser.company_id — never hardcodes tenant IDs.
// ==============================================================

import React, { useState, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEntityListFn } from "@/components/shared/useDataQuery";
import {
  ShieldCheck, AlertTriangle, Wrench, CheckCircle2, XCircle,
  Loader2, RefreshCw, ChevronDown, ChevronUp, Users, Building2,
  Package, CheckSquare, Receipt, MapPin, Link2,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const RAILWAY_URL = "https://newsconseenwebapp-production.up.railway.app";
const RAILWAY_API_KEY = import.meta.env.VITE_RAILWAY_API_KEY || "";
const triggerETL = (entity) =>
  fetch(`${RAILWAY_URL}/load/${entity}-summary`, {
    method: "POST",
    headers: { "x-api-key": RAILWAY_API_KEY },
  }).catch(() => {});

// ── Entity registry ────────────────────────────────────────────────
const ENTITY_CONFIG = [
  {
    key: "people",
    label: "People",
    icon: Users,
    color: "text-blue-600",
    bg: "bg-blue-50",
    entity: () => base44.entities.Person,
    requiredFields: ["first_name", "last_name", "person_type", "email", "phone", "primary_role"],
    displayName: (r) => `${r.first_name || ""} ${r.last_name || ""}`.trim() || r.id,
    etl: "people",
  },
  {
    key: "enterprises",
    label: "Enterprises",
    icon: Building2,
    color: "text-purple-600",
    bg: "bg-purple-50",
    entity: () => base44.entities.Enterprise,
    requiredFields: ["enterprise_name", "enterprise_type", "status", "email", "phone"],
    displayName: (r) => r.enterprise_name || r.id,
    etl: "enterprise",
  },
  {
    key: "products",
    label: "Products",
    icon: Package,
    color: "text-amber-600",
    bg: "bg-amber-50",
    entity: () => base44.entities.Product,
    requiredFields: ["name", "item_type", "status", "unit_of_measure"],
    displayName: (r) => r.name || r.id,
    etl: "product",
  },
  {
    key: "tasks",
    label: "Tasks",
    icon: CheckSquare,
    color: "text-emerald-600",
    bg: "bg-emerald-50",
    entity: () => base44.entities.Task,
    requiredFields: ["title", "task_type", "status"],
    displayName: (r) => r.title || r.id,
    etl: "task",
  },
  {
    key: "transactions",
    label: "Transactions",
    icon: Receipt,
    color: "text-rose-600",
    bg: "bg-rose-50",
    entity: () => base44.entities.Transaction,
    requiredFields: ["transaction_type", "amount", "status"],
    displayName: (r) => r.description || r.invoice_number || r.id,
    etl: "transaction",
  },
  {
    key: "addresses",
    label: "Addresses",
    icon: MapPin,
    color: "text-teal-600",
    bg: "bg-teal-50",
    entity: () => base44.entities.Address,
    requiredFields: ["address_line1", "city", "country"],
    displayName: (r) => [r.address_line1, r.city].filter(Boolean).join(", ") || r.id,
    etl: "address",
  },
  {
    key: "relationships",
    label: "Relationships",
    icon: Link2,
    color: "text-indigo-600",
    bg: "bg-indigo-50",
    entity: () => base44.entities.Relationship,
    requiredFields: ["relationship_type", "status"],
    displayName: (r) => `${r.relationship_type} — ${r.person_name || r.enterprise_name || r.id}`,
    etl: "relationship",
  },
];

// ── Completeness bar ───────────────────────────────────────────────
function CompletenessBar({ pct }) {
  const color = pct >= 80 ? "bg-emerald-400" : pct >= 50 ? "bg-amber-400" : "bg-rose-400";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-xs font-bold w-8 text-right ${pct >= 80 ? "text-emerald-600" : pct >= 50 ? "text-amber-600" : "text-rose-600"}`}>
        {pct}%
      </span>
    </div>
  );
}

// ── Entity scan card ───────────────────────────────────────────────
function EntityCard({ cfg, companyId, onRepair }) {
  const [expanded, setExpanded] = useState(false);
  const [repairing, setRepairing] = useState(false);
  const [repairLog, setRepairLog] = useState([]);
  const listFn = useEntityListFn({ company_id: companyId });

  const { data: records = [], isLoading, refetch } = useQuery({
    queryKey: ["repair-scan", cfg.key, companyId],
    queryFn: () => listFn(cfg.entity()),
    enabled: !!companyId,
    staleTime: 0,
    refetchOnMount: "always",
  });

  // Compute metrics
  const orphaned = records.filter(r => !r.company_id || r.company_id === "");
  const totalFields = cfg.requiredFields.length;
  const avgComplete = records.length === 0 ? 100 : Math.round(
    records.reduce((sum, r) => {
      const filled = cfg.requiredFields.filter(f => r[f] && String(r[f]).trim() !== "").length;
      return sum + (filled / totalFields) * 100;
    }, 0) / records.length
  );

  const issues = orphaned.length > 0 || avgComplete < 80;

  const handleRepair = async () => {
    if (orphaned.length === 0) return;
    setRepairing(true);
    setRepairLog([]);
    const log = (msg) => setRepairLog(l => [...l, msg]);

    log(`Repairing ${orphaned.length} orphaned ${cfg.label} records...`);
    let fixed = 0;
    for (const r of orphaned) {
      try {
        await cfg.entity().update(r.id, { company_id: companyId });
        fixed++;
      } catch (e) {
        log(`⚠ Failed: ${cfg.displayName(r)} — ${e.message}`);
      }
    }
    log(`✓ Fixed ${fixed} of ${orphaned.length} records`);
    await refetch();
    triggerETL(cfg.etl);
    onRepair?.();
    setRepairing(false);
  };

  const Icon = cfg.icon;

  return (
    <div className={`rounded-2xl border p-4 transition-all ${issues ? "border-amber-200 bg-amber-50/30" : "border-slate-200 bg-white"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className={`w-9 h-9 rounded-xl ${cfg.bg} flex items-center justify-center shrink-0`}>
            <Icon className={`w-4 h-4 ${cfg.color}`} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <p className="text-sm font-bold text-slate-800">{cfg.label}</p>
              {isLoading
                ? <Loader2 className="w-3 h-3 animate-spin text-slate-400" />
                : issues
                  ? <span className="text-[9px] font-bold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">ISSUES FOUND</span>
                  : <span className="text-[9px] font-bold bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full">HEALTHY</span>
              }
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>{records.length} records</span>
                {orphaned.length > 0 && (
                  <span className="text-amber-600 font-semibold">{orphaned.length} orphaned</span>
                )}
              </div>
              <div>
                <p className="text-[10px] text-slate-400 mb-1">Field completeness</p>
                <CompletenessBar pct={avgComplete} />
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {orphaned.length > 0 && (
            <Button
              size="sm"
              disabled={repairing}
              onClick={handleRepair}
              className="text-xs h-7 px-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg"
            >
              {repairing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wrench className="w-3 h-3" />}
              {repairing ? "" : "Fix"}
            </Button>
          )}
          <button
            onClick={() => setExpanded(e => !e)}
            className="text-slate-400 hover:text-slate-600"
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Repair log */}
      {repairLog.length > 0 && (
        <div className="mt-3 bg-slate-900 rounded-xl p-3 space-y-0.5">
          {repairLog.map((line, i) => (
            <p key={i} className={`text-[10px] font-mono ${line.startsWith("✓") ? "text-emerald-400" : line.startsWith("⚠") ? "text-amber-400" : "text-slate-300"}`}>
              {line}
            </p>
          ))}
        </div>
      )}

      {/* Expanded: show incomplete records */}
      {expanded && !isLoading && (
        <div className="mt-3 border-t border-slate-100 pt-3 space-y-1.5">
          {records.length === 0 && (
            <p className="text-xs text-slate-400 text-center py-2">No records</p>
          )}
          {records
            .map(r => {
              const missing = cfg.requiredFields.filter(f => !r[f] || String(r[f]).trim() === "");
              const score = Math.round(((cfg.requiredFields.length - missing.length) / cfg.requiredFields.length) * 100);
              return { r, missing, score };
            })
            .filter(({ score }) => score < 100)
            .sort((a, b) => a.score - b.score)
            .slice(0, 10)
            .map(({ r, missing, score }) => (
              <div key={r.id} className="flex items-start gap-2 bg-slate-50 rounded-lg px-3 py-2">
                <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${score >= 80 ? "bg-amber-400" : "bg-rose-400"}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-slate-700 truncate">{cfg.displayName(r)}</p>
                  <p className="text-[10px] text-slate-400">
                    Missing: {missing.map(f => f.replace(/_/g, " ")).join(", ")}
                  </p>
                </div>
                <span className={`text-[10px] font-bold ${score >= 80 ? "text-amber-600" : "text-rose-600"}`}>{score}%</span>
              </div>
            ))
          }
          {records.filter(r => {
            const missing = cfg.requiredFields.filter(f => !r[f] || String(r[f]).trim() === "");
            return missing.length > 0;
          }).length === 0 && (
            <p className="text-xs text-emerald-600 text-center py-2 font-medium">
              All records are complete
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────
export default function DataRepair() {
  const { data: currentUser = null } = useQuery({
    queryKey: ["currentUser"],
    queryFn: () => base44.auth.me(),
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
