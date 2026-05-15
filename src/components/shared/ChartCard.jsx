import React, { useState } from "react";
import { BarChart2, Code2, Pin, Check, Table2, Bot, X, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { makeChartDescription, rowCountLabel, sourceMeta } from "@/components/shared/chartUtils";

const RAILWAY_URL = "https://newsconseenwebapp-production.up.railway.app";
const SOURCE_TONE = {
  emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
  blue:    "bg-blue-50 text-blue-700 border-blue-200",
  indigo:  "bg-indigo-50 text-indigo-700 border-indigo-200",
  violet:  "bg-violet-50 text-violet-700 border-violet-200",
  amber:   "bg-amber-50 text-amber-700 border-amber-200",
  slate:   "bg-slate-50 text-slate-600 border-slate-200",
};

export default function ChartCard({ title, description, sql, currentUser, entity, tableData, children }) {
  const [view, setView] = useState("chart");
  const [pinned, setPinned] = useState(false);
  const [pinning, setPinning] = useState(false);
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [copilotLoading, setCopilotLoading] = useState(false);
  const [copilotText, setCopilotText] = useState("");
  const navigate = useNavigate();

  const handlePin = async () => {
    if (pinning || pinned) return;
    setPinning(true);
    try {
      const rows = Array.isArray(tableData) ? tableData : [];
      await base44.entities.ReportChart.create({
        title, sql_query: sql || "", chart_type: "bar", status: "active",
        company_id: currentUser?.company_id,
        description: (copilotText
          ? `${copilotText.slice(0, 360)} [AI insight]`
          : makeChartDescription({ chart: { title, description }, entity, sql, rows })),
        source: "entity_analytics",
        table_snapshot: rows.length ? JSON.stringify({ headers: Object.keys(rows[0] || {}), rows: rows.map(r => Object.values(r)) }) : "",
        shared_with_roles: ["admin","analyst","executive"],
      });
      setPinned(true);
      setTimeout(() => setPinned(false), 3000);
    } catch (e) {}
    setPinning(false);
  };

  const handleOpenInQB = () => {
    if (!sql) return;
    sessionStorage.setItem("qb_load_sql", sql);
    sessionStorage.setItem("qb_load_title", title);
    navigate("/QueryBuilder");
  };

  const handleCopilot = async () => {
    if (copilotOpen) { setCopilotOpen(false); return; }
    setCopilotOpen(true);
    if (copilotText) return; // already loaded
    setCopilotLoading(true);
    try {
      const prompt = `Explain this ${entity || "analytics"} chart in 2-3 sentences for an operator: "${title}"${description ? ` (${description})` : ""}. ${sql ? `The underlying SQL is: ${sql}` : ""} Cite the analytics table used if relevant. Be concise and practical.`;
      const resp = await fetch(`${RAILWAY_URL}/copilot/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: prompt, company_id: currentUser?.company_id }),
      });
      if (resp.ok) {
        const data = await resp.json();
        setCopilotText(data.answer || data.response || data.message || "No explanation available.");
      } else {
        setCopilotText("Idjwi unavailable — check Railway connection.");
      }
    } catch (e) {
      setCopilotText("Could not reach Idjwi. Ensure python_layer is running.");
    }
    setCopilotLoading(false);
  };

  const rows = Array.isArray(tableData) ? tableData : [];
  const cols = rows.length > 0 ? Object.keys(rows[0]) : [];
  const meta = sourceMeta({ sql_query: sql, source: "base44" }, { source: sql ? "query" : "base44" });
  const rowLabel = rowCountLabel(rows);

  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-5 flex flex-col gap-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-bold text-slate-600 uppercase tracking-wider truncate">{title}</p>
          {description && <p className="text-[10px] text-slate-400 mt-0.5">{description}</p>}
          <div className="flex flex-wrap items-center gap-1.5 mt-2">
            <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${SOURCE_TONE[meta.tone] || SOURCE_TONE.slate}`}>
              {meta.label}
            </span>
            <span className="text-[10px] text-slate-400">{meta.detail}</span>
            {rowLabel && <span className="text-[10px] text-slate-300">·</span>}
            {rowLabel && <span className="text-[10px] text-slate-400">{rowLabel}</span>}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <div className="flex items-center bg-slate-100 rounded-lg p-0.5">
            <button onClick={() => setView("chart")} title="Chart" className={`px-2 py-1 rounded-md text-[10px] font-semibold flex items-center gap-1 transition-all ${view==="chart" ? "bg-white text-slate-700 shadow-sm" : "text-slate-400 hover:text-slate-600"}`}>
              <BarChart2 className="w-3 h-3" /> Chart
            </button>
            <button onClick={() => setView("query")} title="SQL" className={`px-2 py-1 rounded-md text-[10px] font-semibold flex items-center gap-1 transition-all ${view==="query" ? "bg-white text-slate-700 shadow-sm" : "text-slate-400 hover:text-slate-600"}`}>
              <Code2 className="w-3 h-3" /> Query
            </button>
            <button onClick={() => setView("table")} title="Table view" className={`px-2 py-1 rounded-md text-[10px] font-semibold flex items-center gap-1 transition-all ${view==="table" ? "bg-white text-slate-700 shadow-sm" : "text-slate-400 hover:text-slate-600"}`}>
              <Table2 className="w-3 h-3" /> Table
            </button>
          </div>
          <button onClick={handlePin} title={pinned ? "Pinned!" : "Pin to Reports"} className={`p-1.5 rounded-lg transition-all ${pinned ? "bg-emerald-100 text-emerald-600" : "text-slate-400 hover:text-slate-600 hover:bg-slate-100"}`}>
            {pinned ? <Check className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {view === "chart" && (
        <div className="min-h-[180px]">{children}</div>
      )}

      {view === "query" && (
        <div>
          <pre className="bg-slate-950 text-emerald-400 text-[10px] rounded-xl p-4 overflow-x-auto whitespace-pre-wrap leading-relaxed min-h-[180px]">{sql || "-- No SQL available for this chart"}</pre>
          {sql && <button onClick={handleOpenInQB} className="mt-2 text-[11px] text-emerald-600 hover:text-emerald-700 font-semibold hover:underline">Open in Query Builder →</button>}
        </div>
      )}

      {view === "table" && (
        <div className="overflow-auto max-h-[260px] rounded-xl border border-slate-100">
          {rows.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-10">No table data available</p>
          ) : (
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-slate-50 border-b border-slate-200">
                <tr>
                  {cols.map(c => (
                    <th key={c} className="text-left px-3 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-slate-50/60"}>
                    {cols.map(c => (
                      <td key={c} className="px-3 py-1.5 text-slate-700 whitespace-nowrap max-w-[160px] truncate">{String(row[c] ?? "—")}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Copilot explain button + panel */}
      <div className="flex items-center justify-between mt-0.5">
        <button
          onClick={handleCopilot}
          title={copilotOpen ? "Close AI explanation" : "Explain this chart with AI"}
          className={`flex items-center gap-1.5 text-[10px] font-medium rounded-lg px-2 py-1 transition-all ${copilotOpen ? "bg-violet-100 text-violet-700" : "text-slate-400 hover:text-violet-600 hover:bg-violet-50"}`}
        >
          {copilotLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Bot className="w-3 h-3" />}
          {copilotOpen ? "Hide AI" : "Explain"}
        </button>
        {copilotOpen && copilotText && (
          <button onClick={() => { setCopilotOpen(false); }} className="text-slate-300 hover:text-slate-500 transition-colors">
            <X className="w-3 h-3" />
          </button>
        )}
      </div>

      {copilotOpen && (
        <div className="rounded-xl bg-gradient-to-br from-violet-50 to-slate-50 border border-violet-100 p-3">
          {copilotLoading ? (
            <div className="flex items-center gap-2 text-[11px] text-violet-500">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Asking copilot...
            </div>
          ) : (
            <p className="text-[11px] text-slate-700 leading-relaxed">{copilotText}</p>
          )}
        </div>
      )}
    </div>
  );
}
