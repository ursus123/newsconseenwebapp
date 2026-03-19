import React from "react";

const INDUSTRIES = [
  { value: "healthcare", label: "Healthcare" },
  { value: "education", label: "Education" },
  { value: "social_services", label: "Social Services" },
  { value: "retail", label: "Retail" },
  { value: "consulting", label: "Consulting" },
  { value: "logistics", label: "Logistics" },
  { value: "manufacturing", label: "Manufacturing" },
  { value: "other", label: "Other" },
];

const STAFF_SIZES = [
  { value: "1", label: "Just me" },
  { value: "2-5", label: "2–5" },
  { value: "6-20", label: "6–20" },
  { value: "21-50", label: "21–50" },
  { value: "50+", label: "50+" },
];

const COUNTRIES = [
  "United States", "United Kingdom", "Canada", "Australia", "Germany",
  "France", "Netherlands", "South Africa", "Nigeria", "Kenya",
  "Ghana", "India", "Brazil", "Mexico", "Singapore", "Other",
];

export default function StepWorkspace({ data, onChange, errors }) {
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
        <div className="text-5xl mb-3">🏢</div>
        <h2 className="text-xl font-bold text-slate-800">Set up your workspace</h2>
        <p className="text-slate-500 text-sm mt-1">Tell us about your organization</p>
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-600 mb-1.5">Organization Name *</label>
        <input className={inputCls("org_name")} placeholder="e.g. Sunrise Healthcare" {...field("org_name")} />
        {errors.org_name && <p className="text-xs text-red-500 mt-1">{errors.org_name}</p>}
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-600 mb-1.5">Industry *</label>
        <select className={inputCls("industry")} {...field("industry")}>
          <option value="">Select industry…</option>
          {INDUSTRIES.map((i) => <option key={i.value} value={i.value}>{i.label}</option>)}
        </select>
        {errors.industry && <p className="text-xs text-red-500 mt-1">{errors.industry}</p>}
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
        <label className="block text-xs font-semibold text-slate-600 mb-1.5">Number of Staff</label>
        <select className={inputCls("staff_size")} {...field("staff_size")}>
          <option value="">Select…</option>
          {STAFF_SIZES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-600 mb-1.5">Your Name *</label>
        <input className={inputCls("full_name")} placeholder="Your full name" {...field("full_name")} />
        {errors.full_name && <p className="text-xs text-red-500 mt-1">{errors.full_name}</p>}
      </div>
    </div>
  );
}