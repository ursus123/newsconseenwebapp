/*
 * createTransaction.js — Master Transaction Engine
 * ─────────────────────────────────────────────────
 * This is the SINGLE entry point for all transaction
 * creation across every app in the Newsconseen platform.
 *
 * NO app should call base44.entities.Transaction.create()
 * directly. Every financial or inventory event flows
 * through this file.
 *
 * HOW TO WIRE A NEW APP INTO THE TRANSACTION ENGINE
 * ─────────────────────────────────────────────────
 *
 * STEP 1: Register the source
 *   Add your app to TRANSACTION_SOURCES below.
 *   Example: myapp: { label: "My App", icon: "🔧" }
 *
 * STEP 2: Choose the right wrapper
 *   Stock events     → createStockTransaction()
 *   Payroll events   → createPayrollTransaction()
 *   Service billing  → createServiceTransaction()
 *   Donations/tithes → createDonationTransaction()
 *   Expenses         → createExpenseTransaction()
 *   Anything else    → createTransaction() directly
 *
 * STEP 3: Set source and sourceRef
 *   source:    your app key from TRANSACTION_SOURCES
 *   sourceRef: a unique ID for this specific event
 *              prevents duplicate transactions if
 *              the user taps the button twice
 *
 * STEP 4: checkStockLevel() after every stock_out
 *   Call after any stock_out to trigger low-stock toasts
 *
 * Examples for upcoming apps:
 *
 * Scheduler / Visit Planner:
 *   When a visit is completed → createServiceTransaction()
 *   source: "scheduler", sourceRef: "visit-{visitId}"
 *
 * Invoicer:
 *   When an invoice is sent → createServiceTransaction()
 *   source: "invoicer", autoPost: true, generateNumber: true
 *
 * Purchase Orders:
 *   When PO is received → createExpenseTransaction()
 *   source: "purchase_order", sourceRef: "po-{poId}"
 *
 * Payroll App:
 *   When pay run processed → createPayrollTransaction()
 *   source: "payroll", sourceRef: "payrun-{period}"
 *
 * Point of Sale:
 *   When sale completed → createTransaction() with
 *   type: "product_sale", source: "pos"
 *   sourceRef: "sale-{receiptId}"
 *
 * Farm Manager:
 *   Harvest recorded → createTransaction() with
 *   type: "crop_sale" or "stock_in"
 *   source: "farm", sourceRef: "harvest-{id}"
 *
 * Livestock App:
 *   Animal sold → createTransaction() with
 *   type: "livestock_sale", source: "livestock"
 *   Animal purchased → createExpenseTransaction()
 *   source: "livestock"
 *
 * Donations App:
 *   Offering recorded → createDonationTransaction()
 *   source: "donations", sourceRef: "offering-{id}"
 *
 * Grants App:
 *   Grant received → createDonationTransaction()
 *   type: "grant", source: "grants"
 */

import { base44 } from "@/api/base44Client";
import { generateInvoiceNumber } from "./autoInvoice";
import { REVENUE_TYPES, EXPENSE_TYPES, INVENTORY_TYPES } from "@/config/transactionTypes";

// ─── Source Registry ───────────────────────────────────────────────────────────
// Every app that creates transactions registers itself here.
// Used for source badges in the Transactions page and TransactionsSummary.
export const TRANSACTION_SOURCES = {
  manual:         { label: "Manual Entry",    icon: "✏️" },
  task_complete:  { label: "Task Completed",  icon: "✅" },
  medadmin:       { label: "MedAdmin",        icon: "💊" },
  stockcounter:   { label: "Stock Counter",   icon: "📊" },
  barcode:        { label: "Barcode Scanner", icon: "📷" },
  clockinout:     { label: "Clock In/Out",    icon: "⏰" },
  scheduler:      { label: "Scheduler",       icon: "📅" },
  invoicer:       { label: "Invoicer",        icon: "🧾" },
  purchase_order: { label: "Purchase Orders", icon: "📋" },
  payroll:        { label: "Payroll",         icon: "💵" },
  expenses:       { label: "Expenses",        icon: "🧾" },
  budget:         { label: "Budget Planner",  icon: "📐" },
  pos:            { label: "Point of Sale",   icon: "🛒" },
  farm:           { label: "Farm Manager",    icon: "🌾" },
  livestock:      { label: "Livestock",       icon: "🐄" },
  donations:      { label: "Donations",       icon: "🙏" },
  grants:         { label: "Grants",          icon: "🏛️" },
  import:         { label: "Imported",        icon: "📥" },
};

// ─── Master Creator ────────────────────────────────────────────────────────────
/**
 * createTransaction — all apps call this.
 * Never call base44.entities.Transaction.create() directly.
 *
 * @param {object} fields        — transaction field values
 * @param {object} options       — behaviour options
 * @param {object} currentUser   — from base44.auth.me()
 * @returns {object} created transaction record
 */
export async function createTransaction(fields, options = {}, currentUser) {
  const {
    autoPost        = false,
    generateNumber  = false,
    toast           = null,
    existingTransactions = [],
    enterprise      = null,
    skipDupeCheck   = false,
    sourceRef       = null,
  } = options;

  if (!fields.transaction_type) throw new Error("createTransaction: transaction_type required");
  if (fields.amount == null)    throw new Error("createTransaction: amount required");
  if (!currentUser?.company_id) throw new Error("createTransaction: currentUser with company_id required");

  const isInventory = INVENTORY_TYPES.includes(fields.transaction_type);
  const isRevenue   = REVENUE_TYPES.includes(fields.transaction_type);

  // Duplicate guard — same source + sourceRef = same event
  if (!skipDupeCheck && sourceRef && fields.source) {
    const existing = await base44.entities.Transaction.filter({
      company_id: currentUser.company_id,
      source:     fields.source,
      source_ref: sourceRef,
    }).catch(() => []);
    if (existing.length > 0) {
      console.warn("createTransaction: duplicate blocked", fields.source, sourceRef);
      return existing[0];
    }
  }

  const amount    = parseFloat(fields.amount)          || 0;
  const tax       = parseFloat(fields.tax_amount)      || 0;
  const discount  = parseFloat(fields.discount_amount) || 0;
  const netAmount = Math.round((amount - discount + tax) * 100) / 100;
  const status    = autoPost ? "posted" : (fields.status || "draft");

  let invoiceNumber = fields.invoice_number || null;
  if (autoPost && generateNumber && isRevenue) {
    invoiceNumber = generateInvoiceNumber(enterprise, existingTransactions);
  }

  const record = {
    company_id:       currentUser.company_id,
    created_by:       currentUser.email,
    date:             fields.date || new Date().toISOString().slice(0, 10),

    enterprise:       fields.enterprise       || "",
    transaction_type: fields.transaction_type,
    description:      fields.description      || "",
    amount,
    currency:         fields.currency         || "USD",
    tax_amount:       tax,
    discount_amount:  discount,
    net_amount:       netAmount,

    primary_person:   fields.primary_person   || "",
    service_id:       fields.service_id       || null,
    service_name:     fields.service_name     || "",
    task_id:          fields.task_id          || null,
    task_title:       fields.task_title       || "",
    product_id:       fields.product_id       || null,
    product_name:     fields.product_name     || "",
    quantity:         fields.quantity         || null,
    unit:             fields.unit             || null,

    payment_status:   isInventory ? "na" : (fields.payment_status || "unpaid"),
    payment_method:   fields.payment_method   || "private_pay",
    payment_date:     fields.payment_date     || null,
    due_date:         fields.due_date         || null,
    invoice_number:   invoiceNumber,
    reference_number: fields.reference_number || "",

    status,
    notes:            fields.notes            || "",
    attachment_url:   fields.attachment_url   || "",

    // Source tracking — critical for understanding data origin
    source:           fields.source           || "manual",
    source_ref:       sourceRef,

    period_start:     fields.period_start     || null,
    period_end:       fields.period_end       || null,
  };

  let created = await base44.entities.Transaction.create(record);
  if (created?.id && created.company_id !== currentUser.company_id) {
    await base44.entities.Transaction.update(created.id, { company_id: currentUser.company_id });
    created = { ...created, company_id: currentUser.company_id };
  }

  if (toast && created) {
    toast({
      title: isRevenue
        ? (status === "posted" ? `Invoice ${invoiceNumber || "posted"}` : "Draft invoice created")
        : "Transaction recorded",
      description: `${fields.description || fields.transaction_type} — ${fields.currency || "USD"} ${netAmount.toFixed(2)}`,
    });
  }

  return created;
}

// ─── Stock Wrapper ─────────────────────────────────────────────────────────────
/**
 * createStockTransaction — for stock in / out / adjustment.
 * Used by: MedAdmin, StockCounter, BarcodeScanner, Farm Manager,
 *          Livestock, POS, and any future inventory app.
 */
export async function createStockTransaction(type, product, quantity, enterprise, currentUser, options = {}) {
  const typeLabels = {
    stock_in:         "Stock Received",
    stock_out:        "Stock Used",
    stock_adjustment: "Stock Count Adjusted",
  };
  const name = product.name || product.product_name || "";
  const unit = product.unit || "units";
  const qty  = Math.abs(quantity);

  const tx = await createTransaction(
    {
      enterprise,
      transaction_type: type,
      description:      `${typeLabels[type] || type}: ${name} — ${qty} ${unit}`,
      amount:           qty * (parseFloat(product.cost_price) || 0),
      currency:         "USD",
      product_id:       product.id,
      product_name:     name,
      quantity,
      unit,
      payment_status:   "na",
      status:           "posted",
      source:           options.source || "manual",
      notes:            options.notes  || "",
    },
    {
      autoPost:      true,
      skipDupeCheck: options.skipDupeCheck || false,
      sourceRef:     options.sourceRef     || null,
      enterprise:    null,
    },
    currentUser
  );

  // Low stock check after stock_out
  if (type === "stock_out" && options.toast) {
    try {
      const updated = await base44.entities.Product.get(product.id);
      checkStockLevel(updated, quantity, options.toast);
    } catch {} // silent fail — never block the main flow
  }

  return tx;
}

// ─── Payroll Wrapper ───────────────────────────────────────────────────────────
/**
 * createPayrollTransaction — for wage / salary / shift payments.
 * Used by: ClockInOut, Payroll app, and future HR apps.
 */
export async function createPayrollTransaction(staffMember, hoursWorked, hourlyRate, enterprise, periodStart, periodEnd, currentUser, options = {}) {
  const rate   = parseFloat(hourlyRate || staffMember?.hourly_rate) || 0;
  const amount = Math.round(hoursWorked * rate * 100) / 100;
  const name   = staffMember.name || staffMember.full_name || staffMember.email || "";
  const periodLabel = periodStart && periodEnd ? ` (${periodStart} to ${periodEnd})` : "";

  return createTransaction(
    {
      enterprise,
      transaction_type: "payroll",
      description:      `Wages: ${name}${periodLabel}`,
      amount,
      currency:         "USD",
      primary_person:   name,
      payment_status:   "unpaid",
      payment_method:   "bank_transfer",
      period_start:     periodStart || null,
      period_end:       periodEnd   || null,
      reference_number: `PAY-${periodStart || new Date().toISOString().slice(0,10)}-${(staffMember.id || "").slice(0, 6)}`,
      source:           options.source || "clockinout",
      notes:            `${hoursWorked} hours × $${rate}/hr = $${amount}`,
    },
    {
      autoPost:   true,
      sourceRef:  options.sourceRef || null,
      enterprise: null,
    },
    currentUser
  );
}

// ─── Service Billing Wrapper ───────────────────────────────────────────────────
/**
 * createServiceTransaction — for billing a service to a client.
 * Used by: Scheduler, Invoicer, task completion, and future apps.
 */
export async function createServiceTransaction(service, client, enterprise, quantity, currentUser, options = {}) {
  const rate        = parseFloat(service.rate || service.billing_rate || service.price) || 0;
  const qty         = parseFloat(quantity) || 1;
  const billingUnit = service.billing_unit || "flat";

  let amount = 0;
  if (["per_hour", "hour"].includes(billingUnit))    amount = rate * qty;
  else if (["per_visit", "unit"].includes(billingUnit)) amount = rate * qty;
  else if (["per_day", "day"].includes(billingUnit)) amount = rate * qty;
  else amount = rate;
  amount = Math.round(amount * 100) / 100;

  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 30);
  const clientName = typeof client === "string" ? client : (client?.name || client?.full_name || "");

  return createTransaction(
    {
      transaction_type: "service_fee",
      description:      `${service.service_name || service.name}${clientName ? ` — ${clientName}` : ""}`,
      amount,
      enterprise,
      primary_person:   clientName,
      service_id:       service.id,
      service_name:     service.service_name || service.name || "",
      quantity:         qty,
      unit:             billingUnit,
      payment_status:   "unpaid",
      payment_method:   "private_pay",
      due_date:         dueDate.toISOString().slice(0, 10),
      source:           options.source || "manual",
      notes:            options.notes  || "",
    },
    {
      autoPost:   options.autoPost  || false,
      sourceRef:  options.sourceRef || null,
      enterprise: null,
    },
    currentUser
  );
}

// ─── Donation Wrapper ──────────────────────────────────────────────────────────
/**
 * createDonationTransaction — for donations, tithes, offerings, grants.
 * Used by: Donations app, Grants app, and future apps.
 */
export async function createDonationTransaction(donor, amount, type, enterprise, currentUser, options = {}) {
  const donorName = typeof donor === "string" ? donor : (donor?.name || donor?.full_name || "Anonymous");
  const typeLabel = type === "tithe" ? "Tithe/Offering" : type === "grant" ? "Grant Received" : "Donation";

  return createTransaction(
    {
      transaction_type: type || "donation",
      description:      `${typeLabel} — ${donorName}`,
      amount:           parseFloat(amount) || 0,
      enterprise,
      primary_person:   donorName,
      payment_status:   options.paymentStatus || "paid",
      payment_method:   options.paymentMethod || "cash",
      payment_date:     options.paymentDate   || new Date().toISOString().slice(0, 10),
      source:           options.source        || "donations",
      notes:            options.notes         || "",
    },
    {
      autoPost:   true,
      sourceRef:  options.sourceRef || null,
      enterprise: null,
    },
    currentUser
  );
}

// ─── Expense Wrapper ───────────────────────────────────────────────────────────
/**
 * createExpenseTransaction — for any outgoing payment.
 * Used by: Expenses app, Purchase Orders, and future apps.
 */
export async function createExpenseTransaction(type, description, amount, enterprise, currentUser, options = {}) {
  return createTransaction(
    {
      transaction_type: type,
      description,
      amount:           parseFloat(amount) || 0,
      enterprise,
      primary_person:   options.supplier         || "",
      payment_status:   options.paymentStatus    || "unpaid",
      payment_method:   options.paymentMethod    || "bank_transfer",
      due_date:         options.dueDate          || null,
      reference_number: options.referenceNumber  || "",
      product_id:       options.productId        || null,
      product_name:     options.productName      || "",
      source:           options.source           || "expenses",
      notes:            options.notes            || "",
    },
    {
      autoPost:   options.autoPost !== undefined ? options.autoPost : true,
      sourceRef:  options.sourceRef || null,
      enterprise: null,
    },
    currentUser
  );
}

// ─── Low Stock Check Utility ───────────────────────────────────────────────────
/**
 * checkStockLevel — call after ANY stock_out from any app.
 * Fires a toast if stock is at or below the minimum level.
 *
 * @param {object} product      — product object (should have current stock_quantity)
 * @param {number} quantityUsed — quantity just consumed
 * @param {function} toastFn    — toast function from useToast()
 */
export function checkStockLevel(product, quantityUsed, toastFn) {
  if (!product || !toastFn) return;

  const name      = product.product_name || product.name || "Item";
  const remaining = (product.stock_quantity || 0) - Math.abs(quantityUsed || 0);
  const minLevel  = product.min_stock_level || product.reorder_level || 5;
  const unit      = product.unit || "units";

  if (remaining <= 0) {
    toastFn({
      title:       "⛔ Out of stock",
      description: `${name} is now OUT OF STOCK. Reorder immediately.`,
      variant:     "destructive",
    });
  } else if (remaining <= minLevel) {
    toastFn({
      title:       "⚠️ Low stock",
      description: `${name}: ${remaining} ${unit} remaining — below minimum of ${minLevel}.`,
      className:   "bg-amber-50 border-amber-200 text-amber-800",
    });
  }
}
