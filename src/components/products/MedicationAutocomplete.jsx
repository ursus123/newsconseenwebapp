import React, { useState, useEffect, useRef } from "react";
import { Loader2, Search } from "lucide-react";

const API_BASE = "https://newsconseenwebapp-production.up.railway.app";

export default function MedicationAutocomplete({ value, onChange, onMedicationSelected, onRecallWarning }) {
  const [query, setQuery] = useState(value || "");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [isFuzzy, setIsFuzzy] = useState(false);
  const debounceRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => { setQuery(value || ""); }, [value]);

  useEffect(() => {
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleInput = (val) => {
    setQuery(val);
    onChange(val);
    clearTimeout(debounceRef.current);
    if (val.length < 2) { setResults([]); setOpen(false); setIsFuzzy(false); return; }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      setIsFuzzy(false);
      try {
        // Exact search first
        const res = await fetch(`${API_BASE}/medications/search?q=${encodeURIComponent(val)}`);
        const data = await res.json();
        let hits = data.results || [];

        // Fuzzy fallback if no results
        if (hits.length === 0) {
          const approxRes = await fetch(`${API_BASE}/medications/approximate?q=${encodeURIComponent(val)}`);
          const approxData = await approxRes.json();
          hits = approxData.results || [];
          if (hits.length > 0) setIsFuzzy(true);
        }

        setResults(hits);
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
    onChange(item.name);
    setDetailLoading(true);
    try {
      // Parallel: fetch detail by rxcui + recall check simultaneously
      const [detailRes, recallRes] = await Promise.all([
        fetch(`${API_BASE}/medications/detail/${item.rxcui}`),
        fetch(`${API_BASE}/medications/recalls?q=${encodeURIComponent(item.name)}`),
      ]);
      const detail = await detailRes.json();
      const recallData = await recallRes.json();

      // Use first ingredient for label fetch
      const ingredientName = detail.ingredients?.[0] || item.name;
      const labelRes = await fetch(`${API_BASE}/medications/label?q=${encodeURIComponent(ingredientName)}`);
      const labelData = await labelRes.json();

      const recalls = recallData.recalls || [];
      const has_active_recall = recalls.length > 0;

      onRecallWarning(has_active_recall);
      onMedicationSelected({
        rxcui: item.rxcui,
        name: detail.name || item.name,
        ingredients: detail.ingredients || [],
        dose_forms: detail.dose_forms || [],
        brand_names: detail.brand_names || [],
        ndc_codes: detail.ndc_codes || [],
        drug_classes: detail.drug_classes || [],
        label: labelData.label || {},
        recalls,
        has_active_recall,
        active_recall_count: recalls.length,
        // legacy shape so ProductForm.handleMedicationSelected still works
        detail,
      });
    } catch {
      onMedicationSelected({ rxcui: item.rxcui, name: item.name, detail: { name: item.name }, label: {}, recalls: [], has_active_recall: false, active_recall_count: 0 });
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

      {detailLoading && (
        <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
          <Loader2 className="w-3 h-3 animate-spin text-emerald-500" />
          Loading FDA medication data…
        </div>
      )}

      {open && (results.length > 0 || (!loading && query.length >= 2)) && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
          {isFuzzy && results.length > 0 && (
            <div className="px-3 py-1.5 bg-amber-50 border-b border-amber-100">
              <p className="text-xs text-amber-600 font-medium">Showing approximate matches</p>
            </div>
          )}

          {results.length > 0 ? (
            <>
              <div className="max-h-60 overflow-y-auto">
                {results.map((r) => (
                  <button
                    key={r.rxcui}
                    type="button"
                    onClick={() => handleSelect(r)}
                    className="w-full text-left px-4 py-3 hover:bg-emerald-50 border-b border-slate-50 last:border-0 transition-colors"
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-slate-800">{r.name}</p>
                      {r.is_generic
                        ? <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700">Generic</span>
                        : <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700">Brand</span>
                      }
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">{r.tty_label}</p>
                  </button>
                ))}
              </div>
              <div className="px-4 py-2 bg-slate-50 border-t border-slate-100">
                <p className="text-[10px] text-slate-400">Source: NIH RxNorm · FDA DailyMed</p>
              </div>
            </>
          ) : (
            !loading && (
              <div className="px-4 py-4 text-center">
                <p className="text-sm text-slate-600 font-medium">No medications found for "{query}"</p>
                <p className="text-xs text-slate-400 mt-1">Try a generic name or partial name</p>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}