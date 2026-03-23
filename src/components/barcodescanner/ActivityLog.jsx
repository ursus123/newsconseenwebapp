import React, { useState, useEffect } from "react";
import { format } from "date-fns";
import { Download } from "lucide-react";
function UndoTimer({ entry, onUndo }) {
  const [remaining, setRemaining] = useState(30);

  useEffect(() => {
    if (!entry.undoTimeout) return;
    const interval = setInterval(() => {
      const left = Math.max(0, Math.round((entry.undoTimeout - Date.now()) / 1000));
      setRemaining(left);
      if (left === 0) clearInterval(interval);
    }, 500);
    return () => clearInterval(interval);
  }, [entry.undoTimeout]);

  if (!entry.undoTimeout || remaining === 0) return null;

  return (
    <button onClick={() => onUndo(entry)}
      className="text-[10px] font-bold text-amber-400 hover:text-amber-300 border border-amber-700 rounded-lg px-2 py-1 transition-colors whitespace-nowrap">
      ↩ Undo {remaining}s
    </button>
  );
}

export default function ActivityLog({ log, onUndo }) {
  const sessionStart = log.length > 0 ? log[log.length - 1].time : null;

  const totalIn = log.filter((e) => e.dir === "in").reduce((s, e) => s + e.qty, 0);
  const totalOut = log.filter((e) => e.dir === "out").reduce((s, e) => s + e.qty, 0);
  const checks = log.filter((e) => e.dir === "check").length;
  const uniqueProducts = new Set(log.map((e) => e.product?.id)).size;

  const dirIcon = { in: "↑", out: "↓", check: "🔍" };
  const dirColor = { in: "text-emerald-400", out: "text-rose-400", check: "text-blue-400" };

  const exportXlsx = () => {
    const rows = log.map((e) => ({
      Time: format(e.time, "HH:mm:ss"),
      Date: format(e.time, "yyyy-MM-dd"),
      Product: e.product?.name,
      SKU: e.product?.sku || "—",
      Direction: e.dir === "in" ? "Stock IN" : e.dir === "out" ? "Stock OUT" : "Check",
      Quantity: e.dir === "check" ? 0 : e.qty,
      "Stock Before": e.oldQty,
      "Stock After": e.newQty,
      "Unit Price": e.product?.unit_price || 0,
      "Total Value": (e.qty || 0) * (e.product?.unit_price || 0),
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Session Log");
    XLSX.writeFile(wb, `scan_session_${format(new Date(), "yyyy-MM-dd_HHmm")}.xlsx`);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between shrink-0">
        <div>
          <p className="text-white font-black text-sm">Session Activity</p>
          <p className="text-slate-500 text-xs">
            {log.length} scans{sessionStart ? ` · started ${format(sessionStart, "HH:mm")}` : ""}
          </p>
        </div>
        {log.length > 0 && (
          <button onClick={exportXlsx} className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded-xl text-xs font-bold text-slate-300 hover:bg-slate-700 transition-colors">
            <Download className="w-3.5 h-3.5" /> Export
          </button>
        )}
      </div>

      {/* Log entries */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-800">
        {log.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-slate-600">
            <p className="text-3xl mb-2">📋</p>
            <p className="text-sm font-bold">No scans yet</p>
            <p className="text-xs mt-1">Scan a barcode to get started</p>
          </div>
        ) : (
          log.map((entry) => (
            <div key={entry.id} className="px-4 py-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`text-lg font-black shrink-0 ${dirColor[entry.dir]}`}>{dirIcon[entry.dir]}</span>
                  <div className="min-w-0">
                    <p className="text-white text-sm font-bold truncate">{entry.product?.name}</p>
                    <p className="text-slate-500 text-[10px]">
                      {format(entry.time, "h:mm a")} · {entry.product?.sku || "—"}
                    </p>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  {entry.dir !== "check" && (
                    <span className={`text-sm font-black ${entry.dir === "in" ? "text-emerald-400" : "text-rose-400"}`}>
                      {entry.dir === "in" ? "+" : "-"}{entry.qty}
                    </span>
                  )}
                  <UndoTimer entry={entry} onUndo={onUndo} />
                </div>
              </div>
              {entry.dir !== "check" && (
                <p className="text-slate-600 text-[10px] mt-1 ml-7">
                  {entry.oldQty} → {entry.newQty} units
                </p>
              )}
            </div>
          ))
        )}
      </div>

      {/* Session summary */}
      {log.length > 0 && (
        <div className="shrink-0 border-t border-slate-800 bg-slate-950 px-4 py-3">
          <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest mb-2">Today's Summary</p>
          <div className="grid grid-cols-2 gap-1.5 text-xs">
            <div className="bg-emerald-950 rounded-lg px-2 py-1.5">
              <p className="text-emerald-400 font-black">📥 IN</p>
              <p className="text-white font-black">{totalIn} units</p>
            </div>
            <div className="bg-rose-950 rounded-lg px-2 py-1.5">
              <p className="text-rose-400 font-black">📤 OUT</p>
              <p className="text-white font-black">{totalOut} units</p>
            </div>
            <div className="bg-blue-950 rounded-lg px-2 py-1.5">
              <p className="text-blue-400 font-black">🔍 Checks</p>
              <p className="text-white font-black">{checks}</p>
            </div>
            <div className="bg-slate-800 rounded-lg px-2 py-1.5">
              <p className="text-slate-400 font-black">📦 Products</p>
              <p className="text-white font-black">{uniqueProducts}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}