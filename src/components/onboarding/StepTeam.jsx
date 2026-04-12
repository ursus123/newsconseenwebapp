import React, { useState } from "react";
import { Plus, X } from "lucide-react";

const PERSON_TYPES = [
  { value: "staff",     label: "Staff / Employee" },
  { value: "contact",   label: "Contractor / Freelancer" },
  { value: "volunteer", label: "Volunteer" },
];

const TYPE_COLOR = {
  staff:     "bg-emerald-100 text-emerald-700",
  contact:   "bg-blue-100 text-blue-700",
  volunteer: "bg-amber-100 text-amber-700",
};

const EMPTY = { first_name: "", last_name: "", role: "", person_type: "staff" };

export default function StepTeam({ people, onChange }) {
  const [form, setForm] = useState(EMPTY);
  const [formErr, setFormErr] = useState({});

  const addPerson = () => {
    const err = {};
    if (!form.first_name.trim()) err.first_name = "Required";
    if (!form.last_name.trim()) err.last_name = "Required";
    if (Object.keys(err).length) { setFormErr(err); return; }
    onChange([...people, { ...form, id: Date.now() }]);
    setForm(EMPTY);
    setFormErr({});
  };

  const remove = (id) => onChange(people.filter((p) => p.id !== id));

  const inputCls = (key) =>
    `w-full px-3 py-2 rounded-xl border text-sm outline-none transition-colors
    ${formErr[key] ? "border-red-400 bg-red-50" : "border-slate-200 focus:border-emerald-400 bg-white"}`;

  return (
    <div className="space-y-4">
      <div className="text-center mb-6">
        <div className="text-5xl mb-3">👥</div>
        <h2 className="text-xl font-bold text-slate-800">Who works with you?</h2>
        <p className="text-slate-500 text-sm mt-1">Add your first team members</p>
      </div>

      <div className="bg-slate-50 rounded-2xl p-4 space-y-3 border border-slate-100">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">First Name</label>
            <input className={inputCls("first_name")} placeholder="Jane" value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} />
            {formErr.first_name && <p className="text-xs text-red-500 mt-0.5">{formErr.first_name}</p>}
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Last Name</label>
            <input className={inputCls("last_name")} placeholder="Doe" value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} />
            {formErr.last_name && <p className="text-xs text-red-500 mt-0.5">{formErr.last_name}</p>}
          </div>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Role / Position</label>
          <input className={inputCls("role")} placeholder="e.g. Nurse, Driver, Manager" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Person Type</label>
          <select className={inputCls("person_type")} value={form.person_type} onChange={(e) => setForm({ ...form, person_type: e.target.value })}>
            {PERSON_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <button
          onClick={addPerson}
          className="w-full flex items-center justify-center gap-2 py-2 rounded-xl border-2 border-dashed border-emerald-300 text-emerald-600 text-sm font-semibold hover:bg-emerald-50 transition-colors"
        >
          <Plus className="w-4 h-4" /> Add Person
        </button>
      </div>

      {people.length > 0 && (
        <div className="space-y-2">
          {people.map((p) => (
            <div key={p.id} className="flex items-center justify-between bg-white border border-slate-100 rounded-xl px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-slate-800">{p.first_name} {p.last_name}</p>
                <p className="text-xs text-slate-500">{p.role || "No role specified"}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${TYPE_COLOR[p.person_type] || "bg-slate-100 text-slate-600"}`}>{p.person_type}</span>
                <button onClick={() => remove(p.id)} className="text-slate-300 hover:text-red-400 transition-colors"><X className="w-4 h-4" /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {people.length === 0 && (
        <p className="text-center text-xs text-slate-400 py-2">No team members added yet</p>
      )}
    </div>
  );
}