import React, { useState, useMemo } from "react";
import { ChevronDown } from "lucide-react";
import {
  isAgricultural, getLivestock, getFeed,
  getLivestockUnit, isStaff, isParticipant,
} from "./enterpriseHelpers";

export default function HierarchyView({ enterprises, people, services, products, tasks, transactions, addresses, relationships, selectedEnterprise }) {
  const [expanded, setExpanded] = useState(new Set());

  const visibleEnterprises = selectedEnterprise === "all"
    ? enterprises
    : enterprises.filter(e => e.id === selectedEnterprise);

  // Root = enterprises with no parent_enterprise_id (or whose parent isn't in the visible set)
  const visibleIds = new Set(visibleEnterprises.map(e => e.id));
  const rootEnterprises = visibleEnterprises.filter(e =>
    !e.parent_enterprise_id || !visibleIds.has(e.parent_enterprise_id)
  );
  const rootEnterprise = rootEnterprises.length === 1 ? rootEnterprises[0] : null;
  const parentEnterprises = rootEnterprises;
  const childrenOf = (parentId) => visibleEnterprises.filter(e => e.parent_enterprise_id === parentId && e.id !== parentId);

  const toggleExpand = (id) => {
    setExpanded(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  };

  const enterprisePeopleNames = useMemo(() => {
    const map = {};
    relationships.filter(r => r.relationship_type === "person_enterprise" && r.status !== "ended" && r.enterprise_name && r.person_name).forEach(r => {
      if (!map[r.enterprise_name]) map[r.enterprise_name] = new Set();
      map[r.enterprise_name].add(r.person_name.trim());
    });
    return map;
  }, [relationships]);

  const enterpriseServiceNames = useMemo(() => {
    const map = {};
    relationships.filter(r => r.relationship_type === "enterprise_service" && r.status !== "ended" && r.enterprise_name && r.service_name).forEach(r => {
      if (!map[r.enterprise_name]) map[r.enterprise_name] = new Set();
      map[r.enterprise_name].add(r.service_name.trim());
    });
    return map;
  }, [relationships]);

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
    const staff = entPeople.filter(p => isStaff(p) && p.status === "active");
    const participants = entPeople.filter(p => isParticipant(p) && p.status === "active");

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
    if (staff.length > 0) health += 25;
    if (participants.length > 0) health += 15;
    if (addrs.length > 0) health += 15;
    if (svcs.length > 0) health += 15;
    if (recentTasks.length > 0) health += 15;
    if (revenue > 0) health += 15;

    return { staff, participants, addrs, svcs, recentTasks, completionRate, revenue, health };
  };

  const EnterpriseCard = ({ enterprise, depth = 0, isRoot = false }) => {
    const stats = statsFor(enterprise.enterprise_name);
    const children = childrenOf(enterprise.id);
    const isAgri = isAgricultural(enterprise);
    const entName = enterprise.enterprise_name;
    const livestock = getLivestock(products, entName);
    const feed = getFeed(products, entName);
    const totalLivestock = livestock.reduce((s, p) => s + (p.stock_quantity || 0), 0);
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
              <div className={`w-10 h-10 rounded-xl ${healthBg} border flex items-center justify-center text-lg shrink-0`}>
                {isAgri ? "🌾" : "🏢"}
              </div>
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

          {/* KPI strip */}
          <div className="grid grid-cols-5 gap-2">
            <div className="text-center bg-slate-50 rounded-xl py-2">
              <p className="text-sm">👤</p>
              <p className="text-sm font-bold text-slate-700">{stats.staff.length}</p>
              <p className="text-[9px] text-slate-400">Staff</p>
            </div>

            {/* Non-agricultural: show participants; agricultural: show livestock */}
            {!isAgri ? (
              <div className="text-center bg-slate-50 rounded-xl py-2">
                <p className="text-sm">🤝</p>
                <p className="text-sm font-bold text-slate-700">{stats.participants.length}</p>
                <p className="text-[9px] text-slate-400">Participants</p>
              </div>
            ) : (
              <div className="text-center bg-lime-50 rounded-xl py-2">
                <p className="text-sm">🐄</p>
                <p className="text-sm font-bold text-lime-700">{totalLivestock}</p>
                <p className="text-[9px] text-lime-500">Livestock</p>
              </div>
            )}

            <div className="text-center bg-slate-50 rounded-xl py-2">
              <p className="text-sm">📍</p>
              <p className="text-sm font-bold text-slate-700">{stats.addrs.length}</p>
              <p className="text-[9px] text-slate-400">Locations</p>
            </div>
            <div className="text-center bg-slate-50 rounded-xl py-2">
              <p className="text-sm">⚙️</p>
              <p className="text-sm font-bold text-slate-700">{stats.svcs.length}</p>
              <p className="text-[9px] text-slate-400">Services</p>
            </div>
            <div className="text-center bg-slate-50 rounded-xl py-2">
              <p className="text-sm">✅</p>
              <p className="text-sm font-bold text-slate-700">{stats.completionRate !== null ? `${stats.completionRate}%` : "—"}</p>
              <p className="text-[9px] text-slate-400">Tasks</p>
            </div>
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

            {/* Participants panel — non-agricultural only */}
            {!isAgri && stats.participants.length > 0 && (
              <div className="bg-purple-50 border border-purple-100 rounded-xl p-3">
                <p className="text-xs font-bold text-purple-700 mb-2">🤝 Participants ({stats.participants.length})</p>
                <div className="flex flex-wrap gap-1">
                  {stats.participants.slice(0, 8).map(p => (
                    <span key={p.id} className="text-[10px] bg-white border border-purple-100 text-purple-600 px-2 py-0.5 rounded-full">
                      {p.first_name} {p.last_name}
                    </span>
                  ))}
                  {stats.participants.length > 8 && <span className="text-[10px] text-purple-400">+{stats.participants.length - 8} more</span>}
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

            {/* Livestock panel — agricultural only */}
            {isAgri && livestock.length > 0 && (
              <div className="bg-lime-50 border border-lime-100 rounded-xl p-3">
                <p className="text-xs font-bold text-lime-700 mb-2">🐄 Livestock — {totalLivestock} total</p>
                <div className="flex flex-wrap gap-1 mb-2">
                  {livestock.map(p => (
                    <span key={p.id} className="text-[10px] bg-white border border-lime-100 text-lime-600 px-2 py-0.5 rounded-full">
                      {p.name}: {p.stock_quantity} {getLivestockUnit(p)}
                      {p.stock_quantity != null && p.min_stock_level != null && p.stock_quantity <= p.min_stock_level ? " ⚠️" : ""}
                    </span>
                  ))}
                </div>
                {feed.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-lime-100">
                    <p className="text-[10px] font-bold text-lime-600 mb-1">Feed inventory:</p>
                    {feed.map(f => {
                      const isLow = f.stock_quantity != null && f.min_stock_level != null && f.stock_quantity <= f.min_stock_level;
                      return (
                        <div key={f.id} className="flex items-center justify-between text-[10px]">
                          <span className="text-lime-600">{f.name}</span>
                          <span className={`font-bold ${isLow ? "text-rose-500" : "text-lime-600"}`}>
                            {f.stock_quantity} {f.unit || "kg"}{isLow && " ⚠️ LOW"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
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