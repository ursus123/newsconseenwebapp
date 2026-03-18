import React, { useState, useEffect } from "react";
import { Pin, RefreshCw, Edit2, Trash2, BarChart2, Table2, PieChart, TrendingUp, Hash, AlertCircle } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { executeSQL } from "./sqlEngine";
import { UploadedDataStore } from "./UploadedDataStore";
import { BarChart, Bar, PieChart as RechartsPieChart, Pie, Cell, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

const COLORS = ["#10b981","#3b82f6","#8b5cf6","#f59e0b","#ef4444","#06b6d4","#84cc16"];

function WidgetChart({ chartType, data }) {
  if (!data?.length) return <div className="flex items-center justify-center h-24 text-slate-600 text-[10px]">No data</div>;
  const keys = Object.keys(data[0]);
  const labelKey = keys[0];
  const valueKey = keys.find((k, i) => i > 0 && !isNaN(parseFloat(data[0][k]))) || keys[1];

  if (chartType === "number") {
    const val = data[0]?.[valueKey] ?? data[0]?.[labelKey];
    return (
      <div className="flex items-center justify-center h-20">
        <span className="text-3xl font-black text-emerald-400">{typeof val === "number" ? val.toLocaleString() : val}</span>
      </div>
    );
  }
  if (chartType === "bar") return (
    <ResponsiveContainer width="100%" height={100}>
      <BarChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
        <XAxis dataKey={labelKey} tick={{ fontSize: 8, fill: "#94a3b8" }} />
        <YAxis tick={{ fontSize: 8, fill: "#94a3b8" }} />
        <Tooltip contentStyle={{ background: "#1e293b", border: "none", fontSize: 10 }} />
        <Bar dataKey={valueKey} fill="#10b981" radius={[2, 2, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
  if (chartType === "pie") return (
    <ResponsiveContainer width="100%" height={100}>
      <RechartsPieChart>
        <Pie data={data} dataKey={valueKey} nameKey={labelKey} cx="50%" cy="50%" outerRadius={40}>
          {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
        </Pie>
        <Tooltip contentStyle={{ background: "#1e293b", border: "none", fontSize: 10 }} />
      </RechartsPieChart>
    </ResponsiveContainer>
  );
  if (chartType === "line") return (
    <ResponsiveContainer width="100%" height={100}>
      <LineChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
        <XAxis dataKey={labelKey} tick={{ fontSize: 8, fill: "#94a3b8" }} />
        <YAxis tick={{ fontSize: 8, fill: "#94a3b8" }} />
        <Tooltip contentStyle={{ background: "#1e293b", border: "none", fontSize: 10 }} />
        <Line type="monotone" dataKey={valueKey} stroke="#10b981" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
  // table
  const cols = Object.keys(data[0]);
  return (
    <div className="overflow-auto max-h-28">
      <table className="w-full text-[10px]">
        <thead><tr>{cols.map((c) => <th key={c} className="px-1.5 py-1 text-left text-slate-500 font-mono border-b border-white/5">{c}</th>)}</tr></thead>
        <tbody>{data.slice(0, 8).map((row, i) => (
          <tr key={i} className="border-b border-white/3 hover:bg-white/3">
            {cols.map((c) => <td key={c} className="px-1.5 py-1 text-slate-400 font-mono">{String(row[c] ?? "")}</td>)}
          </tr>
        ))}</tbody>
      </table>
      {data.length > 8 && <p className="text-[9px] text-slate-600 text-center py-1">+{data.length - 8} more rows</p>}
    </div>
  );
}

function WidgetCard({ widget, onEdit, onUnpin, qc }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  const run = async () => {
    setLoading(true); setErr(null);
    try {
      const result = await executeSQL(widget.sql, UploadedDataStore.getAll());
      setData(result.rows);
    } catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { run(); }, [widget.id]);

  const chartIcons = { table: Table2, bar: BarChart2, pie: PieChart, line: TrendingUp, number: Hash };
  const ChartIcon = chartIcons[widget.chart_type] || Table2;

  return (
    <div className="bg-slate-800 border border-white/10 rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-white/5">
        <ChartIcon className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
        <span className="text-xs font-semibold text-slate-200 flex-1 truncate">{widget.title}</span>
        <button onClick={run} disabled={loading} className="p-0.5 text-slate-500 hover:text-white transition-colors" title="Refresh">
          <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
        </button>
        <button onClick={() => onEdit(widget)} className="p-0.5 text-slate-500 hover:text-blue-400 transition-colors" title="Load SQL in editor">
          <Edit2 className="w-3 h-3" />
        </button>
        <button onClick={() => onUnpin(widget.id)} className="p-0.5 text-slate-500 hover:text-rose-400 transition-colors" title="Unpin">
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
      <div className="p-3">
        {loading && <div className="flex items-center justify-center h-16 text-slate-600 text-[10px] animate-pulse">Loading…</div>}
        {err && <div className="flex items-start gap-1 text-rose-400 text-[10px] font-mono"><AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />{err}</div>}
        {!loading && !err && data && <WidgetChart chartType={widget.chart_type} data={data} />}
      </div>
    </div>
  );
}

export default function DashboardWidgetsPanel({ onEditWidget }) {
  const qc = useQueryClient();
  const { data: widgets = [], isLoading } = useQuery({
    queryKey: ["dashboardWidgets"],
    queryFn: () => base44.entities.SavedDashboardWidget.list("-created_date", 100),
  });

  const handleUnpin = async (id) => {
    await base44.entities.SavedDashboardWidget.delete(id);
    qc.invalidateQueries({ queryKey: ["dashboardWidgets"] });
  };

  if (isLoading) return <div className="flex items-center justify-center flex-1 text-slate-600 text-xs font-mono">Loading…</div>;

  if (!widgets.length) return (
    <div className="flex flex-col items-center justify-center flex-1 gap-3 px-6 text-center">
      <Pin className="w-8 h-8 text-slate-700" />
      <p className="text-xs text-slate-600 font-mono leading-relaxed">
        No dashboard widgets yet.<br />Run a query and click 📌 to pin it.
      </p>
    </div>
  );

  return (
    <div className="flex-1 overflow-y-auto p-3">
      <div className="grid grid-cols-1 gap-3">
        {widgets.map((w) => (
          <WidgetCard key={w.id} widget={w} onEdit={onEditWidget} onUnpin={handleUnpin} qc={qc} />
        ))}
      </div>
    </div>
  );
}