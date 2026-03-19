import React from "react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, startOfWeek, endOfWeek, isToday, isSameMonth } from "date-fns";
import { SHIFT_TYPES, parseShiftMeta } from "./shiftUtils";

const TYPE_DOTS = {
  morning:   "bg-blue-400",
  afternoon: "bg-amber-400",
  night:     "bg-indigo-600",
  full_day:  "bg-emerald-500",
  half_am:   "bg-cyan-400",
  half_pm:   "bg-teal-500",
  on_call:   "bg-purple-400",
  holiday:   "bg-pink-400",
  sick:      "bg-red-400",
};

const MIN_STAFF = 2;

export default function MonthView({ baseDate, shifts, onDayClick }) {
  const monthStart = startOfMonth(baseDate);
  const monthEnd = endOfMonth(baseDate);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: calStart, end: calEnd });

  // Build map: date -> { count, types[] }
  const dayMap = {};
  shifts.forEach((s) => {
    const d = s.scheduled_date;
    if (!d) return;
    if (!dayMap[d]) dayMap[d] = { count: 0, types: new Set() };
    dayMap[d].count++;
    const meta = parseShiftMeta(s);
    if (meta.shift_type) dayMap[d].types.add(meta.shift_type);
  });

  return (
    <div className="p-4">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {/* Day headers */}
        <div className="grid grid-cols-7 border-b border-gray-100">
          {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map((d) => (
            <div key={d} className="py-2 text-center text-xs font-bold text-gray-500 border-r border-gray-50 last:border-0">{d}</div>
          ))}
        </div>
        {/* Calendar grid */}
        <div className="grid grid-cols-7">
          {days.map((day) => {
            const ds = format(day, "yyyy-MM-dd");
            const isCurrentMonth = isSameMonth(day, baseDate);
            const info = dayMap[ds] || { count: 0, types: new Set() };
            const isTodayDay = isToday(day);
            const lowCoverage = isCurrentMonth && info.count > 0 && info.count < MIN_STAFF;
            const noCoverage = isCurrentMonth && info.count === 0 && day <= new Date();
            const types = Array.from(info.types).slice(0, 4);

            return (
              <button
                key={ds}
                onClick={() => isCurrentMonth && onDayClick(day)}
                className={`min-h-[80px] p-2 border-r border-b border-gray-50 last-col:border-r-0 text-left transition-colors hover:bg-gray-50
                  ${!isCurrentMonth ? "opacity-30 cursor-default" : "cursor-pointer"}
                  ${isTodayDay ? "ring-2 ring-inset ring-emerald-400 bg-emerald-50/30" : ""}
                  ${noCoverage && isCurrentMonth ? "bg-red-50/30" : ""}
                  ${lowCoverage ? "bg-amber-50/30" : ""}`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-sm font-black ${isTodayDay ? "text-emerald-700" : isCurrentMonth ? "text-gray-800" : "text-gray-300"}`}>
                    {format(day, "d")}
                  </span>
                  {info.count > 0 && isCurrentMonth && (
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${lowCoverage ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-600"}`}>
                      {info.count}
                    </span>
                  )}
                </div>
                {/* Type dots */}
                <div className="flex flex-wrap gap-0.5 mt-1">
                  {types.map((t, i) => (
                    <span key={i} className={`w-2 h-2 rounded-full ${TYPE_DOTS[t] || "bg-gray-300"}`} title={SHIFT_TYPES[t]?.label} />
                  ))}
                </div>
                {noCoverage && (
                  <p className="text-[9px] text-red-500 font-bold mt-1">No staff</p>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="mt-4 bg-white rounded-xl border border-gray-100 p-3">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Shift Types</p>
        <div className="flex flex-wrap gap-2">
          {Object.entries(SHIFT_TYPES).filter(([k]) => !["day_off"].includes(k)).map(([key, cfg]) => (
            <span key={key} className="flex items-center gap-1 text-xs text-gray-600">
              <span className={`w-2.5 h-2.5 rounded-full ${TYPE_DOTS[key] || "bg-gray-300"}`} />
              {cfg.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}