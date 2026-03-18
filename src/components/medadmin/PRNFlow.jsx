import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation } from "@tanstack/react-query";
import { format } from "date-fns";
import { X, CheckCircle2, Search, Pill, ChevronDown } from "lucide-react";
import MedMedicationPicker from "@/components/medadmin/MedMedicationPicker";

const ROUTES = ["Oral", "Sublingual", "IV", "IM", "Topical", "Inhalation", "Patch", "Other"];
const SYMPTOMS = ["Pain", "Anxiety", "Agitation", "Seizure risk", "Nausea", "Headache", "Behavioral", "Other"];

function todayStr() { return format(new Date(), "yyyy-MM-dd"); }
function nowTimeStr() { return format(new Date(), "HH:mm"); }

function SearchSelect({ items, labelFn, value, onChange, placeholder }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const filtered = items.filter((i) => labelFn(i).toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="relative">
      <div
        className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm font-semibold text-gray-800 bg-white flex items-center justify-between cursor-pointer"
        onClick={() => setOpen((o) => !o)}
      >
        <span className={value ? "text-gray-900" : "text-gray-400"}>{value ? labelFn(value) : placeholder}</span>
        <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
      </div>
      {open && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
          <div className="p-2 border-b border-gray-100">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-300" />
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search…"
                className="w-full pl-8 pr-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none"
              />
            </div>
          </div>
          <div className="max-h-48 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-4">No results</p>
            ) : filtered.map((item) => (
              <button
                key={item.id}
                className="w-full text-left px-4 py-2.5 text-sm hover:bg-blue-50 text-gray-800 border-b border-gray-50 last:border-0"
                onClick={() => { onChange(item); setOpen(false); setQ(""); }}
              >
                {labelFn(item)}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function PRNFlow({ user, selectedClient, people, products, enterprises, addresses, onClose, onSuccess }) {
  const [step, setStep] = useState(1);

  // Step 1 — core
  const [patient, setPatient] = useState(selectedClient);
  const [medication, setMedication] = useState(null);
  const [dose, setDose] = useState("");
  const [route, setRoute] = useState("Oral");
  const [administrator, setAdministrator] = useState(null);
  const [enterprise, setEnterprise] = useState(null);
  const [address, setAddress] = useState(null);

  // Step 2 — indication
  const [symptom, setSymptom] = useState("");
  const [reason, setReason] = useState("");

  // Step 3 — outcome
  const [effectiveness, setEffectiveness] = useState("");
  const [scheduleFollowup, setScheduleFollowup] = useState(false);
  const [followupHours, setFollowupHours] = useState("2");

  const saveMut = useMutation({
    mutationFn: async () => {
      const patientName = patient ? `${patient.first_name} ${patient.last_name}` : "";
      const adminName = administrator ? `${administrator.first_name} ${administrator.last_name}` : (user?.full_name || user?.email);
      const medName = medication ? medication.name : "Unknown";
      const today = todayStr();
      const now = nowTimeStr();

      // Create the Task (intent + execution record)
      const mainTask = await base44.entities.Task.create({
        task_type: "medication_admin",
        title: `PRN: ${medName}`,
        status: "completed",
        outcome: "completed",
        related_person: patientName,
        enterprise: enterprise?.enterprise_name || null,
        assigned_to_email: user?.email,
        assigned_to_name: adminName,
        scheduled_date: today,
        scheduled_time: now,
        outcome_notes: [
          `Dose: ${dose}`,
          `Route: ${route}`,
          `Indication: ${symptom}${reason ? ` — ${reason}` : ""}`,
          `Administered at ${now} by ${adminName}`,
          effectiveness && `Effectiveness: ${effectiveness}`,
        ].filter(Boolean).join(" | "),
        internal_notes: `PRN | Batch: ${medication?.batch_number || "—"} | Location: ${address?.label || address?.address_line1 || "—"}`,
      });

      // Create Transaction (stock out — fact record)
      await base44.entities.Transaction.create({
        transaction_type: "stock_out",
        status: "posted",
        date: today,
        time: now,
        enterprise: enterprise?.enterprise_name || null,
        description: `PRN Medication Administration — ${medName} to ${patientName}`,
        assigned_person: patientName,
        line_items: [{
          item_name: medName,
          quantity: 1,
          unit: medication?.unit || "piece",
          unit_price: medication?.cost_price || 0,
        }],
        internal_notes: `Admin: ${adminName} | Route: ${route} | Indication: ${symptom} | Task ref: ${mainTask.id}`,
      });

      // Follow-up task if requested
      if (scheduleFollowup) {
        await base44.entities.Task.create({
          task_type: "medication_admin",
          title: `PRN Follow-up: ${medName} effectiveness check`,
          status: "open",
          outcome: "pending",
          assigned_to_email: user?.email,
          assigned_to_name: adminName,
          related_person: patientName,
          enterprise: enterprise?.enterprise_name || null,
          scheduled_date: today,
          scheduled_time: format(new Date(Date.now() + parseInt(followupHours) * 3600000), "HH:mm"),
          internal_notes: `Follow-up PRN effectiveness check for ${medName}`,
        });
      }

      return mainTask;
    },
    onSuccess,
  });

  const canProceed1 = patient && medication && dose.trim();
  const canProceed2 = !!symptom;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end">
      <div className="w-full max-w-lg mx-auto bg-white rounded-t-3xl shadow-2xl max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-gray-100">
          <div>
            <p className="text-[11px] font-bold text-blue-500 uppercase tracking-widest">PRN / As-Needed</p>
            <p className="text-lg font-black text-gray-900">Step {step} of 3</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl text-gray-400 hover:bg-gray-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 py-5 space-y-5">
          {/* Step 1 — Core identifiers */}
          {step === 1 && (
            <>
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Patient *</p>
                <SearchSelect
                  items={people}
                  labelFn={(p) => `${p.first_name} ${p.last_name}`}
                  value={patient}
                  onChange={setPatient}
                  placeholder="Select patient…"
                />
              </div>
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Medication *</p>
                <SearchSelect
                  items={products}
                  labelFn={(p) => p.name + (p.batch_number ? ` (Batch: ${p.batch_number})` : "")}
                  value={medication}
                  onChange={setMedication}
                  placeholder="Select from inventory…"
                />
                {medication?.expiry_date && (
                  <p className="text-xs text-orange-600 mt-1 font-semibold">Expiry: {medication.expiry_date}</p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Dose *</p>
                  <input
                    value={dose}
                    onChange={(e) => setDose(e.target.value)}
                    placeholder="e.g. 400mg"
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm text-gray-800 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                </div>
                <div>
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Route</p>
                  <select
                    value={route}
                    onChange={(e) => setRoute(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm font-semibold text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-400"
                  >
                    {ROUTES.map((r) => <option key={r}>{r}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Administered by</p>
                <SearchSelect
                  items={people}
                  labelFn={(p) => `${p.first_name} ${p.last_name}${p.primary_role ? ` — ${p.primary_role}` : ""}`}
                  value={administrator}
                  onChange={setAdministrator}
                  placeholder={`Default: ${user?.full_name || user?.email}`}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Facility</p>
                  <SearchSelect
                    items={enterprises}
                    labelFn={(e) => e.enterprise_name}
                    value={enterprise}
                    onChange={setEnterprise}
                    placeholder="Select facility…"
                  />
                </div>
                <div>
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Location</p>
                  <SearchSelect
                    items={addresses}
                    labelFn={(a) => a.label || a.address_line1}
                    value={address}
                    onChange={setAddress}
                    placeholder="Select location…"
                  />
                </div>
              </div>
            </>
          )}

          {/* Step 2 — Indication */}
          {step === 2 && (
            <>
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Indication / Symptom *</p>
                <div className="grid grid-cols-2 gap-2">
                  {SYMPTOMS.map((s) => (
                    <button
                      key={s}
                      onClick={() => setSymptom(s)}
                      className={`py-3 rounded-xl text-sm font-bold border-2 transition-all active:scale-95
                        ${symptom === s ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-200"}`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Additional Detail</p>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Pain level 7/10, client appeared anxious…"
                  rows={3}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm text-gray-700 placeholder-gray-300 resize-none focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>
            </>
          )}

          {/* Step 3 — Effectiveness & follow-up */}
          {step === 3 && (
            <>
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Immediate Effectiveness Note</p>
                <textarea
                  value={effectiveness}
                  onChange={(e) => setEffectiveness(e.target.value)}
                  placeholder="e.g. Client reported relief, pain reduced to 4/10…"
                  rows={3}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm text-gray-700 placeholder-gray-300 resize-none focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>
              <div className="bg-blue-50 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold text-blue-800">Schedule follow-up check?</p>
                  <button
                    onClick={() => setScheduleFollowup(!scheduleFollowup)}
                    className={`w-12 h-6 rounded-full transition-colors ${scheduleFollowup ? "bg-blue-600" : "bg-gray-300"}`}
                  >
                    <span className={`block w-5 h-5 bg-white rounded-full shadow transition-transform mx-0.5 ${scheduleFollowup ? "translate-x-6" : "translate-x-0"}`} />
                  </button>
                </div>
                {scheduleFollowup && (
                  <div className="flex items-center gap-3">
                    <p className="text-sm text-blue-700">Follow-up in:</p>
                    {["1", "2", "4"].map((h) => (
                      <button
                        key={h}
                        onClick={() => setFollowupHours(h)}
                        className={`px-3 py-1.5 rounded-lg text-sm font-bold border-2 transition-all
                          ${followupHours === h ? "bg-blue-600 text-white border-blue-600" : "bg-white text-blue-700 border-blue-200"}`}
                      >
                        {h}h
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="bg-gray-50 rounded-2xl p-4 text-xs text-gray-500 space-y-1">
                <p className="font-bold text-gray-700">Summary</p>
                <p>Patient: {patient ? `${patient.first_name} ${patient.last_name}` : "—"}</p>
                <p>Medication: <span className="font-bold text-gray-800">{medication?.name || "—"} · {dose} · {route}</span></p>
                <p>Indication: {symptom}{reason && ` — ${reason}`}</p>
                <p>Administered by: {administrator ? `${administrator.first_name} ${administrator.last_name}` : (user?.full_name || user?.email)} · {nowTimeStr()}</p>
                {enterprise && <p>Facility: {enterprise.enterprise_name}</p>}
                {address && <p>Location: {address.label || address.address_line1}</p>}
                <p className="text-emerald-600 font-semibold mt-1">→ Will create Task + Stock-Out Transaction</p>
              </div>
            </>
          )}
        </div>

        {/* Footer nav */}
        <div className="sticky bottom-0 bg-white border-t border-gray-100 px-5 py-4 flex gap-3">
          {step > 1 && (
            <button onClick={() => setStep(step - 1)} className="flex-1 py-4 rounded-2xl border-2 border-gray-200 text-gray-600 font-bold text-sm">
              Back
            </button>
          )}
          {step < 3 ? (
            <button
              onClick={() => setStep(step + 1)}
              disabled={(step === 1 && !canProceed1) || (step === 2 && !canProceed2)}
              className={`flex-1 py-4 rounded-2xl text-white font-black text-sm transition-all active:scale-95
                ${(step === 1 && !canProceed1) || (step === 2 && !canProceed2) ? "bg-gray-300 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700"}`}
            >
              Next →
            </button>
          ) : (
            <button
              onClick={() => saveMut.mutate()}
              disabled={saveMut.isPending}
              className="flex-1 py-4 rounded-2xl bg-emerald-600 text-white font-black text-sm transition-all active:scale-95 hover:bg-emerald-700 flex items-center justify-center gap-2"
            >
              <CheckCircle2 className="w-5 h-5" />
              {saveMut.isPending ? "Recording…" : "Record & Post Transaction"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}