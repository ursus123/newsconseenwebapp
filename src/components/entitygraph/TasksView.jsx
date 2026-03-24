import React, { useMemo } from "react";

const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
const NOW = () => new Date();

export default function TasksView({ enterprises, tasks, selectedEnterprise }) {
  const visibleEnterprises = useMemo(() => {
    if (selectedEnterprise === "all") return enterprises;
    return enterprises.filter(e => e.id === selectedEnterprise);
  }, [enterprises, selectedEnterprise]);

  const perEnterprise = useMemo(() => {
    return visibleEnterprises.map(e => {
      const name = e.enterprise_name;
      const allTasks = tasks.filter(t => t.enterprise === name);
      const now = NOW();
      const recent = allTasks.filter(t => (now - new Date(t.scheduled_date || t.created_date)) <= THIRTY_DAYS);
      const completed = recent.filter(t => t.status === "completed" || t.outcome === "completed");
      const overdue = allTasks.filter(t => {
        const due = t.due_date || t.scheduled_date;
        if (!due) return false;
        return new Date(due) < now && t.status !== "completed" && t.status !== "cancelled";
      });
      const upcoming = allTasks.filter(t => {
        const due = t.due_date || t.scheduled_date;
        if (!due) return false;
        const diff = new Date(due) - now;
        return diff > 0 && diff <= THIRTY_DAYS && t.status !== "completed" && t.status !== "cancelled";
      });

      const rate = recent.length > 0 ? Math.round((completed.length / recent.length) * 100) : null;

      // Group by task_type
      const byType = {};
      recent.forEach(t => {
        const type = t.task_type || "other";
        if (!byType[type]) byType[type] = { total: 0, completed: 0 };
        byType[type].total++;
        if (t.status === "completed" || t.outcome === "completed") byType[type].completed++;
      });

      return { enterprise: e, name, recent, completed, overdue, upcoming, rate, byType };
    });
  }, [visibleEnterprises, tasks]);

  if (!enterprises.length) {
    return (
      <div className="flex items-center justify-center h-full text-slate-400">
        <p>No enterprise data available.</p>
      </div>
    );
  }

  return (
    <div className="overflow-y-auto h-full p-4">
      <div className="grid gap-4 max-w-5xl mx-auto">
        {perEnterprise.map(({ enterprise, name, recent, completed, overdue, upcoming, rate, byType }) => {
          const rateColor = rate === null ? "bg-slate-100 text-slate-500"
            : rate >= 75 ? "bg-emerald-100 text-emerald-700"
            : rate >= 40 ? "bg-amber-100 text-amber-700"
            : "bg-rose-100 text-rose-700";

          return (
            <div key={enterprise.id} className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-bold text-slate-800 text-sm">{name}</h3>
                  {enterprise.enterprise_type && (
                    <p className="text-[10px] text-slate-400 capitalize mt-0.5">{enterprise.enterprise_type.replace(/_/g, " ")}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {rate !== null && (
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${rateColor}`}>
                      {rate}% complete
                    </span>
                  )}
                </div>
              </div>

              {/* Summary cards */}
              <div className="grid grid-cols-4 gap-2 mb-4">
                {[
                  { label: "Tasks (30d)", value: recent.length, color: "text-slate-700" },
                  { label: "Completed", value: completed.length, color: "text-emerald-600" },
                  { label: "Overdue", value: overdue.length, color: overdue.length > 0 ? "text-rose-600" : "text-slate-400" },
                  { label: "Upcoming", value: upcoming.length, color: "text-indigo-600" },
                ].map((s, i) => (
                  <div key={i} className="bg-slate-50 rounded-xl p-3 text-center">
                    <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">{s.label}</p>
                  </div>
                ))}
              </div>

              {/* By task type breakdown */}
              {Object.keys(byType).length > 0 && (
                <div className="space-y-1.5 mb-4">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">By Type (30d)</p>
                  {Object.entries(byType)
                    .sort((a, b) => b[1].total - a[1].total)
                    .slice(0, 5)
                    .map(([type, counts]) => {
                      const pct = Math.round((counts.completed / counts.total) * 100);
                      return (
                        <div key={type} className="flex items-center gap-2">
                          <span className="text-[11px] text-slate-600 w-36 truncate capitalize">{type.replace(/_/g, " ")}</span>
                          <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full bg-indigo-400 rounded-full" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-[10px] text-slate-400 w-16 text-right">{counts.completed}/{counts.total}</span>
                        </div>
                      );
                    })}
                </div>
              )}

              {/* Overdue list */}
              {overdue.length > 0 && (
                <div className="bg-rose-50 rounded-xl p-3 border border-rose-100">
                  <p className="text-xs font-bold text-rose-600 mb-2">⚠️ Overdue Tasks ({overdue.length})</p>
                  <div className="space-y-1">
                    {overdue.slice(0, 4).map(t => (
                      <div key={t.id} className="flex items-center justify-between">
                        <span className="text-xs text-rose-700 truncate">{t.title}</span>
                        <span className="text-[10px] text-rose-400 shrink-0 ml-2">{t.due_date || t.scheduled_date}</span>
                      </div>
                    ))}
                    {overdue.length > 4 && <p className="text-[10px] text-rose-400">+{overdue.length - 4} more</p>}
                  </div>
                </div>
              )}

              {recent.length === 0 && (
                <div className="text-center py-4 text-slate-400 text-xs">No tasks in the last 30 days</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}