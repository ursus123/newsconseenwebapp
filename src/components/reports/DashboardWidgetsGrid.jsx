import React, { useState, useEffect } from "react";
import { executeSQL } from "@/components/querybuilder/sqlEngine";
import {
  BarChart, Bar, PieChart, Pie, Cell,
  LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, RefreshCw, Pin, Trash2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";

const COLORS = [
  "#10b981", "#3b82f6", "#f59e0b", "#ef4444",
  "#8b5cf6", "#06b6d4", "#f97316", "#ec4899",
];

function WidgetCard({ widget }) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const qc = useQueryClient();

  const runQuery = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await executeSQL(widget.sql, {});
      setData(result.rows || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { runQuery(); }, [widget.sql]);

  const handleDelete = async () => {
    await base44.entities.SavedDashboardWidget.delete(widget.id);
    qc.invalidateQueries({ queryKey: ["dashboardWidgets"] });
  };

  const renderChart = () => {
    if (!data?.length) return (
      <div className="flex items-center justify-center h-40 text-slate-400 text-xs">
        No data available
      </div>
    );

    const keys = Object.keys(data[0]);
    const xKey = keys[0];
    const yKey = keys[1] || keys[0];

    if (widget.chart_type === "pie") {
      return (
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie data={data} dataKey={yKey} nameKey={xKey} cx="50%" cy="50%" outerRadius={70}
              label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
              labelLine={false} fontSize={10}>
              {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Pie>
            <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
          </PieChart>
        </ResponsiveContainer>
      );
    }

    if (widget.chart_type === "line") {
      return (
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey={xKey} tick={{ fontSize: 9, fill: "#94a3b8" }} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
            <Line type="monotone" dataKey={yKey} stroke="#10b981" strokeWidth={2} dot={{ fill: "#10b981", r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      );
    }

    if (widget.chart_type === "number") {
      const value = data[0]?.[yKey];
      return (
        <div className="flex items-center justify-center h-40">
          <div className="text-center">
            <p className="text-5xl font-black text-emerald-600">
              {typeof value === "number" ? value.toLocaleString() : value}
            </p>
            <p className="text-sm text-slate-400 mt-2">{yKey.replace(/_/g, " ")}</p>
          </div>
        </div>
      );
    }

    if (widget.chart_type === "table") {
      const cols = Object.keys(data[0]);
      return (
        <div className="overflow-auto max-h-48">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-100">
                {cols.map(c => (
                  <th key={c} className="text-left py-1.5 px-2 text-slate-500 font-semibold uppercase tracking-wider text-[10px]">
                    {c.replace(/_/g, " ")}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.slice(0, 10).map((row, i) => (
                <tr key={i} className={i % 2 === 0 ? "bg-slate-50" : ""}>
                  {cols.map(c => (
                    <td key={c} className="py-1.5 px-2 text-slate-600">{row[c] ?? "—"}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    // Default: bar
    return (
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis dataKey={xKey} tick={{ fontSize: 9, fill: "#94a3b8" }} tickLine={false} />
          <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} tickLine={false} axisLine={false} />
          <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
          <Bar dataKey={yKey} fill="#10b981" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    );
  };

  return (
    <Card className="border border-slate-100 rounded-2xl">
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
          <Pin className="w-3 h-3 text-emerald-500" />
          {widget.title}
        </CardTitle>
        <div className="flex items-center gap-1">
          <button onClick={runQuery} disabled={loading}
            className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
            title="Refresh">
            <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button onClick={handleDelete}
            className="p-1 rounded-lg hover:bg-rose-50 text-slate-400 hover:text-rose-500 transition-colors"
            title="Remove from dashboard">
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 className="w-5 h-5 animate-spin text-slate-300" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-40 gap-2">
            <p className="text-xs text-rose-400">{error}</p>
            <button onClick={runQuery} className="text-xs text-emerald-600 hover:underline">Retry</button>
          </div>
        ) : (
          renderChart()
        )}
        <p className="text-[10px] text-slate-400 mt-2 font-mono truncate">
          {widget.sql?.slice(0, 60)}...
        </p>
      </CardContent>
    </Card>
  );
}

export default function DashboardWidgetsGrid({ widgets }) {
  if (!widgets.length) return null;
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {widgets.map(widget => (
        <WidgetCard key={widget.id} widget={widget} />
      ))}
    </div>
  );
}