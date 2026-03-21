import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Search } from "lucide-react";

const BUSINESS_TYPES = [
  { value: "home_healthcare", label: "Home Healthcare" },
  { value: "clinic", label: "Clinic" },
  { value: "pharmacy", label: "Pharmacy" },
  { value: "hospital", label: "Hospital" },
  { value: "nursing_home", label: "Nursing Home" },
  { value: "school", label: "School" },
  { value: "restaurant", label: "Restaurant" },
  { value: "hotel", label: "Hotel" },
  { value: "gym", label: "Gym" },
  { value: "childcare", label: "Childcare" },
  { value: "veterinary", label: "Veterinary" },
  { value: "coworking", label: "Coworking" },
  { value: "grocery", label: "Grocery Store" },
  { value: "mental_health", label: "Mental Health" },
  { value: "physiotherapy", label: "Physiotherapy" },
  { value: "dental", label: "Dental" },
  { value: "supermarket", label: "Supermarket" },
  { value: "bank", label: "Bank" },
  { value: "other", label: "Other" },
];

const RADII = [5, 10, 15, 20, 30, 50, 100];

export default function ResearchInputBar({ params, onChange, onRun, running }) {
  const handleKey = (e) => {
    if (e.key === "Enter") onRun();
  };

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
        <div className="sm:w-48">
          <label className="text-xs text-slate-400 mb-1 block">Business Type</label>
          <Select value={params.businessType} onValueChange={v => onChange({ ...params, businessType: v })}>
            <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BUSINESS_TYPES.map(b => (
                <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="sm:w-32">
          <label className="text-xs text-slate-400 mb-1 block">Radius</label>
          <Select value={String(params.radiusKm)} onValueChange={v => onChange({ ...params, radiusKm: parseInt(v) })}>
            <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RADII.map(r => (
                <SelectItem key={r} value={String(r)}>{r} km</SelectItem>
              ))}
            </SelectContent>
          </Select>
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