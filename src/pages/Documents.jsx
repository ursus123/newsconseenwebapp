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
import { Upload, FileText, CheckCircle, AlertCircle, Clock, Shield, Search, X } from "lucide-react";
import {
  DOCUMENT_FIELDS, DOCUMENT_MAPPING_RULES, DOCUMENT_TEMPLATE_EXAMPLE,
  DOCUMENT_TEMPLATE_INSTRUCTIONS, validateDocument, transformDocument,
} from "@/components/shared/importConfigs";


const STATUS_COLOR = {
  active:   "bg-emerald-50 text-emerald-700",
  draft:    "bg-amber-50 text-amber-700",
  expired:  "bg-rose-50 text-rose-700",
  archived: "bg-slate-100 text-slate-500",
  signed:   "bg-blue-50 text-blue-700",
};

const STATUS_TABS = [
  { id: "all",     label: "All" },
  { id: "active",  label: "Active" },
  { id: "draft",   label: "Draft" },
  { id: "expired", label: "Expired" },
];

const EMPTY_FORM = { title: "", document_type: "", status: "draft", description: "", expiry_date: "", file_url: "", enterprise_id: "" };

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
  { key: "document_type", label: "Type", render: (v) => <span className="capitalize text-sm text-slate-600">{v || "—"}</span> },
  {
    key: "status", label: "Status",
    render: (v) => <Badge className={STATUS_COLOR[v] || "bg-slate-100 text-slate-600"}>{v || "—"}</Badge>,
  },
  {
    key: "expiry_date", label: "Expires",
    render: (v) => {
      if (!v) return <span className="text-slate-300">—</span>;
      const days = Math.ceil((new Date(v) - new Date()) / 86400000);
      const cls = days < 0 ? "text-rose-600 font-medium" : days <= 30 ? "text-amber-600 font-medium" : "text-slate-500";
      return <span className={`text-xs ${cls}`}>{days < 0 ? `Expired ${Math.abs(days)}d ago` : days <= 30 ? `${days}d left` : v}</span>;
    },
  },
  {
    key: "is_signed", label: "Signed",
    render: (v) => v ? <Badge className="bg-blue-50 text-blue-700">Signed</Badge> : <span className="text-slate-300 text-xs">—</span>,
  },
];

function StatCard({ icon: Icon, cls, label, value }) {
  return (
    <div className="relative bg-white border border-slate-100 rounded-2xl px-4 py-3 flex items-center gap-3">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${cls}`}><Icon className="w-4 h-4" /></div>
      <div><p className="text-xs text-slate-400">{label}</p><p className="text-lg font-bold text-slate-800 leading-tight">{value}</p><AutonomousFigureExplainer entity="Documents" label={label} value={value} /></div>
    </div>
  );
}

function DocumentForm({ open, onClose, onSubmit, initial }) {
  const [form, setForm] = useState(initial || EMPTY_FORM);
  useEffect(() => { setForm(initial || EMPTY_FORM); }, [initial, open]);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{initial ? "Edit Document" : "Add Document"}</DialogTitle></DialogHeader>
        <div className="space-y-4 mt-2">
          <div><label className="text-xs font-medium text-slate-600">Title *</label>
            <Input value={form.title} onChange={e => set("title", e.target.value)} placeholder="Service Agreement 2026" className="mt-1" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-medium text-slate-600">Document Type *</label>
              <Input value={form.document_type} onChange={e => set("document_type", e.target.value)} placeholder="contract" className="mt-1" /></div>
            <div><label className="text-xs font-medium text-slate-600">Status</label>
              <select value={form.status} onChange={e => set("status", e.target.value)} className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
                {["draft","active","signed","expired","archived"].map(s => <option key={s} value={s}>{s}</option>)}
              </select></div>
          </div>
          <div><label className="text-xs font-medium text-slate-600">Description</label>
            <Input value={form.description} onChange={e => set("description", e.target.value)} placeholder="Brief description…" className="mt-1" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-medium text-slate-600">Expiry Date</label>
              <Input type="date" value={form.expiry_date} onChange={e => set("expiry_date", e.target.value)} className="mt-1" /></div>
            <div><label className="text-xs font-medium text-slate-600">File URL</label>
              <Input value={form.file_url} onChange={e => set("file_url", e.target.value)} placeholder="https://…" className="mt-1" /></div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={() => { if (!form.title || !form.document_type) return; onSubmit(form); }}>
              {initial ? "Save Changes" : "Add Document"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function Documents() {
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
    const fn = () => { if (document.visibilityState === "visible") qc.refetchQueries({ queryKey: ["documents"] }); };
    document.addEventListener("visibilitychange", fn);
    return () => document.removeEventListener("visibilitychange", fn);
  }, [qc]);

  const { data: docs = [], isLoading } = useQuery({
    queryKey: ["documents", companyId],
    queryFn:  () => listFn(base44.entities.Document),
    enabled:  currentUser !== null,
    staleTime: 0,
    refetchOnMount: "always",
  });

  const createMut = useMutation({
    mutationFn: (d) => dataService.createRecord("document", d, currentUser, { queryClient: qc, notifyTaxonomyChange }),
    onSuccess: () => {
      setFormOpen(false);
      setEditing(null);
    },
  });
  const updateMut = useMutation({
    mutationFn: ({ id, data }) => dataService.updateRecord("document", id, data, currentUser, { queryClient: qc, notifyTaxonomyChange, record: editing }),
    onSuccess: () => {
      setFormOpen(false);
      setEditing(null);
    },
  });
  const deleteMut = useMutation({
    mutationFn: (id) => dataService.deleteRecord("document", id, currentUser, { queryClient: qc, record: deleting }),
    onSuccess: () => {
      setDeleting(null);
    },
  });

  const handleBulkDelete = async () => {
    for (const id of selectedIds) await dataService.deleteRecord("document", id, currentUser, { queryClient: qc });
    toast({ title: `${selectedIds.length} documents deleted` });
    setSelectedIds([]);
  };

  const handleDeleteAll = async () => {
    for (const d of docs) { try { await dataService.deleteRecord("document", d.id, currentUser, { queryClient: qc }); } catch {} }
    toast({ title: `All ${docs.length} documents deleted` });
  };

  const tabFiltered = activeTab === "all" ? docs : docs.filter(d => d.status === activeTab);

  const processed = useMemo(() => {
    let list = search ? fuzzyFilter(tabFiltered, search, ["title", "document_type", "description"]) : [...tabFiltered];
    return list.sort((a, b) => new Date(b.created_date || 0) - new Date(a.created_date || 0));
  }, [tabFiltered, search]);

  const ss = useSpreadsheet(processed, columns);

  const expiring30 = docs.filter(d => {
    if (!d.expiry_date) return false;
    const days = Math.ceil((new Date(d.expiry_date) - new Date()) / 86400000);
    return days >= 0 && days <= 30;
  }).length;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Documents"
        subtitle="Manage contracts, certificates, policies and managed files"
        onAdd={perms.l1_create ? () => { setEditing(null); setFormOpen(true); } : undefined}
        addLabel="Add Document"
      >
        {perms.l1_create && (
          <Button variant="outline" size="sm" className="rounded-xl" onClick={() => setImportOpen(true)}>
            <Upload className="w-4 h-4 mr-2" /> Import
          </Button>
        )}
        <ExportCSVButton
          data={processed}
          fields={["title","document_type","status","expiry_date","file_url","description"]}
          filename="documents_export"
        />
        {perms.can_delete && docs.length > 0 && (
          <Button variant="outline" size="sm" className="rounded-xl border-rose-200 text-rose-600 hover:bg-rose-50" onClick={() => setDeleteAllOpen(true)}>
            Delete All
          </Button>
        )}
        <ETLSyncBanner syncState={syncState} entityType="document" />
      </PageHeader>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={FileText}    cls="bg-slate-100 text-slate-500"    label="Total Documents" value={docs.length} />
        <StatCard icon={CheckCircle} cls="bg-emerald-50 text-emerald-600" label="Active"           value={docs.filter(d => d.status === "active").length} />
        <StatCard icon={AlertCircle} cls="bg-rose-50 text-rose-600"       label="Expired"          value={docs.filter(d => d.status === "expired").length} />
        <StatCard icon={Clock}       cls="bg-amber-50 text-amber-600"     label="Expiring (30d)"   value={expiring30} />
      </div>

      <div className="bg-slate-100 rounded-xl p-1 flex flex-wrap gap-1">
        {STATUS_TABS.map(tab => {
          const count = tab.id === "all" ? docs.length : docs.filter(d => d.status === tab.id).length;
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
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search documents…"
          className="w-full pl-8 pr-8 py-2 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-slate-200" />
        {search && <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"><X className="w-3.5 h-3.5" /></button>}
      </div>

      <BulkActionBar selectedIds={selectedIds} onClear={() => setSelectedIds([])}
        onDeleteSelected={perms.can_delete ? handleBulkDelete : undefined} canDelete={perms.can_delete} />

      <SpreadsheetToolbar {...ss.toolbarProps}
        selectedIds={selectedIds} onSelectAll={() => setSelectedIds(ss.processedData.map(r => r.id))} onClearSelect={() => setSelectedIds([])} />

      {!isLoading && docs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 border-2 border-dashed border-slate-100 rounded-2xl">
          <FileText className="w-10 h-10 text-slate-200 mb-3" />
          <p className="text-slate-400 font-medium mb-1">No documents yet</p>
          <p className="text-slate-300 text-sm mb-4">Add contracts, certificates, and managed files</p>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => { setEditing(null); setFormOpen(true); }} className="bg-emerald-600 hover:bg-emerald-700 rounded-xl">Add Document</Button>
            <Button size="sm" variant="outline" onClick={() => setImportOpen(true)} className="rounded-xl">Import from Excel</Button>
          </div>
        </div>
      ) : (
        <DataTable
          {...ss.tableProps}
          onEdit={perms.l1_edit ? (row) => { setEditing(row); setFormOpen(true); } : undefined}
          onDelete={perms.can_delete ? (row) => setDeleting(row) : undefined}
          bulkMode selectedIds={selectedIds} onSelectionChange={setSelectedIds}
        />
      )}

      <DocumentForm open={formOpen} onClose={() => { setFormOpen(false); setEditing(null); }}
        initial={editing}
        onSubmit={(d) => editing ? updateMut.mutateAsync({ id: editing.id, data: d }) : createMut.mutateAsync(d)} />

      <DeleteDialog open={!!deleting} onClose={() => setDeleting(null)}
        onConfirm={() => deleteMut.mutate(deleting.id)}
        itemName={deleting?.title || "this document"} />

      <DeleteAllDialog open={deleteAllOpen} onClose={() => setDeleteAllOpen(false)}
        onConfirm={handleDeleteAll} entityLabel="Documents" count={docs.length} />

      <BulkImportDialog
        open={importOpen}
        onClose={() => { setImportOpen(false); qc.invalidateQueries({ queryKey: ["documents"] }); qc.refetchQueries({ queryKey: ["documents"] }); }}
        entityName="Documents"
        fields={DOCUMENT_FIELDS}
        mappingRules={DOCUMENT_MAPPING_RULES}
        templateExample={DOCUMENT_TEMPLATE_EXAMPLE}
        templateInstructions={DOCUMENT_TEMPLATE_INSTRUCTIONS}
        entityFetchFn={() => listFn(base44.entities.Document)}
        validateRow={validateDocument}
        transformRow={transformDocument}
        onImport={(row) => dataService.createRecord("document", row, currentUser, { queryClient: qc })}
        currentUser={currentUser}
        requiredField="title"
      />
    </div>
  );
}
