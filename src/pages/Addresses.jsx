import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import PageHeader from "../components/shared/PageHeader";
import DataTable from "../components/shared/DataTable";
import DeleteDialog from "../components/shared/DeleteDialog";
import AddressForm from "../components/addresses/AddressForm";
import { Badge } from "@/components/ui/badge";

const statusColor = (s) => ({
  active: "bg-emerald-50 text-emerald-700",
  archived: "bg-slate-100 text-slate-400",
}[s] || "bg-slate-100 text-slate-600");

const columns = [
  { key: "label", label: "Label", render: (val, row) => (
    <div>
      <p className="font-medium text-slate-800">{val || "—"}</p>
      <p className="text-xs text-slate-400">{[row.address_line1, row.city, row.country].filter(Boolean).join(", ")}</p>
    </div>
  )},
  { key: "city", label: "City" },
  { key: "state_region", label: "Region" },
  { key: "country", label: "Country" },
  { key: "status", label: "Status", render: (val) => <Badge className={statusColor(val)}>{val || "active"}</Badge> },
];

export default function Addresses() {
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const qc = useQueryClient();

  const { data: addresses = [] } = useQuery({ queryKey: ["addresses"], queryFn: () => base44.entities.Address.list("-created_date") });

  const createMut = useMutation({ mutationFn: (d) => base44.entities.Address.create(d), onSuccess: () => { qc.invalidateQueries({ queryKey: ["addresses"] }); setFormOpen(false); } });
  const updateMut = useMutation({ mutationFn: ({ id, data }) => base44.entities.Address.update(id, data), onSuccess: () => { qc.invalidateQueries({ queryKey: ["addresses"] }); setFormOpen(false); setEditing(null); } });
  const deleteMut = useMutation({ mutationFn: (id) => base44.entities.Address.delete(id), onSuccess: () => { qc.invalidateQueries({ queryKey: ["addresses"] }); setDeleting(null); } });

  const handleSubmit = (data, saveAndNew = false) => {
    if (editing) {
      updateMut.mutate({ id: editing.id, data });
    } else {
      createMut.mutate(data);
      if (saveAndNew) {
        setEditing(null);
        setFormOpen(true);
      }
    }
  };

  const handleArchive = (item) => {
    updateMut.mutate({ id: item.id, data: { ...item, status: "archived" } });
    setFormOpen(false);
    setEditing(null);
  };

  return (
    <div>
      <PageHeader title="Addresses" subtitle="Master address records linked to people, enterprises & transactions" onAdd={() => { setEditing(null); setFormOpen(true); }} addLabel="New Address" />
      <DataTable columns={columns} data={addresses} searchField="label" onEdit={(row) => { setEditing(row); setFormOpen(true); }} onDelete={(row) => setDeleting(row)} />
      <AddressForm
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditing(null); }}
        onSubmit={handleSubmit}
        onArchive={handleArchive}
        initialData={editing}
      />
      <DeleteDialog open={!!deleting} onClose={() => setDeleting(null)} onConfirm={() => deleteMut.mutate(deleting.id)} itemName={deleting?.label || "this address"} />
    </div>
  );
}