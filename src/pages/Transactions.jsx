import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import PageHeader from "../components/shared/PageHeader";
import DataTable from "../components/shared/DataTable";
import DeleteDialog from "../components/shared/DeleteDialog";
import TransactionForm from "../components/transactions/TransactionForm";
import { usePermissions } from "@/components/shared/usePermissions";
import { Badge } from "@/components/ui/badge";
import { Lock } from "lucide-react";
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
  { key: "primary_person", label: "Person", render: (v, row) => v || row.assigned_person || "—" },
  { key: "counterparty", label: "Counterparty", render: (v, row) => v || row.supplier_customer || "—" },
  { key: "amount", label: "Total", render: (v) => v != null ? `$${parseFloat(v).toLocaleString()}` : "—" },
  { key: "status", label: "Status", render: (val) => <Badge className={statusColor(val)}>{(val || "draft").replace(/_/g, " ")}</Badge> },
];

export default function Transactions() {
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const qc = useQueryClient();

  useEffect(() => { base44.auth.me().then(setCurrentUser).catch(() => {}); }, []);

  const isSuperAdmin = currentUser?.role === "super_admin";
  const isAdmin = currentUser?.role === "admin" || isSuperAdmin;
  const companyId = currentUser?.company_id;
  const perms = usePermissions(currentUser);

  // Layer 4: users need at least l4_view; if no view access, block
  if (currentUser && !perms.l4_view && !isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-slate-400">
        <Lock className="w-8 h-8" />
        <p className="font-medium">You don't have access to Transactions.</p>
      </div>
    );
  }

  const { data: transactions = [] } = useQuery({
    queryKey: ["transactions", companyId],
    queryFn: () => isSuperAdmin || !companyId ? base44.entities.Transaction.list("-date") : base44.entities.Transaction.filter({ company_id: companyId }, "-date"),
    enabled: currentUser !== null,
  });

  const withCompany = (d) => companyId && !isSuperAdmin ? { ...d, company_id: companyId } : d;

  // Layer 4 rules: drafts → anyone with l4_create_draft; post/void → l4_post / l4_void
  const createMut = useMutation({ mutationFn: (d) => base44.entities.Transaction.create(withCompany(d)), onSuccess: () => { qc.invalidateQueries({ queryKey: ["transactions"] }); setFormOpen(false); } });
  const updateMut = useMutation({ mutationFn: ({ id, data }) => base44.entities.Transaction.update(id, data), onSuccess: () => { qc.invalidateQueries({ queryKey: ["transactions"] }); setFormOpen(false); setEditing(null); } });
  const deleteMut = useMutation({ mutationFn: (id) => base44.entities.Transaction.delete(id), onSuccess: () => { qc.invalidateQueries({ queryKey: ["transactions"] }); setDeleting(null); } });

  return (
    <div>
      <PageHeader
        title="Transactions"
        subtitle="Record what actually happened — auditable & reversible"
        onAdd={perms.l4_create_draft ? () => { setEditing(null); setFormOpen(true); } : undefined}
        addLabel="New Transaction"
      />
      <DataTable
        columns={columns}
        data={transactions}
        searchField="enterprise"
        onEdit={perms.l4_create_draft ? (row) => { setEditing(row); setFormOpen(true); } : undefined}
        onDelete={perms.can_delete ? (row) => setDeleting(row) : undefined}
      />
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