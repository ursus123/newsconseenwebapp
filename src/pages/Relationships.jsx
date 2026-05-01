import React, { useState, useEffect, useMemo, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import PageHeader from "../components/shared/PageHeader";
import DataTable from "../components/shared/DataTable";
import DeleteDialog from "../components/shared/DeleteDialog";
import RelationshipForm from "../components/relationships/RelationshipForm";
import BulkImportDialog from "../components/shared/BulkImportDialog";
import SearchFilterBar from "../components/shared/SearchFilterBar";
import BulkActionBar from "../components/shared/BulkActionBar";
import { Button } from "@/components/ui/button";
import { Upload, Users, Building2, Package, Wrench, MapPin, Link2, CheckSquare, Network, List, BarChart2, X } from "lucide-react";
import CytoscapeRelationshipGraph from "../components/network/CytoscapeRelationshipGraph";
import ExportCSVButton from "@/components/shared/ExportCSVButton";
import DeleteAllDialog from "@/components/shared/DeleteAllDialog";
import BulkAssignDialog from "../components/relationships/BulkAssignDialog";
import { fuzzyFilter } from "@/components/shared/fuzzySearch";
import { useToast } from "@/components/ui/use-toast";
import {
  RELATIONSHIP_FIELDS, RELATIONSHIP_MAPPING_RULES, RELATIONSHIP_TEMPLATE_EXAMPLE,
  RELATIONSHIP_TEMPLATE_INSTRUCTIONS, validateRelationship,
} from "@/components/shared/importConfigs";
import RelationshipSummaryCards from "../components/relationships/RelationshipSummaryCards";
import RelationshipHealthAlerts from "../components/relationships/RelationshipHealthAlerts";
import RelationshipAnalytics from "../components/relationships/RelationshipAnalytics";
import EndRelationshipDialog from "../components/relationships/EndRelationshipDialog";
import RelationshipDetailPanel from "../components/relationships/RelationshipDetailPanel";
import { Badge } from "@/components/ui/badge";
import { usePermissions } from "@/components/shared/usePermissions";
import { useEntityListFn } from "@/components/shared/useDataQuery";
import dataService from "@/services/dataService";
import SpreadsheetToolbar from "@/components/shared/SpreadsheetToolbar";
import { useSpreadsheet } from "@/hooks/useSpreadsheet";

const TYPE_CONFIG = {
  person_enterprise:    { label: "Person → Enterprise",    color: "bg-blue-50 text-blue-700" },
  item_enterprise:      { label: "Item → Enterprise",      color: "bg-purple-50 text-purple-700" },
  item_person:          { label: "Item → Person",          color: "bg-amber-50 text-amber-700" },
  person_service:       { label: "Person → Service",       color: "bg-cyan-50 text-cyan-700" },
  enterprise_service:   { label: "Enterprise → Service",   color: "bg-indigo-50 text-indigo-700" },
  person_address:       { label: "Person → Address",       color: "bg-teal-50 text-teal-700" },
  enterprise_address:   { label: "Enterprise → Address",   color: "bg-emerald-50 text-emerald-700" },
  person_person:        { label: "Person → Person",        color: "bg-rose-50 text-rose-700" },
  enterprise_enterprise:{ label: "Enterprise → Enterprise",color: "bg-violet-50 text-violet-700" },
};

const statusColor = (s) => ({ active: "bg-emerald-50 text-emerald-700", ended: "bg-rose-50 text-rose-600", archived: "bg-slate-100 text-slate-400" }[s] || "bg-slate-100 text-slate-600");

const columns = [
  { key: "relationship_type", label: "Type", render: (val) => { const c = TYPE_CONFIG[val]; return c ? <Badge className={c.color}>{c.label}</Badge> : val; } },
  { key: "person_name", label: "From (Person / Enterprise)", render: (v, row) => v || row.enterprise_name || "—" },
  { key: "enterprise_name", label: "To (Enterprise / Person)", render: (v, row) => {
    if (row.relationship_type === "person_person") return row.secondary_person || "—";
    if (row.relationship_type === "enterprise_enterprise") return row.secondary_enterprise || "—";
    return v || row.person_name || "—";
  }},
  { key: "item_name", label: "Item", render: (v) => v || "—" },
  { key: "service_name", label: "Service", render: (v) => v || "—" },
  { key: "role", label: "Role", render: (v) => v || "—" },
  { key: "start_date", label: "Start" },
  { key: "status", label: "Status", render: (val) => <Badge className={statusColor(val)}>{val || "active"}</Badge> },
];

const TYPE_TABS = [
  { id: "all", label: "All" },
  { id: "person_enterprise", label: "Person → Enterprise" },
  { id: "person_person", label: "Person → Person" },
  { id: "enterprise_enterprise", label: "Enterprise → Enterprise" },
  { id: "item_enterprise", label: "Item → Enterprise" },
  { id: "item_person", label: "Item → Person" },
  { id: "person_service", label: "Person → Service" },
  { id: "enterprise_service", label: "Enterprise → Service" },
  { id: "person_address", label: "Person → Address" },
  { id: "enterprise_address", label: "Enterprise → Address" },
];

const QUICK_ADDS = [
  { type: "person_enterprise",    icon: Users,     label: "Person → Enterprise",    cls: "bg-blue-600 hover:bg-blue-700" },
  { type: "person_person",        icon: Users,     label: "Person → Person",        cls: "bg-rose-600 hover:bg-rose-700" },
  { type: "enterprise_enterprise",icon: Building2, label: "Enterprise → Enterprise",cls: "bg-violet-600 hover:bg-violet-700" },
  { type: "person_service",       icon: Wrench,    label: "Person → Service",       cls: "bg-cyan-600 hover:bg-cyan-700" },
  { type: "person_address",       icon: MapPin,    label: "Person → Address",       cls: "bg-teal-600 hover:bg-teal-700" },
  { type: "item_enterprise",      icon: Building2, label: "Item → Enterprise",      cls: "bg-purple-600 hover:bg-purple-700" },
  { type: "item_person",          icon: Package,   label: "Item → Person",          cls: "bg-amber-500 hover:bg-amber-600" },
  { type: "enterprise_service",   icon: Link2,     label: "Enterprise → Service",   cls: "bg-indigo-600 hover:bg-indigo-700" },
  { type: "enterprise_address",    icon: MapPin,    label: "Enterprise → Address",   cls: "bg-emerald-600 hover:bg-emerald-700" },
];

const REL_PREVIEW_COLS = [
  { label: "Type", render: (r) => r.relationship_type || <span className="text-rose-500">MISSING</span> },
  { label: "Person", render: (r) => r.person_name || "—" },
  { label: "Enterprise", render: (r) => r.enterprise_name || "—" },
  { label: "Item", render: (r) => r.item_name || "—" },
  { label: "Start Date", render: (r) => r.start_date || "—" },
];

const FILTER_DEFS = [
  { key: "status", label: "All Status", options: [{ value: "active", label: "Active" }, { value: "ended", label: "Ended" }, { value: "archived", label: "Archived" }] },
];

export default function Relationships() {
  const [formOpen, setFormOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [formType, setFormType] = useState("person_enterprise");
  const [formPrefill, setFormPrefill] = useState(null);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [endTarget, setEndTarget] = useState(null);
  const [detailRel, setDetailRel] = useState(null);
  const [activeTab, setActiveTab] = useState("all");
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({ status: "" });
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkAssignOpen, setBulkAssignOpen] = useState(false);
  const [deleteAllOpen, setDeleteAllOpen] = useState(false);
  const [analyticsOpen, setAnalyticsOpen] = useState(false);
  const [viewMode, setViewMode] = useState("table");
  const { data: currentUser = null } = useQuery({
    queryKey: ["currentUser"],
    queryFn: () => base44.auth.me(),
    staleTime: 0,
    refetchOnMount: "always",
  });
  const qc = useQueryClient();
  const { toast } = useToast();

  useEffect(() => {
    const fn = () => { if (document.visibilityState === "visible") qc.refetchQueries({ queryKey: ["relationships"] }); };
    document.addEventListener("visibilitychange", fn);
    return () => document.removeEventListener("visibilitychange", fn);
  }, [qc]);

  const perms = usePermissions(currentUser);
  const listFn = useEntityListFn(currentUser);

  const { data: relationships = [] } = useQuery({ queryKey: ["relationships", currentUser?.company_id, currentUser?.email], queryFn: () => listFn(base44.entities.Relationship), enabled: currentUser !== null, staleTime: 0, refetchOnMount: "always" });
  const { data: people = [] } = useQuery({ queryKey: ["people", currentUser?.company_id, currentUser?.email], queryFn: () => listFn(base44.entities.Person), enabled: currentUser !== null, staleTime: 0, refetchOnMount: "always" });
  const { data: enterprises = [] } = useQuery({ queryKey: ["enterprises", currentUser?.company_id, currentUser?.email], queryFn: () => listFn(base44.entities.Enterprise), enabled: currentUser !== null, staleTime: 0, refetchOnMount: "always" });
  const { data: products = [] } = useQuery({ queryKey: ["products", currentUser?.company_id, currentUser?.email], queryFn: () => listFn(base44.entities.Product), enabled: currentUser !== null, staleTime: 0, refetchOnMount: "always" });
  const { data: services = [] } = useQuery({ queryKey: ["services", currentUser?.company_id, currentUser?.email], queryFn: () => listFn(base44.entities.Service), enabled: currentUser !== null, staleTime: 0, refetchOnMount: "always" });
  const { data: addresses = [] } = useQuery({ queryKey: ["addresses", currentUser?.company_id, currentUser?.email], queryFn: () => listFn(base44.entities.Address), enabled: currentUser !== null, staleTime: 0, refetchOnMount: "always" });
  const { data: tasks = [] } = useQuery({ queryKey: ["tasks", currentUser?.company_id, currentUser?.email], queryFn: () => listFn(base44.entities.Task), enabled: currentUser !== null, staleTime: 0, refetchOnMount: "always" });
  const { data: transactions = [] } = useQuery({ queryKey: ["transactions", currentUser?.company_id, currentUser?.email], queryFn: () => listFn(base44.entities.Transaction), enabled: currentUser !== null, staleTime: 0, refetchOnMount: "always" });


  const updateMut = useMutation({
    mutationFn: ({ id, data }) => dataService.updateRecord("relationship", id, data, currentUser, { queryClient: qc, record: editing }),
    onSuccess: () => {
      setFormOpen(false);
      setEditing(null);
      setEndTarget(null);
    },
  });
  const deleteMut = useMutation({
    mutationFn: (id) => dataService.deleteRecord("relationship", id, currentUser, { queryClient: qc, record: deleting }),
    onSuccess: () => { setDeleting(null); },
  });

  const handleSubmit = async (data, saveAndNew = false) => {
    if (editing) {
      return updateMut.mutateAsync({ id: editing.id, data });
    } else {
      const created = await dataService.createRecord("relationship", data, currentUser, { queryClient: qc });
      if (saveAndNew) {
        setEditing(null);
        setFormPrefill(null);
      } else {
        setFormOpen(false);
        setFormPrefill(null);
      }
      return created;
    }
  };

  const handleEndDialog = (data) => updateMut.mutate({ id: endTarget.id, data: { ...endTarget, ...data } });

  const openNew = (type, prefill = null) => { setFormType(type); setEditing(null); setFormPrefill(prefill); setFormOpen(true); };

  const handleBulkAssign = async (pairs) => {
    for (const pair of pairs) await dataService.createRecord("relationship", pair, currentUser, { queryClient: qc });
    dataService.triggerEntityETL("relationship");
    toast({ title: `${pairs.length} relationship${pairs.length !== 1 ? "s" : ""} created` });
  };

  const handleDeleteAll = async () => {
    for (const r of relationships) { try { await base44.entities.Relationship.delete(r.id); } catch (e) { /* 404 = already gone */ } }
    qc.invalidateQueries({ queryKey: ["relationships"] });
    qc.refetchQueries({ queryKey: ["relationships"] });
    dataService.triggerEntityETL("relationship");
    toast({ title: `All ${relationships.length} relationships deleted` });
  };

  const handleBulkDelete = async () => {
    for (const id of selectedIds) await base44.entities.Relationship.delete(id);
    qc.invalidateQueries({ queryKey: ["relationships"] });
    qc.refetchQueries({ queryKey: ["relationships"] });
    dataService.triggerEntityETL("relationship");
    toast({ title: `${selectedIds.length} relationships deleted` });
    setSelectedIds([]);
  };

  const tabFiltered = activeTab === "all" ? relationships : relationships.filter((r) => r.relationship_type === activeTab);

  const processedRelationships = useMemo(() => {
    let list = [...tabFiltered];
    if (search) list = fuzzyFilter(list, search, ["person_name", "enterprise_name", "item_name", "service_name", "role", "location"]);
    if (filters.status) list = list.filter((r) => (r.status || "active") === filters.status);
    return list;
  }, [tabFiltered, search, filters]);

  const ss = useSpreadsheet(processedRelationships, columns);

  return (
    <div>
      <PageHeader title="Relationships" subtitle="Assign people, items and enterprises — preserve history">
        {perms.l2_assign && (
          <Button variant="outline" size="sm" className="rounded-xl" onClick={() => setImportOpen(true)}>
            <Upload className="w-4 h-4 mr-2" /> Import
          </Button>
        )}
        <ExportCSVButton
          data={processedRelationships}
          fields={["relationship_type","person_name","enterprise_name","item_name","service_name","role","start_date","end_date","status"]}
          filename="relationships_export"
        />
        {perms.l2_unassign && relationships.length > 0 && (
          <Button variant="outline" size="sm" className="rounded-xl border-rose-200 text-rose-600 hover:bg-rose-50" onClick={() => setDeleteAllOpen(true)}>
            🗑️ Delete All
          </Button>
        )}
      </PageHeader>

      <RelationshipSummaryCards relationships={relationships} people={people} />
      <RelationshipHealthAlerts relationships={relationships} people={people} products={products} onEdit={(r) => { setEditing(r); setFormType(r.relationship_type); setFormOpen(true); }} onOpenNew={openNew} />

      {perms.l2_assign && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Quick Assign</p>
            <Button size="sm" onClick={() => setBulkAssignOpen(true)} className="bg-emerald-600 hover:bg-emerald-700 rounded-xl text-xs h-8">
              <CheckSquare className="w-3.5 h-3.5 mr-1.5" /> Bulk Assign
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {QUICK_ADDS.map(({ type, icon: Icon, label, cls }) => (
              <Button key={type} onClick={() => openNew(type)} className={`rounded-xl shadow text-sm ${cls}`}>
                <Icon className="w-4 h-4 mr-2" /> {label}
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* View toggle + Type filter tabs */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
          <button
            onClick={() => setViewMode("table")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${viewMode === "table" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
          >
            <List className="w-3.5 h-3.5" /> Table
          </button>
          <button
            onClick={() => setViewMode("graph")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${viewMode === "graph" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
          >
            <Network className="w-3.5 h-3.5" /> Graph
          </button>
        </div>
        <button onClick={() => setAnalyticsOpen(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-white border border-slate-200 text-slate-600 hover:border-emerald-400 hover:text-emerald-700 transition-all shadow-sm">
          <BarChart2 className="w-3.5 h-3.5" /> Analytics
        </button>
      </div>

      <div className="flex flex-wrap gap-1 bg-slate-100 rounded-xl p-1 mb-4">
        {TYPE_TABS.map((t) => {
          const count = t.id === "all" ? relationships.length : relationships.filter((r) => r.relationship_type === t.id).length;
          return (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 ${activeTab === t.id ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
              {t.label}
              {count > 0 && <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${activeTab === t.id ? "bg-slate-100 text-slate-600" : "bg-slate-200 text-slate-500"}`}>{count}</span>}
            </button>
          );
        })}
      </div>

      <SearchFilterBar
        search={search} setSearch={setSearch}
        filters={filters} setFilters={setFilters}
        filterDefs={FILTER_DEFS}
        placeholder="Search by person, enterprise, item, role..."
        resultCount={processedRelationships.length}
        totalCount={tabFiltered.length}
      />

      <BulkActionBar
        selectedIds={selectedIds}
        onClear={() => setSelectedIds([])}
        onDeleteSelected={perms.l2_unassign ? handleBulkDelete : undefined}
        canDelete={perms.l2_unassign}
      />

      <SpreadsheetToolbar
        {...ss.toolbarProps}
        numericFields={[]}
        selectedIds={selectedIds}
        onSelectAll={() => setSelectedIds(ss.processedData.map((r) => r.id))}
        onClearSelect={() => setSelectedIds([])}
        onWriteBack={perms.l2_assign ? async (updates) => {
          for (const { id, field, value } of updates) {
            await base44.entities.Relationship.update(id, { [field]: value });
          }
          dataService.triggerEntityETL("relationship");
          qc.invalidateQueries({ queryKey: ["relationships"] });
          toast({ title: `${updates.length} record${updates.length !== 1 ? "s" : ""} updated` });
        } : undefined}
      />

      {viewMode === "graph" ? (
        <CytoscapeRelationshipGraph
          relationships={relationships}
          filterType={activeTab}
          tasks={tasks}
          transactions={transactions}
          people={people}
          enterprises={enterprises}
        />
      ) : (
        <DataTable
          {...ss.tableProps}
          onRowClick={(row) => setDetailRel(row)}
          onEdit={perms.l2_assign ? (row) => { setEditing(row); setFormType(row.relationship_type); setFormOpen(true); } : undefined}
          onDelete={perms.l2_unassign ? (row) => setDeleting(row) : undefined}
          bulkMode selectedIds={selectedIds} onSelectionChange={setSelectedIds}
          onCellEdit={perms.l2_assign ? async (id, field, value) => {
            await base44.entities.Relationship.update(id, { [field]: value });
            dataService.triggerEntityETL("relationship");
            qc.invalidateQueries({ queryKey: ["relationships"] });
          } : undefined}
        />
      )}


      {analyticsOpen && (
        <div className="fixed inset-0 z-50 bg-white overflow-y-auto">
          <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-white shadow-sm">
            <p className="font-bold text-slate-800">Relationships Analytics</p>
            <button onClick={() => setAnalyticsOpen(false)} className="p-2 rounded-lg hover:bg-slate-100 transition-colors">
              <X className="w-5 h-5 text-slate-500" />
            </button>
          </div>
          <div className="p-6">
            <RelationshipAnalytics relationships={relationships} currentUser={currentUser} standalone={true} />
          </div>
        </div>
      )}

      <RelationshipForm
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditing(null); setFormPrefill(null); }}
        onSubmit={handleSubmit}
        onEnd={() => { setEndTarget(editing); setFormOpen(false); }}
        initialData={editing || (formPrefill ? { relationship_type: formType, status: "active", start_date: new Date().toISOString().split("T")[0], ...formPrefill } : null)}
        type={formType} people={people} enterprises={enterprises} products={products} services={services} addresses={addresses}
      />

      <EndRelationshipDialog open={!!endTarget} onClose={() => setEndTarget(null)} onConfirm={handleEndDialog} />
      <RelationshipDetailPanel rel={detailRel} open={!!detailRel} onClose={() => setDetailRel(null)} />
      <DeleteDialog open={!!deleting} onClose={() => setDeleting(null)} onConfirm={() => deleteMut.mutate(deleting.id)} itemName="this assignment" />

      <DeleteAllDialog open={deleteAllOpen} onClose={() => setDeleteAllOpen(false)} onConfirm={handleDeleteAll} entityLabel="Relationships" count={relationships.length} />
      <BulkAssignDialog
        open={bulkAssignOpen}
        onClose={() => setBulkAssignOpen(false)}
        onAssign={handleBulkAssign}
        people={people} enterprises={enterprises} products={products} services={services} addresses={addresses}
        existingRelationships={relationships}
        currentUser={currentUser}
      />

      <BulkImportDialog
        open={importOpen} onClose={() => { setImportOpen(false); qc.invalidateQueries({ queryKey: ["relationships"] }); qc.refetchQueries({ queryKey: ["relationships"] }); }}
        entityName="Relationships" fields={RELATIONSHIP_FIELDS} mappingRules={RELATIONSHIP_MAPPING_RULES}
        templateFileName="newsconseen_relationships_import_template.xlsx"
        templateExample={RELATIONSHIP_TEMPLATE_EXAMPLE} templateInstructions={RELATIONSHIP_TEMPLATE_INSTRUCTIONS}
        entityFetchFn={() => listFn(base44.entities.Relationship)}
        validateRow={(row) => validateRelationship(row, { people, enterprises, products, services })}
        onImport={(row) => dataService.createRecord("relationship", row, currentUser, { queryClient: qc })}
        currentUser={currentUser} previewColumns={REL_PREVIEW_COLS} requiredField="relationship_type"
      />
    </div>
  );
}
