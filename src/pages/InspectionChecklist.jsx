import React, { useState, useMemo } from "react";
import { ncClient } from "@/api/ncClient";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { createRecord } from "@/services/dataService";
import { createRisk } from "@/services/intelligenceService";
import { ChevronLeft, ClipboardCheck, CheckCircle2, AlertCircle, X, Minus } from "lucide-react";
import { format } from "date-fns";

const INSPECTION_TYPES = ["Daily", "Weekly", "Monthly", "Ad Hoc", "Pre-Opening", "Post-Incident"];

const DEFAULT_ITEMS = [
  "Emergency exits clear and accessible",
  "Fire extinguishers present and in date",
  "First aid kit fully stocked",
  "Floors clean and free of hazards",
  "Equipment in safe working order",
  "Personal protective equipment available",
  "Hand hygiene facilities adequate",
  "Incident log book up to date",
];

const ITEM_STATES = ["pass", "fail", "na"];
const ITEM_STYLE = {
  pass: { bg: "bg-emerald-500", ring: "ring-emerald-500", label: "✓" },
  fail: { bg: "bg-rose-500",    ring: "ring-rose-500",    label: "✗" },
  na:   { bg: "bg-slate-300",   ring: "ring-slate-300",   label: "—" },
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

export default function InspectionChecklist() {
  const qc = useQueryClient();
  const { data: currentUser = null } = useQuery({
    queryKey: ["currentUser"], queryFn: () => ncClient.auth.me(),
    staleTime: 0, refetchOnMount: "always",
  });

  const { data: inspections = [], isLoading } = useQuery({
    queryKey: ["inspections", currentUser?.company_id],
    queryFn: () => ncClient.entities.Task.filter(
      { company_id: currentUser.company_id, task_type: "inspection" }, "-created_date", 100,
    ),
    enabled: !!currentUser?.company_id,
    staleTime: 0, refetchOnMount: "always",
  });

  const { data: enterprises = [] } = useQuery({
    queryKey: ["enterprises-app", currentUser?.company_id],
    queryFn:  () => ncClient.entities.Enterprise.filter({ company_id: currentUser.company_id }, "enterprise_name", 200),
    enabled:  !!currentUser?.company_id,
    staleTime: 60_000,
  });

  const [tab,       setTab]       = useState("checklist");
  const [type,      setType]      = useState("Daily");
  const [location,  setLocation]  = useState("");
  const [date,      setDate]      = useState(today());
  const [items,     setItems]     = useState(DEFAULT_ITEMS.map(label => ({ label, state: "pass" })));
  const [newItem,   setNewItem]   = useState("");
  const [saving,    setSaving]    = useState(false);
  const [toast,     setToast]     = useState(null);

  const showToast = (msg, ok) => { setToast({ msg, ok }); setTimeout(() => setToast(null), 3500); };

  const cycleState = (i) => {
    setItems(prev => prev.map((it, idx) => {
      if (idx !== i) return it;
      const nextIdx = (ITEM_STATES.indexOf(it.state) + 1) % ITEM_STATES.length;
      return { ...it, state: ITEM_STATES[nextIdx] };
    }));
  };

  const addItem = () => {
    if (!newItem.trim()) return;
    setItems(prev => [...prev, { label: newItem.trim(), state: "pass" }]);
    setNewItem("");
  };

  const removeItem = (i) => setItems(prev => prev.filter((_, idx) => idx !== i));

  const { passCount, failCount, naCount, score } = useMemo(() => {
    const p = items.filter(it => it.state === "pass").length;
    const f = items.filter(it => it.state === "fail").length;
    const n = items.filter(it => it.state === "na").length;
    const applicable = items.length - n;
    return { passCount: p, failCount: f, naCount: n, score: applicable > 0 ? Math.round((p / applicable) * 100) : 100 };
  }, [items]);

  const handleSubmit = async () => {
    if (!location) { showToast("Location is required", false); return; }
    setSaving(true);
    try {
      const failedItems = items.filter(it => it.state === "fail").map(it => it.label);
      const task = await createRecord("task", {
        task_type:      "inspection",
        title:          `${type} Inspection — ${location}`,
        status:         "completed",
        outcome:        failCount === 0 ? "passed" : "failed",
        priority:       failCount > 3 ? "high" : failCount > 0 ? "medium" : "low",
        scheduled_date: date,
        enterprise:     location,
        outcome_notes:  [
          `Type: ${type}`,
          `Location: ${location}`,
          `Score: ${score}%`,
          `Pass: ${passCount}, Fail: ${failCount}, N/A: ${naCount}`,
          failedItems.length > 0 && `Failed items: ${failedItems.join("; ")}`,
        ].filter(Boolean).join(" | "),
        assigned_to_email: currentUser.email,
        assigned_to_name:  currentUser.full_name || currentUser.email,
      }, currentUser, { queryClient: qc });

      if (failedItems.length > 0) {
        createRisk({
          subject_type: "Enterprise",
          subject_id:   task?.enterprise || currentUser.company_id,
          subject_name: location,
          category:     "compliance",
          severity:     failCount > 3 ? "high" : "medium",
          likelihood:   "certain",
          title:        `${failCount} failed inspection item${failCount !== 1 ? "s" : ""} at ${location}`,
          description:  failedItems.join(", "),
          source:       "inspectionchecklist",
        }, currentUser).catch(() => {});
      }

      setItems(DEFAULT_ITEMS.map(label => ({ label, state: "pass" })));
      setLocation(""); setDate(today());
      showToast("Inspection submitted!", true);
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
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">✅ Inspection Checklist</p>
          <p className="text-sm font-semibold text-slate-700 leading-tight">Facility inspection with sign-off</p>
        </div>
      </div>

      <div className="bg-white border-b border-slate-100 px-4">
        <div className="flex gap-0">
          {[{ key: "checklist", label: "Checklist" }, { key: "history", label: `History (${inspections.length})` }].map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} className={`px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${tab === t.key ? "border-emerald-600 text-emerald-700" : "border-transparent text-slate-400 hover:text-slate-600"}`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-md mx-auto px-4 py-6 space-y-4">

        {tab === "checklist" && (
          <>
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Inspection Type</label>
                <div className="flex flex-wrap gap-2">
                  {INSPECTION_TYPES.map(t => (
                    <button key={t} onClick={() => setType(t)} className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${type === t ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-slate-600 border-slate-200 hover:border-emerald-300"}`}>
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Location *</label>
                  {enterprises.length > 0 ? (
                    <select value={location} onChange={e => setLocation(e.target.value)} className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white">
                      <option value="">— Select —</option>
                      {enterprises.map(e => <option key={e.id} value={e.enterprise_name}>{e.enterprise_name}</option>)}
                    </select>
                  ) : (
                    <input type="text" value={location} onChange={e => setLocation(e.target.value)} placeholder="Area / facility" className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                  )}
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Date</label>
                  <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                </div>
              </div>
            </div>

            {/* Score bar */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-5 py-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Score</p>
                <p className={`text-2xl font-black ${score === 100 ? "text-emerald-600" : score >= 80 ? "text-amber-600" : "text-rose-600"}`}>{score}%</p>
              </div>
              <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all ${score === 100 ? "bg-emerald-500" : score >= 80 ? "bg-amber-400" : "bg-rose-500"}`} style={{ width: `${score}%` }} />
              </div>
              <div className="flex gap-4 mt-2 text-[11px] text-slate-400">
                <span className="text-emerald-600 font-bold">{passCount} pass</span>
                <span className="text-rose-600 font-bold">{failCount} fail</span>
                <span className="text-slate-400">{naCount} N/A</span>
              </div>
            </div>

            {/* Items */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-2">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Items</p>
              {items.map((it, i) => {
                const st = ITEM_STYLE[it.state];
                return (
                  <div key={i} className="flex items-center gap-3 py-1.5 border-b border-slate-50 last:border-0">
                    <button
                      onClick={() => cycleState(i)}
                      className={`w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-black shrink-0 ring-2 ring-offset-1 ${st.bg} ${st.ring} transition-all`}
                    >
                      {st.label}
                    </button>
                    <span className={`flex-1 text-sm ${it.state === "fail" ? "text-rose-700 font-semibold" : it.state === "na" ? "text-slate-400 line-through" : "text-slate-700"}`}>
                      {it.label}
                    </span>
                    <button onClick={() => removeItem(i)} className="p-1 text-slate-300 hover:text-rose-400 transition-colors">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}

              <div className="flex gap-2 pt-2">
                <input type="text" value={newItem} onChange={e => setNewItem(e.target.value)} onKeyDown={e => e.key === "Enter" && addItem()} placeholder="Add custom item…" className="flex-1 px-3 py-2 rounded-xl border border-slate-200 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                <button onClick={addItem} className="px-3 py-2 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold hover:bg-emerald-100 transition-colors">Add</button>
              </div>
            </div>

            <button onClick={handleSubmit} disabled={saving || !location} className="w-full py-3.5 rounded-xl bg-emerald-600 text-white font-bold text-sm hover:bg-emerald-700 active:scale-95 transition-all disabled:opacity-40 flex items-center justify-center gap-2">
              <ClipboardCheck className="w-4 h-4" />
              {saving ? "Submitting…" : "Submit Inspection"}
            </button>
          </>
        )}

        {tab === "history" && (
          <div className="space-y-3">
            {isLoading && <p className="text-sm text-slate-400 text-center py-8">Loading…</p>}
            {!isLoading && inspections.length === 0 && (
              <div className="text-center py-12 text-slate-400">
                <ClipboardCheck className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No inspections completed yet</p>
              </div>
            )}
            {inspections.map(r => {
              const lines  = (r.outcome_notes || "").split(" | ");
              const score  = lines.find(l => l.startsWith("Score:"))?.replace("Score: ", "") || "—";
              const passed = r.outcome === "passed";
              return (
                <div key={r.id} className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-bold text-slate-800">{r.title}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{r.scheduled_date} · {r.assigned_to_name}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`text-lg font-black ${passed ? "text-emerald-600" : "text-rose-600"}`}>{score}</p>
                      <p className={`text-[10px] font-bold ${passed ? "text-emerald-500" : "text-rose-500"}`}>{passed ? "PASSED" : "FAILED"}</p>
                    </div>
                  </div>
                  {!passed && (
                    <p className="text-xs text-rose-600 mt-1 line-clamp-2">
                      {lines.find(l => l.startsWith("Failed items:"))?.replace("Failed items: ", "") || ""}
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
