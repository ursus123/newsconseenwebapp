import React, { useState, useMemo } from "react";
import { ncClient } from "@/api/ncClient";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import dataService from "@/services/dataService";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { createRecord } from "@/services/dataService";
import { createRisk } from "@/services/intelligenceService";
import { ChevronLeft, FolderOpen, CheckCircle2, AlertCircle, AlertTriangle, Clock } from "lucide-react";
import { format, differenceInCalendarDays } from "date-fns";

const DOC_TYPES = ["License", "Certificate", "Insurance", "Contract", "Permit", "Registration", "Policy", "Other"];

const URGENCY_STYLE = {
  expired: { bg: "bg-rose-100",   text: "text-rose-700",   border: "border-rose-300",   label: "Expired"     },
  urgent:  { bg: "bg-red-50",     text: "text-red-700",    border: "border-red-200",    label: "< 7 days"    },
  warning: { bg: "bg-amber-50",   text: "text-amber-700",  border: "border-amber-200",  label: "< 30 days"   },
  soon:    { bg: "bg-yellow-50",  text: "text-yellow-700", border: "border-yellow-200", label: "< 60 days"   },
  ok:      { bg: "bg-slate-50",   text: "text-slate-600",  border: "border-slate-200",  label: "OK"          },
};

function urgency(expiryDate) {
  if (!expiryDate) return "ok";
  const days = differenceInCalendarDays(new Date(expiryDate), new Date());
  if (days < 0)  return "expired";
  if (days < 7)  return "urgent";
  if (days < 30) return "warning";
  if (days < 60) return "soon";
  return "ok";
}

function daysLabel(expiryDate) {
  if (!expiryDate) return "";
  const days = differenceInCalendarDays(new Date(expiryDate), new Date());
  if (days < 0)  return `${Math.abs(days)}d overdue`;
  if (days === 0) return "Expires today";
  if (days === 1) return "1 day left";
  return `${days} days left`;
}

function Toast({ msg, ok, onDismiss }) {
  return (
    <div onClick={onDismiss} className={`fixed bottom-8 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-6 py-4 rounded-2xl shadow-2xl text-white font-bold text-sm cursor-pointer ${ok ? "bg-emerald-600" : "bg-rose-600"}`}>
      {ok ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
      {msg}
    </div>
  );
}

const EMPTY = { doc_name: "", doc_type: "License", entity: "", expiry_date: "", reminder_days: "30", notes: "" };

export default function DocumentExpiry() {
  const qc = useQueryClient();
  const { data: currentUser = null } = useQuery({
    queryKey: ["currentUser"], queryFn: () => ncClient.auth.me(),
    staleTime: 0, refetchOnMount: "always",
  });

  const { data: docs = [], isLoading } = useQuery({
    queryKey: ["document-expiry", currentUser?.company_id],
    queryFn: () => ncClient.entities.Task.filter(
      { company_id: currentUser.company_id, task_type: "document_expiry" }, "due_date", 200,
    ),
    enabled: !!currentUser?.company_id,
    staleTime: 0, refetchOnMount: "always",
  });

  const [tab,    setTab]    = useState("dashboard");
  const [form,   setForm]   = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [toast,  setToast]  = useState(null);

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const showToast = (msg, ok) => { setToast({ msg, ok }); setTimeout(() => setToast(null), 3500); };

  const handleSubmit = async () => {
    if (!form.doc_name)    { showToast("Document name is required", false); return; }
    if (!form.expiry_date) { showToast("Expiry date is required", false); return; }
    setSaving(true);
    try {
      const u = urgency(form.expiry_date);
      const task = await createRecord("task", {
        task_type:      "document_expiry",
        title:          `${form.doc_type}: ${form.doc_name}`,
        status:         u === "expired" ? "overdue" : "pending",
        outcome:        "tracked",
        priority:       u === "expired" || u === "urgent" ? "high" : u === "warning" ? "medium" : "low",
        scheduled_date: form.expiry_date,
        due_date:       form.expiry_date,
        enterprise:     form.entity || null,
        outcome_notes:  [
          `Type: ${form.doc_type}`,
          `Expiry: ${form.expiry_date}`,
          form.entity && `Entity: ${form.entity}`,
          form.notes && `Notes: ${form.notes}`,
          `Reminder: ${form.reminder_days} days before`,
        ].filter(Boolean).join(" | "),
      }, currentUser, { queryClient: qc });

      if (u === "expired" || u === "urgent" || u === "warning") {
        createRisk({
          subject_type: "Enterprise",
          subject_id:   form.entity || currentUser.company_id,
          subject_name: form.entity || form.doc_name,
          category:     "compliance",
          severity:     u === "expired" ? "high" : "medium",
          likelihood:   "certain",
          title:        `${u === "expired" ? "Expired" : "Expiring soon"}: ${form.doc_type} — ${form.doc_name}`,
          source:       "documentexpiry",
        }, currentUser).catch(() => {});
      }

      setForm(EMPTY);
      showToast("Document tracked!", true);
      setTab("dashboard");
    } catch {
      showToast("Failed — try again", false);
    }
    setSaving(false);
  };

  const handleRenew = async (doc) => {
    try {
      await dataService.updateRecord("task", doc.id, { status: "completed", outcome: "renewed" }, currentUser, { queryClient: qc });
      qc.invalidateQueries({ queryKey: ["document-expiry"] });
      showToast("Marked as renewed ✓", true);
    } catch {
      showToast("Action failed", false);
    }
  };

  const active = docs.filter(d => d.outcome !== "renewed");
  const sorted = useMemo(() => [...active].sort((a, b) => {
    const ua = urgency(a.due_date);
    const ub = urgency(b.due_date);
    const ORDER = ["expired", "urgent", "warning", "soon", "ok"];
    return ORDER.indexOf(ua) - ORDER.indexOf(ub);
  }), [active]);

  const counts = useMemo(() => ({
    expired: sorted.filter(d => urgency(d.due_date) === "expired").length,
    urgent:  sorted.filter(d => urgency(d.due_date) === "urgent").length,
    warning: sorted.filter(d => urgency(d.due_date) === "warning").length,
  }), [sorted]);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white border-b border-slate-100 px-4 py-3 flex items-center gap-3">
        <Link to={createPageUrl("Applications")} className="p-2 -ml-2 rounded-lg text-slate-400 hover:bg-slate-100">
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">📁 Document Expiry</p>
          <p className="text-sm font-semibold text-slate-700 leading-tight">
            {counts.expired > 0 ? `${counts.expired} expired · ` : ""}{counts.urgent + counts.warning} expiring soon
          </p>
        </div>
      </div>

      <div className="bg-white border-b border-slate-100 px-4">
        <div className="flex gap-0">
          {[{ key: "dashboard", label: `Tracker (${active.length})` }, { key: "add", label: "Add Document" }].map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} className={`px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${tab === t.key ? "border-red-600 text-red-700" : "border-transparent text-slate-400 hover:text-slate-600"}`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-md mx-auto px-4 py-6 space-y-4">

        {tab === "dashboard" && (
          <>
            {/* Summary cards */}
            {(counts.expired > 0 || counts.urgent > 0 || counts.warning > 0) && (
              <div className="grid grid-cols-3 gap-2">
                {[
                  { key: "expired", label: "Expired",   count: counts.expired, ...URGENCY_STYLE.expired },
                  { key: "urgent",  label: "< 7 days",  count: counts.urgent,  ...URGENCY_STYLE.urgent  },
                  { key: "warning", label: "< 30 days", count: counts.warning, ...URGENCY_STYLE.warning  },
                ].map(c => (
                  <div key={c.key} className={`rounded-2xl border p-3 text-center ${c.bg} ${c.border}`}>
                    <p className={`text-2xl font-black ${c.text}`}>{c.count}</p>
                    <p className={`text-[10px] font-bold ${c.text}`}>{c.label}</p>
                  </div>
                ))}
              </div>
            )}

            {isLoading && <p className="text-sm text-slate-400 text-center py-8">Loading…</p>}

            {!isLoading && sorted.length === 0 && (
              <div className="text-center py-12 text-slate-400">
                <FolderOpen className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No documents tracked yet</p>
                <button onClick={() => setTab("add")} className="mt-3 text-xs text-red-600 font-semibold hover:underline">Add your first document →</button>
              </div>
            )}

            <div className="space-y-2">
              {sorted.map(d => {
                const lines = (d.outcome_notes || "").split(" | ");
                const u     = urgency(d.due_date);
                const st    = URGENCY_STYLE[u];
                const type  = lines.find(l => l.startsWith("Type:"))?.replace("Type: ", "") || "";
                return (
                  <div key={d.id} className={`bg-white rounded-2xl border p-4 shadow-sm ${st.border}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-bold text-slate-800 truncate">{d.title?.replace(`${type}: `, "")}</p>
                          <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold shrink-0 ${st.bg} ${st.text}`}>{type}</span>
                        </div>
                        <p className={`text-xs font-semibold mt-0.5 ${st.text}`}>{daysLabel(d.due_date)}</p>
                        <p className="text-[10px] text-slate-400">{d.due_date ? format(new Date(d.due_date), "dd MMM yyyy") : ""}</p>
                      </div>
                      <div className="shrink-0 flex flex-col items-end gap-1">
                        {(u === "expired" || u === "urgent") && (
                          <AlertTriangle className={`w-4 h-4 ${u === "expired" ? "text-rose-500" : "text-red-500"}`} />
                        )}
                        <button onClick={() => handleRenew(d)} className="text-[10px] text-slate-400 hover:text-emerald-600 font-semibold transition-colors">Mark renewed</button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {tab === "add" && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
            <p className="text-sm font-bold text-slate-700">Track a Document</p>

            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Document Name *</label>
              <input type="text" value={form.doc_name} onChange={e => set("doc_name", e.target.value)} placeholder="e.g. Public Liability Insurance" className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-red-400" />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Document Type</label>
              <div className="flex flex-wrap gap-2">
                {DOC_TYPES.map(dt => (
                  <button key={dt} onClick={() => set("doc_type", dt)} className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${form.doc_type === dt ? "bg-red-600 text-white border-red-600" : "bg-white text-slate-600 border-slate-200 hover:border-red-300"}`}>
                    {dt}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Expiry Date *</label>
                <input type="date" value={form.expiry_date} onChange={e => set("expiry_date", e.target.value)} className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-red-400" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Remind Before (days)</label>
                <select value={form.reminder_days} onChange={e => set("reminder_days", e.target.value)} className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-red-400 bg-white">
                  {["7", "14", "30", "60", "90"].map(d => <option key={d} value={d}>{d} days</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Entity / Business</label>
              <input type="text" value={form.entity} onChange={e => set("entity", e.target.value)} placeholder="Which entity does this belong to?" className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-red-400" />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Notes</label>
              <textarea value={form.notes} onChange={e => set("notes", e.target.value)} rows={2} placeholder="Renewal process, contact person…" className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-red-400 resize-none" />
            </div>

            {form.expiry_date && (() => {
              const u  = urgency(form.expiry_date);
              const st = URGENCY_STYLE[u];
              if (u === "ok") return null;
              return (
                <div className={`flex items-center gap-2 p-3 rounded-xl border text-xs font-semibold ${st.bg} ${st.text} ${st.border}`}>
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  {daysLabel(form.expiry_date)} — {u === "expired" || u === "urgent" ? "a risk alert will be created" : "this will appear in the warning list"}
                </div>
              );
            })()}

            <button onClick={handleSubmit} disabled={saving || !form.doc_name || !form.expiry_date} className="w-full py-3.5 rounded-xl bg-red-600 text-white font-bold text-sm hover:bg-red-700 active:scale-95 transition-all disabled:opacity-40">
              {saving ? "Saving…" : "Track Document"}
            </button>
          </div>
        )}
      </div>

      {toast && <Toast msg={toast.msg} ok={toast.ok} onDismiss={() => setToast(null)} />}
    </div>
  );
}
