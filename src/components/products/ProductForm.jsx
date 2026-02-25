import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Save, X, Plus, Trash2, Upload, Package, Tag, BarChart2, Link2, Clock, Shield, FileText } from "lucide-react";
import { base44 } from "@/api/base44Client";
import RelatedEntitiesPanel from "@/components/shared/RelatedEntitiesPanel";

const TABS = [
  { id: "basic", label: "Basic Info", icon: Package },
  { id: "classification", label: "Classification", icon: Tag },
  { id: "stock", label: "Stock & Pricing", icon: BarChart2 },
  { id: "assignment", label: "Assignment", icon: Link2 },
  { id: "lifecycle", label: "Lifecycle & Condition", icon: Clock },
  { id: "compliance", label: "Compliance & Tracking", icon: Shield },
  { id: "notes", label: "Notes & Files", icon: FileText },
  { id: "relationships", label: "Relationships", icon: Link2 },
];

const ITEM_CLASSES = ["asset", "inventory", "service", "digital"];

function Field({ label, children, required }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium text-slate-700">
        {label}{required && <span className="text-rose-500 ml-0.5">*</span>}
      </Label>
      {children}
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

export default function ProductForm({ open, onClose, onSubmit, onArchive, initialData }) {
  const [activeTab, setActiveTab] = useState("basic");
  const [form, setForm] = useState({});
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (open) {
      setActiveTab("basic");
      setForm(initialData || {
        status: "active",
        unit: "piece",
        item_class: [],
        assigned_enterprises: [],
        assigned_persons: [],
        attachment_urls: [],
        maintenance_required: false,
      });
    }
  }, [open, initialData]);

  const set = (key, val) => setForm((f) => ({ ...f, [key]: val }));
  const addItem = (key, item) => set(key, [...(form[key] || []), item]);
  const removeItem = (key, idx) => set(key, (form[key] || []).filter((_, i) => i !== idx));
  const updateItem = (key, idx, field, val) => set(key, (form[key] || []).map((item, i) => i === idx ? { ...item, [field]: val } : item));

  const toggleClass = (cls) => {
    const current = form.item_class || [];
    set("item_class", current.includes(cls) ? current.filter((c) => c !== cls) : [...current, cls]);
  };

  const totalStockValue = ((form.stock_quantity || 0) * (form.cost_price || 0)).toFixed(2);
  const isExpired = form.expiry_date && new Date(form.expiry_date) < new Date();
  const isLowStock = form.stock_quantity != null && form.min_stock_level != null && form.stock_quantity <= form.min_stock_level;

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    set("attachment_urls", [...(form.attachment_urls || []), file_url]);
    setUploading(false);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(form);
  };

  const renderTab = () => {
    switch (activeTab) {
      case "basic":
        return (
          <div className="space-y-4">
            <Field label="Item Name" required>
              <Input value={form.name || ""} onChange={(e) => set("name", e.target.value)} className="rounded-xl" required />
            </Field>
            <Field label="SKU / Code">
              <Input value={form.sku || ""} onChange={(e) => set("sku", e.target.value)} className="rounded-xl" placeholder="Optional" />
            </Field>
            <Field label="Description">
              <Textarea value={form.description || ""} onChange={(e) => set("description", e.target.value)} className="rounded-xl resize-none" rows={3} />
            </Field>
            <Field label="Item Status">
              <Sel value={form.status} onChange={(v) => set("status", v)} options={[
                { value: "active", label: "Active" }, { value: "discontinued", label: "Discontinued" },
                { value: "out_of_stock", label: "Out of Stock" }, { value: "archived", label: "Archived" },
              ]} />
            </Field>
          </div>
        );

      case "classification":
        return (
          <div className="space-y-5">
            <Field label="Item Type">
              <Sel value={form.item_type} onChange={(v) => set("item_type", v)} options={[
                { value: "inventory_item", label: "Inventory Item" }, { value: "fixed_asset", label: "Fixed Asset" },
                { value: "service_item", label: "Service Item" }, { value: "digital_item", label: "Digital Item" },
                { value: "consumable", label: "Consumable" }, { value: "raw_material", label: "Raw Material" },
                { value: "other", label: "Other" },
              ]} />
            </Field>
            <Field label="Item Category">
              <Sel value={form.category} onChange={(v) => set("category", v)} options={[
                { value: "electronics", label: "Electronics" }, { value: "food_beverage", label: "Food & Beverage" },
                { value: "clothing", label: "Clothing" }, { value: "office_supplies", label: "Office Supplies" },
                { value: "raw_materials", label: "Raw Materials" }, { value: "tools_equipment", label: "Tools & Equipment" },
                { value: "health_beauty", label: "Health & Beauty" }, { value: "household", label: "Household" },
                { value: "vehicles", label: "Vehicles" }, { value: "equipment", label: "Equipment" },
                { value: "other", label: "Other" },
              ]} />
            </Field>
            <Field label="Item Class (select all that apply)">
              <div className="flex flex-wrap gap-2 mt-1">
                {ITEM_CLASSES.map((c) => {
                  const active = (form.item_class || []).includes(c);
                  return (
                    <button key={c} type="button" onClick={() => toggleClass(c)}
                      className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-all capitalize
                        ${active ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-slate-600 border-slate-200 hover:border-emerald-400"}`}>
                      {c}
                    </button>
                  );
                })}
              </div>
            </Field>
          </div>
        );

      case "stock":
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Quantity in Stock">
                <Input type="number" value={form.stock_quantity ?? ""} onChange={(e) => set("stock_quantity", parseFloat(e.target.value) || 0)} className="rounded-xl" />
              </Field>
              <Field label="Unit of Measure">
                <Sel value={form.unit} onChange={(v) => set("unit", v)} options={[
                  { value: "piece", label: "Pieces" }, { value: "kg", label: "Kg" }, { value: "liter", label: "Liter" },
                  { value: "meter", label: "Meter" }, { value: "box", label: "Box" }, { value: "pack", label: "Pack" },
                  { value: "dozen", label: "Dozen" }, { value: "other", label: "Other" },
                ]} />
              </Field>
              <Field label="Reorder Level">
                <Input type="number" value={form.min_stock_level ?? ""} onChange={(e) => set("min_stock_level", parseFloat(e.target.value) || 0)} className="rounded-xl" />
              </Field>
              <Field label="Supplier">
                <Input value={form.supplier || ""} onChange={(e) => set("supplier", e.target.value)} className="rounded-xl" />
              </Field>
              <Field label="Purchase Cost">
                <Input type="number" value={form.cost_price ?? ""} onChange={(e) => set("cost_price", parseFloat(e.target.value) || 0)} className="rounded-xl" placeholder="0.00" />
              </Field>
              <Field label="Selling Price">
                <Input type="number" value={form.unit_price ?? ""} onChange={(e) => set("unit_price", parseFloat(e.target.value) || 0)} className="rounded-xl" placeholder="0.00" />
              </Field>
            </div>
            {(form.stock_quantity || form.cost_price) ? (
              <div className="bg-emerald-50 rounded-xl px-4 py-3 flex items-center justify-between">
                <span className="text-sm text-emerald-700 font-medium">Total Stock Value (Cost)</span>
                <span className="text-lg font-bold text-emerald-800">${parseFloat(totalStockValue).toLocaleString()}</span>
              </div>
            ) : null}
          </div>
        );

      case "assignment":
        return (
          <div className="space-y-6">
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Assigned to Enterprise</p>
                <Button type="button" variant="outline" size="sm" className="rounded-xl text-xs h-7"
                  onClick={() => addItem("assigned_enterprises", { enterprise_name: "", location: "", since: "" })}>
                  <Plus className="w-3 h-3 mr-1" /> Assign Enterprise
                </Button>
              </div>
              <div className="space-y-2">
                {(form.assigned_enterprises || []).map((e, i) => (
                  <div key={i} className="flex gap-2 items-center bg-slate-50 rounded-xl p-2">
                    <Input placeholder="Enterprise Name" value={e.enterprise_name || ""} onChange={(ev) => updateItem("assigned_enterprises", i, "enterprise_name", ev.target.value)} className="rounded-lg text-xs h-8 flex-1" />
                    <Input placeholder="Location" value={e.location || ""} onChange={(ev) => updateItem("assigned_enterprises", i, "location", ev.target.value)} className="rounded-lg text-xs h-8 w-24" />
                    <Input placeholder="Since" value={e.since || ""} onChange={(ev) => updateItem("assigned_enterprises", i, "since", ev.target.value)} className="rounded-lg text-xs h-8 w-20" />
                    <button type="button" onClick={() => removeItem("assigned_enterprises", i)} className="text-slate-400 hover:text-rose-500"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                ))}
                {(form.assigned_enterprises || []).length === 0 && <p className="text-xs text-slate-400 py-3 text-center">No enterprises assigned</p>}
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Assigned to Person</p>
                <Button type="button" variant="outline" size="sm" className="rounded-xl text-xs h-7"
                  onClick={() => addItem("assigned_persons", { person_name: "", role: "", since: "" })}>
                  <Plus className="w-3 h-3 mr-1" /> Assign Person
                </Button>
              </div>
              <div className="space-y-2">
                {(form.assigned_persons || []).map((p, i) => (
                  <div key={i} className="flex gap-2 items-center bg-slate-50 rounded-xl p-2">
                    <Input placeholder="Person Name" value={p.person_name || ""} onChange={(ev) => updateItem("assigned_persons", i, "person_name", ev.target.value)} className="rounded-lg text-xs h-8 flex-1" />
                    <Input placeholder="Role" value={p.role || ""} onChange={(ev) => updateItem("assigned_persons", i, "role", ev.target.value)} className="rounded-lg text-xs h-8 w-28" />
                    <Input placeholder="Since" value={p.since || ""} onChange={(ev) => updateItem("assigned_persons", i, "since", ev.target.value)} className="rounded-lg text-xs h-8 w-20" />
                    <button type="button" onClick={() => removeItem("assigned_persons", i)} className="text-slate-400 hover:text-rose-500"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                ))}
                {(form.assigned_persons || []).length === 0 && <p className="text-xs text-slate-400 py-3 text-center">No persons assigned</p>}
              </div>
            </div>
          </div>
        );

      case "lifecycle":
        return (
          <div className="space-y-4">
            <Field label="Condition">
              <Sel value={form.condition} onChange={(v) => set("condition", v)} options={[
                { value: "new", label: "New" }, { value: "good", label: "Good" }, { value: "fair", label: "Fair" },
                { value: "poor", label: "Poor" }, { value: "damaged", label: "Damaged" }, { value: "under_repair", label: "Under Repair" },
              ]} />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Acquisition Date">
                <Input type="date" value={form.acquisition_date || ""} onChange={(e) => set("acquisition_date", e.target.value)} className="rounded-xl" />
              </Field>
              <Field label="Warranty End Date">
                <Input type="date" value={form.warranty_end_date || ""} onChange={(e) => set("warranty_end_date", e.target.value)} className="rounded-xl" />
              </Field>
              <Field label="Expiry Date (if applicable)">
                <Input type="date" value={form.expiry_date || ""} onChange={(e) => set("expiry_date", e.target.value)} className="rounded-xl" />
              </Field>
            </div>
            <Field label="Maintenance Required">
              <div className="flex gap-4 mt-1">
                {[true, false].map((v) => (
                  <label key={String(v)} className="flex items-center gap-2 cursor-pointer text-sm text-slate-700">
                    <input type="radio" checked={form.maintenance_required === v} onChange={() => set("maintenance_required", v)} className="accent-emerald-600" />
                    {v ? "Yes" : "No"}
                  </label>
                ))}
              </div>
            </Field>
          </div>
        );

      case "compliance":
        return (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Batch / Lot Number">
                <Input value={form.batch_number || ""} onChange={(e) => set("batch_number", e.target.value)} className="rounded-xl" />
              </Field>
              <Field label="Serial Number">
                <Input value={form.serial_number || ""} onChange={(e) => set("serial_number", e.target.value)} className="rounded-xl" />
              </Field>
            </div>
            <Field label="Regulatory Status">
              <Sel value={form.regulatory_status} onChange={(v) => set("regulatory_status", v)} options={[
                { value: "compliant", label: "Compliant" }, { value: "non_compliant", label: "Non-Compliant" },
                { value: "pending_review", label: "Pending Review" }, { value: "exempt", label: "Exempt" },
              ]} />
            </Field>
            <div className="bg-amber-50 rounded-xl p-4">
              <p className="text-xs font-semibold text-amber-700 uppercase tracking-wider mb-2">Risk Flags (auto)</p>
              <div className="space-y-1.5 text-sm text-slate-600">
                <label className="flex items-center gap-2">
                  <input type="checkbox" className="rounded" checked={!!isExpired} readOnly />
                  <span>Expired</span>
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" className="rounded" checked={!!isLowStock} readOnly />
                  <span>Low Stock</span>
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" className="rounded" checked={(form.assigned_enterprises || []).length === 0 && (form.assigned_persons || []).length === 0} readOnly />
                  <span>Missing Assignment</span>
                </label>
              </div>
            </div>
          </div>
        );

      case "notes":
        return (
          <div className="space-y-5">
            <Field label="Internal Notes">
              <Textarea value={form.internal_notes || ""} onChange={(e) => set("internal_notes", e.target.value)} className="rounded-xl resize-none" rows={5} placeholder="Notes visible only internally..." />
            </Field>
            <Field label="Attachments">
              <div className="space-y-2">
                {(form.attachment_urls || []).map((url, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <a href={url} target="_blank" rel="noreferrer" className="text-sm text-emerald-600 underline truncate flex-1">Attachment {i + 1}</a>
                    <button type="button" onClick={() => set("attachment_urls", form.attachment_urls.filter((_, j) => j !== i))} className="text-slate-400 hover:text-rose-500">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
                <label className="flex items-center gap-3 border-2 border-dashed border-slate-200 rounded-xl px-4 py-5 cursor-pointer hover:border-emerald-400 transition-colors">
                  <Upload className="w-5 h-5 text-slate-400" />
                  <span className="text-sm text-slate-500">{uploading ? "Uploading..." : "Click to upload file"}</span>
                  <input type="file" className="hidden" onChange={handleFileUpload} disabled={uploading} />
                </label>
              </div>
            </Field>
          </div>
        );

      default:
        return null;
    }
  };

  const currentIdx = TABS.findIndex((t) => t.id === activeTab);

  const statusColors = {
    active: "bg-emerald-50 text-emerald-700",
    discontinued: "bg-slate-100 text-slate-500",
    out_of_stock: "bg-rose-50 text-rose-700",
    archived: "bg-slate-100 text-slate-400",
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl w-full p-0 overflow-hidden max-h-[92vh]">
        {/* Header */}
        <DialogHeader className="px-6 pt-5 pb-4 border-b border-slate-100">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-lg font-semibold text-slate-800">
                {initialData ? "Edit Item / Product" : "New Item / Product"}
              </DialogTitle>
              {initialData?.id && <p className="text-xs text-slate-400 mt-0.5">ID: {initialData.id.slice(0, 8).toUpperCase()}</p>}
            </div>
            <Badge className={statusColors[form.status] || "bg-slate-100 text-slate-500"}>
              ● {(form.status || "active").replace(/_/g, " ")}
            </Badge>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="flex overflow-hidden">
            {/* Tab Nav */}
            <div className="bg-slate-50/60 px-3 py-4 shrink-0 border-r border-slate-100 min-h-[460px]">
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
            <div className="flex-1 px-6 py-5 overflow-y-auto max-h-[460px]">
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
              {initialData && onArchive && (
                <Button type="button" variant="outline" size="sm" className="rounded-xl text-amber-600 border-amber-200 hover:bg-amber-50" onClick={() => onArchive(initialData)}>
                  Archive
                </Button>
              )}
              <Button type="button" variant="ghost" onClick={onClose} className="rounded-xl text-sm"><X className="w-4 h-4 mr-1" /> Cancel</Button>
              <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700 rounded-xl text-sm shadow-lg shadow-emerald-500/20">
                <Save className="w-4 h-4 mr-2" /> Save
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}