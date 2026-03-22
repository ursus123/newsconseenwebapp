import React from "react";
import { getTermsFromEnterpriseType } from "@/config/enterpriseTerminology";

const COUNTRIES = [
  "United States", "United Kingdom", "Canada", "Australia", "Germany",
  "France", "Netherlands", "South Africa", "Nigeria", "Kenya",
  "Ghana", "India", "Brazil", "Mexico", "Singapore", "Other",
];

const TYPE_EMOJI = {
  healthcare: "🏥", education: "🏫", community: "⛪", agriculture: "🌾",
  retail: "💼", government: "🏛️", nonprofit: "🤝", other: "✨",
};

export default function StepWorkspace({ data, onChange, errors }) {
  const terms = getTermsFromEnterpriseType(data.industry || "other");
  const emoji = TYPE_EMOJI[data.industry] || "🏢";

  const field = (key) => ({
    value: data[key] || "",
    onChange: (e) => onChange({ ...data, [key]: e.target.value }),
  });

  const inputCls = (key) =>
    `w-full px-3 py-2.5 rounded-xl border text-sm outline-none transition-colors
    ${errors[key] ? "border-red-400 bg-red-50" : "border-slate-200 focus:border-emerald-400 bg-white"}`;

  return (
    <div className="space-y-4">
      <div className="text-center mb-6">
        <div className="text-5xl mb-3">{emoji}</div>
        <h2 className="text-xl font-bold text-slate-800">Name your enterprise</h2>
        <p className="text-slate-500 text-sm mt-1">Tell us a bit about your organization</p>
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-600 mb-1.5">Enterprise Name *</label>
        <input
          className={inputCls("org_name")}
          placeholder={`e.g. Sunrise ${data.industry === "healthcare" ? "Care" : data.industry === "education" ? "Academy" : "Enterprise"}`}
          {...field("org_name")}
        />
        {errors.org_name && <p className="text-xs text-red-500 mt-1">{errors.org_name}</p>}
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-600 mb-1.5">Purpose (one sentence)</label>
        <input
          className={inputCls("purpose")}
          placeholder={`What does your ${data.industry || "organization"} do?`}
          {...field("purpose")}
        />
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-600 mb-1.5">Country *</label>
        <select className={inputCls("country")} {...field("country")}>
          <option value="">Select country…</option>
          {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        {errors.country && <p className="text-xs text-red-500 mt-1">{errors.country}</p>}
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-600 mb-1.5">City</label>
        <input className={inputCls("city")} placeholder="e.g. Portland" {...field("city")} />
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-600 mb-1.5">Your Name *</label>
        <input className={inputCls("full_name")} placeholder="Your full name" {...field("full_name")} />
        {errors.full_name && <p className="text-xs text-red-500 mt-1">{errors.full_name}</p>}
      </div>
    </div>
  );
}