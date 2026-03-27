# ==============================================================
# Newsconseen Universal Taxonomy
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
# ==============================================================


# --------------------------------------------------------------
# PERSON TAXONOMY
# --------------------------------------------------------------

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
}

# Sets for fast membership testing in ETL classification
PERSON_TYPE_SETS = {
    "staff":     {
        "staff", "employee", "contractor", "freelancer", "consultant", "temp",
        "caregiver", "nurse", "doctor", "therapist", "pharmacist",
        "teacher", "instructor", "tutor", "coach", "trainer",
        "manager", "supervisor", "admin", "coordinator", "director", "intern",
    },
    "client":    {
        "client", "patient", "student", "member", "customer", "resident",
        "learner", "trainee", "attendee", "beneficiary", "enrollee",
        "subscriber", "participant",
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

ACTIVE_STATUSES = {
    "active", "live", "current", "enrolled", "approved",
    "open", "engaged", "confirmed", "available",
}

INACTIVE_STATUSES = {
    "inactive", "archived", "closed", "terminated", "discharged",
    "withdrawn", "suspended", "expired", "left", "graduated",
    "churned", "on_leave",
}


# --------------------------------------------------------------
# ENTERPRISE TAXONOMY
# --------------------------------------------------------------

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
}

# NAICS sector_id → sector_name
SIC_SECTORS = {
    1:  "Agriculture Forestry Fishing and Hunting",
    2:  "Mining Quarrying and Oil and Gas Extraction",
    3:  "Utilities",
    4:  "Construction",
    5:  "Manufacturing",
    6:  "Wholesale Trade",
    7:  "Retail Trade",
    8:  "Transportation and Warehousing",
    9:  "Information",
    10: "Finance and Insurance",
    11: "Real Estate and Rental and Leasing",
    12: "Professional Scientific and Technical Services",
    13: "Management of Companies and Enterprises",
    14: "Administrative Support Waste Management",
    15: "Educational Services",
    16: "Health Care and Social Assistance",
    17: "Arts Entertainment and Recreation",
    18: "Accommodation and Food Services",
    19: "Other Services",
    20: "Public Administration",
}

# enterprise_subtype → sector_id for auto-classification
SUBTYPE_SECTOR_MAP = {
    "Crop Farm": 1, "Ranch": 1, "Dairy Farm": 1, "Poultry Farm": 1,
    "Aquaculture Facility": 1, "Forestry Operation": 1,
    "Nursery Greenhouse": 1, "Organic Farm": 1, "Vineyard Orchard": 1,
    "Mining Operation": 2, "Quarry": 2, "Oil Extraction Site": 2,
    "Natural Gas Extraction Site": 2, "Coal Mining Operation": 2,
    "Power Generation Plant": 3, "Water Supply Utility": 3,
    "Wastewater Treatment Facility": 3, "Solar Farm": 3, "Wind Farm": 3,
    "Renewable Energy Facility": 3, "Hydroelectric Plant": 3,
    "Residential Construction Single Family": 4,
    "Commercial Building Construction": 4, "Industrial Construction": 4,
    "Road Highway Construction": 4, "Electrical Contracting": 4,
    "Food Processing Plant": 5, "Pharmaceutical Manufacturing": 5,
    "Beverage Manufacturing Facility": 5, "Chemical Manufacturing Plant": 5,
    "Metal Fabrication Shop": 5, "Electronics Manufacturing": 5,
    "Agricultural Product Wholesaler": 6, "Pharmaceutical Wholesaler": 6,
    "Food Beverage Wholesaler": 6, "Electronics Wholesaler": 6,
    "Grocery Store Supermarket": 7, "Pharmacy Drug Store": 7,
    "Convenience Store": 7, "Department Store": 7,
    "Clothing Apparel Store": 7, "Electronics Retailer": 7,
    "Automotive Dealership": 7, "Ecommerce Retailer": 7,
    "Trucking Company": 8, "Courier Delivery Service": 8,
    "Warehousing Storage Facility": 8, "Public Transit System": 8,
    "Air Cargo Carrier": 8, "Maritime Shipping Company": 8,
    "Software Development Company": 9, "IT Consulting Firm": 9,
    "Telecommunications Provider": 9, "Cloud Computing Provider": 9,
    "Cybersecurity Firm": 9, "Data Analytics Firm": 9,
    "Commercial Bank": 10, "Credit Union": 10,
    "Insurance Company Life": 10, "Fintech Company": 10,
    "Venture Capital Firm": 10, "Investment Bank": 10,
    "Residential Property Management": 11, "Real Estate Brokerage": 11,
    "Vehicle Rental Agency": 11, "Self Storage Facility": 11,
    "Legal Services Firm": 12, "Accounting Auditing Firm": 12,
    "Management Consulting Firm": 12, "Engineering Services Firm": 12,
    "Advertising Agency": 12, "Design Studio": 12,
    "Holding Company": 13, "Corporate Headquarters": 13,
    "Franchise Management Company": 13,
    "Staffing Agency": 14, "Security Services Firm": 14,
    "Facilities Management Company": 14, "Waste Collection Service": 14,
    "Elementary School": 15, "Secondary School": 15,
    "College University": 15, "Tutoring Center": 15,
    "Online Education Provider": 15, "Technical Trade School": 15,
    "Language School": 15, "Corporate Training Provider": 15,
    "General Hospital": 16, "Dental Clinic": 16,
    "Physicians Office": 16, "Nursing Home": 16,
    "Rehabilitation Center": 16, "Mental Health Facility": 16,
    "Home Health Care Service": 16, "Outpatient Care Center": 16,
    "Theater Company": 17, "Museum": 17, "Fitness Center Gym": 17,
    "Event Management Company": 17, "Sports Team Club": 17,
    "Hotel": 18, "Resort": 18, "Full Service Restaurant": 18,
    "Fast Food Restaurant": 18, "Cafe Coffee Shop": 18,
    "Catering Service": 18, "Bar Pub": 18, "Food Truck": 18,
    "Automotive Repair Shop": 19, "Beauty Salon Barbershop": 19,
    "Religious Organization": 19, "Nonprofit Organization": 19,
    "Spa Wellness Center": 19, "Dry Cleaning Laundry": 19,
    "Federal Government Agency": 20, "State Government Agency": 20,
    "Local Government Office": 20, "Public Health Department": 20,
    "Law Enforcement Agency": 20, "Fire Department": 20,
    "Social Services Agency": 20, "Emergency Management Agency": 20,
}

ENTERPRISE_ACTIVE_STATUSES = {"active", "open", "operating", "live"}
ENTERPRISE_INACTIVE_STATUSES = {"inactive", "closed", "suspended", "archived"}


# --------------------------------------------------------------
# ITEM TAXONOMY
# --------------------------------------------------------------

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
}

ITEM_TYPE_SETS = {
    "physical":             {
        "physical", "product", "goods", "medication", "medicine", "drug",
        "equipment", "supply", "asset", "food", "furniture", "vehicle",
        "tool", "uniform", "raw_material", "chemical", "fuel",
    },
    "living":               {
        "living", "livestock", "cattle", "poultry", "swine", "sheep",
        "goat", "horse", "fish", "rabbit", "crop", "plant", "animal",
        "timber", "flower",
    },
    "digital":              {
        "digital", "software", "license", "subscription", "application",
        "platform", "course", "ebook", "template", "dataset",
    },
    "service_package":      {
        "service_package", "service", "consultation", "maintenance",
        "delivery", "support", "retainer",
    },
    "financial_instrument": {
        "financial_instrument", "insurance", "loan", "savings",
        "investment", "bond", "equity",
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

LIVING_COUNT_UNITS = {"head", "flock", "herd"}
DIGITAL_COUNT_UNITS = {"license_seat", "user_account", "session"}

ITEM_ACTIVE_STATUSES = {
    "active", "available", "in_stock", "live", "enabled", "approved", "listed",
}

ITEM_INACTIVE_STATUSES = {
    "inactive", "discontinued", "archived", "out_of_stock",
    "recalled", "expired", "delisted", "suspended",
}


# --------------------------------------------------------------
# RELATIONSHIP TAXONOMY
# --------------------------------------------------------------

RELATIONSHIP_TYPES = [
    "person_enterprise",
    "person_item",
    "enterprise_item",
    "person_person",
    "enterprise_enterprise",
]

RELATIONSHIP_ACTIVE_STATUSES = {"active", "open", "live", "current"}
RELATIONSHIP_ENDED_STATUSES = {"ended", "inactive", "archived", "closed", "terminated"}


# --------------------------------------------------------------
# HELPER FUNCTIONS
# All ETL modules and API responses use these — never raw dicts
# --------------------------------------------------------------

def normalize_person_type(raw_type: str) -> str:
    """Translate any legacy or canonical person_type to taxonomy value."""
    if not raw_type:
        return "staff"
    return PERSON_TYPE_MAP.get(raw_type.lower().strip(), "staff")


def normalize_enterprise_type(raw_type: str) -> str:
    """Translate any legacy or canonical enterprise_type to taxonomy value."""
    if not raw_type:
        return "commercial"
    return ENTERPRISE_TYPE_MAP.get(raw_type.lower().strip(), "commercial")


def normalize_item_type(raw_type: str) -> str:
    """Translate any legacy or canonical item_type to taxonomy value."""
    if not raw_type:
        return "physical"
    return ITEM_TYPE_MAP.get(raw_type.lower().strip(), "physical")


def get_sector_for_subtype(subtype: str) -> tuple:
    """Return (sector_id, sector_name) for a given enterprise_subtype."""
    sector_id = SUBTYPE_SECTOR_MAP.get(subtype)
    if sector_id:
        return sector_id, SIC_SECTORS[sector_id]
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
