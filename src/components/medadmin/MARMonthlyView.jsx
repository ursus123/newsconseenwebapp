import React, { useMemo } from "react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, parseISO, isToday } from "date-fns";

const STATUS_COLORS = {
  administered: "bg-green-500 text-white",
  refused:      "bg-orange-400 text-white",
  missed:       "bg-red-500 text-white",
  due:          "bg-blue-100 text-blue-700",
  overdue:      "bg-red-200 text-red-800",
  pending:      "bg-slate-100 text-slate-500",
};

const STATUS_ABBR = {
  administered: "✓",
  refused:      "RF",
  missed:       "MS",
  due:          "DU",
  overdue:      "OD",
  pending:      "—",
};

function getCellStatus(task) {
  if (task.outcome === "completed") return "administered";
  if (task.outcome === "refused") return "refused";
  if (task.outcome === "missed") return "missed";
  const now = new Date();
  if (task.scheduled_date && task.scheduled_time) {
    const scheduled = new Date(`${task.scheduled_date}T${task.scheduled_time}`);
    if (scheduled < now) return "overdue";
  }
  return "due";
}

function getInitials(name) {
  if (!name) return "—";
  return name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 3);
}

export default function MARMonthlyView({ tasks, selectedClient, selectedMonth }) {
  // selectedMonth: a Date object representing the month to display
  const monthStart = startOfMonth(selectedMonth);
  const monthEnd = endOfMonth(selectedMonth);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

  // Group tasks by medication name (title) then by date
  const medGroups = useMemo(() => {
    const groups = {};
    tasks.forEach((t) => {
      if (t.task_type !== "medication_admin") return;
      const date = t.scheduled_date;
      if (!date) return;
      const monthStr = format(selectedMonth, "yyyy-MM");
      if (!date.startsWith(monthStr)) return;

      const key = t.title || "Unknown";
      if (!groups[key]) groups[key] = { tasks: {}, meta: t };
      groups[key].tasks[date] = t;
    });
    return groups;
  }, [tasks, selectedMonth]);

  const clientName = selectedClient
    ? `${selectedClient.first_name} ${selectedClient.last_name}`
    : "No Client";

  if (!selectedClient) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-400">
        <p className="text-sm font-semibold">Select a client to view the MAR</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-8">
      {/* Header */}
      <div className="bg-white border border-blue-200 rounded-xl p-4 shadow-sm">
        <h2 className="text-base font-black text-blue-800 text-center">
          Medication Administration Record — {format(selectedMonth, "MMMM yyyy")}
        </h2>
        <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-gray-600">
          <p><span className="font-bold">Individual:</span> {clientName}</p>
          {selectedClient.preferred_name && (
            <p><span className="font-bold">Preferred:</span> {selectedClient.preferred_name}</p>
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="bg-white border border-gray-100 rounded-xl p-3">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Legend</p>
        <div className="flex flex-wrap gap-2">
          {[
            { label: "Administered", cls: "bg-green-500 text-white" },
            { label: "Refused", cls: "bg-orange-400 text-white" },
            { label: "Missed", cls: "bg-red-500 text-white" },
            { label: "Due", cls: "bg-blue-100 text-blue-700" },
            { label: "Overdue", cls: "bg-red-200 text-red-800" },
          ].map((l) => (
            <span key={l.label} className={`text-[10px] font-bold px-2 py-0.5 rounded ${l.cls}`}>
              {l.label}
            </span>
          ))}
        </div>
      </div>

      {/* Medication rows */}
      {Object.keys(medGroups).length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="text-sm font-semibold">No scheduled medications for {format(selectedMonth, "MMMM yyyy")}</p>
          <p className="text-xs mt-1 opacity-60">Use "Schedule Month" to add medications</p>
        </div>
      ) : (
        Object.entries(medGroups).map(([medName, { tasks: dayMap, meta }]) => (
          <div key={medName} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            {/* Med header */}
            <div className="bg-blue-50 border-b border-blue-100 px-4 py-2">
              <p className="text-sm font-black text-blue-900">{medName.toUpperCase()}</p>
              <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1">
                {meta.internal_notes && (
                  <p className="text-[11px] text-blue-700">
                    {meta.internal_notes.replace(/route:|dose:|indication:/gi, (m) => m.charAt(0).toUpperCase() + m.slice(1))}
                  </p>
                )}
                {meta.scheduled_time && (
                  <p className="text-[11px] text-blue-600 font-semibold">
                    Schedule Time: {meta.scheduled_time}
                  </p>
                )}
              </div>
            </div>

            {/* Calendar grid — scrollable horizontally */}
            <div className="overflow-x-auto">
              <table className="min-w-full text-center">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="sticky left-0 bg-gray-50 px-3 py-1.5 text-[10px] font-bold text-gray-500 text-left min-w-[70px]">
                      Time
                    </th>
                    {days.map((d) => (
                      <th
                        key={d.toISOString()}
                        className={`px-1 py-1 text-[10px] font-bold min-w-[28px] ${
                          isToday(d) ? "text-blue-600" : "text-gray-500"
                        }`}
                      >
                        <div>{format(d, "d")}</div>
                        <div className="text-[8px] font-normal opacity-70">{format(d, "EEE").toUpperCase()}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="sticky left-0 bg-white px-3 py-1 text-[11px] font-semibold text-gray-600 text-left">
                      {meta.scheduled_time || "—"}
                    </td>
                    {days.map((d) => {
                      const dateStr = format(d, "yyyy-MM-dd");
                      const task = dayMap[dateStr];
                      if (!task) {
                        return (
                          <td key={dateStr} className="px-0.5 py-1">
                            <span className={`inline-flex items-center justify-center w-6 h-6 rounded text-[9px] font-bold ${STATUS_COLORS.pending}`}>
                              —
                            </span>
                          </td>
                        );
                      }
                      const st = getCellStatus(task);
                      const initials = task.outcome === "completed" || task.outcome === "refused" || task.outcome === "missed"
                        ? getInitials(task.assigned_to_name)
                        : STATUS_ABBR[st];
                      return (
                        <td key={dateStr} className="px-0.5 py-1">
                          <span
                            className={`inline-flex items-center justify-center w-6 h-6 rounded text-[9px] font-bold ${STATUS_COLORS[st]}`}
                            title={`${dateStr}: ${st}${task.assigned_to_name ? ` — ${task.assigned_to_name}` : ""}`}
                          >
                            {initials}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Notes */}
            {(meta.outcome_notes || meta.related_service) && (
              <div className="px-4 py-2 border-t border-gray-50">
                <p className="text-[11px] text-gray-500 italic">{meta.outcome_notes || meta.related_service}</p>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}