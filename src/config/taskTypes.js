import { getCategoryFromType } from "@/config/enterpriseTerminology";

const TASK_TYPES_BY_CATEGORY = {
  healthcare: [
    { value: "medication_admin",  label: "Medication Administration" },
    { value: "personal_care",     label: "Personal Care" },
    { value: "skilled_nursing",   label: "Skilled Nursing Visit" },
    { value: "vitals_check",      label: "Vitals Check" },
    { value: "wound_care",        label: "Wound Care" },
    { value: "companionship",     label: "Companionship Visit" },
    { value: "other",             label: "Other" },
  ],
  education: [
    { value: "lesson",            label: "Lesson / Class" },
    { value: "assessment",        label: "Assessment / Test" },
    { value: "parent_meeting",    label: "Parent Meeting" },
    { value: "tutoring",          label: "Tutoring Session" },
    { value: "field_trip",        label: "Field Trip" },
    { value: "other",             label: "Other" },
  ],
  community: [
    { value: "meeting",           label: "Meeting / Gathering" },
    { value: "study_session",     label: "Study Session" },
    { value: "outreach",          label: "Outreach Activity" },
    { value: "service_project",   label: "Service Project" },
    { value: "counseling",        label: "Counseling / Support" },
    { value: "other",             label: "Other" },
  ],
  agriculture: [
    { value: "feeding",           label: "Feeding Round" },
    { value: "health_check",      label: "Health Check" },
    { value: "vaccination",       label: "Vaccination" },
    { value: "cleaning",          label: "Cleaning / Maintenance" },
    { value: "harvest",           label: "Harvest / Collection" },
    { value: "other",             label: "Other" },
  ],
  business: [
    { value: "client_meeting",    label: "Client Meeting" },
    { value: "sales_call",        label: "Sales Call" },
    { value: "delivery",          label: "Delivery" },
    { value: "support",           label: "Customer Support" },
    { value: "review",            label: "Review / Audit" },
    { value: "other",             label: "Other" },
  ],
  nonprofit: [
    { value: "outreach",          label: "Outreach" },
    { value: "program_delivery",  label: "Program Delivery" },
    { value: "fundraising",       label: "Fundraising Activity" },
    { value: "volunteer_shift",   label: "Volunteer Shift" },
    { value: "other",             label: "Other" },
  ],
  government: [
    { value: "case_review",       label: "Case Review" },
    { value: "inspection",        label: "Inspection" },
    { value: "public_meeting",    label: "Public Meeting" },
    { value: "compliance",        label: "Compliance Check" },
    { value: "other",             label: "Other" },
  ],
  other: [
    { value: "meeting",           label: "Meeting" },
    { value: "activity",          label: "Activity" },
    { value: "check_in",          label: "Check In" },
    { value: "review",            label: "Review" },
    { value: "other",             label: "Other" },
  ],
};

export function getTaskTypes(enterpriseType) {
  const category = getCategoryFromType(enterpriseType);
  return TASK_TYPES_BY_CATEGORY[category] || TASK_TYPES_BY_CATEGORY.other;
}

export default TASK_TYPES_BY_CATEGORY;