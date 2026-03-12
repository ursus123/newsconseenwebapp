import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Upload, Trash2, Table2, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { UploadedDataStore } from "./UploadedDataStore";

function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) throw new Error("File must have a header row and at least one data row.");
  const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
  const rows = lines.slice(1).map((line) => {
    const values = line.split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
    const obj = {};
    headers.forEach((h, i) => { obj[h] = values[i] ?? ""; });
    return obj;
  });
  return { headers, rows };
}

export default function UploadPanel({ uploadedTables, onTablesChange }) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);

  const processFile = async (file) => {
    setUploading(true);
    setError(null);
    try {
      const tableName = file.name
        .replace(/\.(csv|xlsx|xls)$/i, "")
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, "_");

      let headers, rows;

      if (file.name.match(/\.(xlsx|xls)$/i)) {
        // Upload to base44 and use ExtractDataFromUploadedFile
        const { file_url } = await base44.integrations.Core.UploadFile({ file });
        // Extract headers from first read — we'll use a generic schema
        const result = await base44.integrations.Core.ExtractDataFromUploadedFile({
          file_url,
          json_schema: {
            type: "object",
            properties: {
              rows: {
                type: "array",
                items: { type: "object", additionalProperties: true },
              },
            },
          },
        });
        if (result.status !== "success") throw new Error(result.details || "Failed to parse file.");
        const extracted = Array.isArray(result.output) ? result.output : result.output?.rows || [];
        if (!extracted.length) throw new Error("No data found in file.");
        headers = Object.keys(extracted[0]);
        rows = extracted;
      } else {
        // CSV — parse locally
        const text = await file.text();
        ({ headers, rows } = parseCSV(text));
      }

      UploadedDataStore.set(tableName, {
        rows,
        columns: headers,
        uploadedAt: new Date().toISOString(),
        fileName: file.name,
      });
      onTablesChange(UploadedDataStore.getAll());
    } catch (e) {
      setError(e.message);
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  };

  const handleFileInput = (e) => {
    const file = e.target.files[0];
    if (file) processFile(file);
    e.target.value = "";
  };

  const removeTable = (name) => {
    UploadedDataStore.remove(name);
    onTablesChange(UploadedDataStore.getAll());
  };

  const tableNames = Object.keys(uploadedTables);

  return (
    <div className="space-y-3">
      {/* Drop zone */}
      <label
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-xl p-5 cursor-pointer transition-all
          ${dragging ? "border-indigo-400 bg-indigo-50" : "border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-slate-100"}`}
      >
        <input type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleFileInput} />
        {uploading ? (
          <Loader2 className="w-6 h-6 text-indigo-400 animate-spin" />
        ) : (
          <Upload className="w-6 h-6 text-slate-400" />
        )}
        <p className="text-xs text-slate-500 text-center">
          {uploading ? "Parsing file…" : "Drop a CSV or Excel file here, or click to browse"}
        </p>
        <span className="text-[10px] text-slate-400">.csv, .xlsx, .xls supported</span>
      </label>

      {error && (
        <div className="flex items-center gap-2 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 text-xs text-rose-700">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          {error}
        </div>
      )}

      {/* Uploaded tables list */}
      {tableNames.length > 0 && (
        <div className="space-y-2">
          {tableNames.map((name) => {
            const t = uploadedTables[name];
            return (
              <div key={name} className="flex items-center justify-between bg-white border border-indigo-100 rounded-lg px-3 py-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Table2 className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                  <span className="font-mono text-xs font-bold text-slate-700 truncate">{name}</span>
                  <Badge className="bg-indigo-50 text-indigo-600 text-[10px]">{t.rows.length} rows</Badge>
                </div>
                <button
                  onClick={() => removeTable(name)}
                  className="text-slate-300 hover:text-rose-500 transition-colors ml-2"
                  title="Remove table"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {tableNames.length === 0 && !uploading && (
        <p className="text-[11px] text-slate-400 text-center">No uploaded tables yet</p>
      )}
    </div>
  );
}