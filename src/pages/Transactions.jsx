import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import PageHeader from "../components/shared/PageHeader";
import TransactionForm from "../components/transactions/TransactionForm";
import TransactionSummaryCards from "../components/transactions/TransactionSummaryCards";
import TransactionFilters from "../components/transactions/TransactionFilters";
import VoidDialog from "../components/transactions/VoidDialog";
import PostConfirmDialog from "../components/transactions/PostConfirmDialog";
import AuditTrail from "../components/transactions/AuditTrail";
import { usePermissions } from "@/components/shared/usePermissions";
import { useEntityListFn, useWithScope } from "@/components/shared/useDataQuery";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Lock, ChevronDown, ChevronUp, Upload } from "lucide-react";
import BulkImportDialog from "../components/shared/BulkImportDialog";
import {
  TRANSACTION_FIELDS, TRANSACTION_MAPPING_RULES, TRANSACTION_TEMPLATE_EXAMPLE,
  TRANSACTION_TEMPLATE_INSTRUCTIONS, validateTransaction, transformTransaction,
} from "@/components/shared/importConfigs";
import { format, isAfter, parseISO } from "date-fns";
import { useToast } from "@/components/ui/use-toast";

const typeColor = (t) => {
  const map = {
    stock_in: "bg-blue-50 text-blue-700", stock_out: "bg-orange-50 text-orange-700",
    stock_transfer: "bg-purple-50 text-purple-700", item_assignment: "bg-indigo-50 text-indigo-700",
    item_return: "bg-teal-50 text-teal-700", sale_service: "bg-emerald-50 text-emerald-700",
    expense: "bg-rose-50 text-rose-700", adjustment: "bg-slate-100 text-slate-600", attendance: "bg-cyan-50 text-cyan-700",
  };
  return map[t] || "bg-slate-100 text-slate-600";
};

const statusColor = (s) => {
  const map = { draft: "bg-amber-50 text-amber-700", posted: "bg-emerald-50 text-emerald-700", voided: "bg-slate-100 text-slate-500" };
  return map[s] || "bg-slate-100 text-slate-600";
};

const paymentStatusColor = (s) => {
  const map = { paid: "bg-emerald-50 text-emerald-700", unpaid: "bg-rose-50 text-rose-700", partial: "bg-amber-50 text-amber-700", na: "bg-slate-100 text-slate-500" };
  return map[s] || "bg-slate-100 text-slate-500";
};

const STOCK_IMPACT_TYPES = ["stock_out", "item_assignment"];
const STOCK_IN_TYPES = ["stock_in", "item_return"];

function applyFilters(transactions, filters) {
  return transactions.filter((t) => {
    if (filters.status !== "all" && (t.status || "draft") !== filters.status) return false;
    if (filters.type !== "all" && t.transaction_type !== filters.type) return false;
    if (filters.dateFrom && t.date && t.date < filters.dateFrom) return false;
    if (filters.dateTo && t.date && t.date > filters.dateTo) return false;
    return true;
  });
}

export default function Transactions() {
  const [formOpen, setFormOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [postTarget, setPostTarget] = useState(null);
  const [voidTarget, setVoidTarget] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [filters, setFilters] = useState({ status: "all", type: "all", dateFrom: "", dateTo: "" });
  const qc = useQueryClient();
  const { toast } = useToast();

  useEffect(() => { base44.auth.me().then(setCurrentUser).catch(() => {}); }, []);

  const isSuperAdmin = currentUser?.role === "super_admin";
  const isAdmin = currentUser?.role === "admin" || isSuperAdmin;
  const companyId = currentUser?.company_id;
  const perms = usePermissions(currentUser);
  const listFn = useEntityListFn(currentUser);
  const withScope = useWithScope(currentUser);

  if (currentUser && !perms.l4_view && !isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-slate-400">
        <Lock className="w-8 h-8" />
        <p className="font-medium">You don't have access to Transactions.</p>
      </div>
    );
  }

  const { data: transactions = [] } = useQuery({
    queryKey: ["transactions", companyId, currentUser?.email],
    queryFn: () => listFn(base44.entities.Transaction, "-date"),
    enabled: currentUser !== null,
  });

  const { data: products = [] } = useQuery({
    queryKey: ["tx-products-page", companyId],
    queryFn: () => listFn(base44.entities.Product),
    enabled: currentUser !== null,
  });

  const createMut = useMutation({ mutationFn: (d) => base44.entities.Transaction.create(withScope(d)), onSuccess: () => { qc.invalidateQueries({ queryKey: ["transactions"] }); setFormOpen(false); } });
  const updateMut = useMutation({ mutationFn: ({ id, data }) => base44.entities.Transaction.update(id, data), onSuccess: () => { qc.invalidateQueries({ queryKey: ["transactions"] }); setFormOpen(false); setEditing(null); } });

  const handlePost = async (tx) => {
    const now = new Date().toISOString();
    await base44.entities.Transaction.update(tx.id, {
      status: "posted",
      posted_by: currentUser?.email,
      posted_date: now,
    });

    // Stock impact
    if (STOCK_IMPACT_TYPES.includes(tx.transaction_type)) {
      for (const line of (tx.line_items || [])) {
        if (!line.item_name || !line.quantity) continue;
        const matched = products.find((p) => p.name === line.item_name);
        if (matched) {
          const newQty = (parseFloat(matched.stock_quantity) || 0) - (parseFloat(line.quantity) || 0);
          await base44.entities.Product.update(matched.id, { stock_quantity: newQty });
        }
      }
    }
    if (STOCK_IN_TYPES.includes(tx.transaction_type)) {
      for (const line of (tx.line_items || [])) {
        if (!line.item_name || !line.quantity) continue;
        const matched = products.find((p) => p.name === line.item_name);
        if (matched) {
          const newQty = (parseFloat(matched.stock_quantity) || 0) + (parseFloat(line.quantity) || 0);
          await base44.entities.Product.update(matched.id, { stock_quantity: newQty });
        }
      }
    }

    qc.invalidateQueries({ queryKey: ["transactions"] });
    qc.invalidateQueries({ queryKey: ["products"] });
    setPostTarget(null);
    toast({ title: "Transaction posted successfully" });
  };

  const handleVoid = async (tx, reason) => {
    const now = new Date().toISOString();
    await base44.entities.Transaction.update(tx.id, {
      status: "voided",
      voided_reason: reason,
      voided_by: currentUser?.email,
      voided_date: now,
    });

    // Reverse stock impact
    if (STOCK_IMPACT_TYPES.includes(tx.transaction_type)) {
      for (const line of (tx.line_items || [])) {
        if (!line.item_name || !line.quantity) continue;
        const matched = products.find((p) => p.name === line.item_name);
        if (matched) {
          const newQty = (parseFloat(matched.stock_quantity) || 0) + (parseFloat(line.quantity) || 0);
          await base44.entities.Product.update(matched.id, { stock_quantity: newQty });
        }
      }
    }
    if (STOCK_IN_TYPES.includes(tx.transaction_type)) {
      for (const line of (tx.line_items || [])) {
        if (!line.item_name || !line.quantity) continue;
        const matched = products.find((p) => p.name === line.item_name);
        if (matched) {
          const newQty = (parseFloat(matched.stock_quantity) || 0) - (parseFloat(line.quantity) || 0);
          await base44.entities.Product.update(matched.id, { stock_quantity: newQty });
        }
      }
    }

    qc.invalidateQueries({ queryKey: ["transactions"] });
    qc.invalidateQueries({ queryKey: ["products"] });
    setVoidTarget(null);
    toast({ title: "Transaction voided" });
  };

  const filtered = applyFilters(transactions, filters);

  const isOverdue = (tx) =>
    tx.due_date &&
    tx.payment_status !== "paid" &&
    tx.payment_status !== "na" &&
    isAfter(new Date(), parseISO(tx.due_date));

  return (
    <div>
      <PageHeader
        title="Transactions"
        subtitle="Record what actually happened — auditable & reversible"
        onAdd={perms.l4_create_draft ? () => { setEditing(null); setFormOpen(true); } : undefined}
        addLabel="New Transaction"
      >
        {perms.l4_create_draft && (
          <Button variant="outline" size="sm" className="rounded-xl" onClick={() => setImportOpen(true)}>
            <Upload className="w-4 h-4 mr-2" /> Import
          </Button>
        )}
      </PageHeader>

      <TransactionSummaryCards transactions={transactions} />
      <TransactionFilters filters={filters} onChange={setFilters} />

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/60">
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Type</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Date</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Enterprise</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Person</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Total</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Payment</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Paid</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Due</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={10} className="text-center py-12 text-slate-400 text-sm">No transactions match the current filters</td></tr>
              )}
              {filtered.map((tx) => {
                const status = tx.status || "draft";
                const isExpanded = expanded === tx.id;
                const overdue = isOverdue(tx);
                return (
                  <React.Fragment key={tx.id}>
                    <tr className={`border-b border-slate-50 hover:bg-slate-50/60 transition-colors ${status === "voided" ? "opacity-60" : ""}`}>
                      <td className="px-4 py-3"><Badge className={typeColor(tx.transaction_type)}>{(tx.transaction_type || "—").replace(/_/g, " ")}</Badge></td>
                      <td className="px-4 py-3 text-slate-600 text-xs whitespace-nowrap">{tx.date ? format(new Date(tx.date), "MMM d, yyyy") : "—"}</td>
                      <td className="px-4 py-3 text-slate-700 text-xs max-w-[120px] truncate">{tx.enterprise || "—"}</td>
                      <td className="px-4 py-3 text-slate-600 text-xs">{tx.primary_person || tx.assigned_person || "—"}</td>
                      <td className="px-4 py-3 text-slate-700 text-xs font-medium">{tx.amount != null ? `$${parseFloat(tx.amount).toLocaleString()}` : "—"}</td>
                      <td className="px-4 py-3"><Badge className={paymentStatusColor(tx.payment_status)}>{(tx.payment_status || "na").replace(/_/g, " ")}</Badge></td>
                      <td className="px-4 py-3 text-slate-600 text-xs">{tx.amount_paid != null ? `$${parseFloat(tx.amount_paid).toLocaleString()}` : "—"}</td>
                      <td className={`px-4 py-3 text-xs font-medium ${overdue ? "text-rose-600" : "text-slate-500"}`}>
                        {tx.due_date ? format(new Date(tx.due_date), "MMM d") : "—"}
                        {overdue && <span className="ml-1 text-[10px] bg-rose-100 text-rose-600 px-1 rounded">overdue</span>}
                      </td>
                      <td className="px-4 py-3"><Badge className={statusColor(status)}>{status}</Badge></td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 justify-end">
                          {status === "draft" && (
                            <>
                              <Button size="sm" className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white px-2.5" onClick={() => setPostTarget(tx)}>Post</Button>
                              {perms.l4_create_draft && (
                                <Button size="sm" variant="outline" className="h-7 text-xs px-2.5" onClick={() => { setEditing(tx); setFormOpen(true); }}>Edit</Button>
                              )}
                            </>
                          )}
                          {status === "posted" && (
                            <Button size="sm" variant="outline" className="h-7 text-xs px-2.5 border-rose-200 text-rose-600 hover:bg-rose-50" onClick={() => setVoidTarget(tx)}>Void</Button>
                          )}
                          {status === "voided" && (
                            <Badge className="bg-slate-100 text-slate-400 text-xs">Voided</Badge>
                          )}
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-slate-400" onClick={() => setExpanded(isExpanded ? null : tx.id)}>
                            {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                          </Button>
                        </div>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr>
                        <td colSpan={10} className="px-6 py-4 bg-slate-50/50 border-b border-slate-100">
                          <AuditTrail transaction={tx} />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <TransactionForm
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditing(null); }}
        onSubmit={(d) => editing ? updateMut.mutate({ id: editing.id, data: d }) : createMut.mutate(d)}
        initialData={editing}
      />

      <PostConfirmDialog
        open={!!postTarget}
        onClose={() => setPostTarget(null)}
        onConfirm={() => handlePost(postTarget)}
      />

      <VoidDialog
        open={!!voidTarget}
        onClose={() => setVoidTarget(null)}
        onConfirm={(reason) => handleVoid(voidTarget, reason)}
      />

      <BulkImportDialog
        open={importOpen}
        onClose={() => { setImportOpen(false); qc.invalidateQueries({ queryKey: ["transactions"] }); }}
        entityName="Transactions"
        fields={TRANSACTION_FIELDS}
        mappingRules={TRANSACTION_MAPPING_RULES}
        templateFileName="newsconseen_transactions_import_template.xlsx"
        templateExample={TRANSACTION_TEMPLATE_EXAMPLE}
        templateInstructions={TRANSACTION_TEMPLATE_INSTRUCTIONS}
        validateRow={validateTransaction}
        transformRow={transformTransaction}
        onImport={(row) => base44.entities.Transaction.create(withScope(row))}
        currentUser={currentUser}
        previewColumns={[
          { label: "Type", render: (r) => r.transaction_type || <span className="text-rose-500">MISSING</span> },
          { label: "Date", render: (r) => r.date || <span className="text-rose-500">MISSING</span> },
          { label: "Enterprise", render: (r) => r.enterprise || "—" },
          { label: "Amount", render: (r) => r.amount != null ? `$${r.amount}` : "—" },
          { label: "Status", render: (r) => r.status || "draft" },
        ]}
        requiredField="date"
      />
    </div>
  );
}