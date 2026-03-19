import React from "react";
import { format, isToday, isFuture, parseISO, differenceInHours } from "date-fns";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { parseShiftMeta, getShiftTypeDef, SHIFT_COLORS, calcHours } from "./shiftUtils";

export default function StaffMySchedule({ user, shifts }) {
  const myShifts = shifts
    .filter((s) => s.assigned_to_email === user?.email)
    .sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date));

  const thisWeekShifts = myShifts.filter((s) => {
    const d = parseISO(s.scheduled_date);
    const now = new Date();
    const weekStart = new Date(now); weekStart.setDate(now.getDate() - now.getDay() + 1);
    const weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 6);
    return d >= weekStart && d <= weekEnd;
  });

  const totalHours = thisWeekShifts.reduce((sum, s) => {
    const meta = parseShiftMeta(s);
    return sum + calcHours(meta.start_time, meta.end_time, meta.break_minutes);
  }, 0);

  // Find next shift
  const now = new Date();
  const nextShift = myShifts.find((s) => {
    const d = parseISO(s.scheduled_date);
    if (isToday(d)) {
      const meta = parseShiftMeta(s);
      const [h, m] = (meta.start_time || "00:00").split(":").map(Number);
      const shiftStart = new Date(d);
      shiftStart.setHours(h, m, 0, 0);
      return shiftStart > now;
    }
    return isFuture(d);
  });

  const hoursToNext = nextShift ? (() => {
    const d = parseISO(nextShift.scheduled_date);
    const meta = parseShiftMeta(nextShift);
    const [h, m] = (meta.start_time || "08:00").split(":").map(Number);
    const shiftStart = new Date(d); shiftStart.setHours(h, m, 0, 0);
    return differenceInHours(shiftStart, now);
  })() : null;

  const upcoming = myShifts.filter((s) => {
    const d = parseISO(s.scheduled_date);
    return isFuture(d) || isToday(d);
  }).slice(0, 14);

  return (
    <div className="p-4 max-w-lg mx-auto space-y-4">
      {/* This week summary card */}
      <div className="bg-indigo-600 text-white rounded-2xl p-4">
        <p className="text-xs font-bold opacity-70 uppercase tracking-widest mb-3">This Week</p>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <p className="text-2xl font-black">{thisWeekShifts.length}</p>
            <p className="text-xs opacity-70">Shifts</p>
          </div>
          <div>
            <p className="text-2xl font-black">{totalHours.toFixed(0)}h</p>
            <p className="text-xs opacity-70">Hours</p>
          </div>
          <div>
            <p className="text-2xl font-black">{hoursToNext !== null ? `${hoursToNext}h` : "—"}</p>
            <p className="text-xs opacity-70">To next</p>
          </div>
        </div>
      </div>

      {/* Upcoming shifts */}
      <div>
        <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-2">Upcoming Shifts</p>
        {upcoming.length === 0 ? (
          <div className="text-center py-10 text-gray-400">
            <p className="text-3xl mb-2">📅</p>
            <p className="font-bold">No upcoming shifts scheduled</p>
          </div>
        ) : (
          <div className="space-y-2">
            {upcoming.map((shift) => {
              const meta = parseShiftMeta(shift);
              const def = getShiftTypeDef(meta.shift_type);
              const colors = SHIFT_COLORS[def?.color || "slate"];
              const d = parseISO(shift.scheduled_date);
              const hrs = calcHours(meta.start_time, meta.end_time, meta.break_minutes);
              const todayFlag = isToday(d);
              const [sh, sm] = (meta.start_time || "08:00").split(":").map(Number);
              const shiftStart = new Date(d); shiftStart.setHours(sh, sm, 0, 0);
              const canClockIn = todayFlag && Math.abs(differenceInHours(shiftStart, now)) <= 1;

              return (
                <div key={shift.id} className={`bg-white border rounded-2xl p-4 ${todayFlag ? "border-indigo-300 shadow-sm" : "border-gray-200"}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        {todayFlag && <span className="text-[10px] font-black bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">TODAY</span>}
                        <span className="text-sm font-black text-gray-800">{format(d, "EEEE, MMM d")}</span>
                      </div>
                      <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-bold border ${colors.bg} ${colors.text} ${colors.border}`}>
                        {meta.start_time}–{meta.end_time} · {hrs.toFixed(1)}h
                      </div>
                      {meta.break_minutes > 0 && (
                        <p className="text-xs text-gray-400 mt-1">{meta.break_minutes} min break</p>
                      )}
                      {shift.enterprise && (
                        <p className="text-xs text-gray-500 mt-1">📍 {shift.enterprise}</p>
                      )}
                    </div>
                    {canClockIn && (
                      <Link to={createPageUrl("ClockInOut")}
                        className="shrink-0 px-3 py-2 bg-emerald-600 text-white text-xs font-bold rounded-xl hover:bg-emerald-700 transition-colors">
                        Clock In
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}