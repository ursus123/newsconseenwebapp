import React, { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { ArrowLeft, Mail, Phone, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function TeacherProfilePage({ person, onBack, onOpenClass }) {
  const { data: relationships = [] } = useQuery({
    queryKey: ["teacher_classes", person?.id],
    queryFn: () => base44.entities.Relationship.filter({
      relationship_type: "person_enterprise",
      person_name: person?.id,
      status: "active",
    }),
    enabled: !!person?.id,
  });

  const { data: enterprises = [] } = useQuery({
    queryKey: ["teacher_enterprises"],
    queryFn: () => base44.entities.Enterprise.list(),
  });

  const assignedClasses = relationships
    .map(r => enterprises.find(e => e.id === r.enterprise_id || e.id === r.enterprise_name))
    .filter(c => c);

  return (
    <div className="flex flex-col gap-6 min-h-full">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-slate-800">{person?.preferred_name || person?.first_name} {person?.last_name}</h1>
          <p className="text-slate-500 text-sm mt-0.5">{person?.primary_role || "Teacher"}</p>
        </div>
      </div>

      {/* Info cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white border border-slate-100 rounded-xl p-4">
          <p className="text-xs text-slate-400 mb-1">Status</p>
          <p className="font-bold text-slate-800 capitalize">{person?.status || "Active"}</p>
        </div>
        <div className="bg-white border border-slate-100 rounded-xl p-4 flex items-center gap-3">
          <BookOpen className="w-5 h-5 text-emerald-600" />
          <div>
            <p className="text-xs text-slate-400">Classes</p>
            <p className="font-bold text-slate-800">{assignedClasses.length}</p>
          </div>
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

      {/* Assigned classes */}
      <div className="bg-white border border-slate-100 rounded-2xl p-5">
        <h2 className="font-bold text-slate-800 mb-3">Assigned Classes</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {assignedClasses.length > 0 ? (
            assignedClasses.map(classObj => (
              <div key={classObj.id} className="border border-slate-100 rounded-xl p-4 flex flex-col gap-3">
                <h3 className="font-semibold text-slate-800">{classObj.enterprise_name}</h3>
                <Button
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white w-full"
                  onClick={() => onOpenClass(classObj)}
                >
                  Take Attendance
                </Button>
              </div>
            ))
          ) : (
            <p className="text-slate-400 text-sm col-span-2">No classes assigned</p>
          )}
        </div>
      </div>
    </div>
  );
}