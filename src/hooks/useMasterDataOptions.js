import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";

// System default role options by person_type
const SYSTEM_ROLES = {
  staff: [
    "teacher", "lecturer", "instructor", "tutor", "coach", "trainer",
    "nurse", "doctor", "pharmacist", "therapist", "physiotherapist", "dentist", "social_worker", "caregiver",
    "engineer", "developer", "designer", "analyst", "architect", "technician",
    "accountant", "auditor", "bookkeeper", "finance_officer",
    "manager", "director", "supervisor", "coordinator", "administrator",
    "driver", "courier", "dispatcher", "logistics_officer",
    "chef", "cook", "waiter", "bartender", "hospitality_staff",
    "security_guard", "cleaner", "maintenance_worker", "groundskeeper",
    "sales_agent", "marketing_officer", "customer_service",
    "lawyer", "paralegal", "consultant", "advisor",
    "farmer", "agronomist", "veterinarian", "field_officer",
    "pastor", "imam", "priest", "religious_leader"
  ],
  client: [
    "student", "learner", "trainee", "apprentice", "intern",
    "patient", "resident", "member", "customer",
    "beneficiary", "enrollee", "subscriber", "attendee", "participant"
  ],
  contact: [
    "vendor", "supplier", "donor", "sponsor", "partner",
    "board_member", "trustee", "shareholder", "investor",
    "guarantor", "next_of_kin", "emergency_contact", "guardian"
  ],
  volunteer: [
    "volunteer", "intern", "community_worker", "unpaid_contributor", "apprentice"
  ]
};

// System default subtypes
const SYSTEM_SUBTYPES = [
  "full_time", "part_time", "contract", "casual", "seasonal", "temporary", "permanent",
  "senior", "junior", "mid_level", "executive", "entry_level",
  "primary", "secondary", "tertiary",
  "internal", "external", "remote", "field_based",
  "licensed", "certified", "registered", "unlicensed",
  "active", "inactive", "on_leave", "probation"
];

export function useMasterDataOptions(entityType, fieldName) {
  const [options, setOptions] = useState([]);
  const [customOptions, setCustomOptions] = useState([]);

  const { data: dbOptions = [] } = useQuery({
    queryKey: ["masterDataOptions", entityType, fieldName],
    queryFn: () =>
      base44.entities.MasterDataOption.filter({
        entity_type: entityType,
        field_name: fieldName,
        is_active: true
      }),
  });

  useEffect(() => {
    const custom = dbOptions.filter(opt => !opt.is_system_default);
    setCustomOptions(custom);

    // For primary_role, filter by system defaults based on person_type context
    if (fieldName === "primary_role" && entityType === "person") {
      // This will be handled differently in the component
      setOptions(dbOptions);
    } else if (fieldName === "person_subtype" && entityType === "person") {
      setOptions(dbOptions);
    } else {
      setOptions(dbOptions);
    }
  }, [dbOptions, fieldName, entityType]);

  return { options, customOptions, dbOptions };
}

export function getFilteredRoles(personType) {
  return SYSTEM_ROLES[personType] || [];
}

export function getSystemSubtypes() {
  return SYSTEM_SUBTYPES;
}

export async function createCustomOption(entityType, fieldName, value, label = null) {
  const user = await base44.auth.me();
  const company = user?.company_id || null;

  const existing = await base44.entities.MasterDataOption.filter({
    entity_type: entityType,
    field_name: fieldName,
    value: value.toLowerCase(),
    company_id: company
  });

  if (existing.length > 0) {
    return existing[0];
  }

  return base44.entities.MasterDataOption.create({
    entity_type: entityType,
    field_name: fieldName,
    value: value,
    label: label || value,
    is_system_default: false,
    is_active: true,
    company_id: company,
    created_by: user?.email,
    usage_count: 0
  });
}