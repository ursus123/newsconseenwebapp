import React, { useState } from "react";
import { format } from "date-fns";
import { AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import { getWeekDays } from "./shiftUtils";

const MIN_STAFF = 2;

export default function CoverageAlerts({ shifts, baseDate }) {
  const [open, setOpen] = useState(true);
  const days = getWeekDays(baseDate);

  const issues = days.map((day) => {
    const d = format(day, "yyyy-MM-dd");
    const count = new Set(shifts.filter((s) => s.scheduled_date === d).map((s) => s.assigned_to_email)).size;
    return { day, d, count };
  }).filter(({ count }) => count < MIN_STAFF);

  if (issues.length === 0) return null;

  return (
    <div className="mx-4 mt-3 border rounded-xl overflow-hidden print:hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-4 py-2.5 bg-amber-50 border-b border-amber-100 text-amber-800 text-xs font-bold"
      >
        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
        <span>{issues.length} coverage issue{issues.length > 1 ? "s" : ""} this week</span>
        <span className="ml-auto">{open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}</span>
      </button>
      {open && (
        <div className="bg-white divide-y divide-gray-100">
          {issues.map(({ day, d, count }) => (
            <div key={d} className={`flex items-center gap-2 px-4 py-2 text-xs ${count === 0 ? "bg-red-50" : ""}`}>
              <span className={count === 0 ? "text-red-600 font-black" : "text-amber-700 font-bold"}>
                {count === 0 ? "🔴" : "⚠️"} {format(day, "EEEE, MMM d")}
              </span>
              <span className="text-gray-500">
                {count === 0 ? "No staff scheduled" : `${count} staff (minimum: ${MIN_STAFF})`}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}