import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { X, AlertTriangle, Trash2, CheckCircle2, Plus } from "lucide-react";
import { SHIFT_TYPES, SHIFT_TYPE_DEFAULTS, calcHours, parseShiftMeta } from "./shiftUtils";

function todayStr() { return format(new Date(), "yyyy-MM-dd"); }

const BREAK_OPTIONS = [
  { value: 0, label: "No break" },
  { value: 15, label: "15 min" },
  { value: 30, label: "30 min" },
  { value: 45, label: "45 min" },
  { value: 60, label: "1 hour" },
];

const REPEAT_OPTIONS = ["None", "Daily", "Weekly", "Every 2 weeks", "Monthly"];

export default function ShiftModal({
  existingTask, // null = new, object = edit
  prefillDate,
  prefillStaff,
  people,
  enterprises,
  weekShifts, // all shifts this week for conflict detection
  user,
  onClose,
  onSuccess,
  onAddAnother,
}) {
  const [staffEmail, setStaffEmail] = useState(prefillStaff?.email || "");
  const [staffName, setStaffName] = useState(prefillStaff ? `${prefillStaff.first_name} ${prefillStaff.last_name}` : "");
  const [date, setDate] = useState(prefillDate || todayStr());
  const [shiftType, setShiftType] = useState("full_day");
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("17:00");
  const [breakMins, setBreakMins] = useState(30);
  const [enterprise, setEnterprise] = useState(enterprises[0]?.enterprise_name || "");
  const [location, setLocation] = useState("");
  const [repeat, setRepeat] = useState("None");
  const [repeatUntil, setRepeatUntil] = useState("");
  const [notes, setNotes] = useState("");
  const [replaceConflict, setReplaceConflict] = useState(false);

  const qc = useQueryClient();

  // Populate from existing
  useEffect(() => {
    if (!existingTask) return;
    const meta = parseShiftMeta(existingTask);
    setStaffEmail(existingTask.assigned_to_email || "");
    setStaffName(existingTask.assigned_to_name || "");
    setDate(existingTask.scheduled_date || todayStr());
    setShiftType(meta.shift_type || "full_day");
    setStartTime(meta.start_time || existingTask.scheduled_time || "08:00");
    setEndTime(meta.end_time || existingTask.due_time || "17:00");
    setBreakMins(meta.break_minutes || 30);
    setEnterprise(existingTask.enterprise || "");
    setLocation(meta.location || "");
    setNotes(meta.notes || "");
  }, [existingTask]);

  // Auto-fill times based on shift type
  const handleShiftTypeChange = (type) => {
    setShiftType(type);
    const def = SHIFT_TYPE_DEFAULTS[type];
    if (def.start) setStartTime(def.start);
    if (def.end) setEndTime(def.end);
  };

  // Conflict check
  const conflict = weekShifts?.find((s) =>
    s.scheduled_date === date &&
    s.assigned_to_email === staffEmail &&
    (!existingTask || s.id !== existingTask.id) &&
    s.task_type === "shift"
  );

  const hours = calcHours(startTime, endTime, breakMins);

  const buildMeta = () => JSON.stringify({
    shift_type: shiftType,
    start_time: startTime,
    end_time: endTime,
    break_minutes: breakMins,
    hours,
    location,
    notes,
    published: false,
    status: "scheduled",
  });

  const buildTaskData = (targetDate) => ({
    task_type: "shift",
    title: `${staffName} — ${SHIFT_TYPES[shiftType]?.label || "Shift"}`,
    status: "open",
    priority: "normal",
    assigned_to_email: staffEmail,
    assigned_to_name: staffName,
    enterprise,
    scheduled_date: targetDate,
    scheduled_time: startTime,
    due_time: endTime,
    outcome_notes: buildMeta(),
    internal_notes: `company_id:${user?.company_id}`,
  });

  const saveMut = useMutation({
    mutationFn: async () => {
      // Delete conflict if replacing
      if (conflict && replaceConflict) {
        await base44.entities.Task.delete(conflict.id);
      } else if (conflict && !replaceConflict) {
        throw new Error("CONFLICT");
      }

      if (existingTask) {
        await base44.entities.Task.update(existingTask.id, buildTaskData(date));
        return;
      }

      const dates = [date];
      if (repeat !== "None" && repeatUntil) {
        let cur = new Date(date);
        const until = new Date(repeatUntil);
        const step = repeat === "Daily" ? 1 : repeat === "Weekly" ? 7 : repeat === "Every 2 weeks" ? 14 : 30;
        while (true) {
          cur = new Date(cur.getTime() + step * 86400000);
          if (cur > until) break;
          dates.push(format(cur, "yyyy-MM-dd"));
        }
      }

      await Promise.all(dates.map((d) => base44.entities.Task.create(buildTaskData(d))));
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shift-tasks"] });
      onSuccess?.();
    },
  });

  const deleteMut = useMutation({
    mutationFn: () => base44.entities.Task.delete(existingTask.id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["shift-tasks"] }); onSuccess?.(); },
  });

  const handleStaffChange = (email) => {
    setStaffEmail(email);
    const p = people.find((p) => p.email === email);
    if (p) setStaffName(`${p.first_name} ${p.last_name}`);
  };

  const canSave = staffEmail && date && shiftType;
  const isError = saveMut.error?.message === "CONFLICT";

  const lb = "text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5 block";
  const inp = "w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400";

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full max-w-lg rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[95vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-gray-100 sticky top-0 bg-white z-10">
          <p className="text-lg font-black text-gray-900">{existingTask ? "Edit Shift" : "Schedule Shift"}</p>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Staff */}
          <div>
            <label className={lb}>Staff Member *</label>
            <select value={staffEmail} onChange={(e) => handleStaffChange(e.target.value)} className={inp}>
              <option value="">— Select staff member —</option>
              {people.map((p) => (
                <option key={p.id} value={p.email || p.id}>
                  {p.first_name} {p.last_name} {p.primary_role ? `— ${p.primary_role}` : ""}
                </option>
              ))}
            </select>
          </div>

          {/* Date */}
          <div>
            <label className={lb}>Date *</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inp} />
          </div>

          {/* Shift type */}
          <div>
            <label className={lb}>Shift Type *</label>
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(SHIFT_TYPES).filter(([k]) => !["day_off", "holiday", "sick"].includes(k)).map(([key, cfg]) => (
                <button
                  key={key}
                  onClick={() => handleShiftTypeChange(key)}
                  className={`py-2 px-2 rounded-xl text-xs font-bold border-2 text-left transition-all
                    ${shiftType === key ? `${cfg.color} border-current` : "bg-white text-gray-400 border-gray-200 hover:bg-gray-50"}`}
                >
                  {cfg.label}
                </button>
              ))}
            </div>
          </div>

          {/* Times */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lb}>Start Time</label>
              <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className={inp} />
            </div>
            <div>
              <label className={lb}>End Time</label>
              <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className={inp} />
            </div>
          </div>

          {/* Break + hours */}
          <div>
            <label className={lb}>Break Duration</label>
            <div className="flex gap-2">
              {BREAK_OPTIONS.map((b) => (
                <button key={b.value} onClick={() => setBreakMins(b.value)}
                  className={`flex-1 py-2 rounded-xl text-xs font-bold border-2 transition-all
                    ${breakMins === b.value ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-gray-400 border-gray-200"}`}
                >{b.label}</button>
              ))}
            </div>
          </div>

          {hours > 0 && (
            <div className="bg-indigo-50 rounded-xl px-4 py-2.5 text-sm font-bold text-indigo-700">
              Total hours: {hours.toFixed(1)}h (after {breakMins} min break)
            </div>
          )}

          {/* Enterprise */}
          <div>
            <label className={lb}>Enterprise / Location</label>
            <select value={enterprise} onChange={(e) => setEnterprise(e.target.value)} className={inp}>
              <option value="">— Select enterprise —</option>
              {enterprises.map((e) => (
                <option key={e.id} value={e.enterprise_name}>{e.enterprise_name}</option>
              ))}
            </select>
          </div>

          {/* Location */}
          <div>
            <label className={lb}>Specific Location</label>
            <input type="text" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Main Building, Ward 2" className={inp} />
          </div>

          {/* Repeat */}
          <div>
            <label className={lb}>Repeat</label>
            <div className="flex gap-1.5 flex-wrap">
              {REPEAT_OPTIONS.map((r) => (
                <button key={r} onClick={() => setRepeat(r)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold border-2 transition-all
                    ${repeat === r ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-gray-400 border-gray-200"}`}
                >{r}</button>
              ))}
            </div>
            {repeat !== "None" && (
              <div className="mt-2">
                <label className={lb}>Until</label>
                <input type="date" value={repeatUntil} onChange={(e) => setRepeatUntil(e.target.value)} className={inp} />
              </div>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className={lb}>Notes</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Special instructions or cover reason…" className={`${inp} resize-none`} />
          </div>

          {/* Conflict warning */}
          {conflict && !replaceConflict && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-2">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-sm font-semibold text-amber-800">
                  {staffName} already has a shift on {date}:<br />
                  {parseShiftMeta(conflict).start_time} – {parseShiftMeta(conflict).end_time} ({SHIFT_TYPES[parseShiftMeta(conflict).shift_type]?.label})
                </p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setReplaceConflict(false)} className="flex-1 py-2 rounded-xl border border-amber-300 text-amber-700 text-xs font-bold">Add Anyway</button>
                <button onClick={() => setReplaceConflict(true)} className="flex-1 py-2 rounded-xl bg-amber-500 text-white text-xs font-bold">Replace Existing</button>
              </div>
            </div>
          )}

          {isError && (
            <p className="text-sm text-red-600 font-semibold">Please resolve the shift conflict first.</p>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white border-t border-gray-100 px-5 py-4 space-y-2">
          <div className="flex gap-2">
            <button onClick={onClose} className="flex-1 py-3.5 rounded-2xl border-2 border-gray-200 text-gray-600 font-bold text-sm">Cancel</button>
            <button
              onClick={() => saveMut.mutate()}
              disabled={!canSave || saveMut.isPending}
              className={`flex-1 py-3.5 rounded-2xl text-white font-black text-sm transition-all active:scale-95 flex items-center justify-center gap-2
                ${canSave ? "bg-indigo-600 hover:bg-indigo-700" : "bg-gray-300 cursor-not-allowed"}`}
            >
              <CheckCircle2 className="w-4 h-4" /> {saveMut.isPending ? "Saving…" : "Save Shift"}
            </button>
          </div>
          {!existingTask && (
            <button
              onClick={() => { saveMut.mutate(); onAddAnother?.(); }}
              disabled={!canSave || saveMut.isPending}
              className="w-full py-3 rounded-2xl border-2 border-indigo-200 text-indigo-700 font-bold text-sm flex items-center justify-center gap-2 hover:bg-indigo-50"
            >
              <Plus className="w-4 h-4" /> Save & Add Another
            </button>
          )}
          {existingTask && (
            <button
              onClick={() => deleteMut.mutate()}
              disabled={deleteMut.isPending}
              className="w-full py-3 rounded-2xl border-2 border-red-200 text-red-600 font-bold text-sm flex items-center justify-center gap-2 hover:bg-red-50"
            >
              <Trash2 className="w-4 h-4" /> Delete Shift
            </button>
          )}
        </div>
      </div>
    </div>
  );
}