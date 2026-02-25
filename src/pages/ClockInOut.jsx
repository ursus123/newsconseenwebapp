import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, differenceInMinutes } from "date-fns";
import { Clock, LogIn, LogOut, ArrowRightLeft, CheckCircle2, AlertCircle, ChevronLeft, X, MapPin, Building2 } from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";

function todayStr() { return format(new Date(), "yyyy-MM-dd"); }
function nowTimeStr() { return format(new Date(), "HH:mm"); }
function fmtDuration(mins) {
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

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

function StatusPill({ status, enterprise }) {
  const cfg = {
    clocked_out: { label: "Not clocked in", cls: "bg-slate-100 text-slate-500", dot: "bg-slate-300" },
    clocked_in:  { label: "Clocked In",     cls: "bg-emerald-100 text-emerald-700", dot: "bg-emerald-500 animate-pulse" },
  }[status] || { label: status, cls: "bg-slate-100 text-slate-500", dot: "bg-slate-300" };

  return (
    <div className="flex flex-col items-center gap-1">
      <span className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-bold ${cfg.cls}`}>
        <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
        {cfg.label}
      </span>
      {enterprise && status === "clocked_in" && (
        <span className="text-xs text-slate-400 flex items-center gap-1">
          <Building2 className="w-3 h-3" /> {enterprise}
        </span>
      )}
    </div>
  );
}

function TimelineEntry({ task }) {
  const typeMap = {
    clock_in:        { label: "Clocked In",    dot: "bg-emerald-500" },
    clock_out:       { label: "Clocked Out",   dot: "bg-slate-400" },
    stock_transfer:  { label: "Transfer",       dot: "bg-blue-400" },
  };
  const cfg = typeMap[task.task_type] || { label: task.task_type, dot: "bg-slate-300" };
  const time = task.scheduled_time || "";

  return (
    <div className="flex items-start gap-3 py-3 border-b border-slate-50 last:border-0">
      <div className={`w-3 h-3 rounded-full mt-1 shrink-0 ${cfg.dot}`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-700">{cfg.label}</p>
        {task.outcome_notes && (
          <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">{task.outcome_notes}</p>
        )}
      </div>
      <p className="text-xs font-mono text-slate-400 shrink-0">{time}</p>
    </div>
  );
}

function Toast({ msg, ok }) {
  return (
    <div className={`fixed bottom-8 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-6 py-4 rounded-2xl shadow-2xl text-white font-bold text-sm
      ${ok ? "bg-emerald-600" : "bg-rose-600"}`}>
      {ok ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
      {msg}
    </div>
  );
}

function TransferModal({ enterprises, onConfirm, onClose }) {
  const [enterprise, setEnterprise] = useState("");
  const [address, setAddress] = useState("");
  const [locLoading, setLocLoading] = useState(false);

  const detectLocation = async () => {
    setLocLoading(true);
    const loc = await getLocationString();
    setAddress(loc || "");
    setLocLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-800">Transfer Location</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Enterprise</label>
            <select
              value={enterprise}
              onChange={(e) => setEnterprise(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
            >
              <option value="">— Select enterprise —</option>
              {enterprises.map((e) => (
                <option key={e.id} value={e.enterprise_name}>{e.enterprise_name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Address / Location</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Enter address or detect..."
                className="flex-1 px-4 py-3 rounded-xl border border-slate-200 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
              <button
                onClick={detectLocation}
                disabled={locLoading}
                className="px-3 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 transition-colors text-slate-600 disabled:opacity-50"
                title="Detect my location"
              >
                {locLoading ? <Clock className="w-4 h-4 animate-spin" /> : <MapPin className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>

        <button
          onClick={() => onConfirm(enterprise, address)}
          disabled={!enterprise && !address}
          className="w-full py-3.5 rounded-xl bg-blue-600 text-white font-bold text-sm hover:bg-blue-700 active:scale-95 transition-all disabled:opacity-40"
        >
          Confirm Transfer
        </button>
      </div>
    </div>
  );
}

export default function ClockInOut() {
  const [user, setUser] = useState(null);
  const [toast, setToast] = useState(null);
  const [showTransfer, setShowTransfer] = useState(false);
  const [currentEnterprise, setCurrentEnterprise] = useState("");
  const qc = useQueryClient();

  useEffect(() => { base44.auth.me().then(setUser).catch(() => {}); }, []);

  const { data: todayTasks = [], isLoading } = useQuery({
    queryKey: ["clock-tasks", user?.email, todayStr()],
    queryFn: () => base44.entities.Task.filter({
      assigned_to_email: user.email,
      scheduled_date: todayStr(),
    }, "-created_date"),
    enabled: !!user?.email,
  });

  const { data: enterprises = [] } = useQuery({
    queryKey: ["enterprises"],
    queryFn: () => base44.entities.Enterprise.list(),
    enabled: !!user,
  });

  // Derive state
  const clockInTask = todayTasks.find((t) => t.task_type === "clock_in" && t.status === "completed");
  const clockOutTask = todayTasks.find((t) => t.task_type === "clock_out" && t.status === "completed");

  const isClockedIn = !!clockInTask && !clockOutTask;
  const currentStatus = isClockedIn ? "clocked_in" : "clocked_out";

  // Update currentEnterprise from last transfer or clock-in
  useEffect(() => {
    const sorted = [...todayTasks].sort((a, b) => new Date(b.created_date) - new Date(a.created_date));
    const last = sorted.find((t) => t.enterprise);
    if (last?.enterprise) setCurrentEnterprise(last.enterprise);
  }, [todayTasks]);

  // Elapsed timer
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
      status: "completed",
      outcome: "completed",
      outcome_notes: data.notes || null,
      enterprise: data.enterprise || null,
      assigned_to_email: user.email,
      assigned_to_name: user.full_name || user.email,
      scheduled_date: todayStr(),
      scheduled_time: nowTimeStr(),
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["clock-tasks"] }),
  });

  const handleClockIn = async () => {
    if (isClockedIn) return;
    const time = nowTimeStr();
    const loc = await getLocationString();
    const locNote = loc ? ` | Location: ${loc}` : "";
    createTask.mutate({ task_type: "clock_in", title: "Clock In", notes: `Clocked in at ${time}${locNote}`, enterprise: currentEnterprise });
    showToast(`Clocked in at ${time} ✓`);
  };

  const handleClockOut = async () => {
    if (!isClockedIn) return;
    const time = nowTimeStr();
    const loc = await getLocationString();
    const locNote = loc ? ` | Location: ${loc}` : "";
    createTask.mutate({ task_type: "clock_out", title: "Clock Out", notes: `Clocked out at ${time}${locNote}`, enterprise: currentEnterprise });
    showToast(`Clocked out at ${time} ✓`);
  };

  const handleTransfer = async (enterprise, address) => {
    setShowTransfer(false);
    const time = nowTimeStr();
    const notes = [
      `Transferred at ${time}`,
      enterprise && `Enterprise: ${enterprise}`,
      address && `Address: ${address}`,
    ].filter(Boolean).join(" | ");
    createTask.mutate({ task_type: "stock_transfer", title: "Transfer", notes, enterprise });
    if (enterprise) setCurrentEnterprise(enterprise);
    showToast(`Transferred to ${enterprise || address} ✓`);
  };

  const isBusy = createTask.isPending;
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
        <LiveClock />

        {/* Status */}
        <div className="flex flex-col items-center gap-2">
          <StatusPill status={currentStatus} enterprise={currentEnterprise} />
          {elapsed !== null && (
            <p className="text-sm text-slate-400">On shift for <span className="font-bold text-slate-600">{fmtDuration(elapsed)}</span></p>
          )}
        </div>

        {/* 3 Action Buttons */}
        <div className="grid grid-cols-3 gap-3">
          {/* Clock In */}
          <button
            onClick={handleClockIn}
            disabled={isBusy || isClockedIn}
            className={`flex flex-col items-center justify-center gap-2 py-6 rounded-2xl font-bold text-sm shadow-md active:scale-95 transition-all duration-200
              ${isClockedIn
                ? "bg-emerald-500 text-white shadow-emerald-200 cursor-not-allowed opacity-80"
                : "bg-white border-2 border-emerald-400 text-emerald-600 hover:bg-emerald-50"
              }
              ${isBusy ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            <LogIn className="w-6 h-6" />
            Clock In
          </button>

          {/* Clock Out */}
          <button
            onClick={handleClockOut}
            disabled={isBusy || !isClockedIn}
            className={`flex flex-col items-center justify-center gap-2 py-6 rounded-2xl font-bold text-sm shadow-md active:scale-95 transition-all duration-200
              ${!isClockedIn
                ? "bg-slate-800 text-white shadow-slate-300 cursor-not-allowed opacity-80"
                : "bg-white border-2 border-slate-700 text-slate-700 hover:bg-slate-50"
              }
              ${isBusy ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            <LogOut className="w-6 h-6" />
            Clock Out
          </button>

          {/* Transfer */}
          <button
            onClick={() => isClockedIn && setShowTransfer(true)}
            disabled={isBusy || !isClockedIn}
            className={`flex flex-col items-center justify-center gap-2 py-6 rounded-2xl font-bold text-sm shadow-md active:scale-95 transition-all duration-200
              ${isClockedIn
                ? "bg-white border-2 border-blue-500 text-blue-600 hover:bg-blue-50"
                : "bg-white border-2 border-slate-200 text-slate-300 cursor-not-allowed"
              }
              ${isBusy ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            <ArrowRightLeft className="w-6 h-6" />
            Transfer
          </button>
        </div>

        {/* Shift summary if clocked out after a shift */}
        {!isClockedIn && clockOutTask && clockInTask && (
          <div className="flex items-center justify-center gap-3 py-4 bg-white rounded-2xl border border-slate-100 shadow-sm">
            <CheckCircle2 className="w-6 h-6 text-emerald-500" />
            <div>
              <p className="text-sm font-bold text-slate-800">Shift complete</p>
              <p className="text-xs text-slate-400">{clockInTask.scheduled_time} → {clockOutTask.scheduled_time}</p>
            </div>
          </div>
        )}

        {/* Today's timeline */}
        {timeline.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Today's Log</p>
            {timeline.map((t) => <TimelineEntry key={t.id} task={t} />)}
          </div>
        )}
      </div>

      {showTransfer && (
        <TransferModal
          enterprises={enterprises}
          onConfirm={handleTransfer}
          onClose={() => setShowTransfer(false)}
        />
      )}

      {toast && <Toast msg={toast.msg} ok={toast.ok} />}
    </div>
  );
}