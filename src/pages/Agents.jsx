// ==============================================================
// Agents Page — Phase 4 Agentic AI Framework
// ==============================================================
// The control centre for all autonomous agents.
// Tabs: Dashboard | Approvals | Market Intelligence | Run Log
// ==============================================================

import React, { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import AgentDashboard from "@/components/agents/AgentDashboard";
import ApprovalGate   from "@/components/agents/ApprovalGate";
import {
  Brain, Shield, Globe, Activity, Loader2, RefreshCw,
  CheckCircle2, XCircle, Clock, AlertCircle, TrendingUp,
} from "lucide-react";

const RAILWAY_URL = "https://newsconseenwebapp-production.up.railway.app";

// ── Market Briefings panel ────────────────────────────────────────────────────
function MarketBriefings({ companyId }) {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["market-briefings", companyId],
    queryFn:  async () => {
      const r = await fetch(`${RAILWAY_URL}/agents/market/briefings?company_id=${companyId}&limit=4`);
      if (!r.ok) return { briefings: [] };
      return r.json();
    },
    enabled:   !!companyId,
    staleTime: 60000,
  });

  const briefings = data?.briefings || [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center">
            <Globe className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-800">Market Intelligence</h2>
            <p className="text-xs text-slate-500">Weekly briefings from the Deep Market Research Agent</p>
          </div>
        </div>
        <button onClick={() => refetch()}
          className="text-xs text-slate-500 hover:text-indigo-600 border border-slate-200 px-2.5 py-1.5 rounded-lg">
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {isLoading && (
        <div className="flex justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
        </div>
      )}

      {!isLoading && briefings.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center">
            <Globe className="w-6 h-6 text-indigo-400" />
          </div>
          <p className="text-sm font-semibold text-slate-600">No briefings yet</p>
          <p className="text-xs text-slate-400 max-w-xs">
            Run the Market Research agent to generate your first weekly briefing.
            It will run automatically every Monday at 5am thereafter.
          </p>
        </div>
      )}

      <div className="space-y-4">
        {briefings.map((b, i) => (
          <div key={i} className="rounded-xl border border-indigo-100 bg-indigo-50/30 p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-bold text-indigo-800">
                Week of {b.week_of ? new Date(b.week_of).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—"}
              </p>
              {i === 0 && (
                <span className="text-[9px] bg-indigo-100 text-indigo-700 font-bold px-2 py-0.5 rounded-full">LATEST</span>
              )}
            </div>
            <p className="text-sm text-slate-700 leading-relaxed">{b.briefing}</p>
            {Array.isArray(b.findings) && b.findings.length > 0 && (
              <div className="mt-3 space-y-1.5">
                {b.findings.slice(0, 3).map((f, j) => (
                  <div key={j} className={`flex items-start gap-2 text-xs rounded-lg px-3 py-2 ${
                    f.severity === "critical" ? "bg-rose-50 text-rose-700" :
                    f.severity === "warning"  ? "bg-amber-50 text-amber-700" :
                    "bg-slate-50 text-slate-600"
                  }`}>
                    <AlertCircle className="w-3 h-3 shrink-0 mt-0.5" />
                    <span>{f.detail || f.title || JSON.stringify(f).slice(0, 80)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Agent Run Log ─────────────────────────────────────────────────────────────
function RunLog({ companyId }) {
  const { data, isLoading } = useQuery({
    queryKey: ["agents-runs-full", companyId],
    queryFn:  async () => {
      const r = await fetch(`${RAILWAY_URL}/agents/runs?company_id=${companyId}&limit=50`);
      if (!r.ok) return { runs: [] };
      return r.json();
    },
    enabled:   !!companyId,
    staleTime: 30000,
  });

  const runs = data?.runs || [];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center">
          <Activity className="w-5 h-5 text-slate-600" />
        </div>
        <div>
          <h2 className="text-base font-bold text-slate-800">Agent Run Log</h2>
          <p className="text-xs text-slate-500">Full audit trail of all agent activity</p>
        </div>
      </div>

      {isLoading && (
        <div className="flex justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
        </div>
      )}

      {!isLoading && runs.length === 0 && (
        <div className="text-center py-12">
          <Activity className="w-8 h-8 mx-auto mb-2 text-slate-300" />
          <p className="text-sm text-slate-500">No agent runs recorded yet.</p>
        </div>
      )}

      <div className="space-y-2">
        {runs.map((run, i) => (
          <div key={i} className="flex items-start gap-3 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
            <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${
              run.status === "completed" ? "bg-emerald-500" :
              run.status === "error"     ? "bg-rose-500" :
              "bg-amber-500"
            }`} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-xs font-bold text-slate-700 capitalize">{run.agent_name}</p>
                <span className="text-[9px] text-slate-500 bg-slate-200 px-1.5 py-0.5 rounded-full">{run.trigger}</span>
                {run.actions_taken > 0 && (
                  <span className="text-[9px] text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded-full">
                    {run.actions_taken} actions
                  </span>
                )}
                {run.actions_pending > 0 && (
                  <span className="text-[9px] text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded-full">
                    {run.actions_pending} pending
                  </span>
                )}
              </div>
              {run.summary && (
                <p className="text-[11px] text-slate-600 mt-0.5 truncate">{run.summary}</p>
              )}
            </div>
            <p className="text-[9px] text-slate-400 shrink-0">
              {run.started_at ? new Date(run.started_at).toLocaleString("en-GB", {
                day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit"
              }) : ""}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

const TABS = [
  { id: "dashboard",  label: "Agents",       icon: Brain   },
  { id: "approvals",  label: "Approvals",    icon: Shield  },
  { id: "market",     label: "Market Intel", icon: Globe   },
  { id: "log",        label: "Run Log",      icon: Activity },
];

export default function Agents() {
  const [currentUser, setCurrentUser] = useState(null);
  const [activeTab, setActiveTab]     = useState("dashboard");

  const qc = useQueryClient();

  useEffect(() => {
    base44.auth.me().then(setCurrentUser).catch(() => {});
  }, []);

  const companyId = currentUser?.company_id;

  // Pending count for badge
  const { data: pendingData } = useQuery({
    queryKey: ["agents-pending", companyId],
    queryFn:  async () => {
      const r = await fetch(`${RAILWAY_URL}/agents/approvals/pending?company_id=${companyId}`);
      if (!r.ok) return { pending: [] };
      return r.json();
    },
    enabled:  !!companyId,
    refetchInterval: 30000,
  });
  const pendingCount = pendingData?.pending?.length || 0;

  if (!currentUser) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
      {/* Tab bar */}
      <div className="flex items-center gap-1 px-4 pt-3 pb-0 border-b border-slate-100 shrink-0">
        {TABS.map(tab => {
          const Icon    = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-t-lg border-b-2 transition-colors relative ${
                isActive
                  ? "border-indigo-500 text-indigo-700 bg-indigo-50"
                  : "border-transparent text-slate-500 hover:text-indigo-600 hover:bg-indigo-50"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
              {tab.id === "approvals" && pendingCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-amber-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                  {pendingCount}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {activeTab === "dashboard" && (
          <AgentDashboard
            companyId={companyId}
            onSelectAgent={(name) => {
              if (name === "approvals") setActiveTab("approvals");
            }}
          />
        )}
        {activeTab === "approvals" && (
          <ApprovalGate companyId={companyId} />
        )}
        {activeTab === "market" && (
          <MarketBriefings companyId={companyId} />
        )}
        {activeTab === "log" && (
          <RunLog companyId={companyId} />
        )}
      </div>
    </div>
  );
}
