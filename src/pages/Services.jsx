import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import PageHeader from "../components/shared/PageHeader";
import DataTable from "../components/shared/DataTable";
import EntityForm from "../components/shared/EntityForm";
import DeleteDialog from "../components/shared/DeleteDialog";
import { Badge } from "@/components/ui/badge";

const categories = [
  { value: "consulting", label: "Consulting" }, { value: "maintenance", label: "Maintenance" },
  { value: "installation", label: "Installation" }, { value: "delivery", label: "Delivery" },
  { value: "cleaning", label: "Cleaning" }, { value: "training", label: "Training" },
  { value: "design", label: "Design" }, { value: "accounting", label: "Accounting" },
  { value: "legal", label: "Legal" }, { value: "marketing", label: "Marketing" },
  { value: "it_support", label: "IT Support" }, { value: "other", label: "Other" },
];

const pricingTypes = [
  { value: "fixed", label: "Fixed" }, { value: "hourly", label: "Hourly" },
  { value: "daily", label: "Daily" }, { value: "monthly", label: "Monthly" },
  { value: "per_project", label: "Per Project" },
];

const formFields = [
  { key: "name", label: "Service Name", required: true },
  { key: "category", label: "Category", type: "select", options: categories },
  { key: "price", label: "Price ($)", type: "number", required: true },
  { key: "pricing_type", label: "Pricing Type", type: "select", default: "fixed", options: pricingTypes },
  { key: "duration_hours", label: "Duration (hours)", type: "number" },
  { key: "status", label: "Status", type: "select", default: "active", options: [
    { value: "active", label: "Active" }, { value: "inactive", label: "Inactive" },
  ]},
  { key: "description", label: "Description", type: "textarea" },
];

const columns = [
  { key: "name", label: "Service" },
  { key: "category", label: "Category", badge: true, badgeColor: () => "bg-cyan-50 text-cyan-700" },
  { key: "price", label: "Price", render: (v) => v ? `$${v.toLocaleString()}` : "—" },
  { key: "pricing_type", label: "Pricing", badge: true, badgeColor: () => "bg-slate-100 text-slate-600" },
  { key: "status", label: "Status", render: (val) => <Badge className={val === "active" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}>{val || "active"}</Badge> },
];

export default function Services() {
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const qc = useQueryClient();

  const { data: services = [] } = useQuery({ queryKey: ["services"], queryFn: () => base44.entities.Service.list("-created_date") });

  const createMut = useMutation({ mutationFn: (d) => base44.entities.Service.create(d), onSuccess: () => { qc.invalidateQueries({ queryKey: ["services"] }); setFormOpen(false); } });
  const updateMut = useMutation({ mutationFn: ({ id, data }) => base44.entities.Service.update(id, data), onSuccess: () => { qc.invalidateQueries({ queryKey: ["services"] }); setFormOpen(false); setEditing(null); } });
  const deleteMut = useMutation({ mutationFn: (id) => base44.entities.Service.delete(id), onSuccess: () => { qc.invalidateQueries({ queryKey: ["services"] }); setDeleting(null); } });

  return (
    <div>
      <PageHeader title="Services" subtitle="Manage your service offerings" onAdd={() => { setEditing(null); setFormOpen(true); }} addLabel="Add Service" />
      <DataTable columns={columns} data={services} searchField="name" onEdit={(row) => { setEditing(row); setFormOpen(true); }} onDelete={(row) => setDeleting(row)} />
      <EntityForm open={formOpen} onClose={() => { setFormOpen(false); setEditing(null); }} onSubmit={(d) => editing ? updateMut.mutate({ id: editing.id, data: d }) : createMut.mutate(d)} fields={formFields} initialData={editing} title={editing ? "Edit Service" : "Add Service"} />
      <DeleteDialog open={!!deleting} onClose={() => setDeleting(null)} onConfirm={() => deleteMut.mutate(deleting.id)} itemName={deleting?.name} />
    </div>
  );
}