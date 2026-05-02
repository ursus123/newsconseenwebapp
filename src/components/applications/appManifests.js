/**
 * appManifests.js
 *
 * Machine-readable contract for every application in APP_REGISTRY.
 * Separate from appRegistry.jsx (navigation/display) — this file is the
 * architectural contract that powers:
 *   - App readiness scoring (what master data must exist before an app is useful)
 *   - Copilot awareness (what each app reads, writes, and produces)
 *   - Company Graph edges (which entity pairs an app connects)
 *   - Onboarding recommendations (what to set up first)
 *   - Intelligence loop wiring (what insight/risk types each app emits)
 *
 * requiredMasterData keys map to entityCounts supplied by Applications.jsx:
 *   staff_exist      → Person(person_type=staff) count
 *   clients_exist    → Person(person_type=client) count
 *   products_exist   → Product(status=active) count
 *   enterprise_exist → Enterprise count
 */

export const APP_MANIFESTS = {

  // ── HR & People ────────────────────────────────────────────────────

  clockinout: {
    reads:               ["Person", "Enterprise", "Schedule"],
    writes:              ["Task", "Observation"],
    events:              ["clock_in", "clock_out", "break_start", "break_end"],
    requiredMasterData:  [
      { key: "staff_exist",      label: "Staff members added" },
      { key: "enterprise_exist", label: "Work locations set up" },
    ],
    createsIntelligence: ["attendance_pattern", "overtime_risk"],
    qualityGate:         "staff_exist AND enterprise_exist",
  },

  leaverequest: {
    reads:               ["Person", "Schedule", "Task"],
    writes:              ["Task", "Schedule", "Document", "Decision"],
    events:              ["leave_requested", "leave_approved", "leave_rejected"],
    requiredMasterData:  [
      { key: "staff_exist", label: "Staff members added" },
    ],
    createsIntelligence: ["coverage_gap_risk"],
    qualityGate:         "staff_exist",
  },

  staffschedule: {
    reads:               ["Person", "Enterprise", "Schedule", "Task"],
    writes:              ["Task", "Schedule"],
    events:              ["shift_created", "shift_published", "shift_cancelled"],
    requiredMasterData:  [
      { key: "staff_exist",      label: "Staff members added" },
      { key: "enterprise_exist", label: "Work locations set up" },
    ],
    createsIntelligence: ["coverage_risk", "staffing_gap"],
    qualityGate:         "staff_exist AND enterprise_exist",
  },

  expenseclaim: {
    reads:               ["Person", "Transaction"],
    writes:              ["Transaction", "Document", "Task"],
    events:              ["expense_submitted", "expense_approved", "expense_rejected"],
    requiredMasterData:  [
      { key: "staff_exist", label: "Staff members added" },
    ],
    createsIntelligence: ["expense_trend"],
    qualityGate:         "staff_exist",
  },

  performancereview: {
    reads:               ["Person", "Task"],
    writes:              ["Task", "Document", "Observation"],
    events:              ["review_submitted", "review_approved"],
    requiredMasterData:  [
      { key: "staff_exist", label: "Staff members added" },
    ],
    createsIntelligence: ["performance_insight"],
    qualityGate:         "staff_exist",
  },

  trainingtracker: {
    reads:               ["Person", "Task", "Document"],
    writes:              ["Task", "Document", "Observation"],
    events:              ["training_completed", "certification_logged"],
    requiredMasterData:  [
      { key: "staff_exist", label: "Staff members added" },
    ],
    createsIntelligence: ["certification_expiry_risk"],
    qualityGate:         "staff_exist",
  },

  // ── Inventory & Assets ─────────────────────────────────────────────

  barcodescanner: {
    reads:               ["Product", "Transaction", "Enterprise"],
    writes:              ["Transaction", "Task", "Product"],
    events:              ["stock_in", "stock_out", "stock_check", "reorder_triggered"],
    requiredMasterData:  [
      { key: "products_exist", label: "Products/inventory items added" },
    ],
    createsIntelligence: ["stockout_risk", "reorder_alert"],
    qualityGate:         "products_exist",
  },

  stockcounter: {
    reads:               ["Product", "Enterprise"],
    writes:              ["Product", "Transaction", "Task", "Observation"],
    events:              ["stock_count_completed", "discrepancy_found"],
    requiredMasterData:  [
      { key: "products_exist", label: "Products/inventory items added" },
    ],
    createsIntelligence: ["shrinkage_insight", "stock_accuracy"],
    qualityGate:         "products_exist",
  },

  purchaseorder: {
    reads:               ["Product", "Transaction", "Enterprise"],
    writes:              ["Task", "Transaction", "Document"],
    events:              ["po_raised", "po_approved", "po_received"],
    requiredMasterData:  [
      { key: "products_exist",   label: "Products/inventory items added" },
      { key: "enterprise_exist", label: "Supplier/enterprise records set up" },
    ],
    createsIntelligence: ["reorder_recommendation", "supplier_performance"],
    qualityGate:         "products_exist AND enterprise_exist",
  },

  assetregister: {
    reads:               ["Product", "Enterprise"],
    writes:              ["Product", "Document"],
    events:              ["asset_registered", "asset_assigned"],
    requiredMasterData:  [
      { key: "enterprise_exist", label: "Locations/departments set up" },
    ],
    createsIntelligence: ["asset_utilisation"],
    qualityGate:         "enterprise_exist",
  },

  goodsreceived: {
    reads:               ["Product", "Transaction", "Enterprise"],
    writes:              ["Product", "Transaction", "Observation"],
    events:              ["goods_received", "goods_rejected"],
    requiredMasterData:  [
      { key: "products_exist", label: "Products/inventory items added" },
    ],
    createsIntelligence: ["stock_replenishment"],
    qualityGate:         "products_exist",
  },

  assetmaintenance: {
    reads:               ["Product", "Task", "Enterprise"],
    writes:              ["Task", "Observation", "Product"],
    events:              ["maintenance_scheduled", "maintenance_completed", "fault_reported"],
    requiredMasterData:  [
      { key: "products_exist",   label: "Assets added to products" },
      { key: "enterprise_exist", label: "Locations set up" },
    ],
    createsIntelligence: ["maintenance_overdue_risk"],
    qualityGate:         "products_exist",
  },

  // ── Healthcare ─────────────────────────────────────────────────────

  medadmin: {
    reads:               ["Person", "Product", "Schedule", "Task"],
    writes:              ["Observation", "Task", "Transaction", "Risk", "Document"],
    events:              ["dose_given", "dose_refused", "dose_missed", "dose_wasted", "prn_administered"],
    requiredMasterData:  [
      { key: "clients_exist",  label: "Patients/clients added" },
      { key: "products_exist", label: "Medications added to products" },
    ],
    createsIntelligence: ["compliance_risk", "refusal_pattern", "stock_depletion_warning"],
    qualityGate:         "clients_exist AND products_exist",
  },

  incidentreport: {
    reads:               ["Person", "Enterprise", "Address"],
    writes:              ["Observation", "Document", "Risk", "Task"],
    events:              ["incident_reported", "incident_escalated"],
    requiredMasterData:  [
      { key: "staff_exist", label: "Staff members added" },
    ],
    createsIntelligence: ["incident_pattern", "compliance_risk"],
    qualityGate:         "staff_exist",
  },

  careplan: {
    reads:               ["Person", "Task", "Document"],
    writes:              ["Document", "Task", "Observation"],
    events:              ["care_plan_created", "care_plan_reviewed"],
    requiredMasterData:  [
      { key: "clients_exist", label: "Patients/clients added" },
    ],
    createsIntelligence: ["care_compliance"],
    qualityGate:         "clients_exist",
  },

  temperaturelog: {
    reads:               ["Enterprise", "Address"],
    writes:              ["Observation", "Task"],
    events:              ["temperature_recorded", "threshold_breach"],
    requiredMasterData:  [
      { key: "enterprise_exist", label: "Locations/areas set up" },
    ],
    createsIntelligence: ["compliance_risk", "temperature_trend"],
    qualityGate:         "enterprise_exist",
  },

  fluidintakelog: {
    reads:               ["Person", "Task"],
    writes:              ["Observation", "Task"],
    events:              ["fluid_recorded", "dehydration_flagged"],
    requiredMasterData:  [
      { key: "clients_exist", label: "Patients/clients added" },
    ],
    createsIntelligence: ["hydration_risk"],
    qualityGate:         "clients_exist",
  },

  woundcarelog: {
    reads:               ["Person", "Task"],
    writes:              ["Observation", "Document", "Task"],
    events:              ["wound_assessed", "wound_treated"],
    requiredMasterData:  [
      { key: "clients_exist", label: "Patients/clients added" },
    ],
    createsIntelligence: ["healing_trend", "escalation_risk"],
    qualityGate:         "clients_exist",
  },

  // ── Field & Operations ─────────────────────────────────────────────

  visitorlog: {
    reads:               ["Person", "Enterprise", "Address"],
    writes:              ["Person", "Observation"],
    events:              ["visitor_signed_in", "visitor_signed_out"],
    requiredMasterData:  [
      { key: "enterprise_exist", label: "Locations/sites set up" },
    ],
    createsIntelligence: ["visitor_pattern"],
    qualityGate:         "enterprise_exist",
  },

  deliverytracker: {
    reads:               ["Product", "Task", "Transaction", "Enterprise"],
    writes:              ["Task", "Transaction", "Observation"],
    events:              ["delivery_dispatched", "delivery_confirmed", "delivery_failed"],
    requiredMasterData:  [
      { key: "products_exist", label: "Products/items added" },
    ],
    createsIntelligence: ["delivery_performance"],
    qualityGate:         "products_exist",
  },

  vehiclelog: {
    reads:               ["Person", "Task"],
    writes:              ["Task", "Observation", "Transaction"],
    events:              ["trip_started", "trip_ended", "fuel_logged"],
    requiredMasterData:  [
      { key: "staff_exist", label: "Staff/drivers added" },
    ],
    createsIntelligence: ["vehicle_utilisation", "fuel_trend"],
    qualityGate:         "staff_exist",
  },

  fieldvisitreport: {
    reads:               ["Person", "Enterprise", "Address", "Task"],
    writes:              ["Observation", "Task", "Relationship", "Opportunity", "Risk"],
    events:              ["visit_completed", "outcome_recorded"],
    requiredMasterData:  [
      { key: "clients_exist",    label: "Clients/beneficiaries added" },
      { key: "enterprise_exist", label: "Client locations set up" },
    ],
    createsIntelligence: ["visit_outcome", "relationship_insight", "opportunity"],
    qualityGate:         "clients_exist AND enterprise_exist",
  },

  shifthandover: {
    reads:               ["Person", "Task", "Enterprise"],
    writes:              ["Task", "Document", "Observation"],
    events:              ["handover_submitted"],
    requiredMasterData:  [
      { key: "staff_exist",      label: "Staff members added" },
      { key: "enterprise_exist", label: "Work locations set up" },
    ],
    createsIntelligence: ["handover_pattern"],
    qualityGate:         "staff_exist AND enterprise_exist",
  },

  maintenancerequest: {
    reads:               ["Task", "Product", "Enterprise"],
    writes:              ["Task", "Observation", "Risk"],
    events:              ["maintenance_requested", "maintenance_resolved"],
    requiredMasterData:  [
      { key: "enterprise_exist", label: "Locations/facilities set up" },
    ],
    createsIntelligence: ["maintenance_backlog_risk"],
    qualityGate:         "enterprise_exist",
  },

  // ── Tools & Utilities ──────────────────────────────────────────────

  pdftoexcel: {
    reads:               ["Document"],
    writes:              ["Document", "Person", "Enterprise", "Transaction"],
    events:              ["pdf_extracted", "records_created"],
    requiredMasterData:  [],
    createsIntelligence: ["data_quality_insight"],
    qualityGate:         "",
  },

  // ── Finance & Admin ────────────────────────────────────────────────

  pettycashlog: {
    reads:               ["Transaction"],
    writes:              ["Transaction", "Observation"],
    events:              ["cash_disbursed", "cash_received"],
    requiredMasterData:  [],
    createsIntelligence: ["cash_variance"],
    qualityGate:         "",
  },

  receiptscanner: {
    reads:               ["Transaction", "Person"],
    writes:              ["Transaction", "Document"],
    events:              ["receipt_scanned", "expense_logged"],
    requiredMasterData:  [],
    createsIntelligence: [],
    qualityGate:         "",
  },

  budgettracker: {
    reads:               ["Transaction", "Enterprise"],
    writes:              ["Observation", "Risk"],
    events:              ["budget_reviewed", "variance_flagged"],
    requiredMasterData:  [
      { key: "enterprise_exist", label: "Departments/cost centres set up" },
    ],
    createsIntelligence: ["budget_variance", "overspend_risk"],
    qualityGate:         "enterprise_exist",
  },

  donationtracker: {
    reads:               ["Transaction", "Person"],
    writes:              ["Transaction", "Document", "Relationship"],
    events:              ["donation_received", "receipt_issued"],
    requiredMasterData:  [],
    createsIntelligence: ["donor_retention"],
    qualityGate:         "",
  },

  // ── Compliance & Quality ───────────────────────────────────────────

  inspectionchecklist: {
    reads:               ["Enterprise", "Task", "Address"],
    writes:              ["Observation", "Task", "Risk", "Document"],
    events:              ["inspection_completed", "defect_logged"],
    requiredMasterData:  [
      { key: "enterprise_exist", label: "Locations/facilities set up" },
    ],
    createsIntelligence: ["compliance_risk", "inspection_trend"],
    qualityGate:         "enterprise_exist",
  },

  licensetracker: {
    reads:               ["Enterprise", "Task", "Document"],
    writes:              ["Document", "Task", "Risk"],
    events:              ["license_logged", "expiry_flagged"],
    requiredMasterData:  [
      { key: "enterprise_exist", label: "Business/entity records set up" },
    ],
    createsIntelligence: ["expiry_risk", "compliance_status"],
    qualityGate:         "enterprise_exist",
  },

  documentexpiry: {
    reads:               ["Enterprise", "Document", "Task"],
    writes:              ["Task", "Risk"],
    events:              ["expiry_alert_generated"],
    requiredMasterData:  [
      { key: "enterprise_exist", label: "Business/entity records set up" },
    ],
    createsIntelligence: ["expiry_risk"],
    qualityGate:         "enterprise_exist",
  },

  cleaningschedule: {
    reads:               ["Task", "Enterprise", "Address"],
    writes:              ["Task", "Observation"],
    events:              ["cleaning_completed", "area_signed_off"],
    requiredMasterData:  [
      { key: "enterprise_exist", label: "Areas/locations set up" },
    ],
    createsIntelligence: [],
    qualityGate:         "enterprise_exist",
  },

  // ── Education ──────────────────────────────────────────────────────

  attendanceregister: {
    reads:               ["Person", "Enterprise", "Schedule"],
    writes:              ["Observation", "Task"],
    events:              ["attendance_marked", "absence_flagged"],
    requiredMasterData:  [
      { key: "clients_exist",    label: "Students/members added" },
      { key: "enterprise_exist", label: "Classes/groups set up" },
    ],
    createsIntelligence: ["absenteeism_risk", "attendance_trend"],
    qualityGate:         "clients_exist AND enterprise_exist",
  },

  feecollection: {
    reads:               ["Person", "Transaction"],
    writes:              ["Transaction", "Document", "Task"],
    events:              ["fee_collected", "fee_overdue"],
    requiredMasterData:  [
      { key: "clients_exist", label: "Students added" },
    ],
    createsIntelligence: ["fee_compliance", "outstanding_balance"],
    qualityGate:         "clients_exist",
  },

  librarylog: {
    reads:               ["Person", "Product", "Task"],
    writes:              ["Task", "Observation"],
    events:              ["book_borrowed", "book_returned", "overdue_flagged"],
    requiredMasterData:  [
      { key: "clients_exist",  label: "Students/members added" },
      { key: "products_exist", label: "Books/resources added to products" },
    ],
    createsIntelligence: ["overdue_pattern"],
    qualityGate:         "clients_exist AND products_exist",
  },
};

// ── Utilities ──────────────────────────────────────────────────────────

/**
 * getManifest(appId) → manifest or null
 */
export function getManifest(appId) {
  return APP_MANIFESTS[appId] || null;
}

/**
 * checkAppReadiness(appId, entityCounts)
 *
 * entityCounts: {
 *   staff_exist:      number,   // count of Person(person_type=staff)
 *   clients_exist:    number,   // count of Person(person_type=client)
 *   products_exist:   number,   // count of Product(status=active)
 *   enterprise_exist: number,   // count of Enterprise
 * }
 *
 * Returns: { ready: bool, score: 0–100, missing: string[] }
 */
export function checkAppReadiness(appId, entityCounts = {}) {
  const manifest = getManifest(appId);
  if (!manifest || manifest.requiredMasterData.length === 0) {
    return { ready: true, score: 100, missing: [] };
  }
  const missing = manifest.requiredMasterData
    .filter((req) => !entityCounts[req.key])
    .map((req) => req.label);
  const score = Math.round(
    ((manifest.requiredMasterData.length - missing.length) / manifest.requiredMasterData.length) * 100,
  );
  return { ready: missing.length === 0, score, missing };
}

/**
 * getIntelligenceOutputs(appId)
 * Returns the list of intelligence types this app is expected to produce.
 * Used by Phase C (intelligence loop wiring) to know what to call.
 */
export function getIntelligenceOutputs(appId) {
  return getManifest(appId)?.createsIntelligence ?? [];
}

/**
 * getAppEvents(appId)
 * Returns the canonical event names this app emits.
 * Used by Phase E (operational event stream) to validate event types.
 */
export function getAppEvents(appId) {
  return getManifest(appId)?.events ?? [];
}

/**
 * getWrittenEntities(appId)
 * Returns which ontology entities this app writes to.
 * Used by Company Graph to know which edges to show.
 */
export function getWrittenEntities(appId) {
  return getManifest(appId)?.writes ?? [];
}
