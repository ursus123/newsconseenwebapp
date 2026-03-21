import React from "react";
import SectionSkeleton from "./SectionSkeleton";

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

export default function EconomicProfileSection({ usData, intlData, isUS, loading }) {
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
  const educationLabel = us ? "College Educated" : "Internet Users";

  const homeValue = us?.median_home_value;
  const opportunityScore = null; // from us_zipcode if available

  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
      <h3 className="text-sm font-bold text-slate-800 mb-4">💰 Economic Profile</h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
        <KPICard label="Population" value={pop ? Number(pop).toLocaleString() : "—"} signal="neutral" />
        <KPICard label={incomeLabel} value={income ? `$${Number(income).toLocaleString()}` : "—"} signal={signalIncome(income)} />
        {age && <KPICard label="Median Age" value={`${age} yr`} signal="neutral" />}
        {poverty !== null && poverty !== undefined && (
          <KPICard label="Poverty Rate" value={`${poverty}%`} signal={signalPoverty(poverty)} />
        )}
        {unemployment !== null && unemployment !== undefined && (
          <KPICard label="Unemployment" value={`${unemployment}%`} signal={signalUnemployment(unemployment)} />
        )}
        {education !== null && education !== undefined && (
          <KPICard label={educationLabel} value={`${typeof education === 'number' ? education.toFixed(1) : education}%`} signal={signalEducation(education)} />
        )}
      </div>

      {isUS && homeValue && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KPICard label="Median Home Value" value={`$${Number(homeValue).toLocaleString()}`} signal="neutral" />
          {us?.median_gross_rent && <KPICard label="Median Gross Rent" value={`$${Number(us.median_gross_rent).toLocaleString()}`} signal="neutral" />}
          {us?.homeownership_rate && <KPICard label="Homeownership" value={`${us.homeownership_rate}%`} signal="neutral" />}
        </div>
      )}

      {!isUS && intl && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {intl.gdp_growth_pct !== null && <KPICard label="GDP Growth" value={`${intl.gdp_growth_pct?.toFixed(1)}%`} signal={intl.gdp_growth_pct > 3 ? "green" : intl.gdp_growth_pct > 0 ? "amber" : "red"} />}
          {intl.inflation_pct !== null && <KPICard label="Inflation" value={`${intl.inflation_pct?.toFixed(1)}%`} signal={intl.inflation_pct < 5 ? "green" : intl.inflation_pct < 15 ? "amber" : "red"} />}
          {intl.urban_population_pct !== null && <KPICard label="Urban Population" value={`${intl.urban_population_pct?.toFixed(1)}%`} signal="neutral" />}
          {intl.healthcare_spend_gdp_pct !== null && <KPICard label="Healthcare Spend" value={`${intl.healthcare_spend_gdp_pct?.toFixed(1)}% GDP`} signal={intl.healthcare_spend_gdp_pct > 5 ? "green" : "amber"} />}
        </div>
      )}
    </div>
  );
}