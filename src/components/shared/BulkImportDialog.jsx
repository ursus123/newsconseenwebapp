import React, { useState, useRef, useCallback, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  Upload, FileSpreadsheet, CheckCircle2, AlertCircle, Download,
  ChevronRight, ChevronLeft, X, Info, Loader2, AlertTriangle, ChevronDown, RefreshCw
} from "lucide-react";

// ── SheetJS via CDN ────────────────────────────────────────────────────────
function useXLSX() {
  const [XLSX, setXLSX] = useState(null);
  useEffect(() => {
    if (window.XLSX) { setXLSX(window.XLSX); return; }
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
    script.onload = () => setXLSX(window.XLSX);
    document.head.appendChild(script);
  }, []);
  return XLSX;
}

// ── Auto column-mapping helper ─────────────────────────────────────────────
function buildAutoMapper(mappingRules) {
  return function autoMap(header) {
    for (const [regex, field] of mappingRules) {
      if (regex.test(header.trim())) return field;
    }
    return "__skip__";
  };
}

// ── Duplicate detection ────────────────────────────────────────────────────
function isDuplicate(existing, incoming, entityName) {
  switch (entityName) {
    case "People":
    case "Person":
      if (existing.email && incoming.email &&
          existing.email.toLowerCase() === incoming.email.toLowerCase()) {
        return true;
      }
      const existingName = `${existing.first_name || ""} ${existing.last_name || ""}`.toLowerCase().trim();
      const incomingName = `${incoming.first_name || ""} ${incoming.last_name || ""}`.toLowerCase().trim();
      return existingName === incomingName && existingName !== "";
    case "Enterprises":
    case "Enterprise":
      return existing.enterprise_name?.toLowerCase().trim() ===
             incoming.enterprise_name?.toLowerCase().trim();
    case "Products":
    case "Product":
      return (existing.name?.toLowerCase().trim() === incoming.name?.toLowerCase().trim() ||
              existing.product_name?.toLowerCase().trim() === incoming.product_name?.toLowerCase().trim());
    default:
      return false;
  }
}

// ── Row display name helper ────────────────────────────────────────────────
function getRowTitle(row, entityName) {
  if (row.first_name || row.last_name) return `${row.first_name || ""} ${row.last_name || ""}`.trim();
  if (row.enterprise_name) return row.enterprise_name;
  if (row.name) return row.name;
  return Object.values(row).filter(Boolean)[0] || "—";
}

// ── Template generator ─────────────────────────────────────────────────────
function generateTemplate(XLSX, { templateFileName, fields, exampleRow, instructions }) {
  if (!XLSX) return;
  const wb = XLSX.utils.book_new();
  const headers = fields.map((f) => f.key);
  const example = headers.map((k) => exampleRow[k] ?? "");
  const ws = XLSX.utils.aoa_to_sheet([headers, example]);
  ws["!cols"] = headers.map((h) => ({ wch: Math.max(h.length + 4, 16) }));
  headers.forEach((_, i) => {
    const ref = XLSX.utils.encode_cell({ r: 0, c: i });
    if (ws[ref]) ws[ref].s = { font: { bold: true }, fill: { fgColor: { rgb: "22C55E" } }, alignment: { horizontal: "center" } };
  });
  XLSX.utils.book_append_sheet(wb, ws, "Data");
  const instrRows = [["Column", "Required", "Description", "Example / Valid Values"], ...instructions];
  const wsInstr = XLSX.utils.aoa_to_sheet(instrRows);
  wsInstr["!cols"] = [{ wch: 22 }, { wch: 10 }, { wch: 40 }, { wch: 70 }];
  XLSX.utils.book_append_sheet(wb, wsInstr, "Instructions");
  XLSX.writeFile(wb, templateFileName);
}

// ── Import report ──────────────────────────────────────────────────────────
function generateReport(XLSX, { entityName, imported, failed, warnings, currentUser, fileName }) {
  if (!XLSX) return;
  const now = new Date();
  const wb = XLSX.utils.book_new();
  const allKeys = imported.length ? Object.keys(imported[0]).filter((k) => !k.startsWith("_")) : ["id"];
  const impRows = imported.map((r) => allKeys.map((k) => r[k] ?? ""));
  const wsImp = XLSX.utils.aoa_to_sheet([allKeys, ...impRows]);
  wsImp["!cols"] = allKeys.map(() => ({ wch: 18 }));
  XLSX.utils.book_append_sheet(wb, wsImp, "Imported");
  const failCols = ["row", "error", ...allKeys.slice(0, 5)];
  const failRows = failed.map((f) => failCols.map((k) => f[k] ?? ""));
  const wsFail = XLSX.utils.aoa_to_sheet([failCols, ...failRows]);
  wsFail["!cols"] = failCols.map(() => ({ wch: 20 }));
  XLSX.utils.book_append_sheet(wb, wsFail, "Failed");
  const warnCols = ["row", "warning", ...allKeys.slice(0, 5)];
  const warnRows = (warnings || []).map((w) => warnCols.map((k) => w[k] ?? ""));
  const wsWarn = XLSX.utils.aoa_to_sheet([warnCols, ...warnRows]);
  wsWarn["!cols"] = warnCols.map(() => ({ wch: 20 }));
  XLSX.utils.book_append_sheet(wb, wsWarn, "Warnings");
  const wsSumData = [
    ["Import Summary"], [],
    ["Entity", entityName], ["File", fileName],
    ["Imported By", currentUser?.email || "unknown"],
    ["Date", now.toLocaleDateString()], ["Time", now.toLocaleTimeString()], [],
    ["Total Imported", imported.length], ["Total Failed", failed.length],
    ["Total Warnings", (warnings || []).length],
  ];
  const wsSum = XLSX.utils.aoa_to_sheet(wsSumData);
  wsSum["!cols"] = [{ wch: 22 }, { wch: 30 }];
  XLSX.utils.book_append_sheet(wb, wsSum, "Summary");
  XLSX.writeFile(wb, `import_report_${entityName.toLowerCase()}_${now.toISOString().slice(0, 10)}.xlsx`);
}

// ── Steps ──────────────────────────────────────────────────────────────────
const STEPS = ["upload", "mapping", "audit", "importing", "done"];
const STEP_LABELS = ["Upload", "Map Columns", "Audit", "Import"];

// ── Status badge ───────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const map = {
    ready:     "bg-emerald-100 text-emerald-700",
    warning:   "bg-amber-100 text-amber-700",
    duplicate: "bg-blue-100 text-blue-700",
    error:     "bg-rose-100 text-rose-700",
  };
  const labels = { ready: "Ready", warning: "Warning", duplicate: "Duplicate", error: "Error" };
  return <Badge className={`text-[10px] font-semibold ${map[status] || map.ready}`}>{labels[status] || status}</Badge>;
}

// ── Main Component ─────────────────────────────────────────────────────────
/**
 * BulkImportDialog - Generic reusable import dialog for any entity
 *
 * Props:
 *   open              - boolean
 *   onClose           - () => void
 *   entityName        - "People" | "Enterprises" | etc.
 *   fields            - [{ key, label, required? }]
 *   mappingRules      - [[/regex/, "field_key"], ...]
 *   templateFileName  - string
 *   templateExample   - object { fieldKey: exampleValue }
 *   templateInstructions - [["col","req","desc","values"], ...]
 *   validateRow       - (row) => { errors: [], warnings: [] }
 *   transformRow      - (row) => row  (optional)
 *   onImport          - async (row) => createdRecord
 *   currentUser       - user object
 *   previewColumns    - [{ label, render: (row) => node }]
 *   requiredField     - string key for the primary required field
 *   entityFetchFn     - async () => existingRecords[]  (for duplicate detection)
 */
export default function BulkImportDialog({
  open,
  onClose,
  entityName = "Records",
  fields = [],
  mappingRules = [],
  templateFileName = "import_template.xlsx",
  templateExample = {},
  templateInstructions = [],
  validateRow,
  transformRow,
  onImport,
  currentUser,
  previewColumns = [],
  requiredField = "name",
  entityFetchFn,
}) {
  const XLSX = useXLSX();
  const autoMap = useCallback(buildAutoMapper(mappingRules), [mappingRules]);

  const [step, setStep] = useState("upload");
  const [file, setFile] = useState(null);
  const [sheets, setSheets] = useState([]);
  const [selectedSheet, setSelectedSheet] = useState("");
  const [rawHeaders, setRawHeaders] = useState([]);
  const [rawRows, setRawRows] = useState([]);
  const [mapping, setMapping] = useState({});
  const [preview, setPreview] = useState([]);

  // Audit state
  const [auditRows, setAuditRows] = useState([]); // [{ row, status, issues, selected }]
  const [existingRecords, setExistingRecords] = useState([]);
  const [fetchingExisting, setFetchingExisting] = useState(false);
  const [expandedRows, setExpandedRows] = useState(new Set());

  // Import state
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [importResult, setImportResult] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef();
  const cancelRef = useRef(false);

  const reset = () => {
    setStep("upload"); setFile(null); setSheets([]); setSelectedSheet("");
    setRawHeaders([]); setRawRows([]); setMapping({}); setPreview([]);
    setAuditRows([]); setExistingRecords([]); setExpandedRows(new Set());
    setProgress({ current: 0, total: 0 }); setImportResult(null);
    cancelRef.current = false;
  };

  const handleClose = () => { reset(); onClose(); };

  const parseSheet = useCallback((wb, sheetName) => {
    const ws = wb.Sheets[sheetName];
    if (!ws) return { headers: [], rows: [] };
    const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
    if (!data.length) return { headers: [], rows: [] };
    const headers = data[0].map(String);
    const rows = data.slice(1).filter((r) => r.some((c) => c !== "" && c != null));
    return { headers, rows };
  }, [XLSX]);

  const applyFile = useCallback((f) => {
    if (!f || !XLSX) return;
    setFile(f);
    const reader = new FileReader();
    reader.onload = (e) => {
      const wb = XLSX.read(new Uint8Array(e.target.result), { type: "array" });
      const sheetNames = wb.SheetNames;
      setSheets(sheetNames);
      const first = sheetNames[0];
      setSelectedSheet(first);
      const { headers, rows } = parseSheet(wb, first);
      setRawHeaders(headers);
      setRawRows(rows);
      const initMap = {};
      headers.forEach((h) => { initMap[h] = autoMap(h); });
      setMapping(initMap);
      setStep("mapping");
    };
    reader.readAsArrayBuffer(f);
  }, [XLSX, parseSheet, autoMap]);

  const handleSheetChange = (sheetName) => {
    if (!file || !XLSX) return;
    setSelectedSheet(sheetName);
    const reader = new FileReader();
    reader.onload = (e) => {
      const wb = XLSX.read(new Uint8Array(e.target.result), { type: "array" });
      const { headers, rows } = parseSheet(wb, sheetName);
      setRawHeaders(headers);
      setRawRows(rows);
      const initMap = {};
      headers.forEach((h) => { initMap[h] = autoMap(h); });
      setMapping(initMap);
    };
    reader.readAsArrayBuffer(file);
  };

  const handleDrop = (e) => {
    e.preventDefault(); setDragOver(false);
    applyFile(e.dataTransfer.files[0]);
  };

  // ── Build mapped rows (same as old buildPreview) ───────────────────────
  const buildMappedRows = () => {
    return rawRows.map((row) => {
      const obj = {};
      rawHeaders.forEach((h, i) => {
        const field = mapping[h];
        if (field && field !== "__skip__") obj[field] = row[i] !== undefined ? String(row[i]) : "";
      });
      return transformRow ? transformRow(obj) : obj;
    });
  };

  // ── Run audit ─────────────────────────────────────────────────────────
  const runAudit = useCallback((mapped, existing) => {
    const audited = mapped.map((row, idx) => {
      const issues = [];

      // 1. Missing required fields
      const missingFields = fields
        .filter(f => f.required)
        .filter(f => !row[f.key]?.toString().trim())
        .map(f => f.label);
      if (missingFields.length) {
        issues.push({ type: "error", message: `Missing required: ${missingFields.join(", ")}` });
      }

      // 2. Validation errors
      if (validateRow) {
        const { errors = [], warnings: rowWarns = [] } = validateRow(row);
        errors.forEach(e => issues.push({ type: "error", message: e }));
        rowWarns.forEach(w => issues.push({ type: "warning", message: w }));
      }

      // 3. Duplicate in batch (earlier rows)
      const batchDup = mapped.slice(0, idx).some(prev => isDuplicate(prev, row, entityName));
      if (batchDup) issues.push({ type: "duplicate", message: "Duplicate within this import batch" });

      // 4. Duplicate in system
      const systemDup = existing.some(ex => isDuplicate(ex, row, entityName));
      if (systemDup) issues.push({ type: "duplicate", message: "Already exists in the system" });

      // Determine status
      const hasError = issues.some(i => i.type === "error");
      const hasDuplicate = issues.some(i => i.type === "duplicate");
      const hasWarning = issues.some(i => i.type === "warning");

      let status = "ready";
      if (hasError) status = "error";
      else if (hasDuplicate) status = "duplicate";
      else if (hasWarning) status = "warning";

      // Default selection: ready + warning = checked, duplicate + error = unchecked
      const selected = status === "ready" || status === "warning";

      return { row, status, issues, selected };
    });
    setAuditRows(audited);
  }, [fields, validateRow, entityName]);

  // ── Proceed to audit step ─────────────────────────────────────────────
  const goToAudit = async () => {
    const mapped = buildMappedRows();
    setPreview(mapped);
    setStep("audit");
    setFetchingExisting(true);
    let existing = [];
    if (entityFetchFn) {
      try { existing = await entityFetchFn(); } catch { existing = []; }
    }
    setExistingRecords(existing);
    setFetchingExisting(false);
    runAudit(mapped, existing);
  };

  // Re-run audit if existing records change (e.g. after fetch completes)
  useEffect(() => {
    if (step === "audit" && preview.length && !fetchingExisting) {
      runAudit(preview, existingRecords);
    }
  }, [existingRecords, fetchingExisting]);

  // ── Audit selection helpers ───────────────────────────────────────────
  const toggleRow = (idx) => {
    setAuditRows(rows => rows.map((r, i) => i === idx ? { ...r, selected: !r.selected } : r));
  };
  const selectAllReady = () => setAuditRows(rows => rows.map(r => ({ ...r, selected: r.status === "ready" || r.status === "warning" })));
  const selectAll = () => setAuditRows(rows => rows.map(r => ({ ...r, selected: true })));
  const deselectDuplicates = () => setAuditRows(rows => rows.map(r => r.status === "duplicate" ? { ...r, selected: false } : r));
  const deselectErrors = () => setAuditRows(rows => rows.map(r => r.status === "error" ? { ...r, selected: false } : r));

  const toggleExpand = (idx) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });
  };

  // ── Audit counts ──────────────────────────────────────────────────────
  const auditCounts = auditRows.reduce((acc, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1;
    return acc;
  }, {});
  const selectedCount = auditRows.filter(r => r.selected).length;

  // ── Import ────────────────────────────────────────────────────────────
  const handleImport = async () => {
    cancelRef.current = false;
    const rowsToImport = auditRows.filter(r => r.selected);
    setProgress({ current: 0, total: rowsToImport.length });
    setStep("importing");

    const succeeded = [];
    const failed = [];
    const warnings = [];

    for (let i = 0; i < rowsToImport.length; i++) {
      if (cancelRef.current) break;
      const { row, issues } = rowsToImport[i];
      const rowNum = i + 2;

      const cleanRow = Object.fromEntries(
        Object.entries(row).filter(([k]) => !k.startsWith("_") && k !== "company_id" && k !== "created_by")
      );

      issues.filter(iss => iss.type === "warning").forEach(w =>
        warnings.push({ row: rowNum, ...cleanRow, warning: w.message })
      );

      try {
        const created = await onImport(cleanRow);
        succeeded.push({ id: created?.id || "", ...cleanRow });
        await new Promise(resolve => setTimeout(resolve, 200)); // pace requests to avoid rate limit
      } catch (err) {
        failed.push({ row: rowNum, ...cleanRow, error: err?.message || "Unknown error" });
      }
      setProgress((p) => ({ ...p, current: p.current + 1 }));
    }

    setImportResult({
      imported: succeeded,
      failed,
      warnings,
      skipped: auditRows.filter(r => !r.selected).length,
      fileName: file?.name,
    });
    setStep("done");
  };

  // ── Step indicator ────────────────────────────────────────────────────
  const visibleStepIndex = ["upload", "mapping", "audit", "importing", "done"].indexOf(step);
  const displayStepIndex = step === "importing" || step === "done" ? 3 : visibleStepIndex;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl w-full p-0 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <DialogHeader className="px-6 pt-5 pb-4 border-b border-slate-100 shrink-0">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <DialogTitle className="flex items-center gap-2 text-slate-800">
              <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
              Bulk Import {entityName}
            </DialogTitle>
            {/* Step indicator */}
            <div className="flex items-center gap-1 text-xs">
              {STEP_LABELS.map((label, i) => {
                const isActive = i === displayStepIndex;
                const isDone = i < displayStepIndex;
                return (
                  <React.Fragment key={label}>
                    <span className={`flex items-center gap-1 px-2.5 py-1 rounded-full font-semibold transition-colors ${
                      isActive ? "bg-emerald-100 text-emerald-700" :
                      isDone   ? "text-emerald-600" :
                                 "text-slate-400"
                    }`}>
                      <span className={`w-4 h-4 rounded-full text-[10px] flex items-center justify-center font-bold ${
                        isActive ? "bg-emerald-600 text-white" :
                        isDone   ? "bg-emerald-100 text-emerald-700" :
                                   "bg-slate-200 text-slate-400"
                      }`}>{i + 1}</span>
                      {label}
                    </span>
                    {i < STEP_LABELS.length - 1 && <ChevronRight className="w-3 h-3 text-slate-300" />}
                  </React.Fragment>
                );
              })}
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto">

          {/* ── Step 1: Upload ── */}
          {step === "upload" && (
            <div className="p-6 space-y-5">
              <div
                className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-colors ${dragOver ? "border-emerald-400 bg-emerald-50" : "border-slate-200 hover:border-emerald-300 hover:bg-slate-50"}`}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="w-10 h-10 mx-auto text-slate-300 mb-3" />
                <p className="text-sm font-semibold text-slate-600 mb-1">Drag and drop your CSV or Excel file here</p>
                <p className="text-xs text-slate-400">Supports .csv, .xlsx, .xls</p>
                <input ref={fileInputRef} type="file" className="hidden" accept=".csv,.xlsx,.xls"
                  onChange={(e) => applyFile(e.target.files[0])} />
              </div>
              <div className="flex items-center justify-between bg-slate-50 rounded-xl px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-slate-700">Need a template?</p>
                  <p className="text-xs text-slate-400">Download an Excel template with sample data and instructions.</p>
                </div>
                <Button variant="outline" size="sm" className="rounded-xl shrink-0"
                  disabled={!XLSX}
                  onClick={() => generateTemplate(XLSX, { templateFileName, fields, exampleRow: templateExample, instructions: templateInstructions })}>
                  <Download className="w-4 h-4 mr-2" /> Excel Template
                </Button>
              </div>
            </div>
          )}

          {/* ── Step 2: Map Columns ── */}
          {step === "mapping" && (
            <div className="p-6 space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-slate-700">{file?.name}</p>
                  <p className="text-xs text-slate-400">{rawRows.length} data rows detected</p>
                </div>
                {sheets.length > 1 && (
                  <div className="flex items-center gap-2 shrink-0">
                    <Label className="text-xs text-slate-500 whitespace-nowrap">Sheet:</Label>
                    <Select value={selectedSheet} onValueChange={handleSheetChange}>
                      <SelectTrigger className="w-36 h-8 text-xs rounded-xl"><SelectValue /></SelectTrigger>
                      <SelectContent>{sheets.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                )}
              </div>
              <div className="border border-slate-100 rounded-xl overflow-hidden">
                <div className="grid grid-cols-2 bg-slate-50 px-4 py-2.5 text-xs font-bold text-slate-500 uppercase tracking-wider">
                  <span>Your Column</span>
                  <span>Maps To Field</span>
                </div>
                <div className="divide-y divide-slate-50 max-h-80 overflow-y-auto">
                  {rawHeaders.map((header) => (
                    <div key={header} className="grid grid-cols-2 items-center px-4 py-2 gap-3">
                      <span className="text-sm font-medium text-slate-700 truncate">{header}</span>
                      <Select value={mapping[header] || "__skip__"} onValueChange={(v) => setMapping((m) => ({ ...m, [header]: v }))}>
                        <SelectTrigger className="h-8 text-xs rounded-xl"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__skip__">— Skip this column —</SelectItem>
                          {fields.map((f) => <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-500 bg-blue-50 rounded-xl px-4 py-2.5">
                <Info className="w-4 h-4 text-blue-500 shrink-0" />
                Unmapped columns will be skipped. Fields marked * are required.
              </div>
            </div>
          )}

          {/* ── Step 3: Audit ── */}
          {step === "audit" && (
            <div className="p-6 space-y-4">
              {fetchingExisting ? (
                <div className="flex flex-col items-center justify-center gap-3 py-12">
                  <RefreshCw className="w-7 h-7 text-emerald-500 animate-spin" />
                  <p className="text-sm text-slate-500">Checking for duplicates…</p>
                </div>
              ) : (
                <>
                  {/* Summary bar */}
                  <div className="flex flex-wrap gap-3 p-3 bg-slate-50 rounded-xl text-sm">
                    <span className="flex items-center gap-1.5 text-emerald-700 font-medium">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                      {auditCounts.ready || 0} ready
                    </span>
                    <span className="flex items-center gap-1.5 text-amber-700 font-medium">
                      <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
                      {auditCounts.warning || 0} warnings
                    </span>
                    <span className="flex items-center gap-1.5 text-blue-700 font-medium">
                      <span className="w-2 h-2 rounded-full bg-blue-400 inline-block" />
                      {auditCounts.duplicate || 0} duplicates
                    </span>
                    <span className="flex items-center gap-1.5 text-rose-700 font-medium">
                      <span className="w-2 h-2 rounded-full bg-rose-400 inline-block" />
                      {auditCounts.error || 0} errors
                    </span>
                    <span className="ml-auto text-slate-500 font-medium">{selectedCount} selected</span>
                  </div>

                  {/* Bulk selection controls */}
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" className="rounded-lg text-xs h-7" onClick={selectAllReady}>Select all ready</Button>
                    <Button variant="outline" size="sm" className="rounded-lg text-xs h-7" onClick={selectAll}>Select all</Button>
                    <Button variant="outline" size="sm" className="rounded-lg text-xs h-7" onClick={deselectDuplicates}>Deselect duplicates</Button>
                    <Button variant="outline" size="sm" className="rounded-lg text-xs h-7" onClick={deselectErrors}>Deselect errors</Button>
                  </div>

                  {/* Audit table */}
                  <div className="border border-slate-100 rounded-xl overflow-hidden">
                    <div className="grid grid-cols-[32px_80px_1fr_160px_40px] bg-slate-50 px-3 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider gap-2">
                      <span></span>
                      <span>Status</span>
                      <span>Name / Title</span>
                      <span>Issues</span>
                      <span></span>
                    </div>
                    <div className="divide-y divide-slate-50 max-h-[420px] overflow-y-auto">
                      {auditRows.map((ar, idx) => (
                        <div key={idx}>
                          <div className={`grid grid-cols-[32px_80px_1fr_160px_40px] items-center px-3 py-2 gap-2 text-xs ${
                            ar.status === "error" ? "bg-rose-50/40" :
                            ar.status === "duplicate" ? "bg-blue-50/30" :
                            ar.status === "warning" ? "bg-amber-50/30" : "hover:bg-slate-50"
                          }`}>
                            <input
                              type="checkbox"
                              checked={ar.selected}
                              onChange={() => toggleRow(idx)}
                              className="w-3.5 h-3.5 accent-emerald-600 cursor-pointer"
                            />
                            <StatusBadge status={ar.status} />
                            <span className="text-slate-700 font-medium truncate">{getRowTitle(ar.row, entityName)}</span>
                            <span className="text-slate-500 truncate">
                              {ar.issues.length === 0 ? "—" : ar.issues[0].message}
                              {ar.issues.length > 1 && <span className="text-slate-400 ml-1">+{ar.issues.length - 1}</span>}
                            </span>
                            {ar.issues.length > 0 ? (
                              <button
                                onClick={() => toggleExpand(idx)}
                                className="p-1 rounded hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition-colors"
                              >
                                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${expandedRows.has(idx) ? "rotate-180" : ""}`} />
                              </button>
                            ) : <span />}
                          </div>
                          {expandedRows.has(idx) && ar.issues.length > 0 && (
                            <div className="px-10 pb-2 space-y-1">
                              {ar.issues.map((issue, j) => (
                                <div key={j} className={`text-[11px] flex items-start gap-1.5 ${
                                  issue.type === "error" ? "text-rose-600" :
                                  issue.type === "duplicate" ? "text-blue-600" : "text-amber-700"
                                }`}>
                                  <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
                                  {issue.message}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── Step 4: Importing ── */}
          {step === "importing" && (
            <div className="p-6 flex flex-col items-center justify-center gap-6 min-h-[260px]">
              <Loader2 className="w-10 h-10 text-emerald-500 animate-spin" />
              <div className="w-full max-w-sm">
                <div className="flex justify-between text-sm text-slate-600 mb-2">
                  <span>Importing {entityName}…</span>
                  <span>{progress.current} / {progress.total}</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2">
                  <div
                    className="bg-emerald-500 h-2 rounded-full transition-all duration-300"
                    style={{ width: progress.total ? `${(progress.current / progress.total) * 100}%` : "0%" }}
                  />
                </div>
                <p className="text-xs text-slate-400 mt-2 text-center">Please wait, do not close this window</p>
              </div>
              <Button variant="outline" size="sm" className="rounded-xl text-rose-600 border-rose-200 hover:bg-rose-50"
                onClick={() => { cancelRef.current = true; }}>
                Cancel Import
              </Button>
            </div>
          )}

          {/* ── Done ── */}
          {step === "done" && importResult && (
            <div className="p-6 space-y-5">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-8 h-8 text-emerald-500 shrink-0" />
                <div>
                  <p className="font-semibold text-slate-800">Import complete!</p>
                  <p className="text-sm text-slate-500">
                    {importResult.imported.length} imported · {importResult.failed.length} failed · {importResult.skipped} skipped
                    {importResult.warnings.length > 0 && ` · ${importResult.warnings.length} warnings`}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-3">
                <div className="bg-emerald-50 rounded-xl px-4 py-3">
                  <p className="text-2xl font-black text-emerald-700">{importResult.imported.length}</p>
                  <p className="text-xs text-emerald-600">Imported</p>
                </div>
                <div className={`${importResult.failed.length > 0 ? "bg-rose-50" : "bg-slate-50"} rounded-xl px-4 py-3`}>
                  <p className={`text-2xl font-black ${importResult.failed.length > 0 ? "text-rose-600" : "text-slate-400"}`}>{importResult.failed.length}</p>
                  <p className={`text-xs ${importResult.failed.length > 0 ? "text-rose-500" : "text-slate-400"}`}>Failed</p>
                </div>
                <div className="bg-slate-50 rounded-xl px-4 py-3">
                  <p className="text-2xl font-black text-slate-400">{importResult.skipped}</p>
                  <p className="text-xs text-slate-400">Skipped</p>
                </div>
                <div className={`${importResult.warnings.length > 0 ? "bg-amber-50" : "bg-slate-50"} rounded-xl px-4 py-3`}>
                  <p className={`text-2xl font-black ${importResult.warnings.length > 0 ? "text-amber-600" : "text-slate-400"}`}>{importResult.warnings.length}</p>
                  <p className={`text-xs ${importResult.warnings.length > 0 ? "text-amber-500" : "text-slate-400"}`}>Warnings</p>
                </div>
              </div>

              {importResult.failed.length > 0 && (
                <div className="border border-rose-100 rounded-xl overflow-hidden">
                  <div className="bg-rose-50 px-4 py-2 text-xs font-bold text-rose-600 uppercase tracking-wider">Failed rows</div>
                  <div className="divide-y divide-rose-50 max-h-36 overflow-y-auto">
                    {importResult.failed.map((f, i) => (
                      <div key={i} className="px-4 py-2 flex items-start gap-2 text-xs">
                        <AlertCircle className="w-3.5 h-3.5 text-rose-400 mt-0.5 shrink-0" />
                        <span className="text-slate-500 font-medium mr-2">Row {f.row}</span>
                        <span className="text-rose-600">{f.error}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {importResult.warnings.length > 0 && (
                <div className="border border-amber-100 rounded-xl overflow-hidden">
                  <div className="bg-amber-50 px-4 py-2 text-xs font-bold text-amber-600 uppercase tracking-wider">Warnings</div>
                  <div className="divide-y divide-amber-50 max-h-28 overflow-y-auto">
                    {importResult.warnings.slice(0, 10).map((w, i) => (
                      <div key={i} className="px-4 py-2 flex items-start gap-2 text-xs">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-400 mt-0.5 shrink-0" />
                        <span className="text-slate-500 font-medium mr-2">Row {w.row}</span>
                        <span className="text-amber-700">{w.warning}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <Button variant="outline" className="w-full rounded-xl border-slate-200" disabled={!XLSX}
                onClick={() => generateReport(XLSX, { entityName, ...importResult, currentUser, fileName: file?.name })}>
                <Download className="w-4 h-4 mr-2" /> Download Import Report (.xlsx)
              </Button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 bg-slate-50/40 shrink-0">
          <Button variant="ghost" className="rounded-xl text-sm"
            onClick={() => {
              if (step === "upload" || step === "done") handleClose();
              else if (step === "mapping") setStep("upload");
              else if (step === "audit") setStep("mapping");
            }}
            disabled={step === "importing"}>
            {step === "upload" || step === "done"
              ? <><X className="w-4 h-4 mr-1" /> {step === "done" ? "Close" : "Cancel"}</>
              : <><ChevronLeft className="w-4 h-4 mr-1" /> Back</>}
          </Button>
          <div className="flex gap-2">
            {step === "mapping" && (
              <Button className="bg-emerald-600 hover:bg-emerald-700 rounded-xl text-sm" onClick={goToAudit}>
                Run Audit <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            )}
            {step === "audit" && !fetchingExisting && (
              <Button
                className="bg-emerald-600 hover:bg-emerald-700 rounded-xl text-sm"
                onClick={handleImport}
                disabled={selectedCount === 0}>
                Import {selectedCount} {entityName} <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}