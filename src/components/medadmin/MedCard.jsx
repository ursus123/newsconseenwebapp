import React, { useState } from "react";
import { Pill, CheckCircle2, XCircle, Clock, AlertTriangle, Info } from "lucide-react";
import MedInfoModal from "./MedInfoModal";

const STATUS_CONFIG = {
  due:          { label: "Due",          dot: "bg-emerald-500", badge: "bg-emerald-50 text-emerald-700 border-emerald-200",  border: "border-l-emerald-500" },
  overdue:      { label: "OVERDUE",      dot: "bg-red-500 animate-pulse", badge: "bg-red-50 text-red-700 border-red-200",    border: "border-l-red-500" },
  administered: { label: "Administered", dot: "bg-emerald-500", badge: "bg-green-50 text-green-700 border-green-200",        border: "border-l-emerald-400" },
  refused:      { label: "Refused",      dot: "bg-orange-500", badge: "bg-orange-50 text-orange-700 border-orange-200",     border: "border-l-orange-400" },
  missed:       { label: "Missed",       dot: "bg-gray-400",   badge: "bg-gray-50 text-gray-600 border-gray-200",           border: "border-l-gray-400" },
};

export default function MedCard({ task, status, onAdminister, product }) {
  const [showInfo, setShowInfo] = useState(false);
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.due;
  const isDone = status === "administered" || status === "refused" || status === "missed";
  const isOverdue = status === "overdue";

  // Parse med info from title/notes
  const medName = task.title || "Unknown Medication";
  const dose = task.outcome_notes?.match(/dose:(.*?)(?:\||$)/i)?.[1]?.trim() || "";
  const route = task.internal_notes?.match(/route:(.*?)(?:\||$)/i)?.[1]?.trim() || "oral";
  const notes = task.outcome_notes;

  return (
    <div className={`bg-white rounded-2xl border border-gray-100 border-l-4 ${cfg.border} shadow-sm overflow-hidden`}>
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${isOverdue ? "bg-red-50" : "bg-blue-50"}`}>
            <Pill className={`w-5 h-5 ${isOverdue ? "text-red-500" : "text-blue-600"}`} />
          </div>

          <div className="flex-1 min-w-0">
            <p className={`text-base font-black tracking-tight ${isOverdue ? "text-red-700" : "text-gray-900"}`}>
              {medName.toUpperCase()}
            </p>
            <p className="text-sm text-gray-500 mt-0.5">
              {[dose, route].filter(Boolean).join(" · ") || "See notes"}
            </p>
            {task.scheduled_time && (
              <div className="flex items-center gap-1 mt-1">
                <Clock className="w-3 h-3 text-gray-400" />
                <span className="text-xs text-gray-400">Scheduled {task.scheduled_time}</span>
              </div>
            )}
            {notes && isDone && (
              <p className="text-xs text-gray-400 mt-1 italic truncate">{notes}</p>
            )}
          </div>

          <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${cfg.badge} shrink-0`}>
            {cfg.label}
          </span>
        </div>

        {/* Action buttons — only for non-done */}
        {!isDone && (
          <div className="flex gap-2 mt-4">
            <button
              onClick={onAdminister}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-600 text-white text-sm font-bold active:scale-95 transition-all hover:bg-emerald-700"
            >
              <CheckCircle2 className="w-4 h-4" />
              Administer
            </button>
            <button
              onClick={() => setShowInfo(true)}
              className="px-4 py-3 rounded-xl bg-blue-50 text-blue-600 text-sm font-bold active:scale-95 transition-all hover:bg-blue-100"
              title="Medication info"
            >
              <Info className="w-4 h-4" />
            </button>
            <button
              onClick={onAdminister}
              className="px-4 py-3 rounded-xl bg-orange-100 text-orange-700 text-sm font-bold active:scale-95 transition-all"
              title="Refuse / Miss"
            >
              <XCircle className="w-4 h-4" />
            </button>
          </div>
        )}

        {isDone && (
          <button
            onClick={() => setShowInfo(true)}
            className="mt-2 flex items-center gap-1.5 text-xs text-blue-500 font-semibold hover:underline"
          >
            <Info className="w-3.5 h-3.5" /> View medication info
          </button>
        )}

        {showInfo && (
          <MedInfoModal product={product} taskTitle={medName} onClose={() => setShowInfo(false)} />
        )}

        {isDone && (
          <div className={`mt-3 flex items-center gap-2 text-xs font-semibold
            ${status === "administered" ? "text-emerald-600" : status === "refused" ? "text-orange-600" : "text-gray-400"}`}>
            {status === "administered" && <CheckCircle2 className="w-3.5 h-3.5" />}
            {status !== "administered" && <XCircle className="w-3.5 h-3.5" />}
            {status === "administered" ? "Recorded" : status === "refused" ? "Refused — documented" : "Marked missed"}
            {task.assigned_to_name && ` · ${task.assigned_to_name}`}
          </div>
        )}
      </div>
    </div>
  );
}