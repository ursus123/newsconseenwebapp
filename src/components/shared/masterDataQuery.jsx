/**
 * Master Data Query Layer — Safe Read-Only API for Apps
 *
 * Core rule:
 *   Apps READ master data through this layer.
 *   Apps NEVER write master data directly.
 *   Apps CREATE Tasks → Tasks trigger Transactions → Transactions update derived state.
 *
 * Field tiers enforced here:
 *   Tier 1 — Operational: always visible (names, IDs, status, type)
 *   Tier 2 — Controlled: app-specific (certifications, expiry)
 *   Tier 3 — Restricted: never exposed to apps (cost, internal notes, compliance)
 */

import { base44 } from "@/api/base44Client";

// ─── PEOPLE ──────────────────────────────────────────────────────────────────

/**
 * Returns only Tier 1 operational fields for a person.
 * Apps (ClockIn, MedAdmin, Delivery) use this for display and assignment.
 */
function stripPersonFields(person, tier = 1) {
  const base = {
    id: person.id,
    first_name: person.first_name,
    last_name: person.last_name,
    preferred_name: person.preferred_name,
    person_type: person.person_type,
    status: person.status,
    primary_role: person.primary_role,
    availability_status: person.availability_status,
  };
  if (tier >= 2) {
    // Controlled: certifications, expiry (e.g. medical app)
    Object.assign(base, {
      certification_name: person.certification_name,
      certification_expiry: person.certification_expiry,
      skills: person.skills,
    });
  }
  // Tier 3 fields (cost_rate, internal_notes, license_number, emergency_*) are NEVER included
  return base;
}

/**
 * Query active people — scoped by enterprise if provided.
 * Returns field-limited records (Tier 1 by default).
 */
export async function queryPeople({ enterpriseName = null, personType = null, tier = 1, companyId = null } = {}) {
  const filters = { status: "active" };
  if (personType) filters.person_type = personType;
  if (companyId) filters.company_id = companyId;

  const records = await base44.entities.Person.filter(filters, "first_name", 200);
  return records.map((p) => stripPersonFields(p, tier));
}

/**
 * Query active patients specifically (for MedAdmin).
 * Falls back to all active people if no patients exist.
 */
export async function queryPatients(companyId = null) {
  const baseFilters = { status: "active", person_type: "patient" };
  if (companyId) baseFilters.company_id = companyId;
  const patients = await base44.entities.Person.filter(baseFilters, "first_name");
  if (patients.length > 0) return patients.map((p) => stripPersonFields(p, 2)); // Tier 2 for med app
  const fallbackFilters = { status: "active" };
  if (companyId) fallbackFilters.company_id = companyId;
  const all = await base44.entities.Person.filter(fallbackFilters, "first_name");
  return all.map((p) => stripPersonFields(p, 1));
}


// ─── ENTERPRISES ─────────────────────────────────────────────────────────────

/**
 * Returns only Tier 1 operational fields for an enterprise.
 * Strips: financial summaries, internal risk notes, contract metadata.
 */
function stripEnterpriseFields(enterprise) {
  return {
    id: enterprise.id,
    enterprise_name: enterprise.enterprise_name,
    short_name: enterprise.short_name,
    enterprise_type: enterprise.enterprise_type,
    status: enterprise.status,
    operating_status: enterprise.operating_status,
    city: enterprise.city,
    region: enterprise.region,
    country: enterprise.country,
    primary_address: enterprise.primary_address,
  };
  // Strips: internal_notes, attachment_urls, licenses, insurance, management_roles, financial data
}

/**
 * Query active enterprises for app use (context selection, validation).
 */
export async function queryEnterprises({ status = "active", companyId = null } = {}) {
  const filters = { status };
  if (companyId) filters.company_id = companyId;
  const records = await base44.entities.Enterprise.filter(filters, "enterprise_name");
  return records.map(stripEnterpriseFields);
}


// ─── ITEMS / PRODUCTS ────────────────────────────────────────────────────────

/**
 * Returns Tier 1 item fields. Tier 2 adds expiry/condition (inventory/med apps).
 * Strips: cost_price, pricing rules, internal notes.
 */
function stripProductFields(product, tier = 1) {
  const base = {
    id: product.id,
    name: product.name,
    sku: product.sku,
    status: product.status,
    item_type: product.item_type,
    category: product.category,
    unit: product.unit,
    stock_quantity: product.stock_quantity,
  };
  if (tier >= 2) {
    Object.assign(base, {
      expiry_date: product.expiry_date,
      condition: product.condition,
      regulatory_status: product.regulatory_status,
      dosage_instructions: product.dosage_instructions,
      side_effects: product.side_effects,
      contraindications: product.contraindications,
      storage_instructions: product.storage_instructions,
      serial_number: product.serial_number,
    });
  }
  // Strips: cost_price, unit_price, supplier, internal_notes, batch_number (unless tier 2+)
  return base;
}

/**
 * Query active items. Use tier=2 for medical/inventory apps needing expiry/condition.
 */
export async function queryProducts({ itemType = null, tier = 1, companyId = null } = {}) {
  const filters = { status: "active" };
  if (itemType) filters.item_type = itemType;
  if (companyId) filters.company_id = companyId;
  const records = await base44.entities.Product.filter(filters, "name");
  return records.map((p) => stripProductFields(p, tier));
}


// ─── SERVICES ────────────────────────────────────────────────────────────────

function stripServiceFields(service) {
  return {
    id: service.id,
    name: service.name,
    short_code: service.short_code,
    category: service.category,
    status: service.status,
    service_type: service.service_type,
    estimated_duration: service.estimated_duration,
    duration_unit: service.duration_unit,
    response_sla_hours: service.response_sla_hours,
    completion_sla_hours: service.completion_sla_hours,
    service_roles: service.service_roles,
    checklist: service.checklist,
  };
  // Strips: price, billing_unit, internal_notes, attachment_urls
}

export async function queryServices(companyId = null) {
  const filters = { status: "active" };
  if (companyId) filters.company_id = companyId;
  const records = await base44.entities.Service.filter(filters, "name");
  return records.map(stripServiceFields);
}


// ─── ADDRESSES ───────────────────────────────────────────────────────────────

function stripAddressFields(address) {
  return {
    id: address.id,
    label: address.label,
    status: address.status,
    address_line1: address.address_line1,
    address_line2: address.address_line2,
    city: address.city,
    state_region: address.state_region,
    postal_code: address.postal_code,
    country: address.country,
    latitude: address.latitude,
    longitude: address.longitude,
  };
  // Strips: linked_people, linked_enterprises, internal_notes, attachment_urls
}

export async function queryAddresses(companyId = null) {
  const filters = { status: "active" };
  if (companyId) filters.company_id = companyId;
  const records = await base44.entities.Address.filter(filters, "label");
  return records.map(stripAddressFields);
}