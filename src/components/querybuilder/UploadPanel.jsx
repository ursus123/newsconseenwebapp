import React, { useState } from "react";
import { ncClient } from "@/api/ncClient";
import { Upload, Trash2, Table2, Loader2, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { UploadedDataStore } from "./UploadedDataStore";
import FilePreviewModal from "./FilePreviewModal";

function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) throw new Error("File must have a header row and at least one data row.");

  function parseLine(line) {
    const result = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (ch === "," && !inQuotes) {
        result.push(current.trim()); current = "";
      } else {
        current += ch;
      }
    }
    result.push(current.trim());
    return result;
  }

  const headers = parseLine(lines[0]);
  const rows = lines.slice(1).filter((l) => l.trim()).map((line) => {
    const values = parseLine(line);
    const obj = {};
    headers.forEach((h, i) => { obj[h] = values[i] ?? ""; });
    return obj;
  });
  return { headers, rows };
}

// Parse Excel binary using raw approach - extract sheets
async function parseExcel(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        // Use SheetJS via CDN dynamic import
        const XLSX = await import("https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs");
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: "array", cellDates: true });
        const sheets = workbook.SheetNames.map((name) => {
          const ws = workbook.Sheets[name];
          const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
          return { name, rows };
        });
        resolve(sheets);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error("Failed to read file."));
    reader.readAsArrayBuffer(file);
  });
}

export default function UploadPanel({ uploadedTables, onTablesChange }) {
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("");
  const [error, setError] = useState(null);
  const [previewData, setPreviewData] = useState(null);

  const readFile = async (file) => {
    setLoading(true);
    setError(null);
    try {
      const tableName = file.name
        .replace(/\.(csv|xlsx|xls)$/i, "")
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, "_");

      if (file.name.match(/\.(xlsx|xls)$/i)) {
        setLoadingMsg("Parsing Excel file…");
        const sheets = await parseExcel(file);
        if (!sheets.length || !sheets[0].rows.length) throw new Error("No data found in Excel file.");
        if (sheets.length === 1) {
          // Single sheet - pass as flat rows
          setPreviewData({ tableName, fileData: { rows: sheets[0].rows } });
        } else {
          // Multiple sheets
          setPreviewData({ tableName, fileData: { sheets } });
        }
      } else {
        setLoadingMsg("Reading CSV…");
        const text = await file.text();
        const { rows } = parseCSV(text);
        if (!rows.length) throw new Error("CSV file has no data rows.");
        setPreviewData({ tableName, fileData: { rows } });
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
      setLoadingMsg("");
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) readFile(file);
  };

  const handleFileInput = (e) => {
    const file = e.target.files[0];
    if (file) readFile(file);
    e.target.value = "";
  };

  const handleConfirmImport = ({ rows, columns, schema }) => {
    const { tableName } = previewData;
    UploadedDataStore.set(tableName, { rows, columns, schema, uploadedAt: new Date().toISOString() });
    onTablesChange(UploadedDataStore.getAll());
    setPreviewData(null);
  };

  const removeTable = (name) => {
    UploadedDataStore.remove(name);
    onTablesChange(UploadedDataStore.getAll());
  };

  const tableNames = Object.keys(uploadedTables);

  return (
    <>
      <div className="space-y-3">
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          className={`relative flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-xl p-6 transition-all
            ${dragging ? "border-indigo-400 bg-indigo-950/60" : "border-slate-600 bg-slate-800 hover:border-slate-400"}`}
        >
          <input
            type="file"
            accept=".csv,.xlsx,.xls"
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            onChange={handleFileInput}
            disabled={loading}
          />
          {loading ? (
            <Loader2 className="w-6 h-6 text-indigo-400 animate-spin" />
          ) : (
            <Upload className="w-6 h-6 text-slate-400" />
          )}
          <p className="text-xs text-slate-400 text-center pointer-events-none">
            {loading ? loadingMsg : "Drop a CSV or Excel file, or click to browse"}
          </p>
          <span className="text-[10px] text-slate-600 pointer-events-none">.csv · .xlsx · .xls</span>
        </div>

        {error && (
          <div className="flex items-start gap-2 bg-rose-950/40 border border-rose-700/40 rounded-lg px-3 py-2 text-xs text-rose-400">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            {error}
          </div>
        )}

        {tableNames.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest px-1">Loaded tables</p>
            {tableNames.map((name) => {
              const t = uploadedTables[name];
              return (
                <div key={name} className="flex items-center justify-between bg-slate-800 border border-indigo-500/20 rounded-lg px-3 py-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Table2 className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                    <span className="font-mono text-xs font-bold text-slate-300 truncate">{name}</span>
                    <Badge className="bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-[10px]">{t.rows.length} rows</Badge>
                    <Badge className="bg-slate-700 text-slate-400 text-[10px]">{t.columns?.length || 0} cols</Badge>
                  </div>
                  <button onClick={() => removeTable(name)} className="text-slate-600 hover:text-rose-400 transition-colors ml-2">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {tableNames.length === 0 && !loading && (
          <p className="text-[11px] text-slate-600 text-center py-2">No uploaded tables yet</p>
        )}
      </div>

      {previewData && (
        <FilePreviewModal
          fileData={previewData.fileData}
          onConfirm={handleConfirmImport}
          onCancel={() => setPreviewData(null)}
        />
      )}
    </>
  );
}