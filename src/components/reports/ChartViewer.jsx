import React, { useState, useEffect } from "react";
import { ArrowLeft, Edit, Loader2, RefreshCw, Code2 } from "lucide-react";
import { executeSQL } from "@/components/querybuilder/sqlEngine";
import ChartRenderer from "./ChartRenderer";
import { safeChartData } from "./ChartRenderer";

const RAILWAY_URL = "https://newsconseenwebapp-production.up.railway.app";

export default function ChartViewer({ chart, onClose, onEdit, currentUser }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showQuery, setShowQuery] = useState(false);
  const [lastFetched, setLastFetched] = useState(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);

    // Case 1: chart has SQL — run against analytics (live datamart)
    const sql = chart?.sql_query || chart?.sql;
    if (sql) {
      try {
        const result = await executeSQL(sql, {});
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
        setLastFetched(new Date());
      } catch (e) { setError(e.message); }
      setLoading(false);
      return;
    }

    // Case 2: chart was pinned from copilot tool — re-call tool live
    const toolName   = chart?.tool_name;
    const toolParams = chart?.tool_params;
    const companyId  = currentUser?.company_id;
    if (toolName && companyId) {
      try {
        let params = {};
        try { params = toolParams ? JSON.parse(toolParams) : {}; } catch (_) {}
        const resp = await fetch(`${RAILWAY_URL}/copilot/tool`, {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ tool_name: toolName, tool_input: params, company_id: companyId }),
        });
        if (resp.ok) {
          const result = await resp.json();
          // Flatten result to array of rows
          const raw = result.data || result.staff || result.competitors
            || result.records || result.rows || result.items || [];
          if (Array.isArray(raw)) {
            setData(raw.map(r => typeof r === "object" ? r : { value: r }));
          } else if (typeof raw === "object") {
            setData(Object.entries(raw).map(([k, v]) => ({ key: k, value: v })));
          }
          setLastFetched(new Date());
        } else {
          setError(`Tool call failed: ${resp.status}`);
        }
      } catch (e) { setError(e.message); }
      setLoading(false);
      return;
    }

    // Case 3: table snapshot (no live query) — show static data
    if (chart?.table_snapshot) {
      try {
        const snap = JSON.parse(chart.table_snapshot);
        setData(snap.rows?.map(r => Object.fromEntries(snap.headers.map((h, i) => [h, r[i]]))) || []);
        setLastFetched(null); // no live refresh possible
      } catch (_) {}
    }

    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [chart?.id]);

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
            {chart?.description && <p className="text-xs text-slate-400">{chart.description}</p>}
            {lastFetched && <p className="text-[10px] text-emerald-500 mt-0.5">● Live · {lastFetched.toLocaleTimeString()}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {(chart?.sql_query || chart?.tool_name) && (
            <button onClick={() => setShowQuery(q => !q)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border rounded-xl transition-all ${showQuery ? "bg-slate-800 border-slate-800 text-emerald-400" : "border-slate-200 hover:bg-slate-50"}`}>
              <Code2 className="w-3.5 h-3.5" /> Query
            </button>
          )}
          <button onClick={fetchData} disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-slate-200 rounded-xl hover:bg-slate-50 transition-all">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
          {onEdit && (
            <button onClick={() => onEdit(chart)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-slate-200 rounded-xl hover:bg-slate-50 transition-all">
              <Edit className="w-3.5 h-3.5" /> Edit
            </button>
          )}
        </div>
      </div>

      {/* Query label panel */}
      {showQuery && (
        <div className="bg-slate-950 px-6 py-4 border-b border-slate-800">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
            {chart?.sql_query ? "SQL Query — runs live against analytics datamart" : "Copilot Tool — re-called live on every open"}
          </p>
          <pre className="text-[11px] text-emerald-400 font-mono whitespace-pre-wrap">
            {chart?.sql_query || `Tool: ${chart?.tool_name}\nParams: ${chart?.tool_params || "{}"}`}
          </pre>
        </div>
      )}

      {/* Chart / table display */}
      <div className="flex-1 overflow-auto p-6">
        {loading && <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin text-slate-300" /></div>}
        {error && <div className="flex items-center justify-center h-64 text-rose-400 text-sm">Error: {error}</div>}
        {!loading && !error && (
          <>
            {chart?.chart_type === "table" ? (
              <div className="rounded-xl border border-slate-200 overflow-hidden">
                {data.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-10">No data</p>
                ) : (
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
                      <tr>{Object.keys(data[0]).map(k => <th key={k} className="px-3 py-2 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">{k}</th>)}</tr>
                    </thead>
                    <tbody>{data.map((row, i) => <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-slate-50/60"}>{Object.values(row).map((v, j) => <td key={j} className="px-3 py-2 text-slate-700 whitespace-nowrap max-w-xs truncate">{String(v ?? "—")}</td>)}</tr>)}</tbody>
                  </table>
                )}
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm">
                <ChartRenderer chart={chart} data={data} height={400} />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}