import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Save, X, Plus, Trash2, Upload, FileText, Package, Users, CreditCard, StickyNote, AlertTriangle, MapPin } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";

const TABS = [
  { id: "details",  label: "Identity & Context", icon: FileText },
  { id: "parties",  label: "Parties",             icon: Users },
  { id: "lines",    label: "Items / Lines",        icon: Package },
  { id: "payment",  label: "Payment",              icon: CreditCard },
  { id: "notes",    label: "Notes & Files",        icon: StickyNote },
];

export const TX_TYPES = [
  { value: "stock_in",        label: "Stock In" },
  { value: "stock_out",       label: "Stock Out" },
  { value: "stock_transfer",  label: "Stock Transfer" },
  { value: "item_assignment", label: "Item Assignment" },
  { value: "item_return",     label: "Item Return" },
  { value: "sale_service",    label: "Sale / Service" },
  { value: "expense",         label: "Expense" },
  { value: "adjustment",      label: "Adjustment" },
  { value: "attendance",      label: "Attendance" },
];

const FINANCIAL_TYPES = ["sale_service", "expense", "stock_in", "stock_out"];
const TRANSFER_TYPES  = ["stock_transfer"];
const ASSIGNMENT_TYPES = ["item_assignment", "item_return", "attendance"];

function Field({ label, hint, children }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium text-slate-700">{label}</Label>
      {children}
      {hint && <p className="text-xs text-slate-400">{hint}</p>}
    </div>
  );
}

function Sel({ value, onChange, options, placeholder }) {
  return (
    <Select value={value || ""} onValueChange={onChange}>
      <SelectTrigger className="rounded-xl border-slate-200">
        <SelectValue placeholder={placeholder || "Select..."} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function EntityCombo({ value, onChange, items, labelKey, placeholder }) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const filtered = (items || []).filter((i) =>
    (i[labelKey] || "").toLowerCase().includes(search.toLowerCase())
  ).slice(0, 8);

  return (
    <div className="relative">
      <Input
        value={value || ""}
        onChange={(e) => { onChange(e.target.value); setSearch(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 180)}
        className="rounded-xl"
        placeholder={placeholder || "Search or type..."}
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-50 top-full mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
          {filtered.map((item) => (
            <button
              key={item.id}
              type="button"
              className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 transition-colors"
              onMouseDown={() => { onChange(item[labelKey]); setOpen(false); }}
            >
              {item[labelKey]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function TransactionForm({ open, onClose, onSubmit, initialData }) {
  const [activeTab, setActiveTab] = useState("details");
  const [form, setForm] = useState({});
  const [uploading, setUploading] = useState(false);

  // Master data lookups (read-only consumers)
  const { data: enterprises = [] } = useQuery({
    queryKey: ["tx-enterprises"],
    queryFn: () => base44.entities.Enterprise.filter({ status: "active" }, "enterprise_name"),
    enabled: open,
  });
  const { data: people = [] } = useQuery({
    queryKey: ["tx-people"],
    queryFn: () => base44.entities.Person.filter({ status: "active" }, "first_name"),
    enabled: open,
  });
  const { data: products = [] } = useQuery({
    queryKey: ["tx-products"],
    queryFn: () => base44.entities.Product.filter({ status: "active" }, "name"),
    enabled: open,
  });
  const { data: addresses = [] } = useQuery({
    queryKey: ["tx-addresses"],
    queryFn: () => base44.entities.Address.filter({ status: "active" }, "label"),
    enabled: open,
  });

  const peopleOptions = people.map((p) => ({
    id: p.id,
    full_name: `${p.first_name} ${p.last_name}`,
    display: `${p.first_name} ${p.last_name}${p.primary_role ? ` · ${p.primary_role}` : ""}`,
  }));

  useEffect(() => {
    if (open) {
      setActiveTab("details");
      const today = new Date().toISOString().split("T")[0];
      const now = new Date().toTimeString().slice(0, 5);
      setForm(initialData || {
        status: "draft",
        date: today,
        time: now,
        line_items: [],
        tax_amount: 0,
        attachment_urls: [],
        payment_method: "cash",
        payment_status: "na",
      });
    }
  }, [open, initialData]);

  const isPosted = form.status === "posted";
  const isVoided = form.status === "voided";
  const isLocked = isPosted || isVoided;

  const set = (key, val) => { if (isLocked) return; setForm((f) => ({ ...f, [key]: val })); };
  const addLine = () => set("line_items", [...(form.line_items || []), { item_name: "", quantity: 1, unit: "piece", unit_price: 0 }]);
  const removeLine = (idx) => set("line_items", (form.line_items || []).filter((_, i) => i !== idx));
  const updateLine = (idx, field, val) => {
    if (isLocked) return;
    setForm((f) => ({ ...f, line_items: (f.line_items || []).map((l, i) => i === idx ? { ...l, [field]: val } : l) }));
  };

  const subtotal = (form.line_items || []).reduce((s, l) => s + (parseFloat(l.quantity) || 0) * (parseFloat(l.unit_price) || 0), 0);
  const tax = parseFloat(form.tax_amount) || 0;
  const total = subtotal + tax;

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    setForm((f) => ({ ...f, attachment_urls: [...(f.attachment_urls || []), file_url] }));
    setUploading(false);
  };

  const handleSubmit = (e) => { e.preventDefault(); onSubmit({ ...form, amount: total }); };
  const handlePost  = () => onSubmit({ ...form, amount: total, status: "posted" });
  const handleVoid  = () => { const reason = prompt("Reason for voiding this transaction?"); if (reason) onSubmit({ ...form, status: "voided", voided_reason: reason }); };

  const isFinancial  = FINANCIAL_TYPES.includes(form.transaction_type);
  const isTransfer   = TRANSFER_TYPES.includes(form.transaction_type);
  const isAssignment = ASSIGNMENT_TYPES.includes(form.transaction_type);

  const statusColors = { draft: "bg-amber-50 text-amber-700", posted: "bg-emerald-50 text-emerald-700", voided: "bg-slate-100 text-slate-500" };
  const currentIdx = TABS.findIndex((t) => t.id === activeTab);

  const renderTab = () => {
    switch (activeTab) {

      case "details":
        return (
          <div className="space-y-4">
            {isLocked && (
              <div className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium ${isVoided ? "bg-slate-100 text-slate-500" : "bg-emerald-50 text-emerald-700 border border-emerald-200"}`}>
                <AlertTriangle className="w-4 h-4 shrink-0" />
                {isVoided ? "This transaction has been voided. History is preserved." : "Posted transactions cannot be edited. Corrections require a new transaction."}
              </div>
            )}
            <Field label="Enterprise" hint="Primary enterprise context">
              <EntityCombo
                value={form.enterprise}
                onChange={(v) => set("enterprise", v)}
                items={enterprises}
                labelKey="enterprise_name"
                placeholder="Select or type enterprise..."
              />
            </Field>
            <Field label="Address / Location" hint="Where the event physically happened">
              <EntityCombo
                value={form.address}
                onChange={(v) => set("address", v)}
                items={addresses.map((a) => ({ ...a, label: a.label || a.address_line1 }))}
                labelKey="label"
                placeholder="Select or type address..."
              />
            </Field>
            <Field label="Reference Number">
              <Input disabled={isLocked} value={form.reference_number || ""} onChange={(e) => set("reference_number", e.target.value)} className="rounded-xl" placeholder="Optional external ref" />
            </Field>
            <Field label="Reason / Description">
              <Textarea disabled={isLocked} value={form.description || ""} onChange={(e) => set("description", e.target.value)} className="rounded-xl resize-none" rows={3} placeholder="What happened and why..." />
            </Field>
          </div>
        );

      case "parties":
        return (
          <div className="space-y-4">
            <div className="bg-blue-50 rounded-xl p-3 text-xs text-blue-700 space-y-0.5">
              <p className="font-semibold">Parties are always looked up — never defined here.</p>
              <p>• Stock Transfer → From + To Enterprise</p>
              <p>• Sale / Service → Counterparty (customer/vendor)</p>
              <p>• Assignment / Attendance → Primary Person</p>
            </div>

            <Field label="Primary Person" hint="Main actor: employee, nurse, driver">
              <EntityCombo
                value={form.primary_person}
                onChange={(v) => set("primary_person", v)}
                items={peopleOptions}
                labelKey="display"
                placeholder="Search people..."
              />
            </Field>
            <Field label="Secondary Person" hint="Optional second participant">
              <EntityCombo
                value={form.secondary_person}
                onChange={(v) => set("secondary_person", v)}
                items={peopleOptions}
                labelKey="display"
                placeholder="Search people..."
              />
            </Field>
            <Field label="Counterparty" hint="Customer, vendor, patient, or external enterprise">
              <Input disabled={isLocked} value={form.counterparty || ""} onChange={(e) => set("counterparty", e.target.value)} className="rounded-xl" placeholder="Name or lookup..." />
            </Field>

            {(isTransfer || form.transaction_type === "stock_in" || form.transaction_type === "stock_out") && (
              <>
                <Field label="From Enterprise" hint="Source (transfers / returns)">
                  <EntityCombo
                    value={form.from_enterprise}
                    onChange={(v) => set("from_enterprise", v)}
                    items={enterprises}
                    labelKey="enterprise_name"
                    placeholder="Source enterprise..."
                  />
                </Field>
                <Field label="To Enterprise" hint="Destination">
                  <EntityCombo
                    value={form.to_enterprise}
                    onChange={(v) => set("to_enterprise", v)}
                    items={enterprises}
                    labelKey="enterprise_name"
                    placeholder="Destination enterprise..."
                  />
                </Field>
              </>
            )}
          </div>
        );

      case "lines":
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              {(form.line_items || []).length > 0 && (
                <div className="grid grid-cols-12 gap-2 px-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  <span className="col-span-4">Item</span>
                  <span className="col-span-2">Qty</span>
                  <span className="col-span-2">Unit</span>
                  <span className="col-span-2">Price</span>
                  <span className="col-span-1">Batch</span>
                  <span className="col-span-1" />
                </div>
              )}
              {(form.line_items || []).map((line, i) => (
                <div key={i} className="grid grid-cols-12 gap-1.5 items-center bg-slate-50 rounded-xl p-2">
                  {/* Item name with lookup */}
                  <div className="col-span-4 relative">
                    <EntityCombo
                      value={line.item_name}
                      onChange={(v) => updateLine(i, "item_name", v)}
                      items={products}
                      labelKey="name"
                      placeholder="Item..."
                    />
                  </div>
                  <Input type="number" value={line.quantity ?? ""} onChange={(e) => updateLine(i, "quantity", parseFloat(e.target.value) || 0)} className="col-span-2 rounded-lg text-xs h-8" disabled={isLocked} />
                  <Input placeholder="unit" value={line.unit || ""} onChange={(e) => updateLine(i, "unit", e.target.value)} className="col-span-2 rounded-lg text-xs h-8" disabled={isLocked} />
                  <Input type="number" value={line.unit_price ?? ""} onChange={(e) => updateLine(i, "unit_price", parseFloat(e.target.value) || 0)} className="col-span-2 rounded-lg text-xs h-8" placeholder="0.00" disabled={isLocked} />
                  <Input placeholder="batch" value={line.batch_lot || ""} onChange={(e) => updateLine(i, "batch_lot", e.target.value)} className="col-span-1 rounded-lg text-xs h-8" disabled={isLocked} />
                  {!isLocked && (
                    <button type="button" onClick={() => removeLine(i)} className="col-span-1 text-slate-400 hover:text-rose-500 flex justify-center"><Trash2 className="w-3.5 h-3.5" /></button>
                  )}
                </div>
              ))}
              {(form.line_items || []).length === 0 && (
                <p className="text-xs text-slate-400 text-center py-4">No items added — required for stock, sale, and inventory transactions</p>
              )}
            </div>
            {!isLocked && (
              <Button type="button" variant="outline" size="sm" className="rounded-xl text-xs w-full" onClick={addLine}>
                <Plus className="w-3 h-3 mr-1" /> Add Item Line
              </Button>
            )}

            {/* Totals */}
            <div className="bg-slate-50 rounded-xl p-4 space-y-2 text-sm">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal</span><span>${subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center text-slate-600">
                <span>Tax</span>
                {isLocked
                  ? <span>${tax.toFixed(2)}</span>
                  : <Input type="number" value={form.tax_amount ?? 0} onChange={(e) => set("tax_amount", parseFloat(e.target.value) || 0)} className="rounded-lg h-7 text-xs w-24 text-right" />
                }
              </div>
              <div className="flex justify-between font-bold text-slate-800 text-base border-t border-slate-200 pt-2">
                <span>Total Amount</span><span>${total.toFixed(2)}</span>
              </div>
            </div>
          </div>
        );

      case "payment":
        return (
          <div className="space-y-4">
            {!isFinancial && (
              <div className="bg-slate-50 rounded-xl p-3 text-xs text-slate-500 text-center">Payment details apply to financial transaction types (Sale, Expense, Stock In/Out)</div>
            )}
            <Field label="Payment Method">
              <Sel value={form.payment_method} onChange={(v) => set("payment_method", v)} options={[
                { value: "cash", label: "Cash" }, { value: "bank_transfer", label: "Bank Transfer" },
                { value: "credit_card", label: "Credit Card" }, { value: "mobile_money", label: "Mobile Money" },
                { value: "check", label: "Check" }, { value: "other", label: "Other" },
              ]} />
            </Field>
            <Field label="Payment Status">
              <Sel value={form.payment_status} onChange={(v) => set("payment_status", v)} options={[
                { value: "paid", label: "Paid" }, { value: "unpaid", label: "Unpaid" },
                { value: "partial", label: "Partial" }, { value: "na", label: "N/A" },
              ]} />
            </Field>
            <Field label="Amount Paid">
              <Input type="number" disabled={isLocked} value={form.amount_paid ?? total} onChange={(e) => set("amount_paid", parseFloat(e.target.value) || 0)} className="rounded-xl" placeholder="0.00" />
            </Field>
            {(form.payment_status === "unpaid" || form.payment_status === "partial") && (
              <Field label="Due Date">
                <Input type="date" disabled={isLocked} value={form.due_date || ""} onChange={(e) => set("due_date", e.target.value)} className="rounded-xl" />
              </Field>
            )}
          </div>
        );

      case "notes":
        return (
          <div className="space-y-5">
            <Field label="Internal Notes" hint="Pure context — not logic-driving">
              <Textarea disabled={isLocked} value={form.internal_notes || ""} onChange={(e) => set("internal_notes", e.target.value)} className="rounded-xl resize-none" rows={5} placeholder="Notes visible only internally..." />
            </Field>
            {isPosted && form.source_task_id && (
              <div className="text-xs text-slate-400 bg-slate-50 rounded-xl px-4 py-3">
                Triggered by Task: <span className="font-mono text-slate-600">{form.source_task_id}</span>
              </div>
            )}
            <Field label="Attachments" hint="Receipts, proofs, evidence">
              <div className="space-y-2">
                {(form.attachment_urls || []).map((url, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <a href={url} target="_blank" rel="noreferrer" className="text-sm text-emerald-600 underline truncate flex-1">Attachment {i + 1}</a>
                    {!isLocked && (
                      <button type="button" onClick={() => setForm((f) => ({ ...f, attachment_urls: f.attachment_urls.filter((_, j) => j !== i) }))} className="text-slate-400 hover:text-rose-500">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
                {!isLocked && (
                  <label className="flex items-center gap-3 border-2 border-dashed border-slate-200 rounded-xl px-4 py-5 cursor-pointer hover:border-emerald-400 transition-colors">
                    <Upload className="w-5 h-5 text-slate-400" />
                    <span className="text-sm text-slate-500">{uploading ? "Uploading..." : "Click to upload file"}</span>
                    <input type="file" className="hidden" onChange={handleFileUpload} disabled={uploading} />
                  </label>
                )}
              </div>
            </Field>
          </div>
        );

      default: return null;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl w-full p-0 overflow-hidden max-h-[92vh]">
        {/* Header */}
        <DialogHeader className="px-6 pt-5 pb-4 border-b border-slate-100">
          <div className="flex flex-wrap gap-3 items-start justify-between">
            <div>
              <DialogTitle className="text-lg font-semibold text-slate-800">
                {initialData ? "Transaction" : "New Transaction"}
              </DialogTitle>
              {initialData?.id && <p className="text-xs text-slate-400 mt-0.5 font-mono">#{initialData.id.slice(0, 8).toUpperCase()}</p>}
            </div>
            <Badge className={statusColors[form.status] || "bg-slate-100 text-slate-500"}>
              ● {(form.status || "draft").replace(/_/g, " ")}
            </Badge>
          </div>
          {/* Identity fields always visible in header */}
          <div className="grid grid-cols-3 gap-3 mt-3">
            <div className="col-span-1">
              <Label className="text-xs text-slate-500 mb-1 block">Transaction Type *</Label>
              <Sel value={form.transaction_type} onChange={(v) => set("transaction_type", v)} options={TX_TYPES} placeholder="Select type..." />
            </div>
            <div>
              <Label className="text-xs text-slate-500 mb-1 block">Date *</Label>
              <Input type="date" disabled={isLocked} value={form.date || ""} onChange={(e) => set("date", e.target.value)} className="rounded-xl h-9 text-sm" />
            </div>
            <div>
              <Label className="text-xs text-slate-500 mb-1 block">Time</Label>
              <Input type="time" disabled={isLocked} value={form.time || ""} onChange={(e) => set("time", e.target.value)} className="rounded-xl h-9 text-sm" />
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="flex overflow-hidden">
            {/* Tab Nav */}
            <div className="bg-slate-50/60 px-3 py-4 shrink-0 border-r border-slate-100 min-h-[360px]">
              {TABS.map((t) => {
                const Icon = t.icon;
                const active = activeTab === t.id;
                return (
                  <button key={t.id} type="button" onClick={() => setActiveTab(t.id)}
                    className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm text-left w-full mb-0.5 transition-all
                      ${active ? "bg-emerald-50 text-emerald-700 font-medium" : "text-slate-500 hover:bg-white hover:text-slate-700"}`}>
                    <Icon className={`w-4 h-4 shrink-0 ${active ? "text-emerald-600" : "text-slate-400"}`} />
                    <span className="whitespace-nowrap">{t.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Content */}
            <div className="flex-1 px-6 py-5 overflow-y-auto max-h-[380px]">
              <div className="mb-4">
                <h3 className="text-sm font-semibold text-slate-700">{TABS.find((t) => t.id === activeTab)?.label}</h3>
                <div className="h-px bg-slate-100 mt-2" />
              </div>
              {renderTab()}
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 bg-slate-50/40">
            <div className="flex gap-2">
              {currentIdx > 0 && (
                <Button type="button" variant="outline" size="sm" className="rounded-xl" onClick={() => setActiveTab(TABS[currentIdx - 1].id)}>← Back</Button>
              )}
              {currentIdx < TABS.length - 1 && (
                <Button type="button" variant="outline" size="sm" className="rounded-xl" onClick={() => setActiveTab(TABS[currentIdx + 1].id)}>Next →</Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={onClose} className="rounded-xl text-sm"><X className="w-4 h-4 mr-1" /> Close</Button>
              {isVoided && (
                <span className="text-xs text-slate-400 self-center italic">Voided — read only</span>
              )}
              {isPosted && !isVoided && (
                <Button type="button" variant="outline" onClick={handleVoid} className="rounded-xl text-sm border-rose-300 text-rose-600 hover:bg-rose-50">
                  Void Transaction
                </Button>
              )}
              {!isLocked && (
                <>
                  <Button type="submit" variant="outline" className="rounded-xl text-sm border-amber-300 text-amber-700 hover:bg-amber-50">
                    <Save className="w-4 h-4 mr-2" /> Save Draft
                  </Button>
                  <Button type="button" onClick={handlePost} className="bg-emerald-600 hover:bg-emerald-700 rounded-xl text-sm shadow-lg shadow-emerald-500/20">
                    Post Transaction
                  </Button>
                </>
              )}
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}