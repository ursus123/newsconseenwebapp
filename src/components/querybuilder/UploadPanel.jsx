import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Upload, Trash2, Table2, Loader2, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { UploadedDataStore } from "./UploadedDataStore";
import FilePreviewModal from "./FilePreviewModal.js";

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
  const [loading, setLoading] = useState(false);
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
        const { file_url } = await base44.integrations.Core.UploadFile({ file });

        const llmResult = await base44.integrations.Core.InvokeLLM({
          prompt: `Extract ALL sheets from this Excel workbook. For each sheet, return its name and all rows as an array of objects. File URL: ${file_url}`,
          file_urls: [file_url],
          response_json_schema: {
            type: "object",
            properties: {
              sheets: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    rows: { type: "array", items: { type: "object", additionalProperties: true } },
                  },
                },
              },
            },
          },
        });

        const sheets = llmResult?.sheets;
        if (!sheets || !sheets.length) throw new Error("Could not parse any sheets from the file.");

        const validSheets = sheets.filter((s) => s.rows && s.rows.length > 0);
        if (!validSheets.length) throw new Error("No data found in the file.");

        setPreviewData({ tableName, fileData: { sheets: validSheets } });
      } else {
        const text = await file.text();
        const { rows } = parseCSV(text);
        setPreviewData({ tableName, fileData: { rows } });
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
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

  const handleConfirmImport = ({ rows, columns }) => {
    const { tableName } = previewData;
    UploadedDataStore.set(tableName, { rows, columns, uploadedAt: new Date().toISOString() });
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
        <label
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-xl p-5 cursor-pointer transition-all
            ${dragging ? "border-indigo-400 bg-indigo-50" : "border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-slate-100"}`}
        >
          <input type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleFileInput} />
          {loading ? (
            <Loader2 className="w-6 h-6 text-indigo-400 animate-spin" />
          ) : (
            <Upload className="w-6 h-6 text-slate-400" />
          )}
          <p className="text-xs text-slate-500 text-center">
            {loading ? "Reading file…" : "Drop a CSV or Excel file here, or click to browse"}
          </p>
          <span className="text-[10px] text-slate-400">.csv, .xlsx, .xls supported</span>
        </label>

        {error && (
          <div className="flex items-center gap-2 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 text-xs text-rose-700">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            {error}
          </div>
        )}

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
                  <button onClick={() => removeTable(name)} className="text-slate-300 hover:text-rose-500 transition-colors ml-2">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {tableNames.length === 0 && !loading && (
          <p className="text-[11px] text-slate-400 text-center">No uploaded tables yet</p>
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