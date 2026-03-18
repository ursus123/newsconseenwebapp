import React from "react";
import { isPast, parseISO } from "date-fns";

function MetricBar({ label, value, color }) {
  return (
    <div className="flex-1 min-w-[140px]">
      <div className="flex justify-between items-center mb-1">
        <span className="text-xs text-slate-500">{label}</span>
        <span className={`text-sm font-bold ${color}`}>{value}</span>
      </div>
      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${color.replace("text-", "bg-")}`}
          style={{ width: typeof value === "string" && value.endsWith("%") ? value : "0%" }}
        />
      </div>
    </div>
  );
}

export default function TaskPerformanceMetrics({ tasks }) {
  const total = tasks.length;
  if (total === 0) return null;

  const completed = tasks.filter((t) => t.status === "completed").length;
  const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

  const completedOnTime = tasks.filter((t) => {
    if (t.status !== "completed" || !t.due_date) return false;
    const ref = t.updated_date ? new Date(t.updated_date) : null;
    if (!ref) return true; // assume on time if no updated date
    return !isPast(parseISO(t.due_date)) || ref <= parseISO(t.due_date);
  }).length;
  const onTimeRate = completed > 0 ? Math.round((completedOnTime / completed) * 100) : 0;

  const uniquePeople = new Set(tasks.filter((t) => t.assigned_to_email).map((t) => t.assigned_to_email)).size;
  const avgPerPerson = uniquePeople > 0 ? (total / uniquePeople).toFixed(1) : "—";

  const triggerRate = total > 0 ? Math.round((tasks.filter((t) => t.trigger_transaction).length / total) * 100) : 0;

  return (
    <div className="bg-white border border-slate-100 rounded-2xl px-5 py-4 mb-6">
      <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Performance Metrics</p>
      <div className="flex flex-wrap gap-6">
        <MetricBar label="Completion Rate" value={`${completionRate}%`} color="text-emerald-600" />
        <MetricBar label="On-Time Rate" value={`${onTimeRate}%`} color="text-blue-600" />
        <div className="flex-1 min-w-[140px]">
          <div className="flex justify-between items-center mb-1">
            <span className="text-xs text-slate-500">Avg Tasks / Person</span>
            <span className="text-sm font-bold text-slate-700">{avgPerPerson}</span>
          </div>
          <div className="h-1.5 bg-slate-100 rounded-full" />
        </div>
        <MetricBar label="Transaction Trigger Rate" value={`${triggerRate}%`} color="text-violet-600" />
      </div>
    </div>
  );
}