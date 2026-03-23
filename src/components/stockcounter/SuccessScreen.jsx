import React from "react";
import { formatDistanceStrict } from "date-fns";

import { Button } from "@/components/ui/button";

function exportCountReport(result) {
  const session = result.session;
  const counts = Object.entries(session.counts);
  const now = new Date();

  const toCSV = (rows) => {
    if (!rows.length) return "";
    const keys = Object.keys(rows[0]);
    return [keys.join(","), ...rows.map(r => keys.map(k => JSON.stringify(r[k] ?? "")).join(","))].join("\n");
  };

  const rows = counts.map(([, count]) => {
    const diff = (count.physical_count ?? count.system_count) - count.system_count;
    const diffPct = count.system_count > 0 ? ((diff / count.system_count) * 100).toFixed(1) + "%" : "N/A";
    const valueDiff = (diff * (count.cost_price || 0)).toFixed(2);
    let status = "Not counted";
    if (count.physical_count !== null) {
      if (diff === 0) status = "Match";
      else if (diff > 0) status = "Surplus";
      else if (count.system_count > 0 && Math.abs(diff / count.system_count) <= 0.1) status = "Close";
      else status = "Gap";
    }
    return {
      "Item Name": count.product_name, "SKU": count.sku || "", "Category": count.category || "",
      "Unit": count.unit || "", "System Count": count.system_count,
      "Physical Count": count.physical_count ?? "Not counted",
      "Difference": count.physical_count !== null ? diff : "",
      "Difference %": count.physical_count !== null ? diffPct : "",
      "Value Difference": count.physical_count !== null ? valueDiff : "",
      "Notes": count.notes || "", "Status": status,
    };
  });

  const info = [{ "Enterprise": session.enterprise || "", "Location": session.location || "",
    "Counted By": session.counted_by || "", "Started": session.started_at ? new Date(session.started_at).toLocaleString() : "",
    "Completed": now.toLocaleString(), "Total Items": counts.length,
    "Items Updated": result.updated, "Items Skipped": result.skipped, "Errors": result.errors }];

  const csv = `=== Count Results ===\n${toCSV(rows)}\n\n=== Session Info ===\n${toCSV(info)}`;
  const date = now.toISOString().split("T")[0];
  const name = (session.enterprise || "count").replace(/\s+/g, "_");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `stock_count_${name}_${date}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function SuccessScreen({ result, onNewCount, onViewProducts }) {
  const { updated, skipped, errors, session } = result;
  const startedAt = session?.started_at ? new Date(session.started_at) : null;
  const completedAt = new Date();
  const duration = startedAt ? formatDistanceStrict(startedAt, completedAt) : null;

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-3xl border border-slate-200 p-8 max-w-md w-full text-center shadow-lg">
        <div className="text-6xl mb-4">🎉</div>
        <h1 className="text-2xl font-bold text-slate-800 mb-2">Stock Count Complete!</h1>
        <p className="text-slate-500 text-sm mb-6">All changes have been saved to the system.</p>

        <div className="bg-slate-50 rounded-2xl p-5 space-y-3 text-sm text-left mb-6">
          <div className="flex items-center gap-3">
            <span className="text-xl">✅</span>
            <span className="text-slate-700"><strong>{updated}</strong> items updated</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xl">⏭️</span>
            <span className="text-slate-700"><strong>{skipped}</strong> items unchanged / skipped</span>
          </div>
          {errors > 0 && (
            <div className="flex items-center gap-3">
              <span className="text-xl">⚠️</span>
              <span className="text-rose-600"><strong>{errors}</strong> errors</span>
            </div>
          )}
          {duration && (
            <div className="flex items-center gap-3">
              <span className="text-xl">⏱️</span>
              <span className="text-slate-700">Duration: <strong>{duration}</strong></span>
            </div>
          )}
          {session?.enterprise && (
            <div className="flex items-center gap-3">
              <span className="text-xl">🏢</span>
              <span className="text-slate-700">{session.enterprise}{session.location ? ` — ${session.location}` : ""}</span>
            </div>
          )}
          {session?.counted_by && (
            <div className="flex items-center gap-3">
              <span className="text-xl">👤</span>
              <span className="text-slate-700">Counted by <strong>{session.counted_by}</strong></span>
            </div>
          )}
        </div>

        <div className="space-y-3">
          <Button
            variant="outline"
            className="w-full rounded-xl"
            onClick={() => exportCountReport(result)}
          >
            📥 Download Count Report
          </Button>
          <Button
            variant="outline"
            className="w-full rounded-xl"
            onClick={onViewProducts}
          >
            📦 View Products
          </Button>
          <Button
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold"
            onClick={onNewCount}
          >
            🔢 Start New Count
          </Button>
        </div>
      </div>
    </div>
  );
}