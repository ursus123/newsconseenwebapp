import React, { useState, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import DataTable from "../components/shared/DataTable";
import EntityForm from "../components/shared/EntityForm";
import DeleteDialog from "../components/shared/DeleteDialog";
import SupersetEmbed from "../components/reports/SupersetEmbed";
import LiveChartsSection from "../components/reports/LiveChartsSection";
import ReportExporter from "../components/reports/ReportExporter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { format } from "date-fns";
import {
  Building2, Users, CheckCircle, Receipt,
  RefreshCw, Loader2, Plus, TrendingUp,
  Database, Activity,
} from "lucide-react";

const API_BASE = "https://newsconseenwebapp-production.up.railway.app";

const ENDPOINTS = {
  enterprises:  "/enterprise-summary",
  people:       "/people-summary",
  tasks:        "/task-summary",
  transactions: "/transaction-summary",
  services:     "/service-summary",
  products:     "/product-summary",
};

const DATE_RANGES = [
  { id: "all",    label: "All Time" },
  { id: "month",  label: "This Month" },
  { id: "30days", label: "Last 30 Days" },
  { id: "90days", label: "Last 90 Days" },
  { id: "year",   label: "This Year" },
];

const sumField = (arr, field) =>
  (arr || []).reduce((acc, r) => acc + (Number(r[field]) || 0), 0);

function scopedUrl(path, companyId) {
  if (!companyId) return `${API_BASE}${path}`;
  const sep = path.includes("?") ? "&" : "?";
  return `${API_BASE}${path}${sep}company_id=${encodeURIComponent(companyId)}`;
}

function getDateParams(dateRange) {
  const now = new Date();
  if (dateRange === "month") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return `&date_from=${start.toISOString().split("T")[0]}&date_to=${now.toISOString().split("T")[0]}`;
  }
  if (dateRange === "30days") {
    const start = new Date(now - 30 * 24 * 60 * 60 * 1000);
    return `&date_from=${start.toISOString().split("T")[0]}`;
  }
  if (dateRange === "90days") {
    const start = new Date(now - 90 * 24 * 60 * 60 * 1000);
    return `&date_from=${start.toISOString().split("T")[0]}`;
  }
  if (dateRange === "year") {
    return `&date_from=${now.getFullYear()}-01-01`;
  }
  return "";
}

function getPreviousPeriodParams(dateRange) {
  const now = new Date();
  if (dateRange === "month") {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end   = new Date(now.getFullYear(), now.getMonth(), 0);
    return `&date_from=${start.toISOString().split("T")[0]}&date_to=${end.toISOString().split("T")[0]}`;
  }
  if (dateRange === "30days") {
    const start = new Date(now - 60 * 24 * 60 * 60 * 1000);
    const end   = new Date(now - 30 * 24 * 60 * 60 * 1000);
    return `&date_from=${start.toISOString().split("T")[0]}&date_to=${end.toISOString().split("T")[0]}`;
  }
  return "";
}

async function fetchEndpoint(key, companyId, dateRange, previousPeriod = false) {
  const dateParams = previousPeriod ? getPreviousPeriodParams(dateRange) : getDateParams(dateRange);
  const companyParam = companyId ? `?company_id=${encodeURIComponent(companyId)}` : "?";
  const url = `${API_BASE}${ENDPOINTS[key]}${companyParam}${dateParams}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  const data = Array.isArray(json) ? json : (json.data || json.results || []);
  return { data, updatedAt: new Date() };
}

const reportTypes = [
  { value: "financial",   label: "Financial" },
  { value: "inventory",   label: "Inventory" },
  { value: "staff",       label: "Staff" },
  { value: "client",      label: "Client" },
  { value: "performance", label: "Performance" },
  { value: "custom",      label: "Custom" },
];

const formFields = [
  { key: "title", label: "Report Title", required: true },
  { key: "type",  label: "Type", type: "select", required: true, options: reportTypes },
  { key: "date_range_start", label: "Start Date", type: "date" },
  { key: "date_range_end",   label: "End Date",   type: "date" },
  { key: "content", label: "Notes / Content", type: "textarea" },
  { key: "status",  label: "Status", type: "select", default: "draft", options: [
    { value: "draft",     label: "Draft" },
    { value: "published", label: "Published" },
  ]},
];

const typeColor = (t) => ({
  financial:   "bg-emerald-50 text-emerald-700",
  inventory:   "bg-amber-50 text-amber-700",
  staff:       "bg-blue-50 text-blue-700",
  client:      "bg-purple-50 text-purple-700",
  performance: "bg-cyan-50 text-cyan-700",
  custom:      "bg-slate-100 text-slate-600",
}[t] || "bg-slate-100 text-slate-600");

function KpiCard({ icon: Icon, label, value, loading, iconBg, iconColor, valueColor }) {
  return (
    <Card className="border border-slate-100 rounded-2xl">
      <CardContent className="pt-5 pb-4 px-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">{label}</p>
            {loading
              ? <Loader2 className="w-5 h-5 animate-spin text-slate-300 mt-1" />
              : <p className={`text-3xl font-black ${valueColor}`}>{value?.toLocaleString() ?? "—"}</p>
            }
          </div>
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${iconBg}`}>
            <Icon className={`w-5 h-5 ${iconColor}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function AirflowSection({ onManualRefresh, refreshing, etlResult }) {
  const pipelines = [
    { name: "tasks_etl",        desc: "Syncs task summaries",        schedule: "@daily" },
    { name: "transactions_etl", desc: "Syncs transaction summaries",  schedule: "@daily" },
    { name: "services_etl",     desc: "Syncs service summaries",      schedule: "@daily" },
    { name: "enterprises_etl",  desc: "Syncs enterprise summaries",   schedule: "@daily" },
    { name: "people_etl",       desc: "Syncs people summaries",       schedule: "@daily" },
    { name: "products_etl",     desc: "Syncs product summaries",      schedule: "@daily" },
    { name: "geospatial_etl",   desc: "Geocodes enterprise addresses", schedule: "@daily" },
  ];

  return (
    <Card className="border border-blue-100 rounded-2xl mb-8 overflow-hidden">
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 px-6 py-4 border-b border-blue-100">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-sm">
              <Activity className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-800">Data Pipeline (Airflow)</h3>
              <p className="text-xs text-slate-500 mt-0.5">Schedules ETL pipelines to keep analytics fresh</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => window.open("http://localhost:8080", "_blank")} className="text-xs gap-1.5">
              <Database className="w-3.5 h-3.5" /> Open Airflow
            </Button>
            <Button size="sm" onClick={onManualRefresh} disabled={refreshing} className="bg-blue-600 hover:bg-blue-700 text-white text-xs gap-1.5">
              {refreshing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              {refreshing ? "Refreshing…" : "Trigger Manual Refresh"}
            </Button>
          </div>
        </div>
      </div>
      <CardContent className="p-6">
        {etlResult && (
          <div className="mb-4 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {pipelines.map((p) => (
            <div key={p.name} className="bg-slate-50 rounded-xl px-4 py-3 border border-slate-100">
              <div className="flex items-center gap-2 mb-1">
                <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                <p className="text-xs font-semibold text-slate-700 font-mono truncate">{p.name}</p>
              </div>
              <p className="text-[11px] text-slate-400 leading-snug">{p.desc}</p>
              <p className="text-[10px] text-blue-500 font-medium mt-1">{p.schedule}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

const EMPTY_DATA = { enterprises: null, people: null, tasks: null, transactions: null, services: null, products: null };
const LOADING_ALL = { enterprises: true, people: true, tasks: true, transactions: true, services: true, products: true };

export default function Reports() {
  const [formOpen, setFormOpen]       = useState(false);
  const [editing, setEditing]         = useState(null);
  const [deleting, setDeleting]       = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [lastRefreshed, setLastRefreshed] = useState(null);
  const [etlRefreshing, setEtlRefreshing] = useState(false);
  const [etlResult, setEtlResult]     = useState(null);
  const [dateRange, setDateRange]     = useState("all");
  const [showComparison, setShowComparison] = useState(false);

  const [allData, setAllData]             = useState(EMPTY_DATA);
  const [allDataPrevious, setAllDataPrevious] = useState(EMPTY_DATA);
  const [loadingMap, setLoadingMap]       = useState(LOADING_ALL);
  const [errorMap, setErrorMap]           = useState({});

  const qc = useQueryClient();

  React.useEffect(() => {
    base44.auth.me().then(setCurrentUser).catch(() => {});
  }, []);

  const isAdmin      = currentUser?.role === "admin" || currentUser?.role === "super_admin";
  const isSuperAdmin = currentUser?.role === "super_admin";
  const companyId    = isSuperAdmin ? null : currentUser?.company_id;

  const { data: reports = [] } = useQuery({
    queryKey: ["reports"],
    queryFn: () => base44.entities.Report.list("-created_date"),
  });

  const { data: accessRecord } = useQuery({
    queryKey: ["myAccess", currentUser?.email],
    queryFn: async () => {
      const r = await base44.entities.UserAppAccess.filter({ user_email: currentUser.email });
      return r[0] || null;
    },
    enabled: !!currentUser && !isAdmin,
  });

  const visibleReports = isAdmin
    ? reports
    : reports.filter((r) => accessRecord?.allowed_reports?.includes(r.id));

  const createMut = useMutation({ mutationFn: (d) => base44.entities.Report.create(d), onSuccess: () => { qc.invalidateQueries({ queryKey: ["reports"] }); setFormOpen(false); } });
  const updateMut = useMutation({ mutationFn: ({ id, data }) => base44.entities.Report.update(id, data), onSuccess: () => { qc.invalidateQueries({ queryKey: ["reports"] }); setFormOpen(false); setEditing(null); } });
  const deleteMut = useMutation({ mutationFn: (id) => base44.entities.Report.delete(id), onSuccess: () => { qc.invalidateQueries({ queryKey: ["reports"] }); setDeleting(null); } });

  const loadOne = useCallback(async (key) => {
    setLoadingMap((p) => ({ ...p, [key]: true }));
    setErrorMap((p) => ({ ...p, [key]: null }));
    try {
      const result = await fetchEndpoint(key, companyId, dateRange, false);
      setAllData((p) => ({ ...p, [key]: result }));
    } catch (e) {
      setErrorMap((p) => ({ ...p, [key]: e.message || "Failed to load" }));
    } finally {
      setLoadingMap((p) => ({ ...p, [key]: false }));
    }
  }, [companyId, dateRange]);

  const loadAll = useCallback(async () => {
    setLastRefreshed(null);
    const keys = Object.keys(ENDPOINTS);
    keys.forEach((k) => setLoadingMap((p) => ({ ...p, [k]: true })));
    await Promise.all(keys.map((k) => loadOne(k)));
    setLastRefreshed(new Date());
  }, [loadOne]);

  const loadAllPrevious = useCallback(async () => {
    const keys = Object.keys(ENDPOINTS);
    await Promise.all(keys.map(async (key) => {
      try {
        const result = await fetchEndpoint(key, companyId, dateRange, true);
        setAllDataPrevious((p) => ({ ...p, [key]: result }));
      } catch {}
    }));
  }, [companyId, dateRange]);

  // Reload when user/companyId or dateRange changes
  React.useEffect(() => {
    if (currentUser) loadAll();
  }, [currentUser?.company_id, dateRange]);

  // Load comparison when toggled on
  React.useEffect(() => {
    if (showComparison && currentUser) loadAllPrevious();
  }, [showComparison, dateRange, currentUser?.company_id]);

  const handleManualETL = async () => {
    setEtlRefreshing(true);
    setEtlResult(null);
    const loadEndpoints = [
      { key: "enterprise-summary",  path: "/load/enterprise-summary" },
      { key: "task-summary",        path: "/load/task-summary" },
      { key: "people-summary",      path: "/load/people-summary" },
      { key: "transaction-summary", path: "/load/transaction-summary" },
      { key: "service-summary",     path: "/load/service-summary" },
      { key: "product-summary",     path: "/load/product-summary" },
    ];
    const results = await Promise.allSettled(
      loadEndpoints.map(async ({ key, path }) => {
        const url = scopedUrl(path, companyId);
        const res = await fetch(url, { method: "POST" });
        const json = await res.json();
        return { key, rows: json.rows_loaded ?? 0, status: json.status };
      })
    );
    const summary = results.map((r, i) => ({
      key:  loadEndpoints[i].key,
      rows: r.status === "fulfilled" ? r.value.rows : 0,
      ok:   r.status === "fulfilled",
    }));
    setEtlResult(summary);
    setEtlRefreshing(false);
    await loadAll();
  };

  const kpiEnterprises  = allData.enterprises?.data  ? sumField(allData.enterprises.data,  "enterprise_count")   : null;
  const kpiPeople       = allData.people?.data        ? sumField(allData.people.data,        "people_count")       : null;
  const kpiTasks        = allData.tasks?.data         ? sumField(allData.tasks.data,         "total_tasks")        : null;
  const kpiTransactions = allData.transactions?.data  ? sumField(allData.transactions.data,  "total_transactions") : null;
  const anyLoading      = Object.values(loadingMap).some(Boolean);

  const tableColumns = [
    { key: "title", label: "Title" },
    { key: "type",  label: "Type", render: (val) => (
      <Badge className={typeColor(val)}>{(val || "custom").replace(/_/g, " ")}</Badge>
    )},
    { key: "date_range_start", label: "Start", render: (v) => v ? format(new Date(v), "MMM d, yyyy") : "—" },
    { key: "date_range_end",   label: "End",   render: (v) => v ? format(new Date(v), "MMM d, yyyy") : "—" },
    { key: "status", label: "Status", render: (val) => (
      <Badge className={val === "published" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}>
        {val || "draft"}
      </Badge>
    )},
  ];

  return (
    <div>
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-3xl font-black text-slate-800">Analytics & Reports</h1>
          <p className="text-slate-400 text-sm mt-1">Live data from Newsconseen operations</p>
          {companyId && <p className="text-[11px] text-emerald-600 mt-0.5 font-medium">Scoped to your workspace</p>}
          {lastRefreshed && <p className="text-[11px] text-slate-400 mt-0.5">Last refreshed: {format(lastRefreshed, "MMM d, h:mm:ss a")}</p>}
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          <Button variant="outline" onClick={loadAll} disabled={anyLoading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${anyLoading ? "animate-spin" : ""}`} /> Refresh Charts
          </Button>
          <ReportExporter companyId={companyId} />
          {isAdmin && (
            <Button variant="outline" onClick={() => { setEditing(null); setFormOpen(true); }}>
              <Plus className="w-4 h-4 mr-2" /> Create Report
            </Button>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <KpiCard icon={Building2}   label="Total Enterprises"  value={kpiEnterprises}  loading={loadingMap.enterprises}  iconBg="bg-blue-100"   iconColor="text-blue-600"   valueColor="text-blue-700" />
        <KpiCard icon={Users}       label="Total People"       value={kpiPeople}       loading={loadingMap.people}       iconBg="bg-emerald-100" iconColor="text-emerald-600" valueColor="text-emerald-700" />
        <KpiCard icon={CheckCircle} label="Total Tasks"        value={kpiTasks}        loading={loadingMap.tasks}        iconBg="bg-purple-100" iconColor="text-purple-600" valueColor="text-purple-700" />
        <KpiCard icon={Receipt}     label="Total Transactions" value={kpiTransactions} loading={loadingMap.transactions} iconBg="bg-orange-100" iconColor="text-orange-600" valueColor="text-orange-700" />
      </div>

      {/* Live Charts header + controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 className="text-lg font-bold text-slate-700">Live Charts</h2>
        <div className="flex flex-wrap items-center gap-2">
          {/* Date range tabs */}
          <div className="bg-slate-100 rounded-xl p-0.5 flex gap-0.5">
            {DATE_RANGES.map(r => (
              <button
                key={r.id}
                onClick={() => setDateRange(r.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  dateRange === r.id
                    ? "bg-white shadow-sm text-slate-800"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
          {/* Comparison toggle */}
          <button
            onClick={() => setShowComparison(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${
              showComparison
                ? "bg-indigo-50 border-indigo-200 text-indigo-700"
                : "bg-white border-slate-200 text-slate-500"
            }`}
          >
            <TrendingUp className="w-3 h-3" />
            Compare to previous period
          </button>
        </div>
      </div>

      <div className="mb-8">
        <LiveChartsSection
          allData={allData}
          allDataPrevious={showComparison ? allDataPrevious : null}
          loadingMap={loadingMap}
          errorMap={errorMap}
          onRetry={loadOne}
          dateRange={dateRange}
        />
      </div>

      <SupersetEmbed />

      <AirflowSection onManualRefresh={handleManualETL} refreshing={etlRefreshing} etlResult={etlResult} />

      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-slate-600">Saved Reports</h3>
        <span className="text-xs text-slate-400">{visibleReports.length} reports</span>
      </div>
      <DataTable
        columns={tableColumns}
        data={visibleReports}
        searchField="title"
        onEdit={isAdmin ? (row) => { setEditing(row); setFormOpen(true); } : undefined}
        onDelete={isAdmin ? (row) => setDeleting(row) : undefined}
      />

      <EntityForm
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditing(null); }}
        onSubmit={(d) => editing ? updateMut.mutate({ id: editing.id, data: d }) : createMut.mutate(d)}
        fields={formFields}
        initialData={editing}
        title={editing ? "Edit Report" : "Create Report"}
      />
      <DeleteDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleteMut.mutate(deleting.id)}
        itemName={deleting?.title}
      />
    </div>
  );
}