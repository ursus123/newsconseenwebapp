import React from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { FileText } from "lucide-react";
import { format } from "date-fns";

export default function PendingTransactionsAlert({ transactions }) {
  const drafts = transactions.filter((t) => t.status === "draft" || !t.status);
  const top5 = drafts.slice(0, 5);

  if (drafts.length === 0) return null;

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50/40 overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3 bg-amber-100/60 border-b border-amber-200">
        <FileText className="w-4 h-4 text-amber-700" />
        <span className="text-sm font-semibold text-amber-700">📋 {drafts.length} transaction{drafts.length !== 1 ? "s" : ""} pending posting</span>
        <Link to={createPageUrl("Transactions")} className="ml-auto text-xs font-semibold text-amber-700 hover:underline">Review Transactions →</Link>
      </div>
      <div className="divide-y divide-amber-100">
        {top5.map((tx) => (
          <div key={tx.id} className="flex items-center gap-3 px-5 py-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-700 capitalize">{(tx.transaction_type || "").replace(/_/g, " ")}</p>
              <p className="text-xs text-slate-400 mt-0.5">{tx.enterprise || "—"}</p>
            </div>
            <div className="text-right shrink-0">
              {tx.amount != null && <p className="text-sm font-semibold text-slate-700">${parseFloat(tx.amount).toLocaleString()}</p>}
              {tx.date && <p className="text-xs text-slate-400">{format(new Date(tx.date), "MMM d")}</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}