import React from "react";
import { format } from "date-fns";

function getMedStatus(task) {
  if (task.outcome === "completed") return "administered";
  if (task.outcome === "refused" || task.outcome === "missed") return "missed";
  if (task.internal_notes?.includes("PRN")) return "prn";
  const now = new Date();
  if (task.scheduled_date && task.scheduled_time) {
    const scheduled = new Date(`${task.scheduled_date}T${task.scheduled_time}`);
    if (scheduled < now) return "overdue";
  }
  return "due";
}

export default function QuickStats({ tasks, activeFilter, onFilterChange, darkMode }) {
  const today = format(new Date(), "yyyy-MM-dd");
  const todayTasks = tasks.filter((t) => t.task_type === "medication_admin" && t.scheduled_date === today);

  const given = todayTasks.filter((t) => t.outcome === "completed").length;
  const refused = todayTasks.filter((t) => t.outcome === "refused" || t.outcome === "missed").length;
  const due = todayTasks.filter((t) => {
    const s = getMedStatus(t);
    return s === "due" || s === "overdue";
  }).length;
  const prn = todayTasks.filter((t) => t.internal_notes?.includes("PRN") && !t.outcome?.includes("complete")).length;

  const stats = [
    { key: "Administered", icon: "✅", label: "Given",   value: given,   active: "bg-emerald-100 text-emerald-700 border-emerald-300" },
    { key: "Missed",       icon: "❌", label: "Refused", value: refused, active: "bg-red-100 text-red-700 border-red-300" },
    { key: "Due",          icon: "⏰", label: "Due",     value: due,     active: "bg-amber-100 text-amber-700 border-amber-300" },
    { key: "PRN",          icon: "📋", label: "PRN",     value: prn,     active: "bg-blue-100 text-blue-700 border-blue-300" },
  ];

  return (
    <div className="flex gap-2 overflow-x-auto no-scrollbar py-1">
      {stats.map((s) => {
        const isActive = activeFilter === s.key;
        return (
          <button
            key={s.key}
            onClick={() => onFilterChange(isActive ? "All" : s.key)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border-2 text-xs font-bold whitespace-nowrap transition-all shrink-0
              ${isActive ? s.active : darkMode ? "bg-slate-700 border-slate-600 text-slate-300" : "bg-white border-gray-200 text-gray-500"}`}
          >
            <span>{s.icon}</span>
            <span>{s.value} {s.label}</span>
          </button>
        );
      })}
    </div>
  );
}