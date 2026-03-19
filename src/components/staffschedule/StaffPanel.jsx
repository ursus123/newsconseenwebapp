import React from "react";
import { format } from "date-fns";
import { parseShiftMeta, calcHours, getWeekDays } from "./shiftUtils";

const TARGET_HOURS = 40;

function getStaffWeekStats(email, shifts, weekDays) {
  const weekDates = new Set(weekDays.map((d) => format(d, "yyyy-MM-dd")));
  const myShifts = shifts.filter((s) => s.assigned_to_email === email && weekDates.has(s.scheduled_date));
  const totalHours = myShifts.reduce((acc, s) => {
    const meta = parseShiftMeta(s);
    return acc + calcHours(meta.start_time || "", meta.end_time || "", meta.break_minutes || 0);
  }, 0);
  const daysScheduled = new Set(myShifts.map((s) => s.scheduled_date)).size;
  return { totalHours, daysScheduled, shiftCount: myShifts.length };
}

function StatusDot({ status }) {
  const colors = {
    full:    "bg-emerald-500",
    partial: "bg-amber-400",
    none:    "bg-red-500",
    leave:   "bg-gray-300",
  };
  return <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${colors[status] || "bg-gray-300"}`} />;
}

export default function StaffPanel({ people, shifts, leaveTasks, baseDate, highlightedStaff, onHighlight }) {
  const weekDays = getWeekDays(baseDate);
  const leaveEmails = new Set((leaveTasks || []).map((t) => t.assigned_to_email));

  // Week stats
  const totalShifts = shifts.length;
  const totalHours = shifts.reduce((acc, s) => {
    const meta = parseShiftMeta(s);
    return acc + calcHours(meta.start_time || "", meta.end_time || "", meta.break_minutes || 0);
  }, 0);
  const noShiftStaff = people.filter((p) => {
    const { shiftCount } = getStaffWeekStats(p.email || p.id, shifts, weekDays);
    return shiftCount === 0 && !leaveEmails.has(p.email);
  });
  const weekendShifts = shifts.filter((s) => {
    const d = new Date(s.scheduled_date);
    return d.getDay() === 0 || d.getDay() === 6;
  }).length;

  return (
    <div className="w-72 shrink-0 border-l border-gray-100 bg-white flex flex-col h-full overflow-y-auto">
      <div className="px-4 py-3 border-b border-gray-100">
        <p className="text-xs font-black text-gray-400 uppercase tracking-widest">Staff Availability</p>
      </div>

      {/* Staff list */}
      <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
        {people.map((person) => {
          const email = person.email || person.id;
          const { totalHours: hrs, daysScheduled } = getStaffWeekStats(email, shifts, weekDays);
          const isOnLeave = leaveEmails.has(email);
          const status = isOnLeave ? "leave" : hrs === 0 ? "none" : hrs < TARGET_HOURS * 0.7 ? "partial" : "full";
          const isHighlighted = highlightedStaff === email;
          const pct = Math.min(100, (hrs / TARGET_HOURS) * 100);
          const isOver = hrs > TARGET_HOURS;

          return (
            <button
              key={person.id}
              onClick={() => onHighlight(isHighlighted ? null : email)}
              className={`w-full flex items-start gap-2.5 px-4 py-3 text-left hover:bg-gray-50 transition-colors ${isHighlighted ? "bg-indigo-50" : ""}`}
            >
              <StatusDot status={status} />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-gray-800 truncate">{person.first_name} {person.last_name}</p>
                <p className="text-[10px] text-gray-400 truncate">{person.primary_role || "Staff"}</p>
                {!isOnLeave && (
                  <>
                    <div className="flex items-center justify-between mt-1.5">
                      <span className={`text-[10px] font-bold ${isOver ? "text-red-600" : "text-gray-600"}`}>{hrs.toFixed(1)}h / {TARGET_HOURS}h</span>
                      <span className="text-[10px] text-gray-400">{daysScheduled}d</span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${isOver ? "bg-red-500" : pct > 70 ? "bg-emerald-500" : "bg-amber-400"}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </>
                )}
                {isOnLeave && <p className="text-[10px] text-pink-600 font-semibold mt-0.5">🏖️ On leave</p>}
              </div>
            </button>
          );
        })}
      </div>

      {/* Stats */}
      <div className="border-t border-gray-100 px-4 py-4 space-y-2">
        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Week Stats</p>
        {[
          { label: "Total shifts", value: totalShifts },
          { label: "Total hours", value: `${totalHours.toFixed(0)}h` },
          { label: "Avg hours/staff", value: people.length > 0 ? `${(totalHours / people.length).toFixed(1)}h` : "—" },
          { label: "Staff w/o shifts", value: noShiftStaff.length, warn: noShiftStaff.length > 0 },
          { label: "Weekend shifts", value: weekendShifts },
        ].map((s) => (
          <div key={s.label} className="flex justify-between text-xs">
            <span className="text-gray-400">{s.label}</span>
            <span className={`font-bold ${s.warn ? "text-red-600" : "text-gray-700"}`}>{s.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}