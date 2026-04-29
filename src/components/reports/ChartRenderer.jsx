import React from "react";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, LabelList,
} from "recharts";
import MapChart from "@/components/querybuilder/MapChart";
import {
  CHART_COLORS,
  compactNumber,
  formatChartValue,
  shouldShowBarLabels,
  titleize,
} from "@/components/shared/chartUtils";

export function safeVal(val) {
  if (val === null || val === undefined) return "—";
  if (typeof val === "boolean") return val ? "Yes" : "No";
  if (val instanceof Date) return val.toLocaleDateString();
  if (Array.isArray(val)) return val.map((v) => (typeof v === "object" ? JSON.stringify(v) : String(v))).join(", ");
  if (typeof val === "object") return JSON.stringify(val);
  return String(val);
}

export function safeChartData(rawData) {
  if (!Array.isArray(rawData)) return [];
  return rawData.map((row) => {
    const safeRow = {};
    Object.entries(row).forEach(([k, v]) => {
      safeRow[k] = typeof v === "object" && v !== null && !(v instanceof Date) ? JSON.stringify(v) : v;
    });
    return safeRow;
  });
}

export function detectChartColumns(data) {
  if (!data?.length) return { xKey: null, yKey: null, allNumericKeys: [] };
  const keys = Object.keys(data[0]);
  const sample = data.slice(0, 5);

  const numericKeys = keys.filter((k) =>
    sample.every((row) => row[k] !== null && row[k] !== undefined && !isNaN(Number(row[k])))
  );
  const labelKeys = keys.filter((k) => !numericKeys.includes(k));

  const xKey = labelKeys[0] || keys[0];
  const yKey = numericKeys.find((k) => k !== xKey) || numericKeys[0] || keys[1] || keys[0];
  const allNumericKeys = numericKeys.filter((k) => k !== xKey);

  return { xKey, yKey, allNumericKeys };
}

const SCHEME_COLOR = {
  emerald: "#10b981",
  blue: "#3b82f6",
  purple: "#8b5cf6",
  orange: "#f97316",
  rose: "#f43f5e",
  amber: "#f59e0b",
};

const COLORS = CHART_COLORS;

function ChartTooltip({ active, payload, label, chart }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-lg">
      {label !== undefined && <p className="text-[11px] font-bold text-slate-700 mb-1">{titleize(label)}</p>}
      <div className="space-y-1">
        {payload.map((p, i) => (
          <div key={`${p.dataKey}-${i}`} className="flex items-center justify-between gap-5 text-[11px]">
            <span className="flex items-center gap-1.5 text-slate-500">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color || p.fill }} />
              {titleize(p.name || p.dataKey)}
            </span>
            <span className="font-semibold text-slate-800">{formatChartValue(p.value, p.dataKey, chart)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function axisTickFormatter(v) {
  if (typeof v === "number") return compactNumber(v);
  const s = String(v ?? "");
  return s.length > 14 ? `${s.slice(0, 12)}...` : titleize(s);
}

function valueLabelFormatter(v, key, chart) {
  return formatChartValue(v, key, chart);
}

export default function ChartRenderer({ chart, data, height = 320 }) {
  if (!chart) return null;

  const color = SCHEME_COLOR[chart.color_scheme] || "#10b981";
  const rawData = data || [];

  if (rawData.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-slate-300 text-xs">
        No data available
      </div>
    );
  }

  const chartData = safeChartData(rawData);

  // Auto-detect columns, but prefer saved x/y keys from chart config
  const { xKey: detectedX, yKey: detectedY, allNumericKeys } = detectChartColumns(chartData);
  const xKey = chart.x_axis_key || detectedX;
  const yKey = chart.y_axis_key || detectedY;

  // Map detection
  const hasLatLon = "lat" in (chartData[0] || {}) && "lon" in (chartData[0] || {});
  if (chart.chart_type === "map" || hasLatLon) {
    return <MapChart data={rawData} height={height} />;
  }

  if (chart.chart_type === "number") {
    const val = chartData[0]?.[yKey] ?? chartData[0]?.[Object.keys(chartData[0])[0]];
    return (
      <div className="flex flex-col items-center justify-center h-full" style={{ height }}>
        <p className="text-6xl font-black" style={{ color }}>{formatChartValue(val ?? 0, yKey, chart)}</p>
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
                {cols.map((c) => (
                  <td key={c} className="py-2 px-3 text-slate-700">{safeVal(row[c])}</td>
                ))}
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
            dataKey={yKey}
            nameKey={xKey}
            cx="50%" cy="50%"
            outerRadius={Math.min(height / 2 - 30, 100)}
            label={({ name, percent }) => percent >= 0.06 ? `${titleize(name)} ${(percent * 100).toFixed(0)}%` : ""}
            labelLine={false}
          >
            {chartData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
          </Pie>
          <Tooltip content={<ChartTooltip chart={chart} />} />
          <Legend formatter={(value) => titleize(value)} />
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
          <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
          <XAxis dataKey={xKey} tick={{ fontSize: 11 }} tickFormatter={axisTickFormatter} tickLine={false} />
          <YAxis tick={{ fontSize: 11 }} tickFormatter={compactNumber} tickLine={false} axisLine={false} />
          <Tooltip content={<ChartTooltip chart={chart} />} />
          <Area type="monotone" dataKey={yKey} stroke={color} fill="url(#colorGrad)" strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
    );
  }

  if (chart.chart_type === "line") {
    const seriesKeys = allNumericKeys.length > 0 ? allNumericKeys : [yKey];
    return (
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={chartData} margin={{ top: 10, right: 20, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
          <XAxis dataKey={xKey} tick={{ fontSize: 11 }} tickFormatter={axisTickFormatter} tickLine={false} />
          <YAxis tick={{ fontSize: 11 }} tickFormatter={compactNumber} tickLine={false} axisLine={false} />
          <Tooltip content={<ChartTooltip chart={chart} />} />
          {seriesKeys.length > 1 && <Legend formatter={(value) => titleize(value)} />}
          {seriesKeys.map((key, i) => (
            <Line key={key} type="monotone" dataKey={key} stroke={COLORS[i % COLORS.length]}
              strokeWidth={2.5} dot={{ r: 3, fill: COLORS[i % COLORS.length] }}
              activeDot={{ r: 5 }}
              name={titleize(key)} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    );
  }

  // Default: bar — support multiple numeric series
  const seriesKeys = allNumericKeys.length > 0 ? allNumericKeys : [yKey];
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={chartData} margin={{ top: 16, right: 20, bottom: 5, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
        <XAxis dataKey={xKey} tick={{ fontSize: 10 }} tickFormatter={axisTickFormatter} tickLine={false} />
        <YAxis tick={{ fontSize: 10 }} tickFormatter={compactNumber} tickLine={false} axisLine={false} />
        <Tooltip content={<ChartTooltip chart={chart} />} />
        {seriesKeys.length > 1 && <Legend formatter={(value) => titleize(value)} />}
        {seriesKeys.map((key, i) => (
          <Bar key={key} dataKey={key} fill={COLORS[i % COLORS.length]}
            radius={[5, 5, 0, 0]} name={titleize(key)}>
            {shouldShowBarLabels(chartData, key) && (
              <LabelList dataKey={key} position="top" formatter={(v) => valueLabelFormatter(v, key, chart)} className="text-[10px]" />
            )}
          </Bar>
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
