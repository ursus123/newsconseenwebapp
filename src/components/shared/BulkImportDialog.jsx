import React, { useState, useRef, useCallback, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  Upload, FileSpreadsheet, CheckCircle2, AlertCircle, Download,
  ChevronRight, ChevronLeft, X, Info, Loader2, AlertTriangle
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

  // Instructions sheet
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
    ["Import Summary"],
    [],
    ["Entity", entityName],
    ["File", fileName],
    ["Imported By", currentUser?.email || "unknown"],
    ["Date", now.toLocaleDateString()],
    ["Time", now.toLocaleTimeString()],
    [],
    ["Total Imported", imported.length],
    ["Total Failed", failed.length],
    ["Total Warnings", (warnings || []).length],
  ];
  const wsSum = XLSX.utils.aoa_to_sheet(wsSumData);
  wsSum["!cols"] = [{ wch: 22 }, { wch: 30 }];
  XLSX.utils.book_append_sheet(wb, wsSum, "Summary");

  XLSX.writeFile(wb, `import_report_${entityName.toLowerCase()}_${now.toISOString().slice(0, 10)}.xlsx`);
}

// ── Steps ──────────────────────────────────────────────────────────────────
const STEPS = ["upload", "mapping", "preview", "importing", "done"];
const STEP_LABELS = ["Upload", "Map Columns", "Preview", "Importing", "Done"];

// ── Main Component ─────────────────────────────────────────────────────────
/**
 * BulkImportDialog - Generic reusable import dialog for any entity
 *
 * Props:
 *   open            - boolean
 *   onClose         - () => void
 *   entityName      - "People" | "Enterprises" | etc.
 *   fields          - [{ key, label, required? }]
 *   mappingRules    - [[/regex/, "field_key"], ...]
 *   templateFileName - string (e.g. "newsconseen_people_import_template.xlsx")
 *   templateExample - object { fieldKey: exampleValue }
 *   templateInstructions - [["col","req","desc","values"], ...]
 *   validateRow     - (row) => { errors: [], warnings: [] }
 *   transformRow    - (row) => row  (optional — clean / coerce types)
 *   onImport        - async (row) => createdRecord
 *   currentUser     - user object
 *   previewColumns  - [{ label, render: (row) => node }]  (up to 6)
 *   requiredField   - string key for the primary required field label in messages
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
  const [progress, setProgress] = useState({ current: 0, total: 0, cancelled: false });
  const [importResult, setImportResult] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef();
  const cancelRef = useRef(false);

  const reset = () => {
    setStep("upload"); setFile(null); setSheets([]); setSelectedSheet("");
    setRawHeaders([]); setRawRows([]); setMapping({}); setPreview([]);
    setProgress({ current: 0, total: 0, cancelled: false }); setImportResult(null);
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

  const buildPreview = () => {
    const mapped = rawRows.map((row) => {
      const obj = {};
      rawHeaders.forEach((h, i) => {
        const field = mapping[h];
        if (field && field !== "__skip__") obj[field] = row[i] !== undefined ? String(row[i]) : "";
      });
      return transformRow ? transformRow(obj) : obj;
    });
    setPreview(mapped);
    setStep("preview");
  };

  const handleImport = async () => {
    cancelRef.current = false;
    setStep("importing");
    const validRows = preview.filter((r) => r[requiredField]);
    setProgress({ current: 0, total: validRows.length, cancelled: false });
    const succeeded = [];
    const failed = [];
    const warnings = [];

    for (let i = 0; i < preview.length; i++) {
      if (cancelRef.current) break;
      const raw = { ...preview[i] };
      const rowNum = i + 2;

      // Strip internal markers and any company_id/created_by from the file
      // (withScope in onImport will stamp the correct values)
      const row = Object.fromEntries(
        Object.entries(raw).filter(([k]) => !k.startsWith("_") && k !== "company_id" && k !== "created_by")
      );

      // Required check
      if (!row[requiredField]) {
        failed.push({ row: rowNum, ...row, error: `Missing required field: ${requiredField}` });
        setProgress((p) => ({ ...p, current: p.current + 1 }));
        continue;
      }

      // Validate
      if (validateRow) {
        const { errors = [], warnings: rowWarns = [] } = validateRow(row);
        if (errors.length) {
          failed.push({ row: rowNum, ...row, error: errors.join("; ") });
          setProgress((p) => ({ ...p, current: p.current + 1 }));
          continue;
        }
        rowWarns.forEach((w) => warnings.push({ row: rowNum, ...row, warning: w }));
      }

      try {
        const created = await onImport(row);
        succeeded.push({ id: created?.id || "", ...row });
        await new Promise(resolve => setTimeout(resolve, 200)); // pace requests to avoid rate limit
      } catch (err) {
        failed.push({ row: rowNum, ...row, error: err?.message || "Unknown error" });
      }
      setProgress((p) => ({ ...p, current: p.current + 1 }));
    }

    setImportResult({ imported: succeeded, failed, warnings, fileName: file?.name });
    setStep("done");
  };

  const stepIndex = STEPS.indexOf(step);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl w-full p-0 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <DialogHeader className="px-6 pt-5 pb-4 border-b border-slate-100 shrink-0">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <DialogTitle className="flex items-center gap-2 text-slate-800">
              <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
              Bulk Import {entityName}
            </DialogTitle>
            <div className="flex items-center gap-1 text-xs text-slate-400">
              {STEP_LABELS.filter((_, i) => i !== 3 || step === "importing").map((s, i) => {
                const si = i >= 3 && step !== "importing" ? i - 1 : i;
                return (
                  <React.Fragment key={s}>
                    <span className={`px-2 py-0.5 rounded-full font-medium ${si === stepIndex ? "bg-emerald-100 text-emerald-700" : si < stepIndex ? "text-emerald-600" : "text-slate-400"}`}>{s}</span>
                    {i < STEP_LABELS.length - 1 && <ChevronRight className="w-3 h-3" />}
                  </React.Fragment>
                );
              })}
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto">

          {/* ── Upload ── */}
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

          {/* ── Mapping ── */}
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

          {/* ── Preview ── */}
          {step === "preview" && (
            <div className="p-6 space-y-4">
              {rawHeaders.includes("company_id") && (
                <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-amber-500" />
                  Your file contains a <strong className="mx-1">company_id</strong> column. It will be ignored — all records will be assigned to your workspace automatically.
                </div>
              )}
              <p className="text-sm text-slate-600">
                <span className="font-semibold text-slate-800">{preview.length}</span> records ready · {" "}
                <span className="text-rose-600">{preview.filter((r) => !r[requiredField]).length} missing {requiredField}</span>
              </p>
              <div className="border border-slate-100 rounded-xl overflow-hidden">
                <div className="overflow-x-auto max-h-96">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 sticky top-0">
                      <tr>
                        {previewColumns.map((c) => (
                          <th key={c.label} className="px-3 py-2.5 text-left font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">{c.label}</th>
                        ))}
                        <th className="px-3 py-2.5 text-left font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {preview.slice(0, 100).map((row, i) => {
                        const validation = validateRow ? validateRow(row) : { errors: [], warnings: [] };
                        const hasError = !row[requiredField] || validation.errors?.length > 0;
                        const hasWarning = validation.warnings?.length > 0;
                        return (
                          <tr key={i} className={hasError ? "bg-rose-50/50" : hasWarning ? "bg-amber-50/30" : "hover:bg-slate-50"}>
                            {previewColumns.map((c) => (
                              <td key={c.label} className="px-3 py-2 text-slate-700">{c.render(row)}</td>
                            ))}
                            <td className="px-3 py-2">
                              {hasError
                                ? <Badge className="bg-rose-100 text-rose-700 text-[10px]">Error</Badge>
                                : hasWarning
                                ? <Badge className="bg-amber-100 text-amber-700 text-[10px]">Warning</Badge>
                                : <Badge className="bg-emerald-50 text-emerald-700 text-[10px]">OK</Badge>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {preview.length > 100 && <p className="text-xs text-slate-400 text-center py-2">Showing first 100 of {preview.length} rows</p>}
              </div>
              {preview.some((r) => !r[requiredField]) && (
                <div className="flex items-center gap-2 text-xs text-rose-600 bg-rose-50 rounded-xl px-4 py-2.5">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {preview.filter((r) => !r[requiredField]).length} rows missing <strong className="mx-1">{requiredField}</strong> will be skipped.
                </div>
              )}
            </div>
          )}

          {/* ── Importing ── */}
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
                    {importResult.imported.length} imported · {importResult.failed.length} failed
                    {importResult.warnings.length > 0 && ` · ${importResult.warnings.length} warnings`}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="bg-emerald-50 rounded-xl px-4 py-3">
                  <p className="text-2xl font-black text-emerald-700">{importResult.imported.length}</p>
                  <p className="text-xs text-emerald-600">Imported</p>
                </div>
                <div className={`${importResult.failed.length > 0 ? "bg-rose-50" : "bg-slate-50"} rounded-xl px-4 py-3`}>
                  <p className={`text-2xl font-black ${importResult.failed.length > 0 ? "text-rose-600" : "text-slate-400"}`}>{importResult.failed.length}</p>
                  <p className={`text-xs ${importResult.failed.length > 0 ? "text-rose-500" : "text-slate-400"}`}>Failed</p>
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
            onClick={step === "upload" || step === "done" ? handleClose : () => setStep(STEPS[stepIndex - 1])}
            disabled={step === "importing"}>
            {step === "upload" || step === "done"
              ? <><X className="w-4 h-4 mr-1" /> {step === "done" ? "Close" : "Cancel"}</>
              : <><ChevronLeft className="w-4 h-4 mr-1" /> Back</>}
          </Button>
          <div className="flex gap-2">
            {step === "mapping" && (
              <Button className="bg-emerald-600 hover:bg-emerald-700 rounded-xl text-sm" onClick={buildPreview}>
                Preview <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            )}
            {step === "preview" && (
              <Button className="bg-emerald-600 hover:bg-emerald-700 rounded-xl text-sm"
                onClick={handleImport}
                disabled={preview.filter((r) => r[requiredField]).length === 0}>
                Import {preview.filter((r) => r[requiredField]).length} {entityName}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}