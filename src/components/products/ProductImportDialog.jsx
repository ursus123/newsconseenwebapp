import React, { useState, useRef, useCallback, useEffect } from "react";

// Load SheetJS from CDN dynamically
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  Upload, FileSpreadsheet, CheckCircle2, AlertCircle, Download,
  ChevronRight, ChevronLeft, X, Info
} from "lucide-react";

// ── Product field definitions ───────────────────────────────────────────────
const PRODUCT_FIELDS = [
  { key: "name",             label: "Name *" },
  { key: "sku",              label: "SKU / Code" },
  { key: "description",      label: "Description" },
  { key: "item_type",        label: "Item Type" },
  { key: "category",         label: "Category" },
  { key: "stock_quantity",   label: "Stock Quantity" },
  { key: "unit",             label: "Unit" },
  { key: "min_stock_level",  label: "Min Stock Level" },
  { key: "cost_price",       label: "Cost Price" },
  { key: "unit_price",       label: "Unit Price" },
  { key: "condition",        label: "Condition" },
  { key: "status",           label: "Status" },
  { key: "supplier",         label: "Supplier" },
  { key: "serial_number",    label: "Serial Number" },
  { key: "warranty_end_date","label": "Warranty End Date" },
  { key: "acquisition_date", label: "Acquisition Date" },
];

const FIELD_KEYS = PRODUCT_FIELDS.map((f) => f.key);

// Auto-mapping rules: [pattern, fieldKey]
const MAPPING_RULES = [
  [/product.?name|^name$|^item$/i, "name"],
  [/sku|code|barcode/i, "sku"],
  [/^type$|item.?type|category.?type/i, "item_type"],
  [/^category$|group/i, "category"],
  [/quantity|qty|stock/i, "stock_quantity"],
  [/^unit$|uom/i, "unit"],
  [/min.?stock|reorder/i, "min_stock_level"],
  [/^cost$|purchase.?price|cost.?price/i, "cost_price"],
  [/^price$|selling.?price|unit.?price/i, "unit_price"],
  [/condition|state/i, "condition"],
  [/^status$/i, "status"],
  [/description|notes/i, "description"],
  [/supplier|vendor/i, "supplier"],
  [/serial/i, "serial_number"],
  [/warranty/i, "warranty_end_date"],
  [/acquisition|purchase.?date/i, "acquisition_date"],
];

function autoMap(header) {
  for (const [regex, field] of MAPPING_RULES) {
    if (regex.test(header.trim())) return field;
  }
  return "__skip__";
}

// Smart item_type detection from name/category
const ITEM_TYPE_KEYWORDS = [
  [/laptop|computer|printer|projector|tablet|monitor|server|scanner|camera/i, "equipment"],
  [/chair|desk|table|board|furniture|shelf|cabinet/i, "equipment"],
  [/book|textbook|notebook|pen|pencil|marker|paper|binder/i, "consumable"],
  [/medicine|drug|capsule|syrup|injection|pill|tablet|vaccine|cream/i, "medication"],
  [/software|license|subscription|digital|app/i, "digital_item"],
  [/raw|material|ingredient|chemical|fabric|metal/i, "raw_material"],
];

function detectItemType(name = "", category = "") {
  const combined = `${name} ${category}`.toLowerCase();
  for (const [regex, type] of ITEM_TYPE_KEYWORDS) {
    if (regex.test(combined)) return type;
  }
  return "consumable";
}

// ── Template generation ────────────────────────────────────────────────────
function downloadTemplate(XLSX) {
  if (!XLSX) return;
  const wb = XLSX.utils.book_new();

  // Sheet 1: Products
  const headers = ["name", "sku", "description", "item_type", "category", "stock_quantity", "unit", "min_stock_level", "cost_price", "unit_price", "status", "condition", "supplier", "serial_number", "warranty_end_date", "acquisition_date"];
  const example = ["Sample Product", "SKU-001", "A sample product description", "inventory_item", "other", 100, "piece", 10, 5.00, 9.99, "active", "new", "ACME Corp", "SN-12345", "2026-12-31", "2024-01-01"];

  const ws = XLSX.utils.aoa_to_sheet([headers, example]);

  // Column widths
  ws["!cols"] = headers.map((h) => ({ wch: Math.max(h.length + 4, 14) }));

  // Header styling
  headers.forEach((_, i) => {
    const cellRef = XLSX.utils.encode_cell({ r: 0, c: i });
    if (!ws[cellRef]) return;
    ws[cellRef].s = { font: { bold: true }, fill: { fgColor: { rgb: "22C55E" } }, alignment: { horizontal: "center" } };
  });

  XLSX.utils.book_append_sheet(wb, ws, "Products");

  // Sheet 2: Instructions
  const instrData = [
    ["Column", "Required", "Description", "Valid Values"],
    ["name", "Yes", "Product or item name", "Any text"],
    ["sku", "No", "Unique SKU or barcode", "Any text"],
    ["description", "No", "Item description or notes", "Any text"],
    ["item_type", "No", "Type of item", "inventory_item, fixed_asset, service_item, digital_item, consumable, raw_material, medication, other"],
    ["category", "No", "Product category", "electronics, food_beverage, clothing, office_supplies, raw_materials, tools_equipment, health_beauty, household, vehicles, equipment, other"],
    ["stock_quantity", "No", "Current stock on hand", "Number"],
    ["unit", "No", "Unit of measure", "piece, kg, liter, meter, box, pack, dozen, other"],
    ["min_stock_level", "No", "Reorder point", "Number"],
    ["cost_price", "No", "Purchase/cost price", "Number (e.g. 9.99)"],
    ["unit_price", "No", "Selling price", "Number (e.g. 14.99)"],
    ["status", "No", "Item status", "active, discontinued, out_of_stock, archived"],
    ["condition", "No", "Physical condition", "new, good, fair, poor, damaged, under_repair"],
    ["supplier", "No", "Supplier or vendor name", "Any text"],
    ["serial_number", "No", "Serial number", "Any text"],
    ["warranty_end_date", "No", "Warranty expiry date", "YYYY-MM-DD"],
    ["acquisition_date", "No", "Date purchased/acquired", "YYYY-MM-DD"],
  ];
  const wsInstr = XLSX.utils.aoa_to_sheet(instrData);
  wsInstr["!cols"] = [{ wch: 22 }, { wch: 10 }, { wch: 40 }, { wch: 70 }];
  XLSX.utils.book_append_sheet(wb, wsInstr, "Instructions");

  XLSX.writeFile(wb, "products_import_template.xlsx");
}

// ── Import report ──────────────────────────────────────────────────────────
function downloadImportReport({ imported, failed, currentUser, XLSX }) {
  if (!XLSX) return;
  const wb = XLSX.utils.book_new();
  const now = new Date();

  // Sheet 1: Imported
  const importedHeaders = ["id", ...FIELD_KEYS];
  const importedRows = imported.map((p) => importedHeaders.map((k) => p[k] ?? ""));
  const wsImported = XLSX.utils.aoa_to_sheet([importedHeaders, ...importedRows]);
  wsImported["!cols"] = importedHeaders.map(() => ({ wch: 18 }));
  XLSX.utils.book_append_sheet(wb, wsImported, "Imported");

  // Sheet 2: Failed
  const wsFailedData = [["row_index", "name", "sku", "error"], ...failed.map((f) => [f.rowIndex, f.name || "", f.sku || "", f.error])];
  const wsFailed = XLSX.utils.aoa_to_sheet(wsFailedData);
  wsFailed["!cols"] = [{ wch: 10 }, { wch: 30 }, { wch: 20 }, { wch: 60 }];
  XLSX.utils.book_append_sheet(wb, wsFailed, "Failed");

  // Sheet 3: Summary
  const wsSummaryData = [
    ["Import Summary"],
    [],
    ["Total Imported", imported.length],
    ["Total Failed", failed.length],
    ["Import Date", now.toLocaleDateString()],
    ["Import Time", now.toLocaleTimeString()],
    ["Imported By", currentUser?.email || "unknown"],
  ];
  const wsSummary = XLSX.utils.aoa_to_sheet(wsSummaryData);
  wsSummary["!cols"] = [{ wch: 22 }, { wch: 30 }];
  XLSX.utils.book_append_sheet(wb, wsSummary, "Summary");

  XLSX.writeFile(wb, `import_report_${now.toISOString().slice(0, 10)}.xlsx`);
}

// ── Main Component ─────────────────────────────────────────────────────────
const STEPS = ["upload", "mapping", "preview", "done"];

export default function ProductImportDialog({ open, onClose, onImport, currentUser }) {
  const XLSX = useXLSX();
  const [step, setStep] = useState("upload");
  const [file, setFile] = useState(null);
  const [sheets, setSheets] = useState([]);
  const [selectedSheet, setSelectedSheet] = useState("");
  const [rawHeaders, setRawHeaders] = useState([]);
  const [rawRows, setRawRows] = useState([]);
  const [mapping, setMapping] = useState({});
  const [preview, setPreview] = useState([]);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef();

  const reset = () => {
    setStep("upload"); setFile(null); setSheets([]); setSelectedSheet("");
    setRawHeaders([]); setRawRows([]); setMapping({}); setPreview([]);
    setImporting(false); setImportResult(null);
  };

  const handleClose = () => { reset(); onClose(); };

  // Parse workbook into rows
  const parseSheet = useCallback((wb, sheetName) => {
    const ws = wb.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
    if (!data.length) return { headers: [], rows: [] };
    const headers = data[0].map(String);
    const rows = data.slice(1).filter((r) => r.some((c) => c !== "" && c != null));
    return { headers, rows };
  }, []);

  const handleFile = useCallback((f) => {
    if (!f) return;
    setFile(f);
    const reader = new FileReader();
    reader.onload = (e) => {
      const data = new Uint8Array(e.target.result);
      const wb = XLSX.read(data, { type: "array" });
      const sheetNames = wb.SheetNames;
      setSheets(sheetNames);
      const firstSheet = sheetNames[0];
      setSelectedSheet(firstSheet);
      const { headers, rows } = parseSheet(wb, firstSheet);
      setRawHeaders(headers);
      setRawRows(rows);
      // Auto-map
      const initMap = {};
      headers.forEach((h) => { initMap[h] = autoMap(h); });
      setMapping(initMap);
      setStep("mapping");
    };
    reader.readAsArrayBuffer(f);
  }, [parseSheet]);

  const handleSheetChange = (sheetName) => {
    setSelectedSheet(sheetName);
    const reader = new FileReader();
    reader.onload = (e) => {
      const data = new Uint8Array(e.target.result);
      const wb = XLSX.read(data, { type: "array" });
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
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  // Build preview rows from mapping
  const buildPreview = () => {
    const hasItemTypeCol = Object.values(mapping).includes("item_type");
    const mapped = rawRows.map((row) => {
      const obj = {};
      rawHeaders.forEach((h, i) => {
        const field = mapping[h];
        if (field && field !== "__skip__") obj[field] = row[i] !== undefined ? String(row[i]) : "";
      });
      // Auto-detect item_type if not mapped
      if (!hasItemTypeCol || !obj.item_type) {
        obj._auto_item_type = detectItemType(obj.name, obj.category);
        obj.item_type = obj._auto_item_type;
      }
      return obj;
    });
    setPreview(mapped);
    setStep("preview");
  };

  const handleImport = async () => {
    setImporting(true);
    const succeeded = [];
    const failed = [];
    for (let i = 0; i < preview.length; i++) {
      const row = { ...preview[i] };
      delete row._auto_item_type;
      if (!row.name) { failed.push({ rowIndex: i + 2, ...row, error: "Missing required field: name" }); continue; }
      // Coerce numbers
      ["stock_quantity", "min_stock_level", "cost_price", "unit_price"].forEach((k) => {
        if (row[k]) { const n = parseFloat(row[k]); if (!isNaN(n)) row[k] = n; else delete row[k]; }
      });
      try {
        const created = await onImport(row);
        succeeded.push({ ...row, id: created?.id || "" });
      } catch (err) {
        failed.push({ rowIndex: i + 2, ...row, error: err?.message || "Unknown error" });
      }
    }
    setImportResult({ imported: succeeded, failed });
    setStep("done");
    setImporting(false);
  };

  const stepIndex = STEPS.indexOf(step);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl w-full p-0 overflow-hidden flex flex-col max-h-[90vh]">
        <DialogHeader className="px-6 pt-5 pb-4 border-b border-slate-100 shrink-0">
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2 text-slate-800">
              <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
              Bulk Import Products
            </DialogTitle>
            {/* Step indicator */}
            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              {["Upload", "Map Columns", "Preview", "Done"].map((s, i) => (
                <React.Fragment key={s}>
                  <span className={`px-2 py-0.5 rounded-full font-medium ${i === stepIndex ? "bg-emerald-100 text-emerald-700" : i < stepIndex ? "text-emerald-600" : "text-slate-400"}`}>{s}</span>
                  {i < 3 && <ChevronRight className="w-3 h-3" />}
                </React.Fragment>
              ))}
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto">

          {/* ── Step 1: Upload ─────────────────────────────────── */}
          {step === "upload" && (
            <div className="p-6 space-y-5">
              {/* Drop zone */}
              <div
                className={`relative border-2 border-dashed rounded-2xl p-10 text-center transition-colors cursor-pointer ${dragOver ? "border-emerald-400 bg-emerald-50" : "border-slate-200 hover:border-emerald-300 hover:bg-slate-50"}`}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="w-10 h-10 mx-auto text-slate-300 mb-3" />
                <p className="text-sm font-semibold text-slate-600 mb-1">Drag and drop your CSV or Excel file here</p>
                <p className="text-xs text-slate-400">Supports .csv, .xlsx, .xls</p>
                <input ref={fileInputRef} type="file" className="hidden" accept=".csv,.xlsx,.xls" onChange={(e) => handleFile(e.target.files[0])} />
              </div>

              {/* Template download */}
              <div className="flex items-center justify-between bg-slate-50 rounded-xl px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-slate-700">Need a template?</p>
                  <p className="text-xs text-slate-400">Download the Excel template with instructions and data validation.</p>
                </div>
                <Button variant="outline" size="sm" className="rounded-xl shrink-0" onClick={downloadTemplate}>
                  <Download className="w-4 h-4 mr-2" /> Excel Template
                </Button>
              </div>
            </div>
          )}

          {/* ── Step 2: Column Mapping ─────────────────────────── */}
          {step === "mapping" && (
            <div className="p-6 space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-slate-700">{file?.name}</p>
                  <p className="text-xs text-slate-400">{rawRows.length} data rows detected</p>
                </div>
                {/* Sheet selector */}
                {sheets.length > 1 && (
                  <div className="flex items-center gap-2 shrink-0">
                    <Label className="text-xs text-slate-500 whitespace-nowrap">Select sheet:</Label>
                    <Select value={selectedSheet} onValueChange={handleSheetChange}>
                      <SelectTrigger className="w-40 h-8 text-xs rounded-xl"><SelectValue /></SelectTrigger>
                      <SelectContent>{sheets.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              <div className="border border-slate-100 rounded-xl overflow-hidden">
                <div className="grid grid-cols-2 bg-slate-50 px-4 py-2.5 text-xs font-bold text-slate-500 uppercase tracking-wider">
                  <span>Your Column Name</span>
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
                          {PRODUCT_FIELDS.map((f) => <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-500 bg-blue-50 rounded-xl px-4 py-2.5">
                <Info className="w-4 h-4 text-blue-500 shrink-0" />
                Columns not mapped will be skipped. If <strong className="mx-1">item_type</strong> is not mapped, it will be auto-detected from the product name and category.
              </div>
            </div>
          )}

          {/* ── Step 3: Preview ────────────────────────────────── */}
          {step === "preview" && (
            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-slate-600"><span className="font-semibold text-slate-800">{preview.length}</span> products ready to import</p>
              </div>
              <div className="border border-slate-100 rounded-xl overflow-hidden">
                <div className="overflow-x-auto max-h-96">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 sticky top-0">
                      <tr>
                        {["Name", "SKU", "Item Type", "Category", "Stock", "Price", "Status"].map((h) => (
                          <th key={h} className="px-3 py-2.5 text-left font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {preview.slice(0, 50).map((row, i) => (
                        <tr key={i} className="hover:bg-slate-50">
                          <td className="px-3 py-2 font-medium text-slate-800 whitespace-nowrap max-w-[180px] truncate">{row.name || <span className="text-rose-500">MISSING</span>}</td>
                          <td className="px-3 py-2 text-slate-500">{row.sku || "—"}</td>
                          <td className="px-3 py-2">
                            <span className="inline-flex items-center gap-1">
                              <Badge className="bg-purple-50 text-purple-700 text-[10px]">{(row.item_type || "—").replace(/_/g, " ")}</Badge>
                              {row._auto_item_type && <span className="text-[9px] text-slate-400">auto</span>}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-slate-500">{row.category || "—"}</td>
                          <td className="px-3 py-2 text-slate-500">{row.stock_quantity || "—"}</td>
                          <td className="px-3 py-2 text-slate-500">{row.unit_price ? `$${row.unit_price}` : "—"}</td>
                          <td className="px-3 py-2"><Badge className="bg-emerald-50 text-emerald-700 text-[10px]">{row.status || "active"}</Badge></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {preview.length > 50 && <p className="text-xs text-slate-400 text-center py-2">Showing first 50 of {preview.length} rows</p>}
              </div>
              {preview.some((r) => !r.name) && (
                <div className="flex items-center gap-2 text-xs text-rose-600 bg-rose-50 rounded-xl px-4 py-2.5">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {preview.filter((r) => !r.name).length} rows are missing the required <strong className="mx-1">name</strong> field and will be skipped.
                </div>
              )}
            </div>
          )}

          {/* ── Step 4: Done ──────────────────────────────────── */}
          {step === "done" && importResult && (
            <div className="p-6 space-y-5">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-8 h-8 text-emerald-500 shrink-0" />
                <div>
                  <p className="font-semibold text-slate-800">Import complete!</p>
                  <p className="text-sm text-slate-500">{importResult.imported.length} imported · {importResult.failed.length} failed</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-emerald-50 rounded-xl px-4 py-3">
                  <p className="text-2xl font-black text-emerald-700">{importResult.imported.length}</p>
                  <p className="text-xs text-emerald-600">Successfully imported</p>
                </div>
                <div className={`${importResult.failed.length > 0 ? "bg-rose-50" : "bg-slate-50"} rounded-xl px-4 py-3`}>
                  <p className={`text-2xl font-black ${importResult.failed.length > 0 ? "text-rose-600" : "text-slate-400"}`}>{importResult.failed.length}</p>
                  <p className={`text-xs ${importResult.failed.length > 0 ? "text-rose-500" : "text-slate-400"}`}>Failed rows</p>
                </div>
              </div>

              {importResult.failed.length > 0 && (
                <div className="border border-rose-100 rounded-xl overflow-hidden">
                  <div className="bg-rose-50 px-4 py-2.5 text-xs font-bold text-rose-600 uppercase tracking-wider">Failed rows</div>
                  <div className="divide-y divide-rose-50 max-h-40 overflow-y-auto">
                    {importResult.failed.map((f, i) => (
                      <div key={i} className="px-4 py-2 flex items-start gap-2 text-xs">
                        <AlertCircle className="w-3.5 h-3.5 text-rose-400 mt-0.5 shrink-0" />
                        <span className="text-slate-600 font-medium mr-2">Row {f.rowIndex}</span>
                        <span className="text-rose-600">{f.error}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <Button variant="outline" className="w-full rounded-xl border-slate-200" onClick={() => downloadImportReport({ imported: importResult.imported, failed: importResult.failed, currentUser })}>
                <Download className="w-4 h-4 mr-2" /> Download Import Report (.xlsx)
              </Button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 bg-slate-50/40 shrink-0">
          <Button variant="ghost" onClick={step === "upload" ? handleClose : () => setStep(STEPS[stepIndex - 1])} className="rounded-xl text-sm">
            {step === "upload" ? <><X className="w-4 h-4 mr-1" /> Cancel</> : <><ChevronLeft className="w-4 h-4 mr-1" /> Back</>}
          </Button>
          <div className="flex gap-2">
            {step === "mapping" && (
              <Button className="bg-emerald-600 hover:bg-emerald-700 rounded-xl text-sm" onClick={buildPreview}>
                Preview <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            )}
            {step === "preview" && (
              <Button className="bg-emerald-600 hover:bg-emerald-700 rounded-xl text-sm" onClick={handleImport} disabled={importing || preview.filter((r) => r.name).length === 0}>
                {importing ? "Importing…" : `Import ${preview.filter((r) => r.name).length} Products`}
              </Button>
            )}
            {step === "done" && (
              <Button className="bg-emerald-600 hover:bg-emerald-700 rounded-xl text-sm" onClick={handleClose}>Done</Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}