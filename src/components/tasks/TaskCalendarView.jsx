import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";

const RAILWAY_URL = "https://newsconseenwebapp-production.up.railway.app";
const RAILWAY_API_KEY = (import.meta["env"] || {})["VITE_RAILWAY_API_KEY"] || "";
const triggerETL = (entity) =>
  fetch(`${RAILWAY_URL}/load/${entity}-summary`, {
    method: "POST",
    headers: RAILWAY_API_KEY ? { "x-api-key": RAILWAY_API_KEY } : {},
  }).catch(() => {});
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, isSameMonth, isToday, parseISO, addMonths, subMonths } from "date-fns";
import { ChevronLeft, ChevronRight, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

const PRIORITY_DOT = {
  urgent: "bg-rose-500",
  high: "bg-amber-400",
  normal: "bg-blue-400",
  low: "bg-slate-300",
};

const STATUS_TEXT = {
  completed: "line-through text-slate-400",
  cancelled: "line-through text-rose-300",
};

function buildCalendarDays(month) {
  const start = startOfWeek(startOfMonth(month), { weekStartsOn: 0 });
  const end = endOfWeek(endOfMonth(month), { weekStartsOn: 0 });
  const days = [];
  let d = start;
  while (d <= end) {
    days.push(d);
    d = addDays(d, 1);
  }
  return days;
}

export default function TaskCalendarView({ tasks }) {
  const [month, setMonth] = useState(new Date());
  const [dragOverDate, setDragOverDate] = useState(null);
  const qc = useQueryClient();

  const days = buildCalendarDays(month);

  // Map tasks by due_date string
  const tasksByDate = {};
  tasks.forEach((t) => {
    if (t.due_date) {
      const key = t.due_date.slice(0, 10);
      if (!tasksByDate[key]) tasksByDate[key] = [];
      tasksByDate[key].push(t);
    }
  });

  const handleDragStart = (e, task) => {
    e.dataTransfer.setData("taskId", task.id);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e, dateStr) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverDate(dateStr);
  };

  const handleDragLeave = () => setDragOverDate(null);

  const handleDrop = async (e, dateStr) => {
    e.preventDefault();
    setDragOverDate(null);
    const taskId = e.dataTransfer.getData("taskId");
    const task = tasks.find((t) => t.id === taskId);
    if (!task || task.due_date?.slice(0, 10) === dateStr) return;
    try {
      await base44.entities.Task.update(taskId, { ...task, due_date: dateStr });
      triggerETL("task");
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.refetchQueries({ queryKey: ["tasks"] });
    } catch (err) {
      console.error("Failed to update task due date", err);
    }
  };

  const noDateTasks = tasks.filter((t) => !t.due_date && t.status !== "completed" && t.status !== "cancelled");

  return (
    <div className="flex flex-col gap-4">
      {/* Month navigation */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-800">{format(month, "MMMM yyyy")}</h2>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg" onClick={() => setMonth(subMonths(month, 1))}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="sm" className="rounded-lg h-8 text-xs px-3" onClick={() => setMonth(new Date())}>
            Today
          </Button>
          <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg" onClick={() => setMonth(addMonths(month, 1))}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 text-center">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="text-[11px] font-bold text-slate-400 uppercase tracking-wider py-2">{d}</div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 border-l border-t border-slate-200 rounded-xl overflow-hidden">
        {days.map((day) => {
          const dateStr = format(day, "yyyy-MM-dd");
          const dayTasks = tasksByDate[dateStr] || [];
          const isCurrentMonth = isSameMonth(day, month);
          const isDropTarget = dragOverDate === dateStr;
          const todayCell = isToday(day);

          return (
            <div
              key={dateStr}
              className={`min-h-[110px] border-r border-b border-slate-200 p-1.5 transition-colors ${
                !isCurrentMonth ? "bg-slate-50" : "bg-white"
              } ${isDropTarget ? "bg-emerald-50 ring-2 ring-inset ring-emerald-400" : ""}`}
              onDragOver={(e) => handleDragOver(e, dateStr)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, dateStr)}
            >
              {/* Date number */}
              <div className="flex justify-end mb-1">
                <span className={`text-xs font-semibold w-6 h-6 flex items-center justify-center rounded-full ${
                  todayCell ? "bg-emerald-500 text-white" : isCurrentMonth ? "text-slate-700" : "text-slate-300"
                }`}>
                  {format(day, "d")}
                </span>
              </div>

              {/* Tasks */}
              <div className="space-y-0.5">
                {dayTasks.slice(0, 3).map((task) => (
                  <div
                    key={task.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, task)}
                    className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium cursor-grab active:cursor-grabbing truncate group
                      ${task.status === "completed" ? "bg-emerald-50 text-emerald-600" :
                        task.status === "cancelled" ? "bg-slate-100 text-slate-400" :
                        task.priority === "urgent" ? "bg-rose-50 text-rose-700" :
                        task.priority === "high" ? "bg-amber-50 text-amber-700" :
                        "bg-blue-50 text-blue-700"}`}
                    title={task.title}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${PRIORITY_DOT[task.priority] || PRIORITY_DOT.normal}`} />
                    <span className={`truncate ${STATUS_TEXT[task.status] || ""}`}>{task.title}</span>
                  </div>
                ))}
                {dayTasks.length > 3 && (
                  <div className="text-[10px] text-slate-400 font-medium px-1">+{dayTasks.length - 3} more</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Unscheduled tasks drop zone */}
      {noDateTasks.length > 0 && (
        <div className="mt-2">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
            Unscheduled ({noDateTasks.length}) — drag to a date to schedule
          </p>
          <div className="flex flex-wrap gap-2">
            {noDateTasks.map((task) => (
              <div
                key={task.id}
                draggable
                onDragStart={(e) => handleDragStart(e, task)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium cursor-grab active:cursor-grabbing border border-slate-200 bg-white shadow-sm
                  ${task.priority === "urgent" ? "border-rose-200 text-rose-700" :
                    task.priority === "high" ? "border-amber-200 text-amber-700" :
                    "text-slate-600"}`}
                title={task.title}
              >
                <span className={`w-2 h-2 rounded-full ${PRIORITY_DOT[task.priority] || PRIORITY_DOT.normal}`} />
                {task.title}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}