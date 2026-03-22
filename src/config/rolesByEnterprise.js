import { getCategoryFromType } from "@/config/enterpriseTerminology";

const ROLES_BY_CATEGORY = {
  healthcare: {
    employee: [
      "Registered Nurse", "Licensed Practical Nurse",
      "Certified Nursing Assistant", "Personal Care Aide",
      "Companion Caregiver", "Medication Technician",
      "Physical Therapist", "Occupational Therapist",
      "Social Worker", "Care Coordinator",
      "Director of Care", "Administrator",
    ],
    client: ["Care Recipient", "Resident", "Day Client", "Respite Client"],
  },
  education: {
    employee: [
      "Teacher", "Teaching Assistant", "Principal",
      "Counselor", "Administrator", "Librarian",
      "Coach", "Special Education Teacher",
    ],
    client: ["Student", "Pupil", "Learner", "Trainee"],
  },
  community: {
    employee: [
      "Pastor", "Elder", "Deacon", "Youth Leader",
      "Worship Leader", "Volunteer Coordinator",
      "Group Leader", "Outreach Director",
    ],
    client: ["Member", "Attendee", "Visitor", "Participant"],
  },
  agriculture: {
    employee: [
      "Farm Manager", "Farm Hand", "Veterinarian",
      "Livestock Manager", "Crop Manager",
      "Equipment Operator", "Seasonal Worker",
    ],
    client: ["Cattle", "Poultry", "Swine", "Sheep", "Goat", "Horse", "Crop Plot", "Aquaculture Unit"],
  },
  business: {
    employee: [
      "Manager", "Sales Representative", "Accountant",
      "Customer Service", "Technician", "Driver",
      "Marketing Manager", "HR Manager",
    ],
    client: ["Customer", "Client", "Account", "Partner"],
  },
  nonprofit: {
    employee: [
      "Program Manager", "Volunteer", "Field Officer",
      "Fundraiser", "Communications Lead", "Director",
    ],
    client: ["Beneficiary", "Program Participant", "Community Member"],
  },
  government: {
    employee: [
      "Officer", "Inspector", "Administrator",
      "Policy Analyst", "Case Worker", "Director",
    ],
    client: ["Citizen", "Constituent", "Applicant", "Licensee"],
  },
  other: {
    employee: ["Manager", "Staff", "Volunteer", "Coordinator"],
    client: ["Member", "Participant", "Beneficiary"],
  },
};

export function getRolesByType(enterpriseType) {
  const category = getCategoryFromType(enterpriseType);
  return ROLES_BY_CATEGORY[category] || ROLES_BY_CATEGORY.other;
}

export default ROLES_BY_CATEGORY;