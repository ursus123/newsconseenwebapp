// Desktop Shell App Registry
export const DESKTOP_APPS = [
  // Operations
  { id: "attendance",    name: "Attendance",          icon: "📘", color: "#3b82f6", route: "/AttendanceRegister", category: "Operations" },
  { id: "people",        name: "People",               icon: "👥", color: "#8b5cf6", route: "/People",             category: "Operations" },
  { id: "enterprises",   name: "Enterprises",          icon: "🏢", color: "#0ea5e9", route: "/Enterprises",        category: "Operations" },
  { id: "tasks",         name: "Tasks",                icon: "📝", color: "#10b981", route: "/Tasks",              category: "Operations" },
  { id: "relationships", name: "Relationships",        icon: "🔗", color: "#14b8a6", route: "/Relationships",      category: "Operations" },
  { id: "clockinout",    name: "Clock In/Out",         icon: "🕐", color: "#64748b", route: "/ClockInOut",         category: "Operations" },
  { id: "staffschedule", name: "Staff Schedule",       icon: "📅", color: "#4f46e5", route: "/StaffSchedule",      category: "Operations" },
  { id: "clientonboard", name: "Enroll Client",        icon: "🎓", color: "#06b6d4", route: "/ClientOnboarding",   category: "Operations" },

  // Inventory
  { id: "inventory",     name: "Inventory",            icon: "📦", color: "#f97316", route: "/Products",           category: "Inventory" },
  { id: "stockcounter",  name: "Stock Counter",        icon: "🔢", color: "#ea580c", route: "/StockCounter",       category: "Inventory" },
  { id: "barcode",       name: "Barcode Scanner",      icon: "📷", color: "#334155", route: "/BarcodeScanner",     category: "Inventory" },

  // Finance
  { id: "transactions",  name: "Transactions",         icon: "💳", color: "#6366f1", route: "/Transactions",       category: "Finance" },

  // Analytics
  { id: "dashboard",     name: "Dashboard",            icon: "📊", color: "#ec4899", route: "/Dashboard",          category: "Analytics" },
  { id: "reports",       name: "Reports",              icon: "📈", color: "#a855f7", route: "/Reports",            category: "Analytics" },
  { id: "location",      name: "Market Intelligence",  icon: "🗺️", color: "#f59e0b", route: "/MarketIntelligence", category: "Analytics" },
  { id: "querybuilder",  name: "Query Builder",        icon: "🧮", color: "#7c3aed", route: "/QueryBuilder",       category: "Analytics" },
  { id: "mlmodels",      name: "ML Models",            icon: "🤖", color: "#0891b2", route: "/MLModels",           category: "Analytics" },
  { id: "network",       name: "Network Intel",        icon: "🌐", color: "#16a34a", route: "/network",            category: "Analytics" },
  { id: "objectexplorer",name: "Object Explorer",      icon: "🔭", color: "#9333ea", route: "/ObjectExplorer",     category: "Analytics" },

  // Intelligence
  { id: "copilot",       name: "Idjwi",                icon: "🧠", color: "#10b981", route: "/idjwi",             category: "Intelligence" },
  { id: "alerts",        name: "Alerts",               icon: "🔔", color: "#f43f5e", route: "/alerts",             category: "Intelligence" },
  { id: "agents",        name: "Agents",               icon: "⚡", color: "#8b5cf6", route: "/agents",             category: "Intelligence" },

  // Healthcare
  { id: "medadmin",      name: "Med Admin",            icon: "💊", color: "#06b6d4", route: "/MedAdmin",           category: "Healthcare" },

  // Tools
  { id: "connectors",    name: "Connectors",           icon: "🔌", color: "#78716c", route: "/Connectors",         category: "Tools" },
  { id: "mapexplorer",   name: "Map Explorer",         icon: "📍", color: "#ef4444", route: "/MapExplorer",        category: "Tools" },
  { id: "files",         name: "Files",                icon: "📁", color: "#f59e0b", route: "/files",              category: "Tools" },
  { id: "settings",      name: "Settings",             icon: "⚙️", color: "#475569", route: "/DesktopSettings",   category: "Tools" },
  { id: "applications",  name: "App Store",            icon: "🛍️", color: "#db2777", route: "/Applications",      category: "Tools" },
];

export const DESKTOP_CATEGORIES = ["Operations", "Inventory", "Finance", "Analytics", "Intelligence", "Healthcare", "Tools"];

// Pinned to taskbar by default
export const DEFAULT_PINNED = ["attendance", "tasks", "copilot", "transactions", "settings"];
