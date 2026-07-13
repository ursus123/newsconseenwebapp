import React, { useMemo, useState } from "react";
import { Activity, ArrowUpRight, BarChart2, Brain, Check, Code2, Loader2, Pin, Table2, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { ncClient } from "@/api/ncClient";
import { makeChartDescription, rowCountLabel, sourceMeta } from "@/components/shared/chartUtils";
import TeachIdjwiButton from "@/components/shared/TeachIdjwiButton";
import { RAILWAY_URL, RAILWAY_API_KEY, authHeaders } from "@/config/api";

const SOURCE_TONE = {
  emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
  blue:    "bg-blue-50 text-blue-700 border-blue-200",
  indigo:  "bg-indigo-50 text-indigo-700 border-indigo-200",
  violet:  "bg-violet-50 text-violet-700 border-violet-200",
  amber:   "bg-amber-50 text-amber-700 border-amber-200",
  slate:   "bg-slate-50 text-slate-600 border-slate-200",
};

function extractRowsFromChildren(node) {
  const found = [];
  const visit = (child) => {
    if (!child || typeof child !== "object") return;
    if (Array.isArray(child)) {
      child.forEach(visit);
      return;
    }
    if (Array.isArray(child.props?.data)) found.push(child.props.data);
    React.Children.forEach(child.props?.children, visit);
  };
  React.Children.forEach(node, visit);
  return found.find(rows => rows.length > 0) || [];
}

function formatValue(value) {
  if (value == null || value === "") return "0";
  if (typeof value === "number") {
    return Number.isInteger(value)
      ? value.toLocaleString()
      : value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }
  const n = Number(value);
  if (!Number.isNaN(n) && String(value).trim() !== "") {
    return Number.isInteger(n)
      ? n.toLocaleString()
      : n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }
  return String(value);
}

function getLabel(row, index) {
  const labelKey = ["name", "label", "type", "status", "month", "week", "date", "range"].find(k => row?.[k] != null);
  return labelKey ? String(row[labelKey]) : `Item ${index + 1}`;
}

function getMetricKeys(rows) {
  const sample = rows.find(r => r && typeof r === "object") || {};
  return Object.keys(sample).filter(key => {
    const value = sample[key];
    if (["name", "label", "type", "status", "month", "week", "date", "range"].includes(key)) return false;
    return typeof value === "number" || (!Number.isNaN(Number(value)) && String(value).trim() !== "");
  });
}

function explainAutonomously({ title, description, entity, rows }) {
  const safeEntity = entity || "analytics";
  if (!rows.length) {
    return [
      `Idjwi Autonomous reviewed "${title}" for ${safeEntity}.`,
      description
        ? `The figure is described as: ${description}.`
        : "No chart values were available in this panel, so the explanation is limited to the chart definition.",
      "Turn Advisor on for deeper interpretation."
    ].join(" ");
  }

  const metricKeys = getMetricKeys(rows);
  if (!metricKeys.length) {
    return `Idjwi Autonomous reviewed "${title}" for ${safeEntity}. It contains ${rows.length} row${rows.length === 1 ? "" : "s"}, but no numeric metric was available to rank or trend.`;
  }

  const metric = metricKeys[0];
  const normalized = rows
    .map((row, index) => ({ label: getLabel(row, index), value: Number(row[metric] || 0) }))
    .filter(item => Number.isFinite(item.value));
  const total = normalized.reduce((sum, item) => sum + item.value, 0);
  const sorted = [...normalized].sort((a, b) => b.value - a.value);
  const top = sorted[0];
  const low = sorted[sorted.length - 1];
  const share = total && top ? Math.round((top.value / total) * 1000) / 10 : null;

  const lines = [
    `Idjwi Autonomous explanation for "${title}" (${safeEntity}).`,
    `This chart has ${rows.length} row${rows.length === 1 ? "" : "s"} using ${metric.replace(/_/g, " ")} as the main metric.`
  ];
  if (top) lines.push(`${top.label} is highest at ${formatValue(top.value)}${share != null ? ` (${share}% of the visible total)` : ""}.`);
  if (low && low !== top) lines.push(`${low.label} is lowest at ${formatValue(low.value)}.`);
  if (normalized.length >= 3) {
    lines.push(`Top visible values: ${sorted.slice(0, 3).map(item => `${item.label}: ${formatValue(item.value)}`).join(", ")}.`);
  }
  if (description) lines.push(description);
  lines.push("This is deterministic from the visible chart data; Advisor can add interpretation or recommendations.");
  return lines.join(" ");
}

export default function ChartCard({ title, description, sql, currentUser, entity, tableData, children }) {
  const [view, setView] = useState("chart");
  const [pinned, setPinned] = useState(false);
  const [pinning, setPinning] = useState(false);
  const [explainOpen, setExplainOpen] = useState(false);
  const [advisorLoading, setAdvisorLoading] = useState(false);
  const [advisorText, setAdvisorText] = useState("");
  const navigate = useNavigate();

  const rows = useMemo(() => {
    const directRows = Array.isArray(tableData) ? tableData : [];
    return directRows.length ? directRows : extractRowsFromChildren(children);
  }, [tableData, children]);
  const cols = rows.length > 0 ? Object.keys(rows[0]) : [];
  const autonomousText = useMemo(
    () => explainAutonomously({ title, description, entity, rows }),
    [title, description, entity, rows]
  );
  const meta = sourceMeta({ sql_query: sql, source: "local" }, { source: sql ? "query" : "local" });
  const rowLabel = rowCountLabel(rows);

  const handlePin = async () => {
    if (pinning || pinned) return;
    setPinning(true);
    try {
      await ncClient.entities.ReportChart.create({
        title,
        sql_query: sql || "",
        chart_type: "bar",
        status: "active",
        company_id: currentUser?.company_id,
        description: advisorText
          ? `${advisorText.slice(0, 360)} [Advisor insight]`
          : makeChartDescription({ chart: { title, description }, entity, sql, rows }),
        source: "entity_analytics",
        table_snapshot: rows.length
          ? JSON.stringify({ headers: Object.keys(rows[0] || {}), rows: rows.map(r => Object.values(r)) })
          : "",
        shared_with_roles: ["admin", "analyst", "executive"],
      });
      setPinned(true);
      setTimeout(() => setPinned(false), 3000);
    } catch (_) {}
    setPinning(false);
  };

  const handleOpenInQB = () => {
    if (!sql) return;
    sessionStorage.setItem("qb_load_sql", sql);
    sessionStorage.setItem("qb_load_title", title);
    navigate("/QueryBuilder");
  };

  const handleOpenRecords = () => {
    const routes = {
      Addresses: "/Addresses",
      Animals: "/Animals",
      Channels: "/Channels",
      Documents: "/Documents",
      Enterprises: "/Enterprises",
      Observations: "/Observations",
      People: "/People",
      Plots: "/Plots",
      Products: "/Products",
      Relationships: "/Relationships",
      Schedules: "/Schedules",
      Services: "/Services",
      Signals: "/Signals",
      Tasks: "/Tasks",
      Territories: "/Territories",
      Transactions: "/Transactions",
    };
    const path = routes[entity] || `/${entity || ""}`;
    if (!path || path === "/") return;
    navigate(`${path}?analytics_drilldown=${encodeURIComponent(title)}${sql ? `&sql=${encodeURIComponent(sql)}` : ""}`);
  };

  const handleAdvisor = async () => {
    setExplainOpen(true);
    if (advisorText) return;
    setAdvisorLoading(true);
    try {
      const prompt = `Explain this ${entity || "analytics"} chart for an operator. Title: "${title}". Description: "${description || ""}". Visible chart data: ${JSON.stringify(rows.slice(0, 30))}. ${sql ? `Underlying SQL: ${sql}` : ""} Be concise, practical, and separate facts from interpretation.`;
      const resp = await fetch(`${RAILWAY_URL}/copilot/ask`, {
        method: "POST",
        headers: {
          ...(await authHeaders()),
          ...(RAILWAY_API_KEY ? { "x-idjwi-api-key": RAILWAY_API_KEY } : {}),
          ...(currentUser?.email ? { "x-idjwi-user": currentUser.email } : {}),
          ...(currentUser?.role ? { "x-idjwi-role": currentUser.role } : {}),
        },
        body: JSON.stringify({
          question: prompt,
          company_id: currentUser?.company_id,
          advisor_enabled: true,
        }),
      });
      if (resp.ok) {
        const data = await resp.json();
        setAdvisorText(data.answer || data.response || data.message || "No Advisor explanation available.");
      } else {
        setAdvisorText("Advisor unavailable - check Railway connection.");
      }
    } catch (_) {
      setAdvisorText("Could not reach Advisor. Ensure python_layer is running.");
    }
    setAdvisorLoading(false);
  };

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
            <button onClick={() => setView("chart")} title="Chart" className={`px-2 py-1 rounded-md text-[10px] font-semibold flex items-center gap-1 transition-all ${view === "chart" ? "bg-white text-slate-700 shadow-sm" : "text-slate-400 hover:text-slate-600"}`}>
              <BarChart2 className="w-3 h-3" /> Chart
            </button>
            <button onClick={() => setView("query")} title="SQL" className={`px-2 py-1 rounded-md text-[10px] font-semibold flex items-center gap-1 transition-all ${view === "query" ? "bg-white text-slate-700 shadow-sm" : "text-slate-400 hover:text-slate-600"}`}>
              <Code2 className="w-3 h-3" /> Query
            </button>
            <button onClick={() => setView("table")} title="Table view" className={`px-2 py-1 rounded-md text-[10px] font-semibold flex items-center gap-1 transition-all ${view === "table" ? "bg-white text-slate-700 shadow-sm" : "text-slate-400 hover:text-slate-600"}`}>
              <Table2 className="w-3 h-3" /> Table
            </button>
          </div>
          <button onClick={handlePin} title={pinned ? "Pinned!" : "Pin to Reports"} className={`p-1.5 rounded-lg transition-all ${pinned ? "bg-emerald-100 text-emerald-600" : "text-slate-400 hover:text-slate-600 hover:bg-slate-100"}`}>
            {pinned ? <Check className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
          </button>
          <button onClick={handleOpenRecords} title="Open records" className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-all">
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {view === "chart" && <div className="min-h-[180px]">{children}</div>}

      {view === "query" && (
        <div>
          <pre className="bg-slate-950 text-emerald-400 text-[10px] rounded-xl p-4 overflow-x-auto whitespace-pre-wrap leading-relaxed min-h-[180px]">{sql || "-- No SQL available for this chart"}</pre>
          {sql && <button onClick={handleOpenInQB} className="mt-2 text-[11px] text-emerald-600 hover:text-emerald-700 font-semibold hover:underline">Open in Query Builder</button>}
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
                      <td key={c} className="px-3 py-1.5 text-slate-700 whitespace-nowrap max-w-[160px] truncate">{String(row[c] ?? "-")}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      <div className="flex items-center justify-between mt-0.5">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setExplainOpen(open => !open)}
            title={explainOpen ? "Hide autonomous explanation" : "Explain this chart with Idjwi Autonomous Mode"}
            className={`flex items-center gap-1.5 text-[10px] font-medium rounded-lg px-2 py-1 transition-all ${explainOpen ? "bg-emerald-100 text-emerald-700" : "text-slate-400 hover:text-emerald-600 hover:bg-emerald-50"}`}
          >
            <Activity className="w-3 h-3" />
            {explainOpen ? "Hide" : "Explain"}
          </button>
          <button
            onClick={handleAdvisor}
            title="Ask Idjwi Advisor for deeper interpretation"
            className="flex items-center gap-1.5 text-[10px] font-medium rounded-lg px-2 py-1 text-slate-400 hover:text-violet-600 hover:bg-violet-50 transition-all"
          >
            {advisorLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Brain className="w-3 h-3" />}
            Advisor
          </button>
          {currentUser?.company_id && (
            <TeachIdjwiButton
              user={currentUser}
              companyId={currentUser.company_id}
              defaultType="metric_definition"
              defaultKey={`chart_${(entity || "analytics").toLowerCase()}_${title.replace(/[^a-z0-9]+/gi, "_").toLowerCase()}`}
              defaultValue={{
                title,
                description: description || "",
                sql: sql || "",
                visible_rows: rows.slice(0, 10),
              }}
              context={{
                surface: "analytics_chart",
                entity,
                row_count: rows.length,
              }}
              label="Teach"
              compact
            />
          )}
        </div>
        {explainOpen && (
          <button onClick={() => setExplainOpen(false)} className="text-slate-300 hover:text-slate-500 transition-colors">
            <X className="w-3 h-3" />
          </button>
        )}
      </div>

      {explainOpen && (
        <div className="rounded-xl bg-gradient-to-br from-emerald-50 to-slate-50 border border-emerald-100 p-3 space-y-3">
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <Activity className="w-3.5 h-3.5 text-emerald-600" />
              <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wide">Idjwi Autonomous</span>
            </div>
            <p className="text-[11px] text-slate-700 leading-relaxed">{autonomousText}</p>
          </div>

          {(advisorLoading || advisorText) && (
            <div className="border-t border-emerald-100 pt-3">
              <div className="flex items-center gap-1.5 mb-1">
                <Brain className="w-3.5 h-3.5 text-violet-600" />
                <span className="text-[10px] font-bold text-violet-700 uppercase tracking-wide">Advisor</span>
              </div>
              {advisorLoading ? (
                <div className="flex items-center gap-2 text-[11px] text-violet-500">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Consulting Advisor...
                </div>
              ) : (
                <p className="text-[11px] text-slate-700 leading-relaxed">{advisorText}</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
