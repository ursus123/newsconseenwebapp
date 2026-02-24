import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import PageHeader from "../components/shared/PageHeader";
import DataTable from "../components/shared/DataTable";
import EntityForm from "../components/shared/EntityForm";
import DeleteDialog from "../components/shared/DeleteDialog";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";

const typeColor = (t) => {
  const map = { sale: "bg-emerald-50 text-emerald-700", purchase: "bg-blue-50 text-blue-700", expense: "bg-rose-50 text-rose-700", refund: "bg-amber-50 text-amber-700", payment_received: "bg-green-50 text-green-700" };
  return map[t] || "bg-slate-100 text-slate-600";
};

const statusColor = (s) => {
  const map = { completed: "bg-emerald-50 text-emerald-700", pending: "bg-amber-50 text-amber-700", cancelled: "bg-slate-100 text-slate-600" };
  return map[s] || "bg-slate-100 text-slate-600";
};

const transactionTypes = [
  { value: "sale", label: "Sale" }, { value: "purchase", label: "Purchase" },
  { value: "expense", label: "Expense" }, { value: "refund", label: "Refund" },
  { value: "payment_received", label: "Payment Received" },
];

const txCategories = [
  { value: "product_sale", label: "Product Sale" }, { value: "service_sale", label: "Service Sale" },
  { value: "salary", label: "Salary" }, { value: "rent", label: "Rent" },
  { value: "utilities", label: "Utilities" }, { value: "supplies", label: "Supplies" },
  { value: "marketing", label: "Marketing" }, { value: "transport", label: "Transport" },
  { value: "maintenance", label: "Maintenance" }, { value: "other", label: "Other" },
];

const paymentMethods = [
  { value: "cash", label: "Cash" }, { value: "bank_transfer", label: "Bank Transfer" },
  { value: "credit_card", label: "Credit Card" }, { value: "mobile_money", label: "Mobile Money" },
  { value: "check", label: "Check" }, { value: "other", label: "Other" },
];

const formFields = [
  { key: "type", label: "Type", type: "select", required: true, options: transactionTypes },
  { key: "amount", label: "Amount ($)", type: "number", required: true },
  { key: "date", label: "Date", type: "date", required: true },
  { key: "client_name", label: "Client Name" },
  { key: "category", label: "Category", type: "select", options: txCategories },
  { key: "payment_method", label: "Payment Method", type: "select", default: "cash", options: paymentMethods },
  { key: "status", label: "Status", type: "select", default: "completed", options: [
    { value: "completed", label: "Completed" }, { value: "pending", label: "Pending" }, { value: "cancelled", label: "Cancelled" },
  ]},
  { key: "reference_number", label: "Reference #" },
  { key: "description", label: "Description", type: "textarea" },
];

const columns = [
  { key: "type", label: "Type", render: (val) => <Badge className={typeColor(val)}>{(val || "—").replace(/_/g, " ")}</Badge> },
  { key: "amount", label: "Amount", render: (v) => v ? `$${v.toLocaleString()}` : "—" },
  { key: "date", label: "Date", render: (v) => v ? format(new Date(v), "MMM d, yyyy") : "—" },
  { key: "client_name", label: "Client" },
  { key: "category", label: "Category", badge: true, badgeColor: () => "bg-slate-100 text-slate-600" },
  { key: "status", label: "Status", render: (val) => <Badge className={statusColor(val)}>{(val || "completed").replace(/_/g, " ")}</Badge> },
];

export default function Transactions() {
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const qc = useQueryClient();

  const { data: transactions = [] } = useQuery({ queryKey: ["transactions"], queryFn: () => base44.entities.Transaction.list("-date") });

  const createMut = useMutation({ mutationFn: (d) => base44.entities.Transaction.create(d), onSuccess: () => { qc.invalidateQueries({ queryKey: ["transactions"] }); setFormOpen(false); } });
  const updateMut = useMutation({ mutationFn: ({ id, data }) => base44.entities.Transaction.update(id, data), onSuccess: () => { qc.invalidateQueries({ queryKey: ["transactions"] }); setFormOpen(false); setEditing(null); } });
  const deleteMut = useMutation({ mutationFn: (id) => base44.entities.Transaction.delete(id), onSuccess: () => { qc.invalidateQueries({ queryKey: ["transactions"] }); setDeleting(null); } });

  return (
    <div>
      <PageHeader title="Transactions" subtitle="Track all financial transactions" onAdd={() => { setEditing(null); setFormOpen(true); }} addLabel="Add Transaction" />
      <DataTable columns={columns} data={transactions} searchField="client_name" onEdit={(row) => { setEditing(row); setFormOpen(true); }} onDelete={(row) => setDeleting(row)} />
      <EntityForm open={formOpen} onClose={() => { setFormOpen(false); setEditing(null); }} onSubmit={(d) => editing ? updateMut.mutate({ id: editing.id, data: d }) : createMut.mutate(d)} fields={formFields} initialData={editing} title={editing ? "Edit Transaction" : "Add Transaction"} />
      <DeleteDialog open={!!deleting} onClose={() => setDeleting(null)} onConfirm={() => deleteMut.mutate(deleting.id)} itemName="this transaction" />
    </div>
  );
}