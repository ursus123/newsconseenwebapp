import React, { useState } from "react";
import { X } from "lucide-react";

export default function BulkQueue({ queue, onUpdateQueue, onProcessAll }) {
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);

  const updateQty = (idx, val) => {
    onUpdateQueue((q) => q.map((r, i) => i === idx ? { ...r, qty: Math.max(1, Number(val)) } : r));
  };

  const toggleDir = (idx) => {
    onUpdateQueue((q) => q.map((r, i) => i === idx ? { ...r, direction: r.direction === "in" ? "out" : "in" } : r));
  };

  const remove = (idx) => {
    onUpdateQueue((q) => q.filter((_, i) => i !== idx));
  };

  const handleProcessAll = async () => {
    setProcessing(true);
    setProgress(0);
    for (let i = 0; i < queue.length; i++) {
      await onProcessAll([queue[i]]);
      setProgress(i + 1);
    }
    setProcessing(false);
    setProgress(0);
  };

  if (queue.length === 0) return null;

  return (
    <div className="bg-slate-900 border-t border-slate-800 px-4 py-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-white font-black text-sm">🗂 Bulk Queue ({queue.length})</p>
        {processing && (
          <p className="text-slate-400 text-xs">Processing {progress} of {queue.length}…</p>
        )}
      </div>

      {processing && (
        <div className="w-full h-1.5 bg-slate-700 rounded-full mb-2 overflow-hidden">
          <div className="h-full bg-violet-500 rounded-full transition-all" style={{ width: `${(progress / queue.length) * 100}%` }} />
        </div>
      )}

      <div className="space-y-1.5 max-h-48 overflow-y-auto mb-3">
        {queue.map((row, idx) => (
          <div key={idx} className="flex items-center gap-2 bg-slate-800 rounded-xl px-3 py-2">
            <span className="text-white text-xs font-bold flex-1 truncate">{row.product.name}</span>
            <input type="number" min={1} value={row.qty}
              onChange={(e) => updateQty(idx, e.target.value)}
              className="w-14 text-center bg-slate-700 text-white text-xs rounded-lg px-1 py-1 border border-slate-600 focus:outline-none" />
            <button onClick={() => toggleDir(idx)}
              className={`px-2 py-1 rounded-lg text-xs font-black transition-colors ${row.direction === "in" ? "bg-emerald-700 text-emerald-100" : "bg-rose-700 text-rose-100"}`}>
              {row.direction === "in" ? "IN" : "OUT"}
            </button>
            <button onClick={() => remove(idx)} className="text-slate-500 hover:text-red-400 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>

      <button onClick={handleProcessAll} disabled={processing}
        className="w-full py-3 bg-violet-600 hover:bg-violet-700 text-white font-black text-sm rounded-xl transition-colors disabled:opacity-50">
        {processing ? "Processing…" : `⚡ Process All (${queue.length} items)`}
      </button>
    </div>
  );
}