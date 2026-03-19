import React, { useState } from "react";
import { format } from "date-fns";
import { AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import { getWeekDays } from "./shiftUtils";

const MIN_STAFF = 2;

export default function CoverageAlerts({ shifts, baseDate }) {
  const [open, setOpen] = useState(false);
  const days = getWeekDays(baseDate);

  const issues = [];
  days.forEach((d) => {
    const ds = format(d, "yyyy-MM-dd");
    const count = new Set(shifts.filter((s) => s.scheduled_date === ds).map((s) => s.assigned_to_email)).size;
    if (count === 0 && d >= new Date()) {
      issues.push({ ds, label: format(d, "EEE MMM d"), level: "error", count });
    } else if (count > 0 && count < MIN_STAFF) {
      issues.push({ ds, label: format(d, "EEE MMM d"), level: "warn", count });
    }
  });

  if (issues.length === 0) return null;

  const errors = issues.filter((i) => i.level === "error");
  const warns = issues.filter((i) => i.level === "warn");

  return (
    <div className="mx-4 mt-3">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`w-full flex items-center justify-between px-4 py-2.5 rounded-xl text-sm font-bold transition-colors
          ${errors.length > 0 ? "bg-red-50 text-red-700 border border-red-200" : "bg-amber-50 text-amber-700 border border-amber-200"}`}
      >
        <span className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" />
          {issues.length} coverage issue{issues.length > 1 ? "s" : ""} this week
        </span>
        {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>
      {open && (
        <div className="bg-white border border-gray-100 rounded-xl mt-1 divide-y divide-gray-50 shadow-sm">
          {errors.map((i) => (
            <div key={i.ds} className="flex items-center gap-2 px-4 py-2.5 text-sm">
              <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
              <span className="text-red-700 font-semibold">🔴 No staff scheduled for {i.label}</span>
            </div>
          ))}
          {warns.map((i) => (
            <div key={i.ds} className="flex items-center gap-2 px-4 py-2.5 text-sm">
              <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
              <span className="text-amber-700 font-semibold">⚠️ Below minimum on {i.label}: {i.count} staff (min: {MIN_STAFF})</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}