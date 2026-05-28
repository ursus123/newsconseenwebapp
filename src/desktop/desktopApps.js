import { canAccessPage } from "@/config/permissions";

const allRoles = ["super_admin", "admin", "teacher", "staff", "student"];
const opsRoles = ["super_admin", "admin", "teacher", "staff"];
const adminRoles = ["super_admin", "admin"];
const platformRoles = ["super_admin"];

function app(config) {
  return {
    industries: ["all"],
    roles: adminRoles,
    keywords: [],
    quickActions: [],
    isCore: false,
    isAgent: false,
    isAdmin: false,
    isCreateTarget: false,
    ...config,
    pageName: config.pageName || config.route.replace(/^\//, ""),
  };
}

export const DESKTOP_APPS = [
  app({ id: "companygraph", name: "Company Graph", icon: "🕸️", color: "#0f766e", route: "/CompanyGraphHome", category: "Operations", pageName: "CompanyGraphHome", description: "Operational graph home across people, enterprises, services, places, and work.", keywords: ["home", "graph", "operating picture"], roles: allRoles, isCore: true }),
  app({ id: "dashboard", name: "Dashboard", icon: "📊", color: "#ec4899", route: "/Dashboard", category: "Operations", description: "Live operating dashboard and KPI snapshot.", keywords: ["home", "kpi", "summary", "metrics"], roles: allRoles }),
  app({ id: "people", name: "People", icon: "👥", color: "#8b5cf6", route: "/People", category: "Operations", description: "People, staff, clients, members, learners, patients, and contacts.", keywords: ["person", "staff", "client", "student", "member"], entity: "Person", roles: opsRoles, isCore: true, isCreateTarget: true }),
  app({ id: "enterprises", name: "Enterprises", icon: "🏢", color: "#0ea5e9", route: "/Enterprises", category: "Operations", description: "Organizations, branches, suppliers, customers, departments, and partners.", keywords: ["organization", "branch", "supplier", "customer"], entity: "Enterprise", roles: adminRoles, isCore: true, isCreateTarget: true }),
  app({ id: "services", name: "Services", icon: "🛠️", color: "#059669", route: "/Services", category: "Operations", description: "Services, programs, offerings, procedures, and work packages.", keywords: ["program", "offering", "procedure"], entity: "Service", roles: adminRoles, isCore: true, isCreateTarget: true }),
  app({ id: "addresses", name: "Addresses", icon: "📍", color: "#14b8a6", route: "/Addresses", category: "Operations", description: "Locations, addresses, geocoding, and place records.", keywords: ["location", "site", "place", "geocode"], entity: "Address", roles: adminRoles, isCore: true, isCreateTarget: true }),
  app({ id: "relationships", name: "Relationships", icon: "🔗", color: "#14b8a6", route: "/Relationships", category: "Operations", description: "Relationship layer connecting people, enterprises, services, items, and places.", keywords: ["links", "connections", "network", "ontology"], entity: "Relationship", roles: adminRoles, isCore: true }),
  app({ id: "tasks", name: "Tasks", icon: "📝", color: "#10b981", route: "/Tasks", category: "Operations", description: "Operational work, agent-created tasks, approvals, and follow-up.", keywords: ["work", "todo", "follow up", "assignment"], entity: "Task", roles: opsRoles, isCore: true, isCreateTarget: true }),
  app({ id: "documents", name: "Documents", icon: "📄", color: "#64748b", route: "/Documents", category: "Operations", description: "Documents, certificates, compliance records, and expiries.", keywords: ["file", "certificate", "compliance", "expiry"], entity: "Document", roles: adminRoles, isCore: true, isCreateTarget: true }),
  app({ id: "schedules", name: "Schedules", icon: "📆", color: "#4f46e5", route: "/Schedules", category: "Operations", description: "Shifts, visits, sessions, recurring work, and operating schedules.", keywords: ["calendar", "shift", "visit", "session"], entity: "Schedule", roles: opsRoles, isCore: true, isCreateTarget: true }),
  app({ id: "signals", name: "Signals", icon: "📡", color: "#0891b2", route: "/Signals", category: "Operations", description: "Operational signals, readings, events, and telemetry.", keywords: ["event", "reading", "telemetry", "sensor"], entity: "Signal", roles: adminRoles, isCore: true }),
  app({ id: "channels", name: "Channels", icon: "💬", color: "#7c3aed", route: "/Channels", category: "Operations", description: "Communication channels, inboxes, and engagement streams.", keywords: ["communication", "whatsapp", "email", "sms"], entity: "Channel", roles: adminRoles, isCore: true }),
  app({ id: "territories", name: "Territories", icon: "🗺️", color: "#ef4444", route: "/Territories", category: "Operations", description: "Sales zones, catchments, delivery areas, and service territories.", keywords: ["zone", "catchment", "coverage", "area"], entity: "Territory", roles: adminRoles, isCore: true }),

  app({ id: "inventory", name: "Products", icon: "📦", color: "#f97316", route: "/Products", category: "Inventory", pageName: "Products", description: "Products, stock, assets, medications, equipment, and managed items.", keywords: ["inventory", "assets", "items", "stock"], entity: "Product", roles: adminRoles, isCore: true, isCreateTarget: true }),
  app({ id: "stockcounter", name: "Stock Counter", icon: "🔢", color: "#ea580c", route: "/StockCounter", category: "Inventory", description: "Count stock and reconcile inventory in the field.", keywords: ["stocktake", "count", "inventory"], roles: opsRoles }),
  app({ id: "barcode", name: "Barcode Scanner", icon: "📷", color: "#334155", route: "/BarcodeScanner", category: "Inventory", description: "Scan barcodes and enrich products.", keywords: ["ean", "upc", "scan", "product lookup"], roles: opsRoles }),
  app({ id: "animals", name: "Animals", icon: "🐄", color: "#65a30d", route: "/Animals", category: "Inventory", description: "Animal records for agriculture, veterinary, and livestock workflows.", keywords: ["livestock", "farm", "veterinary"], entity: "Animal", industries: ["agriculture", "healthcare"], roles: adminRoles, isCore: true }),
  app({ id: "plots", name: "Plots", icon: "🌱", color: "#16a34a", route: "/Plots", category: "Inventory", description: "Land parcels, fields, water bodies, and growing areas.", keywords: ["farm", "field", "land", "parcel"], entity: "Plot", industries: ["agriculture"], roles: adminRoles, isCore: true }),
  app({ id: "observations", name: "Observations", icon: "🔎", color: "#0d9488", route: "/Observations", category: "Inventory", description: "Field observations, inspections, health notes, and measurements.", keywords: ["inspection", "field", "measurement"], entity: "Observation", roles: adminRoles, isCore: true }),

  app({ id: "transactions", name: "Transactions", icon: "💳", color: "#6366f1", route: "/Transactions", category: "Finance", description: "Revenue, expenses, invoices, payments, claims, and orders.", keywords: ["finance", "invoice", "payment", "expense"], entity: "Transaction", roles: opsRoles, isCore: true, isCreateTarget: true }),
  app({ id: "billing", name: "Billing", icon: "🧾", color: "#0f766e", route: "/Billing", category: "Finance", description: "Subscription and billing management.", keywords: ["subscription", "plan", "payment"], roles: adminRoles }),
  app({ id: "expenseclaim", name: "Expense Claim", icon: "💸", color: "#f59e0b", route: "/ExpenseClaim", category: "Finance", description: "Submit and review expense claims.", keywords: ["expense", "claim", "reimbursement"], entity: "Transaction", roles: opsRoles, isCreateTarget: true }),
  app({ id: "purchaseorder", name: "Purchase Order", icon: "🧾", color: "#7c3aed", route: "/PurchaseOrder", category: "Finance", description: "Create and approve purchase orders.", keywords: ["procurement", "purchase", "supplier"], entity: "Transaction", roles: adminRoles, isCreateTarget: true }),
  app({ id: "goodsreceived", name: "Goods Received", icon: "📥", color: "#ea580c", route: "/GoodsReceived", category: "Finance", description: "Record received goods and update stock.", keywords: ["receiving", "goods", "stock", "purchase"], roles: opsRoles, isCreateTarget: true }),

  app({ id: "copilot", name: "Idjwi", icon: "🧠", color: "#10b981", route: "/idjwi", category: "Autonomy", pageName: "idjwi", description: "Grounded copilot for operational questions and action planning.", keywords: ["copilot", "chat", "ask", "ai", "assistant"], roles: allRoles, isAgent: true }),
  app({ id: "agents", name: "Agents", icon: "⚡", color: "#8b5cf6", route: "/agents", category: "Autonomy", pageName: "agents", description: "Run, review, approve, and monitor autonomous agents.", keywords: ["agent", "automation", "approval", "run"], roles: adminRoles, isAgent: true }),
  app({ id: "workflows", name: "Workflows", icon: "🔀", color: "#2563eb", route: "/Workflows", category: "Autonomy", description: "Workflow definitions, automations, triggers, and execution history.", keywords: ["automation", "trigger", "process", "n8n"], roles: adminRoles, isAgent: true }),
  app({ id: "intelligenceinbox", name: "Intelligence Inbox", icon: "✨", color: "#9333ea", route: "/IntelligenceInbox", category: "Autonomy", description: "Inbox for insights, recommendations, risks, and opportunities.", keywords: ["insights", "recommendations", "risks", "opportunities"], roles: adminRoles, isAgent: true }),
  app({ id: "alerts", name: "Alerts", icon: "🔔", color: "#f43f5e", route: "/alerts", category: "Autonomy", pageName: "alerts", description: "Operational alert rules, alert history, and notification channels.", keywords: ["notifications", "rules", "warning"], roles: adminRoles, isAgent: true }),
  app({ id: "ingestion", name: "Ingestion", icon: "⬆️", color: "#06b6d4", route: "/IngestionAgent", category: "Autonomy", description: "Upload, profile, map, approve, and load external data.", keywords: ["upload", "import", "mapping", "etl", "spreadsheet"], roles: adminRoles, isAgent: true }),
  app({ id: "connectors", name: "Connectors", icon: "🔌", color: "#78716c", route: "/Connectors", category: "Autonomy", description: "Connect external systems and sync data into Newsconseen.", keywords: ["sync", "integration", "airbyte", "api"], roles: adminRoles, isAgent: true }),

  app({ id: "reports", name: "Reports", icon: "📈", color: "#a855f7", route: "/Reports", category: "Analytics", description: "Reports, charts, exports, and saved analysis.", keywords: ["charts", "reporting", "export", "bi"], roles: adminRoles }),
  app({ id: "querybuilder", name: "Query Builder", icon: "🧮", color: "#7c3aed", route: "/QueryBuilder", category: "Analytics", description: "Build queries over Newsconseen data and open data sources.", keywords: ["sql", "query", "open data"], roles: adminRoles }),
  app({ id: "marketintelligence", name: "Market Intelligence", icon: "🗺️", color: "#f59e0b", route: "/MarketIntelligence", category: "Analytics", description: "Market, competitor, location, and open-data intelligence.", keywords: ["market", "competitor", "location"], roles: adminRoles }),
  app({ id: "mlmodels", name: "ML Models", icon: "🤖", color: "#0891b2", route: "/MLModels", category: "Analytics", description: "Churn, segmentation, demand forecast, and model retraining.", keywords: ["machine learning", "forecast", "churn"], roles: adminRoles, isAgent: true }),
  app({ id: "network", name: "Network Intel", icon: "🌐", color: "#16a34a", route: "/network", category: "Analytics", pageName: "network", description: "Cross-branch and multi-tenant network intelligence.", keywords: ["network", "branch", "benchmark"], roles: adminRoles }),
  app({ id: "mapexplorer", name: "Map Explorer", icon: "📍", color: "#ef4444", route: "/MapExplorer", category: "Analytics", description: "Spatial pins, density, boundaries, and coverage analysis.", keywords: ["map", "spatial", "postgis"], roles: adminRoles }),
  app({ id: "entitygraph", name: "Entity Graph", icon: "🕸️", color: "#0ea5e9", route: "/EntityGraph", category: "Analytics", description: "Graph exploration across core ontology records.", keywords: ["graph", "relationships", "network"], roles: adminRoles }),
  app({ id: "objectexplorer", name: "Object Explorer", icon: "🔭", color: "#9333ea", route: "/ObjectExplorer", category: "Analytics", description: "Explore ontology objects and records.", keywords: ["object", "ontology", "records"], roles: adminRoles }),
  app({ id: "kineticlayer", name: "Kinetic Layer", icon: "🧬", color: "#db2777", route: "/KineticLayer", category: "Analytics", description: "Dynamic operational layer and intelligence model.", keywords: ["kinetic", "model", "operations"], roles: adminRoles }),
  app({ id: "objectviews", name: "Object Views", icon: "🧩", color: "#6366f1", route: "/ObjectViews", category: "Analytics", description: "Reusable views over ontology objects.", keywords: ["views", "objects", "ontology"], roles: adminRoles }),
  app({ id: "datamodels", name: "Data Models", icon: "🗄️", color: "#334155", route: "/DataModels", category: "Analytics", description: "Schema, API, ontology, and data model reference.", keywords: ["schema", "api", "model", "developer"], roles: adminRoles }),
  app({ id: "pipelines", name: "Pipelines", icon: "🧱", color: "#475569", route: "/Pipelines", category: "Analytics", description: "ETL and analytics pipeline status.", keywords: ["etl", "pipeline", "analytics"], roles: adminRoles }),
  app({ id: "datarepair", name: "Data Repair", icon: "🧹", color: "#f97316", route: "/DataRepair", category: "Analytics", description: "Find and repair data quality issues.", keywords: ["data quality", "repair", "cleanup"], roles: adminRoles }),

  app({ id: "attendance", name: "Attendance", icon: "📘", color: "#3b82f6", route: "/AttendanceRegister", category: "Work Apps", pageName: "AttendanceRegister", description: "Attendance register for schools, teams, programs, and shifts.", keywords: ["attendance", "register", "class"], roles: allRoles, isCreateTarget: true }),
  app({ id: "clockinout", name: "Clock In/Out", icon: "🕐", color: "#64748b", route: "/ClockInOut", category: "Work Apps", description: "Field and staff clock-in/clock-out.", keywords: ["time", "shift", "attendance"], roles: opsRoles }),
  app({ id: "staffschedule", name: "Staff Schedule", icon: "📅", color: "#4f46e5", route: "/StaffSchedule", category: "Work Apps", description: "Staff schedule and workforce planning.", keywords: ["staff", "schedule", "shift"], roles: opsRoles }),
  app({ id: "clientonboard", name: "Enroll Client", icon: "🎓", color: "#06b6d4", route: "/ClientOnboarding", category: "Work Apps", pageName: "ClientOnboarding", description: "Guided client, student, member, or patient enrollment.", keywords: ["onboard", "enroll", "client"], roles: opsRoles, isCreateTarget: true }),
  app({ id: "addclient", name: "Add Client", icon: "➕", color: "#10b981", route: "/AddClient", category: "Work Apps", description: "Create a client with address and relationships.", keywords: ["client", "person", "enterprise"], roles: opsRoles, isCreateTarget: true }),
  app({ id: "leaverequest", name: "Leave Request", icon: "🏖️", color: "#0ea5e9", route: "/LeaveRequest", category: "Work Apps", description: "Submit and manage leave requests.", keywords: ["leave", "absence", "staff"], roles: opsRoles, isCreateTarget: true }),
  app({ id: "visitorlog", name: "Visitor Log", icon: "🪪", color: "#64748b", route: "/VisitorLog", category: "Work Apps", description: "Log visitors and site access.", keywords: ["visitor", "front desk", "access"], roles: opsRoles, isCreateTarget: true }),
  app({ id: "incidentreport", name: "Incident Report", icon: "⚠️", color: "#ef4444", route: "/IncidentReport", category: "Work Apps", description: "Capture incidents, risks, and follow-up tasks.", keywords: ["incident", "risk", "safety"], roles: opsRoles, isCreateTarget: true }),
  app({ id: "maintenance", name: "Maintenance", icon: "🔧", color: "#f97316", route: "/MaintenanceRequest", category: "Work Apps", pageName: "MaintenanceRequest", description: "Submit maintenance requests and repair work.", keywords: ["maintenance", "repair", "facility"], roles: opsRoles, isCreateTarget: true }),
  app({ id: "fieldvisit", name: "Field Visit", icon: "🚗", color: "#059669", route: "/FieldVisitReport", category: "Work Apps", pageName: "FieldVisitReport", description: "Field visit reports and follow-up actions.", keywords: ["field", "visit", "report"], roles: opsRoles, isCreateTarget: true }),
  app({ id: "inspection", name: "Inspection", icon: "✅", color: "#16a34a", route: "/InspectionChecklist", category: "Work Apps", pageName: "InspectionChecklist", description: "Inspection checklists and compliance checks.", keywords: ["inspection", "checklist", "compliance"], roles: opsRoles, isCreateTarget: true }),
  app({ id: "documentexpiry", name: "Document Expiry", icon: "⏳", color: "#f59e0b", route: "/DocumentExpiry", category: "Work Apps", pageName: "DocumentExpiry", description: "Track expiring documents and renewal tasks.", keywords: ["expiry", "renewal", "documents"], roles: opsRoles }),
  app({ id: "pdfontology", name: "PDF to Ontology", icon: "📑", color: "#7c3aed", route: "/PdfToOntology", category: "Work Apps", pageName: "PdfToOntology", description: "Extract structured ontology records from PDF files.", keywords: ["pdf", "extract", "ontology", "import"], roles: adminRoles }),
  app({ id: "pdftoexcel", name: "PDF to Excel", icon: "📋", color: "#16a34a", route: "/PdfToExcel", category: "Work Apps", pageName: "PdfToExcel", description: "Convert PDFs to spreadsheet-ready data.", keywords: ["pdf", "excel", "extract"], roles: adminRoles }),

  app({ id: "medadmin", name: "Med Admin", icon: "💊", color: "#06b6d4", route: "/MedAdmin", category: "Healthcare", description: "Medication administration, recalls, and interaction checks.", keywords: ["medication", "healthcare", "drug", "recall"], industries: ["healthcare"], roles: opsRoles }),

  app({ id: "files", name: "Files", icon: "📁", color: "#f59e0b", route: "/files", category: "Tools", pageName: "files", description: "File manager and workspace documents.", keywords: ["files", "documents", "manager"], roles: adminRoles }),
  app({ id: "applications", name: "App Store", icon: "🛍️", color: "#db2777", route: "/Applications", category: "Tools", description: "Available Newsconseen apps and work modules.", keywords: ["apps", "store", "modules"], roles: adminRoles }),
  app({ id: "settings", name: "Desktop Settings", icon: "⚙️", color: "#475569", route: "/DesktopSettings", category: "Tools", pageName: "DesktopSettings", description: "Desktop, profile, sync, security, and API settings.", keywords: ["settings", "desktop", "profile", "security"], roles: allRoles }),
  app({ id: "businesssettings", name: "Business Settings", icon: "🧭", color: "#0f766e", route: "/Settings", category: "Tools", pageName: "Settings", description: "Organisation settings, reports, alerts, readiness, and automation controls.", keywords: ["settings", "organisation", "readiness", "alerts", "automation"], roles: adminRoles, isAdmin: true }),
  app({ id: "permissions", name: "Permissions", icon: "🛡️", color: "#8b5cf6", route: "/Permissions", category: "Tools", description: "Role and page access permissions.", keywords: ["roles", "access", "security"], roles: adminRoles, isAdmin: true }),
  app({ id: "users", name: "User Management", icon: "👤", color: "#0ea5e9", route: "/UserManagement", category: "Tools", pageName: "UserManagement", description: "Manage users, app access, and report access.", keywords: ["users", "access", "team"], roles: adminRoles, isAdmin: true }),
  app({ id: "taxonomy", name: "Taxonomy Admin", icon: "🏷️", color: "#9333ea", route: "/TaxonomyAdmin", category: "Tools", pageName: "TaxonomyAdmin", description: "Manage tenant vocabulary and taxonomy options.", keywords: ["taxonomy", "vocabulary", "master data"], roles: adminRoles, isAdmin: true }),
  app({ id: "tenantadmin", name: "Tenant Admin", icon: "🏛️", color: "#334155", route: "/TenantAdmin", category: "Tools", pageName: "TenantAdmin", description: "Platform tenant provisioning, health, ETL, and suspension controls.", keywords: ["tenant", "platform", "provision"], roles: platformRoles, isAdmin: true }),
  app({ id: "inviteuser", name: "Invite User", icon: "✉️", color: "#2563eb", route: "/InviteUser", category: "Tools", description: "Invite teammates into the workspace.", keywords: ["invite", "user", "team"], roles: adminRoles, isAdmin: true }),
];

export const DESKTOP_CATEGORIES = ["Operations", "Inventory", "Finance", "Autonomy", "Analytics", "Work Apps", "Healthcare", "Tools"];

export const DEFAULT_PINNED = ["companygraph", "tasks", "copilot", "agents", "ingestion", "settings"];
export const DEFAULT_DESKTOP_ICONS = ["companygraph", "tasks", "copilot", "ingestion", "dashboard"];

export const QUICK_CREATE_ACTIONS = [
  { id: "new-task", label: "New Task", appId: "tasks", action: "new" },
  { id: "new-transaction", label: "New Transaction", appId: "transactions", action: "new" },
  { id: "new-person", label: "New Person", appId: "people", action: "new" },
  { id: "new-enterprise", label: "New Enterprise", appId: "enterprises", action: "new" },
  { id: "new-product", label: "New Product", appId: "inventory", action: "new" },
  { id: "import-data", label: "Import Data", appId: "ingestion", action: "upload" },
  { id: "run-agents", label: "Run Agents", appId: "agents", action: "run" },
  { id: "review-intel", label: "Review Intelligence", appId: "intelligenceinbox", action: "review" },
];

export function getDesktopApp(appId) {
  return DESKTOP_APPS.find((candidate) => candidate.id === appId);
}

export function getAppSearchText(appItem) {
  return [
    appItem.name,
    appItem.id,
    appItem.category,
    appItem.description,
    appItem.entity,
    appItem.pageName,
    ...(appItem.keywords || []),
  ].filter(Boolean).join(" ").toLowerCase();
}

export function canAccessDesktopApp(appItem, user) {
  if (!appItem) return false;
  if (!user) return true;
  const role = user.role || "student";
  const roleAllowed = !appItem.roles?.length || appItem.roles.includes(role);
  const pageAllowed = !appItem.pageName || canAccessPage(role, appItem.pageName) || roleAllowed;
  return roleAllowed && pageAllowed;
}

export function getVisibleDesktopApps(user) {
  return DESKTOP_APPS.filter((appItem) => canAccessDesktopApp(appItem, user));
}

export function withDesktopAction(appItem, action) {
  if (!appItem || !action) return appItem;
  const separator = appItem.route.includes("?") ? "&" : "?";
  return {
    ...appItem,
    route: `${appItem.route}${separator}desktop_action=${encodeURIComponent(action)}`,
  };
}
