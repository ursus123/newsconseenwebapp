// ==============================================================
// AgentDashboard — Phase 4 Agentic AI status panel
// ==============================================================
// Shows all registered agents, their last run status, health
// indicators, and a run button for manual triggers.
// ==============================================================

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Play, Loader2, CheckCircle2, AlertCircle, Clock,
  RefreshCw, Activity, Brain, TrendingUp, Users, Package,
  UserPlus, Shield, Globe, Network, ChevronRight, Zap,
} from "lucide-react";

const RAILWAY_URL     = "https://newsconseenwebapp-production.up.railway.app";
const RAILWAY_API_KEY = /** @type {any} */ (import.meta).env?.VITE_RAILWAY_API_KEY || "";
const apiHeaders = (extra = {}) => ({ "x-api-key": RAILWAY_API_KEY, ...extra });

const AGENT_META = {
  operations:      { icon: Activity,   color: "blue",   label: "Operations Monitor",    phase: "4B", schedule: "Every 15 min" },
  revenue:         { icon: TrendingUp, color: "emerald", label: "Revenue Intelligence",  phase: "4B", schedule: "Daily 7am" },
  retention:       { icon: Users,      color: "purple", label: "Client Retention",       phase: "4C", schedule: "Weekly Monday" },
  inventory:       { icon: Package,    color: "amber",  label: "Inventory Agent",        phase: "4C", schedule: "Daily 6am" },
  onboarding:      { icon: UserPlus,   color: "teal",   label: "Onboarding Agent",       phase: "4C", schedule: "Event-driven" },
  compliance:      { icon: Shield,     color: "rose",   label: "Compliance Audit",       phase: "4E", schedule: "Nightly 2am" },
  market_research: { icon: Globe,      color: "indigo", label: "Deep Market Research",   phase: "4E", schedule: "Weekly Monday" },
  network:         { icon: Network,    color: "slate",  label: "Network Coordinator",    phase: "4E", schedule: "Weekly Monday" },
};

const COLOR_MAP = {
  blue:    "bg-blue-50 border-blue-200 text-blue-700",
  emerald: "bg-emerald-50 border-emerald-200 text-emerald-700",
  purple:  "bg-purple-50 border-purple-200 text-purple-700",
  amber:   "bg-amber-50 border-amber-200 text-amber-700",
  teal:    "bg-teal-50 border-teal-200 text-teal-700",
  rose:    "bg-rose-50 border-rose-200 text-rose-700",
  indigo:  "bg-indigo-50 border-indigo-200 text-indigo-700",
  slate:   "bg-slate-50 border-slate-200 text-slate-700",
};

const ICON_COLOR = {
  blue: "text-blue-600", emerald: "text-emerald-600", purple: "text-purple-600",
  amber: "text-amber-600", teal: "text-teal-600", rose: "text-rose-600",
  indigo: "text-indigo-600", slate: "text-slate-600",
};

async function fetchStatus(companyId) {
  const r = await fetch(`${RAILWAY_URL}/agents/status?company_id=${companyId}`,
    { headers: apiHeaders() });
  if (!r.ok) throw new Error("Agents status unavailable");
  return r.json();
}

async function fetchRuns(companyId) {
  const r = await fetch(`${RAILWAY_URL}/agents/runs?company_id=${companyId}&limit=20`,
    { headers: apiHeaders() });
  if (!r.ok) return { runs: [] };
  return r.json();
}

async function runAgent(agentName, companyId) {
  const r = await fetch(`${RAILWAY_URL}/agents/run/${agentName}`, {
    method:  "POST",
    headers: apiHeaders({ "Content-Type": "application/json" }),
    body:    JSON.stringify({ company_id: companyId, trigger: "manual" }),
  });
  if (!r.ok) throw new Error("Agent run failed");
  return r.json();
}

export default function AgentDashboard({ companyId, onSelectAgent }) {
  const qc = useQueryClient();
  const [runningAgent, setRunningAgent] = useState(null);
  const [lastResult, setLastResult] = useState(null);

  const { data: status = {}, isLoading: statusLoading } = useQuery({
    queryKey: ["agents-status", companyId],
    queryFn:  () => fetchStatus(companyId),
    enabled:  !!companyId,
    staleTime: 30000,
    refetchInterval: 60000,
  });

  const { data: runsData = { runs: [] } } = useQuery({
    queryKey: ["agents-runs", companyId],
    queryFn:  () => fetchRuns(companyId),
    enabled:  !!companyId,
    staleTime: 30000,
  });

  const { data: actionStats = { total: 0, by_agent: {} } } = useQuery({
    queryKey: ["agents-action-stats", companyId],
    queryFn:  async () => {
      const r = await fetch(`${RAILWAY_URL}/agents/actions/stats?company_id=${companyId}`);
      if (!r.ok) return { total: 0, by_agent: {} };
      return r.json();
    },
    enabled:   !!companyId,
    staleTime: 60000,
    refetchInterval: 120000,
  });

  const runMut = useMutation({
    mutationFn: ({ agentName }) => runAgent(agentName, companyId),
    onMutate:   ({ agentName }) => setRunningAgent(agentName),
    onSuccess:  (data) => {
      setLastResult(data);
      setRunningAgent(null);
      qc.invalidateQueries({ queryKey: ["agents-status", companyId] });
      qc.invalidateQueries({ queryKey: ["agents-runs", companyId] });
      qc.invalidateQueries({ queryKey: ["agents-pending", companyId] });
    },
    onError: () => setRunningAgent(null),
  });

  // Build run map for last-run status
  const runMap = {};
  for (const run of runsData.runs) {
    if (!runMap[run.agent_name]) runMap[run.agent_name] = run;
  }

  const agentsEnabled  = status.agents_enabled;
  const pendingCount   = status.pending_approvals || 0;
  const totalActionsWk = actionStats.total || 0;
  const byAgent        = actionStats.by_agent || {};

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center">
            <Brain className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-800">Autonomous Agents</h2>
            <p className="text-xs text-slate-500">Phase 4 — Agentic AI Framework</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {totalActionsWk > 0 && (
            <div className="flex items-center gap-1.5 text-xs font-semibold bg-emerald-50 border border-emerald-200 text-emerald-700 px-3 py-1.5 rounded-lg">
              <Zap className="w-3.5 h-3.5" />
              {totalActionsWk} action{totalActionsWk !== 1 ? "s" : ""} this week
            </div>
          )}
          {pendingCount > 0 && (
            <button
              onClick={() => onSelectAgent && onSelectAgent("approvals")}
              className="flex items-center gap-1.5 text-xs font-semibold bg-amber-50 border border-amber-200 text-amber-700 px-3 py-1.5 rounded-lg hover:bg-amber-100"
            >
              <AlertCircle className="w-3.5 h-3.5" />
              {pendingCount} pending
            </button>
          )}
          <button
            onClick={() => {
              qc.invalidateQueries({ queryKey: ["agents-status",       companyId] });
              qc.invalidateQueries({ queryKey: ["agents-action-stats", companyId] });
            }}
            className="text-xs text-slate-500 hover:text-indigo-600 border border-slate-200 px-2.5 py-1.5 rounded-lg"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Not configured */}
      {!agentsEnabled && !statusLoading && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-800 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>
            Agents are disabled. Set <code className="bg-amber-100 px-1 rounded">ANTHROPIC_API_KEY</code> in
            Railway → python_layer → Variables to activate.
          </span>
        </div>
      )}

      {/* Last result */}
      {lastResult && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-xs text-emerald-800 flex items-start gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold mb-0.5">Agent run complete</p>
            <p>{lastResult.summary || JSON.stringify(lastResult).slice(0, 120)}</p>
          </div>
        </div>
      )}

      {/* Agent cards grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {Object.entries(AGENT_META).map(([name, meta]) => {
          const Icon         = meta.icon;
          const colorClass   = COLOR_MAP[meta.color];
          const iconClass    = ICON_COLOR[meta.color];
          const lastRun      = runMap[name];
          const isRunning    = runningAgent === name;
          const actionsCount = byAgent[name] || 0;

          return (
            <div key={name}
              className={`rounded-xl border p-4 transition-all hover:shadow-sm cursor-pointer ${colorClass}`}
              onClick={() => onSelectAgent && onSelectAgent(name)}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-white/60 flex items-center justify-center shrink-0">
                    <Icon className={`w-4 h-4 ${iconClass}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="text-xs font-bold">{meta.label}</p>
                      <span className="text-[9px] font-bold bg-white/60 px-1.5 py-0.5 rounded-full opacity-70">
                        Phase {meta.phase}
                      </span>
                    </div>
                    <p className="text-[10px] opacity-70 flex items-center gap-1">
                      <Clock className="w-2.5 h-2.5" /> {meta.schedule}
                    </p>
                    {lastRun && (
                      <p className="text-[10px] mt-1 opacity-60 truncate">
                        Last: {lastRun.summary?.slice(0, 60) || lastRun.status}
                      </p>
                    )}
                    {actionsCount > 0 && (
                      <p className="text-[10px] mt-0.5 flex items-center gap-1 text-current font-semibold opacity-80">
                        <Zap className="w-2.5 h-2.5" />
                        {actionsCount} action{actionsCount !== 1 ? "s" : ""} this week
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {lastRun && (
                    <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-white/60 ${
                      lastRun.status === "completed" ? "text-emerald-700" : "text-rose-700"
                    }`}>
                      {lastRun.status}
                    </span>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (agentsEnabled && !isRunning)
                        runMut.mutate({ agentName: name });
                    }}
                    disabled={!agentsEnabled || !!runningAgent}
                    className="w-7 h-7 rounded-lg bg-white/60 hover:bg-white flex items-center justify-center disabled:opacity-40"
                    title="Run now"
                  >
                    {isRunning
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <Play className="w-3.5 h-3.5" />
                    }
                  </button>
                  <ChevronRight className="w-3.5 h-3.5 opacity-40" />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Opus note */}
      <p className="text-[10px] text-slate-400 text-center">
        Market Research agent uses Claude Opus for strategic analysis.
        Enable with <code className="bg-slate-100 px-1 rounded">OPUS_ENABLED=true</code> in python_layer variables.
      </p>
    </div>
  );
}
