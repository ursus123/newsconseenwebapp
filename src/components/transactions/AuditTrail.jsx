import React from "react";
import { format } from "date-fns";
import { Clock, CheckCircle, XCircle, ExternalLink } from "lucide-react";
import { createPageUrl } from "@/utils";

function AuditRow({ icon: Icon, iconColor, label, children }) {
  return (
    <div className="flex items-start gap-3">
      <div className={`mt-0.5 ${iconColor}`}><Icon className="w-4 h-4" /></div>
      <div>
        <span className="text-xs font-semibold text-slate-600">{label}: </span>
        <span className="text-xs text-slate-500">{children}</span>
      </div>
    </div>
  );
}

function fmt(d) {
  if (!d) return "—";
  try { return format(new Date(d), "MMM d, yyyy 'at' h:mm a"); } catch { return d; }
}

export default function AuditTrail({ transaction }) {
  if (!transaction) return null;
  return (
    <div className="border-t border-slate-100 pt-4 mt-4 space-y-2.5">
      <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Audit Trail</p>

      <AuditRow icon={Clock} iconColor="text-slate-400" label="Created">
        {transaction.created_by || "—"} on {fmt(transaction.created_date)}
      </AuditRow>

      {transaction.status === "posted" || transaction.posted_date ? (
        <AuditRow icon={CheckCircle} iconColor="text-emerald-500" label="Posted">
          {transaction.posted_by || "—"} on {fmt(transaction.posted_date)}
        </AuditRow>
      ) : null}

      {transaction.status === "voided" ? (
        <AuditRow icon={XCircle} iconColor="text-rose-500" label="Voided">
          {transaction.voided_by || "—"} on {fmt(transaction.voided_date)}
          {transaction.voided_reason && (
            <span className="block text-xs text-slate-400 mt-0.5 italic">Reason: {transaction.voided_reason}</span>
          )}
        </AuditRow>
      ) : null}

      {transaction.source_task_id && (
        <div className="flex items-center gap-3 pt-1">
          <div className="text-blue-400"><ExternalLink className="w-4 h-4" /></div>
          <div>
            <span className="text-xs font-semibold text-slate-600">Source Task: </span>
            <a
              href={createPageUrl("Tasks") + `?highlight=${transaction.source_task_id}`}
              className="text-xs text-blue-600 underline hover:text-blue-800"
            >
              {transaction.source_task_id.slice(0, 8).toUpperCase()}
            </a>
          </div>
        </div>
      )}
    </div>
  );
}