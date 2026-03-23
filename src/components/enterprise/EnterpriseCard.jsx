import React from "react";
import { Badge } from "@/components/ui/badge";
import { getTypeConfig, typeColor } from "./typeConfig";

const statusColor = (s) => ({
  active:   "bg-emerald-50 text-emerald-700",
  inactive: "bg-slate-100 text-slate-600",
  prospect: "bg-blue-50 text-blue-700",
  archived: "bg-slate-100 text-slate-400",
}[s] || "bg-slate-100 text-slate-600");

function accentColor(cfg) {
  const c = cfg.color;
  if (c.includes("blue"))    return "bg-blue-400";
  if (c.includes("emerald")) return "bg-emerald-400";
  if (c.includes("violet"))  return "bg-violet-400";
  if (c.includes("lime"))    return "bg-lime-400";
  if (c.includes("amber"))   return "bg-amber-400";
  if (c.includes("purple"))  return "bg-purple-400";
  if (c.includes("rose"))    return "bg-rose-400";
  if (c.includes("teal"))    return "bg-teal-400";
  if (c.includes("cyan"))    return "bg-cyan-400";
  if (c.includes("orange"))  return "bg-orange-400";
  if (c.includes("indigo"))  return "bg-indigo-400";
  if (c.includes("green"))   return "bg-green-400";
  if (c.includes("pink"))    return "bg-pink-400";
  return "bg-slate-300";
}

export default function EnterpriseCard({ enterprise, onEdit, onDelete }) {
  const cfg = getTypeConfig(enterprise.enterprise_type);
  const location = [enterprise.city, enterprise.region, enterprise.country].filter(Boolean).join(", ");

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden hover:shadow-md transition-all">
      <div className={`h-1.5 ${accentColor(cfg)}`} />
      <div className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl ${cfg.color}`}>
              {cfg.icon}
            </div>
            <div>
              <h3 className="font-bold text-slate-800 text-sm leading-tight">{enterprise.enterprise_name}</h3>
              {location && <p className="text-[10px] text-slate-400 mt-0.5">{location}</p>}
            </div>
          </div>
          <Badge className={statusColor(enterprise.status)}>
            {(enterprise.status || "active").replace(/_/g, " ")}
          </Badge>
        </div>

        {/* Type badge */}
        <div className="mb-3">
          <Badge className={cfg.color}>{cfg.icon} {cfg.label}</Badge>
        </div>

        {/* Contact */}
        {(enterprise.phone || enterprise.email) && (
          <div className="text-xs text-slate-400 mb-3 space-y-0.5">
            {enterprise.phone && <p>📞 {enterprise.phone}</p>}
            {enterprise.email && <p>✉️ {enterprise.email}</p>}
          </div>
        )}

        {/* Description */}
        {enterprise.description && (
          <p className="text-xs text-slate-400 mb-3 line-clamp-2">{enterprise.description}</p>
        )}

        {/* Actions */}
        {(onEdit || onDelete) && (
          <div className="flex gap-2 pt-3 border-t border-slate-100">
            {onEdit && (
              <button
                onClick={onEdit}
                className="flex-1 text-xs font-medium text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 py-1.5 rounded-xl transition-all text-center"
              >
                ✏️ Edit
              </button>
            )}
            {onDelete && (
              <button
                onClick={onDelete}
                className="text-xs font-medium text-slate-400 hover:text-rose-500 hover:bg-rose-50 px-3 py-1.5 rounded-xl transition-all"
              >
                🗑️
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}