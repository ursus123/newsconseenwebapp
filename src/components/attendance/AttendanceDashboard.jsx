import React, { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Users, BookOpen, Award, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";

// Taxonomy config for this app
// These are the canonical person_subtype values that identify
// students and teachers in the universal taxonomy.
// To support a new role, add it to MasterDataOption in Base44
// with the correct parent_value — do not add it here.

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

export default function AttendanceDashboard({ currentUser, onOpenClass, onOpenPerson }) {
  const [activeTab, setActiveTab] = useState("classes");

  const { data: people = [] } = useQuery({
    queryKey: ["attendance_people", currentUser?.company_id],
    queryFn: () => base44.entities.Person.filter({ company_id: currentUser?.company_id }),
    enabled: !!currentUser?.company_id,
  });

  const { data: enterprises = [] } = useQuery({
    queryKey: ["attendance_enterprises", currentUser?.company_id],
    queryFn: () => base44.entities.Enterprise.filter({ company_id: currentUser?.company_id }),
    enabled: !!currentUser?.company_id,
  });

  const { data: relationships = [] } = useQuery({
    queryKey: ["attendance_relationships", currentUser?.company_id],
    queryFn: () => base44.entities.Relationship.filter({ company_id: currentUser?.company_id }),
    enabled: !!currentUser?.company_id,
  });

  const { data: tasks = [] } = useQuery({
    queryKey: ["attendance_tasks", currentUser?.company_id],
    queryFn: () => base44.entities.Task.filter({ 
      company_id: currentUser?.company_id,
      task_type: "attendance",
    }),
    enabled: !!currentUser?.company_id,
  });

  const students = people.filter(p => isStudent(p));
  const teachers = people.filter(p => isTeacher(p));
  const classes = enterprises;

  // Calculate attendance rate for today
  const today = new Date().toISOString().split("T")[0];
  const todayAttendance = tasks.filter(t => t.date === today);
  const attendanceRate = todayAttendance.length > 0
    ? Math.round((todayAttendance.filter(t => t.outcome === "completed").length / todayAttendance.length) * 100)
    : 0;

  const getClassStudentCount = (classId) => {
    return relationships.filter(r => 
      r.enterprise_id === classId && 
      r.relationship_type === "person_enterprise" &&
      r.status === "active" &&
      people.find(p => 
      (p.id === r.person_id || 
       `${p.first_name} ${p.last_name}`.toLowerCase() === (r.person_name || "").toLowerCase() ||
       p.preferred_name === r.person_name) && 
      isStudent(p)
      )
    ).length;
  };

  const getClassTeacher = (classId) => {
    const teacherRel = relationships.find(r => 
      r.enterprise_id === classId && 
      r.relationship_type === "person_enterprise" &&
      r.status === "active"
    );
    if (!teacherRel) return null;
    return people.find(p => 
      (p.id === teacherRel.person_id ||
       `${p.first_name} ${p.last_name}`.toLowerCase() === (teacherRel.person_name || "").toLowerCase() ||
       p.preferred_name === teacherRel.person_name) &&
      isTeacher(p)
    );
  };

  return (
    <div className="flex flex-col gap-6 min-h-full">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-black text-slate-800">Attendance Register</h1>
        <p className="text-slate-500 text-sm mt-1">Track and manage student attendance</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Students", value: students.length, icon: Users, color: "text-blue-600", bg: "bg-blue-50" },
          { label: "Teachers", value: teachers.length, icon: Award, color: "text-emerald-600", bg: "bg-emerald-50" },
          { label: "Classes", value: classes.length, icon: BookOpen, color: "text-violet-600", bg: "bg-violet-50" },
          { label: "Today's Rate", value: `${attendanceRate}%`, icon: TrendingUp, color: "text-orange-600", bg: "bg-orange-50" },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="bg-white border border-slate-100 rounded-2xl p-4 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg ${bg} flex items-center justify-center shrink-0`}>
              <Icon className={`w-5 h-5 ${color}`} />
            </div>
            <div>
              <p className="text-2xl font-black text-slate-800">{value}</p>
              <p className="text-xs text-slate-400">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Classes grid */}
      {activeTab === "classes" && (
        <div>
          <h2 className="text-lg font-bold text-slate-800 mb-3">Classes</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {classes.map(classObj => (
              <div key={classObj.id} className="bg-white border border-slate-100 rounded-2xl p-5 flex flex-col gap-3">
                <div>
                  <h3 className="font-bold text-slate-800">{classObj.enterprise_name}</h3>
                  <p className="text-xs text-slate-400 mt-0.5">{getClassStudentCount(classObj.id)} students</p>
                </div>
                {getClassTeacher(classObj.id) && (
                  <p className="text-sm text-slate-600">
                    <span className="text-slate-400">Teacher:</span> {getClassTeacher(classObj.id).preferred_name || getClassTeacher(classObj.id).first_name}
                  </p>
                )}
                <Button
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white mt-auto w-full"
                  onClick={() => onOpenClass(classObj)}
                >
                  Take Attendance
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* People tabs and list */}
      <div>
        <div className="flex gap-2 mb-3 border-b border-slate-200">
          {["classes", "students", "teachers"].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium transition-all ${
                activeTab === tab
                  ? "border-b-2 border-emerald-600 text-emerald-700"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {activeTab === "students" && (
          <div className="space-y-2">
            {students.map(student => (
              <button
                key={student.id}
                onClick={() => onOpenPerson(student, "student")}
                className="w-full text-left bg-white border border-slate-100 rounded-xl p-4 hover:border-emerald-200 hover:bg-emerald-50 transition-all"
              >
                <p className="font-semibold text-slate-800">{student.preferred_name || student.first_name} {student.last_name}</p>
                <p className="text-xs text-slate-400 mt-0.5">{student.status || "active"}</p>
              </button>
            ))}
          </div>
        )}

        {activeTab === "teachers" && (
          <div className="space-y-2">
            {teachers.map(teacher => (
              <button
                key={teacher.id}
                onClick={() => onOpenPerson(teacher, "teacher")}
                className="w-full text-left bg-white border border-slate-100 rounded-xl p-4 hover:border-emerald-200 hover:bg-emerald-50 transition-all"
              >
                <p className="font-semibold text-slate-800">{teacher.preferred_name || teacher.first_name} {teacher.last_name}</p>
                <p className="text-xs text-slate-400 mt-0.5">{teacher.primary_role || "Teacher"}</p>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}