import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { ncClient } from "@/api/ncClient";

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
      ncClient.entities.MasterDataOption.filter({
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

export function getSystemPersonTypes() {
  return ["staff", "client", "contact", "volunteer"];
}

export function getSystemEngagementModels() {
  return ["employed", "contracted", "freelance", "volunteer", "elected", "appointed", "enrolled", "subscribed"];
}

// Enterprise subtype system defaults by type
const SYSTEM_ENTERPRISE_SUBTYPES = {
  commercial: [
    "retail_store", "supermarket", "pharmacy", "restaurant", "cafe", "bar", "hotel", "guesthouse",
    "clinic", "hospital", "nursing_home", "dental_practice", "laboratory",
    "school", "university", "college", "vocational_institute", "tutoring_center",
    "farm", "ranch", "greenhouse", "fishery", "apiary", "orchard",
    "factory", "workshop", "manufacturing_plant", "processing_facility",
    "warehouse", "depot", "logistics_center", "transport_company",
    "bank", "microfinance", "insurance", "investment_firm", "money_transfer",
    "construction_company", "real_estate_agency", "property_management",
    "law_firm", "accounting_firm", "consulting_firm", "marketing_agency", "IT_company",
    "salon", "gym", "spa", "laundry", "repair_shop", "printing_shop",
    "media_company", "radio_station", "tv_station", "publisher"
  ],
  nonprofit: [
    "NGO", "foundation", "charity", "association", "union", "cooperative_society",
    "church", "mosque", "temple", "religious_organization"
  ],
  government: [
    "government_ministry", "municipality", "agency", "public_utility", "court"
  ],
  household: [
    "household", "family_unit", "individual_business"
  ],
  cooperative: [
    "cooperative_society", "union", "association"
  ],
  trust: [
    "foundation", "trust"
  ]
};

// SIC division mapping by enterprise subtype
const SIC_DIVISION_MAP = {
  farm: "A_agriculture_forestry_fishing",
  ranch: "A_agriculture_forestry_fishing",
  greenhouse: "A_agriculture_forestry_fishing",
  fishery: "A_agriculture_forestry_fishing",
  apiary: "A_agriculture_forestry_fishing",
  orchard: "A_agriculture_forestry_fishing",
  factory: "D_manufacturing",
  workshop: "D_manufacturing",
  manufacturing_plant: "D_manufacturing",
  processing_facility: "D_manufacturing",
  construction_company: "C_construction",
  warehouse: "F_wholesale_trade",
  depot: "F_wholesale_trade",
  logistics_center: "E_transport_communications_utilities",
  transport_company: "E_transport_communications_utilities",
  retail_store: "G_retail_trade",
  supermarket: "G_retail_trade",
  pharmacy: "G_retail_trade",
  restaurant: "G_retail_trade",
  cafe: "G_retail_trade",
  bar: "G_retail_trade",
  hotel: "G_retail_trade",
  guesthouse: "G_retail_trade",
  bank: "H_finance_insurance_real_estate",
  microfinance: "H_finance_insurance_real_estate",
  insurance: "H_finance_insurance_real_estate",
  investment_firm: "H_finance_insurance_real_estate",
  money_transfer: "H_finance_insurance_real_estate",
  real_estate_agency: "H_finance_insurance_real_estate",
  property_management: "H_finance_insurance_real_estate",
  clinic: "K_education_health_social",
  hospital: "K_education_health_social",
  nursing_home: "K_education_health_social",
  hospice: "K_education_health_social",
  rehabilitation_center: "K_education_health_social",
  dental_practice: "K_education_health_social",
  laboratory: "K_education_health_social",
  school: "K_education_health_social",
  university: "K_education_health_social",
  college: "K_education_health_social",
  vocational_institute: "K_education_health_social",
  daycare: "K_education_health_social",
  tutoring_center: "K_education_health_social",
  church: "L_nonprofit_religious",
  mosque: "L_nonprofit_religious",
  temple: "L_nonprofit_religious",
  religious_organization: "L_nonprofit_religious",
  NGO: "L_nonprofit_religious",
  foundation: "L_nonprofit_religious",
  charity: "L_nonprofit_religious",
  association: "L_nonprofit_religious",
  union: "L_nonprofit_religious",
  cooperative_society: "L_nonprofit_religious",
  law_firm: "I_services",
  accounting_firm: "I_services",
  consulting_firm: "I_services",
  marketing_agency: "I_services",
  IT_company: "I_services",
  salon: "I_services",
  gym: "I_services",
  spa: "I_services",
  laundry: "I_services",
  repair_shop: "I_services",
  printing_shop: "I_services",
  media_company: "I_services",
  radio_station: "I_services",
  tv_station: "I_services",
  publisher: "I_services",
  government_ministry: "J_public_administration",
  municipality: "J_public_administration",
  agency: "J_public_administration",
  public_utility: "J_public_administration",
  court: "J_public_administration",
  household: "M_household_individual",
  family_unit: "M_household_individual",
  individual_business: "M_household_individual"
};

// SIC code hints by enterprise subtype
const SIC_CODE_HINTS = {
  farm: "0100 - Crop production",
  ranch: "0200 - Livestock",
  fishery: "0900 - Fishing",
  restaurant: "5812 - Eating places",
  cafe: "5812 - Eating places",
  bar: "5813 - Drinking establishments",
  hotel: "7011 - Hotels",
  guesthouse: "7011 - Hotels",
  pharmacy: "5912 - Drug stores",
  school: "8200 - Educational services",
  college: "8220 - Colleges and universities",
  hospital: "8062 - General medical and surgical hospitals",
  clinic: "8049 - Offices of health practitioners",
  bank: "6022 - State commercial banks",
  law_firm: "8111 - Legal services",
  accounting_firm: "8721 - Accounting, auditing, bookkeeping",
  consulting_firm: "8742 - Management consulting services",
  IT_company: "7372 - Services prepackaged software",
  construction_company: "1600 - General building contractors"
};

export function getFilteredEnterpriseSubtypes(enterpriseType) {
  return SYSTEM_ENTERPRISE_SUBTYPES[enterpriseType] || [];
}

export function getSICDivisionForSubtype(subtype) {
  return SIC_DIVISION_MAP[subtype] || null;
}

export function getSICCodeHint(subtype) {
  return SIC_CODE_HINTS[subtype] || null;
}

// Product item_subtype system defaults by item_type
const SYSTEM_ITEM_SUBTYPES = {
  physical: [
    "medication", "supplement", "vaccine", "controlled_substance", "medical_device", "medical_supply",
    "food_ingredient", "packaged_food", "beverage", "frozen_good", "produce", "dairy",
    "equipment", "machinery", "vehicle", "vessel", "aircraft",
    "furniture", "fixture", "appliance", "electronics",
    "tool", "hardware", "spare_part", "component", "raw_material",
    "uniform", "protective_gear", "stationery", "cleaning_supply",
    "fuel", "lubricant", "chemical", "fertilizer", "pesticide", "seed"
  ],
  living: [
    "cattle", "poultry", "swine", "sheep", "goat", "horse", "fish", "rabbit",
    "crop", "plant", "timber", "flower"
  ],
  digital: [
    "software", "application", "platform", "plugin",
    "license", "permit", "certificate", "subscription",
    "course", "ebook", "template", "dataset", "digital_asset"
  ],
  service_package: [
    "consultation", "session", "maintenance_contract", "delivery_service"
  ],
  financial_instrument: [
    "insurance_policy", "loan_product", "savings_product", "investment_product"
  ]
};

// Item class auto-suggestions based on item_subtype
const ITEM_CLASS_SUGGESTIONS = {
  medication: ["controlled", "perishable"],
  vaccine: ["controlled", "perishable"],
  controlled_substance: ["controlled", "perishable"],
  medical_device: ["regulated", "non_perishable"],
  medical_supply: ["regulated", "non_perishable"],
  food_ingredient: ["perishable"],
  packaged_food: ["perishable"],
  beverage: ["perishable"],
  frozen_good: ["perishable"],
  produce: ["perishable"],
  dairy: ["perishable"],
  equipment: ["non_perishable", "serialized"],
  machinery: ["non_perishable", "serialized"],
  vehicle: ["non_perishable", "serialized"],
  vessel: ["non_perishable", "serialized"],
  aircraft: ["non_perishable", "serialized"],
  furniture: ["non_perishable"],
  fixture: ["non_perishable"],
  appliance: ["non_perishable"],
  electronics: ["non_perishable", "serialized"],
  tool: ["non_perishable", "reusable"],
  hardware: ["non_perishable"],
  spare_part: ["non_perishable"],
  component: ["non_perishable"],
  raw_material: ["non_perishable"],
  uniform: ["non_perishable", "consumable"],
  protective_gear: ["non_perishable", "consumable"],
  stationery: ["non_perishable", "consumable"],
  cleaning_supply: ["non_perishable", "consumable"],
  fuel: ["hazardous", "non_perishable"],
  lubricant: ["hazardous", "non_perishable"],
  chemical: ["hazardous", "non_perishable"],
  fertilizer: ["hazardous", "non_perishable"],
  pesticide: ["hazardous", "controlled", "non_perishable"],
  seed: ["non_perishable"],
  cattle: ["serialized"],
  poultry: ["serialized"],
  swine: ["serialized"],
  sheep: ["serialized"],
  goat: ["serialized"],
  horse: ["serialized"],
  fish: ["serialized"],
  rabbit: ["serialized"],
  crop: ["perishable"],
  plant: ["perishable"],
  timber: ["non_perishable"],
  flower: ["perishable"],
  software: ["non_perishable", "non_serialized"],
  application: ["non_perishable", "non_serialized"],
  platform: ["non_perishable", "non_serialized"],
  plugin: ["non_perishable", "non_serialized"],
  license: ["non_perishable", "non_serialized"],
  permit: ["non_perishable", "non_serialized"],
  certificate: ["non_perishable", "non_serialized"],
  subscription: ["non_perishable", "non_serialized"],
  course: ["non_perishable", "non_serialized"],
  ebook: ["non_perishable", "non_serialized"],
  template: ["non_perishable", "non_serialized"],
  dataset: ["non_perishable", "non_serialized"],
  digital_asset: ["non_perishable", "non_serialized"],
  consultation: ["non_perishable", "unrestricted"],
  session: ["non_perishable", "unrestricted"],
  maintenance_contract: ["non_perishable", "unrestricted"],
  delivery_service: ["non_perishable", "unrestricted"],
  insurance_policy: ["non_perishable", "regulated"],
  loan_product: ["non_perishable", "regulated"],
  savings_product: ["non_perishable", "regulated"],
  investment_product: ["non_perishable", "regulated"]
};

// Unit of measure suggestions by item_type
const UNIT_OF_MEASURE_BY_TYPE = {
  physical: ["piece", "box", "kg", "g", "liter", "ml", "meter", "carton", "pallet", "bag", "bottle"],
  living: ["head", "flock", "herd", "acre", "hectare"],
  digital: ["license_seat", "user_account", "session"],
  service_package: ["hour", "day", "month", "session"],
  financial_instrument: ["piece", "unit"]
};

export function getFilteredItemSubtypes(itemType) {
  return SYSTEM_ITEM_SUBTYPES[itemType] || [];
}

export function getSuggestedItemClasses(itemSubtype) {
  return ITEM_CLASS_SUGGESTIONS[itemSubtype] || [];
}

export function getUnitOfMeasureForType(itemType) {
  return UNIT_OF_MEASURE_BY_TYPE[itemType] || [];
}

export function getSystemEnterpriseTypes() {
  return ["commercial", "nonprofit", "government", "household", "cooperative", "trust"];
}

const SIC_DIVISIONS = [
  { value: "A_agriculture_forestry_fishing", label: "A - Agriculture, Forestry, Fishing" },
  { value: "B_mining", label: "B - Mining" },
  { value: "C_construction", label: "C - Construction" },
  { value: "D_manufacturing", label: "D - Manufacturing" },
  { value: "E_transport_communications_utilities", label: "E - Transport, Communications, Utilities" },
  { value: "F_wholesale_trade", label: "F - Wholesale Trade" },
  { value: "G_retail_trade", label: "G - Retail Trade" },
  { value: "H_finance_insurance_real_estate", label: "H - Finance, Insurance, Real Estate" },
  { value: "I_services", label: "I - Services" },
  { value: "J_public_administration", label: "J - Public Administration" },
  { value: "K_education_health_social", label: "K - Education, Health, Social" },
  { value: "L_nonprofit_religious", label: "L - Nonprofit, Religious" },
  { value: "M_household_individual", label: "M - Household, Individual" }
];

export function getSystemSICDivisions() {
  return SIC_DIVISIONS;
}

export function getSystemEnterpriseTiers() {
  return ["headquarters", "regional_office", "branch", "subsidiary", "franchise", "department", "unit", "project"];
}

export function getSystemItemTypes() {
  return ["physical", "living", "digital", "service_package", "financial_instrument"];
}

export function getSystemItemClasses() {
  return ["perishable", "non_perishable", "hazardous", "controlled", "regulated", "unrestricted", "serialized", "non_serialized", "consumable", "reusable", "returnable"];
}

export async function createCustomOption(entityType, fieldName, value, label = null) {
  const user = await ncClient.auth.me();
  const company = user?.company_id || null;

  const existing = await ncClient.entities.MasterDataOption.filter({
    entity_type: entityType,
    field_name: fieldName,
    value: value.toLowerCase(),
    company_id: company
  });

  if (existing.length > 0) {
    return existing[0];
  }

  return ncClient.entities.MasterDataOption.create({
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