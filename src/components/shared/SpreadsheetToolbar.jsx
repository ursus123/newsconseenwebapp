/**
 * SpreadsheetToolbar
 * ───────────────────
 * Excel/Sheets-like analysis + formula bar for entity tables.
 *
 * Tabs:
 *   📊 Stats   — SUM / AVG / MIN / MAX over any numeric field
 *   🔢 Columns — show / hide individual columns
 *   fx Formula — create computed columns with Excel-like formulas
 *   ↕ Sort     — visual sort controls (mirrors clicking column headers)
 *
 * Props (direct):
 *   numericFields        [{key, label}]     fields eligible for Stats tab
 *   heatmapField         string | null
 *   heatmapOn            bool
 *   onHeatmapToggle      fn()
 *   selectedIds          [id, …]
 *   onSelectAll          fn()
 *   onClearSelect        fn()
 *   onWriteBack          fn([{id, field, value}])  — optional; enables write-back UI
 *
 * Props (from useSpreadsheet().toolbarProps):
 *   data                 sorted rows (for stats preview)
 *   allColumns           [{key, label}]  base columns for column manager
 *   computedColumns      [{key, label, formula, mapToField}]
 *   hiddenCols           Set<string>
 *   sortKey, sortDir     current sort
 *   onAddColumn          fn({label, formula, mapToField})
 *   onRemoveColumn       fn(key)
 *   onUpdateColumn       fn(key, patch)
 *   onToggleColumn       fn(key)
 *   onShowAllColumns     fn()
 *   onSort               fn(key)
 */

import React, { useState, useMemo } from "react";
import {
  BarChart2, Sigma, Hash, TrendingUp, TrendingDown, Flame,
  X, ChevronDown, ChevronUp, Eye, EyeOff, Plus, Trash2,
  Play, CheckCircle2, AlertCircle, ArrowUpDown, ArrowUp, ArrowDown,
  Upload, Columns3, FunctionSquare,
} from "lucide-react";
import { evalFormula, validateFormula, FORMULA_EXAMPLES } from "./formulaEngine";

// ── helpers ───────────────────────────────────────────────────────────────────

const TAB_DEFS = [
  { id: "stats",   label: "Stats",   icon: Sigma },
  { id: "columns", label: "Columns", icon: Columns3 },
  { id: "formula", label: "Formula", icon: FunctionSquare },
  { id: "sort",    label: "Sort",    icon: ArrowUpDown },
];

function fmt(n) {
  if (n == null || isNaN(n)) return "—";
  return Number.isInteger(n)
    ? n.toLocaleString()
    : n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

// ── Sub-panels ────────────────────────────────────────────────────────────────

function StatsPanel({ data, selectedIds, numericFields }) {
  const [field, setField]       = useState(numericFields[0]?.key || "");
  const [showStats, setShowStats] = useState(false);

  const scope = selectedIds.length > 0 ? data.filter((r) => selectedIds.includes(r.id)) : data;

  const stats = useMemo(() => {
    if (!field) return null;
    const vals = scope.map((r) => parseFloat(r[field])).filter((v) => !isNaN(v));
    if (!vals.length) return null;
    const sum = vals.reduce((a, b) => a + b, 0);
    return { count: vals.length, sum, avg: sum / vals.length, min: Math.min(...vals), max: Math.max(...vals) };
  }, [scope, field]);

  if (!numericFields.length) return (
    <p className="text-slate-500 text-[11px] italic">No numeric fields — add formula columns to analyse values.</p>
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <Sigma className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
        <span className="text-slate-400 text-[11px]">Analyse field:</span>
        <div className="relative">
          <select
            value={field}
            onChange={(e) => { setField(e.target.value); setShowStats(true); }}
            className="text-[11px] bg-slate-700 border border-white/20 rounded-lg px-2 py-0.5 text-white focus:outline-none pr-6 appearance-none"
          >
            {numericFields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
          </select>
          <ChevronDown className="absolute right-1 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
        </div>
        <button
          onClick={() => setShowStats((s) => !s)}
          className="px-2 py-0.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-semibold transition"
        >
          {showStats ? "Hide" : "Show"} Stats
        </button>
        {selectedIds.length > 0 && (
          <span className="text-[11px] text-amber-400 font-semibold">
            Scoped to {selectedIds.length} selected row{selectedIds.length > 1 ? "s" : ""}
          </span>
        )}
      </div>
      {showStats && stats && (
        <div className="flex flex-wrap gap-2 pt-1">
          {[
            { icon: Hash,         label: "Count",   val: stats.count,      color: "text-slate-300" },
            { icon: Sigma,        label: "Sum",      val: fmt(stats.sum),   color: "text-emerald-400" },
            { icon: BarChart2,    label: "Average",  val: fmt(stats.avg),   color: "text-blue-400" },
            { icon: TrendingDown, label: "Min",      val: fmt(stats.min),   color: "text-amber-400" },
            { icon: TrendingUp,   label: "Max",      val: fmt(stats.max),   color: "text-rose-400" },
          ].map(({ icon: Icon, label, val, color }) => (
            <div key={label} className="flex items-center gap-1.5 bg-white/5 rounded-xl px-3 py-1.5">
              <Icon className={`w-3 h-3 ${color} shrink-0`} />
              <span className="text-slate-400 text-[10px]">{label}</span>
              <span className={`font-bold text-[11px] ${color}`}>{val}</span>
            </div>
          ))}
        </div>
      )}
      {showStats && !stats && (
        <p className="text-slate-500 text-[11px] italic">No numeric values in "{numericFields.find(f => f.key === field)?.label}".</p>
      )}
    </div>
  );
}

function ColumnsPanel({ allColumns, computedColumns, hiddenCols, onToggleColumn, onShowAllColumns, onRemoveColumn }) {
  const combined = [
    ...allColumns,
    ...computedColumns.map((c) => ({ ...c, computed: true })),
  ];
  const hiddenCount = hiddenCols.size;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-slate-400 text-[11px]">
          {combined.length} columns · {hiddenCount > 0 ? `${hiddenCount} hidden` : "all visible"}
        </span>
        {hiddenCount > 0 && (
          <button onClick={onShowAllColumns} className="text-[11px] text-emerald-400 hover:text-emerald-300 font-semibold">
            Show all
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {combined.map((col) => {
          const hidden = hiddenCols.has(col.key);
          return (
            <div key={col.key} className="flex items-center gap-0.5">
              <button
                onClick={() => onToggleColumn(col.key)}
                className={`flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-medium transition ${
                  hidden
                    ? "bg-white/5 text-slate-500 hover:bg-white/10"
                    : "bg-emerald-600/30 text-emerald-300 hover:bg-emerald-600/50"
                }`}
              >
                {hidden ? <EyeOff className="w-2.5 h-2.5" /> : <Eye className="w-2.5 h-2.5" />}
                {col.label}
                {col.computed && <span className="ml-0.5 text-[9px] opacity-60">fx</span>}
              </button>
              {col.computed && (
                <button
                  onClick={() => onRemoveColumn(col.key)}
                  className="text-slate-600 hover:text-rose-400 transition"
                  title="Remove formula column"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FormulaPanel({ data, allColumns, computedColumns, onAddColumn, onRemoveColumn, onWriteBack }) {
  const [name,       setName]       = useState("");
  const [formula,    setFormula]    = useState("");
  const [mapToField, setMapToField] = useState("");
  const [preview,    setPreview]    = useState(null);
  const [error,      setError]      = useState("");
  const [writing,    setWriting]    = useState(false);

  const sampleRow = data[0] || {};
  const fieldNames = Object.keys(sampleRow).filter((k) => !k.startsWith("__"));

  const handlePreview = () => {
    if (!formula.trim()) return;
    const res = validateFormula(formula, sampleRow);
    if (!res.valid) { setError(res.error); setPreview(null); }
    else { setError(""); setPreview(res.preview); }
  };

  const handleAdd = () => {
    if (!name.trim() || !formula.trim()) return;
    const res = validateFormula(formula, sampleRow);
    if (!res.valid) { setError(res.error); return; }
    onAddColumn({ label: name.trim(), formula: formula.trim(), mapToField: mapToField || null });
    setName(""); setFormula(""); setMapToField(""); setPreview(null); setError("");
  };

  const handleWriteBack = async (col) => {
    if (!onWriteBack || !col.mapToField) return;
    setWriting(true);
    const updates = data
      .map((row) => ({ id: row.id, field: col.mapToField, value: evalFormula(col.formula, row) }))
      .filter((u) => u.value !== "" && !String(u.value).startsWith("#ERR"));
    await onWriteBack(updates);
    setWriting(false);
  };

  return (
    <div className="space-y-3">
      {/* Active formula columns */}
      {computedColumns.length > 0 && (
        <div className="space-y-1">
          {computedColumns.map((col) => (
            <div key={col.key} className="flex items-center gap-2 bg-white/5 rounded-lg px-2.5 py-1.5 text-[11px]">
              <span className="text-emerald-400 font-mono shrink-0">fx</span>
              <span className="font-semibold text-white">{col.label}</span>
              <span className="text-slate-400 font-mono flex-1 truncate">{col.formula}</span>
              {col.mapToField && (
                <span className="text-amber-400 shrink-0">→ {col.mapToField}</span>
              )}
              {col.mapToField && onWriteBack && (
                <button
                  onClick={() => handleWriteBack(col)}
                  disabled={writing}
                  className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-600 hover:bg-amber-700 text-white font-semibold disabled:opacity-50"
                  title="Write computed values back to entity field"
                >
                  <Upload className="w-2.5 h-2.5" />
                  {writing ? "…" : "Write back"}
                </button>
              )}
              <button onClick={() => onRemoveColumn(col.key)} className="text-slate-600 hover:text-rose-400 transition shrink-0">
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Builder */}
      <div className="bg-white/5 rounded-xl p-3 space-y-2.5">
        <p className="text-[11px] font-semibold text-slate-300 uppercase tracking-wide">Add Formula Column</p>

        <div className="flex gap-2 flex-wrap">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Column name…"
            className="flex-1 min-w-[120px] text-[11px] bg-slate-700 border border-white/20 rounded-lg px-2 py-1 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
          />
          <select
            value={mapToField}
            onChange={(e) => setMapToField(e.target.value)}
            className="text-[11px] bg-slate-700 border border-white/20 rounded-lg px-2 py-1 text-white focus:outline-none"
            title="Optionally map computed value back to an entity field for write-back"
          >
            <option value="">Display only (no write-back)</option>
            {allColumns.filter((c) => !c.computed).map((c) => (
              <option key={c.key} value={c.key}>{c.label} ({c.key})</option>
            ))}
          </select>
        </div>

        {/* Formula input */}
        <div className="flex gap-1.5 items-start">
          <span className="text-emerald-400 font-mono text-sm mt-1 shrink-0">fx</span>
          <div className="flex-1 space-y-1">
            <input
              value={formula}
              onChange={(e) => { setFormula(e.target.value); setError(""); setPreview(null); }}
              onKeyDown={(e) => e.key === "Enter" && handlePreview()}
              placeholder="=ROUND(price * 1.15, 2)"
              className="w-full text-[11px] font-mono bg-slate-700 border border-white/20 rounded-lg px-2 py-1 text-emerald-300 placeholder-slate-600 focus:outline-none focus:border-emerald-500"
            />
            {error && (
              <div className="flex items-center gap-1 text-[10px] text-rose-400">
                <AlertCircle className="w-3 h-3 shrink-0" /> {error}
              </div>
            )}
            {preview != null && !error && (
              <div className="flex items-center gap-1 text-[10px] text-emerald-400">
                <CheckCircle2 className="w-3 h-3 shrink-0" />
                Preview on first row: <span className="font-mono font-bold ml-1">{String(preview)}</span>
              </div>
            )}
          </div>
        </div>

        {/* Available fields */}
        {fieldNames.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {fieldNames.slice(0, 18).map((f) => (
              <button
                key={f}
                onClick={() => setFormula((prev) => prev + f)}
                className="text-[10px] font-mono bg-slate-700 hover:bg-slate-600 text-slate-300 px-1.5 py-0.5 rounded transition"
                title={`Insert field: ${f}`}
              >
                {f}
              </button>
            ))}
          </div>
        )}

        {/* Examples */}
        <div>
          <p className="text-[10px] text-slate-500 mb-1">Examples:</p>
          <div className="flex flex-wrap gap-1">
            {FORMULA_EXAMPLES.slice(0, 6).map((ex) => (
              <button
                key={ex.label}
                onClick={() => { setFormula(ex.formula); setError(""); setPreview(null); }}
                className="text-[10px] bg-slate-700 hover:bg-slate-600 text-slate-400 hover:text-white px-1.5 py-0.5 rounded transition"
                title={ex.formula}
              >
                {ex.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-1.5">
          <button
            onClick={handlePreview}
            disabled={!formula.trim()}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-600 hover:bg-slate-500 text-white text-[11px] font-semibold disabled:opacity-40 transition"
          >
            <Play className="w-3 h-3" /> Preview
          </button>
          <button
            onClick={handleAdd}
            disabled={!name.trim() || !formula.trim()}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-semibold disabled:opacity-40 transition"
          >
            <Plus className="w-3 h-3" /> Add Column
          </button>
        </div>
      </div>
    </div>
  );
}

function SortPanel({ allColumns, computedColumns, sortKey, sortDir, onSort }) {
  const cols = [
    ...allColumns,
    ...computedColumns.map((c) => ({ key: c.key, label: `${c.label} (fx)` })),
  ];

  return (
    <div className="space-y-2">
      <p className="text-[11px] text-slate-400">Click a column to sort. Click again to reverse. Third click removes sort.</p>
      <div className="flex flex-wrap gap-1.5">
        {cols.map((col) => {
          const active = sortKey === col.key;
          return (
            <button
              key={col.key}
              onClick={() => onSort(col.key)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium transition ${
                active
                  ? "bg-emerald-600 text-white"
                  : "bg-white/10 text-slate-300 hover:bg-white/20"
              }`}
            >
              {col.label}
              {active && (sortDir === "asc"
                ? <ArrowUp className="w-3 h-3" />
                : <ArrowDown className="w-3 h-3" />
              )}
            </button>
          );
        })}
      </div>
      {sortKey && (
        <p className="text-[10px] text-emerald-400">
          Sorted by <strong>{cols.find((c) => c.key === sortKey)?.label}</strong> ({sortDir === "asc" ? "A → Z / Low → High" : "Z → A / High → Low"})
        </p>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function SpreadsheetToolbar({
  // Direct props
  numericFields    = [],
  heatmapField,
  heatmapOn        = false,
  onHeatmapToggle,
  selectedIds      = [],
  onSelectAll,
  onClearSelect,
  onWriteBack,

  // From useSpreadsheet().toolbarProps
  data             = [],
  allColumns       = [],
  computedColumns  = [],
  hiddenCols       = new Set(),
  sortKey          = null,
  sortDir          = "asc",
  onAddColumn,
  onRemoveColumn,
  onUpdateColumn,
  onToggleColumn,
  onShowAllColumns,
  onSort,
}) {
  const [activeTab, setActiveTab] = useState(null); // null = collapsed

  const allNumericFields = [
    ...numericFields,
    ...computedColumns.map((c) => ({ key: c.key, label: `${c.label} (fx)` })),
  ];

  const toggleTab = (id) => setActiveTab((prev) => (prev === id ? null : id));

  const tabBadge = {
    columns: hiddenCols.size > 0 ? hiddenCols.size : computedColumns.length || null,
    formula: computedColumns.length || null,
    sort:    sortKey ? 1 : null,
  };

  return (
    <div className="bg-slate-800 text-white rounded-2xl px-4 py-2.5 space-y-2.5">
      {/* ── Top bar ── */}
      <div className="flex flex-wrap items-center gap-2">

        {/* Select all / clear */}
        {onSelectAll && (
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={onSelectAll}
              className="px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 transition text-[11px] font-semibold"
            >
              Select All ({data.length})
            </button>
            {selectedIds.length > 0 && (
              <button
                onClick={onClearSelect}
                className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 transition text-[11px]"
              >
                <X className="w-3 h-3" /> Clear ({selectedIds.length})
              </button>
            )}
          </div>
        )}

        <div className="h-4 w-px bg-white/20 shrink-0" />

        {/* Tab buttons */}
        {TAB_DEFS.map(({ id, label, icon: Icon }) => {
          const badge = tabBadge[id];
          const active = activeTab === id;
          return (
            <button
              key={id}
              onClick={() => toggleTab(id)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition ${
                active ? "bg-white/20 text-white" : "text-slate-400 hover:text-white hover:bg-white/10"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
              {badge != null && (
                <span className={`text-[9px] px-1 rounded-full font-bold ${active ? "bg-white/30" : "bg-emerald-600"}`}>
                  {badge}
                </span>
              )}
            </button>
          );
        })}

        {/* Heatmap toggle */}
        {heatmapField && onHeatmapToggle && (
          <>
            <div className="h-4 w-px bg-white/20 shrink-0" />
            <button
              onClick={onHeatmapToggle}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition ${
                heatmapOn ? "bg-amber-500 text-white" : "bg-white/10 hover:bg-white/20 text-slate-200"
              }`}
            >
              <Flame className="w-3.5 h-3.5" /> Heatmap
            </button>
          </>
        )}

        {/* Sort indicator pill */}
        {sortKey && (
          <span className="ml-auto flex items-center gap-1 text-[11px] text-emerald-400 font-semibold shrink-0">
            {sortDir === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
            {allColumns.find((c) => c.key === sortKey)?.label ||
             computedColumns.find((c) => c.key === sortKey)?.label ||
             sortKey}
          </span>
        )}

        {/* Selected scope indicator */}
        {selectedIds.length > 0 && !sortKey && (
          <span className="ml-auto text-slate-400 text-[11px] shrink-0">
            Scope: <span className="text-white font-semibold">{selectedIds.length} selected</span>
          </span>
        )}
      </div>

      {/* ── Expanded panel ── */}
      {activeTab && (
        <div className="border-t border-white/10 pt-2.5">
          {activeTab === "stats" && (
            <StatsPanel
              data={data}
              selectedIds={selectedIds}
              numericFields={allNumericFields}
            />
          )}
          {activeTab === "columns" && (
            <ColumnsPanel
              allColumns={allColumns}
              computedColumns={computedColumns}
              hiddenCols={hiddenCols}
              onToggleColumn={onToggleColumn || (() => {})}
              onShowAllColumns={onShowAllColumns || (() => {})}
              onRemoveColumn={onRemoveColumn || (() => {})}
            />
          )}
          {activeTab === "formula" && (
            <FormulaPanel
              data={data}
              allColumns={allColumns}
              computedColumns={computedColumns}
              onAddColumn={onAddColumn || (() => {})}
              onRemoveColumn={onRemoveColumn || (() => {})}
              onWriteBack={onWriteBack}
            />
          )}
          {activeTab === "sort" && (
            <SortPanel
              allColumns={allColumns}
              computedColumns={computedColumns}
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={onSort || (() => {})}
            />
          )}
        </div>
      )}
    </div>
  );
}
