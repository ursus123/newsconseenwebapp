import React from "react";
import { format, formatDistanceStrict } from "date-fns";
import { exportCountReport } from "./exportUtils";

export default function SuccessScreen({ result, onNewCount, onViewProducts, products }) {
  const { updated, skipped, errors, session } = result;
  const startedAt = session?.started_at ? new Date(session.started_at) : null;
  const completedAt = new Date();
  const duration = startedAt ? formatDistanceStrict(startedAt, completedAt) : null;

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-3xl border border-slate-200 p-8 max-w-md w-full text-center shadow-lg">
        <div className="text-6xl mb-4">🎉</div>
        <h1 className="text-2xl font-bold text-slate-800 mb-2">Stock Count Complete!</h1>
        <p className="text-slate-500 text-sm mb-6">All changes have been saved to the system.</p>

        <div className="bg-slate-50 rounded-2xl p-5 space-y-3 text-sm text-left mb-6">
          <div className="flex items-center gap-3">
            <span className="text-xl">✅</span>
            <span className="text-slate-700"><strong>{updated}</strong> items updated</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xl">⏭️</span>
            <span className="text-slate-700"><strong>{skipped}</strong> items unchanged</span>
          </div>
          {errors > 0 && (
            <div className="flex items-center gap-3">
              <span className="text-xl">⚠️</span>
              <span className="text-rose-600"><strong>{errors}</strong> errors</span>
            </div>
          )}
          {duration && (
            <div className="flex items-center gap-3">
              <span className="text-xl">⏱️</span>
              <span className="text-slate-700">Duration: <strong>{duration}</strong></span>
            </div>
          )}
          {session?.enterprise && (
            <div className="flex items-center gap-3">
              <span className="text-xl">🏢</span>
              <span className="text-slate-700">{session.enterprise}{session.location ? ` — ${session.location}` : ""}</span>
            </div>
          )}
          {session?.counted_by && (
            <div className="flex items-center gap-3">
              <span className="text-xl">👤</span>
              <span className="text-slate-700">Counted by <strong>{session.counted_by}</strong></span>
            </div>
          )}
        </div>

        <div className="space-y-3">
          <button
            onClick={() => exportCountReport(session, products)}
            className="w-full py-3 border border-slate-300 text-slate-700 rounded-xl font-semibold hover:bg-slate-50 transition-colors"
          >
            📥 Download Count Report
          </button>
          <button
            onClick={onViewProducts}
            className="w-full py-3 border border-slate-300 text-slate-700 rounded-xl font-semibold hover:bg-slate-50 transition-colors"
          >
            📦 View Products
          </button>
          <button
            onClick={onNewCount}
            className="w-full py-3 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition-colors"
          >
            🔢 Start New Count
          </button>
        </div>
      </div>
    </div>
  );
}