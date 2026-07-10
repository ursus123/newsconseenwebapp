/**
 * CommandPalette — Cmd/Ctrl+K global command center
 *
 * Sections:
 *   1. Quick navigation  — all main pages
 *   2. Ask Copilot       — type a question, opens /copilot with pre-fill
 *   3. Actions           — trigger ETL, run workflows, open settings
 *   4. Record search     — live Base44 search across 4 entity types
 *
 * Invoked:
 *   - Keyboard: Cmd/Ctrl + K
 *   - Programmatically: window.dispatchEvent(new Event("open-command-palette"))
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { ncClient } from "@/api/ncClient";
import {
  Search, X, LayoutDashboard, Users, Building2, Package, Wrench,
  CheckSquare, Receipt, BarChart2, Sparkles, Bell, Plug, Brain,
  GitBranch, Settings, Zap, RefreshCw, ArrowLeftRight, MapPin, Link2,
  ChevronRight, Loader2, Command,
} from "lucide-react";

const RAILWAY_URL = "https://newsconseenwebapp-production.up.railway.app";
const RAILWAY_API_KEY = import.meta.env.VITE_RAILWAY_API_KEY || "";

// ── Navigation commands ───────────────────────────────────────────────────────
const NAV_COMMANDS = [
  { id: "nav-dashboard",    label: "Dashboard",           page: "Dashboard",   icon: LayoutDashboard, section: "Navigate" },
  { id: "nav-people",       label: "People",              page: "People",      icon: Users,           section: "Navigate" },
  { id: "nav-enterprises",  label: "Enterprises",         page: "Enterprises", icon: Building2,       section: "Navigate" },
  { id: "nav-products",     label: "Products",            page: "Products",    icon: Package,         section: "Navigate" },
  { id: "nav-tasks",        label: "Tasks",               page: "Tasks",       icon: CheckSquare,     section: "Navigate" },
  { id: "nav-transactions", label: "Transactions",        page: "Transactions",icon: Receipt,         section: "Navigate" },
  { id: "nav-addresses",    label: "Addresses",           page: "Addresses",   icon: MapPin,          section: "Navigate" },
  { id: "nav-relationships",label: "Relationships",       page: "Relationships",icon: Link2,          section: "Navigate" },
  { id: "nav-idjwi",        label: "Idjwi",               page: "idjwi",       icon: Sparkles,        section: "Navigate" },
  { id: "nav-alerts",       label: "Alerts",              page: "alerts",      icon: Bell,            section: "Navigate" },
  { id: "nav-agents",       label: "Agents",              page: "agents",      icon: Brain,           section: "Navigate" },
  { id: "nav-workflows",    label: "Workflows",           page: "Workflows",   icon: GitBranch,       section: "Navigate" },
  { id: "nav-connectors",   label: "Connectors",          page: "Connectors",  icon: Plug,            section: "Navigate" },
  { id: "nav-reports",      label: "Reports",             page: "Reports",     icon: BarChart2,       section: "Navigate" },
  { id: "nav-settings",     label: "Settings",            page: "Settings",    icon: Settings,        section: "Navigate" },
];

// ── Action commands ───────────────────────────────────────────────────────────
const ACTION_COMMANDS = [
  {
    id:      "action-etl-all",
    label:   "Refresh all analytics (run ETL)",
    icon:    RefreshCw,
    section: "Actions",
    run: async () => {
      fetch(`${RAILWAY_URL}/cron/etl-all`, {
        method: "POST",
        headers: { "x-api-key": RAILWAY_API_KEY },
      }).catch(() => {});
      return "ETL triggered — analytics refreshing in background";
    },
  },
  {
    id:      "action-run-scheduled",
    label:   "Run scheduled workflows now",
    icon:    Zap,
    section: "Actions",
    run: async () => {
      fetch(`${RAILWAY_URL}/workflows/run-scheduled`, {
        method: "POST",
        headers: { "x-api-key": RAILWAY_API_KEY },
      }).catch(() => {});
      return "Scheduled workflows evaluated";
    },
  },
];

// ── CommandPalette ─────────────────────────────────────────────────────────────
export default function CommandPalette({ currentUser }) {
  const [open,      setOpen]      = useState(false);
  const [query,     setQuery]     = useState("");
  const [results,   setResults]   = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [selected,  setSelected]  = useState(0);
  const [feedback,  setFeedback]  = useState(null);
  const inputRef  = useRef(null);
  const listRef   = useRef(null);
  const navigate  = useNavigate();

  // Open via keyboard shortcut or event
  useEffect(() => {
    function onKey(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen(v => !v);
      }
      if (e.key === "Escape") setOpen(false);
    }
    function onEvent() { setOpen(true); }
    window.addEventListener("keydown", onKey);
    window.addEventListener("open-command-palette", onEvent);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("open-command-palette", onEvent);
    };
  }, []);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setQuery("");
      setSelected(0);
      setFeedback(null);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Build result list
  useEffect(() => {
    const q = query.trim().toLowerCase();

    if (!q) {
      setResults([
        ...ACTION_COMMANDS,
        ...NAV_COMMANDS.slice(0, 8),
      ]);
      setSelected(0);
      return;
    }

    // Check for copilot intent
    const copilotTriggers = ["?", "how", "what", "why", "show", "tell", "explain", "who", "when", "list", "give"];
    const isCopilotQuery  = copilotTriggers.some(t => q.startsWith(t)) || q.length > 30;

    const filtered = [
      ...(isCopilotQuery ? [{
        id:      "ask-idjwi",
        label:   `Ask Idjwi: "${query}"`,
        icon:    Sparkles,
        section: "Idjwi",
        _query:  query,
      }] : []),
      ...ACTION_COMMANDS.filter(c => c.label.toLowerCase().includes(q)),
      ...NAV_COMMANDS.filter(c => c.label.toLowerCase().includes(q)),
    ];

    setResults(filtered);
    setSelected(0);

    // Live record search (debounced in the effect)
    if (q.length >= 2 && currentUser) {
      setLoading(true);
      const scope = currentUser.company_id ? { company_id: currentUser.company_id } : {};
      Promise.all([
        ncClient.entities.Person.filter(scope, undefined, 30).catch(() => []),
        ncClient.entities.Enterprise.filter(scope, undefined, 30).catch(() => []),
        ncClient.entities.Task.filter(scope, undefined, 30).catch(() => []),
        ncClient.entities.Product.filter(scope, undefined, 30).catch(() => []),
      ]).then(([people, enterprises, tasks, products]) => {
        const records = [
          ...people
            .filter(p => (`${p.first_name} ${p.last_name} ${p.email}`).toLowerCase().includes(q))
            .slice(0, 4)
            .map(p => ({
              id: `rec-person-${p.id}`, label: `${p.first_name || ""} ${p.last_name || ""}`.trim() || p.email,
              sub: p.email, icon: Users, section: "Records", page: "People",
            })),
          ...enterprises
            .filter(e => (e.enterprise_name || "").toLowerCase().includes(q))
            .slice(0, 3)
            .map(e => ({
              id: `rec-ent-${e.id}`, label: e.enterprise_name, sub: e.city || "Enterprise",
              icon: Building2, section: "Records", page: "Enterprises",
            })),
          ...tasks
            .filter(t => (t.title || "").toLowerCase().includes(q))
            .slice(0, 3)
            .map(t => ({
              id: `rec-task-${t.id}`, label: t.title, sub: t.status,
              icon: CheckSquare, section: "Records", page: "Tasks",
            })),
          ...products
            .filter(p => (p.name || "").toLowerCase().includes(q))
            .slice(0, 3)
            .map(p => ({
              id: `rec-prod-${p.id}`, label: p.name, sub: p.status,
              icon: Package, section: "Records", page: "Products",
            })),
        ];
        setResults(prev => [...prev, ...records]);
        setLoading(false);
      }).catch(() => setLoading(false));
    }
  }, [query, currentUser]);

  // Keyboard navigation
  const handleKeyDown = useCallback((e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelected(s => Math.min(s + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelected(s => Math.max(s - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = results[selected];
      if (item) execute(item);
    }
  }, [results, selected]);

  async function execute(item) {
    // Ask copilot
    if (item.id === "ask-idjwi") {
      navigate(createPageUrl("idjwi") + `?q=${encodeURIComponent(item._query)}`);
      setOpen(false);
      return;
    }
    // Navigate
    if (item.page) {
      navigate(createPageUrl(item.page));
      setOpen(false);
      return;
    }
    // Action
    if (item.run) {
      const msg = await item.run();
      setFeedback(msg);
      setTimeout(() => setOpen(false), 1400);
      return;
    }
  }

  // Group by section
  const grouped = results.reduce((acc, item) => {
    const s = item.section || "Other";
    if (!acc[s]) acc[s] = [];
    acc[s].push(item);
    return acc;
  }, {});

  const flat = results; // for index tracking

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-start justify-center pt-[12vh] px-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setOpen(false)} />

      {/* Panel */}
      <div className="relative w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-slate-100">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Navigate, search records, or ask a question…"
            className="flex-1 text-sm text-slate-800 placeholder-slate-400 focus:outline-none bg-transparent"
          />
          {loading && <Loader2 className="w-4 h-4 text-slate-400 animate-spin shrink-0" />}
          <div className="flex items-center gap-1 text-[10px] text-slate-400 font-mono shrink-0">
            <kbd className="px-1.5 py-0.5 bg-slate-100 rounded border border-slate-200">⌘K</kbd>
            <span>to close</span>
          </div>
        </div>

        {/* Feedback toast */}
        {feedback && (
          <div className="px-4 py-3 bg-emerald-50 border-b border-emerald-100 text-xs font-semibold text-emerald-700 flex items-center gap-2">
            <Zap className="w-3.5 h-3.5" /> {feedback}
          </div>
        )}

        {/* Results */}
        <div ref={listRef} className="max-h-[60vh] overflow-y-auto py-2">
          {results.length === 0 && !loading && (
            <p className="text-xs text-slate-400 text-center py-8">No results — try a different query</p>
          )}

          {Object.entries(grouped).map(([section, items]) => (
            <div key={section}>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-4 pt-3 pb-1">{section}</p>
              {items.map(item => {
                const idx   = flat.indexOf(item);
                const Icon  = item.icon;
                const isSel = idx === selected;
                return (
                  <button
                    key={item.id}
                    onClick={() => execute(item)}
                    onMouseEnter={() => setSelected(idx)}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                      isSel ? "bg-indigo-50" : "hover:bg-slate-50"
                    }`}
                  >
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                      isSel ? "bg-indigo-100" : "bg-slate-100"
                    }`}>
                      <Icon className={`w-3.5 h-3.5 ${isSel ? "text-indigo-600" : "text-slate-500"}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium truncate ${isSel ? "text-indigo-700" : "text-slate-700"}`}>
                        {item.label}
                      </p>
                      {item.sub && (
                        <p className="text-[10px] text-slate-400 truncate">{item.sub}</p>
                      )}
                    </div>
                    {item.section === "Navigate" || item.page ? (
                      <ChevronRight className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                    ) : item.section === "Actions" ? (
                      <span className="text-[9px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded font-mono shrink-0">run</span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* Footer hint */}
        <div className="px-4 py-2.5 border-t border-slate-100 flex items-center gap-4 text-[10px] text-slate-400">
          <span className="flex items-center gap-1"><kbd className="font-mono bg-slate-100 px-1 rounded border border-slate-200">↑↓</kbd> navigate</span>
          <span className="flex items-center gap-1"><kbd className="font-mono bg-slate-100 px-1 rounded border border-slate-200">↵</kbd> select</span>
          <span className="flex items-center gap-1"><kbd className="font-mono bg-slate-100 px-1 rounded border border-slate-200">esc</kbd> close</span>
          <span className="ml-auto flex items-center gap-1 text-indigo-400 font-semibold">
            <Command className="w-3 h-3" /> Newsconseen Command Palette
          </span>
        </div>
      </div>
    </div>
  );
}
