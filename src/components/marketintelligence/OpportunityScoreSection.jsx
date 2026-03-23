import React from "react";
import SectionSkeleton from "./SectionSkeleton";
import { RadarChart, PolarGrid, PolarAngleAxis, Radar, ResponsiveContainer, Tooltip } from "recharts";
import { getBizCategory } from "@/pages/MarketIntelligence";

const CATEGORY_LABELS = {
  healthcare:  "Healthcare Opportunity Score",
  education:   "Education Market Opportunity",
  community:   "Community Need Score",
  agriculture: "Agricultural Market Opportunity",
  business:    "Business Opportunity Score",
};

const CATEGORY_PROVIDER_TERM = {
  healthcare:  "providers",
  education:   "institutions",
  community:   "organizations",
  agriculture: "operations",
  business:    "providers",
};

function ScoreBadge({ score }) {
  if (score >= 70) return { label: "STRONG OPPORTUNITY", color: "text-emerald-600", bg: "bg-emerald-50", border: "border-emerald-200" };
  if (score >= 50) return { label: "UNDERSERVED MARKET", color: "text-amber-600", bg: "bg-amber-50", border: "border-amber-200" };
  if (score >= 30) return { label: "COMPETITIVE MARKET", color: "text-orange-600", bg: "bg-orange-50", border: "border-orange-200" };
  return { label: "SATURATED MARKET", color: "text-rose-600", bg: "bg-rose-50", border: "border-rose-200" };
}

export default function OpportunityScoreSection({ data, infrastructure, economy, isUS, businessType, loading }) {
  if (loading) return <SectionSkeleton title="Market Opportunity Score" rows={5} />;
  if (!data) return null;

  const d = data[0];
  if (!d) return null;

  const score = d.opportunity_score ?? 0;
  const badge = ScoreBadge({ score });
  const bizCategory = getBizCategory(businessType || "other");
  const sectionTitle = CATEGORY_LABELS[bizCategory] || "Market Opportunity Score";
  const providerTerm = CATEGORY_PROVIDER_TERM[bizCategory] || "providers";

  // Build radar data
  const infOverall = infrastructure?.find(r => r.infrastructure_type === "OVERALL SCORE");
  const infraScore = parseInt(infOverall?.availability) || 50;
  const ecoData = Array.isArray(economy) ? economy[0] : economy;
  const ecoScore = (() => {
    const inc = ecoData?.median_household_income || ecoData?.gdp_per_capita_usd || 0;
    if (inc > 70000) return 85;
    if (inc > 40000) return 65;
    if (inc > 20000) return 45;
    return 30;
  })();

  const elderlyPct = ecoData?.population_over65_pct || ecoData?.population_over65_estimate || 10;
  const demoFit = Math.min(100, (elderlyPct / 20) * 100);

  const radarData = [
    { metric: "Market Size", value: Math.min(100, (d.annual_market_usd || 0) / 1000000) },
    { metric: "Low Competition", value: Math.max(0, 100 - ((d.existing_competitors || 0) / Math.max(d.ideal_market_units || 5, 1)) * 100) },
    { metric: "Economic Strength", value: ecoScore },
    { metric: "Infrastructure", value: infraScore },
    { metric: "Demographic Fit", value: Math.min(100, demoFit) },
  ];

  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
      <h3 className="text-sm font-bold text-slate-800 mb-4">🎯 {sectionTitle}</h3>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Score card */}
        <div className={`flex-1 rounded-2xl border-2 ${badge.border} ${badge.bg} p-6`}>
          <div className="text-center mb-4">
            <div className={`text-7xl font-black ${badge.color}`}>{score}</div>
            <div className="text-slate-400 text-sm font-medium">/100</div>
            <div className={`text-base font-bold mt-2 ${badge.color}`}>🏷️ {badge.label}</div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            {[
              { label: "Est. Market Size", value: d.annual_market_usd ? `$${(d.annual_market_usd / 1000000).toFixed(1)}M/yr` : "—" },
              { label: "Competitors Found", value: d.existing_competitors ?? "—" },
              { label: "Ideal Market Size", value: d.ideal_market_units ?? "—" },
              { label: "Supply Gap", value: d.supply_gap > 0 ? `${d.supply_gap} ${providerTerm} needed` : "Saturated" },
              { label: "Est. Population", value: d.estimated_population ? Number(d.estimated_population).toLocaleString() : "—" },
              { label: "Market Status", value: d.market_status || "—" },
            ].map(({ label, value }) => (
              <div key={label} className="bg-white/60 rounded-xl p-2.5">
                <p className="text-[10px] uppercase tracking-wider text-slate-400 font-medium">{label}</p>
                <p className="font-bold text-slate-800 text-sm mt-0.5">{value}</p>
              </div>
            ))}
          </div>

          {d.recommendation && (
            <div className="mt-4 bg-white/70 rounded-xl p-3 text-sm text-slate-700 italic">
              {d.recommendation}
            </div>
          )}
        </div>

        {/* Radar chart */}
        <div className="lg:w-80 h-72">
          <p className="text-xs text-slate-400 uppercase tracking-wider font-medium mb-2 text-center">Market Fit Radar</p>
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={radarData}>
              <PolarGrid stroke="#e2e8f0" />
              <PolarAngleAxis dataKey="metric" tick={{ fontSize: 10, fill: "#64748b" }} />
              <Radar
                name="Score"
                dataKey="value"
                stroke="#10b981"
                fill="#10b981"
                fillOpacity={0.25}
                strokeWidth={2}
              />
              <Tooltip formatter={(v) => [`${Math.round(v)}/100`, "Score"]} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}