import React, { useState, useMemo } from "react";
import { Slider } from "@/components/ui/slider";
import { TrendingUp, RotateCcw } from "lucide-react";
import { RadarChart, PolarGrid, PolarAngleAxis, Radar, ResponsiveContainer, Tooltip } from "recharts";

const FACTORS = [
  { key: "marketExpansion",   label: "Market Expansion",    emoji: "📈", description: "Overall market growth rate", default: 0 },
  { key: "adoptionRate",      label: "Adoption Rate",       emoji: "🤝", description: "Speed at which customers adopt the service", default: 0 },
  { key: "competitionShift",  label: "Competition Shift",   emoji: "⚔️",  description: "Change in competitor activity (negative = less)", default: 0 },
  { key: "demographicTrend",  label: "Demographic Trend",   emoji: "👥", description: "Favorable population & age trend changes", default: 0 },
  { key: "infrastructureGrowth", label: "Infrastructure", emoji: "🏗️", description: "Planned infrastructure improvements", default: 0 },
  { key: "regulatoryEase",    label: "Regulatory Ease",     emoji: "📋", description: "Reduction in regulatory burden", default: 0 },
];

function ScoreBadge({ score }) {
  if (score >= 70) return { label: "STRONG OPPORTUNITY", color: "text-emerald-600", bg: "bg-emerald-50", border: "border-emerald-200", ring: "#10b981" };
  if (score >= 50) return { label: "UNDERSERVED MARKET", color: "text-amber-600", bg: "bg-amber-50", border: "border-amber-200", ring: "#f59e0b" };
  if (score >= 30) return { label: "COMPETITIVE MARKET", color: "text-orange-600", bg: "bg-orange-50", border: "border-orange-200", ring: "#f97316" };
  return { label: "SATURATED MARKET", color: "text-rose-600", bg: "bg-rose-50", border: "border-rose-200", ring: "#ef4444" };
}

export default function ForecastingModule({ baseScore, baseRadarData }) {
  const [factors, setFactors] = useState(() =>
    Object.fromEntries(FACTORS.map(f => [f.key, f.default]))
  );

  const adjustedScore = useMemo(() => {
    const totalAdjustment =
      factors.marketExpansion * 0.25 +
      factors.adoptionRate * 0.20 +
      factors.competitionShift * -0.20 + // negative = more competition hurts
      factors.demographicTrend * 0.15 +
      factors.infrastructureGrowth * 0.10 +
      factors.regulatoryEase * 0.10;
    return Math.max(0, Math.min(100, Math.round(baseScore + totalAdjustment)));
  }, [factors, baseScore]);

  const delta = adjustedScore - baseScore;
  const badge = ScoreBadge({ score: adjustedScore });

  const adjustedRadarData = useMemo(() => {
    if (!baseRadarData?.length) return [];
    return baseRadarData.map(r => ({
      ...r,
      adjusted: Math.min(100, Math.max(0, r.value + (
        r.metric === "Market Size"      ? factors.marketExpansion * 0.3 :
        r.metric === "Low Competition"  ? factors.competitionShift * -0.25 :
        r.metric === "Economic Strength"? factors.adoptionRate * 0.2 :
        r.metric === "Infrastructure"   ? factors.infrastructureGrowth * 0.4 :
        r.metric === "Demographic Fit"  ? factors.demographicTrend * 0.3 : 0
      ))),
    }));
  }, [baseRadarData, factors]);

  const reset = () => setFactors(Object.fromEntries(FACTORS.map(f => [f.key, f.default])));
  const hasChanges = FACTORS.some(f => factors[f.key] !== f.default);

  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-indigo-500" />
          <h3 className="text-sm font-bold text-slate-800">📐 Growth Factor Forecasting</h3>
        </div>
        {hasChanges && (
          <button onClick={reset} className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 transition-colors">
            <RotateCcw className="w-3 h-3" /> Reset
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Sliders */}
        <div className="space-y-5">
          <p className="text-xs text-slate-400">Adjust growth factors to see how they affect your Market Opportunity Score in real-time.</p>
          {FACTORS.map(f => (
            <div key={f.key}>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-slate-700">
                  {f.emoji} {f.label}
                </label>
                <span className={`text-xs font-bold tabular-nums ${factors[f.key] > 0 ? "text-emerald-600" : factors[f.key] < 0 ? "text-rose-500" : "text-slate-400"}`}>
                  {factors[f.key] > 0 ? "+" : ""}{factors[f.key]}
                </span>
              </div>
              <Slider
                min={-20}
                max={20}
                step={1}
                value={[factors[f.key]]}
                onValueChange={([v]) => setFactors(prev => ({ ...prev, [f.key]: v }))}
                className="w-full"
              />
              <p className="text-[10px] text-slate-400 mt-0.5">{f.description}</p>
            </div>
          ))}
        </div>

        {/* Forecast result */}
        <div className="flex flex-col gap-4">
          <div className={`rounded-2xl border-2 ${badge.border} ${badge.bg} p-5 text-center`}>
            <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Forecasted Score</p>
            <div className={`text-6xl font-black ${badge.color}`}>{adjustedScore}</div>
            <div className="text-slate-400 text-sm">/100</div>
            <div className={`text-sm font-bold mt-1 ${badge.color}`}>{badge.label}</div>

            {delta !== 0 && (
              <div className={`mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-bold ${delta > 0 ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
                {delta > 0 ? "▲" : "▼"} {Math.abs(delta)} pts from baseline ({baseScore})
              </div>
            )}
          </div>

          {adjustedRadarData.length > 0 && (
            <div>
              <p className="text-xs text-slate-400 text-center mb-1">Baseline vs Forecasted</p>
              <ResponsiveContainer width="100%" height={220}>
                <RadarChart data={adjustedRadarData} cx="50%" cy="50%" outerRadius="70%">
                  <PolarGrid stroke="#e2e8f0" />
                  <PolarAngleAxis dataKey="metric" tick={{ fontSize: 10, fill: "#94a3b8" }} />
                  <Radar name="Baseline" dataKey="value" stroke="#94a3b8" fill="#94a3b8" fillOpacity={0.1} strokeWidth={1.5} strokeDasharray="4 2" />
                  <Radar name="Forecast" dataKey="adjusted" stroke={badge.ring} fill={badge.ring} fillOpacity={0.25} strokeWidth={2} />
                  <Tooltip formatter={(v, name) => [`${Math.round(v)}/100`, name]} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}