// Redirects to /Attendance (Class Register tab) — merged in Sprint 4
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

export default function AttendanceRegister() {
  const navigate = useNavigate();
  useEffect(() => { navigate("/Attendance", { replace: true }); }, [navigate]);
  return null;
}
