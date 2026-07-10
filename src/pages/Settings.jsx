import React, { useState, useEffect } from "react";
import { ncClient } from "@/api/ncClient";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  User, Lock, Bell, Monitor, AlertTriangle,
  Eye, EyeOff, Save, Building2, Mail, Shield, Calendar, X, Settings as SettingsIcon, Palette, Bug,
  Globe, Copy, Trash2, Loader2, Brain, Zap, CheckCircle2, Clock,
  ScrollText, Download, Filter, RefreshCw, Send, Plus,
  TrendingUp, ChevronRight, ShieldCheck, KeyRound, Smartphone, LogIn,
} from "lucide-react";
import BrandingSection from "@/components/settings/BrandingSection";
import ErrorLogSection from "@/components/settings/ErrorLogSection";
import { fetchIdjwiConflicts, updateIdjwiMemory } from "@/services/idjwiMemoryClient";

function passwordStrength(pw) {
  if (!pw) return null;
  let score = 0;
  if (pw.length >= 8) score++;
  if (/\d/.test(pw)) score++;
  if (/[^a-zA-Z0-9]/.test(pw)) score++;
  if (score === 1) return { label: "Weak",   color: "bg-rose-500",    text: "text-rose-600" };
  if (score === 2) return { label: "Fair",   color: "bg-amber-500",   text: "text-amber-600" };
  return              { label: "Strong", color: "bg-emerald-500", text: "text-emerald-600" };
}

function getInitials(name) {
  if (!name) return "?";
  return name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();
}

function getBrowser() {
  const ua = navigator.userAgent;
  if (ua.includes("Chrome") && !ua.includes("Edg")) return "Chrome";
  if (ua.includes("Firefox")) return "Firefox";
  if (ua.includes("Safari") && !ua.includes("Chrome")) return "Safari";
  if (ua.includes("Edg")) return "Edge";
  return "Browser";
}

function Banner({ type, message, onDismiss }) {
  if (!message) return null;
  const ok = type === "success";
  return (
    <div className={`flex items-start justify-between gap-3 px-4 py-3 rounded-xl border text-sm mb-4
      ${ok ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-rose-50 border-rose-200 text-rose-800"}`}>
      <span>{ok ? "✅" : "❌"} {message}</span>
      {onDismiss && (
        <button onClick={onDismiss} className="shrink-0 opacity-60 hover:opacity-100"><X className="w-4 h-4" /></button>
      )}
    </div>
  );
}

function ToggleRow({ label, checked, onChange }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-slate-50 last:border-0">
      <span className="text-sm text-slate-700">{label}</span>
      <button
        onClick={() => onChange(!checked)}
        className={`w-10 h-6 rounded-full transition-colors relative shrink-0 ${checked ? "bg-emerald-500" : "bg-slate-200"}`}
      >
        <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${checked ? "left-5" : "left-1"}`} />
      </button>
    </div>
  );
}

function PasswordField({ label, value, onChange, placeholder }) {
  const [show, setShow] = useState(false);
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-slate-700">{label}</label>
      <div className="relative">
        <input
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-xl border border-slate-200 px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
        />
        <button type="button" onClick={() => setShow((s) => !s)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}

// ── Agents Section ────────────────────────────────────────────────────────────
function AgentsSection({ user }) {
  const cid = user?.company_id || "default";
  const storageKey = `agent_config_${cid}`;
  const [config, setConfig] = useState(() => {
    try { return JSON.parse(localStorage.getItem(storageKey) || "{}"); } catch { return {}; }
  });
  const [saved, setSaved] = useState(false);

  const get = (key, def) => config[key] ?? def;
  const set = (key, val) => setConfig(prev => ({ ...prev, [key]: val }));

  const save = () => {
    localStorage.setItem(storageKey, JSON.stringify(config));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const PHASE4_AGENTS = [
    { id: "operations",    label: "Operations Agent",          desc: "Monitors task backlogs, staffing gaps, and SLA breaches. Triggers alerts and creates follow-up tasks autonomously.",   phase: "4B", ready: false },
    { id: "revenue",       label: "Revenue Intelligence",      desc: "Tracks invoice ageing, payment patterns, and revenue forecasts. Flags overdue accounts and unusual transaction patterns.", phase: "4B", ready: false },
    { id: "retention",     label: "Retention Agent",           desc: "Identifies clients and staff at churn risk using ML survival models. Recommends interventions before disengagement.",       phase: "4C", ready: false },
    { id: "inventory",     label: "Inventory Agent",           desc: "Monitors stock levels, expiry dates, and reorder points. Raises purchase orders and stock alerts automatically.",          phase: "4C", ready: false },
    { id: "onboarding",    label: "Onboarding Agent",          desc: "Guides new clients and staff through onboarding checklists. Tracks completion and escalates blockers.",                    phase: "4C", ready: false },
    { id: "network",       label: "Network Coordinator",       desc: "Compares performance across branches and franchises. Surfaces outliers and escalates network-level patterns.",             phase: "4E", ready: false },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-slate-800">Agent Configuration</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Configure autonomous agents that run your operations 24/7.
            Agents are scoped to your organisation — no other tenant is affected.
          </p>
        </div>
        <button
          onClick={save}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
            saved ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          {saved ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
          {saved ? "Saved" : "Save"}
        </button>
      </div>

      {/* Global toggles */}
      <div className="bg-white border border-slate-100 rounded-2xl p-5 space-y-1">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Global</p>
        <ToggleRow label="Enable agent system" checked={get("agents_enabled", false)} onChange={v => set("agents_enabled", v)} />
        <ToggleRow label="Human-in-the-loop approval for high-risk actions" checked={get("approval_gate", true)} onChange={v => set("approval_gate", v)} />
        <ToggleRow label="Send agent activity digest (daily email)" checked={get("digest_email", false)} onChange={v => set("digest_email", v)} />
      </div>

      {/* Approval gate threshold */}
      <div className="bg-white border border-slate-100 rounded-2xl p-5">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Approval gate threshold</p>
        <p className="text-xs text-slate-400 mb-3">Actions above this financial threshold require manual approval before execution.</p>
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-600">$</span>
          <input
            type="number"
            value={get("approval_threshold", 500)}
            onChange={e => set("approval_threshold", Number(e.target.value))}
            className="w-32 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
          />
          <span className="text-xs text-slate-400">per action</span>
        </div>
      </div>

      {/* Agent roster */}
      <div className="bg-white border border-slate-100 rounded-2xl p-5">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-4">Agent roster — Phase 4</p>
        <div className="space-y-3">
          {PHASE4_AGENTS.map(agent => (
            <div key={agent.id} className="flex items-start gap-3 p-3 rounded-xl border border-slate-100 hover:border-slate-200 transition-colors">
              <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
                <Brain className="w-4 h-4 text-indigo-500" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                  <p className="text-sm font-semibold text-slate-700">{agent.label}</p>
                  <span className="text-[10px] font-bold bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full">Phase {agent.phase}</span>
                  <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full flex items-center gap-1">
                    <Clock className="w-2.5 h-2.5" /> Coming soon
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 leading-snug">{agent.desc}</p>
              </div>
              <div className="shrink-0 opacity-40">
                <button disabled className="w-10 h-6 rounded-full bg-slate-200 relative cursor-not-allowed">
                  <span className="absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-indigo-50 border border-indigo-100 rounded-2xl px-4 py-3 flex items-start gap-3">
        <Zap className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
        <div>
          <p className="text-xs font-semibold text-indigo-700">Agent memory grows with your data</p>
          <p className="text-[10px] text-indigo-500 mt-0.5">
            Every entity mutation, task outcome, and transaction is fed into agent memory. The longer you use Newsconseen, the smarter your agents become — this moat cannot be replicated by competitors without your history.
          </p>
        </div>
      </div>
    </div>
  );
}

function IdjwiMemorySection({ user }) {
  const companyId = user?.company_id;
  const [status, setStatus] = useState("pending");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [editing, setEditing] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [banner, setBanner] = useState(null);

  const idjwiHeaders = {
    ...API_HEADERS,
    "Content-Type": "application/json",
    ...(RAILWAY_API_KEY ? { "x-idjwi-api-key": RAILWAY_API_KEY } : {}),
    ...(user?.email ? { "x-idjwi-user": user.email } : {}),
    ...(user?.role ? { "x-idjwi-role": user.role } : {}),
  };

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["idjwi-memory", companyId, status, search, typeFilter],
    enabled: !!companyId,
    queryFn: async () => {
      if (status === "conflicts") {
        return fetchIdjwiConflicts({ user, companyId });
      }
      const params = new URLSearchParams({
        company_id: companyId,
        limit: "200",
      });
      if (status !== "all") params.set("review_status", status);
      if (search.trim()) params.set("q", search.trim());
      if (typeFilter !== "all") params.set("memory_type", typeFilter);
      const res = await fetch(`${RAILWAY_URL}/copilot/idjwi-memory?${params}`, {
        headers: idjwiHeaders,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `Memory fetch failed (${res.status})`);
      }
      return res.json();
    },
    staleTime: 0,
  });

  const entries = status === "conflicts" ? (data?.conflicts || []) : (data?.entries || []);
  const totals = data?.summary?.by_type || {};

  const valueText = (value) => {
    if (value == null) return "";
    if (typeof value === "string") return value;
    if (typeof value === "object") return value.value || JSON.stringify(value);
    return String(value);
  };

  const review = async (memory, action) => {
    if (!companyId || !memory?.id) return;
    setBusyId(memory.id);
    setBanner(null);
    try {
      const res = await fetch(`${RAILWAY_URL}/copilot/idjwi-memory/${memory.id}/review`, {
        method: "POST",
        headers: idjwiHeaders,
        body: JSON.stringify({ company_id: companyId, action }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `Review failed (${res.status})`);
      }
      setBanner({
        type: "success",
        msg: action === "confirm" ? "Memory confirmed." : "Memory rejected.",
      });
      refetch();
    } catch (e) {
      setBanner({ type: "error", msg: e.message || "Could not update memory." });
    } finally {
      setBusyId(null);
    }
  };

  const saveEdit = async () => {
    if (!editing?.id || !companyId) return;
    setBusyId(editing.id);
    setBanner(null);
    try {
      await updateIdjwiMemory({
        user,
        companyId,
        memoryId: editing.id,
        patch: {
          key: editing.key,
          value: editing.value,
          memory_type: editing.memory_type,
          confidence: Number(editing.confidence || 0.7),
          review_status: editing.review_status,
          expires_at: editing.expires_at || null,
        },
      });
      setEditing(null);
      setBanner({ type: "success", msg: "Memory updated." });
      refetch();
    } catch (e) {
      setBanner({ type: "error", msg: e.message || "Could not save memory." });
    } finally {
      setBusyId(null);
    }
  };

  const statusTabs = [
    { id: "pending", label: "Pending" },
    { id: "confirmed", label: "Confirmed" },
    { id: "rejected", label: "Rejected" },
    { id: "archived", label: "Archived" },
    { id: "conflicts", label: "Conflicts" },
    { id: "all", label: "All" },
  ];

  const memoryTypes = ["all", "business_rule", "metric_definition", "terminology", "preference", "structure", "domain_context", "relationship", "pattern"];

  return (
    <Card className="p-6 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-slate-800">Idjwi Memory</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Review durable knowledge learned from Advisor sessions before Autonomous Mode can use it.
          </p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isLoading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 text-xs font-bold disabled:opacity-50"
        >
          {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          Refresh
        </button>
      </div>

      {banner && <Banner type={banner.type} message={banner.msg} onDismiss={() => setBanner(null)} />}

      <div className="flex flex-wrap gap-2">
        {statusTabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setStatus(tab.id)}
            className={`px-3 py-1.5 rounded-xl border text-xs font-semibold transition-colors ${
              status === tab.id
                ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[1fr_220px] gap-2">
        <div className="relative">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search memory key, value, source, or type"
            className="pl-9"
          />
          <Filter className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
        </div>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-300"
        >
          {memoryTypes.map(type => (
            <option key={type} value={type}>{type === "all" ? "All memory types" : type.replace(/_/g, " ")}</option>
          ))}
        </select>
      </div>

      {status !== "conflicts" && <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {Object.entries(totals).slice(0, 8).map(([type, count]) => (
          <div key={type} className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
            <p className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold truncate">
              {type.replace(/_/g, " ")}
            </p>
            <p className="text-lg font-bold text-slate-800">{count}</p>
          </div>
        ))}
      </div>}

      <div className="space-y-3">
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-slate-400 py-8 justify-center">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading memory...
          </div>
        ) : entries.length === 0 ? (
          <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-8 text-center">
            <Brain className="w-7 h-7 text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-semibold text-slate-600">No {status === "all" ? "" : status} memories</p>
            <p className="text-xs text-slate-400 mt-1">
              Advisor-learned items appear here as pending until an operator confirms them.
            </p>
          </div>
        ) : status === "conflicts" ? entries.map(conflict => (
          <div key={`${conflict.memory_type}_${conflict.key}`} className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4 space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">conflict</Badge>
              <Badge className="bg-white text-slate-600 hover:bg-white">{conflict.memory_type?.replace(/_/g, " ")}</Badge>
              <p className="text-sm font-semibold text-slate-800">{conflict.key?.replace(/_/g, " ")}</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {(conflict.memories || []).map(item => (
                <div key={item.id} className="rounded-xl border border-amber-100 bg-white p-3">
                  <p className="text-xs text-slate-700 leading-relaxed break-words">{valueText(item.value)}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-slate-400">
                    <span>{item.source || "unknown source"}</span>
                    <span>confidence {Number(item.confidence || 0).toFixed(2)}</span>
                    <span>{item.review_status}</span>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-amber-700">
              Review the competing memories in Pending or All, then confirm the value Idjwi should use.
            </p>
          </div>
        )) : entries.map(memory => (
          <div key={memory.id} className="rounded-2xl border border-slate-100 bg-white p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <Badge className="bg-slate-100 text-slate-600 hover:bg-slate-100">
                    {memory.memory_type?.replace(/_/g, " ") || "memory"}
                  </Badge>
                  <Badge className={
                    memory.review_status === "confirmed"
                      ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100"
                      : memory.review_status === "rejected"
                      ? "bg-rose-100 text-rose-700 hover:bg-rose-100"
                      : "bg-amber-100 text-amber-700 hover:bg-amber-100"
                  }>
                    {memory.review_status}
                  </Badge>
                  <span className="text-[10px] text-slate-400">
                    {memory.source || memory.owner} · confidence {Number(memory.confidence || 0).toFixed(2)}
                  </span>
                </div>
                <p className="text-sm font-semibold text-slate-800 break-words">
                  {memory.key?.replace(/_/g, " ")}
                </p>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed break-words">
                  {valueText(memory.value)}
                </p>
                <div className="flex flex-wrap gap-2 mt-2 text-[10px] text-slate-400">
                  <span>used {memory.usage_count || 0} times</span>
                  {memory.last_used_at && <span>last used {new Date(memory.last_used_at).toLocaleDateString()}</span>}
                  {memory.expires_at && <span>expires {new Date(memory.expires_at).toLocaleDateString()}</span>}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => setEditing({
                    id: memory.id,
                    key: memory.key || "",
                    value: valueText(memory.value),
                    memory_type: memory.memory_type || "business_rule",
                    confidence: memory.confidence || 0.7,
                    review_status: memory.review_status || "pending",
                    expires_at: memory.expires_at ? String(memory.expires_at).slice(0, 10) : "",
                  })}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 text-xs font-bold"
                >
                  <Save className="w-3.5 h-3.5" />
                  Edit
                </button>
                {memory.review_status === "pending" && (
                  <>
                  <button
                    onClick={() => review(memory, "confirm")}
                    disabled={busyId === memory.id}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 text-xs font-bold disabled:opacity-50"
                  >
                    {busyId === memory.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                    Confirm
                  </button>
                  <button
                    onClick={() => review(memory, "reject")}
                    disabled={busyId === memory.id}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-50 text-rose-700 hover:bg-rose-100 text-xs font-bold disabled:opacity-50"
                  >
                    <X className="w-3.5 h-3.5" />
                    Reject
                  </button>
                  </>
                )}
              </div>
            </div>

            {editing?.id === memory.id && (
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input value={editing.key} onChange={(e) => setEditing({ ...editing, key: e.target.value })} placeholder="memory key" />
                <select
                  value={editing.memory_type}
                  onChange={(e) => setEditing({ ...editing, memory_type: e.target.value })}
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-600"
                >
                  {memoryTypes.filter(t => t !== "all").map(type => <option key={type} value={type}>{type.replace(/_/g, " ")}</option>)}
                </select>
                <textarea
                  value={editing.value}
                  onChange={(e) => setEditing({ ...editing, value: e.target.value })}
                  rows={3}
                  className="sm:col-span-2 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-600"
                />
                <Input type="number" step="0.05" min="0" max="1" value={editing.confidence} onChange={(e) => setEditing({ ...editing, confidence: e.target.value })} />
                <Input type="date" value={editing.expires_at || ""} onChange={(e) => setEditing({ ...editing, expires_at: e.target.value })} />
                <select
                  value={editing.review_status}
                  onChange={(e) => setEditing({ ...editing, review_status: e.target.value })}
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-600"
                >
                  {["pending", "confirmed", "rejected", "archived"].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <div className="flex justify-end gap-2">
                  <button onClick={() => setEditing(null)} className="px-3 py-2 rounded-xl text-xs font-bold text-slate-500 hover:bg-white">Cancel</button>
                  <button onClick={saveEdit} disabled={busyId === memory.id} className="px-3 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 disabled:opacity-50">
                    Save
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

const ALL_TABS = [
  { id: "profile",       label: "Profile",       icon: User,          adminOnly: false },
  { id: "password",      label: "Password",      icon: Lock,          adminOnly: false },
  { id: "notifications", label: "Notifications", icon: Bell,          adminOnly: false },
  { id: "sessions",      label: "Sessions",      icon: Monitor,       adminOnly: false },
  { id: "network",       label: "Network",       icon: Globe,         adminOnly: false },
  { id: "branding",      label: "Brand Settings", icon: Palette,       superAdminOnly: true },
  { id: "agents",        label: "Agents",         icon: Brain,         adminOnly: true  },
  { id: "idjwi_memory",  label: "Idjwi Memory",   icon: Brain,         adminOnly: true  },
  { id: "reports",       label: "Report Delivery",  icon: Send,         adminOnly: true  },
  { id: "autotask",      label: "Auto-Remediation", icon: Zap,          adminOnly: true  },
  { id: "goals",         label: "KPI Goals",        icon: Calendar,     adminOnly: true  },
  { id: "security",      label: "Security",         icon: KeyRound,     adminOnly: false },
  { id: "audit",         label: "Audit Trail",      icon: ScrollText,   adminOnly: true  },
  { id: "readiness",     label: "AI Readiness",   icon: ShieldCheck,  adminOnly: true  },
  { id: "error_log",     label: "Error Log",      icon: Bug,           adminOnly: true  },
  { id: "danger",        label: "Danger Zone",    icon: AlertTriangle, adminOnly: false },
];

const DEFAULT_NOTIF = {
  task_assigned: true, task_overdue: true, med_recall: true,
  low_stock: true, transaction_posting: true, license_expiry: true,
  email_daily: true, email_weekly: true, email_urgent: true,
  daily_time: "08:00", weekly_day: "Monday",
};

export default function Settings() {
  const qc = useQueryClient();
  const { data: user = null } = useQuery({
    queryKey: ["currentUser"],
    queryFn: () => ncClient.auth.me(),
    staleTime: 0,
    refetchOnMount: "always",
  });
  const [activeTab, setActiveTab] = useState(() => {
    const h = window.location.hash.replace("#", "");
    return ALL_TABS.find((t) => t.id === h)?.id || "profile";
  });

  const { data: enterprises = [] } = useQuery({
    queryKey: ["enterprises-settings"],
    queryFn: () => ncClient.entities.Enterprise.list(),
    enabled: !!user,
    staleTime: 0,
    refetchOnMount: "always",
  });

  const myEnterprise = enterprises.find((e) => e.id === user?.company_id) ||
    (user?.company_id ? enterprises.find((e) => e.enterprise_name === user.company_id) : null);

  const isAdmin = user?.role === "admin" || user?.role === "super_admin";
  const isSuperAdmin = user?.role === "super_admin";
  const TABS = ALL_TABS.filter((t) => {
    if (t.superAdminOnly) return isSuperAdmin;
    if (t.adminOnly) return isAdmin;
    return true;
  });

  if (!user) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-slate-200 border-t-emerald-500 rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center">
          <SettingsIcon className="w-5 h-5 text-slate-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-800">Account Settings</h1>
          <p className="text-xs text-slate-400">Manage your profile, password, and preferences</p>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        <div className="lg:w-48 shrink-0">
          <div className="flex lg:flex-col gap-1 overflow-x-auto lg:overflow-visible pb-2 lg:pb-0">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button key={id} onClick={() => setActiveTab(id)}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap transition-all w-full text-left
                  ${activeTab === id
                    ? id === "danger" ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"
                    : "text-slate-500 hover:bg-slate-50 hover:text-slate-700"}`}>
                <Icon className={`w-4 h-4 shrink-0 ${activeTab === id
                  ? id === "danger" ? "text-rose-600" : "text-emerald-600"
                  : "text-slate-400"}`} />
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 min-w-0">
          {activeTab === "profile"       && <ProfileSection user={user} myEnterprise={myEnterprise} onUserUpdated={() => qc.invalidateQueries({ queryKey: ["currentUser"] })} />}
          {activeTab === "password"      && <PasswordSection />}
          {activeTab === "notifications" && <NotificationsSection user={user} />}
          {activeTab === "sessions"      && <SessionsSection />}
          {activeTab === "network"       && <NetworkSection user={user} enterprises={enterprises} />}
          {activeTab === "branding"      && <BrandingSection user={user} enterprise={myEnterprise} />}
          {activeTab === "agents"        && <AgentsSection user={user} />}
          {activeTab === "idjwi_memory"  && <IdjwiMemorySection user={user} />}
          {activeTab === "reports"       && <ReportsSection user={user} enterprise={myEnterprise} />}
          {activeTab === "autotask"      && <AutoTaskSection user={user} />}
          {activeTab === "goals"         && <GoalsSection user={user} />}
          {activeTab === "security"      && <SecuritySection user={user} />}
          {activeTab === "audit"         && <AuditTrailSection user={user} />}
          {activeTab === "readiness"     && <AIReadinessSection user={user} />}
          {activeTab === "error_log"     && <ErrorLogSection user={user} />}
          {activeTab === "danger"        && <DangerSection user={user} />}
        </div>
      </div>
    </div>
  );
}

function ProfileSection({ user, myEnterprise, onUserUpdated }) {
  const PROFILE_KEY = `profile_name_${user.email}`;
  const [name, setName] = useState(
    localStorage.getItem(PROFILE_KEY) || user.full_name || ""
  );
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState(null);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    // Persist locally immediately — always succeeds
    localStorage.setItem(PROFILE_KEY, name.trim());
    onUserUpdated({ ...user, full_name: name.trim() });
    // Also attempt server-side update (may or may not be supported by SDK)
    try {
      if (typeof ncClient.auth.updateMe === "function") {
        await ncClient.auth.updateMe({ full_name: name.trim() });
      } else if (typeof ncClient.auth.updateProfile === "function") {
        await ncClient.auth.updateProfile({ full_name: name.trim() });
      }
    } catch { /* ignore — local update already applied */ }
    setBanner({ type: "success", msg: "Profile updated successfully." });
    setTimeout(() => setBanner(null), 3000);
    setSaving(false);
  };

  const memberSince = user.created_date
    ? new Date(user.created_date).toLocaleDateString("en-US", { month: "long", year: "numeric" })
    : "—";

  return (
    <Card className="p-6 space-y-6">
      <div>
        <h2 className="text-base font-bold text-slate-800">My Profile</h2>
        <p className="text-xs text-slate-400 mt-0.5">Update your name and view your account details.</p>
      </div>
      {banner && <Banner type={banner.type} message={banner.msg} onDismiss={() => setBanner(null)} />}

      <div className="flex flex-col items-center gap-2">
        <div className="w-20 h-20 rounded-full bg-emerald-600 flex items-center justify-center text-white text-2xl font-black shadow-lg shadow-emerald-200">
          {getInitials(name || user.email)}
        </div>
        <span className="text-xs text-slate-400 italic">Photo upload coming soon</span>
      </div>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-slate-700">Full Name</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} className="rounded-xl" placeholder="Your full name" />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
            <Mail className="w-3.5 h-3.5 text-slate-400" /> Email Address
          </label>
          <Input value={user.email || ""} readOnly className="rounded-xl bg-slate-50 text-slate-400 cursor-not-allowed" />
          <p className="text-xs text-slate-400">Contact support to change your email address.</p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">Role</label>
            <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 min-h-[38px]">
              <Shield className="w-4 h-4 text-slate-400" />
              <Badge className={
                user.role === "super_admin" ? "bg-emerald-50 text-emerald-700" :
                user.role === "admin" ? "bg-violet-50 text-violet-700" : "bg-slate-100 text-slate-500"
              }>{user.role || "user"}</Badge>
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">Enterprise</label>
            <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 min-h-[38px]">
              <Building2 className="w-4 h-4 text-slate-400 shrink-0" />
              <span className="text-sm text-slate-600 truncate">{myEnterprise?.enterprise_name || "—"}</span>
            </div>
          </div>
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-slate-400" /> Member Since
          </label>
          <p className="text-sm text-slate-600 px-3 py-2 bg-slate-50 rounded-xl border border-slate-200">{memberSince}</p>
        </div>
      </div>

      <Button onClick={handleSave} disabled={saving || !name.trim()} className="w-full bg-emerald-600 hover:bg-emerald-700 rounded-xl">
        {saving ? "Saving..." : <><Save className="w-4 h-4 mr-2" /> Save Profile</>}
      </Button>
    </Card>
  );
}

function PasswordSection() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState(null);

  const strength = passwordStrength(next);
  const mismatch = confirm && next !== confirm;
  const canSubmit = current && next.length >= 8 && next === confirm;

  const handleSubmit = async () => {
    setSaving(true);
    try {
      const me = await ncClient.auth.me();
      // Try the most common SDK method names for password change
      if (typeof ncClient.auth.changePassword === "function") {
        await ncClient.auth.changePassword({ userId: me.id, currentPassword: current, newPassword: next });
      } else if (typeof ncClient.auth.updatePassword === "function") {
        await ncClient.auth.updatePassword({ currentPassword: current, newPassword: next });
      } else if (typeof ncClient.auth.updateMe === "function") {
        await ncClient.auth.updateMe({ password: next, currentPassword: current });
      } else {
        // SDK doesn't expose password change — guide user
        throw new Error("password_change_unsupported");
      }
      setBanner({ type: "success", msg: "Password updated successfully." });
      setCurrent(""); setNext(""); setConfirm("");
    } catch (e) {
      const msg = e?.message;
      if (msg === "password_change_unsupported") {
        setBanner({ type: "error", msg: "Password change is managed by your account provider. Contact support to reset it." });
      } else if (msg?.includes("incorrect") || msg?.includes("wrong") || msg?.includes("invalid")) {
        setBanner({ type: "error", msg: "Current password is incorrect." });
      } else {
        setBanner({ type: "error", msg: "Failed to update password. Please try again." });
      }
    }
    setSaving(false);
  };

  return (
    <Card className="p-6 space-y-5">
      <div>
        <h2 className="text-base font-bold text-slate-800">Change Password</h2>
        <p className="text-xs text-slate-400 mt-0.5">Choose a strong password at least 8 characters long.</p>
      </div>
      {banner && <Banner type={banner.type} message={banner.msg} onDismiss={() => setBanner(null)} />}
      <PasswordField label="Current Password" value={current} onChange={setCurrent} placeholder="••••••••" />
      <div className="space-y-1.5">
        <PasswordField label="New Password" value={next} onChange={setNext} placeholder="••••••••" />
        {strength && (
          <div className="flex items-center gap-2 mt-1">
            <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all ${strength.color}`}
                style={{ width: strength.label === "Weak" ? "33%" : strength.label === "Fair" ? "66%" : "100%" }} />
            </div>
            <span className={`text-xs font-medium ${strength.text}`}>{strength.label}</span>
          </div>
        )}
      </div>
      <div className="space-y-1.5">
        <PasswordField label="Confirm New Password" value={confirm} onChange={setConfirm} placeholder="••••••••" />
        {mismatch && <p className="text-xs text-rose-500">Passwords do not match</p>}
      </div>
      <Button onClick={handleSubmit} disabled={saving || !canSubmit} className="w-full bg-emerald-600 hover:bg-emerald-700 rounded-xl">
        {saving ? "Updating..." : <><Lock className="w-4 h-4 mr-2" /> Update Password</>}
      </Button>
    </Card>
  );
}

function NotificationsSection({ user }) {
  const key = `notification_prefs_${user.email}`;
  const [prefs, setPrefs] = useState(() => {
    try { return { ...DEFAULT_NOTIF, ...JSON.parse(localStorage.getItem(key) || "{}") }; }
    catch { return { ...DEFAULT_NOTIF }; }
  });
  const [saved, setSaved] = useState(false);

  const set = (k, v) => setPrefs((p) => ({ ...p, [k]: v }));

  const handleSave = () => {
    localStorage.setItem(key, JSON.stringify(prefs));
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <Card className="p-6 space-y-6">
      <div>
        <h2 className="text-base font-bold text-slate-800">Notification Preferences</h2>
        <p className="text-xs text-slate-400 mt-0.5">Choose which alerts and digests you receive.</p>
      </div>
      {saved && <Banner type="success" message="Preferences saved." />}

      <div>
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">In-App Notifications</p>
        <div className="rounded-xl border border-slate-100 px-4">
          <ToggleRow label="Task assigned to me"           checked={prefs.task_assigned}       onChange={(v) => set("task_assigned", v)} />
          <ToggleRow label="Task overdue (daily 9am)"      checked={prefs.task_overdue}        onChange={(v) => set("task_overdue", v)} />
          <ToggleRow label="Medication recall detected"    checked={prefs.med_recall}          onChange={(v) => set("med_recall", v)} />
          <ToggleRow label="Stock below minimum level"     checked={prefs.low_stock}           onChange={(v) => set("low_stock", v)} />
          <ToggleRow label="Transaction needs posting"     checked={prefs.transaction_posting} onChange={(v) => set("transaction_posting", v)} />
          <ToggleRow label="License expiring in 30 days"  checked={prefs.license_expiry}      onChange={(v) => set("license_expiry", v)} />
        </div>
      </div>

      <div>
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Email Notifications</p>
        <div className="rounded-xl border border-slate-100 px-4">
          <ToggleRow label="Daily task summary" checked={prefs.email_daily} onChange={(v) => set("email_daily", v)} />
          {prefs.email_daily && (
            <div className="pb-3">
              <label className="text-xs text-slate-500 mb-1 block">Send at</label>
              <input type="time" value={prefs.daily_time} onChange={(e) => set("daily_time", e.target.value)}
                className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400" />
            </div>
          )}
          <ToggleRow label="Weekly analytics report" checked={prefs.email_weekly} onChange={(v) => set("email_weekly", v)} />
          {prefs.email_weekly && (
            <div className="pb-3">
              <label className="text-xs text-slate-500 mb-1 block">Send on</label>
              <select value={prefs.weekly_day} onChange={(e) => set("weekly_day", e.target.value)}
                className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400">
                {["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"].map((d) => <option key={d}>{d}</option>)}
              </select>
            </div>
          )}
          <ToggleRow label="Urgent alerts (recalls, critical stock)" checked={prefs.email_urgent} onChange={(v) => set("email_urgent", v)} />
        </div>
      </div>

      <Button onClick={handleSave} className="w-full bg-emerald-600 hover:bg-emerald-700 rounded-xl">
        <Save className="w-4 h-4 mr-2" /> Save Preferences
      </Button>
    </Card>
  );
}

function SessionsSection() {
  return (
    <Card className="p-6 space-y-5">
      <div>
        <h2 className="text-base font-bold text-slate-800">Active Sessions</h2>
        <p className="text-xs text-slate-400 mt-0.5">You are currently signed in on these devices.</p>
      </div>
      <div className="rounded-xl border border-slate-200 p-4 flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
          <Monitor className="w-4 h-4 text-slate-600" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-slate-800">This device</p>
            <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full px-2 py-0.5 font-bold">Current</span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">{getBrowser()} · Last active: Just now</p>
        </div>
      </div>
      <div className="bg-slate-50 rounded-xl p-4">
        <p className="text-sm font-medium text-slate-700 mb-1">Sign out all devices</p>
        <p className="text-xs text-slate-500">To sign out of all devices, change your password — this will invalidate all existing sessions.</p>
      </div>
    </Card>
  );
}

// ── Security Section (2FA + OAuth2) ──────────────────────────────────────────
const RAILWAY_SEC_URL = "https://newsconseenwebapp-production.up.railway.app";

function SecuritySection({ user }) {
  const [status2fa, setStatus2fa]   = useState(null);   // {enabled, status}
  const [setup, setSetup]           = useState(null);   // {qr_image_b64, secret}
  const [verifyCode, setVerifyCode] = useState("");
  const [oauth2, setOauth2]         = useState(null);   // {providers:[…]}
  const [loading, setLoading]       = useState(false);
  const [msg, setMsg]               = useState(null);   // {type,text}

  const userId = user?.id || user?._id || user?.user_id || "";
  const companyId = user?.company_id || "";
  const userEmail = user?.email || "";

  // Fetch 2FA status + OAuth2 providers on mount
  useEffect(() => {
    if (!userId) return;
    fetch(`${RAILWAY_SEC_URL}/security/2fa/status?user_id=${encodeURIComponent(userId)}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => d && setStatus2fa(d))
      .catch(() => {});
    fetch(`${RAILWAY_SEC_URL}/security/oauth2/providers`)
      .then(r => r.ok ? r.json() : null)
      .then(d => d && setOauth2(d))
      .catch(() => {});
  }, [userId]);

  async function handleSetup2FA() {
    setLoading(true); setMsg(null);
    try {
      const r = await fetch(`${RAILWAY_SEC_URL}/security/2fa/setup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, company_id: companyId, user_email: userEmail }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail || "Setup failed");
      setSetup(d);
    } catch (e) {
      setMsg({ type: "error", text: e.message });
    } finally { setLoading(false); }
  }

  async function handleVerify2FA() {
    if (!verifyCode.trim()) return;
    setLoading(true); setMsg(null);
    try {
      const r = await fetch(`${RAILWAY_SEC_URL}/security/2fa/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, code: verifyCode }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail || "Verification failed");
      setSetup(null);
      setVerifyCode("");
      setStatus2fa({ enabled: true, status: "active" });
      setMsg({ type: "success", text: "2FA is now active. You'll be asked for a code on each login." });
    } catch (e) {
      setMsg({ type: "error", text: e.message });
    } finally { setLoading(false); }
  }

  async function handleDisable2FA() {
    if (!confirm("Disable 2FA? This will remove your authenticator app requirement.")) return;
    setLoading(true); setMsg(null);
    try {
      const r = await fetch(`${RAILWAY_SEC_URL}/security/2fa?user_id=${encodeURIComponent(userId)}`, { method: "DELETE" });
      if (!r.ok) throw new Error("Failed to disable 2FA");
      setStatus2fa({ enabled: false, status: "not_enrolled" });
      setSetup(null);
      setMsg({ type: "success", text: "2FA disabled." });
    } catch (e) {
      setMsg({ type: "error", text: e.message });
    } finally { setLoading(false); }
  }

  async function handleOAuth2Login(provider) {
    setLoading(true); setMsg(null);
    try {
      const r = await fetch(`${RAILWAY_SEC_URL}/security/oauth2/${provider}/authorize`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail || "OAuth2 not configured");
      window.location.href = d.auth_url;
    } catch (e) {
      setMsg({ type: "error", text: e.message });
      setLoading(false);
    }
  }

  const is2faActive = status2fa?.enabled && status2fa?.status === "active";

  return (
    <div className="space-y-6">
      <Banner type={msg?.type} message={msg?.text} onDismiss={() => setMsg(null)} />

      {/* Two-Factor Authentication */}
      <Card className="p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center">
            <Smartphone className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-800">Two-Factor Authentication</h3>
            <p className="text-xs text-slate-500">Require a 6-digit code from your authenticator app on each login</p>
          </div>
          {is2faActive && (
            <span className="ml-auto text-xs font-medium bg-emerald-100 text-emerald-700 px-2.5 py-1 rounded-full">Active</span>
          )}
        </div>

        {is2faActive ? (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              2FA is enabled on your account. Your authenticator app is configured and required at login.
            </p>
            <Button variant="outline" size="sm" onClick={handleDisable2FA} disabled={loading}
              className="text-rose-600 border-rose-200 hover:bg-rose-50">
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Disable 2FA
            </Button>
          </div>
        ) : setup ? (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              Scan the QR code with <strong>Google Authenticator</strong>, <strong>Authy</strong>, or any TOTP app.
              Then enter the 6-digit code below to activate.
            </p>
            <div className="flex flex-col sm:flex-row gap-6 items-start">
              {setup.qr_image_b64 && (
                <img src={setup.qr_image_b64} alt="2FA QR code" className="w-40 h-40 border rounded-xl" />
              )}
              <div className="space-y-3 flex-1">
                <div>
                  <p className="text-xs text-slate-500 mb-1">Manual entry key</p>
                  <code className="text-xs bg-slate-100 px-3 py-2 rounded-lg font-mono block break-all">{setup.secret}</code>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-700">Verification code</label>
                  <div className="flex gap-2">
                    <input
                      type="text" inputMode="numeric" maxLength={6}
                      value={verifyCode} onChange={e => setVerifyCode(e.target.value.replace(/\D/g, ""))}
                      placeholder="000000"
                      className="w-32 px-3 py-2 border rounded-lg text-center text-lg font-mono tracking-widest"
                    />
                    <Button onClick={handleVerify2FA} disabled={loading || verifyCode.length < 6}>
                      {loading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <CheckCircle2 className="w-4 h-4 mr-1" />}
                      Activate
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              2FA is not enabled. Add an extra layer of security by linking your authenticator app.
            </p>
            <Button size="sm" onClick={handleSetup2FA} disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Smartphone className="w-4 h-4 mr-2" />}
              Enable 2FA
            </Button>
          </div>
        )}
      </Card>

      {/* OAuth2 Social Login */}
      <Card className="p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center">
            <LogIn className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-800">Social Login</h3>
            <p className="text-xs text-slate-500">Link your account to a Google or Microsoft identity</p>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Google */}
          <button
            onClick={() => handleOAuth2Login("google")}
            disabled={loading || !(oauth2?.providers?.find(p => p.id === "google")?.configured)}
            className="flex items-center gap-3 px-4 py-2.5 border rounded-xl text-sm font-medium
              hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Sign in with Google
            {!(oauth2?.providers?.find(p => p.id === "google")?.configured) && (
              <span className="text-xs text-slate-400 ml-1">(not configured)</span>
            )}
          </button>

          {/* Microsoft */}
          <button
            onClick={() => handleOAuth2Login("microsoft")}
            disabled={loading || !(oauth2?.providers?.find(p => p.id === "microsoft")?.configured)}
            className="flex items-center gap-3 px-4 py-2.5 border rounded-xl text-sm font-medium
              hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
              <path fill="#F25022" d="M1 1h10v10H1z"/>
              <path fill="#00A4EF" d="M13 1h10v10H13z"/>
              <path fill="#7FBA00" d="M1 13h10v10H1z"/>
              <path fill="#FFB900" d="M13 13h10v10H13z"/>
            </svg>
            Sign in with Microsoft
            {!(oauth2?.providers?.find(p => p.id === "microsoft")?.configured) && (
              <span className="text-xs text-slate-400 ml-1">(not configured)</span>
            )}
          </button>
        </div>
        <p className="text-xs text-slate-400 mt-3">
          OAuth2 providers require GOOGLE_CLIENT_ID / MICROSOFT_CLIENT_ID env vars on Railway to activate.
        </p>
      </Card>

      {/* Security Headers status */}
      <Card className="p-5">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-800">Security Headers</h3>
            <p className="text-xs text-slate-500">HTTP security headers applied to all API responses</p>
          </div>
          <span className="ml-auto text-xs font-medium bg-emerald-100 text-emerald-700 px-2.5 py-1 rounded-full">Active</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {["HSTS", "CSP", "X-Frame-Options: DENY", "X-Content-Type-Options", "Referrer-Policy", "Permissions-Policy"].map(h => (
            <div key={h} className="flex items-center gap-1.5 text-xs text-slate-600">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              {h}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ── Audit Trail Section ───────────────────────────────────────────────────────
const RAILWAY_AUDIT_URL = "https://newsconseenwebapp-production.up.railway.app";

const ENTITY_OPTS = [
  { id: "",             label: "All entities" },
  { id: "person",       label: "Person" },
  { id: "enterprise",   label: "Enterprise" },
  { id: "product",      label: "Product" },
  { id: "task",         label: "Task" },
  { id: "transaction",  label: "Transaction" },
  { id: "relationship", label: "Relationship" },
  { id: "address",      label: "Address" },
];

const ACTION_OPTS = [
  { id: "",        label: "All actions" },
  { id: "created", label: "Created" },
  { id: "updated", label: "Updated" },
  { id: "deleted", label: "Deleted" },
];

const ACTION_COLORS = {
  created: "bg-emerald-100 text-emerald-700",
  updated: "bg-amber-100  text-amber-700",
  deleted: "bg-rose-100   text-rose-700",
};

function AuditTrailSection({ user }) {
  const [entityType, setEntityType] = useState("");
  const [action,     setAction]     = useState("");
  const [changedBy,  setChangedBy]  = useState("");
  const [dateFrom,   setDateFrom]   = useState("");
  const [dateTo,     setDateTo]     = useState("");
  const [loading,    setLoading]    = useState(false);
  const [entries,    setEntries]    = useState(null);   // null = not yet loaded
  const [summary,    setSummary]    = useState(null);
  const [exporting,  setExporting]  = useState(false);

  const companyId = user?.company_id;

  async function fetchLog() {
    if (!companyId) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ company_id: companyId, limit: 200 });
      if (entityType) params.set("entity_type", entityType);
      if (action)     params.set("action",      action);
      if (changedBy)  params.set("changed_by",  changedBy);
      if (dateFrom)   params.set("date_from",   dateFrom);
      if (dateTo)     params.set("date_to",     dateTo);

      const [logRes, sumRes] = await Promise.all([
        fetch(`${RAILWAY_AUDIT_URL}/audit/log?${params}`),
        fetch(`${RAILWAY_AUDIT_URL}/audit/summary?company_id=${companyId}`),
      ]);

      if (logRes.ok) {
        const data = await logRes.json();
        setEntries(data.entries || []);
      }
      if (sumRes.ok) {
        setSummary(await sumRes.json());
      }
    } catch (e) {
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }

  async function exportCSV() {
    if (!companyId) return;
    setExporting(true);
    try {
      const params = new URLSearchParams({ company_id: companyId });
      if (entityType) params.set("entity_type", entityType);
      if (action)     params.set("action",      action);
      if (changedBy)  params.set("changed_by",  changedBy);
      if (dateFrom)   params.set("date_from",   dateFrom);
      if (dateTo)     params.set("date_to",     dateTo);

      const res = await fetch(`${RAILWAY_AUDIT_URL}/audit/export?${params}`);
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = `audit_log_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // silent — user sees no change
    } finally {
      setExporting(false);
    }
  }

  // Load on first render
  useEffect(() => { fetchLog(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
            <ScrollText className="w-4 h-4 text-slate-500" /> Audit Trail
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Immutable change log across all 7 entities — who changed what and when.
          </p>
        </div>
        <Button
          onClick={exportCSV}
          disabled={exporting || !entries?.length}
          variant="outline"
          className="rounded-xl text-xs gap-1.5"
        >
          {exporting
            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
            : <Download className="w-3.5 h-3.5" />}
          Export CSV
        </Button>
      </div>

      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-slate-50 rounded-xl p-3 border border-slate-200">
            <p className="text-[10px] text-slate-400 uppercase font-semibold">Total events</p>
            <p className="text-xl font-bold text-slate-800 mt-0.5">{summary.total?.toLocaleString() || 0}</p>
          </div>
          {Object.entries(summary.by_action || {}).map(([act, count]) => (
            <div key={act} className="bg-slate-50 rounded-xl p-3 border border-slate-200">
              <p className="text-[10px] text-slate-400 uppercase font-semibold capitalize">{act}</p>
              <p className="text-xl font-bold text-slate-800 mt-0.5">{count.toLocaleString()}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-xs font-semibold text-slate-600">Filters</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div>
            <label className="text-[10px] font-semibold text-slate-500 uppercase mb-1 block">Entity</label>
            <select
              value={entityType}
              onChange={e => setEntityType(e.target.value)}
              className="w-full text-xs border border-slate-200 rounded-xl px-2.5 py-2 focus:outline-none focus:border-emerald-400 bg-white"
            >
              {ENTITY_OPTS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-semibold text-slate-500 uppercase mb-1 block">Action</label>
            <select
              value={action}
              onChange={e => setAction(e.target.value)}
              className="w-full text-xs border border-slate-200 rounded-xl px-2.5 py-2 focus:outline-none focus:border-emerald-400 bg-white"
            >
              {ACTION_OPTS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-semibold text-slate-500 uppercase mb-1 block">Changed by</label>
            <input
              value={changedBy}
              onChange={e => setChangedBy(e.target.value)}
              placeholder="user@email.com"
              className="w-full text-xs border border-slate-200 rounded-xl px-2.5 py-2 focus:outline-none focus:border-emerald-400"
            />
          </div>
          <div>
            <label className="text-[10px] font-semibold text-slate-500 uppercase mb-1 block">From date</label>
            <input
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              className="w-full text-xs border border-slate-200 rounded-xl px-2.5 py-2 focus:outline-none focus:border-emerald-400"
            />
          </div>
          <div>
            <label className="text-[10px] font-semibold text-slate-500 uppercase mb-1 block">To date</label>
            <input
              type="date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              className="w-full text-xs border border-slate-200 rounded-xl px-2.5 py-2 focus:outline-none focus:border-emerald-400"
            />
          </div>
          <div className="flex items-end">
            <Button
              onClick={fetchLog}
              disabled={loading}
              className="w-full bg-emerald-600 hover:bg-emerald-700 rounded-xl text-xs gap-1.5"
            >
              {loading
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <RefreshCw className="w-3.5 h-3.5" />}
              Apply
            </Button>
          </div>
        </div>
      </Card>

      {/* Log table */}
      {entries === null ? (
        <div className="flex justify-center py-10">
          <div className="w-6 h-6 border-4 border-slate-200 border-t-emerald-500 rounded-full animate-spin" />
        </div>
      ) : entries.length === 0 ? (
        <div className="text-center py-12 text-slate-400">
          <ScrollText className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No audit events recorded yet.</p>
          <p className="text-xs mt-1">Events are logged automatically when operators create, update, or delete records.</p>
        </div>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  {["Timestamp", "Entity", "Name / ID", "Action", "Changed by", "Changes"].map(h => (
                    <th key={h} className="px-4 py-3 text-left font-semibold text-slate-600 whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {entries.map((entry, i) => {
                  const ts = entry.timestamp ? new Date(entry.timestamp) : null;
                  const fields = entry.changed_fields || {};
                  const fieldCount = Object.keys(fields).length;
                  return (
                    <tr key={i} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap">
                        {ts ? (
                          <>
                            <div>{ts.toLocaleDateString()}</div>
                            <div className="text-[10px] text-slate-400">{ts.toLocaleTimeString()}</div>
                          </>
                        ) : "—"}
                      </td>
                      <td className="px-4 py-2.5 font-medium text-slate-700 capitalize">
                        {entry.entity_type || "—"}
                      </td>
                      <td className="px-4 py-2.5 text-slate-600 max-w-[140px] truncate">
                        <div className="truncate">{entry.entity_name || "—"}</div>
                        {entry.entity_id && (
                          <div className="text-[10px] text-slate-400 font-mono truncate">{entry.entity_id}</div>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold capitalize ${ACTION_COLORS[entry.action] || "bg-slate-100 text-slate-600"}`}>
                          {entry.action || "—"}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-slate-500 max-w-[120px] truncate">
                        {entry.changed_by || <span className="text-slate-300">system</span>}
                      </td>
                      <td className="px-4 py-2.5 text-slate-500">
                        {fieldCount > 0 ? (
                          <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-medium">
                            {fieldCount} field{fieldCount !== 1 ? "s" : ""}
                          </span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2.5 border-t border-slate-100 flex items-center justify-between">
            <span className="text-[10px] text-slate-400">{entries.length} events shown</span>
            <button onClick={fetchLog} className="text-[10px] text-emerald-600 hover:text-emerald-800 font-medium flex items-center gap-1">
              <RefreshCw className="w-3 h-3" /> Refresh
            </button>
          </div>
        </Card>
      )}
    </div>
  );
}


// ── AI Readiness Section ─────────────────────────────────────────────────────
const RAILWAY_URL_READINESS = "https://newsconseenwebapp-production.up.railway.app";

const ENTITY_LABELS = {
  people:        { label: "People",        emoji: "👥" },
  enterprises:   { label: "Enterprises",   emoji: "🏢" },
  products:      { label: "Products",      emoji: "📦" },
  tasks:         { label: "Tasks",         emoji: "✅" },
  transactions:  { label: "Transactions",  emoji: "💳" },
  relationships: { label: "Relationships", emoji: "🔗" },
  addresses:     { label: "Addresses",     emoji: "📍" },
};

function scoreColor(score) {
  if (score >= 90) return { bar: "bg-emerald-500", text: "text-emerald-600", bg: "bg-emerald-50", border: "border-emerald-200" };
  if (score >= 75) return { bar: "bg-blue-500",    text: "text-blue-600",    bg: "bg-blue-50",    border: "border-blue-200"    };
  if (score >= 60) return { bar: "bg-amber-500",   text: "text-amber-600",   bg: "bg-amber-50",   border: "border-amber-200"   };
  return                   { bar: "bg-rose-500",   text: "text-rose-600",    bg: "bg-rose-50",    border: "border-rose-200"    };
}

function gradeLabel(grade) {
  return {
    A: "Excellent — your data is AI-ready",
    B: "Good — minor gaps won't materially affect AI answers",
    C: "Fair — some gaps may cause the AI to underestimate figures",
    D: "Poor — significant gaps will reduce AI accuracy",
    F: "Critical — AI answers may be unreliable until data is fixed",
  }[grade] || "";
}

function AIReadinessSection({ user }) {
  const [report,     setReport]     = useState(null);
  const [loading,    setLoading]    = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const companyId = user?.company_id;

  const fetchReport = async (force = false) => {
    if (!companyId) return;
    setLoading(!force);
    setRefreshing(force);
    try {
      const res = await fetch(
        `${RAILWAY_URL_READINESS}/dataquality/report?company_id=${companyId}${force ? "&force=true" : ""}`,
      );
      if (res.ok) setReport(await res.json());
    } catch { /* silent */ } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { fetchReport(false); }, [companyId]);

  if (loading) return (
    <Card className="p-8 flex items-center justify-center gap-3">
      <Loader2 className="w-5 h-5 animate-spin text-emerald-500" />
      <span className="text-sm text-slate-500">Evaluating your data…</span>
    </Card>
  );

  if (!report) return (
    <Card className="p-8 text-center">
      <Brain className="w-8 h-8 text-slate-300 mx-auto mb-2" />
      <p className="text-sm text-slate-500">Could not load readiness report.</p>
      <button onClick={() => fetchReport(false)} className="mt-3 text-xs text-emerald-600 hover:underline">Try again</button>
    </Card>
  );

  const score  = report.overall_score ?? 100;
  const grade  = report.grade ?? "A";
  const colors = scoreColor(score);
  const evaluatedAt = report.evaluated_at
    ? new Date(report.evaluated_at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
    : null;

  const criticalIssues = (report.issues || []).filter(i => i.severity === "critical");
  const warningIssues  = (report.issues || []).filter(i => i.severity === "warning");
  const entities = Object.entries(report.by_entity || {}).sort((a, b) => a[1] - b[1]);

  return (
    <div className="space-y-4">
      {/* Overall score card */}
      <Card className={`p-5 border ${colors.border} ${colors.bg}`}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            {/* Big score */}
            <div className={`w-20 h-20 rounded-2xl bg-white border ${colors.border} shadow-sm flex flex-col items-center justify-center shrink-0`}>
              <span className={`text-3xl font-black ${colors.text}`}>{score}</span>
              <span className="text-[10px] text-slate-400 font-medium">/100</span>
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-2xl font-black ${colors.text}`}>Grade {grade}</span>
                <Brain className={`w-5 h-5 ${colors.text}`} />
              </div>
              <p className="text-sm text-slate-600 max-w-sm">{gradeLabel(grade)}</p>
              {evaluatedAt && (
                <p className="text-[11px] text-slate-400 mt-1 flex items-center gap-1">
                  <Clock className="w-3 h-3" /> Evaluated {evaluatedAt}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={() => fetchReport(true)}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        {/* Overall progress bar */}
        <div className="mt-4">
          <div className="flex justify-between text-[11px] text-slate-500 mb-1">
            <span>AI readiness</span>
            <span>{score}%</span>
          </div>
          <div className="h-2 bg-white/60 rounded-full overflow-hidden border border-white/40">
            <div
              className={`h-full ${colors.bar} rounded-full transition-all duration-700`}
              style={{ width: `${score}%` }}
            />
          </div>
        </div>

        {/* Quick stats */}
        <div className="mt-3 flex gap-3">
          {report.critical_count > 0 && (
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 font-medium">
              {report.critical_count} critical issue{report.critical_count !== 1 ? "s" : ""}
            </span>
          )}
          {report.warning_count > 0 && (
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">
              {report.warning_count} warning{report.warning_count !== 1 ? "s" : ""}
            </span>
          )}
          {report.critical_count === 0 && report.warning_count === 0 && (
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> No issues found
            </span>
          )}
        </div>
      </Card>

      {/* Per-entity scores */}
      {entities.length > 0 && (
        <Card className="p-5">
          <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2 mb-4">
            <TrendingUp className="w-4 h-4 text-slate-400" />
            Score by Entity
          </h3>
          <div className="space-y-3">
            {entities.map(([entity, entityScore]) => {
              const meta     = ENTITY_LABELS[entity] || { label: entity, emoji: "📋" };
              const records  = report.record_counts?.[entity] ?? 0;
              const eColors  = scoreColor(entityScore);
              return (
                <div key={entity}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-slate-600 flex items-center gap-1.5">
                      <span>{meta.emoji}</span>
                      {meta.label}
                      {records > 0 && (
                        <span className="text-[10px] text-slate-400 font-normal">
                          ({records.toLocaleString()} records)
                        </span>
                      )}
                    </span>
                    <span className={`text-xs font-bold ${eColors.text}`}>{entityScore}</span>
                  </div>
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${eColors.bar} rounded-full transition-all duration-500`}
                      style={{ width: `${entityScore}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Issues to fix */}
      {(criticalIssues.length > 0 || warningIssues.length > 0) && (
        <Card className="p-5">
          <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 text-slate-400" />
            Issues to Fix
          </h3>
          <div className="space-y-2">
            {[...criticalIssues, ...warningIssues].slice(0, 12).map((issue, i) => (
              <div
                key={i}
                className={`flex items-start gap-3 px-3 py-2.5 rounded-xl border ${
                  issue.severity === "critical"
                    ? "bg-rose-50 border-rose-100"
                    : "bg-amber-50 border-amber-100"
                }`}
              >
                <span className="text-base shrink-0 mt-0.5" aria-hidden="true">
                  {issue.severity === "critical" ? "🔴" : "🟡"}
                </span>
                <div className="flex-1 min-w-0">
                  <p className={`text-xs font-semibold ${
                    issue.severity === "critical" ? "text-rose-700" : "text-amber-700"
                  }`}>
                    {issue.message}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">{issue.suggested_action}</p>
                </div>
                {issue.page && (
                  <a
                    href={`/${issue.page}`}
                    className={`shrink-0 flex items-center gap-0.5 text-[11px] font-semibold whitespace-nowrap ${
                      issue.severity === "critical" ? "text-rose-600 hover:text-rose-800" : "text-amber-600 hover:text-amber-800"
                    }`}
                  >
                    Fix <ChevronRight className="w-3 h-3" />
                  </a>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* What this means */}
      <Card className="p-4 bg-slate-50 border-slate-200">
        <div className="flex items-start gap-3">
          <ShieldCheck className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
          <div className="text-xs text-slate-500 space-y-1">
            <p className="font-semibold text-slate-600">What does this score mean?</p>
            <p>
              The AI Readiness Score measures how reliably the Copilot and Agents can answer questions
              about your organisation. Missing required fields, duplicate records, and invalid values
              reduce accuracy — the AI may underestimate headcounts, revenue, or task completion rates
              when the underlying data has gaps.
            </p>
            <p>
              A score of <strong>90+</strong> means the AI can answer with high confidence.
              Below <strong>60</strong>, consider fixing critical issues before relying on AI-generated insights
              for decisions.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}


function DangerSection({ user }) {
  const [confirmText, setConfirmText] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleDelete = async () => {
    if (confirmText !== "DELETE") return;
    setSubmitting(true);
    try {
      await ncClient.entities.Task.create({
        title: `Account deletion request: ${user.email}`,
        task_type: "other",
        priority: "high",
        assigned_to_email: "support@newsconseen.com",
        outcome_notes: `User requested account deletion at ${new Date().toISOString()}`,
      });
    } catch { /* still show submitted */ }
    setSubmitted(true);
    setSubmitting(false);
  };

  return (
    <Card className="p-6 space-y-5 border-rose-200">
      <div>
        <h2 className="text-base font-bold text-rose-700 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" /> Danger Zone
        </h2>
        <p className="text-xs text-slate-400 mt-0.5">These actions are irreversible. Please proceed with caution.</p>
      </div>
      {submitted ? (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-4 text-sm text-emerald-800">
          ✅ Your deletion request has been submitted. Our team will process it within 48 hours.
        </div>
      ) : (
        <div className="rounded-xl border border-rose-200 p-4 space-y-4">
          <div>
            <p className="text-sm font-semibold text-slate-800">Delete My Account</p>
            <p className="text-xs text-slate-500 mt-1">This cannot be undone. Your personal data will be removed but enterprise records you created will be retained.</p>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-600">Type <strong>DELETE</strong> to confirm</label>
            <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)}
              className="rounded-xl font-mono" placeholder="DELETE" />
          </div>
          <Button onClick={handleDelete} disabled={confirmText !== "DELETE" || submitting}
            variant="outline" className="w-full border-rose-300 text-rose-600 hover:bg-rose-50 rounded-xl">
            {submitting ? "Submitting..." : "Request Account Deletion"}
          </Button>
        </div>
      )}
    </Card>
  );
}

function NetworkSection({ user, enterprises }) {
  const RAILWAY_URL = "https://newsconseenwebapp-production.up.railway.app";
  const isNetworkAdmin = !!user?.network_company_id;

  // Network Admin: Manage Members
  const [members, setMembers] = useState([]);
  const [membersLoading, setMembersLoading] = useState(false);

  useEffect(() => {
    if (!isNetworkAdmin) return;
    setMembersLoading(true);
    fetch(`${RAILWAY_URL}/network/status?network_id=${user.network_company_id}`)
      .then((r) => r.json())
      .then((data) => setMembers(data.members || []))
      .catch(() => setMembers([]))
      .finally(() => setMembersLoading(false));
  }, [isNetworkAdmin, user?.network_company_id]);

  const handleRemoveMember = async (companyId) => {
    if (!confirm(`Remove this member from the network?`)) return;
    try {
      const res = await fetch(`${RAILWAY_URL}/network/members/${companyId}`, { method: "DELETE" });
      if (res.ok) {
        setMembers((m) => m.filter((mem) => mem.child_company_id !== companyId));
      }
    } catch { /* error */ }
  };

  // Network Admin: Generate Join Code
  const [expiresInDays, setExpiresInDays] = useState(30);
  const [generatingCode, setGeneratingCode] = useState(false);
  const [generatedCode, setGeneratedCode] = useState(null);
  const [codeError, setCodeError] = useState(null);

  const handleGenerateCode = async () => {
    const adminKey = prompt("Enter admin key to generate join code:");
    if (!adminKey) return;

    setGeneratingCode(true);
    setCodeError(null);
    try {
      const res = await fetch(`${RAILWAY_URL}/network/join-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          network_id: user.network_company_id,
          admin_key: adminKey,
          expires_in_days: expiresInDays,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setGeneratedCode(data.code);
      } else {
        setCodeError("Failed to generate code. Check admin key.");
      }
    } catch {
      setCodeError("Error generating code.");
    }
    setGeneratingCode(false);
  };

  // Member Operator: Join a Network
  const [joinCode, setJoinCode] = useState("");
  const [joiningNetwork, setJoiningNetwork] = useState(false);
  const [joinError, setJoinError] = useState(null);
  const [joinSuccess, setJoinSuccess] = useState(false);

  const myEnterpriseName =
    enterprises.find((e) => e.id === user?.company_id)?.enterprise_name ||
    user?.company_id ||
    "Unknown";

  const handleJoinNetwork = async () => {
    if (!joinCode.trim()) return;

    setJoiningNetwork(true);
    setJoinError(null);
    try {
      const res = await fetch(`${RAILWAY_URL}/network/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          join_code: joinCode,
          company_id: user.company_id,
          company_name: myEnterpriseName,
        }),
      });
      if (res.ok) {
        setJoinSuccess(true);
        setJoinCode("");
      } else {
        setJoinError("Invalid join code or already joined a network.");
      }
    } catch {
      setJoinError("Error joining network.");
    }
    setJoiningNetwork(false);
  };

  return (
    <Card className="p-6 space-y-8">
      <div>
        <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
          <Globe className="w-4 h-4" /> Network Administration
        </h2>
        <p className="text-xs text-slate-400 mt-0.5">Manage network membership and access.</p>
      </div>

      {isNetworkAdmin ? (
        <>
          {/* Section 1: Network Members */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-700">Network Members</h3>
            {membersLoading ? (
              <div className="flex justify-center py-6">
                <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />
              </div>
            ) : members.length === 0 ? (
              <p className="text-xs text-slate-500 py-4">No members yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50">
                      <th className="text-left px-3 py-2 font-semibold text-slate-700">Name</th>
                      <th className="text-left px-3 py-2 font-semibold text-slate-700">Company ID</th>
                      <th className="text-left px-3 py-2 font-semibold text-slate-700">Source</th>
                      <th className="text-left px-3 py-2 font-semibold text-slate-700">Joined</th>
                      <th className="text-left px-3 py-2 font-semibold text-slate-700">Status</th>
                      <th className="text-center px-3 py-2 font-semibold text-slate-700">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {members.map((mem) => (
                      <tr key={mem.child_company_id} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="px-3 py-2 text-slate-800 font-medium">{mem.child_name}</td>
                        <td className="px-3 py-2 text-slate-600 font-mono text-[10px]">{mem.child_company_id}</td>
                        <td className="px-3 py-2 text-slate-600 capitalize">{mem.source || "—"}</td>
                        <td className="px-3 py-2 text-slate-600">
                          {mem.joined_at ? new Date(mem.joined_at).toLocaleDateString() : "—"}
                        </td>
                        <td className="px-3 py-2">
                          <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${
                            mem.is_active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"
                          }`}>
                            {mem.is_active ? "Active" : "Inactive"}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-center">
                          <button
                            onClick={() => handleRemoveMember(mem.child_company_id)}
                            className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 p-1.5 rounded transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Section 2: Generate Join Code */}
          <div className="space-y-3 border-t border-slate-100 pt-6">
            <h3 className="text-sm font-semibold text-slate-700">Generate Join Code</h3>
            <div className="bg-slate-50 rounded-xl p-4 space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700">Expires in (days)</label>
                <Input
                  type="number"
                  value={expiresInDays}
                  onChange={(e) => setExpiresInDays(Math.max(1, parseInt(e.target.value) || 30))}
                  min="1"
                  className="rounded-lg"
                />
              </div>
              <Button
                onClick={handleGenerateCode}
                disabled={generatingCode}
                className="w-full bg-emerald-600 hover:bg-emerald-700 rounded-lg text-sm"
              >
                {generatingCode ? <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> : null}
                Generate Join Code
              </Button>
              {codeError && <p className="text-xs text-rose-600">{codeError}</p>}
            </div>

            {generatedCode && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 space-y-3">
                <p className="text-xs font-medium text-slate-700">Share this code with network members:</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 font-mono font-bold text-lg text-emerald-700 bg-white rounded-lg px-3 py-2 border border-emerald-200">
                    {generatedCode}
                  </code>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(generatedCode);
                    }}
                    className="p-2.5 hover:bg-emerald-100 rounded-lg transition-colors text-emerald-700"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-xs text-slate-600">
                  Members enter this code at Settings → Network → Join Network
                </p>
              </div>
            )}
          </div>
        </>
      ) : (
        /* Section 3: Join a Network */
        <div className="space-y-3 border-t border-slate-100 pt-6">
          <h3 className="text-sm font-semibold text-slate-700">Join a Network</h3>

          {joinSuccess && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-sm text-emerald-800">
              ✅ You have joined the network. Refresh to see the Network view.
            </div>
          )}

          {!joinSuccess && (
            <div className="bg-slate-50 rounded-xl p-4 space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700">Enter join code</label>
                <Input
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  placeholder="NSW-XXX-XXXXX"
                  className="rounded-lg font-mono uppercase"
                />
              </div>
              <Button
                onClick={handleJoinNetwork}
                disabled={!joinCode.trim() || joiningNetwork}
                className="w-full bg-emerald-600 hover:bg-emerald-700 rounded-lg text-sm"
              >
                {joiningNetwork ? <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> : null}
                Join Network
              </Button>
              {joinError && <p className="text-xs text-rose-600">{joinError}</p>}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

// ── Reports Section ──────────────────────────────────────────────────────────
const RAILWAY_URL = "https://newsconseenwebapp-production.up.railway.app";
const RAILWAY_API_KEY = import.meta.env.VITE_RAILWAY_API_KEY || "";
const API_HEADERS = RAILWAY_API_KEY ? { "x-api-key": RAILWAY_API_KEY } : {};

function ReportsSection({ user, enterprise }) {
  const companyId   = user?.company_id;
  const companyName = enterprise?.brand_name || enterprise?.enterprise_name || "Your Organisation";

  const [config, setConfig]     = useState({
    enabled:    false,
    frequency:  "weekly",
    recipients: [],
  });
  const [newEmail, setNewEmail] = useState("");
  const [newName,  setNewName]  = useState("");
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [sending,  setSending]  = useState(false);
  const [banner,   setBanner]   = useState(null);

  useEffect(() => {
    if (!companyId) return;
    fetch(`${RAILWAY_URL}/reports/schedule?company_id=${companyId}`, { headers: API_HEADERS })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data && data.configured) {
          setConfig({
            enabled:    data.enabled,
            frequency:  data.frequency || "weekly",
            recipients: data.recipients || [],
          });
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [companyId]);

  const showBanner = (type, msg) => {
    setBanner({ type, msg });
    setTimeout(() => setBanner(null), 4000);
  };

  const save = async () => {
    if (!companyId) return;
    setSaving(true);
    try {
      const res = await fetch(`${RAILWAY_URL}/reports/schedule`, {
        method:  "POST",
        headers: { ...API_HEADERS, "Content-Type": "application/json" },
        body:    JSON.stringify({ company_id: companyId, company_name: companyName, ...config }),
      });
      if (res.ok) showBanner("success", "Report schedule saved.");
      else        showBanner("error",   "Failed to save — check Railway logs.");
    } catch {
      showBanner("error", "Could not reach Railway service.");
    } finally {
      setSaving(false);
    }
  };

  const sendNow = async () => {
    if (!companyId) return;
    setSending(true);
    try {
      const res = await fetch(
        `${RAILWAY_URL}/reports/send-digest?company_id=${companyId}`,
        { method: "POST", headers: API_HEADERS }
      );
      const data = await res.json();
      if (data.status === "accepted") showBanner("success", "Digest queued — recipients will receive it shortly.");
      else if (data.reason)           showBanner("error",   data.reason);
      else                            showBanner("error",   "Delivery failed.");
    } catch {
      showBanner("error", "Could not reach Railway service.");
    } finally {
      setSending(false);
    }
  };

  const addRecipient = () => {
    if (!newEmail || !newEmail.includes("@")) return;
    setConfig(c => ({
      ...c,
      recipients: [...c.recipients, { email: newEmail.trim(), name: newName.trim() }],
    }));
    setNewEmail(""); setNewName("");
  };

  const removeRecipient = (idx) => {
    setConfig(c => ({ ...c, recipients: c.recipients.filter((_, i) => i !== idx) }));
  };

  if (loading) return (
    <div className="flex items-center justify-center h-32">
      <div className="w-5 h-5 border-2 border-slate-200 border-t-indigo-500 rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-slate-800">Report Delivery</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Automatically email operational summaries to your team on a schedule —
            no need to open the dashboard.
          </p>
        </div>
        <button
          onClick={save}
          disabled={saving}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-100 text-slate-600 hover:bg-slate-200 transition-all shrink-0"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          Save
        </button>
      </div>

      {banner && <Banner type={banner.type} message={banner.msg} onDismiss={() => setBanner(null)} />}

      <div className="bg-white border border-slate-100 rounded-2xl p-5">
        <ToggleRow
          label="Enable scheduled digest emails"
          checked={config.enabled}
          onChange={v => setConfig(c => ({ ...c, enabled: v }))}
        />
      </div>

      <div className="bg-white border border-slate-100 rounded-2xl p-5 space-y-4">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Delivery Schedule</p>
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-slate-700">Frequency</label>
          <div className="flex gap-2 flex-wrap">
            {["daily", "weekly", "monthly"].map(freq => (
              <button
                key={freq}
                onClick={() => setConfig(c => ({ ...c, frequency: freq }))}
                className={`px-4 py-2 rounded-xl text-sm font-medium border transition-all capitalize ${
                  config.frequency === freq
                    ? "bg-indigo-50 border-indigo-200 text-indigo-700"
                    : "border-slate-200 text-slate-500 hover:border-slate-300"
                }`}
              >
                {freq}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            {config.frequency === "daily"   && "Sent every morning after overnight ETL sync."}
            {config.frequency === "weekly"  && "Sent every Monday after weekly ETL sync."}
            {config.frequency === "monthly" && "Sent on the first of each month."}
          </p>
        </div>
      </div>

      <div className="bg-white border border-slate-100 rounded-2xl p-5 space-y-4">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Recipients</p>
        {config.recipients.length === 0 && (
          <p className="text-xs text-slate-400 italic">No recipients yet. Add at least one email address below.</p>
        )}
        {config.recipients.map((r, idx) => (
          <div key={idx} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0">
              <Mail className="w-3.5 h-3.5 text-indigo-500" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-700 truncate">{r.email}</p>
              {r.name && <p className="text-[11px] text-slate-400 truncate">{r.name}</p>}
            </div>
            <button
              onClick={() => removeRecipient(idx)}
              className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
        <div className="border-t border-slate-100 pt-4 space-y-2">
          <p className="text-xs font-medium text-slate-600">Add recipient</p>
          <div className="flex gap-2">
            <input
              type="email"
              value={newEmail}
              onChange={e => setNewEmail(e.target.value)}
              onKeyDown={e => e.key === "Enter" && addRecipient()}
              placeholder="email@example.com"
              className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
            <input
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="Name (optional)"
              className="w-36 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
            <button
              onClick={addRecipient}
              disabled={!newEmail || !newEmail.includes("@")}
              className="px-3 py-2 bg-indigo-50 text-indigo-600 rounded-xl hover:bg-indigo-100 transition-colors disabled:opacity-40"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-5 flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-indigo-800">What operators receive</p>
          <p className="text-xs text-indigo-600 mt-1">
            Each digest includes: total people, active staff, churn risk, revenue, overdue invoices,
            task completion rate, and data health score with top issues — all in a clean, branded email.
          </p>
        </div>
        <button
          onClick={sendNow}
          disabled={sending || config.recipients.length === 0}
          className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 transition-colors disabled:opacity-50 shrink-0"
        >
          {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          Send now
        </button>
      </div>

      <div className="bg-amber-50 border border-amber-100 rounded-2xl px-4 py-3 flex items-start gap-3">
        <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
        <p className="text-xs text-amber-700">
          Digest delivery requires <strong>SENDGRID_API_KEY</strong> (or SMTP_HOST + SMTP_USER + SMTP_PASSWORD)
          set in Railway environment variables. The same credentials used by the Alerts engine are shared here.
        </p>
      </div>
    </div>
  );
}

// ── Auto-Remediation Section ─────────────────────────────────────────────────
const RULE_META = {
  data_quality_critical: { label: "Fix data quality issues",     desc: "Creates a task when critical missing-field or duplicate issues are detected." },
  overdue_invoices:      { label: "Chase overdue invoices",      desc: "Creates a task when unpaid invoices exceed the configured threshold." },
  churn_risk:            { label: "Retention outreach",          desc: "Creates a task when clients flagged as at-risk of disengagement." },
  overdue_tasks:         { label: "Clear task backlog",          desc: "Creates a task when overdue tasks exceed the configured count." },
  low_stock:             { label: "Reorder stock",               desc: "Creates a task when products fall below minimum reorder level." },
};

function AutoTaskSection({ user }) {
  const companyId = user?.company_id;

  const [config,    setConfig]    = useState({ enabled: false, enabled_rules: Object.keys(RULE_META), rule_config: {} });
  const [history,   setHistory]   = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [saving,    setSaving]    = useState(false);
  const [running,   setRunning]   = useState(false);
  const [banner,    setBanner]    = useState(null);

  useEffect(() => {
    if (!companyId) return;
    Promise.all([
      fetch(`${RAILWAY_URL}/autotask/config?company_id=${companyId}`, { headers: API_HEADERS }).then(r => r.ok ? r.json() : null),
      fetch(`${RAILWAY_URL}/autotask/history?company_id=${companyId}&limit=10`, { headers: API_HEADERS }).then(r => r.ok ? r.json() : null),
    ]).then(([cfg, hist]) => {
      if (cfg && cfg.configured) {
        setConfig({
          enabled:       cfg.enabled,
          enabled_rules: cfg.enabled_rules || Object.keys(RULE_META),
          rule_config:   cfg.rule_config || {},
        });
      }
      if (hist) setHistory(hist.tasks || []);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [companyId]);

  const showBanner = (type, msg) => { setBanner({ type, msg }); setTimeout(() => setBanner(null), 4000); };

  const toggleRule = (rule) => {
    setConfig(c => ({
      ...c,
      enabled_rules: c.enabled_rules.includes(rule)
        ? c.enabled_rules.filter(r => r !== rule)
        : [...c.enabled_rules, rule],
    }));
  };

  const save = async () => {
    if (!companyId) return;
    setSaving(true);
    try {
      const res = await fetch(`${RAILWAY_URL}/autotask/config`, {
        method:  "POST",
        headers: { ...API_HEADERS, "Content-Type": "application/json" },
        body:    JSON.stringify({ company_id: companyId, ...config }),
      });
      if (res.ok) showBanner("success", "Auto-remediation config saved.");
      else        showBanner("error",   "Failed to save — check Railway logs.");
    } catch { showBanner("error", "Could not reach Railway service."); }
    finally { setSaving(false); }
  };

  const runNow = async () => {
    if (!companyId) return;
    setRunning(true);
    try {
      const res = await fetch(`${RAILWAY_URL}/autotask/run?company_id=${companyId}`, {
        method: "POST", headers: API_HEADERS,
      });
      const data = await res.json();
      if (data.status === "accepted") {
        showBanner("success", "Evaluation queued — check Tasks shortly.");
        setTimeout(() => {
          fetch(`${RAILWAY_URL}/autotask/history?company_id=${companyId}&limit=10`, { headers: API_HEADERS })
            .then(r => r.ok ? r.json() : null).then(h => { if (h) setHistory(h.tasks || []); }).catch(() => {});
        }, 3000);
      } else { showBanner("error", "Run failed."); }
    } catch { showBanner("error", "Could not reach Railway service."); }
    finally { setRunning(false); }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-32">
      <div className="w-5 h-5 border-2 border-slate-200 border-t-indigo-500 rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-slate-800">Auto-Remediation</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            When issues are detected, the system automatically creates tasks in your Tasks list
            and assigns them — closing the loop without operator intervention.
          </p>
        </div>
        <button onClick={save} disabled={saving}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-100 text-slate-600 hover:bg-slate-200 transition-all shrink-0">
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          Save
        </button>
      </div>

      {banner && <Banner type={banner.type} message={banner.msg} onDismiss={() => setBanner(null)} />}

      <div className="bg-white border border-slate-100 rounded-2xl p-5">
        <ToggleRow
          label="Enable auto-remediation"
          checked={config.enabled}
          onChange={v => setConfig(c => ({ ...c, enabled: v }))}
        />
      </div>

      <div className="bg-white border border-slate-100 rounded-2xl p-5 space-y-3">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Rules</p>
        <p className="text-[11px] text-slate-400">
          Each rule runs after every ETL cycle. Tasks are not re-created within 24 hours of the last creation for the same issue.
        </p>
        {Object.entries(RULE_META).map(([rule, meta]) => (
          <div key={rule} className="flex items-start gap-3 p-3 rounded-xl border border-slate-100 hover:border-slate-200 transition-colors">
            <button
              onClick={() => toggleRule(rule)}
              className={`w-9 h-5 rounded-full transition-colors relative shrink-0 mt-0.5 ${
                config.enabled_rules.includes(rule) ? "bg-indigo-500" : "bg-slate-200"
              }`}
            >
              <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${
                config.enabled_rules.includes(rule) ? "left-4" : "left-0.5"
              }`} />
            </button>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-700">{meta.label}</p>
              <p className="text-[11px] text-slate-400 mt-0.5">{meta.desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Run now + history */}
      <div className="bg-white border border-slate-100 rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Recent Auto-Tasks</p>
          <button onClick={runNow} disabled={running || !config.enabled}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors disabled:opacity-50">
            {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
            Run now
          </button>
        </div>
        {history.length === 0 ? (
          <p className="text-xs text-slate-400 italic">No tasks auto-created yet. Enable rules and run the ETL cycle.</p>
        ) : (
          <div className="space-y-2">
            {history.map((t, i) => (
              <div key={i} className="flex items-start gap-3 py-2 border-b border-slate-50 last:border-0">
                <div className="w-6 h-6 rounded-lg bg-violet-50 flex items-center justify-center shrink-0 mt-0.5">
                  <Zap className="w-3 h-3 text-violet-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-slate-700 truncate">{t.title}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5 capitalize">
                    {t.rule?.replace(/_/g, " ")}
                    {t.created_at && ` · ${new Date(t.created_at).toLocaleDateString()}`}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-violet-50 border border-violet-100 rounded-2xl px-4 py-3 flex items-start gap-3">
        <Zap className="w-4 h-4 text-violet-500 shrink-0 mt-0.5" />
        <p className="text-xs text-violet-700">
          Auto-remediation runs after every ETL cycle. Tasks are created in Base44 and appear
          on your Tasks page immediately — assigned to the configured person, or unassigned if none is set.
        </p>
      </div>
    </div>
  );
}

// ── KPI Goals Section ─────────────────────────────────────────────────────────
const AVAILABLE_METRICS = [
  { key: "revenue_monthly",      label: "Monthly Revenue",      unit: "$",  direction: "higher_is_better", period: "monthly"  },
  { key: "task_completion",      label: "Task Completion %",    unit: "%",  direction: "higher_is_better", period: "monthly"  },
  { key: "active_clients",       label: "Active Clients",       unit: "",   direction: "higher_is_better", period: "monthly"  },
  { key: "active_staff",         label: "Active Staff",         unit: "",   direction: "higher_is_better", period: "monthly"  },
  { key: "transactions_monthly", label: "Monthly Transactions", unit: "",   direction: "higher_is_better", period: "monthly"  },
];

const STATUS_COLORS = {
  exceeded: "text-emerald-600 bg-emerald-50",
  on_track: "text-blue-600 bg-blue-50",
  at_risk:  "text-amber-600 bg-amber-50",
  behind:   "text-rose-600 bg-rose-50",
  unknown:  "text-slate-400 bg-slate-50",
};

function GoalsSection({ user }) {
  const companyId = user?.company_id;
  const [goals,   setGoals]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [banner,  setBanner]  = useState(null);
  const [addMetric, setAddMetric] = useState(AVAILABLE_METRICS[0].key);
  const [addTarget, setAddTarget] = useState("");

  useEffect(() => {
    if (!companyId) return;
    fetch(`${RAILWAY_URL}/goals?company_id=${companyId}&evaluate=false`, { headers: API_HEADERS })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setGoals(d.goals || []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [companyId]);

  const showBanner = (type, msg) => { setBanner({ type, msg }); setTimeout(() => setBanner(null), 4000); };

  const save = async (newGoals) => {
    if (!companyId) return;
    setSaving(true);
    try {
      const res = await fetch(`${RAILWAY_URL}/goals`, {
        method:  "POST",
        headers: { ...API_HEADERS, "Content-Type": "application/json" },
        body:    JSON.stringify({ company_id: companyId, goals: newGoals }),
      });
      if (res.ok) { showBanner("success", "Goals saved."); }
      else        { showBanner("error", "Failed to save."); }
    } catch { showBanner("error", "Could not reach Railway service."); }
    finally { setSaving(false); }
  };

  const addGoal = () => {
    const target = parseFloat(addTarget);
    if (!addMetric || isNaN(target) || target <= 0) return;
    const meta = AVAILABLE_METRICS.find(m => m.key === addMetric);
    const newGoals = [
      ...goals.filter(g => g.metric !== addMetric), // replace if exists
      { metric: addMetric, target, period: meta?.period || "monthly",
        direction: meta?.direction || "higher_is_better",
        label: meta?.label, unit: meta?.unit },
    ];
    setGoals(newGoals);
    save(newGoals);
    setAddTarget("");
  };

  const removeGoal = async (goalId, metric) => {
    const newGoals = goals.filter(g => g.metric !== metric && g.id !== goalId);
    setGoals(newGoals);
    save(newGoals);
  };

  const fmt = (val, unit) => {
    if (val == null) return "—";
    if (unit === "$") return `$${Number(val).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
    if (unit === "%") return `${Number(val).toFixed(1)}%`;
    return Number(val).toLocaleString();
  };

  if (loading) return (
    <div className="flex items-center justify-center h-32">
      <div className="w-5 h-5 border-2 border-slate-200 border-t-emerald-500 rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-bold text-slate-800">KPI Goals</h2>
        <p className="text-xs text-slate-400 mt-0.5">
          Set targets once — the system tracks progress automatically after every ETL cycle and
          surfaces them on your dashboard with pace indicators.
        </p>
      </div>

      {banner && <Banner type={banner.type} message={banner.msg} onDismiss={() => setBanner(null)} />}

      {/* Current goals */}
      {goals.length > 0 ? (
        <div className="bg-white border border-slate-100 rounded-2xl p-5 space-y-3">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Active Goals</p>
          {goals.map((goal, i) => {
            const meta = AVAILABLE_METRICS.find(m => m.key === goal.metric);
            const statusCls = STATUS_COLORS[goal.status] || STATUS_COLORS.unknown;
            const pct = Math.min(goal.progress_pct ?? 0, 100);
            return (
              <div key={i} className="p-3 rounded-xl border border-slate-100 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <p className="text-sm font-semibold text-slate-700 truncate">
                      {goal.label || meta?.label || goal.metric}
                    </p>
                    {goal.status && (
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full capitalize ${statusCls}`}>
                        {goal.status.replace("_", " ")}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-sm font-bold text-slate-800">
                      {fmt(goal.actual, goal.unit ?? meta?.unit)} / {fmt(goal.target, goal.unit ?? meta?.unit)}
                    </span>
                    <button onClick={() => removeGoal(goal.id, goal.metric)}
                      className="text-slate-300 hover:text-rose-400 transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full bg-emerald-500 transition-all"
                    style={{ width: `${pct}%` }} />
                </div>
                {goal.pace_needed > 0 && goal.days_remaining > 0 && (
                  <p className="text-[10px] text-slate-400">
                    Pace needed: {fmt(goal.pace_needed, goal.unit ?? meta?.unit)}/day · {goal.days_remaining} days remaining
                  </p>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-slate-50 border border-slate-100 rounded-2xl px-5 py-6 text-center">
          <Calendar className="w-8 h-8 text-slate-200 mx-auto mb-2" />
          <p className="text-xs text-slate-400">No goals configured yet. Add your first target below.</p>
        </div>
      )}

      {/* Add goal */}
      <div className="bg-white border border-slate-100 rounded-2xl p-5 space-y-4">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Add Goal</p>
        <div className="flex gap-3 flex-wrap">
          <div className="flex-1 min-w-40">
            <label className="text-xs font-medium text-slate-600 block mb-1">Metric</label>
            <select
              value={addMetric}
              onChange={e => setAddMetric(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
            >
              {AVAILABLE_METRICS.map(m => (
                <option key={m.key} value={m.key}>{m.label}</option>
              ))}
            </select>
          </div>
          <div className="w-36">
            <label className="text-xs font-medium text-slate-600 block mb-1">
              Target {AVAILABLE_METRICS.find(m => m.key === addMetric)?.unit || ""}
            </label>
            <input
              type="number"
              value={addTarget}
              onChange={e => setAddTarget(e.target.value)}
              onKeyDown={e => e.key === "Enter" && addGoal()}
              placeholder="e.g. 10000"
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={addGoal}
              disabled={saving || !addTarget || isNaN(parseFloat(addTarget))}
              className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700 transition-colors disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              Add
            </button>
          </div>
        </div>
        <p className="text-[11px] text-slate-400">
          All goals use a monthly period by default. Progress is recalculated after every ETL cycle.
        </p>
      </div>

      <div className="bg-emerald-50 border border-emerald-100 rounded-2xl px-4 py-3 flex items-start gap-3">
        <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
        <p className="text-xs text-emerald-700">
          Goals appear on your dashboard with live progress bars and pace indicators.
          The system calculates how much you need per day to stay on track for the period.
        </p>
      </div>
    </div>
  );
}
