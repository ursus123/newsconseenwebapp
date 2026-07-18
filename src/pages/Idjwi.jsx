import React, { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity, AlertTriangle, Brain, BriefcaseBusiness, CheckCircle2,
  ChevronDown, ClipboardCheck, Database, History, Lightbulb,
  Loader2, MemoryStick, RefreshCw, Scale, Settings2, Sparkles,
  Target, Users,
} from "lucide-react";
import { useLocation } from "react-router-dom";
import { ncClient } from "@/api/ncClient";
import { useAuth } from "@/lib/AuthContext";
import { RAILWAY_URL, authHeaders } from "@/config/api";
import CopilotChat from "@/components/copilot/copilotchat";

const TABS = [
  ["today", "Today", Activity],
  ["ask", "Ask Idjwi", Sparkles],
  ["decisions", "Decisions", Scale],
  ["work", "Work", BriefcaseBusiness],
  ["memory", "Memory", MemoryStick],
  ["advisors", "Advisors", Brain],
  ["audit", "Audit", History],
];

async function idjwiFetch(path, options = {}, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers = await authHeaders(options.headers || {});
    const response = await fetch(`${RAILWAY_URL}${path}`, { ...options, headers, signal: controller.signal });
    let body = null;
    try { body = await response.json(); } catch { body = {}; }
    if (!response.ok) throw new Error(body?.detail?.message || body?.detail || `HTTP ${response.status}`);
    return body;
  } finally {
    clearTimeout(timer);
  }
}

function StatusPill({ tone = "slate", children }) {
  const tones = {
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
    amber: "border-amber-200 bg-amber-50 text-amber-700",
    rose: "border-rose-200 bg-rose-50 text-rose-700",
    slate: "border-slate-200 bg-slate-50 text-slate-600",
  };
  return <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${tones[tone]}`}>{children}</span>;
}

function Panel({ title, icon: Icon, children, action }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <header className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          {Icon && <Icon className="h-4 w-4 text-emerald-600" />}{title}
        </div>
        {action}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

function EmptyState({ children }) {
  return <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-xs text-slate-500">{children}</p>;
}

export default function Idjwi() {
  const location = useLocation();
  const prefillMessage = location.state?.prefillMessage || "";
  const [tab, setTab] = useState(prefillMessage ? "ask" : "today");
  const [scopeId, setScopeId] = useState("__all__");
  const [advisorMode, setAdvisorMode] = useState(() => localStorage.getItem("idjwi_advisor_mode") || "automatic");
  const [profile, setProfile] = useState(() => localStorage.getItem("idjwi_reasoning_profile") || "balanced");
  const [snapshot, setSnapshot] = useState({ loading: true, error: null, status: null, context: null, advisors: null });
  const [events, setEvents] = useState([]);
  const [memories, setMemories] = useState([]);
  const [decisions, setDecisions] = useState([]);
  const [workItems, setWorkItems] = useState([]);
  const [savingPolicy, setSavingPolicy] = useState(false);

  const { user: currentUser } = useAuth();
  const companyId = currentUser?.company_id;
  const { data: enterprises = [] } = useQuery({
    queryKey: ["idjwiScopes", companyId],
    queryFn: () => ncClient.entities.Enterprise.filter({ company_id: companyId }),
    enabled: !!companyId,
    staleTime: 60000,
  });

  const scopes = useMemo(() => {
    const organization = {
      id: "__all__",
      name: currentUser?.enterprise_name || currentUser?.company_name || "Organization-wide",
      type: "tenant_scope",
    };
    const units = enterprises
      .filter(item => item.id && item.id !== companyId)
      .slice(0, 50)
      .map(item => ({
        id: item.id,
        name: item.name || item.enterprise_name || item.title || "Operational unit",
        type: item.enterprise_type || item.enterprise_subtype || "operational_unit",
      }));
    return [organization, ...units];
  }, [companyId, currentUser, enterprises]);
  const activeScope = scopes.find(item => item.id === scopeId) || scopes[0];

  const loadSnapshot = async () => {
    if (!companyId) return;
    setSnapshot(previous => ({ ...previous, loading: true, error: null }));
    const scopeQuery = activeScope?.id !== "__all__"
      ? `&operational_unit_id=${encodeURIComponent(activeScope.id)}&operational_unit_name=${encodeURIComponent(activeScope.name)}`
      : "";
    const results = await Promise.allSettled([
      idjwiFetch("/copilot/status"),
      idjwiFetch(`/copilot/context?company_id=${encodeURIComponent(companyId)}${scopeQuery}`),
      idjwiFetch(`/copilot/advisors?company_id=${encodeURIComponent(companyId)}`),
    ]);
    const value = index => results[index].status === "fulfilled" ? results[index].value : null;
    const failures = results.filter(result => result.status === "rejected");
    setSnapshot({
      loading: false,
      error: failures.length === results.length ? failures[0]?.reason?.message || "Idjwi services unavailable" : null,
      status: value(0), context: value(1), advisors: value(2),
    });
  };

  useEffect(() => { loadSnapshot(); }, [companyId, activeScope?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!companyId || !["audit", "memory", "decisions", "work"].includes(tab)) return;
    if (tab === "audit") {
      idjwiFetch(`/copilot/events?company_id=${encodeURIComponent(companyId)}&limit=100`)
        .then(data => setEvents(data.events || [])).catch(() => setEvents([]));
    } else if (tab === "memory") {
      idjwiFetch(`/copilot/idjwi-memory?company_id=${encodeURIComponent(companyId)}&limit=100`)
        .then(data => setMemories(data.memories || data.items || [])).catch(() => setMemories([]));
    } else if (tab === "decisions") {
      idjwiFetch(`/copilot/decisions?company_id=${encodeURIComponent(companyId)}&limit=100`)
        .then(data => setDecisions(data.decisions || [])).catch(() => setDecisions([]));
    } else {
      idjwiFetch(`/copilot/recommendations?company_id=${encodeURIComponent(companyId)}`)
        .then(data => setWorkItems(data.recommendations || [])).catch(() => setWorkItems([]));
    }
  }, [companyId, tab]);

  const setMode = value => { setAdvisorMode(value); localStorage.setItem("idjwi_advisor_mode", value); };
  const setReasoningProfile = value => { setProfile(value); localStorage.setItem("idjwi_reasoning_profile", value); };
  const saveTenantDefault = async () => {
    if (!companyId) return;
    setSavingPolicy(true);
    try {
      await idjwiFetch("/copilot/advisors/policy", {
        method: "PUT",
        body: JSON.stringify({
          company_id: companyId,
          default_mode: advisorMode,
          default_profile: profile,
          allow_external: advisorMode !== "core",
          allow_comparison: !!snapshot.advisors?.policy?.allow_comparison,
          monthly_budget_usd: snapshot.advisors?.policy?.monthly_budget_usd ?? null,
          rules: snapshot.advisors?.policy?.rules || [],
        }),
      });
      await loadSnapshot();
    } finally {
      setSavingPolicy(false);
    }
  };
  const coreReady = snapshot.status?.idjwi_core === "ready" || snapshot.status?.status === "ready";
  const contextReady = snapshot.context?.data_available === true;
  const advisorCount = (snapshot.advisors?.connections || []).filter(item => item.enabled).length;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <header className="shrink-0 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-900">
              <Sparkles className="h-5 w-5 text-emerald-400" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-slate-900">Idjwi</h1>
                <StatusPill tone={coreReady ? "emerald" : snapshot.loading ? "slate" : "amber"}>
                  {snapshot.loading ? <Loader2 className="h-3 w-3 animate-spin" /> : coreReady ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
                  {snapshot.loading ? "Preparing" : coreReady ? "Core Ready" : "Core Degraded"}
                </StatusPill>
              </div>
              <p className="truncate text-xs text-slate-500">The operational mind for {activeScope?.name || "your organization"}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="relative flex items-center">
              <Users className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-slate-400" />
              <select value={scopeId} onChange={event => setScopeId(event.target.value)} className="appearance-none rounded-xl border border-slate-200 bg-white py-2 pl-8 pr-8 text-xs font-medium text-slate-700">
                {scopes.map(scope => <option key={scope.id} value={scope.id}>{scope.name}</option>)}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 h-3.5 w-3.5 text-slate-400" />
            </label>
            <select value={advisorMode} onChange={event => setMode(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700">
              <option value="automatic">Advisor: Automatic</option>
              <option value="core">Idjwi Core only</option>
              <option value="compare" disabled={!snapshot.advisors?.policy?.allow_comparison}>Compare advisors</option>
            </select>
            <select value={profile} onChange={event => setReasoningProfile(event.target.value)} disabled={advisorMode === "core"} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 disabled:opacity-50">
              <option value="fast">Fast</option><option value="balanced">Balanced</option><option value="deep">Deep</option><option value="coding">Coding</option><option value="research">Research</option>
            </select>
            <button onClick={loadSnapshot} className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-50" title="Refresh Idjwi readiness"><RefreshCw className={`h-4 w-4 ${snapshot.loading ? "animate-spin" : ""}`} /></button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
          <StatusPill tone={contextReady ? "emerald" : snapshot.context ? "amber" : "slate"}><Database className="h-3 w-3" />{contextReady ? "Context loaded" : "Context unavailable"}</StatusPill>
          <StatusPill tone={advisorCount ? "emerald" : "slate"}><Brain className="h-3 w-3" />{advisorCount} advisor{advisorCount === 1 ? "" : "s"} available</StatusPill>
          <StatusPill tone="slate"><Settings2 className="h-3 w-3" />{snapshot.status?.capabilities?.length || 0} governed capabilities</StatusPill>
          {snapshot.error && <StatusPill tone="rose"><AlertTriangle className="h-3 w-3" />{snapshot.error}</StatusPill>}
        </div>
      </header>

      <nav className="flex shrink-0 gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1">
        {TABS.map(([id, label, Icon]) => (
          <button key={id} onClick={() => setTab(id)} className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition ${tab === id ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"}`}>
            <Icon className="h-3.5 w-3.5" />{label}
          </button>
        ))}
      </nav>

      <main className="min-h-0 flex-1 overflow-y-auto">
        {tab === "ask" && (
          <CopilotChat currentUser={currentUser} className="h-full min-h-[560px]" initialMessage={prefillMessage} autoSend={!!prefillMessage}
            advisorMode={advisorMode} reasoningProfile={profile} operationalScope={activeScope} />
        )}

        {tab === "today" && (
          <div className="grid gap-3 lg:grid-cols-3">
            <div className="space-y-3 lg:col-span-2">
              <Panel title={`Briefing for ${activeScope?.name || "your organization"}`} icon={Lightbulb}>
                <div className="grid gap-3 sm:grid-cols-3">
                  {[
                    ["Decisions", snapshot.context?.critical_alerts || 0, "Need attention", Scale],
                    ["Enterprises", snapshot.context?.enterprise_count || 0, "In current context", BriefcaseBusiness],
                    ["Capabilities", snapshot.status?.capabilities?.length || 0, "Available to Idjwi", Target],
                  ].map(([label, value, note, Icon]) => <div key={label} className="rounded-xl border border-slate-100 bg-slate-50 p-4"><Icon className="mb-3 h-4 w-4 text-emerald-600" /><p className="text-2xl font-bold text-slate-900">{value}</p><p className="text-xs font-semibold text-slate-700">{label}</p><p className="text-[10px] text-slate-400">{note}</p></div>)}
                </div>
                <div className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50 p-4">
                  <p className="text-sm font-semibold text-emerald-900">Idjwi is ready to review what changed, explain risks, and coordinate governed work.</p>
                  <button onClick={() => setTab("ask")} className="mt-3 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold text-white">Ask for today&apos;s operational briefing</button>
                </div>
              </Panel>
              <Panel title="Priority attention" icon={AlertTriangle}><EmptyState>Priorities will appear here as Idjwi evaluates risks, recommendations, deadlines, and data freshness for this scope.</EmptyState></Panel>
            </div>
            <Panel title="Readiness" icon={ClipboardCheck}>
              <div className="space-y-2 text-xs">
                {[
                  ["Idjwi Core", coreReady], ["Tenant authorized", !!snapshot.context], ["Company context", contextReady],
                  ["Memory", true], ["Governed tools", !!snapshot.status?.capabilities?.length], ["Optional advisors", advisorCount > 0],
                ].map(([label, ready]) => <div key={label} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2"><span className="text-slate-600">{label}</span>{ready ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <AlertTriangle className="h-4 w-4 text-amber-500" />}</div>)}
              </div>
            </Panel>
          </div>
        )}

        {tab === "decisions" && <Panel title="Decision register" icon={Scale}>{decisions.length ? <div className="space-y-2">{decisions.map((item, index) => <div key={item.id || index} className="rounded-xl border border-slate-200 p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-sm font-semibold text-slate-800">{item.decision || "Recorded decision"}</p><p className="text-[11px] text-slate-500">Decided by {item.decided_by || item.created_by || "authorized operator"}</p></div><StatusPill tone={item.outcome_status === "successful" ? "emerald" : "slate"}>{item.outcome_status || "outcome pending"}</StatusPill></div>{item.notes && <p className="mt-2 text-xs text-slate-600">{item.notes}</p>}{item.outcome_summary && <p className="mt-2 rounded-lg bg-slate-50 p-2 text-xs text-slate-600">Outcome: {item.outcome_summary}</p>}</div>)}</div> : <EmptyState>Recommendations requiring authority will appear here with evidence, alternatives, advisor contributions, approver, and eventual outcome.</EmptyState>}</Panel>}
        {tab === "work" && <Panel title="Governed work" icon={BriefcaseBusiness}>{workItems.length ? <div className="space-y-2">{workItems.map((item, index) => <div key={item.id || index} className="rounded-xl border border-slate-200 p-4"><div className="flex items-start justify-between gap-2"><div><p className="text-sm font-semibold text-slate-800">{item.title || item.action_type || "Proposed action"}</p><p className="mt-1 text-xs text-slate-500">{item.rationale || "Awaiting governed execution"}</p></div><StatusPill tone={item.status === "approved" || item.status === "executed" ? "emerald" : item.status === "pending" ? "amber" : "slate"}>{item.status || "pending"}</StatusPill></div></div>)}</div> : <EmptyState>Agent runs, workflows, proposed actions, approvals, completions, and failures will appear here.</EmptyState>}</Panel>}
        {tab === "memory" && <Panel title="What Idjwi remembers" icon={MemoryStick}>{memories.length ? <div className="space-y-2">{memories.map((item, index) => <div key={item.id || index} className="rounded-xl border border-slate-100 p-3"><div className="flex items-center justify-between"><p className="text-xs font-semibold text-slate-800">{item.key || item.memory_type || "Memory"}</p><StatusPill tone={item.review_status === "confirmed" ? "emerald" : "amber"}>{item.review_status || "candidate"}</StatusPill></div><p className="mt-1 line-clamp-3 text-xs text-slate-500">{typeof item.value === "string" ? item.value : JSON.stringify(item.value)}</p></div>)}</div> : <EmptyState>No scoped memories were returned. Advisor answers do not become memory automatically.</EmptyState>}</Panel>}
        {tab === "advisors" && <Panel title="Tenant advisor portfolio" icon={Brain} action={<button onClick={saveTenantDefault} disabled={savingPolicy} className="rounded-lg bg-slate-900 px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-50">{savingPolicy ? "Saving…" : "Save tenant default"}</button>}><div className="mb-4 rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs text-blue-800">Advisors reason; Idjwi governs. Provider secrets are referenced through environment or vault identifiers and are never displayed here.</div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{(snapshot.advisors?.connections || []).map(item => <div key={item.id || `${item.provider}:${item.model_id}`} className="rounded-xl border border-slate-200 p-4"><div className="flex items-start justify-between gap-2"><div><p className="text-sm font-semibold text-slate-800">{item.label || item.model_id}</p><p className="text-[10px] uppercase tracking-wide text-slate-400">{item.provider}</p></div><StatusPill tone={item.enabled ? "emerald" : "slate"}>{item.enabled ? "Available" : "Disabled"}</StatusPill></div><p className="mt-3 text-[11px] text-slate-500">Data: {(item.data_classes || []).join(", ") || "Policy controlled"}</p><p className="mt-1 text-[11px] text-slate-500">Objectives: {(item.objectives || []).join(", ") || "Any permitted objective"}</p></div>)}</div></Panel>}
        {tab === "audit" && <Panel title="Idjwi audit trail" icon={History}>{events.length ? <div className="divide-y divide-slate-100">{events.map(event => <div key={event.id} className="flex gap-3 py-3"><Activity className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" /><div><p className="text-xs font-semibold text-slate-800">{event.event_type}</p><p className="text-[11px] text-slate-500">{event.actor} · {event.subject || "Idjwi"}</p><p className="text-[10px] text-slate-400">{event.created_at ? new Date(event.created_at).toLocaleString() : ""}</p></div></div>)}</div> : <EmptyState>No audit events were returned for this tenant.</EmptyState>}</Panel>}
      </main>
    </div>
  );
}
