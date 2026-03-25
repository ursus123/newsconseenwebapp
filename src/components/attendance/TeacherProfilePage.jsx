import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { ArrowLeft, Building2, CheckCircle2, ChevronRight } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

export default function TeacherProfilePage({ person, onBack, onOpenClass }) {
  const [assignedClasses, setAssignedClasses] = useState([]);
  const [sessionsByClass, setSessionsByClass] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadData(); }, [person.id]);

  const loadData = async () => {
    setLoading(true);
    const name = `${person.first_name} ${person.last_name}`.trim();
    const rels = await base44.entities.Relationship.filter({ person_name: name, status: "active" });
    const teachingRels = rels.filter(r => r.role === "teacher" || r.role === "Teacher");

    // Load enterprise objects for each class
    const classes = [];
    for (const rel of teachingRels) {
      if (rel.enterprise_name) {
        const found = await base44.entities.Enterprise.filter({ enterprise_name: rel.enterprise_name });
        if (found[0]) classes.push(found[0]);
      }
    }
    setAssignedClasses(classes);

    // Load attendance sessions per class
    const byClass = {};
    for (const cls of classes) {
      const tasks = await base44.entities.Task.filter({ task_type: "attendance", enterprise: cls.id, status: "completed" });
      byClass[cls.id] = tasks;
    }
    setSessionsByClass(byClass);
    setLoading(false);
  };

  const totalSessions = Object.values(sessionsByClass).reduce((sum, arr) => sum + arr.length, 0);

  // Average attendance rate per class
  const chartData = assignedClasses.map(cls => {
    const tasks = sessionsByClass[cls.id] || [];
    if (tasks.length === 0) return { name: cls.short_name || cls.enterprise_name?.slice(0, 12), rate: 0, sessions: 0 };
    let totalPresent = 0, totalAll = 0;
    tasks.forEach(t => {
      try {
        const m = JSON.parse(t.outcome_notes || "{}");
        totalPresent += (m.present?.length || 0);
        totalAll += (m.present?.length || 0) + (m.absent?.length || 0) + (m.late?.length || 0);
      } catch {}
    });
    return {
      name: cls.short_name || cls.enterprise_name?.slice(0, 12),
      rate: totalAll > 0 ? Math.round(totalPresent / totalAll * 100) : 0,
      sessions: tasks.length,
    };
  });

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
      </div>

      {/* Profile */}
      <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm flex items-center gap-4">
        <div className="w-14 h-14 bg-violet-100 rounded-2xl flex items-center justify-center text-xl font-bold text-violet-700">
          {(person.first_name || "?")[0].toUpperCase()}
        </div>
        <div className="flex-1">
          <h2 className="text-lg font-bold text-slate-800">{person.first_name} {person.last_name}</h2>
          <p className="text-sm text-slate-500">{person.person_type || "Person"} · {person.primary_role || "—"}</p>
          {person.email && <p className="text-xs text-slate-400 mt-0.5">{person.email}</p>}
        </div>
        <div className="text-center">
          <p className="text-3xl font-black text-violet-600">{totalSessions}</p>
          <p className="text-xs text-slate-500">Sessions Recorded</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div className="bg-violet-50 border border-violet-100 rounded-2xl p-4 text-center">
          <p className="text-2xl font-bold text-violet-700">{assignedClasses.length}</p>
          <p className="text-xs text-violet-600">Classes Assigned</p>
        </div>
        <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 text-center">
          <p className="text-2xl font-bold text-blue-700">{totalSessions}</p>
          <p className="text-xs text-blue-600">Total Sessions</p>
        </div>
        <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 text-center col-span-2 md:col-span-1">
          <p className="text-2xl font-bold text-emerald-700">
            {chartData.length > 0 ? Math.round(chartData.reduce((s, d) => s + d.rate, 0) / chartData.length) : 0}%
          </p>
          <p className="text-xs text-emerald-600">Avg. Attendance Rate</p>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Class performance chart */}
        {chartData.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
            <p className="text-sm font-semibold text-slate-700 mb-3">Attendance Rate by Class</p>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
                <Tooltip formatter={(v) => `${v}%`} />
                <Bar dataKey="rate" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Assigned classes list */}
        <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
          <p className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-violet-500" /> Assigned Classes
          </p>
          {assignedClasses.length === 0 ? (
            <p className="text-sm text-slate-400">No teaching assignments found.</p>
          ) : (
            <div className="space-y-2">
              {assignedClasses.map(cls => {
                const d = chartData.find(c => c.name === (cls.short_name || cls.enterprise_name?.slice(0, 12)));
                return (
                  <button key={cls.id} onClick={() => onOpenClass(cls)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border border-slate-100 hover:border-violet-200 hover:bg-violet-50 transition-all text-left group">
                    <Building2 className="w-4 h-4 text-slate-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-700 truncate">{cls.enterprise_name}</p>
                      <p className="text-[11px] text-slate-400">{d?.sessions || 0} sessions · {d?.rate || 0}% avg</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-violet-500 transition-colors" />
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}