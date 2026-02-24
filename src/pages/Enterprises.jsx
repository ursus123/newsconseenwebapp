import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import PageHeader from "../components/shared/PageHeader";
import DataTable from "../components/shared/DataTable";
import DeleteDialog from "../components/shared/DeleteDialog";
import EnterpriseForm from "../components/enterprise/EnterpriseForm";
import { Badge } from "@/components/ui/badge";

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

export default function Enterprises() {
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const qc = useQueryClient();

  useEffect(() => { base44.auth.me().then(setCurrentUser).catch(() => {}); }, []);

  const isSuperAdmin = currentUser?.role === "super_admin";
  const companyId = currentUser?.company_id;

  const { data: enterprises = [] } = useQuery({
    queryKey: ["enterprises", companyId],
    queryFn: () => isSuperAdmin || !companyId ? base44.entities.Enterprise.list("-created_date") : base44.entities.Enterprise.filter({ company_id: companyId }, "-created_date"),
    enabled: currentUser !== null,
  });

  const withCompany = (d) => companyId && !isSuperAdmin ? { ...d, company_id: companyId } : d;

  const createMut = useMutation({ mutationFn: (d) => base44.entities.Enterprise.create(withCompany(d)), onSuccess: () => { qc.invalidateQueries({ queryKey: ["enterprises"] }); setFormOpen(false); } });
  const updateMut = useMutation({ mutationFn: ({ id, data }) => base44.entities.Enterprise.update(id, data), onSuccess: () => { qc.invalidateQueries({ queryKey: ["enterprises"] }); setFormOpen(false); setEditing(null); } });
  const deleteMut = useMutation({ mutationFn: (id) => base44.entities.Enterprise.delete(id), onSuccess: () => { qc.invalidateQueries({ queryKey: ["enterprises"] }); setDeleting(null); } });

  const handleArchive = (enterprise) => {
    updateMut.mutate({ id: enterprise.id, data: { ...enterprise, status: "archived" } });
    setFormOpen(false);
    setEditing(null);
  };

  return (
    <div>
      <PageHeader title="Enterprises" subtitle="Manage business entities and enterprise records" onAdd={() => { setEditing(null); setFormOpen(true); }} addLabel="New Enterprise" />
      <DataTable
        columns={columns}
        data={enterprises}
        searchField="enterprise_name"
        onEdit={(row) => { setEditing(row); setFormOpen(true); }}
        onDelete={(row) => setDeleting(row)}
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
    </div>
  );
}