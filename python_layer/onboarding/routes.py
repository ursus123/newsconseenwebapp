# ==============================================================
# Newsconseen — Tenant Onboarding Automation
# ==============================================================
# POST /onboarding/provision
#   Called once after Enterprise creation during the onboarding wizard.
#   Creates default Workflows for the tenant's enterprise_type and
#   returns a taxonomy template for the frontend to materialise as
#   MasterDataOption records via the Base44 SDK.
#
# Design:
#   - All taxonomy definitions live here as pure data (no Base44 write
#     from the backend — frontend owns MasterDataOption creation).
#   - Workflows are created directly into _WORKFLOWS (same process,
#     no HTTP round-trip required).
#   - Fire-and-forget from the frontend — errors are swallowed silently.
# ==============================================================

import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter
from pydantic import BaseModel

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/onboarding", tags=["Onboarding"])


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ── Enterprise-type → cluster mapping ─────────────────────────────────────────
_CLUSTER = {
    # Healthcare
    "healthcare": "healthcare", "home_healthcare": "healthcare",
    "home_health": "healthcare", "residential_care": "healthcare",
    "clinic": "healthcare", "pharmacy": "healthcare",
    "nursing_home": "healthcare", "hospital": "healthcare",
    "mental_health": "healthcare", "dental": "healthcare",
    "veterinary": "healthcare",
    # Education
    "education": "education", "school": "education",
    "university": "education", "childcare": "education",
    "tutoring": "education", "training_center": "education",
    # Nonprofit / Community
    "nonprofit": "nonprofit", "ngo": "nonprofit",
    "charity": "nonprofit", "social_services": "nonprofit",
    "community": "nonprofit", "church": "nonprofit",
    "mosque": "nonprofit", "temple": "nonprofit", "faith": "nonprofit",
    # Agriculture
    "agriculture": "agriculture", "farm": "agriculture",
    "livestock_farm": "agriculture", "crop_farm": "agriculture",
    "animal_barn": "agriculture", "aquaculture": "agriculture",
    "ranch": "agriculture",
    # Retail / Hospitality
    "retail": "retail", "restaurant": "retail",
    "food_beverage": "retail", "hotel": "retail", "hospitality": "retail",
    # Government
    "government": "government", "public_sector": "government",
    "municipal": "government",
    # Commercial (catch-all business)
    "commercial": "commercial", "consulting": "commercial",
    "technology": "commercial", "professional": "commercial",
    "finance": "commercial", "manufacturing": "commercial",
    "construction": "commercial", "logistics": "commercial",
    "media": "commercial", "coworking": "commercial", "gym": "commercial",
}


# ── Taxonomy builders ──────────────────────────────────────────────────────────
def _p(value, label, parent):
    """person_subtype entry"""
    return {"entity_type": "person", "field_name": "person_subtype",
            "value": value, "label": label, "parent_value": parent}

def _t(value, label):
    """task_type entry"""
    return {"entity_type": "task", "field_name": "task_type",
            "value": value, "label": label, "parent_value": None}

def _e(value, label, parent):
    """enterprise_subtype entry"""
    return {"entity_type": "enterprise", "field_name": "enterprise_subtype",
            "value": value, "label": label, "parent_value": parent}


# ── Templates: taxonomy + default workflows per cluster ────────────────────────
_TEMPLATES: dict[str, dict] = {

    "healthcare": {
        "taxonomy": [
            _p("registered_nurse",  "Registered Nurse",  "staff"),
            _p("doctor",            "Doctor",            "staff"),
            _p("pharmacist",        "Pharmacist",        "staff"),
            _p("caregiver",         "Caregiver",         "staff"),
            _p("receptionist",      "Receptionist",      "staff"),
            _p("lab_technician",    "Lab Technician",    "staff"),
            _p("patient",           "Patient",           "client"),
            _p("resident",          "Resident",          "client"),
            _p("outpatient",        "Outpatient",        "client"),
            _p("specialist",        "Specialist",        "contact"),
            _p("insurer",           "Insurer",           "contact"),
            _p("supplier",          "Supplier",          "contact"),
            _t("appointment",       "Appointment"),
            _t("follow_up",         "Follow-up"),
            _t("medication_review", "Medication Review"),
            _t("home_visit",        "Home Visit"),
            _t("discharge",         "Discharge"),
            _t("lab_test",          "Lab Test"),
            _e("clinic",            "Clinic",            "commercial"),
            _e("hospital",          "Hospital",          "commercial"),
            _e("pharmacy",          "Pharmacy",          "commercial"),
        ],
        "workflows": [
            {
                "name": "New Patient Welcome",
                "description": "Creates a welcome task when a new patient is registered",
                "trigger": {"type": "entity_created", "entity_type": "person",
                            "condition": {"person_type": "client"}},
                "steps": [{"type": "create_task", "label": "Schedule initial consultation",
                           "params": {"title": "Schedule initial consultation for new patient",
                                      "priority": "high"}}],
            },
            {
                "name": "Daily Patient Follow-up Reminder",
                "description": "Daily reminder to review pending patient follow-ups",
                "trigger": {"type": "schedule", "schedule_interval": "daily"},
                "steps": [{"type": "send_alert", "label": "Daily follow-up alert",
                           "params": {"message": "Review pending patient follow-ups and overdue appointments"}}],
            },
        ],
    },

    "education": {
        "taxonomy": [
            _p("teacher",             "Teacher",             "staff"),
            _p("principal",           "Principal",           "staff"),
            _p("counselor",           "Counselor",           "staff"),
            _p("admin_officer",       "Admin Officer",       "staff"),
            _p("teaching_assistant",  "Teaching Assistant",  "staff"),
            _p("student",             "Student",             "client"),
            _p("parent",              "Parent",              "contact"),
            _p("guardian",            "Guardian",            "contact"),
            _p("board_member",        "Board Member",        "contact"),
            _p("donor",               "Donor",               "contact"),
            _t("class_session",       "Class Session"),
            _t("assessment",          "Assessment"),
            _t("parent_meeting",      "Parent Meeting"),
            _t("exam",                "Exam"),
            _t("field_trip",          "Field Trip"),
            _t("enrolment",           "Enrolment"),
            _e("school",              "School",              "commercial"),
            _e("campus",              "Campus",              "commercial"),
            _e("training_center",     "Training Center",     "commercial"),
        ],
        "workflows": [
            {
                "name": "New Student Enrolment",
                "description": "Creates an enrolment task when a new student is registered",
                "trigger": {"type": "entity_created", "entity_type": "person",
                            "condition": {"person_type": "client"}},
                "steps": [{"type": "create_task", "label": "Complete enrolment",
                           "params": {"title": "Complete enrolment documentation for new student",
                                      "priority": "high"}}],
            },
            {
                "name": "Weekly Attendance Review",
                "description": "Weekly reminder to review student attendance",
                "trigger": {"type": "schedule", "schedule_interval": "weekly"},
                "steps": [{"type": "send_alert", "label": "Attendance review alert",
                           "params": {"message": "Review weekly attendance and flag absences"}}],
            },
        ],
    },

    "nonprofit": {
        "taxonomy": [
            _p("programme_officer",    "Programme Officer",    "staff"),
            _p("field_agent",          "Field Agent",          "staff"),
            _p("coordinator",          "Coordinator",          "staff"),
            _p("volunteer",            "Volunteer",            "volunteer"),
            _p("beneficiary",          "Beneficiary",          "client"),
            _p("member",               "Member",               "client"),
            _p("donor",                "Donor",                "contact"),
            _p("partner_org",          "Partner Organisation", "contact"),
            _p("government_contact",   "Government Contact",   "contact"),
            _t("field_visit",          "Field Visit"),
            _t("community_meeting",    "Community Meeting"),
            _t("report_submission",    "Report Submission"),
            _t("donor_update",         "Donor Update"),
            _t("beneficiary_assessment", "Beneficiary Assessment"),
            _e("ngo",                  "NGO",                  "nonprofit"),
            _e("community_group",      "Community Group",      "nonprofit"),
            _e("faith_organisation",   "Faith Organisation",   "nonprofit"),
        ],
        "workflows": [
            {
                "name": "New Beneficiary Intake",
                "description": "Creates an assessment task when a new beneficiary is registered",
                "trigger": {"type": "entity_created", "entity_type": "person",
                            "condition": {"person_type": "client"}},
                "steps": [{"type": "create_task", "label": "Beneficiary assessment",
                           "params": {"title": "Complete intake assessment for new beneficiary",
                                      "priority": "high"}}],
            },
            {
                "name": "Monthly Impact Report Reminder",
                "description": "Monthly reminder to prepare donor and impact reports",
                "trigger": {"type": "schedule", "schedule_interval": "monthly"},
                "steps": [{"type": "send_alert", "label": "Report reminder",
                           "params": {"message": "Prepare monthly impact report and donor updates"}}],
            },
        ],
    },

    "agriculture": {
        "taxonomy": [
            _p("farm_manager",       "Farm Manager",       "staff"),
            _p("field_worker",       "Field Worker",       "staff"),
            _p("agronomist",         "Agronomist",         "staff"),
            _p("veterinarian",       "Veterinarian",       "staff"),
            _p("client_farmer",      "Client Farmer",      "client"),
            _p("buyer",              "Buyer",              "contact"),
            _p("supplier",           "Supplier",           "contact"),
            _p("extension_officer",  "Extension Officer",  "contact"),
            _t("planting",           "Planting"),
            _t("harvesting",         "Harvesting"),
            _t("animal_health_check","Animal Health Check"),
            _t("soil_testing",       "Soil Testing"),
            _t("irrigation",         "Irrigation"),
            _t("market_sale",        "Market Sale"),
            _e("farm",               "Farm",               "commercial"),
            _e("cooperative",        "Cooperative",        "cooperative"),
            _e("processing_unit",    "Processing Unit",    "commercial"),
        ],
        "workflows": [
            {
                "name": "New Client Farmer Onboarding",
                "description": "Creates a farm visit task for every new client farmer",
                "trigger": {"type": "entity_created", "entity_type": "person",
                            "condition": {"person_type": "client"}},
                "steps": [{"type": "create_task", "label": "Initial farm visit",
                           "params": {"title": "Conduct initial farm visit and soil assessment",
                                      "priority": "normal"}}],
            },
            {
                "name": "Weekly Field Operations Check",
                "description": "Weekly reminder to review field operations",
                "trigger": {"type": "schedule", "schedule_interval": "weekly"},
                "steps": [{"type": "send_alert", "label": "Field operations alert",
                           "params": {"message": "Review field operations, harvest schedule, and stock levels"}}],
            },
        ],
    },

    "retail": {
        "taxonomy": [
            _p("sales_associate",  "Sales Associate",  "staff"),
            _p("cashier",          "Cashier",          "staff"),
            _p("store_manager",    "Store Manager",    "staff"),
            _p("delivery_driver",  "Delivery Driver",  "staff"),
            _p("customer",         "Customer",         "client"),
            _p("wholesale_buyer",  "Wholesale Buyer",  "client"),
            _p("supplier",         "Supplier",         "contact"),
            _p("distributor",      "Distributor",      "contact"),
            _t("stock_replenishment", "Stock Replenishment"),
            _t("customer_order",   "Customer Order"),
            _t("delivery",         "Delivery"),
            _t("returns_processing","Returns Processing"),
            _t("stocktake",        "Stocktake"),
            _e("store",            "Store",            "commercial"),
            _e("branch",           "Branch",           "commercial"),
            _e("warehouse",        "Warehouse",        "commercial"),
        ],
        "workflows": [
            {
                "name": "Daily Low-Stock Alert",
                "description": "Daily check to alert on products below minimum stock level",
                "trigger": {"type": "schedule", "schedule_interval": "daily"},
                "steps": [{"type": "send_alert", "label": "Low stock alert",
                           "params": {"message": "Review products below minimum stock and place replenishment orders"}}],
            },
            {
                "name": "New Customer Welcome",
                "description": "Creates a follow-up task when a new customer is added",
                "trigger": {"type": "entity_created", "entity_type": "person",
                            "condition": {"person_type": "client"}},
                "steps": [{"type": "create_task", "label": "Customer follow-up",
                           "params": {"title": "Welcome new customer and confirm first order",
                                      "priority": "normal"}}],
            },
        ],
    },

    "government": {
        "taxonomy": [
            _p("officer",          "Officer",          "staff"),
            _p("senior_officer",   "Senior Officer",   "staff"),
            _p("clerk",            "Clerk",            "staff"),
            _p("inspector",        "Inspector",        "staff"),
            _p("citizen",          "Citizen",          "client"),
            _p("business_entity",  "Business Entity",  "client"),
            _p("partner_agency",   "Partner Agency",   "contact"),
            _t("inspection",       "Inspection"),
            _t("permit_processing","Permit Processing"),
            _t("public_hearing",   "Public Hearing"),
            _t("compliance_review","Compliance Review"),
            _t("report_filing",    "Report Filing"),
            _e("department",       "Department",       "government"),
            _e("agency",           "Agency",           "government"),
            _e("municipality",     "Municipality",     "government"),
        ],
        "workflows": [
            {
                "name": "New Application Received",
                "description": "Creates a review task when a new applicant is registered",
                "trigger": {"type": "entity_created", "entity_type": "person"},
                "steps": [{"type": "create_task", "label": "Application review",
                           "params": {"title": "Review new application and assign to officer",
                                      "priority": "normal"}}],
            },
            {
                "name": "Weekly Compliance Check",
                "description": "Weekly reminder to review pending compliance submissions",
                "trigger": {"type": "schedule", "schedule_interval": "weekly"},
                "steps": [{"type": "send_alert", "label": "Compliance alert",
                           "params": {"message": "Review pending permits, inspections, and compliance submissions"}}],
            },
        ],
    },

    "commercial": {
        "taxonomy": [
            _p("account_manager",    "Account Manager",    "staff"),
            _p("sales_rep",          "Sales Representative","staff"),
            _p("operations_manager", "Operations Manager", "staff"),
            _p("support_agent",      "Support Agent",      "staff"),
            _p("client",             "Client",             "client"),
            _p("prospect",           "Prospect",           "client"),
            _p("vendor",             "Vendor",             "contact"),
            _p("partner",            "Partner",            "contact"),
            _t("sales_call",         "Sales Call"),
            _t("proposal",           "Proposal"),
            _t("contract_review",    "Contract Review"),
            _t("invoice_follow_up",  "Invoice Follow-up"),
            _t("support_ticket",     "Support Ticket"),
            _e("client_company",     "Client Company",     "commercial"),
            _e("partner_org",        "Partner Organisation","commercial"),
            _e("branch",             "Branch",             "commercial"),
        ],
        "workflows": [
            {
                "name": "New Client Onboarding",
                "description": "Creates an onboarding task when a new client is added",
                "trigger": {"type": "entity_created", "entity_type": "person",
                            "condition": {"person_type": "client"}},
                "steps": [{"type": "create_task", "label": "Onboarding call",
                           "params": {"title": "Schedule onboarding call with new client",
                                      "priority": "high"}}],
            },
            {
                "name": "Weekly Revenue Review",
                "description": "Weekly reminder to review revenue and outstanding invoices",
                "trigger": {"type": "schedule", "schedule_interval": "weekly"},
                "steps": [{"type": "send_alert", "label": "Revenue review alert",
                           "params": {"message": "Review this week's transactions and outstanding invoices"}}],
            },
        ],
    },
}

# All unknown types fall back to commercial defaults
_TEMPLATES["default"] = _TEMPLATES["commercial"]


# ── Industry metadata ──────────────────────────────────────────────────────────

_INDUSTRY_META: list[dict] = [
    {
        "id": "healthcare",
        "label": "Healthcare & Care",
        "icon": "🏥",
        "description": "Clinics, nursing homes, pharmacies, home healthcare",
        "example_subtypes": ["clinic", "pharmacy", "hospital", "nursing_home"],
        "recommended_connectors": [
            {"id": "google_sheets",    "name": "Google Sheets",    "reason": "Export patient records and care logs"},
            {"id": "quickbooks_online","name": "QuickBooks Online","reason": "Sync billing and invoices"},
            {"id": "slack",            "name": "Slack",            "reason": "Staff alerts and care updates"},
        ],
        "recommended_agents": [
            {"name": "RetentionAgent",   "description": "Detects patients at risk of disengaging from care"},
            {"name": "OnboardingAgent",  "description": "Automates new patient intake tasks"},
            {"name": "ComplianceAgent",  "description": "Monitors care documentation compliance"},
        ],
    },
    {
        "id": "education",
        "label": "Education & Training",
        "icon": "🎓",
        "description": "Schools, universities, training centres, childcare",
        "example_subtypes": ["school", "university", "training_center", "childcare"],
        "recommended_connectors": [
            {"id": "google_sheets", "name": "Google Sheets", "reason": "Student records and attendance export"},
            {"id": "slack",         "name": "Slack",         "reason": "Staff and parent notifications"},
        ],
        "recommended_agents": [
            {"name": "RetentionAgent",  "description": "Flags students with declining engagement"},
            {"name": "OnboardingAgent", "description": "Creates enrolment tasks for new students"},
        ],
    },
    {
        "id": "nonprofit",
        "label": "Non-Profit & NGO",
        "icon": "🤝",
        "description": "NGOs, charities, faith organisations, cooperatives",
        "example_subtypes": ["ngo", "charity", "church", "cooperative"],
        "recommended_connectors": [
            {"id": "google_sheets",    "name": "Google Sheets",    "reason": "Donor and beneficiary data exports"},
            {"id": "quickbooks_online","name": "QuickBooks Online","reason": "Grant and donation accounting"},
            {"id": "slack",            "name": "Slack",            "reason": "Field team coordination"},
        ],
        "recommended_agents": [
            {"name": "RetentionAgent",   "description": "Flags lapsing donors and beneficiaries"},
            {"name": "OnboardingAgent",  "description": "Creates intake tasks for new beneficiaries"},
            {"name": "ComplianceAgent",  "description": "Tracks reporting deadlines and compliance"},
        ],
    },
    {
        "id": "agriculture",
        "label": "Agriculture & Farming",
        "icon": "🌾",
        "description": "Crop farms, livestock, aquaculture, cooperatives",
        "example_subtypes": ["farm", "livestock_farm", "crop_farm", "cooperative"],
        "recommended_connectors": [
            {"id": "google_sheets",   "name": "Google Sheets",   "reason": "Farm data and harvest logs"},
            {"id": "outbound_webhook","name": "Custom Webhook",  "reason": "Connect to field sensors or ERP"},
        ],
        "recommended_agents": [
            {"name": "InventoryAgent", "description": "Monitors stock levels and triggers reorder tasks"},
            {"name": "RevenueAgent",   "description": "Tracks sales and flags payment gaps"},
        ],
    },
    {
        "id": "retail",
        "label": "Retail & Hospitality",
        "icon": "🛒",
        "description": "Retail stores, restaurants, hotels, food & beverage",
        "example_subtypes": ["retail", "restaurant", "hotel", "food_beverage"],
        "recommended_connectors": [
            {"id": "quickbooks_online","name": "QuickBooks Online","reason": "Sync sales invoices automatically"},
            {"id": "xero",            "name": "Xero",             "reason": "Accounting and VAT returns"},
            {"id": "google_sheets",   "name": "Google Sheets",    "reason": "Product and sales reporting"},
            {"id": "slack",           "name": "Slack",            "reason": "Low-stock and order alerts"},
        ],
        "recommended_agents": [
            {"name": "InventoryAgent", "description": "Detects low stock and creates replenishment tasks"},
            {"name": "RevenueAgent",   "description": "Monitors daily sales and flags anomalies"},
            {"name": "RetentionAgent", "description": "Identifies at-risk customers before they churn"},
        ],
    },
    {
        "id": "government",
        "label": "Government & Public Sector",
        "icon": "🏛️",
        "description": "Municipalities, departments, agencies, public services",
        "example_subtypes": ["government", "municipal", "agency", "department"],
        "recommended_connectors": [
            {"id": "google_sheets",   "name": "Google Sheets",  "reason": "Case and permit data exports"},
            {"id": "outbound_webhook","name": "Custom Webhook", "reason": "Integrate with government portals"},
        ],
        "recommended_agents": [
            {"name": "ComplianceAgent",  "description": "Tracks regulatory deadlines and submissions"},
            {"name": "OperationsAgent",  "description": "Monitors case backlogs and service delivery"},
        ],
    },
    {
        "id": "commercial",
        "label": "Business & Professional Services",
        "icon": "💼",
        "description": "Consulting, finance, technology, logistics, manufacturing",
        "example_subtypes": ["consulting", "technology", "finance", "manufacturing"],
        "recommended_connectors": [
            {"id": "quickbooks_online","name": "QuickBooks Online","reason": "Invoice and revenue sync"},
            {"id": "xero",            "name": "Xero",             "reason": "Accounting integration"},
            {"id": "google_sheets",   "name": "Google Sheets",    "reason": "Client and pipeline exports"},
            {"id": "slack",           "name": "Slack",            "reason": "Deal and task notifications"},
        ],
        "recommended_agents": [
            {"name": "RetentionAgent",  "description": "Flags at-risk clients before they churn"},
            {"name": "RevenueAgent",    "description": "Monitors pipeline and flags payment gaps"},
            {"name": "OperationsAgent", "description": "Tracks task completion and delivery SLAs"},
        ],
    },
]

_INDUSTRY_META_MAP: dict[str, dict] = {m["id"]: m for m in _INDUSTRY_META}

# ── Request model ──────────────────────────────────────────────────────────────
class ProvisionRequest(BaseModel):
    company_id:           str
    enterprise_type:      str
    enterprise_name:      Optional[str] = ""
    steps_completed:      int = 1       # 1-6; used to compute AI readiness score
    people_added:         int = 0
    products_added:       int = 0
    tasks_created:        int = 0
    invites_sent:         int = 0


def _compute_ai_readiness(
    taxonomy_count: int,
    workflows_created: int,
    steps_completed: int,
    people_added: int,
    products_added: int,
    tasks_created: int,
    invites_sent: int,
) -> int:
    """Return an AI Readiness Score in the range 0–100."""
    score = 15  # base: workspace created
    if taxonomy_count >= 5:  score += 15
    if taxonomy_count >= 10: score += 5
    if workflows_created >= 1: score += 10
    if workflows_created >= 2: score += 5
    if people_added > 0:    score += 10
    if products_added > 0:  score += 10
    if tasks_created > 0:   score += 5
    if invites_sent > 0:    score += 5
    # Step completion bonus (each optional step completed = more data richness)
    score += min(steps_completed * 3, 15)
    return min(score, 100)


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.get("/industries")
def list_industries():
    """Return all industry clusters with labels, icons, descriptions, and recommendations."""
    return {"industries": _INDUSTRY_META}


@router.post("/provision", status_code=201)
def provision_tenant(req: ProvisionRequest):
    """
    Provision a new tenant with:
      1. Default Workflows (created directly into _WORKFLOWS store)
      2. Taxonomy template (returned as JSON for frontend to create as MasterDataOption)

    Called once from the onboarding wizard after Enterprise creation.
    Fire-and-forget — frontend ignores errors.
    """
    cluster  = _CLUSTER.get(req.enterprise_type.lower(), "default")
    template = _TEMPLATES.get(cluster, _TEMPLATES["default"])

    # ── Create workflows ───────────────────────────────────────────────────────
    try:
        from workflows.routes import _WORKFLOWS
        workflows_created = []
        now = _now_iso()

        for wf_def in template.get("workflows", []):
            wf_id = str(uuid.uuid4())
            # Inject step_ids if missing
            steps = []
            for step in wf_def.get("steps", []):
                s = dict(step)
                if "step_id" not in s:
                    s["step_id"] = str(uuid.uuid4())[:8]
                s.setdefault("stop_on_error", False)
                steps.append(s)

            record = {
                "id":          wf_id,
                "company_id":  req.company_id,
                "name":        wf_def["name"],
                "description": wf_def.get("description", "Auto-created during workspace setup"),
                "trigger":     wf_def["trigger"],
                "steps":       steps,
                "is_active":   True,
                "created_at":  now,
                "updated_at":  now,
                "run_count":   0,
                "last_run_at": None,
            }
            _WORKFLOWS[wf_id] = record
            workflows_created.append(wf_def["name"])

        logger.info(
            "onboarding: provisioned company=%s type=%s cluster=%s workflows=%d taxonomy=%d",
            req.company_id, req.enterprise_type, cluster,
            len(workflows_created), len(template.get("taxonomy", [])),
        )
    except Exception as e:
        logger.warning("onboarding: workflow creation failed — %s", e)
        workflows_created = []

    taxonomy_count = len(template.get("taxonomy", []))
    ai_readiness   = _compute_ai_readiness(
        taxonomy_count=taxonomy_count,
        workflows_created=len(workflows_created),
        steps_completed=req.steps_completed,
        people_added=req.people_added,
        products_added=req.products_added,
        tasks_created=req.tasks_created,
        invites_sent=req.invites_sent,
    )

    industry_meta = _INDUSTRY_META_MAP.get(cluster, _INDUSTRY_META_MAP.get("commercial", {}))

    return {
        "status":                  "provisioned",
        "company_id":              req.company_id,
        "enterprise_type":         req.enterprise_type,
        "cluster":                 cluster,
        "workflows_created":       len(workflows_created),
        "workflow_names":          workflows_created,
        "taxonomy":                template.get("taxonomy", []),
        "taxonomy_count":          taxonomy_count,
        "ai_readiness_score":      ai_readiness,
        "recommended_connectors":  industry_meta.get("recommended_connectors", []),
        "recommended_agents":      industry_meta.get("recommended_agents", []),
    }
