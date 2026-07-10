import { ncClient } from "@/api/ncClient";

export async function createInvoiceFromTask(task, service, currentUser) {
  if (task.status !== "completed") return null;
  if (!service?.rate) return null;

  // Check if invoice already exists for this task
  const existing = await ncClient.entities.Transaction.filter({
    task_id: task.id,
    company_id: currentUser.company_id,
  });
  if (existing.length > 0) return null;

  const duration = task.duration_hours || (task.duration_minutes ? task.duration_minutes / 60 : 1);
  const rate = parseFloat(service.rate) || 0;

  let amount = 0;
  if (service.billing_unit === "per_hour" || service.billing_unit === "hour") {
    amount = rate * duration;
  } else if (service.billing_unit === "per_visit" || service.billing_unit === "unit") {
    amount = rate;
  } else if (service.billing_unit === "per_day" || service.billing_unit === "day") {
    amount = rate * (duration / 8);
  } else {
    amount = rate;
  }
  amount = Math.round(amount * 100) / 100;
  if (amount <= 0) return null;

  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 30);

  return await ncClient.entities.Transaction.create({
    company_id:       currentUser.company_id,
    enterprise:       task.enterprise,
    created_by:       currentUser.email,
    transaction_type: "service_fee",
    description:      `${service.name || service.service_name || "Service"} — ${task.title || task.task_type}${task.scheduled_date ? ` (${task.scheduled_date})` : ""}`,
    amount:           amount,
    currency:         "USD",
    tax_amount:       0,
    discount_amount:  0,
    net_amount:       amount,
    primary_person:   task.related_person || task.assigned_to || "",
    service_id:       service.id,
    service_name:     service.name || service.service_name || "",
    task_id:          task.id,
    task_title:       task.title || task.task_type,
    payment_status:   "unpaid",
    payment_method:   "private_pay",
    status:           "draft",
    due_date:         dueDate.toISOString().slice(0, 10),
    date:             new Date().toISOString().slice(0, 10),
    notes:            "Auto-generated from task completion. Review and post to send invoice.",
  });
}

export function generateInvoiceNumber(enterprise, existingTransactions) {
  const year = new Date().getFullYear();
  const code = (enterprise?.enterprise_name || "ENT")
    .replace(/[^A-Za-z]/g, "")
    .toUpperCase()
    .slice(0, 3)
    .padEnd(3, "X");

  const prefix = `INV-${year}-${code}-`;
  const existing = (existingTransactions || [])
    .filter(t => t.invoice_number?.startsWith(prefix))
    .map(t => parseInt(t.invoice_number.replace(prefix, "")))
    .filter(n => !isNaN(n));

  const nextNumber = existing.length > 0 ? Math.max(...existing) + 1 : 1;
  return `${prefix}${String(nextNumber).padStart(4, "0")}`;
}