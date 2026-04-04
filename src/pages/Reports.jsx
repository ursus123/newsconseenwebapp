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
import { Loader2, RefreshCw, Sparkles, TrendingUp, Users, AlertCircle, ChevronRight, Database } from "lucide-react";

const RAILWAY_URL = "https://newsconseenwebapp-production.up.railway.app";
const RAILWAY_API_KEY = typeof import.meta !== "undefined" ? (import.meta.env?.VITE_RAILWAY_API_KEY || "") : "";
const RAIL_HEADERS = RAILWAY_API_KEY ? { "x-api-key": RAILWAY_API_KEY } : {};

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
  const [view, setView] = useState("folders"); // folders | chart-builder | report-builder | report-viewer | chart-viewer | ml-insights
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
          </div>
        )}
        <div className="flex-1 overflow-hidden flex">
        {showSetup ? (
          <WelcomeSetup currentUser={currentUser} onComplete={() => setSetupDone(true)} />
        ) : view === "ml-insights" ? (
          <MLInsightsPanel currentUser={currentUser} onBack={() => setView("folders")} />
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