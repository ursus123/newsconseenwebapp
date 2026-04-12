// ==============================================================
// N8nEmbed — embed n8n workflows and form triggers inside Newsconseen
//
// Setup:
//   Set VITE_N8N_URL in .env to your n8n instance URL
//   e.g. VITE_N8N_URL=https://your-n8n.railway.app
//
// Three embed modes:
//   1. Form   — embeds a specific workflow's form trigger (most useful)
//   2. Canvas — embeds the workflow builder canvas (admin only)
//   3. Log    — embeds the execution history for a workflow
//
// n8n embed works via ?embed=true on any n8n URL — no SDK needed.
// ==============================================================

import { useState, useRef, useEffect } from "react";
import { Loader2, ExternalLink, AlertCircle, ChevronDown, Zap } from "lucide-react";

const N8N_URL = (import.meta.env.VITE_N8N_URL || "").replace(/\/$/, "");

// Default workflow tabs — configure via env vars or pass as props
const DEFAULT_WORKFLOWS = [
  {
    id:    import.meta.env.VITE_N8N_WORKFLOW_1 || "",
    label: "Automation Workflows",
    mode:  "canvas",   // canvas | form | log
  },
  {
    id:    import.meta.env.VITE_N8N_FORM_1 || "",
    label: "Submit Request",
    mode:  "form",
  },
].filter(w => w.id);

function buildEmbedUrl(workflowId, mode) {
  if (!N8N_URL || !workflowId) return "";
  switch (mode) {
    case "form":
      // n8n form trigger webhook path
      return `${N8N_URL}/form/${workflowId}`;
    case "log":
      return `${N8N_URL}/workflow/${workflowId}/executions?embed=true`;
    case "canvas":
    default:
      return `${N8N_URL}/workflow/${workflowId}?embed=true`;
  }
}

function N8nFrame({ workflowId, mode, height = 480 }) {
  const [status, setStatus] = useState("loading");
  const iframeRef = useRef(null);
  const url = buildEmbedUrl(workflowId, mode);

  useEffect(() => {
    setStatus("loading");
  }, [workflowId, mode]);

  if (!N8N_URL) {
    return (
      <div className="flex flex-col items-center justify-center h-48 bg-slate-50 rounded-xl border border-dashed border-slate-300 gap-2 text-slate-400">
        <AlertCircle className="w-6 h-6 text-amber-400" />
        <p className="text-sm font-medium text-slate-600">n8n not configured</p>
        <p className="text-xs text-center max-w-xs">
          Set <code className="bg-slate-100 px-1 rounded">VITE_N8N_URL</code> in your{" "}
          <code className="bg-slate-100 px-1 rounded">.env</code> file.
        </p>
      </div>
    );
  }

  if (!url) {
    return (
      <div className="flex flex-col items-center justify-center h-48 bg-slate-50 rounded-xl border border-dashed border-slate-300 gap-2 text-slate-400">
        <Zap className="w-6 h-6 text-amber-400" />
        <p className="text-sm font-medium text-slate-600">No workflow ID configured</p>
        <p className="text-xs text-center max-w-xs">
          Set <code className="bg-slate-100 px-1 rounded">VITE_N8N_WORKFLOW_1</code> to a workflow ID.
        </p>
      </div>
    );
  }

  return (
    <div className="relative rounded-xl overflow-hidden border border-slate-100" style={{ height }}>
      {status === "loading" && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-50 z-10">
          <Loader2 className="w-5 h-5 animate-spin text-slate-400 mr-2" />
          <span className="text-sm text-slate-400">Loading n8n…</span>
        </div>
      )}
      <iframe
        ref={iframeRef}
        src={url}
        style={{ width: "100%", height: "100%", border: "none" }}
        onLoad={() => setStatus("ready")}
        onError={() => setStatus("error")}
        title={`n8n workflow ${workflowId}`}
        allow="clipboard-read; clipboard-write"
      />
    </div>
  );
}

export default function N8nEmbed({ workflows = [] }) {
  const tabs = workflows?.length ? workflows : DEFAULT_WORKFLOWS;
  const [activeIdx, setActiveIdx] = useState(0);
  const [expanded,  setExpanded]  = useState(false);

  // If no n8n URL and no workflows configured, render nothing
  if (!N8N_URL && !tabs.length) return null;

  const activeTab = tabs[activeIdx];

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-orange-400" />
          <h3 className="text-sm font-semibold text-slate-700">Workflow Automation</h3>
          <span className="text-[10px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
            Powered by n8n
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setExpanded(v => !v)}
            className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 px-2 py-1 rounded-lg hover:bg-slate-50 transition-colors"
          >
            {expanded ? "Collapse" : "Expand"}
            <ChevronDown className={`w-3 h-3 transition-transform ${expanded ? "rotate-180" : ""}`} />
          </button>
          {N8N_URL && (
            <a
              href={N8N_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-orange-600 hover:underline"
            >
              Open n8n <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      </div>

      {/* Mode legend */}
      <div className="px-5 pt-3 flex items-center gap-4 text-[10px] text-slate-400">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-orange-200 inline-block"/>Canvas = drag-and-drop builder</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-emerald-200 inline-block"/>Form = input form → fires workflow</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-blue-200 inline-block"/>Log = execution history</span>
      </div>

      {/* Tab bar */}
      {tabs.length > 1 && (
        <div className="flex gap-1 px-5 pt-2">
          {tabs.map((tab, i) => (
            <button
              key={i}
              onClick={() => setActiveIdx(i)}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                i === activeIdx
                  ? "bg-orange-50 text-orange-700 border border-orange-200"
                  : "text-slate-500 hover:bg-slate-50 hover:text-slate-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {/* Embed */}
      <div className={`p-4 ${expanded ? "" : "max-h-[520px] overflow-hidden"}`}>
        {activeTab ? (
          <N8nFrame
            key={`${activeTab.id}-${activeTab.mode}`}
            workflowId={activeTab.id}
            mode={activeTab.mode}
            height={expanded ? 680 : 440}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-48 text-slate-300 gap-2">
            <Zap className="w-8 h-8 opacity-30" />
            <p className="text-sm text-slate-500 font-medium">No workflows configured</p>
            <p className="text-xs text-slate-400 text-center max-w-xs">
              Set <code className="bg-slate-100 px-1 rounded">VITE_N8N_URL</code> and{" "}
              <code className="bg-slate-100 px-1 rounded">VITE_N8N_WORKFLOW_1</code> in your .env file.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
