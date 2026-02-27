import React, { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, CheckCircle, Clock, AlertCircle, ChevronDown, ChevronUp } from "lucide-react";
import { format, isToday, parseISO, isThisWeek } from "date-fns";
import { taskTypeLabel } from "@/components/tasks/TaskForm";

const STATUS_COLOR = {
  open: "bg-blue-50 text-blue-700",
  in_progress: "bg-amber-50 text-amber-700",
  completed: "bg-emerald-50 text-emerald-700",
  cancelled: "bg-slate-100 text-slate-500",
};

const OUTCOME_COLOR = {
  completed: "text-emerald-600",
  refused: "text-orange-500",
  missed: "text-slate-400",
  partially_done: "text-yellow-600",
  pending: "text-slate-400",
};

function UserRow({ user, tasks }) {
  const [expanded, setExpanded] = useState(false);

  const done = tasks.filter((t) => t.status === "completed").length;
  const open = tasks.filter((t) => t.status === "open" || t.status === "in_progress").length;
  const todayDone = tasks.filter(
    (t) => t.status === "completed" && t.updated_date && isToday(new Date(t.updated_date))
  ).length;

  const recent = [...tasks]
    .sort((a, b) => new Date(b.updated_date) - new Date(a.updated_date))
    .slice(0, 10);

  return (
    <div className="border border-slate-100 rounded-xl overflow-hidden">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 bg-white hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-bold text-sm">
            {(user.full_name || user.email || "?")[0].toUpperCase()}
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold text-slate-800">{user.full_name || user.email}</p>
            <p className="text-[11px] text-slate-400">{user.email}</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="hidden sm:flex gap-3 text-xs text-slate-500">
            <span className="flex items-center gap-1">
              <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
              {done} done
            </span>
            <span className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-blue-400" />
              {open} open
            </span>
            {todayDone > 0 && (
              <Badge className="bg-emerald-50 text-emerald-700 text-[10px]">
                {todayDone} today
              </Badge>
            )}
          </div>
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-slate-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-400" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-slate-100 bg-slate-50 px-4 py-3 space-y-2">
          {recent.length === 0 ? (
            <p className="text-xs text-slate-400 py-2">No tasks recorded yet.</p>
          ) : (
            recent.map((task) => (
              <div key={task.id} className="flex items-start justify-between gap-2 py-2 border-b border-slate-100 last:border-0">
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                    {taskTypeLabel(task.task_type)}
                  </p>
                  <p className="text-sm text-slate-700 truncate">{task.title}</p>
                  {task.enterprise && (
                    <p className="text-xs text-slate-400 truncate">{task.enterprise}</p>
                  )}
                  {task.outcome_notes && (
                    <p className="text-xs text-slate-400 italic mt-0.5 line-clamp-1">{task.outcome_notes}</p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <Badge className={STATUS_COLOR[task.status] || "bg-slate-100 text-slate-500"}>
                    {task.status?.replace("_", " ")}
                  </Badge>
                  {task.outcome && task.outcome !== "pending" && (
                    <span className={`text-[10px] font-semibold ${OUTCOME_COLOR[task.outcome]}`}>
                      {task.outcome.replace("_", " ")}
                    </span>
                  )}
                  <span className="text-[10px] text-slate-300">
                    {task.updated_date
                      ? isToday(new Date(task.updated_date))
                        ? `Today ${format(new Date(task.updated_date), "HH:mm")}`
                        : format(new Date(task.updated_date), "MMM d HH:mm")
                      : ""}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default function TeamActivity({ tasks, appUsers }) {
  const [filter, setFilter] = useState("all");

  const usersWithTasks = appUsers
    .filter((u) => u.role !== "admin" && u.role !== "super_admin")
    .map((u) => ({
      user: u,
      tasks: tasks.filter((t) => t.assigned_to_email === u.email),
    }))
    .filter((row) => {
      if (filter === "active") return row.tasks.some((t) => t.status !== "completed" && t.status !== "cancelled");
      if (filter === "today") return row.tasks.some((t) => t.updated_date && isToday(new Date(t.updated_date)));
      return true;
    })
    .sort((a, b) => {
      // Sort by most recent activity first
      const latestA = a.tasks.reduce((m, t) => Math.max(m, new Date(t.updated_date || 0)), 0);
      const latestB = b.tasks.reduce((m, t) => Math.max(m, new Date(t.updated_date || 0)), 0);
      return latestB - latestA;
    });

  const totalDoneToday = tasks.filter(
    (t) => t.status === "completed" && t.updated_date && isToday(new Date(t.updated_date))
  ).length;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-slate-500" />
          <h2 className="text-base font-semibold text-slate-700">Team Activity</h2>
          {totalDoneToday > 0 && (
            <Badge className="bg-emerald-50 text-emerald-700 text-[10px]">
              {totalDoneToday} tasks completed today
            </Badge>
          )}
        </div>
        <div className="flex gap-1">
          {[
            { key: "all", label: "All" },
            { key: "today", label: "Today" },
            { key: "active", label: "Active" },
          ].map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                filter === f.key
                  ? "bg-emerald-600 text-white border-emerald-600"
                  : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {usersWithTasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 border-2 border-dashed border-slate-100 rounded-2xl">
          <AlertCircle className="w-7 h-7 text-slate-200 mb-2" />
          <p className="text-sm text-slate-400">No user activity to show</p>
        </div>
      ) : (
        <div className="space-y-2">
          {usersWithTasks.map(({ user, tasks: userTasks }) => (
            <UserRow key={user.id} user={user} tasks={userTasks} />
          ))}
        </div>
      )}
    </div>
  );
}