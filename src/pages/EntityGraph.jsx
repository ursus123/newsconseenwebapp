import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ZoomIn, ZoomOut, Maximize2, Network, RefreshCw, Info } from "lucide-react";

// ─── Node colors by type ──────────────────────────────────────────────────────
const NODE_CONFIG = {
  enterprise: { color: "#6366f1", bg: "#eef2ff", border: "#c7d2fe", icon: "🏢", label: "Enterprise" },
  person:     { color: "#0ea5e9", bg: "#f0f9ff", border: "#bae6fd", icon: "👤", label: "Person" },
  service:    { color: "#10b981", bg: "#f0fdf4", border: "#bbf7d0", icon: "⚙️", label: "Service" },
};

const NODE_R = 36;
const LINK_COLORS = {
  "employs":          "#6366f1",
  "provides service": "#10b981",
  "linked service":   "#f59e0b",
  "relationship":     "#ec4899",
};

// ─── Simple force simulation (no d3) ─────────────────────────────────────────
function useForceLayout(nodes, links, width, height) {
  const [positions, setPositions] = useState({});
  const tickRef = useRef(null);

  useEffect(() => {
    if (!nodes.length) return;

    // Initialize with circular layout
    const pos = {};
    nodes.forEach((n, i) => {
      const angle = (2 * Math.PI * i) / nodes.length;
      const r = Math.min(width, height) * 0.35;
      pos[n.id] = {
        x: width / 2 + r * Math.cos(angle),
        y: height / 2 + r * Math.sin(angle),
        vx: 0,
        vy: 0,
      };
    });

    // Group by type for better initial placement
    const enterprises = nodes.filter((n) => n.type === "enterprise");
    const people = nodes.filter((n) => n.type === "person");
    const services = nodes.filter((n) => n.type === "service");

    const place = (group, cx, cy, radius) => {
      group.forEach((n, i) => {
        const angle = (2 * Math.PI * i) / Math.max(1, group.length);
        pos[n.id] = { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle), vx: 0, vy: 0 };
      });
    };
    place(enterprises, width * 0.5,  height * 0.3, Math.min(180, width * 0.2));
    place(people,      width * 0.25, height * 0.65, Math.min(160, width * 0.18));
    place(services,    width * 0.75, height * 0.65, Math.min(160, width * 0.18));

    const state = { ...pos };

    const tick = () => {
      const alpha = 0.08;
      const repulse = 3200;
      const attract = 0.04;
      const center = 0.005;

      // Reset forces
      Object.keys(state).forEach((id) => { state[id].fx = 0; state[id].fy = 0; });

      // Repulsion between all nodes
      const ids = Object.keys(state);
      for (let a = 0; a < ids.length; a++) {
        for (let b = a + 1; b < ids.length; b++) {
          const na = state[ids[a]], nb = state[ids[b]];
          const dx = nb.x - na.x, dy = nb.y - na.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const force = repulse / (dist * dist);
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          na.fx -= fx; na.fy -= fy;
          nb.fx += fx; nb.fy += fy;
        }
      }

      // Attraction along links
      links.forEach((link) => {
        const na = state[link.source], nb = state[link.target];
        if (!na || !nb) return;
        const dx = nb.x - na.x, dy = nb.y - na.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const ideal = NODE_R * 5;
        const force = (dist - ideal) * attract;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        na.fx += fx; na.fy += fy;
        nb.fx -= fx; nb.fy -= fy;
      });

      // Center gravity
      Object.values(state).forEach((n) => {
        n.fx += (width / 2 - n.x) * center;
        n.fy += (height / 2 - n.y) * center;
      });

      // Integrate
      Object.values(state).forEach((n) => {
        n.vx = (n.vx + n.fx) * 0.7;
        n.vy = (n.vy + n.fy) * 0.7;
        n.x = Math.max(NODE_R + 10, Math.min(width - NODE_R - 10, n.x + n.vx * alpha));
        n.y = Math.max(NODE_R + 10, Math.min(height - NODE_R - 10, n.y + n.vy * alpha));
      });

      setPositions(Object.fromEntries(Object.entries(state).map(([id, n]) => [id, { x: n.x, y: n.y }])));
    };

    let frame = 0;
    const run = () => {
      tick();
      frame++;
      if (frame < 200) tickRef.current = requestAnimationFrame(run);
    };
    tickRef.current = requestAnimationFrame(run);
    return () => { if (tickRef.current) cancelAnimationFrame(tickRef.current); };
  }, [nodes.length, links.length, width, height]);

  const nudge = useCallback((id, x, y) => {
    setPositions((prev) => ({ ...prev, [id]: { x, y } }));
  }, []);

  return { positions, nudge };
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function EntityGraph() {
  const [enterprises, setEnterprises] = useState([]);
  const [people, setPeople] = useState([]);
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [filter, setFilter] = useState({ enterprise: true, person: true, service: true });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [panDrag, setPanDrag] = useState(null);
  const [nodeDrag, setNodeDrag] = useState(null);
  const [manualPositions, setManualPositions] = useState({});
  const containerRef = useRef(null);

  const W = 1100, H = 700;

  // Load data
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const [ents, ppl, svcs] = await Promise.all([
        base44.entities.Enterprise.list("-created_date", 200),
        base44.entities.Person.list("-created_date", 200),
        base44.entities.Service.list("-created_date", 200),
      ]);
      setEnterprises(ents);
      setPeople(ppl);
      setServices(svcs);
      setLoading(false);
    };
    load();
  }, []);

  // Build nodes & links from live data
  const { nodes, links } = useMemo(() => {
    const nodes = [];
    const links = [];

    if (filter.enterprise) {
      enterprises.forEach((e) => nodes.push({ id: `ent_${e.id}`, type: "enterprise", label: e.enterprise_name || e.short_name || "Enterprise", raw: e }));
    }
    if (filter.person) {
      people.forEach((p) => nodes.push({ id: `per_${p.id}`, type: "person", label: `${p.first_name || ""} ${p.last_name || ""}`.trim() || "Person", raw: p }));
    }
    if (filter.service) {
      services.forEach((s) => nodes.push({ id: `svc_${s.id}`, type: "service", label: s.name || "Service", raw: s }));
    }

    const nodeIds = new Set(nodes.map((n) => n.id));

    // Enterprise → Service links via linked_service_ids
    enterprises.forEach((e) => {
      (e.linked_service_ids || []).forEach((svcId) => {
        const src = `ent_${e.id}`, tgt = `svc_${svcId}`;
        if (nodeIds.has(src) && nodeIds.has(tgt)) {
          links.push({ id: `${src}-${tgt}`, source: src, target: tgt, label: "linked service" });
        }
      });
      // Enterprise → Service via linked_services array
      (e.linked_services || []).forEach((ls) => {
        if (ls.id) {
          const src = `ent_${e.id}`, tgt = `svc_${ls.id}`;
          if (nodeIds.has(src) && nodeIds.has(tgt)) {
            links.push({ id: `${src}-${tgt}-ls`, source: src, target: tgt, label: "provides service" });
          }
        }
      });
      // Enterprise → Person via linked_employee_ids
      (e.linked_employee_ids || []).forEach((pId) => {
        const src = `ent_${e.id}`, tgt = `per_${pId}`;
        if (nodeIds.has(src) && nodeIds.has(tgt)) {
          links.push({ id: `${src}-${tgt}`, source: src, target: tgt, label: "employs" });
        }
      });
      // Enterprise → Person via employee_docs
      (e.employee_docs || []).forEach((doc) => {
        if (doc.person_id) {
          const src = `ent_${e.id}`, tgt = `per_${doc.person_id}`;
          if (nodeIds.has(src) && nodeIds.has(tgt)) {
            links.push({ id: `${src}-${tgt}-doc`, source: src, target: tgt, label: "employs" });
          }
        }
      });
    });

    // Service → Enterprise via linked_enterprises
    services.forEach((s) => {
      (s.linked_enterprises || []).forEach((le) => {
        if (le.enterprise_name) {
          const matchEnt = enterprises.find((e) => e.enterprise_name === le.enterprise_name);
          if (matchEnt) {
            const src = `svc_${s.id}`, tgt = `ent_${matchEnt.id}`;
            if (nodeIds.has(src) && nodeIds.has(tgt)) {
              links.push({ id: `${src}-${tgt}-sle`, source: src, target: tgt, label: "provides service" });
            }
          }
        }
      });
    });

    // Deduplicate links
    const seen = new Set();
    const uniqueLinks = links.filter((l) => {
      const key = [l.source, l.target].sort().join("|");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return { nodes, links: uniqueLinks };
  }, [enterprises, people, services, filter]);

  const { positions: forcePos, nudge } = useForceLayout(nodes, links, W, H);

  // Merge force positions with manual overrides
  const positions = useMemo(() => ({ ...forcePos, ...manualPositions }), [forcePos, manualPositions]);

  // Pan & node drag
  const handleCanvasMouseDown = (e) => {
    if (e.target === containerRef.current || e.target.tagName === "svg" || e.target.getAttribute("data-bg")) {
      setPanDrag({ startX: e.clientX - pan.x, startY: e.clientY - pan.y });
    }
  };
  const handleNodeMouseDown = (e, id) => {
    e.stopPropagation();
    const pos = positions[id] || { x: 0, y: 0 };
    setNodeDrag({ id, startMouseX: e.clientX, startMouseY: e.clientY, startNodeX: pos.x, startNodeY: pos.y });
  };
  const handleMouseMove = useCallback((e) => {
    if (nodeDrag) {
      const dx = (e.clientX - nodeDrag.startMouseX) / zoom;
      const dy = (e.clientY - nodeDrag.startMouseY) / zoom;
      const nx = nodeDrag.startNodeX + dx;
      const ny = nodeDrag.startNodeY + dy;
      setManualPositions((prev) => ({ ...prev, [nodeDrag.id]: { x: nx, y: ny } }));
    } else if (panDrag) {
      setPan({ x: e.clientX - panDrag.startX, y: e.clientY - panDrag.startY });
    }
  }, [nodeDrag, panDrag, zoom]);
  const handleMouseUp = () => { setNodeDrag(null); setPanDrag(null); };

  const selectedNode = selected ? nodes.find((n) => n.id === selected) : null;
  const connectedLinks = selected ? links.filter((l) => l.source === selected || l.target === selected) : [];
  const connectedIds = new Set(connectedLinks.flatMap((l) => [l.source, l.target]));

  const totalLinks = links.length;

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col gap-0 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Network className="w-6 h-6 text-indigo-500" />
            Entity Graph
          </h1>
          <p className="text-sm text-slate-400 mt-0.5">Live network of Enterprises, People & Services from your data</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Filter toggles */}
          {Object.entries(NODE_CONFIG).map(([type, cfg]) => (
            <button
              key={type}
              onClick={() => setFilter((f) => ({ ...f, [type]: !f[type] }))}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${
                filter[type]
                  ? "text-white border-transparent shadow-sm"
                  : "bg-white text-slate-400 border-slate-200"
              }`}
              style={filter[type] ? { backgroundColor: cfg.color, borderColor: cfg.color } : {}}
            >
              <span>{cfg.icon}</span> {cfg.label}
            </button>
          ))}
          <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl px-1 py-1 ml-1">
            <button onClick={() => setZoom((z) => Math.max(0.3, z - 0.1))} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500">
              <ZoomOut className="w-4 h-4" />
            </button>
            <span className="text-xs font-mono text-slate-500 w-10 text-center">{Math.round(zoom * 100)}%</span>
            <button onClick={() => setZoom((z) => Math.min(2.5, z + 0.1))} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500">
              <ZoomIn className="w-4 h-4" />
            </button>
          </div>
          <button
            onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); setManualPositions({}); }}
            className="p-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-500"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex gap-4 flex-1 overflow-hidden">
        {/* Canvas */}
        <div
          ref={containerRef}
          className={`flex-1 border border-slate-200 rounded-2xl bg-slate-50 overflow-hidden relative ${nodeDrag ? "cursor-grabbing" : panDrag ? "cursor-grabbing" : "cursor-grab"}`}
          onMouseDown={handleCanvasMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          {/* Dot grid */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-20" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="gdots" x="0" y="0" width="28" height="28" patternUnits="userSpaceOnUse">
                <circle cx="1" cy="1" r="1.2" fill="#94a3b8" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#gdots)" data-bg="1" />
          </svg>

          {loading ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="flex flex-col items-center gap-3">
                <RefreshCw className="w-8 h-8 text-indigo-400 animate-spin" />
                <p className="text-sm text-slate-400">Loading entity data…</p>
              </div>
            </div>
          ) : nodes.length === 0 ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <Network className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                <p className="text-slate-400 font-medium">No data to display</p>
                <p className="text-slate-300 text-sm mt-1">Add Enterprises, People, or Services first</p>
              </div>
            </div>
          ) : (
            <div
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                transformOrigin: "top left",
                width: W,
                height: H,
                position: "relative",
              }}
            >
              <svg style={{ position: "absolute", top: 0, left: 0, width: W, height: H, overflow: "visible", pointerEvents: "none" }}>
                <defs>
                  {Object.entries(LINK_COLORS).map(([key, col]) => (
                    <marker key={key} id={`arr-${key.replace(/\s/g, "-")}`} markerWidth="8" markerHeight="8" refX="26" refY="3" orient="auto">
                      <path d="M0,0 L0,6 L8,3 z" fill={col} />
                    </marker>
                  ))}
                </defs>

                {links.map((link) => {
                  const sp = positions[link.source], tp = positions[link.target];
                  if (!sp || !tp) return null;
                  const col = LINK_COLORS[link.label] || "#94a3b8";
                  const isHighlighted = selected && (link.source === selected || link.target === selected);
                  const isDimmed = selected && !isHighlighted;
                  const mx = (sp.x + tp.x) / 2;
                  const my = (sp.y + tp.y) / 2;
                  const markerId = `arr-${link.label.replace(/\s/g, "-")}`;
                  return (
                    <g key={link.id} style={{ pointerEvents: "none" }}>
                      <line
                        x1={sp.x} y1={sp.y} x2={tp.x} y2={tp.y}
                        stroke={col}
                        strokeWidth={isHighlighted ? 2.5 : 1.5}
                        opacity={isDimmed ? 0.1 : isHighlighted ? 1 : 0.45}
                        markerEnd={`url(#${markerId})`}
                      />
                      {isHighlighted && (
                        <text x={mx} y={my - 6} textAnchor="middle" fontSize="10" fill={col} fontWeight="700" opacity="0.9">
                          {link.label}
                        </text>
                      )}
                    </g>
                  );
                })}
              </svg>

              {/* Nodes */}
              {nodes.map((node) => {
                const pos = positions[node.id];
                if (!pos) return null;
                const cfg = NODE_CONFIG[node.type];
                const isSelected = selected === node.id;
                const isDimmed = selected && !isSelected && !connectedIds.has(node.id);
                const isDraggingThis = nodeDrag?.id === node.id;
                return (
                  <div
                    key={node.id}
                    style={{
                      position: "absolute",
                      left: pos.x - NODE_R,
                      top: pos.y - NODE_R,
                      width: NODE_R * 2,
                      height: NODE_R * 2,
                      zIndex: isDraggingThis ? 50 : isSelected ? 20 : 5,
                      opacity: isDimmed ? 0.2 : 1,
                      transition: isDraggingThis ? "none" : "opacity 0.2s",
                    }}
                    className={`flex flex-col items-center justify-center rounded-full border-2 select-none
                      ${isDraggingThis ? "cursor-grabbing shadow-2xl" : "cursor-grab hover:shadow-lg"}
                      ${isSelected ? "ring-4 ring-offset-1 shadow-xl" : ""}`}
                    style={{
                      position: "absolute",
                      left: pos.x - NODE_R,
                      top: pos.y - NODE_R,
                      width: NODE_R * 2,
                      height: NODE_R * 2,
                      zIndex: isDraggingThis ? 50 : isSelected ? 20 : 5,
                      opacity: isDimmed ? 0.2 : 1,
                      backgroundColor: cfg.bg,
                      borderColor: isSelected ? cfg.color : cfg.border,
                      boxShadow: isSelected ? `0 0 0 3px ${cfg.color}55` : "",
                      transition: isDraggingThis ? "none" : "opacity 0.2s",
                    }}
                    onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
                    onClick={() => { if (!nodeDrag) setSelected(selected === node.id ? null : node.id); }}
                  >
                    <span className="text-lg leading-none">{cfg.icon}</span>
                    <span className="text-[9px] font-semibold text-center px-1 leading-tight mt-0.5 truncate w-full text-center" style={{ color: cfg.color }}>
                      {node.label.length > 12 ? node.label.slice(0, 11) + "…" : node.label}
                    </span>
                  </div>
                );
              })}

              {/* Floating labels below nodes (non-overlapping) */}
              <svg style={{ position: "absolute", top: 0, left: 0, width: W, height: H, overflow: "visible", pointerEvents: "none" }}>
                {nodes.map((node) => {
                  const pos = positions[node.id];
                  if (!pos) return null;
                  const isDimmed = selected && selected !== node.id && !connectedIds.has(node.id);
                  return (
                    <text
                      key={`lbl-${node.id}`}
                      x={pos.x}
                      y={pos.y + NODE_R + 14}
                      textAnchor="middle"
                      fontSize="11"
                      fontWeight="500"
                      fill="#475569"
                      opacity={isDimmed ? 0.15 : 0.85}
                    >
                      {node.label.length > 18 ? node.label.slice(0, 17) + "…" : node.label}
                    </text>
                  );
                })}
              </svg>
            </div>
          )}
        </div>

        {/* Side panel */}
        <div className="w-64 shrink-0 space-y-3 overflow-y-auto">
          {/* Stats */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Graph Stats</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: "Enterprises", value: enterprises.length, color: "#6366f1" },
                { label: "People", value: people.length, color: "#0ea5e9" },
                { label: "Services", value: services.length, color: "#10b981" },
                { label: "Links", value: totalLinks, color: "#ec4899" },
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
                    <p className="font-bold text-sm" style={{ color: NODE_CONFIG[selectedNode.type].color }}>{selectedNode.label}</p>
                    <p className="text-[11px] text-slate-400 capitalize">{selectedNode.type}</p>
                  </div>
                </div>
              </div>
              <div className="px-4 py-3 space-y-2">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Details</p>
                {selectedNode.type === "enterprise" && (
                  <>
                    {selectedNode.raw.enterprise_type && <p className="text-xs text-slate-600"><span className="text-slate-400">Type: </span>{selectedNode.raw.enterprise_type}</p>}
                    {selectedNode.raw.status && <p className="text-xs text-slate-600"><span className="text-slate-400">Status: </span>{selectedNode.raw.status}</p>}
                    {selectedNode.raw.city && <p className="text-xs text-slate-600"><span className="text-slate-400">City: </span>{selectedNode.raw.city}</p>}
                  </>
                )}
                {selectedNode.type === "person" && (
                  <>
                    {selectedNode.raw.primary_role && <p className="text-xs text-slate-600"><span className="text-slate-400">Role: </span>{selectedNode.raw.primary_role}</p>}
                    {selectedNode.raw.person_type && <p className="text-xs text-slate-600"><span className="text-slate-400">Type: </span>{selectedNode.raw.person_type}</p>}
                    {selectedNode.raw.status && <p className="text-xs text-slate-600"><span className="text-slate-400">Status: </span>{selectedNode.raw.status}</p>}
                  </>
                )}
                {selectedNode.type === "service" && (
                  <>
                    {selectedNode.raw.category && <p className="text-xs text-slate-600"><span className="text-slate-400">Category: </span>{selectedNode.raw.category}</p>}
                    {selectedNode.raw.pricing_model && <p className="text-xs text-slate-600"><span className="text-slate-400">Pricing: </span>{selectedNode.raw.pricing_model}</p>}
                    {selectedNode.raw.price != null && <p className="text-xs text-slate-600"><span className="text-slate-400">Price: </span>{selectedNode.raw.price}</p>}
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
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Link Types</p>
            {Object.entries(LINK_COLORS).map(([label, color]) => (
              <div key={label} className="flex items-center gap-2 text-[11px] text-slate-600">
                <span className="w-6 h-0.5 rounded shrink-0" style={{ backgroundColor: color }} />
                {label}
              </div>
            ))}
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3">
            <p className="text-[11px] text-amber-700 font-medium mb-1">💡 Tips</p>
            <ul className="text-[10px] text-amber-600 space-y-1 list-disc list-inside">
              <li>Drag nodes to reposition</li>
              <li>Pan by dragging the canvas</li>
              <li>Click a node to highlight its links</li>
              <li>Toggle filters to focus on one type</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}