import React from "react";
import { Clock } from "lucide-react";
import { COLOR_MAP } from "./appRegistry";

export default function RecentlyUsed({ apps, onLaunch }) {
  if (!apps || apps.length === 0) return null;

  return (
    <div className="mb-8">
      <div className="flex items-center gap-2 mb-3">
        <Clock className="w-4 h-4 text-slate-400" />
        <span className="text-sm font-semibold text-slate-600">Jump back in →</span>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-hide">
        {apps.map((app) => {
          const colors = COLOR_MAP[app.color] || COLOR_MAP.slate;
          return (
            <button
              key={app.id}
              onClick={() => onLaunch(app)}
              className="flex-shrink-0 flex items-center gap-3 bg-white border border-slate-200 rounded-xl px-4 py-3 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 min-w-[180px]"
            >
              <span className="text-2xl">{app.emoji}</span>
              <div className="text-left">
                <p className="text-xs font-semibold text-slate-800 leading-tight">{app.name}</p>
                <span className={`text-[10px] font-medium ${colors.text}`}>{app.category}</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}