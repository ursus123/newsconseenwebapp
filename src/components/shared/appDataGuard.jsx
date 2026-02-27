/**
 * App Data Guard — enforces the core rule:
 * "Applications don't change reality — they record actions,
 *  and reality updates itself through transactions."
 *
 * Apps (ClockInOut, MedAdmin, etc.) MUST:
 *   ✅ Read existing master data (People, Enterprises, Items, Addresses)
 *   ✅ Create Tasks (intent layer)
 *   ✅ Trigger Transactions via tasks (fact layer)
 *
 * Apps MUST NOT:
 *   ❌ Create People
 *   ❌ Create Enterprises
 *   ❌ Create Items / Products
 *   ❌ Modify identity fields on master records
 *   ❌ Edit posted transactions
 *   ❌ Write directly to dashboards
 */

const MASTER_DATA_ENTITIES = ["Person", "Enterprise", "Product", "Service", "Address"];

/**
 * Throws an error if a component tries to create master data from within an app context.
 * Usage: guardAppWrite("Person") — throws if called from an app.
 */
export function guardAppWrite(entityName, appName = "App") {
  if (MASTER_DATA_ENTITIES.includes(entityName)) {
    throw new Error(
      `[${appName}] ❌ Data Flow Violation: Applications may not create or modify "${entityName}" records. ` +
      `Use the master data forms (People, Enterprises, Products, Services, Addresses) instead. ` +
      `Apps only create Tasks and trigger Transactions.`
    );
  }
}

/**
 * Wraps a create call with a guard. Safe for use in app components.
 * @param {string} entityName - e.g. "Person"
 * @param {Function} createFn - the actual SDK create call
 * @param {string} appName - for error messages
 */
export async function safeAppCreate(entityName, createFn, appName = "App") {
  guardAppWrite(entityName, appName);
  return createFn();
}

/**
 * Allowed operations from within apps:
 * - Read any entity (list, filter, get)
 * - Create Task
 * - Create Transaction (via task trigger only — enforced by convention)
 * - Update Task (own tasks only — status/outcome)
 */
export const APP_ALLOWED_WRITES = ["Task", "Transaction"];

export function isAppWriteAllowed(entityName) {
  return APP_ALLOWED_WRITES.includes(entityName);
}