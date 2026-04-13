import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import {
  GitBranch, Plus, Play, Pause, Trash2, Edit2, X, ChevronRight,
  Loader2, CheckCircle2, AlertCircle, Clock, Zap, Bell, RefreshCw,
  ArrowDown, GripVertical, ToggleLeft, ToggleRight, History,
} from "lucide-react";

const RAILWAY_URL = "https://newsconseenwebapp-production.up.railway.app";
const RAILWAY_API_KEY = import.meta.env.VITE_RAILWAY_API_KEY || "";
const API_HEADERS = {
  "Content-Type": "application/json",
  ...(RAILWAY_API_KEY ? { "x-api-key": RAILWAY_API_KEY } : {}),
};

// ── Trigger type definitions ──────────────────────────────────────────────────
const TRIGGER_TYPES = [
  {
    id:    "entity_created",
    label: "Entity Created",
    desc:  "Fires when a new record is created",
    icon:  Plus,
    color: "emerald",
  },
  {
    id:    "entity_updated",
    label: "Entity Updated",
    desc:  "Fires when an existing record is changed",
    icon:  Edit2,
    color: "amber",
  },
  {
    id:    "schedule",
    label: "Scheduled",
    desc:  "Runs automatically on a recurring schedule",
    icon:  Clock,
    color: "violet",
  },
  {
    id:    "manual",
    label: "Manual only",
    desc:  "Only runs when operator clicks Run",
    icon:  Play,
    color: "indigo",
  },
];

const SCHEDULE_INTERVALS = [
  { id: "hourly",  label: "Every hour" },
  { id: "daily",   label: "Every day" },
  { id: "weekly",  label: "Every week" },
  { id: "monthly", label: "Every month" },
];

const ENTITY_TYPES = [
  { id: "person",       label: "Person (staff / clients / contacts)" },
  { id: "enterprise",   label: "Enterprise (branches / organisations)" },
  { id: "product",      label: "Product / Inventory" },
  { id: "task",         label: "Task" },
  { id: "transaction",  label: "Transaction" },
];

// ── Step type definitions ─────────────────────────────────────────────────────
const STEP_TYPES = [
  {
    id:    "create_task",
    label: "Create Task",
    icon:  CheckCircle2,
    color: "bg-emerald-100 text-emerald-700",
    fields: [
      { key: "title",     label: "Title",              placeholder: "Welcome call with {{first_name}}" },
      { key: "task_type", label: "Task type",          placeholder: "follow_up" },
      { key: "due_days",  label: "Due in (days)",      placeholder: "1", type: "number" },
      { key: "priority",  label: "Priority",           placeholder: "medium" },
      { key: "notes",     label: "Notes (optional)",   placeholder: "Call {{first_name}} to introduce the programme" },
      { key: "assigned_to", label: "Assign to (email)", placeholder: "agent@org.com" },
    ],
  },
  {
    id:    "send_alert",
    label: "Send Notification",
    icon:  Bell,
    color: "bg-violet-100 text-violet-700",
    fields: [
      { key: "channel",   label: "Channel",   placeholder: "whatsapp", options: ["whatsapp", "email", "sms"] },
      { key: "recipient", label: "Recipient", placeholder: "{{phone}} or {{email}}" },
      { key: "message",   label: "Message",   placeholder: "Hi {{first_name}}, welcome to our programme!", multiline: true },
      { key: "subject",   label: "Subject (email only)", placeholder: "Welcome to the programme" },
    ],
  },
  {
    id:    "update_field",
    label: "Update Field",
    icon:  Edit2,
    color: "bg-amber-100 text-amber-700",
    fields: [
      { key: "field",      label: "Field name",  placeholder: "status" },
      { key: "value",      label: "New value",   placeholder: "active" },
      { key: "entity_url", label: "Entity URL (Base44)", placeholder: "https://..." },
    ],
  },
  {
    id:    "log_note",
    label: "Log Note",
    icon:  Clock,
    color: "bg-slate-100 text-slate-600",
    fields: [
      { key: "note", label: "Note", placeholder: "Workflow executed for {{first_name}} ({{person_type}})", multiline: true },
    ],
  },
];

const STEP_TYPE_MAP = Object.fromEntries(STEP_TYPES.map(s => [s.id, s]));


// ── WorkflowFormModal ─────────────────────────────────────────────────────────
function WorkflowFormModal({ companyId, existing, onClose, onSaved }) {
  const { toast } = useToast();

  const blank = {
    name:        "",
    description: "",
    trigger: { type: "entity_created", entity_type: "person", condition: {} },
    steps:   [],
    is_active: true,
  };

  const [form,    setForm]    = useState(existing ? { ...existing } : blank);
  const [saving,  setSaving]  = useState(false);
  const [condKey, setCondKey] = useState("");
  const [condVal, setCondVal] = useState("");

  function setField(path, value) {
    setForm(prev => {
      const next = { ...prev };
      const parts = path.split(".");
      let obj = next;
      for (let i = 0; i < parts.length - 1; i++) {
        obj[parts[i]] = { ...obj[parts[i]] };
        obj = obj[parts[i]];
      }
      obj[parts[parts.length - 1]] = value;
      return next;
    });
  }

  function addStep(type) {
    const stepId = Math.random().toString(36).slice(2, 8);
    setForm(prev => ({
      ...prev,
      steps: [
        ...prev.steps,
        { step_id: stepId, type, label: STEP_TYPE_MAP[type]?.label, params: {}, stop_on_error: false },
      ],
    }));
  }

  function removeStep(stepId) {
    setForm(prev => ({ ...prev, steps: prev.steps.filter(s => s.step_id !== stepId) }));
  }

  function setStepParam(stepId, key, value) {
    setForm(prev => ({
      ...prev,
      steps: prev.steps.map(s =>
        s.step_id === stepId ? { ...s, params: { ...s.params, [key]: value } } : s
      ),
    }));
  }

  function addCondition() {
    if (!condKey.trim()) return;
    setField("trigger.condition", { ...form.trigger.condition, [condKey.trim()]: condVal.trim() });
    setCondKey(""); setCondVal("");
  }

  function removeCondition(key) {
    const next = { ...form.trigger.condition };
    delete next[key];
    setField("trigger.condition", next);
  }

  async function save() {
    if (!form.name.trim()) {
      toast({ title: "Name is required", variant: "destructive" }); return;
    }
    if (form.steps.length === 0) {
      toast({ title: "Add at least one step", variant: "destructive" }); return;
    }
    setSaving(true);
    try {
      const payload = { ...form, company_id: companyId };
      const url    = existing
        ? `${RAILWAY_URL}/workflows/${existing.id}`
        : `${RAILWAY_URL}/workflows`;
      const method = existing ? "PUT" : "POST";
      const res    = await fetch(url, { method, headers: API_HEADERS, body: JSON.stringify(payload) });
      const data   = await res.json();
      if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`);
      toast({ title: existing ? "Workflow updated" : "Workflow created" });
      onSaved(data);
    } catch (e) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  const triggerType = TRIGGER_TYPES.find(t => t.id === form.trigger.type);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center">
              <GitBranch className="w-5 h-5 text-indigo-600" />
            </div>
            <p className="text-sm font-bold text-slate-800">
              {existing ? "Edit Workflow" : "New Workflow"}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

          {/* Name + description */}
          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-slate-600 mb-1.5 block">Workflow name *</label>
              <input
                value={form.name}
                onChange={e => setField("name", e.target.value)}
                className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-indigo-400"
                placeholder="New Client Onboarding"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600 mb-1.5 block">Description</label>
              <input
                value={form.description}
                onChange={e => setField("description", e.target.value)}
                className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-indigo-400"
                placeholder="What does this workflow do?"
              />
            </div>
          </div>

          {/* Trigger */}
          <div>
            <p className="text-xs font-bold text-slate-700 mb-2 uppercase tracking-wide">Trigger</p>
            <div className="grid grid-cols-3 gap-2 mb-3">
              {TRIGGER_TYPES.map(t => {
                const Icon = t.icon;
                const active = form.trigger.type === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => setField("trigger.type", t.id)}
                    className={`text-left p-3 rounded-xl border text-xs transition-colors ${
                      active ? "border-indigo-400 bg-indigo-50" : "border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    <Icon className={`w-4 h-4 mb-1.5 ${active ? "text-indigo-600" : "text-slate-400"}`} />
                    <p className={`font-semibold ${active ? "text-indigo-700" : "text-slate-700"}`}>{t.label}</p>
                    <p className="text-slate-400 mt-0.5">{t.desc}</p>
                  </button>
                );
              })}
            </div>

            {form.trigger.type === "schedule" && (
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-semibold text-slate-600 mb-1.5 block">Repeat every</label>
                  <div className="grid grid-cols-4 gap-2">
                    {SCHEDULE_INTERVALS.map(si => (
                      <button
                        key={si.id}
                        onClick={() => setField("trigger.schedule_interval", si.id)}
                        className={`text-xs py-2 rounded-xl border transition-colors ${
                          (form.trigger.schedule_interval || "daily") === si.id
                            ? "border-violet-400 bg-violet-50 text-violet-700 font-semibold"
                            : "border-slate-200 text-slate-500 hover:border-slate-300"
                        }`}
                      >
                        {si.label}
                      </button>
                    ))}
                  </div>
                </div>
                <p className="text-[10px] text-slate-400">
                  Scheduled workflows fire automatically when the ETL cron runs. The system checks whether each workflow is due based on its last run time.
                </p>
              </div>
            )}

            {(form.trigger.type === "entity_created" || form.trigger.type === "entity_updated") && (
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-semibold text-slate-600 mb-1.5 block">Entity type</label>
                  <select
                    value={form.trigger.entity_type || ""}
                    onChange={e => setField("trigger.entity_type", e.target.value)}
                    className="w-full text-xs border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-indigo-400 bg-white"
                  >
                    <option value="">Any entity</option>
                    {ENTITY_TYPES.map(et => <option key={et.id} value={et.id}>{et.label}</option>)}
                  </select>
                </div>

                {/* Conditions */}
                <div>
                  <label className="text-xs font-semibold text-slate-600 mb-1.5 block">
                    Conditions (optional) — entity must match all
                  </label>
                  {Object.entries(form.trigger.condition || {}).map(([k, v]) => (
                    <div key={k} className="flex items-center gap-2 mb-1.5">
                      <span className="text-xs font-mono bg-slate-100 px-2 py-1 rounded-lg flex-1">
                        {k} = "{v}"
                      </span>
                      <button onClick={() => removeCondition(k)} className="text-slate-400 hover:text-rose-500">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                  <div className="flex items-center gap-2">
                    <input
                      value={condKey} onChange={e => setCondKey(e.target.value)}
                      placeholder="field (e.g. person_type)"
                      className="flex-1 text-xs border border-slate-200 rounded-lg px-2.5 py-2 focus:outline-none focus:border-indigo-400"
                    />
                    <span className="text-slate-400 text-xs">=</span>
                    <input
                      value={condVal} onChange={e => setCondVal(e.target.value)}
                      placeholder="value (e.g. client)"
                      className="flex-1 text-xs border border-slate-200 rounded-lg px-2.5 py-2 focus:outline-none focus:border-indigo-400"
                    />
                    <Button onClick={addCondition} variant="outline" className="rounded-lg text-xs px-2.5 py-2 h-auto">
                      Add
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Steps */}
          <div>
            <p className="text-xs font-bold text-slate-700 mb-3 uppercase tracking-wide">
              Steps ({form.steps.length})
            </p>

            {form.steps.map((step, idx) => {
              const def = STEP_TYPE_MAP[step.type];
              if (!def) return null;
              const Icon = def.icon;
              return (
                <div key={step.step_id} className="mb-3 border border-slate-200 rounded-xl overflow-hidden">
                  {/* Step header */}
                  <div className="flex items-center gap-2 px-3 py-2.5 bg-slate-50 border-b border-slate-200">
                    <span className="text-slate-400 text-xs font-mono w-5 shrink-0">{idx + 1}</span>
                    <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full ${def.color}`}>
                      <Icon className="w-3 h-3" /> {def.label}
                    </span>
                    <button
                      onClick={() => removeStep(step.step_id)}
                      className="ml-auto text-slate-400 hover:text-rose-500"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {/* Step params */}
                  <div className="p-3 space-y-2.5">
                    {def.fields.map(field => (
                      <div key={field.key}>
                        <label className="text-[10px] font-semibold text-slate-500 uppercase mb-1 block">
                          {field.label}
                        </label>
                        {field.options ? (
                          <select
                            value={step.params[field.key] || ""}
                            onChange={e => setStepParam(step.step_id, field.key, e.target.value)}
                            className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-2 focus:outline-none focus:border-indigo-400 bg-white"
                          >
                            <option value="">Select…</option>
                            {field.options.map(o => <option key={o} value={o}>{o}</option>)}
                          </select>
                        ) : field.multiline ? (
                          <textarea
                            rows={2}
                            value={step.params[field.key] || ""}
                            onChange={e => setStepParam(step.step_id, field.key, e.target.value)}
                            placeholder={field.placeholder}
                            className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-2 focus:outline-none focus:border-indigo-400 resize-none"
                          />
                        ) : (
                          <input
                            type={field.type || "text"}
                            value={step.params[field.key] || ""}
                            onChange={e => setStepParam(step.step_id, field.key, e.target.value)}
                            placeholder={field.placeholder}
                            className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-2 focus:outline-none focus:border-indigo-400"
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}

            {form.steps.length > 0 && (
              <div className="flex justify-center my-1">
                <ArrowDown className="w-4 h-4 text-slate-300" />
              </div>
            )}

            {/* Add step buttons */}
            <div className="flex flex-wrap gap-2">
              {STEP_TYPES.map(st => {
                const Icon = st.icon;
                return (
                  <button
                    key={st.id}
                    onClick={() => addStep(st.id)}
                    className="flex items-center gap-1.5 text-xs border border-dashed border-slate-300 text-slate-500 px-3 py-2 rounded-xl hover:border-indigo-400 hover:text-indigo-600 transition-colors"
                  >
                    <Icon className="w-3.5 h-3.5" />
                    + {st.label}
                  </button>
                );
              })}
            </div>

            <p className="text-[10px] text-slate-400 mt-2">
              Use <code>{"{{field_name}}"}</code> placeholders — e.g. <code>{"{{first_name}}"}</code>, <code>{"{{phone}}"}</code>, <code>{"{{person_type}}"}</code>
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between">
          <button onClick={onClose} className="text-xs text-slate-400 hover:text-slate-600">Cancel</button>
          <Button
            onClick={save}
            disabled={saving}
            className="bg-indigo-600 hover:bg-indigo-700 rounded-xl text-xs"
          >
            {saving
              ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Saving…</>
              : <><GitBranch className="w-3.5 h-3.5 mr-1.5" /> {existing ? "Update Workflow" : "Create Workflow"}</>}
          </Button>
        </div>
      </div>
    </div>
  );
}


// ── Main Workflows page ───────────────────────────────────────────────────────
export default function Workflows() {
  const [currentUser, setCurrentUser] = useState(null);
  const [formOpen,    setFormOpen]    = useState(false);
  const [editing,     setEditing]     = useState(null);
  const [activeTab,   setActiveTab]   = useState("workflows"); // workflows | runs
  const [running,     setRunning]     = useState(null);
  const { toast } = useToast();
  const qc = useQueryClient();

  useEffect(() => { base44.auth.me().then(setCurrentUser).catch(() => {}); }, []);

  const companyId = currentUser?.company_id;

  const { data: workflowsData = { workflows: [] }, isLoading } = useQuery({
    queryKey: ["workflows", companyId],
    queryFn: async () => {
      if (!companyId) return { workflows: [] };
      const res = await fetch(`${RAILWAY_URL}/workflows?company_id=${companyId}`, { headers: API_HEADERS });
      if (!res.ok) return { workflows: [] };
      return res.json();
    },
    enabled: !!companyId,
    staleTime: 0,
    refetchOnMount: "always",
  });

  const { data: runsData = { runs: [] }, isLoading: runsLoading } = useQuery({
    queryKey: ["workflow-runs", companyId],
    queryFn: async () => {
      if (!companyId) return { runs: [] };
      const res = await fetch(`${RAILWAY_URL}/workflows/runs?company_id=${companyId}`, { headers: API_HEADERS });
      if (!res.ok) return { runs: [] };
      return res.json();
    },
    enabled: !!companyId && activeTab === "runs",
    staleTime: 0,
  });

  async function handleToggle(wf) {
    try {
      await fetch(`${RAILWAY_URL}/workflows/${wf.id}/toggle`, { method: "POST", headers: API_HEADERS });
      qc.invalidateQueries({ queryKey: ["workflows", companyId] });
    } catch (e) {
      toast({ title: "Toggle failed", description: e.message, variant: "destructive" });
    }
  }

  async function handleDelete(wf) {
    if (!window.confirm(`Delete workflow "${wf.name}"?`)) return;
    try {
      await fetch(`${RAILWAY_URL}/workflows/${wf.id}?company_id=${companyId}`, {
        method: "DELETE", headers: API_HEADERS,
      });
      qc.invalidateQueries({ queryKey: ["workflows", companyId] });
      toast({ title: "Workflow deleted" });
    } catch (e) {
      toast({ title: "Delete failed", description: e.message, variant: "destructive" });
    }
  }

  async function handleRun(wf) {
    setRunning(wf.id);
    try {
      const res = await fetch(`${RAILWAY_URL}/workflows/trigger`, {
        method: "POST",
        headers: API_HEADERS,
        body: JSON.stringify({
          company_id:   companyId,
          trigger_type: wf.trigger?.type || "manual",
          entity_type:  wf.trigger?.entity_type || null,
          entity_data:  {},
          workflow_id:  wf.id,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed");
      const r = data.results?.[0];
      toast({ title: r ? `${wf.name} — ${r.steps_run} steps run (${r.status})` : "Triggered" });
      qc.invalidateQueries({ queryKey: ["workflows", companyId] });
      qc.invalidateQueries({ queryKey: ["workflow-runs", companyId] });
    } catch (e) {
      toast({ title: "Run failed", description: e.message, variant: "destructive" });
    } finally {
      setRunning(null);
    }
  }

  function onSaved() {
    qc.invalidateQueries({ queryKey: ["workflows", companyId] });
    setFormOpen(false);
    setEditing(null);
  }

  const workflows = workflowsData.workflows || [];
  const runs      = runsData.runs || [];
  const active    = workflows.filter(w => w.is_active).length;

  if (!currentUser) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-6 h-6 border-4 border-slate-200 border-t-indigo-500 rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-8">
      {/* Form modal */}
      {(formOpen || editing) && (
        <WorkflowFormModal
          companyId={companyId}
          existing={editing}
          onClose={() => { setFormOpen(false); setEditing(null); }}
          onSaved={onSaved}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Workflows</h1>
          <p className="text-sm text-slate-500 mt-1">
            Automate operations with trigger → step sequences.
            {active > 0 && ` ${active} active.`}
          </p>
        </div>
        <Button
          onClick={() => { setEditing(null); setFormOpen(true); }}
          className="bg-indigo-600 hover:bg-indigo-700 rounded-xl text-sm"
        >
          <Plus className="w-4 h-4 mr-2" /> New Workflow
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Total workflows", value: workflows.length, color: "text-slate-800" },
          { label: "Active",          value: active,            color: "text-emerald-700" },
          { label: "Total runs",      value: runs.length,       color: "text-indigo-700" },
        ].map(s => (
          <div key={s.label} className="bg-white border border-slate-200 rounded-xl p-4">
            <p className="text-xs text-slate-400 uppercase font-semibold">{s.label}</p>
            <p className={`text-2xl font-bold mt-1 ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-slate-200">
        {[
          { id: "workflows", label: "Workflows",   icon: GitBranch },
          { id: "runs",      label: "Run History", icon: History },
        ].map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? "border-indigo-600 text-indigo-700"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              <Icon className="w-4 h-4" /> {tab.label}
            </button>
          );
        })}
      </div>

      {/* Workflows tab */}
      {activeTab === "workflows" && (
        isLoading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-4 border-slate-200 border-t-indigo-500 rounded-full animate-spin" />
          </div>
        ) : workflows.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <GitBranch className="w-14 h-14 mx-auto mb-4 opacity-20" />
            <p className="text-base font-medium text-slate-600">No workflows yet</p>
            <p className="text-sm mt-1">Create your first workflow to automate operations.</p>
            <Button
              onClick={() => setFormOpen(true)}
              className="mt-6 bg-indigo-600 hover:bg-indigo-700 rounded-xl"
            >
              <Plus className="w-4 h-4 mr-2" /> Create first workflow
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {workflows.map(wf => {
              const triggerDef = TRIGGER_TYPES.find(t => t.id === wf.trigger?.type);
              const TrigIcon   = triggerDef?.icon || Zap;
              return (
                <div
                  key={wf.id}
                  className={`bg-white border rounded-xl p-4 transition-shadow hover:shadow-md ${
                    wf.is_active ? "border-slate-200" : "border-slate-100 opacity-60"
                  }`}
                >
                  <div className="flex items-start gap-4">
                    {/* Trigger icon */}
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                      wf.is_active ? "bg-indigo-50" : "bg-slate-100"
                    }`}>
                      <TrigIcon className={`w-4 h-4 ${wf.is_active ? "text-indigo-600" : "text-slate-400"}`} />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-slate-800 text-sm">{wf.name}</h3>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          wf.is_active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
                        }`}>
                          {wf.is_active ? "Active" : "Paused"}
                        </span>
                      </div>
                      {wf.description && (
                        <p className="text-xs text-slate-500 mt-0.5">{wf.description}</p>
                      )}
                      {/* Trigger + steps summary */}
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        <span className="text-[10px] bg-indigo-50 text-indigo-700 font-semibold px-2 py-0.5 rounded-full capitalize">
                          {(wf.trigger?.type || "manual").replace("_", " ")}
                        </span>
                        {wf.trigger?.entity_type && (
                          <span className="text-[10px] text-slate-500 font-mono">
                            → {wf.trigger.entity_type}
                          </span>
                        )}
                        <ChevronRight className="w-3 h-3 text-slate-300" />
                        <span className="text-[10px] text-slate-500">
                          {(wf.steps || []).length} step{(wf.steps || []).length !== 1 ? "s" : ""}
                        </span>
                        {wf.run_count > 0 && (
                          <>
                            <span className="text-slate-300">·</span>
                            <span className="text-[10px] text-slate-400">{wf.run_count} run{wf.run_count !== 1 ? "s" : ""}</span>
                          </>
                        )}
                        {wf.last_run_at && (
                          <>
                            <span className="text-slate-300">·</span>
                            <span className="text-[10px] text-slate-400">
                              last {new Date(wf.last_run_at).toLocaleDateString()}
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => handleRun(wf)}
                        disabled={running === wf.id}
                        title="Run now"
                        className="w-8 h-8 rounded-xl border border-slate-200 flex items-center justify-center text-slate-500 hover:border-emerald-400 hover:text-emerald-600 transition-colors"
                      >
                        {running === wf.id
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : <Play className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        onClick={() => handleToggle(wf)}
                        title={wf.is_active ? "Pause" : "Enable"}
                        className="w-8 h-8 rounded-xl border border-slate-200 flex items-center justify-center text-slate-500 hover:border-indigo-400 hover:text-indigo-600 transition-colors"
                      >
                        {wf.is_active ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        onClick={() => { setEditing(wf); setFormOpen(true); }}
                        title="Edit"
                        className="w-8 h-8 rounded-xl border border-slate-200 flex items-center justify-center text-slate-500 hover:border-amber-400 hover:text-amber-600 transition-colors"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(wf)}
                        title="Delete"
                        className="w-8 h-8 rounded-xl border border-slate-200 flex items-center justify-center text-slate-500 hover:border-rose-400 hover:text-rose-600 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {/* Run History tab */}
      {activeTab === "runs" && (
        runsLoading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-4 border-slate-200 border-t-indigo-500 rounded-full animate-spin" />
          </div>
        ) : runs.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            <History className="w-12 h-12 mx-auto mb-3 opacity-20" />
            <p className="text-sm">No workflow runs yet. Run a workflow to see results here.</p>
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  {["Workflow", "Trigger", "Entity", "Steps", "Status", "Run at"].map(h => (
                    <th key={h} className="px-4 py-3 text-left font-semibold text-slate-600">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {runs.map((run, i) => {
                  const statusConfig = {
                    completed:              { color: "emerald", label: "Completed",    Icon: CheckCircle2 },
                    completed_with_errors:  { color: "amber",   label: "Partial",      Icon: AlertCircle  },
                    error:                  { color: "rose",    label: "Failed",       Icon: AlertCircle  },
                    triggered:              { color: "indigo",  label: "Triggered",    Icon: Zap          },
                  }[run.status] || { color: "slate", label: run.status, Icon: Clock };
                  const { color, label, Icon } = statusConfig;
                  return (
                    <tr key={i} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="px-4 py-2.5 font-medium text-slate-800 max-w-[160px] truncate">
                        {run.workflow_name || run.workflow_id}
                      </td>
                      <td className="px-4 py-2.5 text-slate-500 capitalize">
                        {(run.trigger_type || "").replace("_", " ")}
                      </td>
                      <td className="px-4 py-2.5 text-slate-500 capitalize">{run.entity_type || "—"}</td>
                      <td className="px-4 py-2.5 text-center">{run.steps_run ?? "—"}</td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-${color}-100 text-${color}-700`}>
                          <Icon className="w-3 h-3" /> {label}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-slate-400">
                        {run.started_at ? new Date(run.started_at).toLocaleString() : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  );
}
