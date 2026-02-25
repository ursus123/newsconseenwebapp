import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Save, X, User, Briefcase, Phone, MapPin, Calendar, Clock, Star, FileText, Upload, Link2, Search, Loader2, Building2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import RelatedEntitiesPanel from "@/components/shared/RelatedEntitiesPanel";

const SECTIONS = [
  { id: "identity", label: "Identity", icon: User },
  { id: "roles", label: "Roles", icon: Briefcase },
  { id: "contact", label: "Contact", icon: Phone },
  { id: "address", label: "Address", icon: MapPin },
  { id: "employment", label: "Employment", icon: Calendar },
  { id: "availability", label: "Availability", icon: Clock },
  { id: "skills", label: "Skills", icon: Star },
  { id: "notes", label: "Notes", icon: FileText },
  { id: "relationships", label: "Relationships", icon: Link2 },
];

const ALL_ROLES = [
  "Driver", "Courier", "Technician", "Maintenance Worker", "Installer", "Cleaner",
  "Warehouse Staff", "Stock Clerk", "Quality Control", "Sales Associate", "Cashier",
  "Shop Assistant", "Customer Service Rep", "Receptionist", "Order Taker", "Call Center Agent",
  "Pharmacist", "Nurse", "Lab Technician", "Accountant", "Bookkeeper", "Lawyer",
  "Consultant", "Auditor", "Cook / Chef", "Kitchen Assistant", "Baker", "Waiter",
  "Barista", "Designer", "Content Creator", "Social Media Manager", "Developer",
  "Photographer", "Admin Assistant", "Data Entry Clerk", "Office Manager", "Secretary",
  "General Manager", "Supervisor", "Team Lead", "Department Head", "Director"
];

const SKILLS_LIST = [
  "Driving", "Forklift", "Customer Service", "Sales", "Accounting", "Bookkeeping",
  "Microsoft Office", "Data Entry", "First Aid", "Food Handling", "Cooking", "Cleaning",
  "Electrical", "Plumbing", "Carpentry", "IT Support", "Graphic Design", "Social Media",
  "Photography", "Project Management", "Team Leadership", "Communication", "Inventory Management"
];

function SectionNav({ active, onChange, completedSections }) {
  return (
    <div className="flex flex-col gap-1 w-44 shrink-0 border-r border-slate-100 pr-4">
      {SECTIONS.map((s) => {
        const Icon = s.icon;
        const isActive = active === s.id;
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => onChange(s.id)}
            className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm text-left transition-all
              ${isActive ? "bg-emerald-50 text-emerald-700 font-medium" : "text-slate-500 hover:bg-slate-50 hover:text-slate-700"}`}
          >
            <Icon className={`w-4 h-4 shrink-0 ${isActive ? "text-emerald-600" : "text-slate-400"}`} />
            {s.label}
          </button>
        );
      })}
    </div>
  );
}

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

function SelectField({ value, onChange, options, placeholder }) {
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

function MultiSelectBadges({ value = [], options, onChange }) {
  const selected = value || [];
  const toggle = (item) => {
    if (selected.includes(item)) onChange(selected.filter((s) => s !== item));
    else onChange([...selected, item]);
  };
  return (
    <div className="flex flex-wrap gap-1.5 mt-1 max-h-40 overflow-y-auto p-1">
      {options.map((item) => {
        const active = selected.includes(item);
        return (
          <button
            key={item}
            type="button"
            onClick={() => toggle(item)}
            className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-all
              ${active ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-slate-600 border-slate-200 hover:border-emerald-400"}`}
          >
            {item}
          </button>
        );
      })}
    </div>
  );
}

export default function PeopleForm({ open, onClose, onSubmit, initialData }) {
  const [activeSection, setActiveSection] = useState("identity");
  const [form, setForm] = useState({});
  const [uploading, setUploading] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [geocodeNote, setGeocodeNote] = useState(null);
  const [geocodeError, setGeocodeError] = useState(null);
  const [saving, setSaving] = useState(false);

  const { data: enterprises = [] } = useQuery({
    queryKey: ["enterprises-list"],
    queryFn: () => base44.entities.Enterprise.list(),
    enabled: open,
  });

  useEffect(() => {
    if (open) {
      setActiveSection("identity");
      setForm(initialData || { status: "active", person_type: "employee", availability_status: "available" });
      setGeocodeNote(null);
      setGeocodeError(null);
    }
  }, [open, initialData]);

  const set = (key, val) => setForm((f) => ({ ...f, [key]: val }));

  const geocodeAddress = async () => {
    const { address, city, region, country } = form;
    if (!country) { setGeocodeError("Please enter a country first."); return; }
    setGeocoding(true); setGeocodeError(null); setGeocodeNote(null);
    const strategies = [
      [address, city, region, country].filter(Boolean).join(", "),
      [city, region, country].filter(Boolean).join(", "),
    ].filter(Boolean);
    let result = null, usedStrategy = 0;
    for (let i = 0; i < strategies.length; i++) {
      const resp = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(strategies[i])}&limit=1`);
      const data = await resp.json();
      if (data && data.length > 0) { result = data[0]; usedStrategy = i; break; }
    }
    if (result) {
      setForm((f) => ({ ...f, latitude: parseFloat(result.lat), longitude: parseFloat(result.lon) }));
      setGeocodeNote(usedStrategy === 0 ? `✓ Match: ${result.display_name}` : `⚠ City-level match: ${result.display_name}`);
    } else {
      setGeocodeError("Could not find coordinates. Check spelling or enter manually.");
    }
    setGeocoding(false);
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    set("attachment_url", file_url);
    setUploading(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const personName = form.preferred_name || `${form.first_name || ""} ${form.last_name || ""}`.trim();
      // Strip internal UI fields before saving person
      const { _enterprise_name, latitude, longitude, ...personData } = form;

      // 1. Save person
      await onSubmit(personData);

      // 2. If address data, create Address record with linked person
      if (form.country || form.address || form.city) {
        await base44.entities.Address.create({
          label: `${personName} – Home`,
          status: "active",
          address_line1: form.address || "",
          city: form.city || "",
          state_region: form.region || "",
          country: form.country || "",
          latitude: form.latitude,
          longitude: form.longitude,
          linked_people: [{ person_name: personName, address_type: "Home", active: true }],
        });
      }

      // 3. If enterprise selected, create Relationship
      if (_enterprise_name) {
        await base44.entities.Relationship.create({
          relationship_type: "person_enterprise",
          status: "active",
          person_name: personName,
          enterprise_name: _enterprise_name,
          role: form.primary_role || "",
          start_date: form.start_date || new Date().toISOString().split("T")[0],
        });
      }
    } finally {
      setSaving(false);
    }
  };

  const renderSection = () => {
    switch (activeSection) {
      case "identity":
        return (
          <div className="grid grid-cols-2 gap-4">
            <Field label="First Name" required>
              <Input value={form.first_name || ""} onChange={(e) => set("first_name", e.target.value)} className="rounded-xl" required />
            </Field>
            <Field label="Last Name" required>
              <Input value={form.last_name || ""} onChange={(e) => set("last_name", e.target.value)} className="rounded-xl" required />
            </Field>
            <Field label="Preferred / Display Name">
              <Input value={form.preferred_name || ""} onChange={(e) => set("preferred_name", e.target.value)} className="rounded-xl" placeholder="Optional" />
            </Field>
            <Field label="Person Type" required>
              <SelectField value={form.person_type} onChange={(v) => set("person_type", v)} options={[
                { value: "employee", label: "Employee" },
                { value: "contractor", label: "Contractor" },
                { value: "freelancer", label: "Freelancer" },
                { value: "vendor", label: "Vendor / Supplier" },
                { value: "client", label: "Client / Customer" },
                { value: "patient", label: "Patient / Care Recipient" },
                { value: "external_partner", label: "External Partner" },
              ]} placeholder="Select person type..." />
            </Field>
            <Field label="Status">
              <SelectField value={form.status} onChange={(v) => set("status", v)} options={[
                { value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }, { value: "on_leave", label: "On Leave" },
              ]} />
            </Field>
          </div>
        );
      case "roles":
        return (
          <div className="space-y-5">
            <Field label="Primary Role">
              <SelectField value={form.primary_role} onChange={(v) => set("primary_role", v)} options={ALL_ROLES.map((r) => ({ value: r, label: r }))} placeholder="Select primary role" />
            </Field>
            <Field label="Role Category">
              <SelectField value={form.role_category} onChange={(v) => set("role_category", v)} options={[
                { value: "operations_service", label: "Operations & Service" },
                { value: "retail_customer_facing", label: "Retail & Customer-Facing" },
                { value: "professional_licensed", label: "Professional & Licensed" },
                { value: "food_hospitality", label: "Food & Hospitality" },
                { value: "creative_digital", label: "Creative & Digital" },
                { value: "administrative", label: "Administrative" },
                { value: "management_leadership", label: "Management & Leadership" },
              ]} />
            </Field>
            <Field label="Secondary Roles (select all that apply)">
              <MultiSelectBadges value={form.secondary_roles} options={ALL_ROLES} onChange={(v) => set("secondary_roles", v)} />
            </Field>
          </div>
        );
      case "contact":
        return (
          <div className="grid grid-cols-2 gap-4">
            <Field label="Phone Number">
              <Input value={form.phone || ""} onChange={(e) => set("phone", e.target.value)} className="rounded-xl" type="tel" />
            </Field>
            <Field label="Email Address">
              <Input value={form.email || ""} onChange={(e) => set("email", e.target.value)} className="rounded-xl" type="email" />
            </Field>
            <Field label="Emergency Contact Name">
              <Input value={form.emergency_contact || ""} onChange={(e) => set("emergency_contact", e.target.value)} className="rounded-xl" />
            </Field>
            <Field label="Emergency Phone">
              <Input value={form.emergency_phone || ""} onChange={(e) => set("emergency_phone", e.target.value)} className="rounded-xl" type="tel" />
            </Field>
          </div>
        );
      case "address":
        return (
          <div className="space-y-4">
            <Field label="Country">
              <Input value={form.country || ""} onChange={(e) => set("country", e.target.value)} className="rounded-xl" placeholder="e.g. United States, Canada, UK..." />
            </Field>
            <Field label="Street Address">
              <Input value={form.address || ""} onChange={(e) => set("address", e.target.value)} className="rounded-xl" placeholder="Street number and name" />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="City">
                <Input value={form.city || ""} onChange={(e) => set("city", e.target.value)} className="rounded-xl" />
              </Field>
              <Field label="Region / State">
                <Input value={form.region || ""} onChange={(e) => set("region", e.target.value)} className="rounded-xl" />
              </Field>
            </div>
            {/* Geocoding */}
            <div className="border-t border-slate-100 pt-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">Geo Coordinates</p>
                <Button type="button" variant="outline" size="sm" onClick={geocodeAddress}
                  disabled={geocoding || !form.country} className="rounded-lg text-xs h-7">
                  {geocoding ? <><Loader2 className="w-3 h-3 mr-1.5 animate-spin" />Geocoding...</> : <><Search className="w-3 h-3 mr-1.5" />Auto-fill from Address</>}
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Latitude">
                  <Input type="number" step="any" value={form.latitude ?? ""} onChange={(e) => set("latitude", e.target.value ? parseFloat(e.target.value) : undefined)} className="rounded-xl" placeholder="0.0000" />
                </Field>
                <Field label="Longitude">
                  <Input type="number" step="any" value={form.longitude ?? ""} onChange={(e) => set("longitude", e.target.value ? parseFloat(e.target.value) : undefined)} className="rounded-xl" placeholder="0.0000" />
                </Field>
              </div>
              {geocodeError && <div className="mt-2 text-xs bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-amber-800">{geocodeError}</div>}
              {geocodeNote && <div className="mt-2 text-xs bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-blue-700">{geocodeNote}</div>}
              {form.latitude && form.longitude && !geocodeNote && (
                <div className="mt-2 text-xs text-emerald-600 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5" />Coordinates set: {parseFloat(form.latitude).toFixed(4)}, {parseFloat(form.longitude).toFixed(4)}
                </div>
              )}
            </div>
            {/* Note about Address record */}
            <div className="bg-blue-50 border border-blue-100 rounded-xl px-3 py-2 text-xs text-blue-700">
              <strong>Note:</strong> On save, this address will be automatically added to the <em>Addresses</em> database and linked to this person.
            </div>
          </div>
        );
      case "employment":
        return (
          <div className="grid grid-cols-2 gap-4">
            <Field label="Engagement Type">
              <SelectField value={form.engagement_type} onChange={(v) => set("engagement_type", v)} options={[
                { value: "full_time", label: "Full Time" }, { value: "part_time", label: "Part Time" },
                { value: "contract", label: "Contract" }, { value: "casual", label: "Casual" }, { value: "internship", label: "Internship" },
              ]} />
            </Field>
            <Field label="Payment Type">
              <SelectField value={form.payment_type} onChange={(v) => set("payment_type", v)} options={[
                { value: "monthly_salary", label: "Monthly Salary" }, { value: "hourly", label: "Hourly" },
                { value: "daily", label: "Daily" }, { value: "per_task", label: "Per Task" }, { value: "retainer", label: "Retainer" },
              ]} />
            </Field>
            <Field label="Start Date">
              <Input value={form.start_date || ""} onChange={(e) => set("start_date", e.target.value)} className="rounded-xl" type="date" />
            </Field>
            <Field label="End Date">
              <Input value={form.end_date || ""} onChange={(e) => set("end_date", e.target.value)} className="rounded-xl" type="date" />
            </Field>
            <Field label="Cost Rate">
              <Input value={form.cost_rate || ""} onChange={(e) => set("cost_rate", parseFloat(e.target.value) || "")} className="rounded-xl" type="number" step="0.01" placeholder="e.g. 1500" />
            </Field>
          </div>
        );
      case "availability":
        return (
          <div className="space-y-4">
            <Field label="Availability Status">
              <SelectField value={form.availability_status} onChange={(v) => set("availability_status", v)} options={[
                { value: "available", label: "Available" }, { value: "busy", label: "Busy" },
                { value: "on_leave", label: "On Leave" }, { value: "unavailable", label: "Unavailable" },
              ]} />
            </Field>
            <Field label="Shift / Schedule">
              <Input value={form.shift_schedule || ""} onChange={(e) => set("shift_schedule", e.target.value)} className="rounded-xl" placeholder="e.g. Mon–Fri 8am–5pm" />
            </Field>
            <Field label="Notes">
              <Textarea value={form.availability_notes || ""} onChange={(e) => set("availability_notes", e.target.value)} className="rounded-xl resize-none" rows={3} />
            </Field>
          </div>
        );
      case "skills":
        return (
          <div className="space-y-5">
            <Field label="Skills (select all that apply)">
              <MultiSelectBadges value={form.skills} options={SKILLS_LIST} onChange={(v) => set("skills", v)} />
            </Field>
            <div className="grid grid-cols-2 gap-4 pt-2 border-t border-slate-100">
              <Field label="Certification Name">
                <Input value={form.certification_name || ""} onChange={(e) => set("certification_name", e.target.value)} className="rounded-xl" />
              </Field>
              <Field label="Expiry Date">
                <Input value={form.certification_expiry || ""} onChange={(e) => set("certification_expiry", e.target.value)} className="rounded-xl" type="date" />
              </Field>
              <Field label="License Number">
                <Input value={form.license_number || ""} onChange={(e) => set("license_number", e.target.value)} className="rounded-xl" />
              </Field>
            </div>
          </div>
        );
      case "notes":
        return (
          <div className="space-y-4">
            <Field label="Internal Notes">
              <Textarea value={form.internal_notes || ""} onChange={(e) => set("internal_notes", e.target.value)} className="rounded-xl resize-none" rows={5} placeholder="Notes visible only internally..." />
            </Field>
            <Field label="Attachment">
              {form.attachment_url ? (
                <div className="flex items-center gap-3">
                  <a href={form.attachment_url} target="_blank" rel="noreferrer" className="text-sm text-emerald-600 underline">View attachment</a>
                  <Button type="button" variant="outline" size="sm" className="rounded-xl text-xs" onClick={() => set("attachment_url", "")}>Remove</Button>
                </div>
              ) : (
                <label className="flex items-center gap-3 border-2 border-dashed border-slate-200 rounded-xl px-4 py-6 cursor-pointer hover:border-emerald-400 transition-colors">
                  <Upload className="w-5 h-5 text-slate-400" />
                  <span className="text-sm text-slate-500">{uploading ? "Uploading..." : "Click to upload file"}</span>
                  <input type="file" className="hidden" onChange={handleFileUpload} disabled={uploading} />
                </label>
              )}
            </Field>
          </div>
        );
      case "relationships":
        return (
          <RelatedEntitiesPanel
            entityType="person"
            entityName={form.preferred_name || (form.first_name && form.last_name ? `${form.first_name} ${form.last_name}`.trim() : null)}
          />
        );

      default:
        return null;
    }
  };

  const currentIdx = SECTIONS.findIndex((s) => s.id === activeSection);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl w-full p-0 overflow-hidden max-h-[90vh]">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-slate-100">
          <DialogTitle className="text-lg font-semibold text-slate-800">
            {initialData ? "Edit Person" : "Add Person"}
          </DialogTitle>
          <p className="text-xs text-slate-400 mt-0.5">
            {initialData ? `${initialData.first_name} ${initialData.last_name}` : "Complete the sections below to create a person record"}
          </p>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="flex gap-0 overflow-hidden">
            {/* Section Nav */}
            <div className="bg-slate-50/60 px-4 py-5 min-h-[440px] shrink-0">
              <SectionNav active={activeSection} onChange={setActiveSection} />
            </div>

            {/* Section Content */}
            <div className="flex-1 px-6 py-5 overflow-y-auto max-h-[440px]">
              <div className="mb-4">
                <h3 className="text-sm font-semibold text-slate-700">
                  {SECTIONS.find((s) => s.id === activeSection)?.label}
                </h3>
                <div className="h-px bg-slate-100 mt-2" />
              </div>
              {renderSection()}
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 bg-slate-50/40">
            <div className="flex gap-2">
              {currentIdx > 0 && (
                <Button type="button" variant="outline" size="sm" className="rounded-xl"
                  onClick={() => setActiveSection(SECTIONS[currentIdx - 1].id)}>
                  ← Back
                </Button>
              )}
              {currentIdx < SECTIONS.length - 1 && (
                <Button type="button" size="sm" variant="outline" className="rounded-xl"
                  onClick={() => setActiveSection(SECTIONS[currentIdx + 1].id)}>
                  Next →
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={onClose} className="rounded-xl text-sm">
                <X className="w-4 h-4 mr-1" /> Cancel
              </Button>
              <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700 rounded-xl text-sm shadow-lg shadow-emerald-500/20">
                <Save className="w-4 h-4 mr-2" /> Save Person
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}