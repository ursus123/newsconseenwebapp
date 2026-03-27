import React from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Package } from "lucide-react";

export default function LowStockAlert({ products, lowStockCount = 0 }) {
  const lowStock = products.filter(
    (p) => p.min_stock_level != null && p.stock_quantity != null && p.stock_quantity < p.min_stock_level
  );

  const count = lowStockCount > 0 ? lowStockCount : lowStock.length;
  if (count === 0) return null;

  return (
    <div className="rounded-2xl border border-orange-200 bg-orange-50/40 overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3 bg-orange-100/60 border-b border-orange-200">
        <Package className="w-4 h-4 text-orange-700" />
        <span className="text-sm font-semibold text-orange-700">📦 {count} product{count !== 1 ? "s" : ""} below minimum stock level</span>
        <Link to={createPageUrl("Products")} className="ml-auto text-xs font-semibold text-orange-700 hover:underline">Manage Inventory →</Link>
      </div>
      <div className="divide-y divide-orange-100">
        {lowStock.slice(0, 5).map((p) => (
          <div key={p.id} className="flex items-center gap-3 px-5 py-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-800 truncate">{p.name}</p>
              {p.supplier && <p className="text-xs text-slate-400 mt-0.5">{p.supplier}</p>}
            </div>
            <div className="text-right shrink-0">
              <p className="text-sm font-semibold text-orange-700">{p.stock_quantity} {p.unit || ""}</p>
              <p className="text-xs text-slate-400">min: {p.min_stock_level}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}