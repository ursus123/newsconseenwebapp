import React, { useState } from "react";
import { Check, Minus, Plus } from "lucide-react";

function getRowStyle(count) {
  if (!count.counted || count.physical_count === null) return "bg-white border-slate-200";
  const diff = count.physical_count - count.system_count;
  const pct = count.system_count > 0 ? Math.abs(diff / count.system_count * 100) : 100;
  if (diff === 0) return "bg-emerald-50 border-l-4 border-l-emerald-400 border-slate-100";
  if (diff > 0) return "bg-blue-50 border-l-4 border-l-blue-400 border-slate-100";
  if (pct <= 10) return "bg-amber-50 border-l-4 border-l-amber-400 border-slate-100";
  return "bg-rose-50 border-l-4 border-l-rose-400 border-slate-100";
}

function getDiffLabel(count) {
  if (!count.counted || count.physical_count === null) return null;
  const diff = count.physical_count - count.system_count;
  const pct = count.system_count > 0 ? Math.abs(diff / count.system_count * 100) : 100;
  if (diff === 0) return <span className="text-emerald-600 font-semibold text-xs">✅ Match</span>;
  if (diff > 0) return <span className="text-blue-600 font-semibold text-xs">📈 +{diff} surplus</span>;
  if (pct <= 10) return <span className="text-amber-600 font-semibold text-xs">⚠️ {diff} close</span>;
  return <span className="text-rose-600 font-semibold text-xs">🔴 {diff} missing</span>;
}

export default function CountRow({ productId, product, count, onChange }) {
  const [notesOpen, setNotesOpen] = useState(false);

  const handleMark = () => {
    // Mark as counted with system count as physical count if none entered
    const physVal = count.physical_count !== null ? count.physical_count : count.system_count;
    onChange(productId, physVal, count.notes, true);
  };

  const handleIncrement = () => {
    const val = (count.physical_count ?? count.system_count ?? 0) + 1;
    onChange(productId, val, count.notes, true);
  };

  const handleDecrement = () => {
    const val = Math.max(0, (count.physical_count ?? count.system_count ?? 0) - 1);
    onChange(productId, val, count.notes, true);
  };

  const handleInput = (e) => {
    const raw = e.target.value;
    if (raw === "" || raw === null) {
      onChange(productId, null, count.notes, false);
    } else {
      const val = Math.max(0, parseInt(raw, 10) || 0);
      onChange(productId, val, count.notes, true);
    }
  };

  return (
    <div className={`rounded-xl border p-4 transition-all ${getRowStyle(count)}`}>
      <div className="flex items-start gap-3">
        {/* Checkbox */}
        <button
          onClick={handleMark}
          className={`mt-1 w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
            count.counted
              ? "bg-emerald-500 border-emerald-500"
              : "border-slate-300 hover:border-emerald-400"
          }`}
        >
          {count.counted && <Check className="w-3.5 h-3.5 text-white" />}
        </button>

        <div className="flex-1 min-w-0">
          {/* Item info */}
          <div className="flex items-start justify-between gap-2 mb-2">
            <div>
              <p className="font-semibold text-slate-800 text-base leading-tight">{product.name}</p>
              <p className="text-xs text-slate-400 mt-0.5">
                {product.sku && <span className="mr-2">{product.sku}</span>}
                {product.category && <span className="capitalize">{product.category}</span>}
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-xs text-slate-500">System</p>
              <p className="text-sm font-bold text-slate-700">{count.system_count} <span className="text-xs font-normal text-slate-400">{product.unit || "pcs"}</span></p>
            </div>
          </div>

          {/* Count input row */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-slate-500 shrink-0">You counted:</span>
            <div className="flex items-center gap-1">
              <button
                onClick={handleDecrement}
                className="w-10 h-10 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors"
              >
                <Minus className="w-4 h-4 text-slate-600" />
              </button>
              <input
                type="number"
                inputMode="numeric"
                min="0"
                value={count.physical_count !== null ? count.physical_count : ""}
                onChange={handleInput}
                placeholder="—"
                className="w-20 h-10 text-center text-lg font-bold border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-300 bg-white"
              />
              <button
                onClick={handleIncrement}
                className="w-10 h-10 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors"
              >
                <Plus className="w-4 h-4 text-slate-600" />
              </button>
              <span className="text-sm text-slate-400">{product.unit || "pcs"}</span>
            </div>

            <div className="ml-auto flex items-center gap-2">
              {getDiffLabel(count)}
              <button
                onClick={() => setNotesOpen(o => !o)}
                className="text-xs text-slate-400 hover:text-slate-600 underline"
              >
                {notesOpen ? "hide notes" : "notes"}
              </button>
            </div>
          </div>

          {notesOpen && (
            <input
              type="text"
              placeholder="Add a note..."
              value={count.notes || ""}
              onChange={e => onChange(productId, count.physical_count, e.target.value, count.counted)}
              className="mt-2 w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-300"
            />
          )}
        </div>
      </div>
    </div>
  );
}