import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, differenceInMinutes, parseISO } from "date-fns";
import { Clock, Coffee, LogIn, LogOut, CheckCircle2, AlertCircle, ChevronLeft } from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";

// ─── helpers ────────────────────────────────────────────────────────────────

function todayStr() { return format(new Date(), "yyyy-MM-dd"); }
function nowTimeStr() { return format(new Date(), "HH:mm"); }
function fmtDuration(mins) {
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

// ─── Clock face ─────────────────────────────────────────────────────────────
function LiveClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="text-center select-none">
      <p className="text-7xl font-black tracking-tighter text-slate-900 tabular-nums leading-none">
        {format(now, "HH:mm")}
        <span className="text-3xl text-slate-300 ml-1">{format(now, "ss")}</span>
      </p>
      <p className="text-sm text-slate-400 mt-2 font-medium tracking-wide">
        {format(now, "EEEE, MMMM d, yyyy")}
      </p>
    </div>
  );
}

// ─── Status badge ────────────────────────────────────────────────────────────
function StatusPill({ status }) {
  const cfg = {
    clocked_out: { label: "Not clocked in", cls: "bg-slate-100 text-slate-500" },
    clocked_in:  { label: "Clocked In",     cls: "bg-emerald-100 text-emerald-700" },
    on_break:    { label: "On Break",        cls: "bg-amber-100 text-amber-700" },
  }[status] || { label: status, cls: "bg-slate-100 text-slate-500" };

  return (
    <span className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-bold ${cfg.cls}`}>
      <span className={`w-2 h-2 rounded-full ${status === "clocked_in" ? "bg-emerald-500 animate-pulse" : status === "on_break" ? "bg-amber-500 animate-pulse" : "bg-slate-300"}`} />
      {cfg.label}
    </span>
  );
}

// ─── Big action button ───────────────────────────────────────────────────────
function ActionButton({ label, icon: Icon, onClick, color, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full flex items-center justify-center gap-4 py-6 rounded-2xl text-xl font-black tracking-tight shadow-lg active:scale-95 transition-all duration-150
        ${disabled ? "opacity-40 cursor-not-allowed" : "hover:shadow-xl hover:-translate-y-0.5 cursor-pointer"}
        ${color}`}
    >
      <Icon className="w-7 h-7" />
      {label}
    </button>
  );
}

// ─── Timeline entry ──────────────────────────────────────────────────────────
function TimelineEntry({ task }) {
  const typeMap = {
    clock_in:       { label: "Clocked In",    dot: "bg-emerald-500" },
    clock_out:      { label: "Clocked Out",   dot: "bg-slate-400" },
    break_start_end:{ label: "Break",          dot: "bg-amber-400" },
  };
  const cfg = typeMap[task.task_type] || { label: task.task_type, dot: "bg-slate-300" };
  const time = task.scheduled_time || "";
  const outTime = task.outcome_notes?.match(/\d{2}:\d{2}/)?.[0] || "";

  return (
    <div className="flex items-start gap-3 py-3 border-b border-slate-50 last:border-0">
      <div className={`w-3 h-3 rounded-full mt-1 shrink-0 ${cfg.dot}`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-700">{cfg.label}</p>
        {task.outcome_notes && (
          <p className="text-xs text-slate-400 mt-0.5 truncate">{task.outcome_notes}</p>
        )}
      </div>
      <p className="text-xs font-mono text-slate-400 shrink-0">{time}{outTime && time ? ` → ${outTime}` : outTime}</p>
    </div>
  );
}

// ─── Toast feedback ──────────────────────────────────────────────────────────
function Toast({ msg, ok }) {
  return (
    <div className={`fixed bottom-8 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-6 py-4 rounded-2xl shadow-2xl text-white font-bold text-sm transition-all
      ${ok ? "bg-emerald-600" : "bg-rose-600"}`}>
      {ok ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
      {msg}
    </div>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────
async function getLocationString() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`);
          const data = await res.json();
          resolve(data.display_name || `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`);
        } catch {
          resolve(`${latitude.toFixed(5)}, ${longitude.toFixed(5)}`);
        }
      },
      () => resolve(null),
      { timeout: 6000 }
    );
  });
}

export default function ClockInOut() {
  const [user, setUser] = useState(null);
  const [toast, setToast] = useState(null);
  const [notes, setNotes] = useState("");
  const [showNotes, setShowNotes] = useState(false);
  const qc = useQueryClient();

  useEffect(() => { base44.auth.me().then(setUser).catch(() => {}); }, []);

  // Today's attendance tasks for this user
  const { data: todayTasks = [], isLoading } = useQuery({
    queryKey: ["clock-tasks", user?.email, todayStr()],
    queryFn: () => base44.entities.Task.filter({
      assigned_to_email: user.email,
      scheduled_date: todayStr(),
    }, "-created_date"),
    enabled: !!user?.email,
  });

  // Derive current state from tasks
  const clockInTask = todayTasks.find((t) => t.task_type === "clock_in" && t.status === "completed");
  const clockOutTask = todayTasks.find((t) => t.task_type === "clock_out" && t.status === "completed");
  const breakTask = todayTasks.find((t) => t.task_type === "break_start_end" && t.status === "in_progress");
  const breakEndTask = todayTasks.find((t) => t.task_type === "break_start_end" && t.status === "completed");

  let currentStatus = "clocked_out";
  if (clockInTask && !clockOutTask) currentStatus = breakTask ? "on_break" : "clocked_in";
  if (clockOutTask) currentStatus = "clocked_out";

  // Duration on clock
  const [elapsed, setElapsed] = useState(null);
  useEffect(() => {
    if (!clockInTask || clockOutTask) { setElapsed(null); return; }
    const inTime = new Date(clockInTask.updated_date);
    const tick = () => setElapsed(differenceInMinutes(new Date(), inTime));
    tick();
    const t = setInterval(tick, 60000);
    return () => clearInterval(t);
  }, [clockInTask, clockOutTask]);

  const showToast = (msg, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  };

  const createTask = useMutation({
    mutationFn: (data) => base44.entities.Task.create({
      task_type: data.task_type,
      title: data.title,
      status: data.status,
      outcome: data.status === "completed" ? "completed" : "pending",
      outcome_notes: data.notes || null,
      assigned_to_email: user.email,
      assigned_to_name: user.full_name || user.email,
      scheduled_date: todayStr(),
      scheduled_time: nowTimeStr(),
      company_id: user.company_id || null,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clock-tasks"] });
      setNotes("");
      setShowNotes(false);
    },
  });

  const updateTask = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Task.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["clock-tasks"] }),
  });

  const handleClockIn = async () => {
    const time = nowTimeStr();
    const loc = await getLocationString();
    const locNote = loc ? ` | Location: ${loc}` : "";
    createTask.mutate({ task_type: "clock_in", title: "Clock In", status: "completed", notes: (notes || `Clocked in at ${time}`) + locNote });
    showToast(`Clocked in at ${time} ✓`);
  };

  const handleClockOut = async () => {
    const time = nowTimeStr();
    const loc = await getLocationString();
    const locNote = loc ? ` | Location: ${loc}` : "";
    createTask.mutate({ task_type: "clock_out", title: "Clock Out", status: "completed", notes: (notes || `Clocked out at ${time}`) + locNote });
    showToast(`Clocked out at ${time} ✓`);
  };

  const handleStartBreak = () => {
    createTask.mutate({ task_type: "break_start_end", title: "Break", status: "in_progress", notes: `Break started at ${nowTimeStr()}` });
    showToast("Break started");
  };

  const handleEndBreak = () => {
    if (!breakTask) return;
    updateTask.mutate({ id: breakTask.id, data: { status: "completed", outcome: "completed", outcome_notes: `${breakTask.outcome_notes} → ended ${nowTimeStr()}` } });
    showToast("Break ended, back on shift");
  };

  const isBusy = createTask.isPending || updateTask.isPending;

  // Sort tasks for timeline
  const timeline = [...todayTasks].sort((a, b) => new Date(a.created_date) - new Date(b.created_date));

  if (!user || isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400">
        <Clock className="w-5 h-5 animate-spin mr-2" /> Loading…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Top bar */}
      <div className="bg-white border-b border-slate-100 px-4 py-3 flex items-center gap-3">
        <Link to={createPageUrl("Applications")} className="p-2 -ml-2 rounded-lg text-slate-400 hover:bg-slate-100 transition-colors">
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Clock In / Out</p>
          <p className="text-sm font-semibold text-slate-700 leading-tight">{user.full_name || user.email}</p>
        </div>
      </div>

      <div className="max-w-md mx-auto px-4 py-8 space-y-8">
        {/* Live clock */}
        <LiveClock />

        {/* Status */}
        <div className="flex flex-col items-center gap-2">
          <StatusPill status={currentStatus} />
          {elapsed !== null && (
            <p className="text-sm text-slate-400">On shift for <span className="font-bold text-slate-600">{fmtDuration(elapsed)}</span></p>
          )}
        </div>

        {/* Main action buttons */}
        <div className="space-y-3">
          {currentStatus === "clocked_out" && !clockOutTask && (
            <ActionButton
              label="Clock In"
              icon={LogIn}
              onClick={handleClockIn}
              color="bg-emerald-500 text-white"
              disabled={isBusy}
            />
          )}

          {currentStatus === "clocked_in" && (
            <>
              <ActionButton
                label="Clock Out"
                icon={LogOut}
                onClick={handleClockOut}
                color="bg-slate-900 text-white"
                disabled={isBusy}
              />
              <ActionButton
                label="Start Break"
                icon={Coffee}
                onClick={handleStartBreak}
                color="bg-amber-400 text-slate-900"
                disabled={isBusy}
              />
            </>
          )}

          {currentStatus === "on_break" && (
            <ActionButton
              label="End Break"
              icon={Coffee}
              onClick={handleEndBreak}
              color="bg-amber-400 text-slate-900"
              disabled={isBusy}
            />
          )}

          {clockOutTask && (
            <div className="flex flex-col items-center gap-2 py-6 bg-white rounded-2xl border border-slate-100 shadow-sm">
              <CheckCircle2 className="w-10 h-10 text-emerald-500" />
              <p className="text-base font-bold text-slate-800">Shift complete</p>
              <p className="text-sm text-slate-400">
                {clockInTask?.scheduled_time && clockOutTask?.scheduled_time
                  ? `${clockInTask.scheduled_time} → ${clockOutTask.scheduled_time}`
                  : "All done for today"}
              </p>
            </div>
          )}
        </div>

        {/* Optional notes toggle */}
        {currentStatus !== "clocked_out" || !clockOutTask ? (
          <div>
            <button
              onClick={() => setShowNotes(!showNotes)}
              className="text-xs text-slate-400 hover:text-slate-600 underline underline-offset-2 transition-colors"
            >
              {showNotes ? "Hide notes" : "+ Add a note (optional)"}
            </button>
            {showNotes && (
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Starting later, site visit, etc."
                rows={2}
                className="w-full mt-2 px-4 py-3 rounded-xl border border-slate-200 text-sm text-slate-700 placeholder-slate-300 resize-none focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent"
              />
            )}
          </div>
        ) : null}

        {/* Today's timeline */}
        {timeline.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Today's Log</p>
            {timeline.map((t) => <TimelineEntry key={t.id} task={t} />)}
          </div>
        )}
      </div>

      {toast && <Toast msg={toast.msg} ok={toast.ok} />}
    </div>
  );
}