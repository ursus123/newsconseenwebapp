export const APP_REGISTRY = [
  // HR & PEOPLE
  { id: "clockinout", name: "Clock In/Out", emoji: "🕐", description: "Staff attendance tracking with timestamps", category: "HR", route: "ClockInOut", color: "blue", roles: "all", plan: "starter", exists: true },
  { id: "leaverequest", name: "Leave Request", emoji: "🏖️", description: "Submit and approve annual, sick and emergency leave", category: "HR", route: "LeaveRequest", color: "cyan", roles: "all", plan: "starter", exists: false },
  { id: "staffschedule", name: "Staff Scheduler", emoji: "📅", description: "Weekly shift planner and rota management", category: "HR", route: "StaffSchedule", color: "indigo", roles: "all", plan: "professional", exists: true },
  { id: "expenseclaim", name: "Expense Claim", emoji: "💸", description: "Submit and approve staff expense reimbursements", category: "HR", route: "ExpenseClaim", color: "emerald", roles: "all", plan: "starter", exists: false },
  { id: "performancereview", name: "Performance Review", emoji: "⭐", description: "Quarterly staff appraisal forms and goal tracking", category: "HR", route: "PerformanceReview", color: "amber", roles: "admin_only", plan: "professional", exists: false },
  { id: "trainingtracker", name: "Training Tracker", emoji: "🎓", description: "Log completed training and track certification expiry dates", category: "HR", route: "TrainingTracker", color: "violet", roles: "all", plan: "starter", exists: false },

  // INVENTORY & ASSETS
  { id: "barcodescanner", name: "Barcode Scanner", emoji: "📷", description: "Scan items in and out of inventory using camera or USB scanner", category: "Inventory", route: "BarcodeScanner", color: "slate", roles: "all", plan: "starter", exists: true, isNew: true },
  { id: "stockcounter", name: "Stock Counter", emoji: "🔢", description: "Count and verify physical inventory against system records", category: "Inventory", route: "StockCounter", color: "orange", roles: "all", plan: "starter", exists: true, isNew: true },
  { id: "purchaseorder", name: "Purchase Order", emoji: "🛒", description: "Request and approve purchases with automatic transaction creation", category: "Inventory", route: "PurchaseOrder", color: "blue", roles: "all", plan: "starter", exists: false },
  { id: "assetregister", name: "Asset Register", emoji: "🏷️", description: "Track equipment serial numbers, location and maintenance history", category: "Inventory", route: "AssetRegister", color: "slate", roles: "all", plan: "professional", exists: false },
  { id: "goodsreceived", name: "Goods Received", emoji: "📬", description: "Confirm delivery of ordered goods and update stock automatically", category: "Inventory", route: "GoodsReceived", color: "green", roles: "all", plan: "starter", exists: false },
  { id: "assetmaintenance", name: "Asset Maintenance", emoji: "🔧", description: "Schedule and log equipment servicing and repair history", category: "Inventory", route: "AssetMaintenance", color: "amber", roles: "all", plan: "professional", exists: false },

  // HEALTHCARE
  { id: "medadmin", name: "Medication Administration", emoji: "💊", description: "Record medication doses given, refused or missed per patient", category: "Healthcare", route: "MedAdmin", color: "cyan", roles: "all", plan: "starter", exists: true },
  { id: "incidentreport", name: "Incident Report", emoji: "🚨", description: "Log accidents, near-misses, falls and complaints", category: "Healthcare", route: "IncidentReport", color: "red", roles: "all", plan: "starter", exists: false },
  { id: "careplan", name: "Care Plan", emoji: "📋", description: "Document and manage individual care plans per client", category: "Healthcare", route: "CarePlan", color: "teal", roles: "all", plan: "professional", exists: false },
  { id: "temperaturelog", name: "Temperature Log", emoji: "🌡️", description: "Record fridge and freezer temperatures for compliance", category: "Healthcare", route: "TemperatureLog", color: "blue", roles: "all", plan: "starter", exists: false },
  { id: "fluidintakelog", name: "Fluid Intake Log", emoji: "💧", description: "Monitor daily fluid intake per client or patient", category: "Healthcare", route: "FluidIntakeLog", color: "cyan", roles: "all", plan: "professional", exists: false },
  { id: "woundcarelog", name: "Wound Care Log", emoji: "🩹", description: "Document wound treatment progress and healing records", category: "Healthcare", route: "WoundCareLog", color: "rose", roles: "all", plan: "professional", exists: false },

  // FIELD & OPERATIONS
  { id: "visitorlog", name: "Visitor Log", emoji: "🪪", description: "Sign guests in and out with automatic timestamps", category: "Field", route: "VisitorLog", color: "purple", roles: "all", plan: "starter", exists: false },
  { id: "deliverytracker", name: "Delivery Tracker", emoji: "🚚", description: "Track outgoing deliveries and confirm receipts", category: "Field", route: "DeliveryTracker", color: "orange", roles: "all", plan: "starter", exists: false },
  { id: "vehiclelog", name: "Vehicle Log", emoji: "🚗", description: "Record mileage, fuel usage and driver per trip", category: "Field", route: "VehicleLog", color: "slate", roles: "all", plan: "professional", exists: false },
  { id: "fieldvisitreport", name: "Field Visit Report", emoji: "📝", description: "Staff submit structured reports after client site visits", category: "Field", route: "FieldVisitReport", color: "indigo", roles: "all", plan: "starter", exists: false },
  { id: "shifthandover", name: "Shift Handover", emoji: "🔄", description: "End-of-shift notes and briefing for incoming staff", category: "Field", route: "ShiftHandover", color: "amber", roles: "all", plan: "starter", exists: false },
  { id: "maintenancerequest", name: "Maintenance Request", emoji: "🛠️", description: "Report broken equipment or facilities issues for repair", category: "Field", route: "MaintenanceRequest", color: "orange", roles: "all", plan: "starter", exists: false },

  // FINANCE & ADMIN
  { id: "pettycashlog", name: "Petty Cash Log", emoji: "💰", description: "Track small cash payments and maintain petty cash balance", category: "Finance", route: "PettyCashLog", color: "emerald", roles: "admin_only", plan: "starter", exists: false },
  { id: "receiptscanner", name: "Receipt Scanner", emoji: "🧾", description: "Photograph and log receipts directly to transactions", category: "Finance", route: "ReceiptScanner", color: "green", roles: "all", plan: "starter", exists: false },
  { id: "budgettracker", name: "Budget Tracker", emoji: "📊", description: "Monitor spending vs approved budget per department", category: "Finance", route: "BudgetTracker", color: "blue", roles: "admin_only", plan: "professional", exists: false },
  { id: "donationtracker", name: "Donation Tracker", emoji: "🤝", description: "Log and acknowledge donations received by your organization", category: "Finance", route: "DonationTracker", color: "pink", roles: "admin_only", plan: "starter", exists: false },

  // COMPLIANCE & QUALITY
  { id: "inspectionchecklist", name: "Inspection Checklist", emoji: "✅", description: "Daily and weekly facility inspection forms with sign-off", category: "Compliance", route: "InspectionChecklist", color: "emerald", roles: "all", plan: "starter", exists: false },
  { id: "licensetracker", name: "License Tracker", emoji: "📜", description: "Monitor business and professional license expiry dates", category: "Compliance", route: "LicenseTracker", color: "amber", roles: "admin_only", plan: "starter", exists: false },
  { id: "documentexpiry", name: "Document Expiry", emoji: "📁", description: "Alert when contracts, certificates and documents are expiring", category: "Compliance", route: "DocumentExpiry", color: "red", roles: "admin_only", plan: "starter", exists: false },
  { id: "cleaningschedule", name: "Cleaning Schedule", emoji: "🧹", description: "Assign and confirm daily cleaning tasks across all areas", category: "Compliance", route: "CleaningSchedule", color: "cyan", roles: "all", plan: "starter", exists: false },

  // EDUCATION
  { id: "attendanceregister", name: "Attendance Register", emoji: "📓", description: "Mark student and class attendance with daily reports", category: "Education", route: "AttendanceRegister", color: "blue", roles: "all", plan: "starter", exists: true, isNew: true },
  { id: "feecollection", name: "Fee Collection", emoji: "💳", description: "Track school fee payments and outstanding balances per student", category: "Education", route: "FeeCollection", color: "emerald", roles: "admin_only", plan: "starter", exists: false, educationOnly: true },
  { id: "librarylog", name: "Library Log", emoji: "📚", description: "Book borrowing and return tracker with overdue alerts", category: "Education", route: "LibraryLog", color: "amber", roles: "all", plan: "starter", exists: false, educationOnly: true },
];

export const CATEGORIES = ["All", "HR", "Inventory", "Healthcare", "Field", "Finance", "Compliance", "Education"];

// Apps recommended by enterprise category
export const APPS_BY_ENTERPRISE_CATEGORY = {
  healthcare:  ["medadmin", "staffschedule", "clockinout", "barcodescanner", "stockcounter", "incidentreport", "careplan"],
  education:   ["attendanceregister", "feecollection", "staffschedule", "clockinout", "stockcounter", "librarylog"],
  community:   ["attendanceregister", "donationtracker", "staffschedule", "visitorlog", "maintenancerequest"],
  agriculture: ["stockcounter", "barcodescanner", "inspectionchecklist", "vehiclelog", "maintenancerequest"],
  business:    ["clockinout", "staffschedule", "stockcounter", "barcodescanner", "deliverytracker", "receiptscanner"],
  nonprofit:   ["donationtracker", "attendanceregister", "budgettracker", "fieldvisitreport", "staffschedule"],
  government:  ["inspectionchecklist", "licensetracker", "documentexpiry", "staffschedule", "clockinout"],
  other:       ["clockinout", "staffschedule", "stockcounter", "barcodescanner"],
};

export const PLAN_ORDER = { starter: 0, professional: 1, consultant: 2 };

export const COLOR_MAP = {
  blue: { bg: "bg-blue-100", text: "text-blue-700", btn: "bg-blue-600 hover:bg-blue-700", icon: "bg-blue-50 border-blue-200" },
  cyan: { bg: "bg-cyan-100", text: "text-cyan-700", btn: "bg-cyan-600 hover:bg-cyan-700", icon: "bg-cyan-50 border-cyan-200" },
  indigo: { bg: "bg-indigo-100", text: "text-indigo-700", btn: "bg-indigo-600 hover:bg-indigo-700", icon: "bg-indigo-50 border-indigo-200" },
  emerald: { bg: "bg-emerald-100", text: "text-emerald-700", btn: "bg-emerald-600 hover:bg-emerald-700", icon: "bg-emerald-50 border-emerald-200" },
  amber: { bg: "bg-amber-100", text: "text-amber-700", btn: "bg-amber-600 hover:bg-amber-700", icon: "bg-amber-50 border-amber-200" },
  violet: { bg: "bg-violet-100", text: "text-violet-700", btn: "bg-violet-600 hover:bg-violet-700", icon: "bg-violet-50 border-violet-200" },
  slate: { bg: "bg-slate-100", text: "text-slate-700", btn: "bg-slate-700 hover:bg-slate-800", icon: "bg-slate-50 border-slate-200" },
  orange: { bg: "bg-orange-100", text: "text-orange-700", btn: "bg-orange-600 hover:bg-orange-700", icon: "bg-orange-50 border-orange-200" },
  green: { bg: "bg-green-100", text: "text-green-700", btn: "bg-green-600 hover:bg-green-700", icon: "bg-green-50 border-green-200" },
  teal: { bg: "bg-teal-100", text: "text-teal-700", btn: "bg-teal-600 hover:bg-teal-700", icon: "bg-teal-50 border-teal-200" },
  red: { bg: "bg-red-100", text: "text-red-700", btn: "bg-red-600 hover:bg-red-700", icon: "bg-red-50 border-red-200" },
  rose: { bg: "bg-rose-100", text: "text-rose-700", btn: "bg-rose-600 hover:bg-rose-700", icon: "bg-rose-50 border-rose-200" },
  purple: { bg: "bg-purple-100", text: "text-purple-700", btn: "bg-purple-600 hover:bg-purple-700", icon: "bg-purple-50 border-purple-200" },
  pink: { bg: "bg-pink-100", text: "text-pink-700", btn: "bg-pink-600 hover:bg-pink-700", icon: "bg-pink-50 border-pink-200" },
};