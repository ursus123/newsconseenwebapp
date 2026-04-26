import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Pin, TrendingDown, BarChart2, Database, Brain, LineChart as LineChartIcon } from "lucide-react";
import {
  BarChart, Bar, AreaChart, Area, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";

export const PALETTE = [
  "#10b981","#3b82f6","#f59e0b","#ef4444","#8b5cf6",
  "#06b6d4","#f97316","#84cc16","#ec4899","#14b8a6",
];

export default function DemoChartCard({ config, onAskIdjwi, height = 200 }) {
  const navigate = useNavigate();
  const [pinned, setPinned] = useState(false);

  if (!config) return null;
  const { type, title, data, keys = [], unit = "", _indicator, _countries, _source } = config;

  const TypeIcon = type === "line" || type === "area"
    ? LineChartIcon
    : type === "pie" ? TrendingDown : BarChart2;

  if (!data || data.length === 0) {
    return (
      <div className="mt-3 bg-slate-900 border border-slate-700 rounded-2xl p-4">
        <p className="text-xs text-slate-500">{title || "Chart"} — no data returned.</p>
      </div>
    );
  }

  const fmtTick = v =>
    typeof v !== "number" ? v
    : v >= 1e12 ? `${(v / 1e12).toFixed(1)}T`
    : v >= 1e9  ? `${(v / 1e9).toFixed(1)}B`
    : v >= 1e6  ? `${(v / 1e6).toFixed(1)}M`
    : v >= 1000 ? `${(v / 1000).toFixed(1)}k`
    : v;

  const fmtTip = (v, n) => [
    unit === "$" ? `$${Number(v).toLocaleString()}` : Number(v).toLocaleString(), n,
  ];

  const resolvedKeys = keys.length
    ? keys
    : [{ key: Object.keys(data[0] || {}).find(k => k !== "name") || "value", color: PALETTE[0] }];

  const CHART_STYLE = { background: "#1e293b", border: "1px solid #334155", borderRadius: 8, fontSize: 11 };
  const GRID_STYLE  = { strokeDasharray: "3 3", stroke: "#334155" };
  const TICK_STYLE  = { fontSize: 10, fill: "#94a3b8" };

  const chart = (() => {
    if (type === "line") return (
      <LineChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
        <CartesianGrid {...GRID_STYLE} />
        <XAxis dataKey="name" tick={TICK_STYLE} />
        <YAxis tickFormatter={fmtTick} tick={TICK_STYLE} width={48} />
        <Tooltip formatter={fmtTip} contentStyle={CHART_STYLE} />
        {resolvedKeys.map((k, i) => (
          <Line key={k.key} type="monotone" dataKey={k.key}
            stroke={k.color || PALETTE[i]} strokeWidth={2.5}
            dot={{ r: 3, fill: k.color || PALETTE[i] }}
            activeDot={{ r: 5 }} />
        ))}
        {resolvedKeys.length > 1 && <Legend wrapperStyle={{ fontSize: 10, color: "#94a3b8" }} />}
      </LineChart>
    );
    if (type === "area") return (
      <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
        <defs>{resolvedKeys.map((k, i) => (
          <linearGradient key={k.key} id={`dg-${k.key}-${i}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor={k.color || PALETTE[i]} stopOpacity={0.35} />
            <stop offset="95%" stopColor={k.color || PALETTE[i]} stopOpacity={0} />
          </linearGradient>
        ))}</defs>
        <CartesianGrid {...GRID_STYLE} />
        <XAxis dataKey="name" tick={TICK_STYLE} />
        <YAxis tickFormatter={fmtTick} tick={TICK_STYLE} width={48} />
        <Tooltip formatter={fmtTip} contentStyle={CHART_STYLE} />
        {resolvedKeys.map((k, i) => (
          <Area key={k.key} type="monotone" dataKey={k.key}
            stroke={k.color || PALETTE[i]} fill={`url(#dg-${k.key}-${i})`} strokeWidth={2} />
        ))}
        {resolvedKeys.length > 1 && <Legend wrapperStyle={{ fontSize: 10, color: "#94a3b8" }} />}
      </AreaChart>
    );
    if (type === "pie") return (
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name"
          cx="50%" cy="50%" outerRadius={80} innerRadius={30} paddingAngle={2}
          label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
          {data.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
        </Pie>
        <Tooltip formatter={(v, n) => [Number(v).toLocaleString(), n]} contentStyle={CHART_STYLE} />
        <Legend wrapperStyle={{ fontSize: 10, color: "#94a3b8" }} />
      </PieChart>
    );
    return (
      <BarChart data={data} margin={{ top: 8, right: 12, bottom: data.length > 6 ? 28 : 4, left: 0 }}>
        <CartesianGrid {...GRID_STYLE} />
        <XAxis dataKey="name" tick={{ fontSize: 9, fill: "#94a3b8" }}
          interval={0} angle={data.length > 6 ? -30 : 0}
          textAnchor={data.length > 6 ? "end" : "middle"}
          height={data.length > 6 ? 50 : 20} />
        <YAxis tickFormatter={fmtTick} tick={TICK_STYLE} width={48} />
        <Tooltip formatter={fmtTip} contentStyle={CHART_STYLE} />
        {resolvedKeys.map((k, i) => (
          <Bar key={k.key} dataKey={k.key} fill={k.color || PALETTE[i]} radius={[4, 4, 0, 0]} maxBarSize={48} />
        ))}
        {resolvedKeys.length > 1 && <Legend wrapperStyle={{ fontSize: 10, color: "#94a3b8" }} />}
      </BarChart>
    );
  })();

  const handleQuery = () => {
    const params = new URLSearchParams();
    if (_indicator) params.set("indicator", _indicator);
    if (_countries) params.set("countries", _countries);
    if (title)      params.set("title", title);
    navigate(`/query?${params.toString()}`);
  };

  const handlePin = () => {
    setPinned(true);
    setTimeout(() => navigate("/onboarding"), 1200);
  };

  const handleIdjwi = () => {
    if (onAskIdjwi) onAskIdjwi(`Dive deeper into "${title}" — what are the key drivers and what does this mean for an SME operator?`);
  };

  return (
    <div className="bg-slate-900 border border-slate-700 rounded-2xl overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-700/60">
        <TypeIcon className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
        <span className="text-xs font-semibold text-slate-300 flex-1 truncate">{title}</span>
        {_source && <span className="text-[10px] text-slate-600 shrink-0">{_source}</span>}
      </div>

      <div className="px-3 pt-3 pb-1">
        <ResponsiveContainer width="100%" height={height}>{chart}</ResponsiveContainer>
      </div>

      <div className="flex items-center gap-0 px-3 pb-3 pt-1 border-t border-slate-800/60 mt-2">
        <button onClick={handleQuery}
          className="flex items-center gap-1.5 text-[11px] text-slate-500 hover:text-blue-400 transition-colors px-3 py-1.5 rounded-lg hover:bg-blue-500/10 font-medium">
          <Database className="w-3 h-3" /> Query
        </button>
        <button onClick={handlePin}
          className={`flex items-center gap-1.5 text-[11px] transition-colors px-3 py-1.5 rounded-lg font-medium ${
            pinned ? "text-amber-400 bg-amber-500/10" : "text-slate-500 hover:text-amber-400 hover:bg-amber-500/10"
          }`}>
          <Pin className="w-3 h-3" /> {pinned ? "Signing you up…" : "Pin"}
        </button>
        <button onClick={handleIdjwi}
          className="flex items-center gap-1.5 text-[11px] text-slate-500 hover:text-violet-400 transition-colors px-3 py-1.5 rounded-lg hover:bg-violet-500/10 font-medium">
          <Brain className="w-3 h-3" /> Idjwi
        </button>
      </div>
    </div>
  );
}
