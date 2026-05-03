import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { createRecord } from "@/services/dataService";
import { ChevronLeft, PackageCheck, CheckCircle2, AlertCircle } from "lucide-react";
import { format } from "date-fns";

const CONDITIONS = ["Good — all received", "Partial — some missing", "Damaged — some items damaged", "Rejected — not accepted"];

const COND_STYLE = {
  "Good — all received":       { bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500" },
  "Partial — some missing":    { bg: "bg-amber-50",   text: "text-amber-700",   dot: "bg-amber-400"   },
  "Damaged — some items damaged": { bg: "bg-orange-50", text: "text-orange-700", dot: "bg-orange-500" },
  "Rejected — not accepted":   { bg: "bg-rose-50",    text: "text-rose-700",    dot: "bg-rose-500"    },
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

const EMPTY = { product_id: "", product_name: "", qty_ordered: "", qty_received: "", condition: "Good — all received", supplier: "", notes: "", received_date: today() };

export default function GoodsReceived() {
  const qc = useQueryClient();
  const { data: currentUser = null } = useQuery({
    queryKey: ["currentUser"], queryFn: () => base44.auth.me(),
    staleTime: 0, refetchOnMount: "always",
  });

  const { data: receipts = [], isLoading } = useQuery({
    queryKey: ["goods-received", currentUser?.company_id],
    queryFn: () => base44.entities.Transaction.filter(
      { company_id: currentUser.company_id, transaction_type: "goods_received" }, "-created_date", 100,
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

  const [tab,    setTab]    = useState("new");
  const [form,   setForm]   = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [toast,  setToast]  = useState(null);

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const showToast = (msg, ok) => { setToast({ msg, ok }); setTimeout(() => setToast(null), 3500); };

  const handleProductSelect = (productId) => {
    const prod = products.find(p => p.id === productId);
    set("product_id", productId);
    if (prod) set("product_name", prod.item_name || prod.name || "");
  };

  const handleSubmit = async () => {
    if (!form.product_name)                                     { showToast("Select a product", false); return; }
    if (!form.qty_received || Number(form.qty_received) <= 0)  { showToast("Enter quantity received", false); return; }

    setSaving(true);
    try {
      const meta = {
        product_id:    form.product_id,
        product_name:  form.product_name,
        qty_ordered:   Number(form.qty_ordered) || null,
        qty_received:  Number(form.qty_received),
        condition:     form.condition,
        supplier:      form.supplier,
        notes:         form.notes,
      };

      await createRecord("transaction", {
        transaction_type: "goods_received",
        description:      `Goods Received: ${form.product_name} (qty ${form.qty_received})`,
        amount:           0,
        transaction_date: form.received_date,
        status:           form.condition.startsWith("Good") ? "completed" : "pending",
        notes:            JSON.stringify(meta),
      }, currentUser, { queryClient: qc });

      // Update product stock if product_id known
      if (form.product_id && form.condition.startsWith("Good")) {
        const prod = products.find(p => p.id === form.product_id);
        if (prod) {
          const newQty = (Number(prod.quantity_in_stock) || 0) + Number(form.qty_received);
          base44.entities.Product.update(form.product_id, { quantity_in_stock: newQty }).catch(() => {});
        }
      }

      setForm(EMPTY);
      showToast("Goods receipt recorded!", true);
      setTab("history");
    } catch {
      showToast("Failed — try again", false);
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
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">📬 Goods Received</p>
          <p className="text-sm font-semibold text-slate-700 leading-tight">Confirm deliveries and update stock</p>
        </div>
      </div>

      <div className="bg-white border-b border-slate-100 px-4">
        <div className="flex gap-0">
          {[{ key: "new", label: "Record Receipt" }, { key: "history", label: `History (${receipts.length})` }].map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} className={`px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${tab === t.key ? "border-green-600 text-green-700" : "border-transparent text-slate-400 hover:text-slate-600"}`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-md mx-auto px-4 py-6 space-y-4">

        {tab === "new" && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
            <p className="text-sm font-bold text-slate-700">Record Delivery</p>

            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Product *</label>
              {products.length > 0 ? (
                <select value={form.product_id} onChange={e => handleProductSelect(e.target.value)} className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-green-400 bg-white">
                  <option value="">— Select product —</option>
                  {products.map(p => <option key={p.id} value={p.id}>{p.item_name || p.name}</option>)}
                </select>
              ) : (
                <input type="text" value={form.product_name} onChange={e => set("product_name", e.target.value)} placeholder="Product or item name" className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-green-400" />
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Qty Ordered</label>
                <input type="number" min="0" value={form.qty_ordered} onChange={e => set("qty_ordered", e.target.value)} placeholder="Expected" className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-green-400" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Qty Received *</label>
                <input type="number" min="0" value={form.qty_received} onChange={e => set("qty_received", e.target.value)} placeholder="Actual" className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-green-400" />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Condition</label>
              <div className="space-y-2">
                {CONDITIONS.map(c => {
                  const st = COND_STYLE[c];
                  return (
                    <button key={c} onClick={() => set("condition", c)} className={`w-full text-left px-3 py-2.5 rounded-xl text-sm font-medium border transition-all ${form.condition === c ? `${st.bg} ${st.text} ring-2 ring-offset-1 ring-current` : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"}`}>
                      {c}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Supplier</label>
              <input type="text" value={form.supplier} onChange={e => set("supplier", e.target.value)} placeholder="Supplier / delivery company" className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-green-400" />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Date Received</label>
              <input type="date" value={form.received_date} onChange={e => set("received_date", e.target.value)} className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-green-400" />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Notes</label>
              <textarea value={form.notes} onChange={e => set("notes", e.target.value)} rows={2} placeholder="Any issues, reference numbers…" className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-green-400 resize-none" />
            </div>

            {form.product_id && form.condition.startsWith("Good") && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-700">
                <PackageCheck className="w-4 h-4 shrink-0" />
                Stock will be updated automatically on save.
              </div>
            )}

            <button onClick={handleSubmit} disabled={saving || !form.product_name || !form.qty_received} className="w-full py-3.5 rounded-xl bg-green-600 text-white font-bold text-sm hover:bg-green-700 active:scale-95 transition-all disabled:opacity-40 flex items-center justify-center gap-2">
              <PackageCheck className="w-4 h-4" />
              {saving ? "Saving…" : "Confirm Delivery"}
            </button>
          </div>
        )}

        {tab === "history" && (
          <div className="space-y-3">
            {isLoading && <p className="text-sm text-slate-400 text-center py-8">Loading…</p>}
            {!isLoading && receipts.length === 0 && (
              <div className="text-center py-12 text-slate-400">
                <PackageCheck className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No goods receipts recorded yet</p>
              </div>
            )}
            {receipts.map(r => {
              const meta = (() => { try { return JSON.parse(r.notes || "{}"); } catch { return {}; } })();
              const st   = COND_STYLE[meta.condition] || COND_STYLE["Good — all received"];
              return (
                <div key={r.id} className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-bold text-slate-800">{meta.product_name || "Item"}</p>
                      <p className="text-xs text-slate-500">Received: {meta.qty_received}{meta.qty_ordered ? ` / ${meta.qty_ordered} ordered` : ""}</p>
                      {meta.supplier && <p className="text-[10px] text-slate-400">{meta.supplier}</p>}
                    </div>
                    <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${st.bg} ${st.text}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
                      {meta.condition?.split(" — ")[0] || "Good"}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-300 mt-1">{r.transaction_date || ""}</p>
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
