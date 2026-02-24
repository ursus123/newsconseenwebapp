import React from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

export default function RevenueChart({ transactions }) {
  const monthlyData = React.useMemo(() => {
    const months = {};
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = d.toLocaleString("default", { month: "short" });
      months[key] = { name: key, income: 0, expense: 0 };
    }

    transactions.forEach((t) => {
      if (!t.date) return;
      const d = new Date(t.date);
      const key = d.toLocaleString("default", { month: "short" });
      if (months[key]) {
        if (["sale", "payment_received"].includes(t.type)) {
          months[key].income += t.amount || 0;
        } else if (["purchase", "expense"].includes(t.type)) {
          months[key].expense += t.amount || 0;
        }
      }
    });

    return Object.values(months);
  }, [transactions]);

  return (
    <div className="bg-white rounded-2xl p-6 border border-slate-100">
      <h3 className="text-sm font-semibold text-slate-800 mb-6">Revenue Overview</h3>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={monthlyData}>
            <defs>
              <linearGradient id="incomeGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.15} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="expenseGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.15} />
                <stop offset="95%" stopColor="#f43f5e" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="name" tick={{ fontSize: 12, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 12, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{
                borderRadius: "12px",
                border: "1px solid #e2e8f0",
                boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.05)",
              }}
            />
            <Area type="monotone" dataKey="income" stroke="#10b981" strokeWidth={2} fill="url(#incomeGrad)" />
            <Area type="monotone" dataKey="expense" stroke="#f43f5e" strokeWidth={2} fill="url(#expenseGrad)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}