import React, { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import {
  Bell, AlertCircle, FileText, Package, ChevronRight, X,
  Zap, CheckCircle2, ScrollText, GitBranch,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { getAttentionSignals } from "@/utils/attentionSignals";

const RAILWAY_URL = "https://newsconseenwebapp-production.up.railway.app";
const RAILWAY_API_KEY = import.meta.env.VITE_RAILWAY_API_KEY || "";

function timeAgo(iso) {
  try { return formatDistanceToNow(new Date(iso), { addSuffix: true }); }
  catch { return ""; }
}

const SIGNAL_ICONS = {
  "overdue-tasks":    { icon: AlertCircle, iconColor: "text-rose-500",   bg: "bg-rose-50" },
  "overdue-invoices": { icon: FileText,    iconColor: "text-rose-600",   bg: "bg-rose-50" },
  "draft-tx":         { icon: FileText,    iconColor: "text-amber-600", bg: "bg-amber-50" },
  "low-stock":        { icon: Package,     iconColor: "text-orange-600", bg: "bg-orange-50" },
};

function buildLocalNotifs(tasks, transactions, products) {
  return getAttentionSignals(tasks, transactions, products).map(s => ({
    ...s,
    ...(SIGNAL_ICONS[s.id] || { icon: AlertCircle, iconColor: "text-slate-500", bg: "bg-slate-50" }),
  }));
}

export default function NotificationsBell({ tasks = [], transactions = [], products = [], currentUser }) {
  const [open,    setOpen]    = useState(false);
  const [read,    setRead]    = useState(false);
  const [wfRuns,  setWfRuns]  = useState([]);
  const [audits,  setAudits]  = useState([]);
  const ref = useRef(null);

  const companyId = currentUser?.company_id;

  // Fetch live workflow + audit events
  useEffect(() => {
    if (!companyId) return;

    fetch(`${RAILWAY_URL}/workflows/runs?company_id=${companyId}&limit=5`, {
      headers: RAILWAY_API_KEY ? { "x-api-key": RAILWAY_API_KEY } : {},
    })
      .then(r => r.ok ? r.json() : { runs: [] })
      .then(d => setWfRuns(d.runs || []))
      .catch(() => {});

    fetch(`${RAILWAY_URL}/audit/log?company_id=${companyId}&limit=5`, {
      headers: RAILWAY_API_KEY ? { "x-api-key": RAILWAY_API_KEY } : {},
    })
      .then(r => r.ok ? r.json() : { entries: [] })
      .then(d => setAudits(d.entries || []))
      .catch(() => {});
  }, [companyId]);

  useEffect(() => {
    const handleClick = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const localNotifs = buildLocalNotifs(tasks, transactions, products);

  // Workflow error notifications
  const wfErrors = wfRuns.filter(r => r.status === "error" || r.status === "completed_with_errors");
  const wfOk     = wfRuns.filter(r => r.status === "completed");

  const totalCount = localNotifs.length + wfErrors.length;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => { setOpen(v => !v); setRead(true); }}
        className="relative p-2 rounded-xl hover:bg-slate-100 transition-colors"
        title="Notifications (Ctrl+K for command palette)"
      >
        <Bell className="w-5 h-5 text-slate-500" />
        {!read && totalCount > 0 && (
          <span className="absolute top-1 right-1 w-4 h-4 bg-rose-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
            {totalCount > 9 ? "9+" : totalCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-88 bg-white rounded-2xl border border-slate-200 shadow-xl z-50 overflow-hidden" style={{ width: 340 }}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <h3 className="text-sm font-bold text-slate-800">Notifications</h3>
            <div className="flex items-center gap-2">
              <button
                onClick={() => window.dispatchEvent(new Event("open-command-palette"))}
                className="text-[10px] text-indigo-500 font-semibold hover:text-indigo-700 px-2 py-1 rounded-lg hover:bg-indigo-50 transition-colors"
                title="Open Command Palette"
              >
                ⌘K
              </button>
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="divide-y divide-slate-50 max-h-96 overflow-y-auto">
            {/* ── Local operational alerts ── */}
            {localNotifs.map(n => {
              const Icon = n.icon;
              return (
                <Link key={n.id} to={createPageUrl(n.page)} onClick={() => setOpen(false)}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors">
                  <div className={`w-8 h-8 rounded-xl ${n.bg} flex items-center justify-center shrink-0`}>
                    <Icon className={`w-4 h-4 ${n.iconColor}`} />
                  </div>
                  <p className="text-sm text-slate-700 flex-1 leading-snug">{n.label}</p>
                  <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
                </Link>
              );
            })}

            {/* ── Workflow error notifications ── */}
            {wfErrors.map((r, i) => (
              <Link key={`wf-err-${i}`} to={createPageUrl("Workflows")} onClick={() => setOpen(false)}
                className="flex items-center gap-3 px-4 py-3 hover:bg-rose-50 transition-colors">
                <div className="w-8 h-8 rounded-xl bg-rose-50 flex items-center justify-center shrink-0">
                  <GitBranch className="w-4 h-4 text-rose-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-700 truncate">Workflow error: {r.workflow_name}</p>
                  <p className="text-[10px] text-slate-400">{timeAgo(r.started_at)}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
              </Link>
            ))}

            {/* ── All clear ── */}
            {localNotifs.length === 0 && wfErrors.length === 0 && (
              <div className="px-4 py-5 text-center text-xs text-slate-400">
                <CheckCircle2 className="w-6 h-6 mx-auto mb-2 text-emerald-400" />
                All clear — no alerts right now
              </div>
            )}

            {/* ── Recent workflow runs ── */}
            {wfOk.length > 0 && (
              <div className="px-4 pt-3 pb-1">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1">
                  <Zap className="w-3 h-3" /> Recent automations
                </p>
                {wfOk.slice(0, 3).map((r, i) => (
                  <div key={i} className="flex items-center gap-2 py-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                    <p className="text-xs text-slate-600 truncate flex-1">{r.workflow_name}</p>
                    <span className="text-[10px] text-slate-400 shrink-0">{timeAgo(r.started_at)}</span>
                  </div>
                ))}
              </div>
            )}

            {/* ── Recent audit events ── */}
            {audits.length > 0 && (
              <div className="px-4 pt-3 pb-2">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1">
                  <ScrollText className="w-3 h-3" /> Recent changes
                </p>
                {audits.slice(0, 3).map((a, i) => (
                  <div key={i} className="flex items-center gap-2 py-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                      a.action === "created" ? "bg-emerald-400" :
                      a.action === "deleted"  ? "bg-rose-400"    : "bg-blue-400"
                    }`} />
                    <p className="text-xs text-slate-600 truncate flex-1">
                      {a.entity_name || a.entity_id} <span className="text-slate-400">{a.action}</span>
                    </p>
                    <span className="text-[10px] text-slate-400 shrink-0">{timeAgo(a.timestamp)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer links */}
          <div className="px-4 py-2.5 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400">
            <Link to={createPageUrl("Workflows")} onClick={() => setOpen(false)} className="hover:text-indigo-600 flex items-center gap-1">
              <GitBranch className="w-3 h-3" /> Workflows
            </Link>
            <Link to={`${createPageUrl("Settings")}#audit`} onClick={() => setOpen(false)} className="hover:text-indigo-600 flex items-center gap-1">
              <ScrollText className="w-3 h-3" /> Audit Trail
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
