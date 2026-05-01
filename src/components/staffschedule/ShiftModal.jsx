import React, { useState, useEffect } from "react";
import { X, Trash2, AlertTriangle } from "lucide-react";
import { createRecord, updateRecord, deleteRecord } from "@/services/dataService";
import { format, addDays } from "date-fns";
import { SHIFT_TYPES, parseShiftMeta, calcHours, getShiftTypeDef } from "./shiftUtils";

const BREAKS = [
  { label: "None", value: 0 },
  { label: "15 min", value: 15 },
  { label: "30 min", value: 30 },
  { label: "45 min", value: 45 },
  { label: "1 hour", value: 60 },
];

export default function ShiftModal({ existingTask, prefillDate, prefillStaff, people, enterprises, weekShifts, user, onClose, onSuccess, onAddAnother }) {
  const isEdit = !!existingTask;
  const meta = isEdit ? parseShiftMeta(existingTask) : {};

  const [staffId, setStaffId] = useState(existingTask?.assigned_to_email || prefillStaff?.email || "");
  const [date, setDate] = useState(existingTask?.scheduled_date || prefillDate || format(new Date(), "yyyy-MM-dd"));
  const [shiftType, setShiftType] = useState(meta.shift_type || "full_day");
  const [startTime, setStartTime] = useState(meta.start_time || existingTask?.scheduled_time || "08:00");
  const [endTime, setEndTime] = useState(meta.end_time || existingTask?.due_time || "17:00");
  const [breakMins, setBreakMins] = useState(meta.break_minutes ?? 30);
  const [enterprise, setEnterprise] = useState(existingTask?.enterprise || "");
  const [notes, setNotes] = useState(meta.notes || "");
  const [repeat, setRepeat] = useState("none");
  const [repeatUntil, setRepeatUntil] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Auto-fill times when shift type changes
  useEffect(() => {
    const def = getShiftTypeDef(shiftType);
    if (def && shiftType !== "custom") {
      setStartTime(def.start);
      setEndTime(def.end);
    }
  }, [shiftType]);

  const selectedStaff = people.find((p) => p.email === staffId);
  const hours = calcHours(startTime, endTime, breakMins);

  // Conflict detection
  const conflict = weekShifts.find(
    (s) => s.assigned_to_email === staffId && s.scheduled_date === date && (!isEdit || s.id !== existingTask?.id)
  );
  const conflictMeta = conflict ? parseShiftMeta(conflict) : null;

  const buildPayload = (overrideDate) => {
    const metaObj = {
      shift_type: shiftType,
      start_time: startTime,
      end_time: endTime,
      break_minutes: breakMins,
      hours: parseFloat(hours.toFixed(2)),
      notes,
      published: false,
      location: enterprise,
    };
    const staff = people.find((p) => p.email === staffId);
    return {
      task_type: "shift",
      title: `${staff?.first_name || ""} ${staff?.last_name || ""} — ${getShiftTypeDef(shiftType)?.label || ""} Shift`,
      assigned_to_email: staffId,
      assigned_to_name: `${staff?.first_name || ""} ${staff?.last_name || ""}`.trim(),
      enterprise,
      scheduled_date: overrideDate || date,
      scheduled_time: startTime,
      due_time: endTime,
      status: "open",
      priority: "normal",
      outcome: "pending",
      outcome_notes: JSON.stringify(metaObj),
    };
  };

  const getRepeatDates = () => {
    if (repeat === "none" || !repeatUntil) return [];
    const dates = [];
    let cur = new Date(date);
    const until = new Date(repeatUntil);
    const step = repeat === "daily" ? 1 : repeat === "weekly" ? 7 : repeat === "biweekly" ? 14 : 30;
    cur = addDays(cur, step);
    while (cur <= until) {
      dates.push(format(cur, "yyyy-MM-dd"));
      cur = addDays(cur, step);
    }
    return dates;
  };

  const handleSave = async (andAddAnother = false) => {
    if (!staffId || !date) return;
    setSaving(true);
    const payload = buildPayload();
    if (isEdit) {
      await updateRecord("task", existingTask.id, payload, user);
    } else {
      await createRecord("task", payload, user);
      const extraDates = getRepeatDates();
      await Promise.all(extraDates.map((d) => createRecord("task", buildPayload(d), user)));
    }
    setSaving(false);
    if (andAddAnother) onAddAnother?.();
    else onSuccess?.();
  };

  const handleDelete = async () => {
    if (!existingTask?.id) return;
    setDeleting(true);
    await deleteRecord("task", existingTask.id, user);
    setDeleting(false);
    onSuccess?.();
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white rounded-t-3xl sm:rounded-2xl w-full sm:max-w-lg max-h-[92vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100 sticky top-0 bg-white z-10">
          <p className="font-black text-gray-900 text-base">{isEdit ? "Edit Shift" : "Schedule Shift"}</p>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-gray-100 text-gray-400 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Staff */}
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Staff Member *</label>
            <select value={staffId} onChange={(e) => setStaffId(e.target.value)}
              className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
              <option value="">Select staff member…</option>
              {people.map((p) => (
                <option key={p.id} value={p.email}>
                  {p.first_name} {p.last_name} {p.primary_role ? `— ${p.primary_role}` : ""}
                </option>
              ))}
            </select>
          </div>

          {/* Date */}
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Date *</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
              className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>

          {/* Conflict warning */}
          {conflict && conflictMeta && (
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-800">
                <span className="font-bold">{selectedStaff?.first_name} already has a shift on this day:</span>{" "}
                {conflictMeta.start_time}–{conflictMeta.end_time} ({getShiftTypeDef(conflictMeta.shift_type)?.label})
              </p>
            </div>
          )}

          {/* Shift Type */}
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Shift Type *</label>
            <div className="mt-1 grid grid-cols-2 gap-2">
              {SHIFT_TYPES.map((t) => (
                <button key={t.key} type="button" onClick={() => setShiftType(t.key)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-semibold transition-all
                    ${shiftType === t.key ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-gray-200 hover:border-gray-300 text-gray-700"}`}>
                  <span className={`w-2.5 h-2.5 rounded-full bg-${t.color}-500`} />
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Times */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Start Time *</label>
              <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)}
                className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">End Time *</label>
              <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)}
                className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
          </div>

          {/* Break */}
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Break Duration</label>
            <select value={breakMins} onChange={(e) => setBreakMins(Number(e.target.value))}
              className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
              {BREAKS.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
            </select>
          </div>

          {/* Hours calc */}
          {hours > 0 && (
            <div className="bg-indigo-50 rounded-xl px-3 py-2 text-sm font-bold text-indigo-700">
              Total hours: {hours.toFixed(1)}h (after {breakMins} min break)
            </div>
          )}

          {/* Enterprise */}
          {enterprises.length > 0 && (
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Enterprise / Location</label>
              <select value={enterprise} onChange={(e) => setEnterprise(e.target.value)}
                className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                <option value="">None</option>
                {enterprises.map((e) => <option key={e.id} value={e.enterprise_name}>{e.enterprise_name}</option>)}
              </select>
            </div>
          )}

          {/* Repeat */}
          {!isEdit && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Repeat</label>
                <select value={repeat} onChange={(e) => setRepeat(e.target.value)}
                  className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  <option value="none">None</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="biweekly">Every 2 weeks</option>
                </select>
              </div>
              {repeat !== "none" && (
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Until</label>
                  <input type="date" value={repeatUntil} onChange={(e) => setRepeatUntil(e.target.value)}
                    className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
              )}
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Notes</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
              placeholder="Special instructions…"
              className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 pb-5 pt-3 border-t border-gray-100 flex gap-2 flex-wrap">
          {isEdit && (
            <button onClick={handleDelete} disabled={deleting}
              className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl border-2 border-red-200 text-red-600 text-sm font-bold hover:bg-red-50 disabled:opacity-50">
              <Trash2 className="w-4 h-4" /> {deleting ? "Deleting…" : "Delete"}
            </button>
          )}
          <div className="flex gap-2 flex-1 justify-end">
            {!isEdit && (
              <button onClick={() => handleSave(true)} disabled={saving || !staffId}
                className="px-3 py-2.5 rounded-xl border-2 border-indigo-200 text-indigo-700 text-sm font-bold hover:bg-indigo-50 disabled:opacity-50">
                Save & Add Another
              </button>
            )}
            <button onClick={() => handleSave(false)} disabled={saving || !staffId}
              className="px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 disabled:opacity-50">
              {saving ? "Saving…" : "Save Shift"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}