import React, { useMemo } from "react";
import { isAgricultural, getLivestock, isStaff, isParticipant } from "./enterpriseHelpers";

export default function PeopleDistributionView({ enterprises, people, relationships, products = [], selectedEnterprise }) {
  const visibleEnterprises = selectedEnterprise === "all"
    ? enterprises
    : enterprises.filter(e => e.id === selectedEnterprise);

  const enterprisePeopleNames = useMemo(() => {
    const map = {};
    relationships.filter(r => r.relationship_type === "person_enterprise" && r.status !== "ended" && r.enterprise_name && r.person_name).forEach(r => {
      if (!map[r.enterprise_name]) map[r.enterprise_name] = new Set();
      map[r.enterprise_name].add(r.person_name.trim());
    });
    return map;
  }, [relationships]);

  const peopleByName = useMemo(() => {
    const map = {};
    people.forEach(p => { map[`${p.first_name} ${p.last_name}`.trim()] = p; });
    return map;
  }, [people]);

  const personEnterprises = useMemo(() => {
    const map = {};
    Object.entries(enterprisePeopleNames).forEach(([entName, names]) => {
      names.forEach(name => {
        const person = peopleByName[name];
        if (!person) return;
        if (!map[person.id]) map[person.id] = [];
        if (!map[person.id].includes(entName)) map[person.id].push(entName);
      });
    });
    return map;
  }, [enterprisePeopleNames, peopleByName]);

  const sharedStaff = people.filter(p => (personEnterprises[p.id] || []).length > 1);

  if (people.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center px-8">
        <div className="text-5xl mb-4">👥</div>
        <h3 className="text-base font-bold text-slate-700 mb-2">No people added yet</h3>
        <p className="text-sm text-slate-400 max-w-xs mb-4">Add staff and clients to your enterprises to see distribution here.</p>
        <p className="text-xs text-indigo-500 font-medium">Go to People page to add your team</p>
      </div>
    );
  }

  return (
    <div className="p-6 overflow-auto h-full">
      {sharedStaff.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-6">
          <p className="text-sm font-bold text-amber-700 mb-2">🔄 {sharedStaff.length} people appear in multiple enterprises</p>
          <div className="flex flex-wrap gap-2">
            {sharedStaff.map(p => (
              <span key={p.id} className="text-xs bg-white border border-amber-200 text-amber-700 px-2 py-1 rounded-xl">
                {p.first_name} {p.last_name} → {(personEnterprises[p.id] || []).join(", ")}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {visibleEnterprises.map(enterprise => {
          const entPeopleNames = enterprisePeopleNames[enterprise.enterprise_name] || new Set();
          const entPeople = [...entPeopleNames].map(n => peopleByName[n]).filter(Boolean);
          const staff = entPeople.filter(p => isStaff(p) && p.status === "active");
          const participants = entPeople.filter(p => isParticipant(p) && p.status === "active");
          const isAgri = isAgricultural(enterprise);
          const livestock = getLivestock(products, enterprise.enterprise_name);

          const roleGroups = {};
          staff.forEach(p => {
            const role = p.primary_role || "Unassigned";
            if (!roleGroups[role]) roleGroups[role] = [];
            roleGroups[role].push(p);
          });

          const ratio = !isAgri && participants.length > 0 && staff.length > 0
            ? (participants.length / staff.length).toFixed(1)
            : null;
          const ratioGood = ratio && parseFloat(ratio) <= 5;

          return (
            <div key={enterprise.id} className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
                <h3 className="font-bold text-slate-800 text-sm">{enterprise.enterprise_name}</h3>
                <div className="flex items-center gap-3 mt-1">
                  {isAgri ? (
                    <span className="text-xs text-slate-500">{staff.length} staff · {livestock.reduce((s, p) => s + (p.stock_quantity || 0), 0)} livestock head</span>
                  ) : (
                    <span className="text-xs text-slate-500">{staff.length} staff · {participants.length} participants</span>
                  )}
                  {ratio && (
                    <span className={`text-xs font-bold ${ratioGood ? "text-emerald-600" : "text-rose-500"}`}>
                      1:{ratio} ratio
                    </span>
                  )}
                </div>
              </div>

              <div className="p-4">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Staff by Role</p>
                {Object.keys(roleGroups).length === 0 ? (
                  <p className="text-xs text-slate-300 italic">No staff assigned</p>
                ) : (
                  <div className="space-y-2">
                    {Object.entries(roleGroups).sort((a, b) => b[1].length - a[1].length).map(([role, members]) => (
                      <div key={role}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-slate-600 truncate">{role}</span>
                          <span className="text-xs font-bold text-slate-700">{members.length}</span>
                        </div>
                        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full bg-blue-400 rounded-full" style={{ width: `${Math.min(members.length / Math.max(staff.length, 1) * 100, 100)}%` }} />
                        </div>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {members.slice(0, 3).map(m => (
                            <span key={m.id} className="text-[9px] text-slate-400">
                              {m.first_name} {m.last_name}{(personEnterprises[m.id] || []).length > 1 ? " 🔄" : ""}
                            </span>
                          ))}
                          {members.length > 3 && <span className="text-[9px] text-slate-300">+{members.length - 3}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Participants — non-agricultural only */}
                {!isAgri && participants.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-slate-100">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Participants ({participants.length})</p>
                    <div className="flex flex-wrap gap-1">
                      {participants.slice(0, 6).map(c => (
                        <span key={c.id} className="text-[10px] bg-purple-50 text-purple-600 border border-purple-100 px-1.5 py-0.5 rounded-lg">
                          {c.first_name} {c.last_name}
                        </span>
                      ))}
                      {participants.length > 6 && <span className="text-[10px] text-slate-400">+{participants.length - 6} more</span>}
                    </div>
                  </div>
                )}

                {/* Agricultural: show livestock from Products */}
                {isAgri && livestock.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-slate-100">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Livestock (from Products)</p>
                    <div className="flex flex-wrap gap-1">
                      {livestock.map(p => (
                        <span key={p.id} className="text-[10px] bg-lime-50 text-lime-600 border border-lime-100 px-1.5 py-0.5 rounded-lg">
                          {p.name}: {p.stock_quantity} head
                        </span>
                      ))}
                    </div>
                    <p className="text-[10px] text-slate-400 mt-2 italic">Animals are tracked as Products, not People</p>
                  </div>
                )}

                {/* Agricultural with no humans */}
                {isAgri && participants.length === 0 && livestock.length === 0 && (
                  <div className="mt-4 pt-4 border-t border-slate-100 text-center">
                    <p className="text-[10px] text-slate-400 italic">Farm operations are staff-only. Add livestock in Products.</p>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}