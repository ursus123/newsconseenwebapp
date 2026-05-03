import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { createRecord } from "@/services/dataService";
import { ChevronLeft, ShoppingCart, Plus, Trash2, CheckCircle2, AlertCircle } from "lucide-react";
import { format } from "date-fns";

const STATUS_STYLE = {
  pending:   { bg: "bg-amber-50",   text: "text-amber-700",   dot: "bg-amber-400"   },
  approved:  { bg: "bg-blue-50",    text: "text-blue-700",    dot: "bg-blue-500"    },
  completed: { bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500" },
  cancelled: { bg: "bg-rose-50",    text: "text-rose-700",    dot: "bg-rose-500"    },
};

function Toast({ msg, ok, onDismiss }) {
  return (
    <div onClick={onDismiss} className={`fixed bottom-8 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-6 py-4 rounded-2xl shadow-2xl text-white font-bold text-sm cursor-pointer ${ok ? "bg-emerald-600" : "bg-rose-600"}`}>
      {ok ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
      {msg}
    </div>
  );
}

const emptyLine = () => ({ product_id: "", product_name: "", qty: 1, unit_price: "" });

const today = () => new Date().toISOString().slice(0, 10);

export default function PurchaseOrder() {
  const qc = useQueryClient();
  const { data: currentUser = null } = useQuery({
    queryKey: ["currentUser"], queryFn: () => base44.auth.me(),
    staleTime: 0, refetchOnMount: "always",
  });

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["purchase-orders", currentUser?.company_id],
    queryFn: () => base44.entities.Transaction.filter(
      { company_id: currentUser.company_id, transaction_type: "purchase_order" }, "-created_date", 100,
    ),
    enabled: !!currentUser?.company_id,
    staleTime: 0, refetchOnMount: "always",
  });

  const { data: enterprises = [] } = useQuery({
    queryKey: ["enterprises-suppliers", currentUser?.company_id],
    queryFn:  () => base44.entities.Enterprise.filter({ company_id: currentUser.company_id }, "enterprise_name", 200),
    enabled:  !!currentUser?.company_id,
    staleTime: 60_000,
  });

  const { data: products = [] } = useQuery({
    queryKey: ["products-app", currentUser?.company_id],
    queryFn:  () => base44.entities.Product.filter({ company_id: currentUser.company_id, status: "active" }, "item_name", 200),
    enabled:  !!currentUser?.company_id,
    staleTime: 60_000,
  });

  const isAdmin = currentUser?.role === "admin" || currentUser?.role === "super_admin";

  const [tab,      setTab]      = useState("new");
  const [supplier, setSupplier] = useState("");
  const [delivDate,setDelivDate]= useState("");
  const [notes,    setNotes]    = useState("");
  const [lines,    setLines]    = useState([emptyLine()]);
  const [saving,   setSaving]   = useState(false);
  const [toast,    setToast]    = useState(null);

  const showToast = (msg, ok) => { setToast({ msg, ok }); setTimeout(() => setToast(null), 3500); };

  const updateLine = (i, k, v) => setLines(prev => prev.map((l, idx) => idx === i ? { ...l, [k]: v } : l));
  const addLine    = () => setLines(prev => [...prev, emptyLine()]);
  const removeLine = (i) => setLines(prev => prev.filter((_, idx) => idx !== i));

  const handleProductSelect = (i, productId) => {
    const prod = products.find(p => p.id === productId);
    updateLine(i, "product_id", productId);
    if (prod) updateLine(i, "product_name", prod.item_name || prod.name || "");
  };

  const total = useMemo(
    () => lines.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.unit_price) || 0), 0),
    [lines],
  );

  const handleSubmit = async () => {
    const validLines = lines.filter(l => l.product_name && Number(l.qty) > 0);
    if (validLines.length === 0) { showToast("Add at least one product line", false); return; }
    if (!supplier)                { showToast("Select a supplier", false); return; }
    setSaving(true);
    try {
      await createRecord("transaction", {
        transaction_type: "purchase_order",
        description:      `PO from ${supplier} — ${validLines.length} line${validLines.length !== 1 ? "s" : ""}`,
        amount:           total,
        currency:         "USD",
        transaction_date: today(),
        status:           "pending",
        notes: JSON.stringify({
          supplier,
          delivery_date: delivDate || null,
          notes,
          lines: validLines,
        }),
      }, currentUser, { queryClient: qc });
      setSupplier(""); setDelivDate(""); setNotes(""); setLines([emptyLine()]);
      showToast("Purchase order created!", true);
      setTab("history");
    } catch {
      showToast("Failed — try again", false);
    }
    setSaving(false);
  };

  const handleApprove = async (order, approved) => {
    try {
      await base44.entities.Transaction.update(order.id, { status: approved ? "approved" : "cancelled" });
      qc.invalidateQueries({ queryKey: ["purchase-orders"] });
      showToast(approved ? "PO Approved!" : "PO Cancelled", approved);
    } catch {
      showToast("Action failed", false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white border-b border-slate-100 px-4 py-3 flex items-center gap-3">
        <Link to={createPageUrl("Applications")} className="p-2 -ml-2 rounded-lg text-slate-400 hover:bg-slate-100">
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">🛒 Purchase Order</p>
          <p className="text-sm font-semibold text-slate-700 leading-tight">Request and approve purchases</p>
        </div>
      </div>

      <div className="bg-white border-b border-slate-100 px-4">
        <div className="flex gap-0">
          {[{ key: "new", label: "New PO" }, { key: "history", label: `Orders (${orders.length})` }].map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} className={`px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${tab === t.key ? "border-blue-600 text-blue-700" : "border-transparent text-slate-400 hover:text-slate-600"}`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-4">

        {tab === "new" && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
              <p className="text-sm font-bold text-slate-700">Order Details</p>

              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Supplier *</label>
                {enterprises.length > 0 ? (
                  <select value={supplier} onChange={e => setSupplier(e.target.value)} className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white">
                    <option value="">— Select supplier —</option>
                    {enterprises.map(e => <option key={e.id} value={e.enterprise_name}>{e.enterprise_name}</option>)}
                  </select>
                ) : (
                  <input type="text" value={supplier} onChange={e => setSupplier(e.target.value)} placeholder="Supplier / vendor name" className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-400" />
                )}
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Expected Delivery Date</label>
                <input type="date" value={delivDate} onChange={e => setDelivDate(e.target.value)} className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-400" />
              </div>
            </div>

            {/* Line items */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold text-slate-700">Line Items</p>
                <button onClick={addLine} className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-blue-50 text-blue-700 border border-blue-200 text-xs font-bold hover:bg-blue-100 transition-colors">
                  <Plus className="w-3.5 h-3.5" /> Add Line
                </button>
              </div>

              {lines.map((line, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-6">
                    {i === 0 && <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1 block">Product</label>}
                    {products.length > 0 ? (
                      <select value={line.product_id} onChange={e => handleProductSelect(i, e.target.value)} className="w-full px-2 py-2 rounded-xl border border-slate-200 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white">
                        <option value="">— Select —</option>
                        {products.map(p => <option key={p.id} value={p.id}>{p.item_name || p.name}</option>)}
                      </select>
                    ) : (
                      <input type="text" value={line.product_name} onChange={e => updateLine(i, "product_name", e.target.value)} placeholder="Product name" className="w-full px-2 py-2 rounded-xl border border-slate-200 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-400" />
                    )}
                  </div>
                  <div className="col-span-2">
                    {i === 0 && <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1 block">Qty</label>}
                    <input type="number" min="1" value={line.qty} onChange={e => updateLine(i, "qty", e.target.value)} className="w-full px-2 py-2 rounded-xl border border-slate-200 text-xs text-slate-700 text-center focus:outline-none focus:ring-1 focus:ring-blue-400" />
                  </div>
                  <div className="col-span-3">
                    {i === 0 && <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1 block">Unit Price</label>}
                    <input type="number" min="0" step="0.01" value={line.unit_price} onChange={e => updateLine(i, "unit_price", e.target.value)} placeholder="0.00" className="w-full px-2 py-2 rounded-xl border border-slate-200 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-400" />
                  </div>
                  <div className="col-span-1 flex justify-end">
                    {lines.length > 1 && (
                      <button onClick={() => removeLine(i)} className="p-1.5 rounded-lg text-rose-400 hover:bg-rose-50 transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}

              {total > 0 && (
                <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                  <span className="text-sm font-semibold text-slate-500">Total</span>
                  <span className="text-lg font-black text-slate-800">{total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
              )}
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Notes</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Any additional notes for the supplier…" className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none" />
            </div>

            <button onClick={handleSubmit} disabled={saving || !supplier || lines.every(l => !l.product_name)} className="w-full py-3.5 rounded-xl bg-blue-600 text-white font-bold text-sm hover:bg-blue-700 active:scale-95 transition-all disabled:opacity-40 flex items-center justify-center gap-2">
              <ShoppingCart className="w-4 h-4" />
              {saving ? "Creating…" : "Create Purchase Order"}
            </button>
          </div>
        )}

        {tab === "history" && (
          <div className="space-y-3">
            {isLoading && <p className="text-sm text-slate-400 text-center py-8">Loading…</p>}
            {!isLoading && orders.length === 0 && (
              <div className="text-center py-12 text-slate-400">
                <ShoppingCart className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No purchase orders yet</p>
              </div>
            )}
            {orders.map(o => {
              const meta = (() => { try { return JSON.parse(o.notes || "{}"); } catch { return {}; } })();
              const st   = STATUS_STYLE[o.status] || STATUS_STYLE.pending;
              const isPending = o.status === "pending";
              return (
                <div key={o.id} className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-bold text-slate-800">{meta.supplier || "PO"}</p>
                      <p className="text-xs text-slate-500">{(meta.lines || []).length} line{(meta.lines || []).length !== 1 ? "s" : ""}{meta.delivery_date ? ` · Deliver by ${meta.delivery_date}` : ""}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-black text-slate-800">{(o.amount || 0).toLocaleString()}</p>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${st.bg} ${st.text}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
                        {(o.status || "pending").charAt(0).toUpperCase() + (o.status || "pending").slice(1)}
                      </span>
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-300">{o.transaction_date || ""}</p>
                  {isAdmin && isPending && (
                    <div className="flex gap-2 pt-1">
                      <button onClick={() => handleApprove(o, true)} className="flex-1 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 transition-colors">Approve</button>
                      <button onClick={() => handleApprove(o, false)} className="flex-1 py-2 rounded-xl bg-rose-50 text-rose-700 border border-rose-200 text-xs font-bold hover:bg-rose-100 transition-colors">Cancel</button>
                    </div>
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
