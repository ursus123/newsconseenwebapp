import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import {
  Layers, Plus, Trash2, Eye, Save, Users, Building2, Package,
  CheckSquare, Receipt, Link2, MapPin, Search, X, Play,
  Settings2, BookOpen, ChevronRight, SlidersHorizontal,
  Database, Zap, Activity, ArrowRight,
} from "lucide-react";

const RAILWAY_URL = "https://newsconseenwebapp-production.up.railway.app";

// ── Pipeline table registry (analytics tables from ETL) ─────────────────────

const PIPELINE_TABLES = [
  {
    key: "people_summary",
    label: "People Summary",
    endpoint: "people-summary",
    icon: Users,
    color: "text-blue-600", bg: "bg-blue-50", border: "border-blue-200",
    description: "Staff, clients, contacts — headcount and engagement metrics",
  },
  {
    key: "enterprise_summary",
    label: "Enterprise Summary",
    endpoint: "enterprise-summary",
    icon: Building2,
    color: "text-amber-600", bg: "bg-amber-50", border: "border-amber-200",
    description: "Organisation profiles, types, and operating status",
  },
  {
    key: "product_summary",
    label: "Product Summary",
    endpoint: "product-summary",
    icon: Package,
    color: "text-rose-600", bg: "bg-rose-50", border: "border-rose-200",
    description: "Inventory, assets, stock levels, and pricing",
  },
  {
    key: "transaction_summary",
    label: "Transaction Summary",
    endpoint: "transaction-summary",
    icon: Receipt,
    color: "text-emerald-600", bg: "bg-emerald-50", border: "border-emerald-200",
    description: "Revenue, expenses, and financial records",
  },
  {
    key: "task_summary",
    label: "Task Summary",
    endpoint: "task-summary",
    icon: CheckSquare,
    color: "text-violet-600", bg: "bg-violet-50", border: "border-violet-200",
    description: "Operational tasks, completion rates, and outcomes",
  },
  {
    key: "relationship_summary",
    label: "Relationship Summary",
    endpoint: "relationship-summary",
    icon: Link2,
    color: "text-indigo-600", bg: "bg-indigo-50", border: "border-indigo-200",
    description: "Cross-entity links — the join backbone for dashboards",
  },
  {
    key: "address_summary",
    label: "Address Summary",
    endpoint: "address-summary",
    icon: MapPin,
    color: "text-teal-600", bg: "bg-teal-50", border: "border-teal-200",
    description: "Location records with geocoordinates",
  },
  {
    key: "service_summary",
    label: "Service Summary",
    endpoint: "service-summary",
    icon: Activity,
    color: "text-orange-600", bg: "bg-orange-50", border: "border-orange-200",
    description: "Service catalog, rates, and delivery records",
  },
];

// ── Object type registry ────────────────────────────────────────────────────

const OBJECT_TYPES = [
  {
    key: "Person", label: "People", icon: Users,
    color: "text-blue-600", bg: "bg-blue-50", border: "border-blue-200",
    entity: "Person",
    fields: [
      { key: "full_name",           label: "Full Name" },
      { key: "email",               label: "Email" },
      { key: "phone",               label: "Phone" },
      { key: "person_type",         label: "Type" },
      { key: "person_subtype",      label: "Subtype" },
      { key: "status",              label: "Status" },
      { key: "availability_status", label: "Availability" },
      { key: "engagement_model",    label: "Engagement" },
      { key: "company_id",          label: "Enterprise" },
    ],
  },
  {
    key: "Enterprise", label: "Enterprises", icon: Building2,
    color: "text-amber-600", bg: "bg-amber-50", border: "border-amber-200",
    entity: "Enterprise",
    fields: [
      { key: "enterprise_name",    label: "Name" },
      { key: "enterprise_type",    label: "Type" },
      { key: "enterprise_tier",    label: "Tier" },
      { key: "operating_status",   label: "Operating Status" },
      { key: "status",             label: "Status" },
      { key: "email",              label: "Email" },
      { key: "phone",              label: "Phone" },
      { key: "website",            label: "Website" },
    ],
  },
  {
    key: "Product", label: "Products", icon: Package,
    color: "text-rose-600", bg: "bg-rose-50", border: "border-rose-200",
    entity: "Product",
    fields: [
      { key: "name",             label: "Name" },
      { key: "item_type",        label: "Type" },
      { key: "item_subtype",     label: "Subtype" },
      { key: "unit_of_measure",  label: "Unit" },
      { key: "stock_quantity",   label: "Stock" },
      { key: "unit_price",       label: "Unit Price" },
      { key: "cost_price",       label: "Cost Price" },
      { key: "status",           label: "Status" },
    ],
  },
  {
    key: "Task", label: "Tasks", icon: CheckSquare,
    color: "text-violet-600", bg: "bg-violet-50", border: "border-violet-200",
    entity: "Task",
    fields: [
      { key: "title",       label: "Title" },
      { key: "task_type",   label: "Type" },
      { key: "status",      label: "Status" },
      { key: "due_date",    label: "Due Date" },
      { key: "assigned_to", label: "Assigned To" },
      { key: "priority",    label: "Priority" },
    ],
  },
  {
    key: "Transaction", label: "Transactions", icon: Receipt,
    color: "text-emerald-600", bg: "bg-emerald-50", border: "border-emerald-200",
    entity: "Transaction",
    fields: [
      { key: "description",       label: "Description" },
      { key: "transaction_type",  label: "Type" },
      { key: "amount",            label: "Amount" },
      { key: "status",            label: "Status" },
      { key: "currency",          label: "Currency" },
      { key: "transaction_date",  label: "Date" },
      { key: "due_date",          label: "Due Date" },
    ],
  },
  {
    key: "Relationship", label: "Relationships", icon: Link2,
    color: "text-indigo-600", bg: "bg-indigo-50", border: "border-indigo-200",
    entity: "Relationship",
    fields: [
      { key: "relationship_type", label: "Type" },
      { key: "source_type",       label: "Source Type" },
      { key: "target_type",       label: "Target Type" },
      { key: "status",            label: "Status" },
      { key: "start_date",        label: "Start Date" },
      { key: "end_date",          label: "End Date" },
    ],
  },
  {
    key: "Address", label: "Addresses", icon: MapPin,
    color: "text-teal-600", bg: "bg-teal-50", border: "border-teal-200",
    entity: "Address",
    fields: [
      { key: "label",         label: "Label" },
      { key: "address_line_1", label: "Address" },
      { key: "city",          label: "City" },
      { key: "province",      label: "Province" },
      { key: "country",       label: "Country" },
      { key: "postal_code",   label: "Postal Code" },
    ],
  },
];

const OBJECT_TYPE_MAP = Object.fromEntries(OBJECT_TYPES.map(t => [t.key, t]));

const VIEWS_KEY = (cid) => `object_views_${cid}`;

function newView(objectType) {
  return {
    id: `view_${Date.now()}`,
    source: "ontology",
    name: `New ${objectType} View`,
    objectType,
    description: "",
    fields: OBJECT_TYPES.find(t => t.key === objectType)?.fields.slice(0, 4).map(f => f.key) || [],
    filterField: "",
    filterValue: "",
    sortField: "",
    sortDir: "asc",
    createdAt: new Date().toISOString(),
  };
}

function newPipelineView(tableKey) {
  const tableDef = PIPELINE_TABLES.find(t => t.key === tableKey);
  return {
    id: `view_${Date.now()}`,
    source: "pipeline",
    name: `${tableDef?.label || tableKey} View`,
    pipelineTable: tableKey,
    endpoint: tableDef?.endpoint || tableKey,
    description: tableDef?.description || "",
    fields: [],
    filterField: "",
    filterValue: "",
    sortField: "",
    sortDir: "asc",
    createdAt: new Date().toISOString(),
  };
}

// ── NewViewModal ─────────────────────────────────────────────────────────────

function NewViewModal({ onOntology, onPipeline, onClose }) {
  const [mode, setMode] = useState(null); // null | "ontology" | "pipeline"

  if (mode === "ontology") {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-sm font-bold text-slate-800">Choose Object Type</h2>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {OBJECT_TYPES.map(t => {
              const TIcon = t.icon;
              return (
                <button
                  key={t.key}
                  onClick={() => onOntology(t.key)}
                  className={`flex items-center gap-2.5 px-3 py-3 rounded-xl border text-sm font-medium transition-all hover:opacity-90 ${t.bg} ${t.color} ${t.border}`}
                >
                  <TIcon className="w-4 h-4" />
                  <span>{t.label}</span>
                  <ArrowRight className="w-3 h-3 ml-auto opacity-50" />
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  if (mode === "pipeline") {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-sm font-bold text-slate-800">Choose Pipeline Table</h2>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
          </div>
          <p className="text-xs text-slate-500 mb-5">Views from pipeline tables read directly from the analytics layer (with Base44 fallback).</p>
          <div className="grid grid-cols-1 gap-2">
            {PIPELINE_TABLES.map(t => {
              const TIcon = t.icon;
              return (
                <button
                  key={t.key}
                  onClick={() => onPipeline(t.key)}
                  className={`flex items-center gap-3 px-3 py-3 rounded-xl border text-left transition-all hover:opacity-90 ${t.bg} ${t.border}`}
                >
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center bg-white/60`}>
                    <TIcon className={`w-4 h-4 ${t.color}`} />
                  </div>
                  <div>
                    <p className={`text-xs font-bold ${t.color}`}>{t.label}</p>
                    <p className="text-[10px] text-slate-500">{t.description}</p>
                  </div>
                  <ArrowRight className={`w-3.5 h-3.5 ml-auto ${t.color} opacity-50`} />
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // Default — choose source type
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-sm font-bold text-slate-800">Create New View</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => setMode("ontology")}
            className="flex flex-col items-center gap-3 p-5 rounded-2xl border-2 border-slate-200 hover:border-slate-400 hover:bg-slate-50 transition-all text-center"
          >
            <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center">
              <Layers className="w-6 h-6 text-slate-600" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-800">Ontology Object</p>
              <p className="text-[10px] text-slate-500 mt-0.5">Person, Enterprise, Product, Task…</p>
            </div>
          </button>
          <button
            onClick={() => setMode("pipeline")}
            className="flex flex-col items-center gap-3 p-5 rounded-2xl border-2 border-emerald-200 hover:border-emerald-400 hover:bg-emerald-50 transition-all text-center"
          >
            <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center">
              <Database className="w-6 h-6 text-emerald-600" />
            </div>
            <div>
              <p className="text-sm font-bold text-emerald-800">Pipeline Table</p>
              <p className="text-[10px] text-emerald-600 mt-0.5">Analytics layer — ETL output</p>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}

// ── ViewEditor ──────────────────────────────────────────────────────────────

function ViewEditor({ view, onSave, onClose, currentUser }) {
  const [draft, setDraft] = useState({ ...view });
  const [results, setResults]   = useState(null);
  const [loading, setLoading]   = useState(false);

  const typeDef = OBJECT_TYPES.find(t => t.key === draft.objectType);

  function set(k, v) { setDraft(d => ({ ...d, [k]: v })); }

  function toggleField(fk) {
    setDraft(d => ({
      ...d,
      fields: d.fields.includes(fk)
        ? d.fields.filter(f => f !== fk)
        : [...d.fields, fk],
    }));
  }

  async function runPreview() {
    setLoading(true);
    setResults(null);
    try {
      let rows = [];

      if (draft.source === "pipeline") {
        // Three-tier fallback: analytics (python_layer) → Base44 live
        const cid = currentUser?.company_id;
        const params = cid ? `?company_id=${cid}` : "";
        try {
          const res = await fetch(`${RAILWAY_URL}/${draft.endpoint}${params}`);
          if (res.ok) {
            const json = await res.json();
            rows = Array.isArray(json) ? json : (json.records || json.data || []);
          }
        } catch (_) {}
        // Fallback: if no rows from python_layer, nothing to show without ETL
        if (rows.length === 0) {
          setResults([]);
          setLoading(false);
          return;
        }
        // Auto-populate fields from first row if not yet set
        if (draft.fields.length === 0 && rows.length > 0) {
          setDraft(d => ({ ...d, fields: Object.keys(rows[0]).slice(0, 8) }));
        }
      } else {
        if (!typeDef) { setResults([]); setLoading(false); return; }
        const filter = {};
        if (currentUser?.company_id && currentUser.role !== "super_admin") {
          filter.company_id = currentUser.company_id;
        }
        if (draft.filterField && draft.filterValue) {
          filter[draft.filterField] = draft.filterValue;
        }
        rows = await base44.entities[typeDef.entity].filter(filter);
      }

      let sorted = rows;
      if (draft.sortField) {
        sorted = [...rows].sort((a, b) => {
          const av = a[draft.sortField] ?? "";
          const bv = b[draft.sortField] ?? "";
          return draft.sortDir === "asc"
            ? String(av).localeCompare(String(bv))
            : String(bv).localeCompare(String(av));
        });
      }
      setResults(sorted.slice(0, 20));
    } catch (e) {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  const isPipeline = draft.source === "pipeline";
  const pipelineDef = isPipeline ? PIPELINE_TABLES.find(t => t.key === draft.pipelineTable) : null;
  const Icon = isPipeline ? (pipelineDef?.icon || Database) : (typeDef?.icon || Layers);
  const iconBg = isPipeline ? (pipelineDef?.bg || "bg-emerald-50") : (typeDef?.bg || "bg-slate-50");
  const iconColor = isPipeline ? (pipelineDef?.color || "text-emerald-600") : (typeDef?.color || "text-slate-600");
  const subtitle = isPipeline
    ? `Pipeline — ${pipelineDef?.label || draft.pipelineTable}`
    : `${typeDef?.label || ""} object view`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${iconBg}`}>
              <Icon className={`w-5 h-5 ${iconColor}`} />
            </div>
            <div>
              <input
                value={draft.name}
                onChange={e => set("name", e.target.value)}
                className="text-sm font-bold text-slate-800 bg-transparent border-none outline-none w-64"
                placeholder="View name…"
              />
              <p className="text-xs text-slate-400">{subtitle}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isPipeline && (
              <span className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                <Database className="w-2.5 h-2.5" /> Pipeline
              </span>
            )}
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Left panel — settings */}
          <div className="w-72 border-r border-slate-100 px-5 py-4 overflow-y-auto space-y-5 shrink-0">

            {/* Source selector — Object Type OR Pipeline Table */}
            {!isPipeline ? (
              <div>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Object Type</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {OBJECT_TYPES.map(t => {
                    const TIcon = t.icon;
                    return (
                      <button
                        key={t.key}
                        onClick={() => set("objectType", t.key)}
                        className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                          draft.objectType === t.key
                            ? `${t.bg} ${t.color} ${t.border}`
                            : "border-slate-200 text-slate-600 hover:border-slate-300"
                        }`}
                      >
                        <TIcon className="w-3 h-3" />{t.key}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Pipeline Table</p>
                <div className="space-y-1">
                  {PIPELINE_TABLES.map(t => {
                    const TIcon = t.icon;
                    return (
                      <button
                        key={t.key}
                        onClick={() => set("pipelineTable", t.key) || set("endpoint", t.endpoint)}
                        className={`w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                          draft.pipelineTable === t.key
                            ? `${t.bg} ${t.color} ${t.border}`
                            : "border-slate-200 text-slate-600 hover:border-slate-300"
                        }`}
                      >
                        <TIcon className="w-3 h-3" />{t.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Fields — for pipeline views, auto-populated after first preview run */}
            {draft.fields.length > 0 && (
              <div>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Visible Fields</p>
                <div className="space-y-1">
                  {(isPipeline
                    ? draft.fields.map(k => ({ key: k, label: k }))
                    : (typeDef?.fields || [])
                  ).map(f => (
                    <label key={f.key} className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={draft.fields.includes(f.key)}
                        onChange={() => toggleField(f.key)}
                        className="rounded"
                      />
                      {f.label}
                    </label>
                  ))}
                </div>
              </div>
            )}

            {!isPipeline && draft.fields.length === 0 && typeDef && (
              <div>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Visible Fields</p>
                <div className="space-y-1">
                  {typeDef.fields.map(f => (
                    <label key={f.key} className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={draft.fields.includes(f.key)}
                        onChange={() => toggleField(f.key)}
                        className="rounded"
                      />
                      {f.label}
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Filter */}
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Filter</p>
              <select
                value={draft.filterField}
                onChange={e => set("filterField", e.target.value)}
                className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 mb-1.5"
              >
                <option value="">No filter</option>
                {(isPipeline
                  ? draft.fields.map(k => ({ key: k, label: k }))
                  : (typeDef?.fields || [])
                ).map(f => (
                  <option key={f.key} value={f.key}>{f.label}</option>
                ))}
              </select>
              {draft.filterField && (
                <input
                  value={draft.filterValue}
                  onChange={e => set("filterValue", e.target.value)}
                  placeholder="Filter value…"
                  className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5"
                />
              )}
            </div>

            {/* Sort */}
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Sort</p>
              <select
                value={draft.sortField}
                onChange={e => set("sortField", e.target.value)}
                className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 mb-1.5"
              >
                <option value="">No sort</option>
                {(isPipeline
                  ? draft.fields.map(k => ({ key: k, label: k }))
                  : (typeDef?.fields || [])
                ).map(f => (
                  <option key={f.key} value={f.key}>{f.label}</option>
                ))}
              </select>
              {draft.sortField && (
                <div className="flex gap-2">
                  {["asc", "desc"].map(d => (
                    <button
                      key={d}
                      onClick={() => set("sortDir", d)}
                      className={`flex-1 text-xs py-1 rounded-lg border font-medium ${
                        draft.sortDir === d
                          ? "bg-slate-800 text-white border-slate-800"
                          : "border-slate-200 text-slate-600"
                      }`}
                    >
                      {d === "asc" ? "A → Z" : "Z → A"}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Description */}
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Description</p>
              <textarea
                value={draft.description}
                onChange={e => set("description", e.target.value)}
                placeholder="Describe what this view shows…"
                rows={2}
                className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 resize-none"
              />
            </div>
          </div>

          {/* Right panel — preview */}
          <div className="flex-1 px-6 py-4 overflow-y-auto flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-slate-600 uppercase tracking-wide">Live Preview</p>
              <button
                onClick={runPreview}
                disabled={loading}
                className="flex items-center gap-1.5 bg-slate-800 text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-slate-700 disabled:opacity-50"
              >
                {loading
                  ? <><span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin inline-block" /> Loading…</>
                  : <><Play className="w-3 h-3" /> Run Preview</>}
              </button>
            </div>

            {results === null && (
              <div className="flex flex-col items-center justify-center flex-1 text-slate-400 gap-2">
                <Eye className="w-8 h-8 opacity-30" />
                <p className="text-sm">Click Run Preview to see matching objects</p>
              </div>
            )}

            {results !== null && results.length === 0 && (
              <div className="flex flex-col items-center justify-center flex-1 text-slate-400 gap-2">
                <Search className="w-8 h-8 opacity-30" />
                <p className="text-sm">No objects match this view</p>
              </div>
            )}

            {results !== null && results.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-100">
                      {draft.fields.map(fk => {
                        const fieldDef = typeDef?.fields.find(f => f.key === fk);
                        return (
                          <th key={fk} className="text-left text-[10px] font-bold text-slate-500 uppercase tracking-wide pb-2 pr-4">
                            {fieldDef?.label || fk}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((row, i) => (
                      <tr key={row.id || i} className="border-b border-slate-50 hover:bg-slate-50">
                        {draft.fields.map(fk => (
                          <td key={fk} className="py-2 pr-4 text-slate-700 max-w-[160px] truncate">
                            {row[fk] != null ? String(row[fk]) : <span className="text-slate-300">—</span>}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="text-[10px] text-slate-400 mt-2">Showing up to 20 records</p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between">
          <button onClick={onClose} className="text-xs text-slate-400 hover:text-slate-600">
            Cancel
          </button>
          <button
            onClick={() => onSave(draft)}
            className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-4 py-2 rounded-lg"
          >
            <Save className="w-3.5 h-3.5" /> Save View
          </button>
        </div>
      </div>
    </div>
  );
}

// ── ViewCard ────────────────────────────────────────────────────────────────

function ViewCard({ view, onEdit, onDelete, onRun }) {
  const isPipeline = view.source === "pipeline";
  const pipelineDef = isPipeline ? PIPELINE_TABLES.find(t => t.key === view.pipelineTable) : null;
  const typeDef = isPipeline ? null : OBJECT_TYPES.find(t => t.key === view.objectType);
  const Icon = isPipeline ? (pipelineDef?.icon || Database) : (typeDef?.icon || Layers);
  const bg = isPipeline ? (pipelineDef?.bg || "bg-emerald-50") : (typeDef?.bg || "bg-slate-50");
  const color = isPipeline ? (pipelineDef?.color || "text-emerald-600") : (typeDef?.color || "text-slate-600");
  const border = isPipeline ? (pipelineDef?.border || "border-emerald-200") : (typeDef?.border || "border-slate-200");
  const label = isPipeline ? (pipelineDef?.label || view.pipelineTable) : (view.objectType || "");

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${bg}`}>
            <Icon className={`w-5 h-5 ${color}`} />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-800 leading-tight">{view.name}</p>
            <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${bg} ${color} border ${border}`}>
              {isPipeline && <Database className="w-2.5 h-2.5" />}
              {!isPipeline && <Icon className="w-2.5 h-2.5" />}
              {label}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onEdit(view)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
            title="Edit view"
          >
            <Settings2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onDelete(view.id)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50"
            title="Delete view"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {view.description && (
        <p className="text-xs text-slate-500 mb-3 line-clamp-2">{view.description}</p>
      )}

      <div className="flex flex-wrap gap-1 mb-3">
        {view.fields.slice(0, 5).map(fk => {
          const fieldDef = typeDef?.fields.find(f => f.key === fk);
          return (
            <span key={fk} className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-full">
              {fieldDef?.label || fk}
            </span>
          );
        })}
        {view.fields.length > 5 && (
          <span className="text-[10px] bg-slate-100 text-slate-400 px-1.5 py-0.5 rounded-full">
            +{view.fields.length - 5} more
          </span>
        )}
      </div>

      {view.filterField && (
        <div className="flex items-center gap-1 text-[10px] text-slate-500 mb-3">
          <SlidersHorizontal className="w-3 h-3" />
          Filter: <strong>{view.filterField}</strong> = <strong>{view.filterValue}</strong>
        </div>
      )}

      <button
        onClick={() => onRun(view)}
        className="w-full flex items-center justify-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold py-2 rounded-xl transition-colors"
      >
        <Play className="w-3 h-3" /> Open View
      </button>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function ObjectViews() {
  const { data: currentUser = null } = useQuery({
    queryKey: ["currentUser"],
    queryFn: () => base44.auth.me(),
    staleTime: 0,
    refetchOnMount: "always",
  });
  const [views, setViews]             = useState([]);
  const [editingView, setEditingView] = useState(null);
  const [showNewModal, setShowNewModal] = useState(false);
  const [activeType, setActiveType]   = useState("All");
  const [search, setSearch]           = useState("");

  React.useEffect(() => {
    if (!currentUser) return;
    const saved = JSON.parse(localStorage.getItem(VIEWS_KEY(currentUser?.company_id || "global")) || "[]");
    setViews(saved);
  }, [currentUser?.company_id]);

  function persist(updated) {
    setViews(updated);
    const cid = currentUser?.company_id || "global";
    localStorage.setItem(VIEWS_KEY(cid), JSON.stringify(updated));
  }

  function handleSave(draft) {
    const exists = views.find(v => v.id === draft.id);
    const updated = exists
      ? views.map(v => v.id === draft.id ? draft : v)
      : [...views, draft];
    persist(updated);
    setEditingView(null);
  }

  function handleDelete(id) {
    persist(views.filter(v => v.id !== id));
  }

  function handleNew(objectType = "Person") {
    setShowNewModal(false);
    setEditingView(newView(objectType));
  }

  function handleNewPipeline(tableKey) {
    setShowNewModal(false);
    setEditingView(newPipelineView(tableKey));
  }

  function handleRun(view) {
    setEditingView(view);
  }

  const filteredViews = useMemo(() => {
    return views.filter(v => {
      const matchType = activeType === "All" || v.objectType === activeType;
      const matchSearch = !search || v.name.toLowerCase().includes(search.toLowerCase()) || v.objectType.toLowerCase().includes(search.toLowerCase());
      return matchType && matchSearch;
    });
  }, [views, activeType, search]);

  const countsByType = useMemo(() => {
    const counts = {};
    views.forEach(v => { counts[v.objectType] = (counts[v.objectType] || 0) + 1; });
    return counts;
  }, [views]);

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Object Views</h1>
          <p className="text-sm text-slate-500 mt-0.5">Reusable analytical views over ontology objects — define once, use everywhere</p>
        </div>
        <button
          onClick={() => setShowNewModal(true)}
          className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors"
        >
          <Plus className="w-4 h-4" /> New View
        </button>
      </div>

      {/* New View modal */}
      {showNewModal && (
        <NewViewModal
          onOntology={(objectType) => { setShowNewModal(false); handleNew(objectType); }}
          onPipeline={handleNewPipeline}
          onClose={() => setShowNewModal(false)}
        />
      )}

      {/* Object type tabs */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-6 scrollbar-hide">
        <button
          onClick={() => setActiveType("All")}
          className={`flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
            activeType === "All"
              ? "bg-slate-800 text-white"
              : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
          }`}
        >
          All ({views.length})
        </button>
        {OBJECT_TYPES.map(t => {
          const TIcon = t.icon;
          const count = countsByType[t.key] || 0;
          if (count === 0 && activeType !== t.key) return null;
          return (
            <button
              key={t.key}
              onClick={() => setActiveType(t.key)}
              className={`flex-shrink-0 flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                activeType === t.key
                  ? `${t.bg} ${t.color} border ${t.border}`
                  : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              <TIcon className="w-3.5 h-3.5" />{t.key} {count > 0 && `(${count})`}
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search views…"
          className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
        />
      </div>

      {/* Empty state — no views yet */}
      {views.length === 0 && (
        <div className="bg-gradient-to-br from-slate-50 to-slate-100 border border-slate-200 rounded-2xl p-12 flex flex-col items-center justify-center text-center">
          <div className="w-16 h-16 bg-white rounded-2xl border border-slate-200 flex items-center justify-center mb-4 shadow-sm">
            <Layers className="w-8 h-8 text-slate-400" />
          </div>
          <h3 className="text-lg font-bold text-slate-700 mb-2">No views yet</h3>
          <p className="text-sm text-slate-500 mb-6 max-w-sm">
            Create reusable analytical views over your ontology objects.
            Each view defines which fields, filters, and sort order to apply.
          </p>
          <div className="flex flex-wrap gap-2 justify-center mb-6">
            {OBJECT_TYPES.map(t => {
              const TIcon = t.icon;
              return (
                <button
                  key={t.key}
                  onClick={() => handleNew(t.key)}
                  className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border ${t.bg} ${t.color} ${t.border} hover:opacity-80`}
                >
                  <TIcon className="w-3 h-3" /> {t.key} view
                </button>
              );
            })}
            <button
              onClick={() => setShowNewModal(true)}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border bg-emerald-50 text-emerald-700 border-emerald-200 hover:opacity-80"
            >
              <Database className="w-3 h-3" /> Pipeline view
            </button>
          </div>
        </div>
      )}

      {/* View grid */}
      {filteredViews.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredViews.map(view => (
            <ViewCard
              key={view.id}
              view={view}
              onEdit={setEditingView}
              onDelete={handleDelete}
              onRun={handleRun}
            />
          ))}
          {/* New view shortcut */}
          <button
            onClick={() => setShowNewModal(true)}
            className="border-2 border-dashed border-slate-200 rounded-2xl p-4 flex flex-col items-center justify-center gap-2 text-slate-400 hover:border-slate-300 hover:text-slate-500 transition-colors min-h-[180px]"
          >
            <Plus className="w-8 h-8" />
            <span className="text-sm font-medium">New view</span>
          </button>
        </div>
      )}

      {/* No search results */}
      {views.length > 0 && filteredViews.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
          <Search className="w-10 h-10 mb-3 opacity-30" />
          <p className="font-medium text-slate-600">No views match "{search}"</p>
        </div>
      )}

      {/* View editor modal */}
      {editingView && (
        <ViewEditor
          view={editingView}
          onSave={handleSave}
          onClose={() => setEditingView(null)}
          currentUser={currentUser}
        />
      )}
    </div>
  );
}
