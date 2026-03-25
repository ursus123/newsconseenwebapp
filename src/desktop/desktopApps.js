// Desktop Shell App Registry
export const DESKTOP_APPS = [
  { id: "attendance",   name: "Attendance",         icon: "📘", color: "#3b82f6", route: "/AttendanceRegister", category: "Operations" },
  { id: "people",       name: "People",              icon: "👥", color: "#8b5cf6", route: "/People",             category: "Operations" },
  { id: "enterprises",  name: "Enterprises",         icon: "🏢", color: "#0ea5e9", route: "/Enterprises",        category: "Operations" },
  { id: "inventory",    name: "Inventory",           icon: "📦", color: "#f97316", route: "/Products",           category: "Inventory" },
  { id: "tasks",        name: "Tasks",               icon: "📝", color: "#10b981", route: "/Tasks",              category: "Operations" },
  { id: "transactions", name: "Transactions",        icon: "💳", color: "#6366f1", route: "/Transactions",       category: "Finance" },
  { id: "reports",      name: "Reports",             icon: "📊", color: "#ec4899", route: "/Reports",            category: "Analytics" },
  { id: "relationships",name: "Relationships",       icon: "🔗", color: "#14b8a6", route: "/Relationships",      category: "Operations" },
  { id: "location",     name: "Market Intelligence", icon: "🗺️", color: "#f59e0b", route: "/MarketIntelligence", category: "Analytics" },
  { id: "clockinout",   name: "Clock In/Out",        icon: "🕐", color: "#64748b", route: "/ClockInOut",         category: "Operations" },
  { id: "stockcounter", name: "Stock Counter",       icon: "🔢", color: "#ea580c", route: "/StockCounter",       category: "Inventory" },
  { id: "medadmin",     name: "Med Admin",           icon: "💊", color: "#06b6d4", route: "/MedAdmin",           category: "Healthcare" },
  { id: "barcode",      name: "Barcode Scanner",     icon: "📷", color: "#334155", route: "/BarcodeScanner",     category: "Inventory" },
  { id: "staffschedule",name: "Staff Schedule",      icon: "📅", color: "#4f46e5", route: "/StaffSchedule",      category: "Operations" },
  { id: "querybuilder", name: "Query Builder",       icon: "🧮", color: "#7c3aed", route: "/QueryBuilder",       category: "Analytics" },
  { id: "settings",     name: "Settings",            icon: "⚙️", color: "#475569", route: "/Settings",           category: "Tools" },
  { id: "applications", name: "App Store",           icon: "🛍️", color: "#db2777", route: "/Applications",      category: "Tools" },
];

export const DESKTOP_CATEGORIES = ["Operations", "Inventory", "Finance", "Analytics", "Healthcare", "Tools"];

// Pinned to taskbar by default
export const DEFAULT_PINNED = ["attendance", "tasks", "people", "transactions", "settings"];