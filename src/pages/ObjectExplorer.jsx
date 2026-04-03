/**
 * Object Explorer — cross-entity semantic search across the entire ontology.
 * Searches all 7 entity types simultaneously and returns unified results.
 * Clicking any result opens an inline Object View.
 */
import React, { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { createPageUrl } from "@/utils";
import { useNavigate } from "react-router-dom";
import {
  Search, Users, Building2, Package, CheckSquare, Receipt,
  Link2, MapPin, Wrench, X, ExternalLink, Loader2,
  ChevronRight, Tag, Calendar, DollarSign, Activity,
  Globe, Hash, Phone, Mail, Layers,
} from "lucide-react";
import { useEntityListFn } from "@/components/shared/useDataQuery";

// ── Ontology type registry ────────────────────────────────────────────────────
const OBJECT_TYPES = [
  {
    key: "Person",
    label: "People",
    icon: Users,
    color: "text-blue-600",
    bg: "bg-blue-50",
    border: "border-blue-200",
    badgeBg: "bg-blue-100",
    badgeText: "text-blue-700",
    entity: "Person",
    searchFields: ["full_name", "email", "phone", "person_type", "person_subtype", "status"],
    primaryField: "full_name",
    secondaryField: "person_type",
    routePage: "People",
    properties: ["person_type", "person_subtype", "status", "engagement_model", "email", "phone"],
  },
  {
    key: "Enterprise",
    label: "Enterprises",
    icon: Building2,
    color: "text-amber-600",
    bg: "bg-amber-50",
    border: "border-amber-200",
    badgeBg: "bg-amber-100",
    badgeText: "text-amber-700",
    entity: "Enterprise",
    searchFields: ["enterprise_name", "short_name", "email", "city", "country", "enterprise_type"],
    primaryField: "enterprise_name",
    secondaryField: "enterprise_type",
    routePage: "Enterprises",
    properties: ["enterprise_type", "enterprise_tier", "status", "operating_status", "city", "country"],
  },
  {
    key: "Product",
    label: "Products",
    icon: Package,
    color: "text-rose-600",
    bg: "bg-rose-50",
    border: "border-rose-200",
    badgeBg: "bg-rose-100",
    badgeText: "text-rose-700",
    entity: "Product",
    searchFields: ["name", "short_name", "item_type", "item_class", "sku", "description"],
    primaryField: "name",
    secondaryField: "item_type",
    routePage: "Products",
    properties: ["item_type", "item_class", "unit_of_measure", "status", "stock_quantity", "list_price"],
  },
  {
    key: "Task",
    label: "Tasks",
    icon: CheckSquare,
    color: "text-violet-600",
    bg: "bg-violet-50",
    border: "border-violet-200",
    badgeBg: "bg-violet-100",
    badgeText: "text-violet-700",
    entity: "Task",
    searchFields: ["title", "enterprise", "assigned_to_name", "task_type", "status"],
    primaryField: "title",
    secondaryField: "status",
    routePage: "Tasks",
    properties: ["task_type", "status", "priority", "assigned_to_name", "due_date", "enterprise"],
  },
  {
    key: "Transaction",
    label: "Transactions",
    icon: Receipt,
    color: "text-emerald-600",
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    badgeBg: "bg-emerald-100",
    badgeText: "text-emerald-700",
    entity: "Transaction",
    searchFields: ["description", "enterprise", "invoice_number", "transaction_type", "counterparty"],
    primaryField: "description",
    secondaryField: "transaction_type",
    routePage: "Transactions",
    properties: ["transaction_type", "status", "payment_status", "amount", "currency", "enterprise"],
  },
  {
    key: "Relationship",
    label: "Relationships",
    icon: Link2,
    color: "text-indigo-600",
    bg: "bg-indigo-50",
    border: "border-indigo-200",
    badgeBg: "bg-indigo-100",
    badgeText: "text-indigo-700",
    entity: "Relationship",
    searchFields: ["person_name", "enterprise_name", "item_name", "role", "relationship_type"],
    primaryField: "relationship_type",
    secondaryField: "person_name",
    routePage: "Relationships",
    properties: ["relationship_type", "status", "role", "start_date", "person_name", "enterprise_name"],
  },
  {
    key: "Address",
    label: "Addresses",
    icon: MapPin,
    color: "text-teal-600",
    bg: "bg-teal-50",
    border: "border-teal-200",
    badgeBg: "bg-teal-100",
    badgeText: "text-teal-700",
    entity: "Address",
    searchFields: ["label", "address_line1", "city", "state_region", "country", "postal_code"],
    primaryField: "label",
    secondaryField: "city",
    routePage: "Addresses",
    properties: ["label", "address_line1", "city", "state_region", "country", "postal_code"],
  },
];

const TYPE_MAP = Object.fromEntries(OBJECT_TYPES.map(t => [t.key, t]));

// ── Fuzzy match ───────────────────────────────────────────────────────────────
function matchesQuery(obj, fields, query) {
  const q = query.toLowerCase();
  return fields.some(f => {
    const v = obj[f];
    return v && String(v).toLowerCase().includes(q);
  });
}

// ── ObjectTypeBadge ───────────────────────────────────────────────────────────
function ObjectTypeBadge({ typeKey }) {
  const t = TYPE_MAP[typeKey];
  if (!t) return null;
  const Icon = t.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${t.badgeBg} ${t.badgeText}`}>
      <Icon className="w-2.5 h-2.5" />
      {typeKey}
    </span>
  );
}

// ── ResultCard ────────────────────────────────────────────────────────────────
function ResultCard({ result, typeDef, onSelect, isSelected }) {
  const Icon = typeDef.icon;
  const primary = result[typeDef.primaryField] || result.id?.slice(0, 8) || "—";
  const secondary = result[typeDef.secondaryField] || "";

  return (
    <button
      onClick={() => onSelect(result, typeDef)}
      className={`w-full text-left flex items-center gap-3 p-3 rounded-xl border transition-all hover:shadow-sm
        ${isSelected
          ? `${typeDef.border} ring-2 ring-offset-1 ring-blue-300 ${typeDef.bg}`
          : "border-slate-100 hover:border-slate-200 bg-white"
        }
      `}
    >
      <div className={`w-9 h-9 rounded-xl ${typeDef.bg} flex items-center justify-center shrink-0`}>
        <Icon className={`w-4 h-4 ${typeDef.color}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-800 truncate">{primary}</p>
        {secondary && <p className={`text-xs ${typeDef.color} truncate font-medium`}>{secondary}</p>}
      </div>
      <ChevronRight className="w-3.5 h-3.5 text-slate-300 shrink-0" />
    </button>
  );
}

// ── ObjectViewPanel ───────────────────────────────────────────────────────────
function ObjectViewPanel({ object, typeDef, onClose, navigate }) {
  if (!object || !typeDef) return null;
  const Icon = typeDef.icon;
  const primary = object[typeDef.primaryField] || "—";

  const propGroups = typeDef.properties.map(key => ({
    key,
    label: key.replace(/_/g, " "),
    value: object[key],
  })).filter(p => p.value !== undefined && p.value !== null && p.value !== "");

  const allProps = Object.entries(object)
    .filter(([k, v]) => !["id", "created_date", "updated_date", "company_id", "__typename"].includes(k) && v !== null && v !== undefined && v !== "")
    .slice(0, 24);

  return (
    <div className="flex flex-col h-full">
      {/* Panel header */}
      <div className={`flex items-center gap-3 p-4 border-b ${typeDef.border} ${typeDef.bg}`}>
        <div className={`w-10 h-10 rounded-xl bg-white border ${typeDef.border} flex items-center justify-center shrink-0`}>
          <Icon className={`w-5 h-5 ${typeDef.color}`} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-black text-slate-800 truncate">{primary}</p>
          <ObjectTypeBadge typeKey={typeDef.key} />
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => navigate(createPageUrl(typeDef.routePage))}
            className={`p-1.5 rounded-lg hover:${typeDef.bg} transition-colors`}
            title={`Open ${typeDef.label}`}
          >
            <ExternalLink className={`w-4 h-4 ${typeDef.color}`} />
          </button>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors text-slate-400 hover:text-slate-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Properties */}
      <div className="flex-1 overflow-y-auto p-4 space-y-1">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Properties</p>
        {allProps.map(([key, value]) => (
          <div key={key} className="flex items-start gap-2 py-1.5 border-b border-slate-50">
            <span className="text-[11px] font-semibold text-slate-400 w-36 shrink-0 pt-0.5 capitalize">
              {key.replace(/_/g, " ")}
            </span>
            <span className="text-[11px] text-slate-700 flex-1 break-words">
              {Array.isArray(value)
                ? value.map((v, i) => (
                    <span key={i} className="inline-block bg-slate-100 rounded px-1.5 py-0.5 mr-1 mb-1 text-[10px] font-medium">{String(v)}</span>
                  ))
                : typeof value === "boolean"
                  ? value ? "Yes" : "No"
                  : String(value)
              }
            </span>
          </div>
        ))}
      </div>

      {/* Footer: ID */}
      <div className="px-4 py-2 border-t border-slate-100 bg-slate-50">
        <p className="text-[10px] text-slate-400 font-mono truncate">id: {object.id}</p>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ObjectExplorer() {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [allObjects, setAllObjects] = useState({});     // { TypeKey: [...records] }
  const [loaded, setLoaded] = useState(false);
  const [selectedType, setSelectedType] = useState("all");
  const [selectedObject, setSelectedObject] = useState(null);
  const [selectedTypeDef, setSelectedTypeDef] = useState(null);
  const listFn = useEntityListFn(currentUser);

  useEffect(() => {
    base44.auth.me().then(setCurrentUser).catch(() => {});
  }, []);

  // Load all entities once user is ready
  useEffect(() => {
    if (!currentUser || loaded) return;
    const load = async () => {
      setLoading(true);
      const results = {};
      await Promise.allSettled(
        OBJECT_TYPES.map(async (t) => {
          try {
            const data = await listFn(base44.entities[t.entity]);
            results[t.key] = data || [];
          } catch {
            results[t.key] = [];
          }
        })
      );
      setAllObjects(results);
      setLoaded(true);
      setLoading(false);
    };
    load();
  }, [currentUser, loaded]);

  // Compute filtered results
  const filteredResults = React.useMemo(() => {
    if (!query.trim() || query.length < 2) return {};
    const out = {};
    const types = selectedType === "all" ? OBJECT_TYPES : OBJECT_TYPES.filter(t => t.key === selectedType);
    for (const t of types) {
      const records = allObjects[t.key] || [];
      const matched = records.filter(r => matchesQuery(r, t.searchFields, query));
      if (matched.length > 0) out[t.key] = matched.slice(0, 12);
    }
    return out;
  }, [query, allObjects, selectedType]);

  const totalResults = Object.values(filteredResults).reduce((s, arr) => s + arr.length, 0);
  const totalObjects = Object.values(allObjects).reduce((s, arr) => s + arr.length, 0);

  const handleSelect = (obj, typeDef) => {
    setSelectedObject(obj);
    setSelectedTypeDef(typeDef);
  };

  return (
    <div className="flex flex-col gap-0 min-h-full">

      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center">
            <Layers className="w-4 h-4 text-white" />
          </div>
          <h1 className="text-2xl font-black text-slate-800">Object Explorer</h1>
        </div>
        <p className="text-slate-500 text-sm ml-11">
          Search across all ontology objects — People, Enterprises, Products, Tasks, Transactions, Relationships, Addresses.
          {loaded && <span className="ml-2 text-slate-400">{totalObjects.toLocaleString()} objects indexed.</span>}
        </p>
      </div>

      {/* Search bar */}
      <div className="relative mb-4">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
        {loading && <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 animate-spin" />}
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search by name, email, city, type, invoice number..."
          autoFocus
          className="w-full pl-12 pr-12 py-3.5 rounded-2xl border border-slate-200 bg-white text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-300 shadow-sm text-base"
        />
        {query && (
          <button onClick={() => { setQuery(""); setSelectedObject(null); }} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Type filter tabs */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-4 scrollbar-hide">
        <button
          onClick={() => setSelectedType("all")}
          className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${selectedType === "all" ? "bg-slate-800 text-white" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"}`}
        >
          All Types
        </button>
        {OBJECT_TYPES.map(t => {
          const Icon = t.icon;
          const count = (allObjects[t.key] || []).length;
          return (
            <button
              key={t.key}
              onClick={() => setSelectedType(t.key)}
              className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${selectedType === t.key ? `${t.bg} ${t.color} border ${t.border}` : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"}`}
            >
              <Icon className="w-3 h-3" />
              {t.label}
              {count > 0 && <span className="text-[10px] opacity-70">({count})</span>}
            </button>
          );
        })}
      </div>

      {/* Results area */}
      <div className="flex flex-1 gap-4 min-h-0">

        {/* Results list */}
        <div className={`flex flex-col ${selectedObject ? "w-full lg:w-1/2" : "w-full"} gap-4`}>

          {/* Empty / loading states */}
          {!loaded && loading && (
            <div className="flex items-center justify-center py-16 text-slate-400 bg-white rounded-2xl border border-slate-100">
              <Loader2 className="w-6 h-6 animate-spin mr-3" />
              <span className="text-sm">Indexing all ontology objects…</span>
            </div>
          )}

          {loaded && !query && (
            <div className="bg-white border border-slate-100 rounded-2xl p-8 text-center">
              <Layers className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="text-sm font-semibold text-slate-500">Start typing to search the ontology</p>
              <p className="text-xs text-slate-400 mt-1">Search by name, email, city, type, role, status — any field</p>
              <div className="flex flex-wrap gap-2 justify-center mt-5">
                {OBJECT_TYPES.map(t => {
                  const Icon = t.icon;
                  const count = (allObjects[t.key] || []).length;
                  return (
                    <div key={t.key} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border ${t.border} ${t.bg}`}>
                      <Icon className={`w-3.5 h-3.5 ${t.color}`} />
                      <span className={`text-xs font-bold ${t.color}`}>{t.label}</span>
                      <span className="text-[10px] text-slate-400">{count}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {loaded && query.length >= 2 && totalResults === 0 && (
            <div className="bg-white border border-slate-100 rounded-2xl p-8 text-center">
              <Search className="w-8 h-8 text-slate-300 mx-auto mb-3" />
              <p className="text-sm font-semibold text-slate-500">No objects found for "{query}"</p>
              <p className="text-xs text-slate-400 mt-1">Try a different term or check a different object type</p>
            </div>
          )}

          {loaded && query.length >= 2 && totalResults > 0 && (
            <>
              <p className="text-xs text-slate-400 font-medium px-1">
                {totalResults} result{totalResults !== 1 ? "s" : ""} for <strong className="text-slate-600">"{query}"</strong>
              </p>
              {Object.entries(filteredResults).map(([typeKey, records]) => {
                const typeDef = TYPE_MAP[typeKey];
                if (!typeDef) return null;
                const Icon = typeDef.icon;
                return (
                  <div key={typeKey} className="bg-white border border-slate-100 rounded-2xl p-4">
                    <div className={`flex items-center gap-2 mb-3 pb-2 border-b ${typeDef.border}`}>
                      <Icon className={`w-4 h-4 ${typeDef.color}`} />
                      <span className={`text-xs font-bold ${typeDef.color}`}>{typeDef.label}</span>
                      <span className="text-[10px] text-slate-400 ml-auto">{records.length} match{records.length !== 1 ? "es" : ""}</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {records.map(r => (
                        <ResultCard
                          key={r.id}
                          result={r}
                          typeDef={typeDef}
                          onSelect={handleSelect}
                          isSelected={selectedObject?.id === r.id}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>

        {/* Object view panel */}
        {selectedObject && selectedTypeDef && (
          <div className="hidden lg:flex lg:w-1/2 bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-sm flex-col">
            <ObjectViewPanel
              object={selectedObject}
              typeDef={selectedTypeDef}
              onClose={() => { setSelectedObject(null); setSelectedTypeDef(null); }}
              navigate={navigate}
            />
          </div>
        )}
      </div>

      {/* Mobile object view */}
      {selectedObject && selectedTypeDef && (
        <div className="lg:hidden fixed inset-0 z-50 bg-white overflow-y-auto">
          <ObjectViewPanel
            object={selectedObject}
            typeDef={selectedTypeDef}
            onClose={() => { setSelectedObject(null); setSelectedTypeDef(null); }}
            navigate={navigate}
          />
        </div>
      )}
    </div>
  );
}
