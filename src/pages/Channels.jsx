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
import { Upload, MessageSquare, CheckCircle, ThumbsUp, ThumbsDown, Hash, Search, X } from "lucide-react";
import {
  CHANNEL_FIELDS, CHANNEL_MAPPING_RULES, CHANNEL_TEMPLATE_EXAMPLE,
  CHANNEL_TEMPLATE_INSTRUCTIONS, validateChannel, transformChannel,
} from "@/components/shared/importConfigs";


const STATUS_COLOR = {
  active:   "bg-emerald-50 text-emerald-700",
  inactive: "bg-slate-100 text-slate-500",
  blocked:  "bg-rose-50 text-rose-700",
};
const SENTIMENT_COLOR = {
  positive: "bg-emerald-50 text-emerald-700",
  neutral:  "bg-slate-100 text-slate-600",
  negative: "bg-rose-50 text-rose-700",
};

const TYPE_TABS = [
  { id: "all",       label: "All" },
  { id: "whatsapp",  label: "WhatsApp" },
  { id: "email",     label: "Email" },
];

const EMPTY_FORM = { name: "", channel_type: "", purpose: "", status: "active", sentiment: "neutral", message_count: "", description: "" };

const columns = [
  {
    key: "name", label: "Channel",
    render: (val, row) => (
      <div>
        <p className="font-medium text-slate-800">{val || "—"}</p>
        {row.purpose && <p className="text-xs text-slate-400 capitalize">{row.purpose}</p>}
      </div>
    ),
  },
  { key: "channel_type", label: "Type",     render: (v) => <span className="capitalize text-sm text-slate-600">{(v || "—").replace(/_/g, " ")}</span> },
  {
    key: "sentiment", label: "Sentiment",
    render: (v) => v ? <Badge className={SENTIMENT_COLOR[v] || "bg-slate-100 text-slate-600"}>{v}</Badge> : <span className="text-slate-300">—</span>,
  },
  { key: "message_count", label: "Messages", render: (v) => <span className="font-mono text-slate-600 text-sm">{v ?? 0}</span> },
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

function ChannelForm({ open, onClose, onSubmit, initial }) {
  const [form, setForm] = useState(initial || EMPTY_FORM);
  useEffect(() => { setForm(initial || EMPTY_FORM); }, [initial, open]);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{initial ? "Edit Channel" : "Add Channel"}</DialogTitle></DialogHeader>
        <div className="space-y-4 mt-2">
          <div><label className="text-xs font-medium text-slate-600">Name *</label>
            <Input value={form.name} onChange={e => set("name", e.target.value)} placeholder="Support WhatsApp Group" className="mt-1" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-medium text-slate-600">Channel Type *</label>
              <select value={form.channel_type} onChange={e => set("channel_type", e.target.value)} className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
                <option value="">Select type…</option>
                {["whatsapp","whatsapp_group","email","email_list","sms","broadcast","slack","telegram","other"].map(t => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
              </select></div>
            <div><label className="text-xs font-medium text-slate-600">Purpose</label>
              <Input value={form.purpose} onChange={e => set("purpose", e.target.value)} placeholder="support, marketing…" className="mt-1" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-medium text-slate-600">Status</label>
              <select value={form.status} onChange={e => set("status", e.target.value)} className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
                {["active","inactive","blocked"].map(s => <option key={s} value={s}>{s}</option>)}
              </select></div>
            <div><label className="text-xs font-medium text-slate-600">Sentiment</label>
              <select value={form.sentiment} onChange={e => set("sentiment", e.target.value)} className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
                {["positive","neutral","negative"].map(s => <option key={s} value={s}>{s}</option>)}
              </select></div>
          </div>
          <div><label className="text-xs font-medium text-slate-600">Message Count</label>
            <Input type="number" value={form.message_count} onChange={e => set("message_count", e.target.value)} placeholder="0" className="mt-1" /></div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={() => { if (!form.name || !form.channel_type) return; onSubmit(form); }}>
              {initial ? "Save Changes" : "Add Channel"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function Channels() {
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
    const fn = () => { if (document.visibilityState === "visible") qc.refetchQueries({ queryKey: ["channels"] }); };
    document.addEventListener("visibilitychange", fn);
    return () => document.removeEventListener("visibilitychange", fn);
  }, [qc]);

  const { data: channels = [], isLoading } = useQuery({
    queryKey: ["channels", companyId],
    queryFn:  () => listFn(base44.entities.Channel),
    enabled:  currentUser !== null,
    staleTime: 0,
    refetchOnMount: "always",
  });

  const createMut = useMutation({
    mutationFn: (d) => dataService.createRecord("channel", d, currentUser, { queryClient: qc, notifyTaxonomyChange }),
    onSuccess: () => {
      setFormOpen(false);
      setEditing(null);
    },
  });
  const updateMut = useMutation({
    mutationFn: ({ id, data }) => dataService.updateRecord("channel", id, data, currentUser, { queryClient: qc, notifyTaxonomyChange, record: editing }),
    onSuccess: () => {
      setFormOpen(false);
      setEditing(null);
    },
  });
  const deleteMut = useMutation({
    mutationFn: (id) => dataService.deleteRecord("channel", id, currentUser, { queryClient: qc, record: deleting }),
    onSuccess: () => {
      setDeleting(null);
    },
  });

  const handleBulkDelete = async () => {
    for (const id of selectedIds) await dataService.deleteRecord("channel", id, currentUser, { queryClient: qc });
    toast({ title: `${selectedIds.length} channels deleted` }); setSelectedIds([]);
  };
  const handleDeleteAll = async () => {
    for (const c of channels) { try { await dataService.deleteRecord("channel", c.id, currentUser, { queryClient: qc }); } catch {} }
    toast({ title: `All ${channels.length} channels deleted` });
  };

  const tabFiltered = useMemo(() => {
    if (activeTab === "all") return channels;
    return channels.filter(c => (c.channel_type || "").toLowerCase().includes(activeTab));
  }, [channels, activeTab]);

  const processed = useMemo(() => {
    let list = search ? fuzzyFilter(tabFiltered, search, ["name", "channel_type", "purpose"]) : [...tabFiltered];
    return list.sort((a, b) => new Date(b.created_date || 0) - new Date(a.created_date || 0));
  }, [tabFiltered, search]);

  const ss = useSpreadsheet(processed, columns);
  const totalMessages = channels.reduce((sum, c) => sum + (parseInt(c.message_count) || 0), 0);

  return (
    <div className="space-y-5">
      <PageHeader title="Channels" subtitle="WhatsApp groups, email threads, broadcast lists, communication channels"
        onAdd={perms.l1_create ? () => { setEditing(null); setFormOpen(true); } : undefined} addLabel="Add Channel">
        {perms.l1_create && (
          <Button variant="outline" size="sm" className="rounded-xl" onClick={() => setImportOpen(true)}>
            <Upload className="w-4 h-4 mr-2" /> Import
          </Button>
        )}
        <ExportCSVButton data={processed} fields={["name","channel_type","purpose","status","sentiment","message_count"]} filename="channels_export" />
        {perms.can_delete && channels.length > 0 && (
          <Button variant="outline" size="sm" className="rounded-xl border-rose-200 text-rose-600 hover:bg-rose-50" onClick={() => setDeleteAllOpen(true)}>Delete All</Button>
        )}
        <ETLSyncBanner syncState={syncState} entityType="channel" />
      </PageHeader>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={MessageSquare} cls="bg-slate-100 text-slate-500"    label="Total Channels" value={channels.length} />
        <StatCard icon={CheckCircle}   cls="bg-emerald-50 text-emerald-600" label="Active"          value={channels.filter(c => c.status === "active").length} />
        <StatCard icon={ThumbsUp}      cls="bg-blue-50 text-blue-600"       label="Positive"        value={channels.filter(c => c.sentiment === "positive").length} />
        <StatCard icon={Hash}          cls="bg-purple-50 text-purple-600"   label="Total Messages"  value={totalMessages.toLocaleString()} />
      </div>

      <div className="bg-slate-100 rounded-xl p-1 flex flex-wrap gap-1">
        {TYPE_TABS.map(tab => {
          const count = tab.id === "all" ? channels.length : channels.filter(c => (c.channel_type || "").toLowerCase().includes(tab.id)).length;
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
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search channels…"
          className="w-full pl-8 pr-8 py-2 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-slate-200" />
        {search && <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"><X className="w-3.5 h-3.5" /></button>}
      </div>

      <BulkActionBar selectedIds={selectedIds} onClear={() => setSelectedIds([])}
        onDeleteSelected={perms.can_delete ? handleBulkDelete : undefined} canDelete={perms.can_delete} />
      <SpreadsheetToolbar {...ss.toolbarProps}
        selectedIds={selectedIds} onSelectAll={() => setSelectedIds(ss.processedData.map(r => r.id))} onClearSelect={() => setSelectedIds([])} />

      {!isLoading && channels.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 border-2 border-dashed border-slate-100 rounded-2xl">
          <MessageSquare className="w-10 h-10 text-slate-200 mb-3" />
          <p className="text-slate-400 font-medium mb-1">No channels yet</p>
          <p className="text-slate-300 text-sm mb-4">Track WhatsApp groups, email lists, and broadcast channels</p>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => { setEditing(null); setFormOpen(true); }} className="bg-emerald-600 hover:bg-emerald-700 rounded-xl">Add Channel</Button>
            <Button size="sm" variant="outline" onClick={() => setImportOpen(true)} className="rounded-xl">Import from Excel</Button>
          </div>
        </div>
      ) : (
        <DataTable {...ss.tableProps}
          onEdit={perms.l1_edit ? (row) => { setEditing(row); setFormOpen(true); } : undefined}
          onDelete={perms.can_delete ? (row) => setDeleting(row) : undefined}
          bulkMode selectedIds={selectedIds} onSelectionChange={setSelectedIds} />
      )}

      <ChannelForm open={formOpen} onClose={() => { setFormOpen(false); setEditing(null); }}
        initial={editing} onSubmit={(d) => editing ? updateMut.mutateAsync({ id: editing.id, data: d }) : createMut.mutateAsync(d)} />
      <DeleteDialog open={!!deleting} onClose={() => setDeleting(null)} onConfirm={() => deleteMut.mutate(deleting.id)} itemName={deleting?.name || "this channel"} />
      <DeleteAllDialog open={deleteAllOpen} onClose={() => setDeleteAllOpen(false)} onConfirm={handleDeleteAll} entityLabel="Channels" count={channels.length} />
      <BulkImportDialog open={importOpen}
        onClose={() => { setImportOpen(false); qc.invalidateQueries({ queryKey: ["channels"] }); qc.refetchQueries({ queryKey: ["channels"] }); }}
        entityName="Channels" fields={CHANNEL_FIELDS} mappingRules={CHANNEL_MAPPING_RULES}
        templateExample={CHANNEL_TEMPLATE_EXAMPLE} templateInstructions={CHANNEL_TEMPLATE_INSTRUCTIONS}
        entityFetchFn={() => listFn(base44.entities.Channel)}
        validateRow={validateChannel} transformRow={transformChannel}
        onImport={(row) => dataService.createRecord("channel", row, currentUser, { queryClient: qc })}
        currentUser={currentUser} requiredField="name" />
    </div>
  );
}
