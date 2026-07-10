import React, { useState, useEffect, useMemo } from "react";
import { ncClient } from "@/api/ncClient";
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
import AutonomousFigureExplainer from "@/components/shared/AutonomousFigureExplainer";
import { fuzzyFilter } from "@/components/shared/fuzzySearch";
import { useSpreadsheet } from "@/hooks/useSpreadsheet";
import { usePermissions } from "@/components/shared/usePermissions";
import { useEntityListFn } from "@/components/shared/useDataQuery";
import dataService from "@/services/dataService";
import { useTaxonomySync } from "@/hooks/useTaxonomySync";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { Upload, Radio, Activity, AlertTriangle, Zap, Search, X } from "lucide-react";
import {
  SIGNAL_FIELDS, SIGNAL_MAPPING_RULES, SIGNAL_TEMPLATE_EXAMPLE,
  SIGNAL_TEMPLATE_INSTRUCTIONS, validateSignal, transformSignal,
} from "@/components/shared/importConfigs";


const STATUS_COLOR = {
  active:   "bg-emerald-50 text-emerald-700",
  inactive: "bg-slate-100 text-slate-500",
  error:    "bg-rose-50 text-rose-700",
};

const TYPE_TABS = [
  { id: "all",      label: "All" },
  { id: "sensor",   label: "Sensors" },
  { id: "survey",   label: "Surveys" },
  { id: "kpi",      label: "KPIs" },
];

const EMPTY_FORM = { name: "", signal_type: "", status: "active", value: "", unit_of_measure: "", source: "", description: "", is_anomaly: false };

const columns = [
  {
    key: "name", label: "Signal",
    render: (val, row) => (
      <div className="flex items-start gap-2">
        <div>
          <div className="flex items-center gap-2">
            <p className="font-medium text-slate-800">{val || "—"}</p>
            {row.is_anomaly && <Badge className="bg-amber-100 text-amber-700 text-[10px] gap-1"><AlertTriangle className="w-2.5 h-2.5" />Anomaly</Badge>}
          </div>
          {row.source && <p className="text-xs text-slate-400">{row.source}</p>}
        </div>
      </div>
    ),
  },
  { key: "signal_type",    label: "Type",  render: (v) => <span className="capitalize text-sm text-slate-600">{(v || "—").replace(/_/g, " ")}</span> },
  {
    key: "value", label: "Value",
    render: (v, row) => v !== undefined && v !== null && v !== ""
      ? <span className="font-mono text-slate-700">{v} {row.unit_of_measure || ""}</span>
      : <span className="text-slate-300">—</span>,
  },
  { key: "unit_of_measure", label: "Unit",   render: (v) => <span className="text-sm text-slate-500">{v || "—"}</span> },
  {
    key: "status", label: "Status",
    render: (v) => <Badge className={STATUS_COLOR[v] || "bg-slate-100 text-slate-600"}>{(v || "—").replace(/_/g, " ")}</Badge>,
  },
];

function StatCard({ icon: Icon, cls, label, value }) {
  return (
    <div className="relative bg-white border border-slate-100 rounded-2xl px-4 py-3 flex items-center gap-3">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${cls}`}><Icon className="w-4 h-4" /></div>
      <div><p className="text-xs text-slate-400">{label}</p><p className="text-lg font-bold text-slate-800 leading-tight">{value}</p><AutonomousFigureExplainer entity="Signals" label={label} value={value} /></div>
    </div>
  );
}

function SignalForm({ open, onClose, onSubmit, initial }) {
  const [form, setForm] = useState(initial || EMPTY_FORM);
  useEffect(() => { setForm(initial || EMPTY_FORM); }, [initial, open]);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{initial ? "Edit Signal" : "Add Signal"}</DialogTitle></DialogHeader>
        <div className="space-y-4 mt-2">
          <div><label className="text-xs font-medium text-slate-600">Name *</label>
            <Input value={form.name} onChange={e => set("name", e.target.value)} placeholder="Room Temperature" className="mt-1" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-medium text-slate-600">Signal Type *</label>
              <Input value={form.signal_type} onChange={e => set("signal_type", e.target.value)} placeholder="sensor" className="mt-1" /></div>
            <div><label className="text-xs font-medium text-slate-600">Status</label>
              <select value={form.status} onChange={e => set("status", e.target.value)} className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
                {["active","inactive","error"].map(s => <option key={s} value={s}>{s}</option>)}
              </select></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-medium text-slate-600">Value</label>
              <Input value={form.value} onChange={e => set("value", e.target.value)} placeholder="22.5" className="mt-1" /></div>
            <div><label className="text-xs font-medium text-slate-600">Unit of Measure</label>
              <Input value={form.unit_of_measure} onChange={e => set("unit_of_measure", e.target.value)} placeholder="celsius" className="mt-1" /></div>
          </div>
          <div><label className="text-xs font-medium text-slate-600">Source / Device</label>
            <Input value={form.source} onChange={e => set("source", e.target.value)} placeholder="IoT sensor ID or survey name" className="mt-1" /></div>
          <div className="flex items-center gap-2">
            <input type="checkbox" checked={!!form.is_anomaly} onChange={e => set("is_anomaly", e.target.checked)} id="sig-anomaly" className="rounded" />
            <label htmlFor="sig-anomaly" className="text-sm text-slate-600">Flag as anomaly</label>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={() => { if (!form.name || !form.signal_type) return; onSubmit(form); }}>
              {initial ? "Save Changes" : "Add Signal"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function Signals() {
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
  const { syncState, notifyTaxonomyChange } = useTaxonomySync();

  const { data: currentUser = null } = useQuery({ queryKey: ["currentUser"], queryFn: () => ncClient.auth.me(), staleTime: 0 });
  const companyId  = currentUser?.company_id;
  const perms      = usePermissions(currentUser);
  const listFn     = useEntityListFn(currentUser);

  useEffect(() => {
    const fn = () => { if (document.visibilityState === "visible") qc.refetchQueries({ queryKey: ["signals"] }); };
    document.addEventListener("visibilitychange", fn);
    return () => document.removeEventListener("visibilitychange", fn);
  }, [qc]);

  const { data: signals = [], isLoading } = useQuery({
    queryKey: ["signals", companyId],
    queryFn:  () => listFn(ncClient.entities.Signal),
    enabled:  currentUser !== null,
    staleTime: 0,
    refetchOnMount: "always",
  });

  const createMut = useMutation({
    mutationFn: (d) => dataService.createRecord("signal", d, currentUser, { queryClient: qc, notifyTaxonomyChange }),
    onSuccess: () => {
      setFormOpen(false);
      setEditing(null);
    },
  });
  const updateMut = useMutation({
    mutationFn: ({ id, data }) => dataService.updateRecord("signal", id, data, currentUser, { queryClient: qc, notifyTaxonomyChange, record: editing }),
    onSuccess: () => {
      setFormOpen(false);
      setEditing(null);
    },
  });
  const deleteMut = useMutation({
    mutationFn: (id) => dataService.deleteRecord("signal", id, currentUser, { queryClient: qc, record: deleting }),
    onSuccess: () => {
      setDeleting(null);
    },
  });

  const handleBulkDelete = async () => {
    for (const id of selectedIds) await dataService.deleteRecord("signal", id, currentUser, { queryClient: qc });
    toast({ title: `${selectedIds.length} signals deleted` });
    setSelectedIds([]);
  };

  const handleDeleteAll = async () => {
    for (const s of signals) { try { await dataService.deleteRecord("signal", s.id, currentUser, { queryClient: qc }); } catch {} }
    toast({ title: `All ${signals.length} signals deleted` });
  };

  const tabFiltered = useMemo(() => {
    if (activeTab === "all") return signals;
    return signals.filter(s => (s.signal_type || "").toLowerCase().includes(activeTab));
  }, [signals, activeTab]);

  const processed = useMemo(() => {
    let list = search ? fuzzyFilter(tabFiltered, search, ["name", "signal_type", "source", "unit_of_measure"]) : [...tabFiltered];
    return list.sort((a, b) => new Date(b.created_date || 0) - new Date(a.created_date || 0));
  }, [tabFiltered, search]);

  const ss = useSpreadsheet(processed, columns);
  const anomalyCount = signals.filter(s => s.is_anomaly).length;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Signals"
        subtitle="Telemetry readings, IoT sensors, survey scores, KPI measurements"
        onAdd={perms.l1_create ? () => { setEditing(null); setFormOpen(true); } : undefined}
        addLabel="Add Signal"
      >
        {perms.l1_create && (
          <Button variant="outline" size="sm" className="rounded-xl" onClick={() => setImportOpen(true)}>
            <Upload className="w-4 h-4 mr-2" /> Import
          </Button>
        )}
        <ExportCSVButton data={processed} fields={["name","signal_type","value","unit_of_measure","status","source","is_anomaly"]} filename="signals_export" />
        {perms.can_delete && signals.length > 0 && (
          <Button variant="outline" size="sm" className="rounded-xl border-rose-200 text-rose-600 hover:bg-rose-50" onClick={() => setDeleteAllOpen(true)}>Delete All</Button>
        )}
        <ETLSyncBanner syncState={syncState} entityType="signal" />
      </PageHeader>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={Radio}         cls="bg-slate-100 text-slate-500"    label="Total Signals" value={signals.length} />
        <StatCard icon={Activity}      cls="bg-emerald-50 text-emerald-600" label="Active"         value={signals.filter(s => s.status === "active").length} />
        <StatCard icon={AlertTriangle} cls="bg-amber-50 text-amber-600"     label="Anomalies"      value={anomalyCount} />
        <StatCard icon={Zap}           cls="bg-blue-50 text-blue-600"       label="Sensors"        value={signals.filter(s => (s.signal_type || "").toLowerCase().includes("sensor")).length} />
      </div>

      <div className="bg-slate-100 rounded-xl p-1 flex flex-wrap gap-1">
        {TYPE_TABS.map(tab => {
          const count = tab.id === "all" ? signals.length : signals.filter(s => (s.signal_type || "").toLowerCase().includes(tab.id)).length;
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
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search signals…"
          className="w-full pl-8 pr-8 py-2 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-slate-200" />
        {search && <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"><X className="w-3.5 h-3.5" /></button>}
      </div>

      <BulkActionBar selectedIds={selectedIds} onClear={() => setSelectedIds([])}
        onDeleteSelected={perms.can_delete ? handleBulkDelete : undefined} canDelete={perms.can_delete} />
      <SpreadsheetToolbar {...ss.toolbarProps}
        selectedIds={selectedIds} onSelectAll={() => setSelectedIds(ss.processedData.map(r => r.id))} onClearSelect={() => setSelectedIds([])} />

      {!isLoading && signals.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 border-2 border-dashed border-slate-100 rounded-2xl">
          <Radio className="w-10 h-10 text-slate-200 mb-3" />
          <p className="text-slate-400 font-medium mb-1">No signals yet</p>
          <p className="text-slate-300 text-sm mb-4">Record IoT readings, survey scores, and KPI measurements</p>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => { setEditing(null); setFormOpen(true); }} className="bg-emerald-600 hover:bg-emerald-700 rounded-xl">Add Signal</Button>
            <Button size="sm" variant="outline" onClick={() => setImportOpen(true)} className="rounded-xl">Import from Excel</Button>
          </div>
        </div>
      ) : (
        <DataTable {...ss.tableProps}
          onEdit={perms.l1_edit ? (row) => { setEditing(row); setFormOpen(true); } : undefined}
          onDelete={perms.can_delete ? (row) => setDeleting(row) : undefined}
          bulkMode selectedIds={selectedIds} onSelectionChange={setSelectedIds} />
      )}

      <SignalForm open={formOpen} onClose={() => { setFormOpen(false); setEditing(null); }}
        initial={editing}
        onSubmit={(d) => editing ? updateMut.mutateAsync({ id: editing.id, data: d }) : createMut.mutateAsync(d)} />
      <DeleteDialog open={!!deleting} onClose={() => setDeleting(null)} onConfirm={() => deleteMut.mutate(deleting.id)} itemName={deleting?.name || "this signal"} />
      <DeleteAllDialog open={deleteAllOpen} onClose={() => setDeleteAllOpen(false)} onConfirm={handleDeleteAll} entityLabel="Signals" count={signals.length} />
      <BulkImportDialog open={importOpen}
        onClose={() => { setImportOpen(false); qc.invalidateQueries({ queryKey: ["signals"] }); qc.refetchQueries({ queryKey: ["signals"] }); }}
        entityName="Signals" fields={SIGNAL_FIELDS} mappingRules={SIGNAL_MAPPING_RULES}
        templateExample={SIGNAL_TEMPLATE_EXAMPLE} templateInstructions={SIGNAL_TEMPLATE_INSTRUCTIONS}
        entityFetchFn={() => listFn(ncClient.entities.Signal)}
        validateRow={validateSignal} transformRow={transformSignal}
        onImport={(row) => dataService.createRecord("signal", row, currentUser, { queryClient: qc })}
        currentUser={currentUser} requiredField="name" />
    </div>
  );
}
