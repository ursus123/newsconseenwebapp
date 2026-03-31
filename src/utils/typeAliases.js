/**
 * TYPE_ALIASES — single source of truth for person_type backward compatibility.
 *
 * Maps each canonical person_type to the full set of legacy/alternate values
 * that operators may have used before the taxonomy was standardised.
 *
 * Usage:
 *   TYPE_ALIASES.staff.includes(person.person_type)   // true for "employee", "contractor", etc.
 *   isPersonType(person.person_type, "client")         // helper for single-value checks
 *
 * Never add raw legacy strings to filter conditions — always go through this map.
 * When Base44 taxonomy values change, update taxonomy.py (python_layer) first,
 * then update this file to match.
 */

export const TYPE_ALIASES = {
  staff:     ["staff", "employee", "contractor", "freelancer"],
  client:    ["client", "patient", "student", "member"],
  contact:   ["contact", "vendor", "supplier", "external_partner"],
  volunteer: ["volunteer"],
};

/**
 * Returns true if person_type belongs to the given canonical type.
 * Falls back to exact match for any type not in TYPE_ALIASES.
 *
 * @param {string} personType  - raw person_type value from the record
 * @param {string} canonical   - one of: "staff", "client", "contact", "volunteer"
 */
export function isPersonType(personType, canonical) {
  return (TYPE_ALIASES[canonical] || [canonical]).includes(personType);
}
