import { isPast, parseISO } from "date-fns";
import { REVENUE_TYPES } from "@/config/transactionTypes";

/**
 * Shared "needs attention today" predicates — single source of truth for the
 * overdue-task / draft-transaction / overdue-invoice / low-stock filters that
 * were independently reimplemented across NotificationsBell, OverdueTasksAlert,
 * PendingTransactionsAlert, and LowStockAlert.
 */

export function getOverdueTasks(tasks = []) {
  return tasks.filter(
    (t) => t.due_date && t.status !== "completed" && t.status !== "cancelled" && isPast(parseISO(t.due_date))
  );
}

export function getDraftTransactions(transactions = []) {
  return transactions.filter((t) => !t.status || t.status === "draft");
}

export function getOverdueInvoices(transactions = []) {
  return transactions.filter(
    (t) =>
      t.payment_status === "unpaid" &&
      t.status === "posted" &&
      t.due_date &&
      new Date(t.due_date) < new Date() &&
      REVENUE_TYPES.includes(t.transaction_type)
  );
}

export function getLowStockProducts(products = []) {
  return products.filter(
    (p) => p.min_stock_level != null && p.stock_quantity != null && p.stock_quantity < p.min_stock_level
  );
}

/**
 * Priority-tagged "what needs attention today" summary, sorted highest
 * priority first. Consumed by NotificationsBell and the command-center
 * attention list.
 */
export function getAttentionSignals(tasks = [], transactions = [], products = []) {
  const signals = [];

  const overdueTasks = getOverdueTasks(tasks);
  if (overdueTasks.length > 0) signals.push({
    id: "overdue-tasks",
    label: `${overdueTasks.length} overdue task${overdueTasks.length !== 1 ? "s" : ""} need attention`,
    page: "Tasks", priority: 10, count: overdueTasks.length,
  });

  const overdueInvoices = getOverdueInvoices(transactions);
  if (overdueInvoices.length > 0) signals.push({
    id: "overdue-invoices",
    label: `${overdueInvoices.length} invoice${overdueInvoices.length !== 1 ? "s" : ""} overdue for payment`,
    page: "Transactions", priority: 9, count: overdueInvoices.length,
  });

  const draftTx = getDraftTransactions(transactions);
  if (draftTx.length > 0) signals.push({
    id: "draft-tx",
    label: `${draftTx.length} transaction${draftTx.length !== 1 ? "s" : ""} pending posting`,
    page: "Transactions", priority: 8, count: draftTx.length,
  });

  const lowStock = getLowStockProducts(products);
  if (lowStock.length > 0) signals.push({
    id: "low-stock",
    label: `${lowStock.length} product${lowStock.length !== 1 ? "s" : ""} below minimum stock`,
    page: "Products", priority: 7, count: lowStock.length,
  });

  return signals.sort((a, b) => b.priority - a.priority);
}
