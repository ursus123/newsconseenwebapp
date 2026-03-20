import React, { useState } from "react";
import { format } from "date-fns";
import { ChevronDown, ChevronUp } from "lucide-react";

export default function CountHistory({ history }) {
  const [expanded, setExpanded] = useState(null);

  const sorted = [...history].sort((a, b) => new Date(b.created_date) - new Date(a.created_date));

  if (sorted.length === 0) {
    return (
      <div className="text-center py-20 text-slate-400">
        <p className="text-4xl mb-3">🕐</p>
        <p>No completed count sessions yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {sorted.map(task => {
        let meta = {};
        try { meta = JSON.parse(task.outcome_notes || "{}"); } catch (_) {}
        const isOpen = expanded === task.id;

        const duration = meta.started_at && meta.completed_at
          ? Math.round((new Date(meta.completed_at) - new Date(meta.started_at)) / 60000)
          : null;

        return (
          <div key={task.id} className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <button
              className="w-full flex items-start justify-between p-4 text-left hover:bg-slate-50 transition-colors"
              onClick={() => setExpanded(isOpen ? null : task.id)}
            >
              <div className="flex-1">
                <p className="font-semibold text-slate-800 text-sm">{task.title}</p>
                <div className="flex flex-wrap gap-3 mt-1.5 text-xs text-slate-500">
                  <span>📅 {format(new Date(task.created_date), "MMM d, yyyy 'at' h:mm a")}</span>
                  {task.assigned_to_name && <span>👤 {task.assigned_to_name}</span>}
                  {meta.location && <span>📍 {meta.location}</span>}
                  {meta.items_updated !== undefined && <span>✏️ {meta.items_updated} items updated</span>}
                  {duration !== null && <span>⏱️ {duration} min</span>}
                </div>
              </div>
              {isOpen ? <ChevronUp className="w-4 h-4 text-slate-400 shrink-0 mt-1" /> : <ChevronDown className="w-4 h-4 text-slate-400 shrink-0 mt-1" />}
            </button>

            {isOpen && (
              <div className="px-4 pb-4 border-t border-slate-100">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-3 text-sm">
                  {[
                    ["Session ID", meta.session_id || "—"],
                    ["Total Items", meta.total_items ?? "—"],
                    ["Items Counted", meta.items_counted ?? "—"],
                    ["Items Updated", meta.items_updated ?? "—"],
                    ["Items Skipped", meta.items_skipped ?? "—"],
                    ["Duration", duration !== null ? `${duration} min` : "—"],
                  ].map(([label, val]) => (
                    <div key={label} className="bg-slate-50 rounded-lg p-3">
                      <p className="text-xs text-slate-400">{label}</p>
                      <p className="font-semibold text-slate-800">{val}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}