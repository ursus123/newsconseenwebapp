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
import { Upload } from "lucide-react";
import {
  ENTERPRISE_FIELDS, ENTERPRISE_MAPPING_RULES, ENTERPRISE_TEMPLATE_EXAMPLE,
  ENTERPRISE_TEMPLATE_INSTRUCTIONS, validateEnterprise, transformEnterprise,
} from "@/components/shared/importConfigs";

const statusColor = (s) => {
  const map = { active: "bg-emerald-50 text-emerald-700", inactive: "bg-slate-100 text-slate-600", prospect: "bg-blue-50 text-blue-700", archived: "bg-slate-100 text-slate-400" };
  return map[s] || "bg-slate-100 text-slate-600";
};

const typeColor = () => "bg-purple-50 text-purple-700";

const columns = [
  { key: "enterprise_name", label: "Enterprise", render: (val, row) => (
    <div>
      <p className="font-medium text-slate-800">{val}</p>
      {row.short_name && <p className="text-xs text-slate-400">{row.short_name}</p>}
    </div>
  )},
  { key: "enterprise_type", label: "Type", render: (val) => val ? <Badge className={typeColor()}>{val.replace(/_/g, " ")}</Badge> : "—" },
  { key: "city", label: "City" },
  { key: "phone", label: "Phone" },
  { key: "operating_status", label: "Operating", render: (val) => (
    <Badge className={val === "open" ? "bg-green-50 text-green-700" : val === "closed" ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-700"}>
      {(val || "open").replace(/_/g, " ")}
    </Badge>
  )},
  { key: "status", label: "Status", render: (val) => (
    <Badge className={statusColor(val)}>{(val || "active").replace(/_/g, " ")}</Badge>
  )},
];

const ENT_PREVIEW_COLS = [
  { label: "Enterprise Name", render: (r) => r.enterprise_name || <span className="text-rose-500">MISSING</span> },
  { label: "Type", render: (r) => r.enterprise_type || "—" },
  { label: "City", render: (r) => r.city || "—" },
  { label: "Email", render: (r) => r.email || "—" },
  { label: "Status", render: (r) => r.status || "active" },
];

export default function Enterprises() {
  const [formOpen, setFormOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("created_date_desc");
  const [filters, setFilters] = useState({ status: "", enterprise_type: "", operating_status: "", country: "" });
  const qc = useQueryClient();

  useEffect(() => { base44.auth.me().then(setCurrentUser).catch(() => {}); }, []);

  useEffect(() => {
    const debug = async () => {
      const user = await base44.auth.me()
      console.log("=== DEBUG ===")
      console.log("User:", JSON.stringify(user))
      console.log("company_id:", user.company_id)
      
      const allEnterprises = await base44.entities.Enterprise.list()
      console.log("All enterprises (unfiltered):", allEnterprises.length)
      console.log("Enterprise data:", JSON.stringify(allEnterprises))
      
      if (user.company_id) {
        const filtered = await base44.entities.Enterprise.filter({
          company_id: user.company_id
        })
        console.log("Filtered by company_id:", filtered.length)
      } else {
        console.log("WARNING: user has no company_id")
      }
    }
    debug()
  }, [])

  // One-time fix for BrightStar Care LLC
  useEffect(() => {
    const fixed = localStorage.getItem("bs_fix_done");
    if (fixed) return;
    
    base44.entities.Enterprise.update(
      "69bc8553af5d08936d75e94f",
      { company_id: "69bc8553af5d08936d75e94f" }
    ).then(() => {
      localStorage.setItem("bs_fix_done", "true");
      qc.invalidateQueries({ queryKey: ["enterprises"] });
    }).catch(() => {});
  }, []);

  const isSuperAdmin = currentUser?.role === "super_admin";
  const companyId = currentUser?.company_id;
  const perms = usePermissions(currentUser);
  const listFn = useEntityListFn(currentUser);
  const withScope = useWithScope(currentUser);

  const { data: enterprises = [] } = useQuery({
    queryKey: ["enterprises", companyId, currentUser?.email],
    queryFn: () => listFn(base44.entities.Enterprise),
    enabled: currentUser !== null,
  });

  const withCompany = withScope;

  const createMut = useMutation({
    mutationFn: async (data) => {
      // Strip company_id — we set it explicitly after creation
      const { company_id: _, ...cleanData } = data;

      const created = await base44.entities.Enterprise.create({
        ...cleanData,
        created_by: currentUser?.email,
      });

      // The enterprise's own id IS the workspace root (company_id)
      const workspaceId = created.id;

      await base44.entities.Enterprise.update(created.id, { company_id: workspaceId });

      // If user has no company_id yet, assign them to this new workspace
      if (!currentUser?.company_id) {
        await base44.auth.updateMe({ company_id: workspaceId });
        setTimeout(() => window.location.reload(), 500);
      }

      return { ...created, company_id: workspaceId };
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["enterprises"] }); setFormOpen(false); }
  });
  const updateMut = useMutation({ mutationFn: ({ id, data }) => base44.entities.Enterprise.update(id, data), onSuccess: () => { qc.invalidateQueries({ queryKey: ["enterprises"] }); setFormOpen(false); setEditing(null); } });
  const deleteMut = useMutation({ mutationFn: (id) => base44.entities.Enterprise.delete(id), onSuccess: () => { qc.invalidateQueries({ queryKey: ["enterprises"] }); setDeleting(null); } });

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
      if (sortBy === "name_asc") return (a.enterprise_name || "").localeCompare(b.enterprise_name || "");
      if (sortBy === "name_desc") return (b.enterprise_name || "").localeCompare(a.enterprise_name || "");
      if (sortBy === "created_date_asc") return new Date(a.created_date) - new Date(b.created_date);
      return new Date(b.created_date) - new Date(a.created_date);
    });

    return list;
  }, [enterprises, search, sortBy, filters]);

  const handleArchive = (enterprise) => {
    updateMut.mutate({ id: enterprise.id, data: { ...enterprise, status: "archived" } });
    setFormOpen(false);
    setEditing(null);
  };

  return (
    <div>
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
      <EnterpriseToolbar search={search} setSearch={setSearch} filters={filters} setFilters={setFilters} sortBy={sortBy} setSortBy={setSortBy} />
      <DataTable
        columns={columns}
        data={processedEnterprises}
        onEdit={perms.can_edit ? (row) => { setEditing(row); setFormOpen(true); } : undefined}
        onDelete={perms.can_delete ? (row) => setDeleting(row) : undefined}
      />
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
        onImport={(row) => base44.entities.Enterprise.create(withScope(row))}
        currentUser={currentUser}
        previewColumns={ENT_PREVIEW_COLS}
        requiredField="enterprise_name"
      />
    </div>
  );
}