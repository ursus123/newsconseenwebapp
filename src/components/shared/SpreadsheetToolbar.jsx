import React, { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { BarChart2, Sigma, Hash, TrendingUp, TrendingDown, Flame, X, ChevronDown } from "lucide-react";

/**
 * SpreadsheetToolbar — Excel/Sheets-like analysis bar for any dataset.
 *
 * Props:
 *   data            — full array of records currently shown
 *   numericFields   — [{ key, label }] — fields eligible for SUM/AVG/MIN/MAX
 *   heatmapField    — string key to use for heatmap coloring (optional)
 *   heatmapOn       — bool
 *   onHeatmapToggle — fn()
 *   selectedIds     — currently selected row ids
 *   onSelectAll     — fn()
 *   onClearSelect   — fn()
 */
export default function SpreadsheetToolbar({
  data = [],
  numericFields = [],
  heatmapField,
  heatmapOn = false,
  onHeatmapToggle,
  selectedIds = [],
  onSelectAll,
  onClearSelect,
}) {
  const [activeField, setActiveField] = useState(numericFields[0]?.key || "");
  const [showStats, setShowStats] = useState(false);

  const selectedData = selectedIds.length > 0
    ? data.filter((r) => selectedIds.includes(r.id))
    : data;

  const stats = useMemo(() => {
    if (!activeField) return null;
    const vals = selectedData.map((r) => parseFloat(r[activeField])).filter((v) => !isNaN(v));
    if (!vals.length) return null;
    const sum = vals.reduce((a, b) => a + b, 0);
    const avg = sum / vals.length;
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    return { count: vals.length, sum, avg, min, max };
  }, [selectedData, activeField]);

  const fmt = (n) =>
    Number.isInteger(n) ? n.toLocaleString() : n.toLocaleString(undefined, { maximumFractionDigits: 2 });

  if (!numericFields.length && !heatmapField && !onSelectAll) return null;

  return (
    <div className="bg-slate-800 text-white rounded-2xl px-4 py-2.5 flex flex-wrap items-center gap-3 text-xs">
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

      {/* Numeric field selector + stats */}
      {numericFields.length > 0 && (
        <>
          <div className="h-4 w-px bg-white/20 shrink-0" />
          <div className="flex items-center gap-1.5 flex-wrap">
            <Sigma className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span className="text-slate-400 text-[11px]">Analyze:</span>
            <div className="relative">
              <select
                value={activeField}
                onChange={(e) => { setActiveField(e.target.value); setShowStats(true); }}
                className="text-[11px] bg-slate-700 border border-white/20 rounded-lg px-2 py-0.5 text-white focus:outline-none pr-6 appearance-none"
              >
                {numericFields.map((f) => (
                  <option key={f.key} value={f.key}>{f.label}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-1 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
            </div>
            <button
              onClick={() => setShowStats((s) => !s)}
              className="px-2 py-0.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-semibold transition"
            >
              {showStats ? "Hide" : "Show"} Stats
            </button>
          </div>
        </>
      )}

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
            <Flame className="w-3.5 h-3.5" />
            Heatmap
          </button>
        </>
      )}

      {/* Scope indicator */}
      {selectedIds.length > 0 && (
        <span className="ml-auto text-slate-400 text-[11px] shrink-0">
          Scope: <span className="text-white font-semibold">{selectedIds.length} selected</span>
        </span>
      )}

      {/* Stats row */}
      {showStats && stats && (
        <div className="w-full flex flex-wrap gap-3 pt-2 border-t border-white/10">
          {[
            { icon: Hash,       label: "Count",   val: stats.count,           color: "text-slate-300" },
            { icon: Sigma,      label: "Sum",      val: fmt(stats.sum),        color: "text-emerald-400" },
            { icon: BarChart2,  label: "Average",  val: fmt(stats.avg),        color: "text-blue-400" },
            { icon: TrendingDown, label: "Min",    val: fmt(stats.min),        color: "text-amber-400" },
            { icon: TrendingUp, label: "Max",      val: fmt(stats.max),        color: "text-rose-400" },
          ].map(({ icon: Icon, label, val, color }) => (
            <div key={label} className="flex items-center gap-1.5 bg-white/5 rounded-xl px-3 py-1.5">
              <Icon className={`w-3 h-3 ${color} shrink-0`} />
              <span className="text-slate-400 text-[10px]">{label}</span>
              <span className={`font-bold text-[11px] ${color}`}>{val}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}