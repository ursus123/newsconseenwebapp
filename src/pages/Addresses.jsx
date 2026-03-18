import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import PageHeader from "../components/shared/PageHeader";
import DataTable from "../components/shared/DataTable";
import DeleteDialog from "../components/shared/DeleteDialog";
import AddressForm from "../components/addresses/AddressForm";
import { Badge } from "@/components/ui/badge";
import { useEntityListFn, useWithScope } from "@/components/shared/useDataQuery";
import BulkImportDialog from "../components/shared/BulkImportDialog";
import { Button } from "@/components/ui/button";
import { Upload } from "lucide-react";
import {
  ADDRESS_FIELDS, ADDRESS_MAPPING_RULES, ADDRESS_TEMPLATE_EXAMPLE,
  ADDRESS_TEMPLATE_INSTRUCTIONS, validateAddress, transformAddress,
} from "@/components/shared/importConfigs";

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
  const [currentUser, setCurrentUser] = useState(null);
  const qc = useQueryClient();

  useEffect(() => { base44.auth.me().then(setCurrentUser).catch(() => {}); }, []);

  const listFn = useEntityListFn(currentUser);
  const withScope = useWithScope(currentUser);

  const { data: addresses = [] } = useQuery({
    queryKey: ["addresses", currentUser?.company_id, currentUser?.email],
    queryFn: () => listFn(base44.entities.Address),
    enabled: currentUser !== null,
  });

  const createMut = useMutation({ mutationFn: (d) => base44.entities.Address.create(withScope(d)), onSuccess: () => { qc.invalidateQueries({ queryKey: ["addresses"] }); setFormOpen(false); } });
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