import React from "react";
import { Lock, Sparkles } from "lucide-react";
import { COLOR_MAP, ONTOLOGY_MAP } from "./appRegistry";

const PLAN_LABELS = { starter: "Starter", professional: "Professional", consultant: "Consultant" };

function OntologyBadge({ typeKey }) {
  const t = ONTOLOGY_MAP[typeKey];
  if (!t) return null;
  const Icon = t.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full ${t.bg} ${t.color} border ${t.border}`}>
      <Icon className="w-2 h-2" />{typeKey}
    </span>
  );
}

export default function AppCard({ app, isLocked, onLaunch, onUpgrade }) {
  const colors = COLOR_MAP[app.color] || COLOR_MAP.slate;

  const handleClick = () => {
    if (isLocked) {
      onUpgrade(app);
    } else {
      onLaunch(app);
    }
  };

  return (
    <div
      onClick={handleClick}
      className="group relative bg-white border border-slate-200 rounded-2xl p-5 flex flex-col gap-4 cursor-pointer hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200"
    >
      {/* Top row: icon + badges */}
      <div className="flex items-start justify-between">
        <div className={`w-14 h-14 rounded-xl border flex items-center justify-center text-3xl ${colors.icon}`}>
          {app.emoji}
        </div>
        <div className="flex flex-col items-end gap-1">
          {app.isNew && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold uppercase tracking-wide">
              <Sparkles className="w-2.5 h-2.5" /> New
            </span>
          )}
          {isLocked && (
            <div className="p-1.5 rounded-full bg-slate-100 text-slate-400" title={`Upgrade to ${PLAN_LABELS[app.plan]}`}>
              <Lock className="w-3.5 h-3.5" />
            </div>
          )}
        </div>
      </div>

      {/* Middle: name, category, description */}
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-1">
          <h3 className="font-semibold text-slate-800 text-sm leading-tight">{app.name}</h3>
        </div>
        <span className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-semibold mb-2 ${colors.bg} ${colors.text}`}>
          {app.category}
        </span>
        <p className="text-xs text-slate-500 leading-relaxed line-clamp-2">{app.description}</p>
      </div>

      {/* Ontology object badges */}
      {app.ontologyObjects && app.ontologyObjects.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {app.ontologyObjects.map((key) => (
            <OntologyBadge key={key} typeKey={key} />
          ))}
        </div>
      )}

      {/* Bottom: launch button */}
      {isLocked ? (
        <button
          className="w-full py-2 rounded-xl text-xs font-medium bg-slate-100 text-slate-400 cursor-pointer"
          onClick={handleClick}
        >
          Upgrade to {PLAN_LABELS[app.plan]} to unlock
        </button>
      ) : (
        <button
          className={`w-full py-2 rounded-xl text-xs font-medium text-white transition-colors ${colors.btn}`}
          onClick={handleClick}
        >
          Launch →
        </button>
      )}
    </div>
  );
}
