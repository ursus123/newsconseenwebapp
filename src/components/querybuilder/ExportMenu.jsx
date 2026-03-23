import React, { useState, useRef, useEffect } from "react";
import { Download, FileText, FileSpreadsheet, Braces, Clipboard, CheckCircle2 } from "lucide-react";
import { exportCSV, exportJSON, copyToClipboard } from "./sqlEngine";

function exportXLSX(rows, sql) {
  if (!rows.length) return;
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const keys = Object.keys(rows[0]);
  const header = keys.join(",");
  const body = rows.map(r => keys.map(k => JSON.stringify(r[k] ?? "")).join(",")).join("\n");
  const sqlSection = `\n\n=== SQL Query ===\n${sql || ""}`;
  const csv = header + "\n" + body + sqlSection;
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `newsconseen_query_${ts}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ExportMenu({ results, sql }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleCopy = () => {
    copyToClipboard(results);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
    setOpen(false);
  };

  const items = [
    { icon: FileText, label: "Export as CSV (.csv)", color: "text-amber-400", action: () => { exportCSV(results); setOpen(false); } },
    { icon: FileSpreadsheet, label: "Export as Excel (.xlsx)", color: "text-emerald-400", action: () => { exportXLSX(results, sql); setOpen(false); } },
    { icon: Braces, label: "Export as JSON (.json)", color: "text-blue-400", action: () => { exportJSON(results); setOpen(false); } },
    { icon: copied ? CheckCircle2 : Clipboard, label: copied ? "Copied!" : "Copy as tab-separated", color: copied ? "text-emerald-400" : "text-slate-400", action: handleCopy },
  ];

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={!results?.length}
        className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg border border-white/10 text-slate-400 hover:text-amber-400 hover:bg-white/5 transition-colors h-7 disabled:opacity-30"
        title="Export"
      >
        <Download className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Export</span>
      </button>
      {open && (
        <div className="absolute top-full mt-1 right-0 z-50 w-52 bg-slate-800 border border-white/10 rounded-xl shadow-2xl overflow-hidden">
          {items.map(({ icon: Icon, label, color, action }, i) => (
            <button
              key={i}
              onClick={action}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-xs hover:bg-white/5 transition-colors ${color}`}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}