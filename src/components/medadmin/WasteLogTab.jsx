import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

const RAILWAY_URL = "https://newsconseenwebapp-production.up.railway.app";
const RAILWAY_API_KEY = (import.meta["env"] || {})["VITE_RAILWAY_API_KEY"] || "";
const triggerETL = (entity) =>
  fetch(`${RAILWAY_URL}/load/${entity}-summary`, {
    method: "POST",
    headers: RAILWAY_API_KEY ? { "x-api-key": RAILWAY_API_KEY } : {},
  }).catch(() => {});
import { format } from "date-fns";
import { Trash2, Plus, Download, X } from "lucide-react";
import { jsPDF } from "jspdf";

const WASTE_REASONS = ["Spilled", "Client refused partial", "Preparation error", "Expired", "Other"];

function todayStr() { return format(new Date(), "yyyy-MM-dd"); }
function nowTime() { return format(new Date(), "HH:mm"); }

function WasteForm({ products, user, selectedClient, onSuccess, onClose, darkMode }) {
  const [medName, setMedName] = useState("");
  const [prepared, setPrepared] = useState("");
  const [administered, setAdministered] = useState("");
  const [unit, setUnit] = useState("tablet");
  const [reason, setReason] = useState("");
  const [witness, setWitness] = useState("");
  const [notes, setNotes] = useState("");
  const qc = useQueryClient();

  const wasted = prepared && administered ? Math.max(0, parseFloat(prepared) - parseFloat(administered)) : "";

  const saveMut = useMutation({
    mutationFn: async () => {
      const qty = parseFloat(wasted);
      const taskData = {
        task_type: "other",
        title: `Waste Log: ${medName}`,
        status: "completed",
        outcome: "completed",
        scheduled_date: todayStr(),
        scheduled_time: nowTime(),
        related_person: selectedClient ? `${selectedClient.first_name} ${selectedClient.last_name}` : null,
        assigned_to_email: user?.email,
        assigned_to_name: user?.full_name || user?.email,
        outcome_notes: [
          `Prepared: ${prepared} ${unit}`,
          `Administered: ${administered} ${unit}`,
          `Wasted: ${qty} ${unit}`,
          `Reason: ${reason}`,
          witness ? `Witness: ${witness}` : null,
          notes ? `Notes: ${notes}` : null,
        ].filter(Boolean).join(" | "),
        internal_notes: "WASTE_LOG",
      };
      const task = await base44.entities.Task.create(taskData);

      // Stock out transaction
      await base44.entities.Transaction.create({
        transaction_type: "stock_out",
        status: "posted",
        date: todayStr(),
        time: nowTime(),
        description: `Controlled Drug Waste — ${medName} (${reason})`,
        line_items: [{ item_name: medName, quantity: qty, unit }],
        internal_notes: `Waste Log | Witness: ${witness || "—"} | Task: ${task.id}`,
      });

      // Decrement stock
      const prods = await base44.entities.Product.filter({ name: medName });
      if (prods.length > 0) {
        const p = prods[0];
        await base44.entities.Product.update(p.id, { stock_quantity: Math.max(0, (p.stock_quantity || 0) - qty) });
      }
    },
    onSuccess: () => {
      triggerETL("task");
      triggerETL("transaction");
      triggerETL("product");
      qc.invalidateQueries({ queryKey: ["waste-tasks"] });
      onSuccess();
    },
  });

  const canSave = medName && prepared && administered && reason && witness;
  const bg = darkMode ? "bg-slate-800 text-slate-100" : "bg-white";

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end">
      <div className={`${bg} w-full max-w-lg mx-auto rounded-t-3xl shadow-2xl max-h-[92vh] overflow-y-auto`}>
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100">
          <p className="font-black text-base">Log Controlled Drug Waste</p>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>
        <div className="px-5 py-4 space-y-4">
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 block">Medication *</label>
            <select value={medName} onChange={(e) => setMedName(e.target.value)} className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400">
              <option value="">— Select medication —</option>
              {products.filter((p) => p.item_type === "medication").map((p) => <option key={p.id} value={p.name}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 block">Unit</label>
            <select value={unit} onChange={(e) => setUnit(e.target.value)} className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400">
              {["tablet","capsule","ml","mg","unit","patch"].map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[["Prepared *", prepared, setPrepared], ["Administered *", administered, setAdministered], ["Wasted (auto)", wasted, null]].map(([label, val, setter]) => (
              <div key={label}>
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5 block">{label}</label>
                <input
                  type="number" value={val} onChange={setter ? (e) => setter(e.target.value) : undefined}
                  readOnly={!setter}
                  className={`w-full px-3 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 ${!setter ? "bg-gray-50 text-gray-500" : "border-gray-200"}`}
                />
              </div>
            ))}
          </div>
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 block">Reason for Waste *</label>
            <select value={reason} onChange={(e) => setReason(e.target.value)} className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400">
              <option value="">— Select reason —</option>
              {WASTE_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 block">Witness Name * (required for controlled drugs)</label>
            <input type="text" value={witness} onChange={(e) => setWitness(e.target.value)} placeholder="Full name of witness..." className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
          </div>
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 block">Notes (optional)</label>
            <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-400" />
          </div>
        </div>
        <div className="sticky bottom-0 px-5 py-4 border-t border-gray-100 bg-white flex gap-3">
          <button onClick={onClose} className="flex-1 py-4 rounded-2xl border-2 border-gray-200 text-gray-600 font-bold text-sm">Cancel</button>
          <button onClick={() => saveMut.mutate()} disabled={!canSave || saveMut.isPending} className={`flex-1 py-4 rounded-2xl text-white font-black text-sm transition-all active:scale-95 ${canSave ? "bg-red-600 hover:bg-red-700" : "bg-gray-300 cursor-not-allowed"}`}>
            {saveMut.isPending ? "Saving…" : "Log Waste"}
          </button>
        </div>
      </div>
    </div>
  );
}

function exportWastePDF(logs, enterprise) {
  const doc = new jsPDF();
  doc.setFontSize(16);
  doc.text("Controlled Drug Waste Log", 20, 20);
  doc.setFontSize(10);
  doc.text(`Facility: ${enterprise || "—"}`, 20, 30);
  doc.text(`Generated: ${format(new Date(), "PPP p")}`, 20, 37);
  let y = 50;
  doc.setFontSize(9);
  doc.text("Date", 20, y); doc.text("Medication", 50, y); doc.text("Wasted", 110, y); doc.text("Reason", 135, y); doc.text("Witness", 175, y);
  y += 5; doc.line(20, y, 190, y); y += 5;
  logs.forEach((t) => {
    const parts = (t.outcome_notes || "").split(" | ");
    const wastedPart = parts.find((p) => p.startsWith("Wasted:"))?.replace("Wasted: ", "") || "—";
    const reasonPart = parts.find((p) => p.startsWith("Reason:"))?.replace("Reason: ", "") || "—";
    const witnessPart = parts.find((p) => p.startsWith("Witness:"))?.replace("Witness: ", "") || "—";
    const med = t.title?.replace("Waste Log: ", "") || "—";
    if (y > 270) { doc.addPage(); y = 20; }
    doc.text(t.scheduled_date || "—", 20, y);
    doc.text(med.slice(0, 25), 50, y);
    doc.text(wastedPart.slice(0, 12), 110, y);
    doc.text(reasonPart.slice(0, 18), 135, y);
    doc.text(witnessPart.slice(0, 15), 175, y);
    y += 8;
  });
  doc.save(`WasteLog_${format(new Date(), "yyyy-MM")}.pdf`);
}

export default function WasteLogTab({ products, user, selectedClient, enterprise, darkMode }) {
  const [showForm, setShowForm] = useState(false);

  const { data: wasteTasks = [] } = useQuery({
    queryKey: ["waste-tasks"],
    queryFn: () => base44.entities.Task.filter({ internal_notes: "WASTE_LOG" }, "-scheduled_date", 100),
    enabled: !!user,
  });

  const bg = darkMode ? "bg-slate-800 text-slate-100" : "bg-white";
  const cardBg = darkMode ? "bg-slate-900 border-slate-700" : "bg-white border-gray-100";

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Controlled Drug Waste Log</p>
        <div className="flex gap-2">
          <button onClick={() => exportWastePDF(wasteTasks, enterprise)} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gray-100 text-gray-600 text-xs font-bold hover:bg-gray-200">
            <Download className="w-3.5 h-3.5" /> Export PDF
          </button>
          <button onClick={() => setShowForm(true)} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-600 text-white text-xs font-bold hover:bg-red-700">
            <Plus className="w-3.5 h-3.5" /> Log Waste
          </button>
        </div>
      </div>

      {wasteTasks.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <Trash2 className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm font-semibold">No waste entries recorded</p>
        </div>
      )}

      <div className="space-y-3">
        {wasteTasks.map((t) => {
          const parts = (t.outcome_notes || "").split(" | ");
          const med = t.title?.replace("Waste Log: ", "") || "—";
          const wastedPart = parts.find((p) => p.startsWith("Wasted:")) || "";
          const reasonPart = parts.find((p) => p.startsWith("Reason:")) || "";
          const witnessPart = parts.find((p) => p.startsWith("Witness:")) || "";
          return (
            <div key={t.id} className={`rounded-2xl border shadow-sm p-4 ${cardBg}`}>
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm font-black">{med.toUpperCase()}</p>
                <span className="text-xs text-gray-400">{t.scheduled_date}</span>
              </div>
              <p className="text-xs text-red-600 font-semibold">{wastedPart}</p>
              <p className="text-xs text-gray-500">{reasonPart} {witnessPart && `· ${witnessPart}`}</p>
            </div>
          );
        })}
      </div>

      {showForm && (
        <WasteForm
          products={products}
          user={user}
          selectedClient={selectedClient}
          onSuccess={() => setShowForm(false)}
          onClose={() => setShowForm(false)}
          darkMode={darkMode}
        />
      )}
    </div>
  );
}