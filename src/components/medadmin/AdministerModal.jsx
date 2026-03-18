import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation } from "@tanstack/react-query";
import { format } from "date-fns";
import { CheckCircle2, XCircle, AlertCircle, X } from "lucide-react";

const REFUSED_REASONS = ["Client declined", "Side effects concern", "Unable to swallow", "Behavioral", "Asleep/unavailable", "Other"];
const MISSED_REASONS = ["Client unavailable", "Medication not available", "Order changed", "Staff error", "Other"];

const OUTCOMES = [
  { value: "completed", label: "Administered", color: "bg-emerald-600 text-white", border: "border-emerald-600" },
  { value: "refused",   label: "Refused",      color: "bg-orange-500 text-white",  border: "border-orange-500" },
  { value: "missed",    label: "Missed",        color: "bg-gray-400 text-white",    border: "border-gray-400" },
  { value: "partially_done", label: "Partial", color: "bg-yellow-500 text-white",  border: "border-yellow-500" },
];

function nowTimeStr() { return format(new Date(), "HH:mm"); }
function todayStr()   { return format(new Date(), "yyyy-MM-dd"); }

export default function AdministerModal({ task, user, onClose, onSuccess }) {
  const [outcome, setOutcome] = useState("completed");
  const [notes, setNotes] = useState("");
  const [reason, setReason] = useState("");
  const [time, setTime] = useState(nowTimeStr());
  const [confirmed, setConfirmed] = useState(false);

  const needsReason = outcome === "refused" || outcome === "missed";
  const reasonOptions = outcome === "refused" ? REFUSED_REASONS : MISSED_REASONS;

  const saveMut = useMutation({
    mutationFn: async () => {
      await base44.entities.Task.update(task.id, {
        status: "completed",
        outcome,
        outcome_notes: [
          notes,
          reason ? `Reason: ${reason}` : "",
          `Recorded at ${time} by ${user?.full_name || user?.email}`,
        ].filter(Boolean).join(" | "),
      });

      // Only post a stock-out transaction when the medication was actually administered
      if (outcome === "completed" || outcome === "partially_done") {
        const doseQty = outcome === "partially_done" ? 0.5 : 1;

        await base44.entities.Transaction.create({
          transaction_type: "stock_out",
          status: "posted",
          date: todayStr(),
          time,
          enterprise: task.enterprise || null,
          description: `Medication Administration — ${task.title} for ${task.related_person || "patient"}`,
          assigned_person: task.related_person || null,
          line_items: [{
            item_name: task.title,
            quantity: doseQty,
            unit: "piece",
            unit_price: 0,
          }],
          internal_notes: `Admin: ${user?.full_name || user?.email} | Outcome: ${outcome} | Task ref: ${task.id}`,
        });

        // Reduce stock_quantity on the matching Product record
        if (task.related_item) {
          try {
            const products = await base44.entities.Product.filter({ name: task.related_item });
            if (products.length > 0) {
              const product = products[0];
              const newQty = Math.max(0, (product.stock_quantity || 0) - doseQty);
              await base44.entities.Product.update(product.id, { stock_quantity: newQty });
            }
          } catch {}
        }
      }
    },
    onSuccess,
  });

  const canSubmit = !needsReason || (reason && notes.length >= 3);

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end">
      <div className="w-full max-w-lg mx-auto bg-white rounded-t-3xl shadow-2xl max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between px-5 pt-5 pb-4 border-b border-gray-100">
          <div>
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Recording Medication</p>
            <p className="text-xl font-black text-gray-900 mt-0.5">{task.title?.toUpperCase()}</p>
            {task.scheduled_time && (
              <p className="text-sm text-gray-400 mt-0.5">Scheduled: {task.scheduled_time}</p>
            )}
          </div>
          <button onClick={onClose} className="p-2 rounded-xl text-gray-400 hover:bg-gray-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 py-5 space-y-6">
          {/* Outcome selector */}
          <div>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Outcome *</p>
            <div className="grid grid-cols-2 gap-2">
              {OUTCOMES.map((o) => (
                <button
                  key={o.value}
                  onClick={() => { setOutcome(o.value); setReason(""); }}
                  className={`py-4 rounded-2xl text-sm font-bold border-2 transition-all active:scale-95
                    ${outcome === o.value ? `${o.color} ${o.border}` : "bg-white text-gray-500 border-gray-200"}`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          {/* Time */}
          <div>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Administration Time</p>
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 text-lg font-bold text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>

          {/* Reason (required for refused/missed) */}
          {needsReason && (
            <div>
              <p className="text-xs font-bold text-red-600 uppercase tracking-wider mb-2">Reason * (required)</p>
              <div className="grid grid-cols-1 gap-2">
                {reasonOptions.map((r) => (
                  <button
                    key={r}
                    onClick={() => setReason(r)}
                    className={`px-4 py-3 rounded-xl text-sm font-semibold border-2 text-left transition-all
                      ${reason === r ? "bg-red-50 border-red-400 text-red-700" : "bg-white border-gray-200 text-gray-600"}`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Notes */}
          <div>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
              Notes {needsReason ? "* (required)" : "(optional)"}
            </p>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={needsReason ? "Describe situation, client's response, follow-up actions…" : "Any observations, side effects, or notes…"}
              rows={3}
              className={`w-full px-4 py-3 rounded-xl border text-sm text-gray-700 placeholder-gray-300 resize-none focus:outline-none focus:ring-2 focus:ring-blue-400
                ${needsReason && notes.length < 3 ? "border-red-300" : "border-gray-200"}`}
            />
          </div>

          {/* Staff confirmation */}
          <div className="bg-blue-50 rounded-2xl px-4 py-3">
            <p className="text-xs font-bold text-blue-700">Recording as: {user?.full_name || user?.email}</p>
            <p className="text-xs text-blue-500 mt-0.5">Date: {todayStr()} · Time: {time}</p>
          </div>

          {/* Warning for non-admin outcomes */}
          {needsReason && (
            <div className="flex items-start gap-2 bg-orange-50 border border-orange-200 rounded-2xl px-4 py-3">
              <AlertCircle className="w-4 h-4 text-orange-600 shrink-0 mt-0.5" />
              <p className="text-xs font-semibold text-orange-700">
                Non-administration events are logged for audit. Supervisor may be notified.
              </p>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="sticky bottom-0 bg-white border-t border-gray-100 px-5 py-4 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-4 rounded-2xl border-2 border-gray-200 text-gray-600 font-bold text-sm"
          >
            Cancel
          </button>
          <button
            onClick={() => saveMut.mutate()}
            disabled={!canSubmit || saveMut.isPending}
            className={`flex-1 py-4 rounded-2xl text-white font-black text-sm transition-all active:scale-95
              ${!canSubmit ? "bg-gray-300 cursor-not-allowed" : "bg-emerald-600 hover:bg-emerald-700"}`}
          >
            {saveMut.isPending ? "Saving…" : (
              <span className="flex items-center justify-center gap-2">
                <CheckCircle2 className="w-5 h-5" /> Confirm & Record
              </span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}