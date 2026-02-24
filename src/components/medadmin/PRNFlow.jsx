import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation } from "@tanstack/react-query";
import { format } from "date-fns";
import { X, CheckCircle2, Search } from "lucide-react";

const SYMPTOMS = ["Pain", "Anxiety", "Agitation", "Seizure risk", "Nausea", "Headache", "Behavioral", "Other"];

function todayStr() { return format(new Date(), "yyyy-MM-dd"); }
function nowTimeStr() { return format(new Date(), "HH:mm"); }

export default function PRNFlow({ user, selectedClient, people, onClose, onSuccess }) {
  const [step, setStep] = useState(1);
  const [client, setClient] = useState(selectedClient);
  const [medName, setMedName] = useState("");
  const [dose, setDose] = useState("");
  const [symptom, setSymptom] = useState("");
  const [reason, setReason] = useState("");
  const [effectiveness, setEffectiveness] = useState("");
  const [scheduleFollowup, setScheduleFollowup] = useState(false);
  const [followupHours, setFollowupHours] = useState("2");

  const saveMut = useMutation({
    mutationFn: async () => {
      const clientName = client ? `${client.first_name} ${client.last_name}` : "";
      const mainTask = await base44.entities.Task.create({
        task_type: "medication_admin",
        title: `PRN: ${medName}`,
        status: "completed",
        outcome: "completed",
        outcome_notes: [
          `Dose: ${dose}`,
          `Symptom: ${symptom}`,
          reason && `Reason: ${reason}`,
          `Administered at ${nowTimeStr()} by ${user?.full_name || user?.email}`,
          effectiveness && `Effectiveness: ${effectiveness}`,
        ].filter(Boolean).join(" | "),
        internal_notes: `PRN | route: oral`,
        assigned_to_email: user?.email,
        assigned_to_name: user?.full_name || user?.email,
        related_person: clientName,
        scheduled_date: todayStr(),
        scheduled_time: nowTimeStr(),
        company_id: user?.company_id || null,
      });

      if (scheduleFollowup) {
        await base44.entities.Task.create({
          task_type: "medication_admin",
          title: `PRN Follow-up: ${medName} effectiveness check`,
          status: "open",
          outcome: "pending",
          assigned_to_email: user?.email,
          assigned_to_name: user?.full_name || user?.email,
          related_person: clientName,
          scheduled_date: todayStr(),
          scheduled_time: format(new Date(Date.now() + parseInt(followupHours) * 3600000), "HH:mm"),
          internal_notes: `Follow-up PRN | PRN effectiveness check`,
          company_id: user?.company_id || null,
        });
      }

      return mainTask;
    },
    onSuccess,
  });

  const canProceed1 = client && medName.trim() && dose.trim();
  const canProceed2 = symptom;
  const canFinish = effectiveness.trim().length > 0 || !scheduleFollowup;

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
          {/* Step 1 — Medication details */}
          {step === 1 && (
            <>
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Client *</p>
                <select
                  value={client?.id || ""}
                  onChange={(e) => setClient(people.find((p) => p.id === e.target.value))}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm font-semibold text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-400"
                >
                  <option value="">Select client…</option>
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>{p.first_name} {p.last_name}</option>
                  ))}
                </select>
              </div>
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Medication Name *</p>
                <input
                  value={medName}
                  onChange={(e) => setMedName(e.target.value)}
                  placeholder="e.g. Ibuprofen, Lorazepam…"
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-base font-bold text-gray-800 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Dose *</p>
                <input
                  value={dose}
                  onChange={(e) => setDose(e.target.value)}
                  placeholder="e.g. 400mg oral, 0.5mg SL…"
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-base text-gray-800 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>
            </>
          )}

          {/* Step 2 — Symptom / Reason */}
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
                  placeholder="e.g. Client reported some relief, pain reduced to 4/10…"
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
                <p>Client: {client ? `${client.first_name} ${client.last_name}` : "—"}</p>
                <p>Med: <span className="font-bold text-gray-800">{medName} {dose}</span></p>
                <p>Indication: {symptom} {reason && `— ${reason}`}</p>
                <p>Staff: {user?.full_name || user?.email} · {nowTimeStr()}</p>
              </div>
            </>
          )}
        </div>

        {/* Footer nav */}
        <div className="sticky bottom-0 bg-white border-t border-gray-100 px-5 py-4 flex gap-3">
          {step > 1 && (
            <button
              onClick={() => setStep(step - 1)}
              className="flex-1 py-4 rounded-2xl border-2 border-gray-200 text-gray-600 font-bold text-sm"
            >
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
              {saveMut.isPending ? "Recording…" : "Record PRN"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}