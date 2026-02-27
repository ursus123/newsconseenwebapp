import React from "react";
import { Lock } from "lucide-react";

const PAGE_GROUPS = [
  { key: "overview",     label: "Overview",        color: "text-slate-500",  pages: ["Dashboard"] },
  { key: "setup",        label: "Layer 1 — Master Data", color: "text-purple-600", pages: ["Enterprises", "People", "Products", "Services", "Addresses"] },
  { key: "connections",  label: "Layer 2 — Relationships", color: "text-blue-600",  pages: ["Relationships"] },
  { key: "operations",   label: "Layer 3 — Tasks",  color: "text-sky-600",   pages: ["Tasks"] },
  { key: "ledger",       label: "Layer 4 — Transactions", color: "text-rose-600",  pages: ["Transactions"] },
  { key: "intelligence", label: "Layer 5 — Dashboards & Reports", color: "text-amber-600", pages: ["Reports", "Applications"] },
  { key: "apps",         label: "Apps",             color: "text-teal-600",   pages: ["ClockInOut", "MedAdmin"] },
  { key: "admin",        label: "Admin",            color: "text-emerald-600", pages: ["UserManagement", "InviteUser", "Permissions"] },
];

const PAGE_LABELS = {
  Dashboard: "Dashboard", Enterprises: "Enterprises", People: "People",
  Products: "Products", Services: "Services", Addresses: "Addresses",
  Relationships: "Relationships", Tasks: "Tasks", Transactions: "Transactions",
  Reports: "Reports", Applications: "Applications", ClockInOut: "Clock In/Out",
  MedAdmin: "Med Administration", UserManagement: "User Management",
  InviteUser: "Invite User", Permissions: "Permissions",
};

export default function PageAccessPanel({ selected, onChange, available, locked = [] }) {
  return (
    <div className="space-y-4">
      {PAGE_GROUPS.map(({ key, label, color, pages }) => {
        const visiblePages = pages.filter((p) => available.includes(p));
        if (visiblePages.length === 0) return null;
        return (
          <div key={key}>
            <p className={`text-[10px] font-bold uppercase tracking-widest mb-2 ${color}`}>{label}</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {visiblePages.map((pageKey) => {
                const isLocked = locked.includes(pageKey);
                const checked = selected.includes(pageKey);
                return (
                  <button
                    key={pageKey}
                    disabled={isLocked}
                    onClick={() => !isLocked && onChange(pageKey)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-medium transition-all text-left
                      ${isLocked
                        ? "opacity-40 cursor-not-allowed bg-slate-50 border-slate-100 text-slate-400"
                        : checked
                          ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                          : "bg-white border-slate-200 text-slate-400 hover:border-slate-300"
                      }`}
                  >
                    <div className={`w-2 h-2 rounded-full shrink-0 ${isLocked ? "bg-slate-200" : checked ? "bg-emerald-500" : "bg-slate-200"}`} />
                    {PAGE_LABELS[pageKey] || pageKey}
                    {isLocked && <Lock className="w-3 h-3 ml-auto" />}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}