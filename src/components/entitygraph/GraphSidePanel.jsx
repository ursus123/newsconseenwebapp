import React from "react";
import { Info } from "lucide-react";
import { NODE_CONFIG, LINK_COLORS } from "./graphConfig";

export default function GraphSidePanel({ nodes, links, selected, enterprises, people, services }) {
  const selectedNode = selected ? nodes.find((n) => n.id === selected) : null;
  const connectedLinks = selected ? links.filter((l) => l.source === selected || l.target === selected) : [];

  return (
    <div className="w-64 shrink-0 space-y-3 overflow-y-auto">
      {/* Stats */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Graph Stats</p>
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: "Enterprises", value: enterprises.length, color: "#6366f1" },
            { label: "People",      value: people.length,      color: "#0ea5e9" },
            { label: "Services",    value: services.length,    color: "#10b981" },
            { label: "Links",       value: links.length,       color: "#ec4899" },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-slate-50 rounded-xl px-3 py-2 text-center">
              <p className="text-lg font-bold" style={{ color }}>{value}</p>
              <p className="text-[10px] text-slate-400">{label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Selected node detail */}
      {selectedNode ? (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
          <div className="px-4 py-3 border-b border-slate-100" style={{ backgroundColor: NODE_CONFIG[selectedNode.type].bg }}>
            <div className="flex items-center gap-2">
              <span className="text-xl">{NODE_CONFIG[selectedNode.type].icon}</span>
              <div>
                <p className="font-bold text-sm" style={{ color: NODE_CONFIG[selectedNode.type].hex }}>{selectedNode.label}</p>
                <p className="text-[11px] text-slate-400 capitalize">{selectedNode.type}</p>
              </div>
            </div>
          </div>
          <div className="px-4 py-3 space-y-1.5">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Details</p>
            {selectedNode.type === "enterprise" && (
              <>
                {selectedNode.raw.enterprise_type && <p className="text-xs text-slate-600"><span className="text-slate-400">Type: </span>{selectedNode.raw.enterprise_type.replace(/_/g, " ")}</p>}
                {selectedNode.raw.status && <p className="text-xs text-slate-600"><span className="text-slate-400">Status: </span>{selectedNode.raw.status}</p>}
                {selectedNode.raw.city && <p className="text-xs text-slate-600"><span className="text-slate-400">City: </span>{selectedNode.raw.city}{selectedNode.raw.country ? `, ${selectedNode.raw.country}` : ""}</p>}
                {selectedNode.raw.phone && <p className="text-xs text-slate-600"><span className="text-slate-400">Phone: </span>{selectedNode.raw.phone}</p>}
                {selectedNode.raw.email && <p className="text-xs text-slate-600"><span className="text-slate-400">Email: </span>{selectedNode.raw.email}</p>}
                {selectedNode.raw.legal_structure && <p className="text-xs text-slate-600"><span className="text-slate-400">Legal: </span>{selectedNode.raw.legal_structure.replace(/_/g, " ")}</p>}
                {selectedNode.raw.operating_status && <p className="text-xs text-slate-600"><span className="text-slate-400">Operating: </span>{selectedNode.raw.operating_status.replace(/_/g, " ")}</p>}
              </>
            )}
            {selectedNode.type === "person" && (
              <>
                {selectedNode.raw.primary_role && <p className="text-xs text-slate-600"><span className="text-slate-400">Role: </span>{selectedNode.raw.primary_role}</p>}
                {selectedNode.raw.person_type && <p className="text-xs text-slate-600"><span className="text-slate-400">Type: </span>{selectedNode.raw.person_type}</p>}
                {selectedNode.raw.status && <p className="text-xs text-slate-600"><span className="text-slate-400">Status: </span>{selectedNode.raw.status}</p>}
                {selectedNode.raw.engagement_type && <p className="text-xs text-slate-600"><span className="text-slate-400">Engagement: </span>{selectedNode.raw.engagement_type.replace(/_/g, " ")}</p>}
                {selectedNode.raw.phone && <p className="text-xs text-slate-600"><span className="text-slate-400">Phone: </span>{selectedNode.raw.phone}</p>}
                {selectedNode.raw.email && <p className="text-xs text-slate-600"><span className="text-slate-400">Email: </span>{selectedNode.raw.email}</p>}
                {selectedNode.raw.city && <p className="text-xs text-slate-600"><span className="text-slate-400">City: </span>{selectedNode.raw.city}</p>}
              </>
            )}
            {selectedNode.type === "service" && (
              <>
                {selectedNode.raw.category && <p className="text-xs text-slate-600"><span className="text-slate-400">Category: </span>{selectedNode.raw.category.replace(/_/g, " ")}</p>}
                {selectedNode.raw.pricing_model && <p className="text-xs text-slate-600"><span className="text-slate-400">Pricing: </span>{selectedNode.raw.pricing_model.replace(/_/g, " ")}</p>}
                {selectedNode.raw.price != null && <p className="text-xs text-slate-600"><span className="text-slate-400">Price: </span>{selectedNode.raw.price}</p>}
                {selectedNode.raw.status && <p className="text-xs text-slate-600"><span className="text-slate-400">Status: </span>{selectedNode.raw.status}</p>}
                {selectedNode.raw.service_type && <p className="text-xs text-slate-600"><span className="text-slate-400">Service type: </span>{selectedNode.raw.service_type.replace(/_/g, " ")}</p>}
              </>
            )}
          </div>
          {connectedLinks.length > 0 && (
            <div className="px-4 pb-3">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Connections ({connectedLinks.length})</p>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {connectedLinks.map((l, i) => {
                  const otherId = l.source === selectedNode.id ? l.target : l.source;
                  const other = nodes.find((n) => n.id === otherId);
                  const dir = l.source === selectedNode.id ? "→" : "←";
                  return (
                    <div key={i} className="flex items-center gap-1.5 text-[11px] text-slate-600">
                      <span className="text-slate-400">{dir}</span>
                      <span className="font-medium truncate flex-1">{other?.label}</span>
                      <span className="text-[10px] text-slate-300 shrink-0">{l.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl p-4 text-center">
          <Info className="w-7 h-7 text-slate-200 mx-auto mb-2" />
          <p className="text-xs text-slate-400 font-medium">Click any node to inspect its connections</p>
        </div>
      )}

      {/* Legend */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-2">
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Node Types</p>
        {Object.entries(NODE_CONFIG).map(([type, cfg]) => (
          <div key={type} className="flex items-center gap-2 text-[11px] text-slate-600">
            <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: cfg.hex }} />
            {cfg.icon} {cfg.label}
          </div>
        ))}
        <div className="border-t border-slate-100 mt-2 pt-2 space-y-1.5">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Link Types</p>
          {Object.entries(LINK_COLORS).map(([label, color]) => (
            <div key={label} className="flex items-center gap-2 text-[11px] text-slate-600">
              <span className="w-5 h-0.5 rounded shrink-0" style={{ backgroundColor: color }} />
              {label}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}