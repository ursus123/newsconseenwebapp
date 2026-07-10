import React, { useState, useEffect, useMemo } from "react";
import { ncClient } from "@/api/ncClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { triggerAttendanceTransaction } from "@/components/shared/triggerTaskTransaction";
import { queryEnterprises } from "@/components/shared/masterDataQuery";
import { format, differenceInMinutes } from "date-fns";
import {
  Clock, LogIn, LogOut, ArrowRightLeft, CheckCircle2, AlertCircle,
  ChevronLeft, X, MapPin, Building2, Coffee, Wifi, WifiOff, RefreshCw
} from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import {
  todayStr, nowTimeStr, fmtDuration, getLocationCoords, getLocationString,
  getOfflineQueue, addToOfflineQueue, clearOfflineQueue, LAST_ENTERPRISE_KEY
} from "@/components/clockinout/clockUtils";
import ClockInModal from "@/components/clockinout/ClockInModal";
import ClockOutModal from "@/components/clockinout/ClockOutModal";
import WeeklyView from "@/components/clockinout/WeeklyView";
import { TeamTodayView, TeamWeekView } from "@/components/clockinout/TeamView";
import { createRecord } from "@/services/dataService";

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

function StatusPill({ status, enterprise, onBreak }) {
  const cfg = onBreak
    ? { label: "On Break", cls: "bg-amber-100 text-amber-700", dot: "bg-amber-500 animate-pulse" }
    : {
        clocked_out: { label: "Not clocked in", cls: "bg-slate-100 text-slate-500", dot: "bg-slate-300" },
        clocked_in: { label: "Clocked In", cls: "bg-emerald-100 text-emerald-700", dot: "bg-emerald-500 animate-pulse" },
      }[status] || { label: status, cls: "bg-slate-100 text-slate-500", dot: "bg-slate-300" };

  return (
    <div className="flex flex-col items-center gap-1">
      <span className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-bold ${cfg.cls}`}>
        <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
        {cfg.label}
      </span>
      {enterprise && status === "clocked_in" && !onBreak && (
        <span className="text-xs text-slate-400 flex items-center gap-1">
          <Building2 className="w-3 h-3" /> {enterprise}
        </span>
      )}
    </div>
  );
}

function OvertimeAlert({ elapsed }) {
  if (!elapsed || elapsed < 480) return null;
  const isExtended = elapsed >= 600;
  return (
    <div className={`flex items-start gap-2 px-4 py-3 rounded-xl text-sm font-medium ${isExtended ? "bg-red-50 text-red-700 border border-red-200" : "bg-amber-50 text-amber-700 border border-amber-200"}`}>
      <span>{isExtended ? "🔴" : "⚠️"}</span>
      <p>
        {isExtended
          ? `Extended shift: ${fmtDuration(elapsed)}. Please clock out if your shift has ended.`
          : `You have been on shift for ${fmtDuration(elapsed)}. Standard shift is 8 hours.`}
      </p>
    </div>
  );
}

function TimelineEntry({ task }) {
  const typeMap = {
    clock_in:      { label: "Clocked In",    dot: "bg-emerald-500" },
    clock_out:     { label: "Clocked Out",   dot: "bg-slate-400" },
    stock_transfer:{ label: "Transfer",       dot: "bg-blue-400" },
    break_start:   { label: "Break Started", dot: "bg-amber-400" },
    break_end:     { label: "Break Ended",   dot: "bg-amber-300" },
  };
  const cfg = typeMap[task.task_type] || { label: task.task_type, dot: "bg-slate-300" };
  return (
    <div className="flex items-start gap-3 py-3 border-b border-slate-50 last:border-0">
      <div className={`w-3 h-3 rounded-full mt-1 shrink-0 ${cfg.dot}`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-700">{cfg.label}</p>
        {task.outcome_notes && (
          <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">{task.outcome_notes}</p>
        )}
        {task.enterprise && <p className="text-xs text-slate-400">· {task.enterprise}</p>}
      </div>
      <p className="text-xs font-mono text-slate-400 shrink-0">{task.scheduled_time || ""}</p>
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
    const c = await getLocationCoords();
    const str = await getLocationString(c);
    setAddress(str || "");
    setLocLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-800">Transfer Location</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Enterprise</label>
            <select value={enterprise} onChange={(e) => setEnterprise(e.target.value)} className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white">
              <option value="">— Select enterprise —</option>
              {enterprises.map((e) => <option key={e.id} value={e.enterprise_name}>{e.enterprise_name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Address / Location</label>
            <div className="flex gap-2">
              <input type="text" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Enter address or detect..." className="flex-1 px-4 py-3 rounded-xl border border-slate-200 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-400" />
              <button onClick={detectLocation} disabled={locLoading} className="px-3 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 transition-colors text-slate-600 disabled:opacity-50">
                {locLoading ? <Clock className="w-4 h-4 animate-spin" /> : <MapPin className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>
        <button onClick={() => onConfirm(enterprise, address)} disabled={!enterprise && !address} className="w-full py-3.5 rounded-xl bg-blue-600 text-white font-bold text-sm hover:bg-blue-700 active:scale-95 transition-all disabled:opacity-40">
          Confirm Transfer
        </button>
      </div>
    </div>
  );
}

export default function ClockInOut() {
  const { data: user = null } = useQuery({
    queryKey: ["currentUser"],
    queryFn: () => ncClient.auth.me(),
    staleTime: 0,
    refetchOnMount: "always",
  });
  const [toast, setToast] = useState(null);
  const [showTransfer, setShowTransfer] = useState(false);
  const [showClockInModal, setShowClockInModal] = useState(false);
  const [showClockOutModal, setShowClockOutModal] = useState(false);
  const [currentEnterprise, setCurrentEnterprise] = useState("");
  const [activeTab, setActiveTab] = useState("today");
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [offlineQueue, setOfflineQueue] = useState([]);
  const [syncedCount, setSyncedCount] = useState(0);
  const qc = useQueryClient();

  useEffect(() => {
    if (!user?.email) return;
    // Restore last enterprise and offline queue once user is known
    const saved = localStorage.getItem(LAST_ENTERPRISE_KEY(user.email));
    if (saved) setCurrentEnterprise(saved);
    setOfflineQueue(getOfflineQueue(user.email));
  }, [user?.email]);

  // Online/offline detection
  useEffect(() => {
    const goOnline = async () => {
      setIsOnline(true);
      if (!user) return;
      const queue = getOfflineQueue(user.email);
      if (queue.length === 0) return;
      // Process queue
      for (const action of queue) {
        await createRecord("task", action.taskData, user).catch(() => {});
      }
      clearOfflineQueue(user.email);
      setOfflineQueue([]);
      setSyncedCount(queue.length);
      qc.invalidateQueries({ queryKey: ["clock-tasks"] });
      setTimeout(() => setSyncedCount(0), 5000);
    };
    const goOffline = () => setIsOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => { window.removeEventListener("online", goOnline); window.removeEventListener("offline", goOffline); };
  }, [user, qc]);

  const isAdmin = user?.role === "admin" || user?.role === "super_admin";

  const { data: todayTasks = [], isLoading } = useQuery({
    queryKey: ["clock-tasks", user?.email, todayStr()],
    queryFn: () => ncClient.entities.Task.filter({ assigned_to_email: user.email, scheduled_date: todayStr() }, "-created_date"),
    enabled: !!user?.email,
    staleTime: 0,
    refetchOnMount: "always",
  });

  // All tasks for history/week tabs
  const { data: allTasks = [] } = useQuery({
    queryKey: ["clock-tasks-all", user?.email],
    queryFn: () => ncClient.entities.Task.filter({ assigned_to_email: user.email }, "-scheduled_date", 200),
    enabled: !!user?.email && (activeTab === "week" || activeTab === "history"),
    staleTime: 0,
    refetchOnMount: "always",
  });

  const { data: enterprises = [] } = useQuery({
    queryKey: ["enterprises-app"],
    queryFn: () => queryEnterprises({ status: "active" }),
    enabled: !!user,
    staleTime: 0,
    refetchOnMount: "always",
  });

  // Derive state
  const sorted = useMemo(() => [...todayTasks].sort((a, b) => new Date(b.created_date) - new Date(a.created_date)), [todayTasks]);
  const clockInTask = sorted.find((t) => t.task_type === "clock_in" && t.status === "completed");
  const clockOutTask = sorted.find((t) => t.task_type === "clock_out" && t.status === "completed");
  const lastEvent = sorted.find((t) => ["clock_in", "clock_out"].includes(t.task_type));
  const isClockedIn = lastEvent?.task_type === "clock_in";
  const currentStatus = isClockedIn ? "clocked_in" : "clocked_out";

  // Break state
  const lastBreakEvent = sorted.find((t) => ["break_start", "break_end"].includes(t.task_type));
  const isOnBreak = isClockedIn && lastBreakEvent?.task_type === "break_start";

  // Break elapsed
  const [breakElapsed, setBreakElapsed] = useState(null);
  useEffect(() => {
    if (!isOnBreak || !lastBreakEvent) { setBreakElapsed(null); return; }
    const bsTime = new Date(lastBreakEvent.updated_date);
    const tick = () => setBreakElapsed(differenceInMinutes(new Date(), bsTime));
    tick();
    const t = setInterval(tick, 60000);
    return () => clearInterval(t);
  }, [isOnBreak, lastBreakEvent]);

  // Update enterprise from tasks
  useEffect(() => {
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

  // Calculate break total for today
  const totalBreakMins = useMemo(() => {
    const breakStarts = sorted.filter((t) => t.task_type === "break_start");
    const breakEnds = sorted.filter((t) => t.task_type === "break_end");
    let total = 0;
    breakStarts.forEach((bs, i) => {
      const be = breakEnds[i];
      if (bs && be) {
        const bsT = new Date(`${todayStr()}T${bs.scheduled_time}:00`);
        const beT = new Date(`${todayStr()}T${be.scheduled_time}:00`);
        total += differenceInMinutes(beT, bsT);
      }
    });
    if (isOnBreak && breakElapsed) total += breakElapsed;
    return total;
  }, [sorted, isOnBreak, breakElapsed]);

  const netMins = elapsed !== null ? Math.max(0, elapsed - totalBreakMins) : null;

  // Show location map coords
  const [clockInCoords, setClockInCoords] = useState(null);

  const showToast = (msg, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  };

  const createTask = useMutation({
    mutationFn: async (data) => {
      const taskData = {
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
      };

      if (!isOnline) {
        addToOfflineQueue(user.email, { taskData });
        setOfflineQueue(getOfflineQueue(user.email));
        return { offline: true };
      }

      const task = await createRecord("task", taskData, user, { queryClient: qc });
      if (data.task_type === "clock_in" || data.task_type === "clock_out") {
        await triggerAttendanceTransaction(data.task_type, task, user).catch(() => {});
      }
      return task;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["clock-tasks"] }); },
  });

  const handleClockIn = () => {
    if (isClockedIn) return;
    if (!currentEnterprise) {
      setShowClockInModal(true);
    } else {
      doClockIn(currentEnterprise, "", null);
    }
  };

  const doClockIn = async (enterprise, address, coords) => {
    setShowClockInModal(false);
    if (enterprise) {
      setCurrentEnterprise(enterprise);
      localStorage.setItem(LAST_ENTERPRISE_KEY(user.email), enterprise);
    }
    if (coords) setClockInCoords(coords);
    const time = nowTimeStr();
    const locPart = address ? ` | Location: ${address}` : "";
    createTask.mutate({ task_type: "clock_in", title: "Clock In", notes: `Clocked in at ${time}${locPart}`, enterprise });
    showToast(`Clocked in at ${time} ✓`);
  };

  const handleClockOut = () => {
    if (!isClockedIn) return;
    setShowClockOutModal(true);
  };

  const doClockOut = async (notes) => {
    setShowClockOutModal(false);
    const time = nowTimeStr();
    const notesStr = notes ? notes : `Clocked out at ${time}`;
    createTask.mutate({ task_type: "clock_out", title: "Clock Out", notes: notesStr, enterprise: currentEnterprise });
    showToast(`Clocked out at ${time} ✓`);
  };

  const handleBreak = () => {
    if (!isClockedIn) return;
    if (isOnBreak) {
      createTask.mutate({ task_type: "break_end", title: "Break End", enterprise: currentEnterprise });
      showToast("Break ended ✓");
    } else {
      createTask.mutate({ task_type: "break_start", title: "Break Start", enterprise: currentEnterprise });
      showToast("Break started ✓");
    }
  };

  const handleTransfer = (enterprise, address) => {
    setShowTransfer(false);
    const time = nowTimeStr();
    const notes = [`Transferred at ${time}`, enterprise && `Enterprise: ${enterprise}`, address && `Address: ${address}`].filter(Boolean).join(" | ");
    createTask.mutate({ task_type: "stock_transfer", title: "Transfer", notes, enterprise });
    if (enterprise) {
      setCurrentEnterprise(enterprise);
      localStorage.setItem(LAST_ENTERPRISE_KEY(user.email), enterprise);
    }
    showToast(`Transferred to ${enterprise || address} ✓`);
  };

  const isBusy = createTask.isPending;
  const timeline = [...todayTasks].sort((a, b) => new Date(a.created_date) - new Date(b.created_date));

  // Tab config
  const myTabs = [
    { key: "today", label: "Today" },
    { key: "week", label: "This Week" },
    { key: "history", label: "History" },
  ];
  const adminTabs = isAdmin ? [
    { key: "team_today", label: "Team Today" },
    { key: "team_week", label: "Team Week" },
  ] : [];
  const allTabs = [...myTabs, ...adminTabs];

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
        <div className="flex-1">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Clock In / Out</p>
          <p className="text-sm font-semibold text-slate-700 leading-tight">{user.full_name || user.email}</p>
        </div>
        {/* Online/offline indicator */}
        <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${isOnline ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"}`}>
          {isOnline ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
          {isOnline ? "Online" : "Offline"}
        </div>
      </div>

      {/* Offline banner */}
      {!isOnline && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center gap-2 text-sm text-amber-700">
          <WifiOff className="w-4 h-4 shrink-0" />
          <span>Offline Mode — actions will sync when connected</span>
          {offlineQueue.length > 0 && (
            <span className="ml-auto bg-amber-200 text-amber-800 px-2 py-0.5 rounded-full text-xs font-bold">{offlineQueue.length} pending</span>
          )}
        </div>
      )}

      {/* Synced banner */}
      {syncedCount > 0 && (
        <div className="bg-emerald-50 border-b border-emerald-200 px-4 py-2 flex items-center gap-2 text-sm text-emerald-700">
          <RefreshCw className="w-4 h-4" />
          ✅ {syncedCount} offline action{syncedCount > 1 ? "s" : ""} synced
        </div>
      )}

      {/* Tab bar */}
      <div className="bg-white border-b border-slate-100 px-4">
        <div className="flex gap-0 overflow-x-auto">
          {allTabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                activeTab === tab.key
                  ? "border-slate-800 text-slate-800"
                  : "border-transparent text-slate-400 hover:text-slate-600"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main content */}
      <div className="max-w-md mx-auto px-4 py-6 space-y-6">

        {/* TODAY TAB */}
        {activeTab === "today" && (
          <>
            <LiveClock />

            <div className="flex flex-col items-center gap-2">
              <StatusPill status={currentStatus} enterprise={currentEnterprise} onBreak={isOnBreak} />
              {elapsed !== null && !isOnBreak && (
                <p className="text-sm text-slate-400">
                  On shift for <span className="font-bold text-slate-600">{fmtDuration(elapsed)}</span>
                  {totalBreakMins > 0 && <span className="text-slate-300"> · {fmtDuration(totalBreakMins)} break</span>}
                  {netMins !== null && <span className="text-emerald-600 font-semibold"> · {fmtDuration(netMins)} net</span>}
                </p>
              )}
              {isOnBreak && breakElapsed !== null && (
                <p className="text-sm text-amber-600 font-medium">On break for {fmtDuration(breakElapsed)}</p>
              )}
            </div>

            {/* Location map if coords available */}
            {clockInCoords && isClockedIn && (
              <a
                href={`https://www.openstreetmap.org/?mlat=${clockInCoords.lat}&mlon=${clockInCoords.lon}&zoom=15`}
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded-xl overflow-hidden border border-slate-200 shadow-sm"
              >
                <img
                  src={`https://staticmap.openstreetmap.de/staticmap.php?center=${clockInCoords.lat},${clockInCoords.lon}&zoom=15&size=400x120&markers=${clockInCoords.lat},${clockInCoords.lon},red-pushpin`}
                  alt="Clock-in location"
                  className="w-full h-24 object-cover"
                />
              </a>
            )}

            {/* Overtime alert */}
            <OvertimeAlert elapsed={elapsed} />

            {/* 4 Action Buttons */}
            <div className="grid grid-cols-2 gap-3">
              {/* Clock In */}
              <button
                onClick={handleClockIn}
                disabled={isBusy || isClockedIn}
                className={`flex flex-col items-center justify-center gap-2 py-6 rounded-2xl font-bold text-sm shadow-md active:scale-95 transition-all duration-200
                  ${isClockedIn ? "bg-emerald-500 text-white cursor-not-allowed opacity-80" : "bg-white border-2 border-emerald-400 text-emerald-600 hover:bg-emerald-50"}
                  ${isBusy ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                <LogIn className="w-6 h-6" />
                Clock In
              </button>

              {/* Clock Out */}
              <button
                onClick={handleClockOut}
                disabled={isBusy || !isClockedIn || isOnBreak}
                className={`flex flex-col items-center justify-center gap-2 py-6 rounded-2xl font-bold text-sm shadow-md active:scale-95 transition-all duration-200
                  ${!isClockedIn ? "bg-slate-800 text-white cursor-not-allowed opacity-80" : isOnBreak ? "bg-white border-2 border-slate-200 text-slate-300 cursor-not-allowed" : "bg-white border-2 border-slate-700 text-slate-700 hover:bg-slate-50"}
                  ${isBusy ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                <LogOut className="w-6 h-6" />
                Clock Out
              </button>

              {/* Break */}
              <button
                onClick={handleBreak}
                disabled={isBusy || !isClockedIn}
                className={`flex flex-col items-center justify-center gap-2 py-6 rounded-2xl font-bold text-sm shadow-md active:scale-95 transition-all duration-200
                  ${!isClockedIn ? "bg-white border-2 border-slate-200 text-slate-300 cursor-not-allowed" : isOnBreak ? "bg-amber-500 text-white hover:bg-amber-600" : "bg-white border-2 border-amber-400 text-amber-600 hover:bg-amber-50"}
                  ${isBusy ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                <Coffee className="w-6 h-6" />
                {isOnBreak ? "End Break" : "Break"}
              </button>

              {/* Transfer */}
              <button
                onClick={() => isClockedIn && !isOnBreak && setShowTransfer(true)}
                disabled={isBusy || !isClockedIn || isOnBreak}
                className={`flex flex-col items-center justify-center gap-2 py-6 rounded-2xl font-bold text-sm shadow-md active:scale-95 transition-all duration-200
                  ${isClockedIn && !isOnBreak ? "bg-white border-2 border-blue-500 text-blue-600 hover:bg-blue-50" : "bg-white border-2 border-slate-200 text-slate-300 cursor-not-allowed"}
                  ${isBusy ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                <ArrowRightLeft className="w-6 h-6" />
                Transfer
              </button>
            </div>

            {/* Shift summary */}
            {!isClockedIn && clockOutTask && clockInTask && (
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-2">
                <div className="flex items-center gap-2 mb-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                  <p className="text-sm font-bold text-slate-800">Shift Complete</p>
                </div>
                {[
                  { label: "Start", value: clockInTask.scheduled_time },
                  { label: "End", value: clockOutTask.scheduled_time },
                  { label: "Break", value: fmtDuration(totalBreakMins) },
                  { label: "Net Worked", value: netMins !== null ? fmtDuration(netMins) : "—" },
                ].map((row) => (
                  <div key={row.label} className="flex justify-between text-sm">
                    <span className="text-slate-400">{row.label}</span>
                    <span className="font-semibold text-slate-700">{row.value}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Today's timeline */}
            {timeline.length > 0 && (
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Today's Log</p>
                {timeline.map((t) => <TimelineEntry key={t.id} task={t} />)}
              </div>
            )}
          </>
        )}

        {/* WEEK / HISTORY TABS */}
        {(activeTab === "week" || activeTab === "history") && (
          <WeeklyView tasks={allTasks} mode={activeTab === "week" ? "week" : "history"} />
        )}

        {/* ADMIN TEAM TABS */}
        {activeTab === "team_today" && <TeamTodayView companyId={user?.company_id} />}
        {activeTab === "team_week" && <TeamWeekView companyId={user?.company_id} />}
      </div>

      {/* Modals */}
      {showClockInModal && (
        <ClockInModal enterprises={enterprises} onConfirm={doClockIn} onClose={() => setShowClockInModal(false)} />
      )}
      {showClockOutModal && (
        <ClockOutModal
          clockInTime={clockInTask?.scheduled_time}
          netMins={netMins}
          enterprise={currentEnterprise}
          onConfirm={doClockOut}
          onClose={() => setShowClockOutModal(false)}
        />
      )}
      {showTransfer && (
        <TransferModal enterprises={enterprises} onConfirm={handleTransfer} onClose={() => setShowTransfer(false)} />
      )}

      {toast && <Toast msg={toast.msg} ok={toast.ok} />}
    </div>
  );
}