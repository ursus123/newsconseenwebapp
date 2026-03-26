import React, { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { ArrowLeft, Mail, Phone, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function StudentProfilePage({ person, onBack }) {
  const { data: tasks = [] } = useQuery({
    queryKey: ["student_attendance", person?.id],
    queryFn: async () => {
      const fullName = [person?.preferred_name || person?.first_name, person?.last_name]
        .filter(Boolean).join(" ");
      const byFullName = await base44.entities.Task.filter({
        task_type: "attendance",
        assigned_to_name: fullName,
      });
      if (byFullName.length > 0) return byFullName;
      // fallback: filter by first name only
      const byFirst = await base44.entities.Task.filter({
        task_type: "attendance",
        assigned_to_name: person?.preferred_name || person?.first_name,
      });
      return byFirst;
    },
    enabled: !!person?.id,
  });

  const attendanceRecords = tasks.filter(t => t.status === "completed").sort((a, b) => new Date(b.date) - new Date(a.date));
  const presentCount = attendanceRecords.filter(t => t.outcome === "completed").length;
  const attendanceRate = attendanceRecords.length > 0
    ? Math.round((presentCount / attendanceRecords.length) * 100)
    : 0;

  return (
    <div className="flex flex-col gap-6 min-h-full">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-slate-800">{person?.preferred_name || person?.first_name} {person?.last_name}</h1>
          <p className="text-slate-500 text-sm mt-0.5">{person?.person_type || "Student"}</p>
        </div>
      </div>

      {/* Info cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white border border-slate-100 rounded-xl p-4">
          <p className="text-xs text-slate-400 mb-1">Status</p>
          <p className="font-bold text-slate-800 capitalize">{person?.status || "Active"}</p>
        </div>
        <div className="bg-white border border-slate-100 rounded-xl p-4 flex items-center gap-3">
          <TrendingUp className="w-5 h-5 text-emerald-600" />
          <div>
            <p className="text-xs text-slate-400">Attendance</p>
            <p className="font-bold text-slate-800">{attendanceRate}%</p>
          </div>
        </div>
        <div className="bg-white border border-slate-100 rounded-xl p-4">
          <p className="text-xs text-slate-400 mb-1">Days Recorded</p>
          <p className="font-bold text-slate-800">{attendanceRecords.length}</p>
        </div>
      </div>

      {/* Contact info */}
      {(person?.email || person?.phone) && (
        <div className="bg-white border border-slate-100 rounded-2xl p-5">
          <h2 className="font-bold text-slate-800 mb-3">Contact Information</h2>
          <div className="space-y-2">
            {person?.email && (
              <div className="flex items-center gap-3">
                <Mail className="w-4 h-4 text-slate-400" />
                <a href={`mailto:${person.email}`} className="text-emerald-600 hover:underline">{person.email}</a>
              </div>
            )}
            {person?.phone && (
              <div className="flex items-center gap-3">
                <Phone className="w-4 h-4 text-slate-400" />
                <a href={`tel:${person.phone}`} className="text-emerald-600 hover:underline">{person.phone}</a>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Attendance history */}
      <div className="bg-white border border-slate-100 rounded-2xl p-5">
        <h2 className="font-bold text-slate-800 mb-3">Attendance History</h2>
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {attendanceRecords.length > 0 ? (
            attendanceRecords.map((record, idx) => (
              <div key={idx} className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-100">
                <span className="text-sm text-slate-700">
                  {new Date(record.date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                </span>
                <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                  record.outcome === "completed"
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-rose-100 text-rose-700"
                }`}>
                  {record.outcome === "completed" ? "Present" : "Absent"}
                </span>
              </div>
            ))
          ) : (
            <p className="text-center text-slate-400 py-6">No attendance records yet</p>
          )}
        </div>
      </div>
    </div>
  );
}