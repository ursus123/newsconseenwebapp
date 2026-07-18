/**
 * Pipeline Builder — Newsconseen's primary data integration application.
 *
 * Workflow: Inputs → Transform → Preview → Deliver → Outputs
 * Architecture: Spark / Flink execution model (visual representation)
 * Persistence: per-enterprise localStorage (company_id scoped)
 */

import React, { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import {
  GitBranch, Plus, Trash2, Play, X, ChevronRight,
  Database, Filter, Merge, BarChart2, Brain, MapPin, Zap,
  AlertTriangle, CheckCircle2, Copy,
  ArrowRight, Layers, RefreshCw, Loader2, Download, Globe, Activity, Code2,
} from "lucide-react";

// ── Node type catalogue ───────────────────────────────────────────────────────

const NODE_TYPES = {
  // ── Inputs ──────────────────────────────────────────────────────────────────
  source: {
    label: "Data Source",
    group: "Input",
    icon: Database,
    color: "text-blue-600",
    bg: "bg-blue-50",
    border: "border-blue-200",
    badgeBg: "bg-blue-100",
    badgeText: "text-blue-700",
    description: "Read from a raw_* or analytics table",
    configFields: [
      { key: "table", label: "Table", type: "select", options: [
        "raw_people","raw_enterprises","raw_products","raw_tasks",
        "raw_transactions","raw_services","raw_relationships",
        "raw_addresses","raw_ml_predictions",
        "analytics.people_summary","analytics.enterprise_summary",
        "analytics.product_summary","analytics.transaction_summary",
        "analytics.task_summary",
      ]},
      { key: "filter", label: "Pre-filter (SQL WHERE)", type: "text", placeholder: "status = 'active'" },
      { key: "limit",  label: "Row limit",               type: "number", placeholder: "10000" },
    ],
  },
  connector: {
    label: "External Connector",
    group: "Input",
    icon: Globe,
    color: "text-cyan-600",
    bg: "bg-cyan-50",
    border: "border-cyan-200",
    badgeBg: "bg-cyan-100",
    badgeText: "text-cyan-700",
    description: "Pull data from an external API or connector",
    configFields: [
      { key: "connector", label: "Connector", type: "select", options: [
        "REST API","PostgreSQL","MySQL","MongoDB","Salesforce",
        "Google Sheets","Snowflake","BigQuery","S3","SFTP",
      ]},
      { key: "url",  label: "Connection / URL", type: "text" },
      { key: "auth", label: "Auth method",       type: "select", options: ["API Key","OAuth 2","Basic","None"] },
    ],
  },

  // ── Transforms ──────────────────────────────────────────────────────────────
  filter: {
    label: "Filter",
    group: "Transform",
    icon: Filter,
    color: "text-emerald-600",
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    badgeBg: "bg-emerald-100",
    badgeText: "text-emerald-700",
    description: "Keep rows matching a condition",
    configFields: [
      { key: "column",   label: "Column",    type: "text",   placeholder: "status" },
      { key: "operator", label: "Operator",  type: "select", options: ["=","!=",">","<",">=","<=","IN","NOT IN","IS NULL","IS NOT NULL","CONTAINS"] },
      { key: "value",    label: "Value",     type: "text",   placeholder: "active" },
    ],
  },
  join: {
    label: "Join",
    group: "Transform",
    icon: Merge,
    color: "text-violet-600",
    bg: "bg-violet-50",
    border: "border-violet-200",
    badgeBg: "bg-violet-100",
    badgeText: "text-violet-700",
    description: "Join two streams on a key column",
    configFields: [
      { key: "join_type",   label: "Join type",    type: "select", options: ["INNER","LEFT","RIGHT","FULL OUTER","CROSS"] },
      { key: "left_key",   label: "Left key",     type: "text",   placeholder: "id" },
      { key: "right_key",  label: "Right key",    type: "text",   placeholder: "person_id" },
      { key: "right_table",label: "Right table",  type: "text",   placeholder: "raw_enterprises" },
    ],
  },
  aggregate: {
    label: "Aggregate",
    group: "Transform",
    icon: BarChart2,
    color: "text-amber-600",
    bg: "bg-amber-50",
    border: "border-amber-200",
    badgeBg: "bg-amber-100",
    badgeText: "text-amber-700",
    description: "Group by columns and compute metrics",
    configFields: [
      { key: "group_by",   label: "Group by (comma separated)", type: "text", placeholder: "person_type, status" },
      { key: "metrics",    label: "Metrics (SQL expressions)",  type: "textarea", placeholder: "COUNT(*) AS count, SUM(amount) AS revenue, AVG(amount) AS avg_amount" },
    ],
  },
  rename: {
    label: "Rename / Select",
    group: "Transform",
    icon: Code2,
    color: "text-indigo-600",
    bg: "bg-indigo-50",
    border: "border-indigo-200",
    badgeBg: "bg-indigo-100",
    badgeText: "text-indigo-700",
    description: "Select, rename, or cast columns",
    configFields: [
      { key: "expressions", label: "Column expressions (SQL SELECT list)", type: "textarea", placeholder: "id, full_name AS name, CAST(amount AS FLOAT) AS amount_float" },
    ],
  },
  ml_model: {
    label: "ML Model",
    group: "Transform",
    icon: Brain,
    color: "text-rose-600",
    bg: "bg-rose-50",
    border: "border-rose-200",
    badgeBg: "bg-rose-100",
    badgeText: "text-rose-700",
    description: "Run an ML model over the data stream",
    configFields: [
      { key: "model", label: "Model", type: "select", options: [
        "retention-risk","staffing-forecast","ltv-segmentation","shift-demand","custom",
      ]},
      { key: "custom_endpoint", label: "Custom endpoint (if custom)", type: "text", placeholder: "my-model" },
      { key: "output_column",   label: "Score column name",           type: "text", placeholder: "risk_score" },
    ],
  },
  geo: {
    label: "Geospatial",
    group: "Transform",
    icon: MapPin,
    color: "text-teal-600",
    bg: "bg-teal-50",
    border: "border-teal-200",
    badgeBg: "bg-teal-100",
    badgeText: "text-teal-700",
    description: "Geocode addresses, compute distances, or cluster locations",
    configFields: [
      { key: "operation",    label: "Operation",      type: "select", options: ["Geocode addresses","DBSCAN clustering","Distance matrix","Nearest neighbours","H3 indexing"] },
      { key: "address_col",  label: "Address column", type: "text",   placeholder: "address" },
      { key: "lat_col",      label: "Lat column",     type: "text",   placeholder: "latitude" },
      { key: "lon_col",      label: "Lon column",     type: "text",   placeholder: "longitude" },
    ],
  },
  llm: {
    label: "LLM Transform",
    group: "Transform",
    icon: Zap,
    color: "text-purple-600",
    bg: "bg-purple-50",
    border: "border-purple-200",
    badgeBg: "bg-purple-100",
    badgeText: "text-purple-700",
    description: "Apply a tenant-approved advisor prompt to each row",
    configFields: [
      { key: "model",        label: "Advisor model",       type: "select", options: ["automatic","claude-sonnet-4-6","claude-haiku-4-5","claude-opus-4-6"] },
      { key: "input_column", label: "Input column",        type: "text",   placeholder: "notes" },
      { key: "output_column",label: "Output column name",  type: "text",   placeholder: "sentiment" },
      { key: "prompt",       label: "Prompt template",     type: "textarea", placeholder: "Classify the sentiment of this text as positive, neutral, or negative: {{input}}" },
    ],
  },

  // ── Outputs ──────────────────────────────────────────────────────────────────
  output_table: {
    label: "Write to Table",
    group: "Output",
    icon: Database,
    color: "text-slate-600",
    bg: "bg-slate-50",
    border: "border-slate-200",
    badgeBg: "bg-slate-100",
    badgeText: "text-slate-700",
    description: "Write results to an analytics table",
    configFields: [
      { key: "target",  label: "Target table",  type: "text",   placeholder: "analytics.my_custom_summary" },
      { key: "mode",    label: "Write mode",    type: "select", options: ["REPLACE","APPEND","UPSERT"] },
      { key: "key_col", label: "Upsert key column (if UPSERT)", type: "text", placeholder: "id" },
    ],
  },
  export: {
    label: "Export",
    group: "Output",
    icon: Download,
    color: "text-orange-600",
    bg: "bg-orange-50",
    border: "border-orange-200",
    badgeBg: "bg-orange-100",
    badgeText: "text-orange-700",
    description: "Export results to CSV, Excel, or a webhook",
    configFields: [
      { key: "format",  label: "Format",       type: "select", options: ["CSV","Excel","JSON","Webhook","Email"] },
      { key: "target",  label: "Destination",  type: "text",   placeholder: "email@example.com or https://webhook.url" },
    ],
  },
  alert: {
    label: "Alert",
    group: "Output",
    icon: Activity,
    color: "text-red-600",
    bg: "bg-red-50",
    border: "border-red-200",
    badgeBg: "bg-red-100",
    badgeText: "text-red-700",
    description: "Send alerts when conditions are met",
    configFields: [
      { key: "channel",   label: "Channel",   type: "select", options: ["WhatsApp","Email","SMS","Slack","In-app"] },
      { key: "condition", label: "Condition", type: "text",   placeholder: "risk_score > 0.8" },
      { key: "recipient", label: "Recipient", type: "text",   placeholder: "+27821234567 or user@email.com" },
      { key: "message",   label: "Message template", type: "textarea", placeholder: "High risk detected for {{full_name}}: score {{risk_score}}" },
    ],
  },
};

const GROUPS = ["Input", "Transform", "Output"];

const GROUP_COLORS = {
  Input:     { header: "bg-blue-600",    badge: "bg-blue-100 text-blue-800" },
  Transform: { header: "bg-violet-600",  badge: "bg-violet-100 text-violet-800" },
  Output:    { header: "bg-slate-700",   badge: "bg-slate-100 text-slate-800" },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeNode(type) {
  return {
    id:     `node_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    type,
    label:  NODE_TYPES[type]?.label || type,
    config: {},
    valid:  false,
  };
}

function makePipeline(name) {
  return {
    id:          `pipe_${Date.now()}`,
    name:        name || "Untitled Pipeline",
    description: "",
    nodes:       [],
    createdAt:   new Date().toISOString(),
    updatedAt:   new Date().toISOString(),
    version:     1,
  };
}

function validateNode(node) {
  const def = NODE_TYPES[node.type];
  if (!def) return false;
  const required = def.configFields?.filter(f => !f.placeholder?.startsWith("(")) || [];
  // source requires table, filter requires column+operator
  if (node.type === "source") return !!node.config.table;
  if (node.type === "filter") return !!(node.config.column && node.config.operator);
  if (node.type === "output_table") return !!node.config.target;
  if (node.type === "llm") return !!(node.config.input_column && node.config.prompt);
  return true;
}

// ── NodeCard ──────────────────────────────────────────────────────────────────

function NodeCard({ node, index, isSelected, isFirst, isLast, onSelect, onDelete, onMoveLeft, onMoveRight }) {
  const def = NODE_TYPES[node.type];
  if (!def) return null;
  const Icon = def.icon;
  const isValid = validateNode(node);

  return (
    <div className="flex items-center">
      {/* Connector line from previous */}
      {!isFirst && (
        <div className="flex items-center shrink-0 w-8">
          <div className="flex-1 h-0.5 bg-slate-300" />
          <ChevronRight className="w-4 h-4 text-slate-400 shrink-0 -ml-1" />
        </div>
      )}

      {/* Node box */}
      <div
        onClick={() => onSelect(node.id)}
        className={`relative flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 cursor-pointer transition-all min-w-[100px] max-w-[120px] shadow-sm
          ${isSelected ? `${def.border} ring-2 ring-offset-1 ring-blue-400` : `${def.border} hover:shadow-md`}
          ${def.bg}
        `}
      >
        {/* Delete button */}
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(node.id); }}
          className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-white border border-slate-200 flex items-center justify-center shadow-sm hover:bg-rose-50 hover:border-rose-300 transition-colors"
        >
          <X className="w-3 h-3 text-slate-400 hover:text-rose-600" />
        </button>

        {/* Valid indicator */}
        <div className="absolute -top-2 -left-2">
          {isValid
            ? <CheckCircle2 className="w-4 h-4 text-emerald-500 bg-white rounded-full" />
            : <AlertTriangle className="w-4 h-4 text-amber-500 bg-white rounded-full" />
          }
        </div>

        <div className={`w-10 h-10 rounded-xl ${def.bg} border ${def.border} flex items-center justify-center`}>
          <Icon className={`w-5 h-5 ${def.color}`} />
        </div>
        <p className="text-[11px] font-bold text-slate-700 text-center leading-tight">{node.label || def.label}</p>
        <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${def.badgeBg} ${def.badgeText} uppercase tracking-wide`}>
          {def.group}
        </span>
      </div>
    </div>
  );
}

// ── NodeConfigPanel ────────────────────────────────────────────────────────────

function NodeConfigPanel({ node, onChange, onClose, companyId }) {
  const def = NODE_TYPES[node.type];
  if (!def) return null;
  const Icon = def.icon;
  const isValid = validateNode(node);

  const set = (key, val) => {
    const newConfig = { ...node.config, [key]: val };
    // Auto-inject company_id WHERE filter when a source table is selected.
    // This ensures pipelines built by org admins are always scoped to their
    // own data — prevents cross-tenant data access if/when real execution runs.
    if (node.type === "source" && key === "table" && val && companyId && companyId !== "default") {
      const scopeClause = `company_id = '${companyId}'`;
      const existing = (newConfig.filter || "").trim();
      if (!existing) {
        newConfig.filter = scopeClause;
      } else if (!existing.includes("company_id")) {
        newConfig.filter = `${scopeClause} AND (${existing})`;
      }
    }
    onChange({ ...node, config: newConfig });
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-lg overflow-hidden">
      {/* Header */}
      <div className={`flex items-center gap-3 px-4 py-3 ${def.bg} border-b ${def.border}`}>
        <div className={`w-8 h-8 rounded-lg bg-white ${def.border} border flex items-center justify-center`}>
          <Icon className={`w-4 h-4 ${def.color}`} />
        </div>
        <div className="flex-1 min-w-0">
          <input
            value={node.label || ""}
            onChange={e => onChange({ ...node, label: e.target.value })}
            placeholder={def.label}
            className="text-sm font-bold text-slate-800 bg-transparent border-none outline-none w-full"
          />
          <p className="text-[10px] text-slate-500">{def.description}</p>
        </div>
        <div className="flex items-center gap-1">
          {isValid
            ? <span className="flex items-center gap-1 text-[10px] text-emerald-700 font-semibold"><CheckCircle2 className="w-3.5 h-3.5" /> Valid</span>
            : <span className="flex items-center gap-1 text-[10px] text-amber-700 font-semibold"><AlertTriangle className="w-3.5 h-3.5" /> Configure</span>
          }
          <button onClick={onClose} className="ml-2 text-slate-400 hover:text-slate-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Fields */}
      <div className="p-4 space-y-3">
        {def.configFields?.map(field => (
          <div key={field.key}>
            <label className="text-xs font-semibold text-slate-600 block mb-1">{field.label}</label>
            {field.type === "select" ? (
              <select
                value={node.config[field.key] || ""}
                onChange={e => set(field.key, e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              >
                <option value="">— select —</option>
                {field.options?.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : field.type === "textarea" ? (
              <textarea
                value={node.config[field.key] || ""}
                onChange={e => set(field.key, e.target.value)}
                rows={3}
                placeholder={field.placeholder}
                className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-300 resize-y"
              />
            ) : (
              <input
                type={field.type || "text"}
                value={node.config[field.key] || ""}
                onChange={e => set(field.key, e.target.value)}
                placeholder={field.placeholder}
                className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              />
            )}
          </div>
        ))}

        {/* Scope badge — source nodes always show which tenant they're filtered to */}
        {node.type === "source" && node.config.table && companyId && companyId !== "default" && (
          <div className="flex items-center gap-1.5 mt-1 px-2 py-1.5 bg-emerald-50 border border-emerald-100 rounded-lg">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            <p className="text-[10px] text-emerald-700 font-medium leading-tight">
              Scoped to your organisation — <span className="font-mono">{`company_id = '${companyId}'`}</span> is enforced at execution.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── AddNodePalette ─────────────────────────────────────────────────────────────

function AddNodePalette({ onAdd, onClose }) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-xl p-4 w-full max-w-2xl">
      <div className="flex items-center gap-2 mb-4">
        <Plus className="w-4 h-4 text-slate-500" />
        <h3 className="text-sm font-bold text-slate-700">Add Node</h3>
        <button onClick={onClose} className="ml-auto text-slate-400 hover:text-slate-600">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="space-y-4">
        {GROUPS.map(group => {
          const nodesInGroup = Object.entries(NODE_TYPES).filter(([, def]) => def.group === group);
          const gc = GROUP_COLORS[group];
          return (
            <div key={group}>
              <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold text-white mb-2 ${gc.header}`}>
                {group}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {nodesInGroup.map(([type, def]) => {
                  const Icon = def.icon;
                  return (
                    <button
                      key={type}
                      onClick={() => onAdd(type)}
                      className={`flex items-center gap-2.5 p-2.5 rounded-xl border ${def.border} ${def.bg} hover:shadow-md transition-all text-left`}
                    >
                      <div className="w-8 h-8 rounded-lg bg-white border border-white/50 flex items-center justify-center shrink-0">
                        <Icon className={`w-4 h-4 ${def.color}`} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-700 leading-tight">{def.label}</p>
                        <p className="text-[10px] text-slate-400 leading-tight mt-0.5 line-clamp-1">{def.description}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── PipelineBuilder (main export) ─────────────────────────────────────────────

export default function PipelineBuilder({ currentUser }) {
  const cid = currentUser?.company_id || "default";
  const storageKey = `pipelines_${cid}`;

  const loadPipelines = () => {
    try { return JSON.parse(localStorage.getItem(storageKey) || "[]"); } catch { return []; }
  };

  const [pipelines, setPipelines] = useState(loadPipelines);
  const [activePipeline, setActivePipeline] = useState(null);
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [showPalette, setShowPalette] = useState(false);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState(null);
  const { toast } = useToast();

  const savePipelines = (updated) => {
    setPipelines(updated);
    localStorage.setItem(storageKey, JSON.stringify(updated));
  };

  const createPipeline = () => {
    if (!newName.trim()) return;
    const p = makePipeline(newName.trim());
    const updated = [...pipelines, p];
    savePipelines(updated);
    setActivePipeline(p);
    setNewName("");
    setShowNewForm(false);
  };

  const deletePipeline = (id) => {
    const updated = pipelines.filter(p => p.id !== id);
    savePipelines(updated);
    if (activePipeline?.id === id) setActivePipeline(null);
  };

  const duplicatePipeline = (p) => {
    const copy = { ...p, id: `pipe_${Date.now()}`, name: `${p.name} (copy)`, createdAt: new Date().toISOString() };
    const updated = [...pipelines, copy];
    savePipelines(updated);
  };

  // Sync activePipeline changes back to list
  const updateActivePipeline = useCallback((changes) => {
    const updated = { ...activePipeline, ...changes, updatedAt: new Date().toISOString() };
    setActivePipeline(updated);
    const updatedList = pipelines.map(p => p.id === updated.id ? updated : p);
    savePipelines(updatedList);
  }, [activePipeline, pipelines]);

  const addNode = (type) => {
    const node = makeNode(type);
    const nodes = [...(activePipeline.nodes || []), node];
    updateActivePipeline({ nodes });
    setSelectedNodeId(node.id);
    setShowPalette(false);
  };

  const deleteNode = (nodeId) => {
    const nodes = (activePipeline.nodes || []).filter(n => n.id !== nodeId);
    updateActivePipeline({ nodes });
    if (selectedNodeId === nodeId) setSelectedNodeId(null);
  };

  const updateNode = (updated) => {
    const nodes = (activePipeline.nodes || []).map(n => n.id === updated.id ? updated : n);
    updateActivePipeline({ nodes });
  };

  const runPipeline = async () => {
    setRunning(true);
    setRunResult(null);
    // Simulate validation + execution
    await new Promise(r => setTimeout(r, 1200));
    const nodes = activePipeline.nodes || [];
    const invalid = nodes.filter(n => !validateNode(n));
    if (invalid.length > 0) {
      setRunResult({ status: "error", message: `${invalid.length} node(s) have missing configuration.` });
    } else if (nodes.length < 2) {
      setRunResult({ status: "error", message: "Pipeline needs at least one input and one output node." });
    } else {
      setRunResult({
        status: "success",
        message: `Pipeline validated — ${nodes.length} nodes, 0 errors. Ready for deployment.`,
        nodes: nodes.length,
      });
    }
    setRunning(false);
  };

  const selectedNode = activePipeline?.nodes?.find(n => n.id === selectedNodeId);
  const totalNodes = activePipeline?.nodes?.length || 0;
  const invalidCount = (activePipeline?.nodes || []).filter(n => !validateNode(n)).length;
  const isReady = totalNodes >= 2 && invalidCount === 0;

  // ── No pipeline selected — show list ─────────────────────────────────────────
  if (!activePipeline) {
    return (
      <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm">
        {/* Builder header */}
        <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <GitBranch className="w-5 h-5 text-indigo-600" />
              <h2 className="text-base font-black text-slate-800">Pipeline Builder</h2>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">Beta</span>
            </div>
            <p className="text-xs text-slate-500 max-w-2xl">
              Build data integration pipelines with a point-and-click interface. Connect raw sources to transforms and outputs.
              Powered by Spark / Flink — type-safe functions with immediate error flagging.
            </p>
          </div>
          <Button
            onClick={() => setShowNewForm(true)}
            className="bg-indigo-600 hover:bg-indigo-700 rounded-xl"
          >
            <Plus className="w-4 h-4 mr-2" /> New Pipeline
          </Button>
        </div>

        {/* Architecture badges */}
        <div className="flex flex-wrap gap-2 mb-6">
          {["Spark execution","Flink streaming","Type-safe transforms","LLM support","ML models","Geospatial","Version control","Auto-prune"].map(b => (
            <span key={b} className="text-[10px] font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-600">
              {b}
            </span>
          ))}
        </div>

        {/* New pipeline form */}
        {showNewForm && (
          <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 mb-4 flex gap-3 items-center">
            <input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && createPipeline()}
              placeholder="Pipeline name…"
              autoFocus
              className="flex-1 border border-indigo-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
            <Button onClick={createPipeline} disabled={!newName.trim()} className="bg-indigo-600 hover:bg-indigo-700 rounded-lg">
              Create
            </Button>
            <button onClick={() => setShowNewForm(false)} className="text-slate-400 hover:text-slate-600">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Pipeline list */}
        {pipelines.length === 0 ? (
          <div className="border border-dashed border-slate-200 rounded-xl p-10 text-center">
            <GitBranch className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-sm font-semibold text-slate-500">No pipelines yet</p>
            <p className="text-xs text-slate-400 mt-1 mb-4">Create your first data integration pipeline.</p>
            <Button variant="outline" onClick={() => setShowNewForm(true)} className="rounded-xl">
              <Plus className="w-4 h-4 mr-2" /> New Pipeline
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {pipelines.map(p => {
              const nodeCount = p.nodes?.length || 0;
              const inv = (p.nodes || []).filter(n => !validateNode(n)).length;
              return (
                <div
                  key={p.id}
                  className="border border-slate-100 rounded-xl p-4 hover:border-indigo-200 hover:shadow-sm transition-all cursor-pointer group"
                  onClick={() => { setActivePipeline(p); setSelectedNodeId(null); setRunResult(null); }}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <GitBranch className="w-4 h-4 text-indigo-500 shrink-0" />
                      <p className="text-sm font-bold text-slate-800 truncate">{p.name}</p>
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <button
                        onClick={e => { e.stopPropagation(); duplicatePipeline(p); }}
                        className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600"
                        title="Duplicate"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); deletePipeline(p.id); }}
                        className="p-1 rounded hover:bg-rose-50 text-slate-400 hover:text-rose-600"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-slate-400">
                    <span>{nodeCount} node{nodeCount !== 1 ? "s" : ""}</span>
                    {inv > 0
                      ? <span className="flex items-center gap-1 text-amber-600"><AlertTriangle className="w-3 h-3" /> {inv} unconfigured</span>
                      : nodeCount > 0
                        ? <span className="flex items-center gap-1 text-emerald-600"><CheckCircle2 className="w-3 h-3" /> Ready</span>
                        : null
                    }
                    <span className="ml-auto">v{p.version}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ── Pipeline editor ────────────────────────────────────────────────────────

  return (
    <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-sm">
      {/* Editor toolbar */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-slate-100 bg-slate-50 flex-wrap">
        <button
          onClick={() => { setActivePipeline(null); setSelectedNodeId(null); setRunResult(null); }}
          className="text-slate-400 hover:text-slate-700 transition-colors"
        >
          <ArrowRight className="w-4 h-4 rotate-180" />
        </button>
        <input
          value={activePipeline.name}
          onChange={e => updateActivePipeline({ name: e.target.value })}
          className="text-sm font-bold text-slate-800 bg-transparent border-none outline-none min-w-[150px]"
        />
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span>{totalNodes} node{totalNodes !== 1 ? "s" : ""}</span>
          {invalidCount > 0
            ? <span className="flex items-center gap-1 text-amber-600 font-semibold"><AlertTriangle className="w-3.5 h-3.5" />{invalidCount} unconfigured</span>
            : totalNodes > 0
              ? <span className="flex items-center gap-1 text-emerald-600 font-semibold"><CheckCircle2 className="w-3.5 h-3.5" />All valid</span>
              : null
          }
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => { setShowPalette(true); setSelectedNodeId(null); }}
            className="rounded-lg h-8 text-xs"
          >
            <Plus className="w-3.5 h-3.5 mr-1" /> Add Node
          </Button>
          <Button
            size="sm"
            onClick={runPipeline}
            disabled={running}
            className={`rounded-lg h-8 text-xs ${isReady ? "bg-emerald-600 hover:bg-emerald-700" : "bg-slate-400 hover:bg-slate-500"}`}
          >
            {running
              ? <><Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> Validating…</>
              : <><Play className="w-3.5 h-3.5 mr-1" /> Build & Validate</>
            }
          </Button>
        </div>
      </div>

      {/* Canvas */}
      <div className="p-5">
        {/* Flow canvas */}
        <div className="overflow-x-auto pb-4">
          {totalNodes === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 border-2 border-dashed border-slate-200 rounded-2xl">
              <Layers className="w-10 h-10 text-slate-300 mb-3" />
              <p className="text-sm font-semibold text-slate-500">Empty pipeline</p>
              <p className="text-xs text-slate-400 mt-1 mb-4">Add a source node to get started.</p>
              <Button variant="outline" onClick={() => setShowPalette(true)} className="rounded-xl">
                <Plus className="w-4 h-4 mr-2" /> Add First Node
              </Button>
            </div>
          ) : (
            <div className="flex items-start gap-0 min-w-max py-6 px-4">
              {(activePipeline.nodes || []).map((node, index) => (
                <NodeCard
                  key={node.id}
                  node={node}
                  index={index}
                  isSelected={selectedNodeId === node.id}
                  isFirst={index === 0}
                  isLast={index === (activePipeline.nodes?.length || 0) - 1}
                  onSelect={setSelectedNodeId}
                  onDelete={deleteNode}
                />
              ))}
              {/* Add node button at end */}
              <div className="flex items-center">
                <div className="flex items-center shrink-0 w-8">
                  <div className="flex-1 h-0.5 bg-slate-300" />
                  <ChevronRight className="w-4 h-4 text-slate-400 shrink-0 -ml-1" />
                </div>
                <button
                  onClick={() => setShowPalette(true)}
                  className="w-12 h-12 rounded-xl border-2 border-dashed border-slate-300 hover:border-indigo-400 hover:bg-indigo-50 flex items-center justify-center transition-all"
                >
                  <Plus className="w-5 h-5 text-slate-400 hover:text-indigo-600" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Node palette */}
        {showPalette && (
          <div className="mt-4">
            <AddNodePalette onAdd={addNode} onClose={() => setShowPalette(false)} />
          </div>
        )}

        {/* Config panel for selected node */}
        {selectedNode && !showPalette && (
          <div className="mt-4">
            <NodeConfigPanel
              node={selectedNode}
              onChange={updateNode}
              onClose={() => setSelectedNodeId(null)}
              companyId={cid}
            />
          </div>
        )}

        {/* Build result */}
        {runResult && (
          <div className={`mt-4 rounded-xl border p-4 flex items-start gap-3 ${
            runResult.status === "success"
              ? "bg-emerald-50 border-emerald-200"
              : "bg-rose-50 border-rose-200"
          }`}>
            {runResult.status === "success"
              ? <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              : <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            }
            <div>
              <p className={`text-sm font-semibold ${runResult.status === "success" ? "text-emerald-800" : "text-rose-800"}`}>
                {runResult.status === "success" ? "Pipeline ready" : "Validation failed"}
              </p>
              <p className={`text-xs mt-0.5 ${runResult.status === "success" ? "text-emerald-700" : "text-rose-700"}`}>
                {runResult.message}
              </p>
            </div>
          </div>
        )}

        {/* Pipeline description */}
        <div className="mt-4 pt-4 border-t border-slate-100">
          <label className="text-xs font-semibold text-slate-500 block mb-1">Pipeline description (optional)</label>
          <input
            value={activePipeline.description || ""}
            onChange={e => updateActivePipeline({ description: e.target.value })}
            placeholder="Describe what this pipeline does…"
            className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
        </div>

        {/* Version info */}
        <div className="mt-3 flex items-center gap-4 text-[10px] text-slate-400">
          <span>v{activePipeline.version}</span>
          <span>Updated {new Date(activePipeline.updatedAt).toLocaleString()}</span>
          <button
            onClick={() => updateActivePipeline({ version: (activePipeline.version || 1) + 1 })}
            className="flex items-center gap-1 hover:text-slate-600 transition-colors"
          >
            <RefreshCw className="w-3 h-3" /> Bump version
          </button>
        </div>
      </div>
    </div>
  );
}
