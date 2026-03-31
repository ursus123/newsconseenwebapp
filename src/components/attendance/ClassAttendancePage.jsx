import React, { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { ArrowLeft, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";

const RAILWAY_URL = "https://newsconseenwebapp-production.up.railway.app";
const RAILWAY_API_KEY = import.meta.env.VITE_RAILWAY_API_KEY || "";
const triggerETL = (entity) =>
  fetch(`${RAILWAY_URL}/load/${entity}-summary`, {
    method: "POST",
    headers: { "x-api-key": RAILWAY_API_KEY },
  }).catch(() => {});

const STUDENT_SUBTYPES = [
  "Student Customer",
  "Individual Consumer",
  "Enrollee",
  "Attendee",
  "Participant",
  "Learner",
];

const TEACHER_SUBTYPES = [
  "Teacher",
  "Lecturer",
  "Instructor",
  "Tutor",
  "Trainer",
  "Coach",
];

const TYPE_ALIASES = {
  staff:     ["staff", "employee", "contractor", "freelancer"],
  client:    ["client", "patient", "student", "member"],
  contact:   ["contact", "vendor", "supplier", "external_partner"],
  volunteer: ["volunteer"],
};

const isStudent = (p) =>
  TYPE_ALIASES.client.includes(p.person_type) &&
  (
    STUDENT_SUBTYPES.includes(p.person_subtype) ||
    STUDENT_SUBTYPES.some(s => s.toLowerCase() === (p.primary_role || "").toLowerCase())
  );

const isTeacher = (p) =>
  TYPE_ALIASES.staff.includes(p.person_type) &&
  (
    TEACHER_SUBTYPES.includes(p.person_subtype) ||
    TEACHER_SUBTYPES.some(s => s.toLowerCase() === (p.primary_role || "").toLowerCase())
  );

export default function ClassAttendancePage({ classObj, currentUser, onBack, onOpenStudent }) {
  const { toast } = useToast();
  const [attendance, setAttendance] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const { data: relationships = [] } = useQuery({
    queryKey: ["class_relationships", classObj?.id],
    queryFn: () => base44.entities.Relationship.filter({ 
      company_id: currentUser?.company_id,
      enterprise_id: classObj.id,
      relationship_type: "person_enterprise",
    }),
    enabled: !!classObj?.id,
  });

  const { data: people = [] } = useQuery({
    queryKey: ["class_people", currentUser?.company_id],
    queryFn: () => base44.entities.Person.filter({ company_id: currentUser?.company_id }),
    enabled: !!currentUser?.company_id,
  });

  const students = relationships
    .filter(r => r.status === "active")
    .map(r => people.find(p =>
      p.id === r.person_id ||
      `${p.first_name} ${p.last_name}`.toLowerCase() === (r.person_name || "").toLowerCase() ||
      p.preferred_name === r.person_name
    ))
    .filter(p => p && isStudent(p));

  useEffect(() => {
    const initial = {};
    students.forEach(s => {
      initial[s.id] = null;
    });
    setAttendance(initial);
  }, [students]);

  const handleToggle = (studentId) => {
    setAttendance(prev => ({
      ...prev,
      [studentId]: prev[studentId] === null ? "present" : prev[studentId] === "present" ? "absent" : "present",
    }));
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const today = new Date().toISOString().split("T")[0];
      
      for (const [studentId, state] of Object.entries(attendance)) {
        if (state) {
          await base44.entities.Task.create({
            task_type: "attendance",
            title: `Attendance — ${classObj.enterprise_name}`,
            status: "completed",
            outcome: state === "present" ? "completed" : "cancelled",
            date: today,
            enterprise: classObj.id,
            company_id: currentUser.company_id,
            assigned_to_email: people.find(p => p.id === studentId)?.email,
            assigned_to_name: people.find(p => p.id === studentId)?.preferred_name || people.find(p => p.id === studentId)?.first_name,
          });
        }
      }

      // Fire and forget refresh
      fetch(`${RAILWAY_URL}/load/task-summary`, {
        method: "POST",
        headers: { "x-api-key": RAILWAY_API_KEY },
      }).catch(() => {});

      triggerETL("task");
      toast({ title: "Attendance recorded", description: `${Object.values(attendance).filter(s => s).length} students marked.` });
      onBack();
    } catch (e) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const markedCount = Object.values(attendance).filter(s => s).length;
  const total = students.length;
  const pct = total > 0 ? Math.round((markedCount / total) * 100) : 0;

  return (
    <div className="flex flex-col gap-6 min-h-full">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">{classObj?.enterprise_name}</h1>
            <p className="text-slate-500 text-sm mt-0.5">{total} students</p>
          </div>
        </div>
        <Button
          size="sm"
          className="bg-emerald-600 hover:bg-emerald-700 text-white"
          onClick={handleSubmit}
          disabled={submitting || markedCount === 0}
        >
          {submitting ? "Submitting..." : "Submit Attendance"}
        </Button>
      </div>

      {/* Progress bar */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-slate-700">{markedCount} of {total} marked</span>
          <span className="text-sm font-bold text-emerald-600">{pct}%</span>
        </div>
        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-emerald-500 rounded-full transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Student list */}
      <div className="space-y-2">
        {students.map(student => (
          <div
            key={student.id}
            className="bg-white border border-slate-100 rounded-xl p-4 flex items-center gap-3 hover:border-emerald-200 transition-all"
          >
            <button
              onClick={() => onOpenStudent(student)}
              className="flex-1 text-left"
            >
              <p className="font-semibold text-slate-800">{student.preferred_name || student.first_name} {student.last_name}</p>
              <p className="text-xs text-slate-400 mt-0.5">{student.email}</p>
            </button>
            <div className="flex gap-2">
              <button
                onClick={() => handleToggle(student.id)}
                className={`px-4 py-2 rounded-lg font-medium transition-all flex items-center gap-1.5 ${
                  attendance[student.id] === "present"
                    ? "bg-emerald-100 text-emerald-700 border-emerald-200"
                    : "bg-slate-100 text-slate-500 border-slate-200"
                } border`}
              >
                <Check className="w-4 h-4" /> Present
              </button>
              <button
                onClick={() => handleToggle(student.id)}
                className={`px-4 py-2 rounded-lg font-medium transition-all flex items-center gap-1.5 ${
                  attendance[student.id] === "absent"
                    ? "bg-rose-100 text-rose-700 border-rose-200"
                    : "bg-slate-100 text-slate-500 border-slate-200"
                } border`}
              >
                <X className="w-4 h-4" /> Absent
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}