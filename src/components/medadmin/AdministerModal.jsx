import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation } from "@tanstack/react-query";
import { createRecord, updateRecord } from "@/services/dataService";
import { createRisk } from "@/services/intelligenceService";
import { format } from "date-fns";
import { CheckCircle2, AlertCircle, X, AlertTriangle, Package } from "lucide-react";
import RefusalCaptureForm from "./RefusalCaptureForm";
import { createStockTransaction } from "@/utils/createTransaction";
import PINConfirmModal from "./PINConfirmModal";
import VitalsCheckModal from "./VitalsCheckModal";

const OUTCOMES = [
  { value: "completed",      label: "Administered",  color: "bg-emerald-600 text-white",   border: "border-emerald-600" },
  { value: "refused",        label: "Refused",        color: "bg-orange-500 text-white",    border: "border-orange-500" },
  { value: "missed",         label: "Missed",         color: "bg-gray-400 text-white",      border: "border-gray-400" },
  { value: "partially_done", label: "Partial",        color: "bg-yellow-500 text-white",    border: "border-yellow-500" },
];

const MISSED_REASONS = ["Client unavailable", "Medication not available", "Order changed", "Staff error", "Other"];

function nowTimeStr() { return format(new Date(), "HH:mm"); }
function todayStr()   { return format(new Date(), "yyyy-MM-dd"); }

const PIN_KEY = (email) => `medadmin_pin_${email}`;

export default function AdministerModal({ task, user, products = [], onClose, onSuccess, darkMode }) {
  const [outcome, setOutcome] = useState("completed");
  const [notes, setNotes] = useState("");
  const [missedReason, setMissedReason] = useState("");
  const [time, setTime] = useState(nowTimeStr());

  // Refusal state
  const [refusalData, setRefusalData] = useState({ structured: "", isComplete: false });

  // Stock state
  const [productRecord, setProductRecord] = useState(null);
  const [stockLoading, setStockLoading] = useState(false);
  const [stockBlocked, setStockBlocked] = useState(false);
  const [reorderCreated, setReorderCreated] = useState(false);

  // Flow state
  const [step, setStep] = useState("main"); // main | vitals | pin | outofstock
  const [vitalsNote, setVitalsNote] = useState("");

  // Check if medication profile says controlled / requires vitals
  const medProfile = task.medProfile || null;
  const isControlled = medProfile?.is_controlled || task.regulatory_status === "controlled";
  const requiresVitals = medProfile?.requires_vitals_check;
  const storedPin = user?.email ? localStorage.getItem(PIN_KEY(user.email)) : null;

  // Load product stock on mount
  useEffect(() => {
    if (!task.related_item && !task.title) return;
    const medName = task.related_item || task.title;
    setStockLoading(true);
    base44.entities.Product.filter({ name: medName }).then((prods) => {
      if (prods.length > 0) {
        setProductRecord(prods[0]);
        if ((prods[0].stock_quantity || 0) <= 0) setStockBlocked(true);
      }
      setStockLoading(false);
    }).catch(() => setStockLoading(false));
  }, [task.title, task.related_item]);

  const needsRefusal = outcome === "refused";
  const needsMissedReason = outcome === "missed";
  const doseQty = outcome === "partially_done" ? 0.5 : 1;

  const saveMut = useMutation({
    mutationFn: async () => {
      let finalNotes = notes;
      if (needsRefusal && refusalData.structured) finalNotes = refusalData.structured + (notes ? ` | Notes: ${notes}` : "");
      if (needsMissedReason && missedReason) finalNotes = `MISSED: ${missedReason}` + (notes ? ` | ${notes}` : "");
      if (vitalsNote) finalNotes = (finalNotes ? `${finalNotes} | ` : "") + `Vitals: ${vitalsNote}`;
      finalNotes = (finalNotes ? `${finalNotes} | ` : "") + `Recorded at ${time} by ${user?.full_name || user?.email}`;

      await updateRecord("task", task.id, {
        status: "completed",
        outcome,
        outcome_notes: finalNotes,
      }, user);

      if (outcome === "refused") {
        createRisk({
          subject_type: "Task",
          subject_id: task.id,
          subject_name: task.related_person || "resident",
          category: "compliance",
          severity: "medium",
          likelihood: "medium",
          title: `Medication refused: ${task.title}`,
          description: `${task.related_person || "Resident"} refused ${task.title} (scheduled ${task.scheduled_time}). ${refusalData.structured ? `Reason: ${refusalData.structured}.` : ""}`,
          source: "medadmin",
        }, user).catch(() => {});
      }

      if (outcome === "completed" || outcome === "partially_done") {
        if (productRecord) {
          const newQty = Math.max(0, (productRecord.stock_quantity || 0) - doseQty);
          await updateRecord("product", productRecord.id, { stock_quantity: newQty }, user);
          await createStockTransaction(
            "stock_out",
            { id: productRecord.id, name: productRecord.name || task.title, unit: productRecord.unit || "dose", cost_price: productRecord.cost_price || 0 },
            doseQty,
            task.enterprise || user?.company_id || "",
            user,
            {
              source:    "medadmin",
              sourceRef: `medadmin-${task.id}-${Date.now()}`,
              notes:     `Administered to: ${task.related_person || "resident"}. Dose: ${doseQty} ${productRecord.unit || "dose"}. Given by: ${user?.full_name || user?.email}. Outcome: ${outcome}. Task: ${task.id}.`,
            }
          );
        }
      }
    },
    onSuccess,
  });

  const handlePrimaryAction = () => {
    if (outcome === "completed" || outcome === "partially_done") {
      if (stockBlocked) { setStep("outofstock"); return; }
      if (requiresVitals && !vitalsNote) { setStep("vitals"); return; }
      if (isControlled) { setStep("pin"); return; }
    }
    saveMut.mutate();
  };

  const canSubmit = () => {
    if (needsRefusal) return refusalData.isComplete;
    if (needsMissedReason) return !!missedReason;
    return true;
  };

  const bg = darkMode ? "bg-slate-800 text-slate-100" : "bg-white";
  const inputCls = `w-full px-4 py-3 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 ${darkMode ? "bg-slate-700 border-slate-600 text-slate-100" : "border-gray-200 text-gray-800"}`;

  // Out of stock blocking screen
  if (step === "outofstock") {
    return (
      <div className="fixed inset-0 bg-black/60 z-50 flex items-end">
        <div className={`w-full max-w-lg mx-auto ${bg} rounded-t-3xl shadow-2xl p-6 space-y-5`}>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
              <Package className="w-6 h-6 text-red-600" />
            </div>
            <div>
              <p className="font-black text-red-700">❌ Out of Stock</p>
              <p className="text-sm text-gray-600">{task.title}</p>
            </div>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
            <p className="text-sm font-bold text-red-800">Current stock: 0 units</p>
            <p className="text-xs text-red-700 mt-1">Administration cannot proceed. Please contact your supervisor to reorder.</p>
          </div>
          <button
            onClick={async () => {
              await createRecord("task", {
                task_type: "stock_counting",
                title: `URGENT: Reorder ${task.title}`,
                priority: "urgent",
                status: "open",
                scheduled_date: todayStr(),
                internal_notes: `Auto-generated from MedAdmin out-of-stock check. Medication: ${task.title}`,
              }, user);
              setReorderCreated(true);
            }}
            disabled={reorderCreated}
            className={`w-full py-3.5 rounded-2xl font-bold text-sm ${reorderCreated ? "bg-emerald-100 text-emerald-700" : "bg-red-600 text-white hover:bg-red-700"}`}
          >
            {reorderCreated ? "✓ Reorder Task Created" : "Create Reorder Task"}
          </button>
          <button onClick={onClose} className="w-full py-3 rounded-2xl border-2 border-gray-200 text-gray-600 font-bold text-sm">Close</button>
        </div>
      </div>
    );
  }

  // Vitals step
  if (step === "vitals") {
    return (
      <VitalsCheckModal
        medName={task.title}
        clientName={task.related_person || "client"}
        darkMode={darkMode}
        onProceed={(vs) => {
          setVitalsNote(vs);
          if (isControlled) { setStep("pin"); } else { setStep("main"); setTimeout(() => saveMut.mutate(), 100); }
        }}
        onHold={() => setStep("main")}
      />
    );
  }

  // PIN step
  if (step === "pin") {
    return (
      <PINConfirmModal
        medName={task.title}
        clientName={task.related_person || "client"}
        userEmail={user?.email}
        storedPin={storedPin || "0000"}
        darkMode={darkMode}
        onSuccess={() => { setStep("main"); setTimeout(() => saveMut.mutate(), 100); }}
        onCancel={() => setStep("main")}
      />
    );
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end">
      <div className={`w-full max-w-lg mx-auto ${bg} rounded-t-3xl shadow-2xl max-h-[92vh] overflow-y-auto`}>
        {/* Header */}
        <div className="flex items-start justify-between px-5 pt-5 pb-4 border-b border-gray-100">
          <div>
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Recording Medication</p>
            <p className="text-xl font-black text-gray-900 mt-0.5">{task.title?.toUpperCase()}</p>
            {task.scheduled_time && <p className="text-sm text-gray-400 mt-0.5">Scheduled: {task.scheduled_time}</p>}
            <div className="flex gap-2 mt-1">
              {isControlled && <span className="text-[10px] font-bold bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">CONTROLLED</span>}
              {requiresVitals && <span className="text-[10px] font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">VITALS REQUIRED</span>}
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl text-gray-400 hover:bg-gray-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 py-5 space-y-5">
          {/* Stock status */}
          {productRecord && (outcome === "completed" || outcome === "partially_done") && (
            <div className={`flex items-center gap-2 rounded-xl px-4 py-2.5 ${
              (productRecord.stock_quantity || 0) <= 0
                ? "bg-red-50 border border-red-200"
                : (productRecord.stock_quantity || 0) <= (productRecord.min_stock_level || 0)
                  ? "bg-amber-50 border border-amber-200"
                  : "bg-green-50 border border-green-200"
            }`}>
              <Package className="w-4 h-4 shrink-0" />
              <p className={`text-xs font-semibold ${
                (productRecord.stock_quantity || 0) <= 0 ? "text-red-700"
                  : (productRecord.stock_quantity || 0) <= (productRecord.min_stock_level || 0) ? "text-amber-700"
                  : "text-green-700"
              }`}>
                {(productRecord.stock_quantity || 0) <= 0
                  ? `❌ Out of Stock: 0 units — Administration blocked`
                  : (productRecord.stock_quantity || 0) <= (productRecord.min_stock_level || 0)
                    ? `⚠️ Low stock: ${productRecord.stock_quantity} units remaining — Consider reordering`
                    : `Stock: ${productRecord.stock_quantity} units`}
              </p>
            </div>
          )}

          {/* Outcome selector */}
          <div>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Outcome *</p>
            <div className="grid grid-cols-2 gap-2">
              {OUTCOMES.map((o) => (
                <button
                  key={o.value}
                  onClick={() => { setOutcome(o.value); setRefusalData({ structured: "", isComplete: false }); setMissedReason(""); }}
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
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={inputCls} />
          </div>

          {/* Refusal capture */}
          {needsRefusal && (
            <RefusalCaptureForm
              isControlled={isControlled}
              onChange={setRefusalData}
              darkMode={darkMode}
            />
          )}

          {/* Missed reason */}
          {needsMissedReason && (
            <div>
              <p className="text-xs font-bold text-red-600 uppercase tracking-wider mb-2">Reason * (required)</p>
              <div className="space-y-2">
                {MISSED_REASONS.map((r) => (
                  <button key={r} onClick={() => setMissedReason(r)}
                    className={`w-full px-4 py-3 rounded-xl text-sm font-semibold border-2 text-left transition-all
                      ${missedReason === r ? "bg-gray-100 border-gray-400 text-gray-800" : "bg-white border-gray-200 text-gray-600"}`}
                  >{r}</button>
                ))}
              </div>
            </div>
          )}

          {/* Notes */}
          <div>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
              Notes {needsRefusal ? "(optional — details captured above)" : "(optional)"}
            </p>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any observations, side effects, or additional notes…"
              rows={2}
              className={`${inputCls} resize-none`}
            />
          </div>

          {/* Staff confirmation */}
          <div className="bg-blue-50 rounded-2xl px-4 py-3">
            <p className="text-xs font-bold text-blue-700">Recording as: {user?.full_name || user?.email}</p>
            <p className="text-xs text-blue-500 mt-0.5">Date: {todayStr()} · Time: {time}</p>
          </div>

          {needsRefusal && (
            <div className="flex items-start gap-2 bg-orange-50 border border-orange-200 rounded-2xl px-4 py-3">
              <AlertCircle className="w-4 h-4 text-orange-600 shrink-0 mt-0.5" />
              <p className="text-xs font-semibold text-orange-700">Non-administration events are logged for audit. Supervisor may be notified.</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white border-t border-gray-100 px-5 py-4 flex gap-3">
          <button onClick={onClose} className="flex-1 py-4 rounded-2xl border-2 border-gray-200 text-gray-600 font-bold text-sm">Cancel</button>
          <button
            onClick={handlePrimaryAction}
            disabled={!canSubmit() || saveMut.isPending || (stockBlocked && (outcome === "completed" || outcome === "partially_done"))}
            className={`flex-1 py-4 rounded-2xl text-white font-black text-sm transition-all active:scale-95
              ${!canSubmit() || stockBlocked ? "bg-gray-300 cursor-not-allowed" : "bg-emerald-600 hover:bg-emerald-700"}`}
          >
            {saveMut.isPending ? "Saving…" : (
              <span className="flex items-center justify-center gap-2">
                <CheckCircle2 className="w-5 h-5" />
                {isControlled && (outcome === "completed" || outcome === "partially_done") ? "Enter PIN →" : "Confirm & Record"}
              </span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}