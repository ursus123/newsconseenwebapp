import React, { useState, useEffect, useMemo, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import PageHeader from "../components/shared/PageHeader";
import TransactionForm from "../components/transactions/TransactionForm";
import VoidDialog from "../components/transactions/VoidDialog";
import PostConfirmDialog from "../components/transactions/PostConfirmDialog";
import AuditTrail from "../components/transactions/AuditTrail";
import { usePermissions } from "@/components/shared/usePermissions";
import { useEntityListFn, useWithScope } from "@/components/shared/useDataQuery";
import { Button } from "@/components/ui/button";
import { Lock, Upload, ChevronDown, ChevronUp, Plus, Search, X } from "lucide-react";
import ExportCSVButton from "@/components/shared/ExportCSVButton";
import { tagColor } from "@/components/shared/TagInput";
import { fuzzyFilter } from "@/components/shared/fuzzySearch";
import BulkActionBar from "../components/shared/BulkActionBar";
import SpreadsheetToolbar from "@/components/shared/SpreadsheetToolbar";
import DeleteAllDialog from "@/components/shared/DeleteAllDialog";
import { Checkbox } from "@/components/ui/checkbox";
import BulkImportDialog from "../components/shared/BulkImportDialog";
import {
  TRANSACTION_FIELDS, TRANSACTION_MAPPING_RULES, TRANSACTION_TEMPLATE_EXAMPLE,
  TRANSACTION_TEMPLATE_INSTRUCTIONS, validateTransaction, transformTransaction,
} from "@/components/shared/importConfigs";
import { useToast } from "@/components/ui/use-toast";
import {
  TRANSACTION_TYPES, REVENUE_TYPES, EXPENSE_TYPES, INVENTORY_TYPES,
} from "@/config/transactionTypes";
import { createTransaction, TRANSACTION_SOURCES } from "@/utils/createTransaction";
import { generateInvoiceNumber } from "@/utils/autoInvoice";
import { DateRangeInput3 } from "@blueprintjs/datetime2";

const RAILWAY_URL = "https://newsconseenwebapp-production.up.railway.app";
const RAILWAY_API_KEY = import.meta.env.VITE_RAILWAY_API_KEY || "";
const triggerETL = (entity) =>
  fetch(`${RAILWAY_URL}/load/${entity}-summary`, { method: "POST" }).catch(() => {});
function triggerWorkflows(companyId, triggerType, entityData) {
  fetch(`${RAILWAY_URL}/workflows/trigger`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(RAILWAY_API_KEY ? { "x-api-key": RAILWAY_API_KEY } : {}) },
    body: JSON.stringify({ company_id: companyId, trigger_type: triggerType, entity_type: "transaction", entity_data: entityData }),
  }).catch(() => {});
}
function logAudit(companyId, action, record, userEmail) {
  fetch(`${RAILWAY_URL}/audit/log`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(RAILWAY_API_KEY ? { "x-api-key": RAILWAY_API_KEY } : {}) },
    body: JSON.stringify({ company_id: companyId, entity_type: "transaction", entity_id: record?.id, entity_name: record?.reference_number || record?.transaction_type || record?.id, action, changed_by: userEmail }),
  }).catch(() => {});
}

const STOCK_IMPACT_TYPES = ["stock_out", "item_assignment"];
const STOCK_IN_TYPES = ["stock_in", "item_return"];

// Source badge color overrides (TRANSACTION_SOURCES has labels + icons)
const SOURCE_COLORS = {
  manual:        "bg-slate-100 text-slate-500",
  task_complete: "bg-emerald-50 text-emerald-600",
  medadmin:      "bg-blue-50 text-blue-600",
  stockcounter:  "bg-amber-50 text-amber-600",
  barcode:       "bg-purple-50 text-purple-600",
  clockinout:    "bg-indigo-50 text-indigo-600",
  scheduler:     "bg-cyan-50 text-cyan-600",
  invoicer:      "bg-violet-50 text-violet-600",
  purchase_order:"bg-orange-50 text-orange-600",
  payroll:       "bg-pink-50 text-pink-600",
  expenses:      "bg-rose-50 text-rose-600",
  pos:           "bg-teal-50 text-teal-600",
  farm:          "bg-lime-50 text-lime-600",
  livestock:     "bg-yellow-50 text-yellow-700",
  donations:     "bg-emerald-50 text-emerald-700",
  grants:        "bg-blue-50 text-blue-700",
  import:        "bg-slate-100 text-slate-500",
};

const TABS = [
  {
    id: "outstanding", label: "Outstanding", icon: "⏳",
    filter: (t) => t.payment_status === "unpaid" && REVENUE_TYPES.includes(t.transaction_type) && t.status === "posted",
    emptyMessage: "No outstanding invoices", emptyDetail: "All invoices have been paid. Great work!",
  },
  {
    id: "drafts", label: "Drafts", icon: "📝",
    filter: (t) => t.status === "draft",
    emptyMessage: "No draft transactions", emptyDetail: "Drafts appear here when tasks are completed",
  },
  {
    id: "received", label: "Received", icon: "✅",
    filter: (t) => t.payment_status === "paid" && REVENUE_TYPES.includes(t.transaction_type),
    emptyMessage: "No payments received yet", emptyDetail: "Payments appear here once marked as paid",
  },
  {
    id: "expenses", label: "Expenses", icon: "💸",
    filter: (t) => EXPENSE_TYPES.includes(t.transaction_type),
    emptyMessage: "No expenses recorded", emptyDetail: "Add expenses to track spending",
  },
  {
    id: "inventory", label: "Inventory", icon: "📦",
    filter: (t) => INVENTORY_TYPES.includes(t.transaction_type),
    emptyMessage: "No inventory movements", emptyDetail: "Stock in/out events appear here",
  },
  {
    id: "all", label: "All", icon: "📋",
    filter: () => true,
    emptyMessage: "No transactions yet", emptyDetail: "Create your first transaction above",
  },
];

// ── Person Ledger Panel ────────────────────────────────────────────
// Shows all transactions linked to a specific person name — used for
// fee-account views (students), salary audit (staff), and supplier history.
function PersonLedgerPanel({ personName, transactions, onClose }) {
  const txs = transactions.filter(t => {
    const p = (t.primary_person || t.person_name || t.counterparty || "").toLowerCase();
    return p.includes(personName.toLowerCase());
  });

  const totalCharged   = txs.filter(t => REVENUE_TYPES.includes(t.transaction_type)).reduce((s, t) => s + (t.amount || 0), 0);
  const totalPaid      = txs.filter(t => REVENUE_TYPES.includes(t.transaction_type)).reduce((s, t) => s + (t.amount_paid || (t.payment_status === "paid" ? t.amount : 0) || 0), 0);
  const totalExpense   = txs.filter(t => EXPENSE_TYPES.includes(t.transaction_type)).reduce((s, t) => s + (t.amount || 0), 0);
  const outstanding    = totalCharged - totalPaid;

  // Duplicate detection: same category + same amount appearing more than once in same calendar month
  const dupKeys = {};
  txs.forEach(t => {
    if (!t.amount) return;
    const mo = (t.date || t.created_date || "").slice(0, 7);
    const key = `${t.transaction_type}|${t.amount}|${mo}`;
    dupKeys[key] = (dupKeys[key] || 0) + 1;
  });
  const isDup = (t) => {
    const mo = (t.date || t.created_date || "").slice(0, 7);
    return (dupKeys[`${t.transaction_type}|${t.amount}|${mo}`] || 0) > 1;
  };

  const fmt = (n) => Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  if (!txs.length) return (
    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex items-center justify-between">
      <p className="text-sm text-slate-500">No transactions found for <strong>{personName}</strong></p>
      <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-sm">✕</button>
    </div>
  );

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="font-bold text-slate-800">Ledger — {personName}</p>
          <p className="text-xs text-slate-400">{txs.length} transaction{txs.length !== 1 ? "s" : ""}</p>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-sm px-2">✕</button>
      </div>

      {/* Summary row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {totalCharged > 0 && (
          <div className="bg-emerald-50 rounded-xl p-3">
            <p className="text-[10px] text-slate-500">Total charged</p>
            <p className="text-base font-black text-emerald-700">{fmt(totalCharged)}</p>
          </div>
        )}
        {totalPaid > 0 && (
          <div className="bg-emerald-50 rounded-xl p-3">
            <p className="text-[10px] text-slate-500">Total paid</p>
            <p className="text-base font-black text-emerald-600">{fmt(totalPaid)}</p>
          </div>
        )}
        {outstanding > 0 && (
          <div className="bg-amber-50 rounded-xl p-3">
            <p className="text-[10px] text-slate-500">Outstanding</p>
            <p className="text-base font-black text-amber-700">{fmt(outstanding)}</p>
          </div>
        )}
        {totalExpense > 0 && (
          <div className="bg-rose-50 rounded-xl p-3">
            <p className="text-[10px] text-slate-500">Total expense</p>
            <p className="text-base font-black text-rose-600">{fmt(totalExpense)}</p>
          </div>
        )}
      </div>

      {/* Duplicate warning */}
      {txs.some(isDup) && (
        <div className="flex items-center gap-2 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
          <span className="text-rose-500 text-sm">⚠️</span>
          <p className="text-xs text-rose-700 font-semibold">Possible duplicate payments detected — same amount in the same month.</p>
        </div>
      )}

      {/* Transaction list */}
      <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
        {txs.map(t => {
          const isRev = REVENUE_TYPES.includes(t.transaction_type);
          const isPartial = t.payment_status === "partial";
          const dup = isDup(t);
          return (
            <div key={t.id} className={`flex items-center justify-between rounded-xl px-3 py-2 text-sm ${
              dup       ? "bg-rose-50 border border-rose-200" :
              isPartial ? "bg-amber-50 border border-amber-200" :
              "bg-slate-50 border border-slate-100"
            }`}>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-slate-700 truncate">
                  {t.description || t.transaction_type}
                  {dup && <span className="ml-2 text-[10px] font-bold text-rose-600 bg-rose-100 px-1.5 py-0.5 rounded-full">DUPLICATE</span>}
                  {isPartial && <span className="ml-2 text-[10px] font-bold text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded-full">PARTIAL</span>}
                </p>
                <p className="text-[10px] text-slate-400">{t.date || t.created_date?.slice(0,10)} · {t.payment_status || "—"}</p>
              </div>
              <p className={`font-bold ml-3 shrink-0 ${isRev ? "text-emerald-700" : "text-rose-600"}`}>
                {isRev ? "+" : "-"}{fmt(t.amount || 0)}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TransactionRow({ transaction, onEdit, onMarkPaid, onPost, onVoid, onExpand, isExpanded }) {
  const isRevenue   = REVENUE_TYPES.includes(transaction.transaction_type);
  const isExpense   = EXPENSE_TYPES.includes(transaction.transaction_type);
  const isInventory = INVENTORY_TYPES.includes(transaction.transaction_type);
  const isOverdue   = transaction.payment_status === "unpaid" && transaction.due_date && new Date(transaction.due_date) < new Date();

  return (
    <>
      <div className={`bg-white border rounded-2xl p-4 hover:shadow-sm transition-all ${
        isOverdue ? "border-rose-200 bg-rose-50/30" :
        transaction.status === "draft" ? "border-blue-200 bg-blue-50/20" :
        "border-slate-100"
      }`}>
        <div className="flex items-start justify-between gap-4">
          {/* Left */}
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0 ${
              isRevenue ? "bg-emerald-50" : isExpense ? "bg-rose-50" : isInventory ? "bg-amber-50" : "bg-slate-100"
            }`}>
              {isRevenue ? "💰" : isExpense ? "💸" : isInventory ? "📦" : "💳"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-slate-800 text-sm">
                {transaction.description || TRANSACTION_TYPES[transaction.transaction_type] || "Transaction"}
              </p>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                {transaction.invoice_number && (
                  <span className="text-[10px] font-mono text-slate-400">{transaction.invoice_number}</span>
                )}
                {transaction.enterprise && (
                  <span className="text-[10px] text-slate-400">{transaction.enterprise}</span>
                )}
                {transaction.primary_person && (
                  <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full">
                    👤 {transaction.primary_person}
                  </span>
                )}
                {transaction.service_name && (
                  <span className="text-[10px] bg-blue-50 text-blue-500 px-1.5 py-0.5 rounded-full">
                    ⚙️ {transaction.service_name}
                  </span>
                )}
                {transaction.task_title && (
                  <span className="text-[10px] bg-emerald-50 text-emerald-500 px-1.5 py-0.5 rounded-full">
                    ✅ {transaction.task_title}
                  </span>
                )}
                <span className="text-[10px] text-slate-300">
                  {transaction.date || transaction.created_date?.slice(0, 10)}
                </span>
                {transaction.due_date && transaction.payment_status === "unpaid" && (
                  <span className={`text-[10px] font-medium ${isOverdue ? "text-rose-500" : "text-amber-500"}`}>
                    Due {transaction.due_date}{isOverdue && " ⚠️ OVERDUE"}
                  </span>
                )}
                {(transaction.tags || []).map(tag => (
                  <span key={tag} className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${tagColor(tag)}`}>#{tag}</span>
                ))}
                {transaction.source && transaction.source !== "manual" && (() => {
                  const src  = TRANSACTION_SOURCES[transaction.source] || TRANSACTION_SOURCES.manual;
                  const color = SOURCE_COLORS[transaction.source] || SOURCE_COLORS.manual;
                  return (
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${color}`}>
                      {src.icon} {src.label}
                    </span>
                  );
                })()}
              </div>
            </div>
          </div>

          {/* Right */}
          <div className="flex flex-col items-end gap-2 shrink-0">
            <p className={`text-lg font-black ${isRevenue ? "text-emerald-600" : isExpense ? "text-rose-500" : isInventory ? "text-amber-600" : "text-slate-700"}`}>
              {isExpense ? "-" : "+"}${(transaction.net_amount || transaction.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            <div className="flex items-center gap-1">
              <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                transaction.status === "draft"       ? "bg-blue-100 text-blue-600" :
                transaction.status === "posted"      ? "bg-slate-100 text-slate-500" :
                transaction.status === "reconciled"  ? "bg-emerald-100 text-emerald-600" :
                transaction.status === "voided" || transaction.status === "void"
                  ? "bg-slate-100 text-slate-400 line-through" :
                "bg-slate-100 text-slate-500"
              }`}>
                {transaction.status || "draft"}
              </span>
              {!isInventory && (
                <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                  transaction.payment_status === "paid"    ? "bg-emerald-100 text-emerald-600" :
                  transaction.payment_status === "partial" ? "bg-amber-100 text-amber-600" :
                  transaction.payment_status === "waived"  ? "bg-slate-100 text-slate-400" :
                  "bg-amber-50 text-amber-600"
                }`}>
                  {transaction.payment_status || "unpaid"}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {transaction.status === "draft" && (
                <button onClick={() => onPost(transaction)}
                  className="text-[10px] font-bold px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-all">
                  Post Invoice
                </button>
              )}
              {transaction.payment_status === "unpaid" && transaction.status === "posted" && isRevenue && (
                <button onClick={() => onMarkPaid(transaction)}
                  className="text-[10px] font-bold px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-all">
                  Mark Paid
                </button>
              )}
              <button onClick={() => onEdit(transaction)} className="text-[10px] text-slate-400 hover:text-indigo-500 p-1.5 rounded-lg hover:bg-slate-50 transition-all">✏️</button>
              {(transaction.status === "posted" || transaction.status === "draft") && (
                <button onClick={() => onVoid(transaction)} className="text-[10px] text-slate-300 hover:text-rose-500 p-1.5 rounded-lg hover:bg-rose-50 transition-all">🗑️</button>
              )}
              <button onClick={() => onExpand(transaction.id)} className="text-[10px] text-slate-300 hover:text-slate-500 p-1.5 rounded-lg hover:bg-slate-50 transition-all">
                {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
            </div>
          </div>
        </div>

        {transaction.notes && (
          <div className="mt-3 pt-3 border-t border-slate-100">
            <p className="text-[10px] text-slate-400 italic">{transaction.notes}</p>
          </div>
        )}
      </div>
      {isExpanded && (
        <div className="bg-slate-50/50 border border-slate-100 rounded-xl px-4 py-3 -mt-2">
          <AuditTrail transaction={transaction} />
        </div>
      )}
    </>
  );
}

export default function Transactions() {
  const [formOpen, setFormOpen]           = useState(false);
  const [importOpen, setImportOpen]       = useState(false);
  const [editing, setEditing]             = useState(null);
  const [voidTarget, setVoidTarget]       = useState(null);
  const [postTarget, setPostTarget]       = useState(null);
  const [expanded, setExpanded]           = useState(null);
  const [currentUser, setCurrentUser]     = useState(null);
  const [activeTab, setActiveTab]         = useState("outstanding");
  const [period, setPeriod]               = useState("30d");
  const [dateRange, setDateRange]         = useState([null, null]); // [Date|null, Date|null]
  const [filterEnterprise, setFilterEnterprise] = useState("all");
  const [personLedger, setPersonLedger]         = useState("");
  const [filterSource, setFilterSource]         = useState("all");
  const [filterTag, setFilterTag]               = useState("all");
  const [search, setSearch]                     = useState("");
  const [selectedIds, setSelectedIds]           = useState([]);
  const [deleteAllOpen, setDeleteAllOpen]       = useState(false);
  const qc = useQueryClient();
  const { toast } = useToast();

  useEffect(() => { base44.auth.me().then(setCurrentUser).catch(() => {}); }, []);

  useEffect(() => {
    const fn = () => { if (document.visibilityState === "visible") qc.refetchQueries({ queryKey: ["transactions"] }); };
    document.addEventListener("visibilitychange", fn);
    return () => document.removeEventListener("visibilitychange", fn);
  }, [qc]);

  const isAdmin   = currentUser?.role === "admin" || currentUser?.role === "super_admin";
  const companyId = currentUser?.company_id;
  const perms     = usePermissions(currentUser);
  const listFn    = useEntityListFn(currentUser);
  const withScope = useWithScope(currentUser);

  const { data: transactions = [] } = useQuery({
    queryKey: ["transactions", companyId, currentUser?.email],
    queryFn: () => listFn(base44.entities.Transaction, "-date"),
    enabled: currentUser !== null,
    staleTime: 0,
    refetchOnMount: "always",
  });

  const { data: enterprises = [] } = useQuery({
    queryKey: ["enterprises", companyId],
    queryFn: () => listFn(base44.entities.Enterprise),
    enabled: currentUser !== null,
  });

  const { data: people = [] } = useQuery({
    queryKey: ["people-tx", companyId],
    queryFn: () => listFn(base44.entities.Person),
    enabled: currentUser !== null,
  });

  const { data: services = [] } = useQuery({
    queryKey: ["services-tx", companyId],
    queryFn: () => listFn(base44.entities.Service),
    enabled: currentUser !== null,
  });

  const { data: products = [] } = useQuery({
    queryKey: ["tx-products-page", companyId],
    queryFn: () => listFn(base44.entities.Product),
    enabled: currentUser !== null,
  });

  const createMut = useMutation({
    mutationFn: async (data) => createTransaction(data, currentUser, {
      autoPost:        data.status === "posted",
      generateNumber:  data.status === "posted" && REVENUE_TYPES.includes(data.transaction_type),
      toast,
      existingTransactions: transactions,
      enterprise:      enterprises.find(e => e.enterprise_name === data.enterprise),
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["transactions"] }); qc.refetchQueries({ queryKey: ["transactions"] }); setFormOpen(false); triggerETL("transaction"); logAudit(companyId, "created", editing, currentUser?.email); triggerWorkflows(companyId, "entity_created", editing); },
    onError: (e) => toast({ title: "Failed to create transaction", description: e.message, variant: "destructive" }),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Transaction.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["transactions"] }); qc.refetchQueries({ queryKey: ["transactions"] }); setFormOpen(false); setEditing(null); triggerETL("transaction"); logAudit(companyId, "updated", editing, currentUser?.email); triggerWorkflows(companyId, "entity_updated", editing); },
  });

  // Period filtering — preset buttons OR custom Blueprint date range
  const filteredByPeriod = useMemo(() => {
    // Custom date range takes priority when both ends are set
    const [rangeStart, rangeEnd] = dateRange;
    if (rangeStart && rangeEnd) {
      const from = new Date(rangeStart); from.setHours(0, 0, 0, 0);
      const to   = new Date(rangeEnd);   to.setHours(23, 59, 59, 999);
      return transactions.filter(t => {
        const d = new Date(t.date || t.created_date);
        return d >= from && d <= to;
      });
    }
    if (period === "all") return transactions;
    const days = { "7d": 7, "30d": 30, "90d": 90, "year": 365 }[period] || 30;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    return transactions.filter(t => new Date(t.date || t.created_date) >= cutoff);
  }, [transactions, period, dateRange]);

  const filtered = useMemo(() => {
    let list = filteredByPeriod;
    if (filterEnterprise !== "all") list = list.filter(t => t.enterprise === filterEnterprise);
    if (filterSource !== "all") list = list.filter(t => (t.source || "manual") === filterSource);
    if (filterTag !== "all") list = list.filter(t => (t.tags || []).includes(filterTag));
    return list;
  }, [filteredByPeriod, filterEnterprise, filterSource, filterTag]);

  // KPI calculations
  const totalRevenue    = filtered.filter(t => REVENUE_TYPES.includes(t.transaction_type) && t.payment_status === "paid").reduce((s, t) => s + (t.net_amount || t.amount || 0), 0);
  const totalExpenses   = filtered.filter(t => EXPENSE_TYPES.includes(t.transaction_type) && t.payment_status === "paid").reduce((s, t) => s + (t.net_amount || t.amount || 0), 0);
  const totalOutstanding = filtered.filter(t => t.payment_status === "unpaid" && REVENUE_TYPES.includes(t.transaction_type)).reduce((s, t) => s + (t.net_amount || t.amount || 0), 0);
  const overdueCount    = filtered.filter(t => t.payment_status === "unpaid" && t.due_date && new Date(t.due_date) < new Date() && REVENUE_TYPES.includes(t.transaction_type)).length;
  const draftCount      = filtered.filter(t => t.status === "draft").length;
  const netIncome       = totalRevenue - totalExpenses;

  const fmt = (n) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const handlePost = async (tx) => {
    const existing = await base44.entities.Transaction.filter({ company_id: currentUser.company_id, enterprise: tx.enterprise }).catch(() => []);
    const enterprise = enterprises.find(e => e.enterprise_name === tx.enterprise);
    const invoiceNumber = generateInvoiceNumber(enterprise, existing);
    await base44.entities.Transaction.update(tx.id, { status: "posted", invoice_number: invoiceNumber, posted_by: currentUser?.email, posted_date: new Date().toISOString() });

    // Stock impact
    for (const type of STOCK_IMPACT_TYPES) {
      if (tx.transaction_type === type) {
        for (const line of (tx.line_items || [])) {
          const matched = products.find(p => p.name === line.item_name);
          if (matched && line.quantity) await base44.entities.Product.update(matched.id, { stock_quantity: (parseFloat(matched.stock_quantity) || 0) - (parseFloat(line.quantity) || 0) });
        }
      }
    }
    for (const type of STOCK_IN_TYPES) {
      if (tx.transaction_type === type) {
        for (const line of (tx.line_items || [])) {
          const matched = products.find(p => p.name === line.item_name);
          if (matched && line.quantity) await base44.entities.Product.update(matched.id, { stock_quantity: (parseFloat(matched.stock_quantity) || 0) + (parseFloat(line.quantity) || 0) });
        }
      }
    }

    qc.invalidateQueries({ queryKey: ["transactions"] });
    qc.refetchQueries({ queryKey: ["transactions"] });
    qc.invalidateQueries({ queryKey: ["products"] });
    qc.refetchQueries({ queryKey: ["products"] });
    setPostTarget(null);
    toast({ title: `Invoice ${invoiceNumber} posted`, description: `$${tx.amount} invoice posted.` });
  };

  const handleVoid = async (tx, reason) => {
    await base44.entities.Transaction.update(tx.id, { status: "voided", voided_reason: reason, voided_by: currentUser?.email, voided_date: new Date().toISOString() });

    // Reverse stock
    for (const type of STOCK_IMPACT_TYPES) {
      if (tx.transaction_type === type) {
        for (const line of (tx.line_items || [])) {
          const matched = products.find(p => p.name === line.item_name);
          if (matched && line.quantity) await base44.entities.Product.update(matched.id, { stock_quantity: (parseFloat(matched.stock_quantity) || 0) + (parseFloat(line.quantity) || 0) });
        }
      }
    }
    for (const type of STOCK_IN_TYPES) {
      if (tx.transaction_type === type) {
        for (const line of (tx.line_items || [])) {
          const matched = products.find(p => p.name === line.item_name);
          if (matched && line.quantity) await base44.entities.Product.update(matched.id, { stock_quantity: (parseFloat(matched.stock_quantity) || 0) - (parseFloat(line.quantity) || 0) });
        }
      }
    }
    qc.invalidateQueries({ queryKey: ["transactions"] });
    qc.refetchQueries({ queryKey: ["transactions"] });
    qc.invalidateQueries({ queryKey: ["products"] });
    qc.refetchQueries({ queryKey: ["products"] });
    setVoidTarget(null);
    toast({ title: "Transaction voided" });
  };

  const handleMarkPaid = async (tx) => {
    await base44.entities.Transaction.update(tx.id, {
      payment_status: "paid",
      payment_date:   new Date().toISOString().slice(0, 10),
      status:         "reconciled",
    });
    qc.invalidateQueries({ queryKey: ["transactions"] });
    qc.refetchQueries({ queryKey: ["transactions"] });
    toast({ title: "Payment recorded", description: `${tx.invoice_number || "Transaction"} marked as paid.` });
  };

  const handleBulkVoid = async () => {
    for (const id of selectedIds) {
      await base44.entities.Transaction.update(id, { status: "voided", voided_by: currentUser?.email, voided_date: new Date().toISOString() });
    }
    qc.invalidateQueries({ queryKey: ["transactions"] });
    qc.refetchQueries({ queryKey: ["transactions"] });
    toast({ title: `${selectedIds.length} transactions voided` });
    setSelectedIds([]);
  };

  const handleBulkDelete = async () => {
    for (const id of selectedIds) await base44.entities.Transaction.delete(id);
    qc.invalidateQueries({ queryKey: ["transactions"] });
    qc.refetchQueries({ queryKey: ["transactions"] });
    triggerETL("transaction");
    toast({ title: `${selectedIds.length} transactions deleted` });
    setSelectedIds([]);
  };

  const handleDeleteAll = async () => {
    for (const t of transactions) await base44.entities.Transaction.delete(t.id);
    qc.invalidateQueries({ queryKey: ["transactions"] });
    qc.refetchQueries({ queryKey: ["transactions"] });
    toast({ title: `All ${transactions.length} transactions deleted` });
  };

  const activeTabConfig = TABS.find(t => t.id === activeTab);
  const searchFiltered = search ? fuzzyFilter(filtered, search, ["description", "enterprise", "primary_person", "invoice_number", "counterparty", "service_name"]) : filtered;
  const tabTransactions = searchFiltered.filter(activeTabConfig?.filter || (() => true));

  if (currentUser && !perms.l4_view && !isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-slate-400">
        <Lock className="w-8 h-8" />
        <p className="font-medium">You don't have access to Transactions.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Transactions"
        subtitle="Financial ledger — revenue, expenses, and inventory movements"
        onAdd={perms.l4_create_draft ? () => { setEditing(null); setFormOpen(true); } : undefined}
        addLabel="New Transaction"
      >
        {perms.l4_create_draft && (
          <Button variant="outline" size="sm" className="rounded-xl" onClick={() => setImportOpen(true)}>
            <Upload className="w-4 h-4 mr-2" /> Import
          </Button>
        )}
        <ExportCSVButton
          data={tabTransactions}
          fields={["date","transaction_type","description","enterprise","primary_person","amount","net_amount","currency","payment_status","status","invoice_number"]}
          filename="transactions_export"
        />
        {perms.l4_void && transactions.length > 0 && (
          <Button variant="outline" size="sm" className="rounded-xl border-rose-200 text-rose-600 hover:bg-rose-50" onClick={() => setDeleteAllOpen(true)}>
            🗑️ Delete All
          </Button>
        )}
      </PageHeader>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="bg-white border border-slate-100 rounded-2xl p-4">
          <p className="text-xs text-slate-400 mb-1">Revenue Received</p>
          <p className="text-2xl font-black text-emerald-600">${fmt(totalRevenue)}</p>
          <p className="text-[10px] text-slate-400 mt-1">Last {period === "all" ? "all time" : period}</p>
        </div>
        <div className="bg-white border border-slate-100 rounded-2xl p-4">
          <p className="text-xs text-slate-400 mb-1">Total Expenses</p>
          <p className="text-2xl font-black text-rose-500">${fmt(totalExpenses)}</p>
          <p className="text-[10px] text-slate-400 mt-1">Paid out</p>
        </div>
        <div className={`border rounded-2xl p-4 ${netIncome >= 0 ? "bg-emerald-50 border-emerald-100" : "bg-rose-50 border-rose-100"}`}>
          <p className="text-xs text-slate-400 mb-1">Net Income</p>
          <p className={`text-2xl font-black ${netIncome >= 0 ? "text-emerald-700" : "text-rose-600"}`}>
            {netIncome >= 0 ? "+" : ""}${fmt(Math.abs(netIncome))}
          </p>
          <p className="text-[10px] text-slate-400 mt-1">Revenue minus expenses</p>
        </div>
        <div className={`border rounded-2xl p-4 ${totalOutstanding > 0 ? "bg-amber-50 border-amber-100" : "bg-white border-slate-100"}`}>
          <p className="text-xs text-slate-400 mb-1">Outstanding</p>
          <p className={`text-2xl font-black ${totalOutstanding > 0 ? "text-amber-600" : "text-slate-400"}`}>${fmt(totalOutstanding)}</p>
          <p className="text-[10px] text-slate-400 mt-1">{overdueCount > 0 ? `⚠️ ${overdueCount} overdue` : "Awaiting payment"}</p>
        </div>
        <div className={`border rounded-2xl p-4 ${draftCount > 0 ? "bg-blue-50 border-blue-100" : "bg-white border-slate-100"}`}>
          <p className="text-xs text-slate-400 mb-1">Drafts to Review</p>
          <p className={`text-2xl font-black ${draftCount > 0 ? "text-blue-600" : "text-slate-400"}`}>{draftCount}</p>
          <p className="text-[10px] text-slate-400 mt-1">{draftCount > 0 ? "Post to activate invoices" : "All invoices posted"}</p>
        </div>
      </div>

      {/* P&L visual bar — shows revenue vs expense proportion */}
      {(totalRevenue > 0 || totalExpenses > 0) && (() => {
        const total = totalRevenue + totalExpenses;
        const revPct = total > 0 ? Math.round((totalRevenue / total) * 100) : 0;
        const expPct = 100 - revPct;
        const margin = totalRevenue > 0 ? Math.round((netIncome / totalRevenue) * 100) : 0;
        return (
          <div className="bg-white border border-slate-100 rounded-2xl px-4 py-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-slate-600">P&L Overview</p>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${margin >= 0 ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
                {margin >= 0 ? "+" : ""}{margin}% margin
              </span>
            </div>
            <div className="flex h-2.5 rounded-full overflow-hidden gap-0.5">
              {revPct > 0 && (
                <div
                  className="bg-emerald-400 rounded-l-full transition-all"
                  style={{ width: `${revPct}%` }}
                  title={`Revenue ${revPct}%`}
                />
              )}
              {expPct > 0 && (
                <div
                  className="bg-rose-400 rounded-r-full transition-all"
                  style={{ width: `${expPct}%` }}
                  title={`Expenses ${expPct}%`}
                />
              )}
            </div>
            <div className="flex items-center gap-4 mt-1.5">
              <span className="flex items-center gap-1 text-[10px] text-slate-500">
                <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" /> Revenue {revPct}%
              </span>
              <span className="flex items-center gap-1 text-[10px] text-slate-500">
                <span className="w-2 h-2 rounded-full bg-rose-400 inline-block" /> Expenses {expPct}%
              </span>
            </div>
          </div>
        );
      })()}

      {/* Person ledger — search by name to see all their transactions */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
          <input
            value={personLedger}
            onChange={(e) => setPersonLedger(e.target.value)}
            placeholder="View ledger by person…"
            className="w-full pl-8 pr-8 py-2 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-slate-200"
          />
          {personLedger && (
            <button onClick={() => setPersonLedger("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs">✕</button>
          )}
        </div>
        {personLedger && <span className="text-xs text-slate-400">↓ ledger below</span>}
      </div>
      {personLedger.trim().length >= 2 && (
        <PersonLedgerPanel
          personName={personLedger.trim()}
          transactions={transactions}
          onClose={() => setPersonLedger("")}
        />
      )}

      {/* Period + Enterprise selectors */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Preset quick-select buttons */}
        <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1">
          {[{ value: "7d", label: "7d" }, { value: "30d", label: "30d" }, { value: "90d", label: "90d" }, { value: "year", label: "Year" }, { value: "all", label: "All" }].map(p => (
            <button key={p.value}
              onClick={() => { setPeriod(p.value); setDateRange([null, null]); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${period === p.value && !dateRange[0] ? "bg-white text-slate-700 shadow-sm" : "text-slate-400 hover:text-slate-600"}`}>
              {p.label}
            </button>
          ))}
        </div>

        {/* Blueprint DateRangePicker — custom range overrides the presets */}
        <div style={{ isolation: "isolate" }}>
          <DateRangeInput3
            value={dateRange}
            onChange={(range) => { setDateRange(range); if (range[0] || range[1]) setPeriod(""); }}
            formatDate={d => d ? d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : ""}
            parseDate={str => { const d = new Date(str); return isNaN(d.getTime()) ? null : d; }}
            placeholder="Custom range…"
            shortcuts={false}
            allowSingleDayRange
            maxDate={new Date()}
            popoverProps={{ placement: "bottom-start" }}
            startInputProps={{ style: { fontSize: 12, height: 34, borderRadius: 10, borderColor: dateRange[0] ? "#10b981" : undefined } }}
            endInputProps={{ style: { fontSize: 12, height: 34, borderRadius: 10, borderColor: dateRange[1] ? "#10b981" : undefined } }}
          />
        </div>
        {dateRange[0] && (
          <button
            onClick={() => { setDateRange([null, null]); setPeriod("30d"); }}
            className="text-xs text-slate-400 hover:text-rose-500 transition-colors"
            title="Clear custom range"
          >
            ✕ Clear range
          </button>
        )}
        <select value={filterEnterprise} onChange={e => setFilterEnterprise(e.target.value)}
          className="text-xs border border-slate-200 rounded-xl px-3 py-1.5 bg-white text-slate-600 focus:outline-none">
          <option value="all">All Enterprises</option>
          {enterprises.map(e => <option key={e.id} value={e.enterprise_name}>{e.enterprise_name}</option>)}
        </select>
        <select value={filterSource} onChange={e => setFilterSource(e.target.value)}
          className="text-xs border border-slate-200 rounded-xl px-3 py-1.5 bg-white text-slate-600 focus:outline-none">
          <option value="all">All Sources</option>
          {Object.entries(TRANSACTION_SOURCES).map(([k, v]) => (
            <option key={k} value={k}>{v.icon} {v.label}</option>
          ))}
        </select>

        {/* Tag filter */}
        {(() => {
          const allTags = [...new Set(transactions.flatMap(t => t.tags || []))].sort();
          if (!allTags.length) return null;
          return (
            <select value={filterTag} onChange={e => setFilterTag(e.target.value)}
              className="text-xs border border-slate-200 rounded-xl px-3 py-1.5 bg-white text-slate-600 focus:outline-none">
              <option value="all">All Tags</option>
              {allTags.map(tag => <option key={tag} value={tag}>#{tag}</option>)}
            </select>
          );
        })()}

        {/* Search */}
        <div className="relative ml-auto">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input
            value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search transactions..."
            className="pl-8 pr-8 h-8 text-xs border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-1 focus:ring-emerald-400 w-48"
          />
          {search && <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500"><X className="w-3 h-3" /></button>}
        </div>
      </div>

      {/* Tab navigation */}
      <div className="flex gap-1 overflow-x-auto border-b border-slate-100" style={{ scrollbarWidth: "none" }}>
        {TABS.map(tab => {
          const count = filtered.filter(tab.filter).length;
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold whitespace-nowrap border-b-2 transition-all ${
                activeTab === tab.id ? "border-emerald-500 text-emerald-600" : "border-transparent text-slate-400 hover:text-slate-600"
              }`}>
              {tab.icon} {tab.label}
              {count > 0 && (
                <span className={`text-[9px] rounded-full px-1.5 py-0.5 font-bold ${activeTab === tab.id ? "bg-emerald-100 text-emerald-600" : "bg-slate-100 text-slate-400"}`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <SpreadsheetToolbar
        data={tabTransactions}
        numericFields={[
          { key: "amount",     label: "Amount" },
          { key: "net_amount", label: "Net Amount" },
          { key: "tax_amount", label: "Tax" },
          { key: "discount_amount", label: "Discount" },
        ]}
        selectedIds={selectedIds}
        onSelectAll={() => setSelectedIds(tabTransactions.map((t) => t.id))}
        onClearSelect={() => setSelectedIds([])}
      />

      <BulkActionBar
        selectedIds={selectedIds}
        onClear={() => setSelectedIds([])}
        onDeleteSelected={perms.l4_void ? handleBulkDelete : undefined}
        canDelete={perms.l4_void}
        extraActions={
          perms.l4_void && selectedIds.length > 0 ? (
            <Button size="sm" variant="outline" className="h-7 border-amber-400 text-amber-300 hover:bg-amber-500/20" onClick={handleBulkVoid}>
              Void {selectedIds.length}
            </Button>
          ) : null
        }
      />

      {/* Transaction list */}
      <div className="space-y-3">
        {tabTransactions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 border-2 border-dashed border-slate-100 rounded-2xl">
            <p className="text-3xl mb-3">{activeTabConfig?.emptyIcon || "📋"}</p>
            <p className="text-slate-500 font-semibold">{activeTabConfig?.emptyMessage}</p>
            <p className="text-slate-400 text-sm mt-1">{activeTabConfig?.emptyDetail}</p>
          </div>
        ) : (
          tabTransactions.map(tx => (
            <div key={tx.id} className="flex items-start gap-2">
              <div className="mt-4 shrink-0">
                <Checkbox
                  checked={selectedIds.includes(tx.id)}
                  onCheckedChange={() => setSelectedIds(prev => prev.includes(tx.id) ? prev.filter(x => x !== tx.id) : [...prev, tx.id])}
                />
              </div>
              <div className="flex-1 min-w-0">
                <TransactionRow
                  transaction={tx}
                  isExpanded={expanded === tx.id}
                  onExpand={(id) => setExpanded(expanded === id ? null : id)}
                  onEdit={(t) => { setEditing(t); setFormOpen(true); }}
                  onMarkPaid={handleMarkPaid}
                  onPost={(t) => setPostTarget(t)}
                  onVoid={(t) => setVoidTarget(t)}
                />
              </div>
            </div>
          ))
        )}
      </div>

      <DeleteAllDialog
        open={deleteAllOpen}
        onClose={() => setDeleteAllOpen(false)}
        onConfirm={handleDeleteAll}
        entityLabel="Transactions"
        count={transactions.length}
      />
      <TransactionForm
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditing(null); }}
        onSubmit={(d) => editing ? updateMut.mutate({ id: editing.id, data: d }) : createMut.mutate(d)}
        initialData={editing}
        enterprises={enterprises}
        people={people}
        services={services}
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
        onClose={() => { setImportOpen(false); qc.invalidateQueries({ queryKey: ["transactions"] }); qc.refetchQueries({ queryKey: ["transactions"] }); }}
        entityName="Transactions"
        fields={TRANSACTION_FIELDS}
        mappingRules={TRANSACTION_MAPPING_RULES}
        templateFileName="newsconseen_transactions_import_template.xlsx"
        templateExample={TRANSACTION_TEMPLATE_EXAMPLE}
        templateInstructions={TRANSACTION_TEMPLATE_INSTRUCTIONS}
        entityFetchFn={() => listFn(base44.entities.Transaction)}
        validateRow={validateTransaction}
        transformRow={transformTransaction}
        onImport={(row) => base44.entities.Transaction.create(withScope(row))}
        currentUser={currentUser}
        previewColumns={[
          { label: "Type",       render: (r) => r.transaction_type || <span className="text-rose-500">MISSING</span> },
          { label: "Date",       render: (r) => r.date || <span className="text-rose-500">MISSING</span> },
          { label: "Enterprise", render: (r) => r.enterprise || "—" },
          { label: "Amount",     render: (r) => r.amount != null ? `$${r.amount}` : "—" },
          { label: "Status",     render: (r) => r.status || "draft" },
        ]}
        requiredField="date"
      />
    </div>
  );
}