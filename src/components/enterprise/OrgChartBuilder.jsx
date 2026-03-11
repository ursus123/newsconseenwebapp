import React, { useState, useRef } from "react";
import { Plus, Trash2, Move } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

// Simple interactive org chart with draggable circles + connecting lines
export default function OrgChartBuilder({ nodes = [], onChange }) {
  const [dragging, setDragging] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [connecting, setConnecting] = useState(null); // id of source node
  const svgRef = useRef(null);

  const addNode = () => {
    const id = Date.now().toString();
    const newNode = { id, name: "", role: "", x: 80 + (nodes.length % 4) * 140, y: 60 + Math.floor(nodes.length / 4) * 120, connections: [] };
    onChange([...nodes, newNode]);
  };

  const updateNode = (id, field, val) => {
    onChange(nodes.map((n) => n.id === id ? { ...n, [field]: val } : n));
  };

  const removeNode = (id) => {
    onChange(nodes.filter((n) => n.id !== id).map((n) => ({ ...n, connections: (n.connections || []).filter((c) => c !== id) })));
  };

  const handleMouseDown = (e, id) => {
    e.stopPropagation();
    if (connecting) {
      // finish connection
      if (connecting !== id) {
        onChange(nodes.map((n) => n.id === connecting ? { ...n, connections: [...(n.connections || []), id] } : n));
      }
      setConnecting(null);
      return;
    }
    setDragging({ id, startX: e.clientX, startY: e.clientY });
  };

  const handleMouseMove = (e) => {
    if (!dragging) return;
    const dx = e.clientX - dragging.startX;
    const dy = e.clientY - dragging.startY;
    onChange(nodes.map((n) => n.id === dragging.id ? { ...n, x: Math.max(40, n.x + dx), y: Math.max(40, n.y + dy) } : n));
    setDragging({ ...dragging, startX: e.clientX, startY: e.clientY });
  };

  const handleMouseUp = () => setDragging(null);

  const removeConnection = (fromId, toId) => {
    onChange(nodes.map((n) => n.id === fromId ? { ...n, connections: (n.connections || []).filter((c) => c !== toId) } : n));
  };

  const RADIUS = 42;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">Drag circles to arrange. Click <span className="font-semibold text-emerald-600">Connect</span> on a node then click another to link them.</p>
        <Button type="button" variant="outline" size="sm" className="rounded-xl text-xs h-7" onClick={addNode}>
          <Plus className="w-3 h-3 mr-1" /> Add Node
        </Button>
      </div>

      <div
        className="relative border border-slate-200 rounded-xl bg-slate-50/50 overflow-hidden"
        style={{ height: Math.max(240, Math.max(...nodes.map((n) => n.y + 80), 240)) + "px" }}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {/* SVG for connection lines */}
        <svg ref={svgRef} className="absolute inset-0 w-full h-full pointer-events-none" style={{ overflow: "visible" }}>
          {nodes.flatMap((n) =>
            (n.connections || []).map((toId) => {
              const to = nodes.find((x) => x.id === toId);
              if (!to) return null;
              return (
                <g key={`${n.id}-${toId}`}>
                  <line
                    x1={n.x} y1={n.y} x2={to.x} y2={to.y}
                    stroke="#10b981" strokeWidth="2" strokeDasharray="5,3" opacity="0.7"
                  />
                  <circle
                    cx={(n.x + to.x) / 2} cy={(n.y + to.y) / 2} r="6"
                    fill="white" stroke="#10b981" strokeWidth="1.5"
                    className="cursor-pointer pointer-events-auto"
                    onClick={() => removeConnection(n.id, toId)}
                    title="Click to remove connection"
                  />
                  <text x={(n.x + to.x) / 2} y={(n.y + to.y) / 2 + 4} textAnchor="middle" fontSize="8" fill="#ef4444" className="pointer-events-none select-none">×</text>
                </g>
              );
            })
          )}
        </svg>

        {/* Nodes */}
        {nodes.map((node) => {
          const isEditing = editingId === node.id;
          const isConnectSource = connecting === node.id;
          return (
            <div
              key={node.id}
              style={{ position: "absolute", left: node.x - RADIUS, top: node.y - RADIUS, width: RADIUS * 2, height: RADIUS * 2, zIndex: dragging?.id === node.id ? 10 : 1 }}
              className={`cursor-move select-none`}
              onMouseDown={(e) => handleMouseDown(e, node.id)}
            >
              <div className={`w-full h-full rounded-full flex flex-col items-center justify-center border-2 transition-all text-center px-1
                ${isConnectSource ? "border-emerald-500 bg-emerald-50 shadow-lg shadow-emerald-200" : "border-slate-300 bg-white shadow-md hover:border-emerald-400"}`}>
                {isEditing ? (
                  <div className="w-full px-1 space-y-0.5" onMouseDown={(e) => e.stopPropagation()}>
                    <input
                      autoFocus
                      className="w-full text-center text-xs border-b border-slate-300 bg-transparent outline-none font-semibold text-slate-700"
                      value={node.name} onChange={(e) => updateNode(node.id, "name", e.target.value)}
                      placeholder="Name"
                    />
                    <input
                      className="w-full text-center text-[10px] border-b border-slate-200 bg-transparent outline-none text-slate-500"
                      value={node.role} onChange={(e) => updateNode(node.id, "role", e.target.value)}
                      placeholder="Role"
                    />
                    <button type="button" className="text-[9px] text-emerald-600 font-medium mt-0.5" onClick={() => setEditingId(null)}>Done</button>
                  </div>
                ) : (
                  <div className="px-1" onDoubleClick={(e) => { e.stopPropagation(); setEditingId(node.id); }}>
                    <p className="text-xs font-semibold text-slate-700 leading-tight truncate w-full text-center">{node.name || "?"}</p>
                    <p className="text-[10px] text-slate-400 leading-tight truncate w-full text-center">{node.role || "Add role"}</p>
                  </div>
                )}
              </div>
              {/* Actions */}
              {!isEditing && (
                <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 flex gap-1" onMouseDown={(e) => e.stopPropagation()}>
                  <button type="button" title="Connect"
                    onClick={(e) => { e.stopPropagation(); setConnecting(isConnectSource ? null : node.id); }}
                    className={`text-[9px] px-1.5 py-0.5 rounded-full border transition-all font-medium
                      ${isConnectSource ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-emerald-600 border-emerald-300 hover:bg-emerald-50"}`}>
                    ⟶
                  </button>
                  <button type="button" title="Edit" onClick={(e) => { e.stopPropagation(); setEditingId(node.id); }}
                    className="text-[9px] px-1.5 py-0.5 rounded-full border bg-white text-slate-500 border-slate-200 hover:bg-slate-50">
                    ✎
                  </button>
                  <button type="button" title="Remove" onClick={(e) => { e.stopPropagation(); removeNode(node.id); }}
                    className="text-[9px] px-1.5 py-0.5 rounded-full border bg-white text-rose-400 border-rose-200 hover:bg-rose-50">
                    ✕
                  </button>
                </div>
              )}
            </div>
          );
        })}

        {nodes.length === 0 && (
          <div className="flex items-center justify-center h-full text-xs text-slate-400">
            Click "Add Node" to start building the org chart
          </div>
        )}
      </div>
      {connecting && (
        <p className="text-xs text-emerald-600 font-medium">Now click another node to connect, or click the source node again to cancel.</p>
      )}
    </div>
  );
}