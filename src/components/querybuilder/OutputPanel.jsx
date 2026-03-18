import React, { useState } from "react";
import { Code2, AlertCircle, Save, Layers, Network, Pin, BarChart2, FileText, Download } from "lucide-react";
import { exportCSV } from "./sqlEngine";
import ExportMenu from "./ExportMenu";
import SaveQueryModal from "./SaveQueryModal";
import SaveDataModelModal from "./SaveDataModelModal";
import AddToGraphModal from "./AddToGraphModal";

export default function OutputPanel({ results, error, message, loading, sql, onPinWidget, onOpenChart }) {
  const [view, setView] = useState("table");
  const [modal, setModal] = useState(null);

  const columns = results?.length
    ? Object.keys(results[0]).filter((k) => !["attachment_urls", "image_url", "photo_url", "attachment_url"].includes(k))
    : [];

  const hasResults = results?.length > 0;
  const isSelect = sql?.trim().toUpperCase().startsWith("SELECT");

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Action buttons */}
      <div className="shrink-0 p-3 border-b border-white/5 space-y-2">
        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Actions</p>

        {/* Result actions — shown only when there are SELECT results */}
        {hasResults && isSelect && (
          <div className="grid grid-cols-2 gap-1.5 mb-2">
            <button
              onClick={onPinWidget}
              className="flex items-center gap-1.5 px-2 py-2 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 text-[10px] font-medium transition-colors"
            >
              <Pin className="w-3 h-3 shrink-0" /> Pin Widget
            </button>
            <button
              onClick={onOpenChart}
              className="flex items-center gap-1.5 px-2 py-2 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 text-[10px] font-medium transition-colors"
            >
              <BarChart2 className="w-3 h-3 shrink-0" /> Open Chart
            </button>
            <button
              onClick={() => setModal("report")}
              className="flex items-center gap-1.5 px-2 py-2 rounded-lg bg-violet-500/10 hover:bg-violet-500/20 text-violet-400 text-[10px] font-medium transition-colors"
            >
              <FileText className="w-3 h-3 shrink-0" /> Report
            </button>
            <div>
              <ExportMenu results={results} sql={sql} />
            </div>
          </div>
        )}

        <button
          onClick={() => setModal("save")}
          disabled={!sql}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Save className="w-3.5 h-3.5" /> Save Query
        </button>
        <button
          onClick={() => setModal("model")}
          disabled={!hasResults}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-violet-500/10 hover:bg-violet-500/20 text-violet-400 text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Layers className="w-3.5 h-3.5" /> Save as Data Model
        </button>
        <button
          onClick={() => setModal("graph")}
          disabled={!hasResults}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Network className="w-3.5 h-3.5" /> Add to Entity Graph
        </button>
        {hasResults && (
          <button
            onClick={() => exportCSV(results)}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-700/50 hover:bg-slate-700 text-slate-400 text-xs font-medium transition-colors"
          >
            <Download className="w-3.5 h-3.5" /> Export CSV
          </button>
        )}
      </div>

      {/* Status */}
      {(message || error) && (
        <div className={`shrink-0 px-3 py-2 text-[11px] font-mono border-b border-white/5 ${error ? "text-rose-400 bg-rose-500/5" : "text-emerald-400 bg-emerald-500/5"}`}>
          {error ? <span className="flex items-center gap-1.5"><AlertCircle className="w-3 h-3" />{error}</span> : message}
        </div>
      )}

      {/* Results header */}
      {hasResults && (
        <div className="shrink-0 flex items-center justify-between px-3 py-2 border-b border-white/5 bg-slate-800/20">
          <span className="text-[10px] text-slate-500">{results.length} rows · {columns.length} cols</span>
          <div className="flex items-center gap-1">
            <button onClick={() => setView("table")}
              className={`px-2 py-0.5 rounded text-[10px] transition-colors ${view === "table" ? "bg-white/10 text-white" : "text-slate-500 hover:text-slate-300"}`}>
              Table
            </button>
            <button onClick={() => setView("json")}
              className={`px-2 py-0.5 rounded text-[10px] transition-colors ${view === "json" ? "bg-white/10 text-white" : "text-slate-500 hover:text-slate-300"}`}>
              <Code2 className="w-3 h-3 inline mr-0.5" />JSON
            </button>
          </div>
        </div>
      )}

      {/* Result content */}
      <div className="flex-1 overflow-auto">
        {!hasResults && !error && !loading && (
          <div className="flex items-center justify-center h-full text-slate-600 text-xs font-mono">Run a query to preview results</div>
        )}
        {loading && (
          <div className="flex items-center justify-center h-full text-slate-500 text-xs font-mono animate-pulse">Executing…</div>
        )}
        {error && !hasResults && (
          <div className="p-4 text-rose-400 text-xs font-mono">
            <AlertCircle className="w-4 h-4 inline mr-1.5" />{error}
          </div>
        )}
        {hasResults && view === "table" && (
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-10 bg-slate-800">
              <tr>
                <th className="px-3 py-2 text-left text-slate-500 font-mono font-semibold border-b border-white/5 w-8">#</th>
                {columns.map((c) => (
                  <th key={c} className="px-3 py-2 text-left text-slate-400 font-mono font-semibold border-b border-white/5 whitespace-nowrap">{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {results.map((row, i) => (
                <tr key={row.id || i} className={`border-b border-white/3 hover:bg-white/3 transition-colors ${i % 2 === 1 ? "bg-white/[0.015]" : ""}`}>
                  <td className="px-3 py-1.5 text-slate-600 font-mono">{i + 1}</td>
                  {columns.map((c) => {
                    const val = row[c];
                    const display = Array.isArray(val) ? `[${val.length}]` :
                      typeof val === "object" && val !== null ? JSON.stringify(val).slice(0, 50) :
                      val != null ? String(val) : "";
                    return (
                      <td key={c} className="px-3 py-1.5 text-slate-300 whitespace-nowrap max-w-[160px] overflow-hidden text-ellipsis font-mono text-[11px]">
                        {display || <span className="text-slate-700">NULL</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {hasResults && view === "json" && (
          <pre className="p-4 text-[10px] text-slate-300 font-mono whitespace-pre-wrap leading-4">
            {JSON.stringify(results.slice(0, 50), null, 2)}
            {results.length > 50 && <span className="text-slate-600">{"\n"}… {results.length - 50} more rows</span>}
          </pre>
        )}
      </div>

      {/* Modals */}
      {modal === "save" && <SaveQueryModal sql={sql} results={results} onClose={() => setModal(null)} />}
      {modal === "model" && <SaveDataModelModal sql={sql} results={results} onClose={() => setModal(null)} />}
      {modal === "graph" && <AddToGraphModal sql={sql} results={results} onClose={() => setModal(null)} />}
      {modal === "report" && (
        <ReportModal sql={sql} onClose={() => setModal(null)} />
      )}
    </div>
  );
}

function ReportModal({ sql, onClose }) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const { base44 } = await import("@/api/base44Client");
      await base44.entities.Report.create({
        title: sql.slice(0, 50).trim(),
        type: "custom",
        content: sql,
        status: "draft",
      });
      setSaved(true);
      setTimeout(onClose, 800);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-slate-800 border border-white/10 rounded-2xl w-[380px] shadow-2xl p-5" onClick={(e) => e.stopPropagation()}>
        <p className="text-sm font-semibold text-slate-200 mb-3">Create Report from Query</p>
        <p className="text-xs text-slate-400 mb-4">This will save the SQL as a draft Report record.</p>
        <div className="bg-slate-900 rounded-lg p-3 mb-4">
          <pre className="text-[10px] font-mono text-slate-400 line-clamp-4">{sql}</pre>
        </div>
        <div className="flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 text-xs text-slate-500 hover:text-white transition-colors">Cancel</button>
          <button onClick={handleSave} disabled={saving || saved}
            className="px-4 py-1.5 bg-violet-600 hover:bg-violet-700 text-white text-xs rounded-lg transition-colors disabled:opacity-60">
            {saved ? "Saved!" : saving ? "Saving…" : "Create Report"}
          </button>
        </div>
      </div>
    </div>
  );
}