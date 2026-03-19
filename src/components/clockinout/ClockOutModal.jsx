import React, { useState } from "react";
import { X, CheckCircle2 } from "lucide-react";
import { fmtDuration } from "./clockUtils";

export default function ClockOutModal({ clockInTime, netMins, enterprise, onConfirm, onClose }) {
  const [notes, setNotes] = useState("");

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-800">End of Shift</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Shift summary */}
        <div className="bg-slate-50 rounded-xl p-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">Start time</span>
            <span className="font-semibold text-slate-800">{clockInTime}</span>
          </div>
          {netMins !== null && (
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Duration (net)</span>
              <span className="font-semibold text-slate-800">{fmtDuration(netMins)}</span>
            </div>
          )}
          {enterprise && (
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Enterprise</span>
              <span className="font-semibold text-slate-800">{enterprise}</span>
            </div>
          )}
        </div>

        {/* Notes */}
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">
            Handover Notes <span className="text-slate-300 font-normal normal-case">(optional)</span>
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="e.g. Completed all medication rounds, left keys with supervisor"
            className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-400 resize-none"
          />
        </div>

        <div className="space-y-2">
          <button
            onClick={() => onConfirm(notes)}
            className="w-full py-3.5 rounded-xl bg-slate-800 text-white font-bold text-sm hover:bg-slate-700 active:scale-95 transition-all flex items-center justify-center gap-2"
          >
            <CheckCircle2 className="w-4 h-4" /> Clock Out
          </button>
          <button
            onClick={() => onConfirm("")}
            className="w-full py-3 rounded-xl border border-slate-200 text-slate-500 text-sm hover:bg-slate-50 transition-all"
          >
            Clock out without notes
          </button>
        </div>
      </div>
    </div>
  );
}