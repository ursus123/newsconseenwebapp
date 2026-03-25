import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { ArrowLeft, User, Building2, TrendingUp } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

export default function StudentProfilePage({ person, onBack }) {
  const [relationships, setRelationships] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadData(); }, [person.id]);

  const loadData = async () => {
    setLoading(true);
    const rels = await base44.entities.Relationship.filter({ person_name: `${person.first_name} ${person.last_name}`.trim(), status: "active" });
    setRelationships(rels);

    // Get all attendance tasks for classes this student is enrolled in
    const allTasks = await base44.entities.Task.filter({ task_type: "attendance", status: "completed" });
    // Filter tasks where student appears in metadata
    const relevant = allTasks.filter(t => {
      try {
        const meta = JSON.parse(t.outcome_notes || "{}");
        return [...(meta.present || []), ...(meta.absent || []), ...(meta.late || [])].includes(person.id);
      } catch { return false; }
    });
    setSessions(relevant.sort((a, b) => new Date(a.scheduled_date || a.created_date) - new Date(b.scheduled_date || b.created_date)));
    setLoading(false);
  };

  const getStatus = (session) => {
    try {
      const meta = JSON.parse(session.outcome_notes || "{}");
      if (meta.present?.includes(person.id)) return "present";
      if (meta.late?.includes(person.id)) return "late";
      if (meta.absent?.includes(person.id)) return "absent";
    } catch {}
    return "unknown";
  };

  const presentCount = sessions.filter(s => getStatus(s) === "present").length;
  const absentCount  = sessions.filter(s => getStatus(s) === "absent").length;
  const lateCount    = sessions.filter(s => getStatus(s) === "late").length;
  const pct = sessions.length > 0 ? Math.round(presentCount / sessions.length * 100) : 0;

  // Trend chart data (last 10 sessions)
  const chartData = sessions.slice(-10).map((s, i) => ({
    day: new Date(s.scheduled_date || s.created_date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    present: getStatus(s) === "present" ? 1 : 0,
  }));

  const statusColor = { present: "text-emerald-600 bg-emerald-50", absent: "text-rose-600 bg-rose-50", late: "text-amber-600 bg-amber-50", unknown: "text-slate-500 bg-slate-50" };
  const statusLabel = { present: "Present", absent: "Absent", late: "Late", unknown: "—" };

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

      {/* Profile card */}
      <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm flex items-center gap-4">
        <div className="w-14 h-14 bg-blue-100 rounded-2xl flex items-center justify-center text-xl font-bold text-blue-700">
          {(person.first_name || "?")[0].toUpperCase()}
        </div>
        <div className="flex-1">
          <h2 className="text-lg font-bold text-slate-800">{person.first_name} {person.last_name}</h2>
          <p className="text-sm text-slate-500">{person.person_type || "Person"} · {person.primary_role || "—"}</p>
          {person.email && <p className="text-xs text-slate-400 mt-0.5">{person.email}</p>}
        </div>
        <div className="text-center">
          <p className={`text-3xl font-black ${pct >= 80 ? "text-emerald-600" : pct >= 60 ? "text-amber-600" : "text-rose-600"}`}>{pct}%</p>
          <p className="text-xs text-slate-500">Attendance</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Present", value: presentCount, color: "emerald" },
          { label: "Absent",  value: absentCount,  color: "rose" },
          { label: "Late",    value: lateCount,    color: "amber" },
        ].map(s => (
          <div key={s.label} className={`bg-${s.color}-50 border border-${s.color}-100 rounded-2xl p-4 text-center`}>
            <p className={`text-2xl font-bold text-${s.color}-700`}>{s.value}</p>
            <p className={`text-xs text-${s.color}-600`}>{s.label}</p>
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Trend chart */}
        {chartData.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
            <p className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-blue-500" /> Attendance Trend
            </p>
            <ResponsiveContainer width="100%" height={150}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                <YAxis domain={[0, 1]} ticks={[0, 1]} tickFormatter={v => v ? "✓" : "✗"} tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v) => v ? "Present" : "Absent"} />
                <Line type="monotone" dataKey="present" stroke="#3b82f6" strokeWidth={2} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Enrolled classes */}
        <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
          <p className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-blue-500" /> Enrolled Classes
          </p>
          {relationships.length === 0 ? (
            <p className="text-sm text-slate-400">No class enrollments found.</p>
          ) : (
            <div className="space-y-2">
              {relationships.map(r => (
                <div key={r.id} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-50 border border-slate-100">
                  <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <p className="text-sm text-slate-700">{r.enterprise_name}</p>
                  <span className="ml-auto text-[11px] bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full font-medium">{r.role}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Attendance history */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <p className="text-sm font-semibold text-slate-700">Session History</p>
        </div>
        {sessions.length === 0 ? (
          <div className="py-8 text-center text-sm text-slate-400">No attendance records yet.</div>
        ) : (
          <div className="divide-y divide-slate-50">
            {sessions.slice().reverse().slice(0, 20).map(s => {
              const st = getStatus(s);
              return (
                <div key={s.id} className="flex items-center gap-3 px-5 py-3">
                  <p className="text-sm text-slate-700 flex-1">
                    {new Date(s.scheduled_date || s.created_date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
                  </p>
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${statusColor[st]}`}>{statusLabel[st]}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}