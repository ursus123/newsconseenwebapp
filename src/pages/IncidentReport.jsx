import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { createRecord } from "@/services/dataService";
import { createRisk } from "@/services/intelligenceService";
import { ChevronLeft, AlertTriangle, CheckCircle2, AlertCircle } from "lucide-react";
import { format } from "date-fns";

const INCIDENT_TYPES = ["Fall / Trip", "Near Miss", "Injury", "Complaint", "Medication Error", "Equipment Failure", "Aggression", "Property Damage", "Fire / Hazard", "Other"];
const SEVERITIES     = ["Minor", "Moderate", "Serious", "Critical"];

const SEV_STYLE = {
  Minor:    { bg: "bg-slate-50",   text: "text-slate-600",   border: "border-slate-200"  },
  Moderate: { bg: "bg-amber-50",   text: "text-amber-700",   border: "border-amber-200"  },
  Serious:  { bg: "bg-orange-50",  text: "text-orange-700",  border: "border-orange-200" },
  Critical: { bg: "bg-rose-50",    text: "text-rose-700",    border: "border-rose-200"   },
};

function Toast({ msg, ok, onDismiss }) {
  return (
    <div onClick={onDismiss} className={`fixed bottom-8 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-6 py-4 rounded-2xl shadow-2xl text-white font-bold text-sm cursor-pointer ${ok ? "bg-emerald-600" : "bg-rose-600"}`}>
      {ok ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
      {msg}
    </div>
  );
}

const today = () => new Date().toISOString().slice(0, 10);
const nowTime = () => new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

const EMPTY = {
  incident_type: "Fall / Trip", severity: "Minor",
  date: today(), time: nowTime(),
  location: "", persons_involved: "", witnesses: "",
  description: "", immediate_action: "",
};

export default function IncidentReport() {
  const qc = useQueryClient();
  const { data: currentUser = null } = useQuery({
    queryKey: ["currentUser"], queryFn: () => base44.auth.me(),
    staleTime: 0, refetchOnMount: "always",
  });

  const { data: reports = [], isLoading } = useQuery({
    queryKey: ["incident-reports", currentUser?.company_id],
    queryFn: () => base44.entities.Task.filter(
      { company_id: currentUser.company_id, task_type: "incident_report" }, "-created_date", 100,
    ),
    enabled: !!currentUser?.company_id,
    staleTime: 0, refetchOnMount: "always",
  });

  const [tab,    setTab]    = useState("new");
  const [form,   setForm]   = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [toast,  setToast]  = useState(null);

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const showToast = (msg, ok) => { setToast({ msg, ok }); setTimeout(() => setToast(null), 3500); };

  const handleSubmit = async () => {
    if (!form.description) { showToast("Description is required", false); return; }
    if (!form.location)    { showToast("Location is required", false); return; }
    setSaving(true);
    try {
      const task = await createRecord("task", {
        task_type:      "incident_report",
        title:          `${form.incident_type} — ${form.location}`,
        status:         "completed",
        outcome:        "reported",
        priority:       form.severity === "Critical" ? "urgent" : form.severity === "Serious" ? "high" : "medium",
        scheduled_date: form.date,
        scheduled_time: form.time,
        outcome_notes:  [
          `Type: ${form.incident_type}`,
          `Severity: ${form.severity}`,
          `Location: ${form.location}`,
          form.persons_involved && `Persons involved: ${form.persons_involved}`,
          form.witnesses && `Witnesses: ${form.witnesses}`,
          `Description: ${form.description}`,
          form.immediate_action && `Immediate action: ${form.immediate_action}`,
        ].filter(Boolean).join(" | "),
        assigned_to_email: currentUser.email,
        assigned_to_name:  currentUser.full_name || currentUser.email,
      }, currentUser, { queryClient: qc });

      if (form.severity === "Serious" || form.severity === "Critical") {
        createRisk({
          subject_type: "Task",
          subject_id:   task?.id || currentUser.company_id,
          subject_name: `${form.incident_type} at ${form.location}`,
          category:     "operational",
          severity:     form.severity === "Critical" ? "high" : "medium",
          likelihood:   "certain",
          title:        `${form.severity} incident: ${form.incident_type} at ${form.location}`,
          description:  form.description,
          source:       "incidentreport",
        }, currentUser).catch(() => {});
      }

      setForm(EMPTY);
      showToast("Incident report submitted!", true);
      setTab("history");
    } catch {
      showToast("Failed to submit — try again", false);
    }
    setSaving(false);
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white border-b border-slate-100 px-4 py-3 flex items-center gap-3">
        <Link to={createPageUrl("Applications")} className="p-2 -ml-2 rounded-lg text-slate-400 hover:bg-slate-100">
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">🚨 Incident Report</p>
          <p className="text-sm font-semibold text-slate-700 leading-tight">Log accidents, near-misses, and complaints</p>
        </div>
      </div>

      <div className="bg-white border-b border-slate-100 px-4">
        <div className="flex gap-0">
          {[{ key: "new", label: "New Report" }, { key: "history", label: `Reports (${reports.length})` }].map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} className={`px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${tab === t.key ? "border-red-600 text-red-700" : "border-transparent text-slate-400 hover:text-slate-600"}`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-md mx-auto px-4 py-6 space-y-4">

        {tab === "new" && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">

            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Incident Type</label>
              <div className="flex flex-wrap gap-2">
                {INCIDENT_TYPES.map(it => (
                  <button key={it} onClick={() => set("incident_type", it)} className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${form.incident_type === it ? "bg-red-600 text-white border-red-600" : "bg-white text-slate-600 border-slate-200 hover:border-red-300"}`}>
                    {it}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Severity</label>
              <div className="grid grid-cols-4 gap-2">
                {SEVERITIES.map(s => {
                  const st = SEV_STYLE[s];
                  return (
                    <button key={s} onClick={() => set("severity", s)} className={`py-2 rounded-xl text-xs font-bold border transition-all ${form.severity === s ? `${st.bg} ${st.text} ${st.border} ring-2 ring-offset-1` : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"}`}>
                      {s}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Date</label>
                <input type="date" value={form.date} onChange={e => set("date", e.target.value)} className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-red-400" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Time</label>
                <input type="time" value={form.time} onChange={e => set("time", e.target.value)} className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-red-400" />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Location *</label>
              <input type="text" value={form.location} onChange={e => set("location", e.target.value)} placeholder="Where did it happen?" className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-red-400" />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Persons Involved</label>
              <input type="text" value={form.persons_involved} onChange={e => set("persons_involved", e.target.value)} placeholder="Names of anyone involved" className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-red-400" />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Description *</label>
              <textarea value={form.description} onChange={e => set("description", e.target.value)} rows={4} placeholder="Describe what happened in detail…" className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-red-400 resize-none" />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Immediate Action Taken</label>
              <textarea value={form.immediate_action} onChange={e => set("immediate_action", e.target.value)} rows={2} placeholder="First aid, called 999, isolated area…" className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-red-400 resize-none" />
            </div>

            {(form.severity === "Serious" || form.severity === "Critical") && (
              <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                This will create an automatic risk alert in the Intelligence Inbox.
              </div>
            )}

            <button onClick={handleSubmit} disabled={saving || !form.description || !form.location} className="w-full py-3.5 rounded-xl bg-red-600 text-white font-bold text-sm hover:bg-red-700 active:scale-95 transition-all disabled:opacity-40">
              {saving ? "Submitting…" : "Submit Incident Report"}
            </button>
          </div>
        )}

        {tab === "history" && (
          <div className="space-y-3">
            {isLoading && <p className="text-sm text-slate-400 text-center py-8">Loading…</p>}
            {!isLoading && reports.length === 0 && (
              <div className="text-center py-12 text-slate-400">
                <AlertTriangle className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No incident reports yet</p>
              </div>
            )}
            {reports.map(r => {
              const lines = (r.outcome_notes || "").split(" | ");
              const sev   = lines.find(l => l.startsWith("Severity:"))?.replace("Severity: ", "") || "Minor";
              const st    = SEV_STYLE[sev] || SEV_STYLE.Minor;
              return (
                <div key={r.id} className={`bg-white rounded-2xl border p-4 shadow-sm ${st.border}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-bold text-slate-800">{r.title}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{r.scheduled_date} · {r.scheduled_time}</p>
                    </div>
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${st.bg} ${st.text}`}>{sev}</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-2 line-clamp-2">
                    {lines.find(l => l.startsWith("Description:"))?.replace("Description: ", "") || ""}
                  </p>
                  <p className="text-[10px] text-slate-300 mt-1">Reported by {r.assigned_to_name || r.assigned_to_email}</p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {toast && <Toast msg={toast.msg} ok={toast.ok} onDismiss={() => setToast(null)} />}
    </div>
  );
}
