import React, { useState, useRef } from "react";
import { executeSQL } from "@/components/querybuilder/sqlEngine";

function safeVal(val) {
  if (val === null || val === undefined) return "—";
  if (val instanceof Date) return val.toLocaleDateString();
  if (Array.isArray(val)) return val.map((v) => typeof v === "object" ? JSON.stringify(v) : String(v)).join(", ");
  if (typeof val === "object") return JSON.stringify(val);
  if (typeof val === "boolean") return val ? "Yes" : "No";
  return String(val);
}

function safeChartData(rawData) {
  if (!Array.isArray(rawData)) return [];
  return rawData.map((row) => {
    const safeRow = {};
    Object.entries(row).forEach(([k, v]) => {
      safeRow[k] = typeof v === "object" && v !== null ? JSON.stringify(v) : v;
    });
    return safeRow;
  });
}
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Play, Save, BarChart2, TrendingUp, PieChart, Activity, Hash, Table2, Target, ScatterChart, GripVertical, Plus, X, Wand2, Code2, Database, ChevronDown, ChevronRight, Layers, Sparkles, RefreshCw } from "lucide-react";
import {
  BarChart, Bar, LineChart, Line, PieChart as RechartPie, Pie, Cell, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

const CHART_TYPES = [
  { id: "bar",     label: "Bar",     ChartIcon: BarChart2 },
  { id: "line",    label: "Line",    ChartIcon: TrendingUp },
  { id: "pie",     label: "Pie",     ChartIcon: PieChart },
  { id: "area",    label: "Area",    ChartIcon: Activity },
  { id: "number",  label: "Number",  ChartIcon: Hash },
  { id: "table",   label: "Table",   ChartIcon: Table2 },
  { id: "gauge",   label: "Gauge",   ChartIcon: Target },
  { id: "scatter", label: "Scatter", ChartIcon: ScatterChart },
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

// ─── Entity schema for the visual builder ────────────────────────────────────
const ENTITY_SCHEMA = {
  Enterprise:  { table: "enterprises",  icon: "🏢", color: "#6366f1", fields: ["id","enterprise_name","status","enterprise_type","city","country","legal_structure","subscription_tier"] },
  Person:      { table: "people",       icon: "👤", color: "#0ea5e9", fields: ["id","first_name","last_name","person_type","status","primary_role","city","country","engagement_type"] },
  Task:        { table: "tasks",        icon: "✅", color: "#f97316", fields: ["id","title","task_type","status","priority","enterprise","assigned_to_name","scheduled_date","due_date","outcome"] },
  Transaction: { table: "transactions", icon: "💳", color: "#dc2626", fields: ["id","transaction_type","status","amount","net_amount","payment_status","payment_method","enterprise","date"] },
  Product:     { table: "products",     icon: "📦", color: "#f59e0b", fields: ["id","name","sku","item_type","category","status","stock_quantity","unit_price","cost_price","supplier"] },
  Service:     { table: "services",     icon: "⚙️", color: "#10b981", fields: ["id","name","category","status","pricing_model","price","service_type"] },
  Relationship:{ table: "relationships",icon: "🔗", color: "#ec4899", fields: ["id","relationship_type","status","role","person_name","enterprise_name","start_date"] },
};

const AGGREGATIONS = [
  { id: "COUNT", label: "Count", desc: "Total number of records" },
  { id: "SUM",   label: "Sum",   desc: "Sum of a numeric field" },
  { id: "AVG",   label: "Average", desc: "Average of a numeric field" },
  { id: "MAX",   label: "Max",   desc: "Maximum value" },
  { id: "MIN",   label: "Min",   desc: "Minimum value" },
];

// ─── Visual Query Builder ─────────────────────────────────────────────────────
function VisualQueryBuilder({ onQueryGenerated }) {
  const [entity, setEntity]       = useState(null);
  const [groupBy, setGroupBy]     = useState("");
  const [aggType, setAggType]     = useState("COUNT");
  const [aggField, setAggField]   = useState("id");
  const [limit, setLimit]         = useState(20);
  const [filters, setFilters]     = useState([]); // [{field, op, value}]
  const [draggingField, setDraggingField] = useState(null);
  const dropRef = useRef(null);

  const schema = entity ? ENTITY_SCHEMA[entity] : null;

  const addFilter = () => setFilters(f => [...f, { field: schema?.fields[0] || "", op: "=", value: "" }]);
  const removeFilter = (i) => setFilters(f => f.filter((_, idx) => idx !== i));
  const updateFilter = (i, key, val) => setFilters(f => f.map((x, idx) => idx === i ? { ...x, [key]: val } : x));

  const buildSQL = () => {
    if (!schema) return "";
    const tbl   = schema.table;
    const metric = aggType === "COUNT" ? "COUNT(*) as count" : `${aggType}(${aggField}) as ${aggType.toLowerCase()}_${aggField}`;
    const metricAlias = aggType === "COUNT" ? "count" : `${aggType.toLowerCase()}_${aggField}`;
    const whereClauses = filters
      .filter(f => f.field && f.value)
      .map(f => `${f.field} ${f.op} '${f.value}'`);
    const where = whereClauses.length ? `WHERE ${whereClauses.join(" AND ")}` : "";
    if (!groupBy) {
      return `SELECT ${metric}\nFROM ${tbl}\n${where}\nLIMIT ${limit}`.trim();
    }
    return `SELECT ${groupBy}, ${metric}\nFROM ${tbl}\n${where}\nGROUP BY ${groupBy}\nORDER BY ${metricAlias} DESC\nLIMIT ${limit}`.trim();
  };

  const handleGenerate = () => {
    const sql = buildSQL();
    if (sql) onQueryGenerated(sql);
  };

  // Drag-and-drop field → group-by
  const handleDragStart = (field) => setDraggingField(field);
  const handleDrop = (e) => {
    e.preventDefault();
    if (draggingField) { setGroupBy(draggingField); setDraggingField(null); }
  };
  const handleDragOver = (e) => e.preventDefault();

  return (
    <div className="space-y-4">
      {/* Step A: Pick entity */}
      <div>
        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <Database className="w-3.5 h-3.5" /> 1. Choose Entity
        </p>
        <div className="grid grid-cols-4 gap-2">
          {Object.entries(ENTITY_SCHEMA).map(([name, cfg]) => (
            <button key={name} onClick={() => { setEntity(name); setGroupBy(""); setAggField(cfg.fields[0]); }}
              className={`flex flex-col items-center gap-1.5 p-2.5 rounded-xl border-2 text-center transition-all ${entity === name ? "border-indigo-500 bg-indigo-50" : "border-slate-200 hover:border-slate-300 bg-white"}`}
            >
              <span className="text-xl">{cfg.icon}</span>
              <span className="text-[11px] font-semibold text-slate-600">{name}</span>
            </button>
          ))}
        </div>
      </div>

      {schema && (
        <>
          {/* Step B: Drag fields */}
          <div className="flex gap-3">
            {/* Field palette */}
            <div className="flex-1">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5" /> 2. Drag a field to Group By
              </p>
              <div className="flex flex-wrap gap-1.5">
                {schema.fields.map(f => (
                  <div key={f}
                    draggable
                    onDragStart={() => handleDragStart(f)}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border cursor-grab active:cursor-grabbing transition-all select-none
                      ${groupBy === f ? "bg-indigo-100 border-indigo-400 text-indigo-700" : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"}`}
                    onClick={() => setGroupBy(groupBy === f ? "" : f)}
                  >
                    <GripVertical className="w-3 h-3 text-slate-300" />
                    {f}
                  </div>
                ))}
              </div>
            </div>
            {/* Drop zone */}
            <div
              ref={dropRef}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              className={`w-36 shrink-0 rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-1 transition-all cursor-pointer
                ${groupBy ? "border-indigo-400 bg-indigo-50" : "border-slate-200 bg-slate-50 hover:border-slate-300"}`}
              onClick={() => groupBy && setGroupBy("")}
            >
              {groupBy ? (
                <>
                  <span className="text-xs font-bold text-indigo-600 px-2 text-center">{groupBy}</span>
                  <span className="text-[10px] text-indigo-400">click to clear</span>
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4 text-slate-300" />
                  <span className="text-[10px] text-slate-400 text-center px-2">Drop field here to group by</span>
                </>
              )}
            </div>
          </div>

          {/* Step C: Aggregation */}
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">3. Aggregation</p>
            <div className="flex gap-2 flex-wrap">
              {AGGREGATIONS.map(agg => (
                <button key={agg.id} onClick={() => setAggType(agg.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${aggType === agg.id ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"}`}
                  title={agg.desc}
                >
                  {agg.label}
                </button>
              ))}
            </div>
            {aggType !== "COUNT" && (
              <div className="mt-2">
                <select value={aggField} onChange={e => setAggField(e.target.value)}
                  className="text-xs border border-slate-200 rounded-lg px-3 py-1.5 bg-white outline-none">
                  {schema.fields.filter(f => f !== "id").map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
            )}
          </div>

          {/* Step D: Filters */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">4. Filters (optional)</p>
              <button onClick={addFilter} className="flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-700 font-medium">
                <Plus className="w-3 h-3" /> Add filter
              </button>
            </div>
            {filters.map((f, i) => (
              <div key={i} className="flex items-center gap-2 mb-1.5">
                <select value={f.field} onChange={e => updateFilter(i, "field", e.target.value)}
                  className="flex-1 text-xs border border-slate-200 rounded-lg px-2 py-1 bg-white outline-none">
                  {schema.fields.map(fd => <option key={fd} value={fd}>{fd}</option>)}
                </select>
                <select value={f.op} onChange={e => updateFilter(i, "op", e.target.value)}
                  className="w-16 text-xs border border-slate-200 rounded-lg px-2 py-1 bg-white outline-none">
                  {["=","!=",">","<",">=","<="].map(op => <option key={op} value={op}>{op}</option>)}
                </select>
                <input value={f.value} onChange={e => updateFilter(i, "value", e.target.value)}
                  placeholder="value"
                  className="flex-1 text-xs border border-slate-200 rounded-lg px-2 py-1 outline-none" />
                <button onClick={() => removeFilter(i)} className="text-slate-400 hover:text-rose-500"><X className="w-3.5 h-3.5" /></button>
              </div>
            ))}
          </div>

          {/* Limit + Generate */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-500">Limit</label>
              <input type="number" value={limit} min={1} max={500} onChange={e => setLimit(Number(e.target.value))}
                className="w-16 text-xs border border-slate-200 rounded-lg px-2 py-1 outline-none text-center" />
            </div>
            <button onClick={handleGenerate}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl transition-colors ml-auto">
              <Wand2 className="w-3.5 h-3.5" /> Generate Query & Preview
            </button>
          </div>

          {/* SQL preview */}
          <div className="bg-slate-950 rounded-xl p-3 font-mono text-[11px] text-emerald-400 whitespace-pre">
            {buildSQL()}
          </div>
        </>
      )}
    </div>
  );
}

const ENTITIES = ["Enterprise", "Person", "Task", "Transaction", "Product", "Service"];

// ─── Quick-source templates (SQL + label) shown in the "Browse Sources" panel ─
const QUICK_SOURCES = [
  {
    group: "Analytics (aggregated summaries)",
    color: "indigo",
    items: [
      { label: "People summary",       sql: "SELECT person_type, status, people_count, active_count\nFROM analytics_people\nORDER BY people_count DESC" },
      { label: "Task completion",      sql: "SELECT task_type, total_tasks, completed_tasks, completion_rate_pct, overdue_tasks\nFROM analytics_tasks\nORDER BY total_tasks DESC" },
      { label: "Revenue breakdown",    sql: "SELECT transaction_type, total_transactions, total_amount, outstanding_amount\nFROM analytics_transactions\nWHERE is_revenue = true\nORDER BY total_amount DESC" },
      { label: "Product inventory",    sql: "SELECT item_type, total_products, total_stock, low_stock_count, out_of_stock_count\nFROM analytics_products\nORDER BY total_products DESC" },
      { label: "Enterprise overview",  sql: "SELECT name, enterprise_type, operating_status, is_active\nFROM analytics_enterprises\nORDER BY name" },
      { label: "Services summary",     sql: "SELECT service_type, service_count, total_billable_value, avg_rate\nFROM analytics_services\nORDER BY service_count DESC" },
    ],
  },
  {
    group: "Raw data (individual records)",
    color: "emerald",
    items: [
      { label: "All people",           sql: "SELECT id, full_name, person_type, status, engagement_model, enterprise_id\nFROM raw_people\nLIMIT 200" },
      { label: "All tasks",            sql: "SELECT id, task_type, status, title, enterprise_id, due_date, completed_date\nFROM raw_tasks\nLIMIT 200" },
      { label: "All transactions",     sql: "SELECT id, transaction_type, status, amount, currency, enterprise_id, invoice_date\nFROM raw_transactions\nLIMIT 200" },
      { label: "ML predictions",       sql: "SELECT model, computed_at, result_json\nFROM raw_ml_predictions\nORDER BY computed_at DESC\nLIMIT 10" },
    ],
  },
  {
    group: "Public APIs (live data)",
    color: "amber",
    items: [
      { label: "Weather — city",       sql: "SELECT * FROM weather_current\nWHERE city = 'Nairobi'" },
      { label: "Nearby pharmacies",    sql: "SELECT name, lat, lon, phone FROM osm_nearby\nWHERE type = 'pharmacy' AND lat = '-1.28' AND lon = '36.82' AND radius_km = 5" },
      { label: "Place search",         sql: "SELECT name, type, lat, lon, country FROM osm_places\nWHERE query = 'hospital Nairobi'" },
      { label: "Medication lookup",    sql: "SELECT name, synonym, tty_label FROM medications_api\nWHERE name = 'metformin'" },
    ],
  },
];

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
          <tbody>{data.slice(0, 5).map((row, i) => <tr key={i}>{cols.map(c => <td key={c} className="py-1 px-2 border-b border-slate-50">{safeVal(row[c])}</td>)}</tr>)}</tbody>
        </table>
      </div>
    );
  }

  if (chartType === "pie") {
    const safeData = safeChartData(data);
    return (
      <ResponsiveContainer width="100%" height="100%">
        <RechartPie>
          <Pie data={safeData} dataKey={yKey || Object.keys(data[0] || {})[1] || "value"} nameKey={xKey || Object.keys(data[0] || {})[0] || "name"} cx="50%" cy="50%" outerRadius={80}>
            {data.map((_, i) => <Cell key={i} fill={[color, "#94a3b8", "#64748b", "#cbd5e1", "#e2e8f0"][i % 5]} />)}
          </Pie>
          <Tooltip />
        </RechartPie>
      </ResponsiveContainer>
    );
  }

  if (chartType === "area") {
    const safeData = safeChartData(data);
    return (
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={safeData} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
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
    const safeData = safeChartData(data);
    return (
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={safeData} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis dataKey={xKey} tick={{ fontSize: 10 }} />
          <YAxis tick={{ fontSize: 10 }} />
          <Tooltip />
          <Line type="monotone" dataKey={yKey} stroke={color} strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    );
  }

  const safeData = safeChartData(data);
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={safeData} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
        <XAxis dataKey={xKey} tick={{ fontSize: 10 }} />
        <YAxis tick={{ fontSize: 10 }} />
        <Tooltip />
        <Bar dataKey={yKey} fill={color} radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── Browse Sources panel — click any template to load it into the SQL editor ─
function BrowseSourcesPanel({ onInsert }) {
  const [open, setOpen] = useState(false);
  const COLOR = { indigo: "text-indigo-600 bg-indigo-50 border-indigo-200", emerald: "text-emerald-700 bg-emerald-50 border-emerald-200", amber: "text-amber-700 bg-amber-50 border-amber-200" };
  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-3 py-2 bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-slate-600 transition-colors"
      >
        <span className="flex items-center gap-1.5"><Database className="w-3.5 h-3.5 text-slate-400" /> Browse data sources</span>
        {open ? <ChevronDown className="w-3.5 h-3.5 text-slate-400" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />}
      </button>
      {open && (
        <div className="p-3 space-y-4 max-h-64 overflow-y-auto">
          {QUICK_SOURCES.map(({ group, color, items }) => (
            <div key={group}>
              <p className={`text-[10px] font-bold uppercase tracking-wider mb-1.5 ${COLOR[color].split(" ")[0]}`}>{group}</p>
              <div className="flex flex-wrap gap-1.5">
                {items.map(({ label, sql }) => (
                  <button
                    key={label}
                    onClick={() => { onInsert(sql); setOpen(false); }}
                    className={`text-[11px] font-medium px-2.5 py-1 rounded-lg border transition-colors hover:opacity-80 ${COLOR[color]}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ChartBuilder({ chart, folders, currentUser, onClose, readOnly = false }) {
  const qc = useQueryClient();
  const [step, setStep] = useState(1);
  const [dataMode, setDataMode] = useState("visual"); // "visual" | "sql"
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
  const [aiInsight, setAiInsight] = useState("");
  const [aiLoading, setAiLoading] = useState(false);

  const generateInsight = async () => {
    if (!previewData || previewData.length === 0) return;
    setAiLoading(true);
    setAiInsight("");
    try {
      const sample = previewData.slice(0, 20);
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `You are a data analyst. Analyze this chart data and write ONE concise insight (2-3 sentences max). Focus on the most notable trend, pattern, or outlier. Be specific and mention actual values.

Chart title: "${title || "Untitled chart"}"
Chart type: ${chartType}
X axis: ${xKey}, Y axis: ${yKey}
Data (up to 20 rows):
${JSON.stringify(sample, null, 2)}

Respond with just the insight text, no headers or bullet points.`,
      });
      setAiInsight(typeof result === "string" ? result : result?.text || "");
    } catch (e) {
      setAiInsight("Could not generate insight. Please try again.");
    } finally {
      setAiLoading(false);
    }
  };

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

  const [queryError, setQueryError] = useState(null);

  const runQueryWith = async (querySql) => {
    if (!querySql?.trim()) return;
    setPreviewLoading(true);
    setQueryError(null);
    try {
      const result = await executeSQL(querySql, {});
      const rows = result?.rows || [];
      setPreviewData(rows);
      if (rows.length > 0) {
        setXKey(Object.keys(rows[0])[0]);
        setYKey(Object.keys(rows[0])[1] || Object.keys(rows[0])[0]);
      }
      // Auto-advance to chart type selection if coming from visual builder
      if (rows.length > 0) setStep(2);
    } catch (e) {
      setQueryError(e.message);
      setPreviewData([]);
    } finally {
      setPreviewLoading(false);
    }
  };

  const runQuery = async () => {
    if (!sql.trim()) return;
    setPreviewLoading(true);
    setQueryError(null);
    try {
      const result = await executeSQL(sql, {});
      const rows = result?.rows || [];
      setPreviewData(rows);
      if (rows.length > 0 && !xKey) setXKey(Object.keys(rows[0])[0]);
      if (rows.length > 0 && !yKey) setYKey(Object.keys(rows[0])[1] || Object.keys(rows[0])[0]);
    } catch (e) {
      setQueryError(e.message);
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
          <h2 className="text-base font-semibold text-slate-800">
            {readOnly ? chart?.title || "View Chart" : (chart ? "Edit Chart" : "New Chart")}
          </h2>
        </div>
        {!readOnly && (
          <>
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
          </>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {readOnly ? (
          <div className="p-8 max-w-3xl mx-auto">
            <h3 className="text-lg font-semibold text-slate-800 mb-1">{chart?.title}</h3>
            {chart?.description && <p className="text-sm text-slate-500 mb-6">{chart.description}</p>}
            <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm h-80">
              <MiniChartPreview
                chartType={chartType}
                data={previewData}
                xKey={xKey}
                yKey={yKey}
                colorScheme={colorScheme}
              />
            </div>
            {!previewData && (
              <div className="mt-4 text-center">
                <button
                  onClick={runQuery}
                  disabled={previewLoading}
                  className="px-4 py-2 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700 disabled:opacity-50"
                >
                  {previewLoading ? "Loading..." : "Load Chart Data"}
                </button>
              </div>
            )}
            {chart?.tags?.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-4">
                {chart.tags.map((t) => (
                  <span key={t} className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">{t}</span>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-0 h-full">
          {/* Left: Editor */}
          <div className="p-6 border-r border-slate-100 space-y-6">
            {/* Step 1: Data */}
            {step === 1 && (
              <div>
                {/* Mode toggle */}
                <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1 mb-4 w-fit">
                  <button onClick={() => setDataMode("visual")}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${dataMode === "visual" ? "bg-white shadow text-indigo-700" : "text-slate-500 hover:text-slate-700"}`}>
                    <Wand2 className="w-3.5 h-3.5" /> Visual Builder
                  </button>
                  <button onClick={() => setDataMode("sql")}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${dataMode === "sql" ? "bg-white shadow text-emerald-700" : "text-slate-500 hover:text-slate-700"}`}>
                    <Code2 className="w-3.5 h-3.5" /> SQL Editor
                  </button>
                </div>

                {/* Visual drag-and-drop builder */}
                {dataMode === "visual" && (
                  <VisualQueryBuilder
                    onQueryGenerated={(generatedSQL) => {
                      setSql(generatedSQL);
                      runQueryWith(generatedSQL);
                    }}
                  />
                )}

                {/* Raw SQL editor */}
                {dataMode === "sql" && (
                  <>
                    <h3 className="text-sm font-semibold text-slate-700 mb-2">Data Source — SQL Query</h3>

                    {/* Browse Sources accordion */}
                    <BrowseSourcesPanel onInsert={(template) => setSql(template)} />

                    <textarea
                      className="w-full h-40 font-mono text-xs bg-slate-950 text-emerald-400 rounded-xl p-4 resize-none outline-none border-0 mt-3"
                      value={sql}
                      onChange={(e) => setSql(e.target.value)}
                      placeholder="SELECT enterprise, COUNT(*) as count FROM tasks GROUP BY enterprise"
                      spellCheck={false}
                    />
                    <Button className="mt-2 gap-1.5 bg-emerald-600 hover:bg-emerald-700" size="sm" onClick={runQuery} disabled={previewLoading}>
                      <Play className="w-3.5 h-3.5" /> {previewLoading ? "Running..." : "Run Query"}
                    </Button>
                  </>
                )}

                {queryError && (
                  <div className="mt-2 p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-600 font-mono">{queryError}</div>
                )}
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
                                <td key={j} className="py-1.5 px-3 text-slate-700">{safeVal(v)}</td>
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
                  {CHART_TYPES.map(({ id, label, ChartIcon }) => (
                    <button
                      key={id}
                      onClick={() => setChartType(id)}
                      className={`flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all ${
                        chartType === id ? "border-emerald-500 bg-emerald-50" : "border-slate-200 hover:border-slate-300"
                      }`}
                    >
                      <ChartIcon className={`w-6 h-6 ${chartType === id ? "text-emerald-600" : "text-slate-400"}`} />
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

            {/* AI Insight Panel */}
            {previewData && previewData.length > 0 && (
              <div className="mt-4 bg-white rounded-2xl border border-slate-100 p-4 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-violet-500" />
                    <span className="text-xs font-semibold text-slate-700">AI Insight</span>
                  </div>
                  <button
                    onClick={generateInsight}
                    disabled={aiLoading}
                    className="flex items-center gap-1 text-[11px] font-medium text-violet-600 hover:text-violet-700 disabled:opacity-50 transition-colors"
                  >
                    <RefreshCw className={`w-3 h-3 ${aiLoading ? "animate-spin" : ""}`} />
                    {aiInsight ? "Regenerate" : "Generate"}
                  </button>
                </div>
                {aiLoading && (
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <div className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                    <div className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                    <div className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                    <span>Analyzing data…</span>
                  </div>
                )}
                {!aiLoading && aiInsight && (
                  <p className="text-xs text-slate-600 leading-relaxed">{aiInsight}</p>
                )}
                {!aiLoading && !aiInsight && (
                  <p className="text-[11px] text-slate-400 italic">Click "Generate" to get an AI-powered insight about this chart data.</p>
                )}
              </div>
            )}
          </div>
          </div>
        )}
      </div>
    </div>
  );
}