/**
 * Data Flow Engine — Layer 3 → Layer 4
 * When a task completes and has trigger_transaction=true,
 * this creates the appropriate Transaction record automatically.
 *
 * Rule: Apps never write master data. Tasks record intent.
 * Transactions record facts. Dashboards read facts.
 */

import { base44 } from "@/api/base44Client";

function todayStr() {
  return new Date().toISOString().split("T")[0];
}

function nowTimeStr() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/**
 * Call this after saving a task that has:
 *   status = "completed"
 *   trigger_transaction = true
 *   transaction_type = <one of the valid types>
 *
 * Returns the created Transaction or null if no transaction was triggered.
 */
export async function triggerTaskTransaction(task, performingUser) {
  // Guard: only fire if task is completed AND explicitly set to trigger
  if (!task || task.status !== "completed" || !task.trigger_transaction || !task.transaction_type) {
    return null;
  }

  const basePayload = {
    transaction_type: task.transaction_type,
    status: "posted",
    date: task.scheduled_date || todayStr(),
    time: task.scheduled_time || nowTimeStr(),
    enterprise: task.enterprise || null,
    description: `Auto-triggered by task: ${task.title}`,
    assigned_person: task.related_person || null,
    internal_notes: [
      `Task ref: ${task.id}`,
      `Task type: ${task.task_type}`,
      `Performed by: ${performingUser?.full_name || performingUser?.email || "system"}`,
    ].join(" | "),
  };

  // Add line items for stock-related transactions
  if (
    ["stock_out", "stock_in", "stock_transfer"].includes(task.transaction_type) &&
    task.related_item
  ) {
    basePayload.line_items = [{
      item_name: task.related_item,
      quantity: 1,
      unit: "piece",
      unit_price: 0,
    }];
  }

  // For transfers, carry from/to enterprise
  if (task.transaction_type === "stock_transfer") {
    basePayload.from_enterprise = task.enterprise || null;
  }

  return base44.entities.Transaction.create(basePayload);
}

/**
 * Post an attendance transaction for Clock-In or Clock-Out.
 * This is the Step 3 enforcement for the ClockInOut app.
 */
export async function triggerAttendanceTransaction(taskType, task, performingUser) {
  if (!["clock_in", "clock_out", "shift_start", "shift_end"].includes(taskType)) return null;

  return base44.entities.Transaction.create({
    transaction_type: "adjustment",          // closest built-in type for time/attendance
    status: "posted",
    date: task.scheduled_date || todayStr(),
    time: task.scheduled_time || nowTimeStr(),
    enterprise: task.enterprise || null,
    description: `Attendance — ${taskType === "clock_in" || taskType === "shift_start" ? "Clock In" : "Clock Out"}: ${task.assigned_to_name || performingUser?.full_name || performingUser?.email}`,
    assigned_person: task.assigned_to_name || null,
    internal_notes: [
      `Task type: ${taskType}`,
      `Task ref: ${task.id}`,
      task.outcome_notes || "",
    ].filter(Boolean).join(" | "),
  });
}