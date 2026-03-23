import React from "react";
import { REVENUE_TYPES, EXPENSE_TYPES } from "@/config/transactionTypes";

export default function TransactionsSummary({ transactions, title = "Transactions created", showMax = 3 }) {
  if (!transactions?.length) return null;

  return (
    <div className="mt-4 bg-slate-50 border border-slate-100 rounded-xl p-3">
      <p className="text-xs font-bold text-slate-500 mb-2">
        💳 {title} ({transactions.length})
      </p>
      <div className="space-y-1.5">
        {transactions.slice(0, showMax).map((t, i) => (
          <div key={i} className="flex items-center justify-between text-xs">
            <span className="text-slate-600 truncate flex-1 mr-2">{t.description || t.transaction_type}</span>
            <span className={`font-bold shrink-0 ${
              REVENUE_TYPES.includes(t.transaction_type) ? "text-emerald-600" :
              EXPENSE_TYPES.includes(t.transaction_type) ? "text-rose-500" :
              "text-amber-600"
            }`}>
              ${(t.net_amount || t.amount || 0).toFixed(2)}
            </span>
          </div>
        ))}
        {transactions.length > showMax && (
          <p className="text-[10px] text-slate-400">+{transactions.length - showMax} more...</p>
        )}
      </div>
    </div>
  );
}