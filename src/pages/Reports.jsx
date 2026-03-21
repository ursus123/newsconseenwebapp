import React, { useState, useCallback, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RefreshCw, Loader2, Activity, Database, X } from "lucide-react";
import { format } from "date-fns";
import { useEntityListFn } from "@/components/shared/useDataQuery";

import FolderTree from "../components/reports/FolderTree";
import FolderContents from "../components/reports/FolderContents";
import ChartBuilder from "../components/reports/ChartBuilder";
import ReportBuilder from "../components/reports/ReportBuilder";
import ReportViewer from "../components/reports/ReportViewer";
import ChartRenderer from "../components/reports/ChartRenderer";
import WelcomeSetup from "../components/reports/WelcomeSetup";
import LiveChartsSection from "../components/reports/LiveChartsSection";
import DashboardWidgetsGrid from "../components/reports/DashboardWidgetsGrid";
import ReportExporter from "../components/reports/ReportExporter";

const API_BASE = "https://newsconseenwebapp-production.up.railway.app";

async function fetchSummary(key, companyId) {
  const endpoints = {
    enterprises: "/enterprise-summary",
    people: "/people-summary",
    tasks: "/task-summary",
    transactions: "/transaction-summary",
    services: "/service-summary",
    products: "/product-summary",
  };
  const url = `${API_BASE}${endpoints[key]}${companyId ? `?company_id=${encodeURIComponent(companyId)}` : ""}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return { data: Array.isArray(json) ? json : (json.data || json.results || []), updatedAt: new Date() };
}

const LOADING_ALL = { enterprises: true, people: true, tasks: true, transactions: true, services: true, products: true };

// Chart viewer panel
function ChartViewer({ chart, onClose, onEdit, isAdmin }) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100 bg-white shrink-0">
        <Button variant="ghost" size="sm" onClick={onClose} className="gap-1.5">
          ← Back
        </Button>
        <div className="flex-1">
          <h2 className="text-base font-semibold text-slate-800">{chart.title}</h2>
          {chart.description && <p className="text-xs text-slate-400 mt-0.5">{chart.description}</p>}
        </div>
        {isAdmin && (
          <Button size="sm" variant="outline" onClick={() => onEdit(chart)} className="text-xs">Edit</Button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto p-8">
        <div className="max-w-4xl mx-auto">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <ChartRenderer chart={chart} height={400} />
          </div>
          <div className="mt-6 grid grid-cols-2 gap-4 text-xs text-slate-500">
            {chart.sql_query && isAdmin && (
              <details className="col-span-2 bg-slate-50 rounded-xl p-4">
                <summary className="font-semibold cursor-pointer text-slate-700">SQL Query</summary>
                <pre className="mt-2 font-mono text-xs text-slate-600 whitespace-pre-wrap">{chart.sql_query}</pre>
              </details>
            )}
            {chart.last_run_at && <div><span className="font-medium text-slate-700">Last run:</span> {format(new Date(chart.last_run_at), "MMM d, yyyy h:mm a")}</div>}
            {chart.tags?.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-medium text-slate-700">Tags:</span>
                {chart.tags.map((t) => <span key={t} className="bg-slate-100 px-2 py-0.5 rounded-full">{t}</span>)}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Data Pipeline panel
function DataPipelinePanel({ companyId, isAdmin }) {
  const [refreshing, setRefreshing] = useState(false);
  const [etlResult, setEtlResult] = useState(null);
  const [lastRefreshed, setLastRefreshed] = useState(null);

  const handleETL = async () => {
    setRefreshing(true);
    const endpoints = [
      { key: "enterprise-summary", path: "/load/enterprise-summary" },
      { key: "task-summary", path: "/load/task-summary" },
      { key: "people-summary", path: "/load/people-summary" },
      { key: "transaction-summary", path: "/load/transaction-summary" },
      { key: "service-summary", path: "/load/service-summary" },
      { key: "product-summary", path: "/load/product-summary" },
    ];
    const results = await Promise.allSettled(
      endpoints.map(async ({ key, path }) => {
        const url = `${API_BASE}${path}${companyId ? `?company_id=${encodeURIComponent(companyId)}` : ""}`;
        const res = await fetch(url, { method: "POST" });
        const json = await res.json();
        return { key, rows: json.rows_loaded ?? 0 };
      })
    );
    setEtlResult(results.map((r, i) => ({ key: endpoints[i].key, rows: r.status === "fulfilled" ? r.value.rows : 0, ok: r.status === "fulfilled" })));
    setLastRefreshed(new Date());
    setRefreshing(false);
  };

  if (!isAdmin) return <div className="p-6 text-sm text-slate-500">Admin access required.</div>;

  const pipelines = ["tasks_etl", "transactions_etl", "services_etl", "enterprises_etl", "people_etl", "products_etl", "geospatial_etl"];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2">
            <Activity className="w-4 h-4 text-blue-500" /> Data Pipeline
          </h2>
          {lastRefreshed && <p className="text-xs text-slate-400 mt-0.5">Last refreshed: {format(lastRefreshed, "MMM d, h:mm:ss a")}</p>}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => window.open("http://localhost:8080", "_blank")} className="text-xs gap-1.5">
            <Database className="w-3.5 h-3.5" /> Open Airflow
          </Button>
          <Button size="sm" onClick={handleETL} disabled={refreshing} className="bg-blue-600 hover:bg-blue-700 text-white text-xs gap-1.5">
            {refreshing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            {refreshing ? "Refreshing…" : "Trigger Refresh"}
          </Button>
        </div>
      </div>

      {etlResult && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
          <p className="text-xs font-semibold text-emerald-700 mb-2">✅ Analytics tables refreshed</p>
          <div className="flex flex-wrap gap-1.5">
            {etlResult.map(({ key, rows, ok }) => (
              <span key={key} className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${ok ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-600"}`}>
                {key}: {ok ? `${rows} rows` : "failed"}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {pipelines.map((p) => (
          <div key={p} className="bg-slate-50 rounded-xl px-4 py-3 border border-slate-100">
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <p className="text-xs font-semibold text-slate-700 font-mono truncate">{p}</p>
            </div>
            <p className="text-[10px] text-blue-500 font-medium">@daily</p>
          </div>
        ))}
      </div>

      <div className="pt-4 border-t border-slate-100">
        <p className="text-xs font-semibold text-slate-600 mb-3">Pinned Charts (QueryBuilder)</p>
        <DashboardWidgetsGrid />
      </div>
    </div>
  );
}

export default function Reports() {
  const [currentUser, setCurrentUser] = useState(null);
  const [selected, setSelected] = useState({ type: "all-charts", id: "all-charts" });
  const [view, setView] = useState("contents"); // contents | chart-view | chart-builder | report-builder | report-viewer | live-charts | data-pipeline | setup
  const [activeChart, setActiveChart] = useState(null);
  const [activeReport, setActiveReport] = useState(null);
  const [newFolderParentId, setNewFolderParentId] = useState(null);
  const [showNewFolderForm, setShowNewFolderForm] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [allData, setAllData] = useState({ enterprises: null, people: null, tasks: null, transactions: null, services: null, products: null });
  const [loadingMap, setLoadingMap] = useState(LOADING_ALL);
  const [errorMap, setErrorMap] = useState({});
  const [lastRefreshed, setLastRefreshed] = useState(null);
  const qc = useQueryClient();

  React.useEffect(() => {
    base44.auth.me().then(setCurrentUser).catch(() => {});
  }, []);

  const isAdmin = currentUser?.role === "admin" || currentUser?.role === "super_admin";
  const companyId = currentUser?.role === "super_admin" ? null : currentUser?.company_id;

  const { data: folders = [] } = useQuery({
    queryKey: ["chartFolders", companyId],
    queryFn: () => companyId
      ? base44.entities.ChartFolder.filter({ company_id: companyId, status: "active" })
      : base44.entities.ChartFolder.list(),
    enabled: !!currentUser,
  });

  const { data: charts = [] } = useQuery({
    queryKey: ["reportCharts", companyId],
    queryFn: () => companyId
      ? base44.entities.ReportChart.filter({ company_id: companyId, status: "active" })
      : base44.entities.ReportChart.list(),
    enabled: !!currentUser,
  });

  const { data: reports = [] } = useQuery({
    queryKey: ["reports", companyId],
    queryFn: () => companyId
      ? base44.entities.Report.filter({ company_id: companyId })
      : base44.entities.Report.list("-created_date"),
    enabled: !!currentUser,
  });

  const deleteChartMut = useMutation({
    mutationFn: (id) => base44.entities.ReportChart.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["reportCharts"] }),
  });
  const deleteReportMut = useMutation({
    mutationFn: (id) => base44.entities.Report.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["reports"] }),
  });
  const createFolderMut = useMutation({
    mutationFn: (data) => base44.entities.ChartFolder.create(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["chartFolders"] }); setShowNewFolderForm(false); setNewFolderName(""); },
  });

  const loadOne = useCallback(async (key) => {
    setLoadingMap((p) => ({ ...p, [key]: true }));
    try {
      const result = await fetchSummary(key, companyId);
      setAllData((p) => ({ ...p, [key]: result }));
    } catch (e) {
      setErrorMap((p) => ({ ...p, [key]: e.message }));
    } finally {
      setLoadingMap((p) => ({ ...p, [key]: false }));
    }
  }, [companyId]);

  const loadAll = useCallback(async () => {
    const keys = Object.keys({ enterprises: 1, people: 1, tasks: 1, transactions: 1, services: 1, products: 1 });
    await Promise.all(keys.map(loadOne));
    setLastRefreshed(new Date());
  }, [loadOne]);

  React.useEffect(() => {
    if (currentUser) loadAll();
  }, [currentUser?.company_id]);

  // Handle nav selection
  const handleSelect = (sel) => {
    setSelected(sel);
    if (sel.type === "system" && sel.id === "live-charts") { setView("live-charts"); return; }
    if (sel.type === "system" && sel.id === "data-pipeline") { setView("data-pipeline"); return; }
    if (sel.type === "system" && sel.id === "query-builder") { window.location.href = "/QueryBuilder"; return; }
    setView("contents");
  };

  const isSetupNeeded = !!currentUser && folders.length === 0 && charts.length === 0 && reports.length === 0
    && view !== "chart-builder" && view !== "report-builder";

  return (
    <div className="flex h-[calc(100vh-8rem)] -m-4 lg:-m-8 overflow-hidden rounded-2xl border border-slate-200 bg-white">
      {/* Left sidebar */}
      <div className="w-60 border-r border-slate-100 bg-slate-50 overflow-hidden flex flex-col shrink-0">
        <FolderTree
          folders={folders}
          charts={charts}
          reports={reports}
          selected={selected}
          onSelect={handleSelect}
          onNewFolder={(parentId) => { setNewFolderParentId(parentId); setShowNewFolderForm(true); }}
          onNewChart={() => { setActiveChart(null); setView("chart-builder"); }}
          onNewReport={() => { setActiveReport(null); setView("report-builder"); }}
          currentUser={currentUser}
        />
      </div>

      {/* Right content */}
      <div className="flex-1 overflow-hidden">
        {/* New folder form overlay */}
        {showNewFolderForm && (
          <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" onClick={() => setShowNewFolderForm(false)}>
            <div className="bg-white rounded-2xl p-5 w-80 shadow-xl" onClick={(e) => e.stopPropagation()}>
              <p className="text-sm font-semibold text-slate-800 mb-3">
                {newFolderParentId ? "New Subfolder" : "New Folder"}
              </p>
              <Input
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="Folder name..."
                autoFocus
                className="mb-3"
              />
              <div className="flex gap-2 justify-end">
                <Button size="sm" variant="outline" onClick={() => setShowNewFolderForm(false)}>Cancel</Button>
                <Button size="sm" disabled={!newFolderName.trim()} onClick={() => {
                  createFolderMut.mutate({
                    name: newFolderName.trim(),
                    parent_folder_id: newFolderParentId || null,
                    company_id: companyId,
                    status: "active",
                    shared_with_roles: ["admin"],
                  });
                }}>
                  Create
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Welcome / setup */}
        {isSetupNeeded && view === "contents" && isAdmin ? (
          <WelcomeSetup currentUser={currentUser} onComplete={() => setView("contents")} />
        ) : view === "chart-builder" ? (
          <ChartBuilder
            chart={activeChart}
            folders={folders}
            currentUser={currentUser}
            onClose={() => { setView("contents"); setActiveChart(null); }}
          />
        ) : view === "report-builder" ? (
          <ReportBuilder
            report={activeReport}
            folders={folders}
            charts={charts}
            currentUser={currentUser}
            onClose={() => { setView("contents"); setActiveReport(null); }}
          />
        ) : view === "chart-view" && activeChart ? (
          <ChartViewer
            chart={activeChart}
            isAdmin={isAdmin}
            onClose={() => { setView("contents"); setActiveChart(null); }}
            onEdit={(c) => { setActiveChart(c); setView("chart-builder"); }}
          />
        ) : view === "report-viewer" && activeReport ? (
          <ReportViewer
            report={activeReport}
            charts={charts}
            currentUser={currentUser}
            onClose={() => { setView("contents"); setActiveReport(null); }}
            onEdit={(r) => { setActiveReport(r); setView("report-builder"); }}
          />
        ) : view === "live-charts" ? (
          <div className="flex flex-col h-full overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="text-base font-semibold text-slate-800">Live Charts</h2>
              <div className="flex gap-2 items-center">
                {lastRefreshed && <span className="text-xs text-slate-400">Updated {format(lastRefreshed, "h:mm a")}</span>}
                <Button variant="outline" size="sm" onClick={loadAll} disabled={Object.values(loadingMap).some(Boolean)} className="gap-1.5 text-xs">
                  <RefreshCw className={`w-3.5 h-3.5 ${Object.values(loadingMap).some(Boolean) ? "animate-spin" : ""}`} /> Refresh
                </Button>
                <ReportExporter companyId={companyId} />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              <LiveChartsSection allData={allData} loadingMap={loadingMap} errorMap={errorMap} onRetry={loadOne} dateRange="all" />
            </div>
          </div>
        ) : view === "data-pipeline" ? (
          <div className="h-full overflow-y-auto">
            <DataPipelinePanel companyId={companyId} isAdmin={isAdmin} />
          </div>
        ) : (
          <FolderContents
            selected={selected}
            folders={folders}
            charts={charts}
            reports={reports}
            currentUser={currentUser}
            onViewChart={(c) => { setActiveChart(c); setView("chart-view"); }}
            onEditChart={(c) => { setActiveChart(c); setView("chart-builder"); }}
            onDeleteChart={(c) => deleteChartMut.mutate(c.id)}
            onViewReport={(r) => { setActiveReport(r); setView("report-viewer"); }}
            onEditReport={(r) => { setActiveReport(r); setView("report-builder"); }}
            onDeleteReport={(r) => deleteReportMut.mutate(r.id)}
          />
        )}
      </div>
    </div>
  );
}