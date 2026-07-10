import { useState, useEffect } from "react";
import { ncClient } from "@/api/ncClient";

// ── Session-level cache ───────────────────────────────────────────────────────
// Key: "entityType:fieldName:parentValue:companyId"
// Value: MasterDataOption[] — full objects so usage_count is always fresh
const _taxonomyCache = new Map();

// ── FREQUENT threshold ────────────────────────────────────────────────────────
// A custom option is "frequent" (shown in the Frequently Used section of
// TaxonomySelect) when its usage_count meets or exceeds this value.
const FREQUENT_THRESHOLD = 3;

// ── SYSTEM_DEFAULTS ───────────────────────────────────────────────────────────
// Curated lists per (fieldName, parentValue).
// These are shown in the "Standard" section of TaxonomySelect.
// They are organised so the most universally relevant options come first —
// that ordering doubles as the "Common" ordering inside the Standard section.
const SYSTEM_DEFAULTS = {
  person_subtype: {
    staff: [
      "Executive Leadership", "Senior Management", "Middle Management",
      "Team Lead Supervisor", "Administrative Staff", "Human Resources Personnel",
      "Finance Accounting Staff", "Sales Representative", "Marketing Specialist",
      "Customer Service Representative", "IT Technical Support Staff",
      "Software Developer Engineer", "Operations Staff",
      "Manufacturing Production Worker", "Warehouse Logistics Staff",
      "Research Development Staff", "Legal Compliance Officer",
      "Training Development Specialist", "Intern Trainee", "Teacher",
      "Nurse", "Doctor", "Pharmacist", "Therapist", "Engineer",
      "Accountant", "Driver", "Chef", "Security Guard", "Farmer",
      "Social Worker", "Freelance Consultant", "Construction Contractor",
      "Skilled Trades Contractor", "Virtual Assistant", "Data Analyst",
      "Translator Interpreter", "Cybersecurity Specialist",
    ],
    client: [
      "Individual Consumer", "Student Customer", "Corporate Client",
      "Small Business Customer", "Government Client",
      "Nonprofit Organization Client", "Enterprise Level Client",
      "Repeat Loyal Customer", "First Time Customer", "High Value VIP Client",
      "Subscription Based Customer", "Online Ecommerce Customer",
      "In Store Retail Customer", "Wholesale Buyer", "International Customer",
      "Local Community Customer", "Referral Customer", "Seasonal Customer",
      "Patient", "Resident", "Member", "Beneficiary", "Enrollee",
      "Attendee", "Participant",
    ],
    contact: [
      "Raw Material Supplier", "Component Parts Supplier", "Equipment Supplier",
      "Technology Vendor", "Logistics Shipping Provider",
      "Maintenance Repair Vendor", "Professional Services Vendor",
      "Marketing Advertising Vendor", "IT Services Vendor",
      "Wholesale Distributor", "Import Export Supplier",
      "Equity Partner", "Silent Partner", "Managing Partner",
      "Strategic Alliance Partner", "Venture Capital Investor",
      "Angel Investor", "Board Member", "Advisory Board Member",
      "Franchise Partner", "Distribution Partner", "Technology Partner",
      "Guarantor", "Next of Kin", "Emergency Contact", "Guardian",
      "Donor", "Sponsor",
    ],
    volunteer: [
      "Community Worker", "Unpaid Contributor", "Apprentice",
      "Religious Volunteer", "Youth Worker", "Fundraiser",
      "Event Volunteer", "Peer Support Worker",
    ],
  },
  enterprise_subtype: {
    commercial: [
      "Crop Farm", "Ranch", "Dairy Farm", "Poultry Farm", "Organic Farm",
      "Mining Operation", "Quarry", "Oil Extraction Site",
      "Residential Construction", "Commercial Building Construction",
      "Food Processing Plant", "Pharmaceutical Manufacturing",
      "Grocery Store Supermarket", "Convenience Store", "Pharmacy Drug Store",
      "Electronics Retailer", "Clothing Apparel Store",
      "Trucking Company", "Courier Delivery Service", "Warehousing Storage Facility",
      "Software Development Company", "IT Consulting Firm", "Data Analytics Firm",
      "Telecommunications Provider", "Cloud Computing Provider",
      "Commercial Bank", "Credit Union", "Insurance Company Life",
      "Fintech Company", "Venture Capital Firm", "Asset Management Firm",
      "Real Estate Brokerage", "Property Leasing Company", "Vehicle Rental Agency",
      "Legal Services Firm", "Accounting Auditing Firm", "Management Consulting Firm",
      "Engineering Services Firm", "Advertising Agency", "Design Studio",
      "Holding Company", "Corporate Headquarters", "Franchise Management Company",
      "Staffing Agency", "Security Services Firm", "Facilities Management Company",
      "Elementary School", "Secondary School", "College University",
      "Technical Trade School", "Tutoring Center", "Online Education Provider",
      "General Hospital", "Dental Clinic", "Physicians Office",
      "Nursing Home", "Home Health Care Service", "Rehabilitation Center",
      "Fitness Center Gym", "Event Management Company", "Music Production Studio",
      "Hotel", "Resort", "Full Service Restaurant", "Fast Food Restaurant",
      "Cafe Coffee Shop", "Catering Service", "Bar Pub", "Food Truck",
      "Automotive Repair Shop", "Beauty Salon Barbershop", "Spa Wellness Center",
      "Dry Cleaning Laundry", "Appliance Repair Service",
    ],
    nonprofit: [
      "NGO", "Foundation", "Charity", "Association", "Union",
      "Cooperative Society", "Church", "Mosque", "Temple",
      "Religious Organization", "Nonprofit Organization",
      "Theater Company", "Museum", "Sports Team Club",
      "Special Education Institution", "Language School",
      "Mental Health Facility", "Assisted Living Facility",
      "Social Services Agency",
    ],
    government: [
      "Federal Government Agency", "State Government Agency",
      "Local Government Office", "Public Health Department",
      "Law Enforcement Agency", "Fire Department",
      "Public Works Department", "Regulatory Agency",
      "Social Services Agency", "Emergency Management Agency",
      "Public Transit System", "Water Supply Utility",
      "Wastewater Treatment Facility", "Power Generation Plant",
    ],
    household: [
      "Family Unit", "Individual Business", "Household",
    ],
    cooperative: [
      "Cooperative Society", "Agricultural Cooperative",
      "Credit Cooperative", "Worker Cooperative", "Housing Cooperative",
    ],
    trust: [
      "Family Trust", "Charitable Trust", "Investment Trust",
      "Land Trust", "Estate",
    ],
  },
  item_subtype: {
    physical: [
      "Medication", "Supplement", "Vaccine", "Controlled Substance",
      "Medical Device", "Medical Supply",
      "Food Ingredient", "Packaged Food", "Beverage", "Produce", "Dairy",
      "Equipment", "Machinery", "Vehicle", "Vessel",
      "Furniture", "Fixture", "Appliance", "Electronics",
      "Tool", "Hardware", "Spare Part", "Component", "Raw Material",
      "Uniform", "Protective Gear", "Stationery", "Cleaning Supply",
      "Fuel", "Lubricant", "Chemical", "Fertilizer", "Pesticide", "Seed",
    ],
    living: [
      "Cattle", "Poultry", "Swine", "Sheep", "Goat",
      "Horse", "Fish", "Rabbit",
      "Crop", "Plant", "Timber", "Flower",
    ],
    digital: [
      "Software", "Application", "Platform", "Plugin",
      "License", "Permit", "Certificate", "Subscription",
      "Course", "Ebook", "Template", "Dataset", "Digital Asset",
    ],
    service_package: [
      "Consultation", "Session", "Maintenance Contract",
      "Delivery Service", "Support Package", "Retainer",
    ],
    financial_instrument: [
      "Insurance Policy", "Loan Product", "Savings Product",
      "Investment Product", "Bond", "Equity Share",
    ],
  },
};

// ── Number of system options shown in "Common" sub-group ──────────────────────
// The first COMMON_COUNT options in each SYSTEM_DEFAULTS list are surfaced
// as "Common" inside the Standard section.  The rest are folded under "More".
const COMMON_COUNT = 8;

export function useTaxonomy(entityType, fieldName, parentValue, companyId) {
  // Full MasterDataOption objects — kept in state so incrementUsage can update them
  const [customObjects, setCustomObjects]   = useState([]);
  const [loading, setLoading]               = useState(false);

  useEffect(() => {
    if (!companyId || !parentValue) {
      setCustomObjects([]);
      return;
    }

    const cacheKey = `${entityType}:${fieldName}:${parentValue}:${companyId}`;
    if (_taxonomyCache.has(cacheKey)) {
      setCustomObjects(_taxonomyCache.get(cacheKey));
      return;
    }

    setLoading(true);
    ncClient.entities.MasterDataOption.filter({
      entity_type:       entityType,
      field_name:        fieldName,
      parent_value:      parentValue,
      company_id:        companyId,
      is_system_default: false,
    })
      .then(results => {
        // Only active options; sort most-used first
        const active = results
          .filter(r => r.is_active !== false)
          .sort((a, b) => (b.usage_count || 0) - (a.usage_count || 0));
        _taxonomyCache.set(cacheKey, active);
        setCustomObjects(active);
      })
      .catch(() => setCustomObjects([]))
      .finally(() => setLoading(false));
  }, [entityType, fieldName, parentValue, companyId]);

  // ── Derived values ──────────────────────────────────────────────────────────

  // Plain string arrays for backward compatibility
  const customOptions = customObjects.map(o => o.value);

  // System defaults (plain strings, curated order = common-first)
  const systemOptions = SYSTEM_DEFAULTS[fieldName]?.[parentValue] || [];

  // Frequent custom options — those used >= FREQUENT_THRESHOLD times
  const frequentCustom = customObjects
    .filter(o => (o.usage_count || 0) >= FREQUENT_THRESHOLD)
    .map(o => o.value);

  // ── Actions ─────────────────────────────────────────────────────────────────

  /**
   * addCustomOption — create a new MasterDataOption and prepend to the list.
   */
  const addCustomOption = async (value) => {
    if (!value || !companyId) return;
    try {
      const created = await ncClient.entities.MasterDataOption.create({
        entity_type:       entityType,
        field_name:        fieldName,
        value,
        parent_value:      parentValue,
        company_id:        companyId,
        is_system_default: false,
        usage_count:       1,
        is_active:         true,
      });
      const updated = [created, ...customObjects];
      const cacheKey = `${entityType}:${fieldName}:${parentValue}:${companyId}`;
      _taxonomyCache.set(cacheKey, updated);
      setCustomObjects(updated);
    } catch (e) {
      console.error("Failed to save custom taxonomy option", e);
    }
  };

  /**
   * incrementUsage — fire-and-forget usage counter bump.
   * Called by TaxonomySelect every time the user selects an option.
   * Only custom options are tracked (system defaults are static).
   */
  const incrementUsage = async (value) => {
    const obj = customObjects.find(o => o.value === value);
    if (!obj) return; // system default — not tracked here
    const newCount = (obj.usage_count || 0) + 1;
    // Optimistic local update
    const updated = customObjects.map(o =>
      o.id === obj.id ? { ...o, usage_count: newCount } : o
    );
    const cacheKey = `${entityType}:${fieldName}:${parentValue}:${companyId}`;
    _taxonomyCache.set(cacheKey, updated);
    setCustomObjects(updated);
    // Persist asynchronously — UI is never blocked
    try {
      await ncClient.entities.MasterDataOption.update(obj.id, { usage_count: newCount });
    } catch (_) { /* silent — count is best-effort */ }
  };

  return {
    // Backward-compatible string arrays
    systemOptions,
    customOptions,
    loading,
    addCustomOption,
    // New
    frequentCustom,   // string[] — custom values used >= FREQUENT_THRESHOLD times
    customObjects,    // MasterDataOption[] — full objects for admin use
    incrementUsage,   // (value: string) => void — call on selection
    COMMON_COUNT,     // number — how many system options are "common"
  };
}
