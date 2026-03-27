import React from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { FileText } from "lucide-react";
import { REVENUE_TYPES } from "@/config/transactionTypes";

export default function PendingTransactionsAlert({ transactions, draftCount = null, overdueTransactionCount = null }) {
  const drafts = transactions.filter(t => t.status === "draft" || !t.status);
  const overdue = transactions.filter(t =>
    t.payment_status === "unpaid" &&
    t.status === "posted" &&
    t.due_date &&
    new Date(t.due_date) < new Date() &&
    REVENUE_TYPES.includes(t.transaction_type)
  );

  const overdueTotal = overdue.reduce((s, t) => s + (t.amount || 0), 0);
  const headlineDraftCount = draftCount !== null ? draftCount : drafts.length;
  const headlineOverdueCount = overdueTransactionCount !== null ? overdueTransactionCount : overdue.length;

  if (headlineDraftCount === 0 && headlineOverdueCount === 0) return null;

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
      <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
        💳 Financial Alerts
      </h3>

      {headlineOverdueCount > 0 && (
        <Link to={createPageUrl("Transactions")}>
          <div className="flex items-center justify-between p-3 bg-rose-50 border border-rose-100 rounded-xl hover:bg-rose-100 transition-colors cursor-pointer">
            <div className="flex items-center gap-2">
              <span className="text-rose-500 text-lg">⚠️</span>
              <div>
                <p className="text-xs font-bold text-rose-700">
                  {headlineOverdueCount} overdue invoice{headlineOverdueCount > 1 ? "s" : ""}
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

      {headlineDraftCount > 0 && (
        <Link to={createPageUrl("Transactions")}>
          <div className="flex items-center justify-between p-3 bg-blue-50 border border-blue-100 rounded-xl hover:bg-blue-100 transition-colors cursor-pointer">
            <div className="flex items-center gap-2">
              <span className="text-blue-500 text-lg">📝</span>
              <div>
                <p className="text-xs font-bold text-blue-700">
                  {headlineDraftCount} draft invoice{headlineDraftCount > 1 ? "s" : ""} to review
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