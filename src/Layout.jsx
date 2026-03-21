import React, { useState, useEffect } from "react";
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
} from "lucide-react";
import TrialBanner from "@/components/shared/TrialBanner";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { usePermissions } from "@/components/shared/usePermissions";
import TenantGuard from "@/components/shared/TenantGuard";
import { useBranding } from "@/hooks/useBranding";
import NetworkBanner from "@/components/shared/NetworkBanner";

// ─── Role-aware nav config ────────────────────────────────────────────────────
const NAV_CONFIG = {
  super_admin: [
    {
      section: null,
      items: [{ name: "Dashboard", icon: LayoutDashboard }],
    },
    {
      section: "Platform",
      items: [
        { name: "Enterprises",   icon: Building2 },
        { name: "People",        icon: Users },
        { name: "Products",      icon: Package },
        { name: "Services",      icon: Wrench },
        { name: "Addresses",     icon: MapPin },
        { name: "Relationships", icon: Link2 },
      ],
    },
    {
      section: "Operations",
      items: [
        { name: "Tasks",        icon: CheckSquare },
        { name: "Transactions", icon: Receipt },
      ],
    },
    {
      section: "Analytics",
      items: [
        { name: "Reports",      icon: BarChart2 },
        { name: "QueryBuilder", label: "Query Builder", icon: Code2 },
      ],
    },
    {
      section: "Applications",
      items: [{ name: "Applications", icon: Grid3x3 }],
    },
    {
      section: "Admin Tools",
      items: [
        { name: "UserManagement", label: "User Management", icon: UserCog },
        { name: "Permissions",    icon: Shield },
        { name: "DataModels",     label: "Data Models",     icon: GitBranch },
        { name: "EntityGraph",    label: "Entity Graph",    icon: Network },
        { name: "Pipelines",      icon: GitBranch },
        { name: "Billing",        icon: CreditCard },
      ],
    },
  ],

  admin: [
    {
      section: null,
      items: [{ name: "Dashboard", icon: LayoutDashboard }],
    },
    {
      section: "My Organization",
      items: [
        { name: "Enterprises",   icon: Building2 },
        { name: "People",        icon: Users },
        { name: "Products",      icon: Package },
        { name: "Services",      icon: Wrench },
        { name: "Addresses",     icon: MapPin },
        { name: "Relationships", icon: Link2 },
      ],
    },
    {
      section: "Operations",
      items: [
        { name: "Tasks",        icon: CheckSquare },
        { name: "Transactions", icon: Receipt },
      ],
    },
    {
      section: "Analytics",
      items: [
        { name: "Reports",      icon: BarChart2 },
        { name: "QueryBuilder", label: "Query Builder", icon: Code2 },
      ],
    },
    {
      section: "Applications",
      items: [{ name: "Applications", icon: Grid3x3 }],
    },
    {
      section: "Admin",
      items: [
        { name: "UserManagement", label: "User Management", icon: UserCog },
        { name: "Permissions",    icon: Shield },
        { name: "EntityGraph",    label: "Entity Graph",    icon: Network },
        { name: "DataModels",     label: "Data Models",     icon: GitBranch },
        { name: "Pipelines",      icon: GitBranch },
        { name: "Billing",        icon: CreditCard },
      ],
    },
  ],

  executive: [
    {
      section: null,
      items: [{ name: "Dashboard", icon: LayoutDashboard }],
    },
    {
      section: "Intelligence",
      items: [
        { name: "Reports",      icon: BarChart2 },
        { name: "QueryBuilder", label: "Query Builder", icon: Code2 },
      ],
    },
    {
      section: "Overview",
      items: [
        { name: "Enterprises", icon: Building2 },
        { name: "People",      icon: Users },
      ],
    },
    {
      section: "Applications",
      items: [{ name: "Applications", icon: Grid3x3 }],
    },
  ],

  user: [
    {
      section: null,
      items: [{ name: "Dashboard", icon: LayoutDashboard }],
    },
    {
      section: "My Work",
      items: [{ name: "Tasks", icon: CheckSquare }],
    },
    {
      section: "Applications",
      items: [{ name: "Applications", icon: Grid3x3 }],
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
function NavItem({ name, label, icon: Icon, isActive, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium transition-all text-left ${
        isActive
          ? "bg-white/10 text-white"
          : "text-slate-400 hover:text-white hover:bg-white/5"
      }`}
    >
      <Icon className={`w-4 h-4 shrink-0 ${isActive ? "text-emerald-400" : ""}`} />
      <span className="truncate">{label || name}</span>
    </button>
  );
}

// ─── Layout ──────────────────────────────────────────────────────────────────
export default function Layout({ children, currentPageName }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    base44.auth.me().then(setCurrentUser).catch(() => {});
  }, []);

  // Auto-assign admin to their enterprise if company_id is missing
  useEffect(() => {
    if (!currentUser) return;
    if (currentUser.role === "super_admin") return;
    if (currentUser.company_id || currentUser.role !== "admin") return;

    base44.entities.Enterprise.filter({ created_by: currentUser.email })
      .then(async (enterprises) => {
        if (enterprises.length > 0) {
          await base44.auth.updateMe({ company_id: enterprises[0].id });
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

    base44.entities.Enterprise.filter({ created_by: currentUser.email })
      .then(async (enterprises) => {
        let fixed = 0;
        for (const e of enterprises) {
          if (!e.company_id) {
            await base44.entities.Enterprise.update(e.id, { company_id: currentUser.company_id });
            fixed++;
            await new Promise(r => setTimeout(r, 300));
          }
        }
        localStorage.setItem(fixKey, "true");
        if (fixed > 0) window.location.reload();
      })
      .catch(() => {});
  }, [currentUser?.company_id]);

  const branding = useBranding(currentUser);

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--brand-primary",   branding.primaryColor);
    root.style.setProperty("--brand-secondary", branding.secondaryColor);
    root.style.setProperty("--brand-accent",    branding.accentColor);
  }, [branding.primaryColor, branding.secondaryColor, branding.accentColor]);

  const { data: trialEnterprises = [] } = useQuery({
    queryKey: ["trial_enterprise", currentUser?.company_id],
    queryFn: () => base44.entities.Enterprise.filter({ enterprise_name: currentUser.company_id }),
    enabled: !!currentUser?.company_id && currentUser?.role !== "super_admin",
  });
  const trialEnterprise = trialEnterprises.find((e) => e.enterprise_name === currentUser?.company_id) || trialEnterprises[0];

  // Build role-aware nav sections
  const role = currentUser?.role || "user";
  const navSections = NAV_CONFIG[role] || NAV_CONFIG.user;
  const roleBadge = ROLE_BADGE[role] || ROLE_BADGE.user;

  const handleNavClick = (pageName) => {
    navigate(createPageUrl(pageName));
    setSidebarOpen(false);
  };

  return (
    <div className="flex flex-col h-screen bg-slate-50 overflow-hidden">
      <NetworkBanner />
      <TrialBanner enterprise={trialEnterprise} userRole={currentUser?.role} />
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
          className={`fixed lg:static inset-y-0 left-0 z-50 w-64 bg-slate-950 transform transition-transform duration-300 ease-out
            ${sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}
        >
          <div className="flex flex-col h-full">

            {/* Logo */}
            <div className="flex items-center justify-between px-5 h-16 border-b border-white/5 shrink-0">
              <Link to={createPageUrl("Dashboard")} className="flex items-center gap-3 min-w-0">
                {branding.logoUrl ? (
                  <img src={branding.logoUrl} alt={branding.appName} className="h-7 w-auto object-contain max-w-[140px]" />
                ) : (
                  <>
                    <div
                      className="rounded-lg w-8 h-8 flex items-center justify-center shadow-md shrink-0"
                      style={{ backgroundColor: branding.primaryColor }}
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
              {currentUser && navSections.map((section, si) => (
                <div key={si} className="mb-1">
                  {section.section && (
                    <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest px-3 mb-1 mt-3">
                      {section.section}
                    </p>
                  )}
                  {section.items.map((item) => (
                    <NavItem
                      key={item.name}
                      name={item.name}
                      label={item.label || item.name}
                      icon={item.icon}
                      isActive={currentPageName === item.name}
                      onClick={() => handleNavClick(item.name)}
                    />
                  ))}
                </div>
              ))}
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
                onClick={() => base44.auth.logout()}
                className="flex items-center gap-2.5 px-3 py-2 w-full rounded-xl text-sm text-slate-400 hover:text-red-400 hover:bg-red-500/5 transition-all"
              >
                <LogOut className="w-4 h-4" />
                <span>Sign Out</span>
              </button>
            </div>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 flex flex-col overflow-hidden">
          <header className="flex items-center h-16 px-4 lg:px-8 bg-white border-b border-slate-100 shrink-0">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 -ml-2 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="ml-2 lg:ml-0 flex items-center gap-3 flex-1">
              <h2 className="text-lg font-semibold text-slate-800">{currentPageName}</h2>
              {currentUser && (
                currentUser.role === "super_admin" ? (
                  <span className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-xs font-semibold">
                    <Globe className="w-3 h-3" /> All Enterprises
                  </span>
                ) : currentUser.company_id ? (
                  <span className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold">
                    <Building2 className="w-3 h-3" /> {currentUser.company_id}
                  </span>
                ) : null
              )}
            </div>

            {/* User menu */}
            {currentUser && (
              <div className="relative">
                <button
                  onClick={() => setUserMenuOpen((o) => !o)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-xl hover:bg-slate-50 transition-colors"
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
                          onClick={() => base44.auth.logout()}
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