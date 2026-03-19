import React from "react";
import { format } from "date-fns";
import { SHIFT_TYPES, parseShiftMeta } from "./shiftUtils";

const HOURS = Array.from({ length: 24 }, (_, i) => i);

function timeToFrac(timeStr) {
  if (!timeStr) return 0;
  const [h, m] = timeStr.split(":").map(Number);
  return (h * 60 + m) / (24 * 60);
}

function calcWidth(start, end) {
  const s = timeToFrac(start);
  let e = timeToFrac(end);
  if (e <= s) e += 1; // overnight
  return Math.min(1, e - s);
}

const SHIFT_COLORS_SOLID = {
  morning:   "bg-blue-400",
  afternoon: "bg-amber-400",
  night:     "bg-indigo-600",
  full_day:  "bg-emerald-500",
  half_am:   "bg-cyan-400",
  half_pm:   "bg-teal-500",
  on_call:   "bg-purple-400",
  day_off:   "bg-gray-200",
  holiday:   "bg-pink-400",
  sick:      "bg-red-400",
};

export default function DayView({ baseDate, people, shifts }) {
  const ds = format(baseDate, "yyyy-MM-dd");
  const dayShifts = shifts.filter((s) => s.scheduled_date === ds);

  // Coverage per hour
  const coverage = HOURS.map((h) => {
    const hStr = String(h).padStart(2, "0") + ":00";
    return dayShifts.filter((s) => {
      const meta = parseShiftMeta(s);
      const start = meta.start_time || s.scheduled_time || "";
      const end = meta.end_time || s.due_time || "";
      if (!start || !end) return false;
      const [sh, sm] = start.split(":").map(Number);
      const [eh, em] = end.split(":").map(Number);
      const startMins = sh * 60 + sm;
      const endMins = eh * 60 + em;
      const hMins = h * 60;
      if (endMins > startMins) return hMins >= startMins && hMins < endMins;
      return hMins >= startMins || hMins < endMins; // overnight
    }).length;
  });

  const minCoverage = 2;
  const currentCoverage = coverage[new Date().getHours()] || 0;

  return (
    <div className="p-4 space-y-4">
      {/* Coverage summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-3 text-center">
          <p className="text-2xl font-black text-indigo-600">{currentCoverage}</p>
          <p className="text-xs text-gray-400">On shift now</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-3 text-center">
          <p className="text-2xl font-black text-emerald-600">{Math.max(...coverage)}</p>
          <p className="text-xs text-gray-400">Peak coverage</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-3 text-center">
          <p className={`text-2xl font-black ${coverage.some(c => c === 0) ? "text-red-600" : "text-gray-500"}`}>
            {coverage.filter(c => c === 0).length}h
          </p>
          <p className="text-xs text-gray-400">Uncovered hours</p>
        </div>
      </div>

      {/* Timeline */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
          <p className="text-sm font-black text-gray-800">{format(baseDate, "EEEE, MMMM d, yyyy")}</p>
          <span className="text-xs text-gray-400">{dayShifts.length} shifts scheduled</span>
        </div>

        <div className="overflow-x-auto">
          {/* Hour header */}
          <div className="flex border-b border-gray-100 min-w-[900px]">
            <div className="w-32 shrink-0" />
            {HOURS.filter(h => h % 2 === 0).map(h => (
              <div key={h} className="flex-1 text-center text-[10px] text-gray-400 py-1 border-l border-gray-100">
                {String(h).padStart(2, "0")}:00
              </div>
            ))}
          </div>

          {/* Coverage bar */}
          <div className="flex border-b border-gray-100 min-w-[900px] h-4">
            <div className="w-32 shrink-0 text-[9px] text-gray-400 flex items-center px-2">Coverage</div>
            {HOURS.map((h) => {
              const cov = coverage[h];
              const cls = cov === 0 ? "bg-red-200" : cov < minCoverage ? "bg-amber-200" : "bg-emerald-100";
              return (
                <div key={h} className={`flex-1 border-l border-gray-100 ${cls} flex items-center justify-center`}>
                  {cov > 0 && <span className="text-[8px] font-bold text-gray-600">{cov}</span>}
                </div>
              );
            })}
          </div>

          {/* Staff rows */}
          {people.map((person) => {
            const email = person.email || person.id;
            const personShifts = dayShifts.filter((s) => s.assigned_to_email === email);
            const initials = `${person.first_name?.[0] || ""}${person.last_name?.[0] || ""}`.toUpperCase();
            return (
              <div key={person.id} className="flex border-b border-gray-50 min-w-[900px] h-12 group">
                <div className="w-32 shrink-0 flex items-center gap-2 px-2 border-r border-gray-50">
                  <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-black text-indigo-700 shrink-0">
                    {person.photo_url ? <img src={person.photo_url} className="w-7 h-7 rounded-full object-cover" alt="" /> : initials}
                  </div>
                  <span className="text-xs font-semibold text-gray-700 truncate">{person.first_name}</span>
                </div>
                {/* Timeline cells */}
                <div className="flex-1 relative">
                  {HOURS.map((h) => (
                    <div key={h} className="absolute top-0 bottom-0 border-l border-gray-50" style={{ left: `${(h / 24) * 100}%`, width: `${(1 / 24) * 100}%` }} />
                  ))}
                  {personShifts.map((shift) => {
                    const meta = parseShiftMeta(shift);
                    const start = meta.start_time || shift.scheduled_time || "08:00";
                    const end = meta.end_time || shift.due_time || "17:00";
                    const left = timeToFrac(start) * 100;
                    const width = calcWidth(start, end) * 100;
                    const type = meta.shift_type || "full_day";
                    const color = SHIFT_COLORS_SOLID[type] || "bg-gray-300";
                    return (
                      <div
                        key={shift.id}
                        title={`${person.first_name} ${person.last_name} | ${SHIFT_TYPES[type]?.label} | ${start}–${end}`}
                        className={`absolute top-1.5 bottom-1.5 rounded-lg ${color} opacity-80 hover:opacity-100 transition-opacity cursor-pointer flex items-center px-2`}
                        style={{ left: `${left}%`, width: `${Math.max(width, 2)}%` }}
                      >
                        <span className="text-[9px] font-bold text-white truncate">{start}–{end}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}