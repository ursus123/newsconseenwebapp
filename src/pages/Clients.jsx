import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import PageHeader from "../components/shared/PageHeader";
import DataTable from "../components/shared/DataTable";
import EntityForm from "../components/shared/EntityForm";
import DeleteDialog from "../components/shared/DeleteDialog";
import { Badge } from "@/components/ui/badge";

const statusColor = (s) => {
  const map = { active: "bg-emerald-50 text-emerald-700", inactive: "bg-slate-100 text-slate-600", prospect: "bg-blue-50 text-blue-700", churned: "bg-rose-50 text-rose-700" };
  return map[s] || "bg-slate-100 text-slate-600";
};

const industries = [
  { value: "retail", label: "Retail" }, { value: "food_beverage", label: "Food & Beverage" },
  { value: "healthcare", label: "Healthcare" }, { value: "technology", label: "Technology" },
  { value: "construction", label: "Construction" }, { value: "education", label: "Education" },
  { value: "finance", label: "Finance" }, { value: "manufacturing", label: "Manufacturing" },
  { value: "logistics", label: "Logistics" }, { value: "hospitality", label: "Hospitality" },
  { value: "other", label: "Other" },
];

const formFields = [
  { key: "business_name", label: "Business Name", required: true },
  { key: "contact_person", label: "Contact Person" },
  { key: "email", label: "Email", type: "email" },
  { key: "phone", label: "Phone" },
  { key: "address", label: "Address" },
  { key: "industry", label: "Industry", type: "select", options: industries },
  { key: "status", label: "Status", type: "select", default: "active", options: [
    { value: "active", label: "Active" }, { value: "inactive", label: "Inactive" },
    { value: "prospect", label: "Prospect" }, { value: "churned", label: "Churned" },
  ]},
  { key: "monthly_revenue", label: "Monthly Revenue ($)", type: "number" },
  { key: "start_date", label: "Start Date", type: "date" },
  { key: "notes", label: "Notes", type: "textarea" },
];

const columns = [
  { key: "business_name", label: "Business" },
  { key: "contact_person", label: "Contact" },
  { key: "industry", label: "Industry", badge: true, badgeColor: () => "bg-purple-50 text-purple-700" },
  { key: "phone", label: "Phone" },
  { key: "monthly_revenue", label: "Revenue", render: (v) => v ? `$${v.toLocaleString()}` : "—" },
  { key: "status", label: "Status", render: (val) => <Badge className={statusColor(val)}>{(val || "active").replace(/_/g, " ")}</Badge> },
];

export default function Clients() {
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const qc = useQueryClient();

  const { data: clients = [] } = useQuery({ queryKey: ["clients"], queryFn: () => base44.entities.Client.list("-created_date") });

  const createMut = useMutation({ mutationFn: (d) => base44.entities.Client.create(d), onSuccess: () => { qc.invalidateQueries({ queryKey: ["clients"] }); setFormOpen(false); } });
  const updateMut = useMutation({ mutationFn: ({ id, data }) => base44.entities.Client.update(id, data), onSuccess: () => { qc.invalidateQueries({ queryKey: ["clients"] }); setFormOpen(false); setEditing(null); } });
  const deleteMut = useMutation({ mutationFn: (id) => base44.entities.Client.delete(id), onSuccess: () => { qc.invalidateQueries({ queryKey: ["clients"] }); setDeleting(null); } });

  return (
    <div>
      <PageHeader title="Clients" subtitle="Manage your business clients" onAdd={() => { setEditing(null); setFormOpen(true); }} addLabel="Add Client" />
      <DataTable columns={columns} data={clients} searchField="business_name" onEdit={(row) => { setEditing(row); setFormOpen(true); }} onDelete={(row) => setDeleting(row)} />
      <EntityForm open={formOpen} onClose={() => { setFormOpen(false); setEditing(null); }} onSubmit={(d) => editing ? updateMut.mutate({ id: editing.id, data: d }) : createMut.mutate(d)} fields={formFields} initialData={editing} title={editing ? "Edit Client" : "Add Client"} />
      <DeleteDialog open={!!deleting} onClose={() => setDeleting(null)} onConfirm={() => deleteMut.mutate(deleting.id)} itemName={deleting?.business_name} />
    </div>
  );
}