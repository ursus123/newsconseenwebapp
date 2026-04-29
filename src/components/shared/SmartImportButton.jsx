/**
 * SmartImportButton — universal Ontology Ingestion Agent trigger.
 *
 * Self-contained: fetches its own currentUser, calls /ingestion/upload,
 * shows the plan inline in a Dialog, then calls /copilot/ask with the
 * plan_id to execute via the copilot tool loop.
 *
 * Props:
 *   onComplete(stats)   — called after a successful load (optional)
 *   entityHint          — hint sent in source_name (e.g. "People import")
 *   label               — button label (default "Smart Import")
 *   variant             — "button" | "link" | "ghost"
 *   presetFile          — File object already held by the caller (skips upload step)
 *   className
 */
import React, { useState, useRef, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import {
  Brain, Upload, FileText, Layers, X, Loader2,
  CheckCircle2, AlertTriangle, RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const RAILWAY_URL   = "https://newsconseenwebapp-production.up.railway.app";
const RAILWAY_API_KEY = import.meta.env.VITE_RAILWAY_API_KEY || "";

const SUPPORTED = [".csv", ".xlsx", ".xls", ".json", ".xml"];

function apiHeaders() {
  return RAILWAY_API_KEY ? { "x-api-key": RAILWAY_API_KEY } : {};
}

// ── Confidence badge ─────────────────────────────────────────────────────────
function ConfBadge({ score }) {
  const pct = Math.round((score || 0) * 100);
  if (score >= 0.9)  return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">{pct}% · High</span>;
  if (score >= 0.65) return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">{pct}% · Review</span>;
  return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">{pct}% · Low</span>;
}

// ── Drop zone ────────────────────────────────────────────────────────────────
function DropZone({ onFile, disabled }) {
  const [drag, setDrag] = useState(false);
  const ref = useRef();
  return (
    <div
      className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors
        ${drag ? "border-blue-500 bg-blue-50" : "border-gray-300 hover:border-blue-400 hover:bg-gray-50"}
        ${disabled ? "opacity-50 pointer-events-none" : ""}`}
      onDragOver={e => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={e => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) onFile(f); }}
      onClick={() => ref.current?.click()}
    >
      <Upload className="w-8 h-8 text-gray-400 mx-auto mb-3" />
      <p className="text-sm font-medium text-gray-700 mb-1">Drop your file here</p>
      <p className="text-xs text-gray-400">{SUPPORTED.join("  ")}</p>
      <input ref={ref} type="file" className="hidden" accept={SUPPORTED.join(",")}
        onChange={e => { if (e.target.files[0]) onFile(e.target.files[0]); }} />
    </div>
  );
}

// ── Plan card ────────────────────────────────────────────────────────────────
function PlanCard({ plan, onLoad, onReset, loading }) {
  const analysis = plan.analysis || {};
  const splits   = analysis.entity_splits || [];
  const fieldMap = analysis.field_map     || [];
  const conf     = analysis.overall_confidence ?? 0;

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="flex flex-wrap gap-3 p-3 bg-gray-50 rounded-xl border border-gray-200 text-sm">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-gray-500" />
          <span className="text-gray-700 font-medium">{plan.source_name}</span>
        </div>
        <span className="text-gray-500">{plan.row_count?.toLocaleString()} rows</span>
        <ConfBadge score={conf} />
        {plan.from_memory && (
          <span className="px-2 py-0.5 rounded-full text-xs bg-purple-100 text-purple-700 font-medium">
            memory recall
          </span>
        )}
      </div>

      {/* Analyst notes */}
      {analysis.analyst_notes && (
        <p className="text-sm text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 italic">
          {analysis.analyst_notes}
        </p>
      )}

      {/* Entity splits */}
      {splits.length > 0 && (
        <div>
          <p className="text-xs text-gray-500 mb-2 flex items-center gap-1">
            <Layers className="w-3 h-3" /> Detected entities
          </p>
          <div className="flex flex-wrap gap-2">
            {splits.map((s, i) => (
              <span key={i} className="text-xs px-2 py-1 bg-blue-50 text-blue-800 border border-blue-200 rounded-full">
                {s.entity_type} · {Math.round((s.row_coverage || 0) * 100)}% of rows
                {s.confidence < 0.65 && " ⚠️"}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Field map */}
      {fieldMap.length > 0 && (
        <div>
          <p className="text-xs text-gray-500 mb-2">{fieldMap.length} column mappings</p>
          <div className="max-h-40 overflow-y-auto rounded-lg border border-gray-200">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="text-left px-3 py-2 text-gray-600 font-medium">Source column</th>
                  <th className="text-left px-3 py-2 text-gray-600 font-medium">Maps to</th>
                  <th className="text-left px-3 py-2 text-gray-600 font-medium">Conf</th>
                </tr>
              </thead>
              <tbody>
                {fieldMap.map((fm, i) => (
                  <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                    <td className="px-3 py-1.5 font-mono text-gray-700">{fm.source_column}</td>
                    <td className="px-3 py-1.5 font-mono text-blue-700">{fm.target_entity}.{fm.target_field}</td>
                    <td className="px-3 py-1.5">
                      <span className={`${fm.confidence >= 0.9 ? "text-green-600" : fm.confidence >= 0.65 ? "text-amber-600" : "text-red-600"}`}>
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
        <div className="flex gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>Low confidence — review each mapping before loading. Consider using a more structured file format.</span>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        <Button onClick={onLoad} disabled={loading} className="bg-blue-600 hover:bg-blue-700 text-white">
          {loading
            ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Loading…</>
            : <><Upload className="w-4 h-4 mr-2" />Load into Newsconseen</>}
        </Button>
        <Button variant="outline" onClick={onReset} disabled={loading}>Try different file</Button>
      </div>
    </div>
  );
}

// ── Result card ──────────────────────────────────────────────────────────────
function ResultCard({ stats, onClose }) {
  const allOk = (stats.entities_failed || 0) === 0;
  return (
    <div className="text-center py-6">
      {allOk
        ? <CheckCircle2 className="w-14 h-14 text-green-500 mx-auto mb-3" />
        : <AlertTriangle className="w-14 h-14 text-amber-500 mx-auto mb-3" />}
      <h3 className="text-lg font-bold text-gray-800 mb-1">
        {allOk ? "Import Complete" : "Partial Import"}
      </h3>
      <p className="text-sm text-gray-500 mb-6">Data has been loaded into the Newsconseen ontology.</p>
      <div className="flex justify-center gap-8 mb-6">
        {[
          { label: "Created",  value: stats.entities_created, color: "text-green-600" },
          { label: "Updated",  value: stats.entities_updated, color: "text-blue-600"  },
          { label: "Skipped",  value: stats.entities_skipped, color: "text-gray-400"  },
          { label: "Failed",   value: stats.entities_failed,  color: "text-red-500",  hide: !stats.entities_failed },
        ].filter(s => !s.hide).map(s => (
          <div key={s.label} className="text-center">
            <p className={`text-2xl font-bold ${s.color}`}>{s.value ?? 0}</p>
            <p className="text-xs text-gray-500">{s.label}</p>
          </div>
        ))}
      </div>
      <Button onClick={onClose} className="bg-blue-600 hover:bg-blue-700 text-white">Done</Button>
    </div>
  );
}

// ── Main export ──────────────────────────────────────────────────────────────
export default function SmartImportButton({
  onComplete,
  entityHint    = "",
  label         = "Smart Import",
  variant       = "button",
  presetFile    = null,
  className     = "",
}) {
  const qc = useQueryClient();
  const { data: currentUser } = useQuery({
    queryKey: ["currentUser"],
    queryFn:  () => base44.auth.me(),
    staleTime: 0,
  });
  const companyId = currentUser?.company_id;

  const [open, setOpen]           = useState(false);
  const [phase, setPhase]         = useState("upload");  // upload | analysing | plan | loading | done
  const [plan, setPlan]           = useState(null);
  const [stats, setStats]         = useState(null);
  const [error, setError]         = useState(null);
  const heldFile                  = useRef(null);

  const reset = useCallback(() => {
    setPhase("upload");
    setPlan(null);
    setStats(null);
    setError(null);
    heldFile.current = null;
  }, []);

  const openModal = useCallback(() => {
    reset();
    setOpen(true);
    // If a file was pre-set by the caller, start analysis immediately
    if (presetFile) {
      heldFile.current = presetFile;
      handleFile(presetFile);
    }
  }, [presetFile, reset]);

  const handleFile = useCallback(async (file) => {
    if (!file || !companyId) return;
    const ext = "." + file.name.split(".").pop().toLowerCase();
    if (!SUPPORTED.includes(ext)) {
      setError(`Unsupported type: ${ext}`);
      return;
    }
    heldFile.current = file;
    setPhase("analysing");
    setError(null);

    const fd = new FormData();
    fd.append("file", file);
    fd.append("company_id", companyId);
    fd.append("source_name", entityHint ? `${entityHint} — ${file.name}` : file.name);

    try {
      const res = await fetch(`${RAILWAY_URL}/ingestion/upload`, {
        method: "POST",
        headers: apiHeaders(),
        body: fd,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Upload failed (${res.status})`);
      }
      const data = await res.json();
      data.source_name = entityHint ? `${entityHint} — ${file.name}` : file.name;
      setPlan(data);
      setPhase("plan");
    } catch (e) {
      setError(e.message || "Analysis failed");
      setPhase("upload");
    }
  }, [companyId, entityHint]);

  const handleLoad = useCallback(async () => {
    if (!plan?.plan_id || !companyId) return;
    setPhase("loading");
    setError(null);

    try {
      // If plan is pending_review, approve it first before loading.
      // Backend requires status = "approved" to allow load.
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

      // Rows were cached in analytics.ingestion_plans at upload time — no re-upload needed.
      const fd = new FormData();
      fd.append("company_id", companyId);

      const res = await fetch(`${RAILWAY_URL}/ingestion/load/${plan.plan_id}`, {
        method: "POST",
        headers: apiHeaders(),
        body: fd,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Load failed (${res.status})`);
      }
      const runStats = await res.json();
      setStats(runStats);
      setPhase("done");
      qc.invalidateQueries();
      onComplete?.(runStats);
    } catch (e) {
      setError(e.message || "Load failed");
      setPhase("plan");
    }
  }, [plan, companyId, qc, onComplete]);

  const handleClose = useCallback(() => {
    setOpen(false);
    reset();
  }, [reset]);

  // ── Trigger button ────────────────────────────────────────────────────────
  const triggerEl = variant === "link" ? (
    <button
      onClick={openModal}
      className={`flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 font-medium ${className}`}
    >
      <Brain className="w-4 h-4" />{label}
    </button>
  ) : variant === "ghost" ? (
    <Button variant="ghost" size="sm" onClick={openModal} className={className}>
      <Brain className="w-4 h-4 mr-2" />{label}
    </Button>
  ) : (
    <Button variant="outline" size="sm" onClick={openModal} className={`gap-2 ${className}`}>
      <Brain className="w-4 h-4" />{label}
    </Button>
  );

  return (
    <>
      {triggerEl}

      <Dialog open={open} onOpenChange={v => { if (!v) handleClose(); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Brain className="w-5 h-5 text-blue-600" />
              Smart Import — Ontology Agent
            </DialogTitle>
          </DialogHeader>

          <div className="mt-2">
            {error && (
              <div className="flex items-center gap-2 mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
                <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {phase === "upload" && (
              <DropZone onFile={handleFile} disabled={false} />
            )}

            {phase === "analysing" && (
              <div className="flex flex-col items-center gap-4 py-12">
                <Brain className="w-12 h-12 text-blue-500 animate-pulse" />
                <p className="text-sm text-gray-600 font-medium">Profiling columns and mapping to ontology…</p>
                <p className="text-xs text-gray-400">This takes 5–15 seconds</p>
              </div>
            )}

            {phase === "plan" && plan && (
              <PlanCard
                plan={plan}
                onLoad={handleLoad}
                onReset={reset}
                loading={false}
              />
            )}

            {phase === "loading" && (
              <div className="flex flex-col items-center gap-4 py-12">
                <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
                <p className="text-sm text-gray-600 font-medium">Loading data into Newsconseen…</p>
              </div>
            )}

            {phase === "done" && stats && (
              <ResultCard stats={stats} onClose={handleClose} />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
