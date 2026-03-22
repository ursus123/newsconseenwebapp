import React, { useState } from "react";
import { ChevronDown } from "lucide-react";

export default function HierarchyView({ enterprises, people, services, products, tasks, transactions, addresses, selectedEnterprise }) {
  const [expanded, setExpanded] = useState(new Set());

  const visibleEnterprises = selectedEnterprise === "all"
    ? enterprises
    : enterprises.filter(e => e.id === selectedEnterprise);

  const parentEnterprises = visibleEnterprises.filter(e => !e.parent_enterprise_id || e.id === e.parent_enterprise_id);
  const childrenOf = (parentId) => visibleEnterprises.filter(e => e.parent_enterprise_id === parentId && e.id !== parentId);

  const toggleExpand = (id) => {
    setExpanded(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  };

  const statsFor = (enterpriseName) => {
    const staff = people.filter(p => p.enterprise === enterpriseName && p.person_type === "employee" && p.status === "active");
    const clients = people.filter(p => p.enterprise === enterpriseName && p.person_type === "client" && p.status === "active");
    const addrs = addresses.filter(a => a.enterprise === enterpriseName);
    const svcs = services.filter(s => s.enterprise === enterpriseName || !s.enterprise);
    const recentTasks = tasks.filter(t => {
      const d = new Date(t.scheduled_date || t.created_date);
      return t.enterprise === enterpriseName && (new Date() - d) / (1000 * 60 * 60 * 24) <= 30;
    });
    const completedTasks = recentTasks.filter(t => t.status === "completed");
    const revenue = transactions
      .filter(t => t.enterprise === enterpriseName && t.transaction_type === "sale_service" && t.payment_status === "paid")
      .reduce((sum, t) => sum + (t.amount || 0), 0);
    const completionRate = recentTasks.length > 0 ? Math.round(completedTasks.length / recentTasks.length * 100) : null;

    let health = 0;
    if (staff.length > 0) health += 20;
    if (clients.length > 0) health += 20;
    if (addrs.length > 0) health += 15;
    if (svcs.length > 0) health += 15;
    if (recentTasks.length > 0) health += 15;
    if (revenue > 0) health += 15;

    return { staff, clients, addrs, svcs, recentTasks, completionRate, revenue, health };
  };

  const EnterpriseCard = ({ enterprise, depth = 0 }) => {
    const stats = statsFor(enterprise.enterprise_name);
    const children = childrenOf(enterprise.id);
    const isExpanded = expanded.has(enterprise.id);
    const healthColor = stats.health >= 75 ? "emerald" : stats.health >= 50 ? "amber" : "rose";
    const healthBg = stats.health >= 75 ? "bg-emerald-50 border-emerald-100" : stats.health >= 50 ? "bg-amber-50 border-amber-100" : "bg-rose-50 border-rose-100";
    const healthText = stats.health >= 75 ? "text-emerald-600" : stats.health >= 50 ? "text-amber-600" : "text-rose-600";
    const healthSubText = stats.health >= 75 ? "text-emerald-400" : stats.health >= 50 ? "text-amber-400" : "text-rose-400";

    return (
      <div className={depth > 0 ? "ml-8 border-l-2 border-slate-100 pl-4" : ""}>
        <div
          className={`bg-white border border-slate-200 rounded-2xl p-4 mb-3 hover:shadow-md transition-all cursor-pointer ${selectedEnterprise === enterprise.id ? "ring-2 ring-indigo-300" : ""}`}
          onClick={() => toggleExpand(enterprise.id)}
        >
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl ${healthBg} border flex items-center justify-center text-lg shrink-0`}>🏢</div>
              <div>
                <h3 className="font-bold text-slate-800">{enterprise.enterprise_name}</h3>
                <p className="text-xs text-slate-400">
                  {enterprise.enterprise_type || "Enterprise"}
                  {enterprise.city && ` · ${enterprise.city}`}
                  {enterprise.region && `, ${enterprise.region}`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <div className={`text-center px-3 py-1 rounded-xl ${healthBg} border`}>
                <p className={`text-lg font-black ${healthText}`}>{stats.health}</p>
                <p className={`text-[9px] font-bold ${healthSubText} uppercase`}>Health</p>
              </div>
              <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
            </div>
          </div>

          <div className="grid grid-cols-5 gap-2">
            {[
              { icon: "👤", value: stats.staff.length, label: "Staff" },
              { icon: "🤝", value: stats.clients.length, label: "Clients" },
              { icon: "📍", value: stats.addrs.length, label: "Locations" },
              { icon: "⚙️", value: stats.svcs.length, label: "Services" },
              { icon: "✅", value: stats.completionRate !== null ? `${stats.completionRate}%` : "—", label: "Tasks" },
            ].map((kpi, i) => (
              <div key={i} className="text-center bg-slate-50 rounded-xl py-2">
                <p className="text-sm">{kpi.icon}</p>
                <p className="text-sm font-bold text-slate-700">{kpi.value}</p>
                <p className="text-[9px] text-slate-400">{kpi.label}</p>
              </div>
            ))}
          </div>

          {stats.revenue > 0 && (
            <div className="mt-2 flex items-center gap-2 bg-emerald-50 rounded-xl px-3 py-2">
              <span className="text-xs text-emerald-600">💰 30-day revenue:</span>
              <span className="text-sm font-bold text-emerald-700">${stats.revenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
            </div>
          )}
        </div>

        {isExpanded && (
          <div className="mb-3 ml-4 space-y-2">
            {stats.staff.length > 0 && (
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-3">
                <p className="text-xs font-bold text-blue-700 mb-2">👥 Staff ({stats.staff.length})</p>
                <div className="flex flex-wrap gap-1">
                  {stats.staff.slice(0, 10).map(p => (
                    <span key={p.id} className="text-[10px] bg-white border border-blue-100 text-blue-600 px-2 py-0.5 rounded-full">
                      {p.first_name} {p.last_name}{p.primary_role && ` · ${p.primary_role}`}
                    </span>
                  ))}
                  {stats.staff.length > 10 && <span className="text-[10px] text-blue-400">+{stats.staff.length - 10} more</span>}
                </div>
              </div>
            )}
            {stats.clients.length > 0 && (
              <div className="bg-purple-50 border border-purple-100 rounded-xl p-3">
                <p className="text-xs font-bold text-purple-700 mb-2">🤝 Clients ({stats.clients.length})</p>
                <div className="flex flex-wrap gap-1">
                  {stats.clients.slice(0, 8).map(p => (
                    <span key={p.id} className="text-[10px] bg-white border border-purple-100 text-purple-600 px-2 py-0.5 rounded-full">
                      {p.first_name} {p.last_name}
                    </span>
                  ))}
                  {stats.clients.length > 8 && <span className="text-[10px] text-purple-400">+{stats.clients.length - 8} more</span>}
                </div>
              </div>
            )}
            {stats.addrs.length > 0 && (
              <div className="bg-amber-50 border border-amber-100 rounded-xl p-3">
                <p className="text-xs font-bold text-amber-700 mb-2">📍 Locations ({stats.addrs.length})</p>
                <div className="space-y-1">
                  {stats.addrs.map(a => (
                    <div key={a.id} className="text-[10px] text-amber-700">{a.label || a.address_line1}{a.city && ` · ${a.city}`}</div>
                  ))}
                </div>
              </div>
            )}
            {stats.svcs.length > 0 && (
              <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3">
                <p className="text-xs font-bold text-emerald-700 mb-2">⚙️ Services ({stats.svcs.length})</p>
                <div className="flex flex-wrap gap-1">
                  {stats.svcs.map(s => (
                    <span key={s.id} className="text-[10px] bg-white border border-emerald-100 text-emerald-600 px-2 py-0.5 rounded-full">{s.name || s.service_name}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {children.map(child => <EnterpriseCard key={child.id} enterprise={child} depth={depth + 1} />)}
      </div>
    );
  };

  if (parentEnterprises.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="text-5xl mb-3">🏢</div>
        <p className="text-slate-400 text-sm">No enterprises to display.</p>
      </div>
    );
  }

  return (
    <div className="p-6 overflow-auto h-full">
      <div className="max-w-4xl mx-auto">
        <p className="text-xs text-slate-400 mb-6">Click any enterprise to expand its details. Child enterprises appear indented below their parent.</p>
        {parentEnterprises.map(e => <EnterpriseCard key={e.id} enterprise={e} />)}
      </div>
    </div>
  );
}