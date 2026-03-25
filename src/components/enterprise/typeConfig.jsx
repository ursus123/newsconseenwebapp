export const TYPE_CONFIG = {
  // Healthcare
  healthcare:       { color: "bg-blue-50 text-blue-700",     label: "Healthcare",         icon: "🏥" },
  home_health:      { color: "bg-blue-50 text-blue-700",     label: "Home Health",         icon: "🏥" },
  home_healthcare:  { color: "bg-blue-50 text-blue-700",     label: "Home Healthcare",     icon: "🏥" },
  residential_care: { color: "bg-blue-50 text-blue-700",     label: "Residential Care",    icon: "🏠" },
  clinic:           { color: "bg-cyan-50 text-cyan-700",     label: "Clinic",              icon: "🩺" },
  pharmacy:         { color: "bg-teal-50 text-teal-700",     label: "Pharmacy",            icon: "💊" },
  nursing_home:     { color: "bg-blue-50 text-blue-700",     label: "Nursing Home",        icon: "🏥" },
  hospital:         { color: "bg-blue-50 text-blue-700",     label: "Hospital",            icon: "🏥" },
  mental_health:    { color: "bg-indigo-50 text-indigo-700", label: "Mental Health",       icon: "🧠" },
  dental:           { color: "bg-cyan-50 text-cyan-700",     label: "Dental",              icon: "🦷" },
  veterinary:       { color: "bg-lime-50 text-lime-700",     label: "Veterinary",          icon: "🐾" },
  // Education
  education:        { color: "bg-emerald-50 text-emerald-700", label: "Education",         icon: "🏫" },
  school:           { color: "bg-emerald-50 text-emerald-700", label: "School",             icon: "🏫" },
  university:       { color: "bg-emerald-50 text-emerald-700", label: "University",         icon: "🎓" },
  childcare:        { color: "bg-green-50 text-green-700",   label: "Childcare",           icon: "👶" },
  tutoring:         { color: "bg-teal-50 text-teal-700",     label: "Tutoring",            icon: "📚" },
  training_center:  { color: "bg-emerald-50 text-emerald-700", label: "Training Center",   icon: "📋" },
  // Community / Faith
  community:        { color: "bg-violet-50 text-violet-700", label: "Community",           icon: "🤝" },
  church:           { color: "bg-purple-50 text-purple-700", label: "Church",              icon: "⛪" },
  mosque:           { color: "bg-purple-50 text-purple-700", label: "Mosque",              icon: "🕌" },
  temple:           { color: "bg-purple-50 text-purple-700", label: "Temple",              icon: "🛕" },
  faith:            { color: "bg-purple-50 text-purple-700", label: "Faith Organization",  icon: "✝️" },
  ngo:              { color: "bg-violet-50 text-violet-700", label: "NGO",                 icon: "🌍" },
  nonprofit:        { color: "bg-violet-50 text-violet-700", label: "Nonprofit",           icon: "🤲" },
  charity:          { color: "bg-pink-50 text-pink-700",     label: "Charity",             icon: "❤️" },
  social_services:  { color: "bg-violet-50 text-violet-700", label: "Social Services",     icon: "🤝" },
  // Agriculture
  agriculture:      { color: "bg-lime-50 text-lime-700",     label: "Agriculture",         icon: "🌾" },
  farm:             { color: "bg-lime-50 text-lime-700",     label: "Farm",                icon: "🌾" },
  livestock_farm:   { color: "bg-lime-50 text-lime-700",     label: "Livestock Farm",      icon: "🐄" },
  crop_farm:        { color: "bg-green-50 text-green-700",   label: "Crop Farm",           icon: "🌽" },
  animal_barn:      { color: "bg-lime-50 text-lime-700",     label: "Animal Barn",         icon: "🏚️" },
  aquaculture:      { color: "bg-teal-50 text-teal-700",     label: "Aquaculture",         icon: "🐟" },
  ranch:            { color: "bg-amber-50 text-amber-700",   label: "Ranch",               icon: "🤠" },
  // Business
  retail:           { color: "bg-amber-50 text-amber-700",   label: "Retail",              icon: "🛍️" },
  consulting:       { color: "bg-cyan-50 text-cyan-700",     label: "Consulting",          icon: "💼" },
  restaurant:       { color: "bg-rose-50 text-rose-700",     label: "Restaurant",          icon: "🍽️" },
  food_beverage:    { color: "bg-rose-50 text-rose-700",     label: "Food & Beverage",     icon: "🍽️" },
  hotel:            { color: "bg-orange-50 text-orange-700", label: "Hotel",               icon: "🏨" },
  hospitality:      { color: "bg-orange-50 text-orange-700", label: "Hospitality",         icon: "🏨" },
  logistics:        { color: "bg-orange-50 text-orange-700", label: "Logistics",           icon: "🚚" },
  manufacturing:    { color: "bg-slate-100 text-slate-600",  label: "Manufacturing",       icon: "🏭" },
  technology:       { color: "bg-blue-50 text-blue-700",     label: "Technology",          icon: "💻" },
  professional:     { color: "bg-indigo-50 text-indigo-700", label: "Professional",        icon: "👔" },
  coworking:        { color: "bg-slate-100 text-slate-600",  label: "Coworking",           icon: "🖥️" },
  gym:              { color: "bg-orange-50 text-orange-700", label: "Gym / Fitness",       icon: "🏋️" },
  finance:          { color: "bg-emerald-50 text-emerald-700", label: "Finance",           icon: "💰" },
  construction:     { color: "bg-amber-50 text-amber-700",   label: "Construction",        icon: "🏗️" },
  media:            { color: "bg-pink-50 text-pink-700",     label: "Media",               icon: "📺" },
  // Government
  government:       { color: "bg-slate-100 text-slate-700",  label: "Government",          icon: "🏛️" },
  municipal:        { color: "bg-slate-100 text-slate-700",  label: "Municipal",           icon: "🏙️" },
  public_sector:    { color: "bg-slate-100 text-slate-700",  label: "Public Sector",       icon: "📋" },
  // Default
  other:            { color: "bg-slate-100 text-slate-500",  label: "Other",               icon: "📌" },
};

export function getTypeConfig(type) {
  return TYPE_CONFIG[type] || TYPE_CONFIG.other;
}

export const typeColor = (type) => getTypeConfig(type).color;
export const typeLabel = (type) => getTypeConfig(type).label;
export const typeIcon  = (type) => getTypeConfig(type).icon;

export const ENTERPRISE_TYPE_GROUPS = [
  {
    group: "🏥 Healthcare",
    types: [
      { value: "home_healthcare",  label: "Home Healthcare" },
      { value: "residential_care", label: "Residential Care" },
      { value: "clinic",           label: "Clinic / Medical Center" },
      { value: "pharmacy",         label: "Pharmacy" },
      { value: "nursing_home",     label: "Nursing Home" },
      { value: "hospital",         label: "Hospital" },
      { value: "mental_health",    label: "Mental Health Services" },
      { value: "dental",           label: "Dental Practice" },
      { value: "veterinary",       label: "Veterinary Clinic" },
    ],
  },
  {
    group: "🏫 Education",
    types: [
      { value: "school",           label: "School / Academy" },
      { value: "university",       label: "University / College" },
      { value: "childcare",        label: "Childcare / Daycare" },
      { value: "tutoring",         label: "Tutoring Center" },
      { value: "training_center",  label: "Training / Vocational" },
    ],
  },
  {
    group: "⛪ Community & Faith",
    types: [
      { value: "church",           label: "Church / Christian" },
      { value: "mosque",           label: "Mosque / Islamic Center" },
      { value: "temple",           label: "Temple / Place of Worship" },
      { value: "community",        label: "Community Center" },
      { value: "ngo",              label: "NGO / Nonprofit Program" },
      { value: "nonprofit",        label: "Nonprofit Organization" },
      { value: "charity",          label: "Charity / Foundation" },
      { value: "social_services",  label: "Social Services" },
    ],
  },
  {
    group: "🌾 Agriculture",
    types: [
      { value: "livestock_farm",   label: "Livestock Farm" },
      { value: "crop_farm",        label: "Crop Farm / Plantation" },
      { value: "animal_barn",      label: "Animal Barn / Ranch" },
      { value: "aquaculture",      label: "Aquaculture / Fish Farm" },
      { value: "agriculture",      label: "General Agriculture" },
    ],
  },
  {
    group: "💼 Business",
    types: [
      { value: "retail",           label: "Retail Store" },
      { value: "restaurant",       label: "Restaurant / Food Service" },
      { value: "hotel",            label: "Hotel / Hospitality" },
      { value: "consulting",       label: "Consulting" },
      { value: "technology",       label: "Technology" },
      { value: "logistics",        label: "Logistics / Transport" },
      { value: "manufacturing",    label: "Manufacturing" },
      { value: "finance",          label: "Finance" },
      { value: "gym",              label: "Gym / Fitness Center" },
      { value: "coworking",        label: "Coworking Space" },
      { value: "professional",     label: "Professional Services" },
      { value: "media",            label: "Media" },
      { value: "construction",     label: "Construction" },
    ],
  },
  {
    group: "🏛️ Government",
    types: [
      { value: "government",       label: "Government Agency" },
      { value: "municipal",        label: "Municipal / Local Government" },
      { value: "public_sector",    label: "Public Sector" },
    ],
  },
  {
    group: "✨ Other",
    types: [
      { value: "other",            label: "Other / Custom" },
    ],
  },
];

// Sub-types per enterprise type
export const ENTERPRISE_SUB_TYPES = {
  school:           ["Class / Classroom", "Grade Level", "Department", "Campus", "Sports Team", "Club"],
  university:       ["Faculty", "Department", "Campus", "Research Lab", "Student Club", "Dormitory"],
  childcare:        ["Age Group", "Classroom", "Program"],
  tutoring:         ["Subject Group", "Session Group"],
  training_center:  ["Course / Module", "Cohort", "Department"],
  church:           ["Ministry", "Cell Group", "Youth Group", "Choir", "Department", "Campus"],
  mosque:           ["Circle / Halaqah", "Committee", "Youth Group", "Department"],
  temple:           ["Group", "Committee", "Department"],
  community:        ["Program", "Chapter", "Committee", "Working Group"],
  ngo:              ["Program", "Chapter", "Field Office", "Project Team"],
  nonprofit:        ["Program", "Chapter", "Committee", "Department"],
  charity:          ["Program", "Campaign", "Chapter"],
  social_services:  ["Case Unit", "Program", "Department"],
  hospital:         ["Ward", "Department", "Unit", "Clinic"],
  clinic:           ["Department", "Unit", "Location"],
  nursing_home:     ["Unit", "Wing", "Department"],
  residential_care: ["Unit", "Wing", "Floor", "Department"],
  home_healthcare:  ["Team", "Region", "Program"],
  mental_health:    ["Program", "Department", "Group"],
  livestock_farm:   ["Pen / Barn", "Herd Group", "Pasture", "Unit"],
  crop_farm:        ["Field", "Section", "Greenhouse", "Crop Group"],
  animal_barn:      ["Pen", "Section", "Animal Group"],
  agriculture:      ["Field", "Section", "Unit"],
  retail:           ["Branch", "Department", "Location"],
  restaurant:       ["Branch", "Department", "Kitchen"],
  hotel:            ["Floor", "Wing", "Department"],
  logistics:        ["Route", "Depot", "Team"],
  manufacturing:    ["Line", "Department", "Shift", "Unit"],
  technology:       ["Team", "Department", "Project Group"],
  finance:          ["Branch", "Department", "Team"],
  government:       ["Division", "Department", "Unit", "Branch"],
  municipal:        ["Division", "Department", "Ward"],
  public_sector:    ["Division", "Department", "Unit"],
};

export const OBJECTIVE_OPTIONS = {
  healthcare:       ["Improve client retention and care quality", "Optimize staffing and reduce care gaps", "Achieve medication compliance targets", "Grow client base and revenue"],
  home_healthcare:  ["Improve client retention and care quality", "Optimize staffing and reduce care gaps", "Achieve medication compliance targets", "Grow client base and revenue"],
  home_health:      ["Improve client retention and care quality", "Optimize staffing and reduce care gaps", "Achieve medication compliance targets", "Grow client base and revenue"],
  residential_care: ["Improve client retention and care quality", "Optimize staffing and reduce care gaps", "Achieve medication compliance targets", "Grow client base and revenue"],
  education:        ["Improve student outcomes and attendance", "Grow enrollment and retention", "Reduce administrative burden", "Expand program offerings"],
  school:           ["Improve student outcomes and attendance", "Grow enrollment and retention", "Reduce administrative burden", "Expand program offerings"],
  university:       ["Improve student outcomes and attendance", "Grow enrollment and retention", "Reduce administrative burden", "Expand program offerings"],
  childcare:        ["Improve student outcomes and attendance", "Grow enrollment and retention", "Reduce administrative burden", "Expand program offerings"],
  community:        ["Grow membership and engagement", "Increase program participation", "Strengthen community outreach", "Improve volunteer retention"],
  church:           ["Grow membership and engagement", "Increase program participation", "Strengthen community outreach", "Improve volunteer retention"],
  mosque:           ["Grow membership and engagement", "Increase program participation", "Strengthen community outreach", "Improve volunteer retention"],
  temple:           ["Grow membership and engagement", "Increase program participation", "Strengthen community outreach", "Improve volunteer retention"],
  nonprofit:        ["Grow membership and engagement", "Increase program participation", "Strengthen community outreach", "Improve volunteer retention"],
  agriculture:      ["Improve livestock health and yield", "Reduce feed and operational waste", "Increase sales and revenue", "Expand herd or crop capacity"],
  livestock_farm:   ["Improve livestock health and yield", "Reduce feed and operational waste", "Increase sales and revenue", "Expand herd or crop capacity"],
  crop_farm:        ["Improve livestock health and yield", "Reduce feed and operational waste", "Increase sales and revenue", "Expand herd or crop capacity"],
  animal_barn:      ["Improve livestock health and yield", "Reduce feed and operational waste", "Increase sales and revenue", "Expand herd or crop capacity"],
};