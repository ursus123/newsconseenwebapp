import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Save, X, StopCircle } from "lucide-react";

export const TYPE_CONFIG = {
  person_enterprise:  { label: "Assign Person → Enterprise",  prefix: "PE", color: "bg-blue-50 text-blue-700" },
  item_enterprise:    { label: "Assign Item → Enterprise",    prefix: "IE", color: "bg-purple-50 text-purple-700" },
  item_person:        { label: "Assign Item → Person",        prefix: "IP", color: "bg-amber-50 text-amber-700" },
  person_service:     { label: "Assign Person → Service",     prefix: "PS", color: "bg-cyan-50 text-cyan-700" },
  enterprise_service: { label: "Assign Enterprise → Service", prefix: "ES", color: "bg-indigo-50 text-indigo-700" },
  person_address:     { label: "Assign Person → Address",     prefix: "PA", color: "bg-teal-50 text-teal-700" },
  enterprise_address: { label: "Assign Enterprise → Address", prefix: "EA", color: "bg-emerald-50 text-emerald-700" },
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

function PersonSelect({ value, onChange, people, placeholder }) {
  return (
    <Select value={value || ""} onValueChange={onChange}>
      <SelectTrigger className="rounded-xl"><SelectValue placeholder={placeholder || "Select person..."} /></SelectTrigger>
      <SelectContent>
        {(people || []).map((p) => {
          const name = p.preferred_name || `${p.first_name} ${p.last_name}`.trim();
          return <SelectItem key={p.id} value={name}>{name}</SelectItem>;
        })}
      </SelectContent>
    </Select>
  );
}

function EnterpriseSelect({ value, onChange, enterprises }) {
  return (
    <Select value={value || ""} onValueChange={onChange}>
      <SelectTrigger className="rounded-xl"><SelectValue placeholder="Select enterprise..." /></SelectTrigger>
      <SelectContent>
        {(enterprises || []).map((e) => <SelectItem key={e.id} value={e.enterprise_name}>{e.enterprise_name}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

function ItemSelect({ value, onChange, products }) {
  return (
    <Select value={value || ""} onValueChange={onChange}>
      <SelectTrigger className="rounded-xl"><SelectValue placeholder="Select item..." /></SelectTrigger>
      <SelectContent>
        {(products || []).map((p) => <SelectItem key={p.id} value={p.name}>{p.name}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

function ServiceSelect({ value, onChange, services }) {
  return (
    <Select value={value || ""} onValueChange={onChange}>
      <SelectTrigger className="rounded-xl"><SelectValue placeholder="Select service..." /></SelectTrigger>
      <SelectContent>
        {(services || []).map((s) => <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

function AddressSelect({ value, onChange, addresses }) {
  return (
    <Select value={value || ""} onValueChange={onChange}>
      <SelectTrigger className="rounded-xl"><SelectValue placeholder="Select address..." /></SelectTrigger>
      <SelectContent>
        {(addresses || []).map((a) => {
          const label = a.label || a.address_line1 || a.id;
          return <SelectItem key={a.id} value={label}>{label}</SelectItem>;
        })}
      </SelectContent>
    </Select>
  );
}

export default function RelationshipForm({ open, onClose, onSubmit, onEnd, initialData, type, people, enterprises, products, services = [], addresses = [] }) {
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

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg w-full p-0 overflow-hidden max-h-[90vh] flex flex-col">
        <DialogHeader className="px-6 pt-5 pb-4 border-b border-slate-100 shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div>
              <DialogTitle className="text-base font-semibold text-slate-800 uppercase tracking-wide">
                {config?.label || "Assignment"}
              </DialogTitle>
              {initialData?.id && (
                <p className="text-xs text-slate-400 mt-0.5">{config?.prefix}-{initialData.id.slice(-6).toUpperCase()}</p>
              )}
            </div>
            <Badge className={statusColor[form.status] || "bg-slate-100 text-slate-600"}>● {form.status || "active"}</Badge>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">

            {/* Person → Enterprise */}
            {relType === "person_enterprise" && (
              <>
                <Field label="Person" required><PersonSelect value={form.person_name} onChange={(v) => set("person_name", v)} people={people} /></Field>
                <Field label="Enterprise" required><EnterpriseSelect value={form.enterprise_name} onChange={(v) => set("enterprise_name", v)} enterprises={enterprises} /></Field>
                <Field label="Role in Enterprise"><Input value={form.role || ""} onChange={(e) => set("role", e.target.value)} className="rounded-xl" placeholder="e.g. Technician, Manager..." /></Field>
              </>
            )}

            {/* Item → Enterprise */}
            {relType === "item_enterprise" && (
              <>
                <Field label="Item" required><ItemSelect value={form.item_name} onChange={(v) => set("item_name", v)} products={products} /></Field>
                <Field label="Enterprise" required><EnterpriseSelect value={form.enterprise_name} onChange={(v) => set("enterprise_name", v)} enterprises={enterprises} /></Field>
                <Field label="Location"><Input value={form.location || ""} onChange={(e) => set("location", e.target.value)} className="rounded-xl" placeholder="e.g. Main Warehouse..." /></Field>
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
                <Field label="Item" required><ItemSelect value={form.item_name} onChange={(v) => set("item_name", v)} products={products} /></Field>
                <Field label="Person" required><PersonSelect value={form.person_name} onChange={(v) => set("person_name", v)} people={people} /></Field>
                <Field label="Custody Role"><Input value={form.role || ""} onChange={(e) => set("role", e.target.value)} className="rounded-xl" placeholder="e.g. Driver, Custodian..." /></Field>
              </>
            )}

            {/* Person → Service */}
            {relType === "person_service" && (
              <>
                <Field label="Person" required><PersonSelect value={form.person_name} onChange={(v) => set("person_name", v)} people={people} /></Field>
                <Field label="Service" required><ServiceSelect value={form.service_name} onChange={(v) => set("service_name", v)} services={services} /></Field>
                <Field label="Role"><Input value={form.role || ""} onChange={(e) => set("role", e.target.value)} className="rounded-xl" placeholder="e.g. Provider, Trainer..." /></Field>
              </>
            )}

            {/* Enterprise → Service */}
            {relType === "enterprise_service" && (
              <>
                <Field label="Enterprise" required><EnterpriseSelect value={form.enterprise_name} onChange={(v) => set("enterprise_name", v)} enterprises={enterprises} /></Field>
                <Field label="Service" required><ServiceSelect value={form.service_name} onChange={(v) => set("service_name", v)} services={services} /></Field>
                <Field label="Role">
                  <Select value={form.role || ""} onValueChange={(v) => set("role", v)}>
                    <SelectTrigger className="rounded-xl"><SelectValue placeholder="Provider or client..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="provider">Provider</SelectItem>
                      <SelectItem value="client">Client</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </>
            )}

            {/* Person → Address */}
            {relType === "person_address" && (
              <>
                <Field label="Person" required><PersonSelect value={form.person_name} onChange={(v) => set("person_name", v)} people={people} /></Field>
                <Field label="Address" required><AddressSelect value={form.location} onChange={(v) => set("location", v)} addresses={addresses} /></Field>
                <Field label="Address Type">
                  <Select value={form.role || ""} onValueChange={(v) => set("role", v)}>
                    <SelectTrigger className="rounded-xl"><SelectValue placeholder="Select type..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="home">Home</SelectItem>
                      <SelectItem value="work">Work</SelectItem>
                      <SelectItem value="mailing">Mailing</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </>
            )}

            {/* Enterprise → Address */}
            {relType === "enterprise_address" && (
              <>
                <Field label="Enterprise" required><EnterpriseSelect value={form.enterprise_name} onChange={(v) => set("enterprise_name", v)} enterprises={enterprises} /></Field>
                <Field label="Address" required><AddressSelect value={form.location} onChange={(v) => set("location", v)} addresses={addresses} /></Field>
                <Field label="Location Type">
                  <Select value={form.role || ""} onValueChange={(v) => set("role", v)}>
                    <SelectTrigger className="rounded-xl"><SelectValue placeholder="Select type..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hq">Headquarters</SelectItem>
                      <SelectItem value="branch">Branch</SelectItem>
                      <SelectItem value="warehouse">Warehouse</SelectItem>
                    </SelectContent>
                  </Select>
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

          <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 bg-slate-50/40 shrink-0">
            <Button type="button" variant="ghost" onClick={onClose} className="rounded-xl text-sm"><X className="w-4 h-4 mr-1" /> Cancel</Button>
            <div className="flex gap-2">
              {initialData && form.status === "active" && onEnd && (
                <Button type="button" variant="outline" onClick={handleEnd} className="rounded-xl text-sm border-rose-200 text-rose-600 hover:bg-rose-50">
                  <StopCircle className="w-4 h-4 mr-1" /> End
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