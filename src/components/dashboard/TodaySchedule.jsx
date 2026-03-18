import React from "react";
import { isToday, parseISO, isPast } from "date-fns";
import { Calendar, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const PRIORITY_COLOR = {
  low: "bg-slate-100 text-slate-500",
  normal: "bg-blue-50 text-blue-600",
  high: "bg-amber-50 text-amber-700",
  urgent: "bg-rose-50 text-rose-600",
};

export default function TodaySchedule({ tasks }) {
  const todayTasks = tasks
    .filter((t) => t.due_date && isToday(parseISO(t.due_date)) && t.status !== "cancelled")
    .sort((a, b) => (a.due_time || "23:59").localeCompare(b.due_time || "23:59"));

  if (todayTasks.length === 0) return null;

  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-5">
      <div className="flex items-center gap-2 mb-4">
        <Calendar className="w-4 h-4 text-emerald-600" />
        <h3 className="text-sm font-bold text-slate-700">Today's Schedule</h3>
        <span className="ml-auto text-xs text-slate-400">{todayTasks.length} task{todayTasks.length !== 1 ? "s" : ""}</span>
      </div>
      <div className="space-y-2">
        {todayTasks.map((t) => {
          const overdue = t.due_time && isPast(new Date(`${t.due_date}T${t.due_time}`)) && t.status !== "completed";
          return (
            <div key={t.id} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 ${t.status === "completed" ? "bg-emerald-50/50 opacity-60" : overdue ? "bg-rose-50/50" : "bg-slate-50"}`}>
              <div className={`text-xs font-mono font-semibold w-12 shrink-0 ${overdue ? "text-rose-600" : "text-slate-500"}`}>
                {t.due_time || <Clock className="w-3 h-3 inline text-slate-300" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium truncate ${t.status === "completed" ? "line-through text-slate-400" : "text-slate-800"}`}>{t.title}</p>
                {(t.assigned_to_name || t.enterprise) && (
                  <p className="text-xs text-slate-400 mt-0.5">{[t.assigned_to_name, t.enterprise].filter(Boolean).join(" · ")}</p>
                )}
              </div>
              <Badge className={`shrink-0 text-xs ${PRIORITY_COLOR[t.priority] || PRIORITY_COLOR.normal}`}>{t.priority || "normal"}</Badge>
            </div>
          );
        })}
      </div>
    </div>
  );
}