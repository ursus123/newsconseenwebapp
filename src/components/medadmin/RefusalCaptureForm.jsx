import React, { useState } from "react";

const REFUSAL_REASONS = [
  "Client refused verbally",
  "Client asleep / unresponsive",
  "Client away from facility",
  "Client experiencing side effects",
  "Client nausea/vomiting",
  "Swallowing difficulty",
  "Other",
];

const FOLLOWUP_ACTIONS = [
  "Notified supervisor",
  "Notified prescriber",
  "Will attempt again at next scheduled time",
  "No further action required",
];

export default function RefusalCaptureForm({ isControlled, onChange, darkMode }) {
  const [reason, setReason] = useState("");
  const [otherText, setOtherText] = useState("");
  const [followUp, setFollowUp] = useState("");
  const [witness, setWitness] = useState("");

  function notify(r, o, f, w) {
    const finalReason = r === "Other" ? `Other: ${o}` : r;
    const parts = [`REFUSED: ${finalReason}`, `Follow-up: ${f || "Not specified"}`, w ? `Witness: ${w}` : null].filter(Boolean);
    onChange({ structured: parts.join(" | "), isComplete: !!(r && f && (!isControlled || w)) });
  }

  const handleReason = (v) => { setReason(v); notify(v, otherText, followUp, witness); };
  const handleOther = (v) => { setOtherText(v); notify(reason, v, followUp, witness); };
  const handleFollowUp = (v) => { setFollowUp(v); notify(reason, otherText, v, witness); };
  const handleWitness = (v) => { setWitness(v); notify(reason, otherText, followUp, v); };

  const labelCls = "text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 block";
  const selectCls = "w-full px-4 py-3 rounded-xl border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-400";

  return (
    <div className="space-y-4 bg-orange-50 border border-orange-200 rounded-2xl p-4">
      <p className="text-xs font-black text-orange-700 uppercase tracking-widest">Document Refusal</p>

      <div>
        <label className={labelCls}>Reason * (required)</label>
        <select value={reason} onChange={(e) => handleReason(e.target.value)} className={selectCls}>
          <option value="">— Select reason —</option>
          {REFUSAL_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>

      {reason === "Other" && (
        <div>
          <label className={labelCls}>Specify reason *</label>
          <input
            type="text"
            value={otherText}
            onChange={(e) => handleOther(e.target.value)}
            placeholder="Describe the reason..."
            className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
          />
        </div>
      )}

      <div>
        <label className={labelCls}>Follow-up Action * (required)</label>
        <select value={followUp} onChange={(e) => handleFollowUp(e.target.value)} className={selectCls}>
          <option value="">— Select action —</option>
          {FOLLOWUP_ACTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>

      {isControlled && (
        <div>
          <label className={labelCls}>Witnessed by * (required for controlled medication)</label>
          <input
            type="text"
            value={witness}
            onChange={(e) => handleWitness(e.target.value)}
            placeholder="Full name of witness..."
            className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
          />
        </div>
      )}
    </div>
  );
}