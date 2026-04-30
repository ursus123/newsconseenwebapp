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
import { Upload, Activity, AlertTriangle, BarChart2, Clock, Search, X } from "lucide-react";
import {
  OBSERVATION_FIELDS, OBSERVATION_MAPPING_RULES, OBSERVATION_TEMPLATE_EXAMPLE,
  validateObservation, transformObservation,
} from "@/components/shared/importConfigs";

const RAILWAY_URL = "https://newsconseenwebapp-production.up.railway.app";
const RAILWAY_API_KEY = import.meta.env.VITE_RAILWAY_API_KEY || "";

const triggerETL = () =>
  fetch(`${RAILWAY_URL}/load/observation-summary`, { method: "POST", headers: { "x-api-key": RAILWAY_API_KEY } }).catch(() => {});

function logAudit(companyId, action, record, userEmail) {
  fetch(`${RAILWAY_URL}/audit/log`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(RAILWAY_API_KEY ? { "x-api-key": RAILWAY_API_KEY } : {}) },
    body: JSON.stringify({ company_id: companyId, entity_type: "observation", entity_id: record?.id, entity_name: record?.observation_type || record?.id, action, changed_by: userEmail }),
  }).catch(() => {});
}

const TYPE_TABS = [
  { id: "all",    label: "All" },
  { id: "field",  label: "Field" },
  { id: "sensor", label: "Sensor" },
  { id: "survey", label: "Survey" },
  { id: "exam",   label: "Exam" },
];

const EMPTY_FORM = {
  observation_type: "", subject_type: "", numeric_value: "", text_value: "",
  unit_of_measure: "", is_anomaly: false, observed_at: "", notes: "",
};

const columns = [
  {
    key: "observation_type", label: "Type",
    render: (val, row) => (
      <div className="flex items-center gap-2">
        <span className="font-medium text-slate-800 capitalize">{(val || "—").replace(/_/g, " ")}</span>
        {row.is_anomaly && <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />}
      </div>
    ),
  },
  { key: "subject_type", label: "Subject",  render: (v) => <span className="capitalize text-sm text-slate-600">{(v || "—").replace(/_/g, " ")}</span> },
  {
    key: "numeric_value", label: "Value",
    render: (v, row) => {
      const display = v != null && v !== "" ? v : row.text_value;
      return display != null && display !== ""
        ? <span className="font-mono text-sm text-slate-700">{display}{row.unit_of_measure ? ` ${row.unit_of_measure}` : ""}</span>
        : <span className="text-slate-300">—</span>;
    },
  },
  {
    key: "observed_at", label: "Observed At",
    render: (v) => v
      ? <span className="text-xs text-slate-500">{new Date(v).toLocaleString()}</span>
      : <span className="text-slate-300">—</span>,
  },
  {
    key: "is_anomaly", label: "Anomaly",
    render: (v) => v
      ? <Badge className="bg-amber-100 text-amber-700 gap-1"><AlertTriangle className="w-3 h-3" /> Anomaly</Badge>
      : <span className="text-slate-300 text-xs">—</span>,
  },
  { key: "notes", label: "Notes", render: (v) => <span className="text-xs text-slate-500 max-w-xs block truncate">{v || "—"}</span> },
];

function StatCard({ icon: Icon, cls, label, value, anomaly }) {
  return (
    <div className={`bg-white border rounded-2xl px-4 py-3 flex items-center gap-3 ${anomaly ? "border-amber-200" : "border-slate-100"}`}>
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${cls}`}><Icon className="w-4 h-4" /></div>
      <div><p className="text-xs text-slate-400">{label}</p><p className="text-lg font-bold text-slate-800 leading-tight">{value}</p></div>
    </div>
  );
}

function ObservationForm({ open, onClose, onSubmit, initial }) {
  const [form, setForm] = useState(initial || EMPTY_FORM);
  useEffect(() => { setForm(initial || EMPTY_FORM); }, [initial, open]);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{initial ? "Edit Observation" : "Add Observation"}</DialogTitle></DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-medium text-slate-600">Observation Type *</label>
              <select value={form.observation_type} onChange={e => set("observation_type", e.target.value)} className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
                <option value="">Select type…</option>
                {["field_reading","sensor_reading","survey_response","vet_exam","soil_test","weather","kpi_measurement","inspection","sample_result","other"].map(t => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
              </select></div>
            <div><label className="text-xs font-medium text-slate-600">Subject Type</label>
              <select value={form.subject_type} onChange={e => set("subject_type", e.target.value)} className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
                <option value="">Select…</option>
                {["animal","plot","person","enterprise","product","environment","equipment","other"].map(s => <option key={s} value={s}>{s}</option>)}
              </select></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-medium text-slate-600">Numeric Value</label>
              <Input type="number" step="any" value={form.numeric_value} onChange={e => set("numeric_value", e.target.value)} placeholder="38.5" className="mt-1" /></div>
            <div><label className="text-xs font-medium text-slate-600">Unit of Measure</label>
              <Input value={form.unit_of_measure} onChange={e => set("unit_of_measure", e.target.value)} placeholder="°C, kg, %, ppm…" className="mt-1" /></div>
          </div>
          <div><label className="text-xs font-medium text-slate-600">Text Value</label>
            <Input value={form.text_value} onChange={e => set("text_value", e.target.value)} placeholder="Qualitative result or description…" className="mt-1" /></div>
          <div><label className="text-xs font-medium text-slate-600">Observed At</label>
            <Input type="datetime-local" value={form.observed_at} onChange={e => set("observed_at", e.target.value)} className="mt-1" /></div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="is_anomaly" checked={!!form.is_anomaly} onChange={e => set("is_anomaly", e.target.checked)} className="w-4 h-4 accent-amber-500" />
            <label htmlFor="is_anomaly" className="text-sm text-slate-700">Flag as Anomaly</label>
          </div>
          <div><label className="text-xs font-medium text-slate-600">Notes</label>
            <Input value={form.notes} onChange={e => set("notes", e.target.value)} placeholder="Context or follow-up actions…" className="mt-1" /></div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={() => { if (!form.observation_type) return; onSubmit(form); }}>
              {initial ? "Save Changes" : "Add Observation"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function Observations() {
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
  const { syncState } = useTaxonomySync();

  const { data: currentUser = null } = useQuery({ queryKey: ["currentUser"], queryFn: () => base44.auth.me(), staleTime: 0 });
  const companyId = currentUser?.company_id;
  const perms     = usePermissions(currentUser);
  const listFn    = useEntityListFn(currentUser);
  const withScope = useWithScope(currentUser);

  useEffect(() => {
    const fn = () => { if (document.visibilityState === "visible") qc.refetchQueries({ queryKey: ["observations"] }); };
    document.addEventListener("visibilitychange", fn);
    return () => document.removeEventListener("visibilitychange", fn);
  }, [qc]);

  const { data: observations = [], isLoading } = useQuery({
    queryKey: ["observations", companyId],
    queryFn:  () => listFn(base44.entities.Observation),
    enabled:  currentUser !== null,
    staleTime: 0,
    refetchOnMount: "always",
  });

  const createMut = useMutation({
    mutationFn: (d) => createWithScope(base44.entities.Observation, d, currentUser),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["observations"] }); qc.refetchQueries({ queryKey: ["observations"] });
      triggerETL(); logAudit(companyId, "created", editing, currentUser?.email); setFormOpen(false);
    },
  });
  const updateMut = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Observation.update(id, withScope(data)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["observations"] }); qc.refetchQueries({ queryKey: ["observations"] });
      triggerETL(); logAudit(companyId, "updated", editing, currentUser?.email); setFormOpen(false); setEditing(null);
    },
  });
  const deleteMut = useMutation({
    mutationFn: (id) => base44.entities.Observation.delete(id),
    onSuccess: () => {
      logAudit(companyId, "deleted", deleting, currentUser?.email);
      qc.invalidateQueries({ queryKey: ["observations"] }); qc.refetchQueries({ queryKey: ["observations"] }); triggerETL(); setDeleting(null);
    },
  });

  const handleBulkDelete = async () => {
    for (const id of selectedIds) await base44.entities.Observation.delete(id).catch(() => {});
    qc.invalidateQueries({ queryKey: ["observations"] }); qc.refetchQueries({ queryKey: ["observations"] }); triggerETL();
    toast({ title: `${selectedIds.length} observations deleted` }); setSelectedIds([]);
  };
  const handleDeleteAll = async () => {
    for (const o of observations) { try { await base44.entities.Observation.delete(o.id); } catch {} }
    qc.invalidateQueries({ queryKey: ["observations"] }); qc.refetchQueries({ queryKey: ["observations"] }); triggerETL();
    toast({ title: `All ${observations.length} observations deleted` });
  };

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const tabFiltered = useMemo(() => {
    if (activeTab === "all") return observations;
    return observations.filter(o => (o.observation_type || "").toLowerCase().includes(activeTab));
  }, [observations, activeTab]);

  const processed = useMemo(() => {
    let list = search ? fuzzyFilter(tabFiltered, search, ["observation_type", "subject_type", "notes", "text_value"]) : [...tabFiltered];
    return list.sort((a, b) => new Date(b.observed_at || b.created_date || 0) - new Date(a.observed_at || a.created_date || 0));
  }, [tabFiltered, search]);

  const ss = useSpreadsheet(processed, columns, {
    rowClassName: (row) => row.is_anomaly ? "bg-amber-50" : "",
  });

  const anomalyCount  = observations.filter(o => o.is_anomaly).length;
  const numericObs    = observations.filter(o => o.numeric_value != null && o.numeric_value !== "");
  const avgValue      = numericObs.length ? (numericObs.reduce((s, o) => s + parseFloat(o.numeric_value), 0) / numericObs.length) : null;
  const recentCount   = observations.filter(o => o.observed_at && new Date(o.observed_at) >= sevenDaysAgo).length;

  return (
    <div className="space-y-5">
      <PageHeader title="Observations" subtitle="Field readings, sensor data, survey responses, and exam results"
        onAdd={perms.l1_create ? () => { setEditing(null); setFormOpen(true); } : undefined} addLabel="Add Observation">
        {perms.l1_create && (
          <Button variant="outline" size="sm" className="rounded-xl" onClick={() => setImportOpen(true)}>
            <Upload className="w-4 h-4 mr-2" /> Import
          </Button>
        )}
        <ExportCSVButton data={processed} fields={["observation_type","subject_type","numeric_value","text_value","unit_of_measure","is_anomaly","observed_at","notes"]} filename="observations_export" />
        {perms.can_delete && observations.length > 0 && (
          <Button variant="outline" size="sm" className="rounded-xl border-rose-200 text-rose-600 hover:bg-rose-50" onClick={() => setDeleteAllOpen(true)}>Delete All</Button>
        )}
        <ETLSyncBanner syncState={syncState} entityType="observation" />
      </PageHeader>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={Activity}      cls="bg-slate-100 text-slate-500"    label="Total Observations" value={observations.length} />
        <StatCard icon={AlertTriangle} cls="bg-amber-50 text-amber-600"     label="Anomalies"          value={anomalyCount} anomaly={anomalyCount > 0} />
        <StatCard icon={BarChart2}     cls="bg-blue-50 text-blue-600"       label="Avg Numeric Value"  value={avgValue != null ? avgValue.toFixed(2) : "—"} />
        <StatCard icon={Clock}         cls="bg-emerald-50 text-emerald-600" label="Last 7 Days"        value={recentCount} />
      </div>

      <div className="bg-slate-100 rounded-xl p-1 flex flex-wrap gap-1">
        {TYPE_TABS.map(tab => {
          const count = tab.id === "all" ? observations.length
            : observations.filter(o => (o.observation_type || "").toLowerCase().includes(tab.id)).length;
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
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by type, subject, notes…"
          className="w-full pl-8 pr-8 py-2 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-slate-200" />
        {search && <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"><X className="w-3.5 h-3.5" /></button>}
      </div>

      <BulkActionBar selectedIds={selectedIds} onClear={() => setSelectedIds([])}
        onDeleteSelected={perms.can_delete ? handleBulkDelete : undefined} canDelete={perms.can_delete} />
      <SpreadsheetToolbar {...ss.toolbarProps}
        numericFields={[{ key: "numeric_value", label: "Numeric Value" }]}
        selectedIds={selectedIds} onSelectAll={() => setSelectedIds(ss.processedData.map(r => r.id))} onClearSelect={() => setSelectedIds([])} />

      {!isLoading && observations.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 border-2 border-dashed border-slate-100 rounded-2xl">
          <Activity className="w-10 h-10 text-slate-200 mb-3" />
          <p className="text-slate-400 font-medium mb-1">No observations yet</p>
          <p className="text-slate-300 text-sm mb-4">Record sensor readings, field measurements, survey responses, or exam results</p>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => { setEditing(null); setFormOpen(true); }} className="bg-emerald-600 hover:bg-emerald-700 rounded-xl">Add Observation</Button>
            <Button size="sm" variant="outline" onClick={() => setImportOpen(true)} className="rounded-xl">Import from Excel</Button>
          </div>
        </div>
      ) : (
        <DataTable {...ss.tableProps}
          onEdit={perms.l1_edit ? (row) => { setEditing(row); setFormOpen(true); } : undefined}
          onDelete={perms.can_delete ? (row) => setDeleting(row) : undefined}
          bulkMode selectedIds={selectedIds} onSelectionChange={setSelectedIds} />
      )}

      <ObservationForm open={formOpen} onClose={() => { setFormOpen(false); setEditing(null); }}
        initial={editing} onSubmit={(d) => editing ? updateMut.mutateAsync({ id: editing.id, data: d }) : createMut.mutateAsync(d)} />
      <DeleteDialog open={!!deleting} onClose={() => setDeleting(null)} onConfirm={() => deleteMut.mutate(deleting.id)} itemName={`${deleting?.observation_type || "this observation"}`} />
      <DeleteAllDialog open={deleteAllOpen} onClose={() => setDeleteAllOpen(false)} onConfirm={handleDeleteAll} entityLabel="Observations" count={observations.length} />
      <BulkImportDialog open={importOpen}
        onClose={() => { setImportOpen(false); qc.invalidateQueries({ queryKey: ["observations"] }); qc.refetchQueries({ queryKey: ["observations"] }); }}
        entityName="Observations" fields={OBSERVATION_FIELDS} mappingRules={OBSERVATION_MAPPING_RULES}
        templateExample={OBSERVATION_TEMPLATE_EXAMPLE}
        entityFetchFn={() => listFn(base44.entities.Observation)}
        validateRow={validateObservation} transformRow={transformObservation}
        onImport={(row) => createWithScope(base44.entities.Observation, row, currentUser)}
        currentUser={currentUser} requiredField="observation_type" />
    </div>
  );
}
