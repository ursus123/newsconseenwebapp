import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Calendar, Plus, Clock, User, Filter, Check, X, AlertCircle, BookOpen } from "lucide-react";
import { format } from "date-fns";
import AttendanceDashboard from "@/components/attendance/AttendanceDashboard";
import ClassAttendancePage from "@/components/attendance/ClassAttendancePage";
import StudentProfilePage from "@/components/attendance/StudentProfilePage";
import TeacherProfilePage from "@/components/attendance/TeacherProfilePage";

export default function Attendance() {
  const [tab, setTab] = useState("mark"); // "mark" | "register"
  const { data: currentUser = null } = useQuery({
    queryKey: ["currentUser"],
    queryFn: () => base44.auth.me(),
    staleTime: 0,
    refetchOnMount: "always",
  });
  // Register sub-views
  const [regView, setRegView] = useState("dashboard");
  const [selectedClass, setSelectedClass] = useState(null);
  const [selectedPerson, setSelectedPerson] = useState(null);

  const navigateReg = (v, data = {}) => {
    setRegView(v);
    if (data.classObj) setSelectedClass(data.classObj);
    if (data.person) setSelectedPerson(data.person);
  };

  const [open, setOpen] = useState(false);
  const [filterDate, setFilterDate] = useState(new Date().toISOString().split("T")[0]);
  const [filterPerson, setFilterPerson] = useState("");
  const [filterType, setFilterType] = useState("");
  const [formData, setFormData] = useState({});
  const [saving, setSaving] = useState(false);

  // Fetch people
  const { data: people = [] } = useQuery({
    queryKey: ["people-list"],
    queryFn: () => base44.entities.Person.list(),
    staleTime: 0,
    refetchOnMount: "always",
  });

  // Fetch attendance records with filters
  const { data: records = [], refetch } = useQuery({
    queryKey: ["attendance", filterDate, filterPerson, filterType],
    queryFn: async () => {
      let query = filterDate ? { date: filterDate } : {};
      if (filterPerson) query.person_name = filterPerson;
      if (filterType) query.person_type = filterType;
      return await base44.entities.Attendance.filter(query);
    },
    staleTime: 0,
    refetchOnMount: "always",
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.date || !formData.person_name || !formData.person_type || !formData.status) return;

    setSaving(true);
    try {
      const hours = formData.check_in_time && formData.check_out_time
        ? calculateHours(formData.check_in_time, formData.check_out_time)
        : null;

      await base44.entities.Attendance.create({
        ...formData,
        hours_worked: hours,
        marked_by: (await base44.auth.me()).email,
      });

      setFormData({});
      setOpen(false);
      refetch();
    } finally {
      setSaving(false);
    }
  };

  const calculateHours = (checkIn, checkOut) => {
    const [inHour, inMin] = checkIn.split(":").map(Number);
    const [outHour, outMin] = checkOut.split(":").map(Number);
    return ((outHour + outMin / 60) - (inHour + inMin / 60)).toFixed(2);
  };

  const statusColors = {
    present: "bg-emerald-100 text-emerald-800",
    absent: "bg-red-100 text-red-800",
    late: "bg-amber-100 text-amber-800",
    excused: "bg-blue-100 text-blue-800",
    half_day: "bg-purple-100 text-purple-800",
  };

  const statusIcons = {
    present: <Check className="w-4 h-4" />,
    absent: <X className="w-4 h-4" />,
    late: <AlertCircle className="w-4 h-4" />,
    excused: <AlertCircle className="w-4 h-4" />,
    half_day: <Clock className="w-4 h-4" />,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Attendance</h1>
          <p className="text-slate-500 mt-1">Log daily attendance or open the class register</p>
        </div>
        {tab === "mark" && (
          <Button onClick={() => setOpen(true)} className="bg-emerald-600 hover:bg-emerald-700 rounded-xl gap-2">
            <Plus className="w-4 h-4" /> Log Attendance
          </Button>
        )}
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 p-1 bg-slate-100 rounded-xl w-fit">
        {[
          { key: "mark",     label: "Quick Mark",     icon: Check },
          { key: "register", label: "Class Register", icon: BookOpen },
        ].map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => { setTab(key); setRegView("dashboard"); }}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              tab === key ? "bg-white shadow-sm text-slate-800" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <Icon className="w-4 h-4" /> {label}
          </button>
        ))}
      </div>

      {/* Class Register tab */}
      {tab === "register" && (
        <div>
          {regView === "dashboard" && (
            <AttendanceDashboard
              currentUser={currentUser}
              onOpenClass={(classObj) => navigateReg("class", { classObj })}
              onOpenPerson={(person, role) => navigateReg(role === "teacher" ? "teacher" : "student", { person })}
            />
          )}
          {regView === "class" && selectedClass && (
            <ClassAttendancePage
              classObj={selectedClass}
              currentUser={currentUser}
              onBack={() => navigateReg("dashboard")}
              onOpenStudent={(person) => navigateReg("student", { person })}
            />
          )}
          {regView === "student" && selectedPerson && (
            <StudentProfilePage person={selectedPerson} onBack={() => navigateReg("dashboard")} />
          )}
          {regView === "teacher" && selectedPerson && (
            <TeacherProfilePage
              person={selectedPerson}
              onBack={() => navigateReg("dashboard")}
              onOpenClass={(classObj) => navigateReg("class", { classObj })}
            />
          )}
        </div>
      )}

      {/* Quick Mark tab */}
      {tab === "mark" && (<>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-slate-100 p-4">
        <div className="flex items-end gap-4 flex-wrap">
          <div className="flex-1 min-w-48">
            <Label className="text-sm font-medium text-slate-700 mb-1.5 block">Date</Label>
            <Input
              type="date"
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
              className="rounded-lg border-slate-200"
            />
          </div>
          <div className="flex-1 min-w-48">
            <Label className="text-sm font-medium text-slate-700 mb-1.5 block">Person</Label>
            <Select value={filterPerson} onValueChange={setFilterPerson}>
              <SelectTrigger className="rounded-lg border-slate-200">
                <SelectValue placeholder="All people" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={null}>All people</SelectItem>
                {people.map((p) => (
                  <SelectItem key={p.id} value={p.first_name + " " + p.last_name}>
                    {p.first_name} {p.last_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1 min-w-48">
            <Label className="text-sm font-medium text-slate-700 mb-1.5 block">Type</Label>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="rounded-lg border-slate-200">
                <SelectValue placeholder="All types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={null}>All types</SelectItem>
                <SelectItem value="student">Student</SelectItem>
                <SelectItem value="staff">Staff</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" size="sm" className="rounded-lg gap-2">
            <Filter className="w-4 h-4" /> Reset
          </Button>
        </div>
      </div>

      {/* Records Table */}
      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="px-6 py-3 text-left font-semibold text-slate-700">Date</th>
                <th className="px-6 py-3 text-left font-semibold text-slate-700">Person</th>
                <th className="px-6 py-3 text-left font-semibold text-slate-700">Type</th>
                <th className="px-6 py-3 text-left font-semibold text-slate-700">Status</th>
                <th className="px-6 py-3 text-left font-semibold text-slate-700">Check-in / Out</th>
                <th className="px-6 py-3 text-left font-semibold text-slate-700">Hours</th>
                <th className="px-6 py-3 text-left font-semibold text-slate-700">Notes</th>
              </tr>
            </thead>
            <tbody>
              {records.length === 0 ? (
                <tr>
                  <td colSpan="7" className="px-6 py-8 text-center text-slate-400">
                    No attendance records found
                  </td>
                </tr>
              ) : (
                records.map((record) => (
                  <tr key={record.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-3 text-slate-900">{format(new Date(record.date), "MMM dd, yyyy")}</td>
                    <td className="px-6 py-3 text-slate-900 flex items-center gap-2">
                      <User className="w-4 h-4 text-slate-400" />
                      {record.person_name}
                    </td>
                    <td className="px-6 py-3 text-slate-600 capitalize">{record.person_type}</td>
                    <td className="px-6 py-3">
                      <Badge className={`${statusColors[record.status]} border-0 gap-1.5`}>
                        {statusIcons[record.status]}
                        {record.status.replace("_", " ")}
                      </Badge>
                    </td>
                    <td className="px-6 py-3 text-slate-600">
                      {record.check_in_time && record.check_out_time
                        ? `${record.check_in_time} - ${record.check_out_time}`
                        : "-"}
                    </td>
                    <td className="px-6 py-3 text-slate-900 font-medium">
                      {record.hours_worked ? `${record.hours_worked}h` : "-"}
                    </td>
                    <td className="px-6 py-3 text-slate-600 truncate max-w-xs">{record.notes || "-"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Attendance Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Log Attendance</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-sm font-medium text-slate-700 mb-1.5 block">Date *</Label>
                <Input
                  type="date"
                  value={formData.date || ""}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  className="rounded-lg border-slate-200"
                  required
                />
              </div>

              <div>
                <Label className="text-sm font-medium text-slate-700 mb-1.5 block">Person *</Label>
                <Select value={formData.person_name || ""} onValueChange={(value) => {
                  const selected = people.find((p) => p.first_name + " " + p.last_name === value);
                  setFormData({ ...formData, person_name: value, person_id: selected?.id });
                }}>
                  <SelectTrigger className="rounded-lg border-slate-200">
                    <SelectValue placeholder="Select person" />
                  </SelectTrigger>
                  <SelectContent>
                    {people.map((p) => (
                      <SelectItem key={p.id} value={p.first_name + " " + p.last_name}>
                        {p.first_name} {p.last_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-sm font-medium text-slate-700 mb-1.5 block">Type *</Label>
                <Select value={formData.person_type || ""} onValueChange={(value) => setFormData({ ...formData, person_type: value })}>
                  <SelectTrigger className="rounded-lg border-slate-200">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="student">Student</SelectItem>
                    <SelectItem value="staff">Staff</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-sm font-medium text-slate-700 mb-1.5 block">Status *</Label>
                <Select value={formData.status || ""} onValueChange={(value) => setFormData({ ...formData, status: value })}>
                  <SelectTrigger className="rounded-lg border-slate-200">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="present">Present</SelectItem>
                    <SelectItem value="absent">Absent</SelectItem>
                    <SelectItem value="late">Late</SelectItem>
                    <SelectItem value="excused">Excused</SelectItem>
                    <SelectItem value="half_day">Half Day</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-sm font-medium text-slate-700 mb-1.5 block">Check-in Time</Label>
                <Input
                  type="time"
                  value={formData.check_in_time || ""}
                  onChange={(e) => setFormData({ ...formData, check_in_time: e.target.value })}
                  className="rounded-lg border-slate-200"
                />
              </div>

              <div>
                <Label className="text-sm font-medium text-slate-700 mb-1.5 block">Check-out Time</Label>
                <Input
                  type="time"
                  value={formData.check_out_time || ""}
                  onChange={(e) => setFormData({ ...formData, check_out_time: e.target.value })}
                  className="rounded-lg border-slate-200"
                />
              </div>
            </div>

            <div>
              <Label className="text-sm font-medium text-slate-700 mb-1.5 block">Notes</Label>
              <Input
                type="text"
                placeholder="Optional notes..."
                value={formData.notes || ""}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className="rounded-lg border-slate-200"
              />
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => setOpen(false)} className="rounded-lg">
                Cancel
              </Button>
              <Button type="submit" disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 rounded-lg">
                {saving ? "Saving..." : "Log Attendance"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      </>)}
    </div>
  );
}