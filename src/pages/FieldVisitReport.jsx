import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { createRecord } from "@/services/dataService";
import { createOpportunity } from "@/services/intelligenceService";
import { ChevronLeft, MapPin, CheckCircle2, AlertCircle, TrendingUp } from "lucide-react";
import { format } from "date-fns";

const VISIT_TYPES = ["Client Check-in", "Assessment", "Delivery", "Training", "Inspection", "Follow-up", "Sales Visit", "Other"];
const OUTCOMES    = ["Positive", "Neutral", "Needs Follow-up", "Escalation Required"];

const OUT_STYLE = {
  "Positive":             { bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500" },
  "Neutral":              { bg: "bg-slate-50",   text: "text-slate-600",   dot: "bg-slate-400"   },
  "Needs Follow-up":      { bg: "bg-amber-50",   text: "text-amber-700",   dot: "bg-amber-400"   },
  "Escalation Required":  { bg: "bg-rose-50",    text: "text-rose-700",    dot: "bg-rose-500"    },
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
const EMPTY = {
  visit_type: "Client Check-in", visit_date: today(),
  client_name: "", enterprise_name: "", location: "",
  objectives: "", outcomes_summary: "", outcome: "Neutral",
  next_steps: "", follow_up_date: "",
};

export default function FieldVisitReport() {
  const qc = useQueryClient();
  const { data: currentUser = null } = useQuery({
    queryKey: ["currentUser"], queryFn: () => base44.auth.me(),
    staleTime: 0, refetchOnMount: "always",
  });

  const { data: reports = [], isLoading } = useQuery({
    queryKey: ["field-visit-reports", currentUser?.company_id],
    queryFn: () => base44.entities.Task.filter(
      { company_id: currentUser.company_id, task_type: "field_visit" }, "-created_date", 100,
    ),
    enabled: !!currentUser?.company_id,
    staleTime: 0, refetchOnMount: "always",
  });

  const { data: people = [] } = useQuery({
    queryKey: ["people-clients", currentUser?.company_id],
    queryFn:  () => base44.entities.Person.filter({ company_id: currentUser.company_id, person_type: "client" }, "first_name", 200),
    enabled:  !!currentUser?.company_id,
    staleTime: 60_000,
  });

  const { data: enterprises = [] } = useQuery({
    queryKey: ["enterprises-app", currentUser?.company_id],
    queryFn:  () => base44.entities.Enterprise.filter({ company_id: currentUser.company_id, operating_status: "open" }, "enterprise_name", 200),
    enabled:  !!currentUser?.company_id,
    staleTime: 60_000,
  });

  const [tab,    setTab]    = useState("new");
  const [form,   setForm]   = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [toast,  setToast]  = useState(null);

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const showToast = (msg, ok) => { setToast({ msg, ok }); setTimeout(() => setToast(null), 3500); };

  const handleSubmit = async () => {
    if (!form.outcomes_summary) { showToast("Outcomes summary is required", false); return; }
    setSaving(true);
    try {
      const task = await createRecord("task", {
        task_type:      "field_visit",
        title:          `${form.visit_type} — ${form.client_name || form.enterprise_name || form.location}`,
        status:         "completed",
        outcome:        form.outcome.toLowerCase().replace(/ /g, "_"),
        priority:       form.outcome === "Escalation Required" ? "high" : "medium",
        scheduled_date: form.visit_date,
        enterprise:     form.enterprise_name || null,
        outcome_notes:  [
          `Type: ${form.visit_type}`,
          `Outcome: ${form.outcome}`,
          form.client_name && `Client: ${form.client_name}`,
          form.enterprise_name && `Enterprise: ${form.enterprise_name}`,
          form.location && `Location: ${form.location}`,
          form.objectives && `Objectives: ${form.objectives}`,
          `Summary: ${form.outcomes_summary}`,
          form.next_steps && `Next steps: ${form.next_steps}`,
          form.follow_up_date && `Follow-up date: ${form.follow_up_date}`,
        ].filter(Boolean).join(" | "),
        assigned_to_email: currentUser.email,
        assigned_to_name:  currentUser.full_name || currentUser.email,
      }, currentUser, { queryClient: qc });

      if (form.outcome === "Positive") {
        createOpportunity({
          title:       `Opportunity from visit: ${form.client_name || form.enterprise_name}`,
          description: form.outcomes_summary,
          subject_type: "Task",
          subject_id:   task?.id || currentUser.company_id,
          source:       "fieldvisitreport",
        }, currentUser).catch(() => {});
      }

      setForm(EMPTY);
      showToast("Visit report submitted!", true);
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
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">📝 Field Visit Report</p>
          <p className="text-sm font-semibold text-slate-700 leading-tight">{currentUser?.full_name || currentUser?.email}</p>
        </div>
      </div>

      <div className="bg-white border-b border-slate-100 px-4">
        <div className="flex gap-0">
          {[{ key: "new", label: "New Report" }, { key: "history", label: `My Reports (${reports.filter(r => r.assigned_to_email === currentUser?.email).length})` }].map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} className={`px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${tab === t.key ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-400 hover:text-slate-600"}`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-md mx-auto px-4 py-6 space-y-4">

        {tab === "new" && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">

            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Visit Type</label>
              <div className="flex flex-wrap gap-2">
                {VISIT_TYPES.map(vt => (
                  <button key={vt} onClick={() => set("visit_type", vt)} className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${form.visit_type === vt ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-slate-600 border-slate-200 hover:border-indigo-300"}`}>
                    {vt}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Visit Date</label>
              <input type="date" value={form.visit_date} onChange={e => set("visit_date", e.target.value)} className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-400" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Client / Beneficiary</label>
                {people.length > 0 ? (
                  <select value={form.client_name} onChange={e => set("client_name", e.target.value)} className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white">
                    <option value="">— Select —</option>
                    {people.map(p => <option key={p.id} value={`${p.first_name} ${p.last_name}`.trim()}>{`${p.first_name} ${p.last_name}`.trim()}</option>)}
                  </select>
                ) : (
                  <input type="text" value={form.client_name} onChange={e => set("client_name", e.target.value)} placeholder="Client name" className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                )}
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Enterprise / Site</label>
                {enterprises.length > 0 ? (
                  <select value={form.enterprise_name} onChange={e => set("enterprise_name", e.target.value)} className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white">
                    <option value="">— Select —</option>
                    {enterprises.map(e => <option key={e.id} value={e.enterprise_name}>{e.enterprise_name}</option>)}
                  </select>
                ) : (
                  <input type="text" value={form.enterprise_name} onChange={e => set("enterprise_name", e.target.value)} placeholder="Enterprise / site" className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                )}
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Location / Address</label>
              <input type="text" value={form.location} onChange={e => set("location", e.target.value)} placeholder="Physical address or area" className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-400" />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Objectives</label>
              <input type="text" value={form.objectives} onChange={e => set("objectives", e.target.value)} placeholder="What was the goal of this visit?" className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-400" />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Outcome *</label>
              <div className="grid grid-cols-2 gap-2">
                {OUTCOMES.map(o => {
                  const st = OUT_STYLE[o];
                  return (
                    <button key={o} onClick={() => set("outcome", o)} className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all ${form.outcome === o ? `${st.bg} ${st.text} ring-2 ring-offset-1 ring-current` : "bg-white text-slate-500 border-slate-200"}`}>
                      {o}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Outcomes Summary *</label>
              <textarea value={form.outcomes_summary} onChange={e => set("outcomes_summary", e.target.value)} rows={4} placeholder="What happened? Key observations, decisions made…" className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Next Steps</label>
                <input type="text" value={form.next_steps} onChange={e => set("next_steps", e.target.value)} placeholder="Actions to take" className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Follow-up Date</label>
                <input type="date" value={form.follow_up_date} onChange={e => set("follow_up_date", e.target.value)} className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              </div>
            </div>

            {form.outcome === "Positive" && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-700">
                <TrendingUp className="w-4 h-4 shrink-0" />
                Positive visits create an opportunity in the Intelligence Inbox.
              </div>
            )}

            <button onClick={handleSubmit} disabled={saving || !form.outcomes_summary} className="w-full py-3.5 rounded-xl bg-indigo-600 text-white font-bold text-sm hover:bg-indigo-700 active:scale-95 transition-all disabled:opacity-40">
              {saving ? "Submitting…" : "Submit Report"}
            </button>
          </div>
        )}

        {tab === "history" && (
          <div className="space-y-3">
            {isLoading && <p className="text-sm text-slate-400 text-center py-8">Loading…</p>}
            {!isLoading && reports.filter(r => r.assigned_to_email === currentUser?.email).length === 0 && (
              <div className="text-center py-12 text-slate-400">
                <MapPin className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No field visit reports yet</p>
              </div>
            )}
            {reports.filter(r => r.assigned_to_email === currentUser?.email).map(r => {
              const lines = (r.outcome_notes || "").split(" | ");
              const out   = lines.find(l => l.startsWith("Outcome:"))?.replace("Outcome: ", "") || "Neutral";
              const st    = OUT_STYLE[out] || OUT_STYLE["Neutral"];
              return (
                <div key={r.id} className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-slate-800 truncate">{r.title}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{r.scheduled_date}</p>
                    </div>
                    <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${st.bg} ${st.text}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
                      {out}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-2 line-clamp-2">
                    {lines.find(l => l.startsWith("Summary:"))?.replace("Summary: ", "") || ""}
                  </p>
                  {lines.find(l => l.startsWith("Next steps:")) && (
                    <p className="text-[10px] text-indigo-600 mt-1 font-medium">
                      → {lines.find(l => l.startsWith("Next steps:"))?.replace("Next steps: ", "")}
                    </p>
                  )}
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
