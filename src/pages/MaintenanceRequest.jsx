import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import dataService from "@/services/dataService";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { createRecord } from "@/services/dataService";
import { createRisk } from "@/services/intelligenceService";
import { ChevronLeft, Wrench, CheckCircle2, AlertCircle, Clock, CheckCheck } from "lucide-react";
import { format } from "date-fns";

const PRIORITIES  = ["Low", "Medium", "High", "Urgent"];
const CATEGORIES  = ["Electrical", "Plumbing", "HVAC", "Structural", "Equipment", "IT / Technology", "Cleaning", "Safety", "Other"];

const PRI_STYLE = {
  Low:    { bg: "bg-slate-50",   text: "text-slate-600",   dot: "bg-slate-400"   },
  Medium: { bg: "bg-amber-50",   text: "text-amber-700",   dot: "bg-amber-400"   },
  High:   { bg: "bg-orange-50",  text: "text-orange-700",  dot: "bg-orange-500"  },
  Urgent: { bg: "bg-rose-50",    text: "text-rose-700",    dot: "bg-rose-500"    },
};

function Toast({ msg, ok, onDismiss }) {
  return (
    <div onClick={onDismiss} className={`fixed bottom-8 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-6 py-4 rounded-2xl shadow-2xl text-white font-bold text-sm cursor-pointer ${ok ? "bg-emerald-600" : "bg-rose-600"}`}>
      {ok ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
      {msg}
    </div>
  );
}

const EMPTY = { category: "Equipment", priority: "Medium", location: "", item_name: "", description: "" };

export default function MaintenanceRequest() {
  const qc = useQueryClient();
  const { data: currentUser = null } = useQuery({
    queryKey: ["currentUser"], queryFn: () => base44.auth.me(),
    staleTime: 0, refetchOnMount: "always",
  });

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ["maintenance-requests", currentUser?.company_id],
    queryFn: () => base44.entities.Task.filter(
      { company_id: currentUser.company_id, task_type: "maintenance_request" }, "-created_date", 100,
    ),
    enabled: !!currentUser?.company_id,
    staleTime: 0, refetchOnMount: "always",
  });

  const { data: products = [] } = useQuery({
    queryKey: ["products-app", currentUser?.company_id],
    queryFn:  () => base44.entities.Product.filter({ company_id: currentUser.company_id, status: "active" }, "item_name", 200),
    enabled:  !!currentUser?.company_id,
    staleTime: 60_000,
  });

  const isAdmin = currentUser?.role === "admin" || currentUser?.role === "super_admin";

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
        task_type:      "maintenance_request",
        title:          `${form.category}: ${form.item_name || form.location}`,
        status:         "pending",
        outcome:        "open",
        priority:       form.priority.toLowerCase(),
        outcome_notes:  [
          `Category: ${form.category}`,
          `Priority: ${form.priority}`,
          `Location: ${form.location}`,
          form.item_name && `Item: ${form.item_name}`,
          `Issue: ${form.description}`,
        ].filter(Boolean).join(" | "),
        assigned_to_email: currentUser.email,
        assigned_to_name:  currentUser.full_name || currentUser.email,
      }, currentUser, { queryClient: qc });

      if (form.priority === "High" || form.priority === "Urgent") {
        createRisk({
          subject_type: "Task",
          subject_id:   task?.id || currentUser.company_id,
          subject_name: form.item_name || form.location,
          category:     "operational",
          severity:     form.priority === "Urgent" ? "high" : "medium",
          likelihood:   "likely",
          title:        `${form.priority} maintenance: ${form.category} at ${form.location}`,
          source:       "maintenancerequest",
        }, currentUser).catch(() => {});
      }

      setForm(EMPTY);
      showToast("Maintenance request submitted!", true);
      setTab("open");
    } catch {
      showToast("Failed to submit — try again", false);
    }
    setSaving(false);
  };

  const handleClose = async (req) => {
    try {
      await dataService.updateRecord("task", req.id, { status: "completed", outcome: "resolved" }, currentUser, { queryClient: qc });
      qc.invalidateQueries({ queryKey: ["maintenance-requests"] });
      showToast("Marked as resolved ✓", true);
    } catch {
      showToast("Failed", false);
    }
  };

  const open   = requests.filter(r => r.status === "pending" || r.outcome === "open");
  const closed = requests.filter(r => r.status === "completed");

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white border-b border-slate-100 px-4 py-3 flex items-center gap-3">
        <Link to={createPageUrl("Applications")} className="p-2 -ml-2 rounded-lg text-slate-400 hover:bg-slate-100">
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">🛠️ Maintenance Request</p>
          <p className="text-sm font-semibold text-slate-700 leading-tight">
            {open.length > 0 ? `${open.length} open request${open.length !== 1 ? "s" : ""}` : "No open requests"}
          </p>
        </div>
      </div>

      <div className="bg-white border-b border-slate-100 px-4">
        <div className="flex gap-0">
          {[{ key: "new", label: "New Request" }, { key: "open", label: `Open (${open.length})` }, { key: "closed", label: "Closed" }].map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} className={`px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${tab === t.key ? "border-orange-600 text-orange-700" : "border-transparent text-slate-400 hover:text-slate-600"}`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-md mx-auto px-4 py-6 space-y-4">

        {tab === "new" && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">

            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Category</label>
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map(c => (
                  <button key={c} onClick={() => set("category", c)} className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${form.category === c ? "bg-orange-600 text-white border-orange-600" : "bg-white text-slate-600 border-slate-200 hover:border-orange-300"}`}>
                    {c}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Priority</label>
              <div className="grid grid-cols-4 gap-2">
                {PRIORITIES.map(p => {
                  const st = PRI_STYLE[p];
                  return (
                    <button key={p} onClick={() => set("priority", p)} className={`py-2 rounded-xl text-xs font-bold border transition-all ${form.priority === p ? `${st.bg} ${st.text} ring-2 ring-offset-1 ring-current` : "bg-white text-slate-500 border-slate-200"}`}>
                      {p}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Location *</label>
              <input type="text" value={form.location} onChange={e => set("location", e.target.value)} placeholder="Which room, floor, or area?" className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-orange-400" />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Item / Asset</label>
              {products.length > 0 ? (
                <select value={form.item_name} onChange={e => set("item_name", e.target.value)} className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white">
                  <option value="">— Select or type below —</option>
                  {products.map(p => <option key={p.id} value={p.item_name || p.name}>{p.item_name || p.name}</option>)}
                </select>
              ) : (
                <input type="text" value={form.item_name} onChange={e => set("item_name", e.target.value)} placeholder="Name of equipment or asset" className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-orange-400" />
              )}
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Issue Description *</label>
              <textarea value={form.description} onChange={e => set("description", e.target.value)} rows={4} placeholder="Describe the problem in detail…" className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-orange-400 resize-none" />
            </div>

            <button onClick={handleSubmit} disabled={saving || !form.description || !form.location} className="w-full py-3.5 rounded-xl bg-orange-600 text-white font-bold text-sm hover:bg-orange-700 active:scale-95 transition-all disabled:opacity-40">
              {saving ? "Submitting…" : "Submit Request"}
            </button>
          </div>
        )}

        {(tab === "open" || tab === "closed") && (
          <div className="space-y-3">
            {isLoading && <p className="text-sm text-slate-400 text-center py-8">Loading…</p>}
            {(() => {
              const list = tab === "open" ? open : closed;
              if (!isLoading && list.length === 0) return (
                <div className="text-center py-12 text-slate-400">
                  <Wrench className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">{tab === "open" ? "No open requests" : "No closed requests"}</p>
                </div>
              );
              return list.map(r => {
                const lines = (r.outcome_notes || "").split(" | ");
                const pri   = lines.find(l => l.startsWith("Priority:"))?.replace("Priority: ", "") || "Medium";
                const st    = PRI_STYLE[pri] || PRI_STYLE.Medium;
                const isOpen = r.status === "pending" || r.outcome === "open";
                return (
                  <div key={r.id} className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-slate-800 truncate">{r.title}</p>
                        <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">
                          {lines.find(l => l.startsWith("Issue:"))?.replace("Issue: ", "") || ""}
                        </p>
                        <p className="text-[10px] text-slate-300 mt-1">{r.created_date ? format(new Date(r.created_date), "dd MMM yyyy") : ""} · {r.assigned_to_name || r.assigned_to_email}</p>
                      </div>
                      <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${st.bg} ${st.text}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
                        {pri}
                      </span>
                    </div>
                    {isAdmin && isOpen && (
                      <button onClick={() => handleClose(r)} className="mt-3 w-full flex items-center justify-center gap-1.5 py-2 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold hover:bg-emerald-100 transition-colors">
                        <CheckCheck className="w-3.5 h-3.5" /> Mark Resolved
                      </button>
                    )}
                  </div>
                );
              });
            })()}
          </div>
        )}
      </div>

      {toast && <Toast msg={toast.msg} ok={toast.ok} onDismiss={() => setToast(null)} />}
    </div>
  );
}
