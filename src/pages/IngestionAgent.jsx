import React, { useState, useRef, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import PageHeader from "@/components/shared/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/components/ui/use-toast";
import {
  Upload, FileText, Brain, CheckCircle2, AlertTriangle,
  ChevronRight, RefreshCw, Table2, Layers, Database,
  History, Trash2, X,
} from "lucide-react";

const RAILWAY_URL = "https://newsconseenwebapp-production.up.railway.app";
const RAILWAY_API_KEY = import.meta.env.VITE_RAILWAY_API_KEY || "";

const SUPPORTED = [".csv", ".xlsx", ".xls", ".json", ".xml"];

function apiHeaders(extra = {}) {
  return { ...(RAILWAY_API_KEY ? { "x-api-key": RAILWAY_API_KEY } : {}), ...extra };
}

// ── Confidence badge ────────────────────────────────────────────────────────
function ConfBadge({ score }) {
  if (score >= 0.9)  return <Badge className="bg-green-100 text-green-800">{Math.round(score * 100)}% high</Badge>;
  if (score >= 0.65) return <Badge className="bg-amber-100 text-amber-800">{Math.round(score * 100)}% review</Badge>;
  return <Badge className="bg-red-100 text-red-800">{Math.round(score * 100)}% low</Badge>;
}

// ── Status badge ────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const map = {
    pending_review: ["bg-amber-100 text-amber-800", "Needs Review"],
    approved:       ["bg-green-100 text-green-800", "Approved"],
    loaded:         ["bg-blue-100 text-blue-800",   "Loaded"],
    low_confidence: ["bg-red-100 text-red-800",     "Low Confidence"],
    draft:          ["bg-gray-100 text-gray-700",   "Draft"],
  };
  const [cls, label] = map[status] || ["bg-gray-100 text-gray-700", status];
  return <Badge className={cls}>{label}</Badge>;
}

// ── Step indicator ──────────────────────────────────────────────────────────
function Steps({ active }) {
  const steps = [
    { id: 0, label: "Upload",   icon: Upload },
    { id: 1, label: "Review",   icon: Brain },
    { id: 2, label: "Load",     icon: Database },
  ];
  return (
    <div className="flex items-center gap-0 mb-8">
      {steps.map((s, i) => (
        <React.Fragment key={s.id}>
          <div className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors
            ${active === s.id ? "bg-blue-600 text-white" : active > s.id ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
            {active > s.id ? <CheckCircle2 className="w-4 h-4" /> : <s.icon className="w-4 h-4" />}
            {s.label}
          </div>
          {i < steps.length - 1 && <ChevronRight className="w-4 h-4 text-gray-300 mx-1" />}
        </React.Fragment>
      ))}
    </div>
  );
}

// ── Drop zone ───────────────────────────────────────────────────────────────
function DropZone({ onFile, disabled }) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef();

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) onFile(f);
  }, [onFile]);

  return (
    <div
      className={`border-2 border-dashed rounded-xl p-16 text-center cursor-pointer transition-colors
        ${dragging ? "border-blue-500 bg-blue-50" : "border-gray-300 hover:border-blue-400 hover:bg-gray-50"}
        ${disabled ? "opacity-50 pointer-events-none" : ""}`}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
    >
      <Upload className="w-10 h-10 text-gray-400 mx-auto mb-4" />
      <p className="text-lg font-medium text-gray-700 mb-1">Drop your file here</p>
      <p className="text-sm text-gray-500 mb-4">or click to browse</p>
      <p className="text-xs text-gray-400">Supported: {SUPPORTED.join("  ")}</p>
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept={SUPPORTED.join(",")}
        onChange={(e) => e.target.files[0] && onFile(e.target.files[0])}
      />
    </div>
  );
}

// ── Field map table ─────────────────────────────────────────────────────────
function FieldMapTable({ fieldMap }) {
  if (!fieldMap?.length) return <p className="text-sm text-gray-500 italic">No field mappings returned.</p>;
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="w-full text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="text-left px-4 py-2 text-gray-600 font-medium">Source Column</th>
            <th className="text-left px-4 py-2 text-gray-600 font-medium">Entity</th>
            <th className="text-left px-4 py-2 text-gray-600 font-medium">Field</th>
            <th className="text-left px-4 py-2 text-gray-600 font-medium">Confidence</th>
            <th className="text-left px-4 py-2 text-gray-600 font-medium">Transform</th>
          </tr>
        </thead>
        <tbody>
          {fieldMap.map((fm, i) => (
            <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
              <td className="px-4 py-2 font-mono text-xs text-gray-800">{fm.source_column}</td>
              <td className="px-4 py-2">
                <Badge variant="outline" className="text-xs">{fm.target_entity}</Badge>
              </td>
              <td className="px-4 py-2 font-mono text-xs text-blue-700">{fm.target_field}</td>
              <td className="px-4 py-2"><ConfBadge score={fm.confidence} /></td>
              <td className="px-4 py-2 text-xs text-gray-500 italic">{fm.transform_hint || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Entity splits panel ─────────────────────────────────────────────────────
function EntitySplits({ splits }) {
  if (!splits?.length) return null;
  return (
    <div className="flex flex-wrap gap-3">
      {splits.map((s, i) => (
        <div key={i} className="border border-gray-200 rounded-lg px-4 py-3 bg-white shadow-sm min-w-[160px]">
          <p className="font-semibold text-gray-800 text-sm">{s.entity_type}</p>
          <p className="text-xs text-gray-500 mt-0.5">{Math.round((s.row_coverage || 0) * 100)}% of rows</p>
          <p className="text-xs text-gray-400 mt-1 italic line-clamp-2">{s.reason}</p>
          <div className="mt-2"><ConfBadge score={s.confidence} /></div>
        </div>
      ))}
    </div>
  );
}

// ── Run history row ─────────────────────────────────────────────────────────
function RunRow({ run }) {
  const duration = run.finished_at && run.started_at
    ? Math.round((new Date(run.finished_at) - new Date(run.started_at)) / 1000)
    : null;
  return (
    <tr className="border-b border-gray-100 hover:bg-gray-50">
      <td className="px-4 py-3 text-xs text-gray-500 font-mono">{run.id?.slice(0, 8)}…</td>
      <td className="px-4 py-3">
        <Badge className={run.status === "complete" ? "bg-green-100 text-green-800" : run.status === "partial" ? "bg-amber-100 text-amber-800" : "bg-gray-100 text-gray-600"}>
          {run.status}
        </Badge>
      </td>
      <td className="px-4 py-3 text-sm text-gray-700">{run.rows_total ?? "—"}</td>
      <td className="px-4 py-3 text-sm text-green-700">+{run.entities_created ?? 0}</td>
      <td className="px-4 py-3 text-sm text-blue-700">~{run.entities_updated ?? 0}</td>
      <td className="px-4 py-3 text-sm text-red-600">{run.entities_failed ?? 0}</td>
      <td className="px-4 py-3 text-xs text-gray-400">{duration != null ? `${duration}s` : "—"}</td>
    </tr>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function IngestionAgent() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: currentUser = null } = useQuery({
    queryKey: ["currentUser"],
    queryFn: () => base44.auth.me(),
    staleTime: 0,
  });

  const companyId  = currentUser?.company_id;
  const [step, setStep]         = useState(0);  // 0=upload, 1=review, 2=done
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [selectedFile, setSelectedFile]     = useState(null);
  const [plan, setPlan]                     = useState(null);        // response from /ingestion/upload
  const [loading, setLoading]               = useState(false);       // executing the load
  const [runStats, setRunStats]             = useState(null);
  const [runs, setRuns]                     = useState([]);
  const [showHistory, setShowHistory]       = useState(false);

  // ── Upload ──────────────────────────────────────────────────────────────
  async function handleFile(file) {
    const ext = "." + file.name.split(".").pop().toLowerCase();
    if (!SUPPORTED.includes(ext)) {
      toast({ title: "Unsupported format", description: `Use: ${SUPPORTED.join("  ")}`, variant: "destructive" });
      return;
    }
    setSelectedFile(file);
    setUploading(true);
    setUploadProgress(10);

    const fd = new FormData();
    fd.append("file", file);
    fd.append("company_id", companyId);
    fd.append("source_name", file.name);

    try {
      setUploadProgress(30);
      const res = await fetch(`${RAILWAY_URL}/ingestion/upload`, {
        method: "POST",
        headers: apiHeaders(),
        body: fd,
      });
      setUploadProgress(80);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Upload failed (${res.status})`);
      }
      const data = await res.json();
      setUploadProgress(100);
      setPlan(data);
      setStep(1);
      toast({
        title: data.from_memory ? "Schema recognised from memory" : "Analysis complete",
        description: `${data.analysis?.entity_splits?.length ?? 0} entity type(s) detected · ${data.row_count} rows`,
      });
    } catch (e) {
      toast({ title: "Upload failed", description: e.message, variant: "destructive" });
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  }

  // ── Load ────────────────────────────────────────────────────────────────
  async function handleLoad() {
    if (!plan?.plan_id || !selectedFile) return;
    setLoading(true);

    try {
      // Approve first if operator is still on the review screen
      if (plan.status === "pending_review") {
        const approveRes = await fetch(
          `${RAILWAY_URL}/ingestion/approve/${plan.plan_id}?company_id=${companyId}`,
          { method: "POST", headers: apiHeaders() },
        );
        if (!approveRes.ok) {
          const err = await approveRes.json().catch(() => ({}));
          throw new Error(err.detail || `Approve failed (${approveRes.status})`);
        }
        setPlan(prev => ({ ...prev, status: "approved" }));
      }

      const fd = new FormData();
      fd.append("file", selectedFile);
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
      const stats = await res.json();
      setRunStats(stats);
      setStep(2);
      toast({
        title: "Import complete",
        description: `${stats.entities_created} created · ${stats.entities_updated} updated · ${stats.entities_failed} failed`,
      });
      // Invalidate entity queries so list pages refresh
      qc.invalidateQueries();
    } catch (e) {
      toast({ title: "Load failed", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  // ── Load run history ────────────────────────────────────────────────────
  async function loadHistory() {
    try {
      const res = await fetch(`${RAILWAY_URL}/ingestion/runs?company_id=${companyId}`, {
        headers: apiHeaders(),
      });
      if (res.ok) setRuns(await res.json());
    } catch (_) {}
    setShowHistory(true);
  }

  function reset() {
    setStep(0);
    setPlan(null);
    setSelectedFile(null);
    setRunStats(null);
  }

  const analysis = plan?.analysis || {};
  const splits   = analysis.entity_splits   || [];
  const fieldMap = analysis.field_map       || [];
  const rels     = analysis.relationships   || [];
  const overallConf = analysis.overall_confidence ?? 0;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <PageHeader
        title="Ontology Ingestion Agent"
        description="Import any spreadsheet, CSV, JSON or XML file — the agent maps it to the Newsconseen ontology automatically."
        icon={<Brain className="w-5 h-5" />}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={loadHistory}>
              <History className="w-4 h-4 mr-1" /> History
            </Button>
            {step > 0 && (
              <Button variant="outline" size="sm" onClick={reset}>
                <RefreshCw className="w-4 h-4 mr-1" /> New Import
              </Button>
            )}
          </div>
        }
      />

      <Steps active={step} />

      {/* ── Step 0: Upload ── */}
      {step === 0 && (
        <div>
          <DropZone onFile={handleFile} disabled={uploading} />
          {uploading && (
            <div className="mt-6">
              <p className="text-sm text-gray-600 mb-2 flex items-center gap-2">
                <Brain className="w-4 h-4 animate-pulse text-blue-500" />
                Analysing file structure…
              </p>
              <Progress value={uploadProgress} className="h-2" />
            </div>
          )}
        </div>
      )}

      {/* ── Step 1: Review plan ── */}
      {step === 1 && plan && (
        <div className="space-y-6">
          {/* Summary bar */}
          <div className="flex flex-wrap gap-4 p-4 bg-gray-50 rounded-xl border border-gray-200">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-gray-500" />
              <span className="text-sm text-gray-700">{selectedFile?.name}</span>
            </div>
            <div className="flex items-center gap-2">
              <Table2 className="w-4 h-4 text-gray-500" />
              <span className="text-sm text-gray-700">{plan.row_count?.toLocaleString()} rows</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">Overall confidence:</span>
              <ConfBadge score={overallConf} />
            </div>
            {plan.from_memory && (
              <Badge className="bg-purple-100 text-purple-700">
                <Database className="w-3 h-3 mr-1" /> Recalled from memory
              </Badge>
            )}
            <StatusBadge status={plan.status} />
          </div>

          {/* Analyst notes */}
          {analysis.analyst_notes && (
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl text-sm text-blue-800">
              <p className="font-medium mb-1">Agent notes</p>
              <p>{analysis.analyst_notes}</p>
            </div>
          )}

          {/* Entity splits */}
          <div>
            <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
              <Layers className="w-4 h-4" /> Detected Entities
            </h3>
            <EntitySplits splits={splits} />
          </div>

          {/* Field mapping */}
          <div>
            <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
              <Table2 className="w-4 h-4" /> Field Mapping ({fieldMap.length} columns)
            </h3>
            <FieldMapTable fieldMap={fieldMap} />
          </div>

          {/* Relationships */}
          {rels.length > 0 && (
            <div>
              <h3 className="font-semibold text-gray-800 mb-3">Inferred Relationships</h3>
              <div className="flex flex-wrap gap-3">
                {rels.map((r, i) => (
                  <div key={i} className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white">
                    <span className="font-medium text-gray-800">{r.from_entity}</span>
                    <span className="text-gray-400 mx-2">→</span>
                    <span className="text-blue-600 font-mono text-xs">{r.relationship_label}</span>
                    <span className="text-gray-400 mx-2">→</span>
                    <span className="font-medium text-gray-800">{r.to_entity}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Low confidence warning */}
          {plan.status === "low_confidence" && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex gap-3">
              <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-red-800">Low confidence mapping</p>
                <p className="text-sm text-red-700 mt-1">
                  The agent could not confidently map this file. Review each field carefully before loading, or try a more structured file format.
                </p>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <Button
              onClick={handleLoad}
              disabled={loading || plan.status === "low_confidence"}
              title={plan.status === "low_confidence" ? "Fix the mapping confidence issues above before loading" : undefined}
              className="bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? <><RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Loading…</> : <><Database className="w-4 h-4 mr-2" /> Load into Newsconseen</>}
            </Button>
            <Button variant="outline" onClick={reset}>Cancel</Button>
          </div>
          {plan.status === "low_confidence" && (
            <p className="text-xs text-red-600 mt-1">
              Loading is disabled until the mapping issues above are resolved. Try re-uploading a more structured file, or adjust the column mapping manually.
            </p>
          )}
        </div>
      )}

      {/* ── Step 2: Done ── */}
      {step === 2 && runStats && (
        <div className="text-center py-12">
          <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Import Complete</h2>
          <p className="text-gray-600 mb-8">Your data has been mapped and loaded into the Newsconseen ontology.</p>
          <div className="flex justify-center gap-8 mb-10">
            <div className="text-center">
              <p className="text-3xl font-bold text-green-600">{runStats.entities_created}</p>
              <p className="text-sm text-gray-500">Created</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold text-blue-600">{runStats.entities_updated}</p>
              <p className="text-sm text-gray-500">Updated</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold text-gray-400">{runStats.entities_skipped}</p>
              <p className="text-sm text-gray-500">Skipped (duplicates)</p>
            </div>
            {runStats.entities_failed > 0 && (
              <div className="text-center">
                <p className="text-3xl font-bold text-red-500">{runStats.entities_failed}</p>
                <p className="text-sm text-gray-500">Failed</p>
              </div>
            )}
          </div>
          <Button onClick={reset} className="bg-blue-600 hover:bg-blue-700 text-white">
            <Upload className="w-4 h-4 mr-2" /> Import Another File
          </Button>
        </div>
      )}

      {/* ── Run History drawer ── */}
      {showHistory && (
        <div className="fixed inset-0 bg-black/40 z-50 flex justify-end" onClick={() => setShowHistory(false)}>
          <div className="bg-white w-full max-w-2xl h-full overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="font-semibold text-gray-800 flex items-center gap-2">
                <History className="w-4 h-4" /> Import History
              </h2>
              <Button variant="ghost" size="icon" onClick={() => setShowHistory(false)}>
                <X className="w-4 h-4" />
              </Button>
            </div>
            <div className="overflow-x-auto">
              {runs.length === 0 ? (
                <p className="text-center text-gray-500 py-16 text-sm">No runs yet.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left px-4 py-3 text-gray-600 font-medium">Run ID</th>
                      <th className="text-left px-4 py-3 text-gray-600 font-medium">Status</th>
                      <th className="text-left px-4 py-3 text-gray-600 font-medium">Rows</th>
                      <th className="text-left px-4 py-3 text-gray-600 font-medium">Created</th>
                      <th className="text-left px-4 py-3 text-gray-600 font-medium">Updated</th>
                      <th className="text-left px-4 py-3 text-gray-600 font-medium">Failed</th>
                      <th className="text-left px-4 py-3 text-gray-600 font-medium">Duration</th>
                    </tr>
                  </thead>
                  <tbody>
                    {runs.map((r) => <RunRow key={r.id} run={r} />)}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
