import React from "react";
import { format, isToday, differenceInMinutes } from "date-fns";
import { SHIFT_TYPES, parseShiftMeta, calcHours, getWeekDays } from "./shiftUtils";
import { Clock } from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";

function nextShiftCountdown(shifts) {
  const now = new Date();
  const upcoming = shifts
    .filter((s) => {
      const meta = parseShiftMeta(s);
      if (!s.scheduled_date || !meta.start_time) return false;
      const dt = new Date(`${s.scheduled_date}T${meta.start_time}`);
      return dt > now;
    })
    .sort((a, b) => {
      const ma = parseShiftMeta(a); const mb = parseShiftMeta(b);
      return new Date(`${a.scheduled_date}T${ma.start_time}`) - new Date(`${b.scheduled_date}T${mb.start_time}`);
    });
  if (upcoming.length === 0) return null;
  const next = upcoming[0];
  const meta = parseShiftMeta(next);
  const dt = new Date(`${next.scheduled_date}T${meta.start_time}`);
  const mins = differenceInMinutes(dt, now);
  if (mins < 60) return `${mins} min`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h ${mins % 60}m`;
  return `${Math.floor(mins / 1440)} day${Math.floor(mins / 1440) > 1 ? "s" : ""}`;
}

export default function StaffMySchedule({ user, shifts }) {
  const days = getWeekDays(new Date());
  const myShifts = shifts.filter((s) => s.assigned_to_email === user?.email && s.task_type === "shift");
  const weekDates = new Set(days.map((d) => format(d, "yyyy-MM-dd")));
  const weekShifts = myShifts.filter((s) => weekDates.has(s.scheduled_date));

  const totalHours = weekShifts.reduce((acc, s) => {
    const meta = parseShiftMeta(s);
    return acc + calcHours(meta.start_time || "", meta.end_time || "", meta.break_minutes || 0);
  }, 0);

  const countdown = nextShiftCountdown(myShifts);

  return (
    <div className="max-w-lg mx-auto p-4 space-y-4">
      {/* This week card */}
      <div className="bg-indigo-600 rounded-2xl text-white p-5 space-y-3">
        <p className="text-xs font-bold uppercase tracking-widest opacity-80">My Schedule</p>
        <p className="text-2xl font-black">{format(new Date(), "EEEE, MMMM d")}</p>
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white/20 rounded-xl p-3 text-center">
            <p className="text-xl font-black">{weekShifts.length}</p>
            <p className="text-[10px] opacity-80">Shifts</p>
          </div>
          <div className="bg-white/20 rounded-xl p-3 text-center">
            <p className="text-xl font-black">{totalHours.toFixed(0)}h</p>
            <p className="text-[10px] opacity-80">This week</p>
          </div>
          <div className="bg-white/20 rounded-xl p-3 text-center">
            <p className="text-xl font-black">{countdown || "—"}</p>
            <p className="text-[10px] opacity-80">Next shift</p>
          </div>
        </div>
      </div>

      {/* This week */}
      <div className="space-y-2">
        <p className="text-xs font-black text-gray-400 uppercase tracking-widest">This Week</p>
        {days.map((day) => {
          const ds = format(day, "yyyy-MM-dd");
          const dayShifts = weekShifts.filter((s) => s.scheduled_date === ds);
          const todayDay = isToday(day);
          if (dayShifts.length === 0) return (
            <div key={ds} className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${todayDay ? "border-emerald-200 bg-emerald-50" : "border-gray-100 bg-white"} opacity-50`}>
              <p className={`text-sm font-bold w-16 ${todayDay ? "text-emerald-700" : "text-gray-400"}`}>{format(day, "EEE d")}</p>
              <p className="text-xs text-gray-300">Day off</p>
            </div>
          );
          return dayShifts.map((shift) => {
            const meta = parseShiftMeta(shift);
            const type = meta.shift_type || "full_day";
            const cfg = SHIFT_TYPES[type];
            const hrs = calcHours(meta.start_time || "", meta.end_time || "", meta.break_minutes || 0);
            const isNow = todayDay;
            const isWithin30 = isNow && meta.start_time && differenceInMinutes(
              new Date(`${ds}T${meta.start_time}`), new Date()
            ) <= 30 && differenceInMinutes(new Date(`${ds}T${meta.start_time}`), new Date()) >= 0;

            return (
              <div key={shift.id} className={`flex items-center gap-3 px-4 py-3 rounded-2xl border shadow-sm ${todayDay ? "border-emerald-200 bg-white ring-2 ring-emerald-300" : "border-gray-100 bg-white"}`}>
                <div className="w-16 shrink-0">
                  <p className={`text-sm font-black ${todayDay ? "text-emerald-700" : "text-gray-700"}`}>{format(day, "EEE d")}</p>
                </div>
                <div className="flex-1 min-w-0">
                  <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold border mb-1 ${cfg.color}`}>
                    {cfg.label}
                  </div>
                  <p className="text-xs text-gray-500">{meta.start_time} – {meta.end_time} · {hrs.toFixed(1)}h</p>
                  {meta.location && <p className="text-[10px] text-gray-400">{meta.location || shift.enterprise}</p>}
                  {meta.break_minutes > 0 && <p className="text-[10px] text-gray-300">Break: {meta.break_minutes}min</p>}
                </div>
                {isWithin30 && (
                  <Link to={createPageUrl("ClockInOut")}
                    className="flex items-center gap-1 px-3 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 shrink-0"
                  >
                    <Clock className="w-3.5 h-3.5" /> Clock In
                  </Link>
                )}
              </div>
            );
          });
        })}
      </div>
    </div>
  );
}