import React, { useState } from "react";
import { X } from "lucide-react";

export default function SubmitDialog({ session, products, onConfirm, onClose }) {
  const [updateAll, setUpdateAll] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const entries = Object.entries(session.counts);
  const counted = entries.filter(([, c]) => c.counted && c.physical_count !== null);
  const uncounted = entries.filter(([, c]) => !c.counted || c.physical_count === null);
  const changes = counted.filter(([, c]) => c.physical_count !== c.system_count);

  const handleConfirm = async () => {
    setSubmitting(true);
    await onConfirm(updateAll);
    setSubmitting(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-xl">
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <h2 className="text-lg font-bold text-slate-800">Submit Stock Count?</h2>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-sm text-slate-600">
            You counted <strong>{counted.length}</strong> of <strong>{entries.length}</strong> items at <strong>{session.enterprise || "this location"}</strong>.
            {uncounted.length > 0 && <span> <strong>{uncounted.length}</strong> uncounted items will keep their current system values unless you choose to update all.</span>}
          </p>

          {/* Changes preview */}
          {changes.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Items that will be updated:</p>
              <div className="rounded-xl border border-slate-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs text-slate-500">Item</th>
                      <th className="px-3 py-2 text-right text-xs text-slate-500">Change</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {changes.map(([productId, count]) => {
                      const diff = count.physical_count - count.system_count;
                      return (
                        <tr key={productId}>
                          <td className="px-3 py-2 font-medium text-slate-700">{count.product_name}</td>
                          <td className="px-3 py-2 text-right">
                            <span className="text-slate-500">{count.system_count} → {count.physical_count}</span>
                            <span className={`ml-2 font-bold ${diff > 0 ? "text-blue-600" : "text-rose-600"}`}>
                              ({diff > 0 ? "+" : ""}{diff} {count.unit})
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Uncounted items list */}
          {uncounted.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Items NOT counted (will not change):</p>
              <div className="bg-slate-50 rounded-xl p-3 space-y-1 max-h-32 overflow-y-auto">
                {uncounted.map(([productId, count]) => (
                  <p key={productId} className="text-xs text-slate-600">
                    • {count.product_name} (current: {count.system_count} {count.unit})
                  </p>
                ))}
              </div>
            </div>
          )}

          {/* Update options */}
          <div className="space-y-2">
            <label className="flex items-center gap-3 p-3 rounded-xl border cursor-pointer hover:bg-slate-50 transition-colors">
              <input type="radio" checked={!updateAll} onChange={() => setUpdateAll(false)} className="accent-emerald-500" />
              <div>
                <p className="text-sm font-semibold text-slate-700">Update counted items only</p>
                <p className="text-xs text-slate-500">Recommended — only update items you physically counted</p>
              </div>
            </label>
            <label className="flex items-center gap-3 p-3 rounded-xl border cursor-pointer hover:bg-slate-50 transition-colors">
              <input type="radio" checked={updateAll} onChange={() => setUpdateAll(true)} className="accent-emerald-500" />
              <div>
                <p className="text-sm font-semibold text-slate-700">Update all items including uncounted</p>
                <p className="text-xs text-slate-500">Uncounted items will keep their last entered value or stay unchanged</p>
              </div>
            </label>
          </div>
        </div>

        <div className="flex gap-3 p-5 border-t border-slate-100">
          <button onClick={onClose} className="flex-1 py-3 border border-slate-300 text-slate-700 rounded-xl font-semibold hover:bg-slate-50 transition-colors">
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={submitting || changes.length === 0}
            className="flex-1 py-3 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition-colors disabled:opacity-50"
          >
            {submitting ? "Submitting..." : "Submit and Update Stock"}
          </button>
        </div>
      </div>
    </div>
  );
}