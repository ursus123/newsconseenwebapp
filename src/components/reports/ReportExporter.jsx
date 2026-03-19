import React, { useState } from "react";
import { Download, X, Loader2, Check } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import * as XLSX from "xlsx";

const API_BASE = "https://newsconseenwebapp-production.up.railway.app";

const ENDPOINTS = {
  "Enterprise Summary": "/enterprise-summary",
  "Task Summary": "/task-summary",
  "Transaction Summary": "/transaction-summary",
  "People Summary": "/people-summary",
  "Service Summary": "/service-summary",
  "Product Summary": "/product-summary",
};

async function exportToExcel(selectedReports) {
  const wb = XLSX.utils.book_new();
  for (const [name, endpoint] of Object.entries(ENDPOINTS)) {
    if (!selectedReports.includes(name)) continue;
    try {
      const res = await fetch(`${API_BASE}${endpoint}`);
      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) continue;
      const ws = XLSX.utils.json_to_sheet(data);
      XLSX.utils.book_append_sheet(wb, ws, name.substring(0, 31));
    } catch (e) {
      console.error(`Failed to fetch ${name}:`, e);
    }
  }
  const metaWs = XLSX.utils.aoa_to_sheet([
    ["Report", "Generated At", "API Source"],
    ["Newsconseen Analytics Export", format(new Date(), "PPpp"), API_BASE],
  ]);
  XLSX.utils.book_append_sheet(wb, metaWs, "Info");
  XLSX.writeFile(wb, `newsconseen_report_${format(new Date(), "yyyy-MM-dd")}.xlsx`);
}

async function exportToCSV(reportName, endpoint) {
  const res = await fetch(`${API_BASE}${endpoint}`);
  const data = await res.json();
  if (!Array.isArray(data) || data.length === 0) return;
  const headers = Object.keys(data[0]).join(",");
  const rows = data.map((row) =>
    Object.values(row).map((v) => (typeof v === "string" ? `"${v}"` : v)).join(",")
  );
  const blob = new Blob([[headers, ...rows].join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `newsconseen_${reportName.toLowerCase().replace(/ /g, "_")}_${format(new Date(), "yyyy-MM-dd")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

async function exportToJSON(selectedReports) {
  const result = {};
  for (const [name, endpoint] of Object.entries(ENDPOINTS)) {
    if (!selectedReports.includes(name)) continue;
    try {
      const res = await fetch(`${API_BASE}${endpoint}`);
      result[name] = await res.json();
    } catch (e) {
      result[name] = { error: e.message };
    }
  }
  result._metadata = { exported_at: new Date().toISOString(), source: API_BASE };
  const blob = new Blob([JSON.stringify(result, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `newsconseen_export_${format(new Date(), "yyyy-MM-dd")}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ReportExporter() {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(Object.keys(ENDPOINTS));
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(null);

  const toggle = (name) =>
    setSelected((prev) => prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]);

  const handleExport = async (type) => {
    setLoading(true);
    setDone(null);
    try {
      if (type === "excel") await exportToExcel(selected);
      if (type === "json") await exportToJSON(selected);
      if (type === "csv" && selected[0]) await exportToCSV(selected[0], ENDPOINTS[selected[0]]);
      setDone(type);
      setTimeout(() => setDone(null), 3000);
    } catch (e) {
      console.error("Export failed:", e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)} className="gap-2">
        <Download className="w-4 h-4" />
        Export Report
      </Button>

      {open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md rounded-2xl shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div>
                <h2 className="text-base font-bold text-slate-800">Export Analytics Report</h2>
                <p className="text-xs text-slate-400 mt-0.5">Choose sections and format</p>
              </div>
              <button onClick={() => setOpen(false)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <CardContent className="p-6 space-y-5">
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Include Sections</p>
                <div className="space-y-2">
                  {Object.keys(ENDPOINTS).map((name) => (
                    <label key={name} className="flex items-center gap-3 cursor-pointer group">
                      <input type="checkbox" checked={selected.includes(name)} onChange={() => toggle(name)} className="w-4 h-4 rounded accent-emerald-500" />
                      <span className="text-sm text-slate-700 group-hover:text-slate-900">{name}</span>
                    </label>
                  ))}
                </div>
                <div className="flex gap-2 mt-2">
                  <button onClick={() => setSelected(Object.keys(ENDPOINTS))} className="text-xs text-emerald-600 hover:underline">Select all</button>
                  <span className="text-slate-300">·</span>
                  <button onClick={() => setSelected([])} className="text-xs text-slate-400 hover:underline">Clear</button>
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Export Format</p>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { type: "excel", label: "Excel", icon: "📊", desc: ".xlsx" },
                    { type: "csv",   label: "CSV",   icon: "📄", desc: ".csv" },
                    { type: "json",  label: "JSON",  icon: "{ }", desc: ".json" },
                  ].map(({ type, label, icon, desc }) => (
                    <button
                      key={type}
                      onClick={() => handleExport(type)}
                      disabled={loading || selected.length === 0}
                      className="flex flex-col items-center gap-1 px-3 py-3 rounded-xl border border-slate-200 hover:border-emerald-300 hover:bg-emerald-50 transition-all disabled:opacity-40"
                    >
                      {loading ? <Loader2 className="w-4 h-4 animate-spin text-emerald-500" /> : done === type ? <Check className="w-4 h-4 text-emerald-500" /> : <span className="text-lg">{icon}</span>}
                      <span className="text-xs font-semibold text-slate-700">{label}</span>
                      <span className="text-[10px] text-slate-400">{desc}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="bg-slate-50 rounded-xl px-4 py-3">
                <p className="text-xs text-slate-500">
                  Data fetched live from your Railway API. <span className="font-medium text-slate-700">{selected.length} section{selected.length !== 1 ? "s" : ""} selected.</span>
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}