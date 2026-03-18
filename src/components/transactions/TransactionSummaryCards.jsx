import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle, TrendingUp, TrendingDown, FileEdit } from "lucide-react";

function SummaryCard({ icon: Icon, label, value, iconBg, iconColor, valueColor }) {
  return (
    <Card className="border border-slate-100 rounded-2xl">
      <CardContent className="pt-5 pb-4 px-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">{label}</p>
            <p className={`text-2xl font-black ${valueColor}`}>{value}</p>
          </div>
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${iconBg}`}>
            <Icon className={`w-5 h-5 ${iconColor}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function TransactionSummaryCards({ transactions }) {
  const totalPosted = transactions.filter((t) => t.status === "posted").length;
  const totalRevenue = transactions
    .filter((t) => t.transaction_type === "sale_service" && t.status === "posted")
    .reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);
  const totalExpenses = transactions
    .filter((t) => t.transaction_type === "expense" && t.status === "posted")
    .reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);
  const pendingDrafts = transactions.filter((t) => t.status === "draft" || !t.status).length;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      <SummaryCard icon={CheckCircle} label="Total Posted" value={totalPosted.toLocaleString()} iconBg="bg-emerald-100" iconColor="text-emerald-600" valueColor="text-emerald-700" />
      <SummaryCard icon={TrendingUp} label="Total Revenue" value={`$${totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`} iconBg="bg-blue-100" iconColor="text-blue-600" valueColor="text-blue-700" />
      <SummaryCard icon={TrendingDown} label="Total Expenses" value={`$${totalExpenses.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`} iconBg="bg-rose-100" iconColor="text-rose-600" valueColor="text-rose-700" />
      <SummaryCard icon={FileEdit} label="Pending Drafts" value={pendingDrafts.toLocaleString()} iconBg="bg-amber-100" iconColor="text-amber-600" valueColor="text-amber-700" />
    </div>
  );
}