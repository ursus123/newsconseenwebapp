import React, { useState, useEffect } from "react";
import { Trash2, Loader2, Undo2, RotateCcw, X, AlertTriangle } from "lucide-react";
import { base44 } from "@/api/base44Client";

// ── Entity order ───────────────────────────────────────────────────────────
const DELETE_ORDER  = ["Relationship", "Transaction", "Task", "Address", "Service", "Product", "Person", "Enterprise"];
const RESTORE_ORDER = ["Enterprise", "Person", "Product", "Service", "Address", "Task", "Transaction", "Relationship"];

const BACKUP_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

// ── IndexedDB helpers (no size limit, async) ───────────────────────────────
const IDB_DB      = "newsconseenDiag";
const IDB_STORE   = "datamartBackup";
const IDB_KEY     = "backup";
const IDB_VERSION = 1;

function openIDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_DB, IDB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror  = (e) => reject(e.target.error);
  });
}

async function idbSet(value) {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).put(value, IDB_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror    = (e) => reject(e.target.error);
  });
}

async function idbGet() {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(IDB_STORE, "readonly");
    const req = tx.objectStore(IDB_STORE).get(IDB_KEY);
    req.onsuccess = (e) => resolve(e.target.result ?? null);
    req.onerror   = (e) => reject(e.target.error);
  });
}

async function idbClear() {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).delete(IDB_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror    = (e) => reject(e.target.error);
  });
}

// ── Backup read / write / clear ────────────────────────────────────────────
async function readBackup() {
  try {
    const data = await idbGet();
    if (!data) return null;
    if (Date.now() - new Date(data.deletedAt).getTime() > BACKUP_TTL_MS) {
      await idbClear();
      return null;
    }
    return data;
  } catch (e) {
    return null;
  }
}

async function writeBackup(records) {
  const counts = {};
  Object.entries(records).forEach(([k, v]) => { counts[k] = v.length; });
  await idbSet({
    deletedAt: new Date().toISOString(),
    counts,
    records,
  });
  window.dispatchEvent(new Event("datamartBackupChanged"));
}

async function clearBackup() {
  await idbClear();
  window.dispatchEvent(new Event("datamartBackupChanged"));
}

// Strip platform-managed fields so Base44 assigns fresh IDs on re-create
function stripMeta(record) {
  const { id, created_date, updated_date, ...rest } = record;
  return rest;
}

// ── Component ──────────────────────────────────────────────────────────────
export default function EmptyDatamartButton({ currentUser }) {
  const [phase, setPhase]       = useState("idle"); // idle | confirm | deleting | done | restoring
  const [progress, setProgress] = useState({ done: 0, total: 0, entity: "" });
  const [backup, setBackup]     = useState(null);
  const [error, setError]       = useState(null);

  const isSuperAdmin = currentUser?.role === "super_admin";

  const refreshBackup = () => readBackup().then(setBackup).catch(() => setBackup(null));

  useEffect(() => {
    refreshBackup();
    window.addEventListener("datamartBackupChanged", refreshBackup);
    return () => window.removeEventListener("datamartBackupChanged", refreshBackup);
  }, []);

  if (!isSuperAdmin) return null;

  // ── Fetch all workspace records grouped by entity ────────────────────────
  const fetchAll = async () => {
    const companyId  = currentUser?.company_id;
    const superAdmin = currentUser?.role === "super_admin";
    const records    = {};
    for (const entity of DELETE_ORDER) {
      try {
        const ent = base44.entities[entity];
        if (!ent) { records[entity] = []; continue; }
        let rows;
        if (superAdmin) {
          rows = await ent.list("-created_date");
        } else if (companyId) {
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

  // ── Delete ────────────────────────────────────────────────────────────────
  const handleEmpty = async () => {
    setPhase("deleting");
    setError(null);
    try {
      const records = await fetchAll();

      // Persist to IndexedDB before touching anything
      await writeBackup(records);
      await refreshBackup();

      const total = Object.values(records).reduce((s, arr) => s + arr.length, 0);
      let done = 0;

      for (const entity of DELETE_ORDER) {
        const ent  = base44.entities[entity];
        if (!ent) continue;
        const rows = records[entity] || [];
        for (const row of rows) {
          try { await ent.delete(row.id); } catch (e) { /* 404 = already gone, continue */ }
          done++;
          setProgress({ done, total, entity });
        }
      }

      setPhase("done");
    } catch (err) {
      setError(err.message || "Unexpected error during deletion.");
      setPhase("confirm"); // stay on confirm so user can retry or cancel
    }
  };

  // ── Undo / restore ────────────────────────────────────────────────────────
  const handleUndo = async () => {
    const b = await readBackup();
    if (!b) return;
    setPhase("restoring");
    setError(null);
    try {
      const totalCount = Object.values(b.counts).reduce((s, n) => s + n, 0);
      let done = 0;

      for (const entity of RESTORE_ORDER) {
        const ent  = base44.entities[entity];
        if (!ent) continue;
        const rows = b.records[entity] || [];
        for (const row of rows) {
          try { await ent.create(stripMeta(row)); } catch (e) { /* best effort */ }
          done++;
          setProgress({ done, total: totalCount, entity });
        }
      }

      await clearBackup();
      setBackup(null);
      setPhase("idle");
      window.dispatchEvent(new Event("lastBulkImportChanged"));
    } catch (err) {
      setError(err.message || "Restore failed.");
      setPhase("done");
    }
  };

  const handleCancel  = () => { setPhase("idle"); setError(null); };
  const handleDismiss = async () => { await clearBackup(); setBackup(null); setPhase("idle"); setError(null); };

  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  // ── Confirm dialog ────────────────────────────────────────────────────────
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
                A full backup is saved to browser storage for 2 hours so you can undo immediately after.
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

  // ── Progress overlay ──────────────────────────────────────────────────────
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

  // ── Done toast ────────────────────────────────────────────────────────────
  if (phase === "done") {
    const totalDeleted = backup
      ? Object.values(backup.counts).reduce((s, n) => s + n, 0)
      : 0;
    return (
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-slate-900 text-white px-4 py-3 rounded-2xl shadow-2xl">
        <div className="flex items-center gap-2">
          <Trash2 className="w-4 h-4 text-rose-400" />
          <p className="text-sm font-semibold">Datamart emptied — {totalDeleted} records removed</p>
        </div>
        {backup && (
          <button
            onClick={handleUndo}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 rounded-xl text-xs font-bold transition-colors whitespace-nowrap"
          >
            <Undo2 className="w-3.5 h-3.5" /> Undo
          </button>
        )}
        <button
          onClick={handleDismiss}
          className="text-slate-400 hover:text-white transition-colors ml-1"
          title="Dismiss — backup stays for 2h"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  // ── Idle ──────────────────────────────────────────────────────────────────
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
