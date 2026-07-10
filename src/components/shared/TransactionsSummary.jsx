import React from "react";
import { useQuery } from "@tanstack/react-query";
import { ncClient } from "@/api/ncClient";
import { TRANSACTION_SOURCES } from "@/utils/createTransaction";
import { REVENUE_TYPES, EXPENSE_TYPES } from "@/config/transactionTypes";

/**
 * TransactionsSummary — embed in any app to show a live feed
 * of transactions created by that app during the current session.
 *
 * Usage:
 *   <TransactionsSummary
 *     source="medadmin"
 *     enterprise={currentEnterprise?.enterprise_name}
 *     title="Medication Transactions Today"
 *     emptyMessage="No medications dispensed yet"
 *     maxRows={5}
 *   />
 */
export default function TransactionsSummary({
  source,
  enterprise,
  title,
  emptyMessage,
  maxRows = 5,
  currentUser,
}) {
  const { data: fetchedUser = null } = useQuery({
    queryKey: ["currentUser"],
    queryFn: () => ncClient.auth.me(),
    staleTime: 0,
    refetchOnMount: "always",
    enabled: !currentUser,
  });
  const user = currentUser || fetchedUser;

  const { data: transactions = [] } = useQuery({
    queryKey: ["tx-summary", source, enterprise, user?.company_id],
    queryFn: () => {
      const filter = { company_id: user.company_id };
      if (source)     filter.source     = source;
      if (enterprise) filter.enterprise = enterprise;
      return ncClient.entities.Transaction.filter(filter, "-created_date", maxRows * 3);
    },
    enabled: !!user?.company_id,
    staleTime: 0,
    refetchOnMount: "always",
    refetchInterval: 5000,
  });

  const recent = [...transactions]
    .sort((a, b) => new Date(b.created_date) - new Date(a.created_date))
    .slice(0, maxRows);

  if (recent.length === 0) {
    return (
      <div className="text-xs text-slate-400 text-center py-4 italic">
        {emptyMessage || "No transactions yet"}
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {title && (
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
          {title}
        </p>
      )}
      {recent.map((t) => {
        const src        = TRANSACTION_SOURCES[t.source] || TRANSACTION_SOURCES.manual;
        const isRevenue  = REVENUE_TYPES.includes(t.transaction_type);
        const isExpense  = EXPENSE_TYPES.includes(t.transaction_type);
        return (
          <div
            key={t.id}
            className="flex items-center justify-between py-1.5 px-2.5 bg-slate-50 rounded-lg border border-slate-100 text-xs"
          >
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <span>{src.icon}</span>
              <span className="text-slate-700 font-medium truncate max-w-[180px]">
                {t.description || t.transaction_type}
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {t.quantity != null && t.quantity !== 0 && (
                <span className="text-slate-500">
                  {t.quantity > 0 ? "+" : ""}{t.quantity} {t.unit || ""}
                </span>
              )}
              {(t.net_amount || t.amount) > 0 && (
                <span className={`font-semibold ${isRevenue ? "text-emerald-700" : isExpense ? "text-rose-600" : "text-amber-600"}`}>
                  ${(t.net_amount || t.amount || 0).toFixed(2)}
                </span>
              )}
              <span className="text-slate-300 text-[10px]">
                {(t.created_date || "").slice(0, 10)}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}