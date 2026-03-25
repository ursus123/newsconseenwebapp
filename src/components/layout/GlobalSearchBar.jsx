import React, { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Search, X, Users, Building2, ClipboardList, ArrowLeftRight } from "lucide-react";
import { createPageUrl } from "@/utils";

export default function GlobalSearchBar() {
  const [input, setInput] = useState("");
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(-1);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);
  const navigate = useNavigate();

  // Search across entities
  useEffect(() => {
    if (!input.trim()) {
      setResults([]);
      setSelectedIdx(-1);
      return;
    }

    setLoading(true);
    const query = input.toLowerCase();
    let mounted = true;

    Promise.all([
      base44.entities.Person.list(undefined, 10).catch(() => []),
      base44.entities.Enterprise.list(undefined, 10).catch(() => []),
      base44.entities.Task.list(undefined, 10).catch(() => []),
      base44.entities.Transaction.list(undefined, 10).catch(() => []),
    ]).then(([people, enterprises, tasks, transactions]) => {
      if (!mounted) return;

      const matches = [];

      // Search people
      people
        .filter((p) => (p.first_name?.toLowerCase().includes(query) || p.last_name?.toLowerCase().includes(query) || p.email?.toLowerCase().includes(query)))
        .slice(0, 5)
        .forEach((p) => {
          matches.push({
            id: p.id,
            type: "person",
            icon: Users,
            title: `${p.first_name || ""} ${p.last_name || ""}`.trim() || p.email,
            subtitle: p.email,
            entity: p,
          });
        });

      // Search enterprises
      enterprises
        .filter((e) => e.enterprise_name?.toLowerCase().includes(query) || e.short_name?.toLowerCase().includes(query))
        .slice(0, 5)
        .forEach((e) => {
          matches.push({
            id: e.id,
            type: "enterprise",
            icon: Building2,
            title: e.enterprise_name,
            subtitle: e.short_name || e.city || "Enterprise",
            entity: e,
          });
        });

      // Search tasks
      tasks
        .filter((t) => t.title?.toLowerCase().includes(query) || t.task_type?.toLowerCase().includes(query))
        .slice(0, 5)
        .forEach((t) => {
          matches.push({
            id: t.id,
            type: "task",
            icon: ClipboardList,
            title: t.title,
            subtitle: `${t.task_type?.replace(/_/g, " ")} • ${t.status}`,
            entity: t,
          });
        });

      // Search transactions
      transactions
        .filter((t) => t.description?.toLowerCase().includes(query) || t.invoice_number?.toLowerCase().includes(query))
        .slice(0, 5)
        .forEach((t) => {
          matches.push({
            id: t.id,
            type: "transaction",
            icon: ArrowLeftRight,
            title: t.description || t.invoice_number || "Transaction",
            subtitle: `${t.transaction_type?.replace(/_/g, " ")} • $${(t.net_amount || 0).toFixed(2)}`,
            entity: t,
          });
        });

      setResults(matches);
      setSelectedIdx(-1);
      setLoading(false);
    });

    return () => {
      mounted = false;
    };
  }, [input]);

  const handleSelect = (result) => {
    const pageMap = {
      person: "People",
      enterprise: "Enterprises",
      task: "Tasks",
      transaction: "Transactions",
    };

    navigate(createPageUrl(pageMap[result.type]));
    setInput("");
    setResults([]);
    setOpen(false);
  };

  const handleKeyDown = (e) => {
    if (!open && results.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIdx((prev) => (prev < results.length - 1 ? prev + 1 : prev));
      setOpen(true);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIdx((prev) => (prev > -1 ? prev - 1 : -1));
    } else if (e.key === "Enter" && selectedIdx >= 0) {
      e.preventDefault();
      handleSelect(results[selectedIdx]);
    } else if (e.key === "Escape") {
      setOpen(false);
      setSelectedIdx(-1);
    }
  };

  return (
    <div className="relative flex-1 max-w-lg">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          placeholder="Search people, enterprises, tasks..."
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setOpen(true);
          }}
          onFocus={() => input && setOpen(true)}
          onKeyDown={handleKeyDown}
          className="w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 py-2 text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent"
        />
        {input && (
          <button
            onClick={() => {
              setInput("");
              setResults([]);
              inputRef.current?.focus();
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Dropdown results */}
      {open && results.length > 0 && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-200 rounded-lg shadow-lg z-50 max-h-96 overflow-y-auto">
            {results.map((result, idx) => {
              const Icon = result.icon;
              const isSelected = idx === selectedIdx;
              return (
                <button
                  key={`${result.type}-${result.id}`}
                  onClick={() => handleSelect(result)}
                  onMouseEnter={() => setSelectedIdx(idx)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-left border-b border-slate-100 last:border-0 transition-colors ${
                    isSelected ? "bg-emerald-50" : "hover:bg-slate-50"
                  }`}
                >
                  <Icon className="w-4 h-4 text-slate-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{result.title}</p>
                    <p className="text-xs text-slate-400 truncate">{result.subtitle}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}

      {/* Empty state */}
      {open && input && loading && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-200 rounded-lg shadow-lg z-50 p-4 text-center">
            <div className="w-4 h-4 border-2 border-slate-200 border-t-emerald-500 rounded-full animate-spin mx-auto" />
          </div>
        </>
      )}

      {open && input && !loading && results.length === 0 && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-200 rounded-lg shadow-lg z-50 p-4 text-center text-sm text-slate-400">
            No results found
          </div>
        </>
      )}
    </div>
  );
}