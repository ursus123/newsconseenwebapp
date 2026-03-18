import React from "react";
import { isToday, isTomorrow, isPast, parseISO, isThisWeek, format } from "date-fns";
import { AlertCircle } from "lucide-react";

const SECTIONS = [
  { key: "overdue", label: "Overdue", color: "border-rose-200 bg-rose-50/30", headerColor: "text-rose-700 bg-rose-50" },
  { key: "today", label: "Today", color: "border-emerald-200 bg-emerald-50/20", headerColor: "text-emerald-700 bg-emerald-50" },
  { key: "tomorrow", label: "Tomorrow", color: "border-blue-100 bg-blue-50/10", headerColor: "text-blue-700 bg-blue-50" },
  { key: "this_week", label: "This Week", color: "border-slate-200 bg-slate-50/20", headerColor: "text-slate-700 bg-slate-50" },
  { key: "later", label: "Later", color: "border-slate-100", headerColor: "text-slate-500 bg-slate-50" },
  { key: "no_date", label: "No Due Date", color: "border-slate-100", headerColor: "text-slate-400 bg-slate-50" },
];

function bucketTask(task) {
  if (!task.due_date) return "no_date";
  const d = parseISO(task.due_date);
  const incomplete = task.status !== "completed" && task.status !== "cancelled";
  if (incomplete && isPast(d) && !isToday(d)) return "overdue";
  if (isToday(d)) return "today";
  if (isTomorrow(d)) return "tomorrow";
  if (isThisWeek(d, { weekStartsOn: 1 })) return "this_week";
  return "later";
}

export default function TaskTimelineView({ tasks, renderCard }) {
  const grouped = {};
  SECTIONS.forEach((s) => (grouped[s.key] = []));
  tasks.forEach((t) => {
    const bucket = bucketTask(t);
    grouped[bucket].push(t);
  });

  return (
    <div className="space-y-5">
      {SECTIONS.map((section) => {
        const items = grouped[section.key];
        if (items.length === 0) return null;
        return (
          <div key={section.key} className={`rounded-2xl border ${section.color} overflow-hidden`}>
            <div className={`flex items-center gap-2 px-4 py-2.5 ${section.headerColor}`}>
              {section.key === "overdue" && <AlertCircle className="w-4 h-4" />}
              <span className="text-sm font-semibold">{section.label}</span>
              <span className="text-xs font-semibold opacity-60 ml-auto">{items.length}</span>
            </div>
            <div className="p-3 space-y-2">
              {items.map((task) => renderCard(task))}
            </div>
          </div>
        );
      })}
    </div>
  );
}