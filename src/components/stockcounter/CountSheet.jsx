import React, { useMemo, useState } from "react";
import { Search, ChevronDown, ChevronUp, Package } from "lucide-react";
import CountRow from "./CountRow";

function playBeep(type = "success") {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    if (type === "warning") {
      osc.frequency.value = 440;
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.3);
    } else {
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.15);
    }
  } catch (_) {}
}

export default function CountSheet({
  session, products, onUpdateCount,
  searchQuery, setSearchQuery,
  categoryFilter, setCategoryFilter,
  onNewSession,
}) {
  const [uncountedOpen, setUncountedOpen] = useState(true);

  if (!session) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="text-6xl mb-4">🔢</div>
        <h2 className="text-xl font-semibold text-slate-700 mb-2">No Active Count Session</h2>
        <p className="text-slate-500 mb-6">Start a new count session to begin counting inventory.</p>
        <button
          onClick={onNewSession}
          className="px-6 py-3 bg-emerald-600 text-white rounded-xl font-semibold hover:bg-emerald-700 transition-colors"
        >
          + Start New Count
        </button>
      </div>
    );
  }

  const allEntries = Object.entries(session.counts);
  const totalItems = allEntries.length;
  const countedItems = allEntries.filter(([, c]) => c.counted).length;
  const progress = totalItems > 0 ? (countedItems / totalItems) * 100 : 0;

  // Build category list from products in session
  const sessionProductIds = new Set(Object.keys(session.counts));
  const sessionProducts = products.filter(p => sessionProductIds.has(p.id));
  const categories = ["All", ...new Set(sessionProducts.map(p => p.category || "other").filter(Boolean))];

  // Filter entries
  const filtered = allEntries.filter(([productId, count]) => {
    const product = products.find(p => p.id === productId);
    if (!product) return false;
    const matchSearch = !searchQuery ||
      product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (product.sku || "").toLowerCase().includes(searchQuery.toLowerCase());
    const matchCategory = categoryFilter === "All" || (product.category || "other") === categoryFilter;
    return matchSearch && matchCategory;
  });

  const counted = filtered.filter(([, c]) => c.counted);
  const uncounted = filtered.filter(([, c]) => !c.counted);

  const handleCountChange = (productId, physical_count, notes, markCounted) => {
    const isCounting = markCounted || physical_count !== null;
    onUpdateCount(productId, physical_count, notes, isCounting);
    if (isCounting && !session.counts[productId].counted) {
      const systemCount = session.counts[productId].system_count;
      const isLargeGap = physical_count !== null && systemCount > 0 &&
        Math.abs(physical_count - systemCount) / systemCount > 0.2;
      playBeep(isLargeGap ? "warning" : "success");
    }
  };

  return (
    <div>
      {/* Progress bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold text-slate-700">{countedItems} of {totalItems} items counted</span>
          <span className="text-sm font-bold text-emerald-600">{Math.round(progress)}%</span>
        </div>
        <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-emerald-500 rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="mt-2 flex gap-4 text-xs text-slate-500">
          <span>📍 {session.enterprise || "All"}</span>
          {session.location && <span>📦 {session.location}</span>}
          <span>👤 {session.counted_by}</span>
        </div>
      </div>

      {/* Search + category filter */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search items..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={`px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                categoryFilter === cat
                  ? "bg-orange-100 text-orange-700 border border-orange-300"
                  : "bg-white text-slate-500 border border-slate-200 hover:bg-slate-50"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Counted items */}
      {counted.length > 0 && (
        <div className="mb-4 space-y-2">
          {counted.map(([productId, count]) => {
            const product = products.find(p => p.id === productId);
            if (!product) return null;
            return (
              <CountRow
                key={productId}
                productId={productId}
                product={product}
                count={count}
                onChange={handleCountChange}
              />
            );
          })}
        </div>
      )}

      {/* Uncounted items */}
      {uncounted.length > 0 && (
        <div>
          <button
            onClick={() => setUncountedOpen(o => !o)}
            className="w-full flex items-center justify-between px-4 py-3 bg-slate-100 rounded-xl text-sm font-semibold text-slate-600 mb-2"
          >
            <span>⏳ {uncounted.length} items remaining</span>
            {uncountedOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {uncountedOpen && (
            <div className="space-y-2">
              {uncounted.map(([productId, count]) => {
                const product = products.find(p => p.id === productId);
                if (!product) return null;
                return (
                  <CountRow
                    key={productId}
                    productId={productId}
                    product={product}
                    count={count}
                    onChange={handleCountChange}
                  />
                );
              })}
            </div>
          )}
        </div>
      )}

      {filtered.length === 0 && (
        <div className="text-center py-12 text-slate-400">
          <Package className="w-10 h-10 mx-auto mb-2 opacity-40" />
          <p>No items match your filters.</p>
        </div>
      )}
    </div>
  );
}