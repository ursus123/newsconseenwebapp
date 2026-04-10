import { useMemo } from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { subMonths, startOfMonth, format, parseISO } from "date-fns";

export default function PlottableTransactionTimeline({ transactions, isAnalytics, revenueTypes = [] }) {
  const monthlyData = useMemo(() => {
    const now = new Date();
    const months = Array.from({ length: 12 }, (_, i) => {
      const d = startOfMonth(subMonths(now, 11 - i));
      return { date: d, key: format(d, "yyyy-MM"), label: format(d, "MMM yy"), revenue: 0, expense: 0 };
    });
    const byKey = Object.fromEntries(months.map(m => [m.key, m]));

    if (isAnalytics) {
      transactions.forEach(r => {
        const key = r.month?.slice(0, 7) || format(now, "yyyy-MM");
        if (!byKey[key]) return;
        if (revenueTypes.includes(r.transaction_type)) byKey[key].revenue += (r.total_amount || 0);
        else byKey[key].expense += (r.total_amount || 0);
      });
    } else {
      transactions.forEach(t => {
        const raw = t.date || t.created_date;
        if (!raw) return;
        try {
          const key = format(typeof raw === "string" ? parseISO(raw) : new Date(raw), "yyyy-MM");
          if (!byKey[key]) return;
          const amt = Number(t.amount) || 0;
          if (revenueTypes.includes(t.transaction_type)) byKey[key].revenue += amt;
          else byKey[key].expense += amt;
        } catch (_) {}
      });
    }
    return months;
  }, [transactions, isAnalytics, revenueTypes]);

  const hasData = monthlyData.some(m => m.revenue > 0 || m.expense > 0);
  if (!hasData) return null;

  const fmt = v => v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`;

  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-5">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-sm font-semibold text-slate-800">Revenue & Expense Trend</p>
          <p className="text-[10px] text-slate-400">12-month rolling</p>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={monthlyData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#10b981" stopOpacity={0.15} />
              <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#94a3b8" }} tickLine={false} axisLine={false} />
          <YAxis tickFormatter={fmt} tick={{ fontSize: 10, fill: "#94a3b8" }} tickLine={false} axisLine={false} width={48} />
          <Tooltip formatter={(v) => [`$${v.toLocaleString()}`, undefined]} labelStyle={{ fontSize: 11 }} contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 11 }} />
          <Legend iconType="line" iconSize={12} wrapperStyle={{ fontSize: 11 }} />
          <Area type="monotone" dataKey="revenue" name="Revenue" stroke="#10b981" strokeWidth={2.5} fill="url(#revGrad)" dot={false} />
          <Area type="monotone" dataKey="expense" name="Expense" stroke="#f43f5e" strokeWidth={2} fill="none" strokeDasharray="4 3" dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}