import React, { useState, useRef, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { MapPin, ZoomIn, ZoomOut, Maximize2,
         RefreshCw, AlertTriangle, CheckCircle } from "lucide-react";

const RAILWAY_URL = "https://newsconseenwebapp-production.up.railway.app";

// ----------------------------------------------------------
// Health grade → visual config
// ----------------------------------------------------------
const GRADE_CONFIG = {
  A: { fill: "#10b981", stroke: "#059669", glow: "rgba(16,185,129,0.4)" },
  B: { fill: "#3b82f6", stroke: "#2563eb", glow: "rgba(59,130,246,0.4)" },
  C: { fill: "#f59e0b", stroke: "#d97706", glow: "rgba(245,158,11,0.4)"  },
  D: { fill: "#ef4444", stroke: "#dc2626", glow: "rgba(239,68,68,0.4)"   },
  "?":{ fill: "#94a3b8", stroke: "#64748b", glow: "rgba(148,163,184,0.3)"},
};

// ----------------------------------------------------------
// Simple Mercator projection helpers
// ----------------------------------------------------------
function mercatorX(lng, viewW, minLng, maxLng) {
  return ((lng - minLng) / (maxLng - minLng)) * viewW;
}

function mercatorY(lat, viewH, minLat, maxLat) {
  // Flip: SVG y grows downward, lat grows upward
  return ((maxLat - lat) / (maxLat - minLat)) * viewH;
}

function project(locations, width, height, padding = 48) {
  if (!locations.length) return [];

  const lats = locations.map(l => l.latitude);
  const lngs = locations.map(l => l.longitude);

  let minLat = Math.min(...lats) - 2;
  let maxLat = Math.max(...lats) + 2;
  let minLng = Math.min(...lngs) - 2;
  let maxLng = Math.max(...lngs) + 2;

  // Ensure minimum bounding box so single-point doesn't collapse
  if (maxLat - minLat < 5) { minLat -= 2.5; maxLat += 2.5; }
  if (maxLng - minLng < 5) { minLng -= 2.5; maxLng += 2.5; }

  const w = width  - padding * 2;
  const h = height - padding * 2;

  return locations.map(loc => ({
    ...loc,
    x: padding + mercatorX(loc.longitude, w, minLng, maxLng),
    y: padding + mercatorY(loc.latitude,  h, minLat, maxLat),
  }));
}

// ----------------------------------------------------------
// Tooltip
// ----------------------------------------------------------
function Tooltip({ member, x, y, containerW }) {
  if (!member) return null;
  const cfg    = GRADE_CONFIG[member.health_grade || "?"];
  const flipX  = x > containerW * 0.65;
  const alerts = (member.health_signals || []).filter(s => s.type === "critical");

  return (
    <div
      className="absolute z-20 pointer-events-none"
      style={{
        left:      flipX ? "auto" : x + 14,
        right:     flipX ? containerW - x + 14 : "auto",
        top:       y - 12,
        minWidth:  200,
        maxWidth:  260,
      }}
    >
      <div className="bg-slate-900/95 backdrop-blur-sm rounded-xl p-3 shadow-2xl border border-slate-700/50">
        <div className="flex items-center gap-2 mb-2">
          <div
            className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
            style={{ background: cfg.fill }}
          >
            {member.health_grade || "?"}
          </div>
          <span className="text-white text-sm font-semibold truncate">{member.name}</span>
        </div>

        <div className="space-y-1 text-xs">
          {member.health_score != null && (
            <div className="flex justify-between">
              <span className="text-slate-400">Health score</span>
              <span className="text-white font-medium">{member.health_score}/100</span>
            </div>
          )}
          {member.people_active != null && (
            <div className="flex justify-between">
              <span className="text-slate-400">Active people</span>
              <span className="text-white">{member.people_active.toLocaleString()}</span>
            </div>
          )}
          {member.task_completion != null && (
            <div className="flex justify-between">
              <span className="text-slate-400">Task completion</span>
              <span className="text-white">{member.task_completion?.toFixed(0)}%</span>
            </div>
          )}
          {member.revenue_30d != null && (
            <div className="flex justify-between">
              <span className="text-slate-400">Revenue (30d)</span>
              <span className="text-white">
                {member.revenue_30d.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </span>
            </div>
          )}
          {member.expiring_7d > 0 && (
            <div className="flex justify-between text-rose-400">
              <span>Expiring (7d)</span>
              <span className="font-medium">🔴 {member.expiring_7d} items</span>
            </div>
          )}
        </div>

        {alerts.length > 0 && (
          <div className="mt-2 pt-2 border-t border-slate-700 space-y-0.5">
            {alerts.slice(0, 2).map((a, i) => (
              <p key={i} className="text-[10px] text-rose-400">⚠ {a.message}</p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ----------------------------------------------------------
// Legend
// ----------------------------------------------------------
function Legend() {
  return (
    <div className="absolute bottom-4 left-4 bg-slate-900/90 backdrop-blur-sm rounded-xl px-3 py-2.5 border border-slate-700/50">
      <p className="text-[10px] text-slate-400 uppercase tracking-widest mb-2">Health grade</p>
      <div className="space-y-1.5">
        {Object.entries(GRADE_CONFIG).filter(([k]) => k !== "?").map(([grade, cfg]) => (
          <div key={grade} className="flex items-center gap-2">
            <div
              className="w-3.5 h-3.5 rounded-full"
              style={{ background: cfg.fill }}
            />
            <span className="text-xs text-slate-300">
              {grade === "A" ? "A — Excellent (85+)" :
               grade === "B" ? "B — Good (70–84)" :
               grade === "C" ? "C — Fair (50–69)" :
               "D — Needs attention (<50)"}
            </span>
          </div>
        ))}
        <div className="flex items-center gap-2">
          <div className="w-3.5 h-3.5 rounded-full bg-slate-400" />
          <span className="text-xs text-slate-400">No data</span>
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------------
// Main NetworkMap
// ----------------------------------------------------------
export default function NetworkMap({ networkId, currentUser, height = 520 }) {
  const containerRef     = useRef(null);
  const [dims, setDims]  = useState({ w: 800, h: height });
  const [hovered, setHovered]   = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const [selected, setSelected] = useState(null);
  const [zoom, setZoom]  = useState(1);

  const nid = networkId || currentUser?.network_company_id;

  // Observe container size
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(entries => {
      const { width } = entries[0].contentRect;
      setDims({ w: width, h: height });
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [height]);

  // Fetch overview (contains locations)
  const { data: overview, isLoading, refetch } = useQuery({
    queryKey: ["network-overview-map", nid],
    queryFn:  async () => {
      const r = await fetch(`${RAILWAY_URL}/network/overview?network_id=${nid}`);
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    enabled:   !!nid,
    staleTime: 5 * 60 * 1000,
  });

  // Fetch member summaries for health grades
  const { data: membersData } = useQuery({
    queryKey: ["network-members-map", nid],
    queryFn:  async () => {
      const r = await fetch(`${RAILWAY_URL}/network/members?network_id=${nid}`);
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    enabled:   !!nid,
    staleTime: 5 * 60 * 1000,
  });

  // Build member lookup by company_id
  const memberIndex = useMemo(() => {
    const idx = {};
    for (const m of membersData?.members || []) {
      idx[m.company_id] = m;
    }
    return idx;
  }, [membersData]);

  // Project locations onto canvas
  const projected = useMemo(() => {
    const locations = (overview?.locations || []).filter(
      l => l.latitude && l.longitude
    );
    return project(locations, dims.w, dims.h);
  }, [overview, dims]);

  // Enrich projected points with member data
  const enriched = useMemo(() =>
    projected.map(pt => ({
      ...pt,
      ...(memberIndex[pt.company_id] || {}),
    })),
    [projected, memberIndex]
  );

  const handleMouseMove = (e, point) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setHovered(point);
    setTooltipPos({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  };

  if (!nid) {
    return (
      <div className="flex items-center justify-center h-48 text-slate-400 text-sm">
        No network ID configured.
      </div>
    );
  }

  const alerts    = overview?.alerts || [];
  const criticals = alerts.filter(a => a.level === "critical");

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2">
            <MapPin className="w-4 h-4 text-indigo-500" />
            Network Map
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            {enriched.length} locations · colour by health grade
          </p>
        </div>
        <div className="flex items-center gap-2">
          {criticals.length > 0 && (
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-medium">
              <AlertTriangle className="w-3 h-3" />
              {criticals.length} critical
            </div>
          )}
          <button
            onClick={() => refetch()}
            className="p-1.5 rounded-lg bg-white border border-slate-200 text-slate-400 hover:text-slate-600"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Map canvas */}
      <div
        ref={containerRef}
        className="relative bg-slate-900 rounded-2xl overflow-hidden border border-slate-800"
        style={{ height }}
      >
        {/* Grid lines (subtle graticule effect) */}
        <svg
          className="absolute inset-0 w-full h-full opacity-10"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <pattern id="grid" width="80" height="80" patternUnits="userSpaceOnUse">
              <path d="M 80 0 L 0 0 0 80" fill="none" stroke="#94a3b8" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>

        {/* Continent silhouette — subtle background texture */}
        <div className="absolute inset-0 opacity-5">
          <svg viewBox="0 0 1000 600" className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
            {/* Simplified Africa outline */}
            <path d="M420,80 L480,70 L540,90 L580,140 L590,200 L570,280 L540,360
                     L500,420 L480,480 L460,500 L440,480 L420,420 L400,360
                     L380,280 L370,200 L380,140 Z"
              fill="#94a3b8" />
            {/* Simplified Europe */}
            <path d="M380,40 L420,30 L460,50 L440,80 L400,90 L370,70 Z"
              fill="#94a3b8" />
            {/* Simplified Asia */}
            <path d="M560,60 L700,40 L800,80 L820,160 L760,200 L680,180
                     L620,140 L580,100 Z"
              fill="#94a3b8" />
          </svg>
        </div>

        {/* Plotted locations */}
        <svg
          className="absolute inset-0"
          width={dims.w}
          height={dims.h}
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Connection lines between points — faint network effect */}
          {enriched.length > 1 && enriched.map((pt, i) =>
            enriched.slice(i + 1, i + 3).map((pt2, j) => (
              <line
                key={`line-${i}-${j}`}
                x1={pt.x} y1={pt.y}
                x2={pt2.x} y2={pt2.y}
                stroke="#334155"
                strokeWidth="1"
                strokeDasharray="4 4"
                opacity="0.4"
              />
            ))
          )}

          {/* Member dots */}
          {enriched.map((pt, i) => {
            const grade  = pt.health_grade || "?";
            const cfg    = GRADE_CONFIG[grade];
            const isHov  = hovered?.company_id === pt.company_id;
            const isSel  = selected?.company_id === pt.company_id;
            const r      = isHov || isSel ? 14 : 10;
            const hasCrit= (pt.health_signals || []).some(s => s.type === "critical");

            return (
              <g key={i}>
                {/* Glow ring */}
                {(isHov || isSel) && (
                  <circle
                    cx={pt.x} cy={pt.y} r={r + 8}
                    fill={cfg.glow}
                  />
                )}
                {/* Pulse ring for critical */}
                {hasCrit && (
                  <circle
                    cx={pt.x} cy={pt.y} r={r + 5}
                    fill="none"
                    stroke="#ef4444"
                    strokeWidth="1.5"
                    opacity="0.6"
                  />
                )}
                {/* Main dot */}
                <circle
                  cx={pt.x} cy={pt.y} r={r}
                  fill={cfg.fill}
                  stroke={cfg.stroke}
                  strokeWidth="2"
                  style={{ cursor: "pointer", transition: "r 0.15s ease" }}
                  onMouseEnter={e => handleMouseMove(e, pt)}
                  onMouseLeave={() => setHovered(null)}
                  onClick={() => setSelected(isSel ? null : pt)}
                />
                {/* Grade label inside dot */}
                <text
                  x={pt.x} y={pt.y + 1}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={isHov || isSel ? "10" : "8"}
                  fontWeight="bold"
                  fill="white"
                  style={{ pointerEvents: "none", userSelect: "none" }}
                >
                  {grade}
                </text>
                {/* Location label below */}
                {(isHov || isSel || enriched.length <= 8) && (
                  <text
                    x={pt.x}
                    y={pt.y + r + 10}
                    textAnchor="middle"
                    fontSize="9"
                    fill="#94a3b8"
                    style={{ pointerEvents: "none", userSelect: "none" }}
                  >
                    {(pt.name || pt.member_name || pt.label || "").slice(0, 18)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>

        {/* Tooltip */}
        {hovered && (
          <Tooltip
            member={hovered}
            x={tooltipPos.x}
            y={tooltipPos.y}
            containerW={dims.w}
          />
        )}

        {/* Legend */}
        <Legend />

        {/* Loading overlay */}
        {isLoading && (
          <div className="absolute inset-0 bg-slate-900/70 flex items-center justify-center">
            <div className="flex items-center gap-2 text-slate-300 text-sm">
              <RefreshCw className="w-4 h-4 animate-spin" />
              Loading network locations...
            </div>
          </div>
        )}

        {/* Empty state */}
        {!isLoading && enriched.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-slate-500">
            <MapPin className="w-8 h-8 opacity-30" />
            <p className="text-sm">No locations with coordinates found.</p>
            <p className="text-xs opacity-70">
              Add latitude/longitude to Address records in Base44.
            </p>
          </div>
        )}

        {/* Member count badge */}
        {enriched.length > 0 && (
          <div className="absolute top-3 right-3 bg-slate-800/90 backdrop-blur-sm rounded-lg px-2.5 py-1.5 text-xs text-slate-300 border border-slate-700/50">
            {enriched.length} location{enriched.length !== 1 ? "s" : ""}
          </div>
        )}
      </div>

      {/* Selected member detail panel */}
      {selected && (
        <div className="bg-white border border-slate-200 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white"
                style={{ background: GRADE_CONFIG[selected.health_grade || "?"].fill }}
              >
                {selected.health_grade || "?"}
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-800">{selected.name || selected.member_name}</p>
                {selected.city && (
                  <p className="text-xs text-slate-400">{selected.city}{selected.country ? `, ${selected.country}` : ""}</p>
                )}
              </div>
            </div>
            <button
              onClick={() => setSelected(null)}
              className="text-slate-300 hover:text-slate-500 text-lg leading-none"
            >×</button>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center">
            {[
              { label: "Health",     value: selected.health_score != null ? `${selected.health_score}/100` : "—" },
              { label: "Completion", value: selected.task_completion != null ? `${selected.task_completion?.toFixed(0)}%` : "—" },
              { label: "Revenue 30d",value: selected.revenue_30d != null ? selected.revenue_30d.toLocaleString(undefined, { maximumFractionDigits: 0 }) : "—" },
              { label: "Active People", value: selected.people_active?.toLocaleString() ?? "—" },
              { label: "Low Stock",  value: selected.low_stock ?? "—" },
              { label: "Overdue",    value: selected.overdue_tasks ?? "—" },
            ].map(({ label, value }) => (
              <div key={label} className="bg-slate-50 rounded-xl py-2.5 px-2">
                <p className="text-xs text-slate-400 mb-0.5">{label}</p>
                <p className="text-sm font-bold text-slate-700">{value}</p>
              </div>
            ))}
          </div>
          {(selected.health_signals || []).length > 0 && (
            <div className="mt-3 space-y-1">
              {selected.health_signals.slice(0, 3).map((s, i) => (
                <div key={i} className={`text-xs px-2.5 py-1.5 rounded-lg ${
                  s.type === "critical" ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-700"
                }`}>
                  {s.type === "critical" ? "🔴" : "🟡"} {s.message}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
