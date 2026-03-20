import React from "react";
import { format } from "date-fns";
import { exportCountReport } from "./exportUtils";

export default function CountSummary({ session, products, currentUser, onSubmit }) {
  if (!session) {
    return (
      <div className="text-center py-20 text-slate-400">
        <p>No active count session. Start a new count first.</p>
      </div>
    );
  }

  const entries = Object.entries(session.counts);
  const totalItems = entries.length;
  const countedEntries = entries.filter(([, c]) => c.counted && c.physical_count !== null);
  const countedItems = countedEntries.length;

  let matches = 0, close = 0, gap = 0, surplus = 0;
  const discrepancies = [];

  let systemValue = 0;
  let countedValue = 0;

  for (const [productId, count] of entries) {
    const product = products.find(p => p.id === productId);
    const price = product?.cost_price || 0;
    systemValue += count.system_count * price;

    if (!count.counted || count.physical_count === null) continue;

    countedValue += count.physical_count * price;
    const diff = count.physical_count - count.system_count;
    const pct = count.system_count > 0 ? Math.abs(diff / count.system_count * 100) : 100;

    if (diff === 0) matches++;
    else if (diff > 0) { surplus++; discrepancies.push({ productId, count, diff, pct, product }); }
    else if (pct <= 10) { close++; discrepancies.push({ productId, count, diff, pct, product }); }
    else { gap++; discrepancies.push({ productId, count, diff, pct, product }); }
  }

  const valueDiff = countedValue - systemValue;
  const startedAt = session.started_at ? new Date(session.started_at) : null;

  const handleSaveDraft = () => {
    const draftKey = `stock_count_draft_${currentUser?.email}`;
    localStorage.setItem(draftKey, JSON.stringify(session));
    alert("Draft saved! You can resume this count session later.");
  };

  return (
    <div className="space-y-4">
      {/* Session card */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <h3 className="font-bold text-slate-800 mb-3">Count Session Summary</h3>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div><span className="text-slate-500">Enterprise:</span> <span className="font-medium">{session.enterprise || "—"}</span></div>
          <div><span className="text-slate-500">Location:</span> <span className="font-medium">{session.location || "—"}</span></div>
          <div><span className="text-slate-500">Counted by:</span> <span className="font-medium">{session.counted_by || "—"}</span></div>
          <div><span className="text-slate-500">Started:</span> <span className="font-medium">{startedAt ? format(startedAt, "MMM d 'at' h:mm a") : "—"}</span></div>
          <div className="col-span-2"><span className="text-slate-500">Progress:</span> <span className="font-medium">{countedItems} of {totalItems} items counted</span></div>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Match", value: matches, icon: "✅", color: "bg-emerald-50 border-emerald-200 text-emerald-700" },
          { label: "Close", value: close,   icon: "⚠️", color: "bg-amber-50 border-amber-200 text-amber-700" },
          { label: "Gap",   value: gap,     icon: "🔴", color: "bg-rose-50 border-rose-200 text-rose-700" },
          { label: "Surplus",value: surplus, icon: "📈", color: "bg-blue-50 border-blue-200 text-blue-700" },
        ].map(stat => (
          <div key={stat.label} className={`rounded-2xl border p-4 text-center ${stat.color}`}>
            <div className="text-2xl mb-1">{stat.icon}</div>
            <div className="text-2xl font-bold">{stat.value}</div>
            <div className="text-xs font-semibold">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Discrepancies table */}
      {discrepancies.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 font-semibold text-slate-700 text-sm">Discrepancies</div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-slate-500">Item</th>
                  <th className="px-4 py-2 text-right text-xs font-semibold text-slate-500">System</th>
                  <th className="px-4 py-2 text-right text-xs font-semibold text-slate-500">Counted</th>
                  <th className="px-4 py-2 text-right text-xs font-semibold text-slate-500">Diff</th>
                  <th className="px-4 py-2 text-right text-xs font-semibold text-slate-500">%</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {discrepancies.map(({ productId, count, diff, pct, product }) => (
                  <tr key={productId} className={diff > 0 ? "bg-blue-50/40" : pct <= 10 ? "bg-amber-50/40" : "bg-rose-50/40"}>
                    <td className="px-4 py-2.5 font-medium text-slate-800">{count.product_name}</td>
                    <td className="px-4 py-2.5 text-right text-slate-600">{count.system_count}</td>
                    <td className="px-4 py-2.5 text-right text-slate-600">{count.physical_count}</td>
                    <td className={`px-4 py-2.5 text-right font-bold ${diff > 0 ? "text-blue-600" : "text-rose-600"}`}>
                      {diff > 0 ? "+" : ""}{diff}
                    </td>
                    <td className="px-4 py-2.5 text-right text-slate-500">{pct.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Value summary */}
      {(systemValue > 0 || countedValue > 0) && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <h4 className="font-semibold text-slate-700 mb-3 text-sm">Inventory Value</h4>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-slate-500">System value</span><span className="font-medium">${systemValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Counted value</span><span className="font-medium">${countedValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
            <div className="flex justify-between border-t pt-2 border-slate-100">
              <span className="font-semibold text-slate-700">Difference</span>
              <span className={`font-bold ${valueDiff >= 0 ? "text-blue-600" : "text-rose-600"}`}>
                {valueDiff >= 0 ? "+" : ""}${valueDiff.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3 flex-wrap">
        <button
          onClick={handleSaveDraft}
          className="flex-1 sm:flex-none px-5 py-3 border border-slate-300 text-slate-700 rounded-xl font-semibold hover:bg-slate-50 transition-colors"
        >
          💾 Save Draft
        </button>
        <button
          onClick={() => exportCountReport(session, products)}
          className="flex-1 sm:flex-none px-5 py-3 border border-slate-300 text-slate-700 rounded-xl font-semibold hover:bg-slate-50 transition-colors"
        >
          📥 Export Excel
        </button>
        <button
          onClick={onSubmit}
          className="flex-1 sm:flex-none px-8 py-3 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition-colors"
        >
          ✅ Submit Count
        </button>
      </div>
    </div>
  );
}