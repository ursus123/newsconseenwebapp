/**
 * Kinetic Layer — Action types and write-back governance.
 *
 * The kinetic layer is the "operational" side of the ontology:
 * it defines ACTIONS that can be taken on ontology objects,
 * governs who can execute them, requires approvals where needed,
 * and writes results back through the ontology (Base44 entities).
 *
 * Architecture:
 *   Action Definition (this page) → Execution (Base44 SDK write-back) → Audit Log (python_layer)
 */
import React, { useState, useEffect } from "react";
import { ncClient } from "@/api/ncClient";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import {
  Zap, Plus, Play, CheckCircle2, XCircle, Clock, Shield,
  Users, Building2, Package, CheckSquare, Receipt, Link2,
  MapPin, Trash2, ChevronDown, ChevronUp, AlertTriangle,
  Loader2, History, Settings, ArrowRight, Lock, Unlock,
  Edit3, Save, X, FileText, Activity,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEntityListFn, useWithScope } from "@/components/shared/useDataQuery";

const RAILWAY_URL = "https://newsconseenwebapp-production.up.railway.app";
const RAILWAY_API_KEY = (import.meta["env"] || {})["VITE_RAILWAY_API_KEY"] || "";
const API_HEADERS = { "x-api-key": RAILWAY_API_KEY, "Content-Type": "application/json" };

const triggerETL = (entity) =>
  fetch(`${RAILWAY_URL}/load/${entity}-summary`, { method: "POST" }).catch(() => {});

// ── Object type icons ─────────────────────────────────────────────────────────
const TYPE_ICONS = {
  Person: Users, Enterprise: Building2, Product: Package,
  Task: CheckSquare, Transaction: Receipt, Relationship: Link2, Address: MapPin,
};

// ── Static button color map — avoids dynamic Tailwind class construction ──────
const ACTION_BTN_COLOR = {
  "text-blue-600":    "bg-blue-600 hover:bg-blue-700",
  "text-cyan-600":    "bg-cyan-600 hover:bg-cyan-700",
  "text-violet-600":  "bg-violet-600 hover:bg-violet-700",
  "text-indigo-600":  "bg-indigo-600 hover:bg-indigo-700",
  "text-emerald-600": "bg-emerald-600 hover:bg-emerald-700",
  "text-amber-600":   "bg-amber-600 hover:bg-amber-700",
  "text-rose-600":    "bg-rose-600 hover:bg-rose-700",
  "text-red-600":     "bg-red-600 hover:bg-red-700",
  "text-teal-600":    "bg-teal-600 hover:bg-teal-700",
  "text-slate-600":   "bg-slate-600 hover:bg-slate-700",
  "text-orange-600":  "bg-orange-600 hover:bg-orange-700",
};

// ── System default action types ───────────────────────────────────────────────
const SYSTEM_ACTIONS = [
  {
    id: "enroll_client",
    name: "Enroll Client",
    description: "Create a new person as a client and link them to an enterprise",
    category: "People",
    objectTypes: ["Person", "Relationship"],
    icon: "Users",
    color: "text-blue-600",
    bg: "bg-blue-50",
    border: "border-blue-200",
    requiresApproval: false,
    etlEntities: ["people", "relationship"],
    fields: [
      { key: "full_name",       label: "Full Name",               type: "text",   required: true },
      { key: "email",           label: "Email",                   type: "text",   required: false },
      { key: "phone",           label: "Phone",                   type: "text",   required: false },
      { key: "enterprise_name", label: "Enroll into Enterprise",  type: "text",   required: false },
    ],
    execute: async (params, currentUser, listFn, withScope) => {
      const person = await ncClient.entities.Person.create(withScope({
        full_name: params.full_name,
        email: params.email || undefined,
        phone: params.phone || undefined,
        person_type: "client",
        status: "active",
      }));
      if (params.enterprise_name) {
        const enterprises = await listFn(ncClient.entities.Enterprise);
        const ent = enterprises.find(e => e.enterprise_name?.toLowerCase() === params.enterprise_name.toLowerCase());
        if (ent) {
          await ncClient.entities.Relationship.create(withScope({
            relationship_type: "person_enterprise",
            person_name: person.full_name,
            enterprise_name: ent.enterprise_name,
            status: "active",
            start_date: new Date().toISOString().split("T")[0],
          }));
        }
      }
      return { person_id: person.id, full_name: person.full_name };
    },
  },
  {
    id: "assign_task",
    name: "Assign Task",
    description: "Create a task and assign it to a staff member",
    category: "Operations",
    objectTypes: ["Task"],
    icon: "CheckSquare",
    color: "text-violet-600",
    bg: "bg-violet-50",
    border: "border-violet-200",
    requiresApproval: false,
    etlEntities: ["task"],
    fields: [
      { key: "title",            label: "Task Title",  type: "text",   required: true },
      { key: "assigned_to_name", label: "Assign To",   type: "text",   required: false },
      { key: "due_date",         label: "Due Date",    type: "date",   required: false },
      { key: "enterprise",       label: "Enterprise",  type: "text",   required: false },
      { key: "priority",         label: "Priority",    type: "select", options: ["low","medium","high","critical"], required: false },
    ],
    execute: async (params, currentUser, listFn, withScope) => {
      const task = await ncClient.entities.Task.create(withScope({
        title: params.title,
        assigned_to_name: params.assigned_to_name || undefined,
        due_date: params.due_date || undefined,
        enterprise: params.enterprise || undefined,
        priority: params.priority || "medium",
        status: "open",
        app_source: "kinetic",
      }));
      return { task_id: task.id, title: task.title };
    },
  },
  {
    id: "create_invoice",
    name: "Create Invoice",
    description: "Create a draft invoice transaction for an enterprise",
    category: "Finance",
    objectTypes: ["Transaction"],
    icon: "Receipt",
    color: "text-emerald-600",
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    requiresApproval: true,
    etlEntities: ["transaction"],
    fields: [
      { key: "enterprise",  label: "Client / Enterprise", type: "text",   required: true },
      { key: "description", label: "Description",         type: "text",   required: true },
      { key: "amount",      label: "Amount",              type: "number", required: true },
      { key: "currency",    label: "Currency",            type: "select", options: ["USD","EUR","GBP","ZAR","KES","NGN","GHS"], required: false },
      { key: "due_date",    label: "Due Date",            type: "date",   required: false },
    ],
    execute: async (params, currentUser, listFn, withScope) => {
      const tx = await ncClient.entities.Transaction.create(withScope({
        enterprise: params.enterprise,
        description: params.description,
        amount: parseFloat(params.amount),
        currency: params.currency || "USD",
        due_date: params.due_date || undefined,
        transaction_type: "invoice",
        status: "draft",
        payment_status: "unpaid",
      }));
      return { transaction_id: tx.id, amount: tx.amount };
    },
  },
  {
    id: "onboard_staff",
    name: "Onboard Staff",
    description: "Register a new staff member and link them to an enterprise",
    category: "People",
    objectTypes: ["Person", "Relationship"],
    icon: "Users",
    color: "text-cyan-600",
    bg: "bg-cyan-50",
    border: "border-cyan-200",
    requiresApproval: true,
    etlEntities: ["people", "relationship"],
    fields: [
      { key: "full_name",        label: "Full Name",        type: "text",   required: true },
      { key: "email",            label: "Email",            type: "text",   required: false },
      { key: "phone",            label: "Phone",            type: "text",   required: false },
      { key: "person_subtype",   label: "Role / Job Title", type: "text",   required: false },
      { key: "engagement_model", label: "Engagement",       type: "select", options: ["employed","contracted","freelance","volunteer"], required: false },
      { key: "enterprise_name",  label: "Enterprise",       type: "text",   required: false },
    ],
    execute: async (params, currentUser, listFn, withScope) => {
      const person = await ncClient.entities.Person.create(withScope({
        full_name: params.full_name,
        email: params.email || undefined,
        phone: params.phone || undefined,
        person_type: "staff",
        person_subtype: params.person_subtype || undefined,
        engagement_model: params.engagement_model || "employed",
        status: "active",
      }));
      if (params.enterprise_name) {
        const enterprises = await listFn(ncClient.entities.Enterprise);
        const ent = enterprises.find(e => e.enterprise_name?.toLowerCase() === params.enterprise_name.toLowerCase());
        if (ent) {
          await ncClient.entities.Relationship.create(withScope({
            relationship_type: "person_enterprise",
            person_name: person.full_name,
            enterprise_name: ent.enterprise_name,
            role: params.person_subtype || undefined,
            status: "active",
            start_date: new Date().toISOString().split("T")[0],
          }));
        }
      }
      return { person_id: person.id, full_name: person.full_name };
    },
  },
  {
    id: "open_branch",
    name: "Open Branch",
    description: "Register a new branch or subsidiary enterprise",
    category: "Enterprise",
    objectTypes: ["Enterprise", "Relationship"],
    icon: "Building2",
    color: "text-amber-600",
    bg: "bg-amber-50",
    border: "border-amber-200",
    requiresApproval: true,
    etlEntities: ["enterprise", "relationship"],
    fields: [
      { key: "enterprise_name",   label: "Branch Name",       type: "text",   required: true },
      { key: "enterprise_type",   label: "Enterprise Type",   type: "select", options: ["commercial","nonprofit","government","household","cooperative","trust"], required: false },
      { key: "enterprise_tier",   label: "Tier",              type: "select", options: ["branch","subsidiary","department","unit","project","franchise"], required: false },
      { key: "city",              label: "City",              type: "text",   required: false },
      { key: "country",           label: "Country",           type: "text",   required: false },
      { key: "parent_enterprise", label: "Parent Enterprise", type: "text",   required: false },
    ],
    execute: async (params, currentUser, listFn, withScope) => {
      const ent = await ncClient.entities.Enterprise.create(withScope({
        enterprise_name: params.enterprise_name,
        enterprise_type: params.enterprise_type || "commercial",
        enterprise_tier: params.enterprise_tier || "branch",
        city: params.city || undefined,
        country: params.country || undefined,
        status: "active",
        operating_status: "open",
      }));
      if (params.parent_enterprise) {
        const enterprises = await listFn(ncClient.entities.Enterprise);
        const parent = enterprises.find(e => e.enterprise_name?.toLowerCase() === params.parent_enterprise.toLowerCase());
        if (parent) {
          await ncClient.entities.Relationship.create(withScope({
            relationship_type: "enterprise_enterprise",
            enterprise_name: parent.enterprise_name,
            secondary_enterprise: ent.enterprise_name,
            role: params.enterprise_tier || "branch",
            status: "active",
            start_date: new Date().toISOString().split("T")[0],
          }));
        }
      }
      return { enterprise_id: ent.id, enterprise_name: ent.enterprise_name };
    },
  },
];

// Stub execute for custom actions loaded from localStorage (execute fn is not serialisable)
const CUSTOM_EXECUTE_STUB = async () => ({
  status: "custom_action",
  note: "Custom actions require python_layer implementation",
});

// ── ExecuteActionModal ────────────────────────────────────────────────────────
function ExecuteActionModal({ action, currentUser, listFn, withScope, onClose, onSuccess }) {
  const [params, setParams] = useState({});
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const { toast } = useToast();
  const Icon = TYPE_ICONS[action.objectTypes?.[0]] || Zap;

  const set = (k, v) => setParams(p => ({ ...p, [k]: v }));

  const handleExecute = async () => {
    const missing = action.fields.filter(f => f.required && !params[f.key]?.trim?.() && !params[f.key]);
    if (missing.length > 0) {
      toast({ title: "Missing required fields", description: missing.map(f => f.label).join(", "), variant: "destructive" });
      return;
    }
    setRunning(true);
    try {
      const res = await action.execute(params, currentUser, listFn, withScope);
      // Fire ETL for all affected entities
      for (const entity of (action.etlEntities || [])) triggerETL(entity);
      // Log to python_layer
      try {
        await fetch(`${RAILWAY_URL}/kinetic/log`, {
          method: "POST",
          headers: API_HEADERS,
          body: JSON.stringify({
            company_id: currentUser?.company_id,
            action_id: action.id,
            action_name: action.name,
            executed_by: currentUser?.email,
            params,
            result: res,
            executed_at: new Date().toISOString(),
          }),
        });
      } catch { /* log failure is non-fatal */ }
      setResult({ status: "success", data: res });
      onSuccess?.();
      toast({ title: `${action.name} executed`, description: "Ontology updated successfully." });
    } catch (e) {
      setResult({ status: "error", message: e.message });
      toast({ title: "Action failed", description: e.message, variant: "destructive" });
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className={`flex items-center gap-3 px-5 py-4 ${action.bg} border-b ${action.border}`}>
          <div className={`w-9 h-9 rounded-xl bg-white border ${action.border} flex items-center justify-center`}>
            <Zap className={`w-4 h-4 ${action.color}`} />
          </div>
          <div className="flex-1">
            <p className="text-sm font-black text-slate-800">{action.name}</p>
            <p className="text-[11px] text-slate-500">{action.description}</p>
          </div>
          {action.requiresApproval && (
            <div className="flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-1 rounded-full">
              <Shield className="w-3 h-3" /> Requires Approval
            </div>
          )}
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 ml-1">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Object types */}
        <div className="px-5 pt-3 pb-1 flex items-center gap-2 flex-wrap">
          <span className="text-[10px] text-slate-400 font-semibold">Writes to:</span>
          {action.objectTypes.map(t => {
            const OIcon = TYPE_ICONS[t] || Zap;
            return (
              <span key={t} className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                <OIcon className="w-2.5 h-2.5" /> {t}
              </span>
            );
          })}
        </div>

        {/* Fields */}
        {!result && (
          <div className="px-5 py-3 space-y-3">
            {action.fields.map(field => (
              <div key={field.key}>
                <label className="text-xs font-semibold text-slate-600 block mb-1">
                  {field.label}{field.required && <span className="text-rose-500 ml-1">*</span>}
                </label>
                {field.type === "select" ? (
                  <select
                    value={params[field.key] || ""}
                    onChange={e => set(field.key, e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"
                  >
                    <option value="">— select —</option>
                    {field.options.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : (
                  <input
                    type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
                    value={params[field.key] || ""}
                    onChange={e => set(field.key, e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"
                  />
                )}
              </div>
            ))}
          </div>
        )}

        {/* Result */}
        {result && (
          <div className="px-5 py-4">
            {result.status === "success" ? (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <p className="text-sm font-bold text-emerald-800">Action executed successfully</p>
                </div>
                {Object.entries(result.data).map(([k, v]) => (
                  <p key={k} className="text-xs text-emerald-700 font-mono">{k}: {v}</p>
                ))}
              </div>
            ) : (
              <div className="bg-rose-50 border border-rose-200 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-1">
                  <XCircle className="w-4 h-4 text-rose-600" />
                  <p className="text-sm font-bold text-rose-800">Execution failed</p>
                </div>
                <p className="text-xs text-rose-700 font-mono">{result.message}</p>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-100 flex gap-2 justify-end">
          <Button variant="outline" onClick={onClose} className="rounded-xl">
            {result ? "Close" : "Cancel"}
          </Button>
          {!result && (
            <Button
              onClick={handleExecute}
              disabled={running}
              className={`rounded-xl ${action.requiresApproval ? "bg-amber-600 hover:bg-amber-700" : "bg-violet-600 hover:bg-violet-700"}`}
            >
              {running
                ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Executing…</>
                : <><Play className="w-4 h-4 mr-2" /> {action.requiresApproval ? "Request Execution" : "Execute"}</>
              }
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── ActionCard ────────────────────────────────────────────────────────────────
function ActionCard({ action, onExecute, execCount }) {
  const [expanded, setExpanded] = useState(false);
  const btnColor = ACTION_BTN_COLOR[action.color] || "bg-slate-600 hover:bg-slate-700";

  return (
    <div className={`bg-white border ${expanded ? action.border : "border-slate-100"} rounded-2xl overflow-hidden shadow-sm transition-colors`}>
      <div className="flex items-center gap-3 p-4">
        <div className={`w-10 h-10 rounded-2xl ${action.bg} flex items-center justify-center shrink-0`}>
          <Zap className={`w-5 h-5 ${action.color}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-bold text-slate-800">{action.name}</p>
            {action.requiresApproval && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 flex items-center gap-1">
                <Lock className="w-2.5 h-2.5" /> Approval
              </span>
            )}
            {action.isCustom && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">Custom</span>
            )}
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">{action.category}</span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5 leading-snug">{action.description}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {execCount > 0 && (
            <span className="text-[10px] text-slate-400">{execCount}×</span>
          )}
          <Button
            size="sm"
            onClick={() => onExecute(action)}
            className={`rounded-xl h-8 text-xs text-white ${btnColor}`}
          >
            <Play className="w-3 h-3 mr-1" /> Execute
          </Button>
          <button onClick={() => setExpanded(!expanded)} className="text-slate-400 hover:text-slate-600">
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {expanded && (
        <div className={`border-t ${action.border} px-4 pb-4 pt-3 ${action.bg}`}>
          <div className="flex items-center gap-3 flex-wrap text-xs">
            <div>
              <span className="text-slate-500 font-semibold">Writes to: </span>
              {action.objectTypes.map(t => {
                const OIcon = TYPE_ICONS[t] || Zap;
                return (
                  <span key={t} className="inline-flex items-center gap-1 mr-1.5 font-bold text-slate-600">
                    <OIcon className="w-3 h-3" /> {t}
                  </span>
                );
              })}
            </div>
            <div>
              <span className="text-slate-500 font-semibold">ETL triggered: </span>
              <span className="font-bold text-slate-600">{(action.etlEntities || []).join(", ")}</span>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
            {action.fields.map(f => (
              <div key={f.key} className="flex items-center gap-1.5 text-xs text-slate-600">
                <div className="w-1.5 h-1.5 rounded-full bg-slate-300 shrink-0" />
                <span className="font-semibold">{f.label}</span>
                {f.required && <span className="text-rose-500 text-[10px]">required</span>}
                {f.type === "select" && <span className="text-slate-400 text-[10px]">({f.options?.join(" | ")})</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── AuditLog ──────────────────────────────────────────────────────────────────
function AuditLog({ companyId }) {
  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["kinetic_log", companyId],
    queryFn: () =>
      fetch(`${RAILWAY_URL}/kinetic/log?company_id=${encodeURIComponent(companyId)}&limit=20`, { headers: API_HEADERS })
        .then(r => r.ok ? r.json() : { logs: [] })
        .then(d => d.logs || []),
    enabled: !!companyId,
    staleTime: 0,
    refetchOnMount: "always",
  });

  if (isLoading) return (
    <div className="flex items-center gap-2 text-slate-400 text-sm p-4">
      <Loader2 className="w-4 h-4 animate-spin" /> Loading audit log…
    </div>
  );

  if (!logs.length) return (
    <div className="text-center py-8 text-slate-400">
      <History className="w-8 h-8 mx-auto mb-2" />
      <p className="text-sm">No actions executed yet</p>
    </div>
  );

  return (
    <div className="space-y-2">
      {logs.map((log, i) => (
        <div key={i} className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
          <div className="w-7 h-7 rounded-lg bg-violet-100 flex items-center justify-center shrink-0">
            <Zap className="w-3.5 h-3.5 text-violet-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-slate-700">{log.action_name}</p>
            <p className="text-[11px] text-slate-400">by {log.executed_by} · {new Date(log.executed_at).toLocaleString()}</p>
          </div>
          <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
        </div>
      ))}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function KineticLayer() {
  const qc = useQueryClient();
  const [executingAction, setExecutingAction] = useState(null);
  const [activeTab, setActiveTab] = useState("actions");
  const [customActions, setCustomActions] = useState([]);
  const [execCounts, setExecCounts] = useState({});
  const [showNewAction, setShowNewAction] = useState(false);
  const [newAction, setNewAction] = useState({ name: "", description: "", category: "Custom", requiresApproval: false });
  const { toast } = useToast();

  // currentUser via React Query — staleTime:0 + refetchOnMount ensures fresh data on tab switch
  const { data: currentUser = null } = useQuery({
    queryKey: ["currentUser"],
    queryFn: () => ncClient.auth.me(),
    staleTime: 0,
    refetchOnMount: "always",
  });

  // Desktop cache fix — refetch on tab visibility change
  useEffect(() => {
    const fn = () => {
      if (document.visibilityState === "visible")
        qc.refetchQueries({ queryKey: ["currentUser"] });
    };
    document.addEventListener("visibilitychange", fn);
    return () => document.removeEventListener("visibilitychange", fn);
  }, [qc]);

  const listFn = useEntityListFn(currentUser);
  const withScope = useWithScope(currentUser);

  // Load per-company custom actions and exec counts from localStorage
  useEffect(() => {
    if (!currentUser) return;
    const cid = currentUser.company_id || "default";
    try {
      const loaded = JSON.parse(localStorage.getItem(`kinetic_custom_${cid}`) || "[]");
      // Restore execute stub — the fn is not serialisable and is stripped on save
      setCustomActions(loaded.map(a => ({ ...a, execute: CUSTOM_EXECUTE_STUB })));
      setExecCounts(JSON.parse(localStorage.getItem(`kinetic_counts_${cid}`) || "{}"));
    } catch { /* ignore */ }
  }, [currentUser?.company_id]);

  const handleExecute = (action) => setExecutingAction(action);

  const handleSuccess = () => {
    if (!executingAction) return;
    const cid = currentUser?.company_id || "default";
    const updated = { ...execCounts, [executingAction.id]: (execCounts[executingAction.id] || 0) + 1 };
    setExecCounts(updated);
    localStorage.setItem(`kinetic_counts_${cid}`, JSON.stringify(updated));
  };

  const addCustomAction = () => {
    if (!newAction.name.trim()) return;
    const cid = currentUser?.company_id || "default";
    const action = {
      id: `custom_${Date.now()}`,
      name: newAction.name.trim(),
      description: newAction.description.trim(),
      category: newAction.category || "Custom",
      objectTypes: ["Person"],
      color: "text-indigo-600",
      bg: "bg-indigo-50",
      border: "border-indigo-200",
      requiresApproval: newAction.requiresApproval,
      etlEntities: ["people"],
      isCustom: true,
      fields: [],
      execute: CUSTOM_EXECUTE_STUB,
    };
    const updated = [...customActions, action];
    setCustomActions(updated);
    // Strip execute fn — not serialisable; stub is restored on load (see useEffect above)
    localStorage.setItem(`kinetic_custom_${cid}`, JSON.stringify(updated.map(({ execute, ...rest }) => rest)));
    setShowNewAction(false);
    setNewAction({ name: "", description: "", category: "Custom", requiresApproval: false });
    toast({ title: "Custom action registered" });
  };

  const allActions = [...SYSTEM_ACTIONS, ...customActions];
  const totalExec = Object.values(execCounts).reduce((s, n) => s + n, 0);
  const categories = [...new Set(allActions.map(a => a.category))];

  return (
    <div className="flex flex-col gap-6 min-h-full">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-600 to-purple-600 flex items-center justify-center">
              <Zap className="w-4 h-4 text-white" />
            </div>
            <h1 className="text-2xl font-black text-slate-800">Kinetic Layer</h1>
          </div>
          <p className="text-slate-500 text-sm ml-11 max-w-2xl">
            Define and execute actions that write back through the ontology. Every execution writes to Base44 entities, triggers ETL, and is logged with a full audit trail.
          </p>
        </div>
        <Button onClick={() => setShowNewAction(true)} className="bg-violet-600 hover:bg-violet-700 rounded-xl">
          <Plus className="w-4 h-4 mr-2" /> Register Action
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "System Actions", value: SYSTEM_ACTIONS.length, icon: Zap,       color: "text-violet-600", bg: "bg-violet-50"  },
          { label: "Custom Actions", value: customActions.length,  icon: Plus,      color: "text-indigo-600", bg: "bg-indigo-50"  },
          { label: "Total Executed", value: totalExec,             icon: Activity,  color: "text-emerald-600",bg: "bg-emerald-50" },
          { label: "Write-back",     value: "Active",              icon: ArrowRight,color: "text-blue-600",   bg: "bg-blue-50"    },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="bg-white border border-slate-100 rounded-2xl p-4 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center shrink-0`}>
              <Icon className={`w-5 h-5 ${color}`} />
            </div>
            <div>
              <p className="text-2xl font-black text-slate-800">{value}</p>
              <p className="text-xs text-slate-400">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit">
        {[["actions", "Action Types"], ["log", "Audit Log"]].map(([id, label]) => (
          <button key={id} onClick={() => setActiveTab(id)}
            className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${activeTab === id ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
            {label}
          </button>
        ))}
      </div>

      {/* New action form */}
      {showNewAction && (
        <div className="bg-white border border-violet-200 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Plus className="w-4 h-4 text-violet-600" />
            <h2 className="text-sm font-bold text-slate-700">Register Custom Action Type</h2>
            <button onClick={() => setShowNewAction(false)} className="ml-auto text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="text-xs font-semibold text-slate-600 block mb-1">Action Name *</label>
              <input value={newAction.name} onChange={e => setNewAction(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Transfer Inventory" className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600 block mb-1">Category</label>
              <input value={newAction.category} onChange={e => setNewAction(p => ({ ...p, category: e.target.value }))} placeholder="e.g. Inventory" className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-semibold text-slate-600 block mb-1">Description</label>
              <input value={newAction.description} onChange={e => setNewAction(p => ({ ...p, description: e.target.value }))} placeholder="What does this action do?" className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="req_approval" checked={newAction.requiresApproval} onChange={e => setNewAction(p => ({ ...p, requiresApproval: e.target.checked }))} className="rounded" />
              <label htmlFor="req_approval" className="text-xs font-semibold text-slate-600">Requires approval before execution</label>
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setShowNewAction(false)} className="rounded-xl">Cancel</Button>
            <Button onClick={addCustomAction} disabled={!newAction.name.trim()} className="bg-violet-600 hover:bg-violet-700 rounded-xl">Register Action</Button>
          </div>
        </div>
      )}

      {/* Actions tab */}
      {activeTab === "actions" && (
        <div className="space-y-6">
          {categories.map(cat => {
            const catActions = allActions.filter(a => a.category === cat);
            return (
              <div key={cat}>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 px-1">{cat}</p>
                <div className="flex flex-col gap-3">
                  {catActions.map(action => (
                    <ActionCard
                      key={action.id}
                      action={action}
                      onExecute={handleExecute}
                      execCount={execCounts[action.id] || 0}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Audit log tab */}
      {activeTab === "log" && (
        <div className="bg-white border border-slate-100 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <History className="w-4 h-4 text-slate-400" />
            <h2 className="text-sm font-bold text-slate-700">Audit Log</h2>
            <span className="text-xs text-slate-400 ml-auto">Last 20 executions</span>
          </div>
          <AuditLog companyId={currentUser?.company_id} />
        </div>
      )}

      {/* Execute modal */}
      {executingAction && (
        <ExecuteActionModal
          action={executingAction}
          currentUser={currentUser}
          listFn={listFn}
          withScope={withScope}
          onClose={() => setExecutingAction(null)}
          onSuccess={() => { handleSuccess(); setTimeout(() => setExecutingAction(null), 1500); }}
        />
      )}
    </div>
  );
}
