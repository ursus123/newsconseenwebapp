import React from "react";
import { Button } from "@/components/ui/button";

/**
 * Shared empty-state block for list pages and inbox-style views.
 *
 * @param {object} props
 * @param {React.ComponentType} props.icon
 * @param {string} props.title      - primary message (falls back to `message` for callers migrating from the old local pattern)
 * @param {string} [props.message]  - alias for `title`
 * @param {string} [props.subtitle] - secondary line (falls back to `sub`)
 * @param {string} [props.sub]      - alias for `subtitle`
 * @param {{label: string, onClick: () => void, variant?: string}[]} [props.actions]
 */
export default function EmptyState({ icon: Icon, title, message, subtitle, sub, actions = [] }) {
  const heading = title || message;
  const caption = subtitle || sub;

  return (
    <div className="flex flex-col items-center justify-center py-16 text-center border-2 border-dashed border-slate-100 rounded-2xl">
      {Icon && (
        <div className="w-14 h-14 rounded-2xl bg-slate-50 flex items-center justify-center mb-3">
          <Icon className="w-7 h-7 text-slate-300" />
        </div>
      )}
      {heading && <p className="text-slate-500 font-semibold mb-1">{heading}</p>}
      {caption && <p className="text-slate-400 text-sm max-w-sm mb-4">{caption}</p>}
      {actions.length > 0 && (
        <div className="flex gap-2">
          {actions.map((a) => (
            <Button
              key={a.label}
              size="sm"
              variant={a.variant || "default"}
              onClick={a.onClick}
              className={a.variant ? "rounded-xl" : "bg-emerald-600 hover:bg-emerald-700 rounded-xl"}
            >
              {a.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
