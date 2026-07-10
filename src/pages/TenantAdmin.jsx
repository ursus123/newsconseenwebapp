// ==============================================================
// TenantAdmin — Platform-level multi-tenant admin UI
// Visible to super_admin only.
//
// Tabs:
//   Tenants    — table of all operators with health signals + actions
//   Add Tenant — form to manually provision a new operator
//   Audit Log  — platform-wide admin action history
//
// All calls go through /admin/* endpoints which require x-admin-secret.
// The admin secret is stored in VITE_ADMIN_SECRET env var (never user-facing).
// ==============================================================

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ncClient } from "@/api/ncClient";
import {
  Building2, Users, RefreshCw, Plus, Search, Shield, ShieldOff,
  Zap, CheckCircle2, AlertCircle, Clock, ChevronRight, X,
  Activity, BarChart2, Globe, Mail, Loader2, ScrollText,
  TrendingUp, Package, ClipboardList, Eye, Copy, Check,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useQuery as useAuthQuery } from "@tanstack/react-query";

const RAILWAY_URL = "https://newsconseenwebapp-production.up.railway.app";
const ADMIN_SECRET = (import.meta["env"] || {})["VITE_ADMIN_SECRET"] || "";

const ADMIN_HEADERS = {
  "Content-Type":   "application/json",
  "x-admin-secret": ADMIN_SECRET,
};

async function adminFetch(path, opts = {}) {
  const res = await fetch(`${RAILWAY_URL}/admin${path}`, {
    ...opts,
    headers: { ...ADMIN_HEADERS, ...(opts.headers || {}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `${res.status} ${res.statusText}`);
  }
  return res.json();
}

// ── Stat card ─────────────────────────────────────────────────────────────────
function MiniStat({ label, value, icon: Icon, color = "blue" }) {
  const colors = {
    blue:    "bg-blue-50 text-blue-600",
    emerald: "bg-emerald-50 text-emerald-600",
    amber:   "bg-amber-50 text-amber-600",
    purple:  "bg-purple-50 text-purple-600",
  };
  return (
    <div className="bg-white border border-slate-100 rounded-xl p-4 flex items-center gap-3">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${colors[color]}`}>
        <Icon className="w-4.5 h-4.5" />
      </div>
      <div>
        <p className="text-xs text-slate-400 font-medium">{label}</p>
        <p className="text-xl font-bold text-slate-800">{value ?? "—"}</p>
      </div>
    </div>
  );
}

// ── Status badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  if (!status) return null;
  const map = {
    active:   "bg-emerald-100 text-emerald-700",
    inactive: "bg-slate-100 text-slate-500",
    suspended:"bg-rose-100 text-rose-700",
    trial:    "bg-amber-100 text-amber-700",
  };
  return (
    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${map[status] || "bg-slate-100 text-slate-500"}`}>
      {status}
    </span>
  );
}

// ── AI Readiness gauge ────────────────────────────────────────────────────────
function ReadinessBar({ score }) {
  if (score == null) return <span className="text-xs text-slate-300">—</span>;
  const color = score >= 70 ? "bg-emerald-500" : score >= 40 ? "bg-amber-500" : "bg-rose-400";
  return (
    <div className="flex items-center gap-2">
      <div className="w-20 h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-xs font-medium text-slate-600">{score}</span>
    </div>
  );
}

// ── Copy-to-clipboard ─────────────────────────────────────────────────────────
function CopyId({ value }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }
  return (
    <button onClick={copy} title="Copy company_id" className="ml-1 text-slate-300 hover:text-slate-500 transition-colors">
      {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
    </button>
  );
}

// ── Tenant detail drawer ──────────────────────────────────────────────────────
function TenantDrawer({ companyId, onClose, onEtl, onSuspend, onReactivate }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-tenant-detail", companyId],
    queryFn:  () => adminFetch(`/tenants/${companyId}`),
    enabled:  !!companyId,
    staleTime: 0,
  });

  if (!companyId) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/30" onClick={onClose} />
      <div className="w-full max-w-lg bg-white shadow-2xl overflow-y-auto flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white z-10">
          <div>
            <h2 className="text-base font-semibold text-slate-800">
              {data?.enterprise_name || companyId}
            </h2>
            <p className="text-xs text-slate-400 flex items-center gap-1">
              {companyId} <CopyId value={companyId} />
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100">
            <X className="w-4 h-4 text-slate-400" />
          </button>
        </div>

        {isLoading && (
          <div className="flex-1 flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-slate-300" />
          </div>
        )}

        {error && (
          <div className="p-6 text-rose-600 text-sm">{error.message}</div>
        )}

        {data && !isLoading && (
          <div className="p-6 space-y-6">
            {/* Overview */}
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Type",         value: data.enterprise_type },
                { label: "Country",      value: data.country },
                { label: "Tier",         value: data.subscription_tier },
                { label: "Sub Status",   value: data.subscription_status },
                { label: "Cluster",      value: data.cluster },
                { label: "Created",      value: data.created_date ? data.created_date.slice(0, 10) : "—" },
              ].map(({ label, value }) => (
                <div key={label}>
                  <p className="text-[10px] text-slate-400 uppercase tracking-wide">{label}</p>
                  <p className="text-sm font-medium text-slate-700">{value || "—"}</p>
                </div>
              ))}
            </div>

            {/* Health */}
            <div>
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Analytics Health</h3>
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-slate-50 rounded-lg p-3">
                  <p className="text-[10px] text-slate-400">AI Readiness</p>
                  <ReadinessBar score={data.ai_readiness_score} />
                </div>
                <div className="bg-slate-50 rounded-lg p-3">
                  <p className="text-[10px] text-slate-400">People Count</p>
                  <p className="text-sm font-semibold text-slate-700">{data.people_count ?? "—"}</p>
                </div>
                <div className="bg-slate-50 rounded-lg p-3">
                  <p className="text-[10px] text-slate-400">Taxonomy Items</p>
                  <p className="text-sm font-semibold text-slate-700">{data.taxonomy_count ?? "—"}</p>
                </div>
                <div className="bg-slate-50 rounded-lg p-3">
                  <p className="text-[10px] text-slate-400">Workflows</p>
                  <p className="text-sm font-semibold text-slate-700">{data.workflows_created ?? "—"}</p>
                </div>
              </div>
            </div>

            {/* Enrichment counts */}
            {data.enrichment_counts && Object.keys(data.enrichment_counts).length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Enrichment Coverage</h3>
                <div className="space-y-1.5">
                  {Object.entries(data.enrichment_counts).map(([entity, count]) => (
                    <div key={entity} className="flex items-center justify-between text-sm">
                      <span className="text-slate-600 capitalize">{entity}</span>
                      <span className={`font-medium ${count > 0 ? "text-emerald-600" : "text-slate-300"}`}>
                        {count > 0 ? `${count} rows` : "empty"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            <div>
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Actions</h3>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm" variant="outline"
                  onClick={() => onEtl(companyId)}
                  className="text-xs gap-1.5"
                >
                  <Zap className="w-3.5 h-3.5 text-amber-500" /> Trigger ETL
                </Button>
                {data.tenant_status !== "suspended" ? (
                  <Button
                    size="sm" variant="outline"
                    onClick={() => onSuspend(companyId)}
                    className="text-xs gap-1.5 text-rose-600 border-rose-200 hover:bg-rose-50"
                  >
                    <ShieldOff className="w-3.5 h-3.5" /> Suspend
                  </Button>
                ) : (
                  <Button
                    size="sm" variant="outline"
                    onClick={() => onReactivate(companyId)}
                    className="text-xs gap-1.5 text-emerald-600 border-emerald-200 hover:bg-emerald-50"
                  >
                    <Shield className="w-3.5 h-3.5" /> Reactivate
                  </Button>
                )}
              </div>
            </div>

            {/* Onboarding history */}
            {data.onboarding_history?.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Provisioning History</h3>
                <div className="space-y-2">
                  {data.onboarding_history.map((h, i) => (
                    <div key={i} className="text-xs bg-slate-50 rounded-lg px-3 py-2 flex items-center justify-between">
                      <span className="text-slate-600">
                        {h.cluster} · readiness {h.ai_readiness_score ?? "—"} · {h.taxonomy_count ?? 0} taxonomy
                      </span>
                      <span className="text-slate-400">{h.provisioned_at?.slice(0, 10)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Audit trail */}
            {data.admin_audit?.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Admin Actions</h3>
                <div className="space-y-2">
                  {data.admin_audit.map((a, i) => (
                    <div key={i} className="text-xs flex items-start gap-2">
                      <span className="text-slate-300 shrink-0">{a.created_at?.slice(0, 16)}</span>
                      <span className="font-medium text-slate-600">{a.action}</span>
                      <span className="text-slate-400 truncate">{a.detail}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Add Tenant form ───────────────────────────────────────────────────────────
const ENTERPRISE_TYPES = [
  { value: "healthcare",  label: "Healthcare & Care" },
  { value: "education",   label: "Education & Training" },
  { value: "nonprofit",   label: "Non-Profit & NGO" },
  { value: "agriculture", label: "Agriculture & Farming" },
  { value: "retail",      label: "Retail & Hospitality" },
  { value: "government",  label: "Government & Public Sector" },
  { value: "commercial",  label: "Business & Professional Services" },
];

const COUNTRIES = [
  "Kenya", "Nigeria", "South Africa", "Ghana", "Uganda", "Tanzania",
  "Rwanda", "Ethiopia", "Zimbabwe", "Zambia", "Botswana",
  "United Kingdom", "United States", "Canada", "Australia", "India",
  "Other",
];

function AddTenantForm({ onCreated }) {
  const [form, setForm] = useState({
    enterprise_name: "", enterprise_type: "", country: "",
    admin_email: "", admin_name: "", subscription_tier: "professional", notes: "",
  });
  const [errors, setErrors] = useState({});
  const [result, setResult] = useState(null);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const createMut = useMutation({
    mutationFn: () => adminFetch("/tenants", {
      method: "POST",
      body: JSON.stringify({ ...form, performed_by: "platform_admin" }),
    }),
    onSuccess: (data) => {
      setResult(data);
      onCreated?.();
    },
  });

  function validate() {
    const e = {};
    if (!form.enterprise_name.trim()) e.enterprise_name = "Required";
    if (!form.enterprise_type)        e.enterprise_type = "Required";
    if (!form.country)                e.country         = "Required";
    if (!form.admin_email.trim())     e.admin_email     = "Required";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.admin_email)) e.admin_email = "Valid email required";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function submit(e) {
    e.preventDefault();
    if (!validate()) return;
    createMut.mutate();
  }

  if (result) {
    return (
      <div className="max-w-lg mx-auto">
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            <h3 className="font-semibold text-emerald-800">Tenant Created</h3>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-500">Company ID</span>
              <span className="font-mono text-xs bg-white border border-slate-200 px-2 py-0.5 rounded flex items-center gap-1">
                {result.company_id} <CopyId value={result.company_id} />
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Enterprise</span>
              <span className="font-medium">{result.enterprise_name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Admin Email</span>
              <span>{result.admin_email}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">AI Readiness</span>
              <ReadinessBar score={result.provision?.ai_readiness_score} />
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Taxonomy Seeded</span>
              <span className="font-medium">{result.provision?.taxonomy_count ?? 0} items</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Workflows Created</span>
              <span className="font-medium">{result.provision?.workflows_created ?? 0}</span>
            </div>
          </div>

          {result.next_steps?.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Next Steps</p>
              <ul className="space-y-1">
                {result.next_steps.map((s, i) => (
                  <li key={i} className="text-xs text-slate-600 flex items-start gap-1.5">
                    <ChevronRight className="w-3 h-3 mt-0.5 text-emerald-500 shrink-0" />{s}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <Button size="sm" variant="outline" onClick={() => setResult(null)} className="w-full">
            Add Another Tenant
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="max-w-lg mx-auto space-y-5">
      <div>
        <h2 className="text-base font-semibold text-slate-800 mb-1">Add New Tenant</h2>
        <p className="text-sm text-slate-500">
          Provisions taxonomy, default workflows, and AI readiness baseline automatically.
          Invite the operator by email after creation.
        </p>
      </div>

      {[
        { key: "enterprise_name", label: "Organisation Name", placeholder: "e.g. St. Mary's Clinic" },
        { key: "admin_email",     label: "Admin Email",       placeholder: "admin@organisation.com", type: "email" },
        { key: "admin_name",      label: "Admin Name",        placeholder: "Jane Smith (optional)" },
      ].map(({ key, label, placeholder, type = "text" }) => (
        <div key={key}>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">{label}</label>
          <Input
            type={type}
            placeholder={placeholder}
            value={form[key]}
            onChange={e => set(key, e.target.value)}
            className={`text-sm ${errors[key] ? "border-rose-400" : ""}`}
          />
          {errors[key] && <p className="text-xs text-rose-500 mt-1">{errors[key]}</p>}
        </div>
      ))}

      <div>
        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">Organisation Type</label>
        <div className="grid grid-cols-2 gap-2">
          {ENTERPRISE_TYPES.map(({ value, label }) => (
            <button
              key={value} type="button"
              onClick={() => set("enterprise_type", value)}
              className={`text-xs px-3 py-2 rounded-xl border text-left transition-all ${
                form.enterprise_type === value
                  ? "border-blue-500 bg-blue-50 text-blue-700 font-semibold"
                  : "border-slate-200 text-slate-600 hover:border-slate-300"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {errors.enterprise_type && <p className="text-xs text-rose-500 mt-1">{errors.enterprise_type}</p>}
      </div>

      <div>
        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">Country</label>
        <select
          value={form.country}
          onChange={e => set("country", e.target.value)}
          className={`w-full text-sm border rounded-lg px-3 py-2 bg-white ${errors.country ? "border-rose-400" : "border-slate-200"}`}
        >
          <option value="">Select country…</option>
          {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        {errors.country && <p className="text-xs text-rose-500 mt-1">{errors.country}</p>}
      </div>

      <div>
        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">Subscription Tier</label>
        <div className="flex gap-2">
          {["starter", "professional", "enterprise"].map(t => (
            <button
              key={t} type="button"
              onClick={() => set("subscription_tier", t)}
              className={`flex-1 text-xs py-1.5 rounded-lg border capitalize transition-all ${
                form.subscription_tier === t
                  ? "border-blue-500 bg-blue-50 text-blue-700 font-semibold"
                  : "border-slate-200 text-slate-500 hover:border-slate-300"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">Notes (optional)</label>
        <textarea
          value={form.notes}
          onChange={e => set("notes", e.target.value)}
          placeholder="Internal notes about this tenant…"
          rows={2}
          className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 resize-none"
        />
      </div>

      {createMut.isError && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm px-4 py-3 rounded-xl">
          {createMut.error?.message || "Failed to create tenant"}
        </div>
      )}

      <Button type="submit" className="w-full gap-2" disabled={createMut.isPending}>
        {createMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
        {createMut.isPending ? "Creating…" : "Create & Provision Tenant"}
      </Button>
    </form>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function TenantAdmin() {
  const qc = useQueryClient();
  const [tab,            setTab]            = useState("tenants");
  const [search,         setSearch]         = useState("");
  const [selectedTenant, setSelectedTenant] = useState(null);
  const [actionMsg,      setActionMsg]      = useState(null);

  // Guard: super_admin only
  const { data: currentUser } = useAuthQuery({
    queryKey: ["currentUser"],
    queryFn:  () => ncClient.auth.me(),
    staleTime: 60000,
  });

  // Platform health
  const { data: health } = useQuery({
    queryKey: ["admin-health"],
    queryFn:  () => adminFetch("/health"),
    staleTime: 30000,
    retry: false,
  });

  // Tenant list
  const { data: tenantsData, isLoading: loadingTenants, refetch: refetchTenants } = useQuery({
    queryKey: ["admin-tenants", search],
    queryFn:  () => adminFetch(`/tenants?search=${encodeURIComponent(search)}&limit=200`),
    staleTime: 30000,
    retry: false,
  });

  // Audit log
  const { data: auditData } = useQuery({
    queryKey: ["admin-audit"],
    queryFn:  () => adminFetch("/audit?limit=50"),
    enabled:  tab === "audit",
    staleTime: 30000,
    retry: false,
  });

  const etlMut = useMutation({
    mutationFn: (cid) => adminFetch(`/tenants/${cid}/etl`, { method: "POST" }),
    onSuccess:  () => { showMsg("ETL triggered — analytics will update in ~30s", "success"); qc.invalidateQueries(["admin-tenants"]); },
    onError:    (e) => showMsg(e.message, "error"),
  });

  const suspendMut = useMutation({
    mutationFn: (cid) => adminFetch(`/tenants/${cid}/suspend`, { method: "POST" }),
    onSuccess:  () => { showMsg("Tenant suspended", "success"); refetchTenants(); qc.invalidateQueries(["admin-tenant-detail", selectedTenant]); },
    onError:    (e) => showMsg(e.message, "error"),
  });

  const reactivateMut = useMutation({
    mutationFn: (cid) => adminFetch(`/tenants/${cid}/reactivate`, { method: "POST" }),
    onSuccess:  () => { showMsg("Tenant reactivated", "success"); refetchTenants(); qc.invalidateQueries(["admin-tenant-detail", selectedTenant]); },
    onError:    (e) => showMsg(e.message, "error"),
  });

  if (currentUser && currentUser.role !== "super_admin") {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-500 text-sm">
        <div className="text-center">
          <Shield className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="font-medium">Access restricted to super_admin</p>
        </div>
      </div>
    );
  }

  function showMsg(text, type = "success") {
    setActionMsg({ text, type });
    setTimeout(() => setActionMsg(null), 3500);
  }

  const tenants = tenantsData?.tenants || [];

  const noSecret = !ADMIN_SECRET;

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-6 space-y-5">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Building2 className="w-5 h-5 text-blue-600" />
            Tenant Administration
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Manage all operators — onboard, provision, monitor, and control access.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => { refetchTenants(); qc.invalidateQueries(["admin-health"]); }}
          className="gap-1.5 text-xs shrink-0">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </Button>
      </div>

      {/* ── No secret warning ── */}
      {noSecret && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm px-4 py-3 rounded-xl flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          VITE_ADMIN_SECRET is not set — admin API calls will fail. Add it to your .env file.
        </div>
      )}

      {/* ── Action toast ── */}
      {actionMsg && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-xl shadow-lg text-sm font-medium flex items-center gap-2
          ${actionMsg.type === "success" ? "bg-emerald-600 text-white" : "bg-rose-600 text-white"}`}>
          {actionMsg.type === "success" ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {actionMsg.text}
        </div>
      )}

      {/* ── Platform health stats ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MiniStat label="Total Tenants"      value={health?.tenant_count}        icon={Building2}    color="blue" />
        <MiniStat label="Provisioned"        value={health?.provisioned_tenants} icon={CheckCircle2} color="emerald" />
        <MiniStat label="Total People"       value={health?.total_people}        icon={Users}        color="purple" />
        <MiniStat label="Total Transactions" value={health?.total_transactions}  icon={TrendingUp}   color="amber" />
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
        {[
          { id: "tenants", label: "Tenants",   icon: Building2  },
          { id: "add",     label: "Add Tenant", icon: Plus      },
          { id: "audit",   label: "Audit Log",  icon: ScrollText },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
              tab === t.id ? "bg-white shadow-sm text-slate-800" : "text-slate-500 hover:text-slate-700"
            }`}>
            <t.icon className="w-3.5 h-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Tenants tab ── */}
      {tab === "tenants" && (
        <div className="space-y-3">
          {/* Search */}
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search tenants…"
              className="pl-9 text-sm"
            />
          </div>

          {/* Table */}
          <Card className="overflow-hidden">
            {loadingTenants ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-6 h-6 animate-spin text-slate-300" />
              </div>
            ) : tenants.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                <Building2 className="w-10 h-10 mb-3 opacity-30" />
                <p className="text-sm">No tenants found</p>
                {search && <p className="text-xs mt-1">Try clearing your search</p>}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-100">
                    <tr>
                      {["Organisation", "Type", "Status", "AI Readiness", "People", "Last ETL", "Actions"].map(h => (
                        <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {tenants.map(t => (
                      <tr key={t.company_id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="px-4 py-3">
                          <p className="font-medium text-slate-800 truncate max-w-[180px]">{t.enterprise_name || "—"}</p>
                          <p className="text-[10px] text-slate-400 font-mono mt-0.5 truncate max-w-[180px]">{t.company_id}</p>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs text-slate-600 capitalize">{t.enterprise_type || "—"}</span>
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={t.subscription_status || t.tenant_status} />
                        </td>
                        <td className="px-4 py-3">
                          <ReadinessBar score={t.ai_readiness_score} />
                        </td>
                        <td className="px-4 py-3 text-slate-600">{t.people_count ?? "—"}</td>
                        <td className="px-4 py-3">
                          {t.last_etl_at
                            ? <span className="text-xs text-slate-400">{String(t.last_etl_at).slice(0, 10)}</span>
                            : <span className="text-xs text-slate-300">Never</span>
                          }
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => setSelectedTenant(t.company_id)}
                              title="View detail"
                              className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => etlMut.mutate(t.company_id)}
                              disabled={etlMut.isPending}
                              title="Trigger ETL"
                              className="p-1.5 rounded-lg hover:bg-amber-50 text-slate-400 hover:text-amber-600 transition-colors"
                            >
                              <Zap className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {tenants.length > 0 && (
              <div className="px-4 py-2 bg-slate-50 border-t border-slate-100 text-xs text-slate-400">
                {tenantsData?.total} tenant{tenantsData?.total !== 1 ? "s" : ""}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* ── Add Tenant tab ── */}
      {tab === "add" && (
        <AddTenantForm onCreated={() => { refetchTenants(); qc.invalidateQueries(["admin-health"]); }} />
      )}

      {/* ── Audit Log tab ── */}
      {tab === "audit" && (
        <Card className="overflow-hidden">
          {!auditData?.entries?.length ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <ScrollText className="w-10 h-10 mb-3 opacity-30" />
              <p className="text-sm">No admin actions recorded yet</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-50">
              {auditData.entries.map((e, i) => (
                <div key={i} className="flex items-start gap-4 px-5 py-3 hover:bg-slate-50/50">
                  <div className="text-xs text-slate-400 whitespace-nowrap pt-0.5 w-32 shrink-0">
                    {e.created_at?.slice(0, 16).replace("T", " ")}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                        e.action === "create_tenant"   ? "bg-blue-100 text-blue-700" :
                        e.action === "suspend_tenant"  ? "bg-rose-100 text-rose-700" :
                        e.action === "trigger_etl"     ? "bg-amber-100 text-amber-700" :
                        "bg-slate-100 text-slate-600"
                      }`}>
                        {e.action}
                      </span>
                      <span className="text-xs text-slate-500 font-mono truncate">{e.company_id}</span>
                    </div>
                    {e.detail && <p className="text-xs text-slate-400 mt-0.5 truncate">{e.detail}</p>}
                  </div>
                  <span className="text-xs text-slate-400 shrink-0">{e.performed_by}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* ── Tenant detail drawer ── */}
      <TenantDrawer
        companyId={selectedTenant}
        onClose={() => setSelectedTenant(null)}
        onEtl={(cid) => { etlMut.mutate(cid); showMsg("ETL triggered", "success"); }}
        onSuspend={(cid) => suspendMut.mutate(cid)}
        onReactivate={(cid) => reactivateMut.mutate(cid)}
      />
    </div>
  );
}