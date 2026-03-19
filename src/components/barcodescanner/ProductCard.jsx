import React, { useState, useRef } from "react";
import { Minus, Plus, X } from "lucide-react";

const QUICK_QTYS = [1, 5, 10, 20];

export default function ProductCard({ product, mode, modeConfig, quantity, onQuantityChange, notes, onNotesChange, recall, successFlash, isProcessing, onConfirm, onClear }) {
  const [customQty, setCustomQty] = useState(false);

  const cfg = modeConfig[mode];
  const stock = product.stock_quantity ?? 0;
  const min = product.min_stock_level ?? 0;
  const maxStock = Math.max(stock + 20, 20);
  const stockPct = Math.min((stock / maxStock) * 100, 100);
  const stockColor = stock <= min ? "bg-red-500" : stock <= min * 1.2 ? "bg-amber-500" : "bg-emerald-500";
  const stockBadge = stock <= min ? "bg-red-100 text-red-700" : stock <= min * 1.2 ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700";

  const isOutMode = mode === "out";
  const recallBlocked = recall?.has_active_recall && product.item_type === "medication";

  const clampQty = (v) => {
    const n = Math.max(1, isOutMode ? Math.min(v, stock) : v);
    onQuantityChange(n);
  };

  if (successFlash?.product?.id === product.id) {
    return (
      <div className="bg-emerald-900 border-2 border-emerald-500 rounded-2xl p-6 text-center animate-pulse">
        <p className="text-4xl mb-2">✅</p>
        <p className="text-emerald-300 font-black text-lg">{product.name}</p>
        <p className="text-emerald-400 text-sm mt-1">
          {successFlash.oldQty} → <span className="font-black text-white text-xl">{successFlash.newQty}</span> units
        </p>
      </div>
    );
  }

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 flex items-start justify-between gap-3 border-b border-slate-700">
        <div className="flex items-start gap-3 min-w-0">
          <span className="text-2xl shrink-0">📦</span>
          <div className="min-w-0">
            <p className="text-white font-black text-base leading-tight truncate">{product.name}</p>
            <p className="text-slate-400 text-xs mt-0.5">SKU: {product.sku || "—"} · {product.item_type || "item"}</p>
          </div>
        </div>
        <button onClick={onClear} className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-slate-700 shrink-0 transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="px-4 py-3 space-y-4">
        {/* Stock bar */}
        <div>
          <div className="flex justify-between items-center mb-1">
            <span className="text-slate-400 text-xs font-bold">Stock Level</span>
            <span className={`text-xs font-black px-2 py-0.5 rounded-full ${stockBadge}`}>{stock} units</span>
          </div>
          <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all ${stockColor}`} style={{ width: `${stockPct}%` }} />
          </div>
          {stock <= min && min > 0 && (
            <p className="text-red-400 text-xs mt-1 font-bold">⚠️ Below minimum stock ({min} units)</p>
          )}
          {product.unit_price > 0 && (
            <p className="text-slate-400 text-xs mt-1">Unit price: ${product.unit_price.toFixed(2)}</p>
          )}
        </div>

        {/* Recall banner */}
        {recall?.has_active_recall && (
          <div className="bg-red-950 border-2 border-red-600 rounded-xl px-3 py-2.5">
            <p className="text-red-300 font-black text-sm">🔴 ACTIVE FDA RECALL</p>
            <p className="text-red-400 text-xs mt-0.5">{recall.reason_for_recall || "Do NOT dispense this item"}</p>
          </div>
        )}

        {/* Quantity */}
        <div>
          <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-2">Quantity</p>
          {/* +/- */}
          <div className="flex items-center gap-3 mb-2">
            <button onClick={() => clampQty(quantity - 1)} className="w-12 h-12 rounded-xl bg-slate-700 text-white font-black text-xl hover:bg-slate-600 flex items-center justify-center transition-colors">
              <Minus className="w-5 h-5" />
            </button>
            <input
              type="number"
              min={1}
              max={isOutMode ? stock : undefined}
              value={quantity}
              onChange={(e) => clampQty(Number(e.target.value))}
              className="flex-1 text-center text-white text-2xl font-black bg-slate-700 border border-slate-600 rounded-xl py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button onClick={() => clampQty(quantity + 1)} className="w-12 h-12 rounded-xl bg-slate-700 text-white font-black text-xl hover:bg-slate-600 flex items-center justify-center transition-colors">
              <Plus className="w-5 h-5" />
            </button>
          </div>
          {/* Quick qty */}
          <div className="flex gap-1.5">
            {QUICK_QTYS.map((q) => (
              <button key={q} onClick={() => clampQty(q)}
                className={`flex-1 py-2 rounded-xl text-sm font-black transition-all ${quantity === q ? "bg-indigo-600 text-white" : "bg-slate-700 text-slate-300 hover:bg-slate-600"}`}>
                {q}
              </button>
            ))}
          </div>
          {isOutMode && quantity > stock && (
            <p className="text-amber-400 text-xs font-bold mt-1.5">⚠️ Only {stock} units available</p>
          )}
        </div>

        {/* Notes */}
        <div>
          <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-1">Notes</p>
          <input value={notes} onChange={(e) => onNotesChange(e.target.value)}
            placeholder="Optional notes…"
            className="w-full bg-slate-700 border border-slate-600 rounded-xl px-3 py-2 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>

        {/* Confirm button */}
        <button
          onClick={onConfirm}
          disabled={isProcessing || recallBlocked || (isOutMode && quantity > stock)}
          className={`w-full py-4 rounded-xl font-black text-base transition-all disabled:opacity-40 ${cfg.btn}`}
        >
          {isProcessing ? "Processing…" : `${cfg.emoji} Confirm ${cfg.label} (${quantity > 0 ? (mode === "in" ? "+" : mode === "out" ? "-" : "") : ""}${quantity})`}
        </button>
      </div>
    </div>
  );
}