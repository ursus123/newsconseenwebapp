import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import PageHeader from "../components/shared/PageHeader";
import DataTable from "../components/shared/DataTable";
import DeleteDialog from "../components/shared/DeleteDialog";
import ServiceForm from "../components/services/ServiceForm";
import { Badge } from "@/components/ui/badge";
import { useEntityListFn, useWithScope } from "@/components/shared/useDataQuery";
import BulkImportDialog from "../components/shared/BulkImportDialog";
import { Button } from "@/components/ui/button";
import { Upload } from "lucide-react";
import {
  SERVICE_FIELDS, SERVICE_MAPPING_RULES, SERVICE_TEMPLATE_EXAMPLE,
  SERVICE_TEMPLATE_INSTRUCTIONS, validateService, transformService,
} from "@/components/shared/importConfigs";

const statusColor = (s) => ({
  active: "bg-emerald-50 text-emerald-700",
  inactive: "bg-amber-50 text-amber-700",
  archived: "bg-slate-100 text-slate-400",
}[s] || "bg-slate-100 text-slate-600");

const columns = [
  { key: "name", label: "Service", render: (val, row) => (
    <div>
      <p className="font-medium text-slate-800">{val}</p>
      {row.short_code && <p className="text-xs text-slate-400">{row.short_code}</p>}
    </div>
  )},
  { key: "category", label: "Category", render: (val) => val ? <Badge className="bg-cyan-50 text-cyan-700">{val.replace(/_/g, " ")}</Badge> : "—" },
  { key: "pricing_model", label: "Pricing", render: (val) => val ? <Badge className="bg-slate-100 text-slate-600">{val.replace(/_/g, " ")}</Badge> : "—" },
  { key: "price", label: "Price", render: (v) => v != null ? `$${parseFloat(v).toLocaleString()}` : "—" },
  { key: "status", label: "Status", render: (val) => <Badge className={statusColor(val)}>{val || "active"}</Badge> },
];

const SVC_PREVIEW_COLS = [
  { label: "Name", render: (r) => r.name || <span className="text-rose-500">MISSING</span> },
  { label: "Category", render: (r) => r.category || "—" },
  { label: "Type", render: (r) => r.service_type || "—" },
  { label: "Price", render: (r) => r.price ? `$${r.price}` : "—" },
  { label: "Status", render: (r) => r.status || "active" },
];

export default function Services() {
  const [formOpen, setFormOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const qc = useQueryClient();

  useEffect(() => { base44.auth.me().then(setCurrentUser).catch(() => {}); }, []);

  const listFn = useEntityListFn(currentUser);
  const withScope = useWithScope(currentUser);

  const { data: services = [] } = useQuery({
    queryKey: ["services", currentUser?.company_id, currentUser?.email],
    queryFn: () => listFn(base44.entities.Service),
    enabled: currentUser !== null,
  });

  const createMut = useMutation({ mutationFn: (d) => base44.entities.Service.create(withScope(d)), onSuccess: () => { qc.invalidateQueries({ queryKey: ["services"] }); setFormOpen(false); } });
  const updateMut = useMutation({ mutationFn: ({ id, data }) => base44.entities.Service.update(id, data), onSuccess: () => { qc.invalidateQueries({ queryKey: ["services"] }); setFormOpen(false); setEditing(null); } });
  const deleteMut = useMutation({ mutationFn: (id) => base44.entities.Service.delete(id), onSuccess: () => { qc.invalidateQueries({ queryKey: ["services"] }); setDeleting(null); } });

  const handleSubmit = (data, saveAndNew = false) => {
    if (editing) {
      updateMut.mutate({ id: editing.id, data });
    } else {
      createMut.mutate(data);
      if (saveAndNew) { setEditing(null); setFormOpen(true); }
    }
  };

  const handleArchive = (item) => {
    updateMut.mutate({ id: item.id, data: { ...item, status: "archived" } });
    setFormOpen(false);
    setEditing(null);
  };

  return (
    <div>
      <PageHeader title="Services" subtitle="Define reusable service offerings and pricing" onAdd={() => { setEditing(null); setFormOpen(true); }} addLabel="New Service" />
      <DataTable columns={columns} data={services} searchField="name" onEdit={(row) => { setEditing(row); setFormOpen(true); }} onDelete={(row) => setDeleting(row)} />
      <ServiceForm
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditing(null); }}
        onSubmit={handleSubmit}
        onArchive={handleArchive}
        initialData={editing}
      />
      <DeleteDialog open={!!deleting} onClose={() => setDeleting(null)} onConfirm={() => deleteMut.mutate(deleting.id)} itemName={deleting?.name} />
    </div>
  );
}