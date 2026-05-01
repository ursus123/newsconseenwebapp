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
import { useEntityListFn } from "@/components/shared/useDataQuery";
import { useTaxonomySync } from "@/hooks/useTaxonomySync";
import dataService from "@/services/dataService";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { Upload, Tractor, CheckCircle, MapPin, Maximize2, Crop, Search, X } from "lucide-react";
import {
  PLOT_FIELDS, PLOT_MAPPING_RULES, PLOT_TEMPLATE_EXAMPLE,
  validatePlot, transformPlot,
} from "@/components/shared/importConfigs";


const STATUS_COLOR = {
  active:     "bg-emerald-50 text-emerald-700",
  cultivated: "bg-emerald-50 text-emerald-700",
  fallow:     "bg-amber-50 text-amber-700",
  in_use:     "bg-blue-50 text-blue-700",
  inactive:   "bg-slate-100 text-slate-500",
  abandoned:  "bg-rose-50 text-rose-700",
};

const TYPE_TABS = [
  { id: "all",     label: "All" },
  { id: "crop",    label: "Crop" },
  { id: "pasture", label: "Pasture" },
  { id: "forest",  label: "Forest" },
  { id: "water",   label: "Water" },
];

const EMPTY_FORM = {
  name: "", plot_type: "", land_use: "", crop_type: "", area_ha: "",
  latitude: "", longitude: "", status: "active", description: "",
};

const columns = [
  {
    key: "name", label: "Plot",
    render: (val, row) => (
      <div>
        <p className="font-medium text-slate-800">{val || "—"}</p>
        {row.land_use && <p className="text-xs text-slate-400">{row.land_use}</p>}
      </div>
    ),
  },
  { key: "plot_type", label: "Type",    render: (v) => <span className="capitalize text-sm text-slate-600">{(v || "—").replace(/_/g, " ")}</span> },
  { key: "crop_type", label: "Crop",    render: (v) => <span className="text-sm text-slate-600">{v || "—"}</span> },
  {
    key: "area_ha", label: "Area (ha)",
    render: (v) => v != null && v !== "" ? <span className="font-mono text-sm text-slate-600">{parseFloat(v).toFixed(2)}</span> : <span className="text-slate-300">—</span>,
  },
  {
    key: "latitude", label: "Coordinates",
    render: (v, row) => v && row.longitude
      ? <span className="text-xs font-mono text-slate-500">{parseFloat(v).toFixed(4)}, {parseFloat(row.longitude).toFixed(4)}</span>
      : <span className="text-slate-300">—</span>,
  },
  {
    key: "status", label: "Status",
    render: (v) => <Badge className={STATUS_COLOR[(v || "").toLowerCase()] || "bg-slate-100 text-slate-600"}>{(v || "unknown").replace(/_/g, " ")}</Badge>,
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

function PlotForm({ open, onClose, onSubmit, initial }) {
  const [form, setForm] = useState(initial || EMPTY_FORM);
  useEffect(() => { setForm(initial || EMPTY_FORM); }, [initial, open]);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{initial ? "Edit Plot" : "Add Plot"}</DialogTitle></DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-medium text-slate-600">Name *</label>
              <Input value={form.name} onChange={e => set("name", e.target.value)} placeholder="North Field" className="mt-1" /></div>
            <div><label className="text-xs font-medium text-slate-600">Plot Type *</label>
              <select value={form.plot_type} onChange={e => set("plot_type", e.target.value)} className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
                <option value="">Select type…</option>
                {["crop_field","pasture","orchard","greenhouse","forest","water_body","mixed","other"].map(t => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
              </select></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-medium text-slate-600">Land Use</label>
              <Input value={form.land_use} onChange={e => set("land_use", e.target.value)} placeholder="Arable / Grazing…" className="mt-1" /></div>
            <div><label className="text-xs font-medium text-slate-600">Crop Type</label>
              <Input value={form.crop_type} onChange={e => set("crop_type", e.target.value)} placeholder="Maize, Wheat…" className="mt-1" /></div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div><label className="text-xs font-medium text-slate-600">Area (ha)</label>
              <Input type="number" step="0.01" value={form.area_ha} onChange={e => set("area_ha", e.target.value)} placeholder="12.5" className="mt-1" /></div>
            <div><label className="text-xs font-medium text-slate-600">Latitude</label>
              <Input type="number" step="0.0001" value={form.latitude} onChange={e => set("latitude", e.target.value)} placeholder="-1.2345" className="mt-1" /></div>
            <div><label className="text-xs font-medium text-slate-600">Longitude</label>
              <Input type="number" step="0.0001" value={form.longitude} onChange={e => set("longitude", e.target.value)} placeholder="36.8219" className="mt-1" /></div>
          </div>
          <div><label className="text-xs font-medium text-slate-600">Status</label>
            <select value={form.status} onChange={e => set("status", e.target.value)} className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
              {["active","cultivated","fallow","in_use","inactive","abandoned"].map(s => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
            </select></div>
          <div><label className="text-xs font-medium text-slate-600">Description</label>
            <Input value={form.description} onChange={e => set("description", e.target.value)} placeholder="Notes about this plot…" className="mt-1" /></div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={() => { if (!form.name || !form.plot_type) return; onSubmit(form); }}>
              {initial ? "Save Changes" : "Add Plot"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function Plots() {
  const [formOpen, setFormOpen]           = useState(false);
  const [importOpen, setImportOpen]       = useState(false);
  const [editing, setEditing]             = useState(null);
  const [deleting, setDeleting]           = useState(null);
  const [deleteAllOpen, setDeleteAllOpen] = useState(false);
  const [search, setSearch]               = useState("");
  const [activeTab, setActiveTab]         = useState("all");
  const [selectedIds, setSelectedIds]     = useState([]);

  const qc = useQueryClient();
  const { toast } = useToast();
  const { syncState, notifyTaxonomyChange } = useTaxonomySync();

  const { data: currentUser = null } = useQuery({ queryKey: ["currentUser"], queryFn: () => base44.auth.me(), staleTime: 0 });
  const companyId = currentUser?.company_id;
  const perms     = usePermissions(currentUser);
  const listFn    = useEntityListFn(currentUser);

  useEffect(() => {
    const fn = () => { if (document.visibilityState === "visible") qc.refetchQueries({ queryKey: ["plots"] }); };
    document.addEventListener("visibilitychange", fn);
    return () => document.removeEventListener("visibilitychange", fn);
  }, [qc]);

  const { data: plots = [], isLoading } = useQuery({
    queryKey: ["plots", companyId],
    queryFn:  () => listFn(base44.entities.Plot),
    enabled:  currentUser !== null,
    staleTime: 0,
    refetchOnMount: "always",
  });

  const createMut = useMutation({
    mutationFn: (d) => dataService.createRecord("plot", d, currentUser, { queryClient: qc, notifyTaxonomyChange }),
    onSuccess: () => {
      setFormOpen(false); setEditing(null);
    },
  });
  const updateMut = useMutation({
    mutationFn: ({ id, data }) => dataService.updateRecord("plot", id, data, currentUser, { queryClient: qc, notifyTaxonomyChange, record: editing }),
    onSuccess: () => {
      setFormOpen(false); setEditing(null);
    },
  });
  const deleteMut = useMutation({
    mutationFn: (id) => dataService.deleteRecord("plot", id, currentUser, { queryClient: qc, record: deleting }),
    onSuccess: () => {
      setDeleting(null);
    },
  });

  const handleBulkDelete = async () => {
    for (const id of selectedIds) await base44.entities.Plot.delete(id).catch(() => {});
    qc.invalidateQueries({ queryKey: ["plots"] }); qc.refetchQueries({ queryKey: ["plots"] }); dataService.triggerEntityETL("plot");
    toast({ title: `${selectedIds.length} plots deleted` }); setSelectedIds([]);
  };
  const handleDeleteAll = async () => {
    for (const p of plots) { try { await base44.entities.Plot.delete(p.id); } catch {} }
    qc.invalidateQueries({ queryKey: ["plots"] }); qc.refetchQueries({ queryKey: ["plots"] }); dataService.triggerEntityETL("plot");
    toast({ title: `All ${plots.length} plots deleted` });
  };

  const tabFiltered = useMemo(() => {
    if (activeTab === "all") return plots;
    return plots.filter(p => (p.plot_type || "").toLowerCase().includes(activeTab));
  }, [plots, activeTab]);

  const processed = useMemo(() => {
    let list = search ? fuzzyFilter(tabFiltered, search, ["name", "plot_type", "land_use", "crop_type"]) : [...tabFiltered];
    return list.sort((a, b) => new Date(b.created_date || 0) - new Date(a.created_date || 0));
  }, [tabFiltered, search]);

  const ss = useSpreadsheet(processed, columns);
  const activeCount  = plots.filter(p => ["active","cultivated","in_use"].includes((p.status || "").toLowerCase())).length;
  const totalHa      = plots.reduce((sum, p) => sum + (parseFloat(p.area_ha) || 0), 0);
  const withCoords   = plots.filter(p => p.latitude && p.longitude).length;

  return (
    <div className="space-y-5">
      <PageHeader title="Plots" subtitle="Managed land parcels, water bodies, and growing areas"
        onAdd={perms.l1_create ? () => { setEditing(null); setFormOpen(true); } : undefined} addLabel="Add Plot">
        {perms.l1_create && (
          <Button variant="outline" size="sm" className="rounded-xl" onClick={() => setImportOpen(true)}>
            <Upload className="w-4 h-4 mr-2" /> Import
          </Button>
        )}
        <ExportCSVButton data={processed} fields={["name","plot_type","land_use","crop_type","area_ha","latitude","longitude","status"]} filename="plots_export" />
        {perms.can_delete && plots.length > 0 && (
          <Button variant="outline" size="sm" className="rounded-xl border-rose-200 text-rose-600 hover:bg-rose-50" onClick={() => setDeleteAllOpen(true)}>Delete All</Button>
        )}
        <ETLSyncBanner syncState={syncState} entityType="plot" />
      </PageHeader>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={Tractor}      cls="bg-slate-100 text-slate-500"    label="Total Plots"       value={plots.length} />
        <StatCard icon={CheckCircle}  cls="bg-emerald-50 text-emerald-600" label="Active"            value={activeCount} />
        <StatCard icon={Maximize2}    cls="bg-blue-50 text-blue-600"       label="Total Area (ha)"   value={totalHa.toFixed(1)} />
        <StatCard icon={MapPin}       cls="bg-amber-50 text-amber-600"     label="With Coordinates"  value={withCoords} />
      </div>

      <div className="bg-slate-100 rounded-xl p-1 flex flex-wrap gap-1">
        {TYPE_TABS.map(tab => {
          const count = tab.id === "all" ? plots.length
            : plots.filter(p => (p.plot_type || "").toLowerCase().includes(tab.id)).length;
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
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, type, crop…"
          className="w-full pl-8 pr-8 py-2 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-slate-200" />
        {search && <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"><X className="w-3.5 h-3.5" /></button>}
      </div>

      <BulkActionBar selectedIds={selectedIds} onClear={() => setSelectedIds([])}
        onDeleteSelected={perms.can_delete ? handleBulkDelete : undefined} canDelete={perms.can_delete} />
      <SpreadsheetToolbar {...ss.toolbarProps}
        numericFields={[{ key: "area_ha", label: "Area (ha)" }, { key: "latitude", label: "Latitude" }, { key: "longitude", label: "Longitude" }]}
        selectedIds={selectedIds} onSelectAll={() => setSelectedIds(ss.processedData.map(r => r.id))} onClearSelect={() => setSelectedIds([])} />

      {!isLoading && plots.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 border-2 border-dashed border-slate-100 rounded-2xl">
          <Tractor className="w-10 h-10 text-slate-200 mb-3" />
          <p className="text-slate-400 font-medium mb-1">No plots yet</p>
          <p className="text-slate-300 text-sm mb-4">Add crop fields, pastures, water bodies, or growing areas</p>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => { setEditing(null); setFormOpen(true); }} className="bg-emerald-600 hover:bg-emerald-700 rounded-xl">Add Plot</Button>
            <Button size="sm" variant="outline" onClick={() => setImportOpen(true)} className="rounded-xl">Import from Excel</Button>
          </div>
        </div>
      ) : (
        <DataTable {...ss.tableProps}
          onEdit={perms.l1_edit ? (row) => { setEditing(row); setFormOpen(true); } : undefined}
          onDelete={perms.can_delete ? (row) => setDeleting(row) : undefined}
          bulkMode selectedIds={selectedIds} onSelectionChange={setSelectedIds} />
      )}

      <PlotForm open={formOpen} onClose={() => { setFormOpen(false); setEditing(null); }}
        initial={editing} onSubmit={(d) => editing ? updateMut.mutateAsync({ id: editing.id, data: d }) : createMut.mutateAsync(d)} />
      <DeleteDialog open={!!deleting} onClose={() => setDeleting(null)} onConfirm={() => deleteMut.mutate(deleting.id)} itemName={deleting?.name || "this plot"} />
      <DeleteAllDialog open={deleteAllOpen} onClose={() => setDeleteAllOpen(false)} onConfirm={handleDeleteAll} entityLabel="Plots" count={plots.length} />
      <BulkImportDialog open={importOpen}
        onClose={() => { setImportOpen(false); qc.invalidateQueries({ queryKey: ["plots"] }); qc.refetchQueries({ queryKey: ["plots"] }); }}
        entityName="Plots" fields={PLOT_FIELDS} mappingRules={PLOT_MAPPING_RULES}
        templateExample={PLOT_TEMPLATE_EXAMPLE}
        entityFetchFn={() => listFn(base44.entities.Plot)}
        validateRow={validatePlot} transformRow={transformPlot}
        onImport={(row) => dataService.createRecord("plot", row, currentUser, { queryClient: qc })}
        currentUser={currentUser} requiredField="name" />
    </div>
  );
}
