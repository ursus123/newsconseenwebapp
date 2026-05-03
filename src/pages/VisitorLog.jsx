import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { createRecord } from "@/services/dataService";
import { ChevronLeft, Users, CheckCircle2, AlertCircle, LogIn, LogOut, Clock } from "lucide-react";
import { format } from "date-fns";

const PURPOSES = ["Meeting", "Delivery", "Interview", "Inspection", "Maintenance", "Personal Visit", "Contractor", "Other"];

function Toast({ msg, ok, onDismiss }) {
  return (
    <div onClick={onDismiss} className={`fixed bottom-8 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-6 py-4 rounded-2xl shadow-2xl text-white font-bold text-sm cursor-pointer ${ok ? "bg-emerald-600" : "bg-rose-600"}`}>
      {ok ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
      {msg}
    </div>
  );
}

const EMPTY = {
  visitor_name: "", visitor_company: "", host_name: "", purpose: "Meeting",
  badge_number: "", notes: "",
};

export default function VisitorLog() {
  const qc = useQueryClient();
  const { data: currentUser = null } = useQuery({
    queryKey: ["currentUser"], queryFn: () => base44.auth.me(),
    staleTime: 0, refetchOnMount: "always",
  });

  const todayStr = new Date().toISOString().slice(0, 10);

  const { data: visits = [], isLoading } = useQuery({
    queryKey: ["visitor-log", currentUser?.company_id],
    queryFn: () => base44.entities.Task.filter(
      { company_id: currentUser.company_id, task_type: "visitor_log" }, "-created_date", 200,
    ),
    enabled: !!currentUser?.company_id,
    staleTime: 0, refetchOnMount: "always",
  });

  const [tab,    setTab]    = useState("sign_in");
  const [form,   setForm]   = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [toast,  setToast]  = useState(null);

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const showToast = (msg, ok) => { setToast({ msg, ok }); setTimeout(() => setToast(null), 3000); };

  const nowStr = () => new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

  const handleSignIn = async () => {
    if (!form.visitor_name) { showToast("Visitor name is required", false); return; }
    setSaving(true);
    try {
      await createRecord("task", {
        task_type:      "visitor_log",
        title:          `Visitor: ${form.visitor_name}`,
        status:         "in_progress",
        outcome:        "signed_in",
        outcome_notes:  [
          `Purpose: ${form.purpose}`,
          form.visitor_company && `Company: ${form.visitor_company}`,
          form.host_name && `Host: ${form.host_name}`,
          form.badge_number && `Badge: ${form.badge_number}`,
          form.notes && `Notes: ${form.notes}`,
        ].filter(Boolean).join(" | "),
        scheduled_date: todayStr,
        scheduled_time: nowStr(),
        enterprise:     form.visitor_company || null,
      }, currentUser, { queryClient: qc });
      setForm(EMPTY);
      showToast(`${form.visitor_name} signed in ✓`, true);
      setTab("today");
    } catch {
      showToast("Failed — try again", false);
    }
    setSaving(false);
  };

  const handleSignOut = async (visit) => {
    try {
      await base44.entities.Task.update(visit.id, {
        status:  "completed",
        outcome: "signed_out",
        outcome_notes: (visit.outcome_notes || "") + ` | Signed out: ${nowStr()}`,
        due_date: todayStr,
      });
      qc.invalidateQueries({ queryKey: ["visitor-log"] });
      showToast("Signed out ✓", true);
    } catch {
      showToast("Sign out failed", false);
    }
  };

  const todayVisits = visits.filter(v => v.scheduled_date === todayStr);
  const active      = todayVisits.filter(v => v.outcome === "signed_in");
  const signeOut    = todayVisits.filter(v => v.outcome === "signed_out");

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white border-b border-slate-100 px-4 py-3 flex items-center gap-3">
        <Link to={createPageUrl("Applications")} className="p-2 -ml-2 rounded-lg text-slate-400 hover:bg-slate-100">
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">🪪 Visitor Log</p>
          <p className="text-sm font-semibold text-slate-700 leading-tight">
            {active.length > 0 ? `${active.length} visitor${active.length !== 1 ? "s" : ""} on site` : "No visitors on site"}
          </p>
        </div>
        {active.length > 0 && (
          <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            {active.length} in
          </span>
        )}
      </div>

      <div className="bg-white border-b border-slate-100 px-4">
        <div className="flex gap-0">
          {[{ key: "sign_in", label: "Sign In" }, { key: "today", label: `Today (${todayVisits.length})` }, { key: "history", label: "History" }].map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} className={`px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${tab === t.key ? "border-purple-600 text-purple-700" : "border-transparent text-slate-400 hover:text-slate-600"}`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-md mx-auto px-4 py-6 space-y-4">

        {tab === "sign_in" && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
            <p className="text-sm font-bold text-slate-700">Sign In Visitor</p>

            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Visitor Name *</label>
              <input type="text" value={form.visitor_name} onChange={e => set("visitor_name", e.target.value)} placeholder="Full name" className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-purple-400" />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Company / Organisation</label>
              <input type="text" value={form.visitor_company} onChange={e => set("visitor_company", e.target.value)} placeholder="Optional" className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-purple-400" />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Host / Person Visiting</label>
              <input type="text" value={form.host_name} onChange={e => set("host_name", e.target.value)} placeholder="Who are they here to see?" className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-purple-400" />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Purpose</label>
              <div className="flex flex-wrap gap-2">
                {PURPOSES.map(p => (
                  <button key={p} onClick={() => set("purpose", p)} className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${form.purpose === p ? "bg-purple-600 text-white border-purple-600" : "bg-white text-slate-600 border-slate-200 hover:border-purple-300"}`}>
                    {p}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Badge #</label>
                <input type="text" value={form.badge_number} onChange={e => set("badge_number", e.target.value)} placeholder="Optional" className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-purple-400" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Sign-in Time</label>
                <div className="px-3 py-2.5 rounded-xl border border-slate-100 bg-slate-50 text-sm text-slate-500 flex items-center gap-2">
                  <Clock className="w-4 h-4" /> Now
                </div>
              </div>
            </div>

            <button onClick={handleSignIn} disabled={saving || !form.visitor_name} className="w-full py-3.5 rounded-xl bg-purple-600 text-white font-bold text-sm hover:bg-purple-700 active:scale-95 transition-all disabled:opacity-40 flex items-center justify-center gap-2">
              <LogIn className="w-4 h-4" />
              {saving ? "Signing in…" : "Sign In"}
            </button>
          </div>
        )}

        {tab === "today" && (
          <div className="space-y-3">
            {active.length > 0 && (
              <>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Currently On Site</p>
                {active.map(v => (
                  <div key={v.id} className="bg-white rounded-2xl border border-emerald-200 p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-bold text-slate-800">{v.title?.replace("Visitor: ", "")}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{v.outcome_notes?.split(" | ")[0] || ""}</p>
                        <p className="text-xs text-slate-400">In at {v.scheduled_time}</p>
                      </div>
                      <button onClick={() => handleSignOut(v)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 text-white text-xs font-bold hover:bg-slate-900 transition-colors shrink-0">
                        <LogOut className="w-3.5 h-3.5" /> Out
                      </button>
                    </div>
                  </div>
                ))}
              </>
            )}

            {signeOut.length > 0 && (
              <>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1 mt-4">Signed Out Today</p>
                {signeOut.map(v => (
                  <div key={v.id} className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm opacity-70">
                    <p className="text-sm font-semibold text-slate-700">{v.title?.replace("Visitor: ", "")}</p>
                    <p className="text-xs text-slate-400">{v.outcome_notes?.split(" | ")[0] || ""}</p>
                  </div>
                ))}
              </>
            )}

            {todayVisits.length === 0 && !isLoading && (
              <div className="text-center py-12 text-slate-400">
                <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No visitors today</p>
              </div>
            )}
          </div>
        )}

        {tab === "history" && (
          <div className="space-y-2">
            {isLoading && <p className="text-sm text-slate-400 text-center py-8">Loading…</p>}
            {!isLoading && visits.length === 0 && (
              <div className="text-center py-12 text-slate-400">
                <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No visitor history yet</p>
              </div>
            )}
            {visits.map(v => (
              <div key={v.id} className="bg-white rounded-xl border border-slate-200 px-4 py-3 flex items-center gap-3">
                <div className={`w-2 h-2 rounded-full shrink-0 ${v.outcome === "signed_in" ? "bg-emerald-500" : "bg-slate-300"}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-700 truncate">{v.title?.replace("Visitor: ", "")}</p>
                  <p className="text-[10px] text-slate-400">{v.scheduled_date} · {v.outcome_notes?.split(" | ")[0] || ""}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {toast && <Toast msg={toast.msg} ok={toast.ok} onDismiss={() => setToast(null)} />}
    </div>
  );
}
