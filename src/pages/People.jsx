import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import PageHeader from "../components/shared/PageHeader";
import DataTable from "../components/shared/DataTable";
import EntityForm from "../components/shared/EntityForm";
import DeleteDialog from "../components/shared/DeleteDialog";
import { Badge } from "@/components/ui/badge";

const statusColor = (s) => {
  const map = { active: "bg-emerald-50 text-emerald-700", inactive: "bg-slate-100 text-slate-600", on_leave: "bg-amber-50 text-amber-700", terminated: "bg-rose-50 text-rose-700" };
  return map[s] || "bg-slate-100 text-slate-600";
};

const roleCategories = [
  { value: "operations_service", label: "Operations & Service" },
  { value: "retail_customer_facing", label: "Retail & Customer-Facing" },
  { value: "professional_licensed", label: "Professional & Licensed" },
  { value: "food_hospitality", label: "Food & Hospitality" },
  { value: "creative_digital", label: "Creative & Digital" },
  { value: "administrative", label: "Administrative" },
  { value: "management_leadership", label: "Management & Leadership" },
];

const formFields = [
  { key: "full_name", label: "Full Name", required: true },
  { key: "job_title", label: "Job Title", required: true },
  { key: "role_category", label: "Role Category", type: "select", options: roleCategories },
  { key: "email", label: "Email", type: "email" },
  { key: "phone", label: "Phone" },
  { key: "address", label: "Address" },
  { key: "salary", label: "Salary", type: "number" },
  { key: "hire_date", label: "Hire Date", type: "date" },
  { key: "status", label: "Status", type: "select", default: "active", options: [
    { value: "active", label: "Active" }, { value: "inactive", label: "Inactive" },
    { value: "on_leave", label: "On Leave" }, { value: "terminated", label: "Terminated" },
  ]},
  { key: "notes", label: "Notes", type: "textarea" },
];

const columns = [
  { key: "full_name", label: "Name" },
  { key: "job_title", label: "Job Title" },
  { key: "role_category", label: "Category", badge: true, badgeColor: () => "bg-blue-50 text-blue-700" },
  { key: "phone", label: "Phone" },
  { key: "status", label: "Status", render: (val) => <Badge className={statusColor(val)}>{(val || "active").replace(/_/g, " ")}</Badge> },
];

export default function People() {
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const qc = useQueryClient();

  const { data: people = [], isLoading } = useQuery({ queryKey: ["people"], queryFn: () => base44.entities.Person.list("-created_date") });

  const createMut = useMutation({ mutationFn: (d) => base44.entities.Person.create(d), onSuccess: () => { qc.invalidateQueries({ queryKey: ["people"] }); setFormOpen(false); } });
  const updateMut = useMutation({ mutationFn: ({ id, data }) => base44.entities.Person.update(id, data), onSuccess: () => { qc.invalidateQueries({ queryKey: ["people"] }); setFormOpen(false); setEditing(null); } });
  const deleteMut = useMutation({ mutationFn: (id) => base44.entities.Person.delete(id), onSuccess: () => { qc.invalidateQueries({ queryKey: ["people"] }); setDeleting(null); } });

  return (
    <div>
      <PageHeader title="People" subtitle="Manage your team members and staff" onAdd={() => { setEditing(null); setFormOpen(true); }} addLabel="Add Person" />
      <DataTable
        columns={columns}
        data={people}
        searchField="full_name"
        onEdit={(row) => { setEditing(row); setFormOpen(true); }}
        onDelete={(row) => setDeleting(row)}
      />
      <EntityForm
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditing(null); }}
        onSubmit={(d) => editing ? updateMut.mutate({ id: editing.id, data: d }) : createMut.mutate(d)}
        fields={formFields}
        initialData={editing}
        title={editing ? "Edit Person" : "Add Person"}
      />
      <DeleteDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleteMut.mutate(deleting.id)}
        itemName={deleting?.full_name}
      />
    </div>
  );
}