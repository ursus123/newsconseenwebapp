import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle, AlertCircle, Clock, ArrowLeftRight } from "lucide-react";
import { isToday, isPast, parseISO } from "date-fns";

function SummaryCard({ icon: Icon, label, value, iconBg, iconColor, valueColor, subtitle }) {
  return (
    <Card className="border border-slate-100 rounded-2xl">
      <CardContent className="pt-5 pb-4 px-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">{label}</p>
            <p className={`text-2xl font-black ${valueColor}`}>{value}</p>
            {subtitle && <p className="text-[11px] text-slate-400 mt-1">{subtitle}</p>}
          </div>
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${iconBg}`}>
            <Icon className={`w-5 h-5 ${iconColor}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function TaskSummaryCards({ tasks }) {
  const openCount = tasks.filter((t) => t.status === "open" || t.status === "in_progress").length;

  const overdueCount = tasks.filter((t) => {
    if (!t.due_date) return false;
    return isPast(parseISO(t.due_date)) && t.status !== "completed" && t.status !== "cancelled";
  }).length;

  const completedToday = tasks.filter((t) => {
    if (t.status !== "completed") return false;
    const ref = t.updated_date || t.created_date;
    if (!ref) return false;
    try { return isToday(new Date(ref)); } catch { return false; }
  }).length;

  const triggerToday = tasks.filter((t) => {
    if (!t.trigger_transaction || t.status !== "completed") return false;
    const ref = t.updated_date || t.created_date;
    if (!ref) return false;
    try { return isToday(new Date(ref)); } catch { return false; }
  }).length;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      <SummaryCard icon={Clock} label="Open Tasks" value={openCount} iconBg="bg-blue-100" iconColor="text-blue-600" valueColor="text-blue-700" />
      <SummaryCard icon={AlertCircle} label="Overdue" value={overdueCount} iconBg="bg-rose-100" iconColor="text-rose-600" valueColor={overdueCount > 0 ? "text-rose-600" : "text-slate-500"} />
      <SummaryCard icon={CheckCircle} label="Completed Today" value={completedToday} iconBg="bg-emerald-100" iconColor="text-emerald-600" valueColor="text-emerald-700" />
      <SummaryCard icon={ArrowLeftRight} label="Transactions Today" value={triggerToday} iconBg="bg-violet-100" iconColor="text-violet-600" valueColor="text-violet-700" subtitle="from task completions" />
    </div>
  );
}