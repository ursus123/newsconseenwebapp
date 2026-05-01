import React, { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import PageHeader from "../components/shared/PageHeader";
import DataTable from "../components/shared/DataTable";
import DeleteDialog from "../components/shared/DeleteDialog";
import ServiceForm from "../components/services/ServiceForm";
import SearchFilterBar from "../components/shared/SearchFilterBar";
import BulkActionBar from "../components/shared/BulkActionBar";
import { Badge } from "@/components/ui/badge";
import { usePermissions } from "@/components/shared/usePermissions";
import { addRecordToQueryCache, createWithScope, useEntityListFn, useWithScope } from "@/components/shared/useDataQuery";
import { fuzzyFilter } from "@/components/shared/fuzzySearch";
import BulkImportDialog from "../components/shared/BulkImportDialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { Upload, Settings, CheckCircle, Clock, DollarSign, BarChart2, X } from "lucide-react";
import ExportCSVButton from "@/components/shared/ExportCSVButton";
import SpreadsheetToolbar from "@/components/shared/SpreadsheetToolbar";
import { useSpreadsheet } from "@/hooks/useSpreadsheet";
import DeleteAllDialog from "@/components/shared/DeleteAllDialog";
import ServicesAnalytics from "@/components/services/ServicesAnalytics";
import {
  SERVICE_FIELDS, SERVICE_MAPPING_RULES, SERVICE_TEMPLATE_EXAMPLE,
  SERVICE_TEMPLATE_INSTRUCTIONS, validateService, transformService,
} from "@/components/shared/importConfigs";

const RAILWAY_URL = "https://newsconseenwebapp-production.up.railway.app";
const RAILWAY_API_KEY = import.meta.env.VITE_RAILWAY_API_KEY || "";

const triggerETL = (entity) =>
  fetch(`${RAILWAY_URL}/load/${entity}-summary`, {
    method: "POST",
    headers: { "x-api-key": RAILWAY_API_KEY },
  }).catch(() => {});

function triggerWorkflows(companyId, triggerType, entityData) {
  fetch(`${RAILWAY_URL}/workflows/trigger`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(RAILWAY_API_KEY ? { "x-api-key": RAILWAY_API_KEY } : {}) },
    body: JSON.stringify({ company_id: companyId, trigger_type: triggerType, entity_type: "service", entity_data: entityData }),
  }).catch(() => {});
}

function logAudit(companyId, action, record, userEmail) {
  fetch(`${RAILWAY_URL}/audit/log`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(RAILWAY_API_KEY ? { "x-api-key": RAILWAY_API_KEY } : {}) },
    body: JSON.stringify({ company_id: companyId, entity_type: "service", entity_id: record?.id, entity_name: record?.name || record?.id, action, changed_by: userEmail }),
  }).catch(() => {});
}

const statusColor = (s) => ({
  active:   "bg-emerald-50 text-emerald-700",
  inactive: "bg-amber-50 text-amber-700",
  archived: "bg-slate-100 text-slate-400",
}[s] || "bg-slate-100 text-slate-600");

const typeColor = (t) => ({
  recurring: "bg-emerald-50 text-emerald-700",
  on_demand: "bg-blue-50 text-blue-700",
  one_time:  "bg-slate-100 text-slate-600",
}[t] || "bg-slate-100 text-slate-600");

const columns = [
  {
    key: "name", label: "Service",
    render: (val, row) => (
      <div>
        <p className="font-medium text-slate-800">{val}</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          {row.short_code && <span className="text-[10px] font-mono text-slate-400">{row.short_code}</span>}
          {row.estimated_duration && row.duration_unit && (
            <span className="text-[10px] text-slate-400">· {row.estimated_duration} {row.duration_unit}</span>
          )}
        </div>
      </div>
    ),
  },
  { key: "category",     label: "Category", render: (val) => val ? <Badge className="bg-blue-50 text-blue-700">{val.replace(/_/g, " ")}</Badge> : "—" },
  { key: "service_type", label: "Type",     render: (val) => val ? <Badge className={typeColor(val)}>{val.replace(/_/g, " ")}</Badge> : "—" },
  {
    key: "pricing_model", label: "Pricing",
    render: (val, row) => (
      <div>
        <span className="text-xs text-slate-600 capitalize">{val?.replace(/_/g, " ") || "—"}</span>
        {row.billing_unit && <span className="text-[10px] text-slate-400 ml-1">/ {row.billing_unit}</span>}
      </div>
    ),
  },
  { key: "price",  label: "Price",  render: (v) => v != null ? <span className="font-semibold text-slate-800">${parseFloat(v).toLocaleString()}</span> : "—" },
  { key: "status", label: "Status", render: (val) => <Badge className={statusColor(val)}>{val || "active"}</Badge> },
];

const CATEGORY_TABS = [
  { id: "all",          label: "All" },
  { id: "consulting",   label: "Consulting" },
  { id: "maintenance",  label: "Maintenance" },
  { id: "installation", label: "Installation" },
  { id: "delivery",     label: "Delivery" },
  { id: "training",     label: "Training" },
  { id: "design",       label: "Design" },
  { id: "it_support",   label: "IT Support" },
  { id: "other",        label: "Other" },
];

const SVC_PREVIEW_COLS = [
  { label: "Name",     render: (r) => r.name || <span className="text-rose-500">MISSING</span> },
  { label: "Category", render: (r) => r.category || "—" },
  { label: "Type",     render: (r) => r.service_type || "—" },
  { label: "Price",    render: (r) => r.price ? `$${r.price}` : "—" },
  { label: "Status",   render: (r) => r.status || "active" },
];

function StatCard({ icon: Icon, iconClass, label, value }) {
  return (
    <div className="bg-white border border-slate-100 rounded-2xl px-4 py-3 flex items-center gap-3">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${iconClass}`}><Icon className="w-4 h-4" /></div>
      <div><p className="text-xs text-slate-400">{label}</p><p className="text-lg font-bold text-slate-800 leading-tight">{value}</p></div>
    </div>
  );
}

const FILTER_DEFS = [
  { key: "status",        label: "All Status",  options: [{ value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }, { value: "archived", label: "Archived" }] },
  { key: "service_type",  label: "All Types",   options: [{ value: "recurring", label: "Recurring" }, { value: "on_demand", label: "On Demand" }, { value: "one_time", label: "One Time" }] },
  { key: "pricing_model", label: "All Pricing", options: [{ value: "fixed", label: "Fixed" }, { value: "hourly", label: "Hourly" }, { value: "per_unit", label: "Per Unit" }, { value: "subscription", label: "Subscription" }] },
];

export default function Services() {
  const [formOpen, setFormOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [analyticsOpen, setAnalyticsOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const { data: currentUser = null } = useQuery({
    queryKey: ["currentUser"],
    queryFn: () => base44.auth.me(),
    staleTime: 0,
    refetchOnMount: "always",
  });
  const [activeTab, setActiveTab] = useState("all");
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({ status: "", service_type: "", pricing_model: "" });
  const [selectedIds, setSelectedIds] = useState([]);
  const [deleteAllOpen, setDeleteAllOpen] = useState(false);
  const qc = useQueryClient();
  const { toast } = useToast();

  useEffect(() => {
    const fn = () => { if (document.visibilityState === "visible") qc.refetchQueries({ queryKey: ["services"] }); };
    document.addEventListener("visibilitychange", fn);
    return () => document.removeEventListener("visibilitychange", fn);
  }, [qc]);

  const perms = usePermissions(currentUser);
  const listFn = useEntityListFn(currentUser);
  const withScope = useWithScope(currentUser);

  const { data: services = [], isLoading, isError } = useQuery({
    queryKey: ["services", currentUser?.company_id, currentUser?.email],
    queryFn: () => listFn(base44.entities.Service),
    enabled: currentUser !== null,
    staleTime: 0,
    refetchOnMount: "always",
  });

  const createMut = useMutation({
    mutationFn: (d) => createWithScope(base44.entities.Service, d, currentUser),
    onSuccess: (created) => {
      addRecordToQueryCache(qc, ["services"], created);
      qc.invalidateQueries({ queryKey: ["services"] });
      qc.refetchQueries({ queryKey: ["services"] });
      triggerETL("service");
      logAudit(created?.company_id || currentUser?.company_id, "created", created, currentUser?.email);
      triggerWorkflows(created?.company_id || currentUser?.company_id, "entity_created", created);
      setFormOpen(false);
      setEditing(null);
      toast({ title: "Service saved" });
    },
    onError: (err) => toast({ title: "Failed to save service", description: err?.message || String(err), variant: "destructive" }),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Service.update(id, withScope(data)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["services"] });
      qc.refetchQueries({ queryKey: ["services"] });
      triggerETL("service");
      logAudit(currentUser?.company_id, "updated", editing, currentUser?.email);
      triggerWorkflows(currentUser?.company_id, "entity_updated", editing);
      setFormOpen(false);
      setEditing(null);
      toast({ title: "Service updated" });
    },
    onError: (err) => toast({ title: "Failed to update service", description: err?.message || String(err), variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => base44.entities.Service.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["services"] });
      qc.refetchQueries({ queryKey: ["services"] });
      triggerETL("service");
      logAudit(currentUser?.company_id, "deleted", deleting, currentUser?.email);
      setDeleting(null);
      toast({ title: "Service deleted" });
    },
    onError: (err) => toast({ title: "Failed to delete service", description: err?.message || String(err), variant: "destructive" }),
  });

  const handleSubmit = async (data, saveAndNew = false) => {
    if (editing) {
      return updateMut.mutateAsync({ id: editing.id, data });
    }
    const created = await createMut.mutateAsync(data);
    if (saveAndNew) { setEditing(null); setFormOpen(true); }
    return created;
  };

  const handleArchive = (item) => {
    updateMut.mutate({ id: item.id, data: { ...item, status: "archived" } });
    setFormOpen(false);
    setEditing(null);
  };

  const handleBulkDelete = async () => {
    for (const id of selectedIds) await base44.entities.Service.delete(id);
    qc.invalidateQueries({ queryKey: ["services"] });
    qc.refetchQueries({ queryKey: ["services"] });
    triggerETL("service");
    toast({ title: `${selectedIds.length} services deleted` });
    setSelectedIds([]);
  };

  const handleDeleteAll = async () => {
    for (const s of services) { try { await base44.entities.Service.delete(s.id); } catch (_) {} }
    qc.invalidateQueries({ queryKey: ["services"] });
    qc.refetchQueries({ queryKey: ["services"] });
    triggerETL("service");
    toast({ title: `All ${services.length} services deleted` });
  };

  const tabFiltered = activeTab === "all" ? services : services.filter((s) => s.category === activeTab);

  const processedServices = useMemo(() => {
    let list = [...tabFiltered];
    if (search) list = fuzzyFilter(list, search, ["name", "short_code", "description", "category", "sub_category"]);
    if (filters.status)        list = list.filter((s) => s.status === filters.status);
    if (filters.service_type)  list = list.filter((s) => s.service_type === filters.service_type);
    if (filters.pricing_model) list = list.filter((s) => s.pricing_model === filters.pricing_model);
    return list;
  }, [tabFiltered, search, filters]);

  const ss = useSpreadsheet(processedServices, columns);

  const avgPrice = services.length > 0
    ? "$" + (services.reduce((sum, s) => sum + (parseFloat(s.price) || 0), 0) / services.length).toFixed(0)
    : "$0";

  const visibleTabs = CATEGORY_TABS.filter((t) => t.id === "all" || services.some((s) => s.category === t.id));

  return (
    <div className="space-y-5">
      <PageHeader
        title="Services"
        subtitle="Define reusable service offerings and pricing"
        onAdd={perms.can_create ? () => { setEditing(null); setFormOpen(true); } : undefined}
        addLabel="New Service"
      >
        {perms.can_create && (
          <Button variant="outline" size="sm" className="rounded-xl" onClick={() => setImportOpen(true)}>
            <Upload className="w-4 h-4 mr-2" /> Import
          </Button>
        )}
        <ExportCSVButton
          data={processedServices}
          fields={["name","short_code","category","service_type","pricing_model","price","billing_unit","status"]}
          filename="services_export"
        />
        {perms.can_delete && services.length > 0 && (
          <Button variant="outline" size="sm" className="rounded-xl border-rose-200 text-rose-600 hover:bg-rose-50" onClick={() => setDeleteAllOpen(true)}>
            🗑️ Delete All
          </Button>
        )}
      </PageHeader>

      <div className="flex justify-end -mt-1 mb-2">
        <button onClick={() => setAnalyticsOpen(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-white border border-slate-200 text-slate-600 hover:border-emerald-400 hover:text-emerald-700 transition-all shadow-sm">
          <BarChart2 className="w-3.5 h-3.5" /> Analytics
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={Settings}     iconClass="bg-slate-100 text-slate-500"   label="Total Services" value={services.length} />
        <StatCard icon={CheckCircle}  iconClass="bg-emerald-50 text-emerald-600" label="Active"         value={services.filter((s) => s.status === "active").length} />
        <StatCard icon={Clock}        iconClass="bg-blue-50 text-blue-600"       label="Recurring"      value={services.filter((s) => s.service_type === "recurring").length} />
        <StatCard icon={DollarSign}   iconClass="bg-purple-50 text-purple-600"   label="Average Price"  value={avgPrice} />
      </div>

      {visibleTabs.length > 1 && (
        <div className="bg-slate-100 rounded-xl p-1 flex flex-wrap gap-1">
          {visibleTabs.map((tab) => {
            const count = tab.id === "all" ? services.length : services.filter((s) => s.category === tab.id).length;
            const isActive = activeTab === tab.id;
            return (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 ${isActive ? "bg-white shadow-sm text-slate-800" : "text-slate-500 hover:text-slate-700"}`}>
                {tab.label}
                <span className={`text-[11px] px-1.5 py-0.5 rounded-full ${isActive ? "bg-slate-100 text-slate-600" : "bg-slate-200 text-slate-500"}`}>{count}</span>
              </button>
            );
          })}
        </div>
      )}

      <SearchFilterBar
        search={search} setSearch={setSearch}
        filters={filters} setFilters={setFilters}
        filterDefs={FILTER_DEFS}
        placeholder="Search services, categories..."
        resultCount={processedServices.length}
        totalCount={tabFiltered.length}
      />

      <BulkActionBar
        selectedIds={selectedIds}
        onClear={() => setSelectedIds([])}
        onDeleteSelected={perms.can_delete ? handleBulkDelete : undefined}
        canDelete={perms.can_delete}
      />

      <SpreadsheetToolbar
        {...ss.toolbarProps}
        numericFields={[
          { key: "price",              label: "Price" },
          { key: "estimated_duration", label: "Duration" },
        ]}
        selectedIds={selectedIds}
        onSelectAll={() => setSelectedIds(ss.processedData.map((r) => r.id))}
        onClearSelect={() => setSelectedIds([])}
        onWriteBack={perms.can_edit ? async (updates) => {
          for (const { id, field, value } of updates) {
            await base44.entities.Service.update(id, { [field]: value });
          }
          triggerETL("service");
          qc.invalidateQueries({ queryKey: ["services"] });
          toast({ title: `${updates.length} record${updates.length !== 1 ? "s" : ""} updated` });
        } : undefined}
      />

      {isError && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 text-sm text-rose-700">
          Failed to load services — check your connection and refresh.
        </div>
      )}

      {!isLoading && services.length === 0 && !isError ? (
        <div className="flex flex-col items-center justify-center py-16 border-2 border-dashed border-slate-100 rounded-2xl">
          <Settings className="w-10 h-10 text-slate-200 mb-3" />
          <p className="text-slate-400 font-medium mb-1">No services yet</p>
          <p className="text-slate-300 text-sm mb-4">Add your service catalog to start tracking operations</p>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => { setEditing(null); setFormOpen(true); }} className="bg-emerald-600 hover:bg-emerald-700 rounded-xl">Add First Service</Button>
            <Button size="sm" variant="outline" onClick={() => setImportOpen(true)} className="rounded-xl">Import from Excel</Button>
          </div>
        </div>
      ) : (
        <DataTable
          {...ss.tableProps}
          onEdit={perms.can_edit ? (row) => { setEditing(row); setFormOpen(true); } : undefined}
          onDelete={perms.can_delete ? (row) => setDeleting(row) : undefined}
          bulkMode
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
          onCellEdit={perms.can_edit ? async (id, field, value) => {
            await base44.entities.Service.update(id, { [field]: value });
            triggerETL("service");
            qc.invalidateQueries({ queryKey: ["services"] });
          } : undefined}
        />
      )}

      <DeleteAllDialog open={deleteAllOpen} onClose={() => setDeleteAllOpen(false)} onConfirm={handleDeleteAll} entityLabel="Services" count={services.length} />
      <DeleteDialog open={!!deleting} onClose={() => setDeleting(null)} onConfirm={() => deleteMut.mutate(deleting.id)} itemName={deleting?.name} />
      <ServiceForm
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditing(null); }}
        onSubmit={handleSubmit}
        onArchive={handleArchive}
        initialData={editing}
      />

      {analyticsOpen && (
        <div className="fixed inset-0 z-50 bg-white overflow-y-auto">
          <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-white shadow-sm">
            <p className="font-bold text-slate-800">Services Analytics</p>
            <button onClick={() => setAnalyticsOpen(false)} className="p-2 rounded-lg hover:bg-slate-100 transition-colors">
              <X className="w-5 h-5 text-slate-500" />
            </button>
          </div>
          <div className="p-6">
            <ServicesAnalytics services={services} currentUser={currentUser} />
          </div>
        </div>
      )}

      <BulkImportDialog
        open={importOpen}
        onClose={() => { setImportOpen(false); qc.invalidateQueries({ queryKey: ["services"] }); qc.refetchQueries({ queryKey: ["services"] }); }}
        entityName="Services"
        fields={SERVICE_FIELDS}
        mappingRules={SERVICE_MAPPING_RULES}
        templateFileName="newsconseen_services_import_template.xlsx"
        templateExample={SERVICE_TEMPLATE_EXAMPLE}
        templateInstructions={SERVICE_TEMPLATE_INSTRUCTIONS}
        validateRow={validateService}
        transformRow={transformService}
        entityFetchFn={() => listFn(base44.entities.Service)}
        onImport={async (row) => { const s = await createWithScope(base44.entities.Service, row, currentUser); triggerETL("service"); return s; }}
        currentUser={currentUser}
        previewColumns={SVC_PREVIEW_COLS}
        requiredField="name"
      />
    </div>
  );
}
