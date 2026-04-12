import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import FolderTree from "@/components/reports/FolderTree";
import FolderContents from "@/components/reports/FolderContents";
import ChartBuilder from "@/components/reports/ChartBuilder";
import ReportBuilder from "@/components/reports/ReportBuilder";
import ReportViewer from "@/components/reports/ReportViewer";
import WelcomeSetup from "@/components/reports/WelcomeSetup";
import ChartViewer from "@/components/reports/ChartViewer.jsx";
import { Loader2, RefreshCw, Sparkles, TrendingUp, Users, AlertCircle, ChevronRight, Database, FileText, Download, CheckCircle2, Circle, Play, Globe, Building2, BarChart2, Brain } from "lucide-react";
import SupersetEmbed from "@/components/reports/SupersetEmbed";

const RAILWAY_URL = "https://newsconseenwebapp-production.up.railway.app";
const RAILWAY_API_KEY = typeof import.meta !== "undefined" ? (import.meta.env?.VITE_RAILWAY_API_KEY || "") : "";
const RAIL_HEADERS = RAILWAY_API_KEY ? { "x-api-key": RAILWAY_API_KEY } : {};

// ── MarketAnalysisTemplate ───────────────────────────────────────────────────
// Auto-populates a 10-section market analysis report from:
//   - Market Intelligence runs (competitor data, economic context)
//   - ML model results (segmentation, retention risk)
//   - Copilot answers (synthesized narrative)
//   - Public data connectors (CMS, NPPES, state pharmacy)
function MarketAnalysisTemplate({ currentUser, onBack, onSaveReport }) {
  const companyId = currentUser?.company_id;

  const SECTIONS = [
    { id: "executive_summary",   title: "1. Executive Summary",              icon: FileText,    source: "copilot",    description: "AI-generated synthesis of all findings" },
    { id: "market_overview",     title: "2. Market Overview",                icon: Globe,       source: "auto",       description: "5-city Market Intelligence comparison" },
    { id: "competitor_density",  title: "3. Competitor Density",             icon: Building2,   source: "auto",       description: "Competitor counts from OpenStreetMap" },
    { id: "competitor_database", title: "4. Competitor Database",            icon: Database,    source: "enterprises", description: "Your catalogued competitor enterprises" },
    { id: "segment_analysis",    title: "5. Market Segment Analysis",        icon: Users,       source: "ml",         description: "LTV segmentation from ML model" },
    { id: "demand_risk",         title: "6. Demand Risk & Switching",        icon: AlertCircle, source: "ml",         description: "Retention risk scores by segment" },
    { id: "capacity_forecast",   title: "7. Capacity & Demand Forecast",     icon: TrendingUp,  source: "ml",         description: "Staffing forecast from ML model" },
    { id: "economic_context",    title: "8. Economic & Labor Context",       icon: BarChart2,   source: "economic",   description: "Census, BLS, World Bank indicators" },
    { id: "public_data",         title: "9. Public Data Intelligence",       icon: Globe,       source: "public",     description: "CMS pharmacy data, NPPES, state licenses" },
    { id: "recommendations",     title: "10. Recommendations & Opportunities", icon: Brain,    source: "copilot",    description: "AI-generated strategic recommendations" },
  ];

  const [sectionData, setSectionData]   = useState({});
  const [loading, setLoading]           = useState({});
  const [config, setConfig]             = useState({ location: "Maine", industry: "pharmacy", state: "ME" });
  const [generating, setGenerating]     = useState(false);
  const [reportText, setReportText]     = useState({});
  const [savedReport, setSavedReport]   = useState(null);

  // ── Fetch a section ────────────────────────────────────────────────────────
  async function fetchSection(sectionId) {
    setLoading(prev => ({ ...prev, [sectionId]: true }));
    try {
      let data = null;

      if (sectionId === "competitor_density" || sectionId === "market_overview") {
        // Market Intelligence — OSM pharmacy counts per city
        const cities = ["Portland Maine", "Bangor Maine", "Lewiston Maine", "Augusta Maine"];
        const results = await Promise.allSettled(cities.map(city =>
          fetch(`${RAILWAY_URL}/market/nearby?lat=44.0&lng=-70.5&radius_km=20&enterprise_type=commercial&limit=30&company_id=${companyId}`)
            .then(r => r.ok ? r.json() : null).catch(() => null)
        ));
        data = { cities, results: results.map(r => r.value), source: "OpenStreetMap via Market Intelligence" };
      }

      else if (sectionId === "competitor_database") {
        const enterprises = await base44.entities.Enterprise.filter({ company_id: companyId });
        data = { enterprises: enterprises.slice(0, 50), total: enterprises.length };
      }

      else if (sectionId === "segment_analysis") {
        const r = await fetch(`${RAILWAY_URL}/ml/ltv-segmentation?company_id=${companyId}&research_mode=true`, { method: "POST", headers: RAIL_HEADERS });
        data = r.ok ? await r.json() : { status: "unavailable" };
      }

      else if (sectionId === "demand_risk") {
        const r = await fetch(`${RAILWAY_URL}/ml/retention-risk?company_id=${companyId}&research_mode=true`, { method: "POST", headers: RAIL_HEADERS });
        data = r.ok ? await r.json() : { status: "unavailable" };
      }

      else if (sectionId === "capacity_forecast") {
        const enterprises = await base44.entities.Enterprise.filter({ company_id: companyId });
        const entId = enterprises[0]?.id || "unknown";
        const r = await fetch(`${RAILWAY_URL}/ml/staffing-forecast?enterprise_id=${entId}&company_id=${companyId}&research_mode=true`, { method: "POST", headers: RAIL_HEADERS });
        data = r.ok ? await r.json() : { status: "unavailable" };
      }

      else if (sectionId === "economic_context") {
        const [census, worldBank] = await Promise.allSettled([
          fetch(`${RAILWAY_URL}/market/economic-context?country_code=US&company_id=${companyId}`, { headers: RAIL_HEADERS }).then(r => r.ok ? r.json() : null),
          fetch(`${RAILWAY_URL}/market/labor-context?country_code=US&company_id=${companyId}`, { headers: RAIL_HEADERS }).then(r => r.ok ? r.json() : null),
        ]);
        data = { economic: census.value, labor: worldBank.value };
      }

      else if (sectionId === "public_data") {
        const [cms, dea, state] = await Promise.allSettled([
          fetch(`${RAILWAY_URL}/public-data/cms/pharmacies?state=${config.state}&limit=50`, { headers: RAIL_HEADERS }).then(r => r.ok ? r.json() : null),
          fetch(`${RAILWAY_URL}/public-data/dea/pharmacy-count?state=${config.state}`, { headers: RAIL_HEADERS }).then(r => r.ok ? r.json() : null),
          fetch(`${RAILWAY_URL}/public-data/state/summary?state=${config.state}`, { headers: RAIL_HEADERS }).then(r => r.ok ? r.json() : null),
        ]);
        data = { cms: cms.value, dea: dea.value, state_board: state.value };
      }

      else if (sectionId === "executive_summary" || sectionId === "recommendations") {
        // Copilot-generated text
        const question = sectionId === "executive_summary"
          ? `I am conducting a ${config.industry} market analysis in ${config.location}. Using your web search and public data tools, give me a concise executive summary of the ${config.industry} market in ${config.location}: market size, key players, economic conditions, and 3 key findings. Use search_public_data with cms_pharmacy, dea_pharmacy, and web_search.`
          : `Based on all available data about the ${config.industry} market in ${config.location}, what are the top 5 strategic recommendations and market opportunities? Consider competitor density, economic conditions, and demographic data. Be specific and actionable.`;

        const r = await fetch(`${RAILWAY_URL}/copilot/ask`, {
          method: "POST",
          headers: { ...RAIL_HEADERS, "Content-Type": "application/json" },
          body: JSON.stringify({ question, company_id: companyId }),
        });
        if (r.ok) {
          const resp = await r.json();
          data = { text: resp.answer || resp.response || resp.text || "No response", source: "Copilot + Web Search" };
          setReportText(prev => ({ ...prev, [sectionId]: data.text }));
        } else {
          data = { text: "Copilot unavailable — run the query manually in the Copilot tab.", source: "unavailable" };
        }
      }

      setSectionData(prev => ({ ...prev, [sectionId]: data }));
    } catch (e) {
      setSectionData(prev => ({ ...prev, [sectionId]: { error: e.message } }));
    } finally {
      setLoading(prev => ({ ...prev, [sectionId]: false }));
    }
  }

  async function generateAll() {
    setGenerating(true);
    for (const section of SECTIONS) {
      await fetchSection(section.id);
    }
    setGenerating(false);
  }

  async function saveAsReport() {
    try {
      // Build report content from all sections
      const content = SECTIONS.map(s => {
        const data = sectionData[s.id];
        const text = reportText[s.id] || "";
        let sectionContent = `## ${s.title}\n\n`;
        if (text) sectionContent += text + "\n\n";
        if (data && !data.error) {
          if (data.enterprises) sectionContent += `**Enterprises catalogued:** ${data.total}\n`;
          if (data.segments) sectionContent += `**Segments identified:** ${data.segments?.length || 0}\n`;
          if (data.forecast) sectionContent += `**Forecast days:** ${data.forecast?.length || 0}\n`;
          if (data.cms?.count) sectionContent += `**CMS pharmacies found:** ${data.cms.count}\n`;
          if (data.state_board?.total) sectionContent += `**State licensed pharmacies:** ${data.state_board.total}\n`;
        }
        return sectionContent;
      }).join("\n---\n\n");

      // Find or create Market Research folder
      let folders = await base44.entities.ChartFolder.filter({ name: "Market Research", company_id: companyId });
      let folderId = folders[0]?.id;
      if (!folderId) {
        const f = await base44.entities.ChartFolder.create({ name: "Market Research", icon: "🌍", color: "#10b981", company_id: companyId });
        folderId = f.id;
      }

      const report = await base44.entities.Report.create({
        name: `${config.location} ${config.industry} Market Analysis`,
        content,
        status: "published",
        folder_id: folderId,
        company_id: companyId,
      });
      setSavedReport(report);
      if (onSaveReport) onSaveReport(report);
    } catch (e) {
      console.error("Save report failed:", e);
    }
  }

  const completed = SECTIONS.filter(s => sectionData[s.id] && !sectionData[s.id]?.error).length;

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="text-slate-400 hover:text-slate-600">
            <ChevronRight className="w-4 h-4 rotate-180" />
          </button>
          <div className="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center">
            <FileText className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-800">Market Analysis Template</h2>
            <p className="text-xs text-slate-500">Auto-populated 10-section report — {completed}/{SECTIONS.length} sections ready</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={generateAll}
            disabled={generating}
            className="flex items-center gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-3 py-1.5 rounded-lg disabled:opacity-50"
          >
            {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
            {generating ? "Generating…" : "Generate All"}
          </button>
          {completed >= 5 && (
            <button
              onClick={saveAsReport}
              className="flex items-center gap-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-white font-semibold px-3 py-1.5 rounded-lg"
            >
              <Download className="w-3.5 h-3.5" /> Save Report
            </button>
          )}
        </div>
      </div>

      {/* Config */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-wrap gap-4">
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Market Location</label>
          <input
            value={config.location}
            onChange={e => setConfig(c => ({ ...c, location: e.target.value }))}
            className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white w-40"
            placeholder="e.g. Maine"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Industry / Sector</label>
          <input
            value={config.industry}
            onChange={e => setConfig(c => ({ ...c, industry: e.target.value }))}
            className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white w-36"
            placeholder="e.g. pharmacy"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">State Code</label>
          <input
            value={config.state}
            onChange={e => setConfig(c => ({ ...c, state: e.target.value.toUpperCase().slice(0, 2) }))}
            className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white w-20"
            placeholder="ME"
            maxLength={2}
          />
        </div>
      </div>

      {savedReport && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-xs text-emerald-800 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" /> Report saved as "<strong>{savedReport.name}</strong>" in Market Research folder.
        </div>
      )}

      {/* Progress bar */}
      <div className="w-full bg-slate-100 rounded-full h-1.5">
        <div className="bg-emerald-500 h-1.5 rounded-full transition-all" style={{ width: `${(completed / SECTIONS.length) * 100}%` }} />
      </div>

      {/* Sections */}
      <div className="space-y-3">
        {SECTIONS.map(section => {
          const Icon    = section.icon;
          const data    = sectionData[section.id];
          const isLoading = loading[section.id];
          const isDone  = !!data && !data?.error;
          const hasError = data?.error;

          return (
            <div key={section.id} className={`rounded-xl border p-4 transition-colors ${isDone ? "border-emerald-200 bg-emerald-50/30" : "border-slate-200 bg-white"}`}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${isDone ? "bg-emerald-100" : "bg-slate-100"}`}>
                    {isDone ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <Icon className="w-4 h-4 text-slate-500" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800">{section.title}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{section.description}</p>

                    {/* Data preview */}
                    {isDone && (
                      <div className="mt-2 text-xs text-slate-600 space-y-1">
                        {data.text && (
                          <p className="line-clamp-3 text-slate-700 bg-white rounded-lg p-2 border border-slate-100">{data.text}</p>
                        )}
                        {data.enterprises && (
                          <p className="text-emerald-700 font-medium">{data.total} enterprises · {data.enterprises.slice(0, 3).map(e => e.enterprise_name || e.name).join(", ")}{data.total > 3 ? "…" : ""}</p>
                        )}
                        {data.segments?.length > 0 && (
                          <p className="text-emerald-700 font-medium">{data.segments.length} segments identified · status: {data.status}</p>
                        )}
                        {data.predictions?.length > 0 && (
                          <p className="text-emerald-700 font-medium">{data.predictions.length} predictions · {data.high_risk_count ?? 0} high risk</p>
                        )}
                        {data.forecast?.length > 0 && (
                          <p className="text-emerald-700 font-medium">{data.forecast.length}-day forecast generated</p>
                        )}
                        {data.cms?.count && (
                          <p className="text-emerald-700 font-medium">CMS: {data.cms.count} pharmacies · DEA/NPPES: {data.dea?.count ?? "—"} · State board: {data.state_board?.total ?? "—"}</p>
                        )}
                        {data.source && <p className="text-slate-400 text-[10px]">Source: {data.source}</p>}
                      </div>
                    )}

                    {hasError && (
                      <p className="mt-1 text-xs text-rose-600">{data.error}</p>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => fetchSection(section.id)}
                  disabled={isLoading}
                  className="shrink-0 flex items-center gap-1 text-xs border border-slate-200 hover:border-emerald-300 text-slate-600 hover:text-emerald-700 px-2.5 py-1.5 rounded-lg disabled:opacity-50"
                >
                  {isLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                  {isDone ? "Refresh" : "Fetch"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── MLInsightsPanel ──────────────────────────────────────────────────────────
// Shows AI predictions and analytics data from python_layer
function MLInsightsPanel({ currentUser, onBack }) {
  const companyId = currentUser?.company_id;

  const { data: predictions = { predictions: [] }, isLoading: predLoading, refetch: refetchPred } = useQuery({
    queryKey: ["ml-predictions", companyId],
    queryFn: async () => {
      const r = await fetch(`${RAILWAY_URL}/ml/predictions?company_id=${companyId}&limit=20`, { headers: RAIL_HEADERS });
      return r.json();
    },
    enabled: !!companyId,
    staleTime: 0,
  });

  const { data: mlStatus = {} } = useQuery({
    queryKey: ["ml-status"],
    queryFn: async () => {
      const r = await fetch(`${RAILWAY_URL}/ml/status`, { headers: RAIL_HEADERS });
      return r.json();
    },
  });

  const { data: rawStats = {} } = useQuery({
    queryKey: ["raw-stats", companyId],
    queryFn: async () => {
      try {
        const r = await fetch(`${RAILWAY_URL}/raw/stats`, { headers: RAIL_HEADERS });
        if (r.ok) {
          const data = await r.json();
          if (data && data.tables && Object.keys(data.tables).length > 0) return data;
        }
      } catch (_) {}
      // Base44 fallback — derive counts from live entities
      try {
        const [people, enterprises, products, transactions, tasks] = await Promise.allSettled([
          base44.entities.Person.filter({ company_id: companyId }),
          base44.entities.Enterprise.filter({ company_id: companyId }),
          base44.entities.Product.filter({ company_id: companyId }),
          base44.entities.Transaction.filter({ company_id: companyId }),
          base44.entities.Task.filter({ company_id: companyId }),
        ]);
        return {
          tables: {
            people:       people.status      === "fulfilled" ? people.value.length      : 0,
            enterprises:  enterprises.status === "fulfilled" ? enterprises.value.length : 0,
            products:     products.status    === "fulfilled" ? products.value.length    : 0,
            transactions: transactions.status=== "fulfilled" ? transactions.value.length: 0,
            tasks:        tasks.status       === "fulfilled" ? tasks.value.length       : 0,
          },
          source: "base44",
        };
      } catch (_) {
        return {};
      }
    },
    enabled: !!companyId,
    staleTime: 0,
  });

  const MODEL_META = {
    "retention-risk":   { label: "Retention Risk",    icon: AlertCircle,  color: "rose",   desc: "Clients at risk of disengaging" },
    "ltv-segmentation": { label: "LTV Segmentation",  icon: Users,        color: "purple", desc: "Client lifetime value tiers" },
    "staffing-forecast":{ label: "Staffing Forecast",  icon: TrendingUp,   color: "blue",   desc: "Predicted staffing demand" },
    "shift-demand":     { label: "Shift Demand",       icon: TrendingUp,   color: "amber",  desc: "Day-level shift predictions" },
  };

  const colorMap = { rose: "bg-rose-50 border-rose-200 text-rose-700", purple: "bg-purple-50 border-purple-200 text-purple-700",
    blue: "bg-blue-50 border-blue-200 text-blue-700", amber: "bg-amber-50 border-amber-200 text-amber-700" };

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="text-slate-400 hover:text-slate-600 mr-1">
            <ChevronRight className="w-4 h-4 rotate-180" />
          </button>
          <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-800">AI Insights</h2>
            <p className="text-xs text-slate-500">ML predictions and analytics from python_layer</p>
          </div>
        </div>
        <button onClick={() => refetchPred()} className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-indigo-600 px-3 py-1.5 rounded-lg border border-slate-200 hover:border-indigo-300">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      {/* ML Status */}
      <div className={`rounded-xl border px-4 py-3 flex items-center gap-3 ${mlStatus.ml_enabled ? "bg-emerald-50 border-emerald-200" : "bg-amber-50 border-amber-200"}`}>
        <Sparkles className={`w-4 h-4 ${mlStatus.ml_enabled ? "text-emerald-600" : "text-amber-600"}`} />
        <div>
          <p className={`text-xs font-semibold ${mlStatus.ml_enabled ? "text-emerald-700" : "text-amber-700"}`}>
            ML Engine: {mlStatus.ml_enabled ? "Active" : "Standby"}
          </p>
          {!mlStatus.ml_enabled && (
            <p className="text-[10px] text-amber-600">Set ML_ENABLED=true in Railway to activate predictions.</p>
          )}
        </div>
      </div>

      {/* Raw Data Inventory */}
      {rawStats.tables && (
        <div>
          <h3 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
            <Database className="w-4 h-4 text-slate-400" />
            {rawStats.source === "base44" ? "Live Data (Base44)" : "Data in python_layer"}
          </h3>
          <div className="grid grid-cols-3 md:grid-cols-4 gap-3">
            {Object.entries(rawStats.tables || {}).map(([table, count]) => (
              <div key={table} className="bg-slate-50 rounded-xl border border-slate-200 p-3 text-center">
                <p className="text-xl font-bold text-slate-800">{typeof count === "number" ? count.toLocaleString() : count}</p>
                <p className="text-[10px] text-slate-500 capitalize mt-0.5">{table.replace("_", " ")}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stored Predictions */}
      <div>
        <h3 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-indigo-400" /> Latest Model Results
        </h3>
        {predLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
          </div>
        ) : predictions.predictions.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-6 py-8 text-center">
            <Sparkles className="w-8 h-8 mx-auto mb-2 text-slate-300" />
            <p className="text-sm font-semibold text-slate-600">No predictions stored yet</p>
            <p className="text-xs text-slate-400 mt-1">
              {mlStatus.ml_enabled
                ? "Run an ML model via the API to store results here."
                : "Enable ML_ENABLED=true in Railway and run a model."}
            </p>
            <p className="text-[10px] text-slate-400 mt-3 font-mono">POST {RAILWAY_URL}/ml/retention-risk?company_id={companyId}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {predictions.predictions.map((pred) => {
              const meta = MODEL_META[pred.model] || { label: pred.model, icon: Sparkles, color: "blue", desc: "ML model result" };
              const Icon = meta.icon;
              const colorClass = colorMap[meta.color] || colorMap.blue;
              const result = pred.result || {};
              return (
                <div key={pred.id} className={`rounded-xl border p-4 ${colorClass}`}>
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Icon className="w-4 h-4" />
                      <p className="text-sm font-bold">{meta.label}</p>
                    </div>
                    <span className="text-[10px] opacity-70">
                      {pred.computed_at ? new Date(pred.computed_at).toLocaleDateString() : ""}
                    </span>
                  </div>
                  <p className="text-xs opacity-80 mb-3">{meta.desc}</p>
                  {/* Key stats from result */}
                  <div className="grid grid-cols-3 gap-2">
                    {result.status && (
                      <div className="bg-white/60 rounded-lg px-2 py-1.5 text-center">
                        <p className="text-xs font-semibold capitalize">{result.status}</p>
                        <p className="text-[9px] opacity-60">status</p>
                      </div>
                    )}
                    {result.total_scored != null && (
                      <div className="bg-white/60 rounded-lg px-2 py-1.5 text-center">
                        <p className="text-xs font-bold">{result.total_scored}</p>
                        <p className="text-[9px] opacity-60">scored</p>
                      </div>
                    )}
                    {result.high_risk_count != null && (
                      <div className="bg-white/60 rounded-lg px-2 py-1.5 text-center">
                        <p className="text-xs font-bold text-rose-700">{result.high_risk_count}</p>
                        <p className="text-[9px] opacity-60">high risk</p>
                      </div>
                    )}
                    {result.n_segments != null && (
                      <div className="bg-white/60 rounded-lg px-2 py-1.5 text-center">
                        <p className="text-xs font-bold">{result.n_segments}</p>
                        <p className="text-[9px] opacity-60">segments</p>
                      </div>
                    )}
                    {result.total_entities != null && (
                      <div className="bg-white/60 rounded-lg px-2 py-1.5 text-center">
                        <p className="text-xs font-bold">{result.total_entities}</p>
                        <p className="text-[9px] opacity-60">entities</p>
                      </div>
                    )}
                  </div>
                  <p className="text-[10px] mt-2 opacity-60 font-mono">
                    POST {RAILWAY_URL}/ml/push-to-base44?company_id={companyId}&model={pred.model}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Available model endpoints */}
      <div>
        <h3 className="text-sm font-bold text-slate-700 mb-3">Available ML Models</h3>
        <div className="grid grid-cols-2 gap-3">
          {Object.entries(MODEL_META).map(([id, meta]) => {
            const Icon = meta.icon;
            const colorClass = colorMap[meta.color] || colorMap.blue;
            return (
              <div key={id} className={`rounded-xl border p-3 ${colorClass} opacity-75`}>
                <div className="flex items-center gap-2 mb-1">
                  <Icon className="w-3.5 h-3.5" />
                  <p className="text-xs font-semibold">{meta.label}</p>
                </div>
                <p className="text-[10px] opacity-80">{meta.desc}</p>
                <p className="text-[9px] mt-1.5 opacity-50 font-mono">/ml/{id}</p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function canUserSee(item, currentUser) {
  if (!currentUser) return false;
  if (currentUser.role === "admin" || currentUser.role === "super_admin") return true;
  if (item.is_public) return true;
  if (item.shared_with_roles?.includes(currentUser.role)) return true;
  if (item.shared_with_users?.includes(currentUser.email)) return true;
  if (item.created_by === currentUser.email) return true;
  return false;
}

export default function Reports() {
  const [currentUser, setCurrentUser] = useState(null);
  const [selected, setSelected] = useState({ type: "all-charts", id: "all-charts" });
  const [view, setView] = useState("folders"); // folders | chart-builder | report-builder | report-viewer | chart-viewer | ml-insights | market-template | superset
  const [editingChart, setEditingChart] = useState(null);
  const [editingReport, setEditingReport] = useState(null);
  const [viewingReport, setViewingReport] = useState(null);
  const [newFolderParentId, setNewFolderParentId] = useState(null);
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [setupDone, setSetupDone] = useState(false);
  const [etlLoading, setEtlLoading] = useState(false);
  const [etlResult, setEtlResult] = useState(null);

  const qc = useQueryClient();

  useEffect(() => {
    base44.auth.me().then(setCurrentUser).catch(() => {});
  }, []);

  const isAdmin = currentUser?.role === "admin" || currentUser?.role === "super_admin";

  const { data: folders = [] } = useQuery({
    queryKey: ["chartFolders", currentUser?.company_id],
    queryFn: () => currentUser?.role === "super_admin"
      ? base44.entities.ChartFolder.filter({ status: "active" })
      : base44.entities.ChartFolder.filter({ status: "active", company_id: currentUser.company_id }),
    enabled: !!currentUser?.company_id,
  });

  const { data: allCharts = [] } = useQuery({
    queryKey: ["reportCharts", currentUser?.company_id],
    queryFn: () => currentUser?.role === "super_admin"
      ? base44.entities.ReportChart.filter({ status: "active" })
      : base44.entities.ReportChart.filter({ status: "active", company_id: currentUser.company_id }),
    enabled: !!currentUser?.company_id,
  });

  const { data: allReports = [] } = useQuery({
    queryKey: ["reports", currentUser?.company_id],
    queryFn: () => currentUser?.role === "super_admin"
      ? base44.entities.Report.list()
      : base44.entities.Report.filter({ company_id: currentUser.company_id }),
    enabled: !!currentUser,
  });

  const { data: pinnedWidgets = [] } = useQuery({
    queryKey: ["pinnedWidgets", currentUser?.company_id],
    queryFn: () => base44.entities.SavedDashboardWidget.filter({ company_id: currentUser.company_id }),
    enabled: !!currentUser?.company_id,
  });

  const createFolderMut = useMutation({
    mutationFn: (data) => base44.entities.ChartFolder.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["chartFolders"] });
      setShowNewFolderModal(false);
      setNewFolderName("");
    },
  });

  const deleteChartMut = useMutation({
    mutationFn: (id) => base44.entities.ReportChart.update(id, { status: "archived" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["reportCharts"] }),
  });

  const deleteReportMut = useMutation({
    mutationFn: (id) => base44.entities.Report.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["reports"] }),
  });

  // Filter by company and visibility
  const charts = allCharts.filter((c) => {
    if (currentUser?.role === "super_admin") return true;
    if (c.company_id && currentUser?.company_id && c.company_id !== currentUser.company_id) return false;
    return canUserSee(c, currentUser);
  });

  const reports = allReports.filter((r) => {
    if (currentUser?.role === "super_admin") return true;
    if (r.company_id && currentUser?.company_id && r.company_id !== currentUser.company_id) return false;
    return canUserSee(r, currentUser);
  });

  // myFolders must be defined before the useEffect that depends on it
  const myFolders = folders.filter((f) => {
    if (currentUser?.role === "super_admin") return true;
    return !f.company_id || f.company_id === currentUser?.company_id;
  });
  const showSetup = isAdmin && myFolders.length === 0 && charts.length === 0 && !setupDone;

  const qbFolderCreated = useRef(false);

  useEffect(() => {
    if (!currentUser?.company_id || !isAdmin) return;
    if (myFolders.length === 0) return;
    if (qbFolderCreated.current) return;

    const hasQBFolder = myFolders.some((f) => f.name === "From QueryBuilder");
    if (!hasQBFolder) {
      qbFolderCreated.current = true;
      base44.entities.ChartFolder.create({
        name: "From QueryBuilder",
        company_id: currentUser.company_id,
        status: "active",
        shared_with_roles: ["admin"],
        description: "Charts pinned from QueryBuilder",
      }).then(() => qc.invalidateQueries({ queryKey: ["chartFolders"] }))
        .catch(() => { qbFolderCreated.current = false; });
    } else {
      qbFolderCreated.current = true;
    }
  }, [myFolders.length, currentUser?.company_id, isAdmin]);

  const handleTriggerETL = async () => {
    setEtlLoading(true);
    setEtlResult(null);
    try {
      const API = "https://newsconseenwebapp-production.up.railway.app";
      const id = currentUser?.company_id;
      const endpoints = [
        "enterprise-summary", "task-summary", "people-summary",
        "transaction-summary", "service-summary", "product-summary",
      ];
      const results = await Promise.all(
        endpoints.map(async (ep) => {
          const res = await fetch(`${API}/load/${ep}?company_id=${id}`, { method: "POST" });
          const d = await res.json();
          return `${ep}: ${d.rows_loaded || 0} rows`;
        })
      );
      setEtlResult(results.join(" · "));
    } catch (e) {
      setEtlResult("Error: " + e.message);
    } finally {
      setEtlLoading(false);
    }
  };

  const handleNewFolder = (parentId) => {
    setNewFolderParentId(parentId);
    setShowNewFolderModal(true);
  };

  const handleCreateFolder = () => {
    if (!newFolderName.trim()) return;
    createFolderMut.mutate({
      name: newFolderName.trim(),
      parent_folder_id: newFolderParentId || null,
      company_id: currentUser?.company_id,
      status: "active",
      shared_with_roles: ["admin"],
    });
  };

  const handleViewChart = (chart) => {
    setEditingChart(chart);
    setView("chart-viewer");
  };

  const handleEditChart = (chart) => {
    setEditingChart(chart);
    setView("chart-builder");
  };

  const handleViewReport = (report) => {
    setViewingReport(report);
    setView("report-viewer");
  };

  const handleEditReport = (report) => {
    setEditingReport(report);
    setView("report-builder");
  };

  const handleBack = () => {
    setView("folders");
    setEditingChart(null);
    setEditingReport(null);
    setViewingReport(null);
  };

  if (!currentUser) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex h-full bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
      {/* Left Sidebar */}
      <div className="w-60 border-r border-slate-100 shrink-0 overflow-hidden">
        <FolderTree
          folders={myFolders}
          charts={charts}
          reports={reports}
          selected={selected}
          onSelect={(s) => { setSelected(s); setView("folders"); }}
          onNewFolder={handleNewFolder}
          onNewChart={() => { setEditingChart(null); setView("chart-builder"); }}
          onNewReport={() => { setEditingReport(null); setView("report-builder"); }}
          currentUser={currentUser}
          onTriggerETL={handleTriggerETL}
          etlLoading={etlLoading}
          etlResult={etlResult}
        />
      </div>

      {/* Right Content */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {/* AI Insights tab strip */}
        {view === "folders" && (
          <div className="flex items-center gap-2 px-4 pt-3 pb-0 border-b border-slate-100">
            <button
              onClick={() => setView("ml-insights")}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-t-lg text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5" /> AI Insights
            </button>
            <button
              onClick={() => setView("market-template")}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-t-lg text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 transition-colors"
            >
              <FileText className="w-3.5 h-3.5" /> Market Analysis
            </button>
            <button
              onClick={() => setView("superset")}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-t-lg text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
            >
              <BarChart2 className="w-3.5 h-3.5" /> Superset Dashboards
            </button>
          </div>
        )}
        <div className="flex-1 overflow-hidden flex">
        {showSetup ? (
          <WelcomeSetup currentUser={currentUser} onComplete={() => setSetupDone(true)} />
        ) : view === "superset" ? (
          <SupersetEmbed companyId={currentUser?.company_id} />
        ) : view === "ml-insights" ? (
          <MLInsightsPanel currentUser={currentUser} onBack={() => setView("folders")} />
        ) : view === "market-template" ? (
          <MarketAnalysisTemplate
            currentUser={currentUser}
            onBack={() => setView("folders")}
            onSaveReport={(report) => {
              qc.invalidateQueries({ queryKey: ["reports"] });
              setView("folders");
            }}
          />
        ) : view === "chart-builder" ? (
          <ChartBuilder
            chart={editingChart}
            folders={myFolders}
            currentUser={currentUser}
            onClose={handleBack}
          />
        ) : view === "report-builder" ? (
          <ReportBuilder
            report={editingReport}
            folders={myFolders}
            charts={charts}
            currentUser={currentUser}
            onClose={handleBack}
          />
        ) : view === "report-viewer" ? (
          <ReportViewer
            report={viewingReport}
            charts={charts}
            currentUser={currentUser}
            onClose={handleBack}
            onEdit={isAdmin ? handleEditReport : null}
          />
        ) : view === "chart-viewer" ? (
          <ChartViewer
            chart={editingChart}
            onClose={handleBack}
            onEdit={isAdmin ? handleEditChart : null}
          />
        ) : (
          <FolderContents
            selected={selected}
            folders={myFolders}
            charts={charts}
            reports={reports}
            pinnedWidgets={pinnedWidgets}
            currentUser={currentUser}
            onViewChart={handleViewChart}
            onEditChart={handleEditChart}
            onDeleteChart={(c) => deleteChartMut.mutate(c.id)}
            onViewReport={handleViewReport}
            onEditReport={handleEditReport}
            onDeleteReport={(r) => deleteReportMut.mutate(r.id)}
            onPinnedWidgetsChange={() => qc.invalidateQueries({ queryKey: ["pinnedWidgets"] })}
          />
        )}
        </div>
      </div>

      {/* New Folder Modal */}
      {showNewFolderModal && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" onClick={() => setShowNewFolderModal(false)}>
          <div className="bg-white rounded-2xl p-5 w-80 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm font-semibold text-slate-800 mb-3">
              {newFolderParentId ? "New Subfolder" : "New Folder"}
            </p>
            <input
              autoFocus
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreateFolder()}
              placeholder="Folder name..."
              className="w-full border border-slate-200 rounded-lg text-sm px-3 py-2 outline-none mb-3"
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowNewFolderModal(false)} className="px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-all">Cancel</button>
              <button
                onClick={handleCreateFolder}
                disabled={!newFolderName.trim() || createFolderMut.isPending}
                className="px-3 py-1.5 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-all disabled:opacity-50"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}