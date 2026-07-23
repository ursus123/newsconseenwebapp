import { RAILWAY_URL, authHeaders } from "@/config/api";

export const RELATIONSHIP_REGISTRY_VERSION = "ontology-relationships.v1";

export async function fetchRelationshipRegistry(companyId) {
  const response = await fetch(
    `${RAILWAY_URL}/company-graph/relationship-registry?company_id=${encodeURIComponent(companyId)}`,
    { headers: await authHeaders() },
  );
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    throw new Error(detail?.detail?.message || "Relationship registry is unavailable.");
  }
  const contract = await response.json();
  if (contract.version !== RELATIONSHIP_REGISTRY_VERSION || !Array.isArray(contract.rules)) {
    throw new Error("Unsupported ontology relationship registry contract.");
  }
  return contract;
}

export function relationshipRulesFor(contract, carrierType) {
  return (contract?.rules || []).filter(rule => rule.carrier_type === carrierType);
}

export function relationshipFormOptions(contract, sourceType, targetType) {
  return (contract?.rules || [])
    .filter(rule => rule.source_type === sourceType && rule.target_type === targetType)
    .map(rule => ({
      value: rule.predicate,
      label: rule.predicate.replaceAll("_", " "),
      inverse: rule.inverse_relationship,
      requiresEvidence: rule.evidence_requirement !== "canonical_record_id",
      correctionActions: rule.valid_correction_actions || [],
    }));
}
