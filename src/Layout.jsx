import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import {
  LayoutDashboard,
  Users,
  Package,
  Wrench,
  ArrowLeftRight,
  ClipboardList,
  FileBarChart,
  Building2,
  MapPin,
  Menu,
  X,
  ChevronRight,
  LogOut,
  Link2,
  ShieldCheck,
  Globe,
  Database,
  GitBranch,
  Network,
  CreditCard,
  Settings,
  ChevronDown,
} from "lucide-react";
import TrialBanner from "@/components/shared/TrialBanner";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { usePermissions, DEFAULT_PAGES } from "@/components/shared/usePermissions";
import TenantGuard from "@/components/shared/TenantGuard";
import { useBranding } from "@/hooks/useBranding";

// All nav items
const ALL_NAV_PHASES = [
{
  label: "Overview",
  items: [{ name: "Dashboard", icon: LayoutDashboard, page: "Dashboard" }]
},
{
  label: "Phase 1 — Setup",
  items: [
  { name: "Enterprises", icon: Building2, page: "Enterprises" },
  { name: "People", icon: Users, page: "People" },
  { name: "Products", icon: Package, page: "Products" },
  { name: "Services", icon: Wrench, page: "Services" },
  { name: "Addresses", icon: MapPin, page: "Addresses" }]

},
{
  label: "Phase 2 — Connections",
  items: [
    { name: "Relationships", icon: Link2, page: "Relationships" },
    { name: "Query Builder", icon: Database, page: "QueryBuilder" },
    { name: "Data Models", icon: GitBranch, page: "DataModels" },
    { name: "Entity Graph", icon: Network, page: "EntityGraph" },
  ]
},
{
  label: "Phase 3 — Operations",
  items: [{ name: "Tasks", icon: ClipboardList, page: "Tasks" }]
},
{
  label: "Phase 4 — Ledger",
  items: [{ name: "Transactions", icon: ArrowLeftRight, page: "Transactions" }]
},
{
  label: "Phase 5 — Intelligence",
  items: [
  { name: "Reports", icon: FileBarChart, page: "Reports" },
  { name: "Pipelines", icon: GitBranch, page: "Pipelines" }]

},
{
  label: "Apps",
  items: [
  { name: "Applications", icon: LayoutDashboard, page: "Applications" }]

},
{
  label: "Admin",
  items: [
  { name: "User Management", icon: Users, page: "UserManagement" },
  { name: "Permissions", icon: ShieldCheck, page: "Permissions" },
  { name: "Billing", icon: CreditCard, page: "Billing" }]

}];


export default function Layout({ children, currentPageName }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  useEffect(() => {
    base44.auth.me().then(setCurrentUser).catch(() => {});
  }, []);

  const branding = useBranding(currentUser);

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--brand-primary",   branding.primaryColor);
    root.style.setProperty("--brand-secondary", branding.secondaryColor);
    root.style.setProperty("--brand-accent",    branding.accentColor);
  }, [branding.primaryColor, branding.secondaryColor, branding.accentColor]);

  const { allowedPages } = usePermissions(currentUser);

  const { data: trialEnterprises = [] } = useQuery({
    queryKey: ["trial_enterprise", currentUser?.company_id],
    queryFn: () => base44.entities.Enterprise.filter({ enterprise_name: currentUser.company_id }),
    enabled: !!currentUser?.company_id && currentUser?.role !== "super_admin",
  });
  const trialEnterprise = trialEnterprises.find((e) => e.enterprise_name === currentUser?.company_id) || trialEnterprises[0];

  // While user hasn't loaded yet, show nothing (avoid flash of empty sidebar)
  const userLoaded = currentUser !== null;

  // Filter nav based on allowed pages (null = all allowed for super_admin)
  const filteredPhases = userLoaded ?
  ALL_NAV_PHASES.map((phase) => ({
    ...phase,
    items: phase.items.filter((item) => allowedPages === null || allowedPages.includes(item.page))
  })).filter((p) => p.items.length > 0) :
  [];

  return (
    <div className="flex flex-col h-screen bg-slate-50 overflow-hidden">
      <TrialBanner enterprise={trialEnterprise} userRole={currentUser?.role} />
      <div className="flex flex-1 overflow-hidden">
      {/* Mobile overlay */}
      {sidebarOpen &&
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 lg:hidden"
        onClick={() => setSidebarOpen(false)} />

      }

      {/* Sidebar */}
      <aside
        className={`fixed lg:static inset-y-0 left-0 z-50 w-72 bg-slate-950 transform transition-transform duration-300 ease-out
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}>

        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center justify-between px-6 h-20 border-b border-white/5">
            <Link to={createPageUrl("Dashboard")} className="flex items-center gap-3 min-w-0">
              {branding.logoUrl ? (
                <img src={branding.logoUrl} alt={branding.appName} className="h-8 w-auto object-contain max-w-[160px]" />
              ) : (
                <>
                  <div className="rounded-xl w-10 h-10 flex items-center justify-center shadow-lg shrink-0"
                    style={{ backgroundColor: branding.primaryColor }}>
                    <span className="text-white font-bold text-lg">{branding.appName.charAt(0).toUpperCase()}</span>
                  </div>
                  <div className="min-w-0">
                    <h1 className="text-white font-semibold text-lg tracking-tight truncate">{branding.appName}</h1>
                    {!branding.hideNewsconseen && branding.appName !== "Newsconseen" && (
                      <p className="text-slate-500 text-[10px] uppercase tracking-[0.2em]">Powered by Newsconseen</p>
                    )}
                    {branding.appName === "Newsconseen" && (
                      <p className="text-slate-500 text-[10px] uppercase tracking-[0.2em]">Business Manager</p>
                    )}
                  </div>
                </>
              )}
            </Link>
            <button onClick={() => setSidebarOpen(false)} className="lg:hidden text-slate-400 hover:text-white transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
            {filteredPhases.map((phase, pi) =>
            <div key={pi} className={pi > 0 ? "pt-3" : ""}>
                {filteredPhases.length > 1 &&
              <p className="px-4 pb-1.5 text-[9px] font-bold text-slate-600 uppercase tracking-[0.2em]">
                    {phase.label}
                  </p>
              }
                {phase.items.map((item) => {
                const isActive = currentPageName === item.page;
                return (
                  <Link
                    key={item.page}
                    to={createPageUrl(item.page)}
                    onClick={() => setSidebarOpen(false)}
                    className={`group flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200
                        ${isActive ?
                    "bg-emerald-500/10 text-emerald-400" :
                    "text-slate-400 hover:text-white hover:bg-white/5"}`
                    }>

                      <item.icon className={`w-5 h-5 transition-colors ${isActive ? "text-emerald-400" : "text-slate-500 group-hover:text-slate-300"}`} />
                      <span>{item.name}</span>
                      {isActive && <ChevronRight className="w-4 h-4 ml-auto text-emerald-400/50" />}
                    </Link>);

              })}
              </div>
            )}
          </nav>

          {/* Footer */}
          <div className="px-4 py-4 border-t border-white/5 space-y-1">
            <Link
              to={createPageUrl("Settings")}
              onClick={() => setSidebarOpen(false)}
              className="flex items-center gap-3 px-4 py-2.5 w-full rounded-xl text-sm text-slate-500 hover:text-slate-200 hover:bg-white/5 transition-all">
              <Settings className="w-4 h-4" />
              <span>Settings</span>
            </Link>
            <button
              onClick={() => base44.auth.logout()}
              className="flex items-center gap-3 px-4 py-2.5 w-full rounded-xl text-sm text-slate-500 hover:text-red-400 hover:bg-red-500/5 transition-all">
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
            className="lg:hidden p-2 -ml-2 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors">
            <Menu className="w-5 h-5" />
          </button>
          <div className="ml-2 lg:ml-0 flex items-center gap-3 flex-1">
            <h2 className="text-lg font-semibold text-slate-800">{currentPageName}</h2>
            {currentUser && (
            currentUser.role === "super_admin" ?
            <span className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-xs font-semibold">
                  <Globe className="w-3 h-3" /> All Enterprises
                </span> :
            currentUser.company_id ?
            <span className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold">
                  <Building2 className="w-3 h-3" /> {currentUser.company_id}
                </span> :
            null)
            }
          </div>

          {/* User menu */}
          {currentUser && (
            <div className="relative">
              <button
                onClick={() => setUserMenuOpen((o) => !o)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl hover:bg-slate-50 transition-colors">
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
                      <p className="text-xs text-slate-500 mt-0.5">{currentUser.role} {currentUser.company_id ? `· ${currentUser.company_id}` : ""}</p>
                    </div>
                    <div className="py-1.5">
                      <Link to={createPageUrl("Settings")} onClick={() => setUserMenuOpen(false)}
                        className="flex items-center gap-2.5 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors">
                        <Settings className="w-4 h-4 text-slate-400" /> Account Settings
                      </Link>
                      <Link to={`${createPageUrl("Settings")}#password`} onClick={() => setUserMenuOpen(false)}
                        className="flex items-center gap-2.5 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors">
                        <ShieldCheck className="w-4 h-4 text-slate-400" /> Change Password
                      </Link>
                    </div>
                    <div className="border-t border-slate-100 py-1.5">
                      <button onClick={() => base44.auth.logout()}
                        className="flex items-center gap-2.5 px-4 py-2 text-sm text-rose-600 hover:bg-rose-50 transition-colors w-full text-left">
                        <LogOut className="w-4 h-4" /> Sign Out
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </header>

        <div className="flex-1 overflow-y-auto">
          <div className="p-4 lg:p-8 max-w-[1600px] mx-auto w-full">
            <TenantGuard currentUser={currentUser}>
              {children}
            </TenantGuard>
          </div>
        </div>
      </main>
      </div>
    </div>);

}