import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import {
  Upload, Download, Database, Loader2, AlertCircle, CheckCircle2,
  FileText, Table2, X, ArrowRight, Eye, EyeOff, ChevronRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { UploadedDataStore } from "@/components/querybuilder/UploadedDataStore";

function inferType(values) {
  const nonEmpty = values.filter((v) => v !== null && v !== undefined && String(v).trim() !== "");
  if (!nonEmpty.length) return "TEXT";
  if (nonEmpty.every((v) => !isNaN(Number(v)) && !isNaN(parseFloat(v)))) {
    return nonEmpty.every((v) => Number.isInteger(Number(v))) ? "INT" : "FLOAT";
  }
  if (nonEmpty.every((v) => /^\d{4}-\d{2}-\d{2}/.test(String(v)))) return "DATE";
  return "TEXT";
}

function getSchema(rows) {
  if (!rows.length) return [];
  const headers = Object.keys(rows[0]);
  return headers.map((col) => ({
    col,
    type: inferType(rows.map((r) => r[col])),
  }));
}

function downloadCSV(table) {
  if (!table.rows.length) return;
  const headers = Object.keys(table.rows[0]);
  const csv = [
    headers.join(","),
    ...table.rows.map((r) =>
      headers.map((h) => {
        const val = String(r[h] ?? "").replace(/"/g, '""');
        return val.includes(",") || val.includes('"') ? `"${val}"` : val;
      }).join(",")
    ),
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = `${table.name}.csv`; a.click();
  URL.revokeObjectURL(url);
}

export default function PdfToExcel() {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [tables, setTables] = useState(null);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [uploadedToSystem, setUploadedToSystem] = useState(new Set());
  const [dragging, setDragging] = useState(false);

  const handleFile = (f) => {
    if (!f || !f.name.match(/\.pdf$/i)) { setError("Please upload a valid PDF file."); return; }
    setFile(f); setTables(null); setError(null); setUploadedToSystem(new Set());
  };

  const extractTables = async () => {
    if (!file) return;
    setLoading(true); setError(null); setTables(null);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `You are a data extraction assistant. Analyze this PDF and extract ALL tabular data you find.
For each table found, give it a short descriptive snake_case name, and extract all rows as flat objects with column headers as keys.
If there are no tables, return an empty tables array.
Be thorough — extract every table in the document.`,
        file_urls: [file_url],
        response_json_schema: {
          type: "object",
          properties: {
            tables: {
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
      const extracted = (result?.tables || []).filter((t) => t.rows && t.rows.length > 0);
      if (!extracted.length) throw new Error("No tables found in this PDF.");
      setTables(extracted);
      setSelectedIdx(0);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const uploadToSystem = (table) => {
    const tableName = table.name.toLowerCase().replace(/[^a-z0-9_]/g, "_");
    const headers = table.rows.length > 0 ? Object.keys(table.rows[0]) : [];
    UploadedDataStore.set(tableName, { rows: table.rows, columns: headers, uploadedAt: new Date().toISOString() });
    setUploadedToSystem((prev) => new Set([...prev, table.name]));
  };

  const reset = () => { setFile(null); setTables(null); setError(null); setUploadedToSystem(new Set()); };

  const activeTable = tables?.[selectedIdx];
  const schema = useMemo(() => activeTable ? getSchema(activeTable.rows) : [], [activeTable]);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <FileText className="w-6 h-6 text-rose-500" /> PDF to Excel
          </h1>
          <p className="text-sm text-slate-400 mt-1">Extract tables from PDFs — preview, download CSV, or push to Query Builder</p>
        </div>
        {tables && (
          <Button size="sm" variant="ghost" onClick={reset} className="gap-1.5 text-slate-400 hover:text-slate-700">
            <X className="w-3.5 h-3.5" /> New File
          </Button>
        )}
      </div>

      {/* Upload zone */}
      {!tables && (
        <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm space-y-4">
          <label
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
            className={`flex flex-col items-center justify-center gap-4 border-2 border-dashed rounded-xl p-10 cursor-pointer transition-all
              ${dragging ? "border-rose-400 bg-rose-50" : "border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-slate-100"}`}
          >
            <input type="file" accept=".pdf" className="hidden"
              onChange={(e) => { if (e.target.files[0]) handleFile(e.target.files[0]); e.target.value = ""; }} />
            <div className="w-16 h-16 rounded-2xl bg-rose-50 flex items-center justify-center">
              <Upload className="w-8 h-8 text-rose-400" />
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold text-slate-700">Drop your PDF here, or click to browse</p>
              <p className="text-xs text-slate-400 mt-1">PDF files only</p>
            </div>
          </label>

          {file && (
            <div className="flex items-center justify-between bg-rose-50 border border-rose-100 rounded-xl px-4 py-3">
              <div className="flex items-center gap-3">
                <FileText className="w-5 h-5 text-rose-500 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-slate-700">{file.name}</p>
                  <p className="text-xs text-slate-400">{(file.size / 1024).toFixed(1)} KB</p>
                </div>
              </div>
              <button onClick={() => setFile(null)} className="text-slate-300 hover:text-rose-500 transition-colors"><X className="w-4 h-4" /></button>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 text-sm text-rose-700">
              <AlertCircle className="w-4 h-4 shrink-0" />{error}
            </div>
          )}

          <div className="flex justify-end">
            <Button onClick={extractTables} disabled={!file || loading} className="bg-rose-600 hover:bg-rose-700 text-white gap-2">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
              {loading ? "Extracting tables…" : "Extract Tables"}
            </Button>
          </div>
        </div>
      )}

      {/* Results: two-panel layout */}
      {tables && (
        <div className="flex gap-4 min-h-[600px]">
          {/* Left: table list */}
          <aside className="w-56 shrink-0 bg-slate-900 rounded-2xl p-3 flex flex-col gap-1 overflow-y-auto">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-2 py-1">
              {tables.length} Table{tables.length !== 1 ? "s" : ""} Found
            </p>
            {tables.map((t, idx) => {
              const isUploaded = uploadedToSystem.has(t.name);
              const isActive = idx === selectedIdx;
              return (
                <button
                  key={idx}
                  onClick={() => setSelectedIdx(idx)}
                  className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-left transition-all text-xs
                    ${isActive ? "bg-rose-600/20 text-rose-300 border border-rose-500/30" : "text-slate-400 hover:bg-white/5 hover:text-white"}`}
                >
                  <Table2 className="w-3.5 h-3.5 shrink-0" />
                  <span className="font-mono truncate flex-1">{t.name}</span>
                  {isUploaded && <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />}
                </button>
              );
            })}
          </aside>

          {/* Right: table detail */}
          {activeTable && (
            <div className="flex-1 bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden flex flex-col">
              {/* Table toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 border-b border-slate-100 bg-slate-50 shrink-0">
                <div className="flex items-center gap-2 min-w-0">
                  <Table2 className="w-4 h-4 text-rose-500 shrink-0" />
                  <span className="font-mono text-sm font-bold text-slate-800">{activeTable.name}</span>
                  <Badge className="bg-slate-200 text-slate-600 text-[10px]">{activeTable.rows.length} rows</Badge>
                  <Badge className="bg-slate-200 text-slate-600 text-[10px]">{schema.length} cols</Badge>
                  {uploadedToSystem.has(activeTable.name) && (
                    <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] flex items-center gap-1">
                      <CheckCircle2 className="w-2.5 h-2.5" /> In Query Builder
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => downloadCSV(activeTable)} className="gap-1.5 h-7 px-3 text-xs">
                    <Download className="w-3 h-3" /> Download CSV
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => uploadToSystem(activeTable)}
                    disabled={uploadedToSystem.has(activeTable.name)}
                    className={`gap-1.5 h-7 px-3 text-xs ${uploadedToSystem.has(activeTable.name) ? "bg-emerald-100 text-emerald-500 cursor-default" : "bg-indigo-600 hover:bg-indigo-700 text-white"}`}
                  >
                    <Database className="w-3 h-3" />
                    {uploadedToSystem.has(activeTable.name) ? "Uploaded" : "Upload to System"}
                  </Button>
                </div>
              </div>

              {/* Schema strip */}
              <div className="flex gap-2 px-5 py-2 border-b border-slate-100 bg-white overflow-x-auto shrink-0">
                {schema.map(({ col, type }) => (
                  <div key={col} className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-lg whitespace-nowrap">
                    <span className="font-mono text-[10px] font-bold text-slate-700">{col}</span>
                    <span className={`text-[9px] font-bold px-1 rounded ${
                      type === "INT" ? "bg-blue-100 text-blue-600" :
                      type === "FLOAT" ? "bg-purple-100 text-purple-600" :
                      type === "DATE" ? "bg-amber-100 text-amber-600" :
                      "bg-slate-100 text-slate-500"
                    }`}>{type}</span>
                  </div>
                ))}
              </div>

              {/* Data table */}
              <div className="flex-1 overflow-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-slate-50 z-10">
                    <tr>
                      <th className="text-left px-3 py-2.5 text-slate-400 font-semibold border-b border-slate-200 w-10 font-mono">#</th>
                      {schema.map(({ col, type }) => (
                        <th key={col} className="text-left px-4 py-2.5 border-b border-slate-200 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono font-bold text-slate-700">{col}</span>
                            <span className={`text-[9px] font-bold px-1 rounded ${
                              type === "INT" ? "bg-blue-100 text-blue-600" :
                              type === "FLOAT" ? "bg-purple-100 text-purple-600" :
                              type === "DATE" ? "bg-amber-100 text-amber-600" :
                              "bg-slate-100 text-slate-400"
                            }`}>{type}</span>
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {activeTable.rows.slice(0, 200).map((row, i) => (
                      <tr key={i} className={`border-b border-slate-50 hover:bg-slate-50/60 transition-colors ${i % 2 === 0 ? "" : "bg-slate-50/30"}`}>
                        <td className="px-3 py-2 text-slate-300 font-mono">{i + 1}</td>
                        {schema.map(({ col }) => {
                          const val = row[col];
                          const isEmpty = val === null || val === undefined || String(val).trim() === "";
                          return (
                            <td key={col} className={`px-4 py-2 whitespace-nowrap max-w-[220px] overflow-hidden text-ellipsis font-mono ${isEmpty ? "text-slate-300 italic" : "text-slate-700"}`}>
                              {isEmpty ? "NULL" : String(val)}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {activeTable.rows.length > 200 && (
                  <p className="text-center text-xs text-slate-400 py-3 border-t border-slate-100">
                    Showing 200 of {activeTable.rows.length} rows
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Upload all shortcut */}
      {tables && tables.some((t) => !uploadedToSystem.has(t.name)) && (
        <div className="flex items-center justify-between bg-indigo-50 border border-indigo-200 rounded-xl px-5 py-3">
          <div className="flex items-center gap-2 text-sm text-indigo-700">
            <Database className="w-4 h-4" />
            Upload all {tables.length} tables to Query Builder at once
          </div>
          <Button size="sm" onClick={() => tables.forEach((t) => uploadToSystem(t))} className="bg-indigo-600 hover:bg-indigo-700 text-white gap-1.5 text-xs">
            <Database className="w-3 h-3" /> Upload All
          </Button>
        </div>
      )}

      {uploadedToSystem.size > 0 && (
        <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-5 py-3 text-sm text-emerald-700">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          {uploadedToSystem.size} table{uploadedToSystem.size !== 1 ? "s" : ""} are now in the Query Builder — go to <strong className="mx-1">Phase 2 → Query Builder</strong> to query and insert into master tables.
        </div>
      )}
    </div>
  );
}