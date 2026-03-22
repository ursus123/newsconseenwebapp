import React from "react";
import { Loader2 } from "lucide-react";
import SectionSkeleton from "./SectionSkeleton";

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

export default function LaborMarketSection({ data, businessType, stateName, loading }) {
  if (loading && !data) return <SectionSkeleton title="💼 Labor Market" />;
  if (!data?.length) return null;

  const wages = data[0];
  const note  = wages.note;

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5">
      <h3 className="text-base font-semibold text-slate-800 mb-1 flex items-center gap-2">
        💼 Labor Market{stateName ? ` — ${stateName}` : ""}
      </h3>
      <p className="text-xs text-slate-400 mb-4">
        Role: {BIZ_ROLE_LABEL[businessType] || wages.occupation}
      </p>

      {note ? (
        <p className="text-sm text-slate-500 bg-slate-50 rounded-xl p-3">{note}</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <div className="divide-y divide-slate-100">
              <StatRow label="National Median Salary"  value={wages.national_median_salary ? `$${wages.national_median_salary?.toLocaleString()}/yr` : "—"} />
              {wages.state_estimated_median && (
                <StatRow
                  label={`${wages.state || stateName || "State"} Estimated`}
                  value={`$${wages.state_estimated_median?.toLocaleString()}/yr`}
                  highlight
                />
              )}
              <StatRow label="Hourly Rate"  value={wages.hourly_median ? `$${wages.hourly_median}/hr` : "—"} />
              <StatRow label="Entry Level"  value={wages.entry_level_salary ? `$${wages.entry_level_salary?.toLocaleString()}/yr` : "—"} />
              <StatRow label="Experienced"  value={wages.experienced_salary ? `$${wages.experienced_salary?.toLocaleString()}/yr` : "—"} />
            </div>
          </div>

          <div>
            <div className="divide-y divide-slate-100">
              {wages.demand_signal && (
                <div className="flex flex-col gap-1 py-2 border-b border-slate-100">
                  <span className="text-xs text-slate-500">Demand Signal</span>
                  <DemandBadge signal={wages.demand_signal} />
                </div>
              )}
              <StatRow label="Hiring Difficulty"   value={wages.hiring_difficulty || "—"} />
              <StatRow label="Annual Openings"      value={wages.annual_openings ? wages.annual_openings.toLocaleString() : "—"} />
              <StatRow label="10-yr Job Growth"     value={wages.job_growth_10yr_pct != null ? `${wages.job_growth_10yr_pct > 0 ? "+" : ""}${wages.job_growth_10yr_pct}%` : "—"} />
              {wages.annual_employer_cost && (
                <StatRow
                  label="Total Employer Cost (est.)"
                  value={`~$${wages.annual_employer_cost?.toLocaleString()}/yr`}
                  highlight
                />
              )}
            </div>
          </div>

          <div className="sm:col-span-2">
            <p className="text-[10px] text-slate-400">Source: {wages.data_source || "BLS Occupational Employment Statistics"}</p>
          </div>
        </div>
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