/**
 * useTaxonomySync
 *
 * Manages "pending sync" state when taxonomy values (MasterDataOption)
 * are created or modified.
 *
 * Because TaxonomySelect is a protected component and addCustomOption()
 * fires inside the protected useTaxonomy hook, we cannot intercept
 * taxonomy saves directly.  Instead, pages call notifyTaxonomyChange()
 * at the point where a form is submitted — by then any new taxonomy
 * values have already been written to Base44 and we can fire the ETL.
 *
 * Flow:
 *   1. User adds "Custom Nurse Specialist" in a subtype field
 *      → useTaxonomy.addCustomOption() writes to Base44 immediately
 *   2. User completes the form and saves
 *      → page calls notifyTaxonomyChange("person", companyId)
 *      → frontend shows "Syncing analytics…" badge
 *   3. POST /webhook/taxonomy runs ETL for the entity synchronously
 *      → when response returns, badge changes to "Analytics synced ✓"
 *   4. Badge auto-clears after 4 seconds
 *
 * Usage:
 *   const { syncState, notifyTaxonomyChange } = useTaxonomySync();
 *
 *   // After form save that may contain taxonomy changes:
 *   notifyTaxonomyChange("person", currentUser?.company_id);
 *
 *   // In JSX:
 *   <ETLSyncBanner syncState={syncState} entityType="person" />
 */

import { useState, useCallback } from "react";

const RAILWAY_URL = "https://newsconseenwebapp-production.up.railway.app";

// Delay (ms) before the "synced" badge auto-clears
const BADGE_CLEAR_DELAY = 4000;

export function useTaxonomySync() {
  // syncState: { [entityType]: "syncing" | "synced" | "error" }
  const [syncState, setSyncState] = useState({});

  /**
   * notifyTaxonomyChange(entityType, companyId, meta?)
   *
   * @param {string} entityType  Base44 entity type: "person", "enterprise",
   *                             "item", "task", "transaction", "address",
   *                             "relationship", "service"
   * @param {string} companyId   Tenant company_id — scopes the ETL run
   * @param {object} [meta]      Optional { fieldName, value } for logging
   */
  const notifyTaxonomyChange = useCallback(async (
    entityType,
    companyId,
    meta = {},
  ) => {
    if (!entityType) return;

    setSyncState(s => ({ ...s, [entityType]: "syncing" }));

    try {
      const res = await fetch(`${RAILWAY_URL}/webhook/taxonomy`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          entity_type: entityType,
          field_name:  meta.fieldName  ?? null,
          value:       meta.value      ?? null,
          company_id:  companyId       ?? null,
        }),
      });

      if (res.ok) {
        setSyncState(s => ({ ...s, [entityType]: "synced" }));
        // Auto-clear after badge is shown
        setTimeout(() => {
          setSyncState(s => {
            if (s[entityType] !== "synced") return s;
            const next = { ...s };
            delete next[entityType];
            return next;
          });
        }, BADGE_CLEAR_DELAY);
      } else {
        setSyncState(s => ({ ...s, [entityType]: "error" }));
      }
    } catch {
      // python_layer unreachable — silently set error, never block UI
      setSyncState(s => ({ ...s, [entityType]: "error" }));
    }
  }, []);

  /**
   * clearSync(entityType) — manually dismiss any badge
   */
  const clearSync = useCallback((entityType) => {
    setSyncState(s => {
      const next = { ...s };
      delete next[entityType];
      return next;
    });
  }, []);

  return { syncState, notifyTaxonomyChange, clearSync };
}
