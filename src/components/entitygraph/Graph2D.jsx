import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { NODE_CONFIG, LINK_COLORS, NODE_R } from "./graphConfig";

const W = 1100, H = 700;

function useForceLayout(nodes, links) {
  const [positions, setPositions] = useState({});
  const tickRef = useRef(null);

  useEffect(() => {
    if (!nodes.length) return;

    const width = W, height = H;
    const pos = {};
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
      const alpha = 0.08, repulse = 3200, attract = 0.04, center = 0.005;
      Object.keys(state).forEach((id) => { state[id].fx = 0; state[id].fy = 0; });

      const ids = Object.keys(state);
      for (let a = 0; a < ids.length; a++) {
        for (let b = a + 1; b < ids.length; b++) {
          const na = state[ids[a]], nb = state[ids[b]];
          const dx = nb.x - na.x, dy = nb.y - na.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const force = repulse / (dist * dist);
          const fx = (dx / dist) * force, fy = (dy / dist) * force;
          na.fx -= fx; na.fy -= fy;
          nb.fx += fx; nb.fy += fy;
        }
      }

      links.forEach((link) => {
        const na = state[link.source], nb = state[link.target];
        if (!na || !nb) return;
        const dx = nb.x - na.x, dy = nb.y - na.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const ideal = NODE_R * 5;
        const force = (dist - ideal) * attract;
        const fx = (dx / dist) * force, fy = (dy / dist) * force;
        na.fx += fx; na.fy += fy;
        nb.fx -= fx; nb.fy -= fy;
      });

      Object.values(state).forEach((n) => {
        n.fx += (width / 2 - n.x) * center;
        n.fy += (height / 2 - n.y) * center;
      });

      Object.values(state).forEach((n) => {
        n.vx = (n.vx + n.fx) * 0.7;
        n.vy = (n.vy + n.fy) * 0.7;
        n.x = Math.max(NODE_R + 10, Math.min(width - NODE_R - 10, n.x + n.vx * alpha));
        n.y = Math.max(NODE_R + 10, Math.min(height - NODE_R - 10, n.y + n.vy * alpha));
      });

      setPositions(Object.fromEntries(Object.entries(state).map(([id, n]) => [id, { x: n.x, y: n.y }])));
    };

    let frame = 0;
    const run = () => { tick(); frame++; if (frame < 200) tickRef.current = requestAnimationFrame(run); };
    tickRef.current = requestAnimationFrame(run);
    return () => { if (tickRef.current) cancelAnimationFrame(tickRef.current); };
  }, [nodes.length, links.length]);

  return positions;
}

export default function Graph2D({ nodes, links, selected, onSelect }) {
  const forcePos = useForceLayout(nodes, links);
  const [manualPositions, setManualPositions] = useState({});
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [panDrag, setPanDrag] = useState(null);
  const [nodeDrag, setNodeDrag] = useState(null);
  const containerRef = useRef(null);

  const positions = useMemo(() => ({ ...forcePos, ...manualPositions }), [forcePos, manualPositions]);

  const connectedLinks = selected ? links.filter((l) => l.source === selected || l.target === selected) : [];
  const connectedIds = new Set(connectedLinks.flatMap((l) => [l.source, l.target]));

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
      setManualPositions((prev) => ({ ...prev, [nodeDrag.id]: { x: nodeDrag.startNodeX + dx, y: nodeDrag.startNodeY + dy } }));
    } else if (panDrag) {
      setPan({ x: e.clientX - panDrag.startX, y: e.clientY - panDrag.startY });
    }
  }, [nodeDrag, panDrag, zoom]);
  const handleMouseUp = () => { setNodeDrag(null); setPanDrag(null); };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Zoom controls */}
      <div className="flex items-center gap-1 mb-2 self-end bg-white border border-slate-200 rounded-xl px-1 py-1">
        <button onClick={() => setZoom((z) => Math.max(0.3, z - 0.1))} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 text-xs">−</button>
        <span className="text-xs font-mono text-slate-500 w-10 text-center">{Math.round(zoom * 100)}%</span>
        <button onClick={() => setZoom((z) => Math.min(2.5, z + 0.1))} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 text-xs">+</button>
        <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); setManualPositions({}); }} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 text-xs ml-1">⊡</button>
      </div>
      <div
        ref={containerRef}
        className={`flex-1 border border-slate-200 rounded-2xl bg-slate-50 overflow-hidden relative ${nodeDrag || panDrag ? "cursor-grabbing" : "cursor-grab"}`}
        onMouseDown={handleCanvasMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {/* Dot grid */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-20">
          <defs>
            <pattern id="gdots2d" x="0" y="0" width="28" height="28" patternUnits="userSpaceOnUse">
              <circle cx="1" cy="1" r="1.2" fill="#94a3b8" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#gdots2d)" data-bg="1" />
        </svg>

        <div style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: "top left", width: W, height: H, position: "relative" }}>
          {/* Links SVG */}
          <svg style={{ position: "absolute", top: 0, left: 0, width: W, height: H, overflow: "visible", pointerEvents: "none" }}>
            <defs>
              <marker id="arr2d" markerWidth="8" markerHeight="8" refX="26" refY="3" orient="auto">
                <path d="M0,0 L0,6 L8,3 z" fill="#94a3b8" />
              </marker>
            </defs>
            {links.map((link) => {
              const sp = positions[link.source], tp = positions[link.target];
              if (!sp || !tp) return null;
              const col = LINK_COLORS[link.label] || "#6366f1";
              const isHighlighted = selected && (link.source === selected || link.target === selected);
              const isDimmed = selected && !isHighlighted;
              const mx = (sp.x + tp.x) / 2, my = (sp.y + tp.y) / 2;
              return (
                <g key={link.id} style={{ pointerEvents: "none" }}>
                  <line x1={sp.x} y1={sp.y} x2={tp.x} y2={tp.y} stroke={col} strokeWidth={isHighlighted ? 2.5 : 1.5} opacity={isDimmed ? 0.1 : isHighlighted ? 1 : 0.45} markerEnd="url(#arr2d)" />
                  {isHighlighted && <text x={mx} y={my - 6} textAnchor="middle" fontSize="10" fill={col} fontWeight="700" opacity="0.9">{link.label}</text>}
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
                  position: "absolute", left: pos.x - NODE_R, top: pos.y - NODE_R,
                  width: NODE_R * 2, height: NODE_R * 2,
                  zIndex: isDraggingThis ? 50 : isSelected ? 20 : 5,
                  opacity: isDimmed ? 0.2 : 1,
                  backgroundColor: cfg.bg,
                  borderColor: isSelected ? cfg.hex : cfg.border,
                  borderWidth: 2, borderStyle: "solid", borderRadius: "50%",
                  boxShadow: isSelected ? `0 0 0 3px ${cfg.hex}55` : "",
                  transition: isDraggingThis ? "none" : "opacity 0.2s",
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                  cursor: isDraggingThis ? "grabbing" : "grab",
                  userSelect: "none",
                }}
                onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
                onClick={() => { if (!nodeDrag) onSelect(selected === node.id ? null : node.id); }}
              >
                <span className="text-lg leading-none">{cfg.icon}</span>
                <span style={{ fontSize: 9, fontWeight: 600, color: cfg.hex, textAlign: "center", padding: "0 2px", lineHeight: 1.2, marginTop: 2, width: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {node.label.length > 12 ? node.label.slice(0, 11) + "…" : node.label}
                </span>
              </div>
            );
          })}

          {/* Labels below nodes */}
          <svg style={{ position: "absolute", top: 0, left: 0, width: W, height: H, overflow: "visible", pointerEvents: "none" }}>
            {nodes.map((node) => {
              const pos = positions[node.id];
              if (!pos) return null;
              const isDimmed = selected && selected !== node.id && !connectedIds.has(node.id);
              return (
                <text key={`lbl-${node.id}`} x={pos.x} y={pos.y + NODE_R + 14} textAnchor="middle" fontSize="11" fontWeight="500" fill="#475569" opacity={isDimmed ? 0.15 : 0.85}>
                  {node.label.length > 18 ? node.label.slice(0, 17) + "…" : node.label}
                </text>
              );
            })}
          </svg>
        </div>
      </div>
    </div>
  );
}