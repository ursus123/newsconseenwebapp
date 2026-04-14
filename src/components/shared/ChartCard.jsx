import React, { useState } from "react";
import { BarChart2, Code2, Pin, Check } from "lucide-react";
import { base44 } from "@/api/base44Client";

export default function ChartCard({ title, description, sql, currentUser, entity, children }) {
  const [view, setView] = useState("chart");
  const [pinned, setPinned] = useState(false);
  const [pinning, setPinning] = useState(false);

  const handlePin = async () => {
    if (pinning || pinned) return;
    setPinning(true);
    try {
      await base44.entities.ReportChart.create({
        title, sql_query: sql || "", chart_type: "bar", status: "active",
        company_id: currentUser?.company_id,
        description: "Pinned from " + (entity || "analytics"),
        shared_with_roles: ["admin","analyst","executive"],
      });
      setPinned(true);
      setTimeout(() => setPinned(false), 3000);
    } catch (e) {}
    setPinning(false);
  };

  const handleOpenInQB = () => {
    if (sql) localStorage.setItem("qb_preload_sql", sql);
    window.location.hash = "/Reports";
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-5 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-bold text-slate-600 uppercase tracking-wider truncate">{title}</p>
          {description && <p className="text-[10px] text-slate-400 mt-0.5">{description}</p>}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <div className="flex items-center bg-slate-100 rounded-lg p-0.5">
            <button onClick={() => setView("chart")} className={`px-2 py-1 rounded-md text-[10px] font-semibold flex items-center gap-1 transition-all ${view==="chart" ? "bg-white text-slate-700 shadow-sm" : "text-slate-400 hover:text-slate-600"}`}>
              <BarChart2 className="w-3 h-3" /> Chart
            </button>
            <button onClick={() => setView("query")} className={`px-2 py-1 rounded-md text-[10px] font-semibold flex items-center gap-1 transition-all ${view==="query" ? "bg-white text-slate-700 shadow-sm" : "text-slate-400 hover:text-slate-600"}`}>
              <Code2 className="w-3 h-3" /> Query
            </button>
          </div>
          <button onClick={handlePin} title={pinned ? "Pinned!" : "Pin to Reports"} className={`p-1.5 rounded-lg transition-all ${pinned ? "bg-emerald-100 text-emerald-600" : "text-slate-400 hover:text-slate-600 hover:bg-slate-100"}`}>
            {pinned ? <Check className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>
      {view === "chart" ? (
        <div className="min-h-[180px]">{children}</div>
      ) : (
        <div>
          <pre className="bg-slate-950 text-emerald-400 text-[10px] rounded-xl p-4 overflow-x-auto whitespace-pre-wrap leading-relaxed min-h-[180px]">{sql}</pre>
          {sql && <button onClick={handleOpenInQB} className="mt-2 text-[11px] text-emerald-600 hover:text-emerald-700 font-semibold hover:underline">Open in Query Builder →</button>}
        </div>
      )}
    </div>
  );
}
