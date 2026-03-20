import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { NODE_CONFIG, LINK_CONFIG, getNodeRadius, getNodeColor } from "./graphConfig";

const W = 1200, H = 750;

function useForceLayout(nodes, links) {
  const [positions, setPositions] = useState({});
  const tickRef = useRef(null);

  useEffect(() => {
    if (!nodes.length) return;

    const pos = {};
    const groups = {};
    nodes.forEach(n => {
      if (!groups[n.type]) groups[n.type] = [];
      groups[n.type].push(n);
    });

    const place = (group, cx, cy, radius) => {
      group.forEach((n, i) => {
        const angle = (2 * Math.PI * i) / Math.max(1, group.length);
        pos[n.id] = { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle), vx: 0, vy: 0 };
      });
    };
    place(groups.enterprise || [], W * 0.5,  H * 0.3,  Math.min(200, W * 0.2));
    place(groups.person     || [], W * 0.25, H * 0.65, Math.min(160, W * 0.18));
    place(groups.service    || [], W * 0.75, H * 0.65, Math.min(130, W * 0.15));
    place(groups.product    || [], W * 0.6,  H * 0.65, Math.min(130, W * 0.15));
    place(groups.task       || [], W * 0.15, H * 0.45, Math.min(180, W * 0.2));
    place(groups.transaction|| [], W * 0.85, H * 0.45, Math.min(150, W * 0.18));
    place(groups.address    || [], W * 0.5,  H * 0.75, Math.min(120, W * 0.14));

    const state = { ...pos };

    const tick = () => {
      const alpha = 0.07, repulse = 2800, attract = 0.035, center = 0.004;
      Object.keys(state).forEach(id => { state[id].fx = 0; state[id].fy = 0; });
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
      links.forEach(link => {
        const na = state[link.source], nb = state[link.target];
        if (!na || !nb) return;
        const dx = nb.x - na.x, dy = nb.y - na.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const ideal = 140;
        const force = (dist - ideal) * attract;
        const fx = (dx / dist) * force, fy = (dy / dist) * force;
        na.fx += fx; na.fy += fy;
        nb.fx -= fx; nb.fy -= fy;
      });
      Object.values(state).forEach(n => {
        n.fx += (W / 2 - n.x) * center;
        n.fy += (H / 2 - n.y) * center;
        n.vx = (n.vx + n.fx) * 0.7;
        n.vy = (n.vy + n.fy) * 0.7;
        n.x = Math.max(60, Math.min(W - 60, n.x + n.vx * alpha));
        n.y = Math.max(60, Math.min(H - 60, n.y + n.vy * alpha));
      });
      setPositions(Object.fromEntries(Object.entries(state).map(([id, n]) => [id, { x: n.x, y: n.y }])));
    };

    let frame = 0;
    const run = () => { tick(); frame++; if (frame < 220) tickRef.current = requestAnimationFrame(run); };
    tickRef.current = requestAnimationFrame(run);
    return () => { if (tickRef.current) cancelAnimationFrame(tickRef.current); };
  }, [nodes.length, links.length]);

  return positions;
}

function getLinkStyle(link) {
  const cfg = LINK_CONFIG[link.label] || {};
  const color = cfg.color || "#94a3b8";
  const width = cfg.width || 1.5;
  const style = cfg.style || "solid";
  const dashArr = style === "dashed" ? "6,4" : style === "dotted" ? "2,3" : "none";
  return { color, width, dashArr };
}

export default function Graph2D({ nodes, links, selected, onSelect, colorBy = "default", searchQuery = "", highlightPath = null, onClusterClick = null }) {
  const forcePos = useForceLayout(nodes, links);
  const [manualPositions, setManualPositions] = useState({});
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [panDrag, setPanDrag] = useState(null);
  const [nodeDrag, setNodeDrag] = useState(null);
  const containerRef = useRef(null);
  const svgRef = useRef(null);

  const positions = useMemo(() => ({ ...forcePos, ...manualPositions }), [forcePos, manualPositions]);

  const connectedLinks = selected ? links.filter((l) => l.source === selected || l.target === selected) : [];
  const connectedIds = new Set(connectedLinks.flatMap((l) => [l.source, l.target]));

  // Search matching
  const searchLower = searchQuery.toLowerCase().trim();
  const matchingIds = useMemo(() => {
    if (!searchLower) return null;
    return new Set(nodes.filter(n => n.label.toLowerCase().includes(searchLower)).map(n => n.id));
  }, [searchLower, nodes]);

  // Path highlight
  const pathSet = useMemo(() => highlightPath ? new Set(highlightPath) : null, [highlightPath]);

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
      setManualPositions(prev => ({ ...prev, [nodeDrag.id]: { x: nodeDrag.startNodeX + dx, y: nodeDrag.startNodeY + dy } }));
    } else if (panDrag) {
      setPan({ x: e.clientX - panDrag.startX, y: e.clientY - panDrag.startY });
    }
  }, [nodeDrag, panDrag, zoom]);
  const handleMouseUp = () => { setNodeDrag(null); setPanDrag(null); };

  const handleWheel = (e) => {
    e.preventDefault();
    setZoom(z => Math.max(0.2, Math.min(3, z - e.deltaY * 0.001)));
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex items-center gap-1 mb-2 self-end bg-white border border-slate-200 rounded-xl px-1 py-1">
        <button onClick={() => setZoom(z => Math.max(0.2, z - 0.15))} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 text-xs">−</button>
        <span className="text-xs font-mono text-slate-500 w-10 text-center">{Math.round(zoom * 100)}%</span>
        <button onClick={() => setZoom(z => Math.min(3, z + 0.15))} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 text-xs">+</button>
        <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); setManualPositions({}); }} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 text-xs ml-1">⊡</button>
      </div>
      <div
        ref={containerRef}
        className={`flex-1 border border-slate-200 rounded-2xl bg-slate-50 overflow-hidden relative ${nodeDrag || panDrag ? "cursor-grabbing" : "cursor-grab"}`}
        onMouseDown={handleCanvasMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
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

        <div
          ref={svgRef}
          style={{ transform: `translate(${pan.x}px,${pan.y}px) scale(${zoom})`, transformOrigin: "top left", width: W, height: H, position: "relative" }}
        >
          {/* Links */}
          <svg style={{ position: "absolute", top: 0, left: 0, width: W, height: H, overflow: "visible", pointerEvents: "none" }}>
            <defs>
              <marker id="arr2d" markerWidth="7" markerHeight="7" refX="24" refY="3" orient="auto">
                <path d="M0,0 L0,6 L7,3 z" fill="#94a3b8" />
              </marker>
            </defs>
            {links.map((link) => {
              const sp = positions[link.source], tp = positions[link.target];
              if (!sp || !tp) return null;
              const { color, width, dashArr } = getLinkStyle(link);
              const isHighlighted = selected && (link.source === selected || link.target === selected);
              const isOnPath = pathSet && pathSet.has(link.source) && pathSet.has(link.target);
              const isDimmed = (selected && !isHighlighted) || (matchingIds && !matchingIds.has(link.source) && !matchingIds.has(link.target));
              const mx = (sp.x + tp.x) / 2, my = (sp.y + tp.y) / 2;
              return (
                <g key={link.id}>
                  <line
                    x1={sp.x} y1={sp.y} x2={tp.x} y2={tp.y}
                    stroke={isOnPath ? "#f59e0b" : color}
                    strokeWidth={isOnPath ? 3 : isHighlighted ? 2.5 : width}
                    strokeDasharray={dashArr}
                    opacity={isDimmed ? 0.05 : isHighlighted || isOnPath ? 1 : 0.18}
                    markerEnd="url(#arr2d)"
                  />
                  {(isHighlighted || isOnPath) && (
                    <text x={mx} y={my - 6} textAnchor="middle" fontSize="9" fill={isOnPath ? "#d97706" : color} fontWeight="700" opacity="0.9">
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
            const cfg = NODE_CONFIG[node.type] || {};
            const r = getNodeRadius(node, nodes, links);
            const hexColor = getNodeColor(node, colorBy);
            const isSelected = selected === node.id;
            const isOnPath = pathSet?.has(node.id);
            const isMatch = matchingIds?.has(node.id);
            const isDimmed = (selected && !isSelected && !connectedIds.has(node.id))
              || (matchingIds && !isMatch && !isOnPath)
              || (pathSet && !isOnPath);
            const isDraggingThis = nodeDrag?.id === node.id;

            return (
              <div
                key={node.id}
                style={{
                  position: "absolute",
                  left: pos.x - r, top: pos.y - r,
                  width: r * 2, height: r * 2,
                  zIndex: isDraggingThis ? 50 : isSelected ? 20 : 5,
                  opacity: isDimmed ? 0.12 : 1,
                  backgroundColor: node.isCluster ? hexColor + "33" : hexColor + "22",
                  borderColor: isSelected || isOnPath ? hexColor : (isMatch ? "#f59e0b" : cfg.border || hexColor + "55"),
                  borderWidth: isSelected || isOnPath || isMatch ? 2.5 : node.isCluster ? 2 : 1.5,
                  borderStyle: node.isCluster ? "dashed" : "solid",
                  borderRadius: "50%",
                  boxShadow: isSelected ? `0 0 0 4px ${hexColor}44` : isOnPath ? `0 0 0 3px #f59e0b44` : isMatch ? `0 0 0 3px #f59e0b66` : "",
                  transition: isDraggingThis ? "none" : "opacity 0.2s",
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                  cursor: isDraggingThis ? "grabbing" : "pointer",
                  userSelect: "none",
                }}
                onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
                onClick={() => {
                  if (nodeDrag) return;
                  if (node.isCluster && onClusterClick) { onClusterClick(node.clusterId); return; }
                  onSelect(selected === node.id ? null : node.id);
                }}
              >
                <span style={{ fontSize: Math.max(12, r * 0.55), lineHeight: 1 }}>{cfg.icon}</span>
                {node.isCluster ? (
                  <span style={{ fontSize: Math.max(8, r * 0.28), fontWeight: 700, color: hexColor, textAlign: "center", lineHeight: 1.2, marginTop: 1 }}>
                    {node.clusterCount}
                  </span>
                ) : (
                  <span style={{
                    fontSize: Math.max(7, Math.min(10, r * 0.28)),
                    fontWeight: 600, color: hexColor, textAlign: "center",
                    padding: "0 2px", lineHeight: 1.2, marginTop: 2, width: "100%",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {node.label.length > 12 ? node.label.slice(0, 11) + "…" : node.label}
                  </span>
                )}
              </div>
            );
          })}

          {/* Labels — only enterprises always, others on select/hover/search */}
          <svg style={{ position: "absolute", top: 0, left: 0, width: W, height: H, overflow: "visible", pointerEvents: "none" }}>
            {nodes.map((node) => {
              const pos = positions[node.id];
              if (!pos) return null;
              // Only show label for: enterprises, clusters, selected, path nodes, search matches
              const isMatch = matchingIds?.has(node.id);
              const isOnPath = pathSet?.has(node.id);
              const isSelected = selected === node.id;
              const isConnected = connectedIds.has(node.id);
              const alwaysShow = node.type === "enterprise" || node.isCluster;
              if (!alwaysShow && !isSelected && !isConnected && !isMatch && !isOnPath) return null;
              const r = getNodeRadius(node, nodes, links);
              const isDimmed = (selected && !isSelected && !isConnected)
                || (matchingIds && !isMatch)
                || (pathSet && !isOnPath);
              return (
                <text
                  key={`lbl-${node.id}`}
                  x={pos.x} y={pos.y + r + 14}
                  textAnchor="middle" fontSize="11" fontWeight="500" fill="#475569"
                  opacity={isDimmed ? 0.1 : 0.9}
                >
                  {node.label.length > 18 ? node.label.slice(0, 17) + "…" : node.label}
                </text>
              );
            })}
          </svg>
        </div>

        {/* Search match badge */}
        {matchingIds && (
          <div className="absolute top-3 left-3 bg-amber-500 text-white text-[11px] font-semibold px-2 py-1 rounded-full shadow">
            {matchingIds.size} match{matchingIds.size !== 1 ? "es" : ""}
          </div>
        )}
      </div>
    </div>
  );
}