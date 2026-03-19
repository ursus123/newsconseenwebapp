import React from "react";

const TASK_TYPES = [
  { value: "clock_in", label: "Clock In / Out" },
  { value: "medication_admin", label: "Medication Admin" },
  { value: "delivery_task", label: "Delivery" },
  { value: "maintenance", label: "Maintenance" },
  { value: "stock_counting", label: "Stock Count" },
  { value: "service_visit", label: "Service Visit" },
  { value: "document_review", label: "Document Review" },
  { value: "other", label: "Other" },
];

const PRIORITIES = [
  { value: "low", label: "Low" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
];

export default function StepTask({ data, onChange, errors, people }) {
  const field = (key) => ({
    value: data[key] || "",
    onChange: (e) => onChange({ ...data, [key]: e.target.value }),
  });

  const inputCls = (key) =>
    `w-full px-3 py-2.5 rounded-xl border text-sm outline-none transition-colors
    ${errors[key] ? "border-red-400 bg-red-50" : "border-slate-200 focus:border-emerald-400 bg-white"}`;

  return (
    <div className="space-y-4">
      <div className="text-center mb-6">
        <div className="text-5xl mb-3">✅</div>
        <h2 className="text-xl font-bold text-slate-800">Assign your first task</h2>
        <p className="text-slate-500 text-sm mt-1">Tasks track operational work across your team</p>
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-600 mb-1.5">Task Title *</label>
        <input className={inputCls("title")} placeholder="e.g. Morning medication round" {...field("title")} />
        {errors.title && <p className="text-xs text-red-500 mt-1">{errors.title}</p>}
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-600 mb-1.5">Task Type</label>
        <select className={inputCls("task_type")} {...field("task_type")}>
          <option value="">Select type…</option>
          {TASK_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-600 mb-1.5">Assign To</label>
        {people.length > 0 ? (
          <select className={inputCls("assigned_to_name")} {...field("assigned_to_name")}>
            <option value="">Select person…</option>
            {people.map((p) => (
              <option key={p.id} value={`${p.first_name} ${p.last_name}`}>
                {p.first_name} {p.last_name}
              </option>
            ))}
          </select>
        ) : (
          <input className={inputCls("assigned_to_name")} placeholder="Enter name…" {...field("assigned_to_name")} />
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">Due Date</label>
          <input type="date" className={inputCls("due_date")} {...field("due_date")} />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">Priority</label>
          <select className={inputCls("priority")} {...field("priority")}>
            <option value="">Select…</option>
            {PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </div>
      </div>
    </div>
  );
}