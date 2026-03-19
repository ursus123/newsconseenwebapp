import React, { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

export default function LowStockPanel({ products, onSelectProduct, filterZero = false }) {
  const [open, setOpen] = useState(true);

  const lowStock = products.filter(
    (p) => filterZero
      ? (p.stock_quantity ?? 0) === 0
      : (p.min_stock_level > 0 && (p.stock_quantity ?? 0) <= p.min_stock_level)
  );

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-2xl overflow-hidden">
      <button onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left">
        <div className="flex items-center gap-2">
          <span className="text-amber-400 text-sm font-black">
            {lowStock.length > 0 ? `⚠️ Low Stock Alerts (${lowStock.length})` : "✅ Stock Levels"}
          </span>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
      </button>

      {open && (
        <div className="border-t border-slate-700">
          {lowStock.length === 0 ? (
            <p className="px-4 py-4 text-slate-400 text-sm text-center">All items adequately stocked</p>
          ) : (
            <div className="divide-y divide-slate-700">
              {lowStock.slice(0, 8).map((p) => {
                const stock = p.stock_quantity ?? 0;
                const min = p.min_stock_level;
                const pct = Math.min((stock / Math.max(min, 1)) * 100, 100);
                return (
                  <div key={p.id} className="px-4 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-white text-sm font-bold truncate">{p.name}</p>
                        <p className="text-slate-500 text-xs">{p.sku || "No SKU"}</p>
                      </div>
                      <span className="text-xs font-black text-red-400 shrink-0">{stock} / {min} min</span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-700 rounded-full mt-2 overflow-hidden">
                      <div className="h-full bg-red-500 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                    <button onClick={() => onSelectProduct(p)}
                      className="mt-2 text-xs font-bold text-indigo-400 hover:text-indigo-300 transition-colors">
                      Scan to Restock →
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}