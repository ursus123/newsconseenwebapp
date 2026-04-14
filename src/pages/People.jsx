import React, { useState, useMemo, useEffect } from "react";
import { TYPE_ALIASES } from "@/utils/typeAliases";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import PageHeader from "../components/shared/PageHeader";
import DataTable from "../components/shared/DataTable";
import DeleteDialog from "../components/shared/DeleteDialog";
import PeopleForm from "../components/people/PeopleForm";
import PeopleToolbar from "../components/people/PeopleToolbar";
import PeopleGroupedView from "../components/people/PeopleGroupedView";
import { usePermissions } from "@/components/shared/usePermissions";
import { useEntityListFn, useWithScope } from "@/components/shared/useDataQuery";
import { Badge } from "@/components/ui/badge";
import { fuzzyFilter } from "@/components/shared/fuzzySearch";
import BulkImportDialog from "../components/shared/BulkImportDialog";
import SearchFilterBar from "../components/shared/SearchFilterBar";
import BulkActionBar from "../components/shared/BulkActionBar";
import { Upload, Users, CheckCircle, Clock, Heart, ShieldAlert, Search } from "lucide-react";
import { differenceInDays, parseISO, isValid } from "date-fns";
import { useTaxonomySync } from "@/hooks/useTaxonomySync";
import ETLSyncBanner from "@/components/shared/ETLSyncBanner";
import ExportCSVButton from "@/components/shared/ExportCSVButton";
import SpreadsheetToolbar from "@/components/shared/SpreadsheetToolbar";
import DeleteAllDialog from "@/components/shared/DeleteAllDialog";
import PeopleAnalytics from "@/components/people/PeopleAnalytics";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import {
  PEOPLE_FIELDS, PEOPLE_MAPPING_RULES, PEOPLE_TEMPLATE_EXAMPLE,
  PEOPLE_TEMPLATE_INSTRUCTIONS, validatePerson, transformPerson,
} from "@/components/shared/importConfigs";

const RAILWAY_URL = "https://newsconseenwebapp-production.up.railway.app";
const RAILWAY_API_KEY = import.meta.env.VITE_RAILWAY_API_KEY || "";
const triggerETL = (entity) =>
  fetch(`${RAILWAY_URL}/load/${entity}-summary`, {
    method: "POST",
    headers: { "x-api-key": RAILWAY_API_KEY },
  }).catch(() => {});

// Fire-and-forget workflow trigger — never blocks the UI
function triggerWorkflows(companyId, triggerType, entityData) {
  fetch(`${RAILWAY_URL}/workflows/trigger`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(RAILWAY_API_KEY ? { "x-api-key": RAILWAY_API_KEY } : {}) },
    body: JSON.stringify({ company_id: companyId, trigger_type: triggerType, entity_type: "person", entity_data: entityData }),
  }).catch(() => {});
}

// Fire-and-forget audit log — never blocks the UI
function logAudit(companyId, action, record, userEmail) {
  fetch(`${RAILWAY_URL}/audit/log`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(RAILWAY_API_KEY ? { "x-api-key": RAILWAY_API_KEY } : {}) },
    body: JSON.stringify({
      company_id:  companyId,
      entity_type: "person",
      entity_id:   record?.id,
      entity_name: [record?.first_name, record?.last_name].filter(Boolean).join(" ") || record?.id,
      action,
      changed_by:  userEmail,
    }),
  }).catch(() => {});
}

// ── Color helpers ──────────────────────────────────────────────────
const statusColor = (s) => ({
  active:   "bg-emerald-50 text-emerald-700",
  inactive: "bg-slate-100 text-slate-600",
  on_leave: "bg-amber-50 text-amber-700",
}[s] || "bg-slate-100 text-slate-600");

const availColor = (s) => ({
  available:   "bg-green-50 text-green-700",
  busy:        "bg-amber-50 text-amber-700",
  on_leave:    "bg-slate-100 text-slate-500",
  unavailable: "bg-rose-50 text-rose-700",
}[s] || "bg-slate-100 text-slate-600");

const personTypeColor = (t) => ({
  staff:     "bg-blue-50 text-blue-700",
  client:    "bg-rose-50 text-rose-700",
  contact:   "bg-purple-50 text-purple-700",
  volunteer: "bg-green-50 text-green-700",
}[t] || "bg-slate-100 text-slate-500");

// ── Profile completeness score (0–100) ────────────────────────────
const COMPLETENESS_FIELDS = [
  "first_name", "last_name", "person_type", "primary_role",
  "email", "phone", "engagement_model", "person_subtype",
];
function profileScore(row) {
  const filled = COMPLETENESS_FIELDS.filter(f => row[f] && String(row[f]).trim() !== "").length;
  return Math.round((filled / COMPLETENESS_FIELDS.length) * 100);
}
function ScoreRing({ score }) {
  const color = score >= 80 ? "text-emerald-500" : score >= 50 ? "text-amber-500" : "text-rose-500";
  const bg    = score >= 80 ? "bg-emerald-50"   : score >= 50 ? "bg-amber-50"   : "bg-rose-50";
  return (
    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${bg}`} title={`Profile ${score}% complete`}>
      <span className={`text-[10px] font-black ${color}`}>{score}</span>
    </div>
  );
}

// ── Table columns ──────────────────────────────────────────────────
const columns = [
  {
    key: "first_name", label: "Name",
    render: (val, row) => (
      <div className="flex items-start gap-2">
        <ScoreRing score={profileScore(row)} />
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-slate-800">
              {row.preferred_name || `${row.first_name || ""} ${row.last_name || ""}`.trim()}
            </span>
            <Badge className={personTypeColor(row.person_type)}>
              {row.person_type || "staff"}
            </Badge>
          </div>
          {row.email && (
            <p className="text-xs text-slate-400 mt-0.5">{row.email}</p>
          )}
          <div className="flex flex-wrap gap-1 mt-1">
            <CertExpiryBadge expiry={row.certification_expiry} />
          </div>
        </div>
      </div>
    ),
  },
  {
    key: "primary_role", label: "Role",
    render: (val, row) => (
      <div>
        <p className="text-sm text-slate-700">{val || "—"}</p>
        {row.role_category && (
          <p className="text-xs text-slate-400 capitalize">{row.role_category.replace(/_/g, " ")}</p>
        )}
      </div>
    ),
  },
  {
    key: "phone", label: "Contact",
    render: (val) => val
      ? <span className="text-sm text-slate-600">{val}</span>
      : <span className="text-slate-300">—</span>,
  },
  {
    key: "availability_status", label: "Availability",
    render: (val) => (
      <Badge className={availColor(val)}>{(val || "available").replace(/_/g, " ")}</Badge>
    ),
  },
  {
    key: "status", label: "Status",
    render: (val) => (
      <Badge className={statusColor(val)}>{(val || "active").replace(/_/g, " ")}</Badge>
    ),
  },
];

// ── Type tabs ──────────────────────────────────────────────────────
const TYPE_TABS = [
  { id: "all",       label: "All People" },
  { id: "staff",     label: "Staff" },
  { id: "client",    label: "Clients" },
  { id: "contact",   label: "Contacts" },
  { id: "volunteer", label: "Volunteers" },
];

// ── Preview cols for import ────────────────────────────────────────
const PEOPLE_PREVIEW_COLS = [
  { label: "First Name", render: (r) => r.first_name || <span className="text-rose-500">MISSING</span> },
  { label: "Last Name",  render: (r) => r.last_name || <span className="text-rose-500">MISSING</span> },
  { label: "Role",       render: (r) => r.primary_role || "—" },
  { label: "Type",       render: (r) => r.person_type || "—" },
  { label: "Email",      render: (r) => r.email || "—" },
];

// ── Certification expiry badge ────────────────────────────────────
function CertExpiryBadge({ expiry }) {
  if (!expiry) return null;
  let d;
  try { d = parseISO(expiry); } catch { return null; }
  if (!isValid(d)) return null;
  const days = differenceInDays(d, new Date());
  if (days < 0) return (
    <span className="flex items-center gap-1 text-[10px] font-bold bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded-full">
      <ShieldAlert className="w-2.5 h-2.5" /> Cert expired
    </span>
  );
  if (days <= 30) return (
    <span className="flex items-center gap-1 text-[10px] font-semibold bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded-full animate-pulse">
      <ShieldAlert className="w-2.5 h-2.5" /> Cert {days}d left
    </span>
  );
  if (days <= 90) return (
    <span className="flex items-center gap-1 text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-full">
      <ShieldAlert className="w-2.5 h-2.5" /> Cert {days}d left
    </span>
  );
  return null;
}

// ── Stat card ──────────────────────────────────────────────────────
function StatCard({ icon: Icon, iconClass, label, value }) {
  return (
    <div className="bg-white border border-slate-100 rounded-2xl px-4 py-3 flex items-center gap-3">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${iconClass}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div>
        <p className="text-xs text-slate-400">{label}</p>
        <p className="text-lg font-bold text-slate-800 leading-tight">{value}</p>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────
export default function People() {
  const [formOpen, setFormOpen]       = useState(false);
  const [importOpen, setImportOpen]   = useState(false);
  const [editing, setEditing]         = useState(null);
  const [deleting, setDeleting]       = useState(null);
  const [search, setSearch]           = useState("");
  const [groupBy, setGroupBy]         = useState("none");
  const [sortBy, setSortBy]           = useState("created_date_desc");
  const [filters, setFilters]         = useState({ status: "", availability_status: "", person_type: "", country: "", primary_role: "" });
  const [activeTypeTab, setActiveTypeTab] = useState("all");
  const [currentUser, setCurrentUser] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [deleteAllOpen, setDeleteAllOpen] = useState(false);
  const [heatmapOn, setHeatmapOn] = useState(false);
  const [skillsFilter, setSkillsFilter] = useState("");
  const qc = useQueryClient();
  const { syncState, notifyTaxonomyChange } = useTaxonomySync();
  const { toast } = useToast();

  useEffect(() => { base44.auth.me().then(setCurrentUser).catch(() => {}); }, []);

  useEffect(() => {
    const fn = () => { if (document.visibilityState === "visible") qc.refetchQueries({ queryKey: ["people"] }); };
    document.addEventListener("visibilitychange", fn);
    return () => document.removeEventListener("visibilitychange", fn);
  }, [qc]);

  const companyId  = currentUser?.company_id;
  const perms      = usePermissions(currentUser);
  const listFn     = useEntityListFn(currentUser);
  const withScope  = useWithScope(currentUser);
  const withCompany = withScope;

  const { data: people = [], isLoading } = useQuery({
    queryKey: ["people", companyId, currentUser?.email],
    queryFn: () => listFn(base44.entities.Person),
    enabled: currentUser !== null,
    staleTime: 0,
    refetchOnMount: "always",
  });

  const createMut = useMutation({
    mutationFn: (d) => base44.entities.Person.create(withCompany(d)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["people"] });
      qc.refetchQueries({ queryKey: ["people"] });
      qc.invalidateQueries({ queryKey: ["addresses"] });
      qc.invalidateQueries({ queryKey: ["relationships"] });
      triggerETL("people");
      notifyTaxonomyChange("person", currentUser?.company_id);
      logAudit(currentUser?.company_id, "created", editing, currentUser?.email);
      triggerWorkflows(currentUser?.company_id, "entity_created", editing);
      setFormOpen(false);
    },
  });
  const updateMut = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Person.update(id, withScope(data)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["people"] });
      qc.refetchQueries({ queryKey: ["people"] });
      triggerETL("people");
      notifyTaxonomyChange("person", currentUser?.company_id);
      logAudit(currentUser?.company_id, "updated", editing, currentUser?.email);
      triggerWorkflows(currentUser?.company_id, "entity_updated", editing);
      setFormOpen(false);
      setEditing(null);
    },
  });
  const deleteMut = useMutation({
    mutationFn: (id) => base44.entities.Person.delete(id),
    onSuccess: () => {
      logAudit(currentUser?.company_id, "deleted", deleting, currentUser?.email);
      qc.invalidateQueries({ queryKey: ["people"] });
      qc.refetchQueries({ queryKey: ["people"] });
      triggerETL("people");
      setDeleting(null);
    },
  });

  const handleBulkDelete = async () => {
    for (const id of selectedIds) await base44.entities.Person.delete(id);
    qc.invalidateQueries({ queryKey: ["people"] });
    qc.refetchQueries({ queryKey: ["people"] });
    triggerETL("people");
    toast({ title: `${selectedIds.length} people deleted` });
    setSelectedIds([]);
  };

  const handleDeleteAll = async () => {
    for (const p of people) { try { await base44.entities.Person.delete(p.id); } catch (e) { /* 404 = already gone */ } }
    qc.invalidateQueries({ queryKey: ["people"] });
    qc.refetchQueries({ queryKey: ["people"] });
    triggerETL("people");
    toast({ title: `All ${people.length} people deleted` });
  };

  // Type tab pre-filter with migration support

  const typeFiltered = activeTypeTab === "all"
    ? people
    : people.filter(p => (TYPE_ALIASES[activeTypeTab] || [activeTypeTab]).includes(p.person_type));

  const processedPeople = useMemo(() => {
    let list = [...typeFiltered];
    if (search) {
      list = fuzzyFilter(list, search, ["first_name", "last_name", "preferred_name", "primary_role", "city", "country", "address", "email", "phone"]);
    }
    if (filters.status) list = list.filter((p) => p.status === filters.status);
    if (filters.availability_status) list = list.filter((p) => (p.availability_status || "available") === filters.availability_status);
    if (filters.person_type) list = list.filter((p) => p.person_type === filters.person_type);
    if (filters.primary_role) list = list.filter((p) => p.primary_role === filters.primary_role);
    if (filters.country) list = list.filter((p) => (p.country || "").toLowerCase().includes(filters.country.toLowerCase()));
    if (skillsFilter) {
      const term = skillsFilter.toLowerCase();
      list = list.filter((p) => {
        const skills = (p.skills || "").toLowerCase();
        const certName = (p.certification_name || "").toLowerCase();
        const notes = (p.internal_notes || "").toLowerCase();
        return skills.includes(term) || certName.includes(term) || notes.includes(term);
      });
    }
    if (!search) list.sort((a, b) => {
      if (sortBy === "name_asc")         return `${a.first_name}${a.last_name}`.localeCompare(`${b.first_name}${b.last_name}`);
      if (sortBy === "name_desc")        return `${b.first_name}${b.last_name}`.localeCompare(`${a.first_name}${a.last_name}`);
      if (sortBy === "created_date_asc") return new Date(a.created_date) - new Date(b.created_date);
      return new Date(b.created_date) - new Date(a.created_date);
    });
    return list;
  }, [typeFiltered, search, sortBy, filters]);

  // Visible tabs (only where data exists)
  const visibleTabs = TYPE_TABS.filter(
    t => t.id === "all" || people.some(p => (TYPE_ALIASES[t.id] || [t.id]).includes(p.person_type))
  );

  const availableCount = people.filter(p => p.availability_status === "available" || !p.availability_status).length;

  return (
    <div className="space-y-5">
      {/* Header */}
      <PageHeader
        title="People"
        subtitle="Manage your team members, contractors and staff"
        onAdd={perms.l1_create ? () => { setEditing(null); setFormOpen(true); } : undefined}
        addLabel="Add Person"
      >
        {perms.l1_create && (
          <Button variant="outline" size="sm" className="rounded-xl" onClick={() => setImportOpen(true)}>
            <Upload className="w-4 h-4 mr-2" /> Import
          </Button>
        )}
        <ExportCSVButton
          data={processedPeople}
          fields={["first_name","last_name","preferred_name","person_type","primary_role","email","phone","status","availability_status","city","country","start_date"]}
          filename="people_export"
        />
        {perms.can_delete && people.length > 0 && (
          <Button variant="outline" size="sm" className="rounded-xl border-rose-200 text-rose-600 hover:bg-rose-50" onClick={() => setDeleteAllOpen(true)}>
            🗑️ Delete All
          </Button>
        )}
        <ETLSyncBanner syncState={syncState} entityType="person" />
      </PageHeader>

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={Users}        iconClass="bg-slate-100 text-slate-500"    label="Total People"    value={people.length} />
        <StatCard icon={CheckCircle}  iconClass="bg-emerald-50 text-emerald-600" label="Active"           value={people.filter(p => p.status === "active").length} />
        <StatCard icon={Clock}        iconClass="bg-blue-50 text-blue-600"       label="Available Now"    value={availableCount} />
        <StatCard icon={Heart}        iconClass="bg-rose-50 text-rose-600"       label="Clients"          value={people.filter(p => p.person_type === "client").length} />
      </div>

      {/* Type filter tabs */}
      {visibleTabs.length > 1 && (
        <div className="bg-slate-100 rounded-xl p-1 flex flex-wrap gap-1">
          {visibleTabs.map(tab => {
            const count = tab.id === "all" ? people.length : people.filter(p => (TYPE_ALIASES[tab.id] || [tab.id]).includes(p.person_type)).length;
            const isActive = activeTypeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTypeTab(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5
                  ${isActive ? "bg-white shadow-sm text-slate-800" : "text-slate-500 hover:text-slate-700"}`}
              >
                {tab.label}
                <span className={`text-[11px] px-1.5 py-0.5 rounded-full
                  ${isActive ? "bg-slate-100 text-slate-600" : "bg-slate-200 text-slate-500"}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Toolbar */}
      <PeopleToolbar search={search} setSearch={setSearch} groupBy={groupBy} setGroupBy={setGroupBy} sortBy={sortBy} setSortBy={setSortBy} filters={filters} setFilters={setFilters} />

      {/* Skills / certification quick-filter */}
      <div className="relative max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
        <input
          value={skillsFilter}
          onChange={(e) => setSkillsFilter(e.target.value)}
          placeholder="Filter by skill or certification…"
          className="w-full pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-slate-200"
        />
        {skillsFilter && (
          <button
            onClick={() => setSkillsFilter("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
          >✕</button>
        )}
      </div>

      <BulkActionBar
        selectedIds={selectedIds}
        onClear={() => setSelectedIds([])}
        onDeleteSelected={perms.can_delete ? handleBulkDelete : undefined}
        canDelete={perms.can_delete}
      />

      <SpreadsheetToolbar
        data={processedPeople}
        numericFields={[
          { key: "cost_rate", label: "Cost Rate" },
          { key: "height_cm", label: "Height (cm)" },
          { key: "weight_kg", label: "Weight (kg)" },
        ]}
        heatmapField="cost_rate"
        heatmapOn={heatmapOn}
        onHeatmapToggle={() => setHeatmapOn((h) => !h)}
        selectedIds={selectedIds}
        onSelectAll={() => setSelectedIds(processedPeople.map((r) => r.id))}
        onClearSelect={() => setSelectedIds([])}
      />

      {/* Empty state */}
      {!isLoading && people.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 border-2 border-dashed border-slate-100 rounded-2xl">
          <Users className="w-10 h-10 text-slate-200 mb-3" />
          <p className="text-slate-400 font-medium mb-1">No people yet</p>
          <p className="text-slate-300 text-sm mb-4">Add your staff, clients and contractors</p>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => { setEditing(null); setFormOpen(true); }} className="bg-emerald-600 hover:bg-emerald-700 rounded-xl">
              Add Person
            </Button>
            <Button size="sm" variant="outline" onClick={() => setImportOpen(true)} className="rounded-xl">
              Import from Excel
            </Button>
          </div>
        </div>
      ) : groupBy !== "none" ? (
        <PeopleGroupedView
          people={processedPeople}
          groupBy={groupBy}
          onEdit={perms.l1_edit ? (row) => { setEditing(row); setFormOpen(true); } : undefined}
          onDelete={perms.can_delete ? (row) => setDeleting(row) : undefined}
        />
      ) : (
        <DataTable
          columns={columns}
          data={processedPeople}
          onEdit={perms.l1_edit ? (row) => { setEditing(row); setFormOpen(true); } : undefined}
          onDelete={perms.can_delete ? (row) => setDeleting(row) : undefined}
          bulkMode selectedIds={selectedIds} onSelectionChange={setSelectedIds}
        />
      )}

      {/* Forms & dialogs */}
      <PeopleForm
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditing(null); }}
        onSubmit={(d) => {
          if (editing) {
            updateMut.mutate({ id: editing.id, data: d });
          } else {
            createMut.mutate(d);
          }
        }}
        initialData={editing}
        currentUser={currentUser}
      />
      <DeleteDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleteMut.mutate(deleting.id)}
        itemName={deleting ? `${deleting.first_name} ${deleting.last_name}` : ""}
      />
      <DeleteAllDialog
        open={deleteAllOpen}
        onClose={() => setDeleteAllOpen(false)}
        onConfirm={handleDeleteAll}
        entityLabel="People"
        count={people.length}
      />
      <BulkImportDialog
        open={importOpen}
        onClose={() => { setImportOpen(false); qc.invalidateQueries({ queryKey: ["people"] }); qc.refetchQueries({ queryKey: ["people"] }); }}
        entityName="People"
        fields={PEOPLE_FIELDS}
        mappingRules={PEOPLE_MAPPING_RULES}
        templateFileName="newsconseen_people_import_template.xlsx"
        templateExample={PEOPLE_TEMPLATE_EXAMPLE}
        templateInstructions={PEOPLE_TEMPLATE_INSTRUCTIONS}
        entityFetchFn={() => listFn(base44.entities.Person)}
        validateRow={validatePerson}
        transformRow={transformPerson}
        onImport={(row) => base44.entities.Person.create(withScope(row))}
        currentUser={currentUser}
        previewColumns={PEOPLE_PREVIEW_COLS}
        requiredField="first_name"
      />
      <PeopleAnalytics people={people} currentUser={currentUser} />
    </div>
  );
}