import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, ChevronDown, ChevronUp, Trash2, AlertTriangle, RefreshCw } from "lucide-react";
import { format, subDays } from "date-fns";

function parseNotes(notes) {
  try { return JSON.parse(notes); } catch { return {}; }
}

function ErrorRow({ task, onResolve }) {
  const [expanded, setExpanded] = useState(false);
  const details = parseNotes(task.outcome_notes);
  const errorTitle = (task.title || "").replace("App Error: ", "");
  const time = task.created_date ? format(new Date(task.created_date), "MMM d 'at' h:mm a") : "—";

  return (
    <div className={`border-b border-slate-100 last:border-0 ${task.status === "completed" ? "opacity-60" : ""}`}>
      <div className="flex items-start gap-3 px-4 py-3">
        <div className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${task.status === "completed" ? "bg-slate-300" : "bg-rose-400"}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-700 truncate" title={errorTitle}>{errorTitle.slice(0, 80)}</p>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <span className="text-xs text-slate-400">{time}</span>
                {details.page && details.page !== "unknown" && (
                  <span className="text-xs bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-md">{details.page}</span>
                )}
                <Badge className={`text-[10px] px-1.5 py-0 ${task.status === "completed" ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
                  {task.status === "completed" ? "Resolved" : "Open"}
                </Badge>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {task.status !== "completed" && (
                <Button size="sm" variant="outline" onClick={() => onResolve(task.id)}
                  className="rounded-lg h-7 text-xs gap-1 text-emerald-700 border-emerald-200 hover:bg-emerald-50">
                  <CheckCircle2 className="w-3 h-3" /> Resolve
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => setExpanded((o) => !o)}
                className="rounded-lg h-7 text-xs text-slate-400 hover:text-slate-600 px-2">
                {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {expanded && (
        <div className="mx-4 mb-3 bg-slate-900 rounded-xl p-3 space-y-2">
          {details.error && (
            <div>
              <p className="text-[10px] text-slate-500 mb-1 font-semibold uppercase tracking-wider">Error</p>
              <pre className="text-[11px] text-rose-300 font-mono whitespace-pre-wrap break-all">{details.error}</pre>
            </div>
          )}
          {details.stack && (
            <div>
              <p className="text-[10px] text-slate-500 mb-1 font-semibold uppercase tracking-wider">Stack Trace</p>
              <pre className="text-[10px] text-slate-400 font-mono whitespace-pre-wrap break-all max-h-32 overflow-y-auto">{details.stack}</pre>
            </div>
          )}
          {details.url && (
            <p className="text-[10px] text-slate-500">URL: <span className="text-slate-300">{details.url}</span></p>
          )}
        </div>
      )}
    </div>
  );
}

export default function ErrorLogSection({ user }) {
  const queryClient = useQueryClient();
  const [clearing, setClearing] = useState(false);

  const { data: allTasks = [], isLoading, refetch } = useQuery({
    queryKey: ["error-log-tasks", user?.company_id],
    queryFn: async () => {
      const tasks = await base44.entities.Task.filter({ task_type: "other" });
      return tasks.filter((t) => t.title?.startsWith("App Error:"));
    },
    enabled: !!user,
  });

  const sevenDaysAgo = subDays(new Date(), 7);
  const recentErrors = allTasks.filter((t) => t.created_date && new Date(t.created_date) >= sevenDaysAgo);
  const openErrors = allTasks.filter((t) => t.status !== "completed");

  const handleResolve = async (id) => {
    await base44.entities.Task.update(id, { status: "completed" });
    queryClient.invalidateQueries({ queryKey: ["error-log-tasks"] });
  };

  const handleClearResolved = async () => {
    setClearing(true);
    const resolved = allTasks.filter((t) => t.status === "completed");
    await Promise.all(resolved.map((t) => base44.entities.Task.delete(t.id)));
    queryClient.invalidateQueries({ queryKey: ["error-log-tasks"] });
    setClearing(false);
  };

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="p-4 text-center">
          <p className="text-2xl font-bold text-rose-500">{recentErrors.length}</p>
          <p className="text-xs text-slate-400 mt-1">Errors last 7 days</p>
        </Card>
        <Card className="p-4 text-center">
          <p className="text-2xl font-bold text-amber-500">{openErrors.length}</p>
          <p className="text-xs text-slate-400 mt-1">Unresolved errors</p>
        </Card>
      </div>

      {/* Table */}
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <p className="text-sm font-semibold text-slate-700">Error Log</p>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={() => refetch()} className="h-7 text-xs gap-1 text-slate-400">
              <RefreshCw className="w-3 h-3" /> Refresh
            </Button>
            {allTasks.some((t) => t.status === "completed") && (
              <Button size="sm" variant="outline" onClick={handleClearResolved} disabled={clearing}
                className="h-7 text-xs gap-1 text-slate-500 rounded-lg">
                <Trash2 className="w-3 h-3" />
                {clearing ? "Clearing…" : "Clear Resolved"}
              </Button>
            )}
          </div>
        </div>

        {isLoading ? (
          <div className="py-12 text-center text-sm text-slate-400">Loading error log…</div>
        ) : allTasks.length === 0 ? (
          <div className="py-12 text-center space-y-2">
            <p className="text-3xl">✅</p>
            <p className="text-sm font-medium text-slate-600">No errors logged</p>
            <p className="text-xs text-slate-400">Your app is running smoothly</p>
          </div>
        ) : (
          <div>
            {allTasks.map((task) => (
              <ErrorRow key={task.id} task={task} onResolve={handleResolve} />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}