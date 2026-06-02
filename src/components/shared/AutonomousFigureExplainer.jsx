import React, { useMemo, useState } from "react";
import { Activity, X } from "lucide-react";

function formatFigureValue(value) {
  if (value == null || value === "") return "0";
  if (typeof value === "number") return value.toLocaleString();
  return String(value);
}

export default function AutonomousFigureExplainer({ entity, label, value, context }) {
  const [open, setOpen] = useState(false);
  const formattedValue = formatFigureValue(value);
  const explanation = useMemo(() => {
    const entityName = entity || "this entity";
    const figureLabel = label || "this figure";
    const contextLine = context ? ` ${context}` : "";

    return [
      `${entityName}: ${figureLabel} is ${formattedValue}.`,
      `Idjwi Autonomous Mode is explaining this directly from the visible ${entityName.toLowerCase()} records and filters.${contextLine}`,
      "No Advisor or external LLM was used for this explanation.",
    ];
  }, [context, entity, formattedValue, label]);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-700 hover:bg-emerald-100"
        title="Explain with Idjwi Autonomous Mode"
      >
        <Activity className="h-3 w-3" />
        Explain
      </button>

      {open && (
        <div className="absolute right-0 top-8 z-30 w-72 rounded-lg border border-emerald-200 bg-white p-3 shadow-xl">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                <Activity className="h-3.5 w-3.5" />
                Idjwi Autonomous
              </div>
              <p className="mt-1 text-[11px] text-slate-500">Default figure explainer</p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              title="Close"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="mt-3 space-y-2 text-xs leading-5 text-slate-700">
            {explanation.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
