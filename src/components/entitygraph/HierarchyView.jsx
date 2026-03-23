import React, { useState, useMemo } from "react";
import { ChevronDown } from "lucide-react";

const AGRICULTURAL_TYPES = ["agriculture", "farm", "livestock", "animal_barn", "aquaculture"];

export default function HierarchyView({ enterprises, people, services, products, tasks, transactions, addresses, relationships, selectedEnterprise }) {
  const [expanded, setExpanded] = useState(new Set());

  const visibleEnterprises = selectedEnterprise === "all"
    ? enterprises
    : enterprises.filter(e => e.id === selectedEnterprise);

  const rootEnterprise = visibleEnterprises.find(e => e.id === e.company_id);
  const parentEnterprises = rootEnterprise
    ? [rootEnterprise, ...visibleEnterprises.filter(e => e.id !== rootEnterprise.id)]
    : visibleEnterprises.filter(e => !e.parent_enterprise_id);
  const childrenOf = (parentId) => visibleEnterprises.filter(e => e.parent_enterprise_id === parentId && e.id !== parentId);

  const toggleExpand = (id) => {
    setExpanded(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  };

  // Build enterprise→person names map via Relationships
  const enterprisePeopleNames = useMemo(() => {
    const map = {};
    relationships.filter(r => r.relationship_type === "person_enterprise" && r.status !== "ended" && r.enterprise_name && r.person_name).forEach(r => {
      if (!map[r.enterprise_name]) map[r.enterprise_name] = new Set();
      map[r.enterprise_name].add(r.person_name.trim());
    });
    return map;
  }, [relationships]);

  // Build enterprise→service names map via Relationships
  const enterpriseServiceNames = useMemo(() => {
    const map = {};
    relationships.filter(r => r.relationship_type === "enterprise_service" && r.status !== "ended" && r.enterprise_name && r.service_name).forEach(r => {
      if (!map[r.enterprise_name]) map[r.enterprise_name] = new Set();
      map[r.enterprise_name].add(r.service_name.trim());
    });
    return map;
  }, [relationships]);

  // Build person name→person record map for fast lookup
  const peopleByName = useMemo(() => {
    const map = {};
    people.forEach(p => { map[`${p.first_name} ${p.last_name}`.trim()] = p; });
    return map;
  }, [people]);

  const getPeopleForEnterprise = (enterpriseName) => {
    const names = enterprisePeopleNames[enterpriseName] || new Set();
    return [...names].map(n => peopleByName[n]).filter(Boolean);
  };

  const statsFor = (enterpriseName) => {
    const entPeople = getPeopleForEnterprise(enterpriseName);
    const staff = entPeople.filter(p => ["employee", "contractor", "freelancer"].includes(p.person_type) && p.status === "active");
    // Participants are humans only (clients, patients, students, members, etc.)
    const clients = entPeople.filter(p => ["client", "patient", "student", "member", "beneficiary", "resident", "customer"].includes(p.person_type) && p.status === "active");

    const addrs = addresses.filter(a => {
      const linked = a.linked_enterprises || [];
      return linked.some(le => le.enterprise_name === enterpriseName && le.active !== false);
    });

    const svcNames = enterpriseServiceNames[enterpriseName] || new Set();
    const svcs = services.filter(s => svcNames.has((s.name || s.service_name || "").trim()));

    const recentTasks = tasks.filter(t => {
      const d = new Date(t.scheduled_date || t.created_date);
      return t.enterprise === enterpriseName && (new Date() - d) / (1000 * 60 * 60 * 24) <= 30;
    });
    const completedTasks = recentTasks.filter(t => t.status === "completed");
    const revenue = transactions
      .filter(t => t.enterprise === enterpriseName && t.payment_status === "paid")
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

  const EnterpriseCard = ({ enterprise, depth = 0, isRoot = false }) => {
    const stats = statsFor(enterprise.enterprise_name);
    const children = childrenOf(enterprise.id);
    const isExpanded = expanded.has(enterprise.id);
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
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-bold text-slate-800">{enterprise.enterprise_name}</h3>
                  {isRoot && (
                    <span className="text-[10px] bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded-full font-bold">👑 Parent Enterprise</span>
                  )}
                </div>
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

  if (visibleEnterprises.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center px-8">
        <div className="text-5xl mb-4">🏢</div>
        <h3 className="text-base font-bold text-slate-700 mb-2">No enterprises yet</h3>
        <p className="text-sm text-slate-400 max-w-xs mb-4">Create your first enterprise to see the hierarchy here.</p>
        <p className="text-xs text-indigo-500 font-medium">Go to Enterprises page to get started</p>
      </div>
    );
  }

  return (
    <div className="p-6 overflow-auto h-full">
      <div className="max-w-4xl mx-auto">
        <p className="text-xs text-slate-400 mb-6">Click any enterprise to expand its details. Child enterprises appear indented below their parent.</p>
        {parentEnterprises.map(e => <EnterpriseCard key={e.id} enterprise={e} isRoot={e.id === rootEnterprise?.id} />)}
      </div>
    </div>
  );
}