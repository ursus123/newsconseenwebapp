import React from "react";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

const expenseData = [
  { month: "Oct", value: 4200 },
  { month: "Nov", value: 5800 },
  { month: "Dec", value: 3900 },
  { month: "Jan", value: 6700 },
  { month: "Feb", value: 7200 },
  { month: "Mar", value: 5400 },
  { month: "Apr", value: 8100 },
];

const stockData = [
  { week: "W1", in: 120, out: 85 },
  { week: "W2", in: 95, out: 110 },
  { week: "W3", in: 160, out: 70 },
  { week: "W4", in: 80, out: 130 },
  { week: "W5", in: 200, out: 95 },
  { week: "W6", in: 140, out: 115 },
];

const taskData = [
  { day: "Mon", completed: 12, open: 5 },
  { day: "Tue", completed: 18, open: 3 },
  { day: "Wed", completed: 9, open: 8 },
  { day: "Thu", completed: 22, open: 2 },
  { day: "Fri", completed: 15, open: 6 },
  { day: "Sat", completed: 7, open: 1 },
];

const CustomTooltip = ({ active, payload, label, prefix = "", suffix = "" }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-slate-800 border border-white/10 rounded-xl px-3 py-2 text-xs shadow-xl">
      <p className="text-slate-400 mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }} className="font-semibold">{p.name}: {prefix}{p.value?.toLocaleString()}{suffix}</p>
      ))}
    </div>
  );
};

export default function TrendChartsSection() {
  return (
    <section className="py-24 bg-slate-900/50">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-14">
          <p className="text-emerald-400 text-xs font-bold tracking-widest uppercase mb-3">Live Operational Overview</p>
          <h2 className="text-4xl font-black text-white mb-4">Trends at a Glance</h2>
          <p className="text-slate-400 text-lg max-w-xl mx-auto">Real-time charts surface what matters — expenses, stock movements, and task velocity — right in your dashboard.</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Expense Trend */}
          <div className="bg-slate-900 border border-white/5 rounded-2xl p-6 hover:border-white/15 transition-all">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-white font-bold text-sm">Expense Claims</h3>
              <span className="text-emerald-400 text-xs font-semibold bg-emerald-500/10 px-2 py-0.5 rounded-full">↑ 18% MoM</span>
            </div>
            <p className="text-slate-500 text-xs mb-5">Monthly spending over 7 months</p>
            <ResponsiveContainer width="100%" height={160}>
              <AreaChart data={expenseData} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
                <defs>
                  <linearGradient id="expenseGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
                <XAxis dataKey="month" tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `$${v/1000}k`} />
                <Tooltip content={<CustomTooltip prefix="$" />} />
                <Area type="monotone" dataKey="value" name="Amount" stroke="#10b981" strokeWidth={2} fill="url(#expenseGrad)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Stock Movement */}
          <div className="bg-slate-900 border border-white/5 rounded-2xl p-6 hover:border-white/15 transition-all">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-white font-bold text-sm">Inventory Movement</h3>
              <span className="text-blue-400 text-xs font-semibold bg-blue-500/10 px-2 py-0.5 rounded-full">Stock In vs Out</span>
            </div>
            <p className="text-slate-500 text-xs mb-5">Weekly stock change by direction</p>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={stockData} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
                <XAxis dataKey="week" tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip suffix=" units" />} />
                <Bar dataKey="in" name="Stock In" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="out" name="Stock Out" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Task Completion */}
          <div className="bg-slate-900 border border-white/5 rounded-2xl p-6 hover:border-white/15 transition-all">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-white font-bold text-sm">Task Completion</h3>
              <span className="text-violet-400 text-xs font-semibold bg-violet-500/10 px-2 py-0.5 rounded-full">Daily Rate</span>
            </div>
            <p className="text-slate-500 text-xs mb-5">Completed vs open tasks per day</p>
            <ResponsiveContainer width="100%" height={160}>
              <AreaChart data={taskData} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
                <defs>
                  <linearGradient id="taskGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
                <XAxis dataKey="day" tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="completed" name="Completed" stroke="#8b5cf6" strokeWidth={2} fill="url(#taskGrad)" dot={false} />
                <Area type="monotone" dataKey="open" name="Open" stroke="#f43f5e" strokeWidth={1.5} fill="none" strokeDasharray="4 2" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <p className="text-center text-slate-600 text-xs mt-6">Sample data for illustration — your live data appears instantly on your dashboard.</p>
      </div>
    </section>
  );
}