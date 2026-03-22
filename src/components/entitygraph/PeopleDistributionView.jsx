import React from "react";

export default function PeopleDistributionView({ enterprises, people, selectedEnterprise }) {
  const visibleEnterprises = selectedEnterprise === "all"
    ? enterprises
    : enterprises.filter(e => e.id === selectedEnterprise);

  const personEnterpriseMap = {};
  people.forEach(p => {
    if (!p.enterprise) return;
    if (!personEnterpriseMap[p.id]) personEnterpriseMap[p.id] = [];
    if (!personEnterpriseMap[p.id].includes(p.enterprise)) personEnterpriseMap[p.id].push(p.enterprise);
  });
  const sharedStaff = people.filter(p => (personEnterpriseMap[p.id] || []).length > 1);

  return (
    <div className="p-6 overflow-auto h-full">
      {sharedStaff.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-6">
          <p className="text-sm font-bold text-amber-700 mb-2">🔄 {sharedStaff.length} people appear in multiple enterprises</p>
          <div className="flex flex-wrap gap-2">
            {sharedStaff.map(p => (
              <span key={p.id} className="text-xs bg-white border border-amber-200 text-amber-700 px-2 py-1 rounded-xl">
                {p.first_name} {p.last_name} → {personEnterpriseMap[p.id].join(", ")}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {visibleEnterprises.map(enterprise => {
          const entPeople = people.filter(p => p.enterprise === enterprise.enterprise_name);
          const staff = entPeople.filter(p => p.person_type === "employee");
          const clients = entPeople.filter(p => p.person_type === "client");

          const roleGroups = {};
          staff.forEach(p => {
            const role = p.primary_role || "Unassigned";
            if (!roleGroups[role]) roleGroups[role] = [];
            roleGroups[role].push(p);
          });

          const ratio = clients.length > 0 && staff.length > 0
            ? (clients.length / staff.length).toFixed(1)
            : null;
          const ratioGood = ratio && parseFloat(ratio) <= 5;

          return (
            <div key={enterprise.id} className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
                <h3 className="font-bold text-slate-800 text-sm">{enterprise.enterprise_name}</h3>
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-xs text-slate-500">{staff.length} staff · {clients.length} clients</span>
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
                              {m.first_name} {m.last_name}{sharedStaff.find(s => s.id === m.id) ? " 🔄" : ""}
                            </span>
                          ))}
                          {members.length > 3 && <span className="text-[9px] text-slate-300">+{members.length - 3}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {clients.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-slate-100">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Clients ({clients.length})</p>
                    <div className="flex flex-wrap gap-1">
                      {clients.slice(0, 6).map(c => (
                        <span key={c.id} className="text-[10px] bg-purple-50 text-purple-600 border border-purple-100 px-1.5 py-0.5 rounded-lg">
                          {c.first_name} {c.last_name}
                        </span>
                      ))}
                      {clients.length > 6 && <span className="text-[10px] text-slate-400">+{clients.length - 6} more</span>}
                    </div>
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