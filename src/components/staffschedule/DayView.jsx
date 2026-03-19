import React from "react";
import { format } from "date-fns";
import { parseShiftMeta, SHIFT_COLORS, getShiftTypeDef } from "./shiftUtils";

const HOURS = Array.from({ length: 24 }, (_, i) => i);

function timeToPercent(time) {
  if (!time) return 0;
  const [h, m] = time.split(":").map(Number);
  return ((h * 60 + m) / (24 * 60)) * 100;
}

function durationPercent(start, end) {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  let mins = (eh * 60 + em) - (sh * 60 + sm);
  if (mins < 0) mins += 24 * 60;
  return (mins / (24 * 60)) * 100;
}

export default function DayView({ baseDate, people, shifts }) {
  const d = format(baseDate, "yyyy-MM-dd");
  const dayShifts = shifts.filter((s) => s.scheduled_date === d);

  const staffWithShifts = people.filter((p) => dayShifts.some((s) => s.assigned_to_email === p.email));
  const coverageByHour = HOURS.map((h) => {
    const time = `${String(h).padStart(2, "0")}:00`;
    return dayShifts.filter((s) => {
      const meta = parseShiftMeta(s);
      const st = meta.start_time || s.scheduled_time || "00:00";
      const et = meta.end_time || s.due_time || "23:59";
      return st <= time && et > time;
    }).length;
  });

  const onShift = coverageByHour.filter((c) => c > 0).length;

  return (
    <div className="p-4">
      {/* Coverage summary */}
      <div className="mb-4 flex items-center gap-3 flex-wrap">
        <div className="bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-2 text-sm font-bold text-indigo-700">
          📊 {staffWithShifts.length} staff scheduled
        </div>
        {coverageByHour.some((c) => c === 0 && dayShifts.length > 0) && (
          <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-2 text-sm font-bold text-red-600">
            🔴 Coverage gaps detected
          </div>
        )}
      </div>

      {staffWithShifts.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-3xl mb-2">📅</p>
          <p className="font-bold">No shifts scheduled for {format(baseDate, "EEEE, MMMM d")}</p>
        </div>
      ) : (
        <div className="relative overflow-x-auto">
          {/* Timeline grid */}
          <div className="flex">
            {/* Time labels */}
            <div className="w-14 shrink-0">
              {HOURS.map((h) => (
                <div key={h} className="h-14 flex items-start pt-1">
                  <span className="text-[10px] font-bold text-gray-400">{String(h).padStart(2, "0")}:00</span>
                </div>
              ))}
            </div>

            {/* Staff rows */}
            <div className="flex-1 border-l border-gray-200 relative">
              {/* Hour grid lines */}
              {HOURS.map((h) => (
                <div key={h} className="h-14 border-b border-gray-100 relative">
                  {coverageByHour[h] === 0 && dayShifts.length > 0 && (
                    <div className="absolute inset-0 bg-red-50 opacity-30" />
                  )}
                </div>
              ))}

              {/* Shift bars */}
              <div className="absolute inset-0">
                {staffWithShifts.map((person, idx) => {
                  const pShifts = dayShifts.filter((s) => s.assigned_to_email === person.email);
                  return pShifts.map((shift) => {
                    const meta = parseShiftMeta(shift);
                    const st = meta.start_time || shift.scheduled_time || "08:00";
                    const et = meta.end_time || shift.due_time || "17:00";
                    const left = timeToPercent(st);
                    const width = durationPercent(st, et);
                    const def = getShiftTypeDef(meta.shift_type);
                    const colors = SHIFT_COLORS[def?.color || "slate"];
                    const topPx = 14 * (idx * 2 + 1); // space each staff

                    return (
                      <div
                        key={shift.id}
                        className={`absolute rounded-lg px-2 py-1 text-xs font-semibold border ${colors.bg} ${colors.text} ${colors.border} shadow-sm`}
                        style={{ left: `${left}%`, width: `${Math.max(width, 2)}%`, top: `${idx * 56 + 4}px`, height: "48px" }}
                        title={`${person.first_name} ${person.last_name}: ${st}–${et}`}
                      >
                        <p className="font-bold truncate">{person.first_name} {person.last_name}</p>
                        <p className="opacity-70">{st}–{et}</p>
                      </div>
                    );
                  });
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}