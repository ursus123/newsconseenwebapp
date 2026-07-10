import React, { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Sparkles, AlertTriangle, CheckCircle2, Bot, Zap, Brain,
  Activity, ChevronDown, Shield, RefreshCw,
  Database, GitBranch, Bell,
} from "lucide-react";
import { ncClient } from "@/api/ncClient";
import { useLocation } from "react-router-dom";
import CopilotChat from "@/components/copilot/copilotchat";

const RAILWAY_URL   = "https://newsconseenwebapp-production.up.railway.app";
const RAILWAY_API_KEY = import.meta.env.VITE_RAILWAY_API_KEY || "";

const FALLBACK_MODELS = [
  {
    id:   "claude-haiku-4-5-20251001",
    label: "Haiku 4.5",
    tag:  "Fast",
    icon: "⚡",
    desc: "Quick answers, efficient querying",
  },
  {
    id:   "claude-sonnet-4-6",
    label: "Sonnet 4.6",
    tag:  "Balanced",
    icon: "⚖",
    desc: "Balanced reasoning and speed",
  },
  {
    id:   "claude-opus-4-7",
    label: "Opus 4.7",
    tag:  "Deep",
    icon: "🧠",
    desc: "Deep analysis, complex reasoning",
  },
];

const DEFAULT_MODEL = "claude-sonnet-4-6";

// ── Model selector dropdown ───────────────────────────────────────────────────
function ModelSelector({ selected, onChange, models = FALLBACK_MODELS }) {
  const [open, setOpen] = useState(false);
  const current = models.find(m => m.id === selected) || models[0] || FALLBACK_MODELS[1];

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [open]);

  const tagColor = {
    Fast:     "bg-blue-100 text-blue-600",
    Balanced: "bg-emerald-100 text-emerald-600",
    Deep:     "bg-violet-100 text-violet-600",
  };

  return (
    <div className="relative" onClick={e => e.stopPropagation()}>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:border-emerald-300 hover:bg-emerald-50 transition-all shadow-sm"
      >
        <span className="text-sm leading-none">{current.icon || current.provider || "LLM"}</span>
        <span>{current.label}</span>
        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${tagColor[current.tag] || "bg-slate-100 text-slate-500"}`}>
          {current.tag}
        </span>
        <ChevronDown className="w-3 h-3 text-slate-400" />
      </button>

      {open && (
        <div className="absolute right-0 top-9 z-50 bg-white border border-slate-200 rounded-xl shadow-xl w-60 p-1.5">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-2 pt-1 pb-2">
            Choose LLM
          </p>
          {models.map(m => (
            <button
              key={m.id}
              disabled={m.available === false}
              onClick={() => { if (m.available !== false) { onChange(m.id); setOpen(false); } }}
              className={`w-full flex items-start gap-2.5 px-3 py-2.5 rounded-lg text-left transition-colors ${
                m.id === selected
                  ? "bg-emerald-50 text-emerald-700"
                  : m.available === false
                  ? "opacity-50 cursor-not-allowed text-slate-400"
                  : "hover:bg-slate-50 text-slate-700"
              }`}
            >
              <span className="text-base leading-none mt-0.5 shrink-0">{m.icon || m.provider || "LLM"}</span>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="text-xs font-semibold">{m.label}</span>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${tagColor[m.tag] || "bg-slate-100 text-slate-500"}`}>
                    {m.tag}
                  </span>
                  {m.id === selected && (
                    <CheckCircle2 className="w-3 h-3 text-emerald-500 ml-auto shrink-0" />
                  )}
                </div>
                <p className="text-[10px] text-slate-400 leading-tight">
                  {m.available === false ? "Provider key not configured" : (m.description || m.desc)}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Autonomous Monitor panel ──────────────────────────────────────────────────
function AutonomousMonitor({ companyId, capabilities: backendCapabilities = [] }) {
  const [health, setHealth]   = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${RAILWAY_URL}/health`, {
        headers: RAILWAY_API_KEY ? { "x-api-key": RAILWAY_API_KEY } : {},
      });
      if (r.ok) setHealth(await r.json());
    } catch { /* unreachable */ }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const fallbackCapabilities = [
    { name: "ETL Pipeline",      desc: "Multi-tenant data sync after every mutation", icon: Database,   color: "emerald" },
    { name: "Alert Engine",      desc: "10 alert types — WhatsApp / Email / SMS",     icon: Bell,       color: "amber"   },
    { name: "Agent Queue",       desc: "8 agents monitoring and executing actions",    icon: Bot,        color: "violet"  },
    { name: "Audit Logger",      desc: "Immutable change log across all entities",    icon: Shield,     color: "blue"    },
    { name: "Threshold Monitor", desc: "Signal entity thresholds evaluated live",     icon: Activity,   color: "rose"    },
    { name: "Connector Sync",    desc: "35 connectors — scheduled sync runs",         icon: GitBranch,  color: "teal"    },
    { name: "Enrichment Engine", desc: "Phone / geo / sanctions / scores auto-run",  icon: Sparkles,   color: "pink"    },
    { name: "Offline Sync",      desc: "PWA IndexedDB queue processing",              icon: RefreshCw,  color: "slate"   },
  ];

  const iconByCapability = {
    read_company_data: Database,
    create_task: Bot,
    propose_record_update: Shield,
    save_memory: Brain,
    search_intelligence: Sparkles,
    run_agents: Bot,
    generate_report: Activity,
    approve_actions: CheckCircle2,
  };
  const colors = ["emerald", "amber", "violet", "blue", "rose", "teal", "pink", "slate"];
  const capabilities = backendCapabilities.length
    ? backendCapabilities.map((cap, index) => ({
        name: cap.name,
        desc: cap.description,
        icon: iconByCapability[cap.id] || Activity,
        color: colors[index % colors.length],
      }))
    : fallbackCapabilities;

  const colorRing = {
    emerald: "bg-emerald-50 border-emerald-200 text-emerald-700",
    amber:   "bg-amber-50 border-amber-200 text-amber-700",
    violet:  "bg-violet-50 border-violet-200 text-violet-700",
    blue:    "bg-blue-50 border-blue-200 text-blue-700",
    rose:    "bg-rose-50 border-rose-200 text-rose-700",
    teal:    "bg-teal-50 border-teal-200 text-teal-700",
    pink:    "bg-pink-50 border-pink-200 text-pink-700",
    slate:   "bg-slate-50 border-slate-200 text-slate-600",
  };
  const dotColor = {
    emerald: "bg-emerald-400", amber: "bg-amber-400", violet: "bg-violet-400",
    blue:    "bg-blue-400",    rose:  "bg-rose-400",  teal:   "bg-teal-400",
    pink:    "bg-pink-400",    slate: "bg-slate-400",
  };

  const etlEntities = [
    "people", "enterprises", "products", "tasks",
    "transactions", "relationships", "addresses",
    "animals", "plots", "observations",
  ];

  return (
    <div className="h-full overflow-y-auto pr-1 space-y-5">

      {/* Mission-control header */}
      <div className="bg-gradient-to-r from-slate-800 to-slate-900 rounded-2xl p-5 text-white">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse block" />
            <span className="text-sm font-semibold">Autonomous System Active</span>
          </div>
          <button
            onClick={load}
            className="flex items-center gap-1.5 text-[10px] text-slate-400 hover:text-white transition-colors"
          >
            <RefreshCw className="w-3 h-3" /> Refresh
          </button>
        </div>

        <p className="text-xs text-slate-400 mb-4 leading-relaxed">
          Idjwi is monitoring your operations and executing approved automations.
          These 8 capabilities run 24/7 — no LLM required.
        </p>

        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Reasoning", value: "Available", good: true },
            { label: "Automations", value: "Always On", good: false },
            { label: "Monitoring", value: "24/7", good: false },
          ].map(s => (
            <div key={s.label} className="bg-white/10 rounded-xl px-3 py-2.5">
              <p className="text-[10px] text-slate-400 mb-0.5">{s.label}</p>
              <p className={`text-xs font-semibold ${s.good ? "text-emerald-400" : "text-white"}`}>
                {s.value}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Autonomous capabilities grid */}
      <div>
        <h3 className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-3">
          Running Without LLM
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {capabilities.map(cap => {
            const Icon = cap.icon;
            return (
              <div
                key={cap.name}
                className={`flex items-start gap-3 px-3 py-3 rounded-xl border ${colorRing[cap.color]}`}
              >
                <Icon className="w-4 h-4 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold">{cap.name}</span>
                    <span className={`w-1.5 h-1.5 rounded-full ${dotColor[cap.color]} animate-pulse shrink-0`} />
                  </div>
                  <p className="text-[10px] opacity-70 mt-0.5 leading-tight">{cap.desc}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ETL status */}
      <div>
        <h3 className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-3">
          ETL Pipeline — Last Sync
        </h3>

        {loading ? (
          <div className="flex items-center gap-2 text-xs text-slate-400 py-2">
            <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Checking python_layer…
          </div>
        ) : health ? (
          <div className="space-y-1.5">
            {etlEntities.map(entity => {
              const key = `last_${entity}_etl`;
              const ts  = health[key] || health.last_etl_run?.[entity] || null;
              return (
                <div
                  key={entity}
                  className="flex items-center justify-between px-3 py-2 bg-white rounded-xl border border-slate-100"
                >
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                    <span className="text-xs text-slate-700 capitalize">{entity}</span>
                  </div>
                  <span className="text-[10px] text-slate-400">
                    {ts
                      ? new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                      : "Not run yet"}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex items-center gap-2 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            python_layer unreachable — ETL status unavailable. Automations are still running.
          </div>
        )}
      </div>

      {/* Graceful-degradation note */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
        <p className="text-xs font-semibold text-slate-700 mb-2">
          What Idjwi does when AI is unavailable
        </p>
        <ul className="space-y-1.5">
          {[
            "Continues monitoring all thresholds and running scheduled tasks",
            "Routes approved automations through the agent queue",
            "Processes ETL and syncs all three data layers",
            "Logs every change to the immutable audit trail",
            "Queues reasoning requests for when AI comes back online",
          ].map((item, i) => (
            <li key={i} className="flex items-start gap-1.5 text-[11px] text-slate-500">
              <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0 mt-0.5" />
              {item}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ── Main Idjwi page ───────────────────────────────────────────────────────────
export default function Idjwi() {
  const location       = useLocation();
  const prefillMessage = location.state?.prefillMessage || "";

  const { data: currentUser = null } = useQuery({
    queryKey:       ["currentUser"],
    queryFn:        () => ncClient.auth.me(),
    staleTime:      0,
    refetchOnMount: "always",
  });

  const [mode, setMode]                 = useState("reasoning"); // "reasoning" | "monitor"
  const [selectedModel, setSelectedModel] = useState(
    () => localStorage.getItem("idjwi_model") || DEFAULT_MODEL
  );
  const [backendStatus, setBackendStatus] = useState(null);
  const [availableModels, setAvailableModels] = useState(FALLBACK_MODELS);
  const [idjwiCapabilities, setIdjwiCapabilities] = useState([]);

  const handleModelChange = (modelId) => {
    setSelectedModel(modelId);
    localStorage.setItem("idjwi_model", modelId);
  };

  useEffect(() => {
    fetch(`${RAILWAY_URL}/copilot/status`, {
      headers: RAILWAY_API_KEY ? { "x-api-key": RAILWAY_API_KEY } : {},
    })
      .then(r => r.json())
      .then(d => {
        setBackendStatus(d.backend_available ? "ok" : "degraded");
        if (Array.isArray(d.models) && d.models.length > 0) {
          setAvailableModels(d.models);
          const current = localStorage.getItem("idjwi_model") || DEFAULT_MODEL;
          if (!d.models.some(m => m.id === current && m.available !== false)) {
            const fallback = d.models.find(m => m.available !== false)?.id || d.default_model || DEFAULT_MODEL;
            setSelectedModel(fallback);
            localStorage.setItem("idjwi_model", fallback);
          }
        }
        if (Array.isArray(d.capabilities)) setIdjwiCapabilities(d.capabilities);
      })
      .catch(() => setBackendStatus("unreachable"));
  }, []);

  const currentModel = availableModels.find(m => m.id === selectedModel) || availableModels[0] || FALLBACK_MODELS[1];
  const currentModelMark = currentModel.icon || currentModel.provider || "LLM";

  return (
    <div className="flex flex-col h-full min-h-0">

      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-4 shrink-0 flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center shadow-sm shrink-0">
            <Sparkles className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800">Idjwi</h1>
            <p className="text-xs text-slate-500">
              {mode === "reasoning"
                ? `${currentModelMark} ${currentModel.label} · reasoning grounded in your data`
                : "Autonomous monitor — 8 capabilities running without LLM"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">

          {/* Backend status badge */}
          {backendStatus === "ok" && (
            <span className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold">
              <CheckCircle2 className="w-3 h-3" /> AI Online
            </span>
          )}
          {backendStatus === "degraded" && (
            <span className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-xs font-semibold">
              <AlertTriangle className="w-3 h-3" /> AI Key Missing
            </span>
          )}
          {backendStatus === "unreachable" && (
            <span className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
              <AlertTriangle className="w-3 h-3" /> Backend Offline
            </span>
          )}
          {backendStatus === null && (
            <span className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-50 border border-slate-200 text-slate-400 text-xs">
              <Sparkles className="w-3 h-3 animate-pulse" /> Checking…
            </span>
          )}

          {/* Mode toggle */}
          <div className="flex items-center bg-slate-100 rounded-xl p-1 gap-0.5">
            <button
              onClick={() => setMode("reasoning")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                mode === "reasoning"
                  ? "bg-white text-slate-800 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <Brain className="w-3 h-3" />
              <span className="hidden sm:inline">Reasoning</span>
            </button>
            <button
              onClick={() => setMode("monitor")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                mode === "monitor"
                  ? "bg-white text-slate-800 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <Zap className="w-3 h-3" />
              <span className="hidden sm:inline">Autonomous</span>
            </button>
          </div>

          {/* Model selector — only in reasoning mode */}
          {mode === "reasoning" && (
            <ModelSelector
              selected={selectedModel}
              onChange={handleModelChange}
              models={availableModels}
            />
          )}
        </div>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 min-h-0">
        {mode === "reasoning" ? (
          <CopilotChat
            currentUser={currentUser}
            className="h-full"
            initialMessage={prefillMessage}
            selectedModel={selectedModel}
          />
        ) : (
          <AutonomousMonitor
            companyId={currentUser?.company_id}
            capabilities={idjwiCapabilities}
          />
        )}
      </div>
    </div>
  );
}
