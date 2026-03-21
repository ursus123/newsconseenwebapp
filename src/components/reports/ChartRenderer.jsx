import React from "react";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from "recharts";

const SCHEME_COLOR = {
  emerald: "#10b981",
  blue: "#3b82f6",
  purple: "#8b5cf6",
  orange: "#f97316",
  rose: "#f43f5e",
  amber: "#f59e0b",
};

const PIE_COLORS = ["#10b981", "#3b82f6", "#8b5cf6", "#f97316", "#f43f5e", "#f59e0b", "#06b6d4", "#84cc16"];

export default function ChartRenderer({ chart, data, height = 320 }) {
  if (!chart) return null;

  const color = SCHEME_COLOR[chart.color_scheme] || "#10b981";
  const chartData = data || [];
  const xKey = chart.x_axis_key;
  const yKey = chart.y_axis_key;

  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-slate-300 text-xs">
        No data available
      </div>
    );
  }

  if (chart.chart_type === "number") {
    const val = chartData[0]?.[yKey] ?? chartData[0]?.[Object.keys(chartData[0])[0]];
    return (
      <div className="flex flex-col items-center justify-center h-full" style={{ height }}>
        <p className="text-6xl font-black" style={{ color }}>{Number(val ?? 0).toLocaleString()}</p>
        {chart.title && <p className="text-sm text-slate-500 mt-2">{chart.title}</p>}
      </div>
    );
  }

  if (chart.chart_type === "table") {
    const cols = Object.keys(chartData[0] || {});
    return (
      <div className="overflow-auto" style={{ height }}>
        <table className="text-xs w-full">
          <thead>
            <tr>{cols.map((c) => <th key={c} className="text-left py-2 px-3 bg-slate-50 font-semibold text-slate-600 border-b border-slate-200">{c}</th>)}</tr>
          </thead>
          <tbody>
            {chartData.map((row, i) => (
              <tr key={i} className="border-b border-slate-50 hover:bg-slate-50">
                {cols.map((c) => {
                  const val = row[c];
                  const display = val === null || val === undefined
                    ? ""
                    : typeof val === "object"
                    ? JSON.stringify(val)
                    : String(val);
                  return <td key={c} className="py-2 px-3 text-slate-700">{display}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (chart.chart_type === "pie") {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie
            data={chartData}
            dataKey={yKey || Object.keys(chartData[0] || {})[1] || "value"}
            nameKey={xKey || Object.keys(chartData[0] || {})[0] || "name"}
            cx="50%" cy="50%"
            outerRadius={Math.min(height / 2 - 30, 100)}
            label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
          >
            {chartData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
          </Pie>
          <Tooltip />
        </PieChart>
      </ResponsiveContainer>
    );
  }

  if (chart.chart_type === "area") {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={chartData} margin={{ top: 10, right: 20, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="colorGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.3} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis dataKey={xKey} tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip />
          <Area type="monotone" dataKey={yKey} stroke={color} fill="url(#colorGrad)" strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
    );
  }

  if (chart.chart_type === "line") {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={chartData} margin={{ top: 10, right: 20, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis dataKey={xKey} tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip />
          <Line type="monotone" dataKey={yKey} stroke={color} strokeWidth={2.5} dot={{ r: 4, fill: color }} />
        </LineChart>
      </ResponsiveContainer>
    );
  }

  // Default: bar
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={chartData} margin={{ top: 10, right: 20, bottom: 5, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
        <XAxis dataKey={xKey} tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} />
        <Tooltip />
        <Bar dataKey={yKey} fill={color} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}