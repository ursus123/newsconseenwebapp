import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Play, Save, BarChart2, TrendingUp, PieChart, Activity, Hash, Table2, Target, ScatterChart } from "lucide-react";
import {
  BarChart, Bar, LineChart, Line, PieChart as RechartPie, Pie, Cell, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

const CHART_TYPES = [
  { id: "bar",     label: "Bar",     icon: BarChart2 },
  { id: "line",    label: "Line",    icon: TrendingUp },
  { id: "pie",     label: "Pie",     icon: PieChart },
  { id: "area",    label: "Area",    icon: Activity },
  { id: "number",  label: "Number",  icon: Hash },
  { id: "table",   label: "Table",   icon: Table2 },
  { id: "gauge",   label: "Gauge",   icon: Target },
  { id: "scatter", label: "Scatter", icon: ScatterChart },
];

const COLOR_SCHEMES = [
  { id: "emerald", label: "Emerald", color: "#10b981" },
  { id: "blue",    label: "Blue",    color: "#3b82f6" },
  { id: "purple",  label: "Purple",  color: "#8b5cf6" },
  { id: "orange",  label: "Orange",  color: "#f97316" },
  { id: "rose",    label: "Rose",    color: "#f43f5e" },
  { id: "amber",   label: "Amber",   color: "#f59e0b" },
];

const SCHEME_COLOR = { emerald: "#10b981", blue: "#3b82f6", purple: "#8b5cf6", orange: "#f97316", rose: "#f43f5e", amber: "#f59e0b" };

const ENTITIES = ["Enterprise", "Person", "Task", "Transaction", "Product", "Service"];

function MiniChartPreview({ chartType, data, xKey, yKey, colorScheme }) {
  const color = SCHEME_COLOR[colorScheme] || "#10b981";
  if (!data || data.length === 0) return (
    <div className="flex items-center justify-center h-full text-slate-300 text-xs">Run query to preview</div>
  );

  if (chartType === "number") {
    const val = data[0]?.[yKey] ?? data[0]?.[Object.keys(data[0])[0]];
    return (
      <div className="flex items-center justify-center h-full">
        <span className="text-5xl font-black" style={{ color }}>{Number(val).toLocaleString()}</span>
      </div>
    );
  }

  if (chartType === "table") {
    const cols = Object.keys(data[0] || {});
    return (
      <div className="overflow-auto h-full">
        <table className="text-[11px] w-full">
          <thead><tr>{cols.map(c => <th key={c} className="text-left py-1 px-2 bg-slate-100 font-semibold">{c}</th>)}</tr></thead>
          <tbody>{data.slice(0, 5).map((row, i) => <tr key={i}>{cols.map(c => <td key={c} className="py-1 px-2 border-b border-slate-50">{row[c]}</td>)}</tr>)}</tbody>
        </table>
      </div>
    );
  }

  if (chartType === "pie") {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <RechartPie>
          <Pie data={data} dataKey={yKey || Object.keys(data[0] || {})[1] || "value"} nameKey={xKey || Object.keys(data[0] || {})[0] || "name"} cx="50%" cy="50%" outerRadius={80}>
            {data.map((_, i) => <Cell key={i} fill={[color, "#94a3b8", "#64748b", "#cbd5e1", "#e2e8f0"][i % 5]} />)}
          </Pie>
          <Tooltip />
        </RechartPie>
      </ResponsiveContainer>
    );
  }

  if (chartType === "area") {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis dataKey={xKey} tick={{ fontSize: 10 }} />
          <YAxis tick={{ fontSize: 10 }} />
          <Tooltip />
          <Area type="monotone" dataKey={yKey} stroke={color} fill={color} fillOpacity={0.2} />
        </AreaChart>
      </ResponsiveContainer>
    );
  }

  if (chartType === "line") {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis dataKey={xKey} tick={{ fontSize: 10 }} />
          <YAxis tick={{ fontSize: 10 }} />
          <Tooltip />
          <Line type="monotone" dataKey={yKey} stroke={color} strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
        <XAxis dataKey={xKey} tick={{ fontSize: 10 }} />
        <YAxis tick={{ fontSize: 10 }} />
        <Tooltip />
        <Bar dataKey={yKey} fill={color} radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export default function ChartBuilder({ chart, folders, currentUser, onClose }) {
  const qc = useQueryClient();
  const [step, setStep] = useState(1);
  const [sql, setSql] = useState(chart?.sql_query || "SELECT * FROM enterprises LIMIT 20");
  const [previewData, setPreviewData] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [chartType, setChartType] = useState(chart?.chart_type || "bar");
  const [title, setTitle] = useState(chart?.title || "");
  const [description, setDescription] = useState(chart?.description || "");
  const [xKey, setXKey] = useState(chart?.x_axis_key || "");
  const [yKey, setYKey] = useState(chart?.y_axis_key || "");
  const [colorScheme, setColorScheme] = useState(chart?.color_scheme || "emerald");
  const [folderId, setFolderId] = useState(chart?.folder_id || "");
  const [sharedWithRoles, setSharedWithRoles] = useState(chart?.shared_with_roles || ["admin"]);
  const [isPublic, setIsPublic] = useState(chart?.is_public || false);
  const [tags, setTags] = useState((chart?.tags || []).join(", "));

  const columns = previewData?.length > 0 ? Object.keys(previewData[0]) : [];

  const saveMut = useMutation({
    mutationFn: (data) => chart
      ? base44.entities.ReportChart.update(chart.id, data)
      : base44.entities.ReportChart.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reportCharts"] });
      onClose();
    },
  });

  const runQuery = async () => {
    setPreviewLoading(true);
    try {
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `Execute this SQL-like query against the Base44 data and return results as JSON array. Query: ${sql}. Return ONLY a JSON array of objects, nothing else.`,
        response_json_schema: { type: "object", properties: { rows: { type: "array", items: { type: "object" } } } },
      });
      const rows = result?.rows || [];
      setPreviewData(rows);
      if (rows.length > 0 && !xKey) setXKey(Object.keys(rows[0])[0]);
      if (rows.length > 0 && !yKey) setYKey(Object.keys(rows[0])[1] || Object.keys(rows[0])[0]);
    } catch {
      setPreviewData([]);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleSave = () => {
    saveMut.mutate({
      title,
      description,
      chart_type: chartType,
      sql_query: sql,
      x_axis_key: xKey,
      y_axis_key: yKey,
      color_scheme: colorScheme,
      folder_id: folderId || null,
      shared_with_roles: sharedWithRoles,
      is_public: isPublic,
      tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
      company_id: currentUser?.company_id,
      status: "active",
    });
  };

  const toggleRole = (role) => {
    setSharedWithRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]
    );
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100 bg-white shrink-0">
        <Button variant="ghost" size="sm" onClick={onClose} className="gap-1.5">
          <ArrowLeft className="w-4 h-4" /> Back
        </Button>
        <div className="flex-1">
          <h2 className="text-base font-semibold text-slate-800">{chart ? "Edit Chart" : "New Chart"}</h2>
        </div>
        {/* Steps */}
        <div className="flex items-center gap-1.5 text-xs">
          {["Data", "Type", "Settings", "Sharing"].map((s, i) => (
            <button
              key={s}
              onClick={() => setStep(i + 1)}
              className={`px-3 py-1 rounded-full font-medium transition-all ${
                step === i + 1 ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
              }`}
            >
              {i + 1}. {s}
            </button>
          ))}
        </div>
        <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5" onClick={handleSave} disabled={saveMut.isPending}>
          <Save className="w-3.5 h-3.5" /> {saveMut.isPending ? "Saving..." : "Save Chart"}
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-0 h-full">
          {/* Left: Editor */}
          <div className="p-6 border-r border-slate-100 space-y-6">
            {/* Step 1: Data */}
            {step === 1 && (
              <div>
                <h3 className="text-sm font-semibold text-slate-700 mb-3">Data Source — SQL Query</h3>
                <textarea
                  className="w-full h-48 font-mono text-xs bg-slate-950 text-emerald-400 rounded-xl p-4 resize-none outline-none border-0"
                  value={sql}
                  onChange={(e) => setSql(e.target.value)}
                  placeholder="SELECT enterprise, COUNT(*) as count FROM tasks GROUP BY enterprise"
                  spellCheck={false}
                />
                <Button className="mt-2 gap-1.5 bg-emerald-600 hover:bg-emerald-700" size="sm" onClick={runQuery} disabled={previewLoading}>
                  <Play className="w-3.5 h-3.5" /> {previewLoading ? "Running..." : "Run Query"}
                </Button>
                {previewData && (
                  <div className="mt-4">
                    <p className="text-xs text-slate-500 mb-2">{previewData.length} rows returned (showing first 5)</p>
                    <div className="overflow-x-auto rounded-xl border border-slate-100">
                      <table className="text-[11px] w-full">
                        <thead>
                          <tr>{Object.keys(previewData[0] || {}).map((c) => (
                            <th key={c} className="text-left py-2 px-3 bg-slate-50 font-semibold text-slate-600">{c}</th>
                          ))}</tr>
                        </thead>
                        <tbody>
                          {previewData.slice(0, 5).map((row, i) => (
                            <tr key={i} className="border-t border-slate-50">
                              {Object.values(row).map((v, j) => (
                                <td key={j} className="py-1.5 px-3 text-slate-700">{String(v)}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <Button size="sm" variant="outline" className="mt-2" onClick={() => setStep(2)}>
                      Next: Choose Chart Type →
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* Step 2: Chart Type */}
            {step === 2 && (
              <div>
                <h3 className="text-sm font-semibold text-slate-700 mb-3">Chart Type</h3>
                <div className="grid grid-cols-4 gap-3">
                  {CHART_TYPES.map(({ id, label, icon: Icon }) => (
                    <button
                      key={id}
                      onClick={() => setChartType(id)}
                      className={`flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all ${
                        chartType === id ? "border-emerald-500 bg-emerald-50" : "border-slate-200 hover:border-slate-300"
                      }`}
                    >
                      <Icon className={`w-6 h-6 ${chartType === id ? "text-emerald-600" : "text-slate-400"}`} />
                      <span className="text-[11px] font-medium text-slate-600">{label}</span>
                    </button>
                  ))}
                </div>
                <Button size="sm" variant="outline" className="mt-4" onClick={() => setStep(3)}>
                  Next: Chart Settings →
                </Button>
              </div>
            )}

            {/* Step 3: Settings */}
            {step === 3 && (
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-slate-700">Chart Settings</h3>
                <div>
                  <label className="text-xs text-slate-500 font-medium mb-1 block">Title *</label>
                  <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Revenue by Enterprise" />
                </div>
                <div>
                  <label className="text-xs text-slate-500 font-medium mb-1 block">Description</label>
                  <textarea value={description} onChange={(e) => setDescription(e.target.value)} className="w-full border border-slate-200 rounded-lg text-xs px-3 py-2 resize-none h-16 outline-none" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-slate-500 font-medium mb-1 block">X Axis</label>
                    <select value={xKey} onChange={(e) => setXKey(e.target.value)} className="w-full border border-slate-200 rounded-lg text-xs px-3 py-2 outline-none bg-white">
                      <option value="">Select column</option>
                      {columns.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 font-medium mb-1 block">Y Axis / Value</label>
                    <select value={yKey} onChange={(e) => setYKey(e.target.value)} className="w-full border border-slate-200 rounded-lg text-xs px-3 py-2 outline-none bg-white">
                      <option value="">Select column</option>
                      {columns.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-xs text-slate-500 font-medium mb-2 block">Color Scheme</label>
                  <div className="flex gap-2 flex-wrap">
                    {COLOR_SCHEMES.map((cs) => (
                      <button
                        key={cs.id}
                        onClick={() => setColorScheme(cs.id)}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border-2 transition-all ${
                          colorScheme === cs.id ? "border-slate-400" : "border-transparent"
                        }`}
                        style={{ backgroundColor: cs.color + "20", color: cs.color }}
                      >
                        <span className="w-3 h-3 rounded-full" style={{ backgroundColor: cs.color }} />
                        {cs.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs text-slate-500 font-medium mb-1 block">Folder</label>
                  <select value={folderId} onChange={(e) => setFolderId(e.target.value)} className="w-full border border-slate-200 rounded-lg text-xs px-3 py-2 outline-none bg-white">
                    <option value="">Uncategorized</option>
                    {folders.map((f) => <option key={f.id} value={f.id}>{f.icon || "📁"} {f.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-500 font-medium mb-1 block">Tags (comma-separated)</label>
                  <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="retention, monthly, clients" />
                </div>
              </div>
            )}

            {/* Step 4: Sharing */}
            {step === 4 && (
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-slate-700">Sharing & Visibility</h3>
                <div>
                  <label className="text-xs text-slate-500 font-medium mb-2 block">Who can see this chart?</label>
                  <div className="space-y-2">
                    {["admin", "executive", "user"].map((role) => (
                      <label key={role} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={sharedWithRoles.includes(role)}
                          onChange={() => toggleRole(role)}
                          className="rounded"
                        />
                        <span className="text-xs text-slate-700 capitalize">{role === "user" ? "Staff (all users)" : role}</span>
                      </label>
                    ))}
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} className="rounded" />
                      <span className="text-xs text-slate-700">Public — all company members</span>
                    </label>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Right: Preview */}
          <div className="p-6 bg-slate-50">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Live Preview</p>
            <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
              <p className="text-sm font-semibold text-slate-800 mb-1">{title || "Chart Title"}</p>
              {description && <p className="text-xs text-slate-400 mb-3">{description}</p>}
              <div className="h-64">
                <MiniChartPreview
                  chartType={chartType}
                  data={previewData}
                  xKey={xKey}
                  yKey={yKey}
                  colorScheme={colorScheme}
                />
              </div>
              {tags && (
                <div className="flex flex-wrap gap-1 mt-3">
                  {tags.split(",").filter(Boolean).map((t) => (
                    <span key={t} className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">{t.trim()}</span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}