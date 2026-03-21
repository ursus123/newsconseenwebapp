import React from "react";
import { NODE_CONFIG } from "./graphConfig";

// Icons for collapse state
const COLLAPSE_ICONS = {
  person:      "👥",
  product:     "📦",
  task:        "✅",
  transaction: "💳",
  service:     "⚙️",
  address:     "📍",
  enterprise:  "🏢",
};

export default function GraphFilterPanel({
  filter,
  setFilter,
  collapsedTypes,
  setCollapsedTypes,
  counts,           // { enterprise: N, person: N, ... }
  focusMode,
  setFocusMode,
  setFocusedEnterprise,
  depth,
  setDepth,
  nodeCount,
  linkCount,
}) {
  const toggleFilter = (type) => {
    setFilter(f => {
      const next = { ...f, [type]: !f[type] };
      // If turning off, also un-collapse
      if (!next[type]) {
        setCollapsedTypes(prev => { const s = new Set(prev); s.delete(type); return s; });
      }
      return next;
    });
  };

  const toggleCollapse = (type) => {
    setCollapsedTypes(prev => {
      const s = new Set(prev);
      if (s.has(type)) s.delete(type); else s.add(type);
      return s;
    });
  };

  return (
    <div className="w-52 shrink-0 flex flex-col overflow-hidden border border-slate-200 rounded-2xl bg-white">
      <div className="flex-1 overflow-y-auto p-3 space-y-3 flex flex-col">
      {/* Title */}
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Entity Types</p>

      {/* Per-type rows */}
      {Object.entries(NODE_CONFIG).map(([type, cfg]) => {
        const isOn = !!filter[type];
        const isCollapsed = collapsedTypes.has(type);
        const count = counts?.[type] ?? 0;

        return (
          <div key={type} className={`rounded-xl border transition-all ${isOn ? "border-slate-200 bg-slate-50" : "border-slate-100 bg-white opacity-50"}`}>
            {/* Row: toggle + label + count */}
            <div className="flex items-center gap-2 px-2 py-2">
              {/* On/Off toggle */}
              <button
                onClick={() => toggleFilter(type)}
                className="w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-all"
                style={{
                  backgroundColor: isOn ? cfg.hex : "transparent",
                  borderColor: isOn ? cfg.hex : "#cbd5e1",
                }}
                title={isOn ? "Hide" : "Show"}
              >
                {isOn && <span style={{ fontSize: 8, color: "#fff", fontWeight: 900, lineHeight: 1 }}>✓</span>}
              </button>

              {/* Icon + label */}
              <span style={{ fontSize: 14 }}>{cfg.icon}</span>
              <span className="text-xs font-medium text-slate-700 flex-1 capitalize">{cfg.label}</span>

              {/* Count badge */}
              {count > 0 && (
                <span className="text-[10px] font-bold rounded-full px-1.5 py-0.5"
                  style={{ backgroundColor: cfg.hex + "22", color: cfg.hex }}>
                  {count}
                </span>
              )}
            </div>

            {/* Collapse to one node — only when ON and count > 1 */}
            {isOn && count > 1 && type !== "enterprise" && (
              <div className="border-t border-slate-100 px-2 py-1.5 flex items-center gap-2">
                <button
                  onClick={() => toggleCollapse(type)}
                  className={`flex items-center gap-1.5 text-[10px] font-semibold rounded-lg px-2 py-1 transition-all w-full ${
                    isCollapsed
                      ? "text-white"
                      : "text-slate-500 bg-slate-100 hover:bg-slate-200"
                  }`}
                  style={isCollapsed ? { backgroundColor: cfg.hex } : {}}
                  title={isCollapsed ? "Expand — show individual nodes" : "Collapse all into one node"}
                >
                  <span>{isCollapsed ? "⊕" : "⊙"}</span>
                  {isCollapsed ? `1 node (${count})` : "Collapse all"}
                </button>
              </div>
            )}
          </div>
        );
      })}

      <div className="border-t border-slate-100 pt-2 flex flex-col gap-2">
        {/* Focus Mode */}
        <button
          onClick={() => { setFocusMode(v => !v); setFocusedEnterprise(null); }}
          className={`flex items-center gap-2 px-2 py-2 rounded-xl text-xs font-medium border transition-all w-full ${
            focusMode ? "bg-indigo-600 text-white border-indigo-600 shadow-sm" : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50"
          }`}
          title="Focus Mode: click an enterprise node to expand only its connections"
        >
          <span>🎯</span> Focus Mode
          {focusMode && <span className="ml-auto text-indigo-200 text-[10px]">ON</span>}
        </button>

        {/* Depth slider */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl px-2 py-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Depth</span>
            <span className="text-xs font-mono font-bold text-slate-700">{depth}</span>
          </div>
          <input
            type="range" min={1} max={3} value={depth}
            onChange={e => setDepth(Number(e.target.value))}
            className="w-full accent-indigo-500"
          />
          <div className="flex justify-between text-[9px] text-slate-400 mt-0.5">
            <span>Direct</span><span>Full</span>
          </div>
        </div>

        {/* Node count */}
        <div className={`text-[10px] px-2 py-1.5 rounded-xl border text-center font-medium ${
          nodeCount > 100 ? "text-amber-600 bg-amber-50 border-amber-200" : "text-slate-400 bg-slate-50 border-slate-200"
        }`}>
          {nodeCount} nodes · {linkCount} links
          {nodeCount > 100 && <div className="mt-0.5 text-amber-500">Use Focus / Collapse for clarity</div>}
        </div>
      </div>
    </div>
  );
}