import React from "react";

export default function StockSummaryCards({ products, activeFilter, onFilterChange }) {
  const total = products.length;
  const zeroStock = products.filter((p) => (p.stock_quantity ?? 0) === 0).length;
  const lowStock = products.filter(
    (p) => p.min_stock_level > 0 && (p.stock_quantity ?? 0) > 0 && (p.stock_quantity ?? 0) <= p.min_stock_level
  ).length;

  const cards = [
    { key: "all",  emoji: "📦", label: "Total",      value: total,     color: "bg-slate-800 border-slate-700 text-slate-300", active: "bg-slate-700 border-slate-500 text-white" },
    { key: "low",  emoji: "⚠️", label: "Low Stock",  value: lowStock,  color: "bg-amber-950 border-amber-900 text-amber-400", active: "bg-amber-900 border-amber-500 text-amber-200" },
    { key: "zero", emoji: "🔴", label: "Zero Stock",  value: zeroStock, color: "bg-red-950 border-red-900 text-red-400",       active: "bg-red-900 border-red-500 text-red-100" },
  ];

  return (
    <div className="grid grid-cols-3 gap-2 mb-2">
      {cards.map(({ key, emoji, label, value, color, active }) => (
        <button
          key={key}
          onClick={() => onFilterChange(key === activeFilter ? "low" : key)}
          className={`rounded-xl border px-3 py-2.5 text-left transition-all ${activeFilter === key ? active : color}`}
        >
          <p className="text-lg leading-none mb-1">{emoji}</p>
          <p className="text-xl font-black leading-none">{value}</p>
          <p className="text-[10px] font-bold opacity-70 mt-0.5">{label}</p>
        </button>
      ))}
    </div>
  );
}