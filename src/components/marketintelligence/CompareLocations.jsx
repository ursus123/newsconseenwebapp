import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, X, Loader2 } from "lucide-react";

export default function CompareLocations({
  primaryLocation, businessType, radiusKm,
  primaryScore, primaryEconomy, primaryCompetitors,
  compareResults, onAddLocation, onRemoveLocation,
}) {
  const [inputVal, setInputVal] = useState("");
  const [loading, setLoading]   = useState(false);

  const handleAdd = async () => {
    if (!inputVal.trim() || (compareResults?.length || 0) >= 3) return;
    setLoading(true);
    await onAddLocation(inputVal.trim());
    setInputVal("");
    setLoading(false);
  };

  const primaryRow = {
    location:    primaryLocation,
    score:       primaryScore,
    competitors: (primaryCompetitors?.filter(c => c.distance_km > 0)?.length) ?? null,
    gap:         null,
    income:      primaryEconomy?.median_household_income || primaryEconomy?.gdp_per_capita_usd,
    population:  primaryEconomy?.total_population || primaryEconomy?.population,
    market_usd:  null,
    isPrimary:   true,
  };

  const compRows = (compareResults || []).map(d => ({
    location:     d.location,
    score:        d.opportunity_score,
    competitors:  d.competitor_count,
    gap:          d.market?.supply_gap,
    income:       d.median_income,
    population:   d.population,
    market_usd:   d.annual_market_usd,
    climate_risk: d.climate_risk,
    labor_cost:   d.labor_cost,
    loading:      d.loading,
    isPrimary:    false,
  }));

  const allRows  = [primaryRow, ...compRows];
  const bestScore = Math.max(...allRows.map(r => r.score || 0));

  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
      <h3 className="text-sm font-bold text-slate-800 mb-4">🆚 Compare Locations</h3>

      {(compareResults?.length || 0) < 3 && (
        <div className="flex gap-2 mb-4">
          <Input
            placeholder="Add location to compare (e.g. Cedar Rapids Iowa)"
            value={inputVal}
            onChange={e => setInputVal(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleAdd()}
            className="flex-1"
          />
          <Button onClick={handleAdd} disabled={loading || !inputVal.trim()} size="sm">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Add
          </Button>
        </div>
      )}

      {allRows.length > 1 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-left text-xs text-slate-400 pb-2 font-medium w-32">Metric</th>
                {allRows.map((r, i) => (
                  <th key={i} className="text-center text-xs pb-2 font-medium px-2">
                    <div className="flex items-center justify-center gap-1">
                      <span className={`truncate max-w-[120px] ${r.score === bestScore && bestScore > 0 ? "text-emerald-600 font-bold" : "text-slate-600"}`}>
                        {r.location}
                      </span>
                      {!r.isPrimary && (
                        <button onClick={() => onRemoveLocation(i - 1)} className="text-slate-300 hover:text-red-400 shrink-0">
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                    {r.loading && <Loader2 className="w-3 h-3 animate-spin mx-auto text-slate-300 mt-1" />}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                { label: "Opportunity Score",  key: "score",        fmt: v => v != null ? `${v}/100` : "—", best: "max" },
                { label: "Competitors Nearby", key: "competitors",  fmt: v => v != null ? v : "—",          best: "min" },
                { label: "Market Gap",         key: "gap",          fmt: v => v != null ? `${v} needed` : "—", best: "max" },
                { label: "Annual Market",      key: "market_usd",   fmt: v => v != null ? `$${Number(v).toLocaleString()}` : "—", best: "max" },
                { label: "Income / GDP pc",    key: "income",       fmt: v => v != null ? `$${Number(v).toLocaleString()}` : "—", best: "max" },
                { label: "Population",         key: "population",   fmt: v => v != null ? Number(v).toLocaleString() : "—", best: "max" },
                { label: "Climate Risk",       key: "climate_risk", fmt: v => v || "—", best: "min", riskOrder: ["low","moderate","high","very_high"] },
                { label: "Labor Cost/yr",      key: "labor_cost",   fmt: v => v != null ? `$${Number(v).toLocaleString()}` : "—", best: "min" },
              ].map(({ label, key, fmt, best, riskOrder }) => {
                const vals = riskOrder
                  ? allRows.map(r => r[key]).filter(Boolean)
                  : allRows.map(r => r[key]).filter(v => v != null && !isNaN(v));
                const bestVal = vals.length
                  ? riskOrder
                    ? vals.reduce((a, b) => (riskOrder.indexOf(a) <= riskOrder.indexOf(b) ? a : b))
                    : best === "max" ? Math.max(...vals) : Math.min(...vals)
                  : null;
                return (
                  <tr key={label} className="border-b border-slate-50">
                    <td className="py-2 pr-4 text-slate-500 text-xs font-medium">{label}</td>
                    {allRows.map((r, i) => {
                      const v = r[key];
                      const isBest = bestVal != null && v === bestVal;
                      return (
                        <td key={i} className={`text-center py-2 px-2 text-xs font-semibold ${isBest ? "text-emerald-600 bg-emerald-50 rounded" : "text-slate-700"}`}>
                          {r.loading ? <Loader2 className="w-3 h-3 animate-spin mx-auto text-slate-300" /> : fmt(v)}
                          {isBest && !r.loading && best === "max" && " ✅"}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>

          {allRows.filter(r => !r.loading).length > 1 && (
            <div className="mt-3 p-3 bg-slate-50 rounded-xl text-sm text-slate-600">
              {(() => {
                const scored = allRows.filter(r => r.score != null && !r.loading);
                if (!scored.length) return "Fetching comparison data…";
                const best = scored.reduce((a, b) => (a.score || 0) >= (b.score || 0) ? a : b);
                return `📊 ${best.location} scores highest for ${businessType} investment${best.score ? ` (${best.score}/100)` : ""}.`;
              })()}
            </div>
          )}
        </div>
      )}
    </div>
  );
}