import React from "react";
import { SHIFT_TYPES, parseShiftMeta, calcHours } from "./shiftUtils";

function getShiftTypeFromTask(task) {
  const meta = parseShiftMeta(task);
  if (meta.shift_type) return meta.shift_type;
  if (task.status === "missed") return "sick";
  return "full_day";
}

const ICONS = { holiday: "🏖️", sick: "🤒", on_call: "📱", day_off: "💤" };

export default function ShiftBlock({ task, isHighlighted, isAdmin, onClick, isDragging }) {
  const meta = parseShiftMeta(task);
  const shiftType = meta.shift_type || getShiftTypeFromTask(task);
  const cfg = SHIFT_TYPES[shiftType] || SHIFT_TYPES.full_day;
  const start = meta.start_time || task.scheduled_time || "";
  const end = meta.end_time || task.due_time || "";
  const hours = calcHours(start, end, meta.break_minutes || 0);
  const icon = ICONS[shiftType];
  const published = meta.published;

  return (
    <div
      onClick={() => onClick && onClick(task)}
      className={`relative rounded-xl border px-2.5 py-2 text-xs font-semibold cursor-pointer transition-all select-none
        ${cfg.color}
        ${isHighlighted ? "ring-2 ring-indigo-500 ring-offset-1 shadow-md" : "shadow-sm hover:shadow-md"}
        ${isDragging ? "opacity-60 scale-95" : ""}
        ${!published && isAdmin ? "opacity-80" : ""}`}
    >
      {!published && isAdmin && (
        <span className="absolute -top-1 -right-1 w-2 h-2 bg-amber-400 rounded-full" title="Draft" />
      )}
      <div className="flex items-center gap-1">
        {icon && <span className="text-sm">{icon}</span>}
        <span className="font-bold truncate">{cfg.label}</span>
      </div>
      {start && end && (
        <p className="text-[10px] opacity-70 mt-0.5">{start} – {end}</p>
      )}
      {hours > 0 && (
        <p className="text-[10px] font-bold opacity-80">{hours.toFixed(1)}h</p>
      )}
      {meta.location && (
        <p className="text-[10px] opacity-60 truncate">{meta.location}</p>
      )}
    </div>
  );
}