import React, { useMemo } from "react";

const REVENUE_TYPES = [
  "service_fee", "tuition", "donation", "tithe", "grant",
  "livestock_sale", "crop_sale", "product_sale", "income",
  "event_income", "membership_fee", "rental_income", "interest_income",
  "sponsorship", "refund_received",
];

const EXPENSE_TYPES = [
  "payroll", "contractor_payment", "rent_expense", "utility_expense",
  "supply_purchase", "equipment_purchase", "feed_purchase", "vet_expense",
  "medication_purchase", "insurance_expense", "tax_payment", "travel_expense",
  "marketing_expense", "other_expense", "ministry_expense",
];

const DAY_MS = 24 * 60 * 60 * 1000;

function fmt(n) {
  if (n >= 1_000_000) return "$" + (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return "$" + (n / 1_000).toFixed(1) + "K";
  return "$" + n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function sumAmount(txns) {
  return txns.reduce((s, t) => s + (t.amount || 0), 0);
}

export default function TransactionsView({ enterprises, transactions, selectedEnterprise }) {
  const visibleEnterprises = useMemo(() => {
    if (selectedEnterprise === "all") return enterprises;
    return enterprises.filter(e => e.id === selectedEnterprise);
  }, [enterprises, selectedEnterprise]);

  const now = new Date();

  const perEnterprise = useMemo(() => {
    return visibleEnterprises.map(e => {
      const name = e.enterprise_name;
      const entTxns = transactions.filter(t => t.enterprise === name || t.company_id === e.id);

      const rev = entTxns.filter(t => REVENUE_TYPES.includes(t.transaction_type));
      const exp = entTxns.filter(t => EXPENSE_TYPES.includes(t.transaction_type));

      const rev30 = rev.filter(t => (now - new Date(t.date || t.created_date)) / DAY_MS <= 30);
      const rev90 = rev.filter(t => (now - new Date(t.date || t.created_date)) / DAY_MS <= 90);

      const outstanding = entTxns.filter(t => t.payment_status === "unpaid" && (t.amount || 0) > 0);
      const paid = rev.filter(t => t.payment_status === "paid" || t.payment_status === "reconciled");
      const collectionRate = rev.length > 0 ? Math.round((paid.length / rev.length) * 100) : null;

      // Revenue by type
      const byType = {};
      rev.forEach(t => {
        const type = t.transaction_type;
        byType[type] = (byType[type] || 0) + (t.amount || 0);
      });

      return {
        enterprise: e,
        name,
        rev30: sumAmount(rev30),
        rev90: sumAmount(rev90),
        revAll: sumAmount(rev),
        expAll: sumAmount(exp),
        outstanding: sumAmount(outstanding),
        outstandingCount: outstanding.length,
        collectionRate,
        byType,
        totalTxns: entTxns.length,
      };
    });
  }, [visibleEnterprises, transactions]);

  if (!enterprises.length) {
    return (
      <div className="flex items-center justify-center h-full text-slate-400">
        <p>No enterprise data available.</p>
      </div>
    );
  }

  return (
    <div className="overflow-y-auto h-full p-4">
      <div className="grid gap-4 max-w-5xl mx-auto">
        {perEnterprise.map(({ enterprise, name, rev30, rev90, revAll, expAll, outstanding, outstandingCount, collectionRate, byType, totalTxns }) => {
          const netAll = revAll - expAll;
          const rateColor = collectionRate === null ? "bg-slate-100 text-slate-500"
            : collectionRate >= 80 ? "bg-emerald-100 text-emerald-700"
            : collectionRate >= 50 ? "bg-amber-100 text-amber-700"
            : "bg-rose-100 text-rose-700";

          return (
            <div key={enterprise.id} className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-bold text-slate-800 text-sm">{name}</h3>
                  {enterprise.enterprise_type && (
                    <p className="text-[10px] text-slate-400 capitalize mt-0.5">{enterprise.enterprise_type.replace(/_/g, " ")}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {collectionRate !== null && (
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${rateColor}`}>
                      {collectionRate}% collected
                    </span>
                  )}
                  {totalTxns === 0 && (
                    <span className="text-xs text-slate-400 italic">No transactions</span>
                  )}
                </div>
              </div>

              {/* Revenue summary cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
                {[
                  { label: "Revenue (30d)", value: fmt(rev30), color: "text-emerald-600" },
                  { label: "Revenue (90d)", value: fmt(rev90), color: "text-emerald-700" },
                  { label: "All-time Revenue", value: fmt(revAll), color: "text-emerald-800" },
                  { label: "Net (all time)", value: fmt(netAll), color: netAll >= 0 ? "text-indigo-600" : "text-rose-600" },
                ].map((s, i) => (
                  <div key={i} className="bg-slate-50 rounded-xl p-3 text-center">
                    <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">{s.label}</p>
                  </div>
                ))}
              </div>

              {/* Outstanding */}
              {outstandingCount > 0 && (
                <div className="flex items-center justify-between bg-amber-50 border border-amber-100 rounded-xl px-4 py-2.5 mb-4">
                  <span className="text-xs text-amber-700 font-semibold">⏳ Outstanding ({outstandingCount})</span>
                  <span className="text-sm font-bold text-amber-800">{fmt(outstanding)}</span>
                </div>
              )}

              {/* Revenue by type */}
              {Object.keys(byType).length > 0 && (
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Revenue by Type</p>
                  <div className="space-y-1.5">
                    {Object.entries(byType)
                      .sort((a, b) => b[1] - a[1])
                      .slice(0, 6)
                      .map(([type, amount]) => {
                        const pct = revAll > 0 ? Math.round((amount / revAll) * 100) : 0;
                        return (
                          <div key={type} className="flex items-center gap-2">
                            <span className="text-[11px] text-slate-600 w-40 truncate capitalize">{type.replace(/_/g, " ")}</span>
                            <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                              <div className="h-full bg-emerald-400 rounded-full" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="text-[10px] text-slate-500 w-16 text-right">{fmt(amount)}</span>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}

              {totalTxns === 0 && (
                <div className="text-center py-4 text-slate-400 text-xs">No transaction records found</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}