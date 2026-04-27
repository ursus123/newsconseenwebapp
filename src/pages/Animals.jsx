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
import { useEntityListFn, useWithScope } from "@/components/shared/useDataQuery";
import { useTaxonomySync } from "@/hooks/useTaxonomySync";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { Upload, PawPrint, CheckCircle, Heart, Scale, Tag, Search, X } from "lucide-react";
import {
  ANIMAL_FIELDS, ANIMAL_MAPPING_RULES, ANIMAL_TEMPLATE_EXAMPLE,
  validateAnimal, transformAnimal,
} from "@/components/shared/importConfigs";

const RAILWAY_URL = "https://newsconseenwebapp-production.up.railway.app";
const RAILWAY_API_KEY = import.meta.env.VITE_RAILWAY_API_KEY || "";

const triggerETL = () =>
  fetch(`${RAILWAY_URL}/load/animal-summary`, { method: "POST", headers: { "x-api-key": RAILWAY_API_KEY } }).catch(() => {});

function logAudit(companyId, action, record, userEmail) {
  fetch(`${RAILWAY_URL}/audit/log`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(RAILWAY_API_KEY ? { "x-api-key": RAILWAY_API_KEY } : {}) },
    body: JSON.stringify({ company_id: companyId, entity_type: "animal", entity_id: record?.id, entity_name: record?.name || record?.id, action, changed_by: userEmail }),
  }).catch(() => {});
}

const STATUS_COLOR = {
  active:     "bg-emerald-50 text-emerald-700",
  healthy:    "bg-emerald-50 text-emerald-700",
  inactive:   "bg-slate-100 text-slate-500",
  deceased:   "bg-slate-100 text-slate-500",
  sold:       "bg-amber-50 text-amber-700",
  discharged: "bg-blue-50 text-blue-700",
  quarantine: "bg-rose-50 text-rose-700",
};

const TYPE_TABS = [
  { id: "all",       label: "All" },
  { id: "livestock", label: "Livestock" },
  { id: "poultry",   label: "Poultry" },
  { id: "aquatic",   label: "Aquatic" },
];

const EMPTY_FORM = { name: "", animal_type: "", species: "", breed: "", sex: "", status: "active", date_of_birth: "", weight_kg: "", tag_id: "", notes: "" };

const columns = [
  {
    key: "name", label: "Animal",
    render: (val, row) => (
      <div>
        <div className="flex items-center gap-2">
          <p className="font-medium text-slate-800">{val || "—"}</p>
          {row.tag_id && <span className="text-[10px] font-mono bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">{row.tag_id}</span>}
        </div>
        {row.breed && <p className="text-xs text-slate-400">{row.breed}</p>}
      </div>
    ),
  },
  { key: "animal_type", label: "Type",    render: (v) => <span className="capitalize text-sm text-slate-600">{(v || "—").replace(/_/g, " ")}</span> },
  { key: "species",     label: "Species", render: (v) => <span className="text-sm text-slate-600">{v || "—"}</span> },
  {
    key: "sex", label: "Sex",
    render: (v) => v ? <span className="capitalize text-xs text-slate-500">{v}</span> : <span className="text-slate-300">—</span>,
  },
  {
    key: "weight_kg", label: "Weight (kg)",
    render: (v) => v != null && v !== "" ? <span className="font-mono text-sm text-slate-600">{v}</span> : <span className="text-slate-300">—</span>,
  },
  { key: "date_of_birth", label: "Born", render: (v) => <span className="text-xs text-slate-500">{v || "—"}</span> },
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

function AnimalForm({ open, onClose, onSubmit, initial }) {
  const [form, setForm] = useState(initial || EMPTY_FORM);
  useEffect(() => { setForm(initial || EMPTY_FORM); }, [initial, open]);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{initial ? "Edit Animal" : "Add Animal"}</DialogTitle></DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-medium text-slate-600">Name *</label>
              <Input value={form.name} onChange={e => set("name", e.target.value)} placeholder="Bessie" className="mt-1" /></div>
            <div><label className="text-xs font-medium text-slate-600">Animal Type *</label>
              <select value={form.animal_type} onChange={e => set("animal_type", e.target.value)} className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
                <option value="">Select type…</option>
                {["livestock","cattle","poultry","swine","sheep","goat","aquatic","fish","companion","equine","other"].map(t => <option key={t} value={t}>{t}</option>)}
              </select></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-medium text-slate-600">Species</label>
              <Input value={form.species} onChange={e => set("species", e.target.value)} placeholder="Cattle" className="mt-1" /></div>
            <div><label className="text-xs font-medium text-slate-600">Breed</label>
              <Input value={form.breed} onChange={e => set("breed", e.target.value)} placeholder="Friesian" className="mt-1" /></div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div><label className="text-xs font-medium text-slate-600">Sex</label>
              <select value={form.sex} onChange={e => set("sex", e.target.value)} className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
                <option value="">—</option>
                {["male","female","unknown"].map(s => <option key={s} value={s}>{s}</option>)}
              </select></div>
            <div><label className="text-xs font-medium text-slate-600">Status</label>
              <select value={form.status} onChange={e => set("status", e.target.value)} className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
                {["active","healthy","inactive","sold","deceased","quarantine","discharged"].map(s => <option key={s} value={s}>{s}</option>)}
              </select></div>
            <div><label className="text-xs font-medium text-slate-600">Weight (kg)</label>
              <Input type="number" value={form.weight_kg} onChange={e => set("weight_kg", e.target.value)} placeholder="450" className="mt-1" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-medium text-slate-600">Date of Birth</label>
              <Input type="date" value={form.date_of_birth} onChange={e => set("date_of_birth", e.target.value)} className="mt-1" /></div>
            <div><label className="text-xs font-medium text-slate-600">Tag / Ear Tag ID</label>
              <Input value={form.tag_id} onChange={e => set("tag_id", e.target.value)} placeholder="EAR-001" className="mt-1" /></div>
          </div>
          <div><label className="text-xs font-medium text-slate-600">Notes</label>
            <Input value={form.notes} onChange={e => set("notes", e.target.value)} placeholder="Health notes, vet history…" className="mt-1" /></div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={() => { if (!form.name || !form.animal_type) return; onSubmit(form); }}>
              {initial ? "Save Changes" : "Add Animal"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function Animals() {
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
    const fn = () => { if (document.visibilityState === "visible") qc.refetchQueries({ queryKey: ["animals"] }); };
    document.addEventListener("visibilitychange", fn);
    return () => document.removeEventListener("visibilitychange", fn);
  }, [qc]);

  const { data: animals = [], isLoading } = useQuery({
    queryKey: ["animals", companyId],
    queryFn:  () => listFn(base44.entities.Animal),
    enabled:  currentUser !== null,
    staleTime: 0,
    refetchOnMount: "always",
  });

  const createMut = useMutation({
    mutationFn: (d) => base44.entities.Animal.create(withScope(d)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["animals"] }); qc.refetchQueries({ queryKey: ["animals"] });
      triggerETL(); logAudit(companyId, "created", editing, currentUser?.email); setFormOpen(false);
    },
  });
  const updateMut = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Animal.update(id, withScope(data)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["animals"] }); qc.refetchQueries({ queryKey: ["animals"] });
      triggerETL(); logAudit(companyId, "updated", editing, currentUser?.email); setFormOpen(false); setEditing(null);
    },
  });
  const deleteMut = useMutation({
    mutationFn: (id) => base44.entities.Animal.delete(id),
    onSuccess: () => {
      logAudit(companyId, "deleted", deleting, currentUser?.email);
      qc.invalidateQueries({ queryKey: ["animals"] }); qc.refetchQueries({ queryKey: ["animals"] }); triggerETL(); setDeleting(null);
    },
  });

  const handleBulkDelete = async () => {
    for (const id of selectedIds) await base44.entities.Animal.delete(id).catch(() => {});
    qc.invalidateQueries({ queryKey: ["animals"] }); qc.refetchQueries({ queryKey: ["animals"] }); triggerETL();
    toast({ title: `${selectedIds.length} animals deleted` }); setSelectedIds([]);
  };
  const handleDeleteAll = async () => {
    for (const a of animals) { try { await base44.entities.Animal.delete(a.id); } catch {} }
    qc.invalidateQueries({ queryKey: ["animals"] }); qc.refetchQueries({ queryKey: ["animals"] }); triggerETL();
    toast({ title: `All ${animals.length} animals deleted` });
  };

  const tabFiltered = useMemo(() => {
    if (activeTab === "all") return animals;
    if (activeTab === "aquatic") return animals.filter(a => ["aquatic","fish","aquaculture"].includes((a.animal_type || "").toLowerCase()));
    return animals.filter(a => (a.animal_type || "").toLowerCase().includes(activeTab));
  }, [animals, activeTab]);

  const processed = useMemo(() => {
    let list = search ? fuzzyFilter(tabFiltered, search, ["name", "animal_type", "species", "breed", "tag_id"]) : [...tabFiltered];
    return list.sort((a, b) => new Date(b.created_date || 0) - new Date(a.created_date || 0));
  }, [tabFiltered, search]);

  const ss = useSpreadsheet(processed, columns);
  const activeCount = animals.filter(a => ["active","healthy"].includes((a.status || "").toLowerCase())).length;
  const avgWeight   = animals.filter(a => a.weight_kg).reduce((s, a) => s + parseFloat(a.weight_kg), 0) / (animals.filter(a => a.weight_kg).length || 1);

  return (
    <div className="space-y-5">
      <PageHeader title="Animals" subtitle="Individual animal records — livestock, poultry, aquatic species, companion animals"
        onAdd={perms.l1_create ? () => { setEditing(null); setFormOpen(true); } : undefined} addLabel="Add Animal">
        {perms.l1_create && (
          <Button variant="outline" size="sm" className="rounded-xl" onClick={() => setImportOpen(true)}>
            <Upload className="w-4 h-4 mr-2" /> Import
          </Button>
        )}
        <ExportCSVButton data={processed} fields={["name","animal_type","species","breed","sex","status","date_of_birth","weight_kg","tag_id"]} filename="animals_export" />
        {perms.can_delete && animals.length > 0 && (
          <Button variant="outline" size="sm" className="rounded-xl border-rose-200 text-rose-600 hover:bg-rose-50" onClick={() => setDeleteAllOpen(true)}>Delete All</Button>
        )}
        <ETLSyncBanner syncState={syncState} entityType="animal" />
      </PageHeader>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={PawPrint}    cls="bg-slate-100 text-slate-500"    label="Total Animals"  value={animals.length} />
        <StatCard icon={CheckCircle} cls="bg-emerald-50 text-emerald-600" label="Active / Healthy" value={activeCount} />
        <StatCard icon={Scale}       cls="bg-blue-50 text-blue-600"       label="Avg Weight (kg)" value={animals.some(a => a.weight_kg) ? avgWeight.toFixed(1) : "—"} />
        <StatCard icon={Tag}         cls="bg-amber-50 text-amber-600"     label="Tagged"          value={animals.filter(a => a.tag_id).length} />
      </div>

      <div className="bg-slate-100 rounded-xl p-1 flex flex-wrap gap-1">
        {TYPE_TABS.map(tab => {
          const count = tab.id === "all" ? animals.length
            : tab.id === "aquatic" ? animals.filter(a => ["aquatic","fish","aquaculture"].includes((a.animal_type || "").toLowerCase())).length
            : animals.filter(a => (a.animal_type || "").toLowerCase().includes(tab.id)).length;
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
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, species, tag ID…"
          className="w-full pl-8 pr-8 py-2 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-slate-200" />
        {search && <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"><X className="w-3.5 h-3.5" /></button>}
      </div>

      <BulkActionBar selectedIds={selectedIds} onClear={() => setSelectedIds([])}
        onDeleteSelected={perms.can_delete ? handleBulkDelete : undefined} canDelete={perms.can_delete} />
      <SpreadsheetToolbar {...ss.toolbarProps}
        numericFields={[{ key: "weight_kg", label: "Weight (kg)" }]}
        selectedIds={selectedIds} onSelectAll={() => setSelectedIds(ss.processedData.map(r => r.id))} onClearSelect={() => setSelectedIds([])} />

      {!isLoading && animals.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 border-2 border-dashed border-slate-100 rounded-2xl">
          <PawPrint className="w-10 h-10 text-slate-200 mb-3" />
          <p className="text-slate-400 font-medium mb-1">No animals yet</p>
          <p className="text-slate-300 text-sm mb-4">Add livestock, poultry, aquatic species, or companion animals</p>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => { setEditing(null); setFormOpen(true); }} className="bg-emerald-600 hover:bg-emerald-700 rounded-xl">Add Animal</Button>
            <Button size="sm" variant="outline" onClick={() => setImportOpen(true)} className="rounded-xl">Import from Excel</Button>
          </div>
        </div>
      ) : (
        <DataTable {...ss.tableProps}
          onEdit={perms.l1_edit ? (row) => { setEditing(row); setFormOpen(true); } : undefined}
          onDelete={perms.can_delete ? (row) => setDeleting(row) : undefined}
          bulkMode selectedIds={selectedIds} onSelectionChange={setSelectedIds} />
      )}

      <AnimalForm open={formOpen} onClose={() => { setFormOpen(false); setEditing(null); }}
        initial={editing} onSubmit={(d) => editing ? updateMut.mutate({ id: editing.id, data: d }) : createMut.mutate(d)} />
      <DeleteDialog open={!!deleting} onClose={() => setDeleting(null)} onConfirm={() => deleteMut.mutate(deleting.id)} itemName={deleting?.name || "this animal"} />
      <DeleteAllDialog open={deleteAllOpen} onClose={() => setDeleteAllOpen(false)} onConfirm={handleDeleteAll} entityLabel="Animals" count={animals.length} />
      <BulkImportDialog open={importOpen}
        onClose={() => { setImportOpen(false); qc.invalidateQueries({ queryKey: ["animals"] }); qc.refetchQueries({ queryKey: ["animals"] }); }}
        entityName="Animals" fields={ANIMAL_FIELDS} mappingRules={ANIMAL_MAPPING_RULES}
        templateExample={ANIMAL_TEMPLATE_EXAMPLE}
        entityFetchFn={() => listFn(base44.entities.Animal)}
        validateRow={validateAnimal} transformRow={transformAnimal}
        onImport={(row) => base44.entities.Animal.create(withScope(row))}
        currentUser={currentUser} requiredField="name" />
    </div>
  );
}
