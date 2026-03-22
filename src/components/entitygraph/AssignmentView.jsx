import React from "react";

export default function AssignmentView({ enterprises, people, relationships, tasks, selectedEnterprise }) {
  const visibleEnterprises = selectedEnterprise === "all"
    ? enterprises
    : enterprises.filter(e => e.id === selectedEnterprise);

  return (
    <div className="p-6 overflow-auto h-full">
      {visibleEnterprises.map(enterprise => {
        const entName = enterprise.enterprise_name;
        const staff = people.filter(p => p.enterprise === entName && p.person_type === "employee" && p.status === "active");
        const clients = people.filter(p => p.enterprise === entName && p.person_type === "client" && p.status === "active");

        const assignmentMap = {};
        staff.forEach(s => { assignmentMap[s.id] = []; });

        relationships.forEach(rel => {
          const staffMember = staff.find(s =>
            `${s.first_name} ${s.last_name}` === rel.person_name ||
            `${s.first_name} ${s.last_name}` === rel.primary_person
          );
          if (staffMember && rel.related_person) {
            if (!assignmentMap[staffMember.id]) assignmentMap[staffMember.id] = [];
            if (!assignmentMap[staffMember.id].includes(rel.related_person)) {
              assignmentMap[staffMember.id].push(rel.related_person);
            }
          }
        });

        const assignedClientNames = new Set(Object.values(assignmentMap).flat());
        const unassignedClients = clients.filter(c => !assignedClientNames.has(`${c.first_name} ${c.last_name}`));
        const overloaded = staff.filter(s => (assignmentMap[s.id] || []).length > 4);

        return (
          <div key={enterprise.id} className="mb-8">
            <h2 className="text-base font-bold text-slate-800 mb-4 flex items-center gap-2">🏢 {entName}</h2>

            <div className="flex gap-3 mb-4 flex-wrap">
              {unassignedClients.length > 0 && (
                <div className="bg-rose-50 border border-rose-200 rounded-xl px-4 py-2">
                  <p className="text-xs font-bold text-rose-700">🔴 {unassignedClients.length} unassigned clients</p>
                  <p className="text-[10px] text-rose-500 mt-0.5">{unassignedClients.map(c => `${c.first_name} ${c.last_name}`).join(", ")}</p>
                </div>
              )}
              {overloaded.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2">
                  <p className="text-xs font-bold text-amber-700">⚠️ {overloaded.length} overloaded staff members</p>
                </div>
              )}
              {staff.length === 0 && (
                <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2">
                  <p className="text-xs text-slate-400">No active staff at this enterprise.</p>
                </div>
              )}
            </div>

            {staff.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {staff.map(member => {
                  const assigned = assignmentMap[member.id] || [];
                  const isOverloaded = assigned.length > 4;
                  const recentTasks = tasks.filter(t =>
                    t.enterprise === entName &&
                    (t.assigned_to_name === `${member.first_name} ${member.last_name}` ||
                     t.assigned_to_email === member.email) &&
                    new Date(t.scheduled_date || t.created_date) >= new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
                  );

                  return (
                    <div key={member.id} className={`bg-white border rounded-xl p-3 ${isOverloaded ? "border-amber-200 bg-amber-50/30" : "border-slate-200"}`}>
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-xs font-bold text-blue-600 shrink-0">
                          {member.first_name?.[0]}{member.last_name?.[0]}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-slate-700 truncate">{member.first_name} {member.last_name}{isOverloaded ? " ⚠️" : ""}</p>
                          <p className="text-[10px] text-slate-400 truncate">{member.primary_role || "Staff"}</p>
                        </div>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${isOverloaded ? "bg-amber-100 text-amber-600" : "bg-slate-100 text-slate-500"}`}>
                          {assigned.length} clients
                        </span>
                      </div>

                      {assigned.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {assigned.slice(0, 4).map((name, i) => (
                            <span key={i} className="text-[9px] bg-purple-50 text-purple-600 border border-purple-100 px-1.5 py-0.5 rounded-lg">{name}</span>
                          ))}
                          {assigned.length > 4 && <span className="text-[9px] text-slate-400">+{assigned.length - 4}</span>}
                        </div>
                      ) : (
                        <p className="text-[10px] text-slate-300 italic">No clients assigned</p>
                      )}

                      {recentTasks.length > 0 && (
                        <p className="text-[10px] text-emerald-500 mt-2">✓ {recentTasks.length} tasks this week</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}