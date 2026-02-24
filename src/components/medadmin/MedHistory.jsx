import React from "react";
import { format, parseISO } from "date-fns";
import { CheckCircle2, XCircle, AlertCircle, FileText } from "lucide-react";

const OUTCOME_CFG = {
  completed:      { label: "Administered", icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-50" },
  refused:        { label: "Refused",      icon: XCircle,      color: "text-orange-600",  bg: "bg-orange-50" },
  missed:         { label: "Missed",       icon: AlertCircle,  color: "text-gray-500",    bg: "bg-gray-50" },
  partially_done: { label: "Partial",      icon: AlertCircle,  color: "text-yellow-600",  bg: "bg-yellow-50" },
  pending:        { label: "Pending",      icon: AlertCircle,  color: "text-blue-500",    bg: "bg-blue-50" },
};

export default function MedHistory({ tasks, selectedClient }) {
  const done = [...tasks]
    .filter((t) => t.outcome !== "pending" || t.status === "completed")
    .sort((a, b) => new Date(b.created_date) - new Date(a.created_date));

  const clientName = selectedClient
    ? `${selectedClient.first_name} ${selectedClient.last_name}`
    : null;

  return (
    <div className="px-4 py-4 space-y-3">
      <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">
        Log — {clientName || "All Clients"}
      </p>

      {done.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <FileText className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm font-semibold">No history yet</p>
        </div>
      )}

      {done.map((t) => {
        const cfg = OUTCOME_CFG[t.outcome] || OUTCOME_CFG.pending;
        const Icon = cfg.icon;
        const dateStr = t.created_date
          ? format(new Date(t.created_date), "MMM d, HH:mm")
          : t.scheduled_date || "—";

        return (
          <div key={t.id} className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
            <div className="flex items-start gap-3">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${cfg.bg}`}>
                <Icon className={`w-4 h-4 ${cfg.color}`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-black text-gray-900">{t.title?.toUpperCase()}</p>
                <p className="text-xs text-gray-400 mt-0.5">{dateStr}</p>
                {t.outcome_notes && (
                  <p className="text-xs text-gray-500 mt-1 leading-relaxed">{t.outcome_notes}</p>
                )}
                {t.assigned_to_name && (
                  <p className="text-[11px] text-gray-400 mt-1.5 font-medium">Staff: {t.assigned_to_name}</p>
                )}
              </div>
              <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${cfg.bg} ${cfg.color} shrink-0`}>
                {cfg.label}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}