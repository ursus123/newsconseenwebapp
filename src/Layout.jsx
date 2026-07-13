import React, { useState, useEffect, useRef, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import {
  LayoutDashboard,
  Users,
  Package,
  Building2,
  MapPin,
  Menu,
  X,
  LogOut,
  Link2,
  Globe,
  GitBranch,
  Network,
  CreditCard,
  Settings,
  ChevronDown,
  CheckSquare,
  Receipt,
  BarChart2,
  Code2,
  Grid3x3,
  UserCog,
  Shield,
  ShieldCheck,
  Wrench,
  TrendingUp,
  Lightbulb,
  Sparkles,
  Bell,
  Plug,
  Brain,
  Search,
  Zap,
  Layers,
  Tags,
  FileText,
  Calendar,
  Activity,
  MessageSquare,
  Map,
  PawPrint,
  Tractor,
  FlaskConical,
  Upload,
  Clock,
  UserPlus,
} from "lucide-react";
import TrialBannerWrapper from "@/components/shared/TrialBannerWrapper";
import SetupWizard from "@/components/shared/SetupWizard";
import GlobalSearchBar from "@/components/layout/GlobalSearchBar";
import UndoImportButton from "@/components/layout/UndoImportButton";
import QuickImportButton from "@/components/layout/SmartImportButton";
import EmptyDatamartButton from "@/components/layout/EmptyDatamartButton";
import { ncClient } from "@/api/ncClient";
import TenantGuard from "@/components/shared/TenantGuard";
import NetworkBanner from "@/components/shared/NetworkBanner";
import { usePermissions } from "@/hooks/usePermissions";
import { useAuth } from "@/lib/AuthContext";
import CommandPalette from "@/components/layout/CommandPalette";
import QuickAddButton from "@/components/layout/QuickAddButton";
import IdjwiDockedPanel from "@/components/layout/IdjwiDockedPanel";

// ─── Role-aware nav config ────────────────────────────────────────────────────
// Sections: Home · Work · Views · Intelligence · Reports · Admin
// Max 6 items shown per section; remainder revealed with "View All"
const NAV_CONFIG = {
  super_admin: [
    {
      section: null,
      items: [
        { name: "CompanyGraphHome",  label: "Home",      icon: Network },
        { name: "IntelligenceInbox", label: "Intelligence Inbox", icon: Lightbulb },
        { name: "Tasks",             label: "My Tasks",           icon: CheckSquare },
        { name: "IngestionAgent",    label: "Add Data",           icon: Upload },
        { name: "DataReadiness",     label: "Data Readiness",     icon: ShieldCheck },
      ],
    },
    {
      section: "Work",
      items: [
        { name: "Applications",  icon: Grid3x3 },
        { name: "Tasks",         icon: CheckSquare },
        { name: "Transactions",  icon: Receipt },
        { name: "ClockInOut",    label: "Clock In/Out",   icon: Clock },
        { name: "StaffSchedule", label: "Staff Schedule", icon: Calendar },
        { name: "AddClient",     label: "Add Client",     icon: UserPlus },
      ],
    },
    {
      section: "Views",
      items: [
        { name: "Enterprises",   icon: Building2 },
        { name: "People",        icon: Users },
        { name: "Products",      icon: Package },
        { name: "Services",      icon: Wrench },
        { name: "Addresses",     icon: MapPin },
        { name: "Relationships", icon: Link2 },
        { name: "Documents",     icon: FileText },
        { name: "Schedules",     icon: Calendar },
        { name: "Signals",       icon: Activity },
        { name: "Channels",      icon: MessageSquare },
        { name: "Territories",   icon: Map },
        { name: "Animals",       icon: PawPrint },
        { name: "Plots",         icon: Tractor },
        { name: "Observations",  icon: FlaskConical },
      ],
    },
    {
      section: "Intelligence",
      items: [
        { name: "idjwi",              label: "Idjwi",                icon: Sparkles },
        { name: "agents",             label: "Agents",               icon: Brain, badge: "approvals" },
        { name: "alerts",             label: "Alerts",               icon: Bell, badge: "alerts" },
        { name: "MarketIntelligence", label: "Market Intelligence",  icon: TrendingUp },
        { name: "MapExplorer",        label: "Spatial Intelligence", icon: Map },
        { name: "network",            label: "Network Intelligence", icon: Globe, requiresNetwork: true },
        { name: "KineticLayer",       label: "Kinetic Layer",        icon: Zap },
      ],
    },
    {
      section: "Reports",
      items: [
        { name: "Dashboard",       label: "KPI Dashboard",  icon: LayoutDashboard },
        { name: "Reports",        icon: BarChart2 },
        { name: "QueryBuilder",   label: "Query Builder",   icon: Code2 },
        { name: "ObjectExplorer", label: "Object Explorer", icon: Search },
        { name: "ObjectViews",    label: "Object Views",    icon: Layers },
        { name: "EntityGraph",    label: "Entity Graph",    icon: Network },
        { name: "MLModels",       label: "ML Models",       icon: Activity },
      ],
    },
    {
      section: "Admin",
      items: [
        { name: "TenantAdmin",    label: "Tenant Admin",    icon: ShieldCheck },
        { name: "UserManagement", label: "User Management", icon: UserCog },
        { name: "Permissions",                              icon: Shield },
        { name: "TaxonomyAdmin",  label: "Taxonomy Admin",  icon: Tags },
        { name: "Connectors",                               icon: Plug },
        { name: "Workflows",                                icon: Zap },
        { name: "Pipelines",                                icon: GitBranch },
        { name: "DataModels",     label: "Data Models",     icon: GitBranch },
        { name: "Billing",                                  icon: CreditCard },
      ],
    },
  ],

  admin: [
    {
      section: null,
      items: [
        { name: "CompanyGraphHome",  label: "Home",      icon: Network },
        { name: "IntelligenceInbox", label: "Intelligence Inbox", icon: Lightbulb },
        { name: "Tasks",             label: "My Tasks",           icon: CheckSquare },
        { name: "IngestionAgent",    label: "Add Data",           icon: Upload },
        { name: "DataReadiness",     label: "Data Readiness",     icon: ShieldCheck },
      ],
    },
    {
      section: "Work",
      items: [
        { name: "Applications",  icon: Grid3x3 },
        { name: "Tasks",         icon: CheckSquare },
        { name: "Transactions",  icon: Receipt },
        { name: "ClockInOut",    label: "Clock In/Out",   icon: Clock },
        { name: "StaffSchedule", label: "Staff Schedule", icon: Calendar },
        { name: "AddClient",     label: "Add Client",     icon: UserPlus },
      ],
    },
    {
      section: "Views",
      items: [
        { name: "Enterprises",   icon: Building2 },
        { name: "People",        icon: Users },
        { name: "Products",      icon: Package },
        { name: "Services",      icon: Wrench },
        { name: "Addresses",     icon: MapPin },
        { name: "Relationships", icon: Link2 },
        { name: "Documents",     icon: FileText },
        { name: "Schedules",     icon: Calendar },
        { name: "Signals",       icon: Activity },
        { name: "Channels",      icon: MessageSquare },
        { name: "Territories",   icon: Map },
        { name: "Animals",       icon: PawPrint },
        { name: "Plots",         icon: Tractor },
        { name: "Observations",  icon: FlaskConical },
      ],
    },
    {
      section: "Intelligence",
      items: [
        { name: "idjwi",              label: "Idjwi",                icon: Sparkles },
        { name: "agents",             label: "Agents",               icon: Brain, badge: "approvals" },
        { name: "alerts",             label: "Alerts",               icon: Bell, badge: "alerts" },
        { name: "MarketIntelligence", label: "Market Intelligence",  icon: TrendingUp },
        { name: "MapExplorer",        label: "Spatial Intelligence", icon: Map },
        { name: "network",            label: "Network Intelligence", icon: Globe, requiresNetwork: true },
        { name: "MLModels",           label: "ML Models",            icon: Activity },
      ],
    },
    {
      section: "Reports",
      items: [
        { name: "Dashboard",       label: "KPI Dashboard",  icon: LayoutDashboard },
        { name: "Reports",        icon: BarChart2 },
        { name: "QueryBuilder",   label: "Query Builder",   icon: Code2 },
        { name: "ObjectExplorer", label: "Object Explorer", icon: Search },
        { name: "ObjectViews",    label: "Object Views",    icon: Layers },
        { name: "EntityGraph",    label: "Entity Graph",    icon: Network },
      ],
    },
    {
      section: "Admin",
      items: [
        { name: "UserManagement", label: "User Management", icon: UserCog },
        { name: "Permissions",                              icon: Shield },
        { name: "TaxonomyAdmin",  label: "Taxonomy Admin",  icon: Tags },
        { name: "Connectors",                               icon: Plug },
        { name: "Workflows",                                icon: Zap },
        { name: "DataModels",     label: "Data Models",     icon: GitBranch },
        { name: "Billing",                                  icon: CreditCard },
      ],
    },
  ],

  executive: [
    {
      section: null,
      items: [
        { name: "CompanyGraphHome",  label: "Home",      icon: Network },
        { name: "IntelligenceInbox", label: "Intelligence Inbox", icon: Lightbulb },
      ],
    },
    {
      section: "Intelligence",
      items: [
        { name: "idjwi",             label: "Idjwi",             icon: Sparkles },
        { name: "agents",            label: "Agents",            icon: Brain, badge: "approvals" },
        { name: "alerts",            label: "Alerts",            icon: Bell, badge: "alerts" },
        { name: "MarketIntelligence",label: "Market Intelligence",icon: TrendingUp },
      ],
    },
    {
      section: "Reports",
      items: [
        { name: "Dashboard",     label: "KPI Dashboard", icon: LayoutDashboard },
        { name: "Reports",      icon: BarChart2 },
        { name: "QueryBuilder", label: "Query Builder", icon: Code2 },
        { name: "EntityGraph",  label: "Entity Graph",  icon: Network },
      ],
    },
    {
      section: "Views",
      items: [
        { name: "Enterprises", icon: Building2 },
        { name: "People",      icon: Users },
        { name: "Products",    icon: Package },
      ],
    },
    {
      section: "Work",
      items: [
        { name: "Applications", icon: Grid3x3 },
        { name: "Tasks",        icon: CheckSquare },
      ],
    },
  ],

  user: [
    {
      section: null,
      items: [
        { name: "Dashboard",    icon: LayoutDashboard },
        { name: "Tasks",        label: "My Tasks", icon: CheckSquare },
      ],
    },
    {
      section: "Work",
      items: [
        { name: "Applications", icon: Grid3x3 },
        { name: "Tasks",        icon: CheckSquare },
        { name: "ClockInOut",   label: "Clock In/Out", icon: Clock },
      ],
    },
  ],
};

const ROLE_BADGE = {
  super_admin: { label: "Super Admin", color: "bg-emerald-500" },
  admin:       { label: "Admin",       color: "bg-violet-500" },
  executive:   { label: "Executive",   color: "bg-blue-500" },
  user:        { label: "Staff",       color: "bg-slate-500" },
};

// ─── NavItem ─────────────────────────────────────────────────────────────────
/** @param {{ name: any, label: any, icon: any, isActive: any, onClick: any, showRedDot: any, primaryColor: any }} props */
function NavItem({ name, label, icon: Icon, isActive, onClick, showRedDot, primaryColor }) {
  return (
    <button
      onClick={onClick}
      style={isActive && primaryColor ? { backgroundColor: primaryColor + "22" } : {}}
      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium transition-all text-left ${
        isActive
          ? "text-white"
          : "text-slate-400 hover:text-white hover:bg-white/5"
      }`}
    >
      <div className="relative shrink-0">
        <Icon className={`w-4 h-4`} style={isActive && primaryColor ? { color: primaryColor } : {}} />
        {showRedDot && (
          <span className="absolute -top-1 -right-1 w-2 h-2 bg-rose-500 rounded-full" />
        )}
      </div>
      <span className="truncate">{label || name}</span>
    </button>
  );
}

// ─── Layout ──────────────────────────────────────────────────────────────────
// ─── Industry mode → nav label overrides ─────────────────────────────────────
const MODE_LABELS = {
  crm: {
    People: "Contacts",
    Enterprises: "Accounts",
    Tasks: "Activities",
    Transactions: "Deals",
  },
  healthcare: {
    People: "Patients",
    Enterprises: "Clinics",
    Tasks: "Appointments",
    Transactions: "Invoices",
    Products: "Medications",
    Services: "Treatments",
  },
  education: {
    People: "Students",
    Enterprises: "Schools",
    Tasks: "Sessions",
    Transactions: "Fees",
    Services: "Courses",
  },
  logistics: {
    People: "Drivers",
    Enterprises: "Depots",
    Tasks: "Deliveries",
    Products: "Cargo",
  },
  ngo: {
    People: "Beneficiaries",
    Enterprises: "Partners",
    Tasks: "Programs",
    Transactions: "Donations",
  },
};

export default function Layout({ children, currentPageName }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [showWizard, setShowWizard] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [criticalAlerts, setCriticalAlerts] = useState(0);
  const [pendingApprovals, setPendingApprovals] = useState(0);
  const [expandedSections, setExpandedSections] = useState(/** @type {Record<string,boolean>} */ ({}));
  const toggleSection = (/** @type {string} */ key) => setExpandedSections((/** @type {Record<string,boolean>} */ p) => ({ ...p, [key]: !p[key] }));
  const [sidebarWidth, setSidebarWidth] = useState(256);
  const isResizing = useRef(false);
  const resizeStartX = useRef(0);
  const resizeStartWidth = useRef(256);

  const handleResizeMove = useCallback((/** @type {MouseEvent} */ e) => {
    if (!isResizing.current) return;
    const delta = e.clientX - resizeStartX.current;
    setSidebarWidth(Math.min(480, Math.max(200, resizeStartWidth.current + delta)));
  }, []);

  const handleResizeUp = useCallback(() => {
    isResizing.current = false;
    document.removeEventListener("mousemove", handleResizeMove);
    document.removeEventListener("mouseup", handleResizeUp);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }, [handleResizeMove]);

  const startResize = useCallback((/** @type {React.MouseEvent} */ e) => {
    isResizing.current = true;
    resizeStartX.current = e.clientX;
    resizeStartWidth.current = sidebarWidth;
    document.addEventListener("mousemove", handleResizeMove);
    document.addEventListener("mouseup", handleResizeUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, [sidebarWidth, handleResizeMove, handleResizeUp]);
  const navigate = useNavigate();
  const { logout: authLogout } = useAuth();

  useEffect(() => {
    ncClient.auth.me().then(u => {
      setCurrentUser(u);
      if (u && !u.setup_complete && (u.role === 'admin' || u.role === 'super_admin')) {
        setShowWizard(true);
      }
    }).catch(() => {});
  }, []);

  const handleWizardComplete = (prefs) => {
    setShowWizard(false);
    if (prefs.industry_mode) {
      setCurrentUser(u => u ? { ...u, ...prefs, setup_complete: true } : u);
    }
  };

  useEffect(() => {
    fetch("https://newsconseenwebapp-production.up.railway.app/alerts/status")
      .then(r => r.json())
      .then(data => setCriticalAlerts(data?.critical_count || 0))
      .catch(() => {});
  }, []);

  // Combined "needs approval" signal — agent approvals + Intelligence Inbox
  // recommendations — one badge instead of two silent counts (see ApprovalGate.jsx
  // and IntelligenceInbox.jsx, which remain separate queues under the hood).
  useEffect(() => {
    const companyId = currentUser?.company_id;
    if (!companyId) return;
    const base = "https://newsconseenwebapp-production.up.railway.app";
    Promise.all([
      fetch(`${base}/agents/approvals/pending?company_id=${companyId}`).then(r => r.ok ? r.json() : { pending: [] }).catch(() => ({ pending: [] })),
      fetch(`${base}/intelligence/inbox?company_id=${companyId}&limit=200`).then(r => r.ok ? r.json() : {}).catch(() => ({})),
    ]).then(([approvals, inbox]) => {
      const pendingApprovalCount = (approvals?.pending || []).length;
      const pendingRecCount = (inbox?.recommendations || []).filter(r => r.status === "proposed").length;
      setPendingApprovals(pendingApprovalCount + pendingRecCount);
    }).catch(() => {});
  }, [currentUser?.company_id]);

  // Auto-assign admin to their enterprise if company_id is missing
  useEffect(() => {
    if (!currentUser) return;
    if (currentUser.role === "super_admin") return;
    if (currentUser.company_id || currentUser.role !== "admin") return;

    ncClient.entities.Enterprise.filter({ created_by: currentUser.email })
      .then(async (enterprises) => {
        if (enterprises.length > 0) {
          await ncClient.auth.updateMe({ company_id: enterprises[0].id });
          window.location.reload();
        }
      })
      .catch(() => {});
  }, [currentUser?.id]);

  // Silent background fix: repair enterprises created by this user with null company_id
  useEffect(() => {
    if (!currentUser) return;
    if (currentUser.role === "super_admin") return;
    if (!currentUser.company_id) return;

    const fixKey = `fixed_${currentUser.company_id}`;
    if (localStorage.getItem(fixKey)) return;

    ncClient.entities.Enterprise.filter({ created_by: currentUser.email })
      .then(async (enterprises) => {
        let fixed = 0;
        for (const e of enterprises) {
          if (!e.company_id) {
            await ncClient.entities.Enterprise.update(e.id, { company_id: currentUser.company_id });
            fixed++;
            await new Promise(r => setTimeout(r, 300));
          }
        }
        localStorage.setItem(fixKey, "true");
        if (fixed > 0) window.location.reload();
      })
      .catch(() => {});
  }, [currentUser?.company_id]);

  // Read brand settings from localStorage reactively
  const readBrand = () => { try { return JSON.parse(localStorage.getItem("brand_settings") || "{}"); } catch { return {}; } };
  const [savedBrand, setSavedBrand] = useState(readBrand);
  useEffect(() => {
    const handler = () => setSavedBrand(readBrand());
    window.addEventListener("brand_updated", handler);
    return () => window.removeEventListener("brand_updated", handler);
  }, []);
  const branding = { 
    logoUrl: savedBrand.logoUrl || null,
    appName: savedBrand.appName || "Newsconseen",
    primaryColor: savedBrand.primaryColor || "#10b981",
    secondaryColor: savedBrand.secondaryColor || "#1e293b",
    accentColor: savedBrand.accentColor || "#6366f1",
    hideNewsconseen: savedBrand.hideNewsconseen || false
  };

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--brand-primary",   branding.primaryColor);
    root.style.setProperty("--brand-secondary", branding.secondaryColor);
    root.style.setProperty("--brand-accent",    branding.accentColor);
  }, [branding.primaryColor, branding.secondaryColor, branding.accentColor, savedBrand]);



  // Build role-aware nav sections with permissions
  const { canAccessPage } = usePermissions();
  const role = currentUser?.role || "user";
  const industryMode = currentUser?.industry_mode || "";
  const modeOverrides = MODE_LABELS[industryMode] || {};
  let navSections = NAV_CONFIG[/** @type {keyof typeof NAV_CONFIG} */ (role)] || NAV_CONFIG.user;
  
  // Filter nav items based on permissions
  navSections = navSections.map((section) => ({
    ...section,
    items: section.items.filter((/** @type {any} */ item) => {
      if (!canAccessPage(item.name)) return false;
      if (item.requiresNetwork && !currentUser?.network_company_id) return false;
      return true;
    }),
  })).filter((section) => section.items.length > 0);
  
  const roleBadge = ROLE_BADGE[role] || ROLE_BADGE.user;

  const handleNavClick = (pageName) => {
    navigate(createPageUrl(pageName));
    setSidebarOpen(false);
  };

  // Build adaptive labels — merge mode overrides on top of defaults
  const ADAPTIVE_LABELS = {
    People:       modeOverrides.People       || "People",
    Products:     modeOverrides.Products     || "Products",
    Addresses:    modeOverrides.Addresses    || "Addresses",
    Services:     modeOverrides.Services     || "Services",
    Tasks:        modeOverrides.Tasks        || "Tasks",
    Transactions: modeOverrides.Transactions || "Transactions",
  };

  return (
    <div className="flex flex-col h-screen bg-slate-50 overflow-hidden">
      {showWizard && <SetupWizard onComplete={handleWizardComplete} />}
      <CommandPalette currentUser={currentUser} />
      <QuickAddButton currentUser={currentUser} />
      <IdjwiDockedPanel currentUser={currentUser} />
      <NetworkBanner />
      <TrialBannerWrapper currentUser={currentUser} />
      <div className="flex flex-1 overflow-hidden">

        {/* Mobile overlay */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Sidebar */}
        <aside
          style={{ backgroundColor: branding.secondaryColor, width: sidebarWidth, minWidth: sidebarWidth }}
          className={`fixed lg:static inset-y-0 left-0 z-50 transform transition-transform duration-300 ease-out relative shrink-0
            ${sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}
        >
          {/* Drag-to-resize handle */}
          <div
            onMouseDown={startResize}
            className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-white/20 active:bg-white/30 transition-colors z-10 group"
            title="Drag to resize"
          >
            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-1 h-8 rounded-full bg-white/10 group-hover:bg-white/30 transition-colors" />
          </div>
          <div className="flex flex-col h-full">

            {/* Logo */}
            <div className="flex items-center justify-between px-5 h-16 border-b border-white/5 shrink-0">
              <Link to={createPageUrl("CompanyGraphHome")} className="flex items-center gap-3 min-w-0">
                {branding.logoUrl ? (
                  <img src={branding.logoUrl} alt={branding.appName} className="h-7 w-auto object-contain max-w-[140px]" />
                ) : (
                  <>
                    <div
                      className="rounded-lg w-8 h-8 flex items-center justify-center shadow-md shrink-0"
                      style={{ backgroundColor: branding.primaryColor, flexShrink: 0 }}
                      >
                      <span className="text-white font-bold text-sm">{branding.appName.charAt(0).toUpperCase()}</span>
                    </div>
                    <div className="min-w-0">
                      <h1 className="text-white font-semibold text-sm tracking-tight truncate">{branding.appName}</h1>
                      {!branding.hideNewsconseen && branding.appName !== "Newsconseen" && (
                        <p className="text-slate-500 text-[9px] uppercase tracking-[0.15em]">Powered by Newsconseen</p>
                      )}
                      {branding.appName === "Newsconseen" && (
                        <p className="text-slate-500 text-[9px] uppercase tracking-[0.15em]">Business Manager</p>
                      )}
                    </div>
                  </>
                )}
              </Link>
              <button onClick={() => setSidebarOpen(false)} className="lg:hidden text-slate-400 hover:text-white transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Navigation */}
            <nav className="flex-1 px-3 py-3 overflow-y-auto">
              {currentUser && navSections.map((section, si) => {
                const sectionKey = section.section || "home";
                const LIMIT = 6;
                const allItems = section.items;
                const needsExpand = allItems.length > LIMIT;
                const isExpanded = expandedSections[sectionKey];
                const visibleItems = needsExpand && !isExpanded ? allItems.slice(0, LIMIT) : allItems;
                return (
                  <div key={si} className="mb-1">
                    {section.section && (
                      <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest px-3 mb-1 mt-3">
                        {section.section}
                      </p>
                    )}
                    {visibleItems.map((/** @type {any} */ item) => (
                      <NavItem
                        key={item.name}
                        name={item.name}
                        label={/** @type {any} */ (ADAPTIVE_LABELS)[item.name] || item.label || item.name}
                        icon={item.icon}
                        isActive={currentPageName === item.name}
                        primaryColor={branding.primaryColor}
                        onClick={() => handleNavClick(item.name)}
                        showRedDot={
                          (item.badge === "alerts" && criticalAlerts > 0) ||
                          (item.badge === "approvals" && pendingApprovals > 0)
                        }
                      />
                    ))}
                    {needsExpand && (
                      <button
                        onClick={() => toggleSection(sectionKey)}
                        className="w-full flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold text-slate-500 hover:text-slate-300 transition-colors"
                      >
                        <ChevronDown className={`w-3 h-3 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                        {isExpanded ? "Show less" : `${allItems.length - LIMIT} more`}
                      </button>
                    )}
                  </div>
                );
              })}
            </nav>

            {/* Footer */}
            <div className="shrink-0 border-t border-white/5 px-3 py-3 space-y-1">
              {/* User info + role badge */}
              {currentUser && (
                <div className="flex items-center gap-2.5 px-3 py-2 mb-1">
                  <div className="w-7 h-7 rounded-full bg-emerald-700 flex items-center justify-center text-white text-xs font-bold shrink-0">
                    {(currentUser.full_name || currentUser.email || "?")[0].toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-slate-200 truncate leading-none">{currentUser.full_name || currentUser.email}</p>
                    <div className="mt-1">
                      <span className={`text-[10px] text-white font-bold px-2 py-0.5 rounded-full ${roleBadge.color}`}>
                        {roleBadge.label}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              <Link
                to={createPageUrl("Settings")}
                onClick={() => setSidebarOpen(false)}
                className="flex items-center gap-2.5 px-3 py-2 w-full rounded-xl text-sm text-slate-400 hover:text-slate-200 hover:bg-white/5 transition-all"
              >
                <Settings className="w-4 h-4" />
                <span>Settings</span>
              </Link>
              <button
                onClick={() => setShowWizard(true)}
                className="flex items-center gap-2.5 px-3 py-2 w-full rounded-xl text-xs text-slate-500 hover:text-slate-300 hover:bg-white/5 transition-all text-left"
              >
                <span className="text-slate-500 text-xs">✏️ Rename labels</span>
              </button>
              <button
                onClick={() => authLogout()}
                className="flex items-center gap-2.5 px-3 py-2 w-full rounded-xl text-sm text-slate-400 hover:text-red-400 hover:bg-red-500/5 transition-all"
              >
                <LogOut className="w-4 h-4" />
                <span>Sign Out</span>
              </button>
            </div>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
          <header className="flex items-center h-16 px-3 sm:px-4 lg:px-8 bg-white border-b border-slate-100 shrink-0 gap-2 sm:gap-4">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 -ml-2 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="ml-1 sm:ml-2 lg:ml-0 flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
              <h2 className="text-base sm:text-lg font-semibold text-slate-800 min-w-0 truncate">{currentPageName}</h2>
              <GlobalSearchBar currentUser={currentUser} />
              {currentUser && (
                currentUser.role === "super_admin" ? (
                  <span className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-xs font-semibold shrink-0">
                    <Globe className="w-3 h-3" /> All Enterprises
                  </span>
                ) : currentUser.company_id ? (
                  <span className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold shrink-0">
                    <Building2 className="w-3 h-3" /> {currentUser.company_id}
                  </span>
                ) : null
              )}
            </div>

            {/* Empty Datamart + Smart Import + Undo */}
            <div className="hidden sm:flex items-center gap-1.5 shrink-0">
              <EmptyDatamartButton currentUser={currentUser} />
              <QuickImportButton currentUser={currentUser} />
              <UndoImportButton />
            </div>

            {/* User menu */}
            {currentUser && (
              <div className="relative">
                <button
                  onClick={() => setUserMenuOpen((o) => !o)}
                  className="flex items-center gap-2 px-1.5 sm:px-3 py-1.5 rounded-xl hover:bg-slate-50 transition-colors"
                >
                  <div className="w-7 h-7 rounded-full bg-emerald-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
                    {(currentUser.full_name || currentUser.email || "?")[0].toUpperCase()}
                  </div>
                  <div className="hidden sm:block text-left">
                    <p className="text-xs font-semibold text-slate-700 leading-none">{currentUser.full_name || "Account"}</p>
                    <p className="text-[10px] text-slate-400 leading-none mt-0.5">{currentUser.email}</p>
                  </div>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400 hidden sm:block" />
                </button>

                {userMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setUserMenuOpen(false)} />
                    <div className="absolute right-0 top-full mt-1.5 w-56 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 overflow-hidden">
                      <div className="px-4 py-3 border-b border-slate-100">
                        <p className="text-sm font-semibold text-slate-800 truncate">{currentUser.full_name || "—"}</p>
                        <p className="text-xs text-slate-400 truncate">{currentUser.email}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{currentUser.role}{currentUser.company_id ? ` · ${currentUser.company_id}` : ""}</p>
                      </div>
                      <div className="py-1.5">
                        <Link
                          to={createPageUrl("Settings")}
                          onClick={() => setUserMenuOpen(false)}
                          className="flex items-center gap-2.5 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                        >
                          <Settings className="w-4 h-4 text-slate-400" /> Account Settings
                        </Link>
                        <Link
                          to={`${createPageUrl("Settings")}#password`}
                          onClick={() => setUserMenuOpen(false)}
                          className="flex items-center gap-2.5 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                        >
                          <ShieldCheck className="w-4 h-4 text-slate-400" /> Change Password
                        </Link>
                      </div>
                      <div className="border-t border-slate-100 py-1.5">
                        <button
                          onClick={() => authLogout()}
                          className="flex items-center gap-2.5 px-4 py-2 text-sm text-rose-600 hover:bg-rose-50 transition-colors w-full text-left"
                        >
                          <LogOut className="w-4 h-4" /> Sign Out
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </header>

          <div className="flex-1 overflow-hidden flex flex-col">
            <div className="flex-1 overflow-y-auto flex flex-col">
              <div className="p-4 lg:p-8 max-w-[1600px] mx-auto w-full flex-1 flex flex-col">
                <TenantGuard currentUser={currentUser}>
                  {children}
                </TenantGuard>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
