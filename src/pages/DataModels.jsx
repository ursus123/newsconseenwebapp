import React, { useState, useRef, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ZoomIn, ZoomOut, Maximize2, Info, GitBranch, Database, ArrowRight } from "lucide-react";

// ─── Schema Definition ────────────────────────────────────────────────────────
const TABLES = [
  {
    id: "Enterprise",
    label: "Enterprise",
    color: "#6366f1",
    bg: "#eef2ff",
    border: "#c7d2fe",
    icon: "🏢",
    layer: "Master Data",
    description: "Core business entity",
    fields: [
      { name: "id", type: "PK", pk: true },
      { name: "enterprise_name", type: "string" },
      { name: "status", type: "enum" },
      { name: "enterprise_type", type: "enum" },
      { name: "city / country", type: "string" },
      { name: "legal_structure", type: "enum" },
      { name: "linked_service_ids", type: "array" },
      { name: "linked_employee_ids", type: "array" },
    ],
  },
  {
    id: "Person",
    label: "Person",
    color: "#0ea5e9",
    bg: "#f0f9ff",
    border: "#bae6fd",
    icon: "👤",
    layer: "Master Data",
    description: "Employees, clients, contacts",
    fields: [
      { name: "id", type: "PK", pk: true },
      { name: "first_name / last_name", type: "string" },
      { name: "person_type", type: "enum" },
      { name: "status", type: "enum" },
      { name: "primary_role", type: "string" },
      { name: "email / phone", type: "string" },
      { name: "skills", type: "array" },
    ],
  },
  {
    id: "Product",
    label: "Product",
    color: "#f59e0b",
    bg: "#fffbeb",
    border: "#fde68a",
    icon: "📦",
    layer: "Master Data",
    description: "Inventory items & assets",
    fields: [
      { name: "id", type: "PK", pk: true },
      { name: "name / sku", type: "string" },
      { name: "item_type", type: "enum" },
      { name: "stock_quantity", type: "number" },
      { name: "unit_price / cost_price", type: "number" },
      { name: "status", type: "enum" },
    ],
  },
  {
    id: "Service",
    label: "Service",
    color: "#10b981",
    bg: "#f0fdf4",
    border: "#bbf7d0",
    icon: "⚙️",
    layer: "Master Data",
    description: "Defined service catalog",
    fields: [
      { name: "id", type: "PK", pk: true },
      { name: "name / short_code", type: "string" },
      { name: "category", type: "enum" },
      { name: "pricing_model", type: "enum" },
      { name: "price", type: "number" },
      { name: "status", type: "enum" },
    ],
  },
  {
    id: "Address",
    label: "Address",
    color: "#8b5cf6",
    bg: "#faf5ff",
    border: "#ddd6fe",
    icon: "📍",
    layer: "Master Data",
    description: "Physical locations",
    fields: [
      { name: "id", type: "PK", pk: true },
      { name: "label", type: "string" },
      { name: "address_line1", type: "string" },
      { name: "city / country", type: "string" },
      { name: "linked_enterprises", type: "array" },
      { name: "linked_people", type: "array" },
    ],
  },
  {
    id: "Relationship",
    label: "Relationship",
    color: "#ec4899",
    bg: "#fdf2f8",
    border: "#f9a8d4",
    icon: "🔗",
    layer: "Connections",
    description: "Person↔Enterprise, Item↔Enterprise, Item↔Person",
    fields: [
      { name: "id", type: "PK", pk: true },
      { name: "relationship_type", type: "enum", fk: true },
      { name: "person_name", type: "FK → Person", fk: true },
      { name: "enterprise_name", type: "FK → Enterprise", fk: true },
      { name: "item_name", type: "FK → Product", fk: true },
      { name: "role", type: "string" },
      { name: "start_date / end_date", type: "date" },
      { name: "status", type: "enum" },
    ],
  },
  {
    id: "Task",
    label: "Task",
    color: "#f97316",
    bg: "#fff7ed",
    border: "#fed7aa",
    icon: "✅",
    layer: "Operations",
    description: "Operational task assignments",
    fields: [
      { name: "id", type: "PK", pk: true },
      { name: "task_type", type: "enum" },
      { name: "title", type: "string" },
      { name: "status / priority", type: "enum" },
      { name: "enterprise", type: "FK → Enterprise", fk: true },
      { name: "related_person", type: "FK → Person", fk: true },
      { name: "related_item", type: "FK → Product", fk: true },
      { name: "assigned_to_email", type: "FK → User", fk: true },
      { name: "trigger_transaction", type: "boolean" },
    ],
  },
  {
    id: "Transaction",
    label: "Transaction",
    color: "#dc2626",
    bg: "#fef2f2",
    border: "#fecaca",
    icon: "💳",
    layer: "Ledger",
    description: "Financial & operational ledger",
    fields: [
      { name: "id", type: "PK", pk: true },
      { name: "transaction_type", type: "enum" },
      { name: "status", type: "enum" },
      { name: "date / time", type: "date" },
      { name: "enterprise", type: "FK → Enterprise", fk: true },
      { name: "primary_person", type: "FK → Person", fk: true },
      { name: "counterparty", type: "FK → Person/Enterprise", fk: true },
      { name: "line_items", type: "array" },
      { name: "amount / payment_status", type: "number/enum" },
      { name: "source_task_id", type: "FK → Task", fk: true },
    ],
  },
  {
    id: "MedicationProfile",
    label: "Medication Profile",
    color: "#0891b2",
    bg: "#ecfeff",
    border: "#a5f3fc",
    icon: "💊",
    layer: "Healthcare",
    description: "Client medication records",
    fields: [
      { name: "id", type: "PK", pk: true },
      { name: "client_name", type: "FK → Person", fk: true },
      { name: "client_id", type: "FK → Person", fk: true },
      { name: "medication_name", type: "string" },
      { name: "status", type: "enum" },
      { name: "schedule_times", type: "array" },
    ],
  },
  {
    id: "Report",
    label: "Report",
    color: "#7c3aed",
    bg: "#f5f3ff",
    border: "#ddd6fe",
    icon: "📊",
    layer: "Intelligence",
    description: "Generated reports & exports",
    fields: [
      { name: "id", type: "PK", pk: true },
      { name: "title", type: "string" },
      { name: "type", type: "enum" },
      { name: "date_range_start/end", type: "date" },
      { name: "status", type: "enum" },
    ],
  },
  {
    id: "User",
    label: "User (Auth)",
    color: "#475569",
    bg: "#f8fafc",
    border: "#cbd5e1",
    icon: "🔐",
    layer: "Auth",
    description: "Authenticated platform users",
    fields: [
      { name: "id", type: "PK", pk: true },
      { name: "full_name / email", type: "string" },
      { name: "role", type: "enum" },
      { name: "company_id", type: "FK → Enterprise", fk: true },
    ],
  },
];

// ─── Edge definitions (from → to, label) ─────────────────────────────────────
const EDGES = [
  { from: "Relationship", to: "Person", label: "person_name" },
  { from: "Relationship", to: "Enterprise", label: "enterprise_name" },
  { from: "Relationship", to: "Product", label: "item_name" },
  { from: "Task", to: "Enterprise", label: "enterprise" },
  { from: "Task", to: "Person", label: "related_person" },
  { from: "Task", to: "Product", label: "related_item" },
  { from: "Task", to: "Transaction", label: "triggers →" },
  { from: "Transaction", to: "Enterprise", label: "enterprise" },
  { from: "Transaction", to: "Person", label: "primary_person" },
  { from: "Transaction", to: "Task", label: "source_task_id" },
  { from: "MedicationProfile", to: "Person", label: "client_id" },
  { from: "Enterprise", to: "Service", label: "linked_service_ids" },
  { from: "Enterprise", to: "Person", label: "linked_employee_ids" },
  { from: "User", to: "Enterprise", label: "company_id" },
  { from: "Address", to: "Enterprise", label: "linked_enterprises" },
  { from: "Address", to: "Person", label: "linked_people" },
];

// ─── Default layout positions ─────────────────────────────────────────────────
const DEFAULT_POSITIONS = {
  Enterprise:         { x: 420, y: 80 },
  Person:             { x: 780, y: 80 },
  Product:            { x: 60,  y: 280 },
  Service:            { x: 420, y: 280 },
  Address:            { x: 780, y: 280 },
  Relationship:       { x: 60,  y: 520 },
  Task:               { x: 420, y: 520 },
  Transaction:        { x: 780, y: 520 },
  MedicationProfile:  { x: 1100, y: 280 },
  Report:             { x: 1100, y: 80 },
  User:               { x: 60,  y: 80 },
};

const TABLE_W = 220;
const TABLE_H_BASE = 60;
const FIELD_H = 18;

function tableHeight(t) {
  return TABLE_H_BASE + t.fields.length * FIELD_H + 10;
}

function getTableCenter(id, positions) {
  const p = positions[id];
  const t = TABLES.find((x) => x.id === id);
  return { x: p.x + TABLE_W / 2, y: p.y + tableHeight(t) / 2 };
}

function getEdgePoint(fromId, toId, positions) {
  const p = positions[fromId];
  const t = TABLES.find((x) => x.id === fromId);
  const h = tableHeight(t);
  const cx = p.x + TABLE_W / 2;
  const cy = p.y + h / 2;
  const tc = getTableCenter(toId, positions);

  const dx = tc.x - cx;
  const dy = tc.y - cy;
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);

  if (absDx > absDy) {
    return dx > 0 ? { x: p.x + TABLE_W, y: cy } : { x: p.x, y: cy };
  } else {
    return dy > 0 ? { x: cx, y: p.y + h } : { x: cx, y: p.y };
  }
}

const LAYER_COLORS = {
  "Master Data":  "bg-indigo-50 text-indigo-700 border-indigo-200",
  "Connections":  "bg-pink-50 text-pink-700 border-pink-200",
  "Operations":   "bg-orange-50 text-orange-700 border-orange-200",
  "Ledger":       "bg-red-50 text-red-700 border-red-200",
  "Healthcare":   "bg-cyan-50 text-cyan-700 border-cyan-200",
  "Intelligence": "bg-violet-50 text-violet-700 border-violet-200",
  "Auth":         "bg-slate-100 text-slate-600 border-slate-300",
};

export default function DataModels() {
  const [zoom, setZoom] = useState(0.85);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [panDrag, setPanDrag] = useState(null);       // canvas panning
  const [nodeDrag, setNodeDrag] = useState(null);     // { id, startMouseX, startMouseY, startNodeX, startNodeY }
  const [positions, setPositions] = useState(DEFAULT_POSITIONS);
  const [selectedTable, setSelectedTable] = useState(null);
  const [hoveredEdge, setHoveredEdge] = useState(null);
  const containerRef = useRef(null);

  const CANVAS_W = 1420;
  const CANVAS_H = 840;

  // Canvas pan starts only on background clicks
  const handleCanvasMouseDown = (e) => {
    if (e.target === containerRef.current || e.target.tagName === "svg" || e.target.tagName === "rect" || e.target.tagName === "circle") {
      setPanDrag({ startX: e.clientX - pan.x, startY: e.clientY - pan.y });
    }
  };

  // Node drag start
  const handleNodeMouseDown = (e, id) => {
    e.stopPropagation();
    const pos = positions[id];
    setNodeDrag({ id, startMouseX: e.clientX, startMouseY: e.clientY, startNodeX: pos.x, startNodeY: pos.y });
  };

  const handleMouseMove = useCallback((e) => {
    if (nodeDrag) {
      const dx = (e.clientX - nodeDrag.startMouseX) / zoom;
      const dy = (e.clientY - nodeDrag.startMouseY) / zoom;
      setPositions((prev) => ({
        ...prev,
        [nodeDrag.id]: { x: Math.max(0, nodeDrag.startNodeX + dx), y: Math.max(0, nodeDrag.startNodeY + dy) },
      }));
    } else if (panDrag) {
      setPan({ x: e.clientX - panDrag.startX, y: e.clientY - panDrag.startY });
    }
  }, [nodeDrag, panDrag, zoom]);

  const handleMouseUp = () => { setNodeDrag(null); setPanDrag(null); };

  const dragging = panDrag || nodeDrag;

  const selected = selectedTable ? TABLES.find((t) => t.id === selectedTable) : null;

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col gap-0 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <GitBranch className="w-6 h-6 text-indigo-500" />
            Data Models
          </h1>
          <p className="text-sm text-slate-400 mt-0.5">Newsconseen entity schema · ETL lineage · relationship map</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl px-1 py-1">
            <button onClick={() => setZoom((z) => Math.max(0.3, z - 0.1))} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors">
              <ZoomOut className="w-4 h-4" />
            </button>
            <span className="text-xs font-mono text-slate-500 w-10 text-center">{Math.round(zoom * 100)}%</span>
            <button onClick={() => setZoom((z) => Math.min(2, z + 0.1))} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors">
              <ZoomIn className="w-4 h-4" />
            </button>
          </div>
          <button onClick={() => { setZoom(0.85); setPan({ x: 0, y: 0 }); setPositions(DEFAULT_POSITIONS); }}
            className="p-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-500 transition-colors">
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Layer legend */}
      <div className="flex flex-wrap gap-1.5 mb-3 shrink-0">
        {Object.entries(LAYER_COLORS).map(([layer, cls]) => (
          <span key={layer} className={`text-[11px] px-2.5 py-0.5 rounded-full border font-medium ${cls}`}>{layer}</span>
        ))}
        <span className="text-[11px] px-2.5 py-0.5 rounded-full border bg-white text-slate-400 border-slate-200 ml-2 flex items-center gap-1">
          <span className="w-3 h-0.5 bg-emerald-400 inline-block rounded" /> FK edge
        </span>
        <span className="text-[11px] px-2.5 py-0.5 rounded-full border bg-white text-slate-400 border-slate-200 flex items-center gap-1">
          <span className="w-3 h-0.5 bg-orange-400 inline-block rounded border-dashed" /> trigger
        </span>
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
          {/* Dot grid background */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-30" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="dots" x="0" y="0" width="24" height="24" patternUnits="userSpaceOnUse">
                <circle cx="1" cy="1" r="1" fill="#94a3b8" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#dots)" />
          </svg>

          <div
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: "top left",
              width: CANVAS_W,
              height: CANVAS_H,
              position: "relative",
            }}
          >
            {/* SVG edges */}
            <svg
              style={{ position: "absolute", top: 0, left: 0, width: CANVAS_W, height: CANVAS_H, overflow: "visible", pointerEvents: "none" }}
            >
              <defs>
                <marker id="arrow-green" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                  <path d="M0,0 L0,6 L8,3 z" fill="#10b981" />
                </marker>
                <marker id="arrow-orange" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                  <path d="M0,0 L0,6 L8,3 z" fill="#f97316" />
                </marker>
                <marker id="arrow-green-h" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                  <path d="M0,0 L0,6 L8,3 z" fill="#6366f1" />
                </marker>
              </defs>
              {EDGES.map((edge, i) => {
                const from = getEdgePoint(edge.from, edge.to, positions);
                const to = getEdgePoint(edge.to, edge.from, positions);
                const isTrigger = edge.label === "triggers →";
                const isHovered = hoveredEdge === i;
                const mx = (from.x + to.x) / 2;
                const my = (from.y + to.y) / 2;
                const color = isTrigger ? "#f97316" : "#10b981";
                const markerId = isTrigger ? "arrow-orange" : "arrow-green";
                return (
                  <g key={i}>
                    <path
                      d={`M ${from.x} ${from.y} C ${from.x + (to.x - from.x) * 0.5} ${from.y}, ${from.x + (to.x - from.x) * 0.5} ${to.y}, ${to.x} ${to.y}`}
                      fill="none"
                      stroke={isHovered ? "#1d4ed8" : color}
                      strokeWidth={isHovered ? 2.5 : 1.5}
                      strokeDasharray={isTrigger ? "6,3" : "none"}
                      markerEnd={`url(#${markerId})`}
                      opacity={isHovered ? 1 : 0.55}
                    />
                    {/* Invisible thick line for hover detection */}
                    <path
                      d={`M ${from.x} ${from.y} C ${from.x + (to.x - from.x) * 0.5} ${from.y}, ${from.x + (to.x - from.x) * 0.5} ${to.y}, ${to.x} ${to.y}`}
                      fill="none"
                      stroke="transparent"
                      strokeWidth="12"
                      style={{ pointerEvents: "stroke", cursor: "pointer" }}
                      onMouseEnter={() => setHoveredEdge(i)}
                      onMouseLeave={() => setHoveredEdge(null)}
                    />
                    {isHovered && (
                      <text x={mx} y={my - 6} textAnchor="middle" fontSize="10" fill="#1d4ed8" fontWeight="600">
                        {edge.label}
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>

            {/* Table nodes */}
            {TABLES.map((table) => {
              const pos = positions[table.id];
              const h = tableHeight(table);
              const isSelected = selectedTable === table.id;
              const isDraggingThis = nodeDrag?.id === table.id;
              const layerCls = LAYER_COLORS[table.layer] || "";
              return (
                <div
                  key={table.id}
                  style={{
                    position: "absolute",
                    left: pos.x,
                    top: pos.y,
                    width: TABLE_W,
                    backgroundColor: table.bg,
                    borderColor: isSelected ? table.color : table.border,
                    zIndex: isDraggingThis ? 50 : isSelected ? 20 : 5,
                  }}
                  className={`rounded-xl border-2 shadow-md select-none
                    ${isDraggingThis ? "shadow-2xl cursor-grabbing" : "cursor-grab hover:shadow-lg"}
                    ${isSelected ? "ring-2 ring-indigo-400 ring-offset-1 shadow-xl" : ""}`}
                  onMouseDown={(e) => handleNodeMouseDown(e, table.id)}
                  onClick={() => { if (!nodeDrag) setSelectedTable(selectedTable === table.id ? null : table.id); }}
                >
                  {/* Header */}
                  <div
                    className="flex items-center gap-2 px-3 py-2 rounded-t-lg"
                    style={{ backgroundColor: table.color + "22", borderBottom: `1px solid ${table.border}` }}
                  >
                    <span className="text-sm">{table.icon}</span>
                    <span className="text-xs font-bold" style={{ color: table.color }}>{table.label}</span>
                    <span className={`ml-auto text-[9px] px-1.5 py-0.5 rounded-full border font-medium ${layerCls}`}>{table.layer}</span>
                  </div>
                  {/* Fields */}
                  <div className="px-3 py-1.5 space-y-0.5">
                    {table.fields.map((f, fi) => (
                      <div key={fi} className="flex items-center gap-1.5 text-[11px]">
                        {f.pk ? (
                          <span className="w-3.5 h-3.5 rounded-sm bg-amber-400 text-white flex items-center justify-center text-[8px] font-bold shrink-0">PK</span>
                        ) : f.fk ? (
                          <span className="w-3.5 h-3.5 rounded-sm bg-blue-400 text-white flex items-center justify-center text-[8px] font-bold shrink-0">FK</span>
                        ) : (
                          <span className="w-3.5 h-3.5 shrink-0" />
                        )}
                        <span className="text-slate-700 truncate flex-1">{f.name}</span>
                        <span className="text-[10px] text-slate-400 truncate max-w-[70px]">{f.fk ? f.type : f.type}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Detail panel */}
        <div className="w-64 shrink-0 space-y-3 overflow-y-auto">
          {selected ? (
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
              <div className="px-4 py-3 border-b border-slate-100" style={{ backgroundColor: selected.bg }}>
                <div className="flex items-center gap-2">
                  <span className="text-xl">{selected.icon}</span>
                  <div>
                    <p className="font-bold text-sm" style={{ color: selected.color }}>{selected.label}</p>
                    <p className="text-[11px] text-slate-400">{selected.description}</p>
                  </div>
                </div>
                <span className={`mt-2 inline-block text-[10px] px-2 py-0.5 rounded-full border font-medium ${LAYER_COLORS[selected.layer]}`}>{selected.layer}</span>
              </div>
              <div className="px-4 py-3">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Fields</p>
                <div className="space-y-1">
                  {selected.fields.map((f, i) => (
                    <div key={i} className="flex items-center gap-1.5 text-xs">
                      {f.pk ? <span className="px-1 rounded bg-amber-100 text-amber-700 text-[9px] font-bold">PK</span>
                        : f.fk ? <span className="px-1 rounded bg-blue-100 text-blue-700 text-[9px] font-bold">FK</span>
                        : <span className="px-1 rounded bg-slate-100 text-slate-400 text-[9px]">—</span>}
                      <span className="text-slate-700 flex-1">{f.name}</span>
                      <span className="text-[10px] text-slate-400">{f.type}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="px-4 pb-3">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Relationships</p>
                <div className="space-y-1">
                  {EDGES.filter((e) => e.from === selected.id || e.to === selected.id).map((e, i) => (
                    <div key={i} className="flex items-center gap-1.5 text-[11px] text-slate-600">
                      <ArrowRight className="w-3 h-3 text-emerald-500 shrink-0" />
                      <span className={e.from === selected.id ? "font-medium" : "text-slate-400"}>
                        {e.from === selected.id ? `→ ${e.to}` : `← ${e.from}`}
                      </span>
                      <span className="text-slate-300 text-[10px] truncate">({e.label})</span>
                    </div>
                  ))}
                  {EDGES.filter((e) => e.from === selected.id || e.to === selected.id).length === 0 && (
                    <p className="text-[11px] text-slate-400">No direct edges</p>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-2xl p-4 text-center">
              <Database className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="text-xs text-slate-400 font-medium">Click any table to inspect its fields and relationships</p>
            </div>
          )}

          {/* Stats */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-2">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Schema Stats</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: "Tables", value: TABLES.length },
                { label: "Edges", value: EDGES.length },
                { label: "FK Fields", value: TABLES.reduce((s, t) => s + t.fields.filter((f) => f.fk).length, 0) },
                { label: "Layers", value: [...new Set(TABLES.map((t) => t.layer))].length },
              ].map(({ label, value }) => (
                <div key={label} className="bg-slate-50 rounded-xl px-3 py-2 text-center">
                  <p className="text-lg font-bold text-slate-700">{value}</p>
                  <p className="text-[10px] text-slate-400">{label}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-2">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">ETL Flow</p>
            {[
              { step: "1. Ingest", desc: "People, Enterprises, Products, Services — Master Data created" },
              { step: "2. Connect", desc: "Relationships link entities: Person↔Enterprise, Item↔Enterprise" },
              { step: "3. Operate", desc: "Tasks assigned per enterprise — operational execution layer" },
              { step: "4. Ledger", desc: "Transactions triggered by tasks or entered manually" },
              { step: "5. Report", desc: "Reports & dashboards consume transaction + task data" },
            ].map(({ step, desc }) => (
              <div key={step} className="flex gap-2 text-[11px]">
                <span className="font-bold text-indigo-500 shrink-0 w-12">{step}</span>
                <span className="text-slate-500">{desc}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}