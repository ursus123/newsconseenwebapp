import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, addWeeks, subWeeks, addMonths, subMonths } from "date-fns";
import {
  ChevronLeft, ChevronRight, Calendar, CalendarDays, LayoutGrid,
  Copy, CheckCircle2, Printer, Download, Send, Building2
} from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";

import { getWeekDays, formatWeekLabel, parseShiftMeta, todayStr } from "@/components/staffschedule/shiftUtils";

const RAILWAY_URL = "https://newsconseenwebapp-production.up.railway.app";
const RAILWAY_API_KEY = (import.meta["env"] || {})["VITE_RAILWAY_API_KEY"] || "";
const triggerETL = (entity) =>
  fetch(`${RAILWAY_URL}/load/${entity}-summary`, {
    method: "POST",
    headers: RAILWAY_API_KEY ? { "x-api-key": RAILWAY_API_KEY } : {},
  }).catch(() => {});
import WeekView from "@/components/staffschedule/WeekView";
import DayView from "@/components/staffschedule/DayView";
import MonthView from "@/components/staffschedule/MonthView";
import StaffPanel from "@/components/staffschedule/StaffPanel";
import CoverageAlerts from "@/components/staffschedule/CoverageAlerts";
import ShiftModal from "@/components/staffschedule/ShiftModal";
import StaffMySchedule from "@/components/staffschedule/StaffMySchedule";

export default function StaffSchedule() {
  const { data: user = null } = useQuery({
    queryKey: ["currentUser"],
    queryFn: () => base44.auth.me(),
    staleTime: 0,
    refetchOnMount: "always",
  });
  const [baseDate, setBaseDate] = useState(new Date());
  const [view, setView] = useState("week"); // week | day | month
  const [selectedEnterprise, setSelectedEnterprise] = useState("");
  const [highlightedStaff, setHighlightedStaff] = useState(null);
  const [shiftModal, setShiftModal] = useState(null); // { staff, date, task }
  const [copyConfirm, setCopyConfirm] = useState(false);
  const [copyResult, setCopyResult] = useState(null);
  const [publishResult, setPublishResult] = useState(null);
  const qc = useQueryClient();

  const isAdmin = user?.role === "admin" || user?.role === "super_admin";

  // Data queries
  const { data: people = [], isLoading: peopleLoading } = useQuery({
    queryKey: ["sched-people", user?.company_id],
    queryFn: () => base44.entities.Person.filter({ status: "active", company_id: user?.company_id }),
    enabled: !!user,
    staleTime: 0,
    refetchOnMount: "always",
  });

  const { data: enterprises = [] } = useQuery({
    queryKey: ["sched-enterprises", user?.company_id],
    queryFn: () => base44.entities.Enterprise.filter({ status: "active", company_id: user?.company_id }),
    enabled: !!user,
    staleTime: 0,
    refetchOnMount: "always",
  });

  const weekDays = getWeekDays(baseDate);
  const weekStart = format(weekDays[0], "yyyy-MM-dd");
  const weekEnd = format(weekDays[6], "yyyy-MM-dd");

  const { data: shifts = [], isLoading: shiftsLoading } = useQuery({
    queryKey: ["shift-tasks", weekStart, weekEnd, selectedEnterprise, user?.company_id],
    queryFn: () => base44.entities.Task.filter({ task_type: "shift", company_id: user?.company_id }, "-scheduled_date", 500),
    enabled: !!user,
    staleTime: 0,
    refetchOnMount: "always",
  });

  const { data: leaveTasks = [] } = useQuery({
    queryKey: ["leave-tasks-sched", user?.company_id],
    queryFn: () => base44.entities.Task.filter({ task_type: "leave_request", status: "completed", company_id: user?.company_id }, "-scheduled_date", 200),
    enabled: !!user,
    staleTime: 0,
    refetchOnMount: "always",
  });

  const { data: clockTasks = [] } = useQuery({
    queryKey: ["clock-tasks-sched", weekStart, weekEnd, user?.company_id],
    queryFn: () => base44.entities.Task.filter({
      scheduled_date: { $gte: weekStart, $lte: weekEnd },
      company_id: user?.company_id,
    }, "-scheduled_date", 500).then((tasks) => tasks.filter((t) => ["clock_in", "clock_out"].includes(t.task_type))),
    enabled: !!user,
    staleTime: 0,
    refetchOnMount: "always",
  });

  // Filter shifts to current week/month
  const filteredShifts = useMemo(() => {
    return shifts.filter((s) => {
      if (selectedEnterprise && s.enterprise && s.enterprise !== selectedEnterprise) return false;
      // Admins see all; staff see only published or their own
      if (!isAdmin) {
        const meta = parseShiftMeta(s);
        return meta.published || s.assigned_to_email === user?.email;
      }
      return true;
    });
  }, [shifts, selectedEnterprise, isAdmin, user?.email]);

  const weekShifts = filteredShifts.filter((s) => s.scheduled_date >= weekStart && s.scheduled_date <= weekEnd);

  // Copy previous week
  const prevWeekStart = format(getWeekDays(subWeeks(baseDate, 1))[0], "yyyy-MM-dd");
  const prevWeekEnd = format(getWeekDays(subWeeks(baseDate, 1))[6], "yyyy-MM-dd");
  const prevWeekShifts = filteredShifts.filter((s) => s.scheduled_date >= prevWeekStart && s.scheduled_date <= prevWeekEnd);

  const copyMut = useMutation({
    mutationFn: async () => {
      const creates = prevWeekShifts.map((s) => {
        const oldDate = new Date(s.scheduled_date);
        const newDate = new Date(oldDate.getTime() + 7 * 86400000);
        const meta = { ...parseShiftMeta(s), published: false };
        return base44.entities.Task.create({
          ...s,
          id: undefined,
          created_date: undefined,
          updated_date: undefined,
          scheduled_date: format(newDate, "yyyy-MM-dd"),
          outcome_notes: JSON.stringify(meta),
          status: "open",
          outcome: "pending",
        });
      });
      await Promise.all(creates);
      return creates.length;
    },
    onSuccess: (count) => {
      qc.invalidateQueries({ queryKey: ["shift-tasks"] });
      triggerETL("task");
      setCopyConfirm(false);
      setCopyResult(`✅ ${count} shifts copied from last week`);
      setTimeout(() => setCopyResult(null), 4000);
    },
  });

  // Publish all draft shifts for current week
  const publishMut = useMutation({
    mutationFn: async () => {
      const drafts = weekShifts.filter((s) => !parseShiftMeta(s).published);
      await Promise.all(drafts.map((s) => {
        const meta = { ...parseShiftMeta(s), published: true };
        return base44.entities.Task.update(s.id, { outcome_notes: JSON.stringify(meta) });
      }));
      return drafts.length;
    },
    onSuccess: (count) => {
      qc.invalidateQueries({ queryKey: ["shift-tasks"] });
      triggerETL("task");
      setPublishResult(`✅ ${count} shifts published`);
      setTimeout(() => setPublishResult(null), 4000);
    },
  });

  // Publish status
  const draftCount = weekShifts.filter((s) => !parseShiftMeta(s).published).length;
  const isPublished = draftCount === 0 && weekShifts.length > 0;

  const navigate = (dir) => {
    if (view === "month") setBaseDate((d) => dir > 0 ? addMonths(d, 1) : subMonths(d, 1));
    else setBaseDate((d) => dir > 0 ? addWeeks(d, 1) : subWeeks(d, 1));
  };

  const handlePrint = () => window.print();

  const handleCellClick = ({ staff, date }) => {
    if (!isAdmin) return;
    setShiftModal({ staff, date, task: null });
  };
  const handleShiftClick = (task) => {
    setShiftModal({ task, staff: null, date: task.scheduled_date });
  };

  // Staff view for regular users
  if (!isAdmin && user) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3 sticky top-0 z-30">
          <Link to={createPageUrl("Applications")} className="p-2 -ml-2 rounded-lg text-gray-400 hover:bg-gray-100">
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">My Schedule</p>
            <p className="text-sm font-bold text-gray-800">{user?.full_name || user?.email}</p>
          </div>
        </div>
        <StaffMySchedule user={user} shifts={filteredShifts} />
      </div>
    );
  }

  const viewLabel = view === "week" ? formatWeekLabel(baseDate)
    : view === "day" ? format(baseDate, "EEEE, MMMM d, yyyy")
    : format(baseDate, "MMMM yyyy");

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col print:bg-white">
      {/* Top bar */}
      <div className="bg-white border-b border-gray-100 px-4 py-3 sticky top-0 z-30 print:relative">
        <div className="flex items-center gap-2 flex-wrap">
          <Link to={createPageUrl("Applications")} className="p-2 -ml-2 rounded-lg text-gray-400 hover:bg-gray-100 print:hidden">
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest hidden sm:block">Staff Scheduler</p>
            <p className="text-lg font-black text-gray-900 leading-tight">Staff Schedule</p>
          </div>

          {/* Enterprise selector */}
          {enterprises.length > 1 && (
            <div className="flex items-center gap-1.5 px-3 py-2 bg-gray-50 rounded-xl border border-gray-200 text-sm">
              <Building2 className="w-4 h-4 text-gray-400" />
              <select
                value={selectedEnterprise}
                onChange={(e) => setSelectedEnterprise(e.target.value)}
                className="bg-transparent text-sm font-semibold text-gray-700 focus:outline-none"
              >
                <option value="">All Enterprises</option>
                {enterprises.map((e) => <option key={e.id} value={e.enterprise_name}>{e.enterprise_name}</option>)}
              </select>
            </div>
          )}

          {/* Publish status badge */}
          {weekShifts.length > 0 && (
            <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${isPublished ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-amber-50 text-amber-700 border-amber-200"}`}>
              {isPublished ? "✅ Published" : `📝 Draft (${draftCount} unpublished)`}
            </span>
          )}

          {/* Admin actions */}
          {isAdmin && (
            <div className="flex gap-1.5 print:hidden">
              <button onClick={() => setCopyConfirm(true)} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gray-100 text-gray-600 text-xs font-bold hover:bg-gray-200 transition-colors">
                <Copy className="w-3.5 h-3.5" /> Copy Last Week
              </button>
              <button onClick={() => publishMut.mutate()} disabled={isPublished || publishMut.isPending} className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-colors ${isPublished ? "bg-gray-100 text-gray-400 cursor-not-allowed" : "bg-indigo-600 text-white hover:bg-indigo-700"}`}>
                <Send className="w-3.5 h-3.5" /> Publish
              </button>
            </div>
          )}

          <button onClick={handlePrint} className="p-2 rounded-xl bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors print:hidden" title="Print">
            <Printer className="w-4 h-4" />
          </button>
        </div>

        {/* Nav row */}
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          <div className="flex items-center gap-1">
            <button onClick={() => navigate(-1)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <span className="text-sm font-bold text-gray-700 min-w-[180px] text-center">{viewLabel}</span>
            <button onClick={() => navigate(1)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors">
              <ChevronRight className="w-5 h-5" />
            </button>
            <button onClick={() => setBaseDate(new Date())} className="ml-1 px-2.5 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 text-xs font-bold hover:bg-indigo-100">Today</button>
          </div>

          {/* View toggles */}
          <div className="flex gap-1 bg-gray-100 rounded-xl p-1 print:hidden">
            {[
              { key: "week", icon: CalendarDays, label: "Week" },
              { key: "day",  icon: Calendar,     label: "Day" },
              { key: "month",icon: LayoutGrid,   label: "Month" },
            ].map(({ key, icon: Icon, label }) => (
              <button key={key} onClick={() => setView(key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${view === key ? "bg-white text-indigo-700 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
                <Icon className="w-3.5 h-3.5" /> {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Feedback banners */}
      {copyResult && (
        <div className="mx-4 mt-3 flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5 text-sm font-bold text-emerald-700">
          <CheckCircle2 className="w-4 h-4" /> {copyResult}
        </div>
      )}
      {publishResult && (
        <div className="mx-4 mt-3 flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5 text-sm font-bold text-emerald-700">
          <CheckCircle2 className="w-4 h-4" /> {publishResult}
        </div>
      )}

      {/* Coverage alerts */}
      {view === "week" && <CoverageAlerts shifts={weekShifts} baseDate={baseDate} />}

      {/* Main layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Content */}
        <div className="flex-1 overflow-auto">
          {view === "week" && (
            <WeekView
              baseDate={baseDate}
              people={people}
              shifts={weekShifts}
              leaveTasks={leaveTasks}
              clockTasks={clockTasks}
              isAdmin={isAdmin}
              isLoading={shiftsLoading || peopleLoading}
              highlightedStaff={highlightedStaff}
              onCellClick={handleCellClick}
              onShiftClick={handleShiftClick}
            />
          )}
          {view === "day" && (
            <DayView baseDate={baseDate} people={people} shifts={filteredShifts} />
          )}
          {view === "month" && (
            <MonthView
              baseDate={baseDate}
              shifts={filteredShifts}
              onDayClick={(day) => { setBaseDate(day); setView("day"); }}
            />
          )}
        </div>

        {/* Right panel (desktop) */}
        {view === "week" && (
          <div className="hidden lg:flex print:hidden">
            <StaffPanel
              people={people}
              shifts={weekShifts}
              leaveTasks={leaveTasks}
              baseDate={baseDate}
              highlightedStaff={highlightedStaff}
              onHighlight={setHighlightedStaff}
            />
          </div>
        )}
      </div>

      {/* Copy confirm dialog */}
      {copyConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 space-y-4 shadow-2xl">
            <p className="font-black text-gray-900 text-base">Copy Last Week's Schedule?</p>
            <p className="text-sm text-gray-600">
              Copy all {prevWeekShifts.length} shifts from {format(new Date(prevWeekStart), "MMM d")} – {format(new Date(prevWeekEnd), "MMM d")} to {format(new Date(weekStart), "MMM d")} – {format(new Date(weekEnd), "MMM d")}.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setCopyConfirm(false)} className="flex-1 py-3 rounded-2xl border-2 border-gray-200 text-gray-600 font-bold text-sm">Cancel</button>
              <button onClick={() => copyMut.mutate()} disabled={copyMut.isPending} className="flex-1 py-3 rounded-2xl bg-indigo-600 text-white font-bold text-sm hover:bg-indigo-700 disabled:opacity-50">
                {copyMut.isPending ? "Copying…" : "Copy Shifts"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Shift modal */}
      {shiftModal && (
        <ShiftModal
          existingTask={shiftModal.task}
          prefillDate={shiftModal.date}
          prefillStaff={shiftModal.staff}
          people={people}
          enterprises={enterprises}
          weekShifts={weekShifts}
          user={user}
          onClose={() => setShiftModal(null)}
          onSuccess={() => { setShiftModal(null); qc.invalidateQueries({ queryKey: ["shift-tasks"] }); triggerETL("task"); }}
          onAddAnother={() => setShiftModal({ task: null, staff: null, date: shiftModal.date })}
        />
      )}
    </div>
  );
}