import React, { useState, useMemo } from "react";
import { ncClient } from "@/api/ncClient";
import {
  Upload, Download, Database, Loader2, AlertCircle, CheckCircle2,
  FileText, Table2, X, ArrowRight, ChevronLeft, ChevronRight, ZoomIn, ZoomOut
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { UploadedDataStore } from "@/components/querybuilder/UploadedDataStore";

function inferType(values) {
  const nonEmpty = values.filter((v) => v !== null && v !== undefined && String(v).trim() !== "");
  if (!nonEmpty.length) return "TEXT";
  if (nonEmpty.every((v) => !isNaN(Number(v)) && !isNaN(parseFloat(v))))
    return nonEmpty.every((v) => Number.isInteger(Number(v))) ? "INT" : "FLOAT";
  if (nonEmpty.every((v) => /^\d{4}-\d{2}-\d{2}/.test(String(v)))) return "DATE";
  return "TEXT";
}

function getSchema(rows) {
  if (!rows.length) return [];
  return Object.keys(rows[0]).map((col) => ({ col, type: inferType(rows.map((r) => r[col])) }));
}

function downloadCSV(table) {
  if (!table.rows.length) return;
  const headers = Object.keys(table.rows[0]);
  const csv = [
    headers.join(","),
    ...table.rows.map((r) =>
      headers.map((h) => {
        const val = String(r[h] ?? "").replace(/"/g, '""');
        return val.includes(",") || val.includes('"') || val.includes("\n") ? `"${val}"` : val;
      }).join(",")
    ),
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = `${table.name}.csv`; a.click();
  URL.revokeObjectURL(url);
}

// ── PDF Viewer ─────────────────────────────────────────────────────────────
function PdfViewer({ fileUrl }) {
  return (
    <div className="w-full h-full rounded-xl overflow-hidden border border-slate-200 bg-slate-100">
      <iframe
        src={`${fileUrl}#toolbar=1&navpanes=1&scrollbar=1`}
        className="w-full h-full"
        title="PDF Preview"
        style={{ minHeight: "500px" }}
      />
    </div>
  );
}

// ── Table selection sidebar ────────────────────────────────────────────────
function TableSelector({ tables, selectedIdx, uploadedToSystem, onSelect }) {
  return (
    <div className="flex flex-col gap-1 overflow-y-auto">
      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-2 py-1 shrink-0">
        {tables.length} Table{tables.length !== 1 ? "s" : ""} Extracted
      </p>
      {tables.map((t, idx) => {
        const isUploaded = uploadedToSystem.has(t.name);
        const isActive = idx === selectedIdx;
        const headers = t.rows.length > 0 ? Object.keys(t.rows[0]) : [];
        return (
          <button
            key={idx}
            onClick={() => onSelect(idx)}
            className={`w-full flex flex-col px-3 py-2.5 rounded-xl text-left transition-all
              ${isActive ? "bg-rose-600/20 border border-rose-500/30" : "hover:bg-slate-100 border border-transparent"}`}
          >
            <div className="flex items-center gap-2">
              <Table2 className={`w-3.5 h-3.5 shrink-0 ${isActive ? "text-rose-500" : "text-slate-400"}`} />
              <span className={`font-mono text-xs font-bold truncate flex-1 ${isActive ? "text-rose-700" : "text-slate-700"}`}>{t.name}</span>
              {isUploaded && <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />}
            </div>
            <div className="flex gap-1.5 mt-1 ml-5">
              <Badge className="bg-slate-100 text-slate-500 text-[9px] px-1.5">{t.rows.length} rows</Badge>
              <Badge className="bg-slate-100 text-slate-500 text-[9px] px-1.5">{headers.length} cols</Badge>
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ── Column / row selection inside a table ─────────────────────────────────
function TableDataSelector({ table, onUpload, onDownload, isUploaded }) {
  const [hiddenCols, setHiddenCols] = useState(new Set());
  const [selectedRows, setSelectedRows] = useState(null); // null = all

  const schema = useMemo(() => getSchema(table.rows), [table]);
  const visibleCols = schema.filter(({ col }) => !hiddenCols.has(col));
  const displayRows = table.rows.slice(0, 200);

  const toggleCol = (col) => setHiddenCols((prev) => {
    const next = new Set(prev); next.has(col) ? next.delete(col) : next.add(col); return next;
  });

  const handleUpload = () => {
    const cols = visibleCols.map((c) => c.col);
    const rows = table.rows.map((r) => {
      const o = {}; cols.forEach((c) => { o[c] = r[c]; }); return o;
    });
    onUpload({ rows, columns: cols });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-slate-100 bg-slate-50 shrink-0">
        <div className="flex items-center gap-2">
          <Table2 className="w-4 h-4 text-rose-500" />
          <span className="font-mono text-sm font-bold text-slate-800">{table.name}</span>
          <Badge className="bg-slate-200 text-slate-600 text-[10px]">{table.rows.length} rows</Badge>
          <Badge className="bg-slate-200 text-slate-600 text-[10px]">{schema.length} cols</Badge>
          {isUploaded && (
            <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] flex items-center gap-1">
              <CheckCircle2 className="w-2.5 h-2.5" /> In Query Builder
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={onDownload} className="gap-1.5 h-7 px-3 text-xs">
            <Download className="w-3 h-3" /> CSV
          </Button>
          <Button
            size="sm"
            onClick={handleUpload}
            disabled={isUploaded}
            className={`gap-1.5 h-7 px-3 text-xs ${isUploaded ? "bg-emerald-100 text-emerald-500 cursor-default" : "bg-indigo-600 hover:bg-indigo-700 text-white"}`}
          >
            <Database className="w-3 h-3" />
            {isUploaded ? "Uploaded" : `Upload ${visibleCols.length < schema.length ? `(${visibleCols.length} cols)` : "to System"}`}
          </Button>
        </div>
      </div>

      {/* Column toggles */}
      <div className="flex flex-wrap gap-1.5 px-4 py-2 border-b border-slate-100 bg-white overflow-y-auto max-h-[64px] shrink-0">
        {schema.map(({ col, type }) => {
          const active = !hiddenCols.has(col);
          return (
            <button
              key={col}
              onClick={() => toggleCol(col)}
              title={active ? "Click to exclude column" : "Click to include column"}
              className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border transition-all ${
                active ? "bg-indigo-50 border-indigo-200 text-indigo-700" : "bg-slate-100 border-slate-200 text-slate-400 line-through"
              }`}
            >
              <span className={`font-mono ${type === "INT" || type === "FLOAT" ? "text-blue-500" : type === "DATE" ? "text-amber-500" : ""}`}>{type}</span>
              · {col}
            </button>
          );
        })}
      </div>

      {/* Data table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 z-10">
            <tr className="bg-slate-50">
              <th className="text-left px-3 py-2 text-slate-400 font-mono font-semibold border-b border-slate-200 w-8">#</th>
              {visibleCols.map(({ col, type }) => (
                <th key={col} className="text-left px-3 py-2.5 border-b border-slate-200 whitespace-nowrap">
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
            {displayRows.map((row, i) => (
              <tr key={i} className={`border-b border-slate-50 hover:bg-slate-50/60 ${i % 2 === 0 ? "" : "bg-slate-50/30"}`}>
                <td className="px-3 py-1.5 text-slate-300 font-mono">{i + 1}</td>
                {visibleCols.map(({ col }) => {
                  const val = row[col];
                  const isEmpty = val === null || val === undefined || String(val).trim() === "";
                  return (
                    <td key={col} className={`px-3 py-1.5 whitespace-nowrap max-w-[200px] overflow-hidden text-ellipsis font-mono ${isEmpty ? "text-slate-300 italic" : "text-slate-700"}`}>
                      {isEmpty ? "NULL" : String(val)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {table.rows.length > 200 && (
          <p className="text-center text-xs text-slate-400 py-3 border-t border-slate-100">
            Showing 200 of {table.rows.length} rows
          </p>
        )}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────
export default function PdfToExcel() {
  const [file, setFile] = useState(null);
  const [fileUrl, setFileUrl] = useState(null); // for PDF preview
  const [localFileUrl, setLocalFileUrl] = useState(null); // blob URL for iframe
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState("");
  const [error, setError] = useState(null);
  const [tables, setTables] = useState(null);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [uploadedToSystem, setUploadedToSystem] = useState(new Set());
  const [dragging, setDragging] = useState(false);
  const [viewMode, setViewMode] = useState("split"); // "split" | "pdf" | "data"

  const handleFile = (f) => {
    if (!f || !f.name.match(/\.pdf$/i)) { setError("Please upload a valid PDF file."); return; }
    setFile(f);
    // Create local blob URL for iframe preview
    setLocalFileUrl(URL.createObjectURL(f));
    setTables(null); setError(null); setUploadedToSystem(new Set());
  };

  const extractTables = async () => {
    if (!file) return;
    setLoading(true); setError(null); setTables(null);
    try {
      setLoadingStep("Uploading PDF…");
      const { file_url } = await ncClient.integrations.Core.UploadFile({ file });
      setFileUrl(file_url);

      setLoadingStep("Extracting tables with AI…");
      const result = await ncClient.integrations.Core.InvokeLLM({
        prompt: `You are a data extraction assistant. Analyze this PDF document carefully and extract ALL tabular data you find.
For each table found:
- Give it a short descriptive snake_case name (e.g. sales_summary, employee_list)
- List the column headers in a "columns" array
- For each data row, output a "values" array with values in the same order as columns
- Include every row, do not summarize or truncate
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
                  columns: { type: "array", items: { type: "string" } },
                  rows: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        values: { type: "array", items: { type: "string" } },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      });
      const extracted = (result?.tables || [])
        .filter((t) => t.columns?.length && t.rows?.length)
        .map((t) => ({
          name: t.name,
          rows: t.rows.map((r) => {
            const obj = {};
            t.columns.forEach((col, i) => { obj[col] = r.values?.[i] ?? ""; });
            return obj;
          }),
        }))
        .filter((t) => t.rows.length > 0);
      if (!extracted.length) throw new Error("No tables found in this PDF.");
      setTables(extracted);
      setSelectedIdx(0);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false); setLoadingStep("");
    }
  };

  const uploadToSystem = (table, { rows, columns }) => {
    const tableName = table.name.toLowerCase().replace(/[^a-z0-9_]/g, "_");
    UploadedDataStore.set(tableName, { rows, columns, uploadedAt: new Date().toISOString() });
    setUploadedToSystem((prev) => new Set([...prev, table.name]));
  };

  const reset = () => {
    setFile(null);
    if (localFileUrl) URL.revokeObjectURL(localFileUrl);
    setLocalFileUrl(null); setFileUrl(null); setTables(null);
    setError(null); setUploadedToSystem(new Set()); setViewMode("split");
  };

  const activeTable = tables?.[selectedIdx];

  return (
    <div className="max-w-[1400px] mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <FileText className="w-6 h-6 text-rose-500" /> PDF to Excel
          </h1>
          <p className="text-sm text-slate-400 mt-1">Upload a PDF — view the document, select which data to extract, then download CSV or push to Query Builder</p>
        </div>
        {tables && (
          <Button size="sm" variant="ghost" onClick={reset} className="gap-1.5 text-slate-400 hover:text-slate-700">
            <X className="w-3.5 h-3.5" /> New File
          </Button>
        )}
      </div>

      {/* Upload zone — shown if no file yet */}
      {!file && (
        <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm">
          <label
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
            className={`flex flex-col items-center justify-center gap-4 border-2 border-dashed rounded-xl p-12 cursor-pointer transition-all
              ${dragging ? "border-rose-400 bg-rose-50" : "border-slate-200 bg-slate-50 hover:border-rose-300 hover:bg-rose-50/40"}`}
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
        </div>
      )}

      {/* File selected but not yet extracted */}
      {file && !tables && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* PDF preview */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden" style={{ height: "600px" }}>
            <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100 bg-slate-50">
              <FileText className="w-4 h-4 text-rose-500" />
              <span className="text-sm font-semibold text-slate-700 truncate">{file.name}</span>
              <span className="text-xs text-slate-400 ml-auto">{(file.size / 1024).toFixed(1)} KB</span>
              <button onClick={() => { reset(); }} className="text-slate-300 hover:text-rose-500 transition-colors ml-2">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-2 h-[calc(100%-53px)]">
              <PdfViewer fileUrl={localFileUrl} />
            </div>
          </div>

          {/* Extract panel */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 flex flex-col justify-center gap-5">
            <div className="flex flex-col items-center gap-3 text-center">
              <div className="w-14 h-14 rounded-2xl bg-rose-50 flex items-center justify-center">
                <Table2 className="w-7 h-7 text-rose-400" />
              </div>
              <div>
                <p className="font-semibold text-slate-800">Extract Tables from PDF</p>
                <p className="text-sm text-slate-400 mt-1">AI will scan the document and extract all tabular data it finds. You can then preview each table and choose which data to use.</p>
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 text-sm text-rose-700">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />{error}
              </div>
            )}

            {loading && (
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="w-8 h-8 text-rose-400 animate-spin" />
                <p className="text-sm text-slate-500">{loadingStep}</p>
              </div>
            )}

            <Button
              onClick={extractTables}
              disabled={loading}
              className="bg-rose-600 hover:bg-rose-700 text-white gap-2 w-full"
              size="lg"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
              {loading ? loadingStep : "Extract Tables"}
            </Button>
          </div>
        </div>
      )}

      {/* Results: PDF + table explorer */}
      {tables && activeTable && (
        <>
          {/* View mode toggle */}
          <div className="flex items-center gap-2">
            <div className="flex bg-slate-100 rounded-xl p-1 gap-1">
              {[
                { key: "split", label: "Split View" },
                { key: "pdf",   label: "PDF Only" },
                { key: "data",  label: "Data Only" },
              ].map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setViewMode(key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    viewMode === key ? "bg-white shadow text-slate-800" : "text-slate-500 hover:text-slate-700"
                  }`}
                >{label}</button>
              ))}
            </div>
            <div className="text-sm text-slate-500 ml-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 inline mr-1" />
              {tables.length} table{tables.length !== 1 ? "s" : ""} found in <strong>{file?.name}</strong>
            </div>
          </div>

          <div className="flex gap-4" style={{ height: "calc(100vh - 260px)", minHeight: "560px" }}>
            {/* Table list sidebar */}
            <aside className="w-52 shrink-0 bg-white border border-slate-200 rounded-2xl p-3 overflow-y-auto shadow-sm">
              <TableSelector
                tables={tables}
                selectedIdx={selectedIdx}
                uploadedToSystem={uploadedToSystem}
                onSelect={setSelectedIdx}
              />
            </aside>

            {/* PDF panel */}
            {(viewMode === "split" || viewMode === "pdf") && (
              <div className={`${viewMode === "split" ? "flex-1" : "flex-[2]"} bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm`}>
                <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-100 bg-slate-50">
                  <FileText className="w-3.5 h-3.5 text-rose-400" />
                  <span className="text-xs font-semibold text-slate-600 truncate">{file?.name}</span>
                </div>
                <div className="p-2" style={{ height: "calc(100% - 44px)" }}>
                  <PdfViewer fileUrl={localFileUrl} />
                </div>
              </div>
            )}

            {/* Data panel */}
            {(viewMode === "split" || viewMode === "data") && (
              <div className={`${viewMode === "split" ? "flex-1" : "flex-[2]"} bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm flex flex-col`}>
                <TableDataSelector
                  key={selectedIdx}
                  table={activeTable}
                  isUploaded={uploadedToSystem.has(activeTable.name)}
                  onDownload={() => downloadCSV(activeTable)}
                  onUpload={({ rows, columns }) => uploadToSystem(activeTable, { rows, columns })}
                />
              </div>
            )}
          </div>

          {/* Bulk upload bar */}
          {tables.some((t) => !uploadedToSystem.has(t.name)) && (
            <div className="flex items-center justify-between bg-indigo-50 border border-indigo-200 rounded-xl px-5 py-3">
              <span className="text-sm text-indigo-700 flex items-center gap-2">
                <Database className="w-4 h-4" />
                Upload all {tables.length} tables to Query Builder at once
              </span>
              <Button size="sm" onClick={() => tables.forEach((t) => {
                const cols = t.rows.length > 0 ? Object.keys(t.rows[0]) : [];
                uploadToSystem(t, { rows: t.rows, columns: cols });
              })} className="bg-indigo-600 hover:bg-indigo-700 text-white gap-1.5 text-xs">
                <Database className="w-3 h-3" /> Upload All
              </Button>
            </div>
          )}

          {uploadedToSystem.size > 0 && (
            <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-5 py-3 text-sm text-emerald-700">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              {uploadedToSystem.size} table{uploadedToSystem.size !== 1 ? "s" : ""} loaded into Query Builder — go to <strong className="mx-1">Phase 2 → Query Builder</strong> to query and insert into master tables.
            </div>
          )}
        </>
      )}
    </div>
  );
}