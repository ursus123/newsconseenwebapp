import { format, startOfWeek, endOfWeek, eachDayOfInterval, addWeeks, subWeeks, startOfMonth, endOfMonth } from "date-fns";

export const SHIFT_TYPES = {
  morning:     { label: "Morning",      time: "06:00-14:00", color: "bg-blue-100 text-blue-800 border-blue-200" },
  afternoon:   { label: "Afternoon",    time: "14:00-22:00", color: "bg-amber-100 text-amber-800 border-amber-200" },
  night:       { label: "Night",        time: "22:00-06:00", color: "bg-indigo-100 text-indigo-800 border-indigo-200" },
  full_day:    { label: "Full Day",     time: "08:00-17:00", color: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  half_am:     { label: "Half Day AM",  time: "08:00-13:00", color: "bg-cyan-100 text-cyan-800 border-cyan-200" },
  half_pm:     { label: "Half Day PM",  time: "13:00-18:00", color: "bg-teal-100 text-teal-800 border-teal-200" },
  on_call:     { label: "On Call",      time: "",             color: "bg-purple-50 text-purple-800 border-purple-300 border-dashed" },
  day_off:     { label: "Day Off",      time: "",             color: "bg-gray-50 text-gray-400 border-gray-200" },
  holiday:     { label: "Holiday/Leave",time: "",             color: "bg-pink-100 text-pink-700 border-pink-200" },
  sick:        { label: "Sick",         time: "",             color: "bg-red-100 text-red-700 border-red-200" },
};

export const SHIFT_TYPE_DEFAULTS = {
  morning:   { start: "06:00", end: "14:00" },
  afternoon: { start: "14:00", end: "22:00" },
  night:     { start: "22:00", end: "06:00" },
  full_day:  { start: "08:00", end: "17:00" },
  half_am:   { start: "08:00", end: "13:00" },
  half_pm:   { start: "13:00", end: "18:00" },
  on_call:   { start: "08:00", end: "20:00" },
  day_off:   { start: "", end: "" },
  holiday:   { start: "", end: "" },
  sick:      { start: "", end: "" },
};

export function getWeekDays(baseDate) {
  const start = startOfWeek(baseDate, { weekStartsOn: 1 }); // Monday
  return eachDayOfInterval({ start, end: endOfWeek(baseDate, { weekStartsOn: 1 }) });
}

export function parseShiftMeta(task) {
  try {
    if (task.outcome_notes) return JSON.parse(task.outcome_notes);
  } catch {}
  return {};
}

export function calcHours(start, end, breakMins = 0) {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  let mins = (eh * 60 + em) - (sh * 60 + sm);
  if (mins < 0) mins += 24 * 60; // overnight
  return Math.max(0, (mins - breakMins) / 60);
}

export function getShiftType(start, end) {
  if (!start) return "day_off";
  if (start >= "06:00" && start < "10:00" && end <= "15:00") return "morning";
  if (start >= "13:00" && start < "16:00") return "afternoon";
  if (start >= "21:00" || start < "06:00") return "night";
  if (start === "08:00" && end === "17:00") return "full_day";
  if (start === "08:00" && end <= "13:30") return "half_am";
  if (start >= "12:30" && end <= "19:00") return "half_pm";
  return "full_day";
}

export function todayStr() { return format(new Date(), "yyyy-MM-dd"); }

export function formatWeekLabel(baseDate) {
  const days = getWeekDays(baseDate);
  return `${format(days[0], "MMM d")} – ${format(days[6], "MMM d, yyyy")}`;
}