import React, { useState, useEffect, useRef, useCallback } from "react";
import { Search, X, Users, Building2, CheckSquare, Receipt, Loader2 } from "lucide-react";
import { ncClient } from "@/api/ncClient";
import { DESKTOP_APPS, getAppSearchText } from "@/desktop/desktopApps";

const ENTITY_CONFIG = [
  { key: "Task",        label: "Tasks",        icon: CheckSquare, color: "text-violet-400", route: "/Tasks",        titleField: "title",         subField: "status" },
  { key: "Person",      label: "People",       icon: Users,       color: "text-sky-400",    route: "/People",       titleField: (r) => `${r.first_name||""} ${r.last_name||""}`.trim(), subField: "primary_role" },
  { key: "Enterprise",  label: "Enterprises",  icon: Building2,   color: "text-emerald-400",route: "/Enterprises",  titleField: "enterprise_name", subField: "enterprise_type" },
  { key: "Transaction", label: "Transactions", icon: Receipt,     color: "text-amber-400",  route: "/Transactions", titleField: "description",   subField: "transaction_type" },
];

function getTitle(cfg, record) {
  if (typeof cfg.titleField === "function") return cfg.titleField(record);
  return record[cfg.titleField] || "(untitled)";
}

export default function GlobalSearch({ onOpenApp, isLight, companyId, apps = DESKTOP_APPS }) {
  const [query, setQuery]       = useState("");
  const [results, setResults]   = useState([]);
  const [loading, setLoading]   = useState(false);
  const [open, setOpen]         = useState(false);
  const [focused, setFocused]   = useState(0);
  const inputRef                = useRef(null);
  const panelRef                = useRef(null);
  const debounceRef             = useRef(null);

  // Global keyboard shortcut: Ctrl+K
  useEffect(() => {
    const handler = (e) => {
      if (e.ctrlKey && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
      if (e.key === "Escape") {
        setOpen(false);
        setQuery("");
        inputRef.current?.blur();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const runSearch = useCallback(async (q) => {
    if (!q.trim() || q.length < 2) { setResults([]); setLoading(false); return; }
    setLoading(true);
    try {
      const ql = q.toLowerCase();
      const appResults = apps
        .filter(app => getAppSearchText(app).includes(ql))
        .slice(0, 5)
        .map(app => ({ id: `app-${app.id}`, _entity: "App", _app: app }));
      const searches = ENTITY_CONFIG.map(async (cfg) => {
        const filter = companyId ? { company_id: companyId } : {};
        const items = await ncClient.entities[cfg.key].filter(filter, "-created_date", 100);
        const filtered = items.filter(item => {
          const title = getTitle(cfg, item) || "";
          return title.toLowerCase().includes(ql) ||
            (item[cfg.subField] || "").toLowerCase().includes(ql);
        }).slice(0, 3);
        return filtered.map(r => ({ ...r, _entity: cfg.key, _cfg: cfg }));
      });
      const all = [...appResults, ...(await Promise.all(searches)).flat()];
      setResults(all);
      setFocused(0);
    } catch (e) {
      setResults([]);
    }
    setLoading(false);
  }, [apps, companyId]);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (!query.trim()) { setResults([]); return; }
    debounceRef.current = setTimeout(() => runSearch(query), 300);
    return () => clearTimeout(debounceRef.current);
  }, [query, runSearch]);

  const openResult = useCallback((result) => {
    if (result._entity === "App") {
      onOpenApp(result._app);
      setOpen(false);
      setQuery("");
      setResults([]);
      return;
    }
    const cfg = result._cfg;
    const app = DESKTOP_APPS.find(a => a.route === cfg.route);
    if (app) onOpenApp(app);
    setOpen(false);
    setQuery("");
    setResults([]);
  }, [onOpenApp]);

  const handleKeyDown = (e) => {
    if (!open || results.length === 0) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setFocused(f => Math.min(f + 1, results.length - 1)); }
    if (e.key === "ArrowUp")   { e.preventDefault(); setFocused(f => Math.max(f - 1, 0)); }
    if (e.key === "Enter")     { e.preventDefault(); if (results[focused]) openResult(results[focused]); }
  };

  const textColor  = isLight ? "text-slate-700"      : "text-white";
  const inputBg    = isLight ? "rgba(0,0,0,0.06)"    : "rgba(255,255,255,0.08)";
  const inputBorder= isLight ? "rgba(0,0,0,0.12)"    : "rgba(255,255,255,0.14)";
  const panelBg    = isLight ? "rgba(248,250,252,0.98)" : "rgba(10,18,36,0.97)";
  const panelBorder= isLight ? "rgba(0,0,0,0.10)"    : "rgba(255,255,255,0.10)";

  return (
    <div className="relative" ref={panelRef}>
      {/* Search Input */}
      <div className="relative flex items-center">
        <Search className={`absolute left-2.5 w-3.5 h-3.5 pointer-events-none ${isLight ? "text-slate-400" : "text-slate-500"}`} />
        <input
          ref={inputRef}
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Search…  Ctrl+K"
          className="pl-7 pr-7 py-0.5 text-xs rounded-lg outline-none transition-all"
          style={{
            width: 200,
            background: inputBg,
            border: `1px solid ${inputBorder}`,
            color: isLight ? "#334155" : "#e2e8f0",
            caretColor: isLight ? "#334155" : "#e2e8f0",
          }}
        />
        {query && (
          <button
            className={`absolute right-2 ${isLight ? "text-slate-400" : "text-slate-500"} hover:text-slate-300`}
            onClick={() => { setQuery(""); setResults([]); inputRef.current?.focus(); }}
          >
            <X className="w-3 h-3" />
          </button>
        )}
        {loading && (
          <Loader2 className="absolute right-2 w-3 h-3 animate-spin text-slate-400" />
        )}
      </div>

      {/* Results Panel */}
      {open && (query.length >= 2) && (
        <div
          className="absolute left-0 mt-1.5 rounded-xl shadow-2xl overflow-hidden z-[9999]"
          style={{
            top: "100%",
            minWidth: 320,
            background: panelBg,
            border: `1px solid ${panelBorder}`,
            backdropFilter: "blur(20px)",
          }}
        >
          {loading ? (
            <div className="flex items-center gap-2 px-4 py-3 text-xs text-slate-400">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Searching…
            </div>
          ) : results.length === 0 ? (
            <div className="px-4 py-3 text-xs text-slate-500">No results for "{query}"</div>
          ) : (
            <div className="py-1">
              {/* Group by entity */}
              {[{ key: "App", label: "Apps", icon: Search, color: "text-emerald-400" }, ...ENTITY_CONFIG].map(cfg => {
                const group = results.filter(r => r._entity === cfg.key);
                if (group.length === 0) return null;
                const Icon = cfg.icon;
                return (
                  <div key={cfg.key}>
                    <div className={`flex items-center gap-1.5 px-3 pt-2 pb-0.5 text-[10px] font-bold uppercase tracking-widest ${cfg.color}`}>
                      <Icon className="w-3 h-3" /> {cfg.label}
                    </div>
                    {group.map((r, i) => {
                      const globalIdx = results.indexOf(r);
                      const isActive = globalIdx === focused;
                      return (
                        <button
                          key={r.id}
                          className={`w-full flex items-start gap-2.5 px-3 py-2 text-left transition-colors ${
                            isActive
                              ? "bg-white/10"
                              : "hover:bg-white/5"
                          }`}
                          onClick={() => openResult(r)}
                          onMouseEnter={() => setFocused(globalIdx)}
                        >
                          <Icon className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${cfg.color}`} />
                          <div className="min-w-0">
                            <p className={`text-xs font-medium truncate ${isLight ? "text-slate-800" : "text-slate-100"}`}>
                              {r._entity === "App" ? r._app.name : getTitle(cfg, r)}
                            </p>
                            {r._entity === "App" ? (
                              <p className="text-[10px] text-slate-500 truncate">
                                {r._app.category} · {r._app.description}
                              </p>
                            ) : r[cfg.subField] && (
                              <p className="text-[10px] text-slate-500 truncate capitalize">
                                {String(r[cfg.subField]).replace(/_/g, " ")}
                              </p>
                            )}
                          </div>
                          {isActive && (
                            <span className="ml-auto text-[9px] text-slate-500 shrink-0 mt-0.5">↵ open</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}
          <div className={`px-3 py-1.5 text-[10px] border-t flex items-center gap-2 ${isLight ? "text-slate-400 border-black/5" : "text-slate-600 border-white/5"}`}>
            <span>↑↓ navigate</span><span>·</span><span>↵ open</span><span>·</span><span>Esc close</span>
          </div>
        </div>
      )}
    </div>
  );
}
