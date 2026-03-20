// ── Shared import configurations for all master-data entities ──────────────

// ── PEOPLE ────────────────────────────────────────────────────────────────
export const PEOPLE_FIELDS = [
  { key: "first_name", label: "First Name *", required: true },
  { key: "last_name", label: "Last Name *", required: true },
  { key: "preferred_name", label: "Preferred Name" },
  { key: "person_type", label: "Person Type" },
  { key: "status", label: "Status" },
  { key: "primary_role", label: "Primary Role" },
  { key: "role_category", label: "Role Category" },
  { key: "phone", label: "Phone" },
  { key: "email", label: "Email" },
  { key: "gender", label: "Gender" },
  { key: "date_of_birth", label: "Date of Birth" },
  { key: "national_id", label: "National ID" },
  { key: "address", label: "Address" },
  { key: "city", label: "City" },
  { key: "region", label: "Region" },
  { key: "country", label: "Country" },
  { key: "engagement_type", label: "Engagement Type" },
  { key: "start_date", label: "Start Date" },
  { key: "end_date", label: "End Date" },
  { key: "cost_rate", label: "Cost Rate" },
  { key: "payment_type", label: "Payment Type" },
  { key: "availability_status", label: "Availability Status" },
  { key: "skills", label: "Skills" },
  { key: "certification_name", label: "Certification Name" },
  { key: "certification_expiry", label: "Certification Expiry" },
  { key: "license_number", label: "License Number" },
  { key: "internal_notes", label: "Internal Notes" },
];

export const PEOPLE_MAPPING_RULES = [
  [/first.?name|given.?name|forename/i, "first_name"],
  [/last.?name|surname|family.?name/i, "last_name"],
  [/preferred.?name|nickname|display.?name/i, "preferred_name"],
  [/^type$|person.?type|employee.?type/i, "person_type"],
  [/^status$/i, "status"],
  [/^role$|position|job.?title|primary.?role/i, "primary_role"],
  [/role.?category/i, "role_category"],
  [/phone|mobile|tel/i, "phone"],
  [/^email$|email.?address/i, "email"],
  [/gender|sex/i, "gender"],
  [/date.?of.?birth|dob|birth.?date/i, "date_of_birth"],
  [/national.?id|id.?number|passport/i, "national_id"],
  [/^address$|street/i, "address"],
  [/^city$|town/i, "city"],
  [/region|state|province/i, "region"],
  [/^country$/i, "country"],
  [/engagement.?type/i, "engagement_type"],
  [/^start$|hire.?date|join.?date|start.?date/i, "start_date"],
  [/^end$|end.?date|termination/i, "end_date"],
  [/^cost$|rate|salary|cost.?rate/i, "cost_rate"],
  [/payment.?type/i, "payment_type"],
  [/availability/i, "availability_status"],
  [/skills?/i, "skills"],
  [/certification|cert.?name/i, "certification_name"],
  [/cert.?expiry|cert.?date/i, "certification_expiry"],
  [/license/i, "license_number"],
  [/notes/i, "internal_notes"],
];

export const PEOPLE_TEMPLATE_EXAMPLE = {
  first_name: "Jane", last_name: "Smith", preferred_name: "Jane",
  person_type: "employee", status: "active", primary_role: "Nurse",
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
  ["person_type","No","Type","employee, contractor, freelancer, vendor, client, patient, external_partner"],
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

export function transformPerson(row) {
  if (!row.person_type) row.person_type = detectPersonType(row.primary_role);
  if (row.cost_rate) { const n = parseFloat(row.cost_rate); row.cost_rate = isNaN(n) ? undefined : n; }
  return row;
}

export function validatePerson(row) {
  const errors = [], warnings = [];
  if (!row.first_name) errors.push("first_name required");
  if (!row.last_name) errors.push("last_name required");
  const validTypes = ["employee","contractor","freelancer","vendor","client","patient","external_partner"];
  if (row.person_type && !validTypes.includes(row.person_type)) errors.push(`Invalid person_type: ${row.person_type}`);
  const validStatuses = ["active","inactive","on_leave"];
  if (row.status && !validStatuses.includes(row.status)) warnings.push(`Unknown status "${row.status}" — defaulting to active`);
  if (row.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) errors.push("Invalid email format");
  if (row.date_of_birth && isNaN(Date.parse(row.date_of_birth))) warnings.push("date_of_birth format unclear");
  return { errors, warnings };
}

// ── ENTERPRISES ───────────────────────────────────────────────────────────
export const ENTERPRISE_FIELDS = [
  { key: "enterprise_name", label: "Enterprise Name *", required: true },
  { key: "short_name", label: "Short Name" },
  { key: "enterprise_type", label: "Enterprise Type" },
  { key: "sub_type", label: "Sub Type" },
  { key: "status", label: "Status" },
  { key: "operating_status", label: "Operating Status" },
  { key: "phone", label: "Phone" },
  { key: "email", label: "Email" },
  { key: "website", label: "Website" },
  { key: "primary_address", label: "Primary Address" },
  { key: "city", label: "City" },
  { key: "region", label: "Region" },
  { key: "country", label: "Country" },
  { key: "legal_structure", label: "Legal Structure" },
  { key: "registration_number", label: "Registration Number" },
  { key: "tax_number", label: "Tax Number" },
  { key: "ownership_type", label: "Ownership Type" },
  { key: "description", label: "Description" },
  { key: "internal_notes", label: "Internal Notes" },
];

export const ENTERPRISE_MAPPING_RULES = [
  [/company|business|organization|^name$|enterprise.?name/i, "enterprise_name"],
  [/short.?name|code|abbreviation/i, "short_name"],
  [/^type$|business.?type|sector|enterprise.?type/i, "enterprise_type"],
  [/sub.?type/i, "sub_type"],
  [/^status$/i, "status"],
  [/operating.?status/i, "operating_status"],
  [/phone|tel|contact/i, "phone"],
  [/^email$|email.?address/i, "email"],
  [/website|url|web/i, "website"],
  [/^address$|street|address.?line/i, "primary_address"],
  [/^city$|town/i, "city"],
  [/region|state|province/i, "region"],
  [/^country$/i, "country"],
  [/legal.?structure/i, "legal_structure"],
  [/registration|reg.?no|company.?no/i, "registration_number"],
  [/tax|vat/i, "tax_number"],
  [/ownership/i, "ownership_type"],
  [/description/i, "description"],
  [/notes/i, "internal_notes"],
];

export const ENTERPRISE_TEMPLATE_EXAMPLE = {
  enterprise_name: "Acme Corp", short_name: "ACME",
  enterprise_type: "retail", sub_type: "Grocery Store",
  status: "active", operating_status: "open",
  phone: "+1-555-0200", email: "info@acme.com",
  website: "https://acme.com", primary_address: "456 Business Rd",
  city: "Chicago", region: "IL", country: "USA",
  legal_structure: "llc", registration_number: "REG-001",
  tax_number: "TAX-001", ownership_type: "privately_owned",
  description: "A sample enterprise", internal_notes: "",
};

export const ENTERPRISE_TEMPLATE_INSTRUCTIONS = [
  ["enterprise_name","Yes","Full enterprise name","Acme Corp"],
  ["enterprise_type","No","Type","retail, food_beverage, healthcare, technology, construction, education, finance, manufacturing, logistics, hospitality, agriculture, media, other"],
  ["status","No","Status","active, inactive, prospect, archived"],
  ["operating_status","No","Operating status","open, closed, temporarily_closed, seasonal"],
  ["legal_structure","No","Legal structure","sole_proprietorship, partnership, llc, corporation, nonprofit, cooperative, government, other"],
  ["ownership_type","No","Ownership type","privately_owned, publicly_traded, family_owned, government_owned, joint_venture, other"],
  ["email","No","Email (valid format)","info@example.com"],
  ["phone","No","Phone number","+1-555-0200"],
];

const ENTERPRISE_TYPE_KEYWORDS = [
  [/school|academy|college|university|education/i, "education"],
  [/clinic|hospital|pharmacy|health/i, "healthcare"],
  [/shop|store|retail|market/i, "retail"],
  [/restaurant|café|cafe|bakery|food|beverage/i, "food_beverage"],
  [/consulting|agency|firm|services/i, "other"],
  [/tech|software|digital|it\b/i, "technology"],
];

export function detectEnterpriseType(name = "") {
  for (const [regex, type] of ENTERPRISE_TYPE_KEYWORDS) {
    if (regex.test(name)) return type;
  }
  return "other";
}

export function transformEnterprise(row) {
  if (!row.enterprise_type) row.enterprise_type = detectEnterpriseType(row.enterprise_name);
  return row;
}

export function validateEnterprise(row) {
  const errors = [], warnings = [];
  if (!row.enterprise_name) errors.push("enterprise_name required");
  const validTypes = ["retail","food_beverage","healthcare","technology","construction","education","finance","manufacturing","logistics","hospitality","agriculture","media","other"];
  if (row.enterprise_type && !validTypes.includes(row.enterprise_type)) warnings.push(`Unknown enterprise_type "${row.enterprise_type}"`);
  if (row.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) errors.push("Invalid email format");
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
  { key: "label", label: "Label" },
  { key: "address_line1", label: "Address Line 1 *", required: true },
  { key: "address_line2", label: "Address Line 2" },
  { key: "city", label: "City *", required: true },
  { key: "state_region", label: "State / Region" },
  { key: "postal_code", label: "Postal Code" },
  { key: "country", label: "Country *", required: true },
  { key: "latitude", label: "Latitude" },
  { key: "longitude", label: "Longitude" },
  { key: "status", label: "Status" },
  { key: "internal_notes", label: "Internal Notes" },
];

export const ADDRESS_MAPPING_RULES = [
  [/^label$|^name$|^title$/i, "label"],
  [/^address$|address.?line.?1|street/i, "address_line1"],
  [/address.?line.?2|suite|apt|unit/i, "address_line2"],
  [/^city$|^town$/i, "city"],
  [/state|region|province/i, "state_region"],
  [/zip|postal|post.?code/i, "postal_code"],
  [/^country$/i, "country"],
  [/^lat$|latitude/i, "latitude"],
  [/^lon$|^long$|longitude/i, "longitude"],
  [/^status$/i, "status"],
  [/notes/i, "internal_notes"],
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

export function transformAddress(row) {
  ["latitude","longitude"].forEach((k) => {
    if (row[k]) { const n = parseFloat(row[k]); row[k] = isNaN(n) ? undefined : n; }
  });
  return row;
}

export function validateAddress(row) {
  const errors = [], warnings = [];
  if (!row.address_line1) errors.push("address_line1 required");
  if (!row.city) errors.push("city required");
  if (!row.country) errors.push("country required");
  if (row.latitude != null && row.latitude !== "") {
    const n = parseFloat(row.latitude);
    if (isNaN(n) || n < -90 || n > 90) errors.push("latitude must be between -90 and 90");
  }
  if (row.longitude != null && row.longitude !== "") {
    const n = parseFloat(row.longitude);
    if (isNaN(n) || n < -180 || n > 180) errors.push("longitude must be between -180 and 180");
  }
  return { errors, warnings };
}

// ── TASKS ─────────────────────────────────────────────────────────────────
export const TASK_FIELDS = [
  { key: "task_type", label: "Task Type *", required: true },
  { key: "title", label: "Title *", required: true },
  { key: "status", label: "Status" },
  { key: "priority", label: "Priority" },
  { key: "assigned_to_name", label: "Assigned To Name" },
  { key: "assigned_to_email", label: "Assigned To Email" },
  { key: "enterprise", label: "Enterprise" },
  { key: "related_person", label: "Related Person" },
  { key: "related_item", label: "Related Item" },
  { key: "scheduled_date", label: "Scheduled Date" },
  { key: "scheduled_time", label: "Scheduled Time" },
  { key: "due_date", label: "Due Date" },
  { key: "due_time", label: "Due Time" },
  { key: "outcome", label: "Outcome" },
  { key: "outcome_notes", label: "Outcome Notes" },
  { key: "internal_notes", label: "Internal Notes" },
];

export const TASK_MAPPING_RULES = [
  [/task.?type|^type$/i, "task_type"],
  [/^title$|summary|description/i, "title"],
  [/^status$/i, "status"],
  [/priority/i, "priority"],
  [/assigned.?to.?name|assignee.?name/i, "assigned_to_name"],
  [/assigned.?to.?email|assignee.?email/i, "assigned_to_email"],
  [/enterprise|company/i, "enterprise"],
  [/person|client|patient/i, "related_person"],
  [/item|product/i, "related_item"],
  [/scheduled.?date|schedule.?date/i, "scheduled_date"],
  [/scheduled.?time|schedule.?time/i, "scheduled_time"],
  [/due.?date/i, "due_date"],
  [/due.?time/i, "due_time"],
  [/outcome.?notes|result.?notes/i, "outcome_notes"],
  [/^outcome$|result/i, "outcome"],
  [/notes/i, "internal_notes"],
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
  ["task_type","Yes","Task type","clock_in, clock_out, stock_counting, maintenance, medication_admin, other, etc."],
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
  if (!row.task_type) errors.push("task_type required");
  if (!row.title) errors.push("title required");
  const validStatuses = ["open","in_progress","completed","cancelled"];
  if (row.status && !validStatuses.includes(row.status)) warnings.push(`Unknown status "${row.status}" — defaulting to open`);
  const validPriorities = ["low","normal","high","urgent"];
  if (row.priority && !validPriorities.includes(row.priority)) warnings.push(`Unknown priority "${row.priority}" — defaulting to normal`);
  if (row.scheduled_date && isNaN(Date.parse(row.scheduled_date))) warnings.push("scheduled_date format unclear");
  if (row.due_date && isNaN(Date.parse(row.due_date))) warnings.push("due_date format unclear");
  return { errors, warnings };
}

export function transformTask(row) {
  if (!row.status) row.status = "open";
  if (!row.priority) row.priority = "normal";
  if (!row.outcome) row.outcome = "pending";
  return row;
}

// ── TRANSACTIONS ───────────────────────────────────────────────────────────
export const TRANSACTION_FIELDS = [
  { key: "transaction_type", label: "Transaction Type *", required: true },
  { key: "date", label: "Date *", required: true },
  { key: "status", label: "Status" },
  { key: "enterprise", label: "Enterprise" },
  { key: "primary_person", label: "Primary Person" },
  { key: "counterparty", label: "Counterparty" },
  { key: "description", label: "Description" },
  { key: "amount", label: "Amount" },
  { key: "tax_amount", label: "Tax Amount" },
  { key: "payment_method", label: "Payment Method" },
  { key: "payment_status", label: "Payment Status" },
  { key: "amount_paid", label: "Amount Paid" },
  { key: "due_date", label: "Due Date" },
  { key: "reference_number", label: "Reference Number" },
  { key: "internal_notes", label: "Internal Notes" },
];

export const TRANSACTION_MAPPING_RULES = [
  [/transaction.?type|^type$/i, "transaction_type"],
  [/^date$|transaction.?date|event.?date/i, "date"],
  [/^status$/i, "status"],
  [/enterprise|company|branch/i, "enterprise"],
  [/primary.?person|staff|employee/i, "primary_person"],
  [/counterparty|customer|supplier|vendor|patient/i, "counterparty"],
  [/description|reason/i, "description"],
  [/^amount$|total|gross/i, "amount"],
  [/tax/i, "tax_amount"],
  [/payment.?method|method/i, "payment_method"],
  [/payment.?status/i, "payment_status"],
  [/amount.?paid|paid/i, "amount_paid"],
  [/due.?date/i, "due_date"],
  [/reference|ref.?no|invoice.?no/i, "reference_number"],
  [/notes/i, "internal_notes"],
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
  if (!row.transaction_type) errors.push("transaction_type required");
  if (!row.date) errors.push("date required");
  if (row.date && isNaN(Date.parse(row.date))) errors.push("date format invalid — use YYYY-MM-DD");
  const validTypes = ["stock_in","stock_out","stock_transfer","item_assignment","item_return","sale_service","expense","adjustment","attendance"];
  if (row.transaction_type && !validTypes.includes(row.transaction_type)) errors.push(`Invalid transaction_type: ${row.transaction_type}`);
  if (row.amount && isNaN(parseFloat(row.amount))) errors.push("amount must be numeric");
  return { errors, warnings };
}

export function transformTransaction(row) {
  if (!row.status) row.status = "draft";
  if (!row.payment_status) row.payment_status = "na";
  ["amount","tax_amount","amount_paid"].forEach((k) => {
    if (row[k] != null && row[k] !== "") { const n = parseFloat(row[k]); row[k] = isNaN(n) ? undefined : n; }
  });
  return row;
}

// ── RELATIONSHIPS ─────────────────────────────────────────────────────────
export const RELATIONSHIP_FIELDS = [
  { key: "relationship_type", label: "Relationship Type *", required: true },
  { key: "person_name", label: "Person Name" },
  { key: "enterprise_name", label: "Enterprise Name" },
  { key: "item_name", label: "Item Name" },
  { key: "service_name", label: "Service Name" },
  { key: "role", label: "Role" },
  { key: "start_date", label: "Start Date" },
  { key: "end_date", label: "End Date" },
  { key: "status", label: "Status" },
  { key: "notes", label: "Notes" },
];

export const RELATIONSHIP_MAPPING_RULES = [
  [/relationship.?type|^type$/i, "relationship_type"],
  [/person.?name|person/i, "person_name"],
  [/enterprise.?name|enterprise|company/i, "enterprise_name"],
  [/item.?name|item|product/i, "item_name"],
  [/service.?name|service/i, "service_name"],
  [/^role$|position/i, "role"],
  [/start.?date|^start$/i, "start_date"],
  [/end.?date|^end$/i, "end_date"],
  [/^status$/i, "status"],
  [/notes/i, "notes"],
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

export function validateRelationship(row, { people = [], enterprises = [], products = [], services = [] } = {}) {
  const errors = [], warnings = [];
  const validTypes = ["person_enterprise","item_enterprise","item_person","person_service","enterprise_service","person_address","enterprise_address"];
  if (!row.relationship_type) { errors.push("relationship_type required"); return { errors, warnings }; }
  if (!validTypes.includes(row.relationship_type)) errors.push(`Invalid relationship_type: ${row.relationship_type}`);

  const type = row.relationship_type;
  if (type.includes("person") && !row.person_name) errors.push("person_name required for this type");
  if (type.includes("enterprise") && !row.enterprise_name) errors.push("enterprise_name required for this type");
  if (type.includes("item") && !row.item_name) errors.push("item_name required for this type");

  // Existence checks (warnings, not errors)
  if (row.person_name && people.length && !people.find((p) => `${p.first_name} ${p.last_name}`.trim() === row.person_name.trim())) {
    warnings.push(`Person "${row.person_name}" not found — will be imported as-is`);
  }
  if (row.enterprise_name && enterprises.length && !enterprises.find((e) => e.enterprise_name === row.enterprise_name)) {
    warnings.push(`Enterprise "${row.enterprise_name}" not found — will be imported as-is`);
  }
  if (row.item_name && products.length && !products.find((p) => p.name === row.item_name)) {
    warnings.push(`Item "${row.item_name}" not found — will be imported as-is`);
  }

  if (row.start_date && isNaN(Date.parse(row.start_date))) errors.push("start_date invalid format");
  if (row.end_date && row.start_date && new Date(row.end_date) < new Date(row.start_date)) errors.push("end_date must be after start_date");

  return { errors, warnings };
}