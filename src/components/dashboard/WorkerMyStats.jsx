import React from "react";
import { isThisWeek, isPast, parseISO, isYesterday, isToday } from "date-fns";

function StatPill({ label, value, color }) {
  return (
    <div className={`flex-1 min-w-[100px] rounded-xl px-4 py-3 ${color}`}>
      <p className="text-lg font-black">{value}</p>
      <p className="text-xs opacity-70 mt-0.5">{label}</p>
    </div>
  );
}

export default function WorkerMyStats({ tasks }) {
  const completedTasks = tasks.filter((t) => t.status === "completed");

  const thisWeekDone = completedTasks.filter((t) => {
    const ref = t.updated_date || t.created_date;
    if (!ref) return false;
    try { return isThisWeek(new Date(ref), { weekStartsOn: 1 }); } catch { return false; }
  });

  const onTime = thisWeekDone.filter((t) => {
    if (!t.due_date || !t.updated_date) return false;
    return new Date(t.updated_date) <= parseISO(t.due_date);
  });
  const onTimeRate = thisWeekDone.length > 0 ? Math.round((onTime.length / thisWeekDone.length) * 100) : 0;

  // Streak: consecutive days with at least 1 completion
  let streak = 0;
  let day = new Date();
  while (true) {
    const dayStr = day.toISOString().split("T")[0];
    const hasComp = completedTasks.some((t) => {
      const ref = t.updated_date || t.created_date;
      return ref && ref.startsWith(dayStr);
    });
    if (!hasComp) break;
    streak++;
    day.setDate(day.getDate() - 1);
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-5">
      <h3 className="text-sm font-bold text-slate-700 mb-3">My Stats This Week</h3>
      <div className="flex gap-3 flex-wrap">
        <StatPill label="Completed" value={thisWeekDone.length} color="bg-emerald-50 text-emerald-700" />
        <StatPill label="On-Time Rate" value={`${onTimeRate}%`} color="bg-blue-50 text-blue-700" />
        <StatPill label="Day Streak 🔥" value={streak} color="bg-amber-50 text-amber-700" />
      </div>
    </div>
  );
}