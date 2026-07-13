/**
 * Data Flow Engine — Layer 3 → Layer 4
 * When a task completes and has trigger_transaction=true,
 * this creates the appropriate Transaction record automatically.
 */

import { createTransaction } from "@/utils/createTransaction";

function todayStr() {
  return new Date().toISOString().split("T")[0];
}
function nowTimeStr() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// Derive transaction type from task_type
const TASK_TYPE_TO_TX_TYPE = {
  clock_in: "adjustment",
  clock_out: "adjustment",
  shift_start: "adjustment",
  shift_end: "adjustment",
  medication_admin: "stock_out",
  delivery_task: "stock_out",
  delivery_confirmation: "stock_out",
  maintenance: "expense",
  preventive_maintenance: "expense",
  repair: "expense",
  stock_counting: "adjustment",
  inventory_inspection: "adjustment",
  shelf_restocking: "stock_in",
  receiving_verification: "stock_in",
  sale_service: "sale_service",
  customer_support: "sale_service",
  expense_preparation: "expense",
  payment_followup: "expense",
};

export function deriveTransactionType(task) {
  // Explicit override from task form takes priority
  if (task.transaction_type) return task.transaction_type;
  return TASK_TYPE_TO_TX_TYPE[task.task_type] || "adjustment";
}

/**
 * Call this after saving a task that has:
 *   status = "completed"
 *   trigger_transaction = true
 *
 * Returns the created Transaction or null.
 */
export async function triggerTaskTransaction(task, performingUser) {
  if (!task || task.status !== "completed" || !task.trigger_transaction) {
    return null;
  }

  const txType = deriveTransactionType(task);

  const payload = {
    transaction_type: txType,
    status: "draft", // manager posts manually
    date: task.scheduled_date || todayStr(),
    time: task.scheduled_time || nowTimeStr(),
    enterprise: task.enterprise || null,
    primary_person: task.assigned_to_name || null,
    assigned_person: task.assigned_to_name || null,
    source_task_id: task.id,
    description: `Auto-generated from task: ${task.title}`,
    internal_notes: [
      `Task ref: ${task.id}`,
      `Task type: ${task.task_type}`,
      `Performed by: ${performingUser?.full_name || performingUser?.email || "system"}`,
    ].join(" | "),
  };

  // Add line items for stock-related types
  if (["stock_out", "stock_in", "stock_transfer"].includes(txType) && task.related_item) {
    payload.line_items = [{
      item_name: task.related_item,
      quantity: 1,
      unit: "piece",
      unit_price: 0,
    }];
  }

  // Route through the master engine
  if (!performingUser?.company_id) {
    throw new Error("Cannot create a transaction without a workspace company_id.");
  }
  return createTransaction(
    { ...payload, source: "task_complete", amount: payload.amount || 0 },
    { autoPost: false, sourceRef: `task-${task.id}` },
    performingUser
  );
}

/**
 * Post an attendance transaction for Clock-In or Clock-Out.
 */
export async function triggerAttendanceTransaction(taskType, task, performingUser) {
  if (!["clock_in", "clock_out", "shift_start", "shift_end"].includes(taskType)) return null;
  if (!performingUser?.company_id) return null;

  return createTransaction(
    {
      transaction_type: "attendance",
      enterprise:       task.enterprise || "",
      description:      `Attendance — ${["clock_in", "shift_start"].includes(taskType) ? "Clock In" : "Clock Out"}: ${task.assigned_to_name || performingUser?.full_name || performingUser?.email}`,
      amount:           0,
      primary_person:   task.assigned_to_name || performingUser?.full_name || "",
      task_id:          task.id,
      source:           "clockinout",
      date:             task.scheduled_date || todayStr(),
    },
    { autoPost: true, sourceRef: `attendance-${task.id}` },
    performingUser
  );
}

/**
 * createPayrollFromShift — call when a supervisor approves a completed shift.
 * Creates a payroll transaction for the staff member's hours.
 */
export async function createPayrollFromShift(shift, hoursWorked, hourlyRate, currentUser) {
  if (!currentUser?.company_id) return null;
  const { createPayrollTransaction } = await import("@/utils/createTransaction");
  return createPayrollTransaction(
    {
      id:         shift.staff_id || shift.id,
      name:       shift.assigned_to_name || shift.staff_name || "",
      email:      shift.assigned_to_email || shift.staff_email || "",
      hourly_rate: hourlyRate || 0,
    },
    hoursWorked,
    hourlyRate || 0,
    shift.enterprise || currentUser.company_id,
    shift.scheduled_date || todayStr(),
    shift.scheduled_date || todayStr(),
    currentUser,
    { source: "clockinout", sourceRef: `shift-${shift.id}` }
  );
}