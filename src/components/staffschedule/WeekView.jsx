import React from "react";
import { format } from "date-fns";
import { Plus } from "lucide-react";
import { getWeekDays, todayStr, parseShiftMeta, calcHours } from "./shiftUtils";
import ShiftBlock from "./ShiftBlock";

export default function WeekView({ baseDate, people, shifts, leaveTasks, clockTasks, isAdmin, isLoading, highlightedStaff, onCellClick, onShiftClick }) {
  const days = getWeekDays(baseDate);
  const today = todayStr();

  if (isLoading) {
    return (
      <div className="p-4 animate-pulse space-y-3">
        {[1,2,3,4].map((i) => (
          <div key={i} className="h-16 bg-gray-100 rounded-xl" />
        ))}
      </div>
    );
  }

  if (people.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center px-6">
        <div className="text-5xl mb-3">👥</div>
        <p className="text-lg font-bold text-gray-700">No staff found</p>
        <p className="text-sm text-gray-400 mt-1">Add people in the People page first.</p>
      </div>
    );
  }

  // Map shifts by staffEmail + date
  const shiftMap = {};
  for (const s of shifts) {
    const key = `${s.assigned_to_email}__${s.scheduled_date}`;
    if (!shiftMap[key]) shiftMap[key] = [];
    shiftMap[key].push(s);
  }
  // Leave map
  const leaveMap = {};
  for (const l of leaveTasks) {
    const key = `${l.assigned_to_email}__${l.scheduled_date}`;
    if (!leaveMap[key]) leaveMap[key] = [];
    leaveMap[key].push(l);
  }
  // Clock map (find actual clock_in/out for each person+date)
  const clockMap = {};
  for (const c of clockTasks) {
    const key = `${c.assigned_to_email}__${c.scheduled_date}`;
    if (!clockMap[key]) clockMap[key] = [];
    clockMap[key].push(c);
  }

  const dayStaffCount = (day) => {
    const d = format(day, "yyyy-MM-dd");
    return people.filter((p) => (shiftMap[`${p.email}__${d}`] || []).length > 0).length;
  };

  return (
    <div className="overflow-auto min-h-0">
      <table className="border-collapse min-w-[700px] w-full text-xs">
        <thead>
          <tr>
            {/* Staff col header */}
            <th className="sticky left-0 z-20 bg-white border-b border-r border-gray-200 px-3 py-2.5 text-left min-w-[160px] w-[160px]">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Staff</span>
            </th>
            {days.map((day) => {
              const d = format(day, "yyyy-MM-dd");
              const isToday = d === today;
              const count = dayStaffCount(day);
              return (
                <th key={d} className={`border-b border-r border-gray-200 px-2 py-2 text-center min-w-[110px] ${isToday ? "bg-emerald-50" : "bg-white"}`}>
                  <p className={`font-black ${isToday ? "text-emerald-700" : "text-gray-700"}`}>{format(day, "EEE d")}</p>
                  <p className="text-gray-400 font-normal mt-0.5">{count} staff</p>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {people.map((person) => {
            const isHighlighted = highlightedStaff === person.id;
            return (
              <tr key={person.id} className={`group ${isHighlighted ? "bg-indigo-50" : "hover:bg-gray-50"}`}>
                {/* Staff name cell */}
                <td className={`sticky left-0 z-10 border-b border-r border-gray-200 px-3 py-2 ${isHighlighted ? "bg-indigo-50" : "bg-white group-hover:bg-gray-50"}`}>
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-[10px] shrink-0">
                      {(person.first_name?.[0] || "") + (person.last_name?.[0] || "")}
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-gray-800 truncate leading-tight">{person.first_name} {person.last_name}</p>
                      {person.primary_role && <p className="text-gray-400 text-[9px] truncate">{person.primary_role}</p>}
                    </div>
                  </div>
                </td>

                {days.map((day) => {
                  const d = format(day, "yyyy-MM-dd");
                  const isToday = d === today;
                  const dayShifts = shiftMap[`${person.email}__${d}`] || [];
                  const dayLeave = leaveMap[`${person.email}__${d}`] || [];
                  const dayClock = clockMap[`${person.email}__${d}`] || [];
                  const hasContent = dayShifts.length > 0 || dayLeave.length > 0;

                  // Find actual clock in/out
                  const clockIn = dayClock.find((c) => c.task_type === "clock_in" && c.status === "completed");
                  const clockOut = dayClock.find((c) => c.task_type === "clock_out" && c.status === "completed");

                  return (
                    <td key={d}
                      className={`border-b border-r border-gray-200 px-1.5 py-1.5 align-top min-h-[60px] ${isToday ? "bg-emerald-50/50" : ""}`}
                      onClick={() => !hasContent && onCellClick?.({ staff: person, date: d })}>
                      {dayLeave.length > 0 && dayShifts.length === 0 ? (
                        <div className="bg-pink-100 border border-pink-200 rounded-lg px-2 py-1 text-pink-700 font-semibold text-[10px]">
                          🏖️ Leave
                        </div>
                      ) : dayShifts.length > 0 ? (
                        <div className="space-y-1">
                          {dayShifts.map((s) => (
                            <div key={s.id}>
                              <ShiftBlock
                                task={s}
                                isAdmin={isAdmin}
                                highlighted={isHighlighted}
                                onClick={onShiftClick}
                              />
                              {/* Clock vs scheduled variance */}
                              {(clockIn || clockOut) && (() => {
                                const meta = parseShiftMeta(s);
                                return (
                                  <div className="mt-0.5 text-[9px] text-gray-400 px-1">
                                    {clockIn?.scheduled_time && (
                                      <span>⏱ {clockIn.scheduled_time}</span>
                                    )}
                                  </div>
                                );
                              })()}
                            </div>
                          ))}
                        </div>
                      ) : (
                        isAdmin && (
                          <div className="h-10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                            onClick={(e) => { e.stopPropagation(); onCellClick?.({ staff: person, date: d }); }}>
                            <div className="w-6 h-6 rounded-full border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-300 hover:border-indigo-400 hover:text-indigo-400 transition-colors">
                              <Plus className="w-3 h-3" />
                            </div>
                          </div>
                        )
                      )}
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