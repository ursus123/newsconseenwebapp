import React, { useMemo } from "react";
import {
  getLivestock, getLivestockUnit, getLowStockLabel,
  LIVESTOCK_ITEM_TYPES,
} from "./enterpriseHelpers";

const STATUS_COLOR = {
  active: "bg-emerald-100 text-emerald-700",
  discontinued: "bg-rose-100 text-rose-700",
  out_of_stock: "bg-amber-100 text-amber-700",
  archived: "bg-slate-100 text-slate-500",
};

const TYPE_ICON = {
  inventory_item: "📦",
  fixed_asset: "🏗️",
  service_item: "⚙️",
  digital_item: "💻",
  consumable: "🧴",
  raw_material: "🪨",
  medication: "💊",
  livestock: "🐄",
  feed: "🌾",
  seed: "🌱",
  crop: "🌽",
  fertilizer: "🪣",
  vehicle: "🚗",
  tool: "🔧",
  other: "📋",
};

export default function ProductsView({ enterprises, products, relationships, selectedEnterprise }) {
  const visibleEnterprises = selectedEnterprise === "all"
    ? enterprises
    : enterprises.filter(e => e.id === selectedEnterprise);

  const enterpriseProductMap = useMemo(() => {
    const map = {};
    relationships
      .filter(r => r.relationship_type === "item_enterprise" && r.status !== "ended" && r.enterprise_name && r.item_name)
      .forEach(r => {
        if (!map[r.enterprise_name]) map[r.enterprise_name] = new Set();
        map[r.enterprise_name].add(r.item_name.trim());
      });
    products.forEach(p => {
      (p.assigned_enterprises || []).forEach(ae => {
        if (!ae.enterprise_name) return;
        if (!map[ae.enterprise_name]) map[ae.enterprise_name] = new Set();
        map[ae.enterprise_name].add((p.name || "").trim());
      });
    });
    return map;
  }, [relationships, products]);

  const productsByName = useMemo(() => {
    const map = {};
    products.forEach(p => { map[(p.name || "").trim()] = p; });
    return map;
  }, [products]);

  const getProductsForEnterprise = (enterpriseName) => {
    const names = enterpriseProductMap[enterpriseName] || new Set();
    return [...names].map(n => productsByName[n]).filter(Boolean);
  };

  const linkedProductNames = useMemo(() => {
    const s = new Set();
    Object.values(enterpriseProductMap).forEach(names => names.forEach(n => s.add(n)));
    return s;
  }, [enterpriseProductMap]);

  const unlinkedProducts = products.filter(p => !linkedProductNames.has((p.name || "").trim()));

  // Separate livestock from regular products for low-stock alerts
  const lowStockRegular = products.filter(p =>
    !LIVESTOCK_ITEM_TYPES.includes(p.item_type) &&
    p.stock_quantity != null && p.min_stock_level != null &&
    p.stock_quantity <= p.min_stock_level && p.status === "active"
  );

  const lowStockLivestock = products.filter(p =>
    LIVESTOCK_ITEM_TYPES.includes(p.item_type) &&
    p.stock_quantity != null && p.min_stock_level != null &&
    p.stock_quantity <= p.min_stock_level && p.status === "active"
  );

  const byType = useMemo(() => {
    const map = {};
    products.forEach(p => {
      const t = p.item_type || "other";
      if (!map[t]) map[t] = [];
      map[t].push(p);
    });
    return map;
  }, [products]);

  // Separate livestock from non-livestock for summary
  const allLivestock = products.filter(p => LIVESTOCK_ITEM_TYPES.includes(p.item_type));
  const nonLivestockByType = useMemo(() => {
    const map = {};
    products.filter(p => !LIVESTOCK_ITEM_TYPES.includes(p.item_type)).forEach(p => {
      const t = p.item_type || "other";
      if (!map[t]) map[t] = [];
      map[t].push(p);
    });
    return map;
  }, [products]);

  if (products.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center px-8">
        <div className="text-5xl mb-4">📦</div>
        <h3 className="text-base font-bold text-slate-700 mb-2">No products added yet</h3>
        <p className="text-sm text-slate-400 max-w-xs mb-4">Add products and link them to enterprises to see product coverage here.</p>
        <p className="text-xs text-indigo-500 font-medium">Go to Products page to get started</p>
      </div>
    );
  }

  return (
    <div className="p-6 overflow-auto h-full">
      {/* Alerts */}
      <div className="flex flex-col gap-3 mb-6">
        {lowStockLivestock.length > 0 && (
          <div className="bg-lime-50 border border-lime-200 rounded-2xl p-4">
            <p className="text-sm font-bold text-lime-700 mb-2">🐄 {lowStockLivestock.length} livestock herd{lowStockLivestock.length !== 1 ? "s" : ""} below target count</p>
            <div className="flex flex-wrap gap-2">
              {lowStockLivestock.map(p => (
                <span key={p.id} className="text-xs bg-white border border-lime-200 text-lime-700 px-2 py-1 rounded-xl">
                  {p.name} — {p.stock_quantity}/{p.min_stock_level} {getLivestockUnit(p)}
                </span>
              ))}
            </div>
          </div>
        )}
        {lowStockRegular.length > 0 && (
          <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4">
            <p className="text-sm font-bold text-rose-700 mb-2">🔴 {lowStockRegular.length} product{lowStockRegular.length !== 1 ? "s" : ""} at or below minimum stock</p>
            <div className="flex flex-wrap gap-2">
              {lowStockRegular.map(p => (
                <span key={p.id} className="text-xs bg-white border border-rose-200 text-rose-700 px-2 py-1 rounded-xl">
                  {p.name} — {p.stock_quantity}/{p.min_stock_level} {p.unit || "units"}
                </span>
              ))}
            </div>
          </div>
        )}
        {unlinkedProducts.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
            <p className="text-sm font-bold text-amber-700 mb-1">📦 {unlinkedProducts.length} product{unlinkedProducts.length !== 1 ? "s" : ""} not assigned to any enterprise</p>
            <div className="flex flex-wrap gap-2 mt-2">
              {unlinkedProducts.slice(0, 8).map(p => (
                <span key={p.id} className="text-xs bg-white border border-amber-200 text-amber-700 px-2 py-1 rounded-xl">{p.name}</span>
              ))}
              {unlinkedProducts.length > 8 && <span className="text-xs text-amber-500">+{unlinkedProducts.length - 8} more</span>}
            </div>
          </div>
        )}
      </div>

      {/* Livestock section — shown when any livestock products exist */}
      {allLivestock.length > 0 && (
        <div className="bg-white border-2 border-lime-200 rounded-2xl overflow-hidden mb-6">
          <div className="px-4 py-3 bg-lime-50 border-b border-lime-200 flex items-center justify-between">
            <h3 className="font-bold text-sm text-lime-700">
              🐄 Livestock ({allLivestock.reduce((s, p) => s + (p.stock_quantity || 0), 0)} head total)
            </h3>
            <span className="text-xs text-lime-500">{allLivestock.length} breed/batch types</span>
          </div>
          <div className="divide-y divide-lime-50">
            {allLivestock.map(animal => {
              const isBelow = animal.stock_quantity != null && animal.min_stock_level != null && animal.stock_quantity <= animal.min_stock_level;
              const pct = animal.min_stock_level > 0
                ? Math.min(animal.stock_quantity / animal.min_stock_level * 100, 100)
                : null;

              return (
                <div key={animal.id} className="px-4 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-700">{animal.name}</p>
                    <p className="text-[10px] text-slate-400">
                      {animal.item_type}
                      {animal.sku && ` · SKU: ${animal.sku}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {pct !== null && (
                      <div className="w-20 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${isBelow ? "bg-rose-400" : "bg-lime-400"}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    )}
                    <div className="text-right">
                      <p className={`text-sm font-bold ${isBelow ? "text-rose-500" : "text-lime-600"}`}>
                        {animal.stock_quantity} {getLivestockUnit(animal)}
                      </p>
                      {isBelow && (
                        <p className="text-[9px] text-rose-400">{getLowStockLabel(animal)}</p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Per-enterprise product cards */}
      {visibleEnterprises.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mb-8">
          {visibleEnterprises.map(enterprise => {
            const entProducts = getProductsForEnterprise(enterprise.enterprise_name);
            const entLowStock = entProducts.filter(p =>
              !LIVESTOCK_ITEM_TYPES.includes(p.item_type) &&
              p.stock_quantity != null && p.min_stock_level != null && p.stock_quantity <= p.min_stock_level
            );
            const entLivestock = entProducts.filter(p => LIVESTOCK_ITEM_TYPES.includes(p.item_type));
            const entRegular = entProducts.filter(p => !LIVESTOCK_ITEM_TYPES.includes(p.item_type));

            return (
              <div key={enterprise.id} className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                <div className="px-4 py-3 bg-slate-50 border-b border-slate-100">
                  <h3 className="font-bold text-slate-800 text-sm">{enterprise.enterprise_name}</h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {entProducts.length} item{entProducts.length !== 1 ? "s" : ""}
                    {entLivestock.length > 0 && <span className="text-lime-600 ml-2">· {entLivestock.reduce((s, p) => s + (p.stock_quantity || 0), 0)} livestock head</span>}
                    {entLowStock.length > 0 && <span className="text-rose-500 ml-2">· {entLowStock.length} low stock</span>}
                  </p>
                </div>

                <div className="divide-y divide-slate-100 max-h-64 overflow-y-auto">
                  {entProducts.length === 0 ? (
                    <div className="px-4 py-6 text-center">
                      <p className="text-xs text-slate-300 italic">No products assigned</p>
                    </div>
                  ) : (
                    entProducts.map(p => {
                      const isLivestock = LIVESTOCK_ITEM_TYPES.includes(p.item_type);
                      const isLow = p.stock_quantity != null && p.min_stock_level != null && p.stock_quantity <= p.min_stock_level;
                      return (
                        <div key={p.id} className={`px-4 py-2.5 flex items-center justify-between gap-2 ${isLow && !isLivestock ? "bg-rose-50/50" : isLow && isLivestock ? "bg-lime-50/50" : ""}`}>
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-sm shrink-0">{TYPE_ICON[p.item_type] || "📋"}</span>
                            <div className="min-w-0">
                              <p className="text-xs font-medium text-slate-700 truncate">{p.name}</p>
                              {p.sku && <p className="text-[9px] text-slate-400">SKU: {p.sku}</p>}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {p.stock_quantity != null && (
                              <span className={`text-xs font-bold ${isLow ? (isLivestock ? "text-lime-600" : "text-rose-500") : "text-slate-500"}`}>
                                {isLow ? "⚠️" : ""}{p.stock_quantity} {isLivestock ? getLivestockUnit(p) : (p.unit || "")}
                              </span>
                            )}
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${STATUS_COLOR[p.status] || "bg-slate-100 text-slate-500"}`}>
                              {p.status}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Non-livestock product types summary */}
      {Object.keys(nonLivestockByType).length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div className="px-4 py-3 bg-slate-50 border-b border-slate-100">
            <h3 className="text-sm font-bold text-slate-700">Inventory & Assets by Type</h3>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-0 divide-x divide-y divide-slate-100">
            {Object.entries(nonLivestockByType).sort((a, b) => b[1].length - a[1].length).map(([type, items]) => {
              const lowCount = items.filter(p => p.stock_quantity != null && p.min_stock_level != null && p.stock_quantity <= p.min_stock_level).length;
              return (
                <div key={type} className="px-4 py-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-lg">{TYPE_ICON[type] || "📋"}</span>
                    <p className="text-xs font-bold text-slate-600 capitalize">{type.replace(/_/g, " ")}</p>
                  </div>
                  <p className="text-2xl font-black text-slate-800">{items.length}</p>
                  {lowCount > 0 && <p className="text-[10px] text-rose-500 font-semibold mt-1">{lowCount} low stock</p>}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}