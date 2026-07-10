export const AGRICULTURAL_TYPES = [
  "agriculture", "farm", "livestock",
  "animal_barn", "aquaculture", "crop",
  "dairy", "poultry", "ranch",
];

export const LIVESTOCK_ITEM_TYPES = [
  "livestock", "animal", "cattle",
  "poultry", "swine", "aquaculture",
];

export const FEED_ITEM_TYPES = [
  "feed", "hay", "grain", "seed",
  "fertilizer", "crop",
];

export function isAgricultural(enterprise) {
  if (!enterprise) return false;
  const type = (enterprise.enterprise_type || "").toLowerCase();
  return AGRICULTURAL_TYPES.some(t => type.includes(t));
}

// Legacy: reads livestock from Products (item_type = 'living').
// Phase 10+: individual animal records live in ncClient.entities.Animal.
// This helper is retained for any pre-Phase-10 data still in Products.
export function getLivestock(products, entName) {
  return products.filter(p =>
    LIVESTOCK_ITEM_TYPES.includes(p.item_type) &&
    (p.enterprise === entName ||
      (p.assigned_enterprises || []).some(ae => ae.enterprise_name === entName) ||
      !p.enterprise) &&
    p.status !== "archived"
  );
}

export function getFeed(products, entName) {
  return products.filter(p =>
    (FEED_ITEM_TYPES.includes(p.item_type) ||
      p.name?.toLowerCase().includes("feed") ||
      p.name?.toLowerCase().includes("hay") ||
      p.name?.toLowerCase().includes("grain")) &&
    (p.enterprise === entName ||
      (p.assigned_enterprises || []).some(ae => ae.enterprise_name === entName) ||
      !p.enterprise) &&
    p.status !== "archived"
  );
}

export function getLivestockUnit(product) {
  if (product.unit) return product.unit;
  if (LIVESTOCK_ITEM_TYPES.includes(product.item_type)) return "head";
  if (FEED_ITEM_TYPES.includes(product.item_type)) return "kg";
  return "units";
}

export function getLowStockLabel(product) {
  if (LIVESTOCK_ITEM_TYPES.includes(product.item_type)) return "Herd below target";
  if (FEED_ITEM_TYPES.includes(product.item_type)) return "Feed supply low";
  return "Low stock";
}

export const STAFF_TYPES = [
  "employee", "contractor", "freelancer",
  "volunteer", "teacher", "staff",
  "caregiver", "pastor", "leader",
  "farm_hand", "manager", "coordinator",
  "officer", "worker", "nurse",
];

export const PARTICIPANT_TYPES = [
  "client", "patient", "student", "member",
  "beneficiary", "participant", "resident",
  "customer", "attendee", "visitor",
  "learner", "guest", "subscriber",
];

export function isStaff(person) {
  return STAFF_TYPES.includes(person.person_type);
}

export function isParticipant(person) {
  return PARTICIPANT_TYPES.includes(person.person_type);
}