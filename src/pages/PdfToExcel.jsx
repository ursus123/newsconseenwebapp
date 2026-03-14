import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Upload, Download, Database, Loader2, AlertCircle, CheckCircle2, FileText, Table2, X, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { UploadedDataStore } from "@/components/querybuilder/UploadedDataStore";

export default function PdfToExcel() {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [tables, setTables] = useState(null); // array of { name, headers, rows }
  const [uploadedToSystem, setUploadedToSystem] = useState(new Set());
  const [dragging, setDragging] = useState(false);

  const handleFile = (f) => {
    if (!f || !f.name.match(/\.pdf$/i)) {
      setError("Please upload a valid PDF file.");
      return;
    }
    setFile(f);
    setTables(null);
    setError(null);
    setUploadedToSystem(new Set());
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  const extractTables = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    setTables(null);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });

      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `You are a data extraction assistant. Analyze this PDF and extract ALL tabular data you find.
For each table found, give it a short descriptive name (snake_case, no spaces), and extract all rows.
If there are no tables, return an empty array.
Return every row as a flat object with the column headers as keys.
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
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const downloadExcel = (table) => {
    if (!table.rows.length) return;
    const headers = Object.keys(table.rows[0]);
    const csvContent = [
      headers.join(","),
      ...table.rows.map((r) =>
        headers.map((h) => {
          const val = String(r[h] ?? "").replace(/"/g, '""');
          return val.includes(",") || val.includes('"') ? `"${val}"` : val;
        }).join(",")
      ),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${table.name}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadAll = () => {
    if (!tables) return;
    tables.forEach((t) => downloadExcel(t));
  };

  const uploadToSystem = (table) => {
    const tableName = table.name.toLowerCase().replace(/[^a-z0-9_]/g, "_");
    const headers = table.rows.length > 0 ? Object.keys(table.rows[0]) : [];
    UploadedDataStore.set(tableName, {
      rows: table.rows,
      columns: headers,
      uploadedAt: new Date().toISOString(),
    });
    setUploadedToSystem((prev) => new Set([...prev, table.name]));
  };

  const uploadAllToSystem = () => {
    tables?.forEach((t) => uploadToSystem(t));
  };

  const reset = () => {
    setFile(null);
    setTables(null);
    setError(null);
    setUploadedToSystem(new Set());
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
          <FileText className="w-6 h-6 text-rose-500" />
          PDF to Excel
        </h1>
        <p className="text-sm text-slate-400 mt-1">Extract tables from PDF files — download as CSV or push directly into the Query Builder</p>
      </div>

      {/* Upload zone */}
      {!tables && (
        <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm">
          <label
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            className={`flex flex-col items-center justify-center gap-4 border-2 border-dashed rounded-xl p-10 cursor-pointer transition-all
              ${dragging ? "border-rose-400 bg-rose-50" : "border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-slate-100"}`}
          >
            <input
              type="file"
              accept=".pdf"
              className="hidden"
              onChange={(e) => { if (e.target.files[0]) handleFile(e.target.files[0]); e.target.value = ""; }}
            />
            <div className="w-16 h-16 rounded-2xl bg-rose-50 flex items-center justify-center">
              <Upload className="w-8 h-8 text-rose-400" />
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold text-slate-700">Drop your PDF here, or click to browse</p>
              <p className="text-xs text-slate-400 mt-1">PDF files only</p>
            </div>
          </label>

          {file && (
            <div className="mt-4 flex items-center justify-between bg-rose-50 border border-rose-100 rounded-xl px-4 py-3">
              <div className="flex items-center gap-3">
                <FileText className="w-5 h-5 text-rose-500 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-slate-700">{file.name}</p>
                  <p className="text-xs text-slate-400">{(file.size / 1024).toFixed(1)} KB</p>
                </div>
              </div>
              <button onClick={() => setFile(null)} className="text-slate-300 hover:text-rose-500 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {error && (
            <div className="mt-4 flex items-center gap-2 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 text-sm text-rose-700">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          <div className="mt-6 flex justify-end">
            <Button
              onClick={extractTables}
              disabled={!file || loading}
              className="bg-rose-600 hover:bg-rose-700 text-white gap-2"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
              {loading ? "Extracting tables…" : "Extract Tables"}
            </Button>
          </div>
        </div>
      )}

      {/* Results */}
      {tables && (
        <div className="space-y-6">
          {/* Summary bar */}
          <div className="flex flex-wrap items-center justify-between gap-4 bg-emerald-50 border border-emerald-200 rounded-2xl px-5 py-4">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              <div>
                <p className="text-sm font-semibold text-emerald-800">
                  {tables.length} table{tables.length !== 1 ? "s" : ""} extracted from <span className="font-bold">{file?.name}</span>
                </p>
                <p className="text-xs text-emerald-600">{tables.reduce((s, t) => s + t.rows.length, 0)} total rows</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={downloadAll} className="gap-1.5 border-emerald-300 text-emerald-700 hover:bg-emerald-50">
                <Download className="w-3.5 h-3.5" /> Download All CSV
              </Button>
              <Button size="sm" onClick={uploadAllToSystem} className="gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white">
                <Database className="w-3.5 h-3.5" /> Upload All to System
              </Button>
              <Button size="sm" variant="ghost" onClick={reset} className="text-slate-400 hover:text-slate-600">
                <X className="w-3.5 h-3.5" /> New File
              </Button>
            </div>
          </div>

          {/* Per-table cards */}
          {tables.map((table, idx) => {
            const headers = table.rows.length > 0 ? Object.keys(table.rows[0]) : [];
            const isUploaded = uploadedToSystem.has(table.name);
            return (
              <div key={idx} className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                {/* Table header */}
                <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-slate-100 bg-slate-50">
                  <div className="flex items-center gap-2">
                    <Table2 className="w-4 h-4 text-slate-500" />
                    <span className="font-mono text-sm font-bold text-slate-700">{table.name}</span>
                    <Badge className="bg-slate-200 text-slate-600 text-[10px]">{table.rows.length} rows</Badge>
                    <Badge className="bg-slate-200 text-slate-600 text-[10px]">{headers.length} cols</Badge>
                    {isUploaded && (
                      <Badge className="bg-indigo-50 text-indigo-600 text-[10px] flex items-center gap-1">
                        <CheckCircle2 className="w-2.5 h-2.5" /> In Query Builder
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" onClick={() => downloadExcel(table)} className="gap-1.5 h-7 px-3 text-xs">
                      <Download className="w-3 h-3" /> Download CSV
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => uploadToSystem(table)}
                      disabled={isUploaded}
                      className={`gap-1.5 h-7 px-3 text-xs ${isUploaded ? "bg-indigo-100 text-indigo-400" : "bg-indigo-600 hover:bg-indigo-700 text-white"}`}
                    >
                      <Database className="w-3 h-3" />
                      {isUploaded ? "Uploaded" : "Upload to System"}
                    </Button>
                  </div>
                </div>

                {/* Data preview */}
                <div className="overflow-x-auto max-h-72">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-white z-10">
                      <tr>
                        {headers.map((h) => (
                          <th key={h} className="text-left px-4 py-2.5 text-slate-500 font-semibold border-b border-slate-100 whitespace-nowrap font-mono">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {table.rows.slice(0, 50).map((row, i) => (
                        <tr key={i} className="border-b border-slate-50 hover:bg-slate-50/50">
                          {headers.map((h) => (
                            <td key={h} className="px-4 py-2 text-slate-700 whitespace-nowrap max-w-[200px] overflow-hidden text-ellipsis font-mono">
                              {String(row[h] ?? "")}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {table.rows.length > 50 && (
                    <p className="text-center text-xs text-slate-400 py-3">Showing 50 of {table.rows.length} rows</p>
                  )}
                </div>
              </div>
            );
          })}

          {uploadedToSystem.size > 0 && (
            <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-3 text-sm text-indigo-700">
              <Database className="w-4 h-4 shrink-0" />
              {uploadedToSystem.size} table{uploadedToSystem.size !== 1 ? "s" : ""} uploaded to Query Builder — go to <strong className="mx-1">Phase 2 → Query Builder</strong> to query and insert into master tables.
            </div>
          )}
        </div>
      )}
    </div>
  );
}