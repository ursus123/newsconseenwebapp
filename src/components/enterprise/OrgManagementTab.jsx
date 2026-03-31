import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Upload, Search } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import OrgChartBuilder from "@/components/enterprise/OrgChartBuilder";
import { TYPE_ALIASES } from "@/utils/typeAliases";

function Field({ label, children }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium text-slate-700">{label}</Label>
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

// People picker dropdown
function PeoplePicker({ value, onChange, people }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const filtered = people.filter((p) => `${p.first_name} ${p.last_name}`.toLowerCase().includes(query.toLowerCase()));
  return (
    <div className="relative">
      <div className="flex gap-1">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
          <Input
            value={query || value}
            onChange={(e) => { setQuery(e.target.value); onChange(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            placeholder="Search people..."
            className="rounded-lg text-xs h-8 pl-6"
          />
        </div>
      </div>
      {open && query && (
        <div className="absolute z-50 top-9 left-0 right-0 bg-white border border-slate-200 rounded-xl shadow-lg max-h-32 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-xs text-slate-400">No match — type a name manually</div>
          ) : (
            filtered.map((p) => (
              <button key={p.id} type="button"
                className="w-full text-left px-3 py-1.5 text-xs hover:bg-emerald-50 hover:text-emerald-700"
                onClick={() => { onChange(`${p.first_name} ${p.last_name}`); setQuery(""); setOpen(false); }}>
                {p.first_name} {p.last_name}
                {p.primary_role && <span className="text-slate-400 ml-1">({p.primary_role})</span>}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default function OrgManagementTab({ form, set, addItem, removeItem, updateItem, currentUser }) {
  const companyId = currentUser?.company_id;

  const { data: allPeople = [] } = useQuery({
    queryKey: ["people-org", companyId],
    queryFn: () => base44.entities.Person.filter(companyId ? { company_id: companyId } : {}),
  });

  const { data: allServices = [] } = useQuery({
    queryKey: ["services-org", companyId],
    queryFn: () => base44.entities.Service.filter(companyId ? { company_id: companyId } : {}),
  });

  const linkedServiceIds = (form.linked_service_ids || []);

  const toggleService = async (svc) => {
    const alreadyLinked = linkedServiceIds.includes(svc.id);
    if (alreadyLinked) {
      set("linked_service_ids", linkedServiceIds.filter((id) => id !== svc.id));
      set("services_description", (form.linked_services || []).filter((s) => s.id !== svc.id).map((s) => s.name).join(", "));
      set("linked_services", (form.linked_services || []).filter((s) => s.id !== svc.id));
    } else {
      const newLinked = [...(form.linked_services || []), { id: svc.id, name: svc.name, description: svc.description || "", category: svc.category || "" }];
      set("linked_service_ids", [...linkedServiceIds, svc.id]);
      set("linked_services", newLinked);
      set("services_description", newLinked.map((s) => s.name).join(", "));
    }
  };

  const linkedEmployeeIds = (form.linked_employee_ids || []);

  const toggleEmployee = (person) => {
    const fullName = `${person.first_name} ${person.last_name}`;
    const alreadyLinked = linkedEmployeeIds.includes(person.id);
    if (alreadyLinked) {
      set("linked_employee_ids", linkedEmployeeIds.filter((id) => id !== person.id));
      set("employee_docs", (form.employee_docs || []).filter((d) => d.person_id !== person.id));
    } else {
      set("linked_employee_ids", [...linkedEmployeeIds, person.id]);
      addItem("employee_docs", { person_id: person.id, employee_name: fullName, job_title: person.primary_role || "", job_description: "", resume_url: person.attachment_url || "" });
    }
  };

  return (
    <div className="space-y-6">
      {/* Legal Status & Ownership */}
      <div>
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Legal Status & Ownership</p>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Legal Structure">
            <Sel value={form.legal_structure} onChange={(v) => set("legal_structure", v)} options={[
              { value: "sole_proprietorship", label: "Sole Proprietorship" },
              { value: "partnership", label: "Partnership" },
              { value: "llc", label: "LLC" },
              { value: "corporation", label: "Corporation" },
              { value: "nonprofit", label: "Non-Profit" },
              { value: "cooperative", label: "Cooperative" },
              { value: "government", label: "Government / Public Entity" },
              { value: "other", label: "Other" },
            ]} placeholder="Select legal structure..." />
          </Field>
          <Field label="Registration Number">
            <Input value={form.registration_number || ""} onChange={(e) => set("registration_number", e.target.value)} className="rounded-xl" placeholder="e.g. Company reg. #" />
          </Field>
          <Field label="Tax / VAT Number">
            <Input value={form.tax_number || ""} onChange={(e) => set("tax_number", e.target.value)} className="rounded-xl" />
          </Field>
          <Field label="Ownership Type">
            <Sel value={form.ownership_type} onChange={(v) => set("ownership_type", v)} options={[
              { value: "privately_owned", label: "Privately Owned" },
              { value: "publicly_traded", label: "Publicly Traded" },
              { value: "family_owned", label: "Family Owned" },
              { value: "government_owned", label: "Government Owned" },
              { value: "joint_venture", label: "Joint Venture" },
              { value: "other", label: "Other" },
            ]} placeholder="Select ownership type..." />
          </Field>
          <div className="col-span-2">
            <Field label="Legal Notes">
              <Textarea value={form.legal_notes || ""} onChange={(e) => set("legal_notes", e.target.value)} className="rounded-xl resize-none" rows={2} placeholder="Any additional legal details..." />
            </Field>
          </div>
        </div>
      </div>

      {/* Org Chart */}
      <div className="border-t border-slate-100 pt-5">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Organization Chart</p>
        <OrgChartBuilder
          nodes={form.org_chart_nodes || []}
          onChange={(nodes) => set("org_chart_nodes", nodes)}
        />
      </div>

      {/* Table of Management */}
      <div className="border-t border-slate-100 pt-5">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Table of Management</p>
          <Button type="button" variant="outline" size="sm" className="rounded-xl text-xs h-7"
            onClick={() => addItem("management_table", { position: "", reports_to: "", supervises: "", occupants: "" })}>
            <Plus className="w-3 h-3 mr-1" /> Add Row
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-slate-100">
                <th className="text-left px-2 py-2 font-semibold text-slate-600 rounded-tl-lg">Position</th>
                <th className="text-left px-2 py-2 font-semibold text-slate-600">Reports To</th>
                <th className="text-left px-2 py-2 font-semibold text-slate-600">Supervises</th>
                <th className="text-left px-2 py-2 font-semibold text-slate-600">Occupant(s)</th>
                <th className="px-2 py-2 rounded-tr-lg w-6"></th>
              </tr>
            </thead>
            <tbody>
              {(form.management_table || []).map((row, i) => (
                <tr key={i} className="border-b border-slate-100 hover:bg-slate-50/50">
                  <td className="px-1 py-1">
                    <Input value={row.position || ""} onChange={(e) => updateItem("management_table", i, "position", e.target.value)} className="rounded-lg text-xs h-7 border-slate-200" placeholder="e.g. CEO" />
                  </td>
                  <td className="px-1 py-1">
                    <PeoplePicker value={row.reports_to || ""} onChange={(v) => updateItem("management_table", i, "reports_to", v)} people={allPeople} />
                  </td>
                  <td className="px-1 py-1">
                    <Input value={row.supervises || ""} onChange={(e) => updateItem("management_table", i, "supervises", e.target.value)} className="rounded-lg text-xs h-7 border-slate-200" placeholder="e.g. All Depts" />
                  </td>
                  <td className="px-1 py-1">
                    <PeoplePicker value={row.occupants || ""} onChange={(v) => updateItem("management_table", i, "occupants", v)} people={allPeople} />
                  </td>
                  <td className="px-1 py-1">
                    <button type="button" onClick={() => removeItem("management_table", i)} className="text-slate-400 hover:text-rose-500"><Trash2 className="w-3.5 h-3.5" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {(form.management_table || []).length === 0 && <p className="text-xs text-slate-400 py-3 text-center">No positions added yet</p>}
        </div>
      </div>

      {/* Services to Be Delivered — from Services table */}
      <div className="border-t border-slate-100 pt-5">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Services to Be Delivered</p>
        <p className="text-xs text-slate-400 mb-3">Select services from the Services table. New services can be added in the Services page.</p>
        {allServices.length === 0 ? (
          <div className="text-xs text-slate-400 bg-slate-50 rounded-xl px-4 py-3">No services found. Add services in the Services page first.</div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {allServices.map((svc) => {
              const linked = linkedServiceIds.includes(svc.id);
              return (
                <button key={svc.id} type="button" onClick={() => toggleService(svc)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all
                    ${linked ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-slate-600 border-slate-200 hover:border-emerald-400"}`}>
                  {svc.name}
                  {svc.category && <span className={`ml-1 ${linked ? "text-emerald-200" : "text-slate-400"}`}>· {svc.category}</span>}
                </button>
              );
            })}
          </div>
        )}
        {(form.linked_services || []).length > 0 && (
          <div className="mt-3 space-y-1">
            {(form.linked_services || []).map((svc, i) => (
              <div key={i} className="bg-emerald-50 rounded-lg px-3 py-1.5 text-xs text-emerald-700 flex items-center gap-2">
                <span className="font-medium">{svc.name}</span>
                {svc.description && <span className="text-emerald-500 truncate">{svc.description}</span>}
              </div>
            ))}
          </div>
        )}
        <div className="mt-3">
          <Field label="Scope of Services">
            <Textarea value={form.scope_of_services || ""} onChange={(e) => set("scope_of_services", e.target.value)} className="rounded-xl resize-none" rows={2} placeholder="Define the scope, boundaries, and service levels..." />
          </Field>
        </div>
      </div>

      {/* Job Descriptions & Resumes — from People table */}
      <div className="border-t border-slate-100 pt-5">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Job Descriptions & Employee Resumes</p>
        <p className="text-xs text-slate-400 mb-3">Select employees from the People table to populate. You can then add their job descriptions.</p>
        {allPeople.length === 0 ? (
          <div className="text-xs text-slate-400 bg-slate-50 rounded-xl px-4 py-3">No people found. Add people in the People page first.</div>
        ) : (
          <div className="flex flex-wrap gap-2 mb-3">
            {allPeople.filter((p) => TYPE_ALIASES.staff.includes(p.person_type) || !p.person_type).map((person) => {
              const linked = linkedEmployeeIds.includes(person.id);
              return (
                <button key={person.id} type="button" onClick={() => toggleEmployee(person)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all
                    ${linked ? "bg-slate-800 text-white border-slate-800" : "bg-white text-slate-600 border-slate-200 hover:border-slate-400"}`}>
                  {person.first_name} {person.last_name}
                  {person.primary_role && <span className={`ml-1 ${linked ? "text-slate-300" : "text-slate-400"}`}>· {person.primary_role}</span>}
                </button>
              );
            })}
          </div>
        )}
        <div className="space-y-3">
          {(form.employee_docs || []).map((doc, i) => (
            <div key={i} className="bg-slate-50 rounded-xl p-3 space-y-2 border border-slate-100">
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <p className="text-xs font-semibold text-slate-700">{doc.employee_name}</p>
                  <p className="text-[10px] text-slate-400">{doc.job_title}</p>
                </div>
                <button type="button" onClick={() => { removeItem("employee_docs", i); set("linked_employee_ids", linkedEmployeeIds.filter((id) => id !== doc.person_id)); }}
                  className="text-slate-400 hover:text-rose-500"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
              <Textarea placeholder="Job description..." value={doc.job_description || ""} onChange={(e) => updateItem("employee_docs", i, "job_description", e.target.value)} className="rounded-lg text-xs resize-none" rows={2} />
              <div className="flex gap-2 items-center">
                {doc.resume_url ? (
                  <a href={doc.resume_url} target="_blank" rel="noreferrer" className="text-xs text-emerald-600 underline truncate flex-1">View Resume</a>
                ) : (
                  <span className="text-xs text-slate-400 flex-1">No resume uploaded</span>
                )}
                <label className="shrink-0 cursor-pointer">
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-200 text-xs text-slate-500 hover:bg-slate-100 transition-colors">
                    <Upload className="w-3 h-3" /> Upload Resume
                  </span>
                  <input type="file" className="hidden" onChange={async (e) => {
                    const file = e.target.files[0];
                    if (!file) return;
                    const { file_url } = await base44.integrations.Core.UploadFile({ file });
                    updateItem("employee_docs", i, "resume_url", file_url);
                  }} />
                </label>
              </div>
            </div>
          ))}
          {(form.employee_docs || []).length === 0 && <p className="text-xs text-slate-400 py-2 text-center">Select employees above to add their job descriptions</p>}
        </div>
      </div>
    </div>
  );
}