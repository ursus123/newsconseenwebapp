import React, { useState } from "react";
import { ncClient } from "@/api/ncClient";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, addMonths } from "date-fns";
import { X, Plus, Trash2, CalendarDays, Loader2, CheckCircle2, Search } from "lucide-react";

function MedSearchInput({ products, value, onChange }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState(value || "");
  // Only show active medications
  const meds = products.filter((p) => p.item_type === "medication" && p.status === "active");
  const filtered = meds.filter((p) => p.name?.toLowerCase().includes(q.toLowerCase()));

  const handleSelect = (p) => {
    setQ(p.name);
    onChange(p.name, p);
    setOpen(false);
  };

  return (
    <div className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-300" />
        <input
          value={q}
          onChange={(e) => { setQ(e.target.value); onChange(e.target.value, null); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="Search or type medication name…"
          className="w-full pl-8 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        />
      </div>
      {open && filtered.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-40 overflow-y-auto">
          {filtered.slice(0, 10).map((p) => (
            <button
              key={p.id}
              type="button"
              onMouseDown={() => handleSelect(p)}
              className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 text-gray-800 border-b border-gray-50 last:border-0"
            >
              <span className="font-medium">{p.name}</span>
              {p.sku && <span className="text-xs text-gray-400 ml-2">{p.sku}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const FREQUENCIES = [
  { label: "Every Day (Daily)", value: "daily" },
  { label: "Twice Daily (BID)", value: "bid" },
  { label: "Three Times Daily (TID)", value: "tid" },
  { label: "Four Times Daily (QID)", value: "qid" },
  { label: "Every Morning", value: "morning" },
  { label: "Every Evening", value: "evening" },
  { label: "Bedtime (QHS)", value: "bedtime" },
  { label: "Weekly", value: "weekly" },
  { label: "Weekdays Only", value: "weekdays" },
  { label: "Custom Days", value: "custom" },
];

const ROUTES = ["oral", "sublingual", "topical", "inhalation", "injection", "rectal", "ophthalmic", "otic", "nasal", "IV", "other"];

const FREQ_TIMES = {
  daily:    ["08:00"],
  bid:      ["08:00", "20:00"],
  tid:      ["08:00", "14:00", "20:00"],
  qid:      ["08:00", "12:00", "16:00", "20:00"],
  morning:  ["08:00"],
  evening:  ["20:00"],
  bedtime:  ["22:00"],
  weekly:   ["08:00"],
  weekdays: ["08:00"],
  custom:   ["08:00"],
};

function getDaysForFrequency(days, freq, customDays) {
  if (freq === "weekly") return days.filter((d) => d.getDay() === 1); // Mondays
  if (freq === "weekdays") return days.filter((d) => d.getDay() !== 0 && d.getDay() !== 6);
  if (freq === "custom" && customDays?.length) return days.filter((d) => customDays.includes(d.getDay()));
  return days;
}

function buildTasks({ client, med, month, createdByName }) {
  const monthDate = new Date(month + "-01");
  const allDays = eachDayOfInterval({ start: startOfMonth(monthDate), end: endOfMonth(monthDate) });
  const activeDays = getDaysForFrequency(allDays, med.frequency, med.customDays);
  const times = FREQ_TIMES[med.frequency] || ["08:00"];

  const tasks = [];
  activeDays.forEach((day) => {
    times.forEach((time) => {
      tasks.push({
        task_type: "medication_admin",
        title: med.name,
        status: "open",
        priority: "normal",
        related_person: `${client.first_name} ${client.last_name}`,
        related_item: med.name,
        scheduled_date: format(day, "yyyy-MM-dd"),
        scheduled_time: time,
        due_date: format(day, "yyyy-MM-dd"),
        due_time: time,
        outcome: "pending",
        internal_notes: [
          med.route ? `route:${med.route}` : "",
          med.dose ? `dose:${med.dose}` : "",
          med.indication ? `indication:${med.indication}` : "",
          `freq:${med.frequency}`,
          med.prescriber ? `prescriber:${med.prescriber}` : "",
        ].filter(Boolean).join("|"),
        outcome_notes: med.instructions || "",
        assigned_to_name: createdByName || "",
      });
    });
  });
  return tasks;
}

export default function ScheduleMonthModal({ client, products, user, onClose, onSuccess }) {
  const now = new Date();
  const [month, setMonth] = useState(format(now, "yyyy-MM"));
  const [meds, setMeds] = useState([
    { name: "", dose: "", route: "oral", frequency: "daily", instructions: "", indication: "", prescriber: "", customDays: [] },
  ]);
  const [done, setDone] = useState(false);
  const [createdCount, setCreatedCount] = useState(0);

  const addMed = () => setMeds((prev) => [
    ...prev,
    { name: "", dose: "", route: "oral", frequency: "daily", instructions: "", indication: "", prescriber: "", customDays: [] },
  ]);

  const removeMed = (i) => setMeds((prev) => prev.filter((_, idx) => idx !== i));

  const updateMed = (i, field, value) => setMeds((prev) => prev.map((m, idx) => idx === i ? { ...m, [field]: value } : m));

  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!client) return;
    setLoading(true);
    let total = 0;
    for (const med of meds) {
      if (!med.name) continue;
      const tasks = buildTasks({ client, med, month, createdByName: user?.full_name || user?.email });
      // Bulk create in batches of 50
      for (let i = 0; i < tasks.length; i += 50) {
        await ncClient.entities.Task.bulkCreate(tasks.slice(i, i + 50));
      }
      total += tasks.length;
    }
    setCreatedCount(total);
    setDone(true);
    setLoading(false);
  };

  const clientName = client ? `${client.first_name} ${client.last_name}` : "";

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-2xl rounded-t-3xl sm:rounded-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100 shrink-0">
          <CalendarDays className="w-5 h-5 text-blue-600" />
          <div className="flex-1">
            <h2 className="text-base font-black text-gray-900">Schedule Monthly Medications</h2>
            <p className="text-xs text-gray-400">{clientName}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-gray-100">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {done ? (
          <div className="flex flex-col items-center justify-center py-16 gap-4 px-6">
            <CheckCircle2 className="w-14 h-14 text-emerald-500" />
            <p className="text-lg font-black text-gray-800 text-center">
              {createdCount} medication tasks scheduled!
            </p>
            <p className="text-sm text-gray-400 text-center">
              All tasks for {format(new Date(month + "-01"), "MMMM yyyy")} have been created.
            </p>
            <button
              onClick={onSuccess}
              className="mt-2 px-8 py-3 bg-emerald-600 text-white rounded-xl font-bold text-sm"
            >
              Done
            </button>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {/* Month picker */}
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-1">Month</label>
                <input
                  type="month"
                  value={month}
                  onChange={(e) => setMonth(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-semibold text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Medications */}
              <div className="space-y-4">
                {meds.map((med, i) => (
                  <div key={i} className="bg-gray-50 rounded-2xl border border-gray-200 p-4 space-y-3 relative">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Medication {i + 1}</p>
                      {meds.length > 1 && (
                        <button onClick={() => removeMed(i)} className="p-1 rounded-lg hover:bg-red-50 text-red-400">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>

                    {/* Name — searchable from Products */}
                    <div>
                      <label className="text-[11px] font-semibold text-gray-400 block mb-1">Medication Name *</label>
                      <MedSearchInput
                        products={products}
                        value={med.name}
                        onChange={(val, product) => {
                          updateMed(i, "name", val);
                          if (product) {
                            if (product.dosage_instructions && !med.instructions) updateMed(i, "instructions", product.dosage_instructions);
                            if (product.storage_instructions && !med.indication) updateMed(i, "indication", product.storage_instructions);
                          }
                        }}
                      />
                    </div>

                    {/* Dose + Route */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[11px] font-semibold text-gray-400 block mb-1">Dose / Strength</label>
                        <input
                          value={med.dose}
                          onChange={(e) => updateMed(i, "dose", e.target.value)}
                          placeholder="e.g. 1 tablet"
                          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-semibold text-gray-400 block mb-1">Route</label>
                        <select
                          value={med.route}
                          onChange={(e) => updateMed(i, "route", e.target.value)}
                          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                        >
                          {ROUTES.map((r) => <option key={r} value={r}>{r}</option>)}
                        </select>
                      </div>
                    </div>

                    {/* Frequency */}
                    <div>
                      <label className="text-[11px] font-semibold text-gray-400 block mb-1">Frequency</label>
                      <select
                        value={med.frequency}
                        onChange={(e) => updateMed(i, "frequency", e.target.value)}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                      >
                        {FREQUENCIES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                      </select>
                    </div>

                    {/* Custom days */}
                    {med.frequency === "custom" && (
                      <div>
                        <label className="text-[11px] font-semibold text-gray-400 block mb-1">Custom Days</label>
                        <div className="flex flex-wrap gap-2">
                          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d, idx) => (
                            <button
                              key={d}
                              type="button"
                              onClick={() => {
                                const current = med.customDays || [];
                                const updated = current.includes(idx)
                                  ? current.filter((x) => x !== idx)
                                  : [...current, idx];
                                updateMed(i, "customDays", updated);
                              }}
                              className={`px-3 py-1 rounded-full text-xs font-bold border transition-all ${
                                (med.customDays || []).includes(idx)
                                  ? "bg-blue-600 text-white border-blue-600"
                                  : "bg-white text-gray-500 border-gray-200"
                              }`}
                            >
                              {d}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Indication */}
                    <div>
                      <label className="text-[11px] font-semibold text-gray-400 block mb-1">Indication / Purpose</label>
                      <input
                        value={med.indication}
                        onChange={(e) => updateMed(i, "indication", e.target.value)}
                        placeholder="e.g. Diabetes management"
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                      />
                    </div>

                    {/* Prescriber */}
                    <div>
                      <label className="text-[11px] font-semibold text-gray-400 block mb-1">Prescriber</label>
                      <input
                        value={med.prescriber}
                        onChange={(e) => updateMed(i, "prescriber", e.target.value)}
                        placeholder="e.g. Dr. Jane Smith"
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                      />
                    </div>

                    {/* Instructions */}
                    <div>
                      <label className="text-[11px] font-semibold text-gray-400 block mb-1">Instructions / Comments</label>
                      <textarea
                        value={med.instructions}
                        onChange={(e) => updateMed(i, "instructions", e.target.value)}
                        placeholder="e.g. Take 1 capsule by mouth every morning"
                        rows={2}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white resize-none"
                      />
                    </div>
                  </div>
                ))}
              </div>

              <button
                onClick={addMed}
                className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-blue-200 rounded-2xl text-blue-600 font-bold text-sm hover:border-blue-400 transition-all"
              >
                <Plus className="w-4 h-4" /> Add Another Medication
              </button>

              {/* Summary */}
              <div className="bg-blue-50 rounded-xl px-4 py-3 text-xs text-blue-700">
                <p className="font-bold mb-1">Summary</p>
                <p>Month: <span className="font-semibold">{format(new Date(month + "-01"), "MMMM yyyy")}</span></p>
                <p>Client: <span className="font-semibold">{clientName}</span></p>
                <p>Medications: <span className="font-semibold">{meds.filter((m) => m.name).length}</span></p>
              </div>
            </div>

            {/* Footer */}
            <div className="px-5 py-4 border-t border-gray-100 flex gap-3 shrink-0">
              <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-600 font-bold text-sm hover:bg-gray-50">
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={loading || !meds.some((m) => m.name)}
                className="flex-1 py-3 rounded-xl bg-blue-600 text-white font-bold text-sm disabled:opacity-50 flex items-center justify-center gap-2 hover:bg-blue-700"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarDays className="w-4 h-4" />}
                {loading ? "Scheduling…" : "Schedule Month"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}