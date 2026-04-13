import { useState, useEffect, useMemo, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import {
  Users, Package, ArrowLeftRight, ClipboardList, Building2,
  Clock, CheckCircle, AlertCircle, Calendar, Link2, Wrench,
  TrendingUp, Settings2, Eye, EyeOff, Brain, Shield, Activity,
  ChevronRight, Zap, ScrollText,
} from "lucide-react";
import { format, isToday, isPast, parseISO, subDays, startOfDay, formatDistanceToNow } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import StatCard from "../components/dashboard/StatCard";
import DashboardSyncBanner from "../components/dashboard/DashboardSyncBanner";
import OnboardingChecklist from "../components/dashboard/OnboardingChecklist";
import OverdueTasksAlert from "../components/dashboard/OverdueTasksAlert";
import PendingTransactionsAlert from "../components/dashboard/PendingTransactionsAlert";
import LowStockAlert from "../components/dashboard/LowStockAlert";
import RecentActivityFeed from "../components/dashboard/RecentActivityFeed";
import TodaySchedule from "../components/dashboard/TodaySchedule";
import NotificationsBell from "../components/dashboard/NotificationsBell";
import DataQualityWidget from "../components/dashboard/DataQualityWidget";
import WorkerMyStats from "../components/dashboard/WorkerMyStats";
import ClientRetentionRisk from "../components/dashboard/ClientRetentionRisk";
import StaffingIntelligence from "../components/dashboard/StaffingIntelligence";
import OutcomeDialog from "../components/tasks/OutcomeDialog";
import { taskTypeLabel } from "../components/tasks/TaskForm";
import { useToast } from "@/components/ui/use-toast";
import { useEntityListFn } from "@/components/shared/useDataQuery";
import { useTerminology } from "@/hooks/useTerminology";
import { REVENUE_TYPES } from "@/config/transactionTypes";
import {
  fetchPeopleFallback,
  fetchTasksFallback,
  fetchProductsFallback,
  fetchTransactionsFallback,
} from "@/utils/fetchWithFallback";
import PlottableTransactionTimeline from "../components/dashboard/PlottableTransactionTimeline";
import MLDashboard from "../components/ml/MLDashboard";
import GettingStartedChecklist from "../components/dashboard/GettingStartedChecklist";
import TrendCharts from "../components/dashboard/TrendCharts";
import GeoMap from "../components/dashboard/GeoMap";
import SupersetEmbed from "../components/dashboard/SupersetEmbed";
import N8nEmbed from "../components/dashboard/N8nEmbed";

const RAILWAY_URL = "https://newsconseenwebapp-production.up.railway.app";

// ── Automation Feed ───────────────────────────────────────────────────────────
// Shows recent workflow runs + audit events as a unified activity feed.
function AutomationFeed({ companyId }) {
  const { data: wfRunsData } = useQuery({
    queryKey: ["dash-wf-runs", companyId],
    queryFn: async () => {
      const r = await fetch(`${RAILWAY_URL}/workflows/runs?company_id=${companyId}&limit=8`);
      if (!r.ok) return { runs: [] };
      return r.json();
    },
    enabled:   !!companyId,
    staleTime: 30000,
    retry:     false,
  });

  const { data: auditData } = useQuery({
    queryKey: ["dash-audit-feed", companyId],
    queryFn: async () => {
      const r = await fetch(`${RAILWAY_URL}/audit/log?company_id=${companyId}&limit=8`);
      if (!r.ok) return { entries: [] };
      return r.json();
    },
    enabled:   !!companyId,
    staleTime: 30000,
    retry:     false,
  });

  const wfRuns   = wfRunsData?.runs   || [];
  const audits   = auditData?.entries || [];

  if (wfRuns.length === 0 && audits.length === 0) return null;

  // Merge and sort by time
  const feedItems = [
    ...wfRuns.map(r => ({
      type:    "workflow",
      time:    r.started_at,
      title:   r.workflow_name,
      sub:     `${r.steps_run ?? 0} steps · ${r.trigger_type?.replace(/_/g, " ")}`,
      status:  r.status,
      entity:  r.entity_type,
    })),
    ...audits.map(a => ({
      type:   "audit",
      time:   a.timestamp,
      title:  a.entity_name || a.entity_id || a.entity_type,
      sub:    `${a.entity_type} ${a.action}${a.changed_by ? ` by ${a.changed_by.split("@")[0]}` : ""}`,
      status: a.action,
      entity: a.entity_type,
    })),
  ]
    .filter(i => i.time)
    .sort((a, b) => (b.time > a.time ? 1 : -1))
    .slice(0, 10);

  if (feedItems.length === 0) return null;

  function timeAgo(iso) {
    try {
      return formatDistanceToNow(new Date(iso), { addSuffix: true });
    } catch {
      return "";
    }
  }

  function dot(item) {
    if (item.type === "workflow") {
      if (item.status === "completed") return "bg-emerald-500";
      if (item.status === "completed_with_errors") return "bg-amber-500";
      if (item.status === "error") return "bg-rose-500";
      return "bg-slate-400";
    }
    if (item.status === "created")  return "bg-emerald-400";
    if (item.status === "updated")  return "bg-blue-400";
    if (item.status === "deleted")  return "bg-rose-400";
    return "bg-slate-400";
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-violet-500" />
          <span className="text-sm font-bold text-slate-700">Automation Feed</span>
          <span className="text-[10px] bg-violet-100 text-violet-600 font-bold px-2 py-0.5 rounded-full">
            {feedItems.length} events
          </span>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/Workflows" className="text-[10px] text-violet-500 hover:text-violet-700 font-semibold flex items-center gap-0.5">
            Workflows <ChevronRight className="w-3 h-3" />
          </Link>
          <Link to="/Settings#audit" className="text-[10px] text-slate-400 hover:text-slate-600 font-semibold flex items-center gap-0.5">
            <ScrollText className="w-3 h-3 mr-0.5" />Audit log
          </Link>
        </div>
      </div>
      <div className="space-y-2">
        {feedItems.map((item, i) => (
          <div key={i} className="flex items-start gap-2.5">
            <div className="mt-1.5 shrink-0">
              <span className={`block w-2 h-2 rounded-full ${dot(item)}`} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0 ${
                  item.type === "workflow"
                    ? "bg-violet-100 text-violet-600"
                    : "bg-slate-100 text-slate-500"
                }`}>
                  {item.type === "workflow" ? "WF" : item.entity?.toUpperCase().slice(0, 3) || "AUD"}
                </span>
                <p className="text-xs font-medium text-slate-700 truncate">{item.title}</p>
              </div>
              <p className="text-[10px] text-slate-400 mt-0.5">{item.sub}</p>
            </div>
            <span className="text-[10px] text-slate-300 shrink-0 mt-0.5 whitespace-nowrap">{timeAgo(item.time)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Agent Insight Strip ───────────────────────────────────────────────────────
// Shows latest agent run summaries + pending approval count above stat cards.
// Reads from /agents/status and /agents/runs — falls back gracefully if 404.
function AgentInsightStrip({ companyId }) {
  const { data: statusData } = useQuery({
    queryKey: ["dash-agent-status", companyId],
    queryFn: async () => {
      const r = await fetch(`${RAILWAY_URL}/agents/status?company_id=${companyId}`);
      if (!r.ok) return null;
      return r.json();
    },
    enabled: !!companyId,
    staleTime: 60000,
    retry: false,
  });

  const { data: runsData } = useQuery({
    queryKey: ["dash-agent-runs", companyId],
    queryFn: async () => {
      const r = await fetch(`${RAILWAY_URL}/agents/runs?company_id=${companyId}&limit=5`);
      if (!r.ok) return { runs: [] };
      return r.json();
    },
    enabled: !!companyId,
    staleTime: 60000,
    retry: false,
  });

  // Don't show if agents not configured or no runs yet
  if (!statusData?.agents_enabled) return null;
  const runs = runsData?.runs || [];
  if (runs.length === 0) return null;

  const pendingCount = statusData?.pending_approvals || 0;

  return (
    <div className="bg-gradient-to-r from-indigo-50 to-slate-50 border border-indigo-100 rounded-2xl px-4 py-3">
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-2">
          <Brain className="w-4 h-4 text-indigo-500" />
          <span className="text-xs font-bold text-indigo-700">Autonomous Agents</span>
          {pendingCount > 0 && (
            <Link to="/agents">
              <span className="flex items-center gap-1 text-[10px] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full hover:bg-amber-200 transition-colors">
                <Shield className="w-2.5 h-2.5" />
                {pendingCount} awaiting approval
              </span>
            </Link>
          )}
        </div>
        <Link to="/agents" className="flex items-center gap-0.5 text-[10px] text-indigo-500 hover:text-indigo-700 font-semibold">
          View all <ChevronRight className="w-3 h-3" />
        </Link>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
        {runs.map((run, i) => (
          <div
            key={i}
            className="flex items-center gap-2 shrink-0 bg-white/70 border border-indigo-100 rounded-xl px-3 py-2 min-w-0 max-w-[220px]"
          >
            <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${
              run.status === "completed" ? "bg-emerald-500" :
              run.status === "error"     ? "bg-rose-500" : "bg-amber-500"
            }`} />
            <div className="min-w-0">
              <p className="text-[10px] font-bold text-slate-700 capitalize truncate">
                {run.agent_name?.replace(/_/g, " ")}
              </p>
              {run.summary && (
                <p className="text-[9px] text-slate-500 truncate">{run.summary}</p>
              )}
            </div>
            {run.actions_pending > 0 && (
              <span className="shrink-0 text-[8px] font-bold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">
                {run.actions_pending}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

const PRIORITY_COLOR = {
  low: "bg-slate-100 text-slate-500",
  normal: "bg-blue-50 text-blue-700",
  high: "bg-amber-50 text-amber-700",
  urgent: "bg-rose-50 text-rose-600",
};

function getMotivation(count) {
  if (count === 0) return "All clear today! 🎉";
  if (count <= 3) return "Light day ahead 👍";
  if (count <= 7) return "Busy day — stay focused 💪";
  return "Heavy workload today — prioritize! ⚡";
}

// ── Trend helpers ─────────────────────────────────────────────────────────────
/**
 * Returns integer percent change between current and previous periods.
 * Returns null if previous is 0 (avoids ÷0).
 */
function pctChange(current, previous) {
  if (!previous) return null;
  return Math.round(((current - previous) / previous) * 100);
}

/**
 * Counts transactions matching filter in [startDays, endDays) window.
 * endDays = 0 = today.
 */
function txCountInWindow(transactions, filterFn, startDaysAgo, endDaysAgo = 0) {
  const start = startOfDay(subDays(new Date(), startDaysAgo));
  const end   = startOfDay(subDays(new Date(), endDaysAgo));
  return transactions.filter(t => {
    if (!t.date) return false;
    const d = startOfDay(new Date(t.date));
    return d >= start && d < end && filterFn(t);
  }).length;
}

function taskCountInWindow(tasks, filterFn, startDaysAgo, endDaysAgo = 0) {
  const start = startOfDay(subDays(new Date(), startDaysAgo));
  const end   = startOfDay(subDays(new Date(), endDaysAgo));
  return tasks.filter(t => {
    const d = t.updated_date ? startOfDay(new Date(t.updated_date)) : null;
    return d && d >= start && d < end && filterFn(t);
  }).length;
}

// ── Contextual insights ────────────────────────────────────────────────────────
function peopleInsight(totalPeople, activeStaff, activeClients) {
  if (totalPeople === 0) return "Add your first person to get started.";
  const ratio = activeClients > 0 && activeStaff > 0
    ? (activeClients / activeStaff).toFixed(1)
    : null;
  if (ratio && parseFloat(ratio) > 10)
    return `High client-to-staff ratio (${ratio}:1). Consider capacity.`;
  if (ratio && parseFloat(ratio) < 2)
    return `Staff-heavy (${ratio} clients/staff). Room to grow clientele.`;
  return `${activeStaff} staff serving ${activeClients} active clients.`;
}

function taskInsight(openTasks, overdueCount, totalTasks) {
  if (totalTasks === 0) return "No tasks recorded yet.";
  if (overdueCount > 3) return `${overdueCount} overdue tasks need immediate attention.`;
  if (overdueCount > 0) return `${overdueCount} task${overdueCount > 1 ? "s" : ""} past due — review soon.`;
  if (openTasks === 0) return "No open tasks — great execution!";
  return `${openTasks} task${openTasks > 1 ? "s" : ""} in progress.`;
}

function productInsight(totalProducts, lowStockCount) {
  if (totalProducts === 0) return "No inventory recorded yet.";
  if (lowStockCount > 0) return `${lowStockCount} item${lowStockCount > 1 ? "s" : ""} below reorder level — restock soon.`;
  return "Stock levels all healthy.";
}

function transactionInsight(totalTx, draftTxCount, overdueInvoices) {
  if (totalTx === 0) return "No transactions recorded yet.";
  if (overdueInvoices > 0) return `${overdueInvoices} overdue invoice${overdueInvoices > 1 ? "s" : ""} — follow up now.`;
  if (draftTxCount > 0) return `${draftTxCount} draft${draftTxCount > 1 ? "s" : ""} waiting to be posted.`;
  return "All invoices are up to date.";
}

// ── Personalization ───────────────────────────────────────────────────────────
const ALL_CARDS = ["people", "enterprises", "products", "services", "tasks", "transactions"];
const CARD_LABELS = {
  people:       "People",
  enterprises:  "Enterprises",
  products:     "Inventory",
  services:     "Services",
  tasks:        "Tasks",
  transactions: "Transactions",
};

function loadVisibleCards() {
  try {
    const raw = localStorage.getItem("dashboard_visible_cards");
    if (raw) return new Set(JSON.parse(raw));
  } catch {}
  return new Set(ALL_CARDS);
}

function saveVisibleCards(set) {
  try {
    localStorage.setItem("dashboard_visible_cards", JSON.stringify([...set]));
  } catch {}
}

// ── Card personalizer panel ───────────────────────────────────────────────────
function CardPersonalizer({ visible, onChange }) {
  return (
    <div className="absolute right-0 top-9 z-20 bg-white border border-slate-200 rounded-2xl shadow-lg p-4 w-52">
      <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
        Show / hide cards
      </p>
      <div className="space-y-2">
        {ALL_CARDS.map(key => (
          <label key={key} className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={visible.has(key)}
              onChange={() => {
                const next = new Set(visible);
                next.has(key) ? next.delete(key) : next.add(key);
                onChange(next);
              }}
              className="rounded border-slate-300 text-emerald-500"
            />
            <span className="text-sm text-slate-700">{CARD_LABELS[key]}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

// ── Financial Alerts ──────────────────────────────────────────────────────────
function FinancialAlerts({ transactions }) {
  const overdueTransactions = transactions.filter(t =>
    t.payment_status === "unpaid" &&
    t.status === "posted" &&
    t.due_date &&
    new Date(t.due_date) < new Date() &&
    REVENUE_TYPES.includes(t.transaction_type)
  );
  const draftTransactions = transactions.filter(t => t.status === "draft");
  const overdueTotal = overdueTransactions.reduce((s, t) => s + (t.amount || 0), 0);

  if (overdueTransactions.length === 0 && draftTransactions.length === 0) return null;

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
      <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
        💳 Financial Alerts
      </h3>
      {overdueTransactions.length > 0 && (
        <Link to={createPageUrl("Transactions")}>
          <div className="flex items-center justify-between p-3 bg-rose-50 border border-rose-100 rounded-xl hover:bg-rose-100 transition-colors cursor-pointer">
            <div className="flex items-center gap-2">
              <span className="text-rose-500 text-lg">⚠️</span>
              <div>
                <p className="text-xs font-bold text-rose-700">
                  {overdueTransactions.length} overdue invoice{overdueTransactions.length > 1 ? "s" : ""}
                </p>
                <p className="text-[10px] text-rose-500">
                  ${overdueTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })} outstanding
                </p>
              </div>
            </div>
            <span className="text-xs text-rose-500 font-medium">View →</span>
          </div>
        </Link>
      )}
      {draftTransactions.length > 0 && (
        <Link to={createPageUrl("Transactions")}>
          <div className="flex items-center justify-between p-3 bg-blue-50 border border-blue-100 rounded-xl hover:bg-blue-100 transition-colors cursor-pointer">
            <div className="flex items-center gap-2">
              <span className="text-blue-500 text-lg">📝</span>
              <div>
                <p className="text-xs font-bold text-blue-700">
                  {draftTransactions.length} draft invoice{draftTransactions.length > 1 ? "s" : ""} to review
                </p>
                <p className="text-[10px] text-blue-500">Auto-generated from completed tasks</p>
              </div>
            </div>
            <span className="text-xs text-blue-500 font-medium">Review →</span>
          </div>
        </Link>
      )}
    </div>
  );
}

// ── Enterprise health ─────────────────────────────────────────────────────────
function calcHealthScore(enterprise, tasks, transactions, relationships) {
  let score = 0;
  const PROFILE_FIELDS = [
    "enterprise_name", "short_name", "description", "enterprise_type",
    "phone", "email", "website", "city", "country", "legal_structure",
    "operating_status", "owners",
  ];
  const filled = PROFILE_FIELDS.filter(f => {
    const v = enterprise[f];
    if (Array.isArray(v)) return v.length > 0;
    return v !== undefined && v !== null && v !== "";
  }).length;
  score += Math.round((filled / PROFILE_FIELDS.length) * 30);

  const relCount = relationships.filter(r =>
    r.enterprise_name?.toLowerCase() === (enterprise.enterprise_name || "").toLowerCase() &&
    r.status !== "archived"
  ).length;
  if (relCount >= 3) score += 20; else if (relCount > 0) score += 10;

  const entTasks = tasks.filter(t => t.enterprise === enterprise.enterprise_name);
  const sevenDaysAgo = new Date(); sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const recentDone = entTasks.filter(t =>
    t.status === "completed" && t.updated_date && new Date(t.updated_date) >= sevenDaysAgo
  );
  if (recentDone.length > 0) score += 20;

  const overdueTasks = entTasks.filter(t =>
    t.due_date && t.status !== "completed" && t.status !== "cancelled" &&
    isPast(parseISO(t.due_date))
  );
  if (overdueTasks.length === 0) score += 15;

  const draftTx = transactions.filter(tx =>
    tx.enterprise === enterprise.enterprise_name && (tx.status === "draft" || !tx.status)
  );
  if (draftTx.length === 0) score += 15;

  return Math.min(score, 100);
}

function HealthBadge({ score }) {
  if (score >= 80)
    return <span className="w-9 h-9 rounded-full bg-emerald-100 text-emerald-700 text-xs font-black flex items-center justify-center border-2 border-emerald-300 shrink-0">{score}</span>;
  if (score >= 50)
    return <span className="w-9 h-9 rounded-full bg-amber-100 text-amber-700 text-xs font-black flex items-center justify-center border-2 border-amber-300 shrink-0">{score}</span>;
  return <span className="w-9 h-9 rounded-full bg-rose-100 text-rose-700 text-xs font-black flex items-center justify-center border-2 border-rose-300 shrink-0">{score}</span>;
}

// ── Worker Dashboard ──────────────────────────────────────────────────────────
function WorkerDashboard({ user }) {
  const companyId = user?.company_id;
  const qc = useQueryClient();
  const { toast } = useToast();
  const [outcomeTask, setOutcomeTask] = useState(null);

  const { data: tasks = [] } = useQuery({
    queryKey: ["tasks", companyId, user?.email],
    queryFn: () => companyId
      ? base44.entities.Task.filter({ company_id: companyId, assigned_to_email: user.email }, "-created_date")
      : base44.entities.Task.filter({ assigned_to_email: user?.email }, "-created_date"),
    enabled: !!user,
    staleTime: 0,
    refetchOnMount: "always",
  });

  const { data: taskResult = { data: [], tier: 0, source: "none" } } = useQuery({
    queryKey: ["analytics-tasks-worker", companyId],
    queryFn:  () => fetchTasksFallback(
      companyId,
      () => base44.entities.Task.filter(
        companyId
          ? { company_id: companyId, assigned_to_email: user?.email }
          : { assigned_to_email: user?.email },
        "-created_date"
      )
    ),
    enabled: !!companyId,
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Task.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
  });

  // Aggregate — analytics summaries vs raw/base44 full records
  const isAnalytics    = taskResult.source === "analytics";
  const taskSummary    = isAnalytics ? taskResult.data : [];
  const rawTaskRecords = !isAnalytics ? taskResult.data : tasks;

  const pendingTasks   = isAnalytics
    ? taskSummary.reduce((s, r) => s + (r.open_count     || 0), 0)
    : rawTaskRecords.filter(t => t.status === "open" || t.status === "in_progress").length;
  const overdueTasks   = isAnalytics
    ? taskSummary.reduce((s, r) => s + (r.overdue_count  || 0), 0)
    : rawTaskRecords.filter(t => t.due_date && isPast(parseISO(t.due_date)) && t.status !== "completed").length;
  const completedToday = isAnalytics
    ? taskSummary.reduce((s, r) => s + (r.completed_count || 0), 0)
    : rawTaskRecords.filter(t => t.status === "completed" && t.updated_date && isToday(new Date(t.updated_date))).length;

  const open = tasks.filter(t => t.status === "open" || t.status === "in_progress");
  const recentDone = tasks.filter(t => t.status === "completed").slice(0, 5);

  const handleMarkComplete = (task) => setOutcomeTask(task);
  const handleOutcomeConfirm = ({ outcome, outcome_notes }) => {
    updateMut.mutate({ id: outcomeTask.id, data: { ...outcomeTask, status: "completed", outcome, outcome_notes } });
    toast({ title: "Task marked as completed" });
    setOutcomeTask(null);
  };

  const firstName = user?.full_name?.split(" ")[0] || "";
  const dayOfWeek = format(new Date(), "EEEE, MMMM d");

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">
            Good day{firstName ? `, ${firstName}` : ""}
          </h1>
          <p className="text-sm text-slate-400 mt-0.5">{dayOfWeek}</p>
          <p className="text-sm text-emerald-600 font-medium mt-1">{getMotivation(pendingTasks)}</p>
        </div>
        <NotificationsBell tasks={tasks} transactions={[]} products={[]} currentUser={user} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Link to={createPageUrl("Tasks")}>
          <Card className="p-5 flex items-center gap-4 border-l-4 border-l-blue-400 hover:shadow-md transition-shadow cursor-pointer">
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
              <ClipboardList className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-800">{pendingTasks}</p>
              <p className="text-xs text-slate-400">Open tasks</p>
            </div>
          </Card>
        </Link>
        <Link to={createPageUrl("Tasks")}>
          <Card className={`p-5 flex items-center gap-4 border-l-4 border-l-rose-400 hover:shadow-md transition-shadow cursor-pointer ${overdueTasks > 0 ? "bg-rose-50/30" : ""}`}>
            <div className="w-10 h-10 rounded-xl bg-rose-50 flex items-center justify-center">
              <AlertCircle className="w-5 h-5 text-rose-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-800">{overdueTasks}</p>
              <p className="text-xs text-slate-400">Overdue</p>
            </div>
          </Card>
        </Link>
        <Card className="p-5 flex items-center gap-4 border-l-4 border-l-emerald-400">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
            <CheckCircle className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <p className="text-2xl font-bold text-slate-800">{completedToday}</p>
            <p className="text-xs text-slate-400">Completed today</p>
          </div>
        </Card>
      </div>

      <WorkerMyStats tasks={tasks} />

      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-slate-700">My Open Tasks</h2>
          <Link to={createPageUrl("Tasks")} className="text-xs text-emerald-600 hover:underline font-medium">View all →</Link>
        </div>
        {open.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 border-2 border-dashed border-slate-100 rounded-2xl">
            <CheckCircle className="w-8 h-8 text-emerald-200 mb-2" />
            <p className="text-sm text-slate-400 font-medium">All clear! No open tasks.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {open.map(task => {
              const isOverdue = task.due_date && isPast(parseISO(task.due_date));
              return (
                <Card key={task.id} className={`p-4 border-l-4 ${isOverdue ? "border-l-rose-400" : "border-l-blue-300"}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">{taskTypeLabel(task.task_type)}</p>
                      <p className="text-sm font-medium text-slate-800 mt-0.5">{task.title}</p>
                      {task.enterprise && <p className="text-xs text-slate-400 mt-0.5">{task.enterprise}</p>}
                    </div>
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      <Badge className={PRIORITY_COLOR[task.priority] || PRIORITY_COLOR.normal}>{task.priority}</Badge>
                      {task.due_date && (
                        <span className={`text-[11px] flex items-center gap-1 ${isOverdue ? "text-rose-600" : "text-slate-400"}`}>
                          <Calendar className="w-3 h-3" />
                          {isToday(parseISO(task.due_date)) ? "Today" : format(parseISO(task.due_date), "MMM d")}
                          {task.due_time && ` ${task.due_time}`}
                        </span>
                      )}
                      <Button
                        size="sm"
                        className="h-6 text-[11px] bg-emerald-600 hover:bg-emerald-700 text-white px-2 rounded-lg"
                        onClick={() => handleMarkComplete(task)}
                      >
                        Complete
                      </Button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {recentDone.length > 0 && (
        <div>
          <h2 className="text-base font-semibold text-slate-700 mb-3">Recently Completed</h2>
          <div className="space-y-2">
            {recentDone.map(t => (
              <div key={t.id} className="flex items-center gap-3 bg-slate-50 rounded-xl px-4 py-2.5">
                <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-600 line-through truncate">{t.title}</p>
                </div>
                {t.outcome && <Badge className="bg-emerald-50 text-emerald-600 text-xs">{t.outcome.replace(/_/g, " ")}</Badge>}
                {t.updated_date && <span className="text-[11px] text-slate-400 shrink-0">{format(new Date(t.updated_date), "h:mm a")}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      <OutcomeDialog
        open={!!outcomeTask}
        onClose={() => setOutcomeTask(null)}
        taskTitle={outcomeTask?.title}
        onConfirm={handleOutcomeConfirm}
      />
    </div>
  );
}

// ── Admin Dashboard ───────────────────────────────────────────────────────────
function AdminDashboard({ user }) {
  const listFn   = useEntityListFn(user);
  const companyId = user?.company_id;
  const { t }    = useTerminology(user);
  const qc       = useQueryClient();

  const [showPersonalizer, setShowPersonalizer] = useState(false);
  const [visibleCards, setVisibleCards]         = useState(loadVisibleCards);

  const handleVisibleChange = useCallback((next) => {
    setVisibleCards(next);
    saveVisibleCards(next);
  }, []);

  // ── Visibility handler ──────────────────────────────────────────────────────
  useEffect(() => {
    const fn = () => {
      if (document.visibilityState === "visible") {
        ["enterprises", "services", "tasks-dash", "transactions-dash", "relationships-dash", "people", "products"].forEach(
          key => qc.refetchQueries({ queryKey: [key, companyId] })
        );
      }
    };
    document.addEventListener("visibilitychange", fn);
    return () => document.removeEventListener("visibilitychange", fn);
  }, [qc, companyId]);

  // ── Operational queries ─────────────────────────────────────────────────────
  const { data: enterprises   = [] } = useQuery({ queryKey: ["enterprises",       companyId], queryFn: () => listFn(base44.entities.Enterprise),  staleTime: 0, refetchOnMount: "always" });
  const { data: services      = [] } = useQuery({ queryKey: ["services",           companyId], queryFn: () => listFn(base44.entities.Service),      staleTime: 0, refetchOnMount: "always" });
  const { data: tasks         = [] } = useQuery({ queryKey: ["tasks-dash",         companyId], queryFn: () => listFn(base44.entities.Task),         staleTime: 0, refetchOnMount: "always" });
  const { data: transactions  = [] } = useQuery({ queryKey: ["transactions-dash",  companyId], queryFn: () => listFn(base44.entities.Transaction),  staleTime: 0, refetchOnMount: "always" });
  const { data: relationships = [] } = useQuery({ queryKey: ["relationships-dash", companyId], queryFn: () => listFn(base44.entities.Relationship), staleTime: 0, refetchOnMount: "always" });
  const { data: people        = [] } = useQuery({ queryKey: ["people",             companyId], queryFn: () => listFn(base44.entities.Person),       staleTime: 0, refetchOnMount: "always" });
  const { data: products      = [] } = useQuery({ queryKey: ["products",           companyId], queryFn: () => listFn(base44.entities.Product),      staleTime: 0, refetchOnMount: "always" });

  // ── Analytics queries — 3-tier fallback ────────────────────────────────────
  const analyticsRefetchKeys = ["analytics-people", "analytics-tasks", "analytics-products", "analytics-transactions"];

  const _empty = { data: [], tier: 0, source: "none" };

  const { data: peopleAnalytics      = _empty, isLoading: loadingPeople }   = useQuery({
    queryKey: ["analytics-people",       companyId],
    queryFn:  () => fetchPeopleFallback(companyId,
      () => listFn(base44.entities.Person)),
    enabled: !!companyId,
  });
  const { data: taskAnalytics        = _empty, isLoading: loadingTasks }    = useQuery({
    queryKey: ["analytics-tasks",        companyId],
    queryFn:  () => fetchTasksFallback(companyId,
      () => listFn(base44.entities.Task)),
    enabled: !!companyId,
  });
  const { data: productAnalytics     = _empty, isLoading: loadingProducts } = useQuery({
    queryKey: ["analytics-products",     companyId],
    queryFn:  () => fetchProductsFallback(companyId,
      () => listFn(base44.entities.Product)),
    enabled: !!companyId,
  });
  const { data: transactionAnalytics = _empty, isLoading: loadingTx }       = useQuery({
    queryKey: ["analytics-transactions", companyId],
    queryFn:  () => fetchTransactionsFallback(companyId,
      () => listFn(base44.entities.Transaction)),
    enabled: !!companyId,
  });

  const handleRefreshAnalytics = useCallback(() => {
    analyticsRefetchKeys.forEach(key => qc.invalidateQueries({ queryKey: [key, companyId] }));
  }, [qc, companyId]);

  // ── Aggregations — 3-tier aware ─────────────────────────────────────────────
  // Tier 1 (analytics): pre-aggregated summary rows  → use summary-specific fields
  // Tier 2 (raw) / Tier 3 (base44): full entity records → aggregate client-side
  //
  // NOTE: raw.people and Base44 Person share the same field names, so Tier 2 and
  // Tier 3 use identical aggregation logic — only the source differs.

  const isPeopleAnalytics = peopleAnalytics.source === "analytics";
  const isTaskAnalytics   = taskAnalytics.source   === "analytics";
  const isProdAnalytics   = productAnalytics.source === "analytics";
  const isTxAnalytics     = transactionAnalytics.source === "analytics";

  const peopleSummary      = isPeopleAnalytics ? peopleAnalytics.data      : [];
  const taskSummary        = isTaskAnalytics   ? taskAnalytics.data        : [];
  const productSummary     = isProdAnalytics   ? productAnalytics.data     : [];
  const transactionSummary = isTxAnalytics     ? transactionAnalytics.data : [];

  // Raw / Base44 full records (used when analytics tier unavailable)
  const peopleRecords      = !isPeopleAnalytics ? peopleAnalytics.data      : people;
  const taskRecords        = !isTaskAnalytics   ? taskAnalytics.data        : tasks;
  const productRecords     = !isProdAnalytics   ? productAnalytics.data     : products;
  const txRecords          = !isTxAnalytics     ? transactionAnalytics.data : transactions;

  // People
  const totalPeople   = isPeopleAnalytics
    ? peopleSummary.reduce((s, r) => s + (r.total_count  || 0), 0)
    : peopleRecords.length;
  const activeStaff   = isPeopleAnalytics
    ? peopleSummary.filter(r => r.person_type === "staff").reduce((s, r) => s + (r.active_count || 0), 0)
    : peopleRecords.filter(p => p.person_type === "staff"   && p.status === "active").length;
  const activeClients = isPeopleAnalytics
    ? peopleSummary.filter(r => r.person_type === "client").reduce((s, r) => s + (r.active_count || 0), 0)
    : peopleRecords.filter(p => p.person_type === "client"  && p.status === "active").length;

  // Products
  const totalProducts  = isProdAnalytics
    ? productSummary.reduce((s, r) => s + (r.total_count          || 0), 0)
    : productRecords.length;
  const activeProducts = isProdAnalytics
    ? productSummary.reduce((s, r) => s + (r.active_count         || 0), 0)
    : productRecords.filter(p => p.status === "active").length;
  const lowStockCount  = isProdAnalytics
    ? productSummary.reduce((s, r) => s + (r.items_below_reorder  || 0), 0)
    : productRecords.filter(p => p.min_stock_level > 0 && (p.stock_quantity || 0) <= p.min_stock_level).length;

  // Tasks
  const totalTasks   = isTaskAnalytics
    ? taskSummary.reduce((s, r) => s + (r.total_count    || 0), 0)
    : taskRecords.length;
  const openTasks    = isTaskAnalytics
    ? taskSummary.reduce((s, r) => s + (r.open_count     || 0), 0)
    : taskRecords.filter(t => t.status !== "completed" && t.status !== "cancelled").length;
  const overdueCount = isTaskAnalytics
    ? taskSummary.reduce((s, r) => s + (r.overdue_count  || 0), 0)
    : taskRecords.filter(t => t.due_date && t.status !== "completed" && t.status !== "cancelled" && isPast(parseISO(t.due_date))).length;

  // Transactions
  const totalTransactions  = isTxAnalytics
    ? transactionSummary.reduce((s, r) => s + (r.total_count  || 0), 0)
    : txRecords.length;
  const postedTransactions = isTxAnalytics
    ? transactionSummary.reduce((s, r) => s + (r.posted_count || 0), 0)
    : txRecords.filter(t => t.status === "posted").length;
  const draftTxCount       = isTxAnalytics
    ? transactionSummary.reduce((s, r) => s + (r.draft_count  || 0), 0)
    : txRecords.filter(t => !t.status || t.status === "draft").length;
  const overdueInvoices    = isTxAnalytics
    ? transactionSummary.reduce((s, r) => s + (r.overdue_invoices || 0), 0)
    : txRecords.filter(t =>
        t.payment_status === "unpaid" && t.status === "posted" &&
        t.due_date && new Date(t.due_date) < new Date()
      ).length;

  // ── Trend calculations (30-day vs previous 30-day from Base44 entities) ─────
  const trends = useMemo(() => {
    const isRevenue = t => REVENUE_TYPES.includes(t.transaction_type);
    const isCompleted = t => t.status === "completed";

    const txCurr = txCountInWindow(transactions, isRevenue, 30, 0);
    const txPrev = txCountInWindow(transactions, isRevenue, 60, 30);

    const taskCurr = taskCountInWindow(tasks, isCompleted, 30, 0);
    const taskPrev = taskCountInWindow(tasks, isCompleted, 60, 30);

    return {
      transactions: pctChange(txCurr, txPrev),
      tasks:        pctChange(taskCurr, taskPrev),
      // People and products don't have a natural daily window — skip
      people:       null,
      products:     null,
    };
  }, [transactions, tasks]);

  // ── Onboarding state ────────────────────────────────────────────────────────
  const onboardingDone = {
    enterprise:  enterprises.length > 0,
    person:      people.length > 0,
    product:     totalProducts > 0,
    service:     services.length > 0,
    task:        totalTasks > 0,
    transaction: totalTransactions > 0,
    report:      false,
  };

  const statusColor = {
    active: "bg-emerald-50 text-emerald-700",
    inactive: "bg-slate-100 text-slate-500",
    prospect: "bg-amber-50 text-amber-700",
    archived: "bg-slate-100 text-slate-400",
  };
  const opColor = {
    open: "bg-emerald-400",
    closed: "bg-rose-400",
    temporarily_closed: "bg-amber-400",
    seasonal: "bg-blue-400",
  };

  // ── Sync banner sources ─────────────────────────────────────────────────────
  const syncSources = {
    people:       { label: "People",       tier: peopleAnalytics.tier,      source: peopleAnalytics.source,      loading: loadingPeople },
    tasks:        { label: "Tasks",        tier: taskAnalytics.tier,        source: taskAnalytics.source,        loading: loadingTasks },
    products:     { label: "Inventory",    tier: productAnalytics.tier,     source: productAnalytics.source,     loading: loadingProducts },
    transactions: { label: "Transactions", tier: transactionAnalytics.tier, source: transactionAnalytics.source, loading: loadingTx },
  };

  const loading = loadingPeople || loadingTasks || loadingProducts || loadingTx;

  return (
    <div className="space-y-8">
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Dashboard</h1>
          <p className="text-sm text-slate-400 mt-1">
            Business overview · {format(new Date(), "EEEE, MMMM d, yyyy")}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="relative">
            <button
              onClick={() => setShowPersonalizer(v => !v)}
              className="flex items-center gap-1.5 px-3 py-2 text-sm text-slate-500 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
              title="Customize dashboard"
            >
              <Settings2 className="w-4 h-4" />
              <span className="hidden sm:inline">Customize</span>
            </button>
            {showPersonalizer && (
              <CardPersonalizer
                visible={visibleCards}
                onChange={(next) => { handleVisibleChange(next); setShowPersonalizer(false); }}
              />
            )}
          </div>
          <NotificationsBell tasks={tasks} transactions={transactions} products={products} currentUser={user} />
        </div>
      </div>

      {/* ── Sync banner ── */}
      <DashboardSyncBanner
        sources={syncSources}
        onRefresh={handleRefreshAnalytics}
        isRefreshing={loading}
      />

      <OnboardingChecklist done={onboardingDone} />
      <GettingStartedChecklist />

      {/* ── Automation Feed + Data Quality ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <AutomationFeed companyId={companyId} />
        <DataQualityWidget companyId={companyId} />
      </div>

      {/* ── Agent Insight Strip ── */}
      <AgentInsightStrip companyId={companyId} />

      {/* ── Stat Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
        {visibleCards.has("people") && (
          <StatCard
            title={t("person_plural")}
            value={totalPeople}
            icon={Users}
            color="blue"
            subtitle={`${activeStaff} staff · ${activeClients} clients`}
            loading={loadingPeople && totalPeople === 0}
            trend={trends.people}
            insight={peopleInsight(totalPeople, activeStaff, activeClients)}
            to={createPageUrl("People")}
          />
        )}
        {visibleCards.has("enterprises") && (
          <StatCard
            title="Enterprises"
            value={enterprises.length}
            icon={Building2}
            color="purple"
            subtitle={`${enterprises.filter(e => e.status === "active").length} active`}
            to={createPageUrl("Enterprises")}
          />
        )}
        {visibleCards.has("products") && (
          <StatCard
            title={t("product_plural")}
            value={totalProducts}
            icon={Package}
            color="amber"
            subtitle={lowStockCount > 0 ? `${lowStockCount} low stock` : `${activeProducts} active`}
            subtitleColor={lowStockCount > 0 ? "text-amber-600" : undefined}
            loading={loadingProducts && totalProducts === 0}
            trend={trends.products}
            insight={productInsight(totalProducts, lowStockCount)}
            to={createPageUrl("Products")}
          />
        )}
        {visibleCards.has("services") && (
          <StatCard
            title={t("service_plural")}
            value={services.length}
            icon={Wrench}
            color="teal"
            subtitle={`${services.filter(s => s.status === "active").length} active`}
            to={createPageUrl("Services")}
          />
        )}
        {visibleCards.has("tasks") && (
          <StatCard
            title={t("task_plural")}
            value={totalTasks}
            icon={ClipboardList}
            color="emerald"
            subtitle={overdueCount > 0 ? `${overdueCount} overdue` : `${openTasks} open`}
            subtitleColor={overdueCount > 0 ? "text-rose-600" : undefined}
            loading={loadingTasks && totalTasks === 0}
            trend={trends.tasks}
            trendLabel="completions vs prev 30d"
            insight={taskInsight(openTasks, overdueCount, totalTasks)}
            to={createPageUrl("Tasks")}
          />
        )}
        {visibleCards.has("transactions") && (
          <StatCard
            title={t("transaction_plural")}
            value={totalTransactions}
            icon={ArrowLeftRight}
            color="rose"
            subtitle={draftTxCount > 0 ? `${draftTxCount} pending draft${draftTxCount !== 1 ? "s" : ""}` : `${postedTransactions} posted`}
            subtitleColor={draftTxCount > 0 ? "text-amber-600" : undefined}
            loading={loadingTx && totalTransactions === 0}
            trend={trends.transactions}
            trendLabel="revenue txns vs prev 30d"
            insight={transactionInsight(totalTransactions, draftTxCount, overdueInvoices)}
            to={createPageUrl("Transactions")}
          />
        )}
      </div>

      {/* ── Alerts ── */}
      <div className="space-y-4">
        <OverdueTasksAlert tasks={tasks} overdueCount={overdueCount} />
        <PendingTransactionsAlert
          transactions={transactions}
          draftCount={draftTxCount}
          overdueTransactionCount={overdueInvoices}
        />
        <LowStockAlert products={products} lowStockCount={lowStockCount} />
        <FinancialAlerts transactions={transactions} />
      </div>

      {/* ── 30-Day Trend Charts ── */}
      <TrendCharts companyId={companyId} />

      {/* ── Location Intelligence Map ── */}
      <GeoMap companyId={companyId} />

      {/* ── Advanced Analytics (Superset Embedded) ── */}
      <SupersetEmbed companyId={companyId} />

      {/* ── Workflow Automation (n8n Embedded) ── */}
      <N8nEmbed />

      {/* ── Main 2-col layout ── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-6">
          <TodaySchedule tasks={tasks} />

          {enterprises.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-semibold text-slate-700">Enterprise Health</h2>
                <Link to={createPageUrl("Enterprises")} className="text-xs text-emerald-600 hover:underline font-medium">
                  {enterprises.length > 5 ? "See more →" : "Manage →"}
                </Link>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {enterprises.slice(0, 5).map(e => {
                  const relCount = relationships.filter(r =>
                    r.enterprise_name?.toLowerCase() === (e.enterprise_name || "").toLowerCase() &&
                    r.status !== "archived"
                  ).length;
                  const health = calcHealthScore(e, tasks, transactions, relationships);
                  return (
                    <Link key={e.id} to={createPageUrl("Enterprises")}>
                      <Card className="p-5 hover:shadow-md transition-all hover:-translate-y-0.5 cursor-pointer">
                        <div className="flex items-start justify-between gap-2 mb-3">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center shrink-0">
                              <Building2 className="w-5 h-5 text-purple-500" />
                            </div>
                            <div>
                              <p className="font-semibold text-slate-800 text-sm leading-tight">{e.enterprise_name}</p>
                              {e.short_name && <p className="text-xs text-slate-400">{e.short_name}</p>}
                            </div>
                          </div>
                          <HealthBadge score={health} />
                        </div>
                        {e.enterprise_type && (
                          <p className="text-xs text-slate-500 mb-2 capitalize">{e.enterprise_type.replace(/_/g, " ")}</p>
                        )}
                        {e.city && (
                          <p className="text-xs text-slate-400">📍 {e.city}{e.country ? `, ${e.country}` : ""}</p>
                        )}
                        {e.operating_status && (
                          <div className="mt-2 flex items-center gap-1.5">
                            <span className={`w-2 h-2 rounded-full ${opColor[e.operating_status] || "bg-slate-300"}`} />
                            <span className="text-[11px] text-slate-500 capitalize">{e.operating_status.replace(/_/g, " ")}</span>
                          </div>
                        )}
                        <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between">
                          <div className="text-[11px] text-slate-500 flex items-center gap-1">
                            <Link2 className="w-3.5 h-3.5" />{relCount} relationship{relCount !== 1 ? "s" : ""}
                          </div>
                          <Badge className={statusColor[e.status] || "bg-slate-100 text-slate-500"}>
                            {e.status || "active"}
                          </Badge>
                        </div>
                        <div className="mt-1 text-[10px] font-semibold text-center">
                          {health >= 80
                            ? <span className="text-emerald-600">● Healthy</span>
                            : health >= 50
                            ? <span className="text-amber-600">● Needs Attention</span>
                            : <span className="text-rose-600">● At Risk</span>}
                        </div>
                      </Card>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}
        </div>

      </div>

      {/* ── ML Models — KNIME PMML bridge + sklearn fallbacks ── */}
      <MLDashboard currentUser={user} />

      {/* ── Plottable transaction timeline — brush to zoom into a month ── */}
      <PlottableTransactionTimeline
        transactions={txRecords}
        isAnalytics={isTxAnalytics}
        revenueTypes={REVENUE_TYPES}
      />

      {/* ── Full-width bottom row ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <ClientRetentionRisk people={people} tasks={tasks} currentUser={user} />
        <StaffingIntelligence people={people} enterprises={enterprises} tasks={tasks} currentUser={user} />
        <RecentActivityFeed
          tasks={tasks.slice(0, 10)}
          transactions={transactions.slice(0, 10)}
          enterprises={enterprises.slice(0, 5)}
          people={people.slice(0, 5)}
        />
      </div>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────
export default function Dashboard() {
  const [user, setUser]     = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    base44.auth.me()
      .then(u => { setUser(u); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 text-slate-400">
        <Clock className="w-5 h-5 animate-spin mr-2" /> Loading…
      </div>
    );
  }

  const isAdmin = user?.role === "admin" || user?.role === "super_admin";
  const greeting = user?.week_goal ? `This week: ${user.week_goal}` : null;

  if (isAdmin) return <AdminDashboard user={user} />;
  return <WorkerDashboard user={user} />;
}