import React, { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import PageHeader from "@/components/shared/PageHeader";
import DataTable from "@/components/shared/DataTable";
import DeleteDialog from "@/components/shared/DeleteDialog";
import DeleteAllDialog from "@/components/shared/DeleteAllDialog";
import BulkImportDialog from "@/components/shared/BulkImportDialog";
import BulkActionBar from "@/components/shared/BulkActionBar";
import SpreadsheetToolbar from "@/components/shared/SpreadsheetToolbar";
import ExportCSVButton from "@/components/shared/ExportCSVButton";
import ETLSyncBanner from "@/components/shared/ETLSyncBanner";
import { fuzzyFilter } from "@/components/shared/fuzzySearch";
import { useSpreadsheet } from "@/hooks/useSpreadsheet";
import { usePermissions } from "@/components/shared/usePermissions";
import { createWithScope, useEntityListFn, useWithScope } from "@/components/shared/useDataQuery";
import { useTaxonomySync } from "@/hooks/useTaxonomySync";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { Upload, Globe, CheckCircle, MapPin, Layers, Users2, Search, X } from "lucide-react";
import {
  TERRITORY_FIELDS, TERRITORY_MAPPING_RULES, TERRITORY_TEMPLATE_EXAMPLE,
  TERRITORY_TEMPLATE_INSTRUCTIONS, validateTerritory, transformTerritory,
} from "@/components/shared/importConfigs";

const RAILWAY_URL = "https://newsconseenwebapp-production.up.railway.app";
const RAILWAY_API_KEY = import.meta.env.VITE_RAILWAY_API_KEY || "";

const triggerETL = () =>
  fetch(`${RAILWAY_URL}/load/territory-summary`, { method: "POST", headers: { "x-api-key": RAILWAY_API_KEY } }).catch(() => {});

function logAudit(companyId, action, record, userEmail) {
  fetch(`${RAILWAY_URL}/audit/log`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(RAILWAY_API_KEY ? { "x-api-key": RAILWAY_API_KEY } : {}) },
    body: JSON.stringify({ company_id: companyId, entity_type: "territory", entity_id: record?.id, entity_name: record?.name || record?.id, action, changed_by: userEmail }),
  }).catch(() => {});
}

const STATUS_COLOR = {
  active:   "bg-emerald-50 text-emerald-700",
  inactive: "bg-slate-100 text-slate-500",
  pending:  "bg-amber-50 text-amber-700",
};

const TYPE_TABS = [
  { id: "all",          label: "All" },
  { id: "sales",        label: "Sales" },
  { id: "delivery",     label: "Delivery" },
  { id: "catchment",    label: "Catchment" },
];

const EMPTY_FORM = { name: "", territory_type: "", status: "active", country: "", region: "", area_km2: "", population_estimate: "", description: "" };

const columns = [
  {
    key: "name", label: "Territory",
    render: (val, row) => (
      <div>
        <p className="font-medium text-slate-800">{val || "—"}</p>
        {row.description && <p className="text-xs text-slate-400 truncate max-w-xs">{row.description}</p>}
      </div>
    ),
  },
  { key: "territory_type", label: "Type",    render: (v) => <span className="capitalize text-sm text-slate-600">{(v || "—").replace(/_/g, " ")}</span> },
  {
    key: "country", label: "Location",
    render: (v, row) => <span className="text-sm text-slate-600">{[row.region, v].filter(Boolean).join(", ") || "—"}</span>,
  },
  {
    key: "area_km2", label: "Area (km²)",
    render: (v) => v ? <span className="font-mono text-sm text-slate-600">{parseFloat(v).toLocaleString()}</span> : <span className="text-slate-300">—</span>,
  },
  {
    key: "population_estimate", label: "Population",
    render: (v) => v ? <span className="font-mono text-sm text-slate-600">{parseInt(v).toLocaleString()}</span> : <span className="text-slate-300">—</span>,
  },
  {
    key: "status", label: "Status",
    render: (v) => <Badge className={STATUS_COLOR[v] || "bg-slate-100 text-slate-600"}>{(v || "—").replace(/_/g, " ")}</Badge>,
  },
];

function StatCard({ icon: Icon, cls, label, value }) {
  return (
    <div className="bg-white border border-slate-100 rounded-2xl px-4 py-3 flex items-center gap-3">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${cls}`}><Icon className="w-4 h-4" /></div>
      <div><p className="text-xs text-slate-400">{label}</p><p className="text-lg font-bold text-slate-800 leading-tight">{value}</p></div>
    </div>
  );
}

function TerritoryForm({ open, onClose, onSubmit, initial }) {
  const [form, setForm] = useState(initial || EMPTY_FORM);
  useEffect(() => { setForm(initial || EMPTY_FORM); }, [initial, open]);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{initial ? "Edit Territory" : "Add Territory"}</DialogTitle></DialogHeader>
        <div className="space-y-4 mt-2">
          <div><label className="text-xs font-medium text-slate-600">Name *</label>
            <Input value={form.name} onChange={e => set("name", e.target.value)} placeholder="Northern Region" className="mt-1" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-medium text-slate-600">Territory Type *</label>
              <select value={form.territory_type} onChange={e => set("territory_type", e.target.value)} className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
                <option value="">Select type…</option>
                {["sales_zone","delivery_zone","catchment_area","service_area","coverage_area","sales_territory","region","district","other"].map(t => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
              </select></div>
            <div><label className="text-xs font-medium text-slate-600">Status</label>
              <select value={form.status} onChange={e => set("status", e.target.value)} className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
                {["active","inactive","pending"].map(s => <option key={s} value={s}>{s}</option>)}
              </select></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-medium text-slate-600">Country</label>
              <Input value={form.country} onChange={e => set("country", e.target.value)} placeholder="Kenya" className="mt-1" /></div>
            <div><label className="text-xs font-medium text-slate-600">Region / State</label>
              <Input value={form.region} onChange={e => set("region", e.target.value)} placeholder="Rift Valley" className="mt-1" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-medium text-slate-600">Area (km²)</label>
              <Input type="number" value={form.area_km2} onChange={e => set("area_km2", e.target.value)} placeholder="12500" className="mt-1" /></div>
            <div><label className="text-xs font-medium text-slate-600">Population Estimate</label>
              <Input type="number" value={form.population_estimate} onChange={e => set("population_estimate", e.target.value)} placeholder="250000" className="mt-1" /></div>
          </div>
          <div><label className="text-xs font-medium text-slate-600">Description</label>
            <Input value={form.description} onChange={e => set("description", e.target.value)} placeholder="Brief description…" className="mt-1" /></div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={() => { if (!form.name || !form.territory_type) return; onSubmit(form); }}>
              {initial ? "Save Changes" : "Add Territory"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function Territories() {
  const [formOpen, setFormOpen]       = useState(false);
  const [importOpen, setImportOpen]   = useState(false);
  const [editing, setEditing]         = useState(null);
  const [deleting, setDeleting]       = useState(null);
  const [deleteAllOpen, setDeleteAllOpen] = useState(false);
  const [search, setSearch]           = useState("");
  const [activeTab, setActiveTab]     = useState("all");
  const [selectedIds, setSelectedIds] = useState([]);

  const qc = useQueryClient();
  const { toast } = useToast();
  const { syncState } = useTaxonomySync();

  const { data: currentUser = null } = useQuery({ queryKey: ["currentUser"], queryFn: () => base44.auth.me(), staleTime: 0 });
  const companyId  = currentUser?.company_id;
  const perms      = usePermissions(currentUser);
  const listFn     = useEntityListFn(currentUser);
  const withScope  = useWithScope(currentUser);

  useEffect(() => {
    const fn = () => { if (document.visibilityState === "visible") qc.refetchQueries({ queryKey: ["territories"] }); };
    document.addEventListener("visibilitychange", fn);
    return () => document.removeEventListener("visibilitychange", fn);
  }, [qc]);

  const { data: territories = [], isLoading } = useQuery({
    queryKey: ["territories", companyId],
    queryFn:  () => listFn(base44.entities.Territory),
    enabled:  currentUser !== null,
    staleTime: 0,
    refetchOnMount: "always",
  });

  const createMut = useMutation({
    mutationFn: (d) => createWithScope(base44.entities.Territory, d, currentUser),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["territories"] }); qc.refetchQueries({ queryKey: ["territories"] });
      triggerETL(); logAudit(companyId, "created", editing, currentUser?.email); setFormOpen(false);
    },
  });
  const updateMut = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Territory.update(id, withScope(data)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["territories"] }); qc.refetchQueries({ queryKey: ["territories"] });
      triggerETL(); logAudit(companyId, "updated", editing, currentUser?.email); setFormOpen(false); setEditing(null);
    },
  });
  const deleteMut = useMutation({
    mutationFn: (id) => base44.entities.Territory.delete(id),
    onSuccess: () => {
      logAudit(companyId, "deleted", deleting, currentUser?.email);
      qc.invalidateQueries({ queryKey: ["territories"] }); qc.refetchQueries({ queryKey: ["territories"] }); triggerETL(); setDeleting(null);
    },
  });

  const handleBulkDelete = async () => {
    for (const id of selectedIds) await base44.entities.Territory.delete(id).catch(() => {});
    qc.invalidateQueries({ queryKey: ["territories"] }); qc.refetchQueries({ queryKey: ["territories"] }); triggerETL();
    toast({ title: `${selectedIds.length} territories deleted` }); setSelectedIds([]);
  };
  const handleDeleteAll = async () => {
    for (const t of territories) { try { await base44.entities.Territory.delete(t.id); } catch {} }
    qc.invalidateQueries({ queryKey: ["territories"] }); qc.refetchQueries({ queryKey: ["territories"] }); triggerETL();
    toast({ title: `All ${territories.length} territories deleted` });
  };

  const tabFiltered = useMemo(() => {
    if (activeTab === "all") return territories;
    return territories.filter(t => (t.territory_type || "").toLowerCase().includes(activeTab));
  }, [territories, activeTab]);

  const processed = useMemo(() => {
    let list = search ? fuzzyFilter(tabFiltered, search, ["name", "territory_type", "country", "region", "description"]) : [...tabFiltered];
    return list.sort((a, b) => new Date(b.created_date || 0) - new Date(a.created_date || 0));
  }, [tabFiltered, search]);

  const ss = useSpreadsheet(processed, columns);
  const totalArea = territories.reduce((sum, t) => sum + (parseFloat(t.area_km2) || 0), 0);
  const totalPop  = territories.reduce((sum, t) => sum + (parseInt(t.population_estimate) || 0), 0);

  return (
    <div className="space-y-5">
      <PageHeader title="Territories" subtitle="Sales zones, delivery areas, catchment areas, geographic coverage"
        onAdd={perms.l1_create ? () => { setEditing(null); setFormOpen(true); } : undefined} addLabel="Add Territory">
        {perms.l1_create && (
          <Button variant="outline" size="sm" className="rounded-xl" onClick={() => setImportOpen(true)}>
            <Upload className="w-4 h-4 mr-2" /> Import
          </Button>
        )}
        <ExportCSVButton data={processed} fields={["name","territory_type","status","country","region","area_km2","population_estimate"]} filename="territories_export" />
        {perms.can_delete && territories.length > 0 && (
          <Button variant="outline" size="sm" className="rounded-xl border-rose-200 text-rose-600 hover:bg-rose-50" onClick={() => setDeleteAllOpen(true)}>Delete All</Button>
        )}
        <ETLSyncBanner syncState={syncState} entityType="territory" />
      </PageHeader>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={Globe}       cls="bg-slate-100 text-slate-500"    label="Total Territories" value={territories.length} />
        <StatCard icon={CheckCircle} cls="bg-emerald-50 text-emerald-600" label="Active"             value={territories.filter(t => t.status === "active").length} />
        <StatCard icon={Layers}      cls="bg-blue-50 text-blue-600"       label="Total Area (km²)"  value={totalArea > 0 ? totalArea.toLocaleString(undefined, { maximumFractionDigits: 0 }) : "—"} />
        <StatCard icon={Users2}      cls="bg-purple-50 text-purple-600"   label="Total Population"  value={totalPop > 0 ? totalPop.toLocaleString() : "—"} />
      </div>

      <div className="bg-slate-100 rounded-xl p-1 flex flex-wrap gap-1">
        {TYPE_TABS.map(tab => {
          const count = tab.id === "all" ? territories.length : territories.filter(t => (t.territory_type || "").toLowerCase().includes(tab.id)).length;
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 ${activeTab === tab.id ? "bg-white shadow-sm text-slate-800" : "text-slate-500 hover:text-slate-700"}`}>
              {tab.label}
              <span className={`text-[11px] px-1.5 py-0.5 rounded-full ${activeTab === tab.id ? "bg-slate-100 text-slate-600" : "bg-slate-200 text-slate-500"}`}>{count}</span>
            </button>
          );
        })}
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search territories…"
          className="w-full pl-8 pr-8 py-2 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-slate-200" />
        {search && <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"><X className="w-3.5 h-3.5" /></button>}
      </div>

      <BulkActionBar selectedIds={selectedIds} onClear={() => setSelectedIds([])}
        onDeleteSelected={perms.can_delete ? handleBulkDelete : undefined} canDelete={perms.can_delete} />
      <SpreadsheetToolbar {...ss.toolbarProps}
        selectedIds={selectedIds} onSelectAll={() => setSelectedIds(ss.processedData.map(r => r.id))} onClearSelect={() => setSelectedIds([])} />

      {!isLoading && territories.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 border-2 border-dashed border-slate-100 rounded-2xl">
          <Globe className="w-10 h-10 text-slate-200 mb-3" />
          <p className="text-slate-400 font-medium mb-1">No territories yet</p>
          <p className="text-slate-300 text-sm mb-4">Define sales zones, delivery areas, and coverage regions</p>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => { setEditing(null); setFormOpen(true); }} className="bg-emerald-600 hover:bg-emerald-700 rounded-xl">Add Territory</Button>
            <Button size="sm" variant="outline" onClick={() => setImportOpen(true)} className="rounded-xl">Import from Excel</Button>
          </div>
        </div>
      ) : (
        <DataTable {...ss.tableProps}
          onEdit={perms.l1_edit ? (row) => { setEditing(row); setFormOpen(true); } : undefined}
          onDelete={perms.can_delete ? (row) => setDeleting(row) : undefined}
          bulkMode selectedIds={selectedIds} onSelectionChange={setSelectedIds} />
      )}

      <TerritoryForm open={formOpen} onClose={() => { setFormOpen(false); setEditing(null); }}
        initial={editing} onSubmit={(d) => editing ? updateMut.mutateAsync({ id: editing.id, data: d }) : createMut.mutateAsync(d)} />
      <DeleteDialog open={!!deleting} onClose={() => setDeleting(null)} onConfirm={() => deleteMut.mutate(deleting.id)} itemName={deleting?.name || "this territory"} />
      <DeleteAllDialog open={deleteAllOpen} onClose={() => setDeleteAllOpen(false)} onConfirm={handleDeleteAll} entityLabel="Territories" count={territories.length} />
      <BulkImportDialog open={importOpen}
        onClose={() => { setImportOpen(false); qc.invalidateQueries({ queryKey: ["territories"] }); qc.refetchQueries({ queryKey: ["territories"] }); }}
        entityName="Territories" fields={TERRITORY_FIELDS} mappingRules={TERRITORY_MAPPING_RULES}
        templateExample={TERRITORY_TEMPLATE_EXAMPLE} templateInstructions={TERRITORY_TEMPLATE_INSTRUCTIONS}
        entityFetchFn={() => listFn(base44.entities.Territory)}
        validateRow={validateTerritory} transformRow={transformTerritory}
        onImport={(row) => createWithScope(base44.entities.Territory, row, currentUser)}
        currentUser={currentUser} requiredField="name" />
    </div>
  );
}
