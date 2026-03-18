import React, { useState, useEffect, useRef } from "react";
import { Loader2, Search, AlertTriangle } from "lucide-react";

const API_BASE = "https://newsconseenwebapp-production.up.railway.app";

export default function MedicationAutocomplete({ value, onChange, onMedicationSelected, onRecallWarning }) {
  const [query, setQuery] = useState(value || "");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const debounceRef = useRef(null);
  const containerRef = useRef(null);

  // Sync external value changes (e.g. form reset)
  useEffect(() => { setQuery(value || ""); }, [value]);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleInput = (val) => {
    setQuery(val);
    onChange(val); // keep form in sync as user types
    clearTimeout(debounceRef.current);
    if (val.length < 2) { setResults([]); setOpen(false); return; }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`${API_BASE}/medications/search?q=${encodeURIComponent(val)}`);
        const data = await res.json();
        setResults(data.results || []);
        setOpen(true);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 350);
  };

  const handleSelect = async (item) => {
    setOpen(false);
    setQuery(item.name);
    setDetailLoading(true);
    try {
      const res = await fetch(`${API_BASE}/medications/full?q=${encodeURIComponent(item.name)}`);
      const data = await res.json();
      onMedicationSelected(data);
      if (data.has_active_recall) onRecallWarning(true);
      else onRecallWarning(false);
    } catch {
      // fallback: just set name
      onMedicationSelected({ detail: { name: item.name } });
      onRecallWarning(false);
    } finally {
      setDetailLoading(false);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => handleInput(e.target.value)}
          placeholder="Search medication name…"
          className="w-full pl-9 pr-10 py-2 rounded-xl border border-slate-200 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-400"
        />
        {(loading || detailLoading) && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-500 animate-spin" />
        )}
      </div>

      {open && results.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
          <div className="max-h-60 overflow-y-auto">
            {results.map((r) => (
              <button
                key={r.rxcui}
                type="button"
                onClick={() => handleSelect(r)}
                className="w-full text-left px-4 py-3 hover:bg-emerald-50 border-b border-slate-50 last:border-0 transition-colors"
              >
                <p className="text-sm font-semibold text-slate-800">{r.name}</p>
                <p className="text-xs text-slate-400 mt-0.5">{r.tty_label}{r.is_generic ? " · Generic" : ""}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {open && !loading && results.length === 0 && query.length >= 2 && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl px-4 py-3">
          <p className="text-sm text-slate-400 text-center">No medications found</p>
        </div>
      )}
    </div>
  );
}