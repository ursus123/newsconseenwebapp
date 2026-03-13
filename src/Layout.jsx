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
  Network } from
"lucide-react";
import { base44 } from "@/api/base44Client";
import { usePermissions, DEFAULT_PAGES } from "@/components/shared/usePermissions";
import { useQuery } from "@tanstack/react-query";

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
  { name: "Reports", icon: FileBarChart, page: "Reports" }]

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
  { name: "Permissions", icon: ShieldCheck, page: "Permissions" }]

}];


export default function Layout({ children, currentPageName }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [darkMode, setDarkMode] = useState(() => {
    return localStorage.getItem("darkMode") === "true";
  });

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    localStorage.setItem("darkMode", darkMode);
  }, [darkMode]);

  useEffect(() => {
    base44.auth.me().then(setCurrentUser).catch(() => {});
  }, []);

  const { allowedPages } = usePermissions(currentUser);

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
    <div className="flex h-screen bg-slate-50 dark:bg-slate-900 overflow-hidden">
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
            <Link to={createPageUrl("Dashboard")} className="flex items-center gap-3">
              <div className="bg-[#e089fa] rounded-xl w-10 h-10 from-emerald-400 to-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
                <span className="text-white font-bold text-lg">N</span>
              </div>
              <div>
                <h1 className="text-white font-semibold text-lg tracking-tight">Newsconseen</h1>
                <p className="text-slate-500 text-[10px] uppercase tracking-[0.2em]">Business Manager</p>
              </div>
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
          <div className="px-4 py-4 border-t border-white/5">
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
        <header className="flex items-center h-16 px-4 lg:px-8 bg-white dark:bg-slate-950 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden p-2 -ml-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">

            <Menu className="w-5 h-5" />
          </button>
          <div className="ml-2 lg:ml-0 flex items-center gap-3">
            <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">{currentPageName}</h2>
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
          <div className="ml-auto">
            <button
              onClick={() => setDarkMode(!darkMode)}
              className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              title="Toggle dark mode"
            >
              {darkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto bg-slate-50 dark:bg-slate-900">
          <div className="p-4 lg:p-8 max-w-[1600px] mx-auto w-full">
            {children}
          </div>
        </div>
      </main>
    </div>);

}