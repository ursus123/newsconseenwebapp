import React from "react";

const ENTERPRISE_TYPES = [
  {
    value: "healthcare",
    emoji: "🏥",
    label: "Healthcare",
    examples: "Care homes · Clinics · Home health",
    color: "border-rose-200 bg-rose-50 hover:border-rose-400",
    selectedColor: "border-rose-500 bg-rose-100 ring-2 ring-rose-300",
  },
  {
    value: "education",
    emoji: "🏫",
    label: "Education",
    examples: "Schools · Training · Tutoring",
    color: "border-blue-200 bg-blue-50 hover:border-blue-400",
    selectedColor: "border-blue-500 bg-blue-100 ring-2 ring-blue-300",
  },
  {
    value: "community",
    emoji: "⛪",
    label: "Community",
    examples: "Churches · Groups · NGOs",
    color: "border-purple-200 bg-purple-50 hover:border-purple-400",
    selectedColor: "border-purple-500 bg-purple-100 ring-2 ring-purple-300",
  },
  {
    value: "agriculture",
    emoji: "🌾",
    label: "Agriculture",
    examples: "Farms · Barns · Livestock",
    color: "border-green-200 bg-green-50 hover:border-green-400",
    selectedColor: "border-green-500 bg-green-100 ring-2 ring-green-300",
  },
  {
    value: "retail",
    emoji: "💼",
    label: "Business",
    examples: "Companies · Retail · Franchises",
    color: "border-amber-200 bg-amber-50 hover:border-amber-400",
    selectedColor: "border-amber-500 bg-amber-100 ring-2 ring-amber-300",
  },
  {
    value: "government",
    emoji: "🏛️",
    label: "Government",
    examples: "Agencies · Councils · Departments",
    color: "border-slate-200 bg-slate-50 hover:border-slate-400",
    selectedColor: "border-slate-600 bg-slate-100 ring-2 ring-slate-400",
  },
  {
    value: "nonprofit",
    emoji: "🤝",
    label: "Nonprofit",
    examples: "NGOs · Charities · Foundations",
    color: "border-teal-200 bg-teal-50 hover:border-teal-400",
    selectedColor: "border-teal-500 bg-teal-100 ring-2 ring-teal-300",
  },
  {
    value: "other",
    emoji: "✨",
    label: "Other",
    examples: "Anything else",
    color: "border-indigo-200 bg-indigo-50 hover:border-indigo-400",
    selectedColor: "border-indigo-500 bg-indigo-100 ring-2 ring-indigo-300",
  },
];

export default function StepEnterpriseType({ selected, onSelect }) {
  return (
    <div className="space-y-5">
      <div className="text-center">
        <div className="text-5xl mb-3">🌐</div>
        <h2 className="text-xl font-bold text-slate-800">Welcome to Newsconseen</h2>
        <p className="text-slate-500 text-sm mt-1">What kind of enterprise are you running?</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {ENTERPRISE_TYPES.map((type) => {
          const isSelected = selected === type.value;
          return (
            <button
              key={type.value}
              onClick={() => onSelect(type.value)}
              className={`relative flex flex-col items-center text-center p-4 rounded-2xl border-2 transition-all cursor-pointer
                ${isSelected ? type.selectedColor : type.color}`}
            >
              {isSelected && (
                <div className="absolute top-2 right-2 w-5 h-5 bg-emerald-500 rounded-full flex items-center justify-center">
                  <span className="text-white text-[10px] font-bold">✓</span>
                </div>
              )}
              <span className="text-3xl mb-1.5">{type.emoji}</span>
              <span className="font-bold text-slate-800 text-sm">{type.label}</span>
              <span className="text-[11px] text-slate-500 mt-0.5 leading-tight">{type.examples}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}