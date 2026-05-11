// ==============================================================
// Newsconseen OS — Mobile Field Shell (Phase 6)
// ==============================================================
// Standalone full-screen PWA shell for field agents.
// No Layout wrapper — renders its own bottom tab navigation.
//
// Tabs:
//   Today   — today's tasks, quick-complete with outcome note
//   Log     — ad-hoc task / visit entry
//   Scan    — barcode / QR code scanner (camera)
//   Sync    — offline queue status + manual sync trigger
//
// PWA: registered via /sw.js, installable, works offline.
// Offline writes queue to IndexedDB, flush on reconnect.
// ==============================================================

import React, { useState, useEffect, useRef, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import dataService from "@/services/dataService";
import { format, isToday, parseISO } from "date-fns";
import {
  CheckCircle2, Clock, Plus, RefreshCw, Wifi, WifiOff,
  ChevronRight, AlertCircle, Download, X, Camera,
  ClipboardList, Layers, Zap, MapPin, User, LogOut,
  CheckSquare, MoreHorizontal, Send, Package,
} from "lucide-react";
import { usePWA } from "@/hooks/usePWA";

const RAILWAY_URL = "https://newsconseenwebapp-production.up.railway.app";
const RAILWAY_API_KEY = (import.meta["env"] || {})["VITE_RAILWAY_API_KEY"] || "";
const triggerETL = (entity) =>
  fetch(`${RAILWAY_URL}/load/${entity}-summary`, {
    method: "POST",
    headers: RAILWAY_API_KEY ? { "x-api-key": RAILWAY_API_KEY } : {},
  }).catch(() => {});

// ── Offline queue helpers (mirrors sw.js IndexedDB logic) ─────────────────────
const OFFLINE_DB   = "newsconseen-offline";
const OFFLINE_STORE = "pending-requests";

function openOfflineDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(OFFLINE_DB, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(OFFLINE_STORE, { keyPath: "id", autoIncrement: true });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

async function getOfflineQueue() {
  try {
    const db = await openOfflineDB();
    return new Promise((resolve) => {
      const tx  = db.transaction(OFFLINE_STORE, "readonly");
      const req = tx.objectStore(OFFLINE_STORE).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror   = () => resolve([]);
    });
  } catch { return []; }
}

async function clearOfflineItem(id) {
  try {
    const db = await openOfflineDB();
    return new Promise((resolve) => {
      const tx = db.transaction(OFFLINE_STORE, "readwrite");
      tx.objectStore(OFFLINE_STORE).delete(id);
      tx.oncomplete = resolve;
    });
  } catch {}
}

async function addToOfflineQueue(url, method, body) {
  try {
    const db = await openOfflineDB();
    return new Promise((resolve, reject) => {
      const tx    = db.transaction(OFFLINE_STORE, "readwrite");
      const store = tx.objectStore(OFFLINE_STORE);
      store.add({ url, method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), timestamp: Date.now() });
      tx.oncomplete = resolve;
      tx.onerror    = reject;
    });
  } catch {}
}

// ── Priority badge ─────────────────────────────────────────────────────────────
const PRIORITY_STYLE = {
  urgent: { dot: "bg-rose-500",   text: "text-rose-700",  bg: "bg-rose-50",   label: "Urgent" },
  high:   { dot: "bg-amber-400",  text: "text-amber-700", bg: "bg-amber-50",  label: "High" },
  normal: { dot: "bg-blue-400",   text: "text-blue-700",  bg: "bg-blue-50",   label: "Normal" },
  low:    { dot: "bg-slate-300",  text: "text-slate-500", bg: "bg-slate-50",  label: "Low" },
};

// ── Online/offline pill ────────────────────────────────────────────────────────
function OnlinePill({ isOnline, queueCount }) {
  return (
    <div className={`flex items-center gap-1.5 text-[11px] font-semibold px-2 py-1 rounded-full max-w-[128px] overflow-hidden whitespace-nowrap ${
      isOnline ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
    }`}>
      {isOnline ? <Wifi className="w-3 h-3 shrink-0" /> : <WifiOff className="w-3 h-3 shrink-0" />}
      {isOnline ? "Online" : `Offline${queueCount > 0 ? ` · ${queueCount} queued` : ""}`}
    </div>
  );
}

// ── Task card ─────────────────────────────────────────────────────────────────
function TaskCard({ task, onComplete, completing }) {
  const p = PRIORITY_STYLE[task.priority] || PRIORITY_STYLE.normal;
  const overdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== "completed";

  return (
    <div className={`bg-white rounded-2xl border p-4 flex items-start gap-3 shadow-sm active:scale-[0.99] transition-transform ${
      overdue ? "border-rose-200" : "border-slate-200"
    }`}>
      <button
        onClick={() => onComplete(task)}
        disabled={completing === task.id || task.status === "completed"}
        className={`mt-0.5 w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
          task.status === "completed"
            ? "bg-emerald-500 border-emerald-500"
            : completing === task.id
            ? "border-emerald-400 animate-pulse"
            : "border-slate-300 hover:border-emerald-500"
        }`}
      >
        {(task.status === "completed" || completing === task.id) && (
          <CheckCircle2 className="w-3.5 h-3.5 text-white" />
        )}
      </button>

      <div className="flex-1 min-w-0">
        <p className={`text-sm font-semibold leading-snug ${
          task.status === "completed" ? "line-through text-slate-400" : "text-slate-800"
        }`}>{task.title}</p>
        {task.description && (
          <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{task.description}</p>
        )}
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${p.bg} ${p.text}`}>
            {p.label}
          </span>
          {task.due_date && (
            <span className={`text-[10px] flex items-center gap-1 ${overdue ? "text-rose-600 font-semibold" : "text-slate-400"}`}>
              <Clock className="w-3 h-3" />
              {overdue ? "Overdue · " : ""}{format(parseISO(task.due_date), "d MMM")}
            </span>
          )}
          {task.task_type && (
            <span className="text-[10px] text-slate-400">{task.task_type}</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Complete task sheet ────────────────────────────────────────────────────────
function CompleteSheet({ task, user, onClose, onDone, isOnline }) {
  const qc = useQueryClient();
  const [outcome, setOutcome] = useState("completed");
  const [notes,   setNotes]   = useState("");
  const [saving,  setSaving]  = useState(false);

  const submit = async () => {
    setSaving(true);
    const payload = { ...task, status: "completed", outcome, notes };
    try {
      if (isOnline) {
        await dataService.updateRecord("task", task.id, { status: "completed", outcome, outcome_notes: notes }, user, { queryClient: qc });
      } else {
        await addToOfflineQueue(`/api/entities/Task/${task.id}`, "PATCH", payload);
      }
      onDone(task.id);
    } catch {
      await addToOfflineQueue(`/api/entities/Task/${task.id}`, "PATCH", payload);
      onDone(task.id);
    } finally {
      setSaving(false);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white rounded-t-3xl p-6 shadow-2xl">
        <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-5" />
        <p className="text-base font-bold text-slate-800 mb-1">Complete Task</p>
        <p className="text-sm text-slate-500 mb-5 line-clamp-2">{task.title}</p>

        <div className="space-y-4">
          <div>
            <p className="text-xs font-bold text-slate-600 mb-2">Outcome</p>
            <div className="grid grid-cols-2 gap-2">
              {["completed", "partially_completed", "cancelled", "rescheduled"].map(o => (
                <button
                  key={o}
                  onClick={() => setOutcome(o)}
                  className={`text-xs py-2.5 px-3 rounded-xl font-semibold border transition-all ${
                    outcome === o
                      ? "bg-emerald-500 text-white border-emerald-500"
                      : "bg-slate-50 text-slate-600 border-slate-200"
                  }`}
                >
                  {o.replace(/_/g, " ")}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-bold text-slate-600 mb-2">Notes (optional)</p>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              placeholder="Add field notes, observations, or follow-up actions…"
              className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
            />
          </div>

          <button
            onClick={submit}
            disabled={saving}
            className="w-full py-3.5 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold rounded-2xl flex items-center justify-center gap-2 transition-colors disabled:opacity-60"
          >
            {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            {saving ? "Saving…" : isOnline ? "Mark Complete" : "Save Offline"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Tab: Today ─────────────────────────────────────────────────────────────────
function TodayTab({ user, isOnline }) {
  const [tasks,      setTasks]      = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [completing, setCompleting] = useState(null);
  const [sheet,      setSheet]      = useState(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const all = await base44.entities.Task.filter({ assigned_to: user.email });
      setTasks(all.filter(t => t.status !== "completed" && t.status !== "cancelled"));
    } catch {
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }, [user?.email]);

  useEffect(() => { load(); }, [load]);

  const handleComplete = (task) => setSheet(task);

  const handleDone = (taskId) => {
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: "completed" } : t));
  };

  const todayTasks   = tasks.filter(t => t.due_date && isToday(parseISO(t.due_date)));
  const upcomingTasks = tasks.filter(t => !t.due_date || !isToday(parseISO(t.due_date)));
  const overdueCount  = tasks.filter(t => t.due_date && new Date(t.due_date) < new Date()).length;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-slate-400">
        <RefreshCw className="w-6 h-6 animate-spin" />
        <p className="text-sm">Loading your tasks…</p>
      </div>
    );
  }

  return (
    <>
      {/* Summary bar */}
      <div className="grid grid-cols-3 gap-2 mb-5">
        {[
          { label: "Due Today",  value: todayTasks.length,   color: "text-blue-600",    bg: "bg-blue-50" },
          { label: "Overdue",    value: overdueCount,         color: "text-rose-600",    bg: "bg-rose-50" },
          { label: "Upcoming",   value: upcomingTasks.length, color: "text-slate-600",   bg: "bg-slate-50" },
        ].map(s => (
          <div key={s.label} className={`rounded-2xl p-3 ${s.bg}`}>
            <p className={`text-xl font-black ${s.color}`}>{s.value}</p>
            <p className="text-[10px] text-slate-500 font-semibold mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {tasks.length === 0 ? (
        <div className="flex flex-col items-center py-12 gap-3 text-center">
          <CheckCircle2 className="w-12 h-12 text-emerald-300" />
          <p className="font-semibold text-slate-600">All clear!</p>
          <p className="text-xs text-slate-400">No open tasks assigned to you.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {todayTasks.length > 0 && (
            <div>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Due Today</p>
              <div className="space-y-2">
                {todayTasks.map(t => (
                  <TaskCard key={t.id} task={t} onComplete={handleComplete} completing={completing} />
                ))}
              </div>
            </div>
          )}
          {upcomingTasks.length > 0 && (
            <div>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Upcoming</p>
              <div className="space-y-2">
                {upcomingTasks.slice(0, 10).map(t => (
                  <TaskCard key={t.id} task={t} onComplete={handleComplete} completing={completing} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {sheet && (
        <CompleteSheet
          task={sheet}
          user={user}
          isOnline={isOnline}
          onClose={() => setSheet(null)}
          onDone={handleDone}
        />
      )}
    </>
  );
}

// ── Tab: Quick Log ─────────────────────────────────────────────────────────────
function LogTab({ user, isOnline }) {
  const qc = useQueryClient();
  const [form,   setForm]   = useState({ title: "", task_type: "visit", priority: "normal", notes: "" });
  const [saving, setSaving] = useState(false);
  const [done,   setDone]   = useState(false);

  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  const submit = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    const payload = {
      title:      form.title.trim(),
      task_type:  form.task_type,
      priority:   form.priority,
      notes:      form.notes,
      status:     "completed",
      outcome:    "completed",
      assigned_to: user?.email,
      company_id:  user?.company_id,
      due_date:    format(new Date(), "yyyy-MM-dd"),
    };
    try {
      if (isOnline) {
        await dataService.createRecord("task", payload, user, { queryClient: qc });
      } else {
        await addToOfflineQueue("/api/entities/Task", "POST", payload);
      }
      setDone(true);
      setTimeout(() => {
        setDone(false);
        setForm({ title: "", task_type: "visit", priority: "normal", notes: "" });
      }, 2000);
    } catch {
      await addToOfflineQueue("/api/entities/Task", "POST", payload);
      setDone(true);
      setTimeout(() => setDone(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  if (done) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4 text-center">
        <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center">
          <CheckCircle2 className="w-8 h-8 text-emerald-500" />
        </div>
        <p className="font-bold text-slate-800">Logged{isOnline ? "" : " offline"}!</p>
        <p className="text-xs text-slate-400">Will sync when{isOnline ? "" : " back online"}.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm font-bold text-slate-700">Log a Field Activity</p>

      <div>
        <label className="text-xs font-bold text-slate-600 mb-1.5 block">Activity Title *</label>
        <input
          type="text"
          value={form.title}
          onChange={e => set("title", e.target.value)}
          placeholder="e.g. Client visit — Nairobi branch"
          className="w-full text-sm border border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-bold text-slate-600 mb-1.5 block">Type</label>
          <select
            value={form.task_type}
            onChange={e => set("task_type", e.target.value)}
            className="w-full text-sm border border-slate-200 rounded-xl px-3 py-3 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            {["visit", "delivery", "inspection", "maintenance", "meeting", "training", "other"].map(t => (
              <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-bold text-slate-600 mb-1.5 block">Priority</label>
          <select
            value={form.priority}
            onChange={e => set("priority", e.target.value)}
            className="w-full text-sm border border-slate-200 rounded-xl px-3 py-3 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            {["urgent", "high", "normal", "low"].map(p => (
              <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="text-xs font-bold text-slate-600 mb-1.5 block">Field Notes</label>
        <textarea
          value={form.notes}
          onChange={e => set("notes", e.target.value)}
          rows={4}
          placeholder="Observations, outcomes, follow-up actions…"
          className="w-full text-sm border border-slate-200 rounded-xl px-4 py-3 resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
      </div>

      <button
        onClick={submit}
        disabled={saving || !form.title.trim()}
        className="w-full py-4 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold rounded-2xl flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
      >
        {saving
          ? <RefreshCw className="w-4 h-4 animate-spin" />
          : isOnline ? <Send className="w-4 h-4" /> : <Zap className="w-4 h-4" />}
        {saving ? "Saving…" : isOnline ? "Submit" : "Save Offline"}
      </button>

      {!isOnline && (
        <p className="text-center text-xs text-amber-600 flex items-center justify-center gap-1.5">
          <WifiOff className="w-3.5 h-3.5" />
          Offline — entry will sync when you reconnect
        </p>
      )}
    </div>
  );
}

// ── Tab: Sync ─────────────────────────────────────────────────────────────────
function SyncTab({ isOnline }) {
  const [queue,   setQueue]   = useState([]);
  const [flushing, setFlushing] = useState(false);
  const [flushed,  setFlushed]  = useState(0);

  const reload = useCallback(async () => {
    setQueue(await getOfflineQueue());
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const flush = async () => {
    setFlushing(true);
    let done = 0;
    for (const item of queue) {
      try {
        const res = await fetch(item.url, {
          method:  item.method,
          headers: item.headers,
          body:    item.body || undefined,
        });
        if (res.ok) {
          await clearOfflineItem(item.id);
          done++;
        }
      } catch { /* keep in queue */ }
    }
    setFlushed(done);
    await reload();
    setFlushing(false);
  };

  return (
    <div className="space-y-4">
      {/* Status card */}
      <div className={`rounded-2xl p-5 ${isOnline ? "bg-emerald-50 border border-emerald-200" : "bg-rose-50 border border-rose-200"}`}>
        <div className="flex items-center gap-3 mb-2">
          {isOnline
            ? <Wifi className="w-5 h-5 text-emerald-600" />
            : <WifiOff className="w-5 h-5 text-rose-600" />}
          <p className={`font-bold text-sm ${isOnline ? "text-emerald-800" : "text-rose-800"}`}>
            {isOnline ? "Connected" : "Offline Mode"}
          </p>
        </div>
        <p className={`text-xs ${isOnline ? "text-emerald-600" : "text-rose-600"}`}>
          {isOnline
            ? "All data syncs immediately. Background sync active."
            : "Entries are saved locally and will sync automatically when you reconnect."}
        </p>
      </div>

      {/* Queue */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-bold text-slate-600 uppercase tracking-wider">
            Offline Queue ({queue.length})
          </p>
          <button onClick={reload} className="text-slate-400 hover:text-slate-600">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {queue.length === 0 ? (
          <div className="flex flex-col items-center py-8 gap-2 text-center text-slate-400">
            <CheckCircle2 className="w-8 h-8 text-emerald-300" />
            <p className="text-sm font-medium text-slate-600">Queue is empty</p>
            <p className="text-xs">All entries have been synced.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {queue.map(item => (
              <div key={item.id} className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-slate-700 truncate">
                    {item.method} {item.url.split("/").pop()}
                  </p>
                  <p className="text-[10px] text-slate-400">
                    {new Date(item.timestamp).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {queue.length > 0 && isOnline && (
        <button
          onClick={flush}
          disabled={flushing}
          className="w-full py-3.5 bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-bold rounded-2xl flex items-center justify-center gap-2 transition-colors disabled:opacity-60"
        >
          {flushing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          {flushing ? "Syncing…" : `Sync ${queue.length} item${queue.length > 1 ? "s" : ""} now`}
        </button>
      )}

      {flushed > 0 && (
        <p className="text-center text-xs text-emerald-600 font-semibold">
          ✓ {flushed} item{flushed > 1 ? "s" : ""} synced successfully
        </p>
      )}
    </div>
  );
}

// ── Install banner ─────────────────────────────────────────────────────────────
function InstallBanner({ installPrompt, isInstalled, onDismiss }) {
  if (isInstalled || !installPrompt) return null;
  return (
    <div className="mx-4 mb-3 bg-indigo-600 rounded-2xl px-4 py-3 flex items-center gap-3 shadow-lg">
      <Download className="w-5 h-5 text-white shrink-0" />
      <div className="flex-1">
        <p className="text-white text-xs font-bold">Install Newsconseen</p>
        <p className="text-indigo-200 text-[10px]">Add to home screen for offline access</p>
      </div>
      <button
        onClick={async () => {
          installPrompt.prompt();
          await installPrompt.userChoice;
          onDismiss();
        }}
        className="bg-white text-indigo-700 text-xs font-bold px-3 py-1.5 rounded-lg shrink-0"
      >
        Install
      </button>
      <button onClick={onDismiss} className="text-indigo-300 hover:text-white shrink-0">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

// ── Bottom tab bar ─────────────────────────────────────────────────────────────
const TABS = [
  { id: "today", label: "Today",   icon: CheckSquare },
  { id: "log",   label: "Log",     icon: Plus        },
  { id: "sync",  label: "Sync",    icon: RefreshCw   },
];

// ── Main Mobile shell ──────────────────────────────────────────────────────────
export default function Mobile() {
  const { data: user = null } = useQuery({
    queryKey: ["currentUser"],
    queryFn: () => base44.auth.me(),
    staleTime: 0,
    refetchOnMount: "always",
  });
  const [activeTab,    setActiveTab]    = useState("today");
  const [queueCount,   setQueueCount]   = useState(0);
  const [installDismissed, setInstallDismissed] = useState(
    () => !!localStorage.getItem("mobile_install_dismissed")
  );

  const { isOnline, installPrompt, isInstalled } = usePWA();

  // Poll offline queue count
  useEffect(() => {
    const refresh = async () => setQueueCount((await getOfflineQueue()).length);
    refresh();
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  }, []);

  // Auto-flush queue when coming back online
  useEffect(() => {
    if (isOnline && "serviceWorker" in navigator) {
      navigator.serviceWorker.ready
        .then(r => r.sync?.register("newsconseen-sync").catch(() => {}))
        .catch(() => {});
    }
  }, [isOnline]);

  const dismissInstall = () => {
    localStorage.setItem("mobile_install_dismissed", "1");
    setInstallDismissed(true);
  };

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  };

  return (
    <div className="flex flex-col h-[100dvh] bg-slate-50 overflow-hidden">
      {/* Status bar area */}
      <div className="shrink-0 bg-white border-b border-slate-100 safe-top">
        {/* Header */}
        <div className="px-4 pt-4 pb-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] text-slate-400 font-medium">{greeting()},</p>
            <p className="text-base font-black text-slate-800 leading-tight truncate">
              {user?.full_name?.split(" ")[0] || user?.email?.split("@")[0] || "Field Agent"}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <OnlinePill isOnline={isOnline} queueCount={queueCount} />
            {queueCount > 0 && (
              <button
                onClick={() => setActiveTab("sync")}
                className="relative w-8 h-8 bg-amber-100 rounded-full flex items-center justify-center"
              >
                <RefreshCw className="w-4 h-4 text-amber-600" />
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-amber-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                  {queueCount}
                </span>
              </button>
            )}
          </div>
        </div>

        {/* Today date strip */}
        <div className="px-4 pb-3">
          <p className="text-xs text-slate-400">
            {format(new Date(), "EEEE, d MMMM yyyy")}
          </p>
        </div>
      </div>

      {/* Install banner */}
      {!installDismissed && (
        <InstallBanner
          installPrompt={installPrompt}
          isInstalled={isInstalled}
          onDismiss={dismissInstall}
        />
      )}

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto px-3 sm:px-4 py-4">
        {activeTab === "today" && <TodayTab user={user} isOnline={isOnline} />}
        {activeTab === "log"   && <LogTab   user={user} isOnline={isOnline} />}
        {activeTab === "sync"  && <SyncTab  isOnline={isOnline} />}
      </div>

      {/* Bottom tab bar */}
      <div className="shrink-0 bg-white border-t border-slate-100 safe-bottom">
        <div className="flex items-center gap-1 px-2 py-2">
          {TABS.map(tab => {
            const Icon    = tab.icon;
            const isActive = activeTab === tab.id;
            const hasBadge = tab.id === "sync" && queueCount > 0;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 min-w-0 flex flex-col items-center gap-1 py-1.5 px-2 rounded-2xl transition-all relative ${
                  isActive ? "bg-emerald-50" : ""
                }`}
              >
                <Icon className={`w-5 h-5 ${isActive ? "text-emerald-600" : "text-slate-400"}`} />
                <span className={`text-[10px] font-semibold ${isActive ? "text-emerald-600" : "text-slate-400"}`}>
                  {tab.label}
                </span>
                {hasBadge && (
                  <span className="absolute top-1 right-3 w-4 h-4 bg-amber-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                    {queueCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
