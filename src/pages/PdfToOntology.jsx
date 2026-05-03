/**
 * PdfToOntology.jsx — Phase J (Phase 13)
 *
 * PDF → AI entity extraction → Ingestion Agent → Base44 ontology
 *
 * Pipeline:
 *  1. Upload PDF → base44 file storage
 *  2. LLM extracts structured records (people, enterprises, products, etc.)
 *  3. Records serialised to JSON → POST to /ingestion/upload
 *  4. Ingestion Agent returns field-map plan → user reviews
 *  5. POST /ingestion/load/{plan_id} → records land in Base44
 */
import React, { useState, useRef, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import {
  ChevronLeft, Upload, FileText, Brain, Loader2,
  CheckCircle2, AlertTriangle, Layers, ArrowRight, X,
  RefreshCw, Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const RAILWAY_URL   = "https://newsconseenwebapp-production.up.railway.app";
const RAILWAY_API_KEY = import.meta.env?.VITE_RAILWAY_API_KEY || "";

const ENTITY_HINTS = [
  { key: "auto",        label: "Auto-detect",   desc: "Let AI decide what's in the PDF"  },
  { key: "people",      label: "People",         desc: "Names, contacts, staff, patients" },
  { key: "enterprises", label: "Enterprises",    desc: "Companies, branches, locations"   },
  { key: "products",    label: "Products",       desc: "Items, inventory, medications"    },
  { key: "transactions",label: "Transactions",   desc: "Invoices, receipts, payments"     },
];

function apiHeaders() {
  return RAILWAY_API_KEY ? { "x-api-key": RAILWAY_API_KEY } : {};
}

// ── Confidence badge ──────────────────────────────────────────────────────────
function ConfBadge({ score }) {
  const pct = Math.round((score || 0) * 100);
  if (score >= 0.9)  return <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">{pct}% · High</span>;
  if (score >= 0.65) return <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800">{pct}% · Review</span>;
  return <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-800">{pct}% · Low</span>;
}

// ── Plan review ───────────────────────────────────────────────────────────────
function PlanReview({ plan, loading, onApprove, onReset }) {
  const analysis = plan.analysis || {};
  const splits   = analysis.entity_splits || [];
  const fieldMap = analysis.field_map     || [];
  const conf     = analysis.overall_confidence ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200 text-sm">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-slate-500" />
          <span className="text-slate-700 font-medium">{plan.source_name}</span>
        </div>
        <span className="text-slate-500">{plan.row_count?.toLocaleString()} records</span>
        <ConfBadge score={conf} />
        {plan.from_memory && (
          <span className="px-2 py-0.5 rounded-full text-xs bg-violet-100 text-violet-700 font-bold">memory recall</span>
        )}
      </div>

      {analysis.analyst_notes && (
        <p className="text-sm text-blue-700 bg-blue-50 border border-blue-200 rounded-xl px-3 py-2.5 italic">
          {analysis.analyst_notes}
        </p>
      )}

      {splits.length > 0 && (
        <div>
          <p className="text-xs text-slate-500 mb-2 flex items-center gap-1">
            <Layers className="w-3 h-3" /> Detected entities
          </p>
          <div className="flex flex-wrap gap-2">
            {splits.map((s, i) => (
              <span key={i} className="text-xs px-2.5 py-1 bg-blue-50 text-blue-800 border border-blue-200 rounded-full font-medium">
                {s.entity_type} · {Math.round((s.row_coverage || 0) * 100)}%
                {s.confidence < 0.65 && " ⚠️"}
              </span>
            ))}
          </div>
        </div>
      )}

      {fieldMap.length > 0 && (
        <div>
          <p className="text-xs text-slate-500 mb-2">{fieldMap.length} column mappings</p>
          <div className="max-h-48 overflow-y-auto rounded-xl border border-slate-200">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 sticky top-0">
                <tr>
                  <th className="text-left px-3 py-2 text-slate-600 font-semibold">Source field</th>
                  <th className="text-left px-3 py-2 text-slate-600 font-semibold">Maps to</th>
                  <th className="text-left px-3 py-2 text-slate-600 font-semibold">Conf</th>
                </tr>
              </thead>
              <tbody>
                {fieldMap.map((fm, i) => (
                  <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-slate-50/50"}>
                    <td className="px-3 py-1.5 font-mono text-slate-700">{fm.source_column}</td>
                    <td className="px-3 py-1.5 font-mono text-blue-700">{fm.target_entity}.{fm.target_field}</td>
                    <td className="px-3 py-1.5">
                      <span className={fm.confidence >= 0.9 ? "text-emerald-600 font-bold" : fm.confidence >= 0.65 ? "text-amber-600 font-bold" : "text-rose-600 font-bold"}>
                        {Math.round((fm.confidence || 0) * 100)}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {conf < 0.65 && (
        <div className="flex gap-2 p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          Low confidence — review each mapping before loading. The PDF may not contain clearly structured data.
        </div>
      )}

      {plan.status === "pending_review" && (
        <div className="flex gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-500" />
          <span><strong>Review required.</strong> Check column mappings, then click <strong>Approve &amp; Load</strong>.</span>
        </div>
      )}

      <div className="flex gap-3 pt-1">
        <Button onClick={onApprove} disabled={loading} className="bg-blue-600 hover:bg-blue-700 text-white gap-2">
          {loading
            ? <><Loader2 className="w-4 h-4 animate-spin" />Loading…</>
            : plan.status === "pending_review"
              ? <><CheckCircle2 className="w-4 h-4" />Approve &amp; Load</>
              : <><ArrowRight className="w-4 h-4" />Load into Newsconseen</>}
        </Button>
        <Button variant="outline" onClick={onReset} disabled={loading}>Try again</Button>
      </div>
    </div>
  );
}

// ── Result card ───────────────────────────────────────────────────────────────
function ResultCard({ stats, onReset }) {
  const allOk = (stats.entities_failed || 0) === 0;
  return (
    <div className="text-center py-8">
      {allOk
        ? <CheckCircle2 className="w-16 h-16 text-emerald-500 mx-auto mb-4" />
        : <AlertTriangle className="w-16 h-16 text-amber-500 mx-auto mb-4" />}
      <h3 className="text-lg font-bold text-slate-800 mb-1">{allOk ? "Import Complete!" : "Partial Import"}</h3>
      <p className="text-sm text-slate-500 mb-6">Records from your PDF have been loaded into the ontology.</p>
      <div className="flex justify-center gap-8 mb-6">
        {[
          { label: "Created",  value: stats.entities_created, color: "text-emerald-600" },
          { label: "Updated",  value: stats.entities_updated, color: "text-blue-600"    },
          { label: "Skipped",  value: stats.entities_skipped, color: "text-slate-400"   },
          { label: "Failed",   value: stats.entities_failed,  color: "text-rose-500",  hide: !stats.entities_failed },
        ].filter(s => !s.hide).map(s => (
          <div key={s.label}>
            <p className={`text-2xl font-black ${s.color}`}>{s.value ?? 0}</p>
            <p className="text-xs text-slate-400">{s.label}</p>
          </div>
        ))}
      </div>
      <Button variant="outline" onClick={onReset} className="gap-2">
        <RefreshCw className="w-4 h-4" /> Load Another PDF
      </Button>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function PdfToOntology() {
  const qc = useQueryClient();
  const { data: currentUser = null } = useQuery({
    queryKey: ["currentUser"], queryFn: () => base44.auth.me(),
    staleTime: 0, refetchOnMount: "always",
  });
  const companyId = currentUser?.company_id;

  // Step: "upload" | "extracting" | "preview" | "ingesting" | "plan" | "loading" | "done"
  const [step,       setStep]       = useState("upload");
  const [entityHint, setEntityHint] = useState("auto");
  const [file,       setFile]       = useState(null);
  const [dragging,   setDragging]   = useState(false);
  const [error,      setError]      = useState(null);
  const [preview,    setPreview]    = useState(null);   // { records: [], detectedTypes: [] }
  const [plan,       setPlan]       = useState(null);
  const [stats,      setStats]      = useState(null);
  const fileInputRef = useRef();

  const reset = useCallback(() => {
    setStep("upload"); setFile(null); setError(null);
    setPreview(null); setPlan(null); setStats(null);
  }, []);

  const handleFile = useCallback(async (f) => {
    if (!f || !f.name.match(/\.pdf$/i)) { setError("Please upload a PDF file."); return; }
    if (!companyId) { setError("You must be logged in with a company account."); return; }
    setFile(f);
    setError(null);
    setStep("extracting");

    try {
      // 1 — Upload PDF to base44 storage for LLM access
      const { file_url } = await base44.integrations.Core.UploadFile({ file: f });

      // 2 — LLM entity extraction
      const hintInstruction = entityHint !== "auto"
        ? `Focus on extracting ${entityHint} records. `
        : "";

      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `${hintInstruction}Extract ALL structured entity records from this PDF document.

Rules:
- Output one JSON object per distinct record (person, company, product, transaction, etc.)
- Use consistent field names across records of the same type (e.g. always "first_name", never mix with "name")
- Include every field you can identify: names, dates, amounts, addresses, IDs, status, type, etc.
- If a document contains multiple entity types (e.g. people AND companies), extract all of them
- Do NOT summarise — extract every individual row/entry
- Return an empty records array if the document has no extractable structured data`,
        file_urls: [file_url],
        response_json_schema: {
          type: "object",
          properties: {
            records: {
              type: "array",
              items: { type: "object", additionalProperties: true },
            },
            detected_entity_types: {
              type: "array",
              items: { type: "string" },
              description: "e.g. ['people', 'enterprises', 'products']",
            },
            extraction_notes: {
              type: "string",
              description: "Any notes about data quality or what was found",
            },
          },
          required: ["records", "detected_entity_types"],
        },
      });

      const records       = result?.records       || [];
      const detectedTypes = result?.detected_entity_types || [];
      const notes         = result?.extraction_notes;

      if (records.length === 0) {
        throw new Error("No structured records found in this PDF. Try a PDF with tables, lists, or form data.");
      }

      setPreview({ records, detectedTypes, notes, fileUrl: file_url });
      setStep("preview");
    } catch (e) {
      setError(e.message || "Extraction failed — try a different PDF.");
      setStep("upload");
    }
  }, [companyId, entityHint]);

  const handleIngest = useCallback(async () => {
    if (!preview?.records || !companyId) return;
    setStep("ingesting");
    setError(null);

    try {
      // Convert extracted records to a JSON file
      const jsonBlob = new Blob(
        [JSON.stringify(preview.records, null, 2)],
        { type: "application/json" },
      );
      const jsonFile = new File(
        [jsonBlob],
        `pdf_extract_${file?.name?.replace(".pdf", "") || "document"}.json`,
        { type: "application/json" },
      );

      const fd = new FormData();
      fd.append("file", jsonFile);
      fd.append("company_id", companyId);
      fd.append("source_name", `PDF Extract: ${file?.name || "document"}`);

      const res = await fetch(`${RAILWAY_URL}/ingestion/upload`, {
        method:  "POST",
        headers: apiHeaders(),
        body:    fd,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Ingestion failed (${res.status})`);
      }

      const data = await res.json();
      data.source_name = `PDF Extract: ${file?.name || "document"}`;
      setPlan(data);
      setStep("plan");
    } catch (e) {
      setError(e.message || "Failed to send to ingestion agent.");
      setStep("preview");
    }
  }, [preview, companyId, file]);

  const handleLoad = useCallback(async () => {
    if (!plan?.plan_id || !companyId) return;
    setStep("loading");
    setError(null);

    try {
      if (plan.status === "pending_review") {
        const approveRes = await fetch(
          `${RAILWAY_URL}/ingestion/approve/${plan.plan_id}?company_id=${encodeURIComponent(companyId)}`,
          { method: "POST", headers: apiHeaders() },
        );
        if (!approveRes.ok) {
          const err = await approveRes.json().catch(() => ({}));
          throw new Error(err.detail || `Approval failed (${approveRes.status})`);
        }
      }

      const fd = new FormData();
      fd.append("company_id", companyId);

      const res = await fetch(`${RAILWAY_URL}/ingestion/load/${plan.plan_id}`, {
        method:  "POST",
        headers: apiHeaders(),
        body:    fd,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Load failed (${res.status})`);
      }

      const runStats = await res.json();
      setStats(runStats);
      setStep("done");
      qc.invalidateQueries();
    } catch (e) {
      setError(e.message || "Load failed.");
      setStep("plan");
    }
  }, [plan, companyId, qc]);

  // ── Step labels for breadcrumb ────────────────────────────────────────────
  const STEPS = [
    { key: "upload",     label: "Upload"    },
    { key: "extracting", label: "Extracting" },
    { key: "preview",    label: "Preview"   },
    { key: "ingesting",  label: "Mapping"   },
    { key: "plan",       label: "Review"    },
    { key: "loading",    label: "Loading"   },
    { key: "done",       label: "Done"      },
  ];
  const stepIdx   = STEPS.findIndex(s => s.key === step);
  const visSteps  = [STEPS[0], STEPS[2], STEPS[4], STEPS[6]];

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Top bar */}
      <div className="bg-white border-b border-slate-100 px-4 py-3 flex items-center gap-3">
        <Link to={createPageUrl("Applications")} className="p-2 -ml-2 rounded-lg text-slate-400 hover:bg-slate-100">
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">🧠 PDF to Ontology</p>
          <p className="text-sm font-semibold text-slate-700 leading-tight">Extract records from any PDF and load into Newsconseen</p>
        </div>
      </div>

      {/* Step indicator */}
      <div className="bg-white border-b border-slate-100 px-6 py-3">
        <div className="flex items-center gap-0 max-w-lg">
          {visSteps.map((s, i) => {
            const idx    = STEPS.findIndex(x => x.key === s.key);
            const done   = stepIdx > idx;
            const active = stepIdx === idx || (i < visSteps.length - 1 && stepIdx > idx && stepIdx < STEPS.findIndex(x => x.key === visSteps[i + 1].key));
            return (
              <React.Fragment key={s.key}>
                <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                  done   ? "bg-emerald-100 text-emerald-700" :
                  active ? "bg-blue-600 text-white" :
                           "bg-slate-100 text-slate-400"
                }`}>
                  {done ? <CheckCircle2 className="w-3.5 h-3.5" /> : null}
                  {s.label}
                </div>
                {i < visSteps.length - 1 && (
                  <ArrowRight className="w-3.5 h-3.5 text-slate-300 mx-1 shrink-0" />
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">

        {/* Error banner */}
        {error && (
          <div className="flex items-start gap-3 p-4 bg-rose-50 border border-rose-200 rounded-2xl text-sm text-rose-700">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span className="flex-1">{error}</span>
            <button onClick={() => setError(null)} className="text-rose-300 hover:text-rose-600">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* ── STEP: UPLOAD ── */}
        {step === "upload" && (
          <div className="space-y-5">
            {/* Entity hint */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              <p className="text-sm font-bold text-slate-700 mb-3">What does this PDF contain?</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {ENTITY_HINTS.map(h => (
                  <button
                    key={h.key}
                    onClick={() => setEntityHint(h.key)}
                    className={`px-3 py-2.5 rounded-xl text-left border transition-all ${
                      entityHint === h.key
                        ? "bg-blue-600 text-white border-blue-600"
                        : "bg-white text-slate-700 border-slate-200 hover:border-blue-300"
                    }`}
                  >
                    <p className="text-xs font-bold">{h.label}</p>
                    <p className={`text-[10px] mt-0.5 ${entityHint === h.key ? "text-blue-100" : "text-slate-400"}`}>
                      {h.desc}
                    </p>
                  </button>
                ))}
              </div>
            </div>

            {/* Drop zone */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
              <label
                onDragOver={e => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
                className={`flex flex-col items-center justify-center gap-4 border-2 border-dashed rounded-2xl p-12 cursor-pointer transition-all
                  ${dragging ? "border-blue-400 bg-blue-50" : "border-slate-200 bg-slate-50 hover:border-blue-300 hover:bg-blue-50/40"}`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf"
                  className="hidden"
                  onChange={e => { if (e.target.files[0]) handleFile(e.target.files[0]); e.target.value = ""; }}
                />
                <div className="w-16 h-16 rounded-2xl bg-blue-50 flex items-center justify-center">
                  <Brain className="w-8 h-8 text-blue-400" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold text-slate-700">Drop your PDF here, or click to browse</p>
                  <p className="text-xs text-slate-400 mt-1">AI will extract structured records and map them to your ontology</p>
                </div>
              </label>
            </div>

            {/* How it works */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">How it works</p>
              <div className="space-y-2">
                {[
                  { n: "1", text: "Upload any PDF — reports, forms, rosters, price lists, invoices" },
                  { n: "2", text: "AI reads every page and extracts structured records" },
                  { n: "3", text: "The Ingestion Agent maps fields to your ontology (People, Enterprises, Products, etc.)" },
                  { n: "4", text: "You review the mapping, then load — records land in Newsconseen instantly" },
                ].map(row => (
                  <div key={row.n} className="flex items-start gap-3">
                    <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-[10px] font-black flex items-center justify-center shrink-0 mt-0.5">{row.n}</span>
                    <p className="text-xs text-slate-600">{row.text}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── STEP: EXTRACTING ── */}
        {step === "extracting" && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-12 flex flex-col items-center gap-5 text-center">
            <Brain className="w-14 h-14 text-blue-500 animate-pulse" />
            <div>
              <p className="text-base font-bold text-slate-800">Extracting records from PDF…</p>
              <p className="text-sm text-slate-500 mt-1">AI is reading {file?.name} and identifying structured data</p>
              <p className="text-xs text-slate-400 mt-2">This typically takes 10–30 seconds depending on PDF size</p>
            </div>
          </div>
        )}

        {/* ── STEP: PREVIEW ── */}
        {step === "preview" && preview && (
          <div className="space-y-4">
            {/* Summary */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-slate-800">
                    {preview.records.length} record{preview.records.length !== 1 ? "s" : ""} extracted from {file?.name}
                  </p>
                  {preview.detectedTypes.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {preview.detectedTypes.map(t => (
                        <span key={t} className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <CheckCircle2 className="w-6 h-6 text-emerald-500 shrink-0" />
              </div>
              {preview.notes && (
                <p className="text-xs text-slate-500 mt-3 italic border-t border-slate-100 pt-3">
                  <Sparkles className="w-3 h-3 inline mr-1 text-violet-400" />
                  {preview.notes}
                </p>
              )}
            </div>

            {/* Sample records */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                  Sample records (showing first {Math.min(5, preview.records.length)} of {preview.records.length})
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      {Object.keys(preview.records[0] || {}).slice(0, 6).map(k => (
                        <th key={k} className="text-left px-3 py-2 font-semibold text-slate-600 whitespace-nowrap">{k}</th>
                      ))}
                      {Object.keys(preview.records[0] || {}).length > 6 && (
                        <th className="text-left px-3 py-2 text-slate-400">+{Object.keys(preview.records[0]).length - 6} more</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.records.slice(0, 5).map((r, i) => (
                      <tr key={i} className={`border-b border-slate-50 ${i % 2 ? "bg-slate-50/40" : ""}`}>
                        {Object.keys(preview.records[0] || {}).slice(0, 6).map(k => (
                          <td key={k} className="px-3 py-2 text-slate-600 font-mono truncate max-w-[150px]">
                            {String(r[k] ?? "").slice(0, 60) || <span className="text-slate-300">—</span>}
                          </td>
                        ))}
                        {Object.keys(preview.records[0] || {}).length > 6 && (
                          <td className="px-3 py-2 text-slate-300">…</td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex gap-3">
              <Button onClick={handleIngest} className="bg-blue-600 hover:bg-blue-700 text-white gap-2 flex-1 sm:flex-none">
                <Layers className="w-4 h-4" />
                Send to Ingestion Agent
              </Button>
              <Button variant="outline" onClick={reset} className="gap-2">
                <X className="w-4 h-4" /> Start over
              </Button>
            </div>
          </div>
        )}

        {/* ── STEP: INGESTING (mapping in progress) ── */}
        {step === "ingesting" && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-12 flex flex-col items-center gap-5 text-center">
            <Layers className="w-14 h-14 text-blue-500 animate-pulse" />
            <div>
              <p className="text-base font-bold text-slate-800">Mapping to ontology…</p>
              <p className="text-sm text-slate-500 mt-1">The Ingestion Agent is profiling your extracted records</p>
            </div>
          </div>
        )}

        {/* ── STEP: PLAN REVIEW ── */}
        {step === "plan" && plan && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <p className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
              <Brain className="w-4 h-4 text-blue-500" />
              Ingestion Agent — Review Mapping
            </p>
            <PlanReview
              plan={plan}
              loading={false}
              onApprove={handleLoad}
              onReset={reset}
            />
          </div>
        )}

        {/* ── STEP: LOADING ── */}
        {step === "loading" && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-12 flex flex-col items-center gap-5 text-center">
            <Loader2 className="w-14 h-14 text-blue-500 animate-spin" />
            <div>
              <p className="text-base font-bold text-slate-800">Loading into Newsconseen…</p>
              <p className="text-sm text-slate-500 mt-1">Creating records in the ontology</p>
            </div>
          </div>
        )}

        {/* ── STEP: DONE ── */}
        {step === "done" && stats && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <ResultCard stats={stats} onReset={reset} />
          </div>
        )}
      </div>
    </div>
  );
}
