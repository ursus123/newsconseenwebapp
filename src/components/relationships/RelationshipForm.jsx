import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Save, X, StopCircle } from "lucide-react";

const TYPE_CONFIG = {
  person_enterprise: { label: "Assign Person → Enterprise", prefix: "PE", color: "bg-blue-50 text-blue-700" },
  item_enterprise:   { label: "Assign Item → Enterprise",   prefix: "IE", color: "bg-purple-50 text-purple-700" },
  item_person:       { label: "Assign Item → Person",        prefix: "IP", color: "bg-amber-50 text-amber-700" },
};

const statusColor = { active: "bg-emerald-50 text-emerald-700", ended: "bg-rose-50 text-rose-600", archived: "bg-slate-100 text-slate-500" };

function Field({ label, required, children }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium text-slate-700">{label}{required && <span className="text-rose-500 ml-0.5">*</span>}</Label>
      {children}
    </div>
  );
}

export default function RelationshipForm({ open, onClose, onSubmit, onEnd, initialData, type, people, enterprises, products }) {
  const [form, setForm] = useState({});

  useEffect(() => {
    if (open) {
      setForm(initialData || { relationship_type: type || "person_enterprise", status: "active", start_date: new Date().toISOString().split("T")[0] });
    }
  }, [open, initialData, type]);

  const set = (key, val) => setForm((f) => ({ ...f, [key]: val }));
  const relType = form.relationship_type || type || "person_enterprise";
  const config = TYPE_CONFIG[relType];

  const handleSubmit = (e) => { e.preventDefault(); onSubmit(form); };
  const handleSaveAndNew = () => onSubmit(form, true);
  const handleEnd = () => onEnd && onEnd({ ...form, status: "ended", end_date: new Date().toISOString().split("T")[0] });

  const personOptions = people || [];
  const enterpriseOptions = enterprises || [];
  const productOptions = products || [];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg w-full p-0 overflow-hidden">
        {/* Header */}
        <DialogHeader className="px-6 pt-5 pb-4 border-b border-slate-100">
          <div className="flex items-start justify-between gap-3">
            <div>
              <DialogTitle className="text-base font-semibold text-slate-800 uppercase tracking-wide">
                {config?.label || "Assignment"}
              </DialogTitle>
              {initialData?.id && (
                <p className="text-xs text-slate-400 mt-0.5">
                  {config?.prefix}-{initialData.id.slice(-6).toUpperCase()}
                </p>
              )}
            </div>
            <Badge className={statusColor[form.status] || "bg-slate-100 text-slate-600"}>
              ● {form.status || "active"}
            </Badge>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="px-6 py-5 space-y-4">

            {/* Person → Enterprise */}
            {relType === "person_enterprise" && (
              <>
                <Field label="Person" required>
                  <Select value={form.person_name || ""} onValueChange={(v) => set("person_name", v)}>
                    <SelectTrigger className="rounded-xl"><SelectValue placeholder="Select person..." /></SelectTrigger>
                    <SelectContent>
                      {personOptions.map((p) => (
                        <SelectItem key={p.id} value={p.preferred_name || `${p.first_name} ${p.last_name}`.trim()}>
                          {p.preferred_name || `${p.first_name} ${p.last_name}`.trim()}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Enterprise" required>
                  <Select value={form.enterprise_name || ""} onValueChange={(v) => set("enterprise_name", v)}>
                    <SelectTrigger className="rounded-xl"><SelectValue placeholder="Select enterprise..." /></SelectTrigger>
                    <SelectContent>
                      {enterpriseOptions.map((e) => (
                        <SelectItem key={e.id} value={e.enterprise_name}>{e.enterprise_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Role in Enterprise">
                  <Input value={form.role || ""} onChange={(e) => set("role", e.target.value)} className="rounded-xl" placeholder="e.g. Technician, Manager..." />
                </Field>
              </>
            )}

            {/* Item → Enterprise */}
            {relType === "item_enterprise" && (
              <>
                <Field label="Item" required>
                  <Select value={form.item_name || ""} onValueChange={(v) => set("item_name", v)}>
                    <SelectTrigger className="rounded-xl"><SelectValue placeholder="Select item..." /></SelectTrigger>
                    <SelectContent>
                      {productOptions.map((p) => (
                        <SelectItem key={p.id} value={p.name}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Enterprise" required>
                  <Select value={form.enterprise_name || ""} onValueChange={(v) => set("enterprise_name", v)}>
                    <SelectTrigger className="rounded-xl"><SelectValue placeholder="Select enterprise..." /></SelectTrigger>
                    <SelectContent>
                      {enterpriseOptions.map((e) => (
                        <SelectItem key={e.id} value={e.enterprise_name}>{e.enterprise_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Location">
                  <Input value={form.location || ""} onChange={(e) => set("location", e.target.value)} className="rounded-xl" placeholder="e.g. Main Warehouse..." />
                </Field>
                <Field label="Responsibility Type">
                  <Select value={form.responsibility_type || ""} onValueChange={(v) => set("responsibility_type", v)}>
                    <SelectTrigger className="rounded-xl"><SelectValue placeholder="Select type..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="owned">Owned</SelectItem>
                      <SelectItem value="rented">Rented</SelectItem>
                      <SelectItem value="leased">Leased</SelectItem>
                      <SelectItem value="consigned">Consigned</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </>
            )}

            {/* Item → Person */}
            {relType === "item_person" && (
              <>
                <Field label="Item" required>
                  <Select value={form.item_name || ""} onValueChange={(v) => set("item_name", v)}>
                    <SelectTrigger className="rounded-xl"><SelectValue placeholder="Select item..." /></SelectTrigger>
                    <SelectContent>
                      {productOptions.map((p) => (
                        <SelectItem key={p.id} value={p.name}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Person" required>
                  <Select value={form.person_name || ""} onValueChange={(v) => set("person_name", v)}>
                    <SelectTrigger className="rounded-xl"><SelectValue placeholder="Select person..." /></SelectTrigger>
                    <SelectContent>
                      {personOptions.map((p) => (
                        <SelectItem key={p.id} value={p.preferred_name || `${p.first_name} ${p.last_name}`.trim()}>
                          {p.preferred_name || `${p.first_name} ${p.last_name}`.trim()}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Custody Role">
                  <Input value={form.role || ""} onChange={(e) => set("role", e.target.value)} className="rounded-xl" placeholder="e.g. Driver, Custodian..." />
                </Field>
              </>
            )}

            {/* Shared fields */}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Start Date" required>
                <Input type="date" value={form.start_date || ""} onChange={(e) => set("start_date", e.target.value)} className="rounded-xl" />
              </Field>
              <Field label="End Date">
                <Input type="date" value={form.end_date || ""} onChange={(e) => set("end_date", e.target.value)} className="rounded-xl" />
              </Field>
            </div>
            <Field label="Notes">
              <Textarea value={form.notes || ""} onChange={(e) => set("notes", e.target.value)} className="rounded-xl resize-none" rows={3} placeholder="Any relevant notes..." />
            </Field>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 bg-slate-50/40">
            <Button type="button" variant="ghost" onClick={onClose} className="rounded-xl text-sm">
              <X className="w-4 h-4 mr-1" /> Cancel
            </Button>
            <div className="flex gap-2">
              {initialData && form.status === "active" && onEnd && (
                <Button type="button" variant="outline" onClick={handleEnd} className="rounded-xl text-sm border-rose-200 text-rose-600 hover:bg-rose-50">
                  <StopCircle className="w-4 h-4 mr-1" /> End Assignment
                </Button>
              )}
              <Button type="button" variant="outline" onClick={handleSaveAndNew} className="rounded-xl text-sm border-emerald-300 text-emerald-700 hover:bg-emerald-50">
                Save & New
              </Button>
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