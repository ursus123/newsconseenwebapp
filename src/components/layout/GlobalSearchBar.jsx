import React, { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import {
  Search, X, Users, Building2, ClipboardList, ArrowLeftRight,
  FileText, Calendar, Activity, MessageSquare, Map, Package, Wrench, MapPin, Link2
} from "lucide-react";
import { createPageUrl } from "@/utils";

const ENTITY_CONFIG = [
  {
    key: "person", entity: "Person", page: "People", icon: Users, color: "text-violet-500",
    fetch: (scope) => base44.entities.Person.filter(scope, undefined, 50),
    match: (r, q) => r.first_name?.toLowerCase().includes(q) || r.last_name?.toLowerCase().includes(q) || r.email?.toLowerCase().includes(q),
    title: (r) => `${r.first_name || ""} ${r.last_name || ""}`.trim() || r.email,
    subtitle: (r) => r.email || r.person_type || "Person",
  },
  {
    key: "enterprise", entity: "Enterprise", page: "Enterprises", icon: Building2, color: "text-blue-500",
    fetch: (scope) => base44.entities.Enterprise.filter(scope, undefined, 50),
    match: (r, q) => r.enterprise_name?.toLowerCase().includes(q) || r.short_name?.toLowerCase().includes(q) || r.city?.toLowerCase().includes(q),
    title: (r) => r.enterprise_name,
    subtitle: (r) => r.short_name || r.city || "Enterprise",
  },
  {
    key: "product", entity: "Product", page: "Products", icon: Package, color: "text-orange-500",
    fetch: (scope) => base44.entities.Product.filter(scope, undefined, 50),
    match: (r, q) => r.name?.toLowerCase().includes(q) || r.sku?.toLowerCase().includes(q),
    title: (r) => r.name,
    subtitle: (r) => r.sku ? `SKU: ${r.sku}` : r.item_type || "Product",
  },
  {
    key: "service", entity: "Service", page: "Services", icon: Wrench, color: "text-teal-500",
    fetch: (scope) => base44.entities.Service.filter(scope, undefined, 50),
    match: (r, q) => r.name?.toLowerCase().includes(q) || r.description?.toLowerCase().includes(q),
    title: (r) => r.name,
    subtitle: (r) => r.service_type || "Service",
  },
  {
    key: "address", entity: "Address", page: "Addresses", icon: MapPin, color: "text-rose-500",
    fetch: (scope) => base44.entities.Address.filter(scope, undefined, 50),
    match: (r, q) => r.label?.toLowerCase().includes(q) || r.street?.toLowerCase().includes(q) || r.city?.toLowerCase().includes(q),
    title: (r) => r.label || r.street || "Address",
    subtitle: (r) => [r.city, r.region, r.country].filter(Boolean).join(", ") || "Address",
  },
  {
    key: "task", entity: "Task", page: "Tasks", icon: ClipboardList, color: "text-amber-500",
    fetch: (scope) => base44.entities.Task.filter(scope, undefined, 50),
    match: (r, q) => r.title?.toLowerCase().includes(q) || r.task_type?.toLowerCase().includes(q),
    title: (r) => r.title,
    subtitle: (r) => `${r.task_type?.replace(/_/g, " ") || "Task"} • ${r.status || ""}`,
  },
  {
    key: "transaction", entity: "Transaction", page: "Transactions", icon: ArrowLeftRight, color: "text-green-500",
    fetch: (scope) => base44.entities.Transaction.filter(scope, undefined, 50),
    match: (r, q) => r.description?.toLowerCase().includes(q) || r.invoice_number?.toLowerCase().includes(q),
    title: (r) => r.description || r.invoice_number || "Transaction",
    subtitle: (r) => `${r.transaction_type?.replace(/_/g, " ") || ""} • $${(r.net_amount || 0).toFixed(2)}`,
  },
  {
    key: "document", entity: "Document", page: "Documents", icon: FileText, color: "text-indigo-500",
    fetch: (scope) => base44.entities.Document.filter(scope, undefined, 50),
    match: (r, q) => r.title?.toLowerCase().includes(q) || r.document_type?.toLowerCase().includes(q),
    title: (r) => r.title,
    subtitle: (r) => r.document_type || "Document",
  },
  {
    key: "schedule", entity: "Schedule", page: "Schedules", icon: Calendar, color: "text-cyan-500",
    fetch: (scope) => base44.entities.Schedule.filter(scope, undefined, 50),
    match: (r, q) => r.title?.toLowerCase().includes(q) || r.schedule_type?.toLowerCase().includes(q),
    title: (r) => r.title,
    subtitle: (r) => `${r.schedule_type || "Schedule"} • ${r.frequency || ""}`,
  },
  {
    key: "signal", entity: "Signal", page: "Signals", icon: Activity, color: "text-red-500",
    fetch: (scope) => base44.entities.Signal.filter(scope, undefined, 50),
    match: (r, q) => r.name?.toLowerCase().includes(q) || r.signal_type?.toLowerCase().includes(q) || r.source?.toLowerCase().includes(q),
    title: (r) => r.name,
    subtitle: (r) => r.signal_type || "Signal",
  },
  {
    key: "channel", entity: "Channel", page: "Channels", icon: MessageSquare, color: "text-pink-500",
    fetch: (scope) => base44.entities.Channel.filter(scope, undefined, 50),
    match: (r, q) => r.name?.toLowerCase().includes(q) || r.channel_type?.toLowerCase().includes(q),
    title: (r) => r.name,
    subtitle: (r) => r.channel_type || "Channel",
  },
  {
    key: "territory", entity: "Territory", page: "Territories", icon: Map, color: "text-lime-600",
    fetch: (scope) => base44.entities.Territory.filter(scope, undefined, 50),
    match: (r, q) => r.name?.toLowerCase().includes(q) || r.territory_type?.toLowerCase().includes(q) || r.region?.toLowerCase().includes(q),
    title: (r) => r.name,
    subtitle: (r) => [r.territory_type, r.region, r.country].filter(Boolean).join(" • ") || "Territory",
  },
  {
    key: "relationship", entity: "Relationship", page: "Relationships", icon: Link2, color: "text-slate-500",
    fetch: (scope) => base44.entities.Relationship.filter(scope, undefined, 50),
    match: (r, q) => r.from_name?.toLowerCase().includes(q) || r.to_name?.toLowerCase().includes(q) || r.relationship_type?.toLowerCase().includes(q),
    title: (r) => r.from_name && r.to_name ? `${r.from_name} → ${r.to_name}` : r.relationship_type || "Relationship",
    subtitle: (r) => r.relationship_type?.replace(/_/g, " ") || "Relationship",
  },
];

export default function GlobalSearchBar({ currentUser }) {
  const [input, setInput] = useState("");
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(-1);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);
  const debounceRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!input.trim()) {
      setResults([]);
      setSelectedIdx(-1);
      setOpen(false);
      return;
    }

    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      runSearch(input.trim().toLowerCase());
    }, 250);

    return () => clearTimeout(debounceRef.current);
  }, [input]);

  const runSearch = useCallback(async (query) => {
    setLoading(true);
    const companyId = currentUser?.company_id;
    const scope = companyId ? { company_id: companyId } : {};

    const fetches = ENTITY_CONFIG.map((cfg) =>
      cfg.fetch(scope).catch(() => [])
    );

    const allResults = await Promise.all(fetches);
    const matches = [];

    ENTITY_CONFIG.forEach((cfg, i) => {
      allResults[i]
        .filter((r) => cfg.match(r, query))
        .slice(0, 3)
        .forEach((r) => {
          matches.push({
            id: r.id,
            type: cfg.key,
            page: cfg.page,
            icon: cfg.icon,
            color: cfg.color,
            title: cfg.title(r),
            subtitle: cfg.subtitle(r),
            entityLabel: cfg.entity,
          });
        });
    });

    setResults(matches);
    setSelectedIdx(-1);
    setLoading(false);
    setOpen(true);
  }, [currentUser]);

  const handleSelect = (result) => {
    navigate(createPageUrl(result.page));
    setInput("");
    setResults([]);
    setOpen(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIdx((prev) => Math.min(prev + 1, results.length - 1));
      setOpen(true);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIdx((prev) => Math.max(prev - 1, -1));
    } else if (e.key === "Enter" && selectedIdx >= 0) {
      e.preventDefault();
      handleSelect(results[selectedIdx]);
    } else if (e.key === "Escape") {
      setOpen(false);
      setSelectedIdx(-1);
    }
  };

  // Group results by entity type for display
  const grouped = results.reduce((acc, r) => {
    if (!acc[r.entityLabel]) acc[r.entityLabel] = [];
    acc[r.entityLabel].push(r);
    return acc;
  }, {});

  const flatResults = Object.values(grouped).flat();

  return (
    <div className="relative flex-1 max-w-lg">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          placeholder="Search everything..."
          value={input}
          onChange={(e) => { setInput(e.target.value); setOpen(true); }}
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
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-200 rounded-xl shadow-xl z-50 p-4 text-center">
            <div className="w-4 h-4 border-2 border-slate-200 border-t-emerald-500 rounded-full animate-spin mx-auto" />
            <p className="text-xs text-slate-400 mt-2">Searching all entities...</p>
          </div>
        </>
      )}

      {/* No results */}
      {open && input && !loading && results.length === 0 && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-200 rounded-xl shadow-xl z-50 p-6 text-center">
            <Search className="w-6 h-6 text-slate-300 mx-auto mb-2" />
            <p className="text-sm text-slate-500">No results for "{input}"</p>
            <p className="text-xs text-slate-400 mt-1">Try a different keyword</p>
          </div>
        </>
      )}

      {/* Results grouped by entity */}
      {open && !loading && flatResults.length > 0 && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-200 rounded-xl shadow-xl z-50 max-h-[480px] overflow-y-auto">
            <div className="px-3 py-2 border-b border-slate-100 flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                {flatResults.length} result{flatResults.length !== 1 ? "s" : ""}
              </p>
            </div>
            {Object.entries(grouped).map(([label, items]) => (
              <div key={label}>
                <p className="px-4 pt-2.5 pb-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                  {label}
                </p>
                {items.map((result) => {
                  const Icon = result.icon;
                  const globalIdx = flatResults.indexOf(result);
                  const isSelected = globalIdx === selectedIdx;
                  return (
                    <button
                      key={`${result.type}-${result.id}`}
                      onClick={() => handleSelect(result)}
                      onMouseEnter={() => setSelectedIdx(globalIdx)}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                        isSelected ? "bg-emerald-50" : "hover:bg-slate-50"
                      }`}
                    >
                      <div className={`shrink-0 w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center`}>
                        <Icon className={`w-3.5 h-3.5 ${result.color}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">{result.title}</p>
                        <p className="text-xs text-slate-400 truncate">{result.subtitle}</p>
                      </div>
                      <span className="shrink-0 text-[10px] text-slate-300 font-medium">
                        {result.entityLabel}
                      </span>
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