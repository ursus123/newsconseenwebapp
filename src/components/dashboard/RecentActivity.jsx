import React from "react";
import { format } from "date-fns";
import { ArrowUpRight, ArrowDownRight, Clock } from "lucide-react";

export default function RecentActivity({ transactions }) {
  const recent = transactions.slice(0, 8);

  return (
    <div className="bg-white rounded-2xl p-6 border border-slate-100">
      <h3 className="text-sm font-semibold text-slate-800 mb-4">Recent Transactions</h3>
      <div className="space-y-3">
        {recent.length === 0 && (
          <p className="text-sm text-slate-400 py-8 text-center">No transactions yet</p>
        )}
        {recent.map((t) => {
          const isIncome = ["sale", "payment_received"].includes(t.type);
          return (
            <div key={t.id} className="flex items-center gap-3 py-2">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${isIncome ? "bg-emerald-50" : "bg-rose-50"}`}>
                {isIncome ? (
                  <ArrowUpRight className="w-4 h-4 text-emerald-500" />
                ) : (
                  <ArrowDownRight className="w-4 h-4 text-rose-500" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-700 truncate">{t.description || t.type?.replace(/_/g, " ")}</p>
                <p className="text-xs text-slate-400 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {t.date ? format(new Date(t.date), "MMM d, yyyy") : "—"}
                </p>
              </div>
              <span className={`text-sm font-semibold ${isIncome ? "text-emerald-600" : "text-rose-600"}`}>
                {isIncome ? "+" : "-"}${(t.amount || 0).toLocaleString()}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}