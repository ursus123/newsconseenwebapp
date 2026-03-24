import React from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, X, SlidersHorizontal } from "lucide-react";

/**
 * Reusable search + filter bar used across all list pages.
 * Props:
 *   search: string
 *   setSearch: fn
 *   filters: { [key]: value }
 *   setFilters: fn
 *   filterDefs: [{ key, label, options: [{value, label}] }]
 *   placeholder: string
 *   resultCount: number (optional)
 *   totalCount: number (optional)
 */
export default function SearchFilterBar({
  search = "",
  setSearch,
  filters = {},
  setFilters,
  filterDefs = [],
  placeholder = "Search...",
  resultCount,
  totalCount,
}) {
  const hasFilters = Object.values(filters).some(Boolean) || search;

  const clearAll = () => {
    setSearch("");
    const cleared = {};
    filterDefs.forEach((f) => { cleared[f.key] = ""; });
    setFilters(cleared);
  };

  return (
    <div className="flex flex-wrap items-center gap-2 mb-4">
      {/* Search input */}
      <div className="relative flex-1 min-w-[200px] max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
        <Input
          placeholder={placeholder}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 pr-3 h-9 bg-white border-slate-200 rounded-xl text-sm"
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Filter dropdowns */}
      {filterDefs.map((fd) => (
        <div key={fd.key} className="relative">
          <select
            value={filters[fd.key] || ""}
            onChange={(e) => setFilters((prev) => ({ ...prev, [fd.key]: e.target.value }))}
            className={`h-9 pl-3 pr-7 text-sm rounded-xl border transition-colors appearance-none cursor-pointer focus:outline-none focus:ring-1 focus:ring-emerald-400
              ${filters[fd.key]
                ? "border-emerald-300 bg-emerald-50 text-emerald-700 font-medium"
                : "border-slate-200 bg-white text-slate-600"
              }`}
          >
            <option value="">{fd.label}</option>
            {fd.options.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <SlidersHorizontal className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
        </div>
      ))}

      {/* Clear all */}
      {hasFilters && (
        <button
          onClick={clearAll}
          className="flex items-center gap-1 text-xs text-slate-400 hover:text-rose-500 transition-colors"
        >
          <X className="w-3 h-3" /> Clear
        </button>
      )}

      {/* Result count */}
      {resultCount !== undefined && totalCount !== undefined && (
        <span className="ml-auto text-xs text-slate-400">
          {resultCount === totalCount ? `${totalCount} records` : `${resultCount} of ${totalCount}`}
        </span>
      )}
    </div>
  );
}