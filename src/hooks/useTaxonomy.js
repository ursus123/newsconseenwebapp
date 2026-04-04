import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";

// Module-level cache — persists for the browser session.
// Key: "entityType:fieldName:parentValue:companyId"
// Prevents repeated API calls when the same TaxonomySelect re-renders.
const _taxonomyCache = new Map();

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

export function useTaxonomy(entityType, fieldName, parentValue, companyId) {
  const [customOptions, setCustomOptions] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!companyId || !parentValue) return;

    const cacheKey = `${entityType}:${fieldName}:${parentValue}:${companyId}`;
    if (_taxonomyCache.has(cacheKey)) {
      setCustomOptions(_taxonomyCache.get(cacheKey));
      return;
    }

    setLoading(true);
    base44.entities.MasterDataOption.filter({
      entity_type: entityType,
      field_name: fieldName,
      parent_value: parentValue,
      company_id: companyId,
      is_system_default: false,
    })
      .then(results => {
        const values = results.map(r => r.value);
        _taxonomyCache.set(cacheKey, values);
        setCustomOptions(values);
      })
      .catch(() => setCustomOptions([]))
      .finally(() => setLoading(false));
  }, [entityType, fieldName, parentValue, companyId]);

  const systemOptions = (SYSTEM_DEFAULTS[fieldName]?.[parentValue] || []);

  const addCustomOption = async (value) => {
    if (!value || !companyId) return;
    try {
      await base44.entities.MasterDataOption.create({
        entity_type: entityType,
        field_name: fieldName,
        value,
        parent_value: parentValue,
        company_id: companyId,
        is_system_default: false,
      });
      const updated = [...customOptions, value];
      const cacheKey = `${entityType}:${fieldName}:${parentValue}:${companyId}`;
      _taxonomyCache.set(cacheKey, updated);
      setCustomOptions(updated);
    } catch (e) {
      console.error("Failed to save custom taxonomy option", e);
    }
  };

  return { systemOptions, customOptions, loading, addCustomOption };
}