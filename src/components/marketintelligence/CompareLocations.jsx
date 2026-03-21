import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, X, Loader2 } from "lucide-react";
import { executeSQL } from "@/components/querybuilder/sqlEngine";

async function fetchLocationSummary(location, businessType, radiusKm) {
  const runQ = async (sql) => {
    try { const r = await executeSQL(sql, {}); return r.rows?.[0] || null; }
    catch { return null; }
  };
  const [market, competitors] = await Promise.all([
    runQ(`SELECT * FROM geo_market_size WHERE city = '${location}' AND business_type = '${businessType}' AND radius_km = ${radiusKm}`),
    runQ(`SELECT * FROM geo_competitors WHERE city = '${location}' AND business_type = '${businessType}' AND radius_km = ${radiusKm}`),
  ]);
  return {
    location,
    market,
    competitorCount: competitors ? 1 : 0, // summary row is first
    loaded: true,
  };
}

export default function CompareLocations({
  primaryLocation, businessType, radiusKm,
  primaryScore, primaryEconomy, primaryCompetitors,
  compareLocations, onAddLocation, onRemoveLocation,
}) {
  const [inputVal, setInputVal] = useState("");
  const [loadingIdx, setLoadingIdx] = useState(null);
  const [compareData, setCompareData] = useState([]);

  const handleAdd = async () => {
    if (!inputVal.trim() || compareData.length >= 3) return;
    const idx = compareData.length;
    setLoadingIdx(idx);
    onAddLocation(inputVal.trim());
    const summary = await fetchLocationSummary(inputVal.trim(), businessType, radiusKm);
    setCompareData(prev => [...prev, summary]);
    setInputVal("");
    setLoadingIdx(null);
  };

  const handleRemove = (i) => {
    setCompareData(prev => prev.filter((_, idx) => idx !== i));
    onRemoveLocation(i);
  };

  const primaryRow = {
    location: primaryLocation,
    score: primaryScore,
    competitors: (primaryCompetitors?.length || 1) - 1,
    gap: null,
    income: primaryEconomy?.median_household_income || primaryEconomy?.gdp_per_capita_usd,
  };

  const allRows = [
    primaryRow,
    ...compareData.map(d => ({
      location: d.location,
      score: d.market?.opportunity_score,
      competitors: d.market?.existing_competitors,
      gap: d.market?.supply_gap,
      income: d.market?.gdp_per_capita_usd,
    })),
  ];

  const bestScore = Math.max(...allRows.map(r => r.score || 0));

  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
      <h3 className="text-sm font-bold text-slate-800 mb-4">🆚 Compare Locations</h3>

      {compareData.length < 3 && (
        <div className="flex gap-2 mb-4">
          <Input
            placeholder="Add location to compare (e.g. Cedar Rapids Iowa)"
            value={inputVal}
            onChange={e => setInputVal(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleAdd()}
            className="flex-1"
          />
          <Button onClick={handleAdd} disabled={loadingIdx !== null || !inputVal.trim()} size="sm">
            {loadingIdx !== null ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Add
          </Button>
        </div>
      )}

      {allRows.length > 1 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-left text-xs text-slate-400 pb-2 font-medium">Metric</th>
                {allRows.map((r, i) => (
                  <th key={i} className="text-center text-xs pb-2 font-medium">
                    <div className="flex items-center justify-center gap-1">
                      <span className={`truncate max-w-[120px] ${r.score === bestScore ? "text-emerald-600 font-bold" : "text-slate-500"}`}>
                        {r.location}
                      </span>
                      {i > 0 && (
                        <button onClick={() => handleRemove(i - 1)} className="text-slate-300 hover:text-red-400">
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                { label: "Opportunity Score", key: "score", fmt: v => v ? `${v}/100` : "—", best: "max" },
                { label: "Competitors", key: "competitors", fmt: v => v ?? "—", best: "min" },
                { label: "Market Gap", key: "gap", fmt: v => v ? `${v} needed` : "—", best: "max" },
                { label: "Income / GDP", key: "income", fmt: v => v ? `$${Number(v).toLocaleString()}` : "—", best: "max" },
              ].map(({ label, key, fmt, best }) => {
                const vals = allRows.map(r => r[key]);
                const bestVal = best === "max"
                  ? Math.max(...vals.filter(v => v != null))
                  : Math.min(...vals.filter(v => v != null));
                return (
                  <tr key={label} className="border-b border-slate-50">
                    <td className="py-2 pr-4 text-slate-500 text-xs font-medium">{label}</td>
                    {allRows.map((r, i) => (
                      <td key={i} className={`text-center py-2 font-semibold ${
                        r[key] === bestVal && r[key] != null
                          ? "text-emerald-600 bg-emerald-50 rounded" : "text-slate-700"
                      }`}>
                        {fmt(r[key])}
                        {r[key] === bestVal && r[key] != null && best === "max" && " ✅"}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>

          {allRows.length > 1 && (
            <div className="mt-3 p-3 bg-slate-50 rounded-xl text-sm text-slate-600">
              {(() => {
                const best = allRows.reduce((a, b) => (a.score || 0) >= (b.score || 0) ? a : b);
                return `📊 ${best.location} scores highest for ${businessType} investment${best.score ? ` (${best.score}/100)` : ""}.`;
              })()}
            </div>
          )}
        </div>
      )}
    </div>
  );
}