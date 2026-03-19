import React from "react";
import { parseShiftMeta, getShiftTypeDef, SHIFT_COLORS, calcHours } from "./shiftUtils";

export default function ShiftBlock({ task, isAdmin, highlighted, onClick }) {
  const meta = parseShiftMeta(task);
  const isLeave = task.task_type === "leave_request";
  const isSick = meta.sick;

  let colorKey = "slate";
  if (isLeave) colorKey = "pink";
  else if (isSick) colorKey = "red";
  else {
    const def = getShiftTypeDef(meta.shift_type);
    colorKey = def?.color || "slate";
  }

  const colors = SHIFT_COLORS[colorKey] || SHIFT_COLORS.slate;
  const isOnCall = meta.shift_type === "on_call";
  const hours = calcHours(meta.start_time || task.scheduled_time, meta.end_time || task.due_time, meta.break_minutes);

  return (
    <div
      onClick={() => onClick?.(task)}
      className={`
        rounded-lg px-2 py-1 text-xs font-semibold cursor-pointer select-none
        border transition-all duration-150
        ${colors.bg} ${colors.text} ${colors.border}
        ${isOnCall ? "border-dashed" : ""}
        ${highlighted ? "ring-2 ring-indigo-500 ring-offset-1" : ""}
        ${!meta.published && isAdmin ? "opacity-70" : ""}
        hover:shadow-md hover:scale-[1.02] active:scale-100
      `}
      title={`${task.assigned_to_name || ""} — ${meta.start_time || ""}–${meta.end_time || ""}`}
    >
      {isLeave ? (
        <span>🏖️ Leave</span>
      ) : isSick ? (
        <span>🤒 Sick</span>
      ) : (
        <>
          <div className="leading-tight truncate">
            {meta.start_time && meta.end_time ? `${meta.start_time}–${meta.end_time}` : task.scheduled_time || "—"}
          </div>
          <div className="flex items-center gap-1 mt-0.5 leading-tight">
            <span className="opacity-70">{hours > 0 ? `${hours.toFixed(1)}h` : ""}</span>
            {!meta.published && isAdmin && (
              <span className="opacity-50 text-[9px] font-bold">DRAFT</span>
            )}
          </div>
        </>
      )}
    </div>
  );
}