import React, { useState, useEffect } from "react";
import { ArrowLeft, Edit, Loader2 } from "lucide-react";
import { executeSQL } from "@/components/querybuilder/sqlEngine";
import ChartRenderer from "./ChartRenderer";
import { safeChartData } from "./ChartRenderer";

export default function ChartViewer({ chart, onClose, onEdit }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const sql = chart?.sql_query || chart?.sql;
    if (!sql) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    executeSQL(sql, {})
      .then((result) => {
        const rows = (result.rows || []).map((row) => {
          const clean = {};
          Object.entries(row).forEach(([k, v]) => {
            if (v === null || v === undefined) clean[k] = null;
            else if (typeof v === "boolean") clean[k] = v ? "Yes" : "No";
            else if (Array.isArray(v)) clean[k] = v.map((i) => typeof i === "object" ? JSON.stringify(i) : String(i)).join(", ");
            else if (typeof v === "object") clean[k] = JSON.stringify(v);
            else clean[k] = v;
          });
          return clean;
        });
        setData(rows);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [chart?.sql_query, chart?.sql]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-white shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <ArrowLeft className="w-4 h-4 text-slate-500" />
          </button>
          <div>
            <h2 className="text-base font-bold text-slate-800">{chart?.title}</h2>
            {chart?.description && (
              <p className="text-xs text-slate-400">{chart.description}</p>
            )}
          </div>
        </div>
        {onEdit && (
          <button
            onClick={() => onEdit(chart)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-slate-200 rounded-xl hover:bg-slate-50 transition-all"
          >
            <Edit className="w-3.5 h-3.5" />
            Edit Chart
          </button>
        )}
      </div>

      {/* Chart display */}
      <div className="flex-1 overflow-auto p-6">
        {loading && (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="w-6 h-6 animate-spin text-slate-300" />
          </div>
        )}
        {error && (
          <div className="flex items-center justify-center h-64 text-rose-400 text-sm">
            Error: {error}
          </div>
        )}
        {!loading && !error && (
          <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm">
            <ChartRenderer chart={chart} data={data} height={400} />
          </div>
        )}

        {/* SQL reference */}
        {chart?.sql_query && (
          <div className="mt-6 bg-slate-50 rounded-xl p-4">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">SQL Query</p>
            <pre className="text-xs font-mono text-slate-500 whitespace-pre-wrap">{chart.sql_query}</pre>
          </div>
        )}
      </div>
    </div>
  );
}