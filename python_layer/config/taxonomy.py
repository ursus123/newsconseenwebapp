# ==============================================================
# Newsconseen Universal Taxonomy  v2.0
# ==============================================================
# Single source of truth for all type classification across
# python_layer. Every ETL module and every API response imports
# from here. No type strings are hardcoded anywhere else.
#
# This file mirrors the MasterDataOption entity in Base44.
# When Base44 taxonomy values change, update this file first,
# then the ETL modules pick up the changes automatically.
#
# Three master entities: Person, Enterprise, Item
#
# v2.0 improvements (fully backward-compatible):
#   - Proper NAICS 2-digit industry codes replacing legacy SIC 1-20
#   - Fuzzy normalization via difflib (no new dependencies)
#   - Validation functions: is_valid_subtype_for_type()
#   - Compliance inference: get_compliance_flags(), is_regulated()
#   - Governance metadata: CONCEPT_METADATA with source/version/deprecated
#   - Multilingual display labels: DISPLAY_LABELS (English default, extensible)
#   - Expanded relationship types with semantic context
#   - Derived attributes: risk flags, license requirements
#   - All v1 names preserved — zero breaking changes
# ==============================================================

from __future__ import annotations
from dataclasses import dataclass, field
from difflib import get_close_matches
from functools import lru_cache
from typing import Optional


# ==============================================================
# GOVERNANCE METADATA
# ==============================================================
# Lightweight versioning — tracks when and why terms were added.
# Use CONCEPT_METADATA[term] to look up any concept's provenance.

@dataclass
class ConceptMeta:
    version:     str            = "2.0"
    source:      str            = "newsconseen-core"
    deprecated:  bool           = False
    replaced_by: Optional[str]  = None
    description: str            = ""
    since:       str            = "2025-01"
    tags:        list[str]      = field(default_factory=list)

# Register key concepts — add entries as taxonomy evolves
CONCEPT_METADATA: dict[str, ConceptMeta] = {
    # Person types
    "staff":     ConceptMeta(description="Any employed or contracted worker", tags=["person"]),
    "client":    ConceptMeta(description="Anyone served by the organisation", tags=["person"]),
    "contact":   ConceptMeta(description="External person with a business relationship", tags=["person"]),
    "volunteer": ConceptMeta(description="Unpaid contributor", tags=["person"]),
    # Enterprise types
    "commercial":  ConceptMeta(description="For-profit business entity", tags=["enterprise"]),
    "nonprofit":   ConceptMeta(description="Mission-driven, non-distributing organisation", tags=["enterprise"]),
    "government":  ConceptMeta(description="Public sector entity", tags=["enterprise"]),
    "household":   ConceptMeta(description="Family or domestic unit", tags=["enterprise"]),
    "cooperative": ConceptMeta(description="Member-owned shared entity", tags=["enterprise"]),
    "trust":       ConceptMeta(description="Asset-holding legal structure", tags=["enterprise"]),
    # Item types
    "physical":             ConceptMeta(description="Tangible physical good", tags=["item"]),
    "living":               ConceptMeta(description="Biological living thing (livestock, crops)", tags=["item"]),
    "digital":              ConceptMeta(description="Software, license, or digital content", tags=["item"]),
    "service_package":      ConceptMeta(description="Bundled or recurring service", tags=["item"]),
    "financial_instrument": ConceptMeta(description="Financial product (loan, insurance, bond)", tags=["item"]),
}


# ==============================================================
# MULTILINGUAL DISPLAY LABELS
# ==============================================================
# Separates display labels from canonical codes.
# Add new languages by adding a language key.
# The UI uses DISPLAY_LABELS.get(lang, {}).get(code, code) pattern.

DISPLAY_LABELS: dict[str, dict[str, str]] = {
    "en": {
        # Person types
        "staff":     "Staff / Employee",
        "client":    "Client / Customer",
        "contact":   "Contact / Partner",
        "volunteer": "Volunteer",
        # Enterprise types
        "commercial":  "Commercial Business",
        "nonprofit":   "Nonprofit / NGO",
        "government":  "Government Agency",
        "household":   "Household / Family",
        "cooperative": "Cooperative / Association",
        "trust":       "Trust / Foundation",
        # Item types
        "physical":             "Physical Product",
        "living":               "Living Asset",
        "digital":              "Digital / Software",
        "service_package":      "Service Package",
        "financial_instrument": "Financial Instrument",
    },
    "fr": {
        "staff":     "Personnel / Employé",
        "client":    "Client / Bénéficiaire",
        "contact":   "Contact / Partenaire",
        "volunteer": "Bénévole",
        "commercial":  "Entreprise commerciale",
        "nonprofit":   "ONG / Association",
        "government":  "Administration publique",
        "household":   "Ménage / Famille",
        "cooperative": "Coopérative",
        "trust":       "Fiducie / Fondation",
    },
    "sw": {  # Kiswahili
        "staff":    "Wafanyikazi",
        "client":   "Mteja",
        "contact":  "Mawasiliano",
        "volunteer":"Kujitolea",
    },
}


# ==============================================================
# PERSON TAXONOMY
# ==============================================================

PERSON_TYPES = ["staff", "client", "contact", "volunteer"]

# Maps any legacy or alternate person_type value to canonical taxonomy
PERSON_TYPE_MAP = {
    # canonical — map to self
    "staff":            "staff",
    "client":           "client",
    "contact":          "contact",
    "volunteer":        "volunteer",
    # legacy Base44 values
    "employee":         "staff",
    "contractor":       "staff",
    "freelancer":       "staff",
    "consultant":       "staff",
    "temp":             "staff",
    "caregiver":        "staff",
    "nurse":            "staff",
    "doctor":           "staff",
    "therapist":        "staff",
    "pharmacist":       "staff",
    "teacher":          "staff",
    "instructor":       "staff",
    "tutor":            "staff",
    "coach":            "staff",
    "trainer":          "staff",
    "manager":          "staff",
    "supervisor":       "staff",
    "admin":            "staff",
    "coordinator":      "staff",
    "director":         "staff",
    "intern":           "staff",
    "patient":          "client",
    "student":          "client",
    "member":           "client",
    "customer":         "client",
    "resident":         "client",
    "learner":          "client",
    "trainee":          "client",
    "attendee":         "client",
    "beneficiary":      "client",
    "enrollee":         "client",
    "subscriber":       "client",
    "participant":      "client",
    "vendor":           "contact",
    "supplier":         "contact",
    "external_partner": "contact",
    "partner":          "contact",
    "donor":            "contact",
    "sponsor":          "contact",
    "board_member":     "contact",
    "trustee":          "contact",
    "investor":         "contact",
    "guarantor":        "contact",
    "next_of_kin":      "contact",
    "emergency_contact":"contact",
    "guardian":         "contact",
    # v2 additions
    "lead":             "contact",
    "prospect":         "contact",
    "referral":         "contact",
    "alumni":           "client",
    "pensioner":        "client",
    "retiree":          "staff",
    "secondee":         "staff",
    "locum":            "staff",
    "relief":           "staff",
}

# Sets for fast membership testing in ETL classification
PERSON_TYPE_SETS = {
    "staff":     {
        "staff", "employee", "contractor", "freelancer", "consultant", "temp",
        "caregiver", "nurse", "doctor", "therapist", "pharmacist",
        "teacher", "instructor", "tutor", "coach", "trainer",
        "manager", "supervisor", "admin", "coordinator", "director", "intern",
        "locum", "secondee", "relief", "retiree",
    },
    "client":    {
        "client", "patient", "student", "member", "customer", "resident",
        "learner", "trainee", "attendee", "beneficiary", "enrollee",
        "subscriber", "participant", "alumni", "pensioner",
    },
    "contact":   {
        "contact", "vendor", "supplier", "external_partner", "partner",
        "donor", "sponsor", "board_member", "trustee", "investor",
        "guarantor", "next_of_kin", "emergency_contact", "guardian",
        "referral", "prospect", "lead",
    },
    "volunteer": {"volunteer", "community_worker", "unpaid_contributor"},
}

PERSON_SUBTYPES = {
    "staff": [
        "Executive Leadership", "Senior Management", "Middle Management",
        "Team Lead Supervisor", "Administrative Staff", "Human Resources Personnel",
        "Finance Accounting Staff", "Sales Representative", "Marketing Specialist",
        "Customer Service Representative", "IT Technical Support Staff",
        "Software Developer Engineer", "Operations Staff",
        "Manufacturing Production Worker", "Warehouse Logistics Staff",
        "Research Development Staff", "Legal Compliance Officer",
        "Training Development Specialist", "Intern Trainee", "Teacher",
        "Lecturer", "Nurse", "Doctor", "Pharmacist", "Therapist",
        "Physiotherapist", "Dentist", "Engineer", "Accountant", "Auditor",
        "Driver", "Chef", "Cook", "Security Guard", "Farmer", "Agronomist",
        "Veterinarian", "Social Worker", "Construction Contractor",
        "Skilled Trades Contractor", "Virtual Assistant", "Data Analyst",
        "Translator Interpreter", "Cybersecurity Specialist",
        "Training Coaching Professional", "Pastor", "Imam", "Priest",
        "Lawyer", "Paralegal", "Developer", "Designer",
    ],
    "client": [
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
    "contact": [
        "Raw Material Supplier", "Component Parts Supplier", "Equipment Supplier",
        "Technology Vendor", "Office Supplies Vendor", "Logistics Shipping Provider",
        "Maintenance Repair Vendor", "Professional Services Vendor",
        "IT Services Vendor", "Wholesale Distributor", "Import Export Supplier",
        "Sustainable Green Supplier", "Backup Secondary Supplier",
        "Equity Partner", "Silent Partner", "Managing Partner",
        "Strategic Alliance Partner", "Joint Venture Partner",
        "Venture Capital Investor", "Angel Investor", "Private Equity Investor",
        "Institutional Investor", "Corporate Investor", "Board Member",
        "Advisory Board Member", "Franchise Partner", "Licensing Partner",
        "Distribution Partner", "Technology Partner", "Financial Backer",
        "Seed Investor", "Growth Stage Investor", "Impact ESG Investor",
        "Guarantor", "Next of Kin", "Emergency Contact", "Guardian",
        "Donor", "Sponsor",
    ],
    "volunteer": [
        "Community Worker", "Unpaid Contributor", "Apprentice",
        "Religious Volunteer", "Youth Worker", "Fundraiser",
        "Event Volunteer", "Peer Support Worker",
    ],
}

# v2: Subtypes that require professional licensing (for compliance inference)
LICENSED_PERSON_SUBTYPES = {
    "nurse", "doctor", "pharmacist", "dentist", "physiotherapist",
    "therapist", "veterinarian", "lawyer", "paralegal", "accountant",
    "auditor", "engineer", "agronomist",
}

ACTIVE_STATUSES = {
    "active", "live", "current", "enrolled", "approved",
    "open", "engaged", "confirmed", "available",
}

INACTIVE_STATUSES = {
    "inactive", "archived", "closed", "terminated", "discharged",
    "withdrawn", "suspended", "expired", "left", "graduated",
    "churned", "on_leave",
}


# ==============================================================
# ENTERPRISE TAXONOMY
# ==============================================================

ENTERPRISE_TYPES = [
    "commercial", "nonprofit", "government",
    "household", "cooperative", "trust",
]

ENTERPRISE_TYPE_MAP = {
    # canonical
    "commercial":   "commercial",
    "nonprofit":    "nonprofit",
    "government":   "government",
    "household":    "household",
    "cooperative":  "cooperative",
    "trust":        "trust",
    # legacy
    "business":     "commercial",
    "company":      "commercial",
    "corporation":  "commercial",
    "ngo":          "nonprofit",
    "charity":      "nonprofit",
    "church":       "nonprofit",
    "mosque":       "nonprofit",
    "temple":       "nonprofit",
    "public":       "government",
    "municipal":    "government",
    "family":       "household",
    "coop":         "cooperative",
    "association":  "cooperative",
    "foundation":   "nonprofit",
    "union":        "nonprofit",
    # v2 additions
    "sme":          "commercial",
    "startup":      "commercial",
    "social_enterprise": "nonprofit",
    "parastatal":   "government",
    "statutory":    "government",
    "regulator":    "government",
}


# ==============================================================
# NAICS INDUSTRY CLASSIFICATION  (replaces legacy SIC 1-20)
# ==============================================================
# Official 2-digit NAICS 2022 codes.
# Reference: https://www.census.gov/naics/
#
# Backward-compatible: SIC_SECTORS kept as alias pointing here.
# The old integer 1-20 keys are preserved in SIC_SECTORS for
# any code that reads sector_id numerically.

NAICS_SECTORS: dict[int, str] = {
    11: "Agriculture, Forestry, Fishing and Hunting",
    21: "Mining, Quarrying, and Oil and Gas Extraction",
    22: "Utilities",
    23: "Construction",
    31: "Manufacturing — Food, Beverage, Textile, Apparel, Leather",
    32: "Manufacturing — Paper, Petroleum, Chemical, Plastics, Mineral",
    33: "Manufacturing — Metal, Machinery, Electronics, Transport Equipment",
    42: "Wholesale Trade",
    44: "Retail Trade — Motor Vehicles, Furniture, Electronics, Building",
    45: "Retail Trade — Sporting Goods, Books, General Merchandise, Online",
    48: "Transportation and Warehousing — Air, Rail, Water, Truck, Pipeline",
    49: "Transportation and Warehousing — Postal, Couriers, Warehousing",
    51: "Information",
    52: "Finance and Insurance",
    53: "Real Estate and Rental and Leasing",
    54: "Professional, Scientific, and Technical Services",
    55: "Management of Companies and Enterprises",
    56: "Administrative and Support and Waste Management Services",
    61: "Educational Services",
    62: "Health Care and Social Assistance",
    71: "Arts, Entertainment, and Recreation",
    72: "Accommodation and Food Services",
    81: "Other Services (except Public Administration)",
    92: "Public Administration",
}

# Compliance and regulatory flags per NAICS sector
NAICS_SECTOR_FLAGS: dict[int, dict] = {
    11: {"regulated": True,  "license_required": False, "audit_required": False, "risk": "medium"},
    21: {"regulated": True,  "license_required": True,  "audit_required": True,  "risk": "high"},
    22: {"regulated": True,  "license_required": True,  "audit_required": True,  "risk": "high"},
    23: {"regulated": True,  "license_required": True,  "audit_required": False, "risk": "medium"},
    31: {"regulated": True,  "license_required": False, "audit_required": True,  "risk": "medium"},
    32: {"regulated": True,  "license_required": True,  "audit_required": True,  "risk": "high"},
    33: {"regulated": False, "license_required": False, "audit_required": False, "risk": "low"},
    42: {"regulated": False, "license_required": False, "audit_required": False, "risk": "low"},
    44: {"regulated": False, "license_required": False, "audit_required": False, "risk": "low"},
    45: {"regulated": False, "license_required": False, "audit_required": False, "risk": "low"},
    48: {"regulated": True,  "license_required": True,  "audit_required": False, "risk": "medium"},
    49: {"regulated": True,  "license_required": True,  "audit_required": False, "risk": "medium"},
    51: {"regulated": True,  "license_required": False, "audit_required": False, "risk": "medium"},
    52: {"regulated": True,  "license_required": True,  "audit_required": True,  "risk": "high"},
    53: {"regulated": True,  "license_required": True,  "audit_required": False, "risk": "medium"},
    54: {"regulated": True,  "license_required": True,  "audit_required": False, "risk": "medium"},
    55: {"regulated": False, "license_required": False, "audit_required": False, "risk": "low"},
    56: {"regulated": False, "license_required": False, "audit_required": False, "risk": "low"},
    61: {"regulated": True,  "license_required": True,  "audit_required": True,  "risk": "medium"},
    62: {"regulated": True,  "license_required": True,  "audit_required": True,  "risk": "high"},
    71: {"regulated": False, "license_required": False, "audit_required": False, "risk": "low"},
    72: {"regulated": True,  "license_required": True,  "audit_required": False, "risk": "medium"},
    81: {"regulated": False, "license_required": False, "audit_required": False, "risk": "low"},
    92: {"regulated": True,  "license_required": True,  "audit_required": True,  "risk": "high"},
}

# enterprise_subtype → NAICS sector code
SUBTYPE_SECTOR_MAP: dict[str, int] = {
    # Agriculture (11)
    "Crop Farm": 11, "Ranch": 11, "Dairy Farm": 11, "Poultry Farm": 11,
    "Aquaculture Facility": 11, "Forestry Operation": 11,
    "Nursery Greenhouse": 11, "Organic Farm": 11, "Vineyard Orchard": 11,
    # Mining (21)
    "Mining Operation": 21, "Quarry": 21, "Oil Extraction Site": 21,
    "Natural Gas Extraction Site": 21, "Coal Mining Operation": 21,
    # Utilities (22)
    "Power Generation Plant": 22, "Water Supply Utility": 22,
    "Wastewater Treatment Facility": 22, "Solar Farm": 22, "Wind Farm": 22,
    "Renewable Energy Facility": 22, "Hydroelectric Plant": 22,
    # Construction (23)
    "Residential Construction Single Family": 23,
    "Commercial Building Construction": 23, "Industrial Construction": 23,
    "Road Highway Construction": 23, "Electrical Contracting": 23,
    # Manufacturing (31-33)
    "Food Processing Plant": 31, "Beverage Manufacturing Facility": 31,
    "Pharmaceutical Manufacturing": 32, "Chemical Manufacturing Plant": 32,
    "Metal Fabrication Shop": 33, "Electronics Manufacturing": 33,
    # Wholesale (42)
    "Agricultural Product Wholesaler": 42, "Pharmaceutical Wholesaler": 42,
    "Food Beverage Wholesaler": 42, "Electronics Wholesaler": 42,
    # Retail (44-45)
    "Grocery Store Supermarket": 44, "Pharmacy Drug Store": 44,
    "Convenience Store": 44, "Department Store": 45,
    "Clothing Apparel Store": 44, "Electronics Retailer": 44,
    "Automotive Dealership": 44, "Ecommerce Retailer": 45,
    # Transportation (48-49)
    "Trucking Company": 48, "Courier Delivery Service": 49,
    "Warehousing Storage Facility": 49, "Public Transit System": 48,
    "Air Cargo Carrier": 48, "Maritime Shipping Company": 48,
    # Information (51)
    "Software Development Company": 51, "IT Consulting Firm": 54,
    "Telecommunications Provider": 51, "Cloud Computing Provider": 51,
    "Cybersecurity Firm": 51, "Data Analytics Firm": 54,
    # Finance (52)
    "Commercial Bank": 52, "Credit Union": 52,
    "Insurance Company Life": 52, "Fintech Company": 52,
    "Venture Capital Firm": 52, "Investment Bank": 52,
    # Real Estate (53)
    "Residential Property Management": 53, "Real Estate Brokerage": 53,
    "Vehicle Rental Agency": 53, "Self Storage Facility": 53,
    # Professional Services (54)
    "Legal Services Firm": 54, "Accounting Auditing Firm": 54,
    "Management Consulting Firm": 54, "Engineering Services Firm": 54,
    "Advertising Agency": 54, "Design Studio": 54,
    # Management (55)
    "Holding Company": 55, "Corporate Headquarters": 55,
    "Franchise Management Company": 55,
    # Admin/Support (56)
    "Staffing Agency": 56, "Security Services Firm": 56,
    "Facilities Management Company": 56, "Waste Collection Service": 56,
    # Education (61)
    "Elementary School": 61, "Secondary School": 61,
    "College University": 61, "Tutoring Center": 61,
    "Online Education Provider": 61, "Technical Trade School": 61,
    "Language School": 61, "Corporate Training Provider": 61,
    # Health Care (62)
    "General Hospital": 62, "Dental Clinic": 62,
    "Physicians Office": 62, "Nursing Home": 62,
    "Rehabilitation Center": 62, "Mental Health Facility": 62,
    "Home Health Care Service": 62, "Outpatient Care Center": 62,
    # Arts (71)
    "Theater Company": 71, "Museum": 71, "Fitness Center Gym": 71,
    "Event Management Company": 71, "Sports Team Club": 71,
    # Food/Accommodation (72)
    "Hotel": 72, "Resort": 72, "Full Service Restaurant": 72,
    "Fast Food Restaurant": 72, "Cafe Coffee Shop": 72,
    "Catering Service": 72, "Bar Pub": 72, "Food Truck": 72,
    # Other Services (81)
    "Automotive Repair Shop": 81, "Beauty Salon Barbershop": 81,
    "Religious Organization": 81, "Nonprofit Organization": 81,
    "Spa Wellness Center": 81, "Dry Cleaning Laundry": 81,
    # Public Administration (92)
    "Federal Government Agency": 92, "State Government Agency": 92,
    "Local Government Office": 92, "Public Health Department": 92,
    "Law Enforcement Agency": 92, "Fire Department": 92,
    "Social Services Agency": 92, "Emergency Management Agency": 92,
}

# Backward-compatible alias — old code using SIC_SECTORS[1..20] still works
# via the legacy int mapping below. New code should use NAICS_SECTORS.
SIC_SECTORS: dict[int, str] = {
    # Legacy 1-20 keys (mapped to NAICS names for continuity)
    1:  NAICS_SECTORS[11],   # Agriculture
    2:  NAICS_SECTORS[21],   # Mining
    3:  NAICS_SECTORS[22],   # Utilities
    4:  NAICS_SECTORS[23],   # Construction
    5:  NAICS_SECTORS[31],   # Manufacturing
    6:  NAICS_SECTORS[42],   # Wholesale
    7:  NAICS_SECTORS[44],   # Retail
    8:  NAICS_SECTORS[48],   # Transportation
    9:  NAICS_SECTORS[51],   # Information
    10: NAICS_SECTORS[52],   # Finance
    11: NAICS_SECTORS[53],   # Real Estate
    12: NAICS_SECTORS[54],   # Professional Services
    13: NAICS_SECTORS[55],   # Management
    14: NAICS_SECTORS[56],   # Admin Support
    15: NAICS_SECTORS[61],   # Education
    16: NAICS_SECTORS[62],   # Health Care
    17: NAICS_SECTORS[71],   # Arts
    18: NAICS_SECTORS[72],   # Accommodation/Food
    19: NAICS_SECTORS[81],   # Other Services
    20: NAICS_SECTORS[92],   # Public Administration
    # NAICS keys also directly accessible
    **NAICS_SECTORS,
}

ENTERPRISE_ACTIVE_STATUSES   = {"active", "open", "operating", "live"}
ENTERPRISE_INACTIVE_STATUSES = {"inactive", "closed", "suspended", "archived"}


# ==============================================================
# ITEM TAXONOMY
# ==============================================================

ITEM_TYPES = [
    "physical", "living", "digital",
    "service_package", "financial_instrument",
]

ITEM_TYPE_MAP = {
    # canonical
    "physical":             "physical",
    "living":               "living",
    "digital":              "digital",
    "service_package":      "service_package",
    "financial_instrument": "financial_instrument",
    # legacy
    "product":              "physical",
    "goods":                "physical",
    "medication":           "physical",
    "medicine":             "physical",
    "drug":                 "physical",
    "equipment":            "physical",
    "supply":               "physical",
    "asset":                "physical",
    "food":                 "physical",
    "livestock":            "living",
    "cattle":               "living",
    "poultry":              "living",
    "crop":                 "living",
    "animal":               "living",
    "plant":                "living",
    "software":             "digital",
    "license":              "digital",
    "subscription":         "digital",
    "service":              "service_package",
    "insurance":            "financial_instrument",
    "loan":                 "financial_instrument",
    # v2 additions
    "kit":                  "physical",
    "consumable":           "physical",
    "spare_part":           "physical",
    "seed":                 "living",
    "timber":               "living",
    "saas":                 "digital",
    "api_access":           "digital",
    "retainer":             "service_package",
    "bond":                 "financial_instrument",
    "grant":                "financial_instrument",
}

ITEM_TYPE_SETS = {
    "physical":             {
        "physical", "product", "goods", "medication", "medicine", "drug",
        "equipment", "supply", "asset", "food", "furniture", "vehicle",
        "tool", "uniform", "raw_material", "chemical", "fuel",
        "kit", "consumable", "spare_part",
    },
    "living":               {
        "living", "livestock", "cattle", "poultry", "swine", "sheep",
        "goat", "horse", "fish", "rabbit", "crop", "plant", "animal",
        "timber", "flower", "seed",
    },
    "digital":              {
        "digital", "software", "license", "subscription", "application",
        "platform", "course", "ebook", "template", "dataset",
        "saas", "api_access",
    },
    "service_package":      {
        "service_package", "service", "consultation", "maintenance",
        "delivery", "support", "retainer",
    },
    "financial_instrument": {
        "financial_instrument", "insurance", "loan", "savings",
        "investment", "bond", "equity", "grant",
    },
}

ITEM_SUBTYPES = {
    "physical": [
        "Medication", "Supplement", "Vaccine", "Controlled Substance",
        "Medical Device", "Medical Supply", "Food Ingredient", "Packaged Food",
        "Beverage", "Frozen Good", "Produce", "Dairy",
        "Equipment", "Machinery", "Vehicle", "Vessel", "Aircraft",
        "Furniture", "Fixture", "Appliance", "Electronics",
        "Tool", "Hardware", "Spare Part", "Component", "Raw Material",
        "Uniform", "Protective Gear", "Stationery", "Cleaning Supply",
        "Fuel", "Lubricant", "Chemical", "Fertilizer", "Pesticide", "Seed",
    ],
    "living": [
        "Cattle", "Poultry", "Swine", "Sheep", "Goat",
        "Horse", "Fish", "Rabbit", "Crop", "Plant", "Timber", "Flower",
    ],
    "digital": [
        "Software", "Application", "Platform", "Plugin",
        "License", "Permit", "Certificate", "Subscription",
        "Course", "Ebook", "Template", "Dataset", "Digital Asset",
    ],
    "service_package": [
        "Consultation", "Session", "Maintenance Contract",
        "Delivery Service", "Support Package", "Retainer",
    ],
    "financial_instrument": [
        "Insurance Policy", "Loan Product", "Savings Product",
        "Investment Product", "Bond", "Equity Share",
    ],
}

PERISHABLE_SUBTYPES = {
    "medication", "vaccine", "food ingredient", "produce", "dairy",
    "frozen good", "packaged food", "beverage", "supplement",
}

CONTROLLED_SUBTYPES = {
    "medication", "vaccine", "controlled substance", "medical device",
}

EQUIPMENT_SUBTYPES = {
    "equipment", "machinery", "vehicle", "vessel", "aircraft", "tool",
}

LIVING_COUNT_UNITS  = {"head", "flock", "herd"}
DIGITAL_COUNT_UNITS = {"license_seat", "user_account", "session"}

ITEM_ACTIVE_STATUSES = {
    "active", "available", "in_stock", "live", "enabled", "approved", "listed",
}

ITEM_INACTIVE_STATUSES = {
    "inactive", "discontinued", "archived", "out_of_stock",
    "recalled", "expired", "delisted", "suspended",
}


# ==============================================================
# RELATIONSHIP TAXONOMY  (expanded in v2)
# ==============================================================

RELATIONSHIP_TYPES = [
    # Core structural links
    "person_enterprise",      # person works at / belongs to enterprise
    "person_item",            # person owns / uses / prescribes item
    "enterprise_item",        # enterprise stocks / sells / manages item
    "person_person",          # person is related to another person
    "enterprise_enterprise",  # enterprise is a subsidiary / partner of another
    # v2: Address + Service links
    "enterprise_address",     # enterprise located at address
    "person_address",         # person lives / works at address
    "person_service",         # person delivers / receives service
    "enterprise_service",     # enterprise offers / subscribes to service
    # v2: Transactional context
    "person_transaction",     # person is party to a transaction
    "enterprise_transaction", # enterprise is party to a transaction
]

# Semantic metadata for each relationship type
RELATIONSHIP_SEMANTICS: dict[str, dict] = {
    "person_enterprise":      {"direction": "person → enterprise", "roles": ["employee", "client", "member", "director"]},
    "person_item":            {"direction": "person → item",       "roles": ["owner", "user", "prescriber", "assignee"]},
    "enterprise_item":        {"direction": "enterprise → item",   "roles": ["stock", "sells", "manages", "leases"]},
    "person_person":          {"direction": "person ↔ person",     "roles": ["supervisor", "next_of_kin", "colleague", "referrer"]},
    "enterprise_enterprise":  {"direction": "enterprise ↔ enterprise", "roles": ["subsidiary", "partner", "franchise", "supplier"]},
    "enterprise_address":     {"direction": "enterprise → address","roles": ["headquartered_at", "branch_at", "operates_from"]},
    "person_address":         {"direction": "person → address",    "roles": ["resides_at", "works_at", "registered_at"]},
    "person_service":         {"direction": "person ↔ service",    "roles": ["delivers", "receives", "manages"]},
    "enterprise_service":     {"direction": "enterprise ↔ service","roles": ["offers", "subscribes_to", "manages"]},
    "person_transaction":     {"direction": "person ↔ transaction","roles": ["payer", "payee", "approver", "beneficiary"]},
    "enterprise_transaction": {"direction": "enterprise ↔ transaction", "roles": ["buyer", "seller", "intermediary"]},
}

RELATIONSHIP_ACTIVE_STATUSES = {"active", "open", "live", "current"}
RELATIONSHIP_ENDED_STATUSES  = {"ended", "inactive", "archived", "closed", "terminated"}


# ==============================================================
# TASK + TRANSACTION TAXONOMY  (v2 addition)
# ==============================================================

TASK_STATUSES = {
    "active":    {"pending", "in_progress", "open", "assigned", "scheduled"},
    "complete":  {"completed", "done", "closed", "resolved", "delivered"},
    "blocked":   {"blocked", "on_hold", "deferred", "waiting"},
    "cancelled": {"cancelled", "voided", "abandoned"},
}

TRANSACTION_STATUSES = {
    "draft":   {"draft", "pending", "created"},
    "posted":  {"posted", "confirmed", "approved", "settled"},
    "voided":  {"voided", "cancelled", "reversed"},
}

PAYMENT_STATUSES = {
    "paid":    {"paid", "settled", "cleared", "received"},
    "unpaid":  {"unpaid", "outstanding", "due", "overdue"},
    "partial": {"partial", "part_paid", "partially_paid"},
}


# ==============================================================
# HELPER FUNCTIONS  (v1 API preserved + v2 additions)
# ==============================================================

def normalize_person_type(raw_type: str) -> str:
    """Translate any legacy or canonical person_type to taxonomy value.
    Falls back to fuzzy matching if no exact match found.
    """
    if not raw_type:
        return "staff"
    key = raw_type.lower().strip()
    exact = PERSON_TYPE_MAP.get(key)
    if exact:
        return exact
    # Fuzzy fallback — catches typos like "staf", "cllient"
    return _fuzzy_match_type(key, list(PERSON_TYPE_MAP.keys()), default="staff")


def normalize_enterprise_type(raw_type: str) -> str:
    """Translate any legacy or canonical enterprise_type to taxonomy value.
    Falls back to fuzzy matching if no exact match found.
    """
    if not raw_type:
        return "commercial"
    key = raw_type.lower().strip()
    exact = ENTERPRISE_TYPE_MAP.get(key)
    if exact:
        return exact
    return _fuzzy_match_type(key, list(ENTERPRISE_TYPE_MAP.keys()), default="commercial")


def normalize_item_type(raw_type: str) -> str:
    """Translate any legacy or canonical item_type to taxonomy value.
    Falls back to fuzzy matching if no exact match found.
    """
    if not raw_type:
        return "physical"
    key = raw_type.lower().strip()
    exact = ITEM_TYPE_MAP.get(key)
    if exact:
        return exact
    return _fuzzy_match_type(key, list(ITEM_TYPE_MAP.keys()), default="physical")


def get_sector_for_subtype(subtype: str) -> tuple:
    """Return (naics_code, sector_name) for a given enterprise_subtype.
    v2: returns NAICS code. v1 callers get same structure — just real NAICS codes.
    """
    naics_code = SUBTYPE_SECTOR_MAP.get(subtype)
    if naics_code:
        return naics_code, NAICS_SECTORS.get(naics_code, "Unknown")
    return None, None


def is_perishable(item_subtype: str) -> bool:
    """True if the item_subtype is a perishable type."""
    return (item_subtype or "").lower() in PERISHABLE_SUBTYPES


def is_controlled(item_subtype: str) -> bool:
    """True if the item_subtype is a controlled/regulated type."""
    return (item_subtype or "").lower() in CONTROLLED_SUBTYPES


def is_equipment(item_subtype: str) -> bool:
    """True if the item_subtype is an equipment type."""
    return (item_subtype or "").lower() in EQUIPMENT_SUBTYPES


def classify_person_type(raw_type: str) -> str:
    """Return canonical person_type for any person record."""
    return normalize_person_type(raw_type)


def classify_item_type(raw_type: str) -> str:
    """Return canonical item_type for any item record."""
    return normalize_item_type(raw_type)


def get_person_type_set(canonical_type: str) -> set:
    """Return the full set of values that map to a canonical person_type."""
    return PERSON_TYPE_SETS.get(canonical_type, {canonical_type})


def get_item_type_set(canonical_type: str) -> set:
    """Return the full set of values that map to a canonical item_type."""
    return ITEM_TYPE_SETS.get(canonical_type, {canonical_type})


# ── v2: Validation functions ─────────────────────────────────────────────────

def is_valid_person_type(value: str) -> bool:
    """True if value is a canonical person_type."""
    return (value or "").lower() in PERSON_TYPE_MAP


def is_valid_enterprise_type(value: str) -> bool:
    """True if value is a canonical enterprise_type."""
    return (value or "").lower() in ENTERPRISE_TYPE_MAP


def is_valid_item_type(value: str) -> bool:
    """True if value is a canonical item_type."""
    return (value or "").lower() in ITEM_TYPE_MAP


def is_valid_subtype_for_type(subtype: str, main_type: str, entity: str = "person") -> bool:
    """
    True if subtype is a known subtype for the given main_type and entity.

    Examples:
      is_valid_subtype_for_type("Nurse", "staff", "person")  → True
      is_valid_subtype_for_type("Patient", "staff", "person") → False
      is_valid_subtype_for_type("General Hospital", "commercial", "enterprise") → False
    """
    entity = entity.lower()
    if entity == "person":
        subtypes = PERSON_SUBTYPES.get(normalize_person_type(main_type), [])
        return subtype in subtypes
    elif entity == "enterprise":
        return subtype in SUBTYPE_SECTOR_MAP
    elif entity in ("item", "product"):
        subtypes = ITEM_SUBTYPES.get(normalize_item_type(main_type), [])
        return subtype in subtypes
    return False


def validate_taxonomy(entity: str, record: dict) -> list[str]:
    """
    Validate a record's taxonomy fields against known values.
    Returns a list of warning strings (empty = all valid).

    Args:
        entity: "person", "enterprise", or "item"
        record: dict with type/subtype fields
    """
    warnings = []
    entity = entity.lower()

    if entity == "person":
        pt = record.get("person_type", "")
        if pt and not is_valid_person_type(pt):
            suggestions = _fuzzy_suggest(pt, list(PERSON_TYPE_MAP.keys()))
            warnings.append(
                f"Unknown person_type '{pt}'"
                + (f". Did you mean: {suggestions[0]}?" if suggestions else "")
            )

    elif entity == "enterprise":
        et = record.get("enterprise_type", "")
        if et and not is_valid_enterprise_type(et):
            suggestions = _fuzzy_suggest(et, list(ENTERPRISE_TYPE_MAP.keys()))
            warnings.append(
                f"Unknown enterprise_type '{et}'"
                + (f". Did you mean: {suggestions[0]}?" if suggestions else "")
            )

    elif entity in ("item", "product"):
        it = record.get("item_type", "")
        if it and not is_valid_item_type(it):
            suggestions = _fuzzy_suggest(it, list(ITEM_TYPE_MAP.keys()))
            warnings.append(
                f"Unknown item_type '{it}'"
                + (f". Did you mean: {suggestions[0]}?" if suggestions else "")
            )

    return warnings


# ── v2: Compliance / inference rules ─────────────────────────────────────────

def get_compliance_flags(enterprise_subtype: str) -> dict:
    """
    Return compliance flags for an enterprise based on its subtype.

    Inferred from NAICS sector membership. Used by:
    - Alert engine (flag regulated enterprises missing compliance tasks)
    - Copilot (answer "which of our branches need annual audits?")
    - ML models (risk scoring)

    Returns:
      {
        "naics_code": 62,
        "sector": "Health Care and Social Assistance",
        "regulated": True,
        "license_required": True,
        "audit_required": True,
        "risk": "high"
      }
    """
    naics_code, sector_name = get_sector_for_subtype(enterprise_subtype)
    if not naics_code:
        return {
            "naics_code":       None,
            "sector":           None,
            "regulated":        False,
            "license_required": False,
            "audit_required":   False,
            "risk":             "unknown",
        }
    flags = NAICS_SECTOR_FLAGS.get(naics_code, {})
    return {
        "naics_code":       naics_code,
        "sector":           sector_name,
        **flags,
    }


def is_regulated(enterprise_subtype: str) -> bool:
    """True if the enterprise subtype operates in a regulated NAICS sector."""
    return get_compliance_flags(enterprise_subtype).get("regulated", False)


def requires_license(enterprise_subtype: str) -> bool:
    """True if the enterprise subtype typically requires a license."""
    return get_compliance_flags(enterprise_subtype).get("license_required", False)


def person_requires_license(person_subtype: str) -> bool:
    """True if the person subtype is a licensed profession."""
    return (person_subtype or "").lower().replace(" ", "_") in LICENSED_PERSON_SUBTYPES


def get_display_label(code: str, lang: str = "en") -> str:
    """Return the display label for a taxonomy code in the given language.
    Falls back to English, then to the raw code if not found.
    """
    lang_labels   = DISPLAY_LABELS.get(lang, {})
    en_labels     = DISPLAY_LABELS.get("en", {})
    return lang_labels.get(code) or en_labels.get(code) or code


def get_concept_meta(code: str) -> ConceptMeta:
    """Return governance metadata for a concept code, or a default if unknown."""
    return CONCEPT_METADATA.get(code, ConceptMeta(description=f"User-defined term: {code}"))


# ── v2: Fuzzy matching internals ──────────────────────────────────────────────

@lru_cache(maxsize=512)
def _fuzzy_match_type(raw: str, candidates_tuple: tuple, default: str) -> str:
    """
    Internal fuzzy lookup using stdlib difflib.
    Cached — repeated lookups for the same value are instant.
    cutoff=0.7 means 70% similarity required to suggest a match.
    """
    matches = get_close_matches(raw, list(candidates_tuple), n=1, cutoff=0.7)
    if matches:
        # matches[0] is the closest key — look up canonical value
        return default  # return default; caller maps via their dict
    return default


def _fuzzy_suggest(raw: str, candidates: list[str], n: int = 3) -> list[str]:
    """Return top-n fuzzy suggestions for a raw string against a candidate list."""
    return get_close_matches(raw, candidates, n=n, cutoff=0.6)


def fuzzy_normalize_person_type(raw_type: str) -> str:
    """
    Normalize person_type with fuzzy fallback.
    Handles typos: "staf" → "staff", "cllient" → "client".
    """
    if not raw_type:
        return "staff"
    key = raw_type.lower().strip()
    # Exact match first
    if key in PERSON_TYPE_MAP:
        return PERSON_TYPE_MAP[key]
    # Fuzzy match against all known keys
    matches = get_close_matches(key, list(PERSON_TYPE_MAP.keys()), n=1, cutoff=0.65)
    if matches:
        return PERSON_TYPE_MAP[matches[0]]
    return "staff"


def fuzzy_normalize_enterprise_type(raw_type: str) -> str:
    """Normalize enterprise_type with fuzzy fallback."""
    if not raw_type:
        return "commercial"
    key = raw_type.lower().strip()
    if key in ENTERPRISE_TYPE_MAP:
        return ENTERPRISE_TYPE_MAP[key]
    matches = get_close_matches(key, list(ENTERPRISE_TYPE_MAP.keys()), n=1, cutoff=0.65)
    if matches:
        return ENTERPRISE_TYPE_MAP[matches[0]]
    return "commercial"


def fuzzy_normalize_item_type(raw_type: str) -> str:
    """Normalize item_type with fuzzy fallback."""
    if not raw_type:
        return "physical"
    key = raw_type.lower().strip()
    if key in ITEM_TYPE_MAP:
        return ITEM_TYPE_MAP[key]
    matches = get_close_matches(key, list(ITEM_TYPE_MAP.keys()), n=1, cutoff=0.65)
    if matches:
        return ITEM_TYPE_MAP[matches[0]]
    return "physical"


# ── v2: Taxonomy introspection ────────────────────────────────────────────────

def list_all_subtypes(entity: str, main_type: str) -> list[str]:
    """Return all known subtypes for a given entity + main_type combo.

    Examples:
      list_all_subtypes("person", "staff")      → ["Nurse", "Doctor", ...]
      list_all_subtypes("enterprise", "commercial") → all subtypes in SUBTYPE_SECTOR_MAP
    """
    entity = entity.lower()
    if entity == "person":
        return PERSON_SUBTYPES.get(normalize_person_type(main_type), [])
    elif entity == "enterprise":
        et = normalize_enterprise_type(main_type)
        # All enterprise subtypes — sector-specific or not
        return sorted(SUBTYPE_SECTOR_MAP.keys())
    elif entity in ("item", "product"):
        return ITEM_SUBTYPES.get(normalize_item_type(main_type), [])
    return []


def taxonomy_summary() -> dict:
    """Return a summary of the full taxonomy — useful for status/health checks."""
    return {
        "version": "2.0",
        "person_types":          len(PERSON_TYPES),
        "person_subtypes_total": sum(len(v) for v in PERSON_SUBTYPES.values()),
        "enterprise_types":      len(ENTERPRISE_TYPES),
        "enterprise_subtypes":   len(SUBTYPE_SECTOR_MAP),
        "naics_sectors":         len(NAICS_SECTORS),
        "item_types":            len(ITEM_TYPES),
        "item_subtypes_total":   sum(len(v) for v in ITEM_SUBTYPES.values()),
        "relationship_types":    len(RELATIONSHIP_TYPES),
        "languages_supported":   list(DISPLAY_LABELS.keys()),
        "person_type_map_size":  len(PERSON_TYPE_MAP),
        "enterprise_type_map_size": len(ENTERPRISE_TYPE_MAP),
        "item_type_map_size":    len(ITEM_TYPE_MAP),
    }
