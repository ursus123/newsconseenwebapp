import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import AttendanceDashboard from "@/components/attendance/AttendanceDashboard";
import ClassAttendancePage from "@/components/attendance/ClassAttendancePage";
import StudentProfilePage from "@/components/attendance/StudentProfilePage";
import TeacherProfilePage from "@/components/attendance/TeacherProfilePage";

export default function AttendanceRegister() {
  const [currentUser, setCurrentUser] = useState(null);
  const [view, setView] = useState("dashboard"); // dashboard | class | student | teacher
  const [selectedClass, setSelectedClass] = useState(null);
  const [selectedPerson, setSelectedPerson] = useState(null);
  const [personRole, setPersonRole] = useState(null); // "student" | "teacher"

  useEffect(() => {
    base44.auth.me().then(setCurrentUser).catch(() => {});
  }, []);

  const navigate = (v, data = {}) => {
    setView(v);
    if (data.classObj) setSelectedClass(data.classObj);
    if (data.person) setSelectedPerson(data.person);
    if (data.role) setPersonRole(data.role);
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {view === "dashboard" && (
        <AttendanceDashboard
          currentUser={currentUser}
          onOpenClass={(classObj) => navigate("class", { classObj })}
          onOpenPerson={(person, role) => navigate(role === "teacher" ? "teacher" : "student", { person, role })}
        />
      )}
      {view === "class" && selectedClass && (
        <ClassAttendancePage
          classObj={selectedClass}
          currentUser={currentUser}
          onBack={() => navigate("dashboard")}
          onOpenStudent={(person) => navigate("student", { person, role: "student" })}
        />
      )}
      {view === "student" && selectedPerson && (
        <StudentProfilePage
          person={selectedPerson}
          onBack={() => navigate("dashboard")}
        />
      )}
      {view === "teacher" && selectedPerson && (
        <TeacherProfilePage
          person={selectedPerson}
          onBack={() => navigate("dashboard")}
          onOpenClass={(classObj) => navigate("class", { classObj })}
        />
      )}
    </div>
  );
}