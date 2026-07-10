import React, { useState } from "react";
import { TYPE_ALIASES } from "@/utils/typeAliases";
import { ncClient } from "@/api/ncClient";
import { useMutation, useQueryClient } from "@tanstack/react-query";

const RAILWAY_URL = "https://newsconseenwebapp-production.up.railway.app";
const RAILWAY_API_KEY = (import.meta["env"] || {})["VITE_RAILWAY_API_KEY"] || "";
const triggerETL = (entity) =>
  fetch(`${RAILWAY_URL}/load/${entity}-summary`, {
    method: "POST",
    headers: RAILWAY_API_KEY ? { "x-api-key": RAILWAY_API_KEY } : {},
  }).catch(() => {});
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Users, ShieldAlert, BarChart2, Bell } from "lucide-react";
import { differenceInDays, parseISO } from "date-fns";
import { useToast } from "@/components/ui/use-toast";

// ── 1. Staff-to-Client Ratio ──────────────────────────────────────────────────
function StaffClientRatio({ people, enterprises }) {
  const ratioData = enterprises.map(e => {
    const name = e.enterprise_name;
    const staff = people.filter(p =>
      p.status === "active" &&
      TYPE_ALIASES.staff.includes(p.person_type) &&
      p.primary_role &&
      (p.assigned_enterprises || []).some(ae => ae.enterprise_name === name)
    ).length;
    const clients = people.filter(p =>
      p.status === "active" &&
      p.person_type === "client" &&
      (p.assigned_enterprises || []).some(ae => ae.enterprise_name === name)
    ).length;
    return { name, staff, clients };
  }).filter(r => r.staff > 0 || r.clients > 0);

  if (ratioData.length === 0) return null;

  const maxClients = Math.max(...ratioData.map(r => r.clients), 1);

  return (
    <div>
      <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
        <Users className="w-3.5 h-3.5" /> Staff-to-Client Ratio
      </h3>
      <div className="space-y-3">
        {ratioData.map(r => {
          const ratio = r.staff > 0 ? r.clients / r.staff : 999;
          const isHigh = ratio > 5;
          const barPct = Math.round((r.clients / maxClients) * 100);
          return (
            <div key={r.name}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-slate-700 truncate max-w-[60%]">{r.name}</span>
                <span className={`text-[11px] font-bold ${isHigh ? "text-red-600" : "text-slate-500"}`}>
                  {r.staff} staff : {r.clients} clients
                  {isHigh && " ⚠️"}
                </span>
              </div>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${isHigh ? "bg-red-500" : "bg-emerald-500"}`}
                  style={{ width: `${barPct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── 2. Certification Expiry Alerts ────────────────────────────────────────────
function CertificationAlerts({ people, currentUser }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [sending, setSending] = useState(null);

  const today = new Date();
  const expiring = people
    .filter(p => p.certification_expiry && p.status === "active")
    .map(p => ({
      ...p,
      daysLeft: differenceInDays(parseISO(p.certification_expiry), today),
    }))
    .filter(p => p.daysLeft <= 90)
    .sort((a, b) => a.daysLeft - b.daysLeft);

  const createTaskMut = useMutation({
    mutationFn: (person) => ncClient.entities.Task.create({
      task_type: "certification_renewal",
      title: `Renew certification: ${person.certification_name || "License"} — ${person.first_name} ${person.last_name}`,
      status: "open",
      priority: person.daysLeft <= 30 ? "urgent" : "high",
      related_person: `${person.first_name} ${person.last_name}`,
      due_date: person.certification_expiry,
      company_id: currentUser?.company_id,
      assigned_to_email: currentUser?.email,
      assigned_to_name: currentUser?.full_name || currentUser?.email,
    }),
    onSuccess: (_, person) => {
      triggerETL("task");
      qc.invalidateQueries({ queryKey: ["tasks-dash"] });
      toast({ title: `Reminder task created for ${person.first_name} ${person.last_name}` });
      setSending(null);
    },
    onError: () => setSending(null),
  });

  if (expiring.length === 0) return null;

  return (
    <div>
      <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
        <ShieldAlert className="w-3.5 h-3.5" /> Certification Expiry Alerts
      </h3>
      <div className="space-y-2">
        {expiring.map(person => {
          const isUrgent = person.daysLeft <= 30;
          const isExpired = person.daysLeft < 0;
          return (
            <div
              key={person.id}
              className={`flex items-center gap-3 p-3 rounded-xl border ${
                isExpired ? "bg-red-50 border-red-200" :
                isUrgent ? "bg-amber-50 border-amber-200" :
                "bg-slate-50 border-slate-200"
              }`}
            >
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-slate-800">
                  {person.first_name} {person.last_name}
                  {person.certification_name && (
                    <span className="font-normal text-slate-500"> — {person.certification_name}</span>
                  )}
                </p>
                <p className={`text-[11px] font-medium mt-0.5 ${
                  isExpired ? "text-red-600" :
                  isUrgent ? "text-amber-700" :
                  "text-slate-500"
                }`}>
                  {isExpired
                    ? `Expired ${Math.abs(person.daysLeft)} days ago`
                    : `Expires in ${person.daysLeft} day${person.daysLeft !== 1 ? "s" : ""}`}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="shrink-0 h-7 text-[11px] px-2.5 rounded-lg"
                disabled={sending === person.id}
                onClick={() => { setSending(person.id); createTaskMut.mutate(person); }}
              >
                <Bell className="w-3 h-3 mr-1" />
                {sending === person.id ? "..." : "Remind"}
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── 3. Task Load per Staff ────────────────────────────────────────────────────
function TaskLoadDistribution({ people, tasks }) {
  const openTasks = tasks.filter(t => t.status === "open" || t.status === "in_progress");

  const staffList = people.filter(p =>
    p.status === "active" &&
    TYPE_ALIASES.staff.includes(p.person_type)
  );

  const staffLoad = staffList.map(p => {
    const name = `${p.first_name} ${p.last_name}`;
    const count = openTasks.filter(t => t.assigned_to_name === name || t.assigned_to_email === p.email).length;
    return { name, count, role: p.primary_role || "" };
  }).sort((a, b) => b.count - a.count);

  if (staffLoad.length === 0) return null;

  const overloaded = staffLoad.slice(0, 5);
  const underutilized = [...staffLoad].reverse().slice(0, 5).filter(s => s.count === 0 || s.count < (staffLoad[0]?.count / 2));

  const maxCount = Math.max(...staffLoad.map(s => s.count), 1);

  return (
    <div>
      <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
        <BarChart2 className="w-3.5 h-3.5" /> Task Load per Staff
      </h3>
      <div className="space-y-2 mb-4">
        <p className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider">Most Loaded</p>
        {overloaded.map(s => (
          <div key={s.name}>
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-xs text-slate-700 truncate max-w-[70%]">{s.name}</span>
              <span className="text-[11px] font-bold text-slate-500">{s.count} open</span>
            </div>
            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-orange-400 rounded-full transition-all duration-500"
                style={{ width: `${Math.round((s.count / maxCount) * 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
      {underutilized.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider">Underutilized</p>
          {underutilized.map(s => (
            <div key={s.name} className="flex items-center justify-between px-3 py-1.5 bg-slate-50 rounded-lg">
              <span className="text-xs text-slate-600">{s.name}</span>
              <span className="text-[11px] text-emerald-600 font-medium">{s.count} open tasks</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────
export default function StaffingIntelligence({ people, enterprises, tasks, currentUser }) {
  const hasData = people.length > 0;
  if (!hasData) return null;

  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 mb-5">
        <div className="w-8 h-8 rounded-lg bg-violet-50 flex items-center justify-center">
          <Users className="w-4 h-4 text-violet-600" />
        </div>
        <h2 className="text-sm font-semibold text-slate-800">Staffing Intelligence</h2>
      </div>

      <div className="space-y-6">
        <StaffClientRatio people={people} enterprises={enterprises} />
        <CertificationAlerts people={people} currentUser={currentUser} />
        <TaskLoadDistribution people={people} tasks={tasks} />
      </div>
    </Card>
  );
}