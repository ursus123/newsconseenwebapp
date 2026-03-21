import React, { useState, useMemo, useEffect } from "react";
import { X } from "lucide-react";
import {
  BarChart, Bar, LineChart, Line, PieChart as RechartsPie, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import MapChart from "./MapChart";
import { detectChartColumns, safeChartData, safeVal } from "@/components/reports/ChartRenderer";

const COLORS = ["#10b981", "#6366f1", "#f59e0b", "#ef4444", "#06b6d4", "#ec4899", "#84cc16", "#f97316"];

const BASE_CHART_TYPES = [
  { id: "bar",    emoji: "📊", label: "Bar" },
  { id: "line",   emoji: "📈", label: "Line" },
  { id: "pie",    emoji: "🥧", label: "Pie" },
  { id: "table",  emoji: "🗂", label: "Table" },
  { id: "number", emoji: "🔢", label: "Number" },
  { id: "map",    emoji: "🗺", label: "Map" },
];

export default function ResultChart({ results, chartType: externalType, onChartTypeChange, onClose }) {
  const data = safeChartData(results || []);
  const hasLatLon = data.length > 0 && "lat" in data[0] && "lon" in data[0];

  const [internalType, setInternalType] = useState(externalType || "bar");
  const chartType = externalType ?? internalType;

  const setChartType = (t) => {
    setInternalType(t);
    onChartTypeChange?.(t);
  };

  // Auto-switch to map when lat/lon detected
  useEffect(() => {
    if (hasLatLon && chartType === "bar") {
      setChartType("map");
    }
  }, [hasLatLon]);

  const { xKey, yKey, allNumericKeys } = detectChartColumns(data);
  const seriesKeys = allNumericKeys.length > 0 ? allNumericKeys : (yKey ? [yKey] : []);

  const visibleTypes = BASE_CHART_TYPES.filter((t) => t.id !== "map" || hasLatLon);

  const selectCls = "bg-slate-800 border border-white/10 rounded-lg px-2 py-1 text-xs text-slate-300 outline-none focus:border-emerald-500/50";

  const renderChart = () => {
    if (chartType === "map") {
      return (
        <div className="p-4 h-full">
          <MapChart data={results} height={320} />
        </div>
      );
    }

    if (chartType === "table") {
      const cols = data.length ? Object.keys(data[0]) : [];
      return (
        <div className="flex-1 overflow-auto p-2">
          <table className="text-xs w-full">
            <thead>
              <tr>{cols.map((c) => <th key={c} className="text-left py-1.5 px-2 text-slate-500 border-b border-white/10 font-mono">{c}</th>)}</tr>
            </thead>
            <tbody>
              {data.slice(0, 100).map((row, i) => (
                <tr key={i} className="border-b border-white/5 hover:bg-white/5">
                  {cols.map((c) => <td key={c} className="py-1.5 px-2 text-slate-300 font-mono">{safeVal(row[c])}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    if (chartType === "number") {
      const val = data[0]?.[yKey] ?? data[0]?.[Object.keys(data[0] || {})[0]];
      return (
        <div className="flex items-center justify-center flex-1">
          <p className="text-7xl font-black text-emerald-400">{Number(val ?? 0).toLocaleString()}</p>
        </div>
      );
    }

    if (!xKey || seriesKeys.length === 0) {
      return <div className="flex items-center justify-center flex-1 text-slate-600 text-xs font-mono">No numeric columns found</div>;
    }

    return (
      <div className="flex-1 px-4 pb-4" style={{ minHeight: 0 }}>
        <ResponsiveContainer width="100%" height={300}>
          {chartType === "pie" ? (
            <RechartsPie>
              <Pie data={data} dataKey={yKey} nameKey={xKey} cx="50%" cy="50%" outerRadius="70%"
                label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`} labelLine={false}>
                {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip contentStyle={{ background: "#1e293b", border: "1px solid #ffffff10", borderRadius: 8, fontSize: 11 }} />
              <Legend wrapperStyle={{ fontSize: 10, color: "#94a3b8" }} />
            </RechartsPie>
          ) : chartType === "line" ? (
            <LineChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
              <XAxis dataKey={xKey} tick={{ fill: "#64748b", fontSize: 10 }} angle={-30} textAnchor="end" interval={0} />
              <YAxis tick={{ fill: "#64748b", fontSize: 10 }} />
              <Tooltip contentStyle={{ background: "#1e293b", border: "1px solid #ffffff10", borderRadius: 8, fontSize: 11 }} />
              {seriesKeys.length > 1 && <Legend wrapperStyle={{ fontSize: 10, color: "#94a3b8" }} />}
              {seriesKeys.map((key, i) => (
                <Line key={key} type="monotone" dataKey={key} stroke={COLORS[i % COLORS.length]}
                  strokeWidth={2} dot={{ fill: COLORS[i % COLORS.length], r: 3 }} name={key.replace(/_/g, " ")} />
              ))}
            </LineChart>
          ) : (
            // Bar (default)
            <BarChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
              <XAxis dataKey={xKey} tick={{ fill: "#64748b", fontSize: 10 }} angle={-30} textAnchor="end" interval={0} />
              <YAxis tick={{ fill: "#64748b", fontSize: 10 }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ background: "#1e293b", border: "1px solid #ffffff10", borderRadius: 8, fontSize: 11 }} />
              {seriesKeys.length > 1 && <Legend wrapperStyle={{ fontSize: 10, color: "#94a3b8" }} />}
              {seriesKeys.map((key, i) => (
                <Bar key={key} dataKey={key} fill={COLORS[i % COLORS.length]}
                  radius={[4, 4, 0, 0]} name={key.replace(/_/g, " ")} />
              ))}
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-slate-900">
      {/* Toolbar */}
      <div className="shrink-0 flex items-center gap-2 px-4 py-2.5 border-b border-white/5 flex-wrap">
        <div className="flex items-center gap-1 flex-wrap">
          {visibleTypes.map((t) => (
            <button
              key={t.id}
              onClick={() => setChartType(t.id)}
              className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-all ${
                chartType === t.id
                  ? "bg-emerald-600 text-white"
                  : "bg-slate-800 text-slate-400 hover:text-white"
              }`}
            >
              {t.emoji} {t.label}
            </button>
          ))}
        </div>
        <button onClick={onClose} className="p-1 text-slate-500 hover:text-white transition-colors ml-auto">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Chart */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {data.length === 0 ? (
          <div className="flex items-center justify-center flex-1 text-slate-600 text-xs font-mono">No data</div>
        ) : renderChart()}
      </div>
    </div>
  );
}