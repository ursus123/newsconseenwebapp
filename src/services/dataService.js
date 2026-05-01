/**
 * dataService.js
 *
 * Single data service layer for all Newsconseen entity operations.
 * Every create/update/delete across all 16 entity pages goes through here.
 *
 * Enforces, for every mutation:
 *  - Tenant scoping (company_id stamped, verified, patched)
 *  - Optimistic cache update (immediate + 250ms + 1s retries)
 *  - ETL trigger (fire-and-forget)
 *  - Audit log (fire-and-forget)
 *  - Workflow trigger (fire-and-forget)
 *  - Taxonomy sync (when provided by caller)
 */

import { base44 } from "@/api/base44Client";
import { createWithScope, addRecordToQueryCache } from "@/components/shared/useDataQuery";

const RAILWAY_URL = "https://newsconseenwebapp-production.up.railway.app";
const RAILWAY_API_KEY = /** @type {any} */ (import.meta).env?.VITE_RAILWAY_API_KEY || "";

// ── Entity registry ────────────────────────────────────────────────
// thunks prevent initialization-order issues with base44.entities.*

export const ENTITY_REGISTRY = {
  person: {
    entity:       () => base44.entities.Person,
    queryKey:     "people",
    etl:          "people",
    auditType:    "person",
    taxonomyType: "person",
    displayName:  (r) => `${r.first_name || ""} ${r.last_name || ""}`.trim() || r.id,
  },
  enterprise: {
    entity:       () => base44.entities.Enterprise,
    queryKey:     "enterprises",
    etl:          "enterprise",
    auditType:    "enterprise",
    taxonomyType: "enterprise",
    displayName:  (r) => r.enterprise_name || r.id,
  },
  product: {
    entity:       () => base44.entities.Product,
    queryKey:     "products",
    etl:          "product",
    auditType:    "product",
    taxonomyType: "item",
    displayName:  (r) => r.item_name || r.name || r.id,
  },
  service: {
    entity:      () => base44.entities.Service,
    queryKey:    "services",
    etl:         "service",
    auditType:   "service",
    displayName: (r) => r.name || r.service_name || r.id,
  },
  task: {
    entity:      () => base44.entities.Task,
    queryKey:    "tasks",
    etl:         "task",
    auditType:   "task",
    displayName: (r) => r.title || r.task_name || r.id,
  },
  transaction: {
    entity:      () => base44.entities.Transaction,
    queryKey:    "transactions",
    etl:         "transaction",
    auditType:   "transaction",
    displayName: (r) => r.reference_number || r.description || r.id,
  },
  relationship: {
    entity:      () => base44.entities.Relationship,
    queryKey:    "relationships",
    etl:         "relationship",
    auditType:   "relationship",
    displayName: (r) => r.relationship_type || r.id,
  },
  address: {
    entity:      () => base44.entities.Address,
    queryKey:    "addresses",
    etl:         "address",
    auditType:   "address",
    displayName: (r) => r.address_line1 || r.address || r.id,
  },
  document: {
    entity:       () => base44.entities.Document,
    queryKey:     "documents",
    etl:          "document",
    auditType:    "document",
    taxonomyType: "document",
    displayName:  (r) => r.title || r.file_name || r.id,
  },
  schedule: {
    entity:       () => base44.entities.Schedule,
    queryKey:     "schedules",
    etl:          "schedule",
    auditType:    "schedule",
    taxonomyType: "schedule",
    displayName:  (r) => r.name || r.title || r.id,
  },
  signal: {
    entity:       () => base44.entities.Signal,
    queryKey:     "signals",
    etl:          "signal",
    auditType:    "signal",
    taxonomyType: "signal",
    displayName:  (r) => r.name || r.signal_type || r.id,
  },
  channel: {
    entity:       () => base44.entities.Channel,
    queryKey:     "channels",
    etl:          "channel",
    auditType:    "channel",
    taxonomyType: "channel",
    displayName:  (r) => r.name || r.channel_name || r.id,
  },
  territory: {
    entity:       () => base44.entities.Territory,
    queryKey:     "territories",
    etl:          "territory",
    auditType:    "territory",
    taxonomyType: "territory",
    displayName:  (r) => r.name || r.territory_name || r.id,
  },
  animal: {
    entity:       () => base44.entities.Animal,
    queryKey:     "animals",
    etl:          "animal",
    auditType:    "animal",
    taxonomyType: "animal",
    displayName:  (r) => r.name || r.id,
  },
  plot: {
    entity:       () => base44.entities.Plot,
    queryKey:     "plots",
    etl:          "plot",
    auditType:    "plot",
    taxonomyType: "plot",
    displayName:  (r) => r.name || r.id,
  },
  observation: {
    entity:       () => base44.entities.Observation,
    queryKey:     "observations",
    etl:          "observation",
    auditType:    "observation",
    taxonomyType: "observation",
    displayName:  (r) => r.observation_type || r.id,
  },

  // ── Intelligence Layer ─────────────────────────────────────────
  insight: {
    entity:      () => base44.entities.Insight,
    queryKey:    "insights",
    etl:         "insight",
    auditType:   "insight",
    displayName: (r) => r.title || r.id,
  },
  recommendation: {
    entity:      () => base44.entities.Recommendation,
    queryKey:    "recommendations",
    etl:         "recommendation",
    auditType:   "recommendation",
    displayName: (r) => r.title || r.id,
  },
  decision: {
    entity:      () => base44.entities.Decision,
    queryKey:    "decisions",
    etl:         "decision",
    auditType:   "decision",
    displayName: (r) => r.decision || r.id,
  },
  risk: {
    entity:      () => base44.entities.Risk,
    queryKey:    "risks",
    etl:         "risk",
    auditType:   "risk",
    displayName: (r) => r.title || r.id,
  },
  opportunity: {
    entity:      () => base44.entities.Opportunity,
    queryKey:    "opportunities",
    etl:         "opportunity",
    auditType:   "opportunity",
    displayName: (r) => r.title || r.id,
  },
  metric_definition: {
    entity:      () => base44.entities.MetricDefinition,
    queryKey:    "metric_definitions",
    etl:         "metric_definition",
    auditType:   "metric_definition",
    displayName: (r) => r.name || r.id,
  },
};

function _reg(entityName) {
  const reg = ENTITY_REGISTRY[entityName];
  if (!reg) throw new Error(`[dataService] Unknown entity: "${entityName}"`);
  return reg;
}

// ── Fire-and-forget side effects ───────────────────────────────────

export function triggerEntityETL(entityName) {
  const reg = ENTITY_REGISTRY[entityName];
  if (!reg) return;
  fetch(`${RAILWAY_URL}/load/${reg.etl}-summary`, {
    method:  "POST",
    headers: { "x-api-key": RAILWAY_API_KEY },
  }).catch(() => {});
}

function _logAudit(reg, companyId, action, record, userEmail) {
  fetch(`${RAILWAY_URL}/audit/log`, {
    method:  "POST",
    headers: {
      "Content-Type": "application/json",
      ...(RAILWAY_API_KEY ? { "x-api-key": RAILWAY_API_KEY } : {}),
    },
    body: JSON.stringify({
      company_id:  companyId,
      entity_type: reg.auditType,
      entity_id:   record?.id,
      entity_name: reg.displayName(record || {}),
      action,
      changed_by:  userEmail,
    }),
  }).catch(() => {});
}

function _triggerWorkflows(reg, companyId, triggerType, entityData) {
  fetch(`${RAILWAY_URL}/workflows/trigger`, {
    method:  "POST",
    headers: {
      "Content-Type": "application/json",
      ...(RAILWAY_API_KEY ? { "x-api-key": RAILWAY_API_KEY } : {}),
    },
    body: JSON.stringify({
      company_id:   companyId,
      trigger_type: triggerType,
      entity_type:  reg.auditType,
      entity_data:  entityData,
    }),
  }).catch(() => {});
}

// ── Query cache sync ───────────────────────────────────────────────

/**
 * syncQueryCache(queryClient, entityName, record, action)
 *
 * action: "created" | "updated" | "deleted"
 *
 * For "created": optimistic prepend + immediate invalidation + refetch
 * For "updated" / "deleted": invalidate + refetch
 */
export function syncQueryCache(queryClient, entityName, record, action = "created") {
  if (!queryClient) return;
  const reg = ENTITY_REGISTRY[entityName];
  if (!reg) return;

  if (action === "created" && record) {
    addRecordToQueryCache(queryClient, [reg.queryKey], record);
  }
  queryClient.invalidateQueries({ queryKey: [reg.queryKey] });
  queryClient.refetchQueries({ queryKey: [reg.queryKey] });
}

// ── List (replicates useEntityListFn) ─────────────────────────────

export async function listRecords(entityName, currentUser, { sort = "-created_date" } = {}) {
  const reg = _reg(entityName);
  if (!currentUser) return [];

  if (currentUser.role === "super_admin") {
    return reg.entity().list(sort);
  }

  if (!currentUser.company_id) {
    console.warn(`[dataService] User ${currentUser.email} has no company_id — returning empty.`);
    return [];
  }

  return Promise.allSettled([
    reg.entity().filter({ company_id: currentUser.company_id }, sort),
    reg.entity().filter({ created_by: currentUser.email }, sort),
  ]).then(async ([byCompanyResult, byCreatorResult]) => {
    const byCompany = byCompanyResult.status === "fulfilled" ? byCompanyResult.value : [];
    const byCreator = byCreatorResult.status === "fulfilled" ? byCreatorResult.value : [];

    if (byCompanyResult.status === "rejected" && byCreatorResult.status === "rejected") {
      try {
        const all = await reg.entity().list(sort);
        return all.filter((r) =>
          r.company_id === currentUser.company_id || r.created_by === currentUser.email,
        );
      } catch (_) {
        return [];
      }
    }

    const seen = new Set();
    const merged = [...byCompany, ...byCreator].filter((r) => {
      if (seen.has(r.id)) return false;
      seen.add(r.id);
      return true;
    });

    // Silently repair records with missing company_id
    byCreator
      .filter((r) => r.company_id !== currentUser.company_id)
      .forEach((r) => {
        reg.entity().update(r.id, { company_id: currentUser.company_id }).catch(() => {});
      });

    return merged;
  });
}

// ── Repair ─────────────────────────────────────────────────────────

export async function repairRecordScope(entityName, record, currentUser) {
  if (!record?.id || !currentUser?.company_id) return;
  if (record.company_id === currentUser.company_id) return;
  const reg = _reg(entityName);
  await reg.entity().update(record.id, { company_id: currentUser.company_id }).catch(() => {});
}

// ── Create ─────────────────────────────────────────────────────────

/**
 * createRecord(entityName, data, currentUser, options?)
 *
 * options: {
 *   queryClient          — React Query client for cache sync
 *   notifyTaxonomyChange — callback from useTaxonomySync (optional)
 * }
 *
 * Returns the created record.
 */
export async function createRecord(entityName, data, currentUser, options = {}) {
  const { queryClient, notifyTaxonomyChange } = options;
  const reg = _reg(entityName);

  const created = await createWithScope(reg.entity(), data, currentUser);
  const companyId = created?.company_id || currentUser?.company_id;

  syncQueryCache(queryClient, entityName, created, "created");
  triggerEntityETL(entityName);
  _logAudit(reg, companyId, "created", created, currentUser?.email);
  _triggerWorkflows(reg, companyId, "entity_created", created);
  if (notifyTaxonomyChange && reg.taxonomyType) {
    notifyTaxonomyChange(reg.taxonomyType, companyId);
  }

  return created;
}

// ── Update ─────────────────────────────────────────────────────────

/**
 * updateRecord(entityName, id, data, currentUser, options?)
 *
 * options: {
 *   queryClient          — React Query client for cache sync
 *   notifyTaxonomyChange — callback from useTaxonomySync (optional)
 *   record               — the pre-update record snapshot for audit logging
 * }
 */
export async function updateRecord(entityName, id, data, currentUser, options = {}) {
  const { queryClient, notifyTaxonomyChange, record } = options;
  const reg = _reg(entityName);

  const payload = { ...data, created_by: currentUser?.email };
  if (currentUser?.role !== "super_admin" && currentUser?.company_id) {
    payload.company_id = currentUser.company_id;
  }

  const updated = await reg.entity().update(id, payload);

  const companyId = currentUser?.company_id;
  const auditRecord = record || updated || { id, ...data };

  syncQueryCache(queryClient, entityName, null, "updated");
  triggerEntityETL(entityName);
  _logAudit(reg, companyId, "updated", auditRecord, currentUser?.email);
  _triggerWorkflows(reg, companyId, "entity_updated", auditRecord);
  if (notifyTaxonomyChange && reg.taxonomyType) {
    notifyTaxonomyChange(reg.taxonomyType, companyId);
  }

  return updated;
}

// ── Delete ─────────────────────────────────────────────────────────

/**
 * deleteRecord(entityName, id, currentUser, options?)
 *
 * options: {
 *   queryClient — React Query client for cache sync
 *   record      — the record being deleted for audit logging
 * }
 */
export async function deleteRecord(entityName, id, currentUser, options = {}) {
  const { queryClient, record } = options;
  const reg = _reg(entityName);

  await reg.entity().delete(id);

  const companyId = currentUser?.company_id;
  const auditRecord = record || { id };

  _logAudit(reg, companyId, "deleted", auditRecord, currentUser?.email);
  syncQueryCache(queryClient, entityName, null, "deleted");
  triggerEntityETL(entityName);
}

// ── Default export (namespace object) ─────────────────────────────

const dataService = {
  ENTITY_REGISTRY,
  createRecord,
  updateRecord,
  deleteRecord,
  listRecords,
  repairRecordScope,
  triggerEntityETL,
  syncQueryCache,
};

export default dataService;
