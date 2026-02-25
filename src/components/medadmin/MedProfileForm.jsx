import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { format } from "date-fns";
import { X, Save, Plus, Trash2, Loader2 } from "lucide-react";

const ROUTES = ["oral", "sublingual", "topical", "inhalation", "injection", "rectal", "ophthalmic", "otic", "nasal", "IV", "other"];
const STATUSES = [
  { value: "active", label: "Active" },
  { value: "prn", label: "PRN (As Needed)" },
  { value: "on_hold", label: "On Hold" },
  { value: "discontinued", label: "Discontinued" },
];

const EMPTY = {
  medication_name: "", strength: "", dose_amount: "", route: "oral",
  frequency: "", schedule_times: ["08:00"], prescriber: "", indication: "",
  instructions: "", start_date: "", end_date: "", status: "active",
  discontinue_reason: "", pharmacy: "", rx_number: "", refills_remaining: "", notes: "",
};

export default function MedProfileForm({ client, existing, onClose, onSuccess }) {
  const [form, setForm] = useState(existing ? {
    ...EMPTY,
    ...existing,
    schedule_times: existing.schedule_times?.length ? existing.schedule_times : ["08:00"],
  } : {
    ...EMPTY,
    start_date: format(new Date(), "yyyy-MM-dd"),
  });
  const [loading, setLoading] = useState(false);

  const set = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  const addTime = () => set("schedule_times", [...(form.schedule_times || []), "08:00"]);
  const removeTime = (i) => set("schedule_times", form.schedule_times.filter((_, idx) => idx !== i));
  const updateTime = (i, v) => set("schedule_times", form.schedule_times.map((t, idx) => idx === i ? v : t));

  const handleSave = async () => {
    setLoading(true);
    const payload = {
      ...form,
      client_id: client.id,
      client_name: `${client.first_name} ${client.last_name}`,
      refills_remaining: form.refills_remaining !== "" ? Number(form.refills_remaining) : undefined,
    };
    if (existing) {
      await base44.entities.MedicationProfile.update(existing.id, payload);
    } else {
      await base44.entities.MedicationProfile.create(payload);
    }
    setLoading(false);
    onSuccess();
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100 shrink-0">
          <div className="flex-1">
            <h2 className="text-base font-black text-gray-900">{existing ? "Edit Medication" : "Add Medication"}</h2>
            <p className="text-xs text-gray-400">{client.first_name} {client.last_name}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-gray-100">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Medication name */}
          <Field label="Medication Name *">
            <input value={form.medication_name} onChange={(e) => set("medication_name", e.target.value)}
              placeholder="e.g. Acidophilus Probiotic Tablet" className={INPUT} />
          </Field>

          {/* Strength + Dose */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Strength">
              <input value={form.strength} onChange={(e) => set("strength", e.target.value)}
                placeholder="e.g. 0.5mg" className={INPUT} />
            </Field>
            <Field label="Give Amount / Dose">
              <input value={form.dose_amount} onChange={(e) => set("dose_amount", e.target.value)}
                placeholder="e.g. 1 Capsule" className={INPUT} />
            </Field>
          </div>

          {/* Route + Frequency */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Route">
              <select value={form.route} onChange={(e) => set("route", e.target.value)} className={INPUT}>
                {ROUTES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </Field>
            <Field label="Frequency">
              <input value={form.frequency} onChange={(e) => set("frequency", e.target.value)}
                placeholder="e.g. 1 X DAILY" className={INPUT} />
            </Field>
          </div>

          {/* Schedule Times */}
          <Field label="Schedule Time(s)">
            <div className="space-y-2">
              {(form.schedule_times || []).map((t, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input type="time" value={t} onChange={(e) => updateTime(i, e.target.value)}
                    className={INPUT + " flex-1"} />
                  {form.schedule_times.length > 1 && (
                    <button onClick={() => removeTime(i)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-400">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
              <button onClick={addTime} className="flex items-center gap-1.5 text-xs text-blue-600 font-bold hover:underline">
                <Plus className="w-3.5 h-3.5" /> Add time slot
              </button>
            </div>
          </Field>

          {/* Prescriber */}
          <Field label="Prescriber">
            <input value={form.prescriber} onChange={(e) => set("prescriber", e.target.value)}
              placeholder="e.g. Dr. Jane Smith / FNPC" className={INPUT} />
          </Field>

          {/* Indication */}
          <Field label="Indication / Purpose">
            <input value={form.indication} onChange={(e) => set("indication", e.target.value)}
              placeholder="e.g. Digestive disorder" className={INPUT} />
          </Field>

          {/* Instructions */}
          <Field label="Instructions / Comments">
            <textarea value={form.instructions} onChange={(e) => set("instructions", e.target.value)}
              rows={2} placeholder="e.g. TAKE 1 CAPSULE BY MOUTH EVERY MORNING"
              className={INPUT + " resize-none"} />
          </Field>

          {/* Start / End dates */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start Date">
              <input type="date" value={form.start_date} onChange={(e) => set("start_date", e.target.value)} className={INPUT} />
            </Field>
            <Field label="End Date">
              <input type="date" value={form.end_date} onChange={(e) => set("end_date", e.target.value)} className={INPUT} />
            </Field>
          </div>

          {/* Status */}
          <Field label="Status">
            <select value={form.status} onChange={(e) => set("status", e.target.value)} className={INPUT}>
              {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </Field>

          {form.status === "discontinued" && (
            <Field label="Discontinuation Reason">
              <textarea value={form.discontinue_reason} onChange={(e) => set("discontinue_reason", e.target.value)}
                rows={2} placeholder="Reason…" className={INPUT + " resize-none"} />
            </Field>
          )}

          {/* Pharmacy / Rx */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Pharmacy">
              <input value={form.pharmacy} onChange={(e) => set("pharmacy", e.target.value)}
                placeholder="Pharmacy name" className={INPUT} />
            </Field>
            <Field label="Rx #">
              <input value={form.rx_number} onChange={(e) => set("rx_number", e.target.value)}
                placeholder="Rx number" className={INPUT} />
            </Field>
          </div>

          <Field label="Refills Remaining">
            <input type="number" min="0" value={form.refills_remaining}
              onChange={(e) => set("refills_remaining", e.target.value)}
              placeholder="0" className={INPUT} />
          </Field>

          {/* Notes */}
          <Field label="Notes">
            <textarea value={form.notes} onChange={(e) => set("notes", e.target.value)}
              rows={2} placeholder="Internal notes…" className={INPUT + " resize-none"} />
          </Field>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-100 flex gap-3 shrink-0">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-600 font-bold text-sm">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={loading || !form.medication_name}
            className="flex-1 py-3 rounded-xl bg-blue-600 text-white font-bold text-sm disabled:opacity-50 flex items-center justify-center gap-2 hover:bg-blue-700"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {loading ? "Saving…" : existing ? "Save Changes" : "Add Medication"}
          </button>
        </div>
      </div>
    </div>
  );
}

const INPUT = "w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white";

function Field({ label, children }) {
  return (
    <div>
      <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block mb-1">{label}</label>
      {children}
    </div>
  );
}