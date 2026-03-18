import React, { useState, useEffect } from "react";
import { Search, AlertTriangle, ChevronDown, Loader2 } from "lucide-react";

const API_BASE = "https://newsconseenwebapp-production.up.railway.app";

// Cache recall checks per session
const recallCache = {};

async function checkRecall(name) {
  if (recallCache[name] !== undefined) return recallCache[name];
  try {
    const res = await fetch(`${API_BASE}/medications/recalls?name=${encodeURIComponent(name)}`);
    const data = await res.json();
    recallCache[name] = !!data.has_active_recall;
    return recallCache[name];
  } catch {
    recallCache[name] = false;
    return false;
  }
}

function MedItem({ product, onSelect, selected }) {
  const [hasRecall, setHasRecall] = useState(false);
  const isLowStock = product.stock_quantity != null && product.min_stock_level != null
    && product.stock_quantity < product.min_stock_level;

  useEffect(() => {
    if (product.name) checkRecall(product.name).then(setHasRecall);
  }, [product.name]);

  return (
    <button
      type="button"
      onClick={() => onSelect(product)}
      className={`w-full text-left px-4 py-3 rounded-xl border-2 transition-all active:scale-[0.99]
        ${selected ? "border-blue-500 bg-blue-50" : "border-gray-200 bg-white hover:border-blue-300"}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-gray-900 truncate">{product.name}</p>
          {product.dosage_instructions && (
            <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{product.dosage_instructions}</p>
          )}
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span className="text-xs text-gray-400">
              Stock: <span className={`font-bold ${isLowStock ? "text-red-600" : "text-gray-700"}`}>
                {product.stock_quantity ?? "—"} {product.unit || ""}
              </span>
            </span>
            {isLowStock && (
              <span className="px-1.5 py-0.5 rounded-md bg-red-100 text-red-700 text-[10px] font-black uppercase tracking-wide">
                LOW STOCK
              </span>
            )}
            {hasRecall && (
              <span className="px-1.5 py-0.5 rounded-md bg-red-600 text-white text-[10px] font-black uppercase tracking-wide flex items-center gap-1">
                <AlertTriangle className="w-2.5 h-2.5" /> RECALL
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

export default function MedMedicationPicker({ products, value, onChange, placeholder = "Select medication…" }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);

  // Filter to medications only
  const meds = products.filter((p) => p.item_type === "medication" && p.status === "active");
  const filtered = meds.filter((p) => p.name?.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="relative">
      <div
        className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm font-semibold text-gray-800 bg-white flex items-center justify-between cursor-pointer"
        onClick={() => setOpen((o) => !o)}
      >
        <span className={value ? "text-gray-900" : "text-gray-400"}>{value ? value.name : placeholder}</span>
        <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
      </div>

      {open && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden">
          <div className="p-2 border-b border-gray-100">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-300" />
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search medications…"
                className="w-full pl-8 pr-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none"
              />
            </div>
          </div>
          <div className="max-h-72 overflow-y-auto p-2 space-y-1.5">
            {filtered.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-4">
                {meds.length === 0 ? "No active medications in inventory" : "No results"}
              </p>
            ) : filtered.map((product) => (
              <MedItem
                key={product.id}
                product={product}
                selected={value?.id === product.id}
                onSelect={(p) => { onChange(p); setOpen(false); setQ(""); }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}