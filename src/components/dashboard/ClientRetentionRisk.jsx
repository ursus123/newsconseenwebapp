import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Calendar, Users } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

function calculateRiskScore(client, tasks) {
  let score = 0;
  const fullName = `${client.first_name} ${client.last_name}`;
  const clientTasks = tasks.filter(t => t.related_person === fullName);

  const lastTask = clientTasks
    .filter(t => t.scheduled_date)
    .sort((a, b) => new Date(b.scheduled_date) - new Date(a.scheduled_date))[0];

  const daysSinceActivity = lastTask
    ? (new Date() - new Date(lastTask.scheduled_date)) / (1000 * 60 * 60 * 24)
    : 999;

  if (daysSinceActivity > 60) score += 40;
  else if (daysSinceActivity > 30) score += 20;
  else if (daysSinceActivity > 14) score += 10;

  const refusals = clientTasks.filter(t => t.outcome === "refused").length;
  score += refusals * 5;

  const missed = clientTasks.filter(t => t.outcome === "missed").length;
  score += missed * 8;

  if (client.start_date) {
    const daysEnrolled = (new Date() - new Date(client.start_date)) / (1000 * 60 * 60 * 24);
    if (daysEnrolled > 365) score -= 15;
    if (daysEnrolled > 730) score -= 10;
  }

  return Math.min(Math.max(score, 0), 100);
}

function RiskBadge({ score }) {
  if (score > 60) return (
    <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-red-100 text-red-700 border border-red-200">
      HIGH RISK
    </span>
  );
  if (score >= 30) return (
    <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-700 border border-amber-200">
      MEDIUM
    </span>
  );
  return (
    <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-green-100 text-green-700 border border-green-200">
      LOW RISK
    </span>
  );
}

export default function ClientRetentionRisk({ people, tasks, currentUser }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [schedulingId, setSchedulingId] = useState(null);

  const clients = people.filter(p =>
    p.person_type === "client" && p.status === "active"
  );

  const scored = clients
    .map(client => ({ client, score: calculateRiskScore(client, tasks) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  const createTaskMut = useMutation({
    mutationFn: (client) => base44.entities.Task.create({
      task_type: "service_visit",
      title: `Check-in with ${client.first_name} ${client.last_name}`,
      status: "open",
      priority: "high",
      related_person: `${client.first_name} ${client.last_name}`,
      scheduled_date: new Date().toISOString().split("T")[0],
      company_id: currentUser?.company_id,
      assigned_to_email: currentUser?.email,
      assigned_to_name: currentUser?.full_name || currentUser?.email,
    }),
    onSuccess: (_, client) => {
      qc.invalidateQueries({ queryKey: ["tasks-dash"] });
      toast({ title: `Check-in task created for ${client.first_name} ${client.last_name}` });
      setSchedulingId(null);
    },
    onError: () => setSchedulingId(null),
  });

  const handleSchedule = async (client) => {
    setSchedulingId(client.id);
    createTaskMut.mutate(client);
  };

  if (clients.length === 0) return null;

  const highRiskCount = scored.filter(s => s.score > 60).length;

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center">
            <AlertTriangle className="w-4 h-4 text-red-500" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-800">Client Retention Risk</h2>
            {highRiskCount > 0 && (
              <p className="text-[11px] text-red-600 font-medium">{highRiskCount} high-risk client{highRiskCount !== 1 ? "s" : ""} need attention</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-slate-400">
          <Users className="w-3.5 h-3.5" />
          {clients.length} active clients
        </div>
      </div>

      <div className="space-y-3">
        {scored.map(({ client, score }) => {
          const fullName = `${client.first_name} ${client.last_name}`;
          const clientTasks = tasks.filter(t => t.related_person === fullName);
          const lastTask = clientTasks
            .filter(t => t.scheduled_date)
            .sort((a, b) => new Date(b.scheduled_date) - new Date(a.scheduled_date))[0];
          const daysSince = lastTask
            ? Math.round((new Date() - new Date(lastTask.scheduled_date)) / (1000 * 60 * 60 * 24))
            : null;

          return (
            <div key={client.id} className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 hover:bg-slate-100 transition-colors">
              <div className="w-8 h-8 rounded-full bg-white border border-slate-200 flex items-center justify-center text-sm font-bold text-slate-600 shrink-0">
                {client.first_name?.[0]}{client.last_name?.[0]}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium text-slate-800">{fullName}</p>
                  <RiskBadge score={score} />
                </div>
                <div className="flex items-center gap-3 mt-0.5">
                  <span className="text-[11px] text-slate-400">
                    {daysSince !== null ? `Last activity ${daysSince}d ago` : "No activity recorded"}
                  </span>
                  <span className="text-[11px] font-bold text-slate-500">Score: {score}</span>
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="shrink-0 h-7 text-[11px] px-2.5 rounded-lg border-orange-200 text-orange-700 hover:bg-orange-50"
                disabled={schedulingId === client.id}
                onClick={() => handleSchedule(client)}
              >
                <Calendar className="w-3 h-3 mr-1" />
                {schedulingId === client.id ? "..." : "Schedule Check-in"}
              </Button>
            </div>
          );
        })}
      </div>

      {scored.length === 0 && (
        <p className="text-sm text-slate-400 text-center py-4">No client risk data available.</p>
      )}
    </Card>
  );
}