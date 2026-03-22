import React, { useState, useMemo, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import PageHeader from "../components/shared/PageHeader";
import DataTable from "../components/shared/DataTable";
import DeleteDialog from "../components/shared/DeleteDialog";
import EnterpriseForm from "../components/enterprise/EnterpriseForm";
import EnterpriseToolbar from "../components/enterprise/EnterpriseToolbar";
import { usePermissions } from "@/components/shared/usePermissions";
import { useEntityListFn, useWithScope } from "@/components/shared/useDataQuery";
import { Badge } from "@/components/ui/badge";
import { fuzzyFilter } from "@/components/shared/fuzzySearch";
import BulkImportDialog from "../components/shared/BulkImportDialog";
import { Button } from "@/components/ui/button";
import { Upload, Building2, CheckCircle, Clock, Globe } from "lucide-react";
import SubEnterprisesPanel from "@/components/enterprise/SubEnterprisesPanel";
import { useTerminology } from "@/hooks/useTerminology";
import {
  ENTERPRISE_FIELDS, ENTERPRISE_MAPPING_RULES, ENTERPRISE_TEMPLATE_EXAMPLE,
  ENTERPRISE_TEMPLATE_INSTRUCTIONS, validateEnterprise, transformEnterprise,
} from "@/components/shared/importConfigs";

// ── Status colors ──────────────────────────────────────────────────
const statusColor = (s) => ({
  active:   "bg-emerald-50 text-emerald-700",
  inactive: "bg-slate-100 text-slate-600",
  prospect: "bg-blue-50 text-blue-700",
  archived: "bg-slate-100 text-slate-400",
}[s] || "bg-slate-100 text-slate-600");

// ── Industry / type colors ─────────────────────────────────────────
const typeColor = (type) => ({
  healthcare:      "bg-blue-50 text-blue-700",
  education:       "bg-emerald-50 text-emerald-700",
  social_services: "bg-violet-50 text-violet-700",
  retail:          "bg-amber-50 text-amber-700",
  consulting:      "bg-cyan-50 text-cyan-700",
  logistics:       "bg-orange-50 text-orange-700",
  manufacturing:   "bg-slate-100 text-slate-600",
  food_beverage:   "bg-rose-50 text-rose-700",
  professional:    "bg-indigo-50 text-indigo-700",
  other:           "bg-slate-100 text-slate-500",
}[type] || "bg-purple-50 text-purple-700");

// ── Table columns ──────────────────────────────────────────────────
const columns = [
  {
    key: "enterprise_name", label: "Enterprise",
    render: (val, row) => (
      <div>
        <p className="font-medium text-slate-800">{val}</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          {row.short_name && (
            <span className="text-[10px] font-mono text-slate-400">{row.short_name}</span>
          )}
          {(row.city || row.country) && (
            <span className="text-[10px] text-slate-400">
              · {[row.city, row.country].filter(Boolean).join(", ")}
            </span>
          )}
        </div>
      </div>
    ),
  },
  {
    key: "enterprise_type", label: "Type",
    render: (val) => val
      ? <Badge className={typeColor(val)}>{val.replace(/_/g, " ")}</Badge>
      : "—",
  },
  {
    key: "phone", label: "Contact",
    render: (val, row) => (
      <div className="space-y-0.5">
        {row.phone && <p className="text-xs text-slate-600">{row.phone}</p>}
        {row.email && <p className="text-xs text-slate-400">{row.email}</p>}
        {!row.phone && !row.email && <span className="text-slate-300">—</span>}
      </div>
    ),
  },
  {
    key: "operating_status", label: "Operating",
    render: (val) => (
      <Badge className={val === "open" ? "bg-green-50 text-green-700" : val === "closed" ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-700"}>
        {(val || "open").replace(/_/g, " ")}
      </Badge>
    ),
  },
  {
    key: "status", label: "Status",
    render: (val) => (
      <Badge className={statusColor(val)}>{(val || "active").replace(/_/g, " ")}</Badge>
    ),
  },
];

const ENT_PREVIEW_COLS = [
  { label: "Enterprise Name", render: (r) => r.enterprise_name || <span className="text-rose-500">MISSING</span> },
  { label: "Type",   render: (r) => r.enterprise_type || "—" },
  { label: "City",   render: (r) => r.city || "—" },
  { label: "Email",  render: (r) => r.email || "—" },
  { label: "Status", render: (r) => r.status || "active" },
];

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
export default function Enterprises() {
  const [formOpen, setFormOpen]     = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing]       = useState(null);
  const [deleting, setDeleting]     = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [search, setSearch]         = useState("");
  const [sortBy, setSortBy]         = useState("created_date_desc");
  const [filters, setFilters]       = useState({ status: "", enterprise_type: "", operating_status: "", country: "" });
  const qc = useQueryClient();

  useEffect(() => { base44.auth.me().then(setCurrentUser).catch(() => {}); }, []);

  const companyId  = currentUser?.company_id;
  const { t } = useTerminology(currentUser);
  const perms      = usePermissions(currentUser);
  const listFn     = useEntityListFn(currentUser);
  const withScope  = useWithScope(currentUser);
  const withCompany = withScope;

  const { data: enterprises = [], isLoading } = useQuery({
    queryKey: ["enterprises", companyId, currentUser?.email],
    queryFn: () => listFn(base44.entities.Enterprise),
    enabled: currentUser !== null,
  });

  const createMut = useMutation({
    mutationFn: async (data) => {
      const { company_id: _, ...cleanData } = data;
      const created = await base44.entities.Enterprise.create({
        ...cleanData,
        created_by: currentUser?.email,
      });
      const workspaceId = created.id;
      await base44.entities.Enterprise.update(created.id, { company_id: workspaceId });
      if (!currentUser?.company_id) {
        await base44.auth.updateMe({ company_id: workspaceId });
        setTimeout(() => window.location.reload(), 500);
      }
      return { ...created, company_id: workspaceId };
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["enterprises"] }); setFormOpen(false); },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Enterprise.update(id, withScope(data)),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["enterprises"] }); setFormOpen(false); setEditing(null); },
  });

  const deleteMut = useMutation({
    mutationFn: (id) => base44.entities.Enterprise.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["enterprises"] }); setDeleting(null); },
  });

  const processedEnterprises = useMemo(() => {
    let list = [...enterprises];
    if (search) {
      list = fuzzyFilter(list, search, ["enterprise_name", "short_name", "city", "country", "region", "email", "phone"]);
    }
    if (filters.status) list = list.filter((e) => e.status === filters.status);
    if (filters.enterprise_type) list = list.filter((e) => e.enterprise_type === filters.enterprise_type);
    if (filters.operating_status) list = list.filter((e) => (e.operating_status || "open") === filters.operating_status);
    if (filters.country) list = list.filter((e) => (e.country || "").toLowerCase().includes(filters.country.toLowerCase()));
    if (!search) list.sort((a, b) => {
      if (sortBy === "name_asc")          return (a.enterprise_name || "").localeCompare(b.enterprise_name || "");
      if (sortBy === "name_desc")         return (b.enterprise_name || "").localeCompare(a.enterprise_name || "");
      if (sortBy === "created_date_asc")  return new Date(a.created_date) - new Date(b.created_date);
      return new Date(b.created_date) - new Date(a.created_date);
    });
    return list;
  }, [enterprises, search, sortBy, filters]);

  const handleArchive = (enterprise) => {
    updateMut.mutate({ id: enterprise.id, data: { ...enterprise, status: "archived" } });
    setFormOpen(false);
    setEditing(null);
  };

  // ── Stat values ────────────────────────────────────────────────
  const countryCount = new Set(enterprises.map(e => e.country).filter(Boolean)).size;
  const openCount    = enterprises.filter(e => e.operating_status === "open" || !e.operating_status).length;

  return (
    <div className="space-y-5">
      {/* Header */}
      <PageHeader
        title="Enterprises"
        subtitle="Manage business entities and enterprise records"
        onAdd={perms.can_create ? () => { setEditing(null); setFormOpen(true); } : undefined}
        addLabel="New Enterprise"
      >
        {perms.can_create && (
          <Button variant="outline" size="sm" className="rounded-xl" onClick={() => setImportOpen(true)}>
            <Upload className="w-4 h-4 mr-2" /> Import
          </Button>
        )}
      </PageHeader>

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={Building2}    iconClass="bg-slate-100 text-slate-500"    label="Total Enterprises" value={enterprises.length} />
        <StatCard icon={CheckCircle}  iconClass="bg-emerald-50 text-emerald-600" label="Active"             value={enterprises.filter(e => e.status === "active").length} />
        <StatCard icon={Clock}        iconClass="bg-blue-50 text-blue-600"       label="Open Now"           value={openCount} />
        <StatCard icon={Globe}        iconClass="bg-purple-50 text-purple-600"   label="Countries"          value={countryCount} />
      </div>

      {/* Hierarchy panel — show for the primary (parent) enterprise */}
      {enterprises.length > 0 && enterprises.some(e => e.id === companyId) && (
        <SubEnterprisesPanel
          enterprise={enterprises.find(e => e.id === companyId) || enterprises[0]}
          currentUser={currentUser}
          onAddChild={perms.can_create ? () => {
            setEditing({ parent_enterprise_id: companyId, company_id: companyId });
            setFormOpen(true);
          } : undefined}
        />
      )}

      {/* Toolbar */}
      <EnterpriseToolbar search={search} setSearch={setSearch} filters={filters} setFilters={setFilters} sortBy={sortBy} setSortBy={setSortBy} />

      {/* Empty state */}
      {!isLoading && enterprises.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 border-2 border-dashed border-slate-100 rounded-2xl">
          <Building2 className="w-10 h-10 text-slate-200 mb-3" />
          <p className="text-slate-400 font-medium mb-1">No enterprises yet</p>
          <p className="text-slate-300 text-sm mb-4">Add your first enterprise to start managing operations</p>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => { setEditing(null); setFormOpen(true); }} className="bg-emerald-600 hover:bg-emerald-700 rounded-xl">
              Add Enterprise
            </Button>
            <Button size="sm" variant="outline" onClick={() => setImportOpen(true)} className="rounded-xl">
              Import from Excel
            </Button>
          </div>
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={processedEnterprises}
          onEdit={perms.can_edit ? (row) => { setEditing(row); setFormOpen(true); } : undefined}
          onDelete={perms.can_delete ? (row) => setDeleting(row) : undefined}
        />
      )}

      {/* Forms & dialogs */}
      <EnterpriseForm
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditing(null); }}
        onSubmit={(d) => editing ? updateMut.mutate({ id: editing.id, data: d }) : createMut.mutate(d)}
        onArchive={handleArchive}
        initialData={editing}
      />
      <DeleteDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleteMut.mutate(deleting.id)}
        itemName={deleting?.enterprise_name}
      />
      <BulkImportDialog
        open={importOpen}
        onClose={() => { setImportOpen(false); qc.invalidateQueries({ queryKey: ["enterprises"] }); }}
        entityName="Enterprises"
        fields={ENTERPRISE_FIELDS}
        mappingRules={ENTERPRISE_MAPPING_RULES}
        templateFileName="newsconseen_enterprises_import_template.xlsx"
        templateExample={ENTERPRISE_TEMPLATE_EXAMPLE}
        templateInstructions={ENTERPRISE_TEMPLATE_INSTRUCTIONS}
        validateRow={validateEnterprise}
        transformRow={transformEnterprise}
        onImport={async (row) => {
          const { company_id: _, ...cleanRow } = row;
          const created = await base44.entities.Enterprise.create({
            ...cleanRow,
            created_by: currentUser?.email,
            company_id: currentUser?.company_id || undefined,
          });
          if (!created.company_id && currentUser?.company_id) {
            await base44.entities.Enterprise.update(created.id, { company_id: currentUser.company_id });
          }
          return created;
        }}
        currentUser={currentUser}
        previewColumns={ENT_PREVIEW_COLS}
        requiredField="enterprise_name"
      />
    </div>
  );
}