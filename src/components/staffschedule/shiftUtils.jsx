import { startOfWeek, endOfWeek, eachDayOfInterval, format, addDays } from "date-fns";

export const todayStr = () => format(new Date(), "yyyy-MM-dd");

export function getWeekDays(baseDate) {
  const start = startOfWeek(baseDate, { weekStartsOn: 1 }); // Monday
  return eachDayOfInterval({ start, end: addDays(start, 6) });
}

export function formatWeekLabel(baseDate) {
  const days = getWeekDays(baseDate);
  const s = format(days[0], "MMM d");
  const e = format(days[6], "MMM d, yyyy");
  return `${s} – ${e}`;
}

export function parseShiftMeta(task) {
  try {
    return JSON.parse(task?.outcome_notes || "{}");
  } catch {
    return {};
  }
}

export const SHIFT_TYPES = [
  { key: "morning",     label: "Morning",      start: "06:00", end: "14:00", color: "blue" },
  { key: "afternoon",   label: "Afternoon",    start: "14:00", end: "22:00", color: "amber" },
  { key: "night",       label: "Night",        start: "22:00", end: "06:00", color: "indigo" },
  { key: "full_day",    label: "Full Day",     start: "08:00", end: "17:00", color: "emerald" },
  { key: "half_am",     label: "Half Day AM",  start: "08:00", end: "13:00", color: "cyan" },
  { key: "half_pm",     label: "Half Day PM",  start: "13:00", end: "18:00", color: "teal" },
  { key: "on_call",     label: "On Call",      start: "00:00", end: "23:59", color: "purple" },
  { key: "custom",      label: "Custom",       start: "09:00", end: "17:00", color: "slate" },
];

export const SHIFT_COLORS = {
  blue:    { bg: "bg-blue-100",    text: "text-blue-800",    border: "border-blue-300",    dot: "bg-blue-500" },
  amber:   { bg: "bg-amber-100",   text: "text-amber-800",   border: "border-amber-300",   dot: "bg-amber-500" },
  indigo:  { bg: "bg-indigo-200",  text: "text-indigo-900",  border: "border-indigo-400",  dot: "bg-indigo-600" },
  emerald: { bg: "bg-emerald-100", text: "text-emerald-800", border: "border-emerald-300", dot: "bg-emerald-500" },
  cyan:    { bg: "bg-cyan-100",    text: "text-cyan-800",    border: "border-cyan-300",    dot: "bg-cyan-500" },
  teal:    { bg: "bg-teal-100",    text: "text-teal-800",    border: "border-teal-300",    dot: "bg-teal-500" },
  purple:  { bg: "bg-purple-100",  text: "text-purple-800",  border: "border-purple-400",  dot: "bg-purple-500" },
  slate:   { bg: "bg-slate-100",   text: "text-slate-800",   border: "border-slate-300",   dot: "bg-slate-500" },
  pink:    { bg: "bg-pink-100",    text: "text-pink-800",    border: "border-pink-300",    dot: "bg-pink-500" },
  red:     { bg: "bg-red-100",     text: "text-red-800",     border: "border-red-300",     dot: "bg-red-500" },
};

export function getShiftTypeDef(key) {
  return SHIFT_TYPES.find((t) => t.key === key) || SHIFT_TYPES.find((t) => t.key === "custom");
}

export function calcHours(start, end, breakMins = 0) {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  let mins = (eh * 60 + em) - (sh * 60 + sm);
  if (mins < 0) mins += 24 * 60; // overnight
  return Math.max(0, (mins - breakMins) / 60);
}

export function getShiftColor(task) {
  const meta = parseShiftMeta(task);
  if (task.task_type === "leave_request") return "pink";
  if (meta.sick) return "red";
  const def = getShiftTypeDef(meta.shift_type);
  return def?.color || "slate";
}