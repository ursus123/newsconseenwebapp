import React from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { AlertCircle } from "lucide-react";
import { differenceInDays, parseISO } from "date-fns";

export default function OverdueTasksAlert({ tasks }) {
  const overdue = tasks
    .filter((t) => t.due_date && t.status !== "completed" && t.status !== "cancelled" && new Date() > parseISO(t.due_date))
    .sort((a, b) => parseISO(a.due_date) - parseISO(b.due_date))
    .slice(0, 5);

  if (overdue.length === 0) return null;

  return (
    <div className="rounded-2xl border border-rose-200 bg-rose-50/50 overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3 bg-rose-100/60 border-b border-rose-200">
        <AlertCircle className="w-4 h-4 text-rose-600" />
        <span className="text-sm font-semibold text-rose-700">⚠️ {tasks.filter((t) => t.due_date && t.status !== "completed" && t.status !== "cancelled" && new Date() > parseISO(t.due_date)).length} overdue tasks need attention</span>
        <Link to={createPageUrl("Tasks")} className="ml-auto text-xs font-semibold text-rose-600 hover:underline">View All Overdue →</Link>
      </div>
      <div className="divide-y divide-rose-100">
        {overdue.map((t) => {
          const daysAgo = differenceInDays(new Date(), parseISO(t.due_date));
          return (
            <div key={t.id} className="flex items-center gap-3 px-5 py-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800 truncate">{t.title}</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  {[t.enterprise, t.assigned_to_name].filter(Boolean).join(" · ")}
                </p>
              </div>
              <span className="text-xs font-semibold text-rose-600 bg-rose-100 rounded-full px-2 py-0.5 shrink-0">
                {daysAgo}d overdue
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}