import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Save, X, Archive, Trash2, Upload, Info, Tag, DollarSign, Clock, Users, StickyNote, Plus } from "lucide-react";
import { base44 } from "@/api/base44Client";

const TABS = [
  { id: "basic", label: "Basic Info", icon: Info },
  { id: "classification", label: "Classification", icon: Tag },
  { id: "pricing", label: "Pricing & Billing", icon: DollarSign },
  { id: "delivery", label: "Delivery & SLA", icon: Clock },
  { id: "assignment", label: "Assignment", icon: Users },
  { id: "notes", label: "Notes & Files", icon: StickyNote },
];

const CATEGORIES = [
  { value: "consulting", label: "Consulting" }, { value: "maintenance", label: "Maintenance" },
  { value: "installation", label: "Installation" }, { value: "delivery", label: "Delivery" },
  { value: "cleaning", label: "Cleaning" }, { value: "training", label: "Training" },
  { value: "design", label: "Design" }, { value: "accounting", label: "Accounting" },
  { value: "legal", label: "Legal" }, { value: "marketing", label: "Marketing" },
  { value: "it_support", label: "IT Support" }, { value: "other", label: "Other" },
];

function Field({ label, required, children }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium text-slate-700">{label}{required && <span className="text-rose-500 ml-0.5">*</span>}</Label>
      {children}
    </div>
  );
}

function RadioGroup({ label, value, onChange, options }) {
  return (
    <Field label={label}>
      <div className="space-y-2">
        {options.map((o) => (
          <label key={o.value} className="flex items-center gap-2.5 cursor-pointer">
            <div onClick={() => onChange(o.value)} className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors ${value === o.value ? "border-emerald-500" : "border-slate-300"}`}>
              {value === o.value && <div className="w-2 h-2 rounded-full bg-emerald-500" />}
            </div>
            <span className="text-sm text-slate-700">{o.label}</span>
          </label>
        ))}
      </div>
    </Field>
  );
}

function CheckboxGroup({ label, value = [], onChange, options }) {
  const toggle = (v) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  return (
    <Field label={label}>
      <div className="space-y-2">
        {options.map((o) => (
          <label key={o.value} className="flex items-center gap-2.5 cursor-pointer">
            <div onClick={() => toggle(o.value)} className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${value.includes(o.value) ? "border-emerald-500 bg-emerald-500" : "border-slate-300"}`}>
              {value.includes(o.value) && <span className="text-white text-[10px] font-bold">✓</span>}
            </div>
            <span className="text-sm text-slate-700">{o.label}</span>
          </label>
        ))}
      </div>
    </Field>
  );
}

export default function ServiceForm({ open, onClose, onSubmit, onArchive, initialData }) {
  const [activeTab, setActiveTab] = useState("basic");
  const [form, setForm] = useState({});
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (open) {
      setActiveTab("basic");
      setForm(initialData || {
        status: "active", service_scope: [], checklist: [], linked_enterprises: [],
        service_roles: [], attachment_urls: [], tax_applicable: false,
        pricing_model: "fixed", duration_unit: "hours",
      });
    }
  }, [open, initialData]);

  const set = (key, val) => setForm((f) => ({ ...f, [key]: val }));

  const addChecklist = () => set("checklist", [...(form.checklist || []), { item: "", required: false }]);
  const updateChecklist = (i, field, val) => set("checklist", (form.checklist || []).map((c, idx) => idx === i ? { ...c, [field]: val } : c));
  const removeChecklist = (i) => set("checklist", (form.checklist || []).filter((_, idx) => idx !== i));

  const addRole = () => set("service_roles", [...(form.service_roles || []), { role: "", required: false }]);
  const updateRole = (i, field, val) => set("service_roles", (form.service_roles || []).map((r, idx) => idx === i ? { ...r, [field]: val } : r));
  const removeRole = (i) => set("service_roles", (form.service_roles || []).filter((_, idx) => idx !== i));

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    set("attachment_urls", [...(form.attachment_urls || []), file_url]);
    setUploading(false);
  };

  const handleSubmit = (e) => { e.preventDefault(); onSubmit(form); };
  const handleSaveAndNew = () => onSubmit(form, true);

  const statusColors = { active: "bg-emerald-50 text-emerald-700", inactive: "bg-amber-50 text-amber-700", archived: "bg-slate-100 text-slate-500" };

  const renderTab = () => {
    switch (activeTab) {
      case "basic":
        return (
          <div className="space-y-4">
            <Field label="Service Name" required>
              <Input value={form.name || ""} onChange={(e) => set("name", e.target.value)} className="rounded-xl" placeholder="e.g. Electrical Maintenance" />
            </Field>
            <Field label="Short Code">
              <Input value={form.short_code || ""} onChange={(e) => set("short_code", e.target.value)} className="rounded-xl" placeholder="e.g. ELEC-M" />
            </Field>
            <Field label="Description">
              <Textarea value={form.description || ""} onChange={(e) => set("description", e.target.value)} className="rounded-xl resize-none" rows={4} placeholder="What this service includes..." />
            </Field>
          </div>
        );

      case "classification":
        return (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Service Category">
                <Select value={form.category || ""} onValueChange={(v) => set("category", v)}>
                  <SelectTrigger className="rounded-xl"><SelectValue placeholder="Select category..." /></SelectTrigger>
                  <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label="Sub-Category">
                <Input value={form.sub_category || ""} onChange={(e) => set("sub_category", e.target.value)} className="rounded-xl" placeholder="e.g. Electrical" />
              </Field>
            </div>
            <RadioGroup label="Service Type" value={form.service_type} onChange={(v) => set("service_type", v)} options={[
              { value: "one_time", label: "One-time" },
              { value: "recurring", label: "Recurring" },
              { value: "on_demand", label: "On-demand" },
            ]} />
            <CheckboxGroup label="Service Scope" value={form.service_scope || []} onChange={(v) => set("service_scope", v)} options={[
              { value: "on_site", label: "On-site" },
              { value: "remote", label: "Remote" },
              { value: "hybrid", label: "Hybrid" },
            ]} />
          </div>
        );

      case "pricing":
        return (
          <div className="space-y-5">
            <RadioGroup label="Pricing Model" value={form.pricing_model} onChange={(v) => set("pricing_model", v)} options={[
              { value: "fixed", label: "Fixed Price" },
              { value: "hourly", label: "Hourly" },
              { value: "per_unit", label: "Per Unit" },
              { value: "subscription", label: "Subscription" },
            ]} />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Base Price">
                <Input type="number" value={form.price ?? ""} onChange={(e) => set("price", parseFloat(e.target.value) || 0)} className="rounded-xl" placeholder="0.00" />
              </Field>
              <Field label="Billing Unit">
                <Select value={form.billing_unit || ""} onValueChange={(v) => set("billing_unit", v)}>
                  <SelectTrigger className="rounded-xl"><SelectValue placeholder="Select unit..." /></SelectTrigger>
                  <SelectContent>
                    {["hour", "day", "week", "month", "unit", "project"].map((u) => <SelectItem key={u} value={u}>{u.charAt(0).toUpperCase() + u.slice(1)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <Field label="Tax Applicable">
              <label className="flex items-center gap-2.5 cursor-pointer">
                <div onClick={() => set("tax_applicable", !form.tax_applicable)} className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${form.tax_applicable ? "border-emerald-500 bg-emerald-500" : "border-slate-300"}`}>
                  {form.tax_applicable && <span className="text-white text-[10px] font-bold">✓</span>}
                </div>
                <span className="text-sm text-slate-700">Yes, tax applies to this service</span>
              </label>
            </Field>
            <div className="bg-blue-50 rounded-xl p-3 text-xs text-blue-600">
              Revenue is recorded in Transactions, not here. This defines the pricing template only.
            </div>
          </div>
        );

      case "delivery":
        return (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Estimated Duration">
                <Input type="number" value={form.estimated_duration ?? ""} onChange={(e) => set("estimated_duration", parseFloat(e.target.value) || 0)} className="rounded-xl" />
              </Field>
              <Field label="Duration Unit">
                <Select value={form.duration_unit || "hours"} onValueChange={(v) => set("duration_unit", v)}>
                  <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="minutes">Minutes</SelectItem>
                    <SelectItem value="hours">Hours</SelectItem>
                    <SelectItem value="days">Days</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Response Time SLA (hours)">
                <Input type="number" value={form.response_sla_hours ?? ""} onChange={(e) => set("response_sla_hours", parseFloat(e.target.value) || 0)} className="rounded-xl" />
              </Field>
              <Field label="Completion SLA (hours)">
                <Input type="number" value={form.completion_sla_hours ?? ""} onChange={(e) => set("completion_sla_hours", parseFloat(e.target.value) || 0)} className="rounded-xl" />
              </Field>
            </div>
            <Field label="Service Checklist">
              <div className="space-y-2">
                {(form.checklist || []).map((c, i) => (
                  <div key={i} className="flex items-center gap-2 bg-slate-50 rounded-xl p-2">
                    <div onClick={() => updateChecklist(i, "required", !c.required)} className={`w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center cursor-pointer transition-colors ${c.required ? "border-emerald-500 bg-emerald-500" : "border-slate-300"}`}>
                      {c.required && <span className="text-white text-[10px] font-bold">✓</span>}
                    </div>
                    <Input value={c.item || ""} onChange={(e) => updateChecklist(i, "item", e.target.value)} className="rounded-lg text-sm h-8 flex-1" placeholder="Checklist item..." />
                    <button type="button" onClick={() => removeChecklist(i)} className="text-slate-400 hover:text-rose-500"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" className="rounded-xl text-xs w-full" onClick={addChecklist}>
                  <Plus className="w-3 h-3 mr-1" /> Add Checklist Item
                </Button>
              </div>
            </Field>
          </div>
        );

      case "assignment":
        return (
          <div className="space-y-6">
            <div>
              <p className="text-xs text-slate-400 font-medium uppercase tracking-wider mb-3">Linked Enterprises</p>
              {(form.linked_enterprises || []).length === 0 ? (
                <p className="text-sm text-slate-400 py-4 text-center bg-slate-50 rounded-xl">No enterprises linked yet. Assign via Transaction Page.</p>
              ) : (
                <div className="rounded-xl border border-slate-100 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50"><tr>
                      <th className="text-left px-4 py-2 text-xs text-slate-500 font-semibold">Enterprise Name</th>
                      <th className="text-left px-4 py-2 text-xs text-slate-500 font-semibold">Role</th>
                    </tr></thead>
                    <tbody>{(form.linked_enterprises || []).map((e, i) => (
                      <tr key={i} className="border-t border-slate-50">
                        <td className="px-4 py-2 text-slate-700">{e.enterprise_name}</td>
                        <td className="px-4 py-2 text-slate-500">{e.role}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              )}
            </div>
            <div>
              <p className="text-xs text-slate-400 font-medium uppercase tracking-wider mb-3">Default Service Roles</p>
              <div className="space-y-2">
                {(form.service_roles || []).map((r, i) => (
                  <div key={i} className="flex items-center gap-2 bg-slate-50 rounded-xl p-2">
                    <div onClick={() => updateRole(i, "required", !r.required)} className={`w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center cursor-pointer transition-colors ${r.required ? "border-emerald-500 bg-emerald-500" : "border-slate-300"}`}>
                      {r.required && <span className="text-white text-[10px] font-bold">✓</span>}
                    </div>
                    <Input value={r.role || ""} onChange={(e) => updateRole(i, "role", e.target.value)} className="rounded-lg text-sm h-8 flex-1" placeholder="Role name (e.g. Technician)..." />
                    <button type="button" onClick={() => removeRole(i)} className="text-slate-400 hover:text-rose-500"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" className="rounded-xl text-xs w-full" onClick={addRole}>
                  <Plus className="w-3 h-3 mr-1" /> Add Role
                </Button>
              </div>
            </div>
            <div className="bg-blue-50 rounded-xl p-3 text-xs text-blue-600">
              Actual assignments are executed via the Transaction Page.
            </div>
          </div>
        );

      case "notes":
        return (
          <div className="space-y-5">
            <Field label="Internal Notes">
              <Textarea value={form.internal_notes || ""} onChange={(e) => set("internal_notes", e.target.value)} className="rounded-xl resize-none" rows={5} placeholder="SOPs, service documentation..." />
            </Field>
            <Field label="Attachments">
              <div className="space-y-2">
                {(form.attachment_urls || []).map((url, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <a href={url} target="_blank" rel="noreferrer" className="text-sm text-emerald-600 underline truncate flex-1">Attachment {i + 1}</a>
                    <button type="button" onClick={() => set("attachment_urls", form.attachment_urls.filter((_, j) => j !== i))} className="text-slate-400 hover:text-rose-500"><Trash2 className="w-3.5 h-3.5" /></button>
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

      default: return null;
    }
  };

  const currentIdx = TABS.findIndex((t) => t.id === activeTab);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl w-full p-0 overflow-hidden max-h-[92vh]">
        {/* Header */}
        <DialogHeader className="px-6 pt-5 pb-4 border-b border-slate-100">
          <div className="flex items-start justify-between gap-3">
            <div>
              <DialogTitle className="text-lg font-semibold text-slate-800">
                {initialData ? "Edit Service" : "New Service"}
              </DialogTitle>
              {initialData?.id && <p className="text-xs text-slate-400 mt-0.5">ID: {initialData.id.slice(0, 8).toUpperCase()}</p>}
            </div>
            <Badge className={statusColors[form.status] || "bg-slate-100 text-slate-500"}>● {form.status || "active"}</Badge>
          </div>
          <div className="grid grid-cols-2 gap-3 mt-3">
            <div>
              <Label className="text-xs text-slate-500 mb-1 block">Service Name</Label>
              <Input value={form.name || ""} onChange={(e) => set("name", e.target.value)} className="rounded-xl h-9 text-sm" placeholder="Service name..." />
            </div>
            <div>
              <Label className="text-xs text-slate-500 mb-1 block">Status</Label>
              <Select value={form.status || "active"} onValueChange={(v) => set("status", v)}>
                <SelectTrigger className="rounded-xl h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="flex overflow-hidden">
            {/* Tab Nav */}
            <div className="bg-slate-50/60 px-3 py-4 shrink-0 border-r border-slate-100 min-h-[400px]">
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
            <div className="flex-1 px-6 py-5 overflow-y-auto max-h-[400px]">
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
              {currentIdx > 0 && <Button type="button" variant="outline" size="sm" className="rounded-xl" onClick={() => setActiveTab(TABS[currentIdx - 1].id)}>← Back</Button>}
              {currentIdx < TABS.length - 1 && <Button type="button" variant="outline" size="sm" className="rounded-xl" onClick={() => setActiveTab(TABS[currentIdx + 1].id)}>Next →</Button>}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={onClose} className="rounded-xl text-sm"><X className="w-4 h-4 mr-1" /> Cancel</Button>
              {initialData && onArchive && (
                <Button type="button" variant="outline" onClick={() => onArchive(initialData)} className="rounded-xl text-sm border-slate-300 text-slate-600 hover:bg-slate-50">
                  <Archive className="w-4 h-4 mr-1" /> Archive
                </Button>
              )}
              <Button type="button" variant="outline" onClick={handleSaveAndNew} className="rounded-xl text-sm border-emerald-300 text-emerald-700 hover:bg-emerald-50">Save & New</Button>
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