import React, { useState, useRef, useCallback, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { ZoomIn, ZoomOut, Maximize2, GitBranch, Database, ArrowRight, Download, Search, X, LayoutGrid, Keyboard, Copy, CheckCheck, ChevronRight, Info } from "lucide-react";
import { NotebookStore } from "@/components/querybuilder/NotebookStore";
import html2canvas from "html2canvas";

// ─── Schema: 7 canonical entities + MasterDataOption taxonomy ────────────────
//
// Source of truth: ARCHITECTURE.md + CLAUDE.md
//   Three master entities:   Person · Enterprise · Product
//   Four supporting:         Task · Transaction · Relationship · Address
//   Universal taxonomy:      MasterDataOption
//
// Removed from previous version (violated CLAUDE.md):
//   ✗ MedicationProfile  — industry-specific; medications = Product (item_type=physical)
//   ✗ Service            — not a canonical entity; services = Product (item_type=service_package)
//   ✗ User / UserAppAccess / ImportLog / Report / SavedDashboardWidget — platform internals

const TABLES = [
  // ── Three Master Entities ──────────────────────────────────────────────────
  {
    id: "Person", label: "Person", color: "#3b82f6", bg: "#eff6ff", border: "#bfdbfe",
    icon: "👤", layer: "Master Entities",
    description: "Any human in any role. person_type drives the taxonomy: staff · client · contact · volunteer",
    fields: [
      { name: "id", type: "PK", pk: true },
      { name: "first_name / last_name", type: "string" },
      { name: "person_type", type: "enum: staff|client|contact|volunteer" },
      { name: "person_subtype", type: "FK → MasterDataOption", fk: true },
      { name: "engagement_model", type: "enum: employed|contracted|enrolled|..." },
      { name: "status", type: "enum: active|inactive|on_leave" },
      { name: "availability_status", type: "enum" },
      { name: "email / phone", type: "string" },
      { name: "company_id", type: "tenant scope" },
    ],
  },
  {
    id: "Enterprise", label: "Enterprise", color: "#f59e0b", bg: "#fffbeb", border: "#fde68a",
    icon: "🏢", layer: "Master Entities",
    description: "Any organisation, location, or operational unit. Self-referencing for multi-branch hierarchy.",
    fields: [
      { name: "id", type: "PK", pk: true },
      { name: "enterprise_name", type: "string" },
      { name: "enterprise_type", type: "enum: commercial|nonprofit|government|household|cooperative|trust" },
      { name: "enterprise_subtype", type: "FK → MasterDataOption", fk: true },
      { name: "enterprise_tier", type: "enum: headquarters|branch|department|..." },
      { name: "parent_enterprise_id", type: "FK → Enterprise (self)", fk: true },
      { name: "status", type: "enum: active|inactive|prospect|archived" },
      { name: "operating_status", type: "enum: open|closed|temporarily_closed|seasonal" },
      { name: "company_id", type: "tenant scope" },
    ],
  },
  {
    id: "Product", label: "Product", color: "#f43f5e", bg: "#fff1f2", border: "#fecdd3",
    icon: "📦", layer: "Master Entities",
    description: "Any item, service, resource, or deliverable. Covers physical goods, living assets, digital licenses, service packages, and financial instruments.",
    fields: [
      { name: "id", type: "PK", pk: true },
      { name: "name / sku", type: "string" },
      { name: "item_type", type: "enum: physical|living|digital|service_package|financial_instrument" },
      { name: "item_subtype", type: "FK → MasterDataOption", fk: true },
      { name: "item_class", type: "enum: perishable|controlled|serialized|consumable|..." },
      { name: "item_variant", type: "string (size/dosage/breed/model)" },
      { name: "stock_quantity / reorder_level", type: "number" },
      { name: "unit_price / cost_price", type: "number" },
      { name: "expiry_date", type: "date" },
      { name: "company_id", type: "tenant scope" },
    ],
  },
  // ── Four Supporting Entities ───────────────────────────────────────────────
  {
    id: "Task", label: "Task", color: "#8b5cf6", bg: "#f5f3ff", border: "#ddd6fe",
    icon: "✅", layer: "Supporting Entities",
    description: "Any activity, appointment, shift, or work order. Triggers a Transaction on completion when configured.",
    fields: [
      { name: "id", type: "PK", pk: true },
      { name: "title", type: "string" },
      { name: "task_type", type: "FK → MasterDataOption", fk: true },
      { name: "status", type: "enum: open|in_progress|completed|cancelled" },
      { name: "priority", type: "enum: low|medium|high|urgent" },
      { name: "enterprise", type: "FK → Enterprise", fk: true },
      { name: "assigned_to_name", type: "FK → Person", fk: true },
      { name: "due_date / completed_date", type: "date" },
      { name: "company_id", type: "tenant scope" },
    ],
  },
  {
    id: "Transaction", label: "Transaction", color: "#10b981", bg: "#f0fdf4", border: "#bbf7d0",
    icon: "💳", layer: "Supporting Entities",
    description: "Any financial record — income, expense, invoice, payment, or payroll. The financial ledger of the operation.",
    fields: [
      { name: "id", type: "PK", pk: true },
      { name: "transaction_type", type: "enum: income|expense|invoice|payment|payroll|stock_adjustment" },
      { name: "amount / currency", type: "number/string" },
      { name: "status", type: "enum: draft|posted|void" },
      { name: "payment_status", type: "enum: unpaid|paid|overdue|partial" },
      { name: "enterprise", type: "FK → Enterprise", fk: true },
      { name: "counterparty", type: "FK → Person", fk: true },
      { name: "source_task_id", type: "FK → Task", fk: true },
      { name: "due_date / invoice_date", type: "date" },
      { name: "company_id", type: "tenant scope" },
    ],
  },
  {
    id: "Relationship", label: "Relationship", color: "#6366f1", bg: "#eef2ff", border: "#c7d2fe",
    icon: "🔗", layer: "Supporting Entities",
    description: "Links any two entities. Person↔Enterprise · Person↔Product · Enterprise↔Product. relationship_type is operator-defined.",
    fields: [
      { name: "id", type: "PK", pk: true },
      { name: "relationship_type", type: "FK → MasterDataOption", fk: true },
      { name: "person_name", type: "FK → Person", fk: true },
      { name: "enterprise_name", type: "FK → Enterprise", fk: true },
      { name: "item_name", type: "FK → Product", fk: true },
      { name: "role / status", type: "string/enum" },
      { name: "start_date / end_date", type: "date" },
      { name: "company_id", type: "tenant scope" },
    ],
  },
  {
    id: "Address", label: "Address", color: "#14b8a6", bg: "#f0fdfa", border: "#99f6e4",
    icon: "📍", layer: "Supporting Entities",
    description: "Any physical or postal location. Linked to enterprises and people via the Relationship entity.",
    fields: [
      { name: "id", type: "PK", pk: true },
      { name: "label", type: "string" },
      { name: "address_line1 / address_line2", type: "string" },
      { name: "city / state_region / country", type: "string" },
      { name: "postal_code", type: "string" },
      { name: "latitude / longitude", type: "number (geocoded)" },
      { name: "company_id", type: "tenant scope" },
    ],
  },
  // ── Universal Taxonomy ─────────────────────────────────────────────────────
  {
    id: "MasterDataOption", label: "MasterDataOption", color: "#0891b2", bg: "#ecfeff", border: "#a5f3fc",
    icon: "🏷️", layer: "Taxonomy",
    description: "Operator-defined taxonomy. Classifies person_subtype, enterprise_subtype, item_subtype, task_type, and relationship_type at runtime — no code change required.",
    fields: [
      { name: "id", type: "PK", pk: true },
      { name: "entity_type", type: "person|enterprise|item|task|relationship" },
      { name: "field_name", type: "person_subtype|enterprise_subtype|..." },
      { name: "value / label", type: "string" },
      { name: "parent_value", type: "string (person_type etc.)" },
      { name: "is_system_default", type: "boolean" },
      { name: "company_id", type: "null = system · company_id = custom" },
    ],
  },
];

// ── Layer 2 — Deployable Datamart (Railway PostgreSQL analytics.*) ─────────────
// One analytics table per canonical entity. Populated by ETL @mutation.
// Read by QueryBuilder, Copilot, Alerts, Agents. Never read directly from Base44.
const ANALYTICS_TABLES = [
  {
    id: "analytics_people", label: "analytics.people_summary", color: "#1d4ed8", bg: "#eff6ff", border: "#bfdbfe",
    icon: "📊", layer: "Analytics Layer",
    description: "Headcount summaries by person_type and status. Source: Person →  ETL → PostgreSQL.",
    fields: [
      { name: "company_id", type: "tenant scope" },
      { name: "person_type", type: "enum" },
      { name: "status", type: "enum" },
      { name: "total_count", type: "INT" },
    ],
  },
  {
    id: "analytics_enterprises", label: "analytics.enterprise_summary", color: "#1d4ed8", bg: "#eff6ff", border: "#bfdbfe",
    icon: "📊", layer: "Analytics Layer",
    description: "Enterprise counts by type and operating status.",
    fields: [
      { name: "company_id", type: "tenant scope" },
      { name: "enterprise_type", type: "enum" },
      { name: "status", type: "enum" },
      { name: "total_count", type: "INT" },
    ],
  },
  {
    id: "analytics_products", label: "analytics.product_summary", color: "#1d4ed8", bg: "#eff6ff", border: "#bfdbfe",
    icon: "📊", layer: "Analytics Layer",
    description: "Product counts, stock levels, and expiry alerts by item_type and item_class.",
    fields: [
      { name: "company_id", type: "tenant scope" },
      { name: "item_type", type: "enum" },
      { name: "item_class", type: "enum" },
      { name: "status", type: "enum" },
      { name: "total_count", type: "INT" },
      { name: "total_stock", type: "FLOAT" },
    ],
  },
  {
    id: "analytics_tasks", label: "analytics.task_summary", color: "#1d4ed8", bg: "#eff6ff", border: "#bfdbfe",
    icon: "📊", layer: "Analytics Layer",
    description: "Task completion rates by type and status. Drives SLA and operations dashboards.",
    fields: [
      { name: "company_id", type: "tenant scope" },
      { name: "task_type", type: "enum" },
      { name: "status", type: "enum" },
      { name: "total_tasks", type: "INT" },
      { name: "completed_tasks", type: "INT" },
    ],
  },
  {
    id: "analytics_transactions", label: "analytics.transaction_summary", color: "#1d4ed8", bg: "#eff6ff", border: "#bfdbfe",
    icon: "📊", layer: "Analytics Layer",
    description: "Revenue and expense summaries by transaction_type, month, and payment status.",
    fields: [
      { name: "company_id", type: "tenant scope" },
      { name: "transaction_type", type: "enum" },
      { name: "payment_status", type: "enum" },
      { name: "total_amount", type: "FLOAT" },
      { name: "total_count", type: "INT" },
    ],
  },
  {
    id: "analytics_relationships", label: "analytics.relationship_summary", color: "#1d4ed8", bg: "#eff6ff", border: "#bfdbfe",
    icon: "📊", layer: "Analytics Layer",
    description: "Relationship network counts by type and status.",
    fields: [
      { name: "company_id", type: "tenant scope" },
      { name: "relationship_type", type: "enum" },
      { name: "status", type: "enum" },
      { name: "total_count", type: "INT" },
    ],
  },
  {
    id: "analytics_addresses", label: "analytics.address_summary", color: "#1d4ed8", bg: "#eff6ff", border: "#bfdbfe",
    icon: "📊", layer: "Analytics Layer",
    description: "Geographic distribution of addresses by city and country.",
    fields: [
      { name: "company_id", type: "tenant scope" },
      { name: "city / country", type: "string" },
      { name: "total_count", type: "INT" },
    ],
  },
];

// ── Open Data API nodes ────────────────────────────────────────────────────────
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
    icon: "🌍", layer: "Open Data APIs", description: "World Bank Open Data — economic indicators by country",
    fields: [
      { name: "country_name / code", type: "VARCHAR" },
      { name: "indicator_name", type: "VARCHAR" },
      { name: "year", type: "INT" },
      { name: "value", type: "FLOAT" },
    ],
  },
  {
    id: "exchange_rates", label: "exchange_rates", color: "#15803d", bg: "#f0fdf4", border: "#bbf7d0",
    icon: "💱", layer: "Open Data APIs", description: "Open Exchange Rates — live currency conversion",
    fields: [
      { name: "base_currency", type: "VARCHAR" },
      { name: "currency", type: "VARCHAR" },
      { name: "rate", type: "FLOAT" },
      { name: "last_updated", type: "DATETIME" },
    ],
  },
];

// ─── All edges ─────────────────────────────────────────────────────────────────
const EDGES = [
  // ── Taxonomy wires (cyan dashed) — MasterDataOption classifies entity subtypes
  { from: "MasterDataOption", to: "Person",       label: "person_subtype",       style: "taxonomy" },
  { from: "MasterDataOption", to: "Enterprise",   label: "enterprise_subtype",   style: "taxonomy" },
  { from: "MasterDataOption", to: "Product",      label: "item_subtype",         style: "taxonomy" },
  { from: "MasterDataOption", to: "Task",         label: "task_type",            style: "taxonomy" },
  { from: "MasterDataOption", to: "Relationship", label: "relationship_type",    style: "taxonomy" },

  // ── Core FK edges (solid green) — ontology links between the 7 entities
  { from: "Relationship", to: "Person",       label: "person_name"          },
  { from: "Relationship", to: "Enterprise",   label: "enterprise_name"      },
  { from: "Relationship", to: "Product",      label: "item_name"            },
  { from: "Task",         to: "Enterprise",   label: "enterprise"           },
  { from: "Task",         to: "Person",       label: "assigned_to_name"     },
  { from: "Task",         to: "Transaction",  label: "triggers →",          style: "trigger" },
  { from: "Transaction",  to: "Enterprise",   label: "enterprise"           },
  { from: "Transaction",  to: "Person",       label: "counterparty"         },
  { from: "Transaction",  to: "Task",         label: "source_task_id"       },
  { from: "Address",      to: "Enterprise",   label: "linked_enterprises"   },
  { from: "Address",      to: "Person",       label: "linked_people"        },
  { from: "Enterprise",   to: "Enterprise",   label: "parent_enterprise_id" },

  // ── ETL edges (blue dashed) — fires after every mutation, not just @daily
  { from: "Person",       to: "analytics_people",        label: "ETL @mutation", style: "etl" },
  { from: "Enterprise",   to: "analytics_enterprises",   label: "ETL @mutation", style: "etl" },
  { from: "Product",      to: "analytics_products",      label: "ETL @mutation", style: "etl" },
  { from: "Task",         to: "analytics_tasks",         label: "ETL @mutation", style: "etl" },
  { from: "Transaction",  to: "analytics_transactions",  label: "ETL @mutation", style: "etl" },
  { from: "Relationship", to: "analytics_relationships", label: "ETL @mutation", style: "etl" },
  { from: "Address",      to: "analytics_addresses",     label: "ETL @mutation", style: "etl" },

  // ── Open Data enrichment edges (dotted) — external APIs enrich master entities
  { from: "Enterprise",  to: "osm_places",         label: "geocoding",          style: "api_orange" },
  { from: "Enterprise",  to: "open_meteo_weather", label: "weather context",    style: "api_blue"   },
  { from: "Enterprise",  to: "worldbank",          label: "economic indicators", style: "api_orange" },
  { from: "Product",     to: "medications_rxnorm", label: "drug name lookup",   style: "api_purple" },
  { from: "Product",     to: "fda_openfda",        label: "recall check",       style: "api_red"    },
  { from: "Transaction", to: "exchange_rates",     label: "currency conversion", style: "api_green"  },
];

// ─── Default node positions ────────────────────────────────────────────────────
// Three-layer layout (top→bottom):
//   Row 0 (y=60)  — Open Data Enrichment APIs
//   Row 1 (y=300) — Layer 1: Three Master Entities
//   Row 2 (y=300) — Layer 1: MasterDataOption (taxonomy hub, right side)
//   Row 3 (y=560) — Layer 1: Four Supporting Entities
//   Row 4 (y=820) — Layer 2: Deployable Datamart (analytics.*)
const DEFAULT_POSITIONS = {
  // Open Data Enrichment (y=60)
  osm_places:              { x: 40,   y: 60  },
  open_meteo_weather:      { x: 300,  y: 60  },
  medications_rxnorm:      { x: 560,  y: 60  },
  fda_openfda:             { x: 820,  y: 60  },
  worldbank:               { x: 1080, y: 60  },
  exchange_rates:          { x: 1340, y: 60  },
  // Layer 1 — Three Master Entities (y=300)
  Person:                  { x: 60,   y: 300 },
  Enterprise:              { x: 340,  y: 300 },
  Product:                 { x: 620,  y: 300 },
  // Layer 1 — Taxonomy hub (y=300, right of masters)
  Address:                 { x: 900,  y: 300 },
  MasterDataOption:        { x: 1180, y: 300 },
  // Layer 1 — Four Supporting Entities (y=560)
  Task:                    { x: 60,   y: 560 },
  Transaction:             { x: 340,  y: 560 },
  Relationship:            { x: 620,  y: 560 },
  // Layer 2 — Deployable Datamart — analytics.* (y=820)
  analytics_people:        { x: 40,   y: 820 },
  analytics_enterprises:   { x: 250,  y: 820 },
  analytics_products:      { x: 460,  y: 820 },
  analytics_tasks:         { x: 670,  y: 820 },
  analytics_transactions:  { x: 880,  y: 820 },
  analytics_relationships: { x: 1090, y: 820 },
  analytics_addresses:     { x: 1300, y: 820 },
};

// ─── Auto-layout ──────────────────────────────────────────────────────────────
function computeAutoLayout(allTables) {
  const ROW_CONFIG = {
    "Open Data APIs":      { y: 60,  cols: 6 },
    "Master Entities":     { y: 300, cols: 3 },
    "Taxonomy":            { y: 300, cols: 2, offset: 3 },
    "Supporting Entities": { y: 560, cols: 3 },
    "Analytics Layer":     { y: 820, cols: 7 },
  };
  const byLayer = {};
  allTables.forEach(t => {
    if (!byLayer[t.layer]) byLayer[t.layer] = [];
    byLayer[t.layer].push(t.id);
  });
  const positions = {};
  Object.entries(ROW_CONFIG).forEach(([layer, { y, cols, offset = 0 }]) => {
    const ids = byLayer[layer] || [];
    const spacing = Math.min(260, 1400 / Math.max(cols, 1));
    ids.forEach((id, i) => {
      positions[id] = { x: 40 + (i + offset) * spacing, y };
    });
  });
  return positions;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const TABLE_W      = 215;
const TABLE_H_BASE = 60;
const FIELD_H      = 18;
const CANVAS_W     = 1620;
const CANVAS_H     = 1060;

function tableHeight(t) { return TABLE_H_BASE + t.fields.length * FIELD_H + 10; }

// ─── Edge geometry ─────────────────────────────────────────────────────────────
function getEdgePoint(fromId, toId, positions, tables) {
  const p  = positions[fromId];
  const t  = tables.find(x => x.id === fromId);
  if (!p || !t) return { x: 0, y: 0 };
  const h   = tableHeight(t);
  const cx  = p.x + TABLE_W / 2;
  const cy  = p.y + h / 2;
  const tp  = positions[toId];
  const tt  = tables.find(x => x.id === toId);
  if (!tp || !tt) return { x: cx, y: cy };
  const dx  = (tp.x + TABLE_W / 2) - cx;
  const dy  = (tp.y + tableHeight(tt) / 2) - cy;
  if (Math.abs(dx) > Math.abs(dy)) {
    return dx > 0 ? { x: p.x + TABLE_W, y: cy } : { x: p.x, y: cy };
  }
  return dy > 0 ? { x: cx, y: p.y + h } : { x: cx, y: p.y };
}

// ─── Styles ────────────────────────────────────────────────────────────────────
const LAYER_COLORS = {
  "Master Entities":     "bg-blue-50 text-blue-700 border-blue-200",
  "Supporting Entities": "bg-violet-50 text-violet-700 border-violet-200",
  "Taxonomy":            "bg-cyan-50 text-cyan-700 border-cyan-200",
  "Analytics Layer":     "bg-indigo-50 text-indigo-700 border-indigo-200",
  "Open Data APIs":      "bg-emerald-50 text-emerald-700 border-emerald-200",
};

const ALL_LAYERS = Object.keys(LAYER_COLORS);

function edgeStyle(style) {
  if (style === "taxonomy")   return { color: "#0891b2", dash: "5,3",  marker: "arrow-etl",        label_color: "#0891b2" };
  if (style === "etl")        return { color: "#2563eb", dash: "8,4",  marker: "arrow-etl",        label_color: "#2563eb" };
  if (style === "trigger")    return { color: "#f97316", dash: "6,3",  marker: "arrow-orange",     label_color: "#f97316" };
  if (style === "api_orange") return { color: "#ea580c", dash: "4,5",  marker: "arrow-api-orange", label_color: "#ea580c" };
  if (style === "api_blue")   return { color: "#0284c7", dash: "4,5",  marker: "arrow-api-blue",   label_color: "#0284c7" };
  if (style === "api_purple") return { color: "#7c3aed", dash: "4,5",  marker: "arrow-api-purple", label_color: "#7c3aed" };
  if (style === "api_red")    return { color: "#dc2626", dash: "4,5",  marker: "arrow-api-red",    label_color: "#dc2626" };
  if (style === "api_green")  return { color: "#16a34a", dash: "4,5",  marker: "arrow-api-green",  label_color: "#16a34a" };
  return { color: "#10b981", dash: "none", marker: "arrow-green", label_color: "#10b981" };
}

function isApiEdge(style) { return style && style.startsWith("api"); }

// ─── DDL generation ────────────────────────────────────────────────────────────
function generateDDL(tables) {
  const typeMap = {
    string: "VARCHAR", text: "TEXT", number: "FLOAT", boolean: "BOOLEAN",
    date: "DATE", "date/number": "DATE", datetime: "TIMESTAMP",
    array: "JSONB", enum: "VARCHAR", "string/enum": "VARCHAR",
    "date/number": "DATE", INT: "INT", FLOAT: "FLOAT", PK: "VARCHAR",
    "number/enum": "VARCHAR", "VARCHAR/FLOAT": "VARCHAR",
  };
  const skip = new Set([
    ...ANALYTICS_TABLES.map(t => t.id),
    ...API_TABLES.map(t => t.id),
  ]);
  return tables.filter(t => !skip.has(t.id)).map(t => {
    const cols = t.fields.map(f => {
      const name    = f.name.replace(/\s*\/\s*.+/, "").replace(/\s+/g, "_").replace(/[()]/g, "");
      const colType = f.pk ? "VARCHAR PRIMARY KEY" : (typeMap[f.type?.toLowerCase()] || "VARCHAR");
      return `  ${name} ${colType}`;
    });
    return `-- ${t.layer}: ${t.description}\nCREATE TABLE ${t.id.toLowerCase()} (\n${cols.join(",\n")}\n);`;
  }).join("\n\n");
}

function generateTableDDL(table) {
  const typeMap = {
    string: "VARCHAR", text: "TEXT", number: "FLOAT", boolean: "BOOLEAN",
    date: "DATE", datetime: "TIMESTAMP", array: "JSONB", enum: "VARCHAR",
    "string/enum": "VARCHAR", INT: "INT", FLOAT: "FLOAT", PK: "VARCHAR",
    "date/number": "DATE",
  };
  const cols = table.fields.map(f => {
    const name    = f.name.replace(/\s*\/\s*.+/, "").replace(/\s+/g, "_").replace(/[()]/g, "");
    const colType = f.pk ? "VARCHAR PRIMARY KEY" : (typeMap[f.type?.toLowerCase()] || "VARCHAR");
    return `  ${name} ${colType}`;
  });
  return `-- ${table.description}\nCREATE TABLE ${table.id.toLowerCase()} (\n${cols.join(",\n")}\n);`;
}

// ─── Main component ────────────────────────────────────────────────────────────
export default function DataModels() {
  const [zoom, setZoom]               = useState(0.7);
  const [pan, setPan]                 = useState({ x: 0, y: 0 });
  const [panDrag, setPanDrag]         = useState(null);
  const [nodeDrag, setNodeDrag]       = useState(null);
  const [positions, setPositions]     = useState(DEFAULT_POSITIONS);
  const [selectedTable, setSelectedTable] = useState(null);
  const [hoveredTable, setHoveredTable]   = useState(null);
  const [hoveredEdge, setHoveredEdge]     = useState(null);
  const [notebooks, setNotebooks]     = useState(NotebookStore.getAll());
  const [searchQuery, setSearchQuery] = useState("");
  const [enabledLayers, setEnabledLayers] = useState(new Set(ALL_LAYERS));
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [animating, setAnimating]     = useState(false);
  const [ddlCopied, setDdlCopied]     = useState(false);
  const containerRef  = useRef(null);
  const canvasRef     = useRef(null);
  const exportMenuRef = useRef(null);

  useEffect(() => { const unsub = NotebookStore.subscribe(setNotebooks); return unsub; }, []);

  useEffect(() => {
    const handler = e => { if (exportMenuRef.current && !exportMenuRef.current.contains(e.target)) setShowExportMenu(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    const handler = e => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
      if (e.key === "r" || e.key === "R") { setZoom(0.7); setPan({ x: 0, y: 0 }); setPositions(DEFAULT_POSITIONS); }
      if (e.key === "Escape") { setSelectedTable(null); setSearchQuery(""); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // ── Build node lists ──────────────────────────────────────────────────────
  const externalNodes = Object.values(notebooks).filter(n => n.connected);
  const allTables = [
    ...TABLES,
    ...ANALYTICS_TABLES,
    ...API_TABLES,
    ...externalNodes.map(nb => ({
      id: nb.id, label: nb.name,
      color: "#0ea5e9", bg: "#f0f9ff", border: "#bae6fd",
      icon: nb.type === "api" ? "🌐" : "🐍",
      layer: "External Sources", description: nb.type === "api" ? "API Connector" : "Python Script",
      fields: [{ name: "id", type: "PK", pk: true }, ...(nb.outputSchema || []).map(c => ({ name: c.name, type: c.type }))],
      isExternal: true,
    })),
  ];

  const fullPositions = { ...positions };
  externalNodes.forEach((nb, i) => {
    if (!fullPositions[nb.id]) fullPositions[nb.id] = { x: 60 + i * 280, y: 1580 };
  });

  const allEdges = [
    ...EDGES,
    ...externalNodes.map(nb => ({ from: nb.id, to: "Enterprise", label: "feeds →", style: "etl" })),
  ];

  // ── Search & filter ───────────────────────────────────────────────────────
  const q          = searchQuery.trim().toLowerCase();
  const matchingIds = q
    ? new Set(allTables.filter(t =>
        t.label.toLowerCase().includes(q) ||
        t.description?.toLowerCase().includes(q) ||
        t.fields.some(f => f.name.toLowerCase().includes(q))
      ).map(t => t.id))
    : null;

  const visibleIds = new Set(allTables.filter(t => enabledLayers.has(t.layer) || t.layer === "External Sources").map(t => t.id));

  // Auto-pan to first match
  useEffect(() => {
    if (!matchingIds || matchingIds.size === 0) return;
    const firstId = [...matchingIds][0];
    const pos = fullPositions[firstId];
    if (!pos || !containerRef.current) return;
    const { offsetWidth: cw, offsetHeight: ch } = containerRef.current;
    setPan({ x: cw / 2 - (pos.x + TABLE_W / 2) * zoom, y: ch / 2 - pos.y * zoom });
  }, [searchQuery]);

  // ── Connected edges for a given table id ─────────────────────────────────
  const getConnectedEdgeIndices = useCallback((tableId) => {
    if (!tableId) return new Set();
    return new Set(allEdges.map((e, i) => (e.from === tableId || e.to === tableId) ? i : -1).filter(i => i >= 0));
  }, [allEdges]);

  const highlightedEdges = getConnectedEdgeIndices(hoveredTable || selectedTable);

  // ── Pan & drag handlers ───────────────────────────────────────────────────
  const handleCanvasMouseDown = e => {
    if (e.target === containerRef.current || ["svg","rect","circle"].includes(e.target.tagName)) {
      setPanDrag({ startX: e.clientX - pan.x, startY: e.clientY - pan.y });
    }
  };

  const handleNodeMouseDown = (e, id) => {
    e.stopPropagation();
    const pos = fullPositions[id];
    setNodeDrag({ id, startMouseX: e.clientX, startMouseY: e.clientY, startNodeX: pos.x, startNodeY: pos.y });
  };

  const handleMouseMove = useCallback(e => {
    if (nodeDrag) {
      const dx = (e.clientX - nodeDrag.startMouseX) / zoom;
      const dy = (e.clientY - nodeDrag.startMouseY) / zoom;
      setPositions(prev => ({ ...prev, [nodeDrag.id]: { x: Math.max(0, nodeDrag.startNodeX + dx), y: Math.max(0, nodeDrag.startNodeY + dy) } }));
    } else if (panDrag) {
      setPan({ x: e.clientX - panDrag.startX, y: e.clientY - panDrag.startY });
    }
  }, [nodeDrag, panDrag, zoom]);

  const handleMouseUp = () => { setNodeDrag(null); setPanDrag(null); };

  const handleAutoLayout = () => {
    setAnimating(true);
    setPositions(prev => ({ ...prev, ...computeAutoLayout(allTables) }));
    setTimeout(() => setAnimating(false), 600);
  };

  // ── Mini-map ──────────────────────────────────────────────────────────────
  const MM_W = 180, MM_H = 110;
  const mmScaleX = MM_W / CANVAS_W;
  const mmScaleY = MM_H / CANVAS_H;

  const handleMiniMapClick = e => {
    const rect = e.currentTarget.getBoundingClientRect();
    const canvasX = (e.clientX - rect.left) / mmScaleX;
    const canvasY = (e.clientY - rect.top) / mmScaleY;
    if (!containerRef.current) return;
    const { offsetWidth: cw, offsetHeight: ch } = containerRef.current;
    setPan({ x: cw / 2 - canvasX * zoom, y: ch / 2 - canvasY * zoom });
  };

  const vpX = (-pan.x / zoom) * mmScaleX;
  const vpY = (-pan.y / zoom) * mmScaleY;
  const vpW = (containerRef.current?.offsetWidth  || 800) / zoom * mmScaleX;
  const vpH = (containerRef.current?.offsetHeight || 600) / zoom * mmScaleY;

  // ── Export ────────────────────────────────────────────────────────────────
  const exportPNG = async () => {
    setShowExportMenu(false);
    if (!canvasRef.current) return;
    const canvas = await html2canvas(canvasRef.current, { backgroundColor: "#f8fafc", scale: 1.5, useCORS: true });
    const a = document.createElement("a"); a.href = canvas.toDataURL("image/png"); a.download = "newsconseen_data_model.png"; a.click();
  };

  const exportJSON = () => {
    setShowExportMenu(false);
    const data = { tables: allTables.map(t => ({ id: t.id, label: t.label, layer: t.layer, fields: t.fields })), edges: allEdges };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a"); a.href = url; a.download = "newsconseen_schema.json"; a.click();
    URL.revokeObjectURL(url);
  };

  const exportDDL = () => {
    setShowExportMenu(false);
    const blob = new Blob([generateDDL(allTables)], { type: "text/plain" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a"); a.href = url; a.download = "newsconseen_schema.sql"; a.click();
    URL.revokeObjectURL(url);
  };

  const copyTableDDL = (table) => {
    navigator.clipboard.writeText(generateTableDDL(table));
    setDdlCopied(true);
    setTimeout(() => setDdlCopied(false), 2000);
  };

  const selected = selectedTable ? allTables.find(t => t.id === selectedTable) : null;

  // ─── RENDER ────────────────────────────────────────────────────────────────
  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col gap-0 overflow-hidden">

      {/* ── Header ── */}
      <div className="shrink-0 mb-2">
        <div className="flex items-start justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <GitBranch className="w-5 h-5 text-indigo-500" />
              Data Models &amp; Architecture
            </h1>
            <p className="text-xs text-slate-500 mt-0.5 max-w-2xl">
              The universal ontology — 3 master entities, 4 supporting entities, and the MasterDataOption taxonomy that makes it industry-agnostic.
              <span className="text-slate-400 ml-1">Layer 1 (Base44) → ETL @mutation → Layer 2 (analytics.*), enriched by open data connectors.</span>
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={e => { if (e.key === "Escape") setSearchQuery(""); }}
                placeholder="Search tables, fields…"
                className="pl-8 pr-8 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300 w-44 transition-all"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            {matchingIds && (
              <span className="text-[11px] text-indigo-600 font-semibold bg-indigo-50 px-2 py-0.5 rounded-full">{matchingIds.size} match{matchingIds.size !== 1 ? "es" : ""}</span>
            )}

            {/* Zoom */}
            <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl px-1 py-1">
              <button onClick={() => setZoom(z => Math.max(0.25, z - 0.1))} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"><ZoomOut className="w-4 h-4" /></button>
              <span className="text-xs font-mono text-slate-500 w-10 text-center">{Math.round(zoom * 100)}%</span>
              <button onClick={() => setZoom(z => Math.min(2, z + 0.1))} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"><ZoomIn className="w-4 h-4" /></button>
            </div>

            {/* Auto Layout */}
            <button onClick={handleAutoLayout}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 text-xs font-medium rounded-xl transition-colors">
              <LayoutGrid className="w-3.5 h-3.5" /> Auto Layout
            </button>

            {/* Reset */}
            <button
              onClick={() => { setZoom(0.7); setPan({ x: 0, y: 0 }); setPositions(DEFAULT_POSITIONS); }}
              title="Reset view (R)"
              className="p-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-500 transition-colors"
            >
              <Maximize2 className="w-4 h-4" />
            </button>

            {/* Export */}
            <div ref={exportMenuRef} className="relative">
              <button onClick={() => setShowExportMenu(v => !v)}
                className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 text-xs font-medium rounded-xl transition-colors">
                <Download className="w-3.5 h-3.5" /> Export
              </button>
              {showExportMenu && (
                <div className="absolute right-0 top-full mt-1 z-50 bg-white border border-slate-200 rounded-xl shadow-xl w-44 overflow-hidden">
                  {[
                    { label: "Export as PNG",   action: exportPNG },
                    { label: "Schema as JSON",  action: exportJSON },
                    { label: "SQL DDL (.sql)",  action: exportDDL },
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

        {/* ── Edge legend + Layer filter ── */}
        <div className="flex flex-wrap items-center gap-1.5 mt-2">
          {/* Layer pills */}
          {ALL_LAYERS.map(layer => {
            const cls     = LAYER_COLORS[layer];
            const enabled = enabledLayers.has(layer);
            return (
              <button key={layer}
                onClick={() => setEnabledLayers(prev => { const next = new Set(prev); if (next.has(layer)) next.delete(layer); else next.add(layer); return next; })}
                className={`text-[11px] px-2.5 py-0.5 rounded-full border font-medium transition-all ${enabled ? cls : "bg-slate-100 text-slate-400 border-slate-200 opacity-50"}`}
              >
                {layer}
              </button>
            );
          })}

          {/* Divider */}
          <span className="w-px h-4 bg-slate-200 mx-1" />

          {/* Edge type legend */}
          <span className="flex items-center gap-1.5 text-[11px] text-slate-500 bg-white border border-slate-200 px-2.5 py-0.5 rounded-full">
            <svg width="18" height="8"><line x1="0" y1="4" x2="18" y2="4" stroke="#10b981" strokeWidth="2" /></svg>
            FK Relationship
          </span>
          <span className="flex items-center gap-1.5 text-[11px] text-slate-500 bg-white border border-slate-200 px-2.5 py-0.5 rounded-full">
            <svg width="18" height="8"><line x1="0" y1="4" x2="18" y2="4" stroke="#2563eb" strokeWidth="2" strokeDasharray="5,3" /></svg>
            Airflow ETL
          </span>
          <span className="flex items-center gap-1.5 text-[11px] text-slate-500 bg-white border border-slate-200 px-2.5 py-0.5 rounded-full">
            <svg width="18" height="8"><line x1="0" y1="4" x2="18" y2="4" stroke="#ea580c" strokeWidth="2" strokeDasharray="3,4" /></svg>
            Open Data API
          </span>

          {/* Keyboard hint */}
          <span className="ml-auto flex items-center gap-1 text-[10px] text-slate-400">
            <Keyboard className="w-3 h-3" /> Press <kbd className="bg-slate-100 px-1 rounded text-[10px]">R</kbd> to reset · <kbd className="bg-slate-100 px-1 rounded text-[10px]">Esc</kbd> to clear
          </span>
        </div>
      </div>

      {/* ── Main canvas + side panel ── */}
      <div className="flex gap-3 flex-1 overflow-hidden">

        {/* Canvas */}
        <div
          ref={containerRef}
          className={`flex-1 border border-slate-200 rounded-2xl bg-slate-50 overflow-hidden relative ${nodeDrag || panDrag ? "cursor-grabbing" : "cursor-grab"}`}
          onMouseDown={handleCanvasMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          {/* Dot grid background */}
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
                  { id: "arrow-etl",        fill: "#2563eb" },
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
                const to   = getEdgePoint(edge.to, edge.from, fullPositions, allTables);
                const es   = edgeStyle(edge.style);
                const isHovered    = hoveredEdge === i;
                const isHighlighted = highlightedEdges.has(i);
                const dimmed = (hoveredTable || selectedTable) && !isHighlighted;
                const mx = (from.x + to.x) / 2;
                const my = (from.y + to.y) / 2;
                return (
                  <g key={i}>
                    <path
                      d={`M ${from.x} ${from.y} C ${from.x + (to.x - from.x) * 0.5} ${from.y}, ${from.x + (to.x - from.x) * 0.5} ${to.y}, ${to.x} ${to.y}`}
                      fill="none"
                      stroke={isHovered || isHighlighted ? es.color : es.color}
                      strokeWidth={isHighlighted || isHovered ? 2.5 : 1.5}
                      strokeDasharray={es.dash}
                      markerEnd={`url(#${es.marker})`}
                      opacity={dimmed ? 0.08 : isHighlighted ? 0.95 : 0.45}
                      style={{ transition: "opacity 0.15s" }}
                    />
                    {/* Fat invisible hit target */}
                    <path
                      d={`M ${from.x} ${from.y} C ${from.x + (to.x - from.x) * 0.5} ${from.y}, ${from.x + (to.x - from.x) * 0.5} ${to.y}, ${to.x} ${to.y}`}
                      fill="none" stroke="transparent" strokeWidth="14"
                      style={{ pointerEvents: "stroke", cursor: "pointer" }}
                      onMouseEnter={() => setHoveredEdge(i)}
                      onMouseLeave={() => setHoveredEdge(null)}
                    />
                    {(isHovered || isHighlighted) && (
                      <text x={mx} y={my - 7} textAnchor="middle" fontSize="10" fill={es.label_color} fontWeight="600"
                        style={{ pointerEvents: "none" }}>
                        {edge.label}
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>

            {/* Table nodes */}
            {allTables.map(table => {
              const pos = fullPositions[table.id];
              if (!pos || !visibleIds.has(table.id)) return null;
              const h              = tableHeight(table);
              const isSelected     = selectedTable === table.id;
              const isHovered      = hoveredTable === table.id;
              const isDragging     = nodeDrag?.id === table.id;
              const layerCls       = LAYER_COLORS[table.layer] || "bg-slate-100 text-slate-600 border-slate-300";
              const isMatch        = matchingIds ? matchingIds.has(table.id) : true;
              const isDimmed       = (matchingIds && !isMatch) || ((hoveredTable || selectedTable) && !isSelected && !isHovered && !highlightedEdges.size);
              const connectedToActive = (hoveredTable || selectedTable) && highlightedEdges.size > 0 &&
                allEdges.some((e, i) => highlightedEdges.has(i) && (e.from === table.id || e.to === table.id));

              return (
                <div
                  key={table.id}
                  style={{
                    position: "absolute",
                    left: pos.x, top: pos.y,
                    width: TABLE_W,
                    backgroundColor: table.bg,
                    borderColor: isSelected ? table.color : (isMatch && matchingIds) ? table.color : isHovered ? table.color : table.border,
                    zIndex: isDragging ? 50 : isSelected ? 25 : isHovered ? 20 : 5,
                    opacity: isDimmed && !connectedToActive ? 0.18 : 1,
                    boxShadow: (isMatch && matchingIds)
                      ? `0 0 0 3px ${table.color}55, 0 4px 16px ${table.color}33`
                      : isSelected ? `0 0 0 2px ${table.color}, 0 8px 24px ${table.color}30`
                      : connectedToActive ? `0 0 0 1.5px ${table.color}80`
                      : undefined,
                    transition: animating ? "left 0.5s ease, top 0.5s ease" : "box-shadow 0.15s, opacity 0.15s",
                  }}
                  className={`rounded-xl border-2 shadow-md select-none ${isDragging ? "shadow-2xl cursor-grabbing" : "cursor-grab hover:shadow-lg"}`}
                  onMouseDown={e => handleNodeMouseDown(e, table.id)}
                  onMouseEnter={() => setHoveredTable(table.id)}
                  onMouseLeave={() => setHoveredTable(null)}
                  onClick={() => { if (!nodeDrag) setSelectedTable(selectedTable === table.id ? null : table.id); }}
                >
                  {/* Header */}
                  <div className="flex items-center gap-1.5 px-3 py-2 rounded-t-lg"
                    style={{ backgroundColor: table.color + "20", borderBottom: `1px solid ${table.border}` }}>
                    <span className="text-sm">{table.icon}</span>
                    <span className="text-[11px] font-bold truncate flex-1" style={{ color: table.color }}>{table.label}</span>
                    <span className={`text-[8px] px-1.5 py-0.5 rounded-full border font-medium shrink-0 ${layerCls}`}>{table.layer}</span>
                  </div>
                  {/* Fields */}
                  <div className="px-3 py-1.5 space-y-0.5">
                    {table.fields.map((f, fi) => (
                      <div key={fi} className="flex items-center gap-1.5 text-[11px]">
                        {f.pk
                          ? <span className="w-3.5 h-3.5 rounded-sm bg-amber-400 text-white flex items-center justify-center text-[7px] font-bold shrink-0">PK</span>
                          : f.fk
                          ? <span className="w-3.5 h-3.5 rounded-sm bg-blue-400 text-white flex items-center justify-center text-[7px] font-bold shrink-0">FK</span>
                          : <span className="w-3.5 h-3.5 shrink-0" />
                        }
                        <span className="text-slate-700 truncate flex-1">{f.name}</span>
                        <span className="text-[9px] text-slate-400 truncate max-w-[60px]">{f.type}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Mini-map */}
          <div
            className="absolute bottom-4 right-4 rounded-xl overflow-hidden border border-white/20 shadow-xl cursor-pointer"
            style={{ width: MM_W, height: MM_H, background: "rgba(15,23,42,0.85)" }}
            onClick={handleMiniMapClick} title="Click to pan"
          >
            <svg width={MM_W} height={MM_H}>
              {allTables.filter(t => visibleIds.has(t.id) && fullPositions[t.id]).map(t => {
                const p = fullPositions[t.id];
                return (
                  <rect key={t.id}
                    x={p.x * mmScaleX} y={p.y * mmScaleY}
                    width={TABLE_W * mmScaleX} height={Math.max(4, tableHeight(t) * mmScaleY)}
                    rx="1" fill={t.color} opacity={selectedTable === t.id ? 1 : 0.6}
                  />
                );
              })}
              <rect x={Math.max(0, vpX)} y={Math.max(0, vpY)} width={Math.min(MM_W, vpW)} height={Math.min(MM_H, vpH)}
                fill="none" stroke="white" strokeWidth="1.5" opacity="0.7" rx="1" />
            </svg>
            <p className="absolute bottom-1 left-1.5 text-[8px] text-slate-500 font-mono">mini-map · click to pan</p>
          </div>
        </div>

        {/* ── Detail panel ── */}
        <div className="w-64 shrink-0 space-y-3 overflow-y-auto">

          {/* Table detail */}
          {selected ? (
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
              {/* Table header */}
              <div className="px-4 py-3 border-b border-slate-100" style={{ backgroundColor: selected.bg }}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xl shrink-0">{selected.icon}</span>
                    <div className="min-w-0">
                      <p className="font-bold text-sm truncate" style={{ color: selected.color }}>{selected.label}</p>
                      <p className="text-[11px] text-slate-500 leading-snug mt-0.5">{selected.description}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => copyTableDDL(selected)}
                    title="Copy DDL for this table"
                    className="shrink-0 p-1.5 rounded-lg bg-white/70 hover:bg-white border border-slate-200 text-slate-400 hover:text-emerald-600 transition-colors"
                  >
                    {ddlCopied ? <CheckCheck className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
                <span className={`mt-2 inline-block text-[10px] px-2 py-0.5 rounded-full border font-medium ${LAYER_COLORS[selected.layer] || ""}`}>
                  {selected.layer}
                </span>
              </div>

              {/* Fields */}
              <div className="px-4 py-3 border-b border-slate-100">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Fields</p>
                <div className="space-y-1">
                  {selected.fields.map((f, i) => (
                    <div key={i} className="flex items-center gap-1.5 text-xs">
                      {f.pk
                        ? <span className="px-1 rounded bg-amber-100 text-amber-700 text-[9px] font-bold shrink-0">PK</span>
                        : f.fk
                        ? <span className="px-1 rounded bg-blue-100 text-blue-700 text-[9px] font-bold shrink-0">FK</span>
                        : <span className="px-1 rounded bg-slate-100 text-slate-400 text-[9px] shrink-0">—</span>
                      }
                      <span className="text-slate-700 flex-1 truncate">{f.name}</span>
                      <span className="text-[10px] text-slate-400 shrink-0">{f.type}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Connected tables */}
              <div className="px-4 py-3">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                  Connected Tables ({allEdges.filter(e => e.from === selected.id || e.to === selected.id).length})
                </p>
                <div className="space-y-1">
                  {allEdges.filter(e => e.from === selected.id || e.to === selected.id).map((e, i) => {
                    const other   = e.from === selected.id ? e.to : e.from;
                    const outgoing = e.from === selected.id;
                    const es = edgeStyle(e.style);
                    return (
                      <button key={i}
                        onClick={() => setSelectedTable(other)}
                        className="w-full flex items-center gap-1.5 text-[11px] text-left hover:bg-slate-50 rounded-lg px-1 py-0.5 transition-colors group">
                        <span style={{ color: es.color }} className="font-bold shrink-0">{outgoing ? "→" : "←"}</span>
                        <span className="text-slate-700 font-medium truncate group-hover:text-indigo-600">{other}</span>
                        <span className="text-slate-300 text-[10px] truncate shrink-0">({e.label})</span>
                      </button>
                    );
                  })}
                  {allEdges.filter(e => e.from === selected.id || e.to === selected.id).length === 0 && (
                    <p className="text-[11px] text-slate-400">No direct edges</p>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-2xl p-4 text-center">
              <Database className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="text-xs text-slate-500 font-medium">Click any table to inspect fields and relationships</p>
              <p className="text-[10px] text-slate-400 mt-1">Hover a table to highlight its connections</p>
            </div>
          )}

          {/* Schema stats */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-2">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Schema Stats</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: "Base Tables",    value: TABLES.length },
                { label: "Edges",          value: EDGES.length },
                { label: "Open APIs",      value: API_TABLES.length },
                { label: "Analytics",      value: ANALYTICS_TABLES.length },
                { label: "ETL Pipelines",  value: 7 },
                { label: "Layers",         value: ALL_LAYERS.length },
              ].map(({ label, value }) => (
                <div key={label} className="bg-slate-50 rounded-xl px-3 py-2 text-center">
                  <p className="text-lg font-bold text-slate-700">{value}</p>
                  <p className="text-[10px] text-slate-400">{label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Data Flow Summary */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-2">
            <div className="flex items-center gap-1.5 mb-1">
              <Info className="w-3.5 h-3.5 text-slate-400" />
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Data Flow Summary</p>
            </div>
            {[
              { step: "0", label: "Open APIs",  color: "#ea580c", desc: "OSM, RxNorm, OpenFDA, Weather, World Bank — enrich records automatically" },
              { step: "1", label: "Ingest",     color: "#6366f1", desc: "People, Enterprises, Products, Services created via UI or bulk import" },
              { step: "2", label: "Connect",    color: "#ec4899", desc: "Person↔Enterprise, Item↔Enterprise links established" },
              { step: "3", label: "Operate",    color: "#f97316", desc: "Tasks assigned per enterprise — work planned and tracked" },
              { step: "4", label: "Ledger",     color: "#dc2626", desc: "Tasks trigger Transactions — stock moves, revenue recorded" },
              { step: "5", label: "ETL",        color: "#2563eb", desc: "Airflow pulls from Base44 → transforms → loads into PostgreSQL" },
              { step: "6", label: "Analytics",  color: "#7c3aed", desc: "QueryBuilder & Reports read analytics tables — never the live DB" },
            ].map(({ step, label, color, desc }) => (
              <div key={step} className="flex gap-2 text-[11px]">
                <span className="font-black shrink-0 w-4 text-right" style={{ color }}>{step}</span>
                <span className="font-semibold shrink-0" style={{ color }}>{label}</span>
                <span className="text-slate-400 leading-snug">{desc}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}