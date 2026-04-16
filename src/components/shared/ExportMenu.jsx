// ==============================================================
// ExportMenu — BI format download dropdown
// Drops onto any chart or report section.
//
// Props:
//   report     string  — report ID: people|transactions|products|tasks|enterprises|scores
//   companyId  string  — operator company_id
//   label      string  — optional button label (default "Export")
//   size       string  — "sm" | "md" (default "sm")
//   className  string  — extra Tailwind classes on the wrapper
//
// Usage:
//   <ExportMenu report="transactions" companyId={companyId} />
//   <ExportMenu report="people"       companyId={companyId} label="Download" />
// ==============================================================

import { useState, useRef, useEffect } from "react";
import { Download, FileSpreadsheet, BarChart2, FileText, Loader2, ChevronDown, CheckCircle } from "lucide-react";

const RAILWAY_URL = "https://newsconseenwebapp-production.up.railway.app";

const FORMATS = [
  {
    id:    "excel",
    label: "Power BI (.xlsx)",
    sub:   "Open in Power BI Desktop or Excel",
    icon:  FileSpreadsheet,
    color: "text-emerald-600",
    ext:   "xlsx",
  },
  {
    id:    "tableau",
    label: "Tableau (.twbx)",
    sub:   "Open in Tableau Desktop or Public",
    icon:  BarChart2,
    color: "text-blue-600",
    ext:   "twbx",
  },
  {
    id:    "csv",
    label: "CSV / Looker Studio",
    sub:   "Google Sheets, Looker Studio, any tool",
    icon:  FileText,
    color: "text-purple-600",
    ext:   "csv",
  },
];

export default function ExportMenu({ report, companyId, label = "Export", size = "sm", className = "" }) {
  const [open,         setOpen]         = useState(false);
  const [downloading,  setDownloading]  = useState(null);  // format id being downloaded
  const [lastSuccess,  setLastSuccess]  = useState(null);  // format id last succeeded
  const [error,        setError]        = useState(null);
  const ref = useRef(null);

  // Close on outside click
  useEffect(() => {
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  async function handleDownload(fmt) {
    if (downloading) return;
    setDownloading(fmt.id);
    setError(null);
    setOpen(false);

    try {
      const url = `${RAILWAY_URL}/bi/export?report=${encodeURIComponent(report)}&format=${fmt.id}&company_id=${encodeURIComponent(companyId)}`;
      const res = await fetch(url);

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `Export failed (${res.status})`);
      }

      // Trigger browser file download
      const blob     = await res.blob();
      const blobUrl  = URL.createObjectURL(blob);
      const a        = document.createElement("a");
      const today    = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      a.href         = blobUrl;
      a.download     = `newsconseen_${report}_${today}.${fmt.ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);

      setLastSuccess(fmt.id);
      setTimeout(() => setLastSuccess(null), 3000);
    } catch (err) {
      setError(err.message || "Export failed");
      setTimeout(() => setError(null), 4000);
    } finally {
      setDownloading(null);
    }
  }

  const btnSize = size === "sm"
    ? "text-xs px-2.5 py-1.5 gap-1.5"
    : "text-sm px-3 py-2 gap-2";

  const isLoading = !!downloading;

  return (
    <div ref={ref} className={`relative inline-block ${className}`}>
      {/* Trigger button */}
      <button
        onClick={() => !isLoading && setOpen(o => !o)}
        disabled={isLoading}
        className={`
          inline-flex items-center ${btnSize} font-medium rounded-lg border
          transition-all duration-150 select-none
          ${isLoading
            ? "bg-slate-50 border-slate-200 text-slate-400 cursor-wait"
            : "bg-white border-slate-200 text-slate-600 hover:border-blue-300 hover:text-blue-700 hover:bg-blue-50 active:scale-95"
          }
        `}
        title="Download this report"
      >
        {isLoading
          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
          : <Download className="w-3.5 h-3.5" />
        }
        <span>{isLoading ? "Downloading…" : label}</span>
        {!isLoading && <ChevronDown className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`} />}
      </button>

      {/* Error toast */}
      {error && (
        <div className="absolute top-full right-0 mt-1 z-50 bg-rose-50 border border-rose-200 text-rose-700 text-xs px-3 py-2 rounded-lg shadow-sm whitespace-nowrap max-w-xs">
          {error}
        </div>
      )}

      {/* Dropdown */}
      {open && !isLoading && (
        <div className="absolute top-full right-0 mt-1.5 z-50 bg-white border border-slate-200 rounded-xl shadow-xl shadow-slate-200/60 py-1.5 min-w-[220px]">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-3 pt-1 pb-1.5">
            Download as
          </p>
          {FORMATS.map(fmt => {
            const Icon       = fmt.icon;
            const isThisOne  = downloading === fmt.id;
            const wasSuccess = lastSuccess === fmt.id;

            return (
              <button
                key={fmt.id}
                onClick={() => handleDownload(fmt)}
                disabled={!!downloading}
                className="w-full flex items-start gap-3 px-3 py-2.5 text-left hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-wait"
              >
                <div className={`mt-0.5 shrink-0 ${fmt.color}`}>
                  {wasSuccess
                    ? <CheckCircle className="w-4 h-4 text-emerald-500" />
                    : isThisOne
                    ? <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                    : <Icon className="w-4 h-4" />
                  }
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-700 leading-none">{fmt.label}</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">{fmt.sub}</p>
                </div>
              </button>
            );
          })}

          <div className="border-t border-slate-100 mt-1 pt-1 px-3 pb-1">
            <p className="text-[10px] text-slate-300 leading-snug">
              Data scoped to your organisation only.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
