import React, { useState, useRef } from "react";
import { Upload, Loader2, X, CheckCircle, AlertCircle, ChevronDown } from "lucide-react";
import { ncClient } from "@/api/ncClient";
import { Button } from "@/components/ui/button";

const ENTITY_SCHEMAS = {
  Person: {
    label: "People",
    fields: ["first_name", "last_name", "email", "phone", "person_type", "primary_role", "status", "city", "country"],
    keywords: ["first_name", "last_name", "person", "employee", "staff", "student", "client", "contact", "volunteer"],
  },
  Enterprise: {
    label: "Enterprises",
    fields: ["enterprise_name", "enterprise_type", "email", "phone", "city", "country", "status"],
    keywords: ["enterprise_name", "company", "enterprise", "organization", "business", "branch"],
  },
  Product: {
    label: "Products / Items",
    fields: ["name", "sku", "item_type", "category", "unit_price", "cost_price", "stock_quantity", "status"],
    keywords: ["name", "product", "item", "sku", "inventory", "stock", "medicine", "equipment"],
  },
  Service: {
    label: "Services",
    fields: ["name", "category", "service_type", "price", "billing_unit", "status"],
    keywords: ["service", "offering", "package", "therapy", "care", "program"],
  },
  Address: {
    label: "Addresses",
    fields: ["label", "address_line1", "city", "state_region", "postal_code", "country"],
    keywords: ["address", "location", "street", "city", "postal", "zip"],
  },
  Task: {
    label: "Tasks",
    fields: ["title", "task_type", "status", "priority", "assigned_to_name", "due_date", "enterprise"],
    keywords: ["task", "title", "assignment", "todo", "activity", "due_date"],
  },
  Transaction: {
    label: "Transactions",
    fields: ["transaction_type", "date", "amount", "description", "enterprise", "payment_status"],
    keywords: ["transaction", "amount", "payment", "invoice", "expense", "revenue", "date"],
  },
  Relationship: {
    label: "Relationships",
    fields: ["relationship_type", "person_name", "enterprise_name", "start_date", "role"],
    keywords: ["relationship", "assignment", "person_name", "enterprise_name", "role"],
  },
};

function detectEntityFromHeaders(headers) {
  const lowerHeaders = headers.map(h => h.toLowerCase().replace(/\s+/g, "_"));
  let bestMatch = null;
  let bestScore = 0;

  for (const [entity, config] of Object.entries(ENTITY_SCHEMAS)) {
    let score = 0;
    for (const kw of config.keywords) {
      if (lowerHeaders.some(h => h.includes(kw))) score++;
    }
    for (const field of config.fields) {
      if (lowerHeaders.some(h => h === field || h.includes(field.split("_")[0]))) score += 2;
    }
    if (score > bestScore) { bestScore = score; bestMatch = entity; }
  }
  return bestScore > 0 ? bestMatch : null;
}

function suggestMapping(fileHeader, targetFields) {
  const h = fileHeader.toLowerCase().replace(/\s+/g, "_");
  for (const field of targetFields) {
    if (h === field) return field;
    if (h.includes(field) || field.includes(h)) return field;
    // Common aliases
    const aliases = {
      first_name: ["firstname", "fname", "given_name"],
      last_name: ["lastname", "lname", "surname", "family_name"],
      enterprise_name: ["company", "organization", "business", "company_name"],
      address_line1: ["address", "street", "street_address"],
      state_region: ["state", "province", "region"],
      postal_code: ["zip", "zipcode", "postcode"],
      stock_quantity: ["quantity", "qty", "stock"],
      unit_price: ["price", "selling_price", "sale_price"],
      cost_price: ["cost", "purchase_price", "buy_price"],
    };
    if (aliases[field] && aliases[field].some(a => h.includes(a))) return field;
  }
  return null;
}

async function parseFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const ext = file.name.split(".").pop().toLowerCase();

    if (ext === "csv") {
      reader.onload = (e) => {
        const text = e.target.result;
        const lines = text.split(/\r?\n/).filter(Boolean);
        if (!lines.length) return reject(new Error("Empty file"));
        const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ""));
        const rows = lines.slice(1).map(line => {
          const vals = line.split(",").map(v => v.trim().replace(/^"|"$/g, ""));
          const obj = {};
          headers.forEach((h, i) => { obj[h] = vals[i] || ""; });
          return obj;
        }).filter(r => Object.values(r).some(v => v));
        resolve({ headers, rows });
      };
      reader.readAsText(file);
    } else if (ext === "xlsx" || ext === "xls") {
      reader.onload = async (e) => {
        try {
          const XLSX = await import("https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm");
          const wb = XLSX.read(e.target.result, { type: "array" });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
          if (!data.length) return reject(new Error("Empty file"));
          const headers = data[0].map(h => String(h || "").trim());
          const rows = data.slice(1).filter(r => r.some(Boolean)).map(r => {
            const obj = {};
            headers.forEach((h, i) => { obj[h] = r[i] != null ? String(r[i]) : ""; });
            return obj;
          });
          resolve({ headers, rows });
        } catch (err) { reject(err); }
      };
      reader.readAsArrayBuffer(file);
    } else if (ext === "pdf") {
      // For PDF: use LLM to extract structured data
      resolve({ headers: [], rows: [], isPdf: true, file });
    } else {
      reject(new Error("Unsupported file type. Use CSV, Excel, or PDF."));
    }
  });
}

const STEPS = { IDLE: "idle", PARSING: "parsing", MAPPING: "mapping", IMPORTING: "importing", DONE: "done", ERROR: "error" };

export default function QuickImportButton({ currentUser }) {
  const [step, setStep] = useState(STEPS.IDLE);
  const [open, setOpen] = useState(false);
  const [parsed, setParsed] = useState(null);
  const [detectedEntity, setDetectedEntity] = useState(null);
  const [selectedEntity, setSelectedEntity] = useState("");
  const [mappings, setMappings] = useState({});
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [resultMsg, setResultMsg] = useState("");
  const [error, setError] = useState("");
  const fileRef = useRef();

  const reset = () => { setStep(STEPS.IDLE); setParsed(null); setDetectedEntity(null); setSelectedEntity(""); setMappings({}); setProgress({ done: 0, total: 0 }); setResultMsg(""); setError(""); };

  const handleFile = async (file) => {
    if (!file) return;
    setStep(STEPS.PARSING);
    setError("");
    try {
      const result = await parseFile(file);

      if (result.isPdf) {
        // Use LLM to extract from PDF
        const { file_url } = await ncClient.integrations.Core.UploadFile({ file });
        const extracted = await ncClient.integrations.Core.InvokeLLM({
          prompt: `Extract all tabular/structured data from this document as a JSON array of objects. Return the raw data rows. Each object should have consistent keys (field names). Return JSON only.`,
          file_urls: [file_url],
          response_json_schema: { type: "object", properties: { rows: { type: "array", items: { type: "object" } } } },
        });
        const rows = extracted?.rows || [];
        const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
        setupMapping({ headers, rows });
      } else {
        setupMapping(result);
      }
    } catch (err) {
      setError(err.message);
      setStep(STEPS.ERROR);
    }
  };

  const setupMapping = ({ headers, rows }) => {
    const detected = detectEntityFromHeaders(headers);
    setDetectedEntity(detected);
    setSelectedEntity(detected || "");
    setParsed({ headers, rows });

    const entity = detected || Object.keys(ENTITY_SCHEMAS)[0];
    const targetFields = ENTITY_SCHEMAS[entity]?.fields || [];
    const autoMappings = {};
    headers.forEach(h => {
      const suggested = suggestMapping(h, targetFields);
      if (suggested) autoMappings[h] = suggested;
    });
    setMappings(autoMappings);
    setStep(STEPS.MAPPING);
  };

  const handleEntityChange = (entity) => {
    setSelectedEntity(entity);
    const targetFields = ENTITY_SCHEMAS[entity]?.fields || [];
    const autoMappings = {};
    (parsed?.headers || []).forEach(h => {
      const suggested = suggestMapping(h, targetFields);
      if (suggested) autoMappings[h] = suggested;
    });
    setMappings(autoMappings);
  };

  const handleImport = async () => {
    if (!selectedEntity || !parsed) return;
    setStep(STEPS.IMPORTING);
    const { rows } = parsed;
    setProgress({ done: 0, total: rows.length });
    let imported = 0;
    const importedIds = [];

    for (const rawRow of rows) {
      const mapped = {};
      for (const [fileCol, entityField] of Object.entries(mappings)) {
        if (entityField && rawRow[fileCol] !== undefined && rawRow[fileCol] !== "") {
          mapped[entityField] = rawRow[fileCol];
        }
      }
      if (Object.keys(mapped).length === 0) continue;
      // Add company_id scope
      if (currentUser?.company_id) mapped.company_id = currentUser.company_id;

      const created = await ncClient.entities[selectedEntity].create(mapped);
      importedIds.push(created.id);
      imported++;
      setProgress({ done: imported, total: rows.length });
      await new Promise(r => setTimeout(r, 100));
    }

    // Store for undo
    localStorage.setItem("lastBulkImport", JSON.stringify({ entityName: selectedEntity + "s", ids: importedIds, importedAt: new Date().toISOString() }));
    window.dispatchEvent(new Event("lastBulkImportChanged"));

    setResultMsg(`Successfully imported ${imported} ${ENTITY_SCHEMAS[selectedEntity]?.label || selectedEntity} records.`);
    setStep(STEPS.DONE);
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all border bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100"
        title="Smart Import — CSV, Excel, or PDF"
      >
        <Upload className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Import</span>
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Upload className="w-5 h-5 text-blue-600" />
            <h2 className="font-bold text-slate-800">Smart Import</h2>
          </div>
          <button onClick={() => { setOpen(false); reset(); }} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Step: IDLE — file picker */}
          {step === STEPS.IDLE && (
            <div>
              <p className="text-sm text-slate-500 mb-4">Upload a CSV, Excel (.xlsx), or PDF file. The system will detect what data it contains and suggest the correct field mappings.</p>
              <div
                className="border-2 border-dashed border-blue-200 rounded-2xl p-10 flex flex-col items-center gap-3 cursor-pointer hover:border-blue-400 hover:bg-blue-50/50 transition-all"
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); handleFile(e.dataTransfer.files[0]); }}
              >
                <Upload className="w-10 h-10 text-blue-300" />
                <p className="font-semibold text-slate-600">Drop file here or click to browse</p>
                <p className="text-xs text-slate-400">Supports CSV, Excel (.xlsx / .xls), PDF</p>
                <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls,.pdf" className="hidden" onChange={(e) => handleFile(e.target.files[0])} />
              </div>
            </div>
          )}

          {/* Step: PARSING */}
          {step === STEPS.PARSING && (
            <div className="flex flex-col items-center gap-3 py-10">
              <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
              <p className="text-slate-600 font-medium">Parsing file and detecting data type...</p>
            </div>
          )}

          {/* Step: MAPPING */}
          {step === STEPS.MAPPING && parsed && (
            <div className="space-y-4">
              {/* Entity selection */}
              <div className="flex items-center gap-3 p-4 bg-blue-50 rounded-xl">
                <div className="flex-1">
                  <p className="text-xs font-semibold text-slate-500 mb-1">Import As</p>
                  <select
                    value={selectedEntity}
                    onChange={(e) => handleEntityChange(e.target.value)}
                    className="text-sm border border-blue-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 w-full"
                  >
                    <option value="">— Select entity type —</option>
                    {Object.entries(ENTITY_SCHEMAS).map(([k, v]) => (
                      <option key={k} value={k}>{v.label}</option>
                    ))}
                  </select>
                </div>
                {detectedEntity && (
                  <div className="shrink-0 px-3 py-1.5 bg-emerald-100 text-emerald-700 rounded-lg text-xs font-semibold">
                    ✓ Auto-detected: {ENTITY_SCHEMAS[detectedEntity]?.label}
                  </div>
                )}
              </div>

              {/* Preview row count */}
              <p className="text-xs text-slate-500"><span className="font-semibold text-slate-700">{parsed.rows.length}</span> rows found in file.</p>

              {/* Column mappings */}
              {selectedEntity && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Column Mappings</p>
                  <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                    {parsed.headers.map((header) => (
                      <div key={header} className="flex items-center gap-2">
                        <div className="w-40 shrink-0 text-xs font-mono text-slate-600 bg-slate-100 px-2 py-1.5 rounded-lg truncate" title={header}>{header}</div>
                        <ChevronDown className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                        <select
                          value={mappings[header] || ""}
                          onChange={(e) => setMappings(m => ({ ...m, [header]: e.target.value }))}
                          className={`flex-1 text-xs border rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400 ${mappings[header] ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-white text-slate-500"}`}
                        >
                          <option value="">— skip —</option>
                          {(ENTITY_SCHEMAS[selectedEntity]?.fields || []).map(f => (
                            <option key={f} value={f}>{f}</option>
                          ))}
                        </select>
                        {mappings[header] && <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={reset} className="rounded-xl">Back</Button>
                <Button size="sm" onClick={handleImport} disabled={!selectedEntity || Object.values(mappings).filter(Boolean).length === 0}
                  className="rounded-xl bg-blue-600 hover:bg-blue-700 text-white flex-1">
                  Import {parsed.rows.length} Records
                </Button>
              </div>
            </div>
          )}

          {/* Step: IMPORTING */}
          {step === STEPS.IMPORTING && (
            <div className="flex flex-col items-center gap-4 py-8">
              <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
              <p className="text-slate-600 font-medium">Importing records...</p>
              <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                <div className="bg-blue-500 h-2 rounded-full transition-all" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
              </div>
              <p className="text-xs text-slate-400">{progress.done} of {progress.total}</p>
            </div>
          )}

          {/* Step: DONE */}
          {step === STEPS.DONE && (
            <div className="flex flex-col items-center gap-3 py-8">
              <CheckCircle className="w-10 h-10 text-emerald-500" />
              <p className="text-slate-700 font-semibold">{resultMsg}</p>
              <p className="text-xs text-slate-400">You can undo this import using the "Undo Import" button.</p>
              <Button size="sm" onClick={() => { setOpen(false); reset(); }} className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white mt-2">Done</Button>
            </div>
          )}

          {/* Step: ERROR */}
          {step === STEPS.ERROR && (
            <div className="flex flex-col items-center gap-3 py-8">
              <AlertCircle className="w-10 h-10 text-rose-500" />
              <p className="text-rose-600 font-semibold">{error}</p>
              <Button size="sm" variant="outline" onClick={reset} className="rounded-xl">Try Again</Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}