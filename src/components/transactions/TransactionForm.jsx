import React, { useState, useEffect } from "react";
import { X } from "lucide-react";
import { TRANSACTION_TYPES, REVENUE_TYPES, EXPENSE_TYPES, INVENTORY_TYPES } from "@/config/transactionTypes";
import TagInput from "@/components/shared/TagInput";

const CURRENCIES = ["USD", "EUR", "GBP", "RWF", "KES", "NGN", "ZAR", "CAD", "AUD", "INR"];

const PAYMENT_METHODS = [
  { v: "private_pay",   l: "Private Pay" },
  { v: "medicaid",      l: "Medicaid" },
  { v: "medicare",      l: "Medicare" },
  { v: "insurance",     l: "Insurance" },
  { v: "cash",          l: "Cash" },
  { v: "bank_transfer", l: "Bank Transfer" },
  { v: "check",         l: "Check" },
  { v: "donation",      l: "Donation" },
  { v: "grant",         l: "Grant" },
  { v: "crypto",        l: "Crypto" },
  { v: "other",         l: "Other" },
];

function defaultDueDate() {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toISOString().slice(0, 10);
}

export default function TransactionForm({ open, onClose, onSubmit, initialData, enterprises = [], people = [], services = [] }) {
  const [formData, setFormData] = useState({});

  useEffect(() => {
    if (open) {
      setFormData({
        enterprise: "",
        transaction_type: "service_fee",
        description: "",
        amount: "",
        currency: "USD",
        tax_amount: 0,
        discount_amount: 0,
        primary_person: "",
        service_id: "",
        service_name: "",
        payment_method: "private_pay",
        payment_status: "unpaid",
        date: new Date().toISOString().slice(0, 10),
        due_date: defaultDueDate(),
        notes: "",
        status: "draft",
        ...(initialData || {}),
      });
    }
  }, [open, initialData]);

  const set = (key, val) => setFormData(f => ({ ...f, [key]: val }));

  const isRevenue   = REVENUE_TYPES.includes(formData.transaction_type);
  const isExpense   = EXPENSE_TYPES.includes(formData.transaction_type);
  const isInventory = INVENTORY_TYPES.includes(formData.transaction_type);

  const enterprisePeople   = people.filter(p => !p.enterprise || p.enterprise === formData.enterprise);
  const enterpriseServices = services.filter(s => !s.enterprise || s.enterprise === formData.enterprise);

  if (!open) return null;

  const handleSubmit = () => {
    const amt = parseFloat(formData.amount) || 0;
    onSubmit({
      ...formData,
      amount: amt,
      net_amount: amt - (parseFloat(formData.discount_amount) || 0) + (parseFloat(formData.tax_amount) || 0),
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-end p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-lg h-full max-h-[90vh] overflow-y-auto shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white z-10">
          <div>
            <h2 className="font-bold text-slate-800">{initialData?.id ? "Edit Transaction" : "New Transaction"}</h2>
            <p className="text-xs text-slate-400 mt-0.5">Record a financial event in your enterprise</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-100 transition-colors">
            <X className="w-4 h-4 text-slate-400" />
          </button>
        </div>

        <div className="p-6 space-y-5 flex-1 overflow-y-auto">
          {/* 1. Enterprise */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">1. Which enterprise is this for?</label>
            <select value={formData.enterprise || ""} onChange={e => set("enterprise", e.target.value)}
              className="w-full border border-slate-200 rounded-xl text-sm px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-200 bg-white">
              <option value="">Select enterprise...</option>
              {enterprises.map(e => <option key={e.id} value={e.enterprise_name}>{e.enterprise_name}</option>)}
            </select>
          </div>

          {/* 2. Type */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">2. What type of transaction is this?</label>
            <p className="text-xs text-slate-400 mb-2">Is money coming in, going out, or is this a stock movement?</p>
            <div className="grid grid-cols-3 gap-2 mb-3">
              {[
                { label: "💰 Income",    desc: "Money received",  types: REVENUE_TYPES },
                { label: "💸 Expense",   desc: "Money paid out",  types: EXPENSE_TYPES },
                { label: "📦 Inventory", desc: "Stock movement",  types: INVENTORY_TYPES },
              ].map(cat => {
                const isActive = cat.types.includes(formData.transaction_type);
                return (
                  <button key={cat.label} type="button"
                    onClick={() => set("transaction_type", cat.types[0])}
                    className={`p-3 rounded-xl border text-left transition-all ${isActive ? "border-emerald-300 bg-emerald-50" : "border-slate-200 hover:border-slate-300"}`}>
                    <p className="text-sm font-bold text-slate-700">{cat.label}</p>
                    <p className="text-[10px] text-slate-400">{cat.desc}</p>
                  </button>
                );
              })}
            </div>
            <select value={formData.transaction_type || ""} onChange={e => set("transaction_type", e.target.value)}
              className="w-full border border-slate-200 rounded-xl text-sm px-3 py-2.5 focus:outline-none bg-white">
              <optgroup label="💰 Income">
                {REVENUE_TYPES.map(t => <option key={t} value={t}>{TRANSACTION_TYPES[t] || t}</option>)}
              </optgroup>
              <optgroup label="💸 Expenses">
                {EXPENSE_TYPES.map(t => <option key={t} value={t}>{TRANSACTION_TYPES[t] || t}</option>)}
              </optgroup>
              <optgroup label="📦 Inventory">
                {INVENTORY_TYPES.map(t => <option key={t} value={t}>{TRANSACTION_TYPES[t] || t}</option>)}
              </optgroup>
            </select>
          </div>

          {/* 3. Description */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">3. What is this for?</label>
            <input value={formData.description || ""} onChange={e => set("description", e.target.value)}
              placeholder={isRevenue ? "e.g. Personal Care Visit — 4 hours" : isExpense ? "e.g. Monthly medication restock" : "e.g. Donepezil — 30 tablets dispensed"}
              className="w-full border border-slate-200 rounded-xl text-sm px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-200" />
          </div>

          {/* 4. Amount */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">4. How much?</label>
            <div className="flex gap-2">
              <select value={formData.currency || "USD"} onChange={e => set("currency", e.target.value)}
                className="border border-slate-200 rounded-xl text-sm px-3 py-2.5 focus:outline-none w-24 bg-white">
                {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <input type="number" min="0" step="0.01" value={formData.amount || ""} onChange={e => {
                const amount = parseFloat(e.target.value) || 0;
                setFormData(f => ({ ...f, amount, net_amount: amount - (f.discount_amount || 0) + (f.tax_amount || 0) }));
              }}
                placeholder="0.00"
                className="flex-1 border border-slate-200 rounded-xl text-sm px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-200" />
            </div>
          </div>

          {/* 5. Person */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">
              5. Who is involved? <span className="text-slate-400 font-normal">(optional)</span>
            </label>
            <p className="text-xs text-slate-400 mb-2">
              {isRevenue ? "Which client or donor is paying?" : isExpense ? "Which staff member or supplier?" : "Which person is this related to?"}
            </p>
            <div className="flex gap-2">
              {enterprisePeople.length > 0 ? (
                <select value={formData.primary_person || ""} onChange={e => set("primary_person", e.target.value)}
                  className="flex-1 border border-slate-200 rounded-xl text-sm px-3 py-2.5 focus:outline-none bg-white">
                  <option value="">Select person...</option>
                  {enterprisePeople.map(p => (
                    <option key={p.id} value={`${p.first_name} ${p.last_name}`}>
                      {p.first_name} {p.last_name}{p.primary_role ? ` (${p.primary_role})` : ""}
                    </option>
                  ))}
                </select>
              ) : (
                <input value={formData.primary_person || ""} onChange={e => set("primary_person", e.target.value)}
                  placeholder="Type a name..."
                  className="flex-1 border border-slate-200 rounded-xl text-sm px-3 py-2.5 focus:outline-none" />
              )}
            </div>
          </div>

          {/* 6. Service */}
          {isRevenue && enterpriseServices.length > 0 && (
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                6. Which service was delivered? <span className="text-slate-400 font-normal">(optional)</span>
              </label>
              <select value={formData.service_id || ""} onChange={e => {
                const svc = enterpriseServices.find(s => s.id === e.target.value);
                setFormData(f => ({
                  ...f,
                  service_id:   e.target.value,
                  service_name: svc?.name || svc?.service_name || "",
                  amount:       svc?.price ? parseFloat(svc.price) : f.amount,
                }));
              }}
                className="w-full border border-slate-200 rounded-xl text-sm px-3 py-2.5 focus:outline-none bg-white">
                <option value="">Select service...</option>
                {enterpriseServices.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name || s.service_name}{s.price ? ` — $${s.price}` : ""}
                  </option>
                ))}
              </select>
              {formData.service_id && <p className="text-[10px] text-emerald-600 mt-1">✓ Amount auto-filled from service rate</p>}
            </div>
          )}

          {/* 7. Payment */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">
              {isRevenue ? "7." : "6."} How was it paid?
            </label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[10px] text-slate-400 mb-1">Payment method</p>
                <select value={formData.payment_method || "private_pay"} onChange={e => set("payment_method", e.target.value)}
                  className="w-full border border-slate-200 rounded-xl text-sm px-3 py-2.5 focus:outline-none bg-white">
                  {PAYMENT_METHODS.map(m => <option key={m.v} value={m.v}>{m.l}</option>)}
                </select>
              </div>
              <div>
                <p className="text-[10px] text-slate-400 mb-1">Payment status</p>
                <select value={formData.payment_status || "unpaid"} onChange={e => setFormData(f => ({
                  ...f, payment_status: e.target.value,
                  payment_date: e.target.value === "paid" ? new Date().toISOString().slice(0, 10) : f.payment_date,
                }))}
                  className="w-full border border-slate-200 rounded-xl text-sm px-3 py-2.5 focus:outline-none bg-white">
                  <option value="unpaid">Unpaid — awaiting payment</option>
                  <option value="paid">Paid — payment received</option>
                  <option value="partial">Partial — some paid</option>
                  <option value="waived">Waived — no charge</option>
                  <option value="na">N/A</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <div>
                <p className="text-[10px] text-slate-400 mb-1">Transaction date</p>
                <input type="date" value={formData.date || ""} onChange={e => set("date", e.target.value)}
                  className="w-full border border-slate-200 rounded-xl text-sm px-3 py-2.5 focus:outline-none" />
              </div>
              {isRevenue && (
                <div>
                  <p className="text-[10px] text-slate-400 mb-1">Payment due date</p>
                  <input type="date" value={formData.due_date || ""} onChange={e => set("due_date", e.target.value)}
                    className="w-full border border-slate-200 rounded-xl text-sm px-3 py-2.5 focus:outline-none" />
                </div>
              )}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">
              Notes <span className="text-slate-400 font-normal">(optional)</span>
            </label>
            <textarea value={formData.notes || ""} onChange={e => set("notes", e.target.value)}
              placeholder="Any additional notes..." rows={2}
              className="w-full border border-slate-200 rounded-xl text-sm px-3 py-2.5 focus:outline-none resize-none" />
          </div>

          {/* Tags */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">
              Tags <span className="text-slate-400 font-normal">(optional)</span>
            </label>
            <p className="text-xs text-slate-400 mb-2">Press Enter or comma to add a tag</p>
            <TagInput value={formData.tags || []} onChange={(tags) => set("tags", tags)} placeholder="e.g. q1, reimbursable, priority" />
          </div>

          {/* Summary */}
          {parseFloat(formData.amount) > 0 && (
            <div className={`rounded-xl p-4 ${isRevenue ? "bg-emerald-50 border border-emerald-100" : isExpense ? "bg-rose-50 border border-rose-100" : "bg-amber-50 border border-amber-100"}`}>
              <p className="text-xs font-bold text-slate-600 mb-2">Transaction Summary</p>
              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">Type:</span>
                  <span className="font-medium text-slate-700">{TRANSACTION_TYPES[formData.transaction_type] || formData.transaction_type}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">Amount:</span>
                  <span className="font-bold text-slate-800">{formData.currency} {parseFloat(formData.amount || 0).toFixed(2)}</span>
                </div>
                {formData.primary_person && (
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Person:</span>
                    <span className="text-slate-700">{formData.primary_person}</span>
                  </div>
                )}
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">Status:</span>
                  <span className="font-medium text-slate-700 capitalize">{formData.payment_status || "unpaid"}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white border-t border-slate-100 px-6 py-4 flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 transition-all">
            Cancel
          </button>
          <button onClick={handleSubmit}
            disabled={!formData.enterprise || !formData.amount || parseFloat(formData.amount) <= 0}
            className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed">
            {initialData?.id ? "Save Changes" : "Save Transaction"}
          </button>
        </div>
      </div>
    </div>
  );
}