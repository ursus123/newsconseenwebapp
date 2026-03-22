import React, { useState } from "react";
import SectionSkeleton from "./SectionSkeleton";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, LineChart, Line, Legend
} from "recharts";

function KPICard({ label, value, signal }) {
  const colors = {
    green: "bg-emerald-50 border-emerald-100 text-emerald-800",
    amber: "bg-amber-50 border-amber-100 text-amber-800",
    red: "bg-rose-50 border-rose-100 text-rose-800",
    neutral: "bg-slate-50 border-slate-100 text-slate-800",
  };
  const cls = colors[signal] || colors.neutral;

  return (
    <div className={`rounded-xl border p-4 ${cls}`}>
      <p className="text-[10px] uppercase tracking-wider font-medium opacity-70">{label}</p>
      <p className="text-xl font-bold mt-1">{value ?? "—"}</p>
    </div>
  );
}

function signalIncome(v) {
  if (!v) return "neutral";
  if (v > 70000) return "green";
  if (v > 40000) return "amber";
  return "red";
}
function signalPoverty(v) {
  if (!v) return "neutral";
  if (v < 10) return "green";
  if (v < 20) return "amber";
  return "red";
}
function signalUnemployment(v) {
  if (!v) return "neutral";
  if (v < 5) return "green";
  if (v < 10) return "amber";
  return "red";
}
function signalEducation(v) {
  if (!v) return "neutral";
  if (v > 30) return "green";
  if (v > 15) return "amber";
  return "red";
}

const SIGNAL_COLORS = { green: "#10b981", amber: "#f59e0b", red: "#ef4444", neutral: "#94a3b8" };

export default function EconomicProfileSection({ usData, intlData, isUS, loading }) {
  const [view, setView] = useState("chart"); // "chart" | "cards"

  if (loading) return <SectionSkeleton title="Economic Profile" rows={2} />;
  if (!usData && !intlData) return null;

  const us = usData?.[0];
  const intl = intlData?.find(r => r.year === Math.max(...(intlData.map(r => r.year) || [0])));

  const pop = us?.population || intl?.population;
  const income = us?.median_household_income || intl?.gdp_per_capita_usd;
  const incomeLabel = us ? "Median Household Income" : "GDP per Capita";
  const age = us?.median_age;
  const poverty = us?.poverty_rate_pct || intl?.poverty_rate_pct;
  const unemployment = us?.unemployment_pct || intl?.unemployment_pct;
  const education = us?.bachelors_degree_pct || intl?.internet_users_pct;
  const educationLabel = us ? "College Educated %" : "Internet Users %";
  const homeValue = us?.median_home_value;

  // Build radar data for key indicators (normalized 0–100)
  const radarData = [
    income && { metric: "Income", value: Math.min(100, (income / 120000) * 100), signal: signalIncome(income) },
    poverty != null && { metric: "Low Poverty", value: Math.max(0, 100 - (poverty / 30) * 100), signal: signalPoverty(poverty) },
    unemployment != null && { metric: "Employment", value: Math.max(0, 100 - (unemployment / 20) * 100), signal: signalUnemployment(unemployment) },
    education != null && { metric: educationLabel.replace(" %",""), value: Math.min(100, (education / 50) * 100), signal: signalEducation(education) },
    age && { metric: "Working Age", value: Math.min(100, age < 40 ? 80 : age < 50 ? 60 : 40), signal: "neutral" },
  ].filter(Boolean);

  // Bar chart data for economic breakdown
  const barData = [
    income && { name: incomeLabel.replace("Median ",""), value: income, color: SIGNAL_COLORS[signalIncome(income)], prefix: "$", suffix: "" },
    homeValue && { name: "Home Value", value: homeValue, color: "#6366f1", prefix: "$", suffix: "" },
    us?.median_gross_rent && { name: "Gross Rent", value: us.median_gross_rent, color: "#8b5cf6", prefix: "$", suffix: "" },
  ].filter(Boolean);

  const pctData = [
    poverty != null && { name: "Poverty", value: +parseFloat(poverty).toFixed(1), color: SIGNAL_COLORS[signalPoverty(poverty)] },
    unemployment != null && { name: "Unemployment", value: +parseFloat(unemployment).toFixed(1), color: SIGNAL_COLORS[signalUnemployment(unemployment)] },
    education != null && { name: educationLabel.replace(" %",""), value: +parseFloat(education).toFixed(1), color: SIGNAL_COLORS[signalEducation(education)] },
    us?.homeownership_rate && { name: "Homeownership", value: +parseFloat(us.homeownership_rate).toFixed(1), color: "#10b981" },
  ].filter(Boolean);

  // Intl trend data
  const trendData = !isUS && intlData
    ? [...intlData].sort((a, b) => a.year - b.year).slice(-8).map(r => ({
        year: String(r.year),
        gdpPerCapita: r.gdp_per_capita_usd,
        unemployment: r.unemployment_pct,
        inflation: r.inflation_pct,
      }))
    : [];

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-white border border-slate-200 rounded-xl px-3 py-2 shadow-lg text-xs space-y-0.5">
        <p className="font-semibold text-slate-700 mb-1">{label}</p>
        {payload.map((p, i) => (
          <p key={i} style={{ color: p.color }} className="font-medium">
            {p.name}: {p.value?.toLocaleString?.() ?? p.value}
          </p>
        ))}
      </div>
    );
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-slate-800">💰 Economic Profile</h3>
        <div className="flex gap-1">
          {["chart", "cards"].map(v => (
            <button key={v} onClick={() => setView(v)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${view === v ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>
              {v === "chart" ? "📊 Chart" : "🃏 Cards"}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Cards always shown */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-5">
        <KPICard label="Population" value={pop ? Number(pop).toLocaleString() : "—"} signal="neutral" />
        <KPICard label={incomeLabel} value={income ? `$${Number(income).toLocaleString()}` : "—"} signal={signalIncome(income)} />
        {age && <KPICard label="Median Age" value={`${age} yr`} signal="neutral" />}
        {poverty != null && <KPICard label="Poverty Rate" value={`${poverty}%`} signal={signalPoverty(poverty)} />}
        {unemployment != null && <KPICard label="Unemployment" value={`${unemployment}%`} signal={signalUnemployment(unemployment)} />}
        {education != null && <KPICard label={educationLabel} value={`${typeof education === 'number' ? education.toFixed(1) : education}%`} signal={signalEducation(education)} />}
      </div>

      {view === "chart" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Radar chart */}
          {radarData.length > 2 && (
            <div>
              <p className="text-xs font-medium text-slate-500 mb-2">Health Indicators (normalized)</p>
              <ResponsiveContainer width="100%" height={200}>
                <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="70%">
                  <PolarGrid stroke="#e2e8f0" />
                  <PolarAngleAxis dataKey="metric" tick={{ fontSize: 10, fill: "#94a3b8" }} />
                  <Radar dataKey="value" stroke="#10b981" fill="#10b981" fillOpacity={0.25} strokeWidth={2} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Percentages bar chart */}
          {pctData.length > 0 && (
            <div>
              <p className="text-xs font-medium text-slate-500 mb-2">Key Rate Indicators (%)</p>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={pctData} layout="vertical" barCategoryGap="25%">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: "#94a3b8" }} tickFormatter={v => `${v}%`} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "#64748b" }} width={90} />
                  <Tooltip content={<CustomTooltip />} formatter={v => `${v}%`} />
                  <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                    {pctData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Dollar values bar */}
          {barData.length > 0 && (
            <div className="lg:col-span-2">
              <p className="text-xs font-medium text-slate-500 mb-2">Dollar Benchmarks</p>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={barData} barCategoryGap="30%">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#94a3b8" }} />
                  <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} width={48} />
                  <Tooltip content={<CustomTooltip />} formatter={v => `$${v.toLocaleString()}`} />
                  <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                    {barData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Intl trend line */}
          {trendData.length > 1 && (
            <div className="lg:col-span-2">
              <p className="text-xs font-medium text-slate-500 mb-2">Historical Trend</p>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="year" tick={{ fontSize: 11, fill: "#94a3b8" }} />
                  <YAxis yAxisId="left" tick={{ fontSize: 10, fill: "#94a3b8" }} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} width={44} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: "#94a3b8" }} tickFormatter={v => `${v}%`} width={36} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line yAxisId="left" type="monotone" dataKey="gdpPerCapita" stroke="#6366f1" strokeWidth={2} dot={false} name="GDP/Capita" />
                  <Line yAxisId="right" type="monotone" dataKey="unemployment" stroke="#f59e0b" strokeWidth={2} dot={false} name="Unemployment %" />
                  <Line yAxisId="right" type="monotone" dataKey="inflation" stroke="#ef4444" strokeWidth={2} dot={false} name="Inflation %" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {view === "cards" && (
        <>
          {isUS && homeValue && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <KPICard label="Median Home Value" value={`$${Number(homeValue).toLocaleString()}`} signal="neutral" />
              {us?.median_gross_rent && <KPICard label="Median Gross Rent" value={`$${Number(us.median_gross_rent).toLocaleString()}`} signal="neutral" />}
              {us?.homeownership_rate && <KPICard label="Homeownership" value={`${us.homeownership_rate}%`} signal="neutral" />}
            </div>
          )}
          {!isUS && intl && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {intl.gdp_growth_pct != null && <KPICard label="GDP Growth" value={`${intl.gdp_growth_pct?.toFixed(1)}%`} signal={intl.gdp_growth_pct > 3 ? "green" : intl.gdp_growth_pct > 0 ? "amber" : "red"} />}
              {intl.inflation_pct != null && <KPICard label="Inflation" value={`${intl.inflation_pct?.toFixed(1)}%`} signal={intl.inflation_pct < 5 ? "green" : intl.inflation_pct < 15 ? "amber" : "red"} />}
              {intl.urban_population_pct != null && <KPICard label="Urban Population" value={`${intl.urban_population_pct?.toFixed(1)}%`} signal="neutral" />}
              {intl.healthcare_spend_gdp_pct != null && <KPICard label="Healthcare Spend" value={`${intl.healthcare_spend_gdp_pct?.toFixed(1)}% GDP`} signal={intl.healthcare_spend_gdp_pct > 5 ? "green" : "amber"} />}
            </div>
          )}
        </>
      )}
    </div>
  );
}