import React, { useState, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import DataTable from "../components/shared/DataTable";
import EntityForm from "../components/shared/EntityForm";
import DeleteDialog from "../components/shared/DeleteDialog";
import SupersetEmbed from "../components/reports/SupersetEmbed";
import AirflowSection from "../components/reports/AirflowSection";
import AirflowSection from "../components/reports/AirflowSection";
import LiveChartsSection from "../components/reports/LiveChartsSection";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { format } from "date-fns";
import { Building2, Users, CheckCircle, Receipt, RefreshCw, Loader2, Plus } from "lucide-react";

const API_BASE = "https://newsconseenwebapp-production.up.railway.app";

const ENDPOINTS = {
  enterprises: "/enterprise-summary",
  people: "/people-summary",
  tasks: "/task-summary",
  transactions: "/transaction-summary",
  services: "/service-summary",
  products: "/product-summary",
};

const sumField = (arr, field) => (arr || []).reduce((acc, r) => acc + (Number(r[field]) || 0), 0);

async function fetchEndpoint(key) {
  const res = await fetch(`${API_BASE}${ENDPOINTS[key]}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  const data = Array.isArray(json) ? json : (json.data || json.results || []);
  return { data, updatedAt: new Date() };
}

const reportTypes = [
  { value: "financial", label: "Financial" }, { value: "inventory", label: "Inventory" },
  { value: "staff", label: "Staff" }, { value: "client", label: "Client" },
  { value: "performance", label: "Performance" }, { value: "custom", label: "Custom" },
];
const formFields = [
  { key: "title", label: "Report Title", required: true },
  { key: "type", label: "Type", type: "select", required: true, options: reportTypes },
  { key: "date_range_start", label: "Start Date", type: "date" },
  { key: "date_range_end", label: "End Date", type: "date" },
  { key: "content", label: "Notes / Content", type: "textarea" },
  { key: "status", label: "Status", type: "select", default: "draft", options: [
    { value: "draft", label: "Draft" }, { value: "published", label: "Published" },
  ]},
];
const typeColor = (t) => {
  const map = { financial: "bg-emerald-50 text-emerald-700", inventory: "bg-amber-50 text-amber-700", staff: "bg-blue-50 text-blue-700", client: "bg-purple-50 text-purple-700", performance: "bg-cyan-50 text-cyan-700", custom: "bg-slate-100 text-slate-600" };
  return map[t] || "bg-slate-100 text-slate-600";
};

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

export default function Reports() {
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [lastRefreshed, setLastRefreshed] = useState(null);

  // Per-endpoint state
  const [allData, setAllData] = useState({ enterprises: null, people: null, tasks: null, transactions: null, services: null, products: null });
  const [loadingMap, setLoadingMap] = useState({ enterprises: true, people: true, tasks: true, transactions: true, services: true, products: true });
  const [errorMap, setErrorMap] = useState({});

  const qc = useQueryClient();

  React.useEffect(() => { base44.auth.me().then(setCurrentUser).catch(() => {}); }, []);

  const isAdmin = currentUser?.role === "admin" || currentUser?.role === "super_admin";

  const { data: reports = [] } = useQuery({ queryKey: ["reports"], queryFn: () => base44.entities.Report.list("-created_date") });
  const { data: accessRecord } = useQuery({
    queryKey: ["myAccess", currentUser?.email],
    queryFn: async () => { const r = await base44.entities.UserAppAccess.filter({ user_email: currentUser.email }); return r[0] || null; },
    enabled: !!currentUser && !isAdmin,
  });
  const visibleReports = isAdmin ? reports : reports.filter((r) => accessRecord?.allowed_reports?.includes(r.id));

  const createMut = useMutation({ mutationFn: (d) => base44.entities.Report.create(d), onSuccess: () => { qc.invalidateQueries({ queryKey: ["reports"] }); setFormOpen(false); } });
  const updateMut = useMutation({ mutationFn: ({ id, data }) => base44.entities.Report.update(id, data), onSuccess: () => { qc.invalidateQueries({ queryKey: ["reports"] }); setFormOpen(false); setEditing(null); } });
  const deleteMut = useMutation({ mutationFn: (id) => base44.entities.Report.delete(id), onSuccess: () => { qc.invalidateQueries({ queryKey: ["reports"] }); setDeleting(null); } });

  const loadOne = useCallback(async (key) => {
    setLoadingMap((p) => ({ ...p, [key]: true }));
    setErrorMap((p) => ({ ...p, [key]: null }));
    try {
      const result = await fetchEndpoint(key);
      setAllData((p) => ({ ...p, [key]: result }));
    } catch (e) {
      setErrorMap((p) => ({ ...p, [key]: e.message || "Failed to load" }));
    } finally {
      setLoadingMap((p) => ({ ...p, [key]: false }));
    }
  }, []);

  const loadAll = useCallback(async () => {
    setLastRefreshed(null);
    const keys = Object.keys(ENDPOINTS);
    keys.forEach((k) => setLoadingMap((p) => ({ ...p, [k]: true })));
    await Promise.all(keys.map((k) => loadOne(k)));
    setLastRefreshed(new Date());
  }, [loadOne]);

  React.useEffect(() => { loadAll(); }, [loadAll]);

  // KPI values
  const kpiEnterprises = allData.enterprises?.data ? sumField(allData.enterprises.data, "enterprise_count") : null;
  const kpiPeople = allData.people?.data ? sumField(allData.people.data, "people_count") : null;
  const kpiTasks = allData.tasks?.data ? sumField(allData.tasks.data, "total_tasks") : null;
  const kpiTransactions = allData.transactions?.data ? sumField(allData.transactions.data, "total_transactions") : null;

  const anyLoading = Object.values(loadingMap).some(Boolean);

  const tableColumns = [
    { key: "title", label: "Title" },
    { key: "type", label: "Type", render: (val) => <Badge className={typeColor(val)}>{(val || "custom").replace(/_/g, " ")}</Badge> },
    { key: "date_range_start", label: "Start", render: (v) => v ? format(new Date(v), "MMM d, yyyy") : "—" },
    { key: "date_range_end", label: "End", render: (v) => v ? format(new Date(v), "MMM d, yyyy") : "—" },
    { key: "status", label: "Status", render: (val) => <Badge className={val === "published" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}>{val || "draft"}</Badge> },
  ];

  return (
    <div>
      {/* Page Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-3xl font-black text-slate-800">Analytics & Reports</h1>
          <p className="text-slate-400 text-sm mt-1">Live data from Newsconseen operations</p>
          {lastRefreshed && (
            <p className="text-[11px] text-slate-400 mt-1">Last refreshed: {format(lastRefreshed, "MMM d, h:mm:ss a")}</p>
          )}
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          <Button variant="outline" onClick={loadAll} disabled={anyLoading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${anyLoading ? "animate-spin" : ""}`} />
            Refresh All
          </Button>
          {isAdmin && (
            <Button variant="outline" onClick={() => { setEditing(null); setFormOpen(true); }}>
              <Plus className="w-4 h-4 mr-2" /> Create Report
            </Button>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <KpiCard icon={Building2} label="Total Enterprises" value={kpiEnterprises} loading={loadingMap.enterprises} iconBg="bg-blue-100" iconColor="text-blue-600" valueColor="text-blue-700" />
        <KpiCard icon={Users} label="Total People" value={kpiPeople} loading={loadingMap.people} iconBg="bg-emerald-100" iconColor="text-emerald-600" valueColor="text-emerald-700" />
        <KpiCard icon={CheckCircle} label="Total Tasks" value={kpiTasks} loading={loadingMap.tasks} iconBg="bg-purple-100" iconColor="text-purple-600" valueColor="text-purple-700" />
        <KpiCard icon={Receipt} label="Total Transactions" value={kpiTransactions} loading={loadingMap.transactions} iconBg="bg-orange-100" iconColor="text-orange-600" valueColor="text-orange-700" />
      </div>

      {/* Live Charts */}
      <h2 className="text-lg font-bold text-slate-700 mb-4">Live Charts</h2>
      <div className="mb-8">
        <LiveChartsSection allData={allData} loadingMap={loadingMap} errorMap={errorMap} onRetry={loadOne} />
      </div>

      {/* Superset Embed */}
      <SupersetEmbed />

      {/* Reports Table */}
      <h3 className="text-sm font-semibold text-slate-600 mb-4">Saved Reports</h3>
      <DataTable
        columns={tableColumns}
        data={visibleReports}
        searchField="title"
        onEdit={isAdmin ? (row) => { setEditing(row); setFormOpen(true); } : undefined}
        onDelete={isAdmin ? (row) => setDeleting(row) : undefined}
      />

      <EntityForm open={formOpen} onClose={() => { setFormOpen(false); setEditing(null); }} onSubmit={(d) => editing ? updateMut.mutate({ id: editing.id, data: d }) : createMut.mutate(d)} fields={formFields} initialData={editing} title={editing ? "Edit Report" : "Create Report"} />
      <DeleteDialog open={!!deleting} onClose={() => setDeleting(null)} onConfirm={() => deleteMut.mutate(deleting.id)} itemName={deleting?.title} />
    </div>
  );
}