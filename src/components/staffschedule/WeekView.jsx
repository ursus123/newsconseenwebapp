import React, { useState } from "react";
import { format, isToday, parseISO } from "date-fns";
import { Plus } from "lucide-react";
import { SHIFT_TYPES, parseShiftMeta, calcHours, getWeekDays } from "./shiftUtils";
import ShiftBlock from "./ShiftBlock";

function Skeleton() {
  return (
    <div className="animate-pulse">
      {[1,2,3,4].map(i => (
        <div key={i} className="flex border-b border-gray-100">
          <div className="w-36 shrink-0 p-3"><div className="h-8 bg-gray-100 rounded-xl" /></div>
          {[0,1,2,3,4,5,6].map(j => (
            <div key={j} className="flex-1 min-w-[110px] p-2"><div className="h-16 bg-gray-50 rounded-xl" /></div>
          ))}
        </div>
      ))}
    </div>
  );
}

export default function WeekView({ baseDate, people, shifts, leaveTasks, clockTasks, isAdmin, isLoading, highlightedStaff, onCellClick, onShiftClick }) {
  const days = getWeekDays(baseDate);

  // Build lookup: email -> date -> [shifts]
  const shiftMap = {};
  shifts.forEach((s) => {
    const email = s.assigned_to_email;
    const date = s.scheduled_date;
    if (!email || !date) return;
    if (!shiftMap[email]) shiftMap[email] = {};
    if (!shiftMap[email][date]) shiftMap[email][date] = [];
    shiftMap[email][date].push(s);
  });

  // Leave lookup
  const leaveMap = {};
  leaveTasks?.forEach((t) => {
    const email = t.assigned_to_email;
    const date = t.scheduled_date;
    if (!email || !date) return;
    if (!leaveMap[email]) leaveMap[email] = {};
    leaveMap[email][date] = t;
  });

  // Clock tasks lookup
  const clockMap = {};
  clockTasks?.forEach((t) => {
    const email = t.assigned_to_email;
    const date = t.scheduled_date;
    if (!email || !date) return;
    if (!clockMap[email]) clockMap[email] = {};
    if (t.task_type === "clock_in") clockMap[email][date] = { ...clockMap[email][date], in: t.scheduled_time };
    if (t.task_type === "clock_out") clockMap[email][date] = { ...clockMap[email][date], out: t.scheduled_time };
  });

  // Daily staff count for column headers
  const dayCounts = days.map((d) => {
    const ds = format(d, "yyyy-MM-dd");
    const count = people.filter((p) => (shiftMap[p.email || p.id]?.[ds] || []).length > 0).length;
    return count;
  });

  if (isLoading) return <Skeleton />;

  if (people.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-gray-400">
        <p className="text-lg font-bold mb-1">No staff found</p>
        <p className="text-sm">Add people in the People page first.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full border-collapse">
        <thead>
          <tr className="bg-white border-b-2 border-gray-100">
            {/* Sticky corner */}
            <th className="sticky left-0 z-20 bg-white w-36 min-w-[144px] px-4 py-3 text-left">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Staff</span>
            </th>
            {days.map((d, i) => {
              const isTodayCol = isToday(d);
              return (
                <th key={i} className={`min-w-[130px] px-2 py-3 text-center border-l border-gray-100 ${isTodayCol ? "bg-emerald-50" : ""}`}>
                  <p className={`text-sm font-black ${isTodayCol ? "text-emerald-700" : "text-gray-700"}`}>
                    {format(d, "EEE d")}
                  </p>
                  <p className="text-[10px] text-gray-400 font-semibold">
                    {dayCounts[i] > 0 ? `${dayCounts[i]} staff` : "—"}
                  </p>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {people.map((person) => {
            const email = person.email || person.id;
            const isHighlighted = highlightedStaff === email;
            const initials = `${person.first_name?.[0] || ""}${person.last_name?.[0] || ""}`.toUpperCase();
            return (
              <tr key={person.id} className={`border-b border-gray-50 transition-colors ${isHighlighted ? "bg-indigo-50/40" : "hover:bg-gray-50/50"}`}>
                {/* Sticky row header */}
                <td className="sticky left-0 z-10 bg-white border-r border-gray-100 px-3 py-2 min-w-[144px]">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-black text-indigo-700 shrink-0">
                      {person.photo_url
                        ? <img src={person.photo_url} className="w-8 h-8 rounded-full object-cover" alt="" />
                        : initials}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-gray-800 truncate leading-tight">{person.first_name} {person.last_name}</p>
                      <p className="text-[10px] text-gray-400 truncate">{person.primary_role || "Staff"}</p>
                    </div>
                  </div>
                </td>

                {days.map((d) => {
                  const ds = format(d, "yyyy-MM-dd");
                  const isTodayCol = isToday(d);
                  const dayShifts = shiftMap[email]?.[ds] || [];
                  const leave = leaveMap[email]?.[ds];
                  const clock = clockMap[email]?.[ds];

                  return (
                    <td key={ds} className={`border-l border-gray-100 px-1.5 py-2 min-w-[130px] align-top ${isTodayCol ? "bg-emerald-50/30" : ""}`}>
                      <div className="space-y-1">
                        {/* Leave overlay */}
                        {leave && (
                          <div className="bg-pink-100 border border-pink-200 rounded-xl px-2 py-1.5 text-xs font-bold text-pink-700">
                            🏖️ Approved Leave
                          </div>
                        )}

                        {/* Shift blocks */}
                        {dayShifts.map((shift) => (
                          <div key={shift.id}>
                            <ShiftBlock
                              task={shift}
                              isHighlighted={isHighlighted}
                              isAdmin={isAdmin}
                              onClick={(t) => onShiftClick(t)}
                            />
                            {/* Clock in/out comparison */}
                            {clock && (
                              <div className="text-[9px] text-gray-400 mt-0.5 px-1">
                                <span>Actual: {clock.in || "?"} – {clock.out || "ongoing"}</span>
                              </div>
                            )}
                          </div>
                        ))}

                        {/* Add button (admin, no leave, no shift) */}
                        {dayShifts.length === 0 && !leave && isAdmin && (
                          <button
                            onClick={() => onCellClick({ staff: person, date: ds })}
                            className="w-full h-12 border-2 border-dashed border-gray-200 rounded-xl text-gray-300 hover:border-indigo-300 hover:text-indigo-400 transition-all flex items-center justify-center group"
                          >
                            <Plus className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </button>
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}