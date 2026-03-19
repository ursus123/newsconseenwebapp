import React from "react";
import { format } from "date-fns";
import { getWeekDays, parseShiftMeta, calcHours } from "./shiftUtils";

function getStaffWeekStats(person, shifts, leaveTasks, weekDays) {
  const weekDates = weekDays.map((d) => format(d, "yyyy-MM-dd"));
  const myShifts = shifts.filter((s) => s.assigned_to_email === person.email && weekDates.includes(s.scheduled_date));
  const onLeave = leaveTasks.some((l) => l.assigned_to_email === person.email && weekDates.includes(l.scheduled_date));
  const totalHours = myShifts.reduce((sum, s) => {
    const meta = parseShiftMeta(s);
    return sum + calcHours(meta.start_time || s.scheduled_time, meta.end_time || s.due_time, meta.break_minutes);
  }, 0);
  const daysScheduled = new Set(myShifts.map((s) => s.scheduled_date)).size;
  return { myShifts, totalHours, daysScheduled, onLeave };
}

export default function StaffPanel({ people, shifts, leaveTasks, baseDate, highlightedStaff, onHighlight }) {
  const weekDays = getWeekDays(baseDate);

  const totalShifts = shifts.length;
  const totalHours = shifts.reduce((sum, s) => {
    const meta = parseShiftMeta(s);
    return sum + calcHours(meta.start_time || s.scheduled_time, meta.end_time || s.due_time, meta.break_minutes);
  }, 0);
  const unscheduled = people.filter((p) => !shifts.some((s) => s.assigned_to_email === p.email)).length;

  return (
    <div className="w-72 shrink-0 bg-white border-l border-gray-200 flex flex-col overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100">
        <p className="text-xs font-black text-gray-400 uppercase tracking-widest">Staff This Week</p>
      </div>

      {/* Staff list */}
      <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
        {people.map((person) => {
          const { totalHours: hrs, daysScheduled, onLeave } = getStaffWeekStats(person, shifts, leaveTasks, weekDays);
          const target = 40;
          const pct = Math.min((hrs / target) * 100, 100);
          const isOver = hrs > target;
          const isHighlighted = highlightedStaff === person.id;

          let statusDot = "bg-gray-300";
          if (onLeave) statusDot = "bg-gray-400";
          else if (hrs >= target * 0.9) statusDot = "bg-emerald-500";
          else if (hrs > 0) statusDot = "bg-amber-400";
          else statusDot = "bg-red-400";

          return (
            <button
              key={person.id}
              onClick={() => onHighlight(isHighlighted ? null : person.id)}
              className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors ${isHighlighted ? "bg-indigo-50" : ""}`}
            >
              <div className="flex items-center gap-2 mb-1.5">
                <div className="relative shrink-0">
                  <div className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-black text-[10px]">
                    {(person.first_name?.[0] || "") + (person.last_name?.[0] || "")}
                  </div>
                  <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white ${statusDot}`} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-gray-800 truncate">{person.first_name} {person.last_name}</p>
                  {person.primary_role && <p className="text-[10px] text-gray-400 truncate">{person.primary_role}</p>}
                </div>
                <span className={`text-[10px] font-black ${isOver ? "text-red-600" : "text-gray-500"}`}>
                  {hrs.toFixed(0)}h
                </span>
              </div>
              {/* Progress bar */}
              <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${isOver ? "bg-red-500" : hrs > 0 ? "bg-emerald-500" : "bg-gray-200"}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-[9px] text-gray-400">{daysScheduled} days</span>
                <span className="text-[9px] text-gray-400">{hrs.toFixed(0)}h / {target}h</span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Stats footer */}
      <div className="border-t border-gray-100 px-4 py-3 space-y-1.5 bg-gray-50">
        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Week Stats</p>
        <div className="flex justify-between text-xs">
          <span className="text-gray-500">Total shifts</span>
          <span className="font-bold text-gray-800">{totalShifts}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-gray-500">Total hours</span>
          <span className="font-bold text-gray-800">{totalHours.toFixed(0)}h</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-gray-500">Avg per staff</span>
          <span className="font-bold text-gray-800">{people.length ? (totalHours / people.length).toFixed(1) : 0}h</span>
        </div>
        {unscheduled > 0 && (
          <div className="flex justify-between text-xs">
            <span className="text-red-500 font-bold">No shifts</span>
            <span className="font-bold text-red-600">{unscheduled} staff</span>
          </div>
        )}
      </div>
    </div>
  );
}