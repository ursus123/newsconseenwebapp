import { base44 } from "@/api/base44Client";
import { generateInvoiceNumber } from "./autoInvoice";
import { REVENUE_TYPES, EXPENSE_TYPES, INVENTORY_TYPES } from "@/config/transactionTypes";

/**
 * createTransaction — single source of truth for all transaction creation.
 * Use this everywhere instead of base44.entities.Transaction.create() directly.
 */
export async function createTransaction(data, currentUser, options = {}) {
  const {
    autoPost = false,
    generateNumber = false,
    toast = null,
    existingTransactions = [],
    enterprise = null,
  } = options;

  if (!data.enterprise) throw new Error("Transaction requires an enterprise");
  if (!data.transaction_type) throw new Error("Transaction requires a transaction_type");
  if (!currentUser?.company_id) throw new Error("No company_id — user must be logged in");

  const isInventory = INVENTORY_TYPES.includes(data.transaction_type);
  const isRevenue   = REVENUE_TYPES.includes(data.transaction_type);
  const isExpense   = EXPENSE_TYPES.includes(data.transaction_type);

  const amount    = parseFloat(data.amount) || 0;
  const discount  = parseFloat(data.discount_amount) || 0;
  const tax       = parseFloat(data.tax_amount) || 0;
  const netAmount = amount - discount + tax;
  const status    = autoPost ? "posted" : (data.status || "draft");

  const payload = {
    company_id:       currentUser.company_id,
    enterprise:       data.enterprise,
    created_by:       currentUser.email,
    transaction_type: data.transaction_type,
    description:      data.description || "",
    amount,
    currency:         data.currency || "USD",
    tax_amount:       tax,
    discount_amount:  discount,
    net_amount:       netAmount,
    primary_person:   data.primary_person || "",
    service_id:       data.service_id || null,
    service_name:     data.service_name || "",
    task_id:          data.task_id || null,
    task_title:       data.task_title || "",
    product_id:       data.product_id || null,
    product_name:     data.product_name || "",
    quantity:         data.quantity || null,
    unit:             data.unit || null,
    payment_status:   isInventory ? "not_applicable" : (data.payment_status || "unpaid"),
    payment_method:   data.payment_method || "private_pay",
    payment_date:     data.payment_status === "paid"
      ? (data.payment_date || new Date().toISOString().slice(0, 10))
      : null,
    due_date:         data.due_date || null,
    status,
    notes:            data.notes || "",
    reference_number: data.reference_number || "",
    source:           data.source || "manual",
    date:             data.date || new Date().toISOString().slice(0, 10),
  };

  if (generateNumber && status === "posted" && isRevenue) {
    payload.invoice_number = generateInvoiceNumber(enterprise, existingTransactions);
  }

  const created = await base44.entities.Transaction.create(payload);

  if (toast && created) {
    toast({
      title: isRevenue
        ? (status === "posted" ? `Invoice created — ${payload.invoice_number || "posted"}` : "Draft invoice created")
        : isExpense ? "Expense recorded" : "Stock movement recorded",
      description: `${data.description || data.transaction_type} — ${data.currency || "USD"} ${netAmount.toFixed(2)}`,
    });
  }

  return created;
}

/**
 * createStockTransaction — convenience wrapper for stock movements.
 * Called by MedAdmin, StockCounter, BarcodeScanner, Products page.
 */
export async function createStockTransaction(type, product, quantity, enterprise, currentUser, options = {}) {
  const unitCost   = parseFloat(product.cost_price || 0);
  const totalValue = unitCost * quantity;

  const descriptions = {
    stock_in:         `Stock received: ${product.name} (+${quantity} ${product.unit || "units"})`,
    stock_out:        `Stock dispensed: ${product.name} (${quantity} ${product.unit || "units"})`,
    stock_adjustment: `Stock adjusted: ${product.name} (${quantity} ${product.unit || "units"})`,
  };

  const tx = await createTransaction(
    {
      enterprise,
      transaction_type: type,
      description:      descriptions[type] || `${type}: ${product.name}`,
      amount:           totalValue,
      currency:         "USD",
      product_id:       product.id,
      product_name:     product.name,
      quantity,
      unit:             product.unit || "units",
      payment_status:   "not_applicable",
      status:           "posted",
      source:           options.source || "manual",
      notes:            options.notes || "",
      ...(options.extraFields || {}),
    },
    currentUser,
    { autoPost: true, ...options }
  );

  // Low stock alert after stock_out
  if (type === "stock_out" && options.toast) {
    try {
      const updated = await base44.entities.Product.get(product.id);
      if (updated.stock_quantity != null && updated.stock_quantity <= 0) {
        options.toast({
          title: `🔴 OUT OF STOCK: ${product.name}`,
          description: `${product.name} is completely out of stock. Reorder immediately.`,
          variant: "destructive",
          duration: 12000,
        });
      } else if (
        updated.stock_quantity != null &&
        updated.min_stock_level != null &&
        updated.stock_quantity <= updated.min_stock_level
      ) {
        options.toast({
          title: `⚠️ Low stock: ${product.name}`,
          description: `Only ${updated.stock_quantity} ${product.unit || "units"} remaining. Minimum: ${updated.min_stock_level}. Please reorder soon.`,
          duration: 8000,
        });
      }
    } catch {} // silent fail
  }

  return tx;
}

/**
 * createPayrollTransaction — called by ClockInOut when a timesheet is approved.
 */
export async function createPayrollTransaction(staffMember, hoursWorked, hourlyRate, enterprise, periodStart, periodEnd, currentUser, options = {}) {
  const amount = hoursWorked * hourlyRate;
  return createTransaction(
    {
      enterprise,
      transaction_type: "payroll",
      description:      `Payroll: ${staffMember.first_name} ${staffMember.last_name} — ${hoursWorked}hrs @ $${hourlyRate}/hr (${periodStart} to ${periodEnd})`,
      amount,
      currency:         "USD",
      primary_person:   `${staffMember.first_name} ${staffMember.last_name}`,
      payment_status:   "unpaid",
      payment_method:   "bank_transfer",
      status:           "posted",
      source:           "clockinout",
      notes:            `Period: ${periodStart} to ${periodEnd}`,
      reference_number: `PAY-${periodStart}-${staffMember.id?.slice(0, 6) || ""}`,
      ...(options.extraFields || {}),
    },
    currentUser,
    { autoPost: true, ...options }
  );
}