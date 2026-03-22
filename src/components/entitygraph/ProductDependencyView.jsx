import React from "react";

export default function ProductDependencyView({ products, services, tasks, enterprises, selectedEnterprise }) {
  const lowStock = products.filter(p =>
    p.stock_quantity != null && p.min_stock_level != null &&
    p.stock_quantity <= p.min_stock_level && p.stock_quantity > 0 && p.status === "active"
  );
  const outOfStock = products.filter(p => p.stock_quantity != null && p.stock_quantity <= 0);

  const byType = {};
  products.forEach(p => {
    const type = p.item_type || "Other";
    if (!byType[type]) byType[type] = [];
    byType[type].push(p);
  });

  const TYPE_COLORS = {
    medication: { bg: "bg-blue-50", border: "border-blue-100", text: "text-blue-700", sub: "text-blue-500", bar: "bg-blue-400" },
    equipment:  { bg: "bg-amber-50", border: "border-amber-100", text: "text-amber-700", sub: "text-amber-500", bar: "bg-amber-400" },
    consumable: { bg: "bg-emerald-50", border: "border-emerald-100", text: "text-emerald-700", sub: "text-emerald-500", bar: "bg-emerald-400" },
    fixed_asset:{ bg: "bg-indigo-50", border: "border-indigo-100", text: "text-indigo-700", sub: "text-indigo-500", bar: "bg-indigo-400" },
    Other:      { bg: "bg-slate-50", border: "border-slate-100", text: "text-slate-700", sub: "text-slate-500", bar: "bg-slate-400" },
  };

  if (products.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="text-5xl mb-3">📦</div>
        <p className="text-slate-400 text-sm">No products defined yet.</p>
      </div>
    );
  }

  return (
    <div className="p-6 overflow-auto h-full">
      {(lowStock.length > 0 || outOfStock.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {outOfStock.length > 0 && (
            <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4">
              <p className="text-sm font-bold text-rose-700 mb-2">🔴 Out of Stock ({outOfStock.length})</p>
              {outOfStock.map(p => (
                <div key={p.id} className="flex items-center justify-between py-1.5 border-b border-rose-100 last:border-0">
                  <span className="text-xs text-rose-700 font-medium">{p.name}</span>
                  <span className="text-xs font-bold text-rose-600">{p.stock_quantity} units</span>
                </div>
              ))}
            </div>
          )}
          {lowStock.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
              <p className="text-sm font-bold text-amber-700 mb-2">🟡 Low Stock ({lowStock.length})</p>
              {lowStock.map(p => (
                <div key={p.id} className="flex items-center justify-between py-1.5 border-b border-amber-100 last:border-0">
                  <span className="text-xs text-amber-700 font-medium">{p.name}</span>
                  <div className="flex items-center gap-2">
                    <div className="w-16 h-1.5 bg-amber-100 rounded-full overflow-hidden">
                      <div className="h-full bg-amber-400 rounded-full" style={{ width: `${Math.min(p.stock_quantity / p.min_stock_level * 100, 100)}%` }} />
                    </div>
                    <span className="text-xs font-bold text-amber-600">{p.stock_quantity}/{p.min_stock_level}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="space-y-4">
        {Object.entries(byType).map(([type, items]) => {
          const colors = TYPE_COLORS[type] || TYPE_COLORS.Other;
          return (
            <div key={type} className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
              <div className={`px-4 py-3 ${colors.bg} border-b ${colors.border} flex items-center justify-between`}>
                <h3 className={`font-bold text-sm ${colors.text} capitalize`}>{type.replace(/_/g, " ")}s ({items.length})</h3>
                <div className="flex items-center gap-2 text-xs">
                  <span className={colors.sub}>{items.filter(i => i.status === "active").length} active</span>
                  {items.some(i => i.stock_quantity != null && i.stock_quantity <= (i.min_stock_level || 0)) && (
                    <span className="text-rose-500 font-bold">⚠️ Stock issues</span>
                  )}
                </div>
              </div>
              <div className="divide-y divide-slate-100">
                {items.map(product => {
                  const stockPct = product.stock_quantity != null && product.min_stock_level != null && product.min_stock_level > 0
                    ? Math.min(product.stock_quantity / product.min_stock_level * 100, 150)
                    : null;
                  const stockBarColor = stockPct === null ? null : stockPct > 100 ? "bg-emerald-400" : stockPct > 50 ? "bg-amber-400" : "bg-rose-400";
                  const stockTextColor = stockPct === null ? null : stockPct > 100 ? "text-emerald-600" : stockPct > 50 ? "text-amber-600" : "text-rose-600";

                  return (
                    <div key={product.id} className="px-4 py-3 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-slate-700">{product.name}</p>
                        {product.sku && <p className="text-[10px] text-slate-400">SKU: {product.sku}</p>}
                      </div>
                      <div className="flex items-center gap-3">
                        {stockPct !== null && (
                          <div className="flex items-center gap-2">
                            <div className="w-20 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                              <div className={`h-full ${stockBarColor} rounded-full`} style={{ width: `${Math.min(stockPct, 100)}%` }} />
                            </div>
                            <span className={`text-xs font-bold ${stockTextColor}`}>{product.stock_quantity}</span>
                          </div>
                        )}
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${product.status === "active" ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-400"}`}>
                          {product.status}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}