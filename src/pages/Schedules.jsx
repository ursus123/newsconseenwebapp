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
import dataService from "@/services/dataService";
import { useTaxonomySync } from "@/hooks/useTaxonomySync";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { Upload, CalendarClock, CheckCircle, PauseCircle, RefreshCw, Search, X } from "lucide-react";
import {
  SCHEDULE_FIELDS, SCHEDULE_MAPPING_RULES, SCHEDULE_TEMPLATE_EXAMPLE,
  SCHEDULE_TEMPLATE_INSTRUCTIONS, validateSchedule, transformSchedule,
} from "@/components/shared/importConfigs";


const STATUS_COLOR = {
  active:  "bg-emerald-50 text-emerald-700",
  paused:  "bg-amber-50 text-amber-700",
  ended:   "bg-slate-100 text-slate-500",
  pending: "bg-blue-50 text-blue-700",
};

const STATUS_TABS = [
  { id: "all",    label: "All" },
  { id: "active", label: "Active" },
  { id: "paused", label: "Paused" },
  { id: "ended",  label: "Ended" },
];

const EMPTY_FORM = { title: "", schedule_type: "", frequency: "weekly", status: "active", start_date: "", end_date: "", time_of_day: "", description: "" };

const columns = [
  {
    key: "title", label: "Title",
    render: (val, row) => (
      <div>
        <p className="font-medium text-slate-800">{val || "—"}</p>
        {row.description && <p className="text-xs text-slate-400 truncate max-w-xs">{row.description}</p>}
      </div>
    ),
  },
  { key: "schedule_type", label: "Type",      render: (v) => <span className="capitalize text-sm text-slate-600">{(v || "—").replace(/_/g, " ")}</span> },
  { key: "frequency",     label: "Frequency", render: (v) => <span className="capitalize text-sm text-slate-600">{(v || "—").replace(/_/g, " ")}</span> },
  { key: "time_of_day",   label: "Time",      render: (v) => <span className="text-sm text-slate-500">{v || "—"}</span> },
  { key: "start_date",    label: "Start",     render: (v) => <span className="text-xs text-slate-500">{v || "—"}</span> },
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

function ScheduleForm({ open, onClose, onSubmit, initial }) {
  const [form, setForm] = useState(initial || EMPTY_FORM);
  useEffect(() => { setForm(initial || EMPTY_FORM); }, [initial, open]);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{initial ? "Edit Schedule" : "Add Schedule"}</DialogTitle></DialogHeader>
        <div className="space-y-4 mt-2">
          <div><label className="text-xs font-medium text-slate-600">Title *</label>
            <Input value={form.title} onChange={e => set("title", e.target.value)} placeholder="Weekly Team Meeting" className="mt-1" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-medium text-slate-600">Schedule Type *</label>
              <Input value={form.schedule_type} onChange={e => set("schedule_type", e.target.value)} placeholder="recurring" className="mt-1" /></div>
            <div><label className="text-xs font-medium text-slate-600">Frequency</label>
              <select value={form.frequency} onChange={e => set("frequency", e.target.value)} className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
                {["daily","weekly","biweekly","monthly","quarterly","annual"].map(f => <option key={f} value={f}>{f}</option>)}
              </select></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-medium text-slate-600">Status</label>
              <select value={form.status} onChange={e => set("status", e.target.value)} className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
                {["active","paused","ended","pending"].map(s => <option key={s} value={s}>{s}</option>)}
              </select></div>
            <div><label className="text-xs font-medium text-slate-600">Time of Day</label>
              <Input type="time" value={form.time_of_day} onChange={e => set("time_of_day", e.target.value)} className="mt-1" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-medium text-slate-600">Start Date</label>
              <Input type="date" value={form.start_date} onChange={e => set("start_date", e.target.value)} className="mt-1" /></div>
            <div><label className="text-xs font-medium text-slate-600">End Date</label>
              <Input type="date" value={form.end_date} onChange={e => set("end_date", e.target.value)} className="mt-1" /></div>
          </div>
          <div><label className="text-xs font-medium text-slate-600">Description</label>
            <Input value={form.description} onChange={e => set("description", e.target.value)} placeholder="Brief description…" className="mt-1" /></div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={() => { if (!form.title || !form.schedule_type) return; onSubmit(form); }}>
              {initial ? "Save Changes" : "Add Schedule"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function Schedules() {
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

  const { data: currentUser = null } = useQuery({ queryKey: ["currentUser"], queryFn: () => base44.auth.me(), staleTime: 0 });
  const companyId  = currentUser?.company_id;
  const perms      = usePermissions(currentUser);
  const listFn     = useEntityListFn(currentUser);

  useEffect(() => {
    const fn = () => { if (document.visibilityState === "visible") qc.refetchQueries({ queryKey: ["schedules"] }); };
    document.addEventListener("visibilitychange", fn);
    return () => document.removeEventListener("visibilitychange", fn);
  }, [qc]);

  const { data: schedules = [], isLoading } = useQuery({
    queryKey: ["schedules", companyId],
    queryFn:  () => listFn(base44.entities.Schedule),
    enabled:  currentUser !== null,
    staleTime: 0,
    refetchOnMount: "always",
  });

  const createMut = useMutation({
    mutationFn: (d) => dataService.createRecord("schedule", d, currentUser, { queryClient: qc, notifyTaxonomyChange }),
    onSuccess: () => {
      setFormOpen(false);
      setEditing(null);
    },
  });
  const updateMut = useMutation({
    mutationFn: ({ id, data }) => dataService.updateRecord("schedule", id, data, currentUser, { queryClient: qc, notifyTaxonomyChange, record: editing }),
    onSuccess: () => {
      setFormOpen(false);
      setEditing(null);
    },
  });
  const deleteMut = useMutation({
    mutationFn: (id) => dataService.deleteRecord("schedule", id, currentUser, { queryClient: qc, record: deleting }),
    onSuccess: () => {
      setDeleting(null);
    },
  });

  const handleBulkDelete = async () => {
    for (const id of selectedIds) await base44.entities.Schedule.delete(id).catch(() => {});
    qc.invalidateQueries({ queryKey: ["schedules"] });
    qc.refetchQueries({ queryKey: ["schedules"] });
    toast({ title: `${selectedIds.length} schedules deleted` });
    setSelectedIds([]);
  };

  const handleDeleteAll = async () => {
    for (const s of schedules) { try { await base44.entities.Schedule.delete(s.id); } catch {} }
    qc.invalidateQueries({ queryKey: ["schedules"] });
    qc.refetchQueries({ queryKey: ["schedules"] });
    toast({ title: `All ${schedules.length} schedules deleted` });
  };

  const tabFiltered = activeTab === "all" ? schedules : schedules.filter(s => s.status === activeTab);
  const processed = useMemo(() => {
    let list = search ? fuzzyFilter(tabFiltered, search, ["title", "schedule_type", "frequency", "description"]) : [...tabFiltered];
    return list.sort((a, b) => new Date(b.created_date || 0) - new Date(a.created_date || 0));
  }, [tabFiltered, search]);

  const ss = useSpreadsheet(processed, columns);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Schedules"
        subtitle="Recurring patterns — briefings, inspections, payroll runs"
        onAdd={perms.l1_create ? () => { setEditing(null); setFormOpen(true); } : undefined}
        addLabel="Add Schedule"
      >
        {perms.l1_create && (
          <Button variant="outline" size="sm" className="rounded-xl" onClick={() => setImportOpen(true)}>
            <Upload className="w-4 h-4 mr-2" /> Import
          </Button>
        )}
        <ExportCSVButton data={processed} fields={["title","schedule_type","frequency","status","start_date","end_date","time_of_day"]} filename="schedules_export" />
        {perms.can_delete && schedules.length > 0 && (
          <Button variant="outline" size="sm" className="rounded-xl border-rose-200 text-rose-600 hover:bg-rose-50" onClick={() => setDeleteAllOpen(true)}>Delete All</Button>
        )}
        <ETLSyncBanner syncState={syncState} entityType="schedule" />
      </PageHeader>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={CalendarClock} cls="bg-slate-100 text-slate-500"    label="Total Schedules" value={schedules.length} />
        <StatCard icon={CheckCircle}   cls="bg-emerald-50 text-emerald-600" label="Active"           value={schedules.filter(s => s.status === "active").length} />
        <StatCard icon={PauseCircle}   cls="bg-amber-50 text-amber-600"     label="Paused"           value={schedules.filter(s => s.status === "paused").length} />
        <StatCard icon={RefreshCw}     cls="bg-blue-50 text-blue-600"       label="Weekly Recurrence" value={schedules.filter(s => (s.frequency || "").toLowerCase().includes("week")).length} />
      </div>

      <div className="bg-slate-100 rounded-xl p-1 flex flex-wrap gap-1">
        {STATUS_TABS.map(tab => {
          const count = tab.id === "all" ? schedules.length : schedules.filter(s => s.status === tab.id).length;
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
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search schedules…"
          className="w-full pl-8 pr-8 py-2 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-slate-200" />
        {search && <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"><X className="w-3.5 h-3.5" /></button>}
      </div>

      <BulkActionBar selectedIds={selectedIds} onClear={() => setSelectedIds([])}
        onDeleteSelected={perms.can_delete ? handleBulkDelete : undefined} canDelete={perms.can_delete} />

      <SpreadsheetToolbar {...ss.toolbarProps}
        selectedIds={selectedIds} onSelectAll={() => setSelectedIds(ss.processedData.map(r => r.id))} onClearSelect={() => setSelectedIds([])} />

      {!isLoading && schedules.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 border-2 border-dashed border-slate-100 rounded-2xl">
          <CalendarClock className="w-10 h-10 text-slate-200 mb-3" />
          <p className="text-slate-400 font-medium mb-1">No schedules yet</p>
          <p className="text-slate-300 text-sm mb-4">Define recurring patterns for your operations</p>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => { setEditing(null); setFormOpen(true); }} className="bg-emerald-600 hover:bg-emerald-700 rounded-xl">Add Schedule</Button>
            <Button size="sm" variant="outline" onClick={() => setImportOpen(true)} className="rounded-xl">Import from Excel</Button>
          </div>
        </div>
      ) : (
        <DataTable {...ss.tableProps}
          onEdit={perms.l1_edit ? (row) => { setEditing(row); setFormOpen(true); } : undefined}
          onDelete={perms.can_delete ? (row) => setDeleting(row) : undefined}
          bulkMode selectedIds={selectedIds} onSelectionChange={setSelectedIds} />
      )}

      <ScheduleForm open={formOpen} onClose={() => { setFormOpen(false); setEditing(null); }}
        initial={editing}
        onSubmit={(d) => editing ? updateMut.mutateAsync({ id: editing.id, data: d }) : createMut.mutateAsync(d)} />
      <DeleteDialog open={!!deleting} onClose={() => setDeleting(null)} onConfirm={() => deleteMut.mutate(deleting.id)} itemName={deleting?.title || "this schedule"} />
      <DeleteAllDialog open={deleteAllOpen} onClose={() => setDeleteAllOpen(false)} onConfirm={handleDeleteAll} entityLabel="Schedules" count={schedules.length} />
      <BulkImportDialog open={importOpen}
        onClose={() => { setImportOpen(false); qc.invalidateQueries({ queryKey: ["schedules"] }); qc.refetchQueries({ queryKey: ["schedules"] }); }}
        entityName="Schedules" fields={SCHEDULE_FIELDS} mappingRules={SCHEDULE_MAPPING_RULES}
        templateExample={SCHEDULE_TEMPLATE_EXAMPLE} templateInstructions={SCHEDULE_TEMPLATE_INSTRUCTIONS}
        entityFetchFn={() => listFn(base44.entities.Schedule)}
        validateRow={validateSchedule} transformRow={transformSchedule}
        onImport={(row) => dataService.createRecord("schedule", row, currentUser, { queryClient: qc })}
        currentUser={currentUser} requiredField="title" />
    </div>
  );
}
