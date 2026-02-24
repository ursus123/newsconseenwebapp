import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import PageHeader from "../components/shared/PageHeader";
import DataTable from "../components/shared/DataTable";
import DeleteDialog from "../components/shared/DeleteDialog";
import TransactionForm from "../components/transactions/TransactionForm";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";

const typeColor = (t) => {
  const map = {
    stock_in: "bg-blue-50 text-blue-700", stock_out: "bg-orange-50 text-orange-700",
    stock_transfer: "bg-purple-50 text-purple-700", item_assignment: "bg-indigo-50 text-indigo-700",
    item_return: "bg-teal-50 text-teal-700", sale_service: "bg-emerald-50 text-emerald-700",
    expense: "bg-rose-50 text-rose-700", adjustment: "bg-slate-100 text-slate-600",
  };
  return map[t] || "bg-slate-100 text-slate-600";
};

const statusColor = (s) => {
  const map = { draft: "bg-amber-50 text-amber-700", posted: "bg-emerald-50 text-emerald-700", voided: "bg-slate-100 text-slate-500" };
  return map[s] || "bg-slate-100 text-slate-600";
};

const columns = [
  { key: "transaction_type", label: "Type", render: (val) => <Badge className={typeColor(val)}>{(val || "—").replace(/_/g, " ")}</Badge> },
  { key: "date", label: "Date", render: (v) => v ? format(new Date(v), "MMM d, yyyy") : "—" },
  { key: "enterprise", label: "Enterprise" },
  { key: "amount", label: "Total", render: (v) => v != null ? `$${parseFloat(v).toLocaleString()}` : "—" },
  { key: "supplier_customer", label: "Party" },
  { key: "status", label: "Status", render: (val) => <Badge className={statusColor(val)}>{(val || "draft").replace(/_/g, " ")}</Badge> },
];

export default function Transactions() {
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const qc = useQueryClient();

  React.useEffect(() => { base44.auth.me().then(setCurrentUser).catch(() => {}); }, []);

  const isSuperAdmin = currentUser?.role === "super_admin";
  const companyId = currentUser?.company_id;

  const { data: transactions = [] } = useQuery({
    queryKey: ["transactions", companyId],
    queryFn: () => isSuperAdmin || !companyId ? base44.entities.Transaction.list("-date") : base44.entities.Transaction.filter({ company_id: companyId }, "-date"),
    enabled: currentUser !== null,
  });

  const withCompany = (d) => companyId && !isSuperAdmin ? { ...d, company_id: companyId } : d;

  const createMut = useMutation({ mutationFn: (d) => base44.entities.Transaction.create(withCompany(d)), onSuccess: () => { qc.invalidateQueries({ queryKey: ["transactions"] }); setFormOpen(false); } });
  const updateMut = useMutation({ mutationFn: ({ id, data }) => base44.entities.Transaction.update(id, data), onSuccess: () => { qc.invalidateQueries({ queryKey: ["transactions"] }); setFormOpen(false); setEditing(null); } });
  const deleteMut = useMutation({ mutationFn: (id) => base44.entities.Transaction.delete(id), onSuccess: () => { qc.invalidateQueries({ queryKey: ["transactions"] }); setDeleting(null); } });

  return (
    <div>
      <PageHeader title="Transactions" subtitle="Record stock movements, assignments, sales & expenses" onAdd={() => { setEditing(null); setFormOpen(true); }} addLabel="New Transaction" />
      <DataTable columns={columns} data={transactions} searchField="enterprise" onEdit={(row) => { setEditing(row); setFormOpen(true); }} onDelete={(row) => setDeleting(row)} />
      <TransactionForm
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditing(null); }}
        onSubmit={(d) => editing ? updateMut.mutate({ id: editing.id, data: d }) : createMut.mutate(d)}
        initialData={editing}
      />
      <DeleteDialog open={!!deleting} onClose={() => setDeleting(null)} onConfirm={() => deleteMut.mutate(deleting.id)} itemName="this transaction" />
    </div>
  );
}