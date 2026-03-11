import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Users, Package, ArrowLeftRight, ClipboardList, Building2, Clock, CheckCircle, AlertCircle, Calendar } from "lucide-react";
import StatCard from "../components/dashboard/StatCard";
import OnboardingChecklist from "../components/dashboard/OnboardingChecklist";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { format, isToday, isPast, parseISO } from "date-fns";
import { taskTypeLabel } from "../components/tasks/TaskForm";

// ── Worker Dashboard — only shows their tasks ────────────────────────────────
function WorkerDashboard({ user }) {
  const companyId = user?.company_id;
  const { data: tasks = [] } = useQuery({
    queryKey: ["tasks", companyId, user?.email],
    queryFn: () => companyId
      ? base44.entities.Task.filter({ company_id: companyId, assigned_to_email: user.email }, "-created_date")
      : base44.entities.Task.filter({ assigned_to_email: user?.email }, "-created_date"),
    enabled: !!user,
  });

  const myTasks = tasks;
  const open = myTasks.filter((t) => t.status === "open" || t.status === "in_progress");
  const overdue = myTasks.filter((t) => {
    if (!t.due_date) return false;
    return isPast(parseISO(t.due_date)) && t.status !== "completed" && t.status !== "cancelled";
  });
  const doneToday = myTasks.filter((t) => t.status === "completed" && t.updated_date && isToday(new Date(t.updated_date)));

  const PRIORITY_COLOR = {
    low: "bg-slate-100 text-slate-500",
    normal: "bg-blue-50 text-blue-700",
    high: "bg-amber-50 text-amber-700",
    urgent: "bg-rose-50 text-rose-600",
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 tracking-tight">
          Good day{user?.full_name ? `, ${user.full_name.split(" ")[0]}` : ""}
        </h1>
        <p className="text-sm text-slate-400 mt-1">Here's your work summary for today</p>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-5 flex items-center gap-4 border-l-4 border-l-blue-400">
          <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
            <ClipboardList className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <p className="text-2xl font-bold text-slate-800">{open.length}</p>
            <p className="text-xs text-slate-400">Open tasks</p>
          </div>
        </Card>
        <Card className="p-5 flex items-center gap-4 border-l-4 border-l-rose-400">
          <div className="w-10 h-10 rounded-xl bg-rose-50 flex items-center justify-center">
            <AlertCircle className="w-5 h-5 text-rose-600" />
          </div>
          <div>
            <p className="text-2xl font-bold text-slate-800">{overdue.length}</p>
            <p className="text-xs text-slate-400">Overdue</p>
          </div>
        </Card>
        <Card className="p-5 flex items-center gap-4 border-l-4 border-l-emerald-400">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
            <CheckCircle className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <p className="text-2xl font-bold text-slate-800">{doneToday.length}</p>
            <p className="text-xs text-slate-400">Completed today</p>
          </div>
        </Card>
      </div>

      {/* Open task list */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-slate-700">My Open Tasks</h2>
          <Link to={createPageUrl("Tasks")} className="text-xs text-emerald-600 hover:underline font-medium">View all →</Link>
        </div>
        <div className="space-y-3">
          {open.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 border-2 border-dashed border-slate-100 rounded-2xl">
              <CheckCircle className="w-8 h-8 text-emerald-200 mb-2" />
              <p className="text-sm text-slate-400 font-medium">All clear! No open tasks.</p>
            </div>
          ) : (
            open.map((task) => {
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
                    </div>
                  </div>
                </Card>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

// ── Admin Dashboard — full BI overview ───────────────────────────────────────
function AdminDashboard({ user }) {
  const isSuperAdmin = user?.role === "super_admin";
  const companyId = user?.company_id;

  const listFn = (entity) => isSuperAdmin || !companyId
    ? entity.list()
    : entity.filter({ company_id: companyId });

  const { data: people = [] } = useQuery({ queryKey: ["people", companyId], queryFn: () => listFn(base44.entities.Person) });
  const { data: enterprises = [] } = useQuery({ queryKey: ["enterprises", companyId], queryFn: () => listFn(base44.entities.Enterprise) });
  const { data: products = [] } = useQuery({ queryKey: ["products", companyId], queryFn: () => listFn(base44.entities.Product) });
  const { data: services = [] } = useQuery({ queryKey: ["services", companyId], queryFn: () => listFn(base44.entities.Service) });
  const { data: tasks = [] } = useQuery({ queryKey: ["tasks-dash", companyId], queryFn: () => listFn(base44.entities.Task) });

  const onboardingDone = {
    enterprise: enterprises.length > 0,
    person: people.length > 0,
    product: products.length > 0 || services.length > 0,
    task: tasks.length > 0,
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Dashboard</h1>
        <p className="text-sm text-slate-400 mt-1">Business overview — reads master data, relationships, and transactions</p>
      </div>

      <OnboardingChecklist done={onboardingDone} />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
        <StatCard title="People" value={people.length} icon={Users} color="blue" subtitle={`${people.filter(p => p.status === "active").length} active`} />
        <StatCard title="Enterprises" value={enterprises.length} icon={Building2} color="purple" subtitle={`${enterprises.filter(e => e.status === "active").length} active`} />


      </div>

      {/* Enterprise Profiles */}
      {enterprises.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-slate-700">Enterprise Profiles</h2>
            <Link to={createPageUrl("Enterprises")} className="text-xs text-emerald-600 hover:underline font-medium">Manage →</Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {enterprises.map((e) => {
              const statusColor = { active: "bg-emerald-50 text-emerald-700", inactive: "bg-slate-100 text-slate-500", prospect: "bg-amber-50 text-amber-700", archived: "bg-slate-100 text-slate-400" };
              const opColor = { open: "bg-emerald-400", closed: "bg-rose-400", temporarily_closed: "bg-amber-400", seasonal: "bg-blue-400" };
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
                    <Badge className={statusColor[e.status] || "bg-slate-100 text-slate-500"}>{e.status || "active"}</Badge>
                  </div>
                  {e.enterprise_type && (
                    <p className="text-xs text-slate-500 mb-2 capitalize">{e.enterprise_type.replace(/_/g, " ")}</p>
                  )}
                  <div className="space-y-1">
                    {e.city && <p className="text-xs text-slate-400 flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-slate-300 inline-block" />{e.city}{e.country ? `, ${e.country}` : ""}</p>}
                    {e.phone && <p className="text-xs text-slate-400 flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-slate-300 inline-block" />{e.phone}</p>}
                    {e.email && <p className="text-xs text-slate-400 flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-slate-300 inline-block" />{e.email}</p>}
                  </div>
                  {e.operating_status && (
                    <div className="mt-3 flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${opColor[e.operating_status] || "bg-slate-300"}`} />
                      <span className="text-[11px] text-slate-500 capitalize">{e.operating_status.replace(/_/g, " ")}</span>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        </div>
      )}


    </div>
  );
}

// ── Main export — role-aware ─────────────────────────────────────────────────
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