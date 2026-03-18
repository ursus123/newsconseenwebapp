import React, { useState, useRef, useCallback, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { ZoomIn, ZoomOut, Maximize2, GitBranch, Database, ArrowRight, Download, Search, X, LayoutGrid, Keyboard } from "lucide-react";
import { NotebookStore } from "@/components/querybuilder/NotebookStore";
import html2canvas from "html2canvas";

// ─── Schema: Master entities ──────────────────────────────────────────────────
const TABLES = [
  {
    id: "Enterprise", label: "Enterprise", color: "#6366f1", bg: "#eef2ff", border: "#c7d2fe",
    icon: "🏢", layer: "Master Data", description: "Core business entity",
    fields: [
      { name: "id", type: "PK", pk: true },
      { name: "enterprise_name", type: "string" },
      { name: "status", type: "enum" },
      { name: "enterprise_type", type: "enum" },
      { name: "city / country", type: "string" },
      { name: "legal_structure", type: "enum" },
      { name: "linked_service_ids", type: "array" },
    ],
  },
  {
    id: "Person", label: "Person", color: "#0ea5e9", bg: "#f0f9ff", border: "#bae6fd",
    icon: "👤", layer: "Master Data", description: "Employees, clients, contacts",
    fields: [
      { name: "id", type: "PK", pk: true },
      { name: "first_name / last_name", type: "string" },
      { name: "person_type", type: "enum" },
      { name: "status", type: "enum" },
      { name: "primary_role", type: "string" },
      { name: "email / phone", type: "string" },
    ],
  },
  {
    id: "Product", label: "Product", color: "#f59e0b", bg: "#fffbeb", border: "#fde68a",
    icon: "📦", layer: "Master Data", description: "Inventory items & assets",
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
    id: "Service", label: "Service", color: "#10b981", bg: "#f0fdf4", border: "#bbf7d0",
    icon: "⚙️", layer: "Master Data", description: "Defined service catalog",
    fields: [
      { name: "id", type: "PK", pk: true },
      { name: "name / short_code", type: "string" },
      { name: "category", type: "enum" },
      { name: "pricing_model", type: "enum" },
      { name: "price", type: "number" },
    ],
  },
  {
    id: "Address", label: "Address", color: "#8b5cf6", bg: "#faf5ff", border: "#ddd6fe",
    icon: "📍", layer: "Master Data", description: "Physical locations",
    fields: [
      { name: "id", type: "PK", pk: true },
      { name: "label", type: "string" },
      { name: "address_line1", type: "string" },
      { name: "city / country", type: "string" },
      { name: "linked_enterprises", type: "array" },
    ],
  },
  {
    id: "Relationship", label: "Relationship", color: "#ec4899", bg: "#fdf2f8", border: "#f9a8d4",
    icon: "🔗", layer: "Connections", description: "Person↔Enterprise, Item↔Enterprise, Item↔Person",
    fields: [
      { name: "id", type: "PK", pk: true },
      { name: "relationship_type", type: "enum" },
      { name: "person_name", type: "FK → Person", fk: true },
      { name: "enterprise_name", type: "FK → Enterprise", fk: true },
      { name: "item_name", type: "FK → Product", fk: true },
      { name: "role / status", type: "string/enum" },
    ],
  },
  {
    id: "Task", label: "Task", color: "#f97316", bg: "#fff7ed", border: "#fed7aa",
    icon: "✅", layer: "Operations", description: "Operational task assignments",
    fields: [
      { name: "id", type: "PK", pk: true },
      { name: "task_type", type: "enum" },
      { name: "title", type: "string" },
      { name: "status / priority", type: "enum" },
      { name: "enterprise", type: "FK → Enterprise", fk: true },
      { name: "assigned_to_email", type: "FK → User", fk: true },
      { name: "trigger_transaction", type: "boolean" },
    ],
  },
  {
    id: "Transaction", label: "Transaction", color: "#dc2626", bg: "#fef2f2", border: "#fecaca",
    icon: "💳", layer: "Ledger", description: "Financial & operational ledger",
    fields: [
      { name: "id", type: "PK", pk: true },
      { name: "transaction_type", type: "enum" },
      { name: "date / amount", type: "date/number" },
      { name: "enterprise", type: "FK → Enterprise", fk: true },
      { name: "primary_person", type: "FK → Person", fk: true },
      { name: "source_task_id", type: "FK → Task", fk: true },
      { name: "payment_status", type: "enum" },
    ],
  },
  {
    id: "MedicationProfile", label: "Medication Profile", color: "#0891b2", bg: "#ecfeff", border: "#a5f3fc",
    icon: "💊", layer: "Healthcare", description: "Client medication records",
    fields: [
      { name: "id", type: "PK", pk: true },
      { name: "client_name", type: "FK → Person", fk: true },
      { name: "medication_name", type: "string" },
      { name: "strength / route", type: "string/enum" },
      { name: "status", type: "enum" },
      { name: "schedule_times", type: "array" },
    ],
  },
  {
    id: "Report", label: "Report", color: "#7c3aed", bg: "#f5f3ff", border: "#ddd6fe",
    icon: "📊", layer: "Intelligence", description: "Generated reports & exports",
    fields: [
      { name: "id", type: "PK", pk: true },
      { name: "title", type: "string" },
      { name: "type", type: "enum" },
      { name: "date_range_start/end", type: "date" },
      { name: "status", type: "enum" },
    ],
  },
  {
    id: "User", label: "User (Auth)", color: "#475569", bg: "#f8fafc", border: "#cbd5e1",
    icon: "🔐", layer: "Auth", description: "Authenticated platform users",
    fields: [
      { name: "id", type: "PK", pk: true },
      { name: "full_name / email", type: "string" },
      { name: "role", type: "enum" },
      { name: "company_id", type: "FK → Enterprise", fk: true },
    ],
  },
  // ── New entities ──
  {
    id: "SavedDashboardWidget", label: "SavedDashboardWidget", color: "#7c3aed", bg: "#f5f3ff", border: "#ddd6fe",
    icon: "📌", layer: "Intelligence", description: "Pinned QueryBuilder dashboard widgets",
    fields: [
      { name: "id", type: "PK", pk: true },
      { name: "title", type: "string" },
      { name: "sql", type: "text" },
      { name: "chart_type", type: "enum" },
      { name: "created_by", type: "FK → User", fk: true },
      { name: "created_date", type: "datetime" },
    ],
  },
  {
    id: "ImportLog", label: "ImportLog", color: "#0891b2", bg: "#ecfeff", border: "#a5f3fc",
    icon: "📥", layer: "Operations", description: "Bulk import history records",
    fields: [
      { name: "id", type: "PK", pk: true },
      { name: "entity_type", type: "string" },
      { name: "file_name", type: "string" },
      { name: "rows_imported", type: "number" },
      { name: "rows_failed", type: "number" },
      { name: "imported_by", type: "FK → User", fk: true },
      { name: "enterprise_assigned", type: "FK → Enterprise", fk: true },
    ],
  },
  {
    id: "UserAppAccess", label: "UserAppAccess", color: "#475569", bg: "#f8fafc", border: "#cbd5e1",
    icon: "🔑", layer: "Auth", description: "Per-user report and page access control",
    fields: [
      { name: "id", type: "PK", pk: true },
      { name: "user_email", type: "FK → User", fk: true },
      { name: "allowed_reports", type: "array" },
      { name: "allowed_pages", type: "array" },
    ],
  },
];

// ── Analytics Layer nodes ──
const ANALYTICS_TABLES = [
  {
    id: "analytics_enterprises", label: "analytics_enterprises", color: "#1d4ed8", bg: "#eff6ff", border: "#bfdbfe",
    icon: "📊", layer: "Analytics Layer", description: "Aggregated enterprise summaries (Railway PostgreSQL)",
    fields: [
      { name: "status", type: "enum" },
      { name: "enterprise_type", type: "enum" },
      { name: "enterprise_count", type: "INT" },
    ],
  },
  {
    id: "analytics_tasks", label: "analytics_tasks", color: "#1d4ed8", bg: "#eff6ff", border: "#bfdbfe",
    icon: "📊", layer: "Analytics Layer", description: "Task completion summaries",
    fields: [
      { name: "task_type", type: "enum" },
      { name: "status", type: "enum" },
      { name: "total_tasks", type: "INT" },
      { name: "completed_tasks", type: "INT" },
    ],
  },
  {
    id: "analytics_transactions", label: "analytics_transactions", color: "#1d4ed8", bg: "#eff6ff", border: "#bfdbfe",
    icon: "📊", layer: "Analytics Layer", description: "Transaction volume summaries",
    fields: [
      { name: "transaction_type", type: "enum" },
      { name: "status", type: "enum" },
      { name: "total_transactions", type: "INT" },
      { name: "total_amount", type: "FLOAT" },
      { name: "avg_amount", type: "FLOAT" },
    ],
  },
  {
    id: "analytics_people", label: "analytics_people", color: "#1d4ed8", bg: "#eff6ff", border: "#bfdbfe",
    icon: "📊", layer: "Analytics Layer", description: "People headcount summaries",
    fields: [
      { name: "person_type", type: "enum" },
      { name: "status", type: "enum" },
      { name: "people_count", type: "INT" },
    ],
  },
];

// ── Open Data API nodes ──
const API_TABLES = [
  {
    id: "osm_places", label: "osm_places", color: "#16a34a", bg: "#f0fdf4", border: "#bbf7d0",
    icon: "🗺️", layer: "Open Data APIs", description: "OpenStreetMap Nominatim — geocoding & POI search",
    fields: [
      { name: "place_id", type: "VARCHAR" },
      { name: "name / display_name", type: "VARCHAR" },
      { name: "type", type: "VARCHAR" },
      { name: "lat / lon", type: "FLOAT" },
      { name: "city / country", type: "VARCHAR" },
      { name: "distance_km", type: "FLOAT" },
    ],
  },
  {
    id: "open_meteo_weather", label: "open_meteo_weather", color: "#0284c7", bg: "#f0f9ff", border: "#bae6fd",
    icon: "🌤️", layer: "Open Data APIs", description: "Open-Meteo — free weather API, no key required",
    fields: [
      { name: "city / lat / lon", type: "VARCHAR/FLOAT" },
      { name: "temperature_c", type: "FLOAT" },
      { name: "feels_like_c", type: "FLOAT" },
      { name: "humidity_pct", type: "FLOAT" },
      { name: "wind_speed_kmh", type: "FLOAT" },
      { name: "weather_description", type: "VARCHAR" },
    ],
  },
  {
    id: "medications_rxnorm", label: "medications_rxnorm", color: "#7c3aed", bg: "#f5f3ff", border: "#ddd6fe",
    icon: "💊", layer: "Open Data APIs", description: "NIH RxNorm — drug names, interactions, NDC codes",
    fields: [
      { name: "rxcui / name", type: "VARCHAR" },
      { name: "ingredients", type: "array" },
      { name: "dose_forms", type: "array" },
      { name: "brand_names", type: "array" },
      { name: "drug_classes", type: "array" },
      { name: "ndc_codes", type: "array" },
    ],
  },
  {
    id: "fda_openfda", label: "fda_openfda", color: "#dc2626", bg: "#fef2f2", border: "#fecaca",
    icon: "⚕️", layer: "Open Data APIs", description: "OpenFDA — drug recalls, labels, adverse events",
    fields: [
      { name: "product_description", type: "VARCHAR" },
      { name: "reason_for_recall", type: "VARCHAR" },
      { name: "recall_initiation_date", type: "DATE" },
      { name: "recalling_firm", type: "VARCHAR" },
      { name: "classification", type: "VARCHAR" },
      { name: "is_active", type: "VARCHAR" },
    ],
  },
  {
    id: "worldbank", label: "worldbank", color: "#ca8a04", bg: "#fefce8", border: "#fef08a",
    icon: "🌍", layer: "Open Data APIs", description: "World Bank Open Data — economic indicators",
    fields: [
      { name: "country_name / code", type: "VARCHAR" },
      { name: "indicator_name", type: "VARCHAR" },
      { name: "year", type: "INT" },
      { name: "value", type: "FLOAT" },
    ],
  },
  {
    id: "exchange_rates", label: "exchange_rates", color: "#15803d", bg: "#f0fdf4", border: "#bbf7d0",
    icon: "💱", layer: "Open Data APIs", description: "Open Exchange Rates — live currency rates",
    fields: [
      { name: "base_currency", type: "VARCHAR" },
      { name: "currency", type: "VARCHAR" },
      { name: "rate", type: "FLOAT" },
      { name: "last_updated", type: "DATETIME" },
    ],
  },
];

// ─── All edges ────────────────────────────────────────────────────────────────
const EDGES = [
  // Core FK edges
  { from: "Relationship", to: "Person", label: "person_name" },
  { from: "Relationship", to: "Enterprise", label: "enterprise_name" },
  { from: "Relationship", to: "Product", label: "item_name" },
  { from: "Task", to: "Enterprise", label: "enterprise" },
  { from: "Task", to: "Person", label: "related_person" },
  { from: "Task", to: "Product", label: "related_item" },
  { from: "Task", to: "Transaction", label: "triggers →", style: "trigger" },
  { from: "Transaction", to: "Enterprise", label: "enterprise" },
  { from: "Transaction", to: "Person", label: "primary_person" },
  { from: "Transaction", to: "Task", label: "source_task_id" },
  { from: "MedicationProfile", to: "Person", label: "client_id" },
  { from: "Enterprise", to: "Service", label: "linked_service_ids" },
  { from: "Enterprise", to: "Person", label: "linked_employee_ids" },
  { from: "User", to: "Enterprise", label: "company_id" },
  { from: "Address", to: "Enterprise", label: "linked_enterprises" },
  { from: "Address", to: "Person", label: "linked_people" },
  // New entity edges
  { from: "SavedDashboardWidget", to: "User", label: "created_by" },
  { from: "ImportLog", to: "User", label: "imported_by" },
  { from: "ImportLog", to: "Enterprise", label: "enterprise_assigned" },
  { from: "UserAppAccess", to: "User", label: "user_email" },
  // ETL edges (blue dashed)
  { from: "Enterprise", to: "analytics_enterprises", label: "Airflow ETL @daily", style: "etl" },
  { from: "Task", to: "analytics_tasks", label: "Airflow ETL @daily", style: "etl" },
  { from: "Transaction", to: "analytics_transactions", label: "Airflow ETL @daily", style: "etl" },
  { from: "Person", to: "analytics_people", label: "Airflow ETL @daily", style: "etl" },
  // Open Data API edges
  { from: "Enterprise", to: "osm_places", label: "geocodes address", style: "api_orange" },
  { from: "Enterprise", to: "open_meteo_weather", label: "weather enrichment", style: "api_blue" },
  { from: "Product", to: "medications_rxnorm", label: "medication lookup", style: "api_purple" },
  { from: "Product", to: "fda_openfda", label: "recall check", style: "api_red" },
  { from: "Transaction", to: "exchange_rates", label: "currency conversion", style: "api_green" },
];

// ─── Default positions ────────────────────────────────────────────────────────
const DEFAULT_POSITIONS = {
  // Master Data
  Enterprise:              { x: 420,  y: 320 },
  Person:                  { x: 780,  y: 320 },
  Product:                 { x: 60,   y: 320 },
  Service:                 { x: 1140, y: 320 },
  Address:                 { x: 60,   y: 560 },
  // Connections + Auth
  Relationship:            { x: 60,   y: 800 },
  User:                    { x: 420,  y: 560 },
  // Operations + Ledger
  Task:                    { x: 780,  y: 560 },
  Transaction:             { x: 780,  y: 800 },
  // Healthcare + Intelligence
  MedicationProfile:       { x: 1140, y: 560 },
  Report:                  { x: 1140, y: 800 },
  SavedDashboardWidget:    { x: 1100, y: 1000 },
  // Operations + Auth extras
  ImportLog:               { x: 60,   y: 1040 },
  UserAppAccess:           { x: 420,  y: 800 },
  // Analytics Layer (y: 1280)
  analytics_enterprises:   { x: 60,   y: 1280 },
  analytics_tasks:         { x: 340,  y: 1280 },
  analytics_transactions:  { x: 620,  y: 1280 },
  analytics_people:        { x: 900,  y: 1280 },
  // Open Data APIs (y: 80)
  osm_places:              { x: 60,   y: 80  },
  open_meteo_weather:      { x: 300,  y: 80  },
  medications_rxnorm:      { x: 540,  y: 80  },
  fda_openfda:             { x: 780,  y: 80  },
  worldbank:               { x: 1020, y: 80  },
  exchange_rates:          { x: 1260, y: 80  },
};

// ─── Auto-layout rows ─────────────────────────────────────────────────────────
function computeAutoLayout(allTables) {
  const rows = {
    "Open Data APIs":   { y: 80,   ids: [] },
    "Master Data":      { y: 340,  ids: [] },
    "Connections":      { y: 580,  ids: [] },
    "Auth":             { y: 580,  ids: [] },
    "Operations":       { y: 820,  ids: [] },
    "Ledger":           { y: 820,  ids: [] },
    "Healthcare":       { y: 1060, ids: [] },
    "Intelligence":     { y: 1060, ids: [] },
    "Analytics Layer":  { y: 1300, ids: [] },
  };
  allTables.forEach((t) => {
    if (rows[t.layer]) rows[t.layer].ids.push(t.id);
  });
  const positions = {};
  Object.values(rows).forEach(({ y, ids }) => {
    const total = ids.length;
    const spacing = Math.min(280, 1400 / Math.max(total, 1));
    ids.forEach((id, i) => {
      positions[id] = { x: 60 + i * spacing, y };
    });
  });
  return positions;
}

const TABLE_W = 210;
const TABLE_H_BASE = 60;
const FIELD_H = 18;

function tableHeight(t) { return TABLE_H_BASE + t.fields.length * FIELD_H + 10; }

function getEdgePoint(fromId, toId, positions, tables) {
  const p = positions[fromId];
  const t = tables.find((x) => x.id === fromId);
  if (!p || !t) return { x: 0, y: 0 };
  const h = tableHeight(t);
  const cx = p.x + TABLE_W / 2;
  const cy = p.y + h / 2;
  const tp = positions[toId];
  const tt = tables.find((x) => x.id === toId);
  if (!tp || !tt) return { x: cx, y: cy };
  const th = tableHeight(tt);
  const tcx = tp.x + TABLE_W / 2;
  const tcy = tp.y + th / 2;
  const dx = tcx - cx, dy = tcy - cy;
  if (Math.abs(dx) > Math.abs(dy)) {
    return dx > 0 ? { x: p.x + TABLE_W, y: cy } : { x: p.x, y: cy };
  } else {
    return dy > 0 ? { x: cx, y: p.y + h } : { x: cx, y: p.y };
  }
}

const LAYER_COLORS = {
  "Master Data":     "bg-indigo-50 text-indigo-700 border-indigo-200",
  "Connections":     "bg-pink-50 text-pink-700 border-pink-200",
  "Operations":      "bg-orange-50 text-orange-700 border-orange-200",
  "Ledger":          "bg-red-50 text-red-700 border-red-200",
  "Healthcare":      "bg-cyan-50 text-cyan-700 border-cyan-200",
  "Intelligence":    "bg-violet-50 text-violet-700 border-violet-200",
  "Auth":            "bg-slate-100 text-slate-600 border-slate-300",
  "Analytics Layer": "bg-blue-50 text-blue-700 border-blue-200",
  "Open Data APIs":  "bg-orange-50 text-orange-700 border-orange-200",
};

const ALL_LAYERS = Object.keys(LAYER_COLORS);

// Edge style helpers
function edgeStyle(style) {
  if (style === "etl")        return { color: "#1d4ed8", dash: "8,4", marker: "arrow-etl" };
  if (style === "trigger")    return { color: "#f97316", dash: "6,3", marker: "arrow-orange" };
  if (style === "api_orange") return { color: "#ea580c", dash: "5,4", marker: "arrow-api-orange" };
  if (style === "api_blue")   return { color: "#0284c7", dash: "5,4", marker: "arrow-api-blue" };
  if (style === "api_purple") return { color: "#7c3aed", dash: "5,4", marker: "arrow-api-purple" };
  if (style === "api_red")    return { color: "#dc2626", dash: "5,4", marker: "arrow-api-red" };
  if (style === "api_green")  return { color: "#16a34a", dash: "5,4", marker: "arrow-api-green" };
  return { color: "#10b981", dash: "none", marker: "arrow-green" };
}

// DDL generation
function generateDDL(tables) {
  const typeMap = { string: "VARCHAR", text: "TEXT", number: "FLOAT", "number/enum": "VARCHAR", boolean: "BOOLEAN", date: "DATE", "date/number": "DATE", datetime: "TIMESTAMP", array: "JSONB", enum: "VARCHAR", "string/enum": "VARCHAR", "date/number": "DATE", "string/enum": "VARCHAR", INT: "INT", FLOAT: "FLOAT", PK: "VARCHAR" };
  return tables.filter((t) => !t.id.startsWith("analytics_") && !["osm_places","open_meteo_weather","medications_rxnorm","fda_openfda","worldbank","exchange_rates"].includes(t.id)).map((t) => {
    const cols = t.fields.map((f) => {
      const colName = f.name.replace(/\s*\/\s*.+/, "").replace(/\s+/g, "_").replace(/[()]/g, "");
      const colType = f.pk ? "VARCHAR PRIMARY KEY" : typeMap[f.type?.toLowerCase()] || "VARCHAR";
      return `  ${colName} ${colType}`;
    });
    return `CREATE TABLE ${t.id.toLowerCase()} (\n${cols.join(",\n")}\n);`;
  }).join("\n\n");
}

export default function DataModels() {
  const [zoom, setZoom] = useState(0.7);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [panDrag, setPanDrag] = useState(null);
  const [nodeDrag, setNodeDrag] = useState(null);
  const [positions, setPositions] = useState(DEFAULT_POSITIONS);
  const [selectedTable, setSelectedTable] = useState(null);
  const [hoveredEdge, setHoveredEdge] = useState(null);
  const [notebooks, setNotebooks] = useState(NotebookStore.getAll());
  const [searchQuery, setSearchQuery] = useState("");
  const [enabledLayers, setEnabledLayers] = useState(new Set(ALL_LAYERS));
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [animating, setAnimating] = useState(false);
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const exportMenuRef = useRef(null);

  useEffect(() => {
    const unsub = NotebookStore.subscribe(setNotebooks);
    return unsub;
  }, []);

  useEffect(() => {
    const handler = (e) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target)) setShowExportMenu(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // ── All tables combined ────────────────────────────────────────────────
  const externalNodes = Object.values(notebooks).filter((n) => n.connected);
  const allTables = [
    ...TABLES,
    ...ANALYTICS_TABLES,
    ...API_TABLES,
    ...externalNodes.map((nb) => ({
      id: nb.id, label: nb.name,
      color: "#0ea5e9", bg: "#f0f9ff", border: "#bae6fd",
      icon: nb.type === "api" ? "🌐" : "🐍",
      layer: "External Sources", description: nb.type === "api" ? "API Connector" : "Python Script",
      fields: [{ name: "id", type: "PK", pk: true }, ...(nb.outputSchema || []).map((c) => ({ name: c.name, type: c.type }))],
      isExternal: true,
    })),
  ];

  const fullPositions = { ...positions };
  externalNodes.forEach((nb, i) => {
    if (!fullPositions[nb.id]) fullPositions[nb.id] = { x: 60 + i * 280, y: 1560 };
  });

  const allEdges = [
    ...EDGES,
    ...externalNodes.map((nb) => ({ from: nb.id, to: "Enterprise", label: "feeds →", style: "etl" })),
  ];

  // ── Search & filter ────────────────────────────────────────────────────
  const q = searchQuery.trim().toLowerCase();
  const matchingIds = q
    ? new Set(allTables.filter((t) => t.label.toLowerCase().includes(q) || t.description?.toLowerCase().includes(q) || t.fields.some((f) => f.name.toLowerCase().includes(q))).map((t) => t.id))
    : null;

  // Filter by enabled layers
  const visibleIds = new Set(allTables.filter((t) => enabledLayers.has(t.layer) || t.layer === "External Sources").map((t) => t.id));

  // Auto-pan to first match
  useEffect(() => {
    if (!matchingIds || matchingIds.size === 0) return;
    const firstId = [...matchingIds][0];
    const pos = fullPositions[firstId];
    if (!pos || !containerRef.current) return;
    const cw = containerRef.current.offsetWidth;
    const ch = containerRef.current.offsetHeight;
    setPan({ x: cw / 2 - (pos.x + TABLE_W / 2) * zoom, y: ch / 2 - pos.y * zoom });
  }, [searchQuery]);

  const CANVAS_W = 1600;
  const CANVAS_H = 1650;

  const handleCanvasMouseDown = (e) => {
    if (e.target === containerRef.current || e.target.tagName === "svg" || e.target.tagName === "rect" || e.target.tagName === "circle") {
      setPanDrag({ startX: e.clientX - pan.x, startY: e.clientY - pan.y });
    }
  };

  const handleNodeMouseDown = (e, id) => {
    e.stopPropagation();
    const pos = fullPositions[id];
    setNodeDrag({ id, startMouseX: e.clientX, startMouseY: e.clientY, startNodeX: pos.x, startNodeY: pos.y });
  };

  const handleMouseMove = useCallback((e) => {
    if (nodeDrag) {
      const dx = (e.clientX - nodeDrag.startMouseX) / zoom;
      const dy = (e.clientY - nodeDrag.startMouseY) / zoom;
      setPositions((prev) => ({ ...prev, [nodeDrag.id]: { x: Math.max(0, nodeDrag.startNodeX + dx), y: Math.max(0, nodeDrag.startNodeY + dy) } }));
    } else if (panDrag) {
      setPan({ x: e.clientX - panDrag.startX, y: e.clientY - panDrag.startY });
    }
  }, [nodeDrag, panDrag, zoom]);

  const handleMouseUp = () => { setNodeDrag(null); setPanDrag(null); };

  const handleAutoLayout = () => {
    setAnimating(true);
    const newPos = computeAutoLayout(allTables);
    setPositions((prev) => ({ ...prev, ...newPos }));
    setTimeout(() => setAnimating(false), 600);
  };

  // ── Mini-map ───────────────────────────────────────────────────────────
  const MM_W = 180, MM_H = 110;
  const mmScaleX = MM_W / CANVAS_W;
  const mmScaleY = MM_H / CANVAS_H;

  const handleMiniMapClick = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const canvasX = mx / mmScaleX;
    const canvasY = my / mmScaleY;
    if (!containerRef.current) return;
    const cw = containerRef.current.offsetWidth;
    const ch = containerRef.current.offsetHeight;
    setPan({ x: cw / 2 - canvasX * zoom, y: ch / 2 - canvasY * zoom });
  };

  const vpX = (-pan.x / zoom) * mmScaleX;
  const vpY = (-pan.y / zoom) * mmScaleY;
  const vpW = (containerRef.current?.offsetWidth || 800) / zoom * mmScaleX;
  const vpH = (containerRef.current?.offsetHeight || 600) / zoom * mmScaleY;

  // ── Export ─────────────────────────────────────────────────────────────
  const exportPNG = async () => {
    setShowExportMenu(false);
    if (!canvasRef.current) return;
    const canvas = await html2canvas(canvasRef.current, { backgroundColor: "#f8fafc", scale: 1.5, useCORS: true });
    const url = canvas.toDataURL("image/png");
    const a = document.createElement("a"); a.href = url; a.download = "newsconseen_data_model.png"; a.click();
  };

  const exportJSON = () => {
    setShowExportMenu(false);
    const data = { tables: allTables.map((t) => ({ id: t.id, label: t.label, layer: t.layer, fields: t.fields })), edges: allEdges };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "newsconseen_schema.json"; a.click();
    URL.revokeObjectURL(url);
  };

  const exportDDL = () => {
    setShowExportMenu(false);
    const sql = generateDDL(allTables);
    const blob = new Blob([sql], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "newsconseen_schema.sql"; a.click();
    URL.revokeObjectURL(url);
  };

  const selected = selectedTable ? allTables.find((t) => t.id === selectedTable) : null;

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col gap-0 overflow-hidden">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-3 shrink-0 flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <GitBranch className="w-6 h-6 text-indigo-500" />
            Data Models
          </h1>
          <p className="text-sm text-slate-400 mt-0.5">Newsconseen architecture · ETL lineage · Open Data APIs</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Escape") setSearchQuery(""); }}
              placeholder="Search tables…"
              className="pl-8 pr-8 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300 w-40"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          {matchingIds && (
            <span className="text-[11px] text-slate-500 font-medium">{matchingIds.size} match{matchingIds.size !== 1 ? "es" : ""}</span>
          )}
          {/* Zoom */}
          <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl px-1 py-1">
            <button onClick={() => setZoom((z) => Math.max(0.25, z - 0.1))} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors"><ZoomOut className="w-4 h-4" /></button>
            <span className="text-xs font-mono text-slate-500 w-10 text-center">{Math.round(zoom * 100)}%</span>
            <button onClick={() => setZoom((z) => Math.min(2, z + 0.1))} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors"><ZoomIn className="w-4 h-4" /></button>
          </div>
          {/* Auto Layout */}
          <button onClick={handleAutoLayout}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 text-xs font-medium rounded-xl transition-colors">
            <LayoutGrid className="w-3.5 h-3.5" /> Auto Layout
          </button>
          {/* Reset */}
          <button onClick={() => { setZoom(0.7); setPan({ x: 0, y: 0 }); setPositions(DEFAULT_POSITIONS); }}
            className="p-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-500 transition-colors">
            <Maximize2 className="w-4 h-4" />
          </button>
          {/* Export */}
          <div ref={exportMenuRef} className="relative">
            <button onClick={() => setShowExportMenu((v) => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 text-xs font-medium rounded-xl transition-colors">
              <Download className="w-3.5 h-3.5" /> Export
            </button>
            {showExportMenu && (
              <div className="absolute right-0 top-full mt-1 z-50 bg-white border border-slate-200 rounded-xl shadow-xl w-44 overflow-hidden">
                {[
                  { label: "Export as PNG", action: exportPNG },
                  { label: "Schema as JSON", action: exportJSON },
                  { label: "SQL DDL (.sql)", action: exportDDL },
                ].map(({ label, action }) => (
                  <button key={label} onClick={action}
                    className="w-full text-left px-4 py-2.5 text-xs text-slate-600 hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-0">
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Layer legend + filter ───────────────────────────────────────── */}
      <div className="flex flex-wrap gap-1.5 mb-2 shrink-0">
        {ALL_LAYERS.map((layer) => {
          const cls = LAYER_COLORS[layer];
          const enabled = enabledLayers.has(layer);
          return (
            <button
              key={layer}
              onClick={() => setEnabledLayers((prev) => {
                const next = new Set(prev);
                if (next.has(layer)) next.delete(layer); else next.add(layer);
                return next;
              })}
              className={`text-[11px] px-2.5 py-0.5 rounded-full border font-medium transition-all ${enabled ? cls : "bg-slate-100 text-slate-400 border-slate-200 opacity-50"}`}
            >
              {layer}
            </button>
          );
        })}
        <div className="ml-2 flex items-center gap-2">
          <span className="text-[11px] px-2.5 py-0.5 rounded-full border bg-white text-slate-400 border-slate-200 flex items-center gap-1">
            <span className="w-3 h-0.5 bg-emerald-400 inline-block rounded" /> FK
          </span>
          <span className="text-[11px] px-2.5 py-0.5 rounded-full border bg-white text-slate-400 border-slate-200 flex items-center gap-1">
            <span className="w-4 border-t-2 border-blue-600 border-dashed inline-block" /> ETL
          </span>
          <span className="text-[11px] px-2.5 py-0.5 rounded-full border bg-white text-slate-400 border-slate-200 flex items-center gap-1">
            <span className="w-4 border-t-2 border-orange-500 border-dashed inline-block" /> API
          </span>
        </div>
      </div>

      <div className="flex gap-3 flex-1 overflow-hidden">
        {/* ── Canvas ───────────────────────────────────────────────────── */}
        <div
          ref={containerRef}
          className={`flex-1 border border-slate-200 rounded-2xl bg-slate-50 overflow-hidden relative ${nodeDrag ? "cursor-grabbing" : panDrag ? "cursor-grabbing" : "cursor-grab"}`}
          onMouseDown={handleCanvasMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          {/* Dot grid */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-25">
            <defs>
              <pattern id="dots" x="0" y="0" width="24" height="24" patternUnits="userSpaceOnUse">
                <circle cx="1" cy="1" r="1" fill="#94a3b8" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#dots)" />
          </svg>

          <div
            ref={canvasRef}
            style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: "top left", width: CANVAS_W, height: CANVAS_H, position: "relative" }}
          >
            {/* SVG edges */}
            <svg style={{ position: "absolute", top: 0, left: 0, width: CANVAS_W, height: CANVAS_H, overflow: "visible", pointerEvents: "none" }}>
              <defs>
                {[
                  { id: "arrow-green",      fill: "#10b981" },
                  { id: "arrow-orange",     fill: "#f97316" },
                  { id: "arrow-etl",        fill: "#1d4ed8" },
                  { id: "arrow-api-orange", fill: "#ea580c" },
                  { id: "arrow-api-blue",   fill: "#0284c7" },
                  { id: "arrow-api-purple", fill: "#7c3aed" },
                  { id: "arrow-api-red",    fill: "#dc2626" },
                  { id: "arrow-api-green",  fill: "#16a34a" },
                ].map(({ id, fill }) => (
                  <marker key={id} id={id} markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                    <path d="M0,0 L0,6 L8,3 z" fill={fill} />
                  </marker>
                ))}
              </defs>
              {allEdges.map((edge, i) => {
                if (!visibleIds.has(edge.from) || !visibleIds.has(edge.to)) return null;
                if (!fullPositions[edge.from] || !fullPositions[edge.to]) return null;
                const from = getEdgePoint(edge.from, edge.to, fullPositions, allTables);
                const to = getEdgePoint(edge.to, edge.from, fullPositions, allTables);
                const es = edgeStyle(edge.style);
                const isHovered = hoveredEdge === i;
                const mx = (from.x + to.x) / 2;
                const my = (from.y + to.y) / 2;
                return (
                  <g key={i}>
                    <path
                      d={`M ${from.x} ${from.y} C ${from.x + (to.x - from.x) * 0.5} ${from.y}, ${from.x + (to.x - from.x) * 0.5} ${to.y}, ${to.x} ${to.y}`}
                      fill="none"
                      stroke={isHovered ? "#1d4ed8" : es.color}
                      strokeWidth={isHovered ? 2.5 : 1.5}
                      strokeDasharray={es.dash}
                      markerEnd={`url(#${es.marker})`}
                      opacity={isHovered ? 1 : 0.5}
                    />
                    <path
                      d={`M ${from.x} ${from.y} C ${from.x + (to.x - from.x) * 0.5} ${from.y}, ${from.x + (to.x - from.x) * 0.5} ${to.y}, ${to.x} ${to.y}`}
                      fill="none" stroke="transparent" strokeWidth="14"
                      style={{ pointerEvents: "stroke", cursor: "pointer" }}
                      onMouseEnter={() => setHoveredEdge(i)}
                      onMouseLeave={() => setHoveredEdge(null)}
                    />
                    {isHovered && (
                      <text x={mx} y={my - 6} textAnchor="middle" fontSize="10" fill="#1d4ed8" fontWeight="600">{edge.label}</text>
                    )}
                  </g>
                );
              })}
            </svg>

            {/* Table nodes */}
            {allTables.map((table) => {
              const pos = fullPositions[table.id];
              if (!pos || !visibleIds.has(table.id)) return null;
              const h = tableHeight(table);
              const isSelected = selectedTable === table.id;
              const isDraggingThis = nodeDrag?.id === table.id;
              const layerCls = LAYER_COLORS[table.layer] || "bg-slate-100 text-slate-600 border-slate-300";
              const isMatch = matchingIds ? matchingIds.has(table.id) : true;
              const isDimmed = matchingIds && !isMatch;
              return (
                <div
                  key={table.id}
                  style={{
                    position: "absolute",
                    left: pos.x, top: pos.y,
                    width: TABLE_W,
                    backgroundColor: table.bg,
                    borderColor: isSelected ? table.color : isMatch && matchingIds ? table.color : table.border,
                    zIndex: isDraggingThis ? 50 : isSelected ? 20 : 5,
                    opacity: isDimmed ? 0.2 : 1,
                    boxShadow: isMatch && matchingIds ? `0 0 0 3px ${table.color}55, 0 4px 16px ${table.color}33` : undefined,
                    transition: animating ? "left 0.5s ease, top 0.5s ease" : undefined,
                  }}
                  className={`rounded-xl border-2 shadow-md select-none ${isDraggingThis ? "shadow-2xl cursor-grabbing" : "cursor-grab hover:shadow-lg"} ${isSelected ? "ring-2 ring-indigo-400 ring-offset-1 shadow-xl" : ""}`}
                  onMouseDown={(e) => handleNodeMouseDown(e, table.id)}
                  onClick={() => { if (!nodeDrag) setSelectedTable(selectedTable === table.id ? null : table.id); }}
                >
                  <div className="flex items-center gap-1.5 px-3 py-2 rounded-t-lg" style={{ backgroundColor: table.color + "22", borderBottom: `1px solid ${table.border}` }}>
                    <span className="text-sm">{table.icon}</span>
                    <span className="text-[11px] font-bold truncate flex-1" style={{ color: table.color }}>{table.label}</span>
                    <span className={`text-[8px] px-1.5 py-0.5 rounded-full border font-medium shrink-0 ${layerCls}`}>{table.layer}</span>
                  </div>
                  <div className="px-3 py-1.5 space-y-0.5">
                    {table.fields.map((f, fi) => (
                      <div key={fi} className="flex items-center gap-1.5 text-[11px]">
                        {f.pk ? <span className="w-3.5 h-3.5 rounded-sm bg-amber-400 text-white flex items-center justify-center text-[7px] font-bold shrink-0">PK</span>
                          : f.fk ? <span className="w-3.5 h-3.5 rounded-sm bg-blue-400 text-white flex items-center justify-center text-[7px] font-bold shrink-0">FK</span>
                          : <span className="w-3.5 h-3.5 shrink-0" />}
                        <span className="text-slate-700 truncate flex-1">{f.name}</span>
                        <span className="text-[9px] text-slate-400 truncate max-w-[60px]">{f.type}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* ── Mini-map ──────────────────────────────────────────────── */}
          <div
            className="absolute bottom-4 right-4 rounded-xl overflow-hidden border border-white/20 shadow-xl cursor-pointer"
            style={{ width: MM_W, height: MM_H, background: "rgba(15,23,42,0.85)" }}
            onClick={handleMiniMapClick}
            title="Click to pan"
          >
            <svg width={MM_W} height={MM_H}>
              {allTables.filter((t) => visibleIds.has(t.id) && fullPositions[t.id]).map((t) => {
                const p = fullPositions[t.id];
                return (
                  <rect key={t.id}
                    x={p.x * mmScaleX} y={p.y * mmScaleY}
                    width={TABLE_W * mmScaleX} height={Math.max(4, tableHeight(t) * mmScaleY)}
                    rx="1" fill={t.color} opacity={selectedTable === t.id ? 1 : 0.6}
                  />
                );
              })}
              {/* Viewport rectangle */}
              <rect x={Math.max(0, vpX)} y={Math.max(0, vpY)} width={Math.min(MM_W, vpW)} height={Math.min(MM_H, vpH)}
                fill="none" stroke="white" strokeWidth="1.5" opacity="0.7" rx="1"
              />
            </svg>
            <p className="absolute bottom-1 left-1.5 text-[8px] text-slate-500 font-mono">mini-map</p>
          </div>
        </div>

        {/* ── Detail panel ─────────────────────────────────────────────── */}
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
                <span className={`mt-2 inline-block text-[10px] px-2 py-0.5 rounded-full border font-medium ${LAYER_COLORS[selected.layer] || ""}`}>{selected.layer}</span>
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
                  {allEdges.filter((e) => e.from === selected.id || e.to === selected.id).map((e, i) => (
                    <div key={i} className="flex items-center gap-1.5 text-[11px] text-slate-600">
                      <ArrowRight className="w-3 h-3 text-emerald-500 shrink-0" />
                      <span className={e.from === selected.id ? "font-medium" : "text-slate-400"}>
                        {e.from === selected.id ? `→ ${e.to}` : `← ${e.from}`}
                      </span>
                      <span className="text-slate-300 text-[10px] truncate">({e.label})</span>
                    </div>
                  ))}
                  {allEdges.filter((e) => e.from === selected.id || e.to === selected.id).length === 0 && (
                    <p className="text-[11px] text-slate-400">No direct edges</p>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-2xl p-4 text-center">
              <Database className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="text-xs text-slate-400 font-medium">Click any table to inspect fields and relationships</p>
            </div>
          )}

          {/* Stats */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-2">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Schema Stats</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: "Tables",       value: TABLES.length + 3 },
                { label: "Edges",        value: EDGES.length },
                { label: "Open APIs",    value: API_TABLES.length },
                { label: "Analytics",    value: ANALYTICS_TABLES.length },
                { label: "ETL Pipelines",value: 7 },
                { label: "Layers",       value: ALL_LAYERS.length },
              ].map(({ label, value }) => (
                <div key={label} className="bg-slate-50 rounded-xl px-3 py-2 text-center">
                  <p className="text-lg font-bold text-slate-700">{value}</p>
                  <p className="text-[10px] text-slate-400">{label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* ETL Flow */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-2">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Data Flow</p>
            {[
              { step: "0. Open APIs",  color: "#ea580c", desc: "OSM, RxNorm, OpenFDA, Weather, World Bank enrich master data records automatically" },
              { step: "1. Ingest",     color: "#6366f1", desc: "People, Enterprises, Products, Services, Addresses created via forms or CSV/Excel bulk import" },
              { step: "2. Connect",    color: "#ec4899", desc: "Person↔Enterprise, Item↔Enterprise, Item↔Person connections established" },
              { step: "3. Operate",    color: "#f97316", desc: "Tasks assigned per enterprise — work planned and executed with outcome tracking" },
              { step: "4. Ledger",     color: "#dc2626", desc: "Tasks trigger Transactions — stock moves, revenue recorded, assignments made" },
              { step: "5. ETL",        color: "#1d4ed8", desc: "python_layer pulls from Base44 API → transforms → loads into Railway PostgreSQL analytics tables" },
              { step: "6. Analytics",  color: "#7c3aed", desc: "QueryBuilder, Reports, Superset read from analytics tables — never from operational DB" },
            ].map(({ step, color, desc }) => (
              <div key={step} className="flex gap-2 text-[11px]">
                <span className="font-bold shrink-0 w-14" style={{ color }}>{step}</span>
                <span className="text-slate-500">{desc}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}