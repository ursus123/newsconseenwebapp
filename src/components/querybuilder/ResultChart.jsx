import React, { useState, useMemo } from "react";
import { BarChart2, LineChart as LineIcon, PieChart, X } from "lucide-react";
import {
  BarChart, Bar, LineChart, Line, PieChart as RechartsPie, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";

const COLORS = ["#10b981", "#6366f1", "#f59e0b", "#ef4444", "#06b6d4", "#ec4899", "#84cc16", "#f97316"];

const CHART_TYPES = [
  { key: "bar", label: "Bar", icon: BarChart2 },
  { key: "line", label: "Line", icon: LineIcon },
  { key: "pie", label: "Pie", icon: PieChart },
];

export default function ResultChart({ results, onClose }) {
  const columns = results?.length ? Object.keys(results[0]) : [];
  const numericCols = columns.filter((c) => results.some((r) => typeof r[c] === "number" || (!isNaN(parseFloat(r[c])) && r[c] !== "")));
  const labelCols = columns.filter((c) => !numericCols.includes(c));

  const [chartType, setChartType] = useState("bar");
  const [xCol, setXCol] = useState(labelCols[0] || columns[0] || "");
  const [yCol, setYCol] = useState(numericCols[0] || columns[1] || "");

  const chartData = useMemo(() => {
    if (!xCol || !yCol) return [];
    return results.slice(0, 50).map((r) => ({
      name: String(r[xCol] ?? "").slice(0, 20),
      value: parseFloat(r[yCol]) || 0,
    }));
  }, [results, xCol, yCol]);

  const selectCls = "bg-slate-800 border border-white/10 rounded-lg px-2 py-1 text-xs text-slate-300 outline-none focus:border-emerald-500/50";

  return (
    <div className="flex flex-col h-full bg-slate-900">
      {/* Toolbar */}
      <div className="shrink-0 flex items-center gap-3 px-4 py-2.5 border-b border-white/5 flex-wrap">
        <div className="flex items-center gap-1">
          {CHART_TYPES.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setChartType(key)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs transition-colors ${
                chartType === key ? "bg-emerald-500/20 text-emerald-400" : "text-slate-500 hover:text-slate-300 hover:bg-white/5"
              }`}
            >
              <Icon className="w-3 h-3" /> {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 flex-1">
          <span className="text-[10px] text-slate-600 uppercase tracking-widest">X:</span>
          <select value={xCol} onChange={(e) => setXCol(e.target.value)} className={selectCls}>
            {columns.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <span className="text-[10px] text-slate-600 uppercase tracking-widest">Y:</span>
          <select value={yCol} onChange={(e) => setYCol(e.target.value)} className={selectCls}>
            {columns.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <button onClick={onClose} className="p-1 text-slate-500 hover:text-white transition-colors ml-auto">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Chart */}
      <div className="flex-1 p-4">
        {chartData.length === 0 ? (
          <div className="flex items-center justify-center h-full text-slate-600 text-xs font-mono">Select columns to build chart</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            {chartType === "bar" ? (
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 40 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
                <XAxis dataKey="name" tick={{ fill: "#64748b", fontSize: 10 }} angle={-30} textAnchor="end" interval={0} />
                <YAxis tick={{ fill: "#64748b", fontSize: 10 }} />
                <Tooltip contentStyle={{ background: "#1e293b", border: "1px solid #ffffff10", borderRadius: 8, fontSize: 11 }} />
                <Bar dataKey="value" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            ) : chartType === "line" ? (
              <LineChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 40 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
                <XAxis dataKey="name" tick={{ fill: "#64748b", fontSize: 10 }} angle={-30} textAnchor="end" interval={0} />
                <YAxis tick={{ fill: "#64748b", fontSize: 10 }} />
                <Tooltip contentStyle={{ background: "#1e293b", border: "1px solid #ffffff10", borderRadius: 8, fontSize: 11 }} />
                <Line type="monotone" dataKey="value" stroke="#10b981" strokeWidth={2} dot={{ fill: "#10b981", r: 3 }} />
              </LineChart>
            ) : (
              <RechartsPie margin={{ top: 10, right: 10, left: 10, bottom: 10 }}>
                <Pie data={chartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius="70%" label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`} labelLine={false}>
                  {chartData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ background: "#1e293b", border: "1px solid #ffffff10", borderRadius: 8, fontSize: 11 }} />
                <Legend wrapperStyle={{ fontSize: 10, color: "#94a3b8" }} />
              </RechartsPie>
            )}
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}