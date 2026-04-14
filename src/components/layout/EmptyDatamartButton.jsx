import React, { useState, useEffect } from "react";
import { Trash2, Loader2, Undo2, RotateCcw, X, AlertTriangle } from "lucide-react";
import { base44 } from "@/api/base44Client";

// ── Entity types in safe delete order (dependants first, roots last)
// ── and safe re-create order (roots first, dependants last)
const DELETE_ORDER  = ["Relationship", "Transaction", "Task", "Address", "Service", "Product", "Person", "Enterprise"];
const RESTORE_ORDER = ["Enterprise", "Person", "Product", "Service", "Address", "Task", "Transaction", "Relationship"];

const BACKUP_KEY    = "datamartBackup";
const BACKUP_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

function readBackup() {
  try {
    const raw = localStorage.getItem(BACKUP_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (Date.now() - new Date(data.deletedAt).getTime() > BACKUP_TTL_MS) {
      localStorage.removeItem(BACKUP_KEY);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

function writeBackup(records) {
  const counts = {};
  Object.entries(records).forEach(([k, v]) => { counts[k] = v.length; });
  localStorage.setItem(BACKUP_KEY, JSON.stringify({
    deletedAt: new Date().toISOString(),
    counts,
    records,
  }));
  window.dispatchEvent(new Event("datamartBackupChanged"));
}

function clearBackup() {
  localStorage.removeItem(BACKUP_KEY);
  window.dispatchEvent(new Event("datamartBackupChanged"));
}

// Strip Base44-managed fields before re-creating (IDs are re-assigned by the platform)
function stripMeta(record) {
  const { id, created_date, updated_date, ...rest } = record;
  return rest;
}

export default function EmptyDatamartButton({ currentUser }) {
  const [phase, setPhase]     = useState("idle"); // idle | confirm | deleting | done | restoring
  const [progress, setProgress] = useState({ done: 0, total: 0, entity: "" });
  const [backup, setBackup]   = useState(null);
  const [error, setError]     = useState(null);

  const isSuperAdmin = currentUser?.role === "super_admin";

  const refreshBackup = () => setBackup(readBackup());

  useEffect(() => {
    refreshBackup();
    window.addEventListener("datamartBackupChanged", refreshBackup);
    return () => window.removeEventListener("datamartBackupChanged", refreshBackup);
  }, []);

  if (!isSuperAdmin) return null;

  // ── Step 1: fetch all records grouped by entity
  // Mirrors useEntityListFn: super_admin → list all; others → filter by company_id
  const fetchAll = async () => {
    const companyId = currentUser?.company_id;
    const superAdmin = currentUser?.role === "super_admin";
    const records = {};
    for (const entity of DELETE_ORDER) {
      try {
        const ent = base44.entities[entity];
        if (!ent) { records[entity] = []; continue; }
        let rows;
        if (superAdmin) {
          // super_admin lists ALL records across all tenants
          rows = await ent.list("-created_date");
        } else if (companyId) {
          // Scoped users only fetch their own workspace records
          rows = await ent.filter({ company_id: companyId });
        } else {
          rows = [];
        }
        records[entity] = Array.isArray(rows) ? rows : [];
      } catch (e) {
        records[entity] = [];
      }
    }
    return records;
  };

  // ── Step 2: delete all
  const handleEmpty = async () => {
    setPhase("deleting");
    setError(null);
    try {
      const records = await fetchAll();
      writeBackup(records);

      const total = Object.values(records).reduce((s, arr) => s + arr.length, 0);
      let done = 0;

      for (const entity of DELETE_ORDER) {
        const ent = base44.entities[entity];
        if (!ent) continue;
        const rows = records[entity] || [];
        for (const row of rows) {
          try { await ent.delete(row.id); } catch (e) { /* best effort — 404 = already gone */ }
          done++;
          setProgress({ done, total, entity });
        }
      }

      setPhase("done");
    } catch (err) {
      setError(err.message || "Unexpected error during deletion.");
      setPhase("idle");
    }
  };

  // ── Step 3: undo — re-create all in restore order
  const handleUndo = async () => {
    const b = readBackup();
    if (!b) return;
    setPhase("restoring");
    setError(null);
    try {
      const totalCount = Object.values(b.counts).reduce((s, n) => s + n, 0);
      let done = 0;

      for (const entity of RESTORE_ORDER) {
        const ent = base44.entities[entity];
        if (!ent) continue;
        const rows = b.records[entity] || [];
        for (const row of rows) {
          try {
            await ent.create(stripMeta(row));
          } catch (e) { /* best effort */ }
          done++;
          setProgress({ done, total: totalCount, entity });
        }
      }

      clearBackup();
      setPhase("idle");
      window.dispatchEvent(new Event("lastBulkImportChanged"));
    } catch (err) {
      setError(err.message || "Restore failed.");
      setPhase("done");
    }
  };

  const handleCancel = () => { setPhase("idle"); setError(null); };
  const handleDismiss = () => { clearBackup(); setPhase("idle"); setError(null); };

  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  // ── Confirm dialog overlay
  if (phase === "confirm") {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
        <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full mx-4 space-y-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5 text-rose-600" />
            </div>
            <div>
              <p className="font-bold text-slate-800">Empty Datamart?</p>
              <p className="text-sm text-slate-500 mt-1">
                This will delete <strong>all records</strong> across every entity for this workspace.
                A backup is saved for 2 hours so you can undo immediately after.
              </p>
            </div>
          </div>
          <div className="bg-rose-50 border border-rose-200 rounded-xl px-3 py-2 text-xs text-rose-700">
            Only records belonging to your workspace will be removed.
            No Base44 schema or configuration is changed.
          </div>
          {error && <p className="text-xs text-rose-600 font-medium">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button
              onClick={handleEmpty}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-sm font-bold transition-colors"
            >
              <Trash2 className="w-4 h-4" /> Yes, empty it
            </button>
            <button
              onClick={handleCancel}
              className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Progress overlay (deleting or restoring)
  if (phase === "deleting" || phase === "restoring") {
    const isRestoring = phase === "restoring";
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
        <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full mx-4 space-y-4">
          <div className="flex items-center gap-3">
            <Loader2 className="w-5 h-5 text-slate-500 animate-spin shrink-0" />
            <p className="font-bold text-slate-800">
              {isRestoring ? "Restoring records…" : "Emptying datamart…"}
            </p>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-xs text-slate-500 capitalize">{progress.entity || "—"}</p>
              <p className="text-xs font-bold text-slate-700">{progress.done} / {progress.total}</p>
            </div>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-200 ${isRestoring ? "bg-emerald-500" : "bg-rose-500"}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
          <p className="text-xs text-slate-400 text-center">Do not close this window</p>
        </div>
      </div>
    );
  }

  // ── Done state — show undo option
  if (phase === "done") {
    const b = backup || readBackup();
    const totalDeleted = b ? Object.values(b.counts).reduce((s, n) => s + n, 0) : 0;
    return (
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-slate-900 text-white px-4 py-3 rounded-2xl shadow-2xl">
        <div className="flex items-center gap-2">
          <Trash2 className="w-4 h-4 text-rose-400" />
          <p className="text-sm font-semibold">Datamart emptied — {totalDeleted} records removed</p>
        </div>
        <button
          onClick={handleUndo}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 rounded-xl text-xs font-bold transition-colors whitespace-nowrap"
        >
          <Undo2 className="w-3.5 h-3.5" /> Undo
        </button>
        <button
          onClick={handleDismiss}
          className="text-slate-400 hover:text-white transition-colors ml-1"
          title="Dismiss (backup expires in 2h)"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  // ── Idle — show the main button (and a restore pill if a backup exists)
  return (
    <div className="flex items-center gap-1.5">
      {backup && (
        <button
          onClick={handleUndo}
          title="Restore previously deleted records"
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium bg-emerald-50 border border-emerald-200 text-emerald-700 hover:bg-emerald-100 transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Restore</span>
        </button>
      )}
      <button
        onClick={() => setPhase("confirm")}
        title="Empty all datamart records (super_admin only)"
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium bg-rose-50 border border-rose-200 text-rose-700 hover:bg-rose-100 transition-colors"
      >
        <Trash2 className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Empty Datamart</span>
      </button>
    </div>
  );
}
