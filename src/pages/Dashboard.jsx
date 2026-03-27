import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Users, Package, ArrowLeftRight, ClipboardList, Building2, Clock, CheckCircle, AlertCircle, Calendar, Link2, Wrench, TrendingUp } from "lucide-react";
import { format, isToday, isPast, parseISO, isThisWeek } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import StatCard from "../components/dashboard/StatCard";
import OnboardingChecklist from "../components/dashboard/OnboardingChecklist";
import OverdueTasksAlert from "../components/dashboard/OverdueTasksAlert";
import PendingTransactionsAlert from "../components/dashboard/PendingTransactionsAlert";
import LowStockAlert from "../components/dashboard/LowStockAlert";
import RecentActivityFeed from "../components/dashboard/RecentActivityFeed";
import TodaySchedule from "../components/dashboard/TodaySchedule";
import NotificationsBell from "../components/dashboard/NotificationsBell";
import WorkerMyStats from "../components/dashboard/WorkerMyStats";
import ClientRetentionRisk from "../components/dashboard/ClientRetentionRisk";
import StaffingIntelligence from "../components/dashboard/StaffingIntelligence";
import TransactionsTrendChart from "../components/dashboard/TransactionsTrendChart";
import TaskCompletionChart from "../components/dashboard/TaskCompletionChart";
import StockHealthChart from "../components/dashboard/StockHealthChart";
import OutcomeDialog from "../components/tasks/OutcomeDialog";
import { taskTypeLabel } from "../components/tasks/TaskForm";
import { useToast } from "@/components/ui/use-toast";
import { useEntityListFn } from "@/components/shared/useDataQuery";
import { useTerminology } from "@/hooks/useTerminology";
import { REVENUE_TYPES } from "@/config/transactionTypes";

const RAILWAY_URL = "https://newsconseenwebapp-production.up.railway.app";

const fetchSummary = async (endpoint, companyId) => {
  try {
    const res = await fetch(`${RAILWAY_URL}${endpoint}?company_id=${companyId}`);
    if (!res.ok) return [];
    return await res.json();
  } catch { return []; }
};

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

// ── Worker Dashboard ──────────────────────────────────────────────────────────
function WorkerDashboard({ user }) {
  const companyId = user?.company_id;
  const qc = useQueryClient();
  const { toast } = useToast();
  const [outcomeTask, setOutcomeTask] = useState(null);

  // Operational query — needed for task list rendering, WorkerMyStats, complete action
  const { data: tasks = [] } = useQuery({
    queryKey: ["tasks", companyId, user?.email],
    queryFn: () => companyId
      ? base44.entities.Task.filter({ company_id: companyId, assigned_to_email: user.email }, "-created_date")
      : base44.entities.Task.filter({ assigned_to_email: user?.email }, "-created_date"),
    enabled: !!user,
  });

  // Analytics query — stat card counts come from python_layer (Layer 3 compliance)
  const { data: taskSummary = [] } = useQuery({
    queryKey: ["analytics-tasks-worker", companyId],
    queryFn: () => fetchSummary("/task-summary", companyId),
    enabled: !!companyId,
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Task.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
  });

  // Stat counts from python_layer summary
  const pendingTasks   = taskSummary.reduce((sum, row) => sum + (row.pending_count  || 0), 0);
  const overdueTasks   = taskSummary.reduce((sum, row) => sum + (row.overdue_count  || 0), 0);
  const completedToday = taskSummary.reduce((sum, row) => sum + (row.completed_today || 0), 0);

  // Operational lists for task card rendering
  const open = tasks.filter((t) => t.status === "open" || t.status === "in_progress");
  const recentDone = tasks.filter((t) => t.status === "completed").slice(0, 5);

  const todayOpen = open.filter((t) => t.due_date && isToday(parseISO(t.due_date)));
  const morningTasks = todayOpen.filter((t) => !t.due_time || t.due_time < "12:00");
  const afternoonTasks = todayOpen.filter((t) => t.due_time && t.due_time >= "12:00" && t.due_time < "17:00");
  const eveningTasks = todayOpen.filter((t) => t.due_time && t.due_time >= "17:00");
  const noTimeTasks = open.filter((t) => !t.due_date);

  const handleMarkComplete = (task) => setOutcomeTask(task);

  const handleOutcomeConfirm = ({ outcome, outcome_notes, completed_time }) => {
    updateMut.mutate({ id: outcomeTask.id, data: { ...outcomeTask, status: "completed", outcome, outcome_notes } });
    toast({ title: "Task marked as completed" });
    setOutcomeTask(null);
  };

  const firstName = user?.full_name?.split(" ")[0] || "";
  const dayOfWeek = format(new Date(), "EEEE, MMMM d");

  return (
    <div className="space-y-8">
      {/* Greeting */}
      <div>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 tracking-tight">
              Good day{firstName ? `, ${firstName}` : ""}
            </h1>
            <p className="text-sm text-slate-400 mt-0.5">{dayOfWeek}</p>
            <p className="text-sm text-emerald-600 font-medium mt-1">{getMotivation(pendingTasks)}</p>
          </div>
          <NotificationsBell tasks={tasks} transactions={[]} products={[]} />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-5 flex items-center gap-4 border-l-4 border-l-blue-400">
          <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center"><ClipboardList className="w-5 h-5 text-blue-600" /></div>
          <div><p className="text-2xl font-bold text-slate-800">{pendingTasks}</p><p className="text-xs text-slate-400">Open tasks</p></div>
        </Card>
        <Card className="p-5 flex items-center gap-4 border-l-4 border-l-rose-400">
          <div className="w-10 h-10 rounded-xl bg-rose-50 flex items-center justify-center"><AlertCircle className="w-5 h-5 text-rose-600" /></div>
          <div><p className="text-2xl font-bold text-slate-800">{overdueTasks}</p><p className="text-xs text-slate-400">Overdue</p></div>
        </Card>
        <Card className="p-5 flex items-center gap-4 border-l-4 border-l-emerald-400">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center"><CheckCircle className="w-5 h-5 text-emerald-600" /></div>
          <div><p className="text-2xl font-bold text-slate-800">{completedToday}</p><p className="text-xs text-slate-400">Completed today</p></div>
        </Card>
      </div>

      <WorkerMyStats tasks={tasks} />

      {/* Today's Timeline */}
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
            {open.map((task) => {
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
                      <Button size="sm" className="h-6 text-[11px] bg-emerald-600 hover:bg-emerald-700 text-white px-2 rounded-lg" onClick={() => handleMarkComplete(task)}>
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

      {/* Recent completions */}
      {recentDone.length > 0 && (
        <div>
          <h2 className="text-base font-semibold text-slate-700 mb-3">Recently Completed</h2>
          <div className="space-y-2">
            {recentDone.map((t) => (
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

      <OutcomeDialog open={!!outcomeTask} onClose={() => setOutcomeTask(null)} taskTitle={outcomeTask?.title} onConfirm={handleOutcomeConfirm} />
    </div>
  );
}

// ── Enterprise Health Score ───────────────────────────────────────────────────
function calcHealthScore(enterprise, tasks, transactions, relationships) {
  let score = 0;
  const PROFILE_FIELDS = ["enterprise_name", "short_name", "description", "enterprise_type", "phone", "email", "website", "city", "country", "legal_structure", "operating_status", "owners"];
  const filled = PROFILE_FIELDS.filter((f) => { const v = enterprise[f]; if (Array.isArray(v)) return v.length > 0; return v !== undefined && v !== null && v !== ""; }).length;
  score += Math.round((filled / PROFILE_FIELDS.length) * 30);

  const relCount = relationships.filter((r) => r.enterprise_name?.toLowerCase() === (enterprise.enterprise_name || "").toLowerCase() && r.status !== "archived").length;
  if (relCount >= 3) score += 20;
  else if (relCount > 0) score += 10;

  const entTasks = tasks.filter((t) => t.enterprise === enterprise.enterprise_name);
  const sevenDaysAgo = new Date(); sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const recentDone = entTasks.filter((t) => t.status === "completed" && t.updated_date && new Date(t.updated_date) >= sevenDaysAgo);
  if (recentDone.length > 0) score += 20;

  const overdueTasks = entTasks.filter((t) => t.due_date && t.status !== "completed" && t.status !== "cancelled" && isPast(parseISO(t.due_date)));
  if (overdueTasks.length === 0) score += 15;

  const draftTx = transactions.filter((tx) => tx.enterprise === enterprise.enterprise_name && (tx.status === "draft" || !tx.status));
  if (draftTx.length === 0) score += 15;

  return Math.min(score, 100);
}

function HealthBadge({ score }) {
  if (score >= 80) return <span className="w-9 h-9 rounded-full bg-emerald-100 text-emerald-700 text-xs font-black flex items-center justify-center border-2 border-emerald-300 shrink-0" title="Healthy">{score}</span>;
  if (score >= 50) return <span className="w-9 h-9 rounded-full bg-amber-100 text-amber-700 text-xs font-black flex items-center justify-center border-2 border-amber-300 shrink-0" title="Needs Attention">{score}</span>;
  return <span className="w-9 h-9 rounded-full bg-rose-100 text-rose-700 text-xs font-black flex items-center justify-center border-2 border-rose-300 shrink-0" title="At Risk">{score}</span>;
}

// ── Financial Alerts ─────────────────────────────────────────────────────────
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

// ── Admin Dashboard ───────────────────────────────────────────────────────────
function AdminDashboard({ user }) {
  const listFn = useEntityListFn(user);
  const companyId = user?.company_id;
  const { t } = useTerminology(user);

  // Operational queries — needed for UI rendering (enterprise health cards, alerts, charts, activity feed)
  const { data: enterprises = [] } = useQuery({ queryKey: ["enterprises", companyId], queryFn: () => listFn(base44.entities.Enterprise) });
  const { data: services = [] } = useQuery({ queryKey: ["services", companyId], queryFn: () => listFn(base44.entities.Service) });
  const { data: tasks = [] } = useQuery({ queryKey: ["tasks-dash", companyId], queryFn: () => listFn(base44.entities.Task) });
  const { data: transactions = [] } = useQuery({ queryKey: ["transactions-dash", companyId], queryFn: () => listFn(base44.entities.Transaction) });
  const { data: relationships = [] } = useQuery({ queryKey: ["relationships-dash", companyId], queryFn: () => listFn(base44.entities.Relationship) });
  const { data: people = [] } = useQuery({ queryKey: ["people", companyId], queryFn: () => listFn(base44.entities.Person) });
  // Products kept for operational UI: LowStockAlert (item-level display), StockHealthChart, NotificationsBell
  const { data: products = [] } = useQuery({ queryKey: ["products", companyId], queryFn: () => listFn(base44.entities.Product) });

  // Analytics queries — read from python_layer summaries (Layer 3 compliance)
  const { data: peopleSummary = [] } = useQuery({
    queryKey: ["analytics-people", companyId],
    queryFn: () => fetchSummary("/people-summary", companyId),
    enabled: !!companyId,
  });
  const { data: taskSummary = [] } = useQuery({
    queryKey: ["analytics-tasks", companyId],
    queryFn: () => fetchSummary("/task-summary", companyId),
    enabled: !!companyId,
  });
  const { data: productSummary = [] } = useQuery({
    queryKey: ["analytics-products", companyId],
    queryFn: () => fetchSummary("/product-summary", companyId),
    enabled: !!companyId,
  });
  const { data: transactionSummary = [] } = useQuery({
    queryKey: ["analytics-transactions", companyId],
    queryFn: () => fetchSummary("/transaction-summary", companyId),
    enabled: !!companyId,
  });

  // Aggregations derived from python_layer summaries
  const overdueCount = taskSummary.reduce((sum, row) => sum + (row.overdue_count || 0), 0);
  const lowStockCount = productSummary.reduce((sum, row) => sum + (row.items_below_reorder || 0), 0);
  const draftTxCount = transactionSummary.reduce((sum, row) => sum + (row.draft_count || 0), 0);

  const activeStaff = peopleSummary.filter(row => row.person_type === "staff").reduce((sum, row) => sum + (row.active_count || 0), 0);
  const activeClients = peopleSummary.filter(row => row.person_type === "client").reduce((sum, row) => sum + (row.active_count || 0), 0);
  const totalPeople = peopleSummary.reduce((sum, row) => sum + (row.total_count || 0), 0);
  const totalProducts = productSummary.reduce((sum, row) => sum + (row.total_count || 0), 0);
  const activeProducts = productSummary.reduce((sum, row) => sum + (row.active_count || 0), 0);
  const totalTasks = taskSummary.reduce((sum, row) => sum + (row.total_count || 0), 0);
  const openTasks = taskSummary.reduce((sum, row) => sum + (row.open_count || 0), 0);
  const totalTransactions = transactionSummary.reduce((sum, row) => sum + (row.total_count || 0), 0);
  const postedTransactions = transactionSummary.reduce((sum, row) => sum + (row.posted_count || 0), 0);

  const onboardingDone = {
    enterprise: enterprises.length > 0,
    person: people.length > 0,
    product: totalProducts > 0,
    service: services.length > 0,
    task: totalTasks > 0,
    transaction: totalTransactions > 0,
    report: false, // user must manually confirm
  };

  const statusColor = { active: "bg-emerald-50 text-emerald-700", inactive: "bg-slate-100 text-slate-500", prospect: "bg-amber-50 text-amber-700", archived: "bg-slate-100 text-slate-400" };
  const opColor = { open: "bg-emerald-400", closed: "bg-rose-400", temporarily_closed: "bg-amber-400", seasonal: "bg-blue-400" };

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Dashboard</h1>
          <p className="text-sm text-slate-400 mt-1">Business overview — reads master data, relationships, and transactions</p>
        </div>
        <NotificationsBell tasks={tasks} transactions={transactions} products={products} />
      </div>

      <OnboardingChecklist done={onboardingDone} />

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
        <StatCard title={t("person_plural")} value={totalPeople} icon={Users} color="blue" subtitle={`${activeStaff} staff · ${activeClients} clients`} />
        <StatCard title="Enterprises" value={enterprises.length} icon={Building2} color="purple" subtitle={`${enterprises.filter((e) => e.status === "active").length} active`} />
        <StatCard title={t("product_plural")} value={totalProducts} icon={Package} color="amber"
          subtitle={lowStockCount > 0 ? `${lowStockCount} low stock` : `${activeProducts} active`}
          subtitleColor={lowStockCount > 0 ? "text-amber-600" : undefined}
        />
        <StatCard title={t("service_plural")} value={services.length} icon={Wrench} color="teal" subtitle={`${services.filter((s) => s.status === "active").length} active`} />
        <StatCard title={t("task_plural")} value={totalTasks} icon={ClipboardList} color="emerald"
          subtitle={overdueCount > 0 ? `${overdueCount} overdue` : `${openTasks} open`}
          subtitleColor={overdueCount > 0 ? "text-rose-600" : undefined}
        />
        <StatCard title={t("transaction_plural")} value={totalTransactions} icon={ArrowLeftRight} color="rose"
          subtitle={draftTxCount > 0 ? `${draftTxCount} pending draft${draftTxCount !== 1 ? "s" : ""}` : `${postedTransactions} posted`}
          subtitleColor={draftTxCount > 0 ? "text-amber-600" : undefined}
        />
      </div>

      {/* Alerts */}
      <div className="space-y-4">
        <OverdueTasksAlert tasks={tasks} />
        <PendingTransactionsAlert transactions={transactions} />
        <LowStockAlert products={products} />
        <FinancialAlerts transactions={transactions} />
      </div>

      {/* Performance Trend Charts */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <TaskCompletionChart tasks={tasks} />
        <TransactionsTrendChart transactions={transactions} />
      </div>

      <StockHealthChart products={products} />

      {/* Main 2-col layout */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Left: Enterprise profiles + Today's schedule */}
        <div className="xl:col-span-2 space-y-6">
          <TodaySchedule tasks={tasks} />

          {enterprises.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-semibold text-slate-700">Enterprise Health</h2>
                <Link to={createPageUrl("Enterprises")} className="text-xs text-emerald-600 hover:underline font-medium">Manage →</Link>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {enterprises.map((e) => {
                  const relCount = relationships.filter((r) => r.enterprise_name?.toLowerCase() === (e.enterprise_name || "").toLowerCase() && r.status !== "archived").length;
                  const health = calcHealthScore(e, tasks, transactions, relationships);

                  return (
                    <Card key={e.id} className="p-5 hover:shadow-md transition-shadow">
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
                      {e.enterprise_type && <p className="text-xs text-slate-500 mb-2 capitalize">{e.enterprise_type.replace(/_/g, " ")}</p>}
                      <div className="space-y-1">
                        {e.city && <p className="text-xs text-slate-400">📍 {e.city}{e.country ? `, ${e.country}` : ""}</p>}
                      </div>
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
                        <Badge className={statusColor[e.status] || "bg-slate-100 text-slate-500"}>{e.status || "active"}</Badge>
                      </div>
                      <div className="mt-1 text-[10px] font-semibold text-center">
                        {health >= 80 ? <span className="text-emerald-600">● Healthy</span>
                          : health >= 50 ? <span className="text-amber-600">● Needs Attention</span>
                          : <span className="text-rose-600">● At Risk</span>}
                      </div>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Right: Retention risk + Staffing + Activity feed */}
        <div className="space-y-5">
          <ClientRetentionRisk people={people} tasks={tasks} currentUser={user} />
          <StaffingIntelligence people={people} enterprises={enterprises} tasks={tasks} currentUser={user} />
          <RecentActivityFeed tasks={tasks.slice(0, 10)} transactions={transactions.slice(0, 10)} enterprises={enterprises.slice(0, 5)} people={people.slice(0, 5)} />
        </div>
      </div>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────
export default function Dashboard() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    base44.auth.me().then((u) => { setUser(u); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 text-slate-400">
        <Clock className="w-5 h-5 animate-spin mr-2" /> Loading...
      </div>
    );
  }

  if (user?.role === "admin" || user?.role === "super_admin") return <AdminDashboard user={user} />;
  return <WorkerDashboard user={user} />;
}