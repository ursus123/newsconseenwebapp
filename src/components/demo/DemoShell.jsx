import React, { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Brain, Database, BarChart2, ChevronRight, Menu, X, Sparkles } from "lucide-react";

const NAV = [
  {
    id: "idjwi",
    label: "Idjwi",
    sub: "AI copilot",
    icon: Brain,
    href: "/",
    color: "emerald",
  },
  {
    id: "query",
    label: "Query Builder",
    sub: "Live public data",
    icon: Database,
    href: "/query",
    color: "blue",
  },
  {
    id: "explore",
    label: "Reports",
    sub: "Sample dashboards",
    icon: BarChart2,
    href: "/explore",
    color: "violet",
  },
];

const COLOR = {
  emerald: { active: "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20", dot: "bg-emerald-400" },
  blue:    { active: "bg-blue-500/15 text-blue-400 border border-blue-500/20",         dot: "bg-blue-400" },
  violet:  { active: "bg-violet-500/15 text-violet-400 border border-violet-500/20",   dot: "bg-violet-400" },
};

function NavItem({ item, isActive, onClick }) {
  const { label, sub, icon: Icon, color } = item;
  const c = COLOR[color];
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all group ${
        isActive ? c.active : "text-slate-400 hover:text-white hover:bg-slate-800/60"
      }`}
    >
      <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
        isActive ? "bg-current/10" : "bg-slate-800 group-hover:bg-slate-700"
      }`}>
        <Icon className="w-3.5 h-3.5" />
      </div>
      <div className="flex-1 text-left min-w-0">
        <div className="text-[13px] font-semibold leading-tight">{label}</div>
        <div className={`text-[10px] leading-tight ${isActive ? "opacity-70" : "text-slate-600 group-hover:text-slate-500"}`}>{sub}</div>
      </div>
      {isActive && <ChevronRight className="w-3 h-3 opacity-50 shrink-0" />}
    </button>
  );
}

export default function DemoShell({ children, active: activeProp }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isActive = (href) =>
    href === "/" ? location.pathname === "/" : location.pathname.startsWith(href);

  const Sidebar = ({ onNav }) => (
    <div className="flex flex-col h-full">
      <div className="px-3 pt-5 pb-2">
        <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest px-1 mb-3">
          Demo platform
        </p>
        <div className="space-y-1">
          {NAV.map((item) => (
            <NavItem
              key={item.id}
              item={item}
              isActive={isActive(item.href)}
              onClick={() => { navigate(item.href); onNav?.(); }}
            />
          ))}
        </div>
      </div>

      <div className="mt-4 mx-3 px-3 py-2.5 bg-slate-800/40 border border-slate-700/40 rounded-xl">
        <div className="flex items-center gap-2 mb-1.5">
          <Sparkles className="w-3 h-3 text-emerald-400" />
          <span className="text-[11px] font-semibold text-slate-300">All tools active</span>
        </div>
        <p className="text-[10px] text-slate-500 leading-relaxed">
          Live market data · Idjwi copilot · Query engine · No signup needed
        </p>
      </div>

      <div className="flex-1" />

      <div className="p-3 border-t border-slate-800/60">
        <button
          onClick={() => { navigate("/onboarding"); onNav?.(); }}
          className="w-full bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold py-2.5 rounded-xl transition-colors shadow-lg shadow-emerald-500/20"
        >
          Use with your data →
        </button>
        <p className="text-[10px] text-slate-600 text-center mt-2">
          Free to start · No card needed
        </p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#050b18] text-white">

      {/* ── Top nav ─────────────────────────────────────────────────────── */}
      <nav className="fixed top-0 left-0 right-0 z-50 h-14 flex items-center justify-between px-4
                      bg-[#050b18]/90 backdrop-blur-xl border-b border-slate-800/60">
        <div className="flex items-center gap-3">
          <button
            className="md:hidden text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors"
            onClick={() => setMobileOpen((o) => !o)}
          >
            {mobileOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>

          <div
            className="flex items-center gap-2.5 cursor-pointer"
            onClick={() => navigate("/")}
          >
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/30 shrink-0">
              <span className="text-white font-black text-xs">N</span>
            </div>
            <span className="font-bold text-white text-sm tracking-tight">Newsconseen</span>
          </div>

          <span className="hidden sm:inline-flex items-center gap-1.5 text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-2.5 py-1 ml-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Live demo · No signup required
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate("/app")}
            className="text-xs text-slate-400 hover:text-white transition-colors px-3 py-1.5"
          >
            Sign in
          </button>
          <button
            onClick={() => navigate("/onboarding")}
            className="text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white px-3.5 py-2 rounded-xl transition-colors shadow-lg shadow-emerald-500/20"
          >
            Get started
          </button>
        </div>
      </nav>

      {/* ── Desktop sidebar ──────────────────────────────────────────────── */}
      <aside className="hidden md:block fixed top-14 left-0 bottom-0 w-52 bg-slate-950/80 backdrop-blur border-r border-slate-800/60 z-40 overflow-y-auto">
        <Sidebar />
      </aside>

      {/* ── Mobile sidebar ───────────────────────────────────────────────── */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute top-14 left-0 bottom-0 w-56 bg-slate-950 border-r border-slate-800 overflow-y-auto">
            <Sidebar onNav={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      {/* ── Main content ─────────────────────────────────────────────────── */}
      <main className="md:ml-52 pt-14 min-h-screen overflow-x-hidden">
        {children}
      </main>
    </div>
  );
}
