import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Save, X, Plus, Trash2, Upload, Building2, Tag, MapPin, Users, Activity, Shield, FileText, Link2, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import RelatedEntitiesPanel from "@/components/shared/RelatedEntitiesPanel";

const TABS = [
  { id: "basic", label: "Basic Info", icon: Building2 },
  { id: "classification", label: "Classification", icon: Tag },
  { id: "contact", label: "Contact & Location", icon: MapPin },
  { id: "ownership", label: "Ownership & People", icon: Users },
  { id: "operations", label: "Operations", icon: Activity },
  { id: "compliance", label: "Compliance & Risk", icon: Shield },
  { id: "notes", label: "Notes & Files", icon: FileText },
  { id: "relationships", label: "Relationships", icon: Link2 },
];

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const BUSINESS_MODELS = ["retail", "service", "manufacturing", "digital"];

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

export default function EnterpriseForm({ open, onClose, onSubmit, onArchive, initialData }) {
  const [activeTab, setActiveTab] = useState("basic");
  const [form, setForm] = useState({});
  const [uploading, setUploading] = useState(false);
  const [geocoding, setGeocoding] = useState(false);

  useEffect(() => {
    if (open) {
      setActiveTab("basic");
      setForm(initialData || {
        status: "active",
        operating_status: "open",
        business_model: [],
        owners: [],
        management_roles: [],
        additional_locations: [],
        operating_hours: DAYS.map((d) => ({ day: d, open: "08:00", close: "18:00" })),
        licenses: [],
        insurance: [],
        attachment_urls: [],
      });
    }
  }, [open, initialData]);

  const set = (key, val) => setForm((f) => ({ ...f, [key]: val }));

  // Helpers for array fields
  const addItem = (key, item) => set(key, [...(form[key] || []), item]);
  const removeItem = (key, idx) => set(key, (form[key] || []).filter((_, i) => i !== idx));
  const updateItem = (key, idx, field, val) => set(key, (form[key] || []).map((item, i) => i === idx ? { ...item, [field]: val } : item));

  const toggleModel = (model) => {
    const current = form.business_model || [];
    set("business_model", current.includes(model) ? current.filter((m) => m !== model) : [...current, model]);
  };

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
            <Field label="Enterprise Name" required>
              <Input value={form.enterprise_name || ""} onChange={(e) => set("enterprise_name", e.target.value)} className="rounded-xl" required />
            </Field>
            <Field label="Short Name / Code">
              <Input value={form.short_name || ""} onChange={(e) => set("short_name", e.target.value)} className="rounded-xl" placeholder="Optional" />
            </Field>
            <Field label="Description">
              <Textarea value={form.description || ""} onChange={(e) => set("description", e.target.value)} className="rounded-xl resize-none" rows={3} />
            </Field>
            <Field label="Status">
              <Sel value={form.status} onChange={(v) => set("status", v)} options={[
                { value: "active", label: "Active" }, { value: "inactive", label: "Inactive" },
                { value: "prospect", label: "Prospect" }, { value: "archived", label: "Archived" },
              ]} />
            </Field>
          </div>
        );

      case "classification":
        return (
          <div className="space-y-5">
            <Field label="Enterprise Type">
              <Sel value={form.enterprise_type} onChange={(v) => set("enterprise_type", v)} options={[
                { value: "retail", label: "Retail" }, { value: "food_beverage", label: "Food & Beverage" },
                { value: "healthcare", label: "Healthcare" }, { value: "technology", label: "Technology" },
                { value: "construction", label: "Construction" }, { value: "education", label: "Education" },
                { value: "finance", label: "Finance" }, { value: "manufacturing", label: "Manufacturing" },
                { value: "logistics", label: "Logistics" }, { value: "hospitality", label: "Hospitality" },
                { value: "agriculture", label: "Agriculture" }, { value: "media", label: "Media" },
                { value: "other", label: "Other" },
              ]} />
            </Field>
            <Field label="Sub-Type">
              <Input value={form.sub_type || ""} onChange={(e) => set("sub_type", e.target.value)} className="rounded-xl" placeholder="e.g. Grocery Store, Pharmacy..." />
            </Field>
            <Field label="Business Model (select all that apply)">
              <div className="flex flex-wrap gap-2 mt-1">
                {BUSINESS_MODELS.map((m) => {
                  const active = (form.business_model || []).includes(m);
                  return (
                    <button key={m} type="button" onClick={() => toggleModel(m)}
                      className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-all capitalize
                        ${active ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-slate-600 border-slate-200 hover:border-emerald-400"}`}>
                      {m}
                    </button>
                  );
                })}
              </div>
            </Field>
          </div>
        );

      case "contact":
        return (
          <div className="space-y-6">
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Contact Details</p>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Phone Number">
                  <Input value={form.phone || ""} onChange={(e) => set("phone", e.target.value)} className="rounded-xl" type="tel" />
                </Field>
                <Field label="Email Address">
                  <Input value={form.email || ""} onChange={(e) => set("email", e.target.value)} className="rounded-xl" type="email" />
                </Field>
                <div className="col-span-2">
                  <Field label="Website">
                    <Input value={form.website || ""} onChange={(e) => set("website", e.target.value)} className="rounded-xl" placeholder="https://" />
                  </Field>
                </div>
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Primary Location</p>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <Field label="Street Address">
                    <Input value={form.primary_address || ""} onChange={(e) => set("primary_address", e.target.value)} className="rounded-xl" />
                  </Field>
                </div>
                <Field label="City"><Input value={form.city || ""} onChange={(e) => set("city", e.target.value)} className="rounded-xl" /></Field>
                <Field label="Region / State"><Input value={form.region || ""} onChange={(e) => set("region", e.target.value)} className="rounded-xl" /></Field>
                <Field label="Country"><Input value={form.country || ""} onChange={(e) => set("country", e.target.value)} className="rounded-xl" /></Field>
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Additional Locations</p>
                <Button type="button" variant="outline" size="sm" className="rounded-xl text-xs h-7"
                  onClick={() => addItem("additional_locations", { address: "", type: "", active: true })}>
                  <Plus className="w-3 h-3 mr-1" /> Add
                </Button>
              </div>
              <div className="space-y-2">
                {(form.additional_locations || []).map((loc, i) => (
                  <div key={i} className="flex gap-2 items-center bg-slate-50 rounded-xl p-2">
                    <Input placeholder="Address" value={loc.address || ""} onChange={(e) => updateItem("additional_locations", i, "address", e.target.value)} className="rounded-lg text-xs h-8 flex-1" />
                    <Input placeholder="Type (HQ/Branch)" value={loc.type || ""} onChange={(e) => updateItem("additional_locations", i, "type", e.target.value)} className="rounded-lg text-xs h-8 w-28" />
                    <button type="button" onClick={() => removeItem("additional_locations", i)} className="text-slate-400 hover:text-rose-500"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );

      case "ownership":
        return (
          <div className="space-y-6">
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Owners</p>
                <Button type="button" variant="outline" size="sm" className="rounded-xl text-xs h-7"
                  onClick={() => addItem("owners", { person_name: "", role: "Owner", since: "" })}>
                  <Plus className="w-3 h-3 mr-1" /> Link Person
                </Button>
              </div>
              <div className="space-y-2">
                {(form.owners || []).map((o, i) => (
                  <div key={i} className="flex gap-2 items-center bg-slate-50 rounded-xl p-2">
                    <Input placeholder="Person Name" value={o.person_name || ""} onChange={(e) => updateItem("owners", i, "person_name", e.target.value)} className="rounded-lg text-xs h-8 flex-1" />
                    <Input placeholder="Role" value={o.role || ""} onChange={(e) => updateItem("owners", i, "role", e.target.value)} className="rounded-lg text-xs h-8 w-28" />
                    <Input placeholder="Since (year)" value={o.since || ""} onChange={(e) => updateItem("owners", i, "since", e.target.value)} className="rounded-lg text-xs h-8 w-24" />
                    <button type="button" onClick={() => removeItem("owners", i)} className="text-slate-400 hover:text-rose-500"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                ))}
                {(form.owners || []).length === 0 && <p className="text-xs text-slate-400 py-3 text-center">No owners linked yet</p>}
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Management Roles</p>
                <Button type="button" variant="outline" size="sm" className="rounded-xl text-xs h-7"
                  onClick={() => addItem("management_roles", { role: "", assigned_person: "" })}>
                  <Plus className="w-3 h-3 mr-1" /> Add Role
                </Button>
              </div>
              <div className="space-y-2">
                {(form.management_roles || []).map((r, i) => (
                  <div key={i} className="flex gap-2 items-center bg-slate-50 rounded-xl p-2">
                    <Input placeholder="Role (e.g. Manager)" value={r.role || ""} onChange={(e) => updateItem("management_roles", i, "role", e.target.value)} className="rounded-lg text-xs h-8 flex-1" />
                    <Input placeholder="Assigned Person" value={r.assigned_person || ""} onChange={(e) => updateItem("management_roles", i, "assigned_person", e.target.value)} className="rounded-lg text-xs h-8 flex-1" />
                    <button type="button" onClick={() => removeItem("management_roles", i)} className="text-slate-400 hover:text-rose-500"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                ))}
                {(form.management_roles || []).length === 0 && <p className="text-xs text-slate-400 py-3 text-center">No management roles added yet</p>}
              </div>
            </div>
          </div>
        );

      case "operations":
        return (
          <div className="space-y-5">
            <Field label="Operating Status">
              <Sel value={form.operating_status} onChange={(v) => set("operating_status", v)} options={[
                { value: "open", label: "Open" }, { value: "closed", label: "Closed" },
                { value: "temporarily_closed", label: "Temporarily Closed" }, { value: "seasonal", label: "Seasonal" },
              ]} />
            </Field>
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Operating Hours</p>
              <div className="space-y-2">
                {(form.operating_hours || []).map((h, i) => (
                  <div key={h.day} className="flex items-center gap-3">
                    <span className="text-sm font-medium text-slate-600 w-10">{h.day}</span>
                    <Input type="time" value={h.open || "08:00"} onChange={(e) => updateItem("operating_hours", i, "open", e.target.value)} className="rounded-xl h-8 text-xs w-28" />
                    <span className="text-slate-400 text-xs">to</span>
                    <Input type="time" value={h.close || "18:00"} onChange={(e) => updateItem("operating_hours", i, "close", e.target.value)} className="rounded-xl h-8 text-xs w-28" />
                  </div>
                ))}
              </div>
            </div>
            <Field label="Internal Notes">
              <Textarea value={form.operations_notes || ""} onChange={(e) => set("operations_notes", e.target.value)} className="rounded-xl resize-none" rows={3} />
            </Field>
          </div>
        );

      case "compliance":
        return (
          <div className="space-y-6">
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Licenses & Permits</p>
                <Button type="button" variant="outline" size="sm" className="rounded-xl text-xs h-7"
                  onClick={() => addItem("licenses", { type: "", number: "", expiry_date: "" })}>
                  <Plus className="w-3 h-3 mr-1" /> Add License
                </Button>
              </div>
              <div className="space-y-2">
                {(form.licenses || []).map((l, i) => (
                  <div key={i} className="flex gap-2 items-center bg-slate-50 rounded-xl p-2">
                    <Input placeholder="Type" value={l.type || ""} onChange={(e) => updateItem("licenses", i, "type", e.target.value)} className="rounded-lg text-xs h-8 flex-1" />
                    <Input placeholder="Number" value={l.number || ""} onChange={(e) => updateItem("licenses", i, "number", e.target.value)} className="rounded-lg text-xs h-8 w-28" />
                    <Input type="date" value={l.expiry_date || ""} onChange={(e) => updateItem("licenses", i, "expiry_date", e.target.value)} className="rounded-lg text-xs h-8 w-36" />
                    <button type="button" onClick={() => removeItem("licenses", i)} className="text-slate-400 hover:text-rose-500"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                ))}
                {(form.licenses || []).length === 0 && <p className="text-xs text-slate-400 py-2 text-center">No licenses added</p>}
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Insurance</p>
                <Button type="button" variant="outline" size="sm" className="rounded-xl text-xs h-7"
                  onClick={() => addItem("insurance", { policy: "", provider: "", expiry: "" })}>
                  <Plus className="w-3 h-3 mr-1" /> Add Insurance
                </Button>
              </div>
              <div className="space-y-2">
                {(form.insurance || []).map((ins, i) => (
                  <div key={i} className="flex gap-2 items-center bg-slate-50 rounded-xl p-2">
                    <Input placeholder="Policy" value={ins.policy || ""} onChange={(e) => updateItem("insurance", i, "policy", e.target.value)} className="rounded-lg text-xs h-8 flex-1" />
                    <Input placeholder="Provider" value={ins.provider || ""} onChange={(e) => updateItem("insurance", i, "provider", e.target.value)} className="rounded-lg text-xs h-8 flex-1" />
                    <Input type="date" value={ins.expiry || ""} onChange={(e) => updateItem("insurance", i, "expiry", e.target.value)} className="rounded-lg text-xs h-8 w-36" />
                    <button type="button" onClick={() => removeItem("insurance", i)} className="text-slate-400 hover:text-rose-500"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                ))}
                {(form.insurance || []).length === 0 && <p className="text-xs text-slate-400 py-2 text-center">No insurance added</p>}
              </div>
            </div>
            {/* Risk Flags */}
            <div className="bg-amber-50 rounded-xl p-4">
              <p className="text-xs font-semibold text-amber-700 uppercase tracking-wider mb-2">Risk Flags</p>
              <div className="space-y-1.5 text-sm text-slate-600">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" className="rounded" checked={(form.licenses || []).length === 0} readOnly />
                  <span>Missing licenses / permits</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" className="rounded" checked={(form.insurance || []).length === 0} readOnly />
                  <span>No insurance on file</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" className="rounded"
                    checked={(form.licenses || []).some((l) => l.expiry_date && new Date(l.expiry_date) < new Date())} readOnly />
                  <span>Expired license detected</span>
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
                    <a href={url} target="_blank" rel="noreferrer" className="text-sm text-emerald-600 underline truncate flex-1">
                      Attachment {i + 1}
                    </a>
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
      case "relationships":
        return (
          <RelatedEntitiesPanel
            entityType="enterprise"
            entityName={form.enterprise_name}
          />
        );

      default:
        return null;
    }
  };

  const currentIdx = TABS.findIndex((t) => t.id === activeTab);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl w-full p-0 overflow-hidden max-h-[92vh]">
        {/* Header */}
        <DialogHeader className="px-6 pt-5 pb-4 border-b border-slate-100">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-lg font-semibold text-slate-800">
                {initialData ? "Edit Enterprise" : "New Enterprise"}
              </DialogTitle>
              {initialData?.id && <p className="text-xs text-slate-400 mt-0.5">ID: {initialData.id.slice(0, 8).toUpperCase()}</p>}
            </div>
            <Badge className={form.status === "active" ? "bg-emerald-50 text-emerald-700" : form.status === "archived" ? "bg-slate-100 text-slate-500" : "bg-amber-50 text-amber-700"}>
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