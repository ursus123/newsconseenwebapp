import React from "react";
import { History, MapPin } from "lucide-react";

export default function ResearchHistory({ history, onSelect }) {
  if (!history.length) return null;

  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm">
      <div className="flex items-center gap-2 mb-3">
        <History className="w-4 h-4 text-slate-400" />
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Recent Analyses</span>
      </div>
      <div className="flex flex-col gap-1">
        {history.map((entry, i) => (
          <button
            key={i}
            onClick={() => onSelect(entry)}
            className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-slate-50 transition-colors group"
          >
            <div className="flex items-start gap-2">
              <MapPin className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-700 truncate leading-snug">{entry.location}</p>
                <p className="text-xs text-slate-400 truncate">{entry.businessType}</p>
              </div>
              {entry.score !== undefined && (
                <span className={`ml-auto text-xs font-bold shrink-0 px-1.5 py-0.5 rounded-md ${
                  entry.score >= 70 ? "bg-emerald-50 text-emerald-700" :
                  entry.score >= 40 ? "bg-amber-50 text-amber-700" :
                  "bg-rose-50 text-rose-700"
                }`}>
                  {entry.score}
                </span>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}