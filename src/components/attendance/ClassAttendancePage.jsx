import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { ArrowLeft, Users, CheckCircle2, XCircle, Clock, Send, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

const STATUS_CONFIG = {
  present: { label: "Present", color: "bg-emerald-100 text-emerald-700 border-emerald-300", icon: CheckCircle2, iconColor: "text-emerald-600" },
  absent:  { label: "Absent",  color: "bg-rose-100 text-rose-700 border-rose-300",           icon: XCircle,       iconColor: "text-rose-600" },
  late:    { label: "Late",    color: "bg-amber-100 text-amber-700 border-amber-300",         icon: Clock,         iconColor: "text-amber-600" },
};

export default function ClassAttendancePage({ classObj, currentUser, onBack, onOpenStudent }) {
  const [roster, setRoster]         = useState([]);
  const [teacher, setTeacher]       = useState(null);
  const [attendance, setAttendance] = useState({}); // personId → status
  const [sessions, setSessions]     = useState([]);
  const [loading, setLoading]       = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted]   = useState(false);
  const [expandedSession, setExpandedSession] = useState(null);

  useEffect(() => { loadData(); }, [classObj.id]);

  const loadData = async () => {
    setLoading(true);
    const [rels, tasks, allPeople] = await Promise.all([
      base44.entities.Relationship.filter({ enterprise_name: classObj.enterprise_name, status: "active" }),
      base44.entities.Task.filter({ task_type: "attendance", enterprise: classObj.id }),
      base44.entities.Person.list(),
    ]);

    // Helper: find a person record by the name stored in relationship
    const findPerson = (name) => {
      if (!name) return null;
      const lower = name.trim().toLowerCase();
      return allPeople.find(p => {
        const full = `${p.first_name} ${p.last_name}`.trim().toLowerCase();
        const pref = (p.preferred_name || "").toLowerCase();
        return full === lower || pref === lower;
      });
    };

    // Roster: role = "student" (case-insensitive)
    const studentRels = rels.filter(r => (r.role || "").toLowerCase() === "student");
    // Teacher
    const teacherRel = rels.find(r => (r.role || "").toLowerCase() === "teacher");
    if (teacherRel?.person_name) {
      const found = findPerson(teacherRel.person_name);
      setTeacher(found || { first_name: teacherRel.person_name, last_name: "" });
    }

    // Build roster from relationship person_name
    const studentPeople = studentRels
      .filter(rel => rel.person_name)
      .map(rel => {
        const found = findPerson(rel.person_name);
        if (found) return { ...found, _relId: rel.id };
        // fallback: split name
        const parts = rel.person_name.trim().split(" ");
        return { id: `rel-${rel.id}`, first_name: parts[0] || rel.person_name, last_name: parts.slice(1).join(" "), _relId: rel.id };
      });
    setRoster(studentPeople);

    // Initialize all to "present"
    const init = {};
    studentPeople.forEach(p => { init[p.id] = "present"; });
    setAttendance(init);

    // Sort sessions newest first
    setSessions(tasks.sort((a, b) => new Date(b.created_date) - new Date(a.created_date)));
    setLoading(false);
  };

  const handleMark = (personId, status) => {
    setAttendance(prev => ({ ...prev, [personId]: status }));
  };

  const handleMarkAll = (status) => {
    const next = {};
    roster.forEach(p => { next[p.id] = status; });
    setAttendance(next);
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    const present = roster.filter(p => attendance[p.id] === "present").map(p => p.id);
    const absent  = roster.filter(p => attendance[p.id] === "absent").map(p => p.id);
    const late    = roster.filter(p => attendance[p.id] === "late").map(p => p.id);

    await base44.entities.Task.create({
      task_type: "attendance",
      title: `Attendance — ${classObj.enterprise_name} — ${new Date().toLocaleDateString()}`,
      status: "completed",
      outcome: "completed",
      enterprise: classObj.id,
      assigned_to_name: teacher ? `${teacher.first_name} ${teacher.last_name}`.trim() : currentUser?.full_name,
      assigned_to_email: currentUser?.email,
      scheduled_date: new Date().toISOString().split("T")[0],
      outcome_notes: JSON.stringify({ present, absent, late }),
      company_id: currentUser?.company_id,
    });

    setSubmitted(true);
    setSubmitting(false);
    await loadData();
    setTimeout(() => setSubmitted(false), 3000);
  };

  const parseSession = (s) => {
    try { return JSON.parse(s.outcome_notes || "{}"); } catch { return {}; }
  };

  const presentCount  = roster.filter(p => attendance[p.id] === "present").length;
  const absentCount   = roster.filter(p => attendance[p.id] === "absent").length;
  const lateCount     = roster.filter(p => attendance[p.id] === "late").length;

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-slate-800">{classObj.enterprise_name}</h1>
          <p className="text-sm text-slate-500">
            {teacher ? `Teacher: ${teacher.first_name} ${teacher.last_name}`.trim() : "No teacher assigned"}
            {" · "}
            {roster.length} student{roster.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm font-medium text-slate-700">{new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</p>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        {[
          { label: "Present", count: presentCount, status: "present" },
          { label: "Absent",  count: absentCount,  status: "absent" },
          { label: "Late",    count: lateCount,    status: "late" },
        ].map(s => {
          const cfg = STATUS_CONFIG[s.status];
          return (
            <div key={s.status} className={`rounded-2xl border p-4 ${cfg.color}`}>
              <p className="text-2xl font-bold">{s.count}</p>
              <p className="text-sm font-medium">{s.label}</p>
            </div>
          );
        })}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Attendance form */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-slate-500" />
              <span className="text-sm font-semibold text-slate-700">Mark Attendance</span>
            </div>
            <div className="flex gap-1">
              {["present", "absent", "late"].map(s => (
                <button key={s} onClick={() => handleMarkAll(s)}
                  className={`text-[10px] px-2 py-1 rounded-lg font-medium border transition-all ${STATUS_CONFIG[s].color}`}>
                  All {STATUS_CONFIG[s].label}
                </button>
              ))}
            </div>
          </div>

          {roster.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-400">
              No students enrolled. Add Relationships with role "student" to this class.
            </div>
          ) : (
            <div className="divide-y divide-slate-50">
              {roster.map((person) => {
                const status = attendance[person.id] || "present";
                const Cfg = STATUS_CONFIG[status];
                return (
                  <div key={person.id} className="flex items-center gap-3 px-5 py-3">
                    <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-600 shrink-0">
                      {(person.first_name || "?")[0].toUpperCase()}
                    </div>
                    <button onClick={() => onOpenStudent(person)} className="flex-1 text-left min-w-0">
                      <p className="text-sm font-medium text-slate-700 truncate hover:text-blue-600 transition-colors">
                        {person.first_name} {person.last_name}
                      </p>
                      {person.primary_role && <p className="text-[11px] text-slate-400">{person.primary_role}</p>}
                    </button>
                    <div className="flex gap-1">
                      {["present", "absent", "late"].map(s => {
                        const c = STATUS_CONFIG[s];
                        const Icon = c.icon;
                        return (
                          <button key={s} onClick={() => handleMark(person.id, s)}
                            title={c.label}
                            className={`w-8 h-8 rounded-lg border-2 flex items-center justify-center transition-all ${
                              status === s ? c.color + " border-current" : "border-slate-100 bg-slate-50 hover:border-slate-200"
                            }`}>
                            <Icon className={`w-4 h-4 ${status === s ? c.iconColor : "text-slate-300"}`} />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {roster.length > 0 && (
            <div className="px-5 py-4 border-t border-slate-100">
              {submitted ? (
                <div className="flex items-center gap-2 text-emerald-600 text-sm font-medium">
                  <CheckCircle2 className="w-4 h-4" /> Attendance saved!
                </div>
              ) : (
                <Button className="w-full bg-blue-600 hover:bg-blue-700 gap-2" onClick={handleSubmit} disabled={submitting}>
                  <Send className="w-4 h-4" /> {submitting ? "Saving..." : "Submit Attendance"}
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Past sessions */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <p className="text-sm font-semibold text-slate-700">Past Sessions ({sessions.length})</p>
          </div>
          {sessions.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-400">No sessions recorded yet.</div>
          ) : (
            <div className="divide-y divide-slate-50 max-h-96 overflow-y-auto">
              {sessions.map(session => {
                const meta = parseSession(session);
                const total = (meta.present?.length || 0) + (meta.absent?.length || 0) + (meta.late?.length || 0);
                const pct = total > 0 ? Math.round((meta.present?.length || 0) / total * 100) : 0;
                const isExpanded = expandedSession === session.id;
                return (
                  <div key={session.id}>
                    <button onClick={() => setExpandedSession(isExpanded ? null : session.id)}
                      className="w-full flex items-center gap-3 px-5 py-3 hover:bg-slate-50 transition-colors text-left">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-slate-700">
                          {new Date(session.scheduled_date || session.created_date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                        </p>
                        <p className="text-[11px] text-slate-400">{session.assigned_to_name || "—"}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-semibold ${pct >= 80 ? "text-emerald-600" : pct >= 60 ? "text-amber-600" : "text-rose-600"}`}>
                          {pct}% present
                        </span>
                        {isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-slate-400" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />}
                      </div>
                    </button>
                    {isExpanded && (
                      <div className="px-5 pb-3 bg-slate-50 border-t border-slate-100">
                        <div className="flex gap-4 text-xs pt-2">
                          <span className="text-emerald-600 font-medium">✓ {meta.present?.length || 0} present</span>
                          <span className="text-rose-600 font-medium">✗ {meta.absent?.length || 0} absent</span>
                          <span className="text-amber-600 font-medium">⏱ {meta.late?.length || 0} late</span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}