// ── Shared import configurations for all master-data entities ──────────────

// ── PEOPLE ────────────────────────────────────────────────────────────────
export const PEOPLE_FIELDS = [
  { key: "first_name",                label: "First Name *",               required: true },
  { key: "last_name",                 label: "Last Name *",                required: true },
  { key: "preferred_name",            label: "Preferred Name" },
  { key: "person_id",                 label: "Person ID (External)" },
  { key: "person_type",               label: "Person Type" },
  { key: "person_subtype",            label: "Person Subtype" },
  { key: "primary_role",              label: "Primary Role" },
  { key: "role_category",             label: "Role Category" },
  { key: "engagement_model",          label: "Engagement Model" },
  { key: "status",                    label: "Status" },
  { key: "availability_status",       label: "Availability Status" },
  { key: "phone",                     label: "Phone" },
  { key: "email",                     label: "Email" },
  { key: "gender",                    label: "Gender" },
  { key: "date_of_birth",             label: "Date of Birth" },
  { key: "national_id",               label: "National ID" },
  { key: "address",                   label: "Address" },
  { key: "city",                      label: "City" },
  { key: "region",                    label: "Region / State" },
  { key: "country",                   label: "Country" },
  { key: "zip_code",                  label: "ZIP Code" },
  { key: "start_date",                label: "Start Date" },
  { key: "end_date",                  label: "End Date" },
  { key: "intake_date",               label: "Intake Date" },
  { key: "discharge_date",            label: "Discharge Date" },
  { key: "discharge_reason",          label: "Discharge Reason" },
  { key: "cost_rate",                 label: "Cost Rate" },
  { key: "hourly_rate",               label: "Hourly Rate" },
  { key: "weekly_hours",              label: "Weekly Hours" },
  { key: "overtime_eligible",         label: "Overtime Eligible" },
  { key: "payment_type",              label: "Payment Type" },
  { key: "certification_name",        label: "Certification Name" },
  { key: "certifications",            label: "Certifications (multi)" },
  { key: "certification_expiry",      label: "Certification Expiry" },
  { key: "license_number",            label: "License Number" },
  { key: "skills",                    label: "Skills" },
  { key: "emergency_contact",         label: "Emergency Contact" },
  { key: "emergency_phone",           label: "Emergency Phone" },
  { key: "shift_schedule",            label: "Shift Schedule" },
  { key: "availability_notes",        label: "Availability Notes" },
  { key: "height_cm",                 label: "Height (cm)" },
  { key: "weight_kg",                 label: "Weight (kg)" },
  { key: "organization",              label: "Organization" },
  { key: "branch_id",                 label: "Branch ID" },
  { key: "assigned_branch",           label: "Assigned Branch" },
  { key: "assigned_caregiver_id",     label: "Assigned Caregiver ID" },
  { key: "payer_type",                label: "Payer Type" },
  { key: "referral_source",           label: "Referral Source" },
  { key: "primary_diagnosis",         label: "Primary Diagnosis" },
  { key: "secondary_diagnosis",       label: "Secondary Diagnosis" },
  { key: "functional_score",          label: "Functional Score" },
  { key: "caregiver_continuity_pct",  label: "Caregiver Continuity %" },
  { key: "age_at_intake",             label: "Age at Intake" },
  { key: "relationship_to_org",       label: "Relationship to Organization" },
  { key: "active_since",              label: "Active Since" },
  { key: "company_id",                label: "Company ID" },
  { key: "internal_notes",            label: "Internal Notes" },
];

export const PEOPLE_MAPPING_RULES = [
  // Identity — anchored to prevent partial grabs
  [/^first.?name$|^given.?name$|^forename$/i,                "first_name"],
  [/^last.?name$|^surname$|^family.?name$/i,                 "last_name"],
  [/^preferred.?name$|^nickname$|^display.?name$/i,          "preferred_name"],
  [/^person.?id$|^external.?id$|^source.?id$/i,              "person_id"],

  // Person classification
  [/^person.?type$|^employee.?type$|^contact.?type$/i,       "person_type"],
  [/^person.?subtype$|^subtype$|^sub.?type$/i,               "person_subtype"],
  [/^primary.?role$|^job.?title$|^position$/i,               "primary_role"],
  [/^role.?category$|^role.?group$/i,                        "role_category"],
  [/^engagement.?model$|^engagement.?type$|^contract.?type$/i, "engagement_model"],

  // Status
  [/^status$/i,                                              "status"],
  [/^availability.?status$|^availability$/i,                 "availability_status"],

  // Contact
  [/^phone$|^mobile$|^telephone$|^tel$/i,                    "phone"],
  [/^email$|^email.?address$/i,                              "email"],
  [/^emergency.?contact$|^next.?of.?kin$/i,                  "emergency_contact"],
  [/^emergency.?phone$|^emergency.?mobile$/i,                "emergency_phone"],

  // Demographics
  [/^gender$|^sex$/i,                                        "gender"],
  [/^date.?of.?birth$|^dob$|^birth.?date$/i,                "date_of_birth"],
  [/^national.?id$|^passport$|^ssn$/i,                       "national_id"],
  [/^age.?at.?intake$|^age$/i,                               "age_at_intake"],
  [/^height.?cm$|^height$/i,                                 "height_cm"],
  [/^weight.?kg$|^weight$/i,                                 "weight_kg"],

  // Address — zip before region to avoid partial grabs
  [/^zip.?code$|^zip$|^postal.?code$|^postcode$/i,           "zip_code"],
  [/^address$|^street.?address$|^address.?line$/i,           "address"],
  [/^city$|^town$/i,                                         "city"],
  [/^region$|^state$|^state.?region$|^province$/i,           "region"],
  [/^country$/i,                                             "country"],

  // Dates
  [/^start.?date$|^hire.?date$|^join.?date$/i,               "start_date"],
  [/^end.?date$|^termination.?date$|^leave.?date$/i,         "end_date"],
  [/^intake.?date$|^admission.?date$|^enrollment.?date$/i,   "intake_date"],
  [/^discharge.?date$|^exit.?date$/i,                        "discharge_date"],
  [/^discharge.?reason$|^exit.?reason$|^termination.?reason$/i, "discharge_reason"],
  [/^active.?since$|^member.?since$|^partner.?since$/i,      "active_since"],

  // Pay and hours — hourly_rate before cost_rate, rate before generic
  [/^hourly.?rate$|^hour.?rate$/i,                           "hourly_rate"],
  [/^weekly.?hours$|^hours.?per.?week$/i,                    "weekly_hours"],
  [/^overtime.?eligible$|^ot.?eligible$/i,                   "overtime_eligible"],
  [/^cost.?rate$|^cost$|^salary$|^pay.?rate$/i,              "cost_rate"],
  [/^payment.?type$|^pay.?type$/i,                           "payment_type"],

  // Certifications — certifications (multi) before certification_name (single)
  [/^certifications$|^certs$|^qualifications$/i,             "certifications"],
  [/^certification.?name$|^cert.?name$|^certificate$/i,      "certification_name"],
  [/^certification.?expiry$|^cert.?expiry$|^cert.?date$/i,   "certification_expiry"],
  [/^license.?number$|^licence$|^license$/i,                 "license_number"],
  [/^skills?$|^competencies$/i,                              "skills"],

  // Scheduling
  [/^shift.?schedule$|^shift$/i,                             "shift_schedule"],
  [/^availability.?notes$/i,                                 "availability_notes"],

  // Clinical — client specific
  [/^primary.?diagnosis$|^main.?diagnosis$|^diagnosis$/i,    "primary_diagnosis"],
  [/^secondary.?diagnosis$|^second.?diagnosis$/i,            "secondary_diagnosis"],
  [/^functional.?score$|^function.?score$|^adl.?score$/i,    "functional_score"],
  [/^payer.?type$|^insurance.?type$|^payment.?source$/i,     "payer_type"],
  [/^referral.?source$|^referred.?by$|^source$/i,            "referral_source"],
  [/^caregiver.?continuity|^continuity.?pct$/i,              "caregiver_continuity_pct"],

  // Branch / org links
  [/^branch.?id$|^branch$/i,                                 "branch_id"],
  [/^assigned.?branch$|^home.?branch$/i,                     "assigned_branch"],
  [/^assigned.?caregiver.?id$|^caregiver.?id$/i,             "assigned_caregiver_id"],
  [/^organization$|^org.?name$|^company.?name$/i,            "organization"],
  [/^relationship.?to|^relationship.?type$/i,                "relationship_to_org"],

  // Tenant
  [/^company.?id$|^tenant$|^workspace$/i,                    "company_id"],

  // Free text — broadest last
  [/^internal.?notes$|^notes$|^comments$/i,                  "internal_notes"],
];

export const PEOPLE_TEMPLATE_EXAMPLE = {
  first_name: "Jane", last_name: "Smith", preferred_name: "Jane",
  person_type: "staff", status: "active", primary_role: "Field Coordinator",
  role_category: "professional_licensed", phone: "+1-555-0100",
  email: "jane@example.com", gender: "female", date_of_birth: "1990-05-15",
  national_id: "ID-12345", address: "123 Main St", city: "New York",
  region: "NY", country: "USA", engagement_type: "full_time",
  start_date: "2022-01-01", cost_rate: 25, payment_type: "hourly",
  availability_status: "available", skills: "nursing,first aid",
  certification_name: "RN", certification_expiry: "2026-12-31",
  license_number: "LN-999", internal_notes: "",
};

export const PEOPLE_TEMPLATE_INSTRUCTIONS = [
  ["first_name","Yes","First name of the person","Jane"],
  ["last_name","Yes","Last name of the person","Smith"],
  ["person_type","No","Type","staff, client, contact, volunteer"],
  ["status","No","Status","active, inactive, on_leave"],
  ["email","No","Email address (must be valid format)","jane@example.com"],
  ["phone","No","Phone number","555-0100"],
  ["gender","No","Gender","male, female, non_binary, prefer_not_to_say"],
  ["engagement_type","No","Engagement type","full_time, part_time, contract, casual, internship"],
  ["payment_type","No","Payment type","monthly_salary, hourly, daily, per_task, retainer"],
  ["availability_status","No","Availability","available, busy, on_leave, unavailable"],
  ["date_of_birth","No","Date of birth","YYYY-MM-DD"],
  ["start_date","No","Employment start date","YYYY-MM-DD"],
  ["cost_rate","No","Cost rate (numeric)","25.00"],
];

const PERSON_TYPE_KEYWORDS = [
  [/nurse|doctor|pharmacist|caregiver|therapist|clinician/i, "employee"],
  [/driver|cleaner|technician|mechanic|operator|guard/i, "employee"],
  [/consultant|contractor|freelancer/i, "contractor"],
  [/supplier|vendor/i, "vendor"],
];

export function detectPersonType(role = "") {
  for (const [regex, type] of PERSON_TYPE_KEYWORDS) {
    if (regex.test(role)) return type;
  }
  return "employee";
}

export function transformPerson(row, currentUser) {
  // Enforce person_type enum
  const VALID_TYPES = ["staff","client","contact","volunteer"];
  if (!row.person_type || !VALID_TYPES.includes(row.person_type)) {
    row.person_type = detectPersonType(row.primary_role);
  }

  // Enforce engagement_model enum
  const VALID_ENGAGEMENT = ["employed","contracted","freelance","volunteer","elected","appointed","enrolled","subscribed"];
  if (row.engagement_model && !VALID_ENGAGEMENT.includes(row.engagement_model)) {
    row.engagement_model = "employed";
  }

  // Enforce gender enum
  const VALID_GENDERS = ["male","female","non_binary","prefer_not_to_say"];
  if (row.gender && !VALID_GENDERS.includes(row.gender?.toLowerCase())) {
    row.gender = "prefer_not_to_say";
  } else if (row.gender) {
    row.gender = row.gender.toLowerCase();
  }

  // hourly_rate → cost_rate if cost_rate is blank
  if (!row.cost_rate && row.hourly_rate) {
    row.cost_rate = parseFloat(row.hourly_rate) || undefined;
  }
  if (row.cost_rate) {
    const n = parseFloat(row.cost_rate);
    row.cost_rate = isNaN(n) ? undefined : n;
  }

  // functional_score → number
  if (row.functional_score) {
    const n = parseFloat(row.functional_score);
    row.functional_score = isNaN(n) ? undefined : n;
  }

  // Collect fields with no direct entity field into internal_notes
  const notes = [];
  if (row.person_id)               notes.push(`External ID: ${row.person_id}`);
  if (row.zip_code)                notes.push(`Zip: ${row.zip_code}`);
  if (row.age_at_intake)           notes.push(`Age at intake: ${row.age_at_intake}`);
  if (row.weekly_hours)            notes.push(`Weekly hours: ${row.weekly_hours}`);
  if (row.overtime_eligible)       notes.push(`Overtime eligible: ${row.overtime_eligible}`);
  if (row.branch_id)               notes.push(`Branch ID: ${row.branch_id}`);
  if (row.assigned_branch)         notes.push(`Assigned branch: ${row.assigned_branch}`);
  if (row.assigned_caregiver_id)   notes.push(`Assigned caregiver: ${row.assigned_caregiver_id}`);
  if (row.payer_type)              notes.push(`Payer type: ${row.payer_type}`);
  if (row.referral_source)         notes.push(`Referral source: ${row.referral_source}`);
  if (row.primary_diagnosis)       notes.push(`Dx: ${row.primary_diagnosis}`);
  if (row.secondary_diagnosis)     notes.push(`Secondary Dx: ${row.secondary_diagnosis}`);
  if (row.functional_score)        notes.push(`Functional score: ${row.functional_score}`);
  if (row.caregiver_continuity_pct) notes.push(`Caregiver continuity: ${row.caregiver_continuity_pct}`);
  if (row.discharge_reason)        notes.push(`Discharge reason: ${row.discharge_reason}`);
  if (row.relationship_to_org)     notes.push(`Relationship: ${row.relationship_to_org}`);
  if (row.organization)            notes.push(`Organization: ${row.organization}`);

  // skills — coerce comma/semicolon string → array so Base44 accepts it
  if (typeof row.skills === "string") {
    row.skills = row.skills.split(/[,;]/).map(s => s.trim()).filter(Boolean);
  }

  // Handle certifications (multi-value semicolon-separated → certification_name)
  if (row.certifications && !row.certification_name) {
    const certs = row.certifications.split(/[;,]/).map(s => s.trim()).filter(Boolean);
    row.certification_name = certs[0] || undefined;
    if (certs.length > 1) notes.push(`Additional certs: ${certs.slice(1).join(", ")}`);
  }

  // Merge with any existing internal_notes
  const existing = row.internal_notes ? [row.internal_notes] : [];
  row.internal_notes = [...existing, ...notes].join(" | ") || undefined;

  // Map intake_date → start_date for clients if start_date is blank
  if (!row.start_date && row.intake_date) {
    row.start_date = row.intake_date;
  }
  // Map discharge_date → end_date if end_date is blank
  if (!row.end_date && row.discharge_date) {
    row.end_date = row.discharge_date;
  }

  row.company_id = row.company_id || currentUser?.company_id;

  return row;
}

export function validatePerson(row) {
  const errors = [], warnings = [];
  if (!row.first_name) errors.push("first_name required");
  if (!row.last_name)  errors.push("last_name required");

  const validTypes = ["staff","client","contact","volunteer"];
  if (row.person_type && !validTypes.includes(row.person_type)) {
    warnings.push(`person_type "${row.person_type}" not recognised — will default to "staff"`);
  }

  const validStatuses = ["active","inactive","on_leave"];
  if (row.status && !validStatuses.includes(row.status)) {
    warnings.push(`status "${row.status}" not recognised — defaulting to "active"`);
  }

  const validEngagement = ["employed","contracted","freelance","volunteer","elected","appointed","enrolled","subscribed"];
  if (row.engagement_model && !validEngagement.includes(row.engagement_model)) {
    warnings.push(`engagement_model "${row.engagement_model}" not recognised — defaulting to "employed"`);
  }

  if (row.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) {
    errors.push(`email "${row.email}" is not valid`);
  }
  if (row.date_of_birth && isNaN(Date.parse(row.date_of_birth))) {
    warnings.push("date_of_birth format unclear — use YYYY-MM-DD");
  }
  if (row.cost_rate && isNaN(parseFloat(row.cost_rate))) {
    errors.push("cost_rate must be a number");
  }
  if (row.hourly_rate && isNaN(parseFloat(row.hourly_rate))) {
    errors.push("hourly_rate must be a number");
  }

  return { errors, warnings };
}

// ── ENTERPRISES ───────────────────────────────────────────────────────────
export const ENTERPRISE_FIELDS = [
  { key: "enterprise_name", label: "Enterprise Name *", required: true },
  { key: "enterprise_id", label: "Enterprise ID" },
  { key: "short_name", label: "Short Name" },
  { key: "enterprise_type", label: "Enterprise Type" },
  { key: "enterprise_subtype", label: "Enterprise Subtype" },
  { key: "enterprise_tier", label: "Enterprise Tier" },
  { key: "parent_enterprise_id", label: "Parent Enterprise ID" },
  { key: "status", label: "Status" },
  { key: "operating_status", label: "Operating Status" },
  { key: "naics_code", label: "NAICS Code" },
  { key: "naics_title", label: "NAICS Title" },
  { key: "sic_code", label: "SIC Code" },
  { key: "sic_description", label: "SIC Description" },
  { key: "sic_sector_id", label: "SIC Sector ID" },
  { key: "sic_sector_name", label: "SIC Sector Name" },
  { key: "sic_division", label: "SIC Division" },
  { key: "phone", label: "Phone" },
  { key: "email", label: "Email" },
  { key: "website", label: "Website" },
  { key: "primary_address", label: "Primary Address" },
  { key: "city", label: "City" },
  { key: "region", label: "Region" },
  { key: "country", label: "Country" },
  { key: "zip_code", label: "ZIP Code" },
  { key: "latitude", label: "Latitude" },
  { key: "longitude", label: "Longitude" },
  { key: "founded_year", label: "Founded Year" },
  { key: "license_number", label: "License Number" },
  { key: "accreditation", label: "Accreditation" },
  { key: "legal_structure", label: "Legal Structure" },
  { key: "registration_number", label: "Registration Number" },
  { key: "tax_number", label: "Tax Number" },
  { key: "ownership_type", label: "Ownership Type" },
  { key: "description", label: "Description" },
  { key: "internal_notes", label: "Internal Notes" },
  { key: "company_id", label: "Company ID" },
];

export const ENTERPRISE_MAPPING_RULES = [
  // Most specific first — prevent wrong rule stealing the column
  [/parent.?enterprise.?id|parent.?id|hq.?id/i,              "parent_enterprise_id"],
  [/^enterprise.?id$|^external.?id$|^branch.?id$/i,          "enterprise_id"],
  [/^enterprise.?name$|^company.?name$|^org.?name$/i,        "enterprise_name"],
  [/^enterprise.?type$|^org.?type$|^business.?type$/i,       "enterprise_type"],
  [/enterprise.?subtype|^subtype$|^sub.?type$|^industry$/i,  "enterprise_subtype"],
  [/enterprise.?tier|^tier$|^level$/i,                       "enterprise_tier"],
  [/^company.?id$|^tenant$|^workspace$/i,                    "company_id"],

  // NAICS / SIC — most specific first (6-digit code before sector/division)
  [/^naics.?code$|^naics$/i,                                "naics_code"],
  [/^naics.?title$|^naics.?description$|^naics.?name$/i,    "naics_title"],
  [/^sic.?code$|^sic$/i,                                    "sic_code"],
  [/^sic.?description$|^sic.?desc$|^sic.?name$/i,          "sic_description"],
  [/sic.?sector.?id|naics.?id|sector.?id/i,                 "sic_sector_id"],
  [/sic.?sector.?name|sector.?name/i,                       "sic_sector_name"],
  [/sic.?division|^division$/i,                             "sic_division"],

  // Status fields
  [/^status$/i,                                              "status"],
  [/operating.?status|ops.?status|open.?status/i,           "operating_status"],

  // Contact
  [/^phone$|^mobile$|^telephone$|contact.?phone|^tel$/i,    "phone"],
  [/^email$|contact.?email/i,                               "email"],
  [/^website$|^url$|^web$/i,                                "website"],

  // Address — zip_code must come before short_name (which also matches "code")
  [/zip.?code|^zip$|postal.?code|^postcode$/i,              "zip_code"],
  [/^address$|^street$|address.?line|primary.?address/i,    "primary_address"],
  [/^city$|^town$|^location$/i,                             "city"],
  [/^region$|^state$|state.?region|^province$/i,            "region"],
  [/^country$|^nation$/i,                                   "country"],
  [/^lat$|^latitude$/i,                                     "latitude"],
  [/^lon$|^lng$|^longitude$/i,                              "longitude"],

  // Short name — after zip_code so "code" doesn't steal zip_code
  [/^short.?name$|^abbreviation$|^code$/i,                  "short_name"],

  // Dates and founding
  [/^founded.?year$|^year.?founded$|^established$/i,        "founded_year"],

  // Legal / compliance
  [/^license.?number$|^licence$|^permit$/i,                 "license_number"],
  [/^accreditation$|^accredited.?by$|^certification$/i,     "accreditation"],
  [/^legal.?structure$/i,                                   "legal_structure"],
  [/^registration.?number$|^reg.?no$|^company.?no$/i,       "registration_number"],
  [/^tax.?number$|^vat$/i,                                  "tax_number"],
  [/^ownership.?type$|^ownership$/i,                        "ownership_type"],

  // Free text — broadest patterns last
  [/^description$/i,                                        "description"],
  [/^internal.?notes$|^notes$/i,                            "internal_notes"],
];

export const ENTERPRISE_TEMPLATE_EXAMPLE = {
  enterprise_id: "ENT-001",
  enterprise_name: "Acme Head Office",
  enterprise_type: "commercial",
  enterprise_subtype: "Retail",
  enterprise_tier: "headquarters",
  parent_enterprise_id: "",
  status: "active",
  operating_status: "open",
  naics_code: "441110",
  naics_title: "New Car Dealers",
  sic_code: "5511",
  sic_description: "Motor Vehicle Dealers (New and Used)",
  sic_sector_id: 7,
  sic_sector_name: "Retail Trade",
  sic_division: "G_retail_trade",
  phone: "+1-555-000-1234",
  email: "info@acme-example.com",
  website: "https://www.example.com",
  city: "Springfield",
  region: "IL",
  country: "USA",
  zip_code: "62701",
  latitude: 39.798,
  longitude: -89.654,
  founded_year: 2010,
  license_number: "BIZ-00001",
  accreditation: "",
  company_id: "",
};

export const ENTERPRISE_TEMPLATE_INSTRUCTIONS = `
Excel import instructions for Enterprises:

REQUIRED: enterprise_name

ENUMS — use exact values:
  enterprise_type:    commercial | nonprofit | government | household | cooperative | trust
  enterprise_tier:    headquarters | regional_office | branch | subsidiary | franchise | department | unit | project
  status:             active | inactive | prospect | archived
  operating_status:   open | closed | temporarily_closed | seasonal
  sic_division:       K_education_health_social | I_services | H_finance_insurance_real_estate | A_agriculture_forestry_fishing | B_mining | C_construction | D_manufacturing | E_transport_communications_utilities | F_wholesale_trade | G_retail_trade | J_public_administration | L_nonprofit_religious | M_household_individual

INDUSTRY CLASSIFICATION (optional but recommended):
  naics_code    — 2–6 digit NAICS code (e.g. 446110 = Pharmacies and Drug Stores)
  naics_title   — NAICS industry title (e.g. "Pharmacies and Drug Stores")
  sic_code      — 4-digit SIC code (e.g. 5912 = Drug Stores and Proprietary Stores)
  sic_description — SIC industry description
  Find codes at: census.gov/naics  |  osha.gov/sic-manual

NOTES:
  • enterprise_id — your source system ID, stored in internal_notes as "External ID: XXX"
  • region — maps to the 'region' field (state or province abbreviation)
  • state_region — alias for region field
  • latitude / longitude — stored in internal_notes as "Lat: X.XXX, Lon: -X.XXX"
  • zip_code — stored in internal_notes as "Zip: XXXXX"
  • license_number — stored in the licenses array
  • accreditation — stored in internal_notes
  • company_id — auto-fills from your session if blank
  • parent_enterprise_id — must match the enterprise_id of an already-imported enterprise
`;

const ENTERPRISE_TYPE_KEYWORDS = [
  [/school|academy|college|university|education/i, "education"],
  [/clinic|hospital|pharmacy|health/i, "healthcare"],
  [/shop|store|retail|market/i, "retail"],
  [/restaurant|café|cafe|bakery|food|beverage/i, "food_beverage"],
  [/consulting|agency|firm|services/i, "other"],
  [/tech|software|digital|it\b/i, "technology"],
];

export function transformEnterprise(raw, currentUser) {
  const internalNotes = [];

  // Preserve external enterprise_id
  if (raw.enterprise_id) {
    internalNotes.push(`External ID: ${raw.enterprise_id}`);
  }

  // Coordinates
  if (raw.latitude || raw.longitude) {
    internalNotes.push(`Lat: ${raw.latitude || ""}, Lon: ${raw.longitude || ""}`);
  }

  // Founded year
  if (raw.founded_year) {
    internalNotes.push(`Founded: ${raw.founded_year}`);
  }

  // ZIP code
  if (raw.zip_code) {
    internalNotes.push(`Zip: ${raw.zip_code}`);
  }

  // Accreditation
  if (raw.accreditation) {
    internalNotes.push(`Accreditation: ${raw.accreditation}`);
  }

  // Build licenses array
  const licenses = [];
  if (raw.license_number) {
    licenses.push({
      type: "Operating License",
      number: raw.license_number,
      expiry_date: "",
    });
  }

  // Map enterprise_type — enforce enum
  const VALID_TYPES = ["commercial", "nonprofit", "government", "household", "cooperative", "trust"];
  const enterpriseType = VALID_TYPES.includes(raw.enterprise_type)
    ? raw.enterprise_type
    : "commercial";

  // Map enterprise_tier — enforce enum
  const VALID_TIERS = ["headquarters", "regional_office", "branch", "subsidiary", "franchise", "department", "unit", "project"];
  const enterpriseTier = VALID_TIERS.includes(raw.enterprise_tier)
    ? raw.enterprise_tier
    : undefined;

  // Map sic_division — enforce enum
  const VALID_DIVISIONS = [
    "A_agriculture_forestry_fishing", "B_mining", "C_construction",
    "D_manufacturing", "E_transport_communications_utilities",
    "F_wholesale_trade", "G_retail_trade", "H_finance_insurance_real_estate",
    "I_services", "J_public_administration", "K_education_health_social",
    "L_nonprofit_religious", "M_household_individual"
  ];
  const sicDivision = VALID_DIVISIONS.includes(raw.sic_division)
    ? raw.sic_division
    : undefined;

  return {
    enterprise_name:      raw.enterprise_name,
    short_name:           raw.short_name || undefined,
    enterprise_type:      enterpriseType,
    enterprise_subtype:   raw.enterprise_subtype || undefined,
    sub_type:             raw.enterprise_subtype || undefined,
    enterprise_tier:      enterpriseTier,
    parent_enterprise_id: raw.parent_enterprise_id || undefined,
    status:               ["active", "inactive", "prospect", "archived"].includes(raw.status)
                            ? raw.status : "active",
    operating_status:     ["open", "closed", "temporarily_closed", "seasonal"].includes(raw.operating_status)
                            ? raw.operating_status : "open",
    naics_code:           raw.naics_code ? String(raw.naics_code).trim() : undefined,
    naics_title:          raw.naics_title || undefined,
    sic_code:             raw.sic_code ? String(raw.sic_code).trim() : undefined,
    sic_description:      raw.sic_description || undefined,
    sic_sector_id:        raw.sic_sector_id ? Number(raw.sic_sector_id) : undefined,
    sic_sector_name:      raw.sic_sector_name || undefined,
    sic_division:         sicDivision,
    phone:                raw.phone || undefined,
    email:                raw.email || undefined,
    website:              raw.website || undefined,
    city:                 raw.city || undefined,
    region:               raw.region || raw.state_region || undefined,
    country:              raw.country || undefined,
    licenses:             licenses.length > 0 ? licenses : undefined,
    internal_notes:       internalNotes.length > 0 ? internalNotes.join(" | ") : undefined,
    company_id:           raw.company_id || currentUser?.company_id,
  };
}

export function validateEnterprise(row) {
  const errors = [];
  const warnings = [];
  if (!row.enterprise_name?.trim()) {
    errors.push("enterprise_name is required");
  }
  const VALID_TYPES = ["commercial", "nonprofit", "government", "household", "cooperative", "trust"];
  if (row.enterprise_type && !VALID_TYPES.includes(row.enterprise_type)) {
    errors.push(`enterprise_type "${row.enterprise_type}" is not valid. Use: ${VALID_TYPES.join(", ")}`);
  }
  if (row.email && !row.email.includes("@")) {
    errors.push(`email "${row.email}" does not look valid`);
  }
  if (row.naics_code && !/^\d{2,6}$/.test(String(row.naics_code).trim())) {
    warnings.push(`naics_code "${row.naics_code}" should be a 2–6 digit number (e.g. 446110)`);
  }
  if (row.sic_code && !/^\d{2,4}$/.test(String(row.sic_code).trim())) {
    warnings.push(`sic_code "${row.sic_code}" should be a 2–4 digit number (e.g. 5912)`);
  }
  return { errors, warnings };
}

// ── SERVICES ──────────────────────────────────────────────────────────────
export const SERVICE_FIELDS = [
  { key: "name", label: "Service Name *", required: true },
  { key: "short_code", label: "Short Code" },
  { key: "description", label: "Description" },
  { key: "category", label: "Category" },
  { key: "sub_category", label: "Sub Category" },
  { key: "service_type", label: "Service Type" },
  { key: "pricing_model", label: "Pricing Model" },
  { key: "price", label: "Price" },
  { key: "billing_unit", label: "Billing Unit" },
  { key: "tax_applicable", label: "Tax Applicable" },
  { key: "estimated_duration", label: "Estimated Duration" },
  { key: "duration_unit", label: "Duration Unit" },
  { key: "response_sla_hours", label: "Response SLA Hours" },
  { key: "completion_sla_hours", label: "Completion SLA Hours" },
  { key: "status", label: "Status" },
  { key: "internal_notes", label: "Internal Notes" },
];

export const SERVICE_MAPPING_RULES = [
  [/service.?name|^name$|^title$/i, "name"],
  [/^code$|short.?code|sku/i, "short_code"],
  [/description/i, "description"],
  [/^category$|^type$|group/i, "category"],
  [/sub.?category/i, "sub_category"],
  [/service.?type/i, "service_type"],
  [/pricing.?model/i, "pricing_model"],
  [/^price$|^rate$|^cost$/i, "price"],
  [/billing.?unit/i, "billing_unit"],
  [/tax/i, "tax_applicable"],
  [/duration|time/i, "estimated_duration"],
  [/duration.?unit/i, "duration_unit"],
  [/sla|response.?time/i, "response_sla_hours"],
  [/completion.?sla/i, "completion_sla_hours"],
  [/^status$/i, "status"],
  [/notes/i, "internal_notes"],
];

export const SERVICE_TEMPLATE_EXAMPLE = {
  name: "Monthly Cleaning", short_code: "CLN-01",
  description: "Full-service monthly cleaning", category: "cleaning",
  service_type: "recurring", pricing_model: "fixed",
  price: 299.99, billing_unit: "month", tax_applicable: "false",
  estimated_duration: 4, duration_unit: "hours",
  response_sla_hours: 24, completion_sla_hours: 48,
  status: "active", internal_notes: "",
};

export const SERVICE_TEMPLATE_INSTRUCTIONS = [
  ["name","Yes","Service name","Monthly Cleaning"],
  ["category","No","Category","consulting, maintenance, installation, delivery, cleaning, training, design, accounting, legal, marketing, it_support, other"],
  ["service_type","No","Service type","one_time, recurring, on_demand"],
  ["pricing_model","No","Pricing model","fixed, hourly, per_unit, subscription"],
  ["billing_unit","No","Billing unit","hour, day, week, month, unit, project"],
  ["price","No","Base price (numeric)","299.99"],
  ["estimated_duration","No","Duration (numeric)","4"],
  ["duration_unit","No","Duration unit","minutes, hours, days"],
  ["status","No","Status","active, inactive, archived"],
];

export function transformService(row) {
  if (!row.service_type) {
    const n = (row.name || "").toLowerCase();
    if (/monthly|annual|subscription|recurring/.test(n)) row.service_type = "recurring";
    else if (/one.?time|once|single/.test(n)) row.service_type = "one_time";
    else row.service_type = "on_demand";
  }
  ["price","estimated_duration","response_sla_hours","completion_sla_hours"].forEach((k) => {
    if (row[k]) { const n = parseFloat(row[k]); row[k] = isNaN(n) ? undefined : n; }
  });
  return row;
}

export function validateService(row) {
  const errors = [], warnings = [];
  if (!row.name) errors.push("name required");
  if (row.price && isNaN(parseFloat(row.price))) errors.push("price must be numeric");
  if (row.estimated_duration && isNaN(parseFloat(row.estimated_duration))) errors.push("estimated_duration must be numeric");
  const validStatuses = ["active","inactive","archived"];
  if (row.status && !validStatuses.includes(row.status)) warnings.push(`Unknown status "${row.status}"`);
  return { errors, warnings };
}

// ── ADDRESSES ─────────────────────────────────────────────────────────────
export const ADDRESS_FIELDS = [
  { key: "address_line1",        label: "Address Line 1 *", required: true },
  { key: "city",                 label: "City *",           required: true },
  { key: "country",              label: "Country *",        required: true },
  { key: "address_id",           label: "Address ID (External)" },
  { key: "address_line",         label: "Address Line" },
  { key: "address_line2",        label: "Address Line 2" },
  { key: "label",                label: "Label" },
  { key: "state_region",         label: "State / Region" },
  { key: "zip_code",             label: "ZIP Code" },
  { key: "postal_code",          label: "Postal Code" },
  { key: "latitude",             label: "Latitude" },
  { key: "longitude",            label: "Longitude" },
  { key: "has_coordinates",      label: "Has Coordinates" },
  { key: "linked_enterprise_id", label: "Linked Enterprise ID" },
  { key: "linked_person_id",     label: "Linked Person ID" },
  { key: "is_primary",           label: "Is Primary" },
  { key: "is_active",            label: "Is Active" },
  { key: "status",               label: "Status" },
  { key: "internal_notes",       label: "Internal Notes" },
  { key: "company_id",           label: "Company ID" },
];

export const ADDRESS_MAPPING_RULES = [
  // ID
  [/^address.?id$|^external.?id$/i,                          "address_id"],

  // Label
  [/^label$|^address.?label$|^location.?name$/i,             "label"],

  // Address lines — zip/postal BEFORE address so "address" doesn't steal them
  [/^zip.?code$|^zip$|^zip.?code$/i,                         "zip_code"],
  [/^postal.?code$|^postcode$|^post.?code$/i,                "postal_code"],
  [/^address.?line$|^address.?line.?1$|^street$|^address$/i, "address_line1"],
  [/^address.?line.?2$|^suite$|^apt$|^unit$/i,               "address_line2"],

  // Location
  [/^city$|^town$|^locality$/i,                              "city"],
  [/^state.?region$|^state$|^region$|^province$/i,           "state_region"],
  [/^country$|^nation$/i,                                    "country"],

  // Coordinates
  [/^latitude$|^lat$/i,                                      "latitude"],
  [/^longitude$|^lon$|^lng$/i,                               "longitude"],
  [/^has.?coordinates$|^geocoded$/i,                         "has_coordinates"],

  // Linked entities
  [/^linked.?enterprise.?id$|^enterprise.?id$|^branch.?id$/i,"linked_enterprise_id"],
  [/^linked.?person.?id$|^person.?id$|^client.?id$/i,        "linked_person_id"],

  // Flags
  [/^is.?primary$|^primary.?address$/i,                      "is_primary"],
  [/^is.?active$|^active$/i,                                 "is_active"],
  [/^status$/i,                                              "status"],

  // Text — broadest last
  [/^internal.?notes$|^notes$|^comments$/i,                  "internal_notes"],
  [/^company.?id$|^tenant$|^workspace$/i,                    "company_id"],
];

export const ADDRESS_TEMPLATE_EXAMPLE = {
  label: "Main Office", address_line1: "789 Corporate Blvd",
  address_line2: "Suite 400", city: "Boston",
  state_region: "MA", postal_code: "02101", country: "USA",
  latitude: 42.3601, longitude: -71.0589, status: "active", internal_notes: "",
};

export const ADDRESS_TEMPLATE_INSTRUCTIONS = [
  ["address_line1","Yes","Street address (required)","789 Corporate Blvd"],
  ["city","Yes","City (required)","Boston"],
  ["country","Yes","Country (required)","USA"],
  ["label","No","Descriptive label","Main Office"],
  ["state_region","No","State or region","MA"],
  ["postal_code","No","Postal / ZIP code","02101"],
  ["latitude","No","Latitude -90 to 90","42.3601"],
  ["longitude","No","Longitude -180 to 180","-71.0589"],
  ["status","No","Status","active, archived"],
];

export function transformAddress(row, currentUser) {
  const notes = [];
  if (row.address_id)           notes.push(`External ID: ${row.address_id}`);
  if (row.linked_enterprise_id) notes.push(`Linked enterprise: ${row.linked_enterprise_id}`);
  if (row.linked_person_id)     notes.push(`Linked person: ${row.linked_person_id}`);
  if (row.has_coordinates)      notes.push(`Has coordinates: ${row.has_coordinates}`);

  // address_line maps to address_line1
  const line1 = row.address_line1 || row.address_line || undefined;

  // zip_code maps to postal_code if postal_code blank
  const postal = row.postal_code || row.zip_code || undefined;

  // is_active → status
  let status = row.status;
  if (!status) status = row.is_active === false || row.is_active === "false"
    ? "archived" : "active";

  ["latitude","longitude"].forEach(k => {
    if (row[k] != null && row[k] !== "") {
      const n = parseFloat(row[k]); row[k] = isNaN(n) ? undefined : n;
    }
  });

  const existing = row.internal_notes ? [row.internal_notes] : [];
  return {
    label:          row.label         || undefined,
    address_line1:  line1,
    address_line2:  row.address_line2 || undefined,
    city:           row.city,
    state_region:   row.state_region  || undefined,
    postal_code:    postal,
    country:        row.country,
    latitude:       row.latitude      || undefined,
    longitude:      row.longitude     || undefined,
    status:         ["active","archived"].includes(status) ? status : "active",
    internal_notes: [...existing, ...notes].join(" | ") || undefined,
    company_id:     row.company_id || currentUser?.company_id,
  };
}

export function validateAddress(row) {
  const errors = [], warnings = [];

  const line1 = row.address_line1 || row.address_line;
  if (!line1)       errors.push("address_line1 is required");
  if (!row.city)    errors.push("city is required");
  if (!row.country) errors.push("country is required");

  const VALID_STATUS = ["active","archived"];
  if (row.status && !VALID_STATUS.includes(row.status)) {
    warnings.push(`status "${row.status}" not recognised — will default to "active"`);
  }
  if (row.latitude != null && row.latitude !== "") {
    const n = parseFloat(row.latitude);
    if (isNaN(n) || n < -90 || n > 90)
      errors.push("latitude must be between -90 and 90");
  }
  if (row.longitude != null && row.longitude !== "") {
    const n = parseFloat(row.longitude);
    if (isNaN(n) || n < -180 || n > 180)
      errors.push("longitude must be between -180 and 180");
  }

  return { errors, warnings };
}

// ── TASKS ─────────────────────────────────────────────────────────────────
export const TASK_FIELDS = [
  { key: "task_type",         label: "Task Type *",     required: true },
  { key: "title",             label: "Title *",         required: true },
  { key: "task_id",           label: "Task ID (External)" },
  { key: "description",       label: "Description" },
  { key: "status",            label: "Status" },
  { key: "priority",          label: "Priority" },
  { key: "assigned_to_id",    label: "Assigned To ID" },
  { key: "assigned_to_name",  label: "Assigned To Name" },
  { key: "assigned_to_email", label: "Assigned To Email" },
  { key: "client_id",         label: "Client ID (External)" },
  { key: "client_name",       label: "Client Name" },
  { key: "enterprise_id",     label: "Enterprise ID (External)" },
  { key: "enterprise_name",   label: "Enterprise Name" },
  { key: "enterprise",        label: "Enterprise" },
  { key: "service_line",      label: "Service Line" },
  { key: "scheduled_date",    label: "Scheduled Date" },
  { key: "due_date",          label: "Due Date" },
  { key: "completed_date",    label: "Completed Date" },
  { key: "duration_hours",    label: "Duration (Hours)" },
  { key: "outcome",           label: "Outcome" },
  { key: "outcome_notes",     label: "Outcome Notes" },
  { key: "related_person",    label: "Related Person" },
  { key: "related_item",      label: "Related Item" },
  { key: "internal_notes",    label: "Internal Notes" },
  { key: "company_id",        label: "Company ID" },
];

export const TASK_MAPPING_RULES = [
  // Type and ID — most specific first
  [/^task.?type$|^type$/i,                               "task_type"],
  [/^task.?id$|^external.?id$/i,                         "task_id"],

  // Title — anchored so description doesn't get captured here
  [/^title$|^subject$|^name$/i,                          "title"],

  // Description — separate from title
  [/^description$|^detail$|^summary$/i,                  "description"],

  // Status and priority
  [/^status$/i,                                          "status"],
  [/^priority$|^urgency$/i,                              "priority"],

  // Assignment — ID before name
  [/^assigned.?to.?id$|^assignee.?id$|^staff.?id$/i,    "assigned_to_id"],
  [/^assigned.?to.?name$|^assignee.?name$|^assigned.?to$/i, "assigned_to_name"],
  [/^assigned.?to.?email$|^assignee.?email$/i,           "assigned_to_email"],

  // Client — ID before name, anchored to avoid stealing enterprise fields
  [/^client.?id$|^patient.?id$|^person.?id$/i,          "client_id"],
  [/^client.?name$|^patient.?name$|^person.?name$/i,     "client_name"],

  // Enterprise — ID before name, anchored so company_id not captured here
  [/^enterprise.?id$|^branch.?id$|^location.?id$/i,     "enterprise_id"],
  [/^enterprise.?name$|^branch.?name$/i,                 "enterprise_name"],
  [/^enterprise$|^company$|^branch$/i,                   "enterprise"],

  // Service
  [/^service.?line$|^care.?line$/i,                      "service_line"],

  // Dates — completed before scheduled/due to avoid partial match confusion
  [/^completed.?date$|^finish.?date$|^done.?date$/i,     "completed_date"],
  [/^scheduled.?date$|^schedule.?date$|^planned.?date$/i,"scheduled_date"],
  [/^due.?date$|^deadline$/i,                            "due_date"],

  // Duration
  [/^duration.?hours$|^hours$|^duration$/i,              "duration_hours"],

  // Outcome — notes before outcome so outcome_notes doesn't match outcome
  [/^outcome.?notes$|^result.?notes$/i,                  "outcome_notes"],
  [/^outcome$|^result$/i,                                "outcome"],

  // Related entities
  [/^related.?person$|^linked.?person$/i,                "related_person"],
  [/^related.?item$|^linked.?item$|^product$/i,          "related_item"],

  // Text — broadest last
  [/^internal.?notes$|^notes$|^comments$/i,              "internal_notes"],
  [/^company.?id$|^tenant$|^workspace$/i,                "company_id"],
];

export const TASK_TEMPLATE_EXAMPLE = {
  task_type: "other", title: "Follow up with client",
  status: "open", priority: "normal",
  assigned_to_name: "Jane Smith", assigned_to_email: "jane@example.com",
  enterprise: "Acme Corp", related_person: "", related_item: "",
  scheduled_date: "2025-02-01", scheduled_time: "09:00",
  due_date: "2025-02-05", due_time: "", outcome: "pending", outcome_notes: "", internal_notes: "",
};

export const TASK_TEMPLATE_INSTRUCTIONS = [
  ["task_type","Yes","Task type","Any value from your task taxonomy (e.g. appointment, class_session, field_visit, delivery, other)"],
  ["title","Yes","Short description of the task","Follow up with client"],
  ["status","No","Status","open, in_progress, completed, cancelled"],
  ["priority","No","Priority","low, normal, high, urgent"],
  ["assigned_to_email","No","Email of the assigned app user","jane@example.com"],
  ["scheduled_date","No","Scheduled date","YYYY-MM-DD"],
  ["due_date","No","Due date","YYYY-MM-DD"],
  ["enterprise","No","Enterprise name (must match existing record)","Acme Corp"],
];

export function validateTask(row) {
  const errors = [], warnings = [];
  if (!row.task_type) errors.push("task_type is required");
  if (!row.title)     errors.push("title is required");
  const VALID_STATUSES = ["open","in_progress","completed","cancelled"];
  if (row.status && !VALID_STATUSES.includes(row.status))
    warnings.push(`status "${row.status}" not recognised — defaulting to "open"`);
  const VALID_PRIORITIES = ["low","normal","high","urgent"];
  if (row.priority && !VALID_PRIORITIES.includes(row.priority))
    warnings.push(`priority "${row.priority}" not recognised — defaulting to "normal"`);
  if (row.scheduled_date && isNaN(Date.parse(row.scheduled_date)))
    warnings.push("scheduled_date format unclear — use YYYY-MM-DD");
  if (row.due_date && isNaN(Date.parse(row.due_date)))
    warnings.push("due_date format unclear — use YYYY-MM-DD");
  return { errors, warnings };
}

export function transformTask(row, currentUser) {
  const notes = [];
  if (row.task_id)        notes.push(`External ID: ${row.task_id}`);
  if (row.client_id)      notes.push(`Client ID: ${row.client_id}`);
  if (row.enterprise_id)  notes.push(`Enterprise ID: ${row.enterprise_id}`);
  if (row.service_line)   notes.push(`Service line: ${row.service_line}`);
  if (row.duration_hours) notes.push(`Duration: ${row.duration_hours}h`);

  // Merge client_name → related_person if not already set
  const relatedPerson = row.related_person || row.client_name || undefined;
  // Merge enterprise_name → enterprise if not already set
  const enterprise = row.enterprise || row.enterprise_name || undefined;

  // task_type is operator-defined taxonomy — accept any non-empty string.
  // Never coerce to "other": an operator importing "class_session" or "field_visit"
  // must get exactly those values, not "other".
  const taskType = row.task_type || "other";

  const existing = row.internal_notes ? [row.internal_notes] : [];
  return {
    task_type:        taskType,
    title:            row.title,
    description:      row.description      || undefined,
    status:           ["open","in_progress","completed","cancelled"].includes(row.status)
                        ? row.status : "open",
    priority:         ["low","normal","high","urgent"].includes(row.priority)
                        ? row.priority : "normal",
    assigned_to_name: row.assigned_to_name || undefined,
    assigned_to_email:row.assigned_to_email|| undefined,
    enterprise,
    related_person:   relatedPerson,
    scheduled_date:   row.scheduled_date   || undefined,
    due_date:         row.due_date         || undefined,
    outcome:          row.outcome          || "pending",
    outcome_notes:    row.outcome_notes    || undefined,
    internal_notes:   [...existing, ...notes].join(" | ") || undefined,
    company_id:       row.company_id || currentUser?.company_id,
  };
}

// ── TRANSACTIONS ───────────────────────────────────────────────────────────
export const TRANSACTION_FIELDS = [
  { key: "transaction_type",  label: "Transaction Type *", required: true },
  { key: "date",              label: "Date *",             required: true },
  { key: "transaction_id",    label: "Transaction ID (External)" },
  { key: "transaction_date",  label: "Transaction Date" },
  { key: "status",            label: "Status" },
  { key: "payment_status",    label: "Payment Status" },
  { key: "amount",            label: "Amount" },
  { key: "currency",          label: "Currency" },
  { key: "due_date",          label: "Due Date" },
  { key: "enterprise",        label: "Enterprise Name" },
  { key: "branch_id",         label: "Branch ID" },
  { key: "primary_person",    label: "Primary Person" },
  { key: "counterparty",      label: "Counterparty" },
  { key: "client_id",         label: "Client ID (External)" },
  { key: "client_name",       label: "Client Name" },
  { key: "service_id",        label: "Service ID" },
  { key: "service_name",      label: "Service Name" },
  { key: "service_line",      label: "Service Line" },
  { key: "payer_type",        label: "Payer Type" },
  { key: "billing_code",      label: "Billing Code" },
  { key: "hours_billed",      label: "Hours Billed" },
  { key: "rate_per_hour",     label: "Rate Per Hour" },
  { key: "invoice_number",    label: "Invoice Number" },
  { key: "reference_number",  label: "Reference Number" },
  { key: "tax_amount",        label: "Tax Amount" },
  { key: "amount_paid",       label: "Amount Paid" },
  { key: "payment_method",    label: "Payment Method" },
  { key: "description",       label: "Description" },
  { key: "internal_notes",    label: "Internal Notes" },
  { key: "company_id",        label: "Company ID" },
];

export const TRANSACTION_MAPPING_RULES = [
  // Type and ID — most specific first
  [/^transaction.?type$|^tx.?type$|^type$/i,           "transaction_type"],
  [/^transaction.?id$|^tx.?id$|^external.?id$/i,       "transaction_id"],

  // Date — transaction_date before generic date
  [/^transaction.?date$|^tx.?date$/i,                   "transaction_date"],
  [/^date$|^event.?date$/i,                             "date"],
  [/^due.?date$/i,                                      "due_date"],

  // Status fields — anchored
  [/^status$/i,                                         "status"],
  [/^payment.?status$|^pay.?status$/i,                  "payment_status"],
  [/^payment.?method$|^pay.?method$|^method$/i,         "payment_method"],

  // Amounts — specific before generic
  [/^amount.?paid$|^paid.?amount$/i,                    "amount_paid"],
  [/^tax.?amount$|^tax$/i,                              "tax_amount"],
  [/^amount$|^total$|^gross.?amount$/i,                 "amount"],
  [/^currency$|^currency.?code$/i,                      "currency"],

  // Billing fields
  [/^hours.?billed$|^billed.?hours$/i,                  "hours_billed"],
  [/^rate.?per.?hour$|^hourly.?rate$|^rate$/i,          "rate_per_hour"],
  [/^invoice.?number$|^invoice.?no$|^inv.?no$/i,        "invoice_number"],
  [/^billing.?code$|^procedure.?code$/i,                "billing_code"],
  [/^payer.?type$|^payer$|^insurance.?type$/i,          "payer_type"],
  [/^service.?line$|^care.?line$/i,                     "service_line"],

  // IDs before names — prevents _id being captured by _name rule
  [/^client.?id$|^patient.?id$/i,                       "client_id"],
  [/^client.?name$|^patient.?name$/i,                   "client_name"],
  [/^service.?id$|^product.?id$/i,                      "service_id"],
  [/^service.?name$|^product.?name$/i,                  "service_name"],
  [/^branch.?id$|^location.?id$/i,                      "branch_id"],

  // Enterprise — anchored, after branch_id
  [/^enterprise.?name$|^enterprise$|^company.?name$/i,  "enterprise"],
  [/^primary.?person$|^staff.?name$|^assigned.?to$/i,   "primary_person"],
  [/^counterparty$|^customer$|^vendor$|^supplier$/i,    "counterparty"],

  // Reference
  [/^reference.?number$|^ref.?no$|^reference$/i,        "reference_number"],

  // Text — broadest last
  [/^description$|^reason$/i,                           "description"],
  [/^internal.?notes$|^notes$|^comments$/i,             "internal_notes"],
  [/^company.?id$|^tenant$|^workspace$/i,               "company_id"],
];

export const TRANSACTION_TEMPLATE_EXAMPLE = {
  transaction_type: "sale_service", date: "2025-01-15",
  status: "draft", enterprise: "Acme Corp",
  primary_person: "Jane Smith", counterparty: "Client A",
  description: "Monthly service fee", amount: 500,
  tax_amount: 50, payment_method: "bank_transfer",
  payment_status: "unpaid", amount_paid: 0,
  due_date: "2025-02-01", reference_number: "INV-001", internal_notes: "",
};

export const TRANSACTION_TEMPLATE_INSTRUCTIONS = [
  ["transaction_type","Yes","Type","stock_in, stock_out, stock_transfer, item_assignment, item_return, sale_service, expense, adjustment, attendance"],
  ["date","Yes","Transaction date","YYYY-MM-DD"],
  ["status","No","Status","draft, posted, voided"],
  ["amount","No","Total amount (numeric)","500.00"],
  ["payment_method","No","Payment method","cash, bank_transfer, credit_card, mobile_money, check, other"],
  ["payment_status","No","Payment status","paid, unpaid, partial, na"],
  ["due_date","No","Payment due date","YYYY-MM-DD"],
  ["enterprise","No","Enterprise name (must match existing record)","Acme Corp"],
];

export function validateTransaction(row) {
  const errors = [], warnings = [];
  if (!row.transaction_type) errors.push("transaction_type is required");
  const date = row.date || row.transaction_date;
  if (!date) errors.push("date is required");
  else if (isNaN(Date.parse(date))) errors.push("date format invalid — use YYYY-MM-DD");
  const VALID_TYPES = ["stock_in","stock_out","stock_transfer","item_assignment",
                       "item_return","sale_service","expense","adjustment",
                       "attendance","product_sale","payroll","service_fee",
                       "contractor_payment","utility_expense","supply_purchase"];
  if (row.transaction_type && !VALID_TYPES.includes(row.transaction_type))
    warnings.push(`transaction_type "${row.transaction_type}" not in standard list — will import as-is`);
  if (row.amount && isNaN(parseFloat(row.amount))) errors.push("amount must be a number");
  return { errors, warnings };
}

export function transformTransaction(row, currentUser) {
  const notes = [];
  if (row.transaction_id)  notes.push(`External ID: ${row.transaction_id}`);
  if (row.client_id)       notes.push(`Client ID: ${row.client_id}`);
  if (row.service_id)      notes.push(`Service ID: ${row.service_id}`);
  if (row.branch_id)       notes.push(`Branch ID: ${row.branch_id}`);
  if (row.service_line)    notes.push(`Service line: ${row.service_line}`);
  if (row.billing_code)    notes.push(`Billing code: ${row.billing_code}`);
  if (row.hours_billed)    notes.push(`Hours billed: ${row.hours_billed}`);
  if (row.rate_per_hour)   notes.push(`Rate/hr: ${row.rate_per_hour}`);
  if (row.payer_type)      notes.push(`Payer: ${row.payer_type}`);
  if (row.currency && row.currency !== "USD")
    notes.push(`Currency: ${row.currency}`);

  // Use transaction_date if date is blank
  const txDate = row.date || row.transaction_date;

  // Use client_name as counterparty if counterparty blank
  const counterparty = row.counterparty || row.client_name || undefined;

  // Use invoice_number as reference_number if blank
  const reference = row.reference_number || row.invoice_number || undefined;

  const VALID_TYPES = ["stock_in","stock_out","stock_transfer","item_assignment",
                       "item_return","sale_service","expense","adjustment",
                       "attendance","product_sale","payroll","service_fee",
                       "contractor_payment","utility_expense","supply_purchase"];
  const txType = VALID_TYPES.includes(row.transaction_type)
    ? row.transaction_type : "sale_service";

  ["amount","tax_amount","amount_paid","hours_billed","rate_per_hour"].forEach(k => {
    if (row[k] != null && row[k] !== "") {
      const n = parseFloat(row[k]);
      row[k] = isNaN(n) ? undefined : n;
    }
  });

  const existing = row.internal_notes ? [row.internal_notes] : [];
  return {
    transaction_type: txType,
    date:             txDate,
    status:           ["draft","posted","voided"].includes(row.status)
                        ? row.status : "draft",
    payment_status:   ["paid","unpaid","partial","na"].includes(row.payment_status)
                        ? row.payment_status : "na",
    amount:           row.amount,
    tax_amount:       row.tax_amount,
    amount_paid:      row.amount_paid,
    due_date:         row.due_date       || undefined,
    enterprise:       row.enterprise     || undefined,
    primary_person:   row.primary_person || undefined,
    counterparty,
    description:      row.description   || undefined,
    reference_number: reference,
    payment_method:   row.payment_method || undefined,
    internal_notes:   [...existing, ...notes].join(" | ") || undefined,
    company_id:       row.company_id || currentUser?.company_id,
  };
}

// ── RELATIONSHIPS ─────────────────────────────────────────────────────────
export const RELATIONSHIP_FIELDS = [
  { key: "relationship_type",  label: "Relationship Type *", required: true },
  { key: "relationship_id",    label: "Relationship ID (External)" },
  { key: "person_name",        label: "Person Name" },
  { key: "person_id",          label: "Person ID (External)" },
  { key: "enterprise_name",    label: "Enterprise Name" },
  { key: "enterprise_id",      label: "Enterprise ID (External)" },
  { key: "item_name",          label: "Item Name" },
  { key: "item_id",            label: "Item ID (External)" },
  { key: "role",               label: "Role" },
  { key: "start_date",         label: "Start Date" },
  { key: "end_date",           label: "End Date" },
  { key: "status",             label: "Status" },
  { key: "notes",              label: "Notes" },
  { key: "company_id",         label: "Company ID" },
];

export const RELATIONSHIP_MAPPING_RULES = [
  // Type — most specific first
  [/^relationship.?type$|^rel.?type$/i,            "relationship_type"],
  [/^relationship.?id$|^rel.?id$|^external.?id$/i, "relationship_id"],

  // Person — ID before NAME so person_id doesn't match person_name rule
  [/^person.?id$|^client.?id$|^staff.?id$|^contact.?id$/i, "person_id"],
  [/^person.?name$|^client.?name$|^staff.?name$/i,          "person_name"],

  // Enterprise — ID before NAME
  [/^enterprise.?id$|^branch.?id$|^org.?id$/i,     "enterprise_id"],
  [/^enterprise.?name$|^branch.?name$|^org.?name$/i,"enterprise_name"],

  // Item — ID before NAME
  [/^item.?id$|^product.?id$|^service.?id$/i,      "item_id"],
  [/^item.?name$|^product.?name$|^service.?name$/i, "item_name"],

  // Other fields
  [/^role$|^position$|^relationship.?role$/i,       "role"],
  [/^start.?date$|^from.?date$/i,                   "start_date"],
  [/^end.?date$|^to.?date$/i,                       "end_date"],
  [/^status$/i,                                     "status"],
  [/^company.?id$|^tenant$|^workspace$/i,           "company_id"],
  [/^notes$|^internal.?notes$|^comments$/i,         "notes"],
];

export const RELATIONSHIP_TEMPLATE_EXAMPLE = {
  relationship_type: "person_enterprise", person_name: "Jane Smith",
  enterprise_name: "Acme Corp", item_name: "", service_name: "",
  role: "Employee", start_date: "2024-01-01", end_date: "", status: "active", notes: "",
};

export const RELATIONSHIP_TEMPLATE_INSTRUCTIONS = [
  ["relationship_type","Yes","Type of relationship","person_enterprise, item_enterprise, item_person, person_service, enterprise_service, person_address, enterprise_address"],
  ["person_name","Conditional","Required if type involves person","Jane Smith"],
  ["enterprise_name","Conditional","Required if type involves enterprise","Acme Corp"],
  ["item_name","Conditional","Required if type involves item","Laptop HP ProBook"],
  ["service_name","Conditional","Required if type involves service","Monthly Cleaning"],
  ["role","No","Role in the relationship","Employee, Owner, Tenant"],
  ["start_date","No","Start date","YYYY-MM-DD"],
  ["end_date","No","End date (optional)","YYYY-MM-DD"],
  ["status","No","Status","active, ended, archived"],
];

// ── PRODUCTS / ITEMS ──────────────────────────────────────────────────────
export const PRODUCT_FIELDS = [
  { key: "product_name",      label: "Product Name *",     required: true },
  { key: "product_id",        label: "Product ID (External)" },
  { key: "item_type",         label: "Item Type" },
  { key: "item_subtype",      label: "Item Subtype" },
  { key: "item_class",        label: "Item Class" },
  { key: "item_brand",        label: "Brand" },
  { key: "item_variant",      label: "Variant" },
  { key: "unit_of_measure",   label: "Unit of Measure" },
  { key: "stock_quantity",    label: "Stock Quantity" },
  { key: "reorder_level",     label: "Reorder Level" },
  { key: "expiry_date",       label: "Expiry Date" },
  { key: "status",            label: "Status" },
  { key: "description",       label: "Description" },
  { key: "service_line",      label: "Service Line" },
  { key: "billing_code",      label: "Billing Code" },
  { key: "unit_price",        label: "Unit Price" },
  { key: "min_hours",         label: "Min Hours" },
  { key: "max_hours_per_day", label: "Max Hours Per Day" },
  { key: "requires_license",  label: "Requires License" },
  { key: "payer_eligible",    label: "Payer Eligible" },
  { key: "internal_notes",    label: "Internal Notes" },
  { key: "company_id",        label: "Company ID" },
];

export const PRODUCT_MAPPING_RULES = [
  [/^product.?name$|^item.?name$|^name$|^title$/i,             "product_name"],
  [/^product.?id$|^item.?id$|^sku$|^external.?id$/i,           "product_id"],
  [/^item.?type$|^product.?type$|^type$/i,                     "item_type"],
  [/^item.?subtype$|^subtype$|^sub.?type$|^category$/i,        "item_subtype"],
  [/^item.?class$|^class$|^classification$/i,                  "item_class"],
  [/^item.?brand$|^brand$|^manufacturer$/i,                    "item_brand"],
  [/^item.?variant$|^variant$|^variation$|^model$/i,           "item_variant"],
  [/^unit.?of.?measure$|^uom$|^unit.?type$|^billing.?unit$/i,  "unit_of_measure"],
  [/^stock.?quantity$|^quantity$|^qty$|^on.?hand$/i,           "stock_quantity"],
  [/^reorder.?level$|^reorder.?point$|^min.?stock$/i,          "reorder_level"],
  [/^expiry.?date$|^expiration$|^expires$/i,                   "expiry_date"],
  [/^status$/i,                                                "status"],
  [/^service.?line$|^care.?line$/i,                            "service_line"],
  [/^billing.?code$|^procedure.?code$|^cpt.?code$/i,           "billing_code"],
  [/^unit.?price$|^price$|^rate$|^cost$/i,                     "unit_price"],
  [/^min.?hours$|^minimum.?hours$/i,                           "min_hours"],
  [/^max.?hours.?per.?day$|^max.?hours$|^daily.?limit$/i,      "max_hours_per_day"],
  [/^requires.?license$|^licensed$|^needs.?license$/i,         "requires_license"],
  [/^payer.?eligible$|^payers$|^insurance.?eligible$/i,        "payer_eligible"],
  [/^description$|^details$|^summary$/i,                       "description"],
  [/^internal.?notes$|^notes$|^comments$/i,                    "internal_notes"],
  [/^company.?id$|^tenant$|^workspace$/i,                      "company_id"],
];

export const PRODUCT_TEMPLATE_EXAMPLE = {
  product_id:        "PRD-001",
  product_name:      "Standard Service Package",
  item_type:         "service_package",
  item_subtype:      "Consultation",
  item_class:        "unrestricted",
  service_line:      "Core Services",
  billing_code:      "SVC-001",
  unit_of_measure:   "hour",
  unit_price:        50,
  min_hours:         1,
  max_hours_per_day: 8,
  requires_license:  "No",
  payer_eligible:    "Private Pay",
  status:            "active",
};

export const PRODUCT_TEMPLATE_INSTRUCTIONS = `
Excel import instructions for Products / Items:

REQUIRED: product_name

ENUMS — use exact values:
  item_type:        physical | living | digital | service_package | financial_instrument
  item_class:       perishable | non_perishable | hazardous | controlled | regulated |
                    unrestricted | serialized | non_serialized | consumable | reusable | returnable
  unit_of_measure:  piece | box | kg | g | mg | liter | ml | hour | day | month | year |
                    session | unit | kit | shift | head | flock | herd | license_seat
  status:           active | inactive | archived

NOTES:
  • product_id     — your source system ID, stored in internal_notes as "External ID: XXX"
  • unit_price     — stored in internal_notes as "Unit price: XX" (no price field in schema)
  • service_line   — stored in internal_notes as "Service line: XXX"
  • billing_code   — stored in internal_notes as "Billing code: XXX"
  • min_hours      — stored in internal_notes
  • max_hours_per_day — stored in internal_notes
  • requires_license  — stored in internal_notes
  • payer_eligible    — stored in internal_notes
  • company_id     — auto-fills from your session if blank
`;

export function transformProduct(row, currentUser) {
  const notes = [];
  if (row.product_id)        notes.push(`External ID: ${row.product_id}`);
  if (row.service_line)      notes.push(`Service line: ${row.service_line}`);
  if (row.billing_code)      notes.push(`Billing code: ${row.billing_code}`);
  if (row.unit_price)        notes.push(`Unit price: ${row.unit_price}`);
  if (row.min_hours)         notes.push(`Min hours: ${row.min_hours}`);
  if (row.max_hours_per_day) notes.push(`Max hours/day: ${row.max_hours_per_day}`);
  if (row.requires_license)  notes.push(`Requires license: ${row.requires_license}`);
  if (row.payer_eligible)    notes.push(`Payer eligible: ${row.payer_eligible}`);

  const VALID_TYPES = ["physical","living","digital","service_package","financial_instrument"];
  const itemType = VALID_TYPES.includes(row.item_type) ? row.item_type : "service_package";

  const VALID_CLASS = ["perishable","non_perishable","hazardous","controlled","regulated",
                       "unrestricted","serialized","non_serialized","consumable","reusable","returnable"];
  const itemClass = VALID_CLASS.includes(row.item_class) ? row.item_class : undefined;

  const VALID_UOM = ["piece","box","carton","pallet","bag","sachet","bottle","vial","kg","g",
                     "mg","ton","lb","oz","liter","ml","gallon","meter","cm","head","flock",
                     "herd","acre","hectare","license_seat","user_account","session","hour",
                     "day","month","year","unit","kit","shift"];
  const uom = VALID_UOM.includes(row.unit_of_measure) ? row.unit_of_measure : undefined;

  const VALID_STATUS = ["active","inactive","archived"];
  const status = VALID_STATUS.includes(row.status) ? row.status : "active";

  const stockQty   = row.stock_quantity != null ? parseFloat(row.stock_quantity) : undefined;
  const reorderLvl = row.reorder_level  != null ? parseFloat(row.reorder_level)  : undefined;

  const existing = row.internal_notes ? [row.internal_notes] : [];
  const internal_notes = [...existing, ...notes].join(" | ") || undefined;

  return {
    name:            row.product_name,
    item_type:       itemType,
    item_subtype:    row.item_subtype   || undefined,
    item_class:      itemClass ? [itemClass] : undefined,
    item_brand:      row.item_brand     || undefined,
    item_variant:    row.item_variant   || undefined,
    unit_of_measure: uom,
    stock_quantity:  isNaN(stockQty)   ? undefined : stockQty,
    min_stock_level: isNaN(reorderLvl) ? undefined : reorderLvl,
    expiry_date:     row.expiry_date   || undefined,
    status,
    description:     row.description   || undefined,
    internal_notes,
    company_id:      row.company_id    || currentUser?.company_id,
  };
}

export function validateProduct(row) {
  const errors = [], warnings = [];

  if (!row.product_name?.trim()) {
    errors.push("product_name is required");
  }
  const VALID_TYPES = ["physical","living","digital","service_package","financial_instrument"];
  if (row.item_type && !VALID_TYPES.includes(row.item_type)) {
    warnings.push(`item_type "${row.item_type}" not recognised — will default to "service_package"`);
  }
  const VALID_CLASS = ["perishable","non_perishable","hazardous","controlled","regulated",
                       "unrestricted","serialized","non_serialized","consumable","reusable","returnable"];
  if (row.item_class && !VALID_CLASS.includes(row.item_class)) {
    warnings.push(`item_class "${row.item_class}" not recognised`);
  }
  const VALID_UOM = ["piece","box","carton","pallet","bag","sachet","bottle","vial","kg","g",
                     "mg","ton","lb","oz","liter","ml","gallon","meter","cm","head","flock",
                     "herd","acre","hectare","license_seat","user_account","session","hour",
                     "day","month","year","unit","kit","shift"];
  if (row.unit_of_measure && !VALID_UOM.includes(row.unit_of_measure)) {
    warnings.push(`unit_of_measure "${row.unit_of_measure}" not recognised`);
  }
  const VALID_STATUS = ["active","inactive","archived"];
  if (row.status && !VALID_STATUS.includes(row.status)) {
    warnings.push(`status "${row.status}" not recognised — will default to "active"`);
  }
  if (row.stock_quantity && isNaN(parseFloat(row.stock_quantity))) {
    errors.push("stock_quantity must be a number");
  }
  if (row.reorder_level && isNaN(parseFloat(row.reorder_level))) {
    errors.push("reorder_level must be a number");
  }
  if (row.expiry_date && isNaN(Date.parse(row.expiry_date))) {
    warnings.push("expiry_date format unclear — use YYYY-MM-DD");
  }

  return { errors, warnings };
}

export function transformRelationship(row, currentUser) {
  const notes = [];
  if (row.relationship_id) notes.push(`External ID: ${row.relationship_id}`);
  if (row.person_id)       notes.push(`Person external ID: ${row.person_id}`);
  if (row.enterprise_id)   notes.push(`Enterprise external ID: ${row.enterprise_id}`);
  if (row.item_id)         notes.push(`Item external ID: ${row.item_id}`);

  const VALID_TYPES = ["person_enterprise","item_enterprise","item_person",
                       "person_service","enterprise_service","person_address",
                       "enterprise_address","person_item","enterprise_item",
                       "person_person","enterprise_enterprise"];
  const relType = VALID_TYPES.includes(row.relationship_type)
    ? row.relationship_type : "person_enterprise";

  const existing = row.notes ? [row.notes] : [];
  return {
    relationship_type: relType,
    person_name:       row.person_name   || undefined,
    enterprise_name:   row.enterprise_name || undefined,
    item_name:         row.item_name     || undefined,
    service_name:      row.service_name  || undefined,
    role:              row.role          || undefined,
    start_date:        row.start_date    || undefined,
    end_date:          row.end_date      || undefined,
    status:            ["active","ended","archived"].includes(row.status)
                         ? row.status : "active",
    notes:             [...existing, ...notes].join(" | ") || undefined,
    company_id:        row.company_id || currentUser?.company_id,
  };
}

export function validateRelationship(row) {
  const errors = [], warnings = [];
  const VALID_TYPES = ["person_enterprise","item_enterprise","item_person",
                       "person_service","enterprise_service","person_address",
                       "enterprise_address","person_item","enterprise_item",
                       "person_person","enterprise_enterprise"];
  if (!row.relationship_type) {
    errors.push("relationship_type is required");
  } else if (!VALID_TYPES.includes(row.relationship_type)) {
    errors.push(`relationship_type "${row.relationship_type}" not valid`);
  }
  if (row.start_date && isNaN(Date.parse(row.start_date)))
    warnings.push("start_date format unclear — use YYYY-MM-DD");
  if (row.end_date && row.start_date && new Date(row.end_date) < new Date(row.start_date))
    errors.push("end_date must be after start_date");
  return { errors, warnings };
}