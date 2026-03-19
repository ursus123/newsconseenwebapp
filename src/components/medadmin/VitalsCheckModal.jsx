import React, { useState } from "react";
import { X, AlertTriangle, Activity, ChevronRight, PhoneOff } from "lucide-react";

function FieldRow({ label, children }) {
  return (
    <div>
      <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5 block">{label}</label>
      {children}
    </div>
  );
}

function NumInput({ value, onChange, placeholder, unit, min, max }) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="flex-1 px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
      />
      {unit && <span className="text-xs text-gray-400 font-semibold w-12">{unit}</span>}
    </div>
  );
}

export default function VitalsCheckModal({ medName, clientName, onProceed, onHold, darkMode }) {
  const [systolic, setSystolic] = useState("");
  const [diastolic, setDiastolic] = useState("");
  const [pulse, setPulse] = useState("");
  const [temp, setTemp] = useState("");
  const [tempUnit, setTempUnit] = useState("C");
  const [glucose, setGlucose] = useState("");
  const [spo2, setSpo2] = useState("");
  const [weight, setWeight] = useState("");

  const warnings = [];
  const criticals = [];

  if (systolic && (parseInt(systolic) > 180 || parseInt(systolic) < 90)) {
    warnings.push(`BP systolic (${systolic} mmHg) is outside normal range (90–180)`);
  }
  if (pulse && (parseInt(pulse) > 100 || parseInt(pulse) < 50)) {
    warnings.push(`Pulse (${pulse} bpm) is outside normal range (50–100)`);
  }
  if (glucose && parseFloat(glucose) < 4.0) {
    criticals.push(`🩸 Hypoglycemia risk — Blood glucose (${glucose} mmol/L) is below 4.0. Do NOT administer insulin. Contact prescriber immediately.`);
  }

  function buildVitalsString() {
    const parts = [];
    if (systolic && diastolic) parts.push(`BP: ${systolic}/${diastolic} mmHg`);
    if (pulse) parts.push(`Pulse: ${pulse} bpm`);
    if (temp) parts.push(`Temp: ${temp}°${tempUnit}`);
    if (glucose) parts.push(`BGL: ${glucose} mmol/L`);
    if (spo2) parts.push(`SpO2: ${spo2}%`);
    if (weight) parts.push(`Wt: ${weight} kg`);
    return parts.join(" | ");
  }

  const bg = darkMode ? "bg-slate-800 text-slate-100" : "bg-white";

  return (
    <div className="fixed inset-0 bg-black/60 z-[150] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className={`${bg} rounded-t-3xl sm:rounded-3xl w-full max-w-lg shadow-2xl max-h-[95vh] overflow-y-auto`}>
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100">
          <div>
            <div className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-blue-600" />
              <p className="font-black text-gray-900">Record Vitals Before Administration</p>
            </div>
            <p className="text-xs text-gray-400 mt-0.5">{medName} for {clientName}</p>
          </div>
          <button onClick={onHold}><X className="w-5 h-5 text-gray-400" /></button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <FieldRow label="Systolic BP (mmHg)">
              <NumInput value={systolic} onChange={setSystolic} placeholder="120" />
            </FieldRow>
            <FieldRow label="Diastolic BP (mmHg)">
              <NumInput value={diastolic} onChange={setDiastolic} placeholder="80" />
            </FieldRow>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FieldRow label="Pulse (bpm)">
              <NumInput value={pulse} onChange={setPulse} placeholder="72" />
            </FieldRow>
            <FieldRow label={`Temperature (°${tempUnit})`}>
              <div className="flex gap-2">
                <input
                  type="number"
                  value={temp}
                  onChange={(e) => setTemp(e.target.value)}
                  placeholder={tempUnit === "C" ? "37.0" : "98.6"}
                  className="flex-1 px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
                <button
                  onClick={() => setTempUnit((u) => u === "C" ? "F" : "C")}
                  className="px-2 py-1 rounded-lg bg-blue-50 text-blue-600 text-xs font-bold"
                >°{tempUnit === "C" ? "F" : "C"}</button>
              </div>
            </FieldRow>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FieldRow label="Blood Glucose (mmol/L)">
              <NumInput value={glucose} onChange={setGlucose} placeholder="5.5" />
            </FieldRow>
            <FieldRow label="SpO2 (%)">
              <NumInput value={spo2} onChange={setSpo2} placeholder="98" />
            </FieldRow>
          </div>
          <FieldRow label="Weight (kg)">
            <NumInput value={weight} onChange={setWeight} placeholder="70" />
          </FieldRow>

          {criticals.map((c, i) => (
            <div key={i} className="flex items-start gap-2 bg-red-50 border-2 border-red-400 rounded-2xl px-4 py-3">
              <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <p className="text-sm font-bold text-red-800">{c}</p>
            </div>
          ))}
          {warnings.map((w, i) => (
            <div key={i} className="flex items-start gap-2 bg-amber-50 border border-amber-300 rounded-2xl px-4 py-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs font-semibold text-amber-800">{w}</p>
            </div>
          ))}
        </div>

        <div className="sticky bottom-0 px-5 py-4 border-t border-gray-100 bg-white space-y-2">
          <button
            onClick={() => criticals.length === 0 && onProceed(buildVitalsString())}
            disabled={criticals.length > 0}
            className={`w-full py-4 rounded-2xl font-black text-sm flex items-center justify-center gap-2 transition-all active:scale-95
              ${criticals.length > 0 ? "bg-gray-200 text-gray-400 cursor-not-allowed" : "bg-emerald-600 text-white hover:bg-emerald-700"}`}
          >
            <ChevronRight className="w-5 h-5" /> Proceed with Administration →
          </button>
          <button
            onClick={onHold}
            className="w-full py-3.5 rounded-2xl border-2 border-orange-300 text-orange-700 font-bold text-sm flex items-center justify-center gap-2 hover:bg-orange-50"
          >
            <PhoneOff className="w-4 h-4" /> Hold Administration — Contact Prescriber
          </button>
        </div>
      </div>
    </div>
  );
}