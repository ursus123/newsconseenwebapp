import React, { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ncClient } from "@/api/ncClient";
import {
  Search, X, Users, Building2, ClipboardList, ArrowLeftRight,
  FileText, Calendar, Activity, MessageSquare, Map, Package,
  Wrench, MapPin, Link2, ChevronRight,
} from "lucide-react";
import { createPageUrl } from "@/utils";
import EntityQuickViewDrawer from "@/components/layout/EntityQuickViewDrawer";

const RAILWAY_URL = "https://newsconseenwebapp-production.up.railway.app";
const RAILWAY_API_KEY = import.meta.env.VITE_RAILWAY_API_KEY || "";

// ── Entity config ─────────────────────────────────────────────────────────────
// Used for the Base44 fallback path only.
// The python_layer endpoint handles everything else.
const ENTITY_CONFIG = [
  {
    key: "person", entity: "Person", page: "People", icon: Users, color: "text-violet-500",
    fetch: (s) => ncClient.entities.Person.filter(s, undefined, 100),
    match: (r, q) => [r.first_name, r.last_name, r.email].some(v => v?.toLowerCase().includes(q)),
    title: (r) => `${r.first_name || ""} ${r.last_name || ""}`.trim() || r.email,
    subtitle: (r) => r.email || r.person_type || "Person",
    fields: (r) => ({ type: r.person_type, status: r.status, email: r.email, phone: r.phone }),
  },
  {
    key: "enterprise", entity: "Enterprise", page: "Enterprises", icon: Building2, color: "text-blue-500",
    fetch: (s) => ncClient.entities.Enterprise.filter(s, undefined, 100),
    match: (r, q) => [r.enterprise_name, r.short_name, r.city].some(v => v?.toLowerCase().includes(q)),
    title: (r) => r.enterprise_name,
    subtitle: (r) => r.short_name || r.city || "Enterprise",
    fields: (r) => ({ type: r.enterprise_type, status: r.status, city: r.city, email: r.email }),
  },
  {
    key: "product", entity: "Product", page: "Products", icon: Package, color: "text-orange-500",
    fetch: (s) => ncClient.entities.Product.filter(s, undefined, 100),
    match: (r, q) => [r.name, r.sku, r.brand].some(v => v?.toLowerCase().includes(q)),
    title: (r) => r.name,
    subtitle: (r) => r.sku ? `SKU: ${r.sku}` : r.item_type || "Product",
    fields: (r) => ({ type: r.item_type, status: r.status, sku: r.sku, price: r.unit_price }),
  },
  {
    key: "service", entity: "Service", page: "Services", icon: Wrench, color: "text-teal-500",
    fetch: (s) => ncClient.entities.Service.filter(s, undefined, 100),
    match: (r, q) => [r.name, r.description].some(v => v?.toLowerCase().includes(q)),
    title: (r) => r.name,
    subtitle: (r) => r.service_type || "Service",
    fields: (r) => ({ type: r.service_type, status: r.status }),
  },
  {
    key: "address", entity: "Address", page: "Addresses", icon: MapPin, color: "text-rose-500",
    fetch: (s) => ncClient.entities.Address.filter(s, undefined, 100),
    match: (r, q) => [r.label, r.street, r.city].some(v => v?.toLowerCase().includes(q)),
    title: (r) => r.label || r.street || "Address",
    subtitle: (r) => [r.city, r.region, r.country].filter(Boolean).join(", ") || "Address",
    fields: (r) => ({ street: r.street, city: r.city, country: r.country }),
  },
  {
    key: "task", entity: "Task", page: "Tasks", icon: ClipboardList, color: "text-amber-500",
    fetch: (s) => ncClient.entities.Task.filter(s, undefined, 100),
    match: (r, q) => [r.title, r.task_type].some(v => v?.toLowerCase().includes(q)),
    title: (r) => r.title,
    subtitle: (r) => `${r.task_type?.replace(/_/g, " ") || "Task"} • ${r.status || ""}`,
    fields: (r) => ({ type: r.task_type, status: r.status, due: r.due_date, assigned: r.assigned_to }),
  },
  {
    key: "transaction", entity: "Transaction", page: "Transactions", icon: ArrowLeftRight, color: "text-green-500",
    fetch: (s) => ncClient.entities.Transaction.filter(s, undefined, 100),
    match: (r, q) => [r.description, r.invoice_number].some(v => v?.toLowerCase().includes(q)),
    title: (r) => r.description || r.invoice_number || "Transaction",
    subtitle: (r) => `${r.transaction_type?.replace(/_/g, " ") || ""} • ${r.currency || ""}`.trim().replace(/^•|•$/, "").trim(),
    fields: (r) => ({ type: r.transaction_type, amount: r.amount, currency: r.currency, status: r.status }),
  },
  {
    key: "document", entity: "Document", page: "Documents", icon: FileText, color: "text-indigo-500",
    fetch: (s) => ncClient.entities.Document.filter(s, undefined, 100),
    match: (r, q) => [r.title, r.document_type].some(v => v?.toLowerCase().includes(q)),
    title: (r) => r.title,
    subtitle: (r) => r.document_type || "Document",
    fields: (r) => ({ type: r.document_type, status: r.status }),
  },
  {
    key: "schedule", entity: "Schedule", page: "Schedules", icon: Calendar, color: "text-cyan-500",
    fetch: (s) => ncClient.entities.Schedule.filter(s, undefined, 100),
    match: (r, q) => [r.title, r.schedule_type].some(v => v?.toLowerCase().includes(q)),
    title: (r) => r.title,
    subtitle: (r) => `${r.schedule_type || "Schedule"} • ${r.frequency || ""}`.trim().replace(/•\s*$/, "").trim(),
    fields: (r) => ({ type: r.schedule_type, frequency: r.frequency, status: r.status }),
  },
  {
    key: "signal", entity: "Signal", page: "Signals", icon: Activity, color: "text-red-500",
    fetch: (s) => ncClient.entities.Signal.filter(s, undefined, 100),
    match: (r, q) => [r.name, r.signal_type, r.source].some(v => v?.toLowerCase().includes(q)),
    title: (r) => r.name,
    subtitle: (r) => r.signal_type || "Signal",
    fields: (r) => ({ type: r.signal_type, source: r.source, status: r.status }),
  },
  {
    key: "channel", entity: "Channel", page: "Channels", icon: MessageSquare, color: "text-pink-500",
    fetch: (s) => ncClient.entities.Channel.filter(s, undefined, 100),
    match: (r, q) => [r.name, r.channel_type].some(v => v?.toLowerCase().includes(q)),
    title: (r) => r.name,
    subtitle: (r) => r.channel_type || "Channel",
    fields: (r) => ({ type: r.channel_type, status: r.status }),
  },
  {
    key: "territory", entity: "Territory", page: "Territories", icon: Map, color: "text-lime-600",
    fetch: (s) => ncClient.entities.Territory.filter(s, undefined, 100),
    match: (r, q) => [r.name, r.territory_type, r.region].some(v => v?.toLowerCase().includes(q)),
    title: (r) => r.name,
    subtitle: (r) => [r.territory_type, r.region, r.country].filter(Boolean).join(" • ") || "Territory",
    fields: (r) => ({ type: r.territory_type, region: r.region, country: r.country }),
  },
  {
    key: "relationship", entity: "Relationship", page: "Relationships", icon: Link2, color: "text-slate-500",
    fetch: (s) => ncClient.entities.Relationship.filter(s, undefined, 100),
    match: (r, q) => [r.from_name, r.to_name, r.relationship_type].some(v => v?.toLowerCase().includes(q)),
    title: (r) => r.from_name && r.to_name ? `${r.from_name} → ${r.to_name}` : r.relationship_type || "Relationship",
    subtitle: (r) => r.relationship_type?.replace(/_/g, " ") || "Relationship",
    fields: (r) => ({ type: r.relationship_type, status: r.status, role: r.role }),
  },
];

const ICON_MAP = Object.fromEntries(ENTITY_CONFIG.map(c => [c.key, { icon: c.icon, color: c.color }]));

// ── Normalise a raw result from either source into a uniform shape ─────────────
function normalise(raw, cfg) {
  return {
    id:          raw.id,
    type:        cfg.key,
    page:        cfg.page,
    entityLabel: cfg.entity,
    icon:        cfg.icon,
    color:       cfg.color,
    title:       cfg.title(raw),
    subtitle:    cfg.subtitle(raw),
    fields:      cfg.fields(raw),
  };
}

function normaliseEndpoint(r) {
  const meta = ICON_MAP[r.entity_type] || { icon: Search, color: "text-slate-400" };
  return {
    id:          r.id,
    type:        r.entity_type,
    page:        r.page,
    entityLabel: r.page.replace(/s$/, ""),
    icon:        meta.icon,
    color:       meta.color,
    title:       r.title,
    subtitle:    r.subtitle,
    fields:      r.fields || {},
  };
}

// ── Field display helpers ─────────────────────────────────────────────────────
const SKIP_FIELD_VALUES = new Set(["", "nan", "None", "none", "null", "undefined"]);

function cleanFields(fields) {
  return Object.entries(fields || {}).filter(
    ([, v]) => v != null && !SKIP_FIELD_VALUES.has(String(v).trim())
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function GlobalSearchBar({ currentUser }) {
  const [input,        setInput]        = useState("");
  const [results,      setResults]      = useState([]);
  const [open,         setOpen]         = useState(false);
  const [loading,      setLoading]      = useState(false);
  const [drawerResult, setDrawerResult] = useState(null);  // result open in side drawer
  const [selectedIdx,  setSelectedIdx]  = useState(-1);
  const inputRef   = useRef(null);
  const debounceRef = useRef(null);
  const navigate   = useNavigate();

  // CommandPalette delegates record search here instead of reimplementing it.
  useEffect(() => {
    function onFocusSearch(e) {
      const q = e.detail?.query || "";
      setInput(q);
      inputRef.current?.focus();
    }
    window.addEventListener("focus-global-search", onFocusSearch);
    return () => window.removeEventListener("focus-global-search", onFocusSearch);
  }, []);

  useEffect(() => {
    if (!input.trim()) {
      setResults([]);
      setSelectedIdx(-1);
      setOpen(false);
      return;
    }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(input.trim().toLowerCase()), 250);
    return () => clearTimeout(debounceRef.current);
  }, [input]);

  // ── Search: try python_layer endpoint, fall back to Base44 parallel calls ───
  const runSearch = useCallback(async (query) => {
    setLoading(true);

    const companyId = currentUser?.company_id;
    let hits = [];

    // Fix 1 + 3: single server-side query, unlimited by the 50-record cap
    try {
      const headers = RAILWAY_API_KEY ? { "x-api-key": RAILWAY_API_KEY } : {};
      const res = await fetch(
        `${RAILWAY_URL}/search?q=${encodeURIComponent(query)}&company_id=${encodeURIComponent(companyId || "")}&limit=8`,
        { headers, signal: AbortSignal.timeout(5000) }
      );
      if (res.ok) {
        const data = await res.json();
        if (data.results?.length > 0) {
          hits = data.results.map(normaliseEndpoint);
        }
      }
    } catch (_) {
      // endpoint unavailable — fall through to Base44
    }

    // Fallback: 12 parallel Base44 calls (raw tables empty or endpoint down)
    if (hits.length === 0) {
      const scope = companyId ? { company_id: companyId } : {};
      const fetches = ENTITY_CONFIG.map(cfg => cfg.fetch(scope).catch(() => []));
      const allResults = await Promise.all(fetches);
      ENTITY_CONFIG.forEach((cfg, i) => {
        allResults[i]
          .filter(r => cfg.match(r, query))
          .slice(0, 5)
          .forEach(r => hits.push(normalise(r, cfg)));
      });
    }

    setResults(hits);
    setSelectedIdx(-1);
    setLoading(false);
    setOpen(true);
  }, [currentUser]);

  // Navigate directly (keyboard Enter)
  const openRecord = useCallback((result) => {
    navigate(`${createPageUrl(result.page)}?id=${encodeURIComponent(result.id)}`);
    setInput("");
    setResults([]);
    setOpen(false);
  }, [navigate]);

  // Click on a result → open side drawer
  const handleResultClick = (result) => {
    setDrawerResult(result);
    setOpen(false);
    setInput("");
    setResults([]);
  };

  const handleKeyDown = (e) => {
    const flat = results;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIdx(prev => Math.min(prev + 1, flat.length - 1));
      setOpen(true);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIdx(prev => Math.max(prev - 1, -1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (selectedIdx >= 0 && flat[selectedIdx]) openRecord(flat[selectedIdx]);
    } else if (e.key === "Escape") {
      setOpen(false);
      setSelectedIdx(-1);
    }
  };

  // Group results by entity label for display
  const grouped = results.reduce((acc, r) => {
    (acc[r.entityLabel] = acc[r.entityLabel] || []).push(r);
    return acc;
  }, {});
  const flat = Object.values(grouped).flat();

  const close = () => { setOpen(false); setSelectedIdx(-1); };

  return (
    <div className="relative hidden sm:block flex-1 max-w-lg min-w-0">
      {/* Input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          placeholder="Search everything..."
          value={input}
          onChange={e => { setInput(e.target.value); setOpen(true); }}
          onFocus={() => input && setOpen(true)}
          onKeyDown={handleKeyDown}
          className="w-full rounded-lg border border-slate-200 bg-white pl-9 pr-8 py-2 text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent"
        />
        {input && (
          <button
            onClick={() => { setInput(""); setResults([]); setOpen(false); inputRef.current?.focus(); }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Loading */}
      {open && input && loading && (
        <>
          <div className="fixed inset-0 z-40" onClick={close} />
          <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-200 rounded-xl shadow-xl z-50 p-4 text-center">
            <div className="w-4 h-4 border-2 border-slate-200 border-t-emerald-500 rounded-full animate-spin mx-auto" />
            <p className="text-xs text-slate-400 mt-2">Searching all entities...</p>
          </div>
        </>
      )}

      {/* No results */}
      {open && input && !loading && results.length === 0 && (
        <>
          <div className="fixed inset-0 z-40" onClick={close} />
          <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-200 rounded-xl shadow-xl z-50 p-6 text-center">
            <Search className="w-6 h-6 text-slate-300 mx-auto mb-2" />
            <p className="text-sm text-slate-500">No results for "{input}"</p>
            <p className="text-xs text-slate-400 mt-1">Try a different keyword</p>
          </div>
        </>
      )}

      {/* Side drawer — renders via portal, outside this dropdown */}
      <EntityQuickViewDrawer
        result={drawerResult}
        onClose={() => setDrawerResult(null)}
        currentUser={currentUser}
      />

      {/* Results */}
      {open && !loading && flat.length > 0 && (
        <>
          <div className="fixed inset-0 z-40" onClick={close} />
          <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-200 rounded-xl shadow-xl z-50 max-h-[520px] overflow-y-auto">
            <div className="px-4 py-2 border-b border-slate-100 flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                {flat.length} result{flat.length !== 1 ? "s" : ""}
              </p>
              <p className="text-[10px] text-slate-300">↑↓ navigate · Enter full page · Click details</p>
            </div>

            {Object.entries(grouped).map(([label, items]) => (
              <div key={label}>
                <p className="px-4 pt-2.5 pb-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                  {label}
                </p>
                {items.map((result) => {
                  const Icon       = result.icon;
                  const globalIdx  = flat.indexOf(result);
                  const isSelected = globalIdx === selectedIdx;

                  return (
                    <button
                      key={`${result.type}-${result.id}`}
                      onClick={() => handleResultClick(result)}
                      onMouseEnter={() => setSelectedIdx(globalIdx)}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                        isSelected ? "bg-emerald-50" : "hover:bg-slate-50"
                      }`}
                    >
                      <div className="shrink-0 w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center">
                        <Icon className={`w-3.5 h-3.5 ${result.color}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">{result.title}</p>
                        <p className="text-xs text-slate-400 truncate">{result.subtitle}</p>
                      </div>
                      <ChevronRight className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
