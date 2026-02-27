import React from "react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

export default function LayerCard({ layerNumber, title, subtitle, color, fields, values, onChange, locked = false }) {
  const colorMap = {
    purple: { badge: "bg-purple-100 text-purple-700 border-purple-200", dot: "bg-purple-500", bar: "bg-purple-500" },
    blue:   { badge: "bg-blue-100 text-blue-700 border-blue-200",       dot: "bg-blue-500",   bar: "bg-blue-500" },
    sky:    { badge: "bg-sky-100 text-sky-700 border-sky-200",           dot: "bg-sky-500",    bar: "bg-sky-500" },
    rose:   { badge: "bg-rose-100 text-rose-700 border-rose-200",        dot: "bg-rose-500",   bar: "bg-rose-500" },
    amber:  { badge: "bg-amber-100 text-amber-700 border-amber-200",     dot: "bg-amber-500",  bar: "bg-amber-500" },
  };
  const c = colorMap[color] || colorMap.blue;

  return (
    <div className="rounded-2xl border border-slate-100 bg-white overflow-hidden">
      {/* Layer header */}
      <div className={`px-5 py-3 flex items-center gap-3 border-b border-slate-100 bg-slate-50`}>
        <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border ${c.badge}`}>
          Layer {layerNumber}
        </span>
        <div>
          <p className="text-sm font-bold text-slate-800">{title}</p>
          <p className="text-xs text-slate-400">{subtitle}</p>
        </div>
      </div>

      {/* Fields */}
      <div className="px-5 py-4 space-y-3">
        {fields.map(({ key, label, desc, alwaysOn }) => {
          const checked = alwaysOn ? true : (values?.[key] ?? false);
          return (
            <div key={key} className="flex items-center justify-between gap-4">
              <div>
                <Label className={`text-sm font-medium ${alwaysOn ? "text-slate-400" : "text-slate-700"}`}>{label}</Label>
                {desc && <p className="text-xs text-slate-400">{desc}</p>}
              </div>
              <Switch
                checked={checked}
                disabled={locked || alwaysOn}
                onCheckedChange={(v) => !alwaysOn && !locked && onChange(key, v)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}