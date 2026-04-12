import React, { useState } from "react";
import { Lock, Eye, EyeOff, Shield, Users, CheckSquare, Receipt, BarChart2, Package, TrendingUp, AlertTriangle } from "lucide-react";

const ADMIN_METRICS = [
  { label: "Total Revenue", value: "$142,800", change: "+12%", color: "text-emerald-400", bg: "bg-emerald-500/10", icon: Receipt },
  { label: "Net Profit", value: "$38,200", change: "+8%", color: "text-blue-400", bg: "bg-blue-500/10", icon: TrendingUp },
  { label: "Staff Cost", value: "$67,400", change: "-3%", color: "text-amber-400", bg: "bg-amber-500/10", icon: Users },
  { label: "Active Alerts", value: "4 critical", change: "Review", color: "text-rose-400", bg: "bg-rose-500/10", icon: AlertTriangle },
];

const STAFF_METRICS = [
  { label: "My Tasks Today", value: "8 open", change: "3 due soon", color: "text-emerald-400", bg: "bg-emerald-500/10", icon: CheckSquare },
  { label: "Completed This Week", value: "24 tasks", change: "+6 vs last", color: "text-blue-400", bg: "bg-blue-500/10", icon: CheckSquare },
  { label: "Stock Alerts", value: "2 items low", change: "Action needed", color: "text-amber-400", bg: "bg-amber-500/10", icon: Package },
];

const ADMIN_APPS = [
  { name: "Reports & Analytics", icon: BarChart2, color: "bg-blue-500", desc: "Revenue, KPIs, trends" },
  { name: "User Management", icon: Users, color: "bg-violet-500", desc: "Roles, access, invites" },
  { name: "Transactions", icon: Receipt, color: "bg-emerald-500", desc: "Full financial ledger" },
  { name: "Alerts & Thresholds", icon: AlertTriangle, color: "bg-rose-500", desc: "Operational monitoring" },
];

const STAFF_APPS = [
  { name: "My Tasks", icon: CheckSquare, color: "bg-emerald-500", desc: "Assigned work items" },
  { name: "Stock Counter", icon: Package, color: "bg-orange-500", desc: "Inventory counts" },
];

export default function RoleDashboardPreview() {
  const [activeRole, setActiveRole] = useState("admin");
  const isAdmin = activeRole === "admin";

  const metrics = isAdmin ? ADMIN_METRICS : STAFF_METRICS;
  const apps = isAdmin ? ADMIN_APPS : STAFF_APPS;

  return (
    <section className="py-24">
      <div className="max-w-6xl mx-auto px-6">
        <div className="text-center mb-14">
          <p className="text-violet-400 text-xs font-bold tracking-widest uppercase mb-3">Role-Based Access</p>
          <h2 className="text-4xl font-black text-white mb-4">Every user sees only what they need</h2>
          <p className="text-slate-400 text-lg max-w-xl mx-auto">
            Fine-grained permissions mean sensitive financial and performance data stays private. Staff see their work. Admins see everything.
          </p>
        </div>

        {/* Role Toggle */}
        <div className="flex justify-center mb-10">
          <div className="flex items-center gap-1 bg-slate-900 border border-white/10 rounded-2xl p-1.5">
            <button
              onClick={() => setActiveRole("admin")}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                isAdmin ? "bg-violet-500 text-white shadow-md shadow-violet-500/30" : "text-slate-400 hover:text-white"
              }`}
            >
              <Shield className="w-4 h-4" /> Admin View
            </button>
            <button
              onClick={() => setActiveRole("staff")}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                !isAdmin ? "bg-emerald-500 text-white shadow-md shadow-emerald-500/30" : "text-slate-400 hover:text-white"
              }`}
            >
              <Users className="w-4 h-4" /> Staff View
            </button>
          </div>
        </div>

        {/* Dashboard Preview Card */}
        <div className={`relative bg-slate-900 border rounded-3xl overflow-hidden transition-all duration-500 ${isAdmin ? "border-violet-500/30" : "border-emerald-500/30"}`}>
          {/* Header bar */}
          <div className={`px-6 py-4 border-b border-white/5 flex items-center justify-between ${isAdmin ? "bg-violet-500/5" : "bg-emerald-500/5"}`}>
            <div className="flex items-center gap-3">
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${isAdmin ? "bg-violet-500" : "bg-emerald-500"}`}>
                {isAdmin ? <Shield className="w-4 h-4 text-white" /> : <Users className="w-4 h-4 text-white" />}
              </div>
              <div>
                <p className="text-white font-bold text-sm">{isAdmin ? "Admin Dashboard" : "Staff Dashboard"}</p>
                <p className="text-slate-500 text-xs">{isAdmin ? "Full organizational visibility" : "Personal work overview"}</p>
              </div>
            </div>
            <span className={`text-xs font-bold px-3 py-1 rounded-full ${isAdmin ? "bg-violet-500/20 text-violet-300" : "bg-emerald-500/20 text-emerald-300"}`}>
              {isAdmin ? "Admin" : "Staff"}
            </span>
          </div>

          <div className="p-6">
            {/* Metrics */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              {metrics.map((m) => (
                <div key={m.label} className={`${m.bg} rounded-2xl p-4 border border-white/5`}>
                  <div className="flex items-center gap-2 mb-2">
                    <m.icon className={`w-4 h-4 ${m.color}`} />
                    <p className="text-slate-400 text-xs">{m.label}</p>
                  </div>
                  <p className={`text-xl font-black ${m.color}`}>{m.value}</p>
                  <p className="text-slate-500 text-[10px] mt-0.5">{m.change}</p>
                </div>
              ))}
              {/* Hidden metrics for staff */}
              {!isAdmin && (
                <div className="bg-slate-800/50 rounded-2xl p-4 border border-white/5 flex flex-col items-center justify-center gap-2 opacity-50">
                  <Lock className="w-5 h-5 text-slate-600" />
                  <p className="text-slate-600 text-xs text-center">Financial data<br />restricted</p>
                </div>
              )}
            </div>

            {/* Apps Grid */}
            <div>
              <p className="text-slate-500 text-xs font-semibold uppercase tracking-widest mb-4">Available Apps</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {apps.map((app) => (
                  <div key={app.name} className="bg-slate-800/60 border border-white/5 rounded-xl p-4 hover:border-white/15 transition-all">
                    <div className={`w-9 h-9 rounded-xl ${app.color} flex items-center justify-center mb-2.5`}>
                      <app.icon className="w-4 h-4 text-white" />
                    </div>
                    <p className="text-white text-xs font-semibold">{app.name}</p>
                    <p className="text-slate-500 text-[10px] mt-0.5">{app.desc}</p>
                  </div>
                ))}
                {/* Locked apps for staff */}
                {!isAdmin && (
                  <>
                    {["Reports & Analytics", "Transactions", "User Management"].map((name) => (
                      <div key={name} className="bg-slate-900/50 border border-white/5 rounded-xl p-4 opacity-40 relative overflow-hidden">
                        <div className="w-9 h-9 rounded-xl bg-slate-700 flex items-center justify-center mb-2.5">
                          <Lock className="w-4 h-4 text-slate-500" />
                        </div>
                        <p className="text-slate-600 text-xs font-semibold">{name}</p>
                        <p className="text-slate-700 text-[10px] mt-0.5">Admin only</p>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        <p className="text-center text-slate-600 text-xs mt-6">Permissions are configured per-role in Settings → Permissions. No code required.</p>
      </div>
    </section>
  );
}