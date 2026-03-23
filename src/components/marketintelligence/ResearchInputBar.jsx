import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Search } from "lucide-react";

const BUSINESS_TYPE_GROUPS = [
  {
    group: "🏥 Healthcare",
    types: [
      { value: "home_healthcare", label: "Home Healthcare" },
      { value: "clinic",          label: "Clinic / Medical Center" },
      { value: "pharmacy",        label: "Pharmacy" },
      { value: "nursing_home",    label: "Nursing Home / Care Facility" },
      { value: "hospital",        label: "Hospital" },
      { value: "dental",          label: "Dental Practice" },
      { value: "physiotherapy",   label: "Physical Therapy" },
      { value: "mental_health",   label: "Mental Health Services" },
      { value: "veterinary",      label: "Veterinary Clinic" },
    ]
  },
  {
    group: "🏫 Education",
    types: [
      { value: "school",          label: "School / Academy" },
      { value: "university",      label: "University / College" },
      { value: "childcare",       label: "Childcare / Daycare" },
      { value: "tutoring",        label: "Tutoring Center" },
      { value: "training_center", label: "Training / Vocational" },
    ]
  },
  {
    group: "⛪ Community & Faith",
    types: [
      { value: "church",           label: "Church / Christian" },
      { value: "mosque",           label: "Mosque / Islamic Center" },
      { value: "temple",           label: "Temple / Place of Worship" },
      { value: "community_center", label: "Community Center" },
      { value: "ngo_program",      label: "NGO / Nonprofit Program" },
      { value: "charity",          label: "Charity / Foundation" },
    ]
  },
  {
    group: "🌾 Agriculture",
    types: [
      { value: "livestock_farm",  label: "Livestock Farm" },
      { value: "crop_farm",       label: "Crop Farm / Plantation" },
      { value: "animal_barn",     label: "Animal Barn / Ranch" },
      { value: "aquaculture",     label: "Aquaculture / Fish Farm" },
    ]
  },
  {
    group: "💼 Business",
    types: [
      { value: "restaurant",      label: "Restaurant / Food Service" },
      { value: "hotel",           label: "Hotel / Hospitality" },
      { value: "gym",             label: "Gym / Fitness Center" },
      { value: "retail",          label: "Retail Store" },
      { value: "coworking",       label: "Coworking Space" },
    ]
  },
  {
    group: "✨ Other",
    types: [
      { value: "other",           label: "Other / Custom" },
    ]
  },
];

// Flat list for label lookup
const ALL_TYPES = BUSINESS_TYPE_GROUPS.flatMap(g => g.types);

const RADII = [5, 10, 15, 20, 30, 50, 100];

export default function ResearchInputBar({ params, onChange, onRun, running }) {
  const handleKey = (e) => {
    if (e.key === "Enter") onRun();
  };

  const selectedLabel = ALL_TYPES.find(t => t.value === params.businessType)?.label || params.businessType;

  return (
    <div className="bg-gradient-to-r from-slate-900 to-slate-800 rounded-2xl p-4 lg:p-5">
      <p className="text-slate-400 text-xs font-semibold uppercase tracking-widest mb-3 flex items-center gap-2">
        <Search className="w-3.5 h-3.5" /> Research Assistant
      </p>
      <div className="flex flex-col sm:flex-row gap-3 items-end">
        <div className="flex-1 min-w-0">
          <label className="text-xs text-slate-400 mb-1 block">Location</label>
          <Input
            placeholder="e.g. Des Moines Iowa, Lagos Nigeria, Kigali Rwanda"
            value={params.location}
            onChange={e => onChange({ ...params, location: e.target.value })}
            onKeyDown={handleKey}
            className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 focus:border-emerald-500"
          />
        </div>
        <div className="sm:w-52">
          <label className="text-xs text-slate-400 mb-1 block">Enterprise Type</label>
          <select
            value={params.businessType}
            onChange={e => onChange({ ...params, businessType: e.target.value })}
            className="w-full h-9 rounded-md border border-slate-700 bg-slate-800 text-white text-sm px-2 focus:outline-none focus:border-emerald-500"
          >
            {BUSINESS_TYPE_GROUPS.map(group => (
              <optgroup key={group.group} label={group.group}>
                {group.types.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
        <div className="sm:w-28">
          <label className="text-xs text-slate-400 mb-1 block">Radius</label>
          <select
            value={String(params.radiusKm)}
            onChange={e => onChange({ ...params, radiusKm: parseInt(e.target.value) })}
            className="w-full h-9 rounded-md border border-slate-700 bg-slate-800 text-white text-sm px-2 focus:outline-none focus:border-emerald-500"
          >
            {RADII.map(r => (
              <option key={r} value={String(r)}>{r} km</option>
            ))}
          </select>
        </div>
        <Button
          onClick={() => onRun()}
          disabled={running}
          className="bg-emerald-500 hover:bg-emerald-600 text-white shrink-0 h-9"
        >
          {running ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : "🚀"}
          {running ? "Analyzing..." : "Run Analysis"}
        </Button>
      </div>
    </div>
  );
}