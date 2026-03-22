import React, { useState } from "react";
import { Loader2 } from "lucide-react";
import SectionSkeleton from "./SectionSkeleton";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Cell, ReferenceLine, LabelList
} from "recharts";

const BIZ_ROLE_LABEL = {
  home_healthcare: "Registered Nurse",
  clinic:          "Registered Nurse",
  pharmacy:        "Pharmacist",
  school:          "Teacher",
  restaurant:      "Restaurant Cook",
  nursing_home:    "Nursing Assistant",
  physiotherapy:   "Physical Therapist",
  mental_health:   "Social Worker",
  dental:          "Dentist",
};

function StatRow({ label, value, highlight }) {
  return (
    <div className={`flex items-center justify-between py-2 border-b border-slate-100 last:border-0 ${highlight ? "bg-emerald-50 -mx-3 px-3 rounded" : ""}`}>
      <span className="text-xs text-slate-500">{label}</span>
      <span className="text-xs font-semibold text-slate-800">{value}</span>
    </div>
  );
}

function DemandBadge({ signal }) {
  if (!signal) return null;
  const color =
    signal.includes("VERY HIGH") ? "bg-emerald-100 text-emerald-700" :
    signal.includes("HIGH")      ? "bg-emerald-50 text-emerald-600" :
    signal.includes("STABLE")    ? "bg-blue-50 text-blue-600" :
                                   "bg-rose-50 text-rose-600";
  return <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${color}`}>{signal}</span>;
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-xl px-3 py-2 shadow-lg text-xs">
      <p className="font-semibold text-slate-700 mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.fill || p.color }} className="font-medium">
          {p.name}: ${p.value?.toLocaleString?.()}
        </p>
      ))}
    </div>
  );
};

export default function LaborMarketSection({ data, businessType, stateName, loading }) {
  const [view, setView] = useState("chart"); // "chart" | "table"

  if (loading && !data) return <SectionSkeleton title="💼 Labor Market" />;
  if (!data?.length) return null;

  const wages = data[0];
  const note  = wages.note;

  // Salary comparison bar data
  const salaryData = [
    wages.entry_level_salary && { name: "Entry Level", value: wages.entry_level_salary, color: "#94a3b8" },
    wages.national_median_salary && { name: "National Median", value: wages.national_median_salary, color: "#6366f1" },
    wages.state_estimated_median && { name: `${wages.state || stateName || "State"} Est.`, value: wages.state_estimated_median, color: "#10b981" },
    wages.experienced_salary && { name: "Experienced", value: wages.experienced_salary, color: "#f59e0b" },
    wages.annual_employer_cost && { name: "Employer Cost", value: wages.annual_employer_cost, color: "#ef4444" },
  ].filter(Boolean);

  const growthColor = wages.job_growth_10yr_pct > 10 ? "#10b981" : wages.job_growth_10yr_pct > 0 ? "#f59e0b" : "#ef4444";

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-base font-semibold text-slate-800 flex items-center gap-2">
          💼 Labor Market{stateName ? ` — ${stateName}` : ""}
        </h3>
        <div className="flex gap-1">
          {["chart", "table"].map(v => (
            <button key={v} onClick={() => setView(v)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${view === v ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>
              {v === "chart" ? "📊 Chart" : "📋 Table"}
            </button>
          ))}
        </div>
      </div>
      <p className="text-xs text-slate-400 mb-4">Role: {BIZ_ROLE_LABEL[businessType] || wages.occupation}</p>

      {note ? (
        <p className="text-sm text-slate-500 bg-slate-50 rounded-xl p-3">{note}</p>
      ) : (
        <>
          {/* Summary KPI row always shown */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
            {wages.national_median_salary && (
              <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3">
                <p className="text-[10px] text-indigo-500 uppercase tracking-wide font-medium">National Median</p>
                <p className="text-lg font-black text-indigo-800">${wages.national_median_salary.toLocaleString()}</p>
                <p className="text-[10px] text-indigo-400">per year</p>
              </div>
            )}
            {wages.state_estimated_median && (
              <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3">
                <p className="text-[10px] text-emerald-500 uppercase tracking-wide font-medium">{wages.state || stateName || "State"} Est.</p>
                <p className="text-lg font-black text-emerald-800">${wages.state_estimated_median.toLocaleString()}</p>
                <p className="text-[10px] text-emerald-400">per year</p>
              </div>
            )}
            {wages.hourly_median && (
              <div className="bg-slate-50 border border-slate-100 rounded-xl p-3">
                <p className="text-[10px] text-slate-500 uppercase tracking-wide font-medium">Hourly Rate</p>
                <p className="text-lg font-black text-slate-800">${wages.hourly_median}</p>
                <p className="text-[10px] text-slate-400">per hour</p>
              </div>
            )}
            {wages.demand_signal && (
              <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 flex flex-col justify-between">
                <p className="text-[10px] text-slate-500 uppercase tracking-wide font-medium mb-1">Demand</p>
                <DemandBadge signal={wages.demand_signal} />
              </div>
            )}
          </div>

          {view === "chart" && salaryData.length > 1 && (
            <div>
              <p className="text-xs font-medium text-slate-500 mb-2">Salary Comparison by Experience Level</p>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={salaryData} barCategoryGap="25%">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#94a3b8" }} />
                  <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} width={44} />
                  <Tooltip content={<CustomTooltip />} />
                  {wages.national_median_salary && (
                    <ReferenceLine
                      y={wages.national_median_salary}
                      stroke="#6366f1"
                      strokeDasharray="5 3"
                      label={{ value: "Nat. Median", position: "insideTopRight", fontSize: 10, fill: "#6366f1" }}
                    />
                  )}
                  <Bar dataKey="value" radius={[6, 6, 0, 0]} name="Salary">
                    {salaryData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>

              {/* Job growth indicator */}
              {wages.job_growth_10yr_pct != null && (
                <div className="mt-4 flex items-center gap-3 bg-slate-50 rounded-xl px-4 py-3">
                  <div className="text-2xl font-black" style={{ color: growthColor }}>
                    {wages.job_growth_10yr_pct > 0 ? "+" : ""}{wages.job_growth_10yr_pct}%
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-700">10-Year Job Growth Projection</p>
                    {wages.annual_openings && (
                      <p className="text-xs text-slate-400">{wages.annual_openings.toLocaleString()} annual openings · {wages.hiring_difficulty || "—"} difficulty</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {view === "table" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="divide-y divide-slate-100">
                <StatRow label="National Median Salary"  value={wages.national_median_salary ? `$${wages.national_median_salary?.toLocaleString()}/yr` : "—"} />
                {wages.state_estimated_median && <StatRow label={`${wages.state || stateName || "State"} Estimated`} value={`$${wages.state_estimated_median?.toLocaleString()}/yr`} highlight />}
                <StatRow label="Hourly Rate"  value={wages.hourly_median ? `$${wages.hourly_median}/hr` : "—"} />
                <StatRow label="Entry Level"  value={wages.entry_level_salary ? `$${wages.entry_level_salary?.toLocaleString()}/yr` : "—"} />
                <StatRow label="Experienced"  value={wages.experienced_salary ? `$${wages.experienced_salary?.toLocaleString()}/yr` : "—"} />
              </div>
              <div className="divide-y divide-slate-100">
                <StatRow label="Hiring Difficulty"   value={wages.hiring_difficulty || "—"} />
                <StatRow label="Annual Openings"      value={wages.annual_openings ? wages.annual_openings.toLocaleString() : "—"} />
                <StatRow label="10-yr Job Growth"     value={wages.job_growth_10yr_pct != null ? `${wages.job_growth_10yr_pct > 0 ? "+" : ""}${wages.job_growth_10yr_pct}%` : "—"} />
                {wages.annual_employer_cost && <StatRow label="Total Employer Cost (est.)" value={`~$${wages.annual_employer_cost?.toLocaleString()}/yr`} highlight />}
              </div>
            </div>
          )}

          <p className="text-[10px] text-slate-400 mt-3">Source: {wages.data_source || "BLS Occupational Employment Statistics"}</p>
        </>
      )}

      {loading && (
        <div className="flex items-center gap-2 text-slate-400 mt-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          <span className="text-xs">Loading labor data…</span>
        </div>
      )}
    </div>
  );
}