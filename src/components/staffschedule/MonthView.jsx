import React from "react";
import { format, startOfMonth, endOfMonth, startOfWeek, eachDayOfInterval, isSameMonth } from "date-fns";
import { parseShiftMeta, SHIFT_COLORS, getShiftTypeDef } from "./shiftUtils";

const todayStr = format(new Date(), "yyyy-MM-dd");

export default function MonthView({ baseDate, shifts, onDayClick }) {
  const monthStart = startOfMonth(baseDate);
  const monthEnd = endOfMonth(baseDate);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: gridStart, end: endOfMonth(monthEnd) });
  // Pad to full weeks
  while (days.length % 7 !== 0) {
    const last = days[days.length - 1];
    const next = new Date(last); next.setDate(next.getDate() + 1);
    days.push(next);
  }

  const shiftsByDay = {};
  for (const s of shifts) {
    if (!shiftsByDay[s.scheduled_date]) shiftsByDay[s.scheduled_date] = [];
    shiftsByDay[s.scheduled_date].push(s);
  }

  const weeks = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));

  const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  return (
    <div className="p-4">
      {/* Day headers */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {DAY_NAMES.map((d) => (
          <div key={d} className="text-center text-[10px] font-bold text-gray-400 uppercase tracking-widest py-1">{d}</div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="space-y-1">
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 gap-1">
            {week.map((day) => {
              const d = format(day, "yyyy-MM-dd");
              const isToday = d === todayStr;
              const inMonth = isSameMonth(day, baseDate);
              const dayShifts = shiftsByDay[d] || [];
              const staffCount = dayShifts.length;

              return (
                <div
                  key={d}
                  onClick={() => onDayClick?.(day)}
                  className={`min-h-[80px] rounded-xl border cursor-pointer p-1.5 transition-all hover:shadow-sm
                    ${isToday ? "border-emerald-400 bg-emerald-50" : inMonth ? "border-gray-200 bg-white hover:bg-gray-50" : "border-gray-100 bg-gray-50"}
                    ${staffCount === 0 && inMonth ? "bg-red-50/30" : ""}
                  `}
                >
                  <p className={`text-xs font-black mb-1 ${isToday ? "text-emerald-700" : inMonth ? "text-gray-800" : "text-gray-300"}`}>
                    {format(day, "d")}
                  </p>
                  {staffCount > 0 && (
                    <>
                      <div className="flex flex-wrap gap-0.5 mb-1">
                        {dayShifts.slice(0, 5).map((s) => {
                          const meta = parseShiftMeta(s);
                          const def = getShiftTypeDef(meta.shift_type);
                          const colors = SHIFT_COLORS[def?.color || "slate"];
                          return <span key={s.id} className={`w-2 h-2 rounded-full ${colors.dot}`} />;
                        })}
                        {dayShifts.length > 5 && <span className="text-[9px] text-gray-400">+{dayShifts.length - 5}</span>}
                      </div>
                      <p className="text-[10px] font-bold text-gray-500">{staffCount} staff</p>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}