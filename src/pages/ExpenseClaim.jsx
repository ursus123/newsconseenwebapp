import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import dataService from "@/services/dataService";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { createRecord } from "@/services/dataService";
import { ChevronLeft, Receipt, CheckCircle2, AlertCircle, DollarSign } from "lucide-react";
import { format } from "date-fns";

const CATEGORIES = ["Travel", "Meals", "Accommodation", "Supplies", "Equipment", "Communication", "Training", "Other"];
const CURRENCIES = ["USD", "EUR", "GBP", "ZAR", "KES", "NGN", "GHS", "UGX", "TZS", "Other"];

const STATUS_STYLE = {
  pending:  { bg: "bg-amber-50",   text: "text-amber-700",   dot: "bg-amber-400"  },
  approved: { bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500" },
  rejected: { bg: "bg-rose-50",    text: "text-rose-700",    dot: "bg-rose-500"   },
  paid:     { bg: "bg-blue-50",    text: "text-blue-700",    dot: "bg-blue-500"   },
};

function Toast({ msg, ok, onDismiss }) {
  return (
    <div onClick={onDismiss} className={`fixed bottom-8 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-6 py-4 rounded-2xl shadow-2xl text-white font-bold text-sm cursor-pointer ${ok ? "bg-emerald-600" : "bg-rose-600"}`}>
      {ok ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
      {msg}
    </div>
  );
}

const EMPTY = { category: "Travel", amount: "", currency: "USD", date: new Date().toISOString().slice(0, 10), description: "", receipt_ref: "" };

export default function ExpenseClaim() {
  const qc = useQueryClient();
  const { data: currentUser = null } = useQuery({
    queryKey: ["currentUser"], queryFn: () => base44.auth.me(),
    staleTime: 0, refetchOnMount: "always",
  });

  const { data: claims = [], isLoading } = useQuery({
    queryKey: ["expense-claims", currentUser?.company_id],
    queryFn: () => base44.entities.Transaction.filter(
      { company_id: currentUser.company_id, transaction_type: "expense" }, "-created_date", 100,
    ),
    enabled: !!currentUser?.company_id,
    staleTime: 0, refetchOnMount: "always",
  });

  const isAdmin = currentUser?.role === "admin" || currentUser?.role === "super_admin";

  const [tab,    setTab]    = useState("new");
  const [form,   setForm]   = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [toast,  setToast]  = useState(null);

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const showToast = (msg, ok) => { setToast({ msg, ok }); setTimeout(() => setToast(null), 3500); };

  const handleSubmit = async () => {
    if (!form.amount || isNaN(Number(form.amount)) || Number(form.amount) <= 0) {
      showToast("Enter a valid amount", false); return;
    }
    if (!form.description) { showToast("Description is required", false); return; }
    setSaving(true);
    try {
      await createRecord("transaction", {
        transaction_type: "expense",
        description:      `${form.category} — ${form.description}`,
        amount:           Number(form.amount),
        currency:         form.currency,
        transaction_date: form.date,
        status:           "pending",
        reference_number: form.receipt_ref || null,
        notes:            JSON.stringify({ category: form.category, claimant: currentUser.email, receipt_ref: form.receipt_ref }),
      }, currentUser, { queryClient: qc });
      setForm(EMPTY);
      showToast("Expense claim submitted!", true);
      setTab("history");
    } catch {
      showToast("Failed to submit — try again", false);
    }
    setSaving(false);
  };

  const handleApprove = async (claim, approved) => {
    try {
      await dataService.updateRecord("transaction", claim.id, {
        status: approved ? "completed" : "cancelled",
      }, currentUser, { queryClient: qc });
      qc.invalidateQueries({ queryKey: ["expense-claims"] });
      showToast(approved ? "Approved!" : "Rejected", approved);
    } catch {
      showToast("Action failed", false);
    }
  };

  const myClaims   = claims.filter(c => { try { return JSON.parse(c.notes || "{}").claimant === currentUser?.email; } catch { return false; } });
  const teamClaims = isAdmin ? claims : [];

  const total = myClaims.reduce((s, c) => s + (Number(c.amount) || 0), 0);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white border-b border-slate-100 px-4 py-3 flex items-center gap-3">
        <Link to={createPageUrl("Applications")} className="p-2 -ml-2 rounded-lg text-slate-400 hover:bg-slate-100">
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">💸 Expense Claim</p>
          <p className="text-sm font-semibold text-slate-700 leading-tight">{currentUser?.full_name || currentUser?.email}</p>
        </div>
        {myClaims.length > 0 && (
          <div className="text-right">
            <p className="text-[10px] text-slate-400">Total claimed</p>
            <p className="text-sm font-black text-slate-700">{total.toLocaleString()}</p>
          </div>
        )}
      </div>

      <div className="bg-white border-b border-slate-100 px-4">
        <div className="flex gap-0">
          {[{ key: "new", label: "New Claim" }, { key: "history", label: "My Claims" }, ...(isAdmin ? [{ key: "team", label: "All Claims" }] : [])].map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} className={`px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${tab === t.key ? "border-emerald-600 text-emerald-700" : "border-transparent text-slate-400 hover:text-slate-600"}`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-md mx-auto px-4 py-6 space-y-4">

        {tab === "new" && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
            <p className="text-sm font-bold text-slate-700">Submit Expense</p>

            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Category</label>
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map(c => (
                  <button key={c} onClick={() => set("category", c)} className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${form.category === c ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-slate-600 border-slate-200 hover:border-emerald-300"}`}>
                    {c}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Amount</label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input type="number" min="0" step="0.01" value={form.amount} onChange={e => set("amount", e.target.value)} placeholder="0.00" className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Currency</label>
                <select value={form.currency} onChange={e => set("currency", e.target.value)} className="w-full px-2 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white">
                  {CURRENCIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Date</label>
              <input type="date" value={form.date} onChange={e => set("date", e.target.value)} className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400" />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Description</label>
              <input type="text" value={form.description} onChange={e => set("description", e.target.value)} placeholder="What was this expense for?" className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400" />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Receipt / Reference #</label>
              <input type="text" value={form.receipt_ref} onChange={e => set("receipt_ref", e.target.value)} placeholder="Optional receipt number or reference" className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400" />
            </div>

            <button onClick={handleSubmit} disabled={saving || !form.amount || !form.description} className="w-full py-3.5 rounded-xl bg-emerald-600 text-white font-bold text-sm hover:bg-emerald-700 active:scale-95 transition-all disabled:opacity-40">
              {saving ? "Submitting…" : "Submit Claim"}
            </button>
          </div>
        )}

        {(tab === "history" || tab === "team") && (
          <div className="space-y-3">
            {isLoading && <p className="text-sm text-slate-400 text-center py-8">Loading…</p>}
            {(() => {
              const list = tab === "team" ? teamClaims : myClaims;
              if (!isLoading && list.length === 0) return (
                <div className="text-center py-12 text-slate-400">
                  <Receipt className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No expense claims yet</p>
                </div>
              );
              return list.map(c => {
                const meta = (() => { try { return JSON.parse(c.notes || "{}"); } catch { return {}; } })();
                const st = STATUS_STYLE[c.status] || STATUS_STYLE.pending;
                const isPending = c.status === "pending";
                return (
                  <div key={c.id} className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-bold text-slate-800">{meta.category || "Expense"}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{c.description?.replace(`${meta.category} — `, "") || ""}</p>
                        {tab === "team" && <p className="text-[10px] text-slate-400 mt-0.5">{meta.claimant}</p>}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-black text-slate-800">{(c.amount || 0).toLocaleString()} {c.currency}</p>
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${st.bg} ${st.text}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
                          {(c.status || "pending").charAt(0).toUpperCase() + (c.status || "pending").slice(1)}
                        </span>
                      </div>
                    </div>
                    <p className="text-[10px] text-slate-300">{c.transaction_date || ""}</p>
                    {isAdmin && isPending && (
                      <div className="flex gap-2 pt-1">
                        <button onClick={() => handleApprove(c, true)} className="flex-1 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 transition-colors">Approve</button>
                        <button onClick={() => handleApprove(c, false)} className="flex-1 py-2 rounded-xl bg-rose-50 text-rose-700 border border-rose-200 text-xs font-bold hover:bg-rose-100 transition-colors">Reject</button>
                      </div>
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
