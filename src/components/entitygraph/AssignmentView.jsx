import React, { useMemo } from "react";
import { isAgricultural, getLivestock, isStaff, isParticipant } from "./enterpriseHelpers";

export default function AssignmentView({ enterprises, people, relationships, tasks, addresses, products = [], selectedEnterprise }) {
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

  if (enterprises.length === 0 || people.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center px-8">
        <div className="text-5xl mb-4">🔗</div>
        <h3 className="text-base font-bold text-slate-700 mb-2">No assignments yet</h3>
        <p className="text-sm text-slate-400 max-w-xs mb-4">Create relationships between staff and clients to see assignments here.</p>
        <p className="text-xs text-indigo-500 font-medium">Go to Relationships page to assign staff</p>
      </div>
    );
  }

  return (
    <div className="p-6 overflow-auto h-full">
      {visibleEnterprises.map(enterprise => {
        const entName = enterprise.enterprise_name;
        const entPeopleNames = enterprisePeopleNames[entName] || new Set();
        const entPeople = [...entPeopleNames].map(n => peopleByName[n]).filter(Boolean);
        const staff = entPeople.filter(p => isStaff(p) && p.status === "active");
        const participants = entPeople.filter(p => isParticipant(p) && p.status === "active");
        const isAgri = isAgricultural(enterprise);
        const livestock = getLivestock(products, entName);

        // Staff→participants assignment map (non-agricultural)
        const assignmentMap = {};
        staff.forEach(s => { assignmentMap[s.id] = []; });
        relationships.forEach(rel => {
          if (rel.relationship_type !== "person_enterprise") return;
          if (rel.enterprise_name !== entName) return;
          const staffMember = staff.find(s => `${s.first_name} ${s.last_name}` === rel.person_name);
          if (staffMember && rel.secondary_person) {
            if (!assignmentMap[staffMember.id].includes(rel.secondary_person)) {
              assignmentMap[staffMember.id].push(rel.secondary_person);
            }
          }
        });

        const assignedParticipantNames = new Set(Object.values(assignmentMap).flat());
        const unassignedParticipants = participants.filter(c => !assignedParticipantNames.has(`${c.first_name} ${c.last_name}`));
        const overloaded = staff.filter(s => (assignmentMap[s.id] || []).length > 4);

        return (
          <div key={enterprise.id} className="mb-8">
            <h2 className="text-base font-bold text-slate-800 mb-4 flex items-center gap-2">
              {isAgri ? "🌾" : "🏢"} {entName}
              <span className="text-xs font-normal text-slate-400">
                {staff.length} staff · {isAgri ? `${livestock.reduce((s, p) => s + (p.stock_quantity || 0), 0)} livestock head` : `${participants.length} participants`}
              </span>
            </h2>

            {!isAgri ? (
              /* Standard staff-to-participant assignment view */
              <>
                <div className="flex gap-3 mb-4 flex-wrap">
                  {unassignedParticipants.length > 0 && (
                    <div className="bg-rose-50 border border-rose-200 rounded-xl px-4 py-2">
                      <p className="text-xs font-bold text-rose-700">🔴 {unassignedParticipants.length} participants with no staff links</p>
                      <p className="text-[10px] text-rose-500 mt-0.5">{unassignedParticipants.slice(0, 5).map(c => `${c.first_name} ${c.last_name}`).join(", ")}{unassignedParticipants.length > 5 ? ` +${unassignedParticipants.length - 5}` : ""}</p>
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
                              {participants.length} participants
                            </span>
                          </div>
                          {recentTasks.length > 0 && (
                            <p className="text-[10px] text-emerald-500 mt-2">✓ {recentTasks.length} tasks this week</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {participants.length > 0 && (
                  <div className="mt-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                    {participants.map(participant => (
                      <div key={participant.id} className="bg-white border border-purple-100 rounded-xl p-3 flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center text-xs font-bold text-purple-600 shrink-0">
                          {participant.first_name?.[0]}{participant.last_name?.[0]}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-slate-700 truncate">{participant.first_name} {participant.last_name}</p>
                          <p className="text-[10px] text-slate-400 truncate">{participant.primary_role || "Participant"} · {participant.status}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              /* Agricultural: staff task view + livestock inventory */
              <div>
                <p className="text-xs text-slate-500 mb-3">
                  Agricultural enterprises assign staff to farm tasks. Livestock is tracked in Products.
                </p>

                {staff.length > 0 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 mb-4">
                    {staff.map(member => {
                      const memberTasks = tasks.filter(t =>
                        t.enterprise === entName &&
                        (t.assigned_to_name === `${member.first_name} ${member.last_name}` ||
                          t.assigned_to_email === member.email) &&
                        t.status !== "completed"
                      );

                      return (
                        <div key={member.id} className="bg-white border border-slate-200 rounded-xl p-3">
                          <div className="flex items-center gap-2 mb-2">
                            <div className="w-8 h-8 rounded-full bg-lime-100 flex items-center justify-center text-xs font-bold text-lime-600 shrink-0">
                              {member.first_name?.[0]}{member.last_name?.[0]}
                            </div>
                            <div>
                              <p className="text-xs font-bold text-slate-700">{member.first_name} {member.last_name}</p>
                              <p className="text-[10px] text-slate-400">{member.primary_role || "Farm Hand"}</p>
                            </div>
                          </div>

                          {memberTasks.length > 0 ? (
                            <div className="space-y-1">
                              {memberTasks.slice(0, 3).map(t => (
                                <div key={t.id} className="text-[10px] text-slate-500 flex items-center gap-1">
                                  <span>•</span>
                                  <span>{t.title || t.task_type?.replace(/_/g, " ")}</span>
                                  {t.scheduled_date && (
                                    <span className="text-slate-300 ml-auto">
                                      {new Date(t.scheduled_date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                                    </span>
                                  )}
                                </div>
                              ))}
                              {memberTasks.length > 3 && (
                                <p className="text-[10px] text-slate-300">+{memberTasks.length - 3} more tasks</p>
                              )}
                            </div>
                          ) : (
                            <p className="text-[10px] text-slate-300 italic">No pending tasks</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {livestock.length > 0 && (
                  <div className="bg-lime-50 border border-lime-100 rounded-xl p-4">
                    <p className="text-xs font-bold text-lime-700 mb-2">🐄 Livestock Inventory (managed via Products)</p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      {livestock.map(p => (
                        <div key={p.id} className="bg-white border border-lime-100 rounded-xl p-2 text-center">
                          <p className="text-lg font-black text-lime-600">{p.stock_quantity}</p>
                          <p className="text-[10px] text-lime-500">{p.name}</p>
                          <p className="text-[9px] text-slate-400">head</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {staff.length === 0 && (
                  <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
                    <p className="text-xs text-slate-400">No active staff at this enterprise.</p>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}