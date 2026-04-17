import { base44 } from "@/api/base44Client";
import { UploadedDataStore } from "./UploadedDataStore";
import { fetchOpenDataTable, OPEN_DATA_TABLES } from "./openDataAPIs";

const RAILWAY_BASE = "https://newsconseenwebapp-production.up.railway.app";
const RAILWAY_API_KEY = import.meta.env.VITE_RAILWAY_API_KEY || "";
const RAILWAY_HEADERS = { "x-api-key": RAILWAY_API_KEY };

// Entity name → ETL slug for /load/{slug}-summary
const _ETL_SLUGS = {
  enterprises:   "enterprise",
  people:        "people",
  products:      "product",
  tasks:         "task",
  transactions:  "transaction",
  services:      "service",
  relationships: "relationship",
  addresses:     "address",
};

// Fire-and-forget ETL refresh after any mutation — never blocks the caller
function _triggerETL(entityName) {
  const slug = _ETL_SLUGS[entityName];
  if (!slug) return;
  fetch(`${RAILWAY_BASE}/load/${slug}-summary`, { method: "POST" }).catch(() => {});
}

// The 7 canonical entities from the universal ontology + Service (supporting entity).
// DO NOT add non-canonical entities here — use person_type/item_type filters instead.
// e.g. medications → products WHERE item_type='physical'
//      clients     → people   WHERE person_type='client'
export const MASTER_TABLES = {
  enterprises:   { entity: "Enterprise",   label: "Enterprises" },
  people:        { entity: "Person",       label: "People" },
  products:      { entity: "Product",      label: "Products" },
  services:      { entity: "Service",      label: "Services" },
  addresses:     { entity: "Address",      label: "Addresses" },
  relationships: { entity: "Relationship", label: "Relationships" },
  tasks:         { entity: "Task",         label: "Tasks" },
  transactions:  { entity: "Transaction",  label: "Transactions" },
};

export const PROTECTED_TABLES = new Set(["enterprises", "people", "products", "services", "addresses"]);

// ── Analytics virtual tables ───────────────────────────────────────────────
export const ANALYTICS_TABLES = {
  analytics_enterprises: {
    endpoint: "/enterprise-summary",
    columns: [
      { col: "id", type: "VARCHAR" },
      { col: "name", type: "VARCHAR" },
      { col: "enterprise_type", type: "ENUM" },
      { col: "status", type: "ENUM" },
      { col: "operating_status", type: "ENUM" },
      { col: "is_active", type: "ENUM" },
      { col: "is_root", type: "ENUM" },
      { col: "primary_address", type: "VARCHAR" },
      { col: "days_since_created", type: "INT" },
      { col: "snapshot_date", type: "DATE" },
    ],
  },
  analytics_tasks: {
    endpoint: "/task-summary",
    columns: [
      { col: "enterprise_id", type: "VARCHAR" },
      { col: "task_type", type: "ENUM" },
      { col: "status", type: "ENUM" },
      { col: "total_tasks", type: "INT" },
      { col: "completed_tasks", type: "INT" },
      { col: "completion_rate_pct", type: "FLOAT" },
      { col: "overdue_tasks", type: "INT" },
      { col: "tasks_last_7d", type: "INT" },
      { col: "tasks_last_30d", type: "INT" },
      { col: "snapshot_date", type: "DATE" },
    ],
  },
  analytics_transactions: {
    endpoint: "/transaction-summary",
    columns: [
      { col: "enterprise_id", type: "VARCHAR" },
      { col: "transaction_type", type: "ENUM" },
      { col: "status", type: "ENUM" },
      { col: "total_transactions", type: "INT" },
      { col: "total_amount", type: "FLOAT" },
      { col: "avg_amount", type: "FLOAT" },
      { col: "outstanding_amount", type: "FLOAT" },
      { col: "is_revenue", type: "ENUM" },
      { col: "is_expense", type: "ENUM" },
      { col: "revenue_last_7d", type: "INT" },
      { col: "revenue_last_30d", type: "INT" },
      { col: "expense_last_30d", type: "INT" },
      { col: "snapshot_date", type: "DATE" },
    ],
  },
  analytics_people: {
    endpoint: "/people-summary",
    columns: [
      { col: "enterprise_id", type: "VARCHAR" },
      { col: "person_type", type: "ENUM" },
      { col: "status", type: "ENUM" },
      { col: "people_count", type: "INT" },
      { col: "active_count", type: "INT" },
      { col: "inactive_count", type: "INT" },
      { col: "retention_rate_pct", type: "FLOAT" },
      { col: "avg_tenure_days", type: "FLOAT" },
      { col: "is_staff", type: "ENUM" },
      { col: "is_participant", type: "ENUM" },
      { col: "is_contact", type: "ENUM" },
      { col: "new_last_7d", type: "INT" },
      { col: "new_last_30d", type: "INT" },
      { col: "snapshot_date", type: "DATE" },
    ],
  },
  analytics_services: {
    endpoint: "/service-summary",
    columns: [
      { col: "enterprise_id", type: "VARCHAR" },
      { col: "service_type", type: "ENUM" },
      { col: "status", type: "ENUM" },
      { col: "category", type: "ENUM" },
      { col: "service_count", type: "INT" },
      { col: "active_service_count", type: "INT" },
      { col: "total_billable_value", type: "FLOAT" },
      { col: "avg_rate", type: "FLOAT" },
      { col: "is_billable", type: "ENUM" },
      { col: "new_last_30d", type: "INT" },
      { col: "snapshot_date", type: "DATE" },
    ],
  },
  analytics_products: {
    endpoint: "/product-summary",
    columns: [
      { col: "enterprise_id", type: "VARCHAR" },
      { col: "item_type", type: "ENUM" },
      { col: "status", type: "ENUM" },
      { col: "total_products", type: "INT" },
      { col: "total_stock", type: "INT" },
      { col: "avg_price", type: "FLOAT" },
      { col: "total_inventory_value", type: "FLOAT" },
      { col: "avg_gross_margin_pct", type: "FLOAT" },
      { col: "low_stock_count", type: "INT" },
      { col: "out_of_stock_count", type: "INT" },
      { col: "expiring_7d_count", type: "INT" },
      { col: "expiring_30d_count", type: "INT" },
      { col: "is_medication", type: "ENUM" },
      { col: "is_livestock", type: "ENUM" },
      { col: "is_perishable", type: "ENUM" },
      { col: "is_digital", type: "ENUM" },
      { col: "is_equipment", type: "ENUM" },
      { col: "new_last_30d", type: "INT" },
      { col: "snapshot_date", type: "DATE" },
    ],
  },
  analytics_addresses: {
    endpoint: "/address-summary",
    columns: [
      { col: "id", type: "VARCHAR" },
      { col: "label", type: "VARCHAR" },
      { col: "city", type: "VARCHAR" },
      { col: "state_region", type: "VARCHAR" },
      { col: "country", type: "VARCHAR" },
      { col: "address_type", type: "ENUM" },
      { col: "linked_entity_type", type: "ENUM" },
      { col: "has_coordinates", type: "ENUM" },
      { col: "coordinate_source", type: "ENUM" },
      { col: "is_active", type: "ENUM" },
      { col: "days_since_created", type: "INT" },
    ],
  },
  analytics_relationships: {
    endpoint: "/relationship-summary",
    columns: [
      { col: "id", type: "VARCHAR" },
      { col: "relationship_type", type: "ENUM" },
      { col: "relationship_category", type: "ENUM" },
      { col: "person_name", type: "VARCHAR" },
      { col: "enterprise_name", type: "VARCHAR" },
      { col: "item_name", type: "VARCHAR" },
      { col: "role", type: "VARCHAR" },
      { col: "status", type: "ENUM" },
      { col: "is_active", type: "ENUM" },
      { col: "is_ended", type: "ENUM" },
      { col: "duration_days", type: "INT" },
      { col: "has_end_date", type: "ENUM" },
      { col: "days_since_created", type: "INT" },
    ],
  },
};

// ── Raw individual-record tables (python_layer raw.* schema) ──────────────
// Endpoint: GET /raw/{entity}?company_id=...&limit=...
// Returns full per-row records from Base44 — no aggregation, no transforms.
// Use these when a user needs to query, chart, or report on individual records.
export const RAW_TABLES = {
  raw_people: {
    entity: "people",
    label: "Raw People (individual records)",
    columns: [
      { col: "id", type: "VARCHAR" },
      { col: "company_id", type: "VARCHAR" },
      { col: "full_name", type: "VARCHAR" },
      { col: "person_type", type: "ENUM" },
      { col: "person_subtype", type: "VARCHAR" },
      { col: "status", type: "ENUM" },
      { col: "engagement_model", type: "ENUM" },
      { col: "availability_status", type: "ENUM" },
      { col: "email", type: "VARCHAR" },
      { col: "phone", type: "VARCHAR" },
      { col: "enterprise_id", type: "VARCHAR" },
      { col: "start_date", type: "DATE" },
      { col: "end_date", type: "DATE" },
      { col: "created_date", type: "DATE" },
    ],
  },
  raw_enterprises: {
    entity: "enterprises",
    label: "Raw Enterprises (individual records)",
    columns: [
      { col: "id", type: "VARCHAR" },
      { col: "company_id", type: "VARCHAR" },
      { col: "name", type: "VARCHAR" },
      { col: "enterprise_type", type: "ENUM" },
      { col: "enterprise_tier", type: "ENUM" },
      { col: "status", type: "ENUM" },
      { col: "operating_status", type: "ENUM" },
      { col: "parent_id", type: "VARCHAR" },
      { col: "primary_address", type: "VARCHAR" },
      { col: "created_date", type: "DATE" },
    ],
  },
  raw_products: {
    entity: "products",
    label: "Raw Products (individual records)",
    columns: [
      { col: "id", type: "VARCHAR" },
      { col: "company_id", type: "VARCHAR" },
      { col: "name", type: "VARCHAR" },
      { col: "item_type", type: "ENUM" },
      { col: "item_class", type: "ENUM" },
      { col: "item_subtype", type: "VARCHAR" },
      { col: "status", type: "ENUM" },
      { col: "price", type: "FLOAT" },
      { col: "stock_quantity", type: "INT" },
      { col: "unit_of_measure", type: "VARCHAR" },
      { col: "expiry_date", type: "DATE" },
      { col: "created_date", type: "DATE" },
    ],
  },
  raw_tasks: {
    entity: "tasks",
    label: "Raw Tasks (individual records)",
    columns: [
      { col: "id", type: "VARCHAR" },
      { col: "company_id", type: "VARCHAR" },
      { col: "task_type", type: "VARCHAR" },
      { col: "status", type: "ENUM" },
      { col: "title", type: "VARCHAR" },
      { col: "enterprise_id", type: "VARCHAR" },
      { col: "assigned_to", type: "VARCHAR" },
      { col: "due_date", type: "DATE" },
      { col: "completed_date", type: "DATE" },
      { col: "created_date", type: "DATE" },
    ],
  },
  raw_transactions: {
    entity: "transactions",
    label: "Raw Transactions (individual records)",
    columns: [
      { col: "id", type: "VARCHAR" },
      { col: "company_id", type: "VARCHAR" },
      { col: "transaction_type", type: "ENUM" },
      { col: "status", type: "ENUM" },
      { col: "amount", type: "FLOAT" },
      { col: "currency", type: "VARCHAR" },
      { col: "enterprise_id", type: "VARCHAR" },
      { col: "person_id", type: "VARCHAR" },
      { col: "invoice_date", type: "DATE" },
      { col: "due_date", type: "DATE" },
      { col: "created_date", type: "DATE" },
    ],
  },
  raw_services: {
    entity: "services",
    label: "Raw Services (individual records)",
    columns: [
      { col: "id", type: "VARCHAR" },
      { col: "company_id", type: "VARCHAR" },
      { col: "name", type: "VARCHAR" },
      { col: "service_type", type: "VARCHAR" },
      { col: "status", type: "ENUM" },
      { col: "rate", type: "FLOAT" },
      { col: "enterprise_id", type: "VARCHAR" },
      { col: "created_date", type: "DATE" },
    ],
  },
  raw_relationships: {
    entity: "relationships",
    label: "Raw Relationships (individual records)",
    columns: [
      { col: "id", type: "VARCHAR" },
      { col: "company_id", type: "VARCHAR" },
      { col: "relationship_type", type: "VARCHAR" },
      { col: "relationship_category", type: "VARCHAR" },
      { col: "person_id", type: "VARCHAR" },
      { col: "enterprise_id", type: "VARCHAR" },
      { col: "item_id", type: "VARCHAR" },
      { col: "status", type: "ENUM" },
      { col: "start_date", type: "DATE" },
      { col: "end_date", type: "DATE" },
      { col: "created_date", type: "DATE" },
    ],
  },
  raw_addresses: {
    entity: "addresses",
    label: "Raw Addresses (individual records)",
    columns: [
      { col: "id", type: "VARCHAR" },
      { col: "company_id", type: "VARCHAR" },
      { col: "label", type: "VARCHAR" },
      { col: "street", type: "VARCHAR" },
      { col: "city", type: "VARCHAR" },
      { col: "state_region", type: "VARCHAR" },
      { col: "country", type: "VARCHAR" },
      { col: "postal_code", type: "VARCHAR" },
      { col: "address_type", type: "ENUM" },
      { col: "latitude", type: "FLOAT" },
      { col: "longitude", type: "FLOAT" },
      { col: "created_date", type: "DATE" },
    ],
  },
  raw_ml_predictions: {
    entity: "ml_predictions",
    label: "ML Predictions (stored model results)",
    columns: [
      { col: "id", type: "INT" },
      { col: "company_id", type: "VARCHAR" },
      { col: "model", type: "VARCHAR" },
      { col: "result_json", type: "VARCHAR" },
      { col: "computed_at", type: "DATE" },
    ],
  },
};

// ── External API virtual tables ────────────────────────────────────────────
export const EXTERNAL_TABLES = {
  medications_api: {
    label: "Medication Search",
    columns: [
      { col: "rxcui", type: "VARCHAR" },
      { col: "name", type: "VARCHAR" },
      { col: "synonym", type: "VARCHAR" },
      { col: "tty_label", type: "VARCHAR" },
      { col: "is_generic", type: "VARCHAR" },
      { col: "is_branded", type: "VARCHAR" },
    ],
  },
  medications_recalls: {
    label: "Medication Recalls",
    columns: [
      { col: "product_description", type: "VARCHAR" },
      { col: "reason_for_recall", type: "VARCHAR" },
      { col: "status", type: "VARCHAR" },
      { col: "recall_initiation_date", type: "DATE" },
      { col: "recalling_firm", type: "VARCHAR" },
      { col: "is_active", type: "VARCHAR" },
    ],
  },
};

// In-memory caches
let analyticsCache = {};
let rawCache = {};

export async function fetchAllAnalytics(companyId) {
  const results = {};
  await Promise.all(
    Object.entries(ANALYTICS_TABLES).map(async ([key, cfg]) => {
      try {
        const url = companyId
          ? `${RAILWAY_BASE}${cfg.endpoint}?company_id=${encodeURIComponent(companyId)}`
          : `${RAILWAY_BASE}${cfg.endpoint}`;
        const res = await fetch(url, { headers: RAILWAY_HEADERS });
        if (res.ok) {
          const data = await res.json();
          results[key] = Array.isArray(data) ? data : (data.data || data.results || []);
        } else {
          results[key] = [];
        }
      } catch {
        results[key] = [];
      }
    })
  );
  analyticsCache = results;
  return results;
}

// Maps raw table entity name → Base44 entity key (for fallback)
const RAW_TO_BASE44 = {
  people:        "Person",
  enterprises:   "Enterprise",
  products:      "Product",
  tasks:         "Task",
  transactions:  "Transaction",
  services:      "Service",
  relationships: "Relationship",
  addresses:     "Address",
};

async function fetchRawTable(name, companyId) {
  const cacheKey = companyId ? `${name}__${companyId}` : name;
  if (rawCache[cacheKey]) return rawCache[cacheKey];
  const cfg = RAW_TABLES[name];
  if (!cfg) return [];

  // Tier 1 — python_layer raw.* schema
  try {
    const params = new URLSearchParams({ limit: "1000" });
    if (companyId) params.set("company_id", companyId);
    const res = await fetch(
      `${RAILWAY_BASE}/raw/${cfg.entity}?${params}`,
      { headers: RAILWAY_HEADERS }
    );
    if (res.ok) {
      const data = await res.json();
      const rows = Array.isArray(data) ? data : (data.data || data.results || []);
      if (rows.length > 0) {
        rawCache[cacheKey] = rows;
        return rows;
      }
    }
  } catch { /* fall through */ }

  // Tier 2 — Base44 live fallback
  const entityKey = RAW_TO_BASE44[cfg.entity];
  if (entityKey && base44.entities[entityKey]) {
    try {
      const filter = companyId ? { company_id: companyId } : {};
      const rows = await base44.entities[entityKey].filter(filter);
      if (rows.length > 0) {
        rawCache[cacheKey] = rows;
        return rows;
      }
    } catch { /* return empty */ }
  }

  return [];
}

// Maps analytics table name → raw table name (for cascading fallback)
const ANALYTICS_TO_RAW = {
  analytics_people:        "raw_people",
  analytics_enterprises:   "raw_enterprises",
  analytics_products:      "raw_products",
  analytics_tasks:         "raw_tasks",
  analytics_transactions:  "raw_transactions",
  analytics_services:      "raw_services",
  analytics_relationships: "raw_relationships",
  analytics_addresses:     "raw_addresses",
};

async function fetchAnalyticsTable(name, companyId) {
  const cacheKey = companyId ? `${name}__${companyId}` : name;
  if (analyticsCache[cacheKey]) return analyticsCache[cacheKey];
  const cfg = ANALYTICS_TABLES[name];
  if (!cfg) return [];

  // Tier 1 — python_layer analytics.* (GET endpoint fetches Base44 live and transforms)
  try {
    const url = companyId
      ? `${RAILWAY_BASE}${cfg.endpoint}?company_id=${encodeURIComponent(companyId)}`
      : `${RAILWAY_BASE}${cfg.endpoint}`;
    const res = await fetch(url, { headers: RAILWAY_HEADERS });
    if (res.ok) {
      const data = await res.json();
      const rows = Array.isArray(data) ? data : (data.data || data.results || []);
      if (rows.length > 0) {
        analyticsCache[cacheKey] = rows;
        return rows;
      }
    }
  } catch { /* fall through */ }

  // Tier 2 — raw table fallback (includes Base44 live fallback inside fetchRawTable)
  const rawName = ANALYTICS_TO_RAW[name];
  if (rawName) {
    const rows = await fetchRawTable(rawName, companyId);
    if (rows.length > 0) {
      analyticsCache[cacheKey] = rows;
      return rows;
    }
  }

  return [];
}

// ── parseWhere helper for virtual tables ───────────────────────────────────
function parseWhere(sql) {
  const out = {};
  const m = sql.match(/where\s+(.+?)(?:\s+order|\s+limit|$)/is);
  if (!m) return out;
  const clause = m[1];
  const parts = clause.split(/\s+and\s+/i);
  parts.forEach(part => {
    const eq = part.match(/(\w+)\s*(?:=|like)\s*['"]([^'"]+)['"]/i);
    if (eq) out[eq[1].toLowerCase()] = eq[2];
    const num = part.match(/(\w+)\s*=\s*(\d+)/i);
    if (num) out[num[1].toLowerCase()] = num[2];
  });
  return out;
}

// ── Virtual table executor ─────────────────────────────────────────────────
async function executeVirtualTable(table, sql) {
  const w = parseWhere(sql);
  let rows = [];
  let message = "";

  try {
    if (table === "osm_places") {
      const q = [w.query, w.city, w.country].filter(Boolean).join(" ");
      if (!q) return { type: "select", rows: [], message: "Usage: WHERE query = 'hospital' AND city = 'Portland'" };
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=20`,
        { headers: { "User-Agent": "newsconseen/1.0" } }
      );
      const data = await res.json();
      rows = data.map(r => ({
        place_id: r.place_id, name: r.name || r.display_name?.split(",")[0] || "",
        display_name: r.display_name, type: r.type,
        lat: parseFloat(r.lat), lon: parseFloat(r.lon),
        postcode: r.address?.postcode || "", country: r.address?.country || "",
      }));
      message = `${rows.length} places found`;
    }

    else if (table === "osm_nearby") {
      const lat = w.lat || "44.8", lon = w.lon || "-68.7";
      const type = w.type || "pharmacy";
      const radius = parseInt(w.radius_km || w.radius || "5") * 1000;
      const query = `[out:json];node["amenity"="${type}"](around:${radius},${lat},${lon});out body;`;
      const res = await fetch(
        `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`
      );
      const text = await res.text();
      if (!text.trim().startsWith("{")) return { type: "select", rows: [], message: `Overpass API returned non-JSON. The service may be temporarily unavailable.` };
      const data = JSON.parse(text);
      rows = (data.elements || []).map(r => ({
        osm_id: r.id, name: r.tags?.name || "Unnamed", amenity: r.tags?.amenity || type,
        lat: r.lat, lon: r.lon, phone: r.tags?.phone || "", opening_hours: r.tags?.opening_hours || "",
      }));
      message = `${rows.length} nearby ${type} locations found`;
    }

    else if (table === "weather_current") {
      const city = w.city || w.q || "";
      let lat = w.lat, lon = w.lon, cityName = city;
      if (!lat && city) {
        const geo = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(city)}&format=json&limit=1`,
          { headers: { "User-Agent": "newsconseen/1.0" } }
        );
        const gd = await geo.json();
        if (!gd.length) return { type: "select", rows: [], message: `City not found: ${city}` };
        lat = gd[0].lat; lon = gd[0].lon;
        cityName = gd[0].display_name?.split(",")[0];
      }
      if (!lat) return { type: "select", rows: [], message: "Usage: WHERE city = 'Portland'" };
      const res = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
        `&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code,precipitation,apparent_temperature&timezone=auto`
      );
      const d = await res.json(); const c = d.current;
      const codes = { 0:"Clear sky",1:"Mainly clear",2:"Partly cloudy",3:"Overcast",45:"Foggy",61:"Slight rain",63:"Moderate rain",65:"Heavy rain",71:"Slight snow",73:"Moderate snow",80:"Rain showers",95:"Thunderstorm" };
      rows = [{ city: cityName, lat: parseFloat(lat), lon: parseFloat(lon), temperature_c: c.temperature_2m, feels_like_c: c.apparent_temperature, humidity_pct: c.relative_humidity_2m, wind_speed_kmh: c.wind_speed_10m, precipitation_mm: c.precipitation, weather_description: codes[c.weather_code] || `Code ${c.weather_code}`, local_time: c.time }];
      message = `Current weather for ${cityName}`;
    }

    else if (table === "weather_forecast") {
      const city = w.city || "";
      const days = parseInt(w.days) || 7;
      if (!city) return { type: "select", rows: [], message: "Usage: WHERE city = 'Portland' AND days = 7" };
      const geo = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(city)}&format=json&limit=1`, { headers: { "User-Agent": "newsconseen/1.0" } });
      const gd = await geo.json();
      if (!gd.length) return { type: "select", rows: [], message: `City not found: ${city}` };
      const res = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${gd[0].lat}&longitude=${gd[0].lon}` +
        `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weather_code&forecast_days=${days}&timezone=auto`
      );
      const d = await res.json();
      const codes = { 0:"Clear sky",1:"Mainly clear",2:"Partly cloudy",3:"Overcast",61:"Rain",71:"Snow",80:"Showers",95:"Thunderstorm" };
      rows = d.daily.time.map((date, i) => ({ date, city, temp_max_c: d.daily.temperature_2m_max[i], temp_min_c: d.daily.temperature_2m_min[i], precipitation_mm: d.daily.precipitation_sum[i], weather_description: codes[d.daily.weather_code[i]] || `Code ${d.daily.weather_code[i]}` }));
      message = `${days}-day forecast for ${city}`;
    }

    else if (table === "worldbank_indicators") {
      const country = w.country || "US", indicator = w.indicator || "SP.POP.TOTL";
      const yearFrom = w.year_from || "2018", yearTo = w.year_to || "2023";
      const res = await fetch(`https://api.worldbank.org/v2/country/${country}/indicator/${indicator}?format=json&date=${yearFrom}:${yearTo}&per_page=100`);
      const data = await res.json();
      rows = (data[1] || []).filter(r => r.value !== null).map(r => ({ country_name: r.country?.value, country_code: r.countryiso3code, indicator_name: r.indicator?.value, indicator_code: r.indicator?.id, year: parseInt(r.date), value: r.value }));
      message = `${rows.length} data points for ${indicator} in ${country}`;
    }

    else if (table === "exchange_rates") {
      const base = w.base || "USD", currency = w.currency || null;
      const res = await fetch(`https://open.er-api.com/v6/latest/${base}`);
      const data = await res.json();
      if (currency) {
        rows = [{ base_currency: base, currency: currency.toUpperCase(), rate: data.rates[currency.toUpperCase()], last_updated: data.time_last_update_utc }];
      } else {
        rows = Object.entries(data.rates).map(([cur, rate]) => ({ base_currency: base, currency: cur, rate, last_updated: data.time_last_update_utc }));
      }
      message = `Exchange rates for ${base}: ${rows.length} currencies`;
    }

    else if (table === "countries") {
      const name = w.name, region = w.region, subregion = w.subregion;
      let url = "https://restcountries.com/v3.1/";
      if (name) url += `name/${encodeURIComponent(name)}`;
      else if (region) url += `region/${encodeURIComponent(region)}`;
      else url += "all";
      const res = await fetch(url);
      const data = await res.json();
      const list = Array.isArray(data) ? data : [data];
      rows = list
        .filter(c => !subregion || c.subregion?.toLowerCase() === subregion.toLowerCase())
        .map(c => ({ name: c.name?.common, official_name: c.name?.official, capital: c.capital?.[0] || "", region: c.region, subregion: c.subregion, population: c.population, area_km2: c.area, currency: Object.keys(c.currencies || {})[0] || "", language: Object.values(c.languages || {})[0] || "", flag: c.flag || "" }));
      message = `${rows.length} countries`;
    }

    else if (table === "fda_devices") {
      const product = w.product || w.manufacturer || "";
      if (!product) return { type: "select", rows: [], message: "Usage: WHERE product = 'wheelchair'" };
      const res = await fetch(`https://api.fda.gov/device/recall.json?search=product_description:${encodeURIComponent(product)}&limit=10`);
      const data = await res.json();
      rows = (data.results || []).map(r => ({ product_description: r.product_description, reason_for_recall: r.reason_for_recall, recall_initiation_date: r.recall_initiation_date, recalling_firm: r.recalling_firm, classification: r.classification, status: r.status }));
      message = `${rows.length} device recalls found`;
    }

    else if (table === "fda_food_recalls") {
      const product = w.product || "";
      if (!product) return { type: "select", rows: [], message: "Usage: WHERE product = 'peanut butter'" };
      const res = await fetch(`https://api.fda.gov/food/enforcement.json?search=product_description:${encodeURIComponent(product)}&limit=10`);
      const data = await res.json();
      rows = (data.results || []).map(r => ({ product_description: r.product_description, reason_for_recall: r.reason_for_recall, recall_initiation_date: r.recall_initiation_date, recalling_firm: r.recalling_firm, status: r.status }));
      message = `${rows.length} food recalls found`;
    }

    else if (table === "medications_recalls") {
      const name = w.name || "";
      if (!name) return { type: "select", rows: [], message: "Usage: WHERE name = 'metformin'" };
      const res = await fetch(`${RAILWAY_BASE}/medications/recalls?name=${encodeURIComponent(name)}`);
      const data = await res.json();
      rows = Array.isArray(data) ? data : (data.results || data.data || []);
      message = `Recall info for ${name}`;
    }

    else if (table === "medications_label") {
      const name = w.name || "";
      if (!name) return { type: "select", rows: [], message: "Usage: WHERE name = 'metformin'" };
      const res = await fetch(`https://api.fda.gov/drug/label.json?search=openfda.generic_name:${encodeURIComponent(name)}&limit=5`);
      const data = await res.json();
      rows = (data.results || []).map(r => ({ brand_name: r.openfda?.brand_name?.[0] || "", generic_name: r.openfda?.generic_name?.[0] || "", manufacturer: r.openfda?.manufacturer_name?.[0] || "", purpose: r.purpose?.[0] || "", warnings: r.warnings?.[0]?.slice(0, 200) || "", dosage: r.dosage_and_administration?.[0]?.slice(0, 200) || "" }));
      message = `${rows.length} label results for ${name}`;
    }

    // ── geo_overview ──────────────────────────────────────────────────────
    else if (table === "geo_overview") {
      const place = w.place || w.city || w.country || "";
      if (!place) return { type: "select", rows: [], message: "Usage: WHERE place = 'Lagos Nigeria'" };
      const geoRes = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(place)}&format=json&limit=1&addressdetails=1`, { headers: { "User-Agent": "newsconseen/1.0" } });
      const geoData = await geoRes.json();
      if (!geoData.length) return { type: "select", rows: [], message: `Location not found: ${place}` };
      const geo = geoData[0];
      const lat = parseFloat(geo.lat), lon = parseFloat(geo.lon);
      const countryCode = geo.address?.country_code?.toUpperCase();
      const countryName = geo.address?.country || "";
      const cityName = geo.address?.city || geo.address?.town || geo.address?.village || geo.display_name?.split(",")[0] || place;
      const stateName = geo.address?.state || "";
      let countryData = null;
      if (countryCode) {
        try {
          const cRes = await fetch(`https://restcountries.com/v3.1/alpha/${countryCode}`);
          const cData = await cRes.json();
          countryData = Array.isArray(cData) ? cData[0] : cData;
        } catch {}
      }
      let gdpPerCapita = null, population = null;
      if (countryCode) {
        try {
          const [wbGdp, wbPop] = await Promise.all([
            fetch(`https://api.worldbank.org/v2/country/${countryCode}/indicator/NY.GDP.PCAP.CD?format=json&mrv=1`).then(r => r.json()),
            fetch(`https://api.worldbank.org/v2/country/${countryCode}/indicator/SP.POP.TOTL?format=json&mrv=1`).then(r => r.json()),
          ]);
          gdpPerCapita = wbGdp[1]?.[0]?.value || null;
          population = wbPop[1]?.[0]?.value || null;
        } catch {}
      }
      let weather = null;
      let timezone = countryData?.timezones?.[0] || "";
      let cityPop = null;
      try {
        const wRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&timezone=auto`);
        const wData = await wRes.json();
        weather = wData.current?.temperature_2m;
        // Use Open-Meteo timezone — accurate to the specific city
        if (wData.timezone) timezone = wData.timezone;
      } catch {}
      // Try to get city population from Nominatim extratags
      try {
        const osmType = geo.osm_type === "node" ? "N" : geo.osm_type === "way" ? "W" : "R";
        const detailRes = await fetch(
          `https://nominatim.openstreetmap.org/details?osmtype=${osmType}&osmid=${geo.osm_id}&addressdetails=1&format=json`,
          { headers: { "User-Agent": "newsconseen/1.0" } }
        );
        const detail = await detailRes.json();
        if (detail?.extratags?.population) cityPop = parseInt(detail.extratags.population);
      } catch {}
      rows = [{ place, city: cityName, state_region: stateName, country: countryName, country_code: countryCode, lat, lon, continent: countryData?.region || "", subregion: countryData?.subregion || "", capital: countryData?.capital?.[0] || "", city_population_estimate: cityPop, country_population: population ? Math.round(population) : null, gdp_per_capita_usd: gdpPerCapita ? Math.round(gdpPerCapita) : null, currency: Object.keys(countryData?.currencies || {})[0] || "", currency_name: Object.values(countryData?.currencies || {})[0]?.name || "", language: Object.values(countryData?.languages || {})[0] || "", calling_code: countryData?.idd?.root || "", timezone, current_temp_c: weather, flag: countryData?.flag || "" }];
      message = `Overview for ${place}`;
    }

    // ── geo_economy ───────────────────────────────────────────────────────
    else if (table === "geo_economy") {
      const country = w.country || "";
      const yearFrom = w.year_from || "2018", yearTo = w.year_to || "2023";
      if (!country) return { type: "select", rows: [], message: "Usage: WHERE country = 'Nigeria'" };
      const cRes = await fetch(`https://restcountries.com/v3.1/name/${encodeURIComponent(country)}?fields=cca2,name`);
      const cData = await cRes.json();
      const iso2 = cData[0]?.cca2;
      if (!iso2) return { type: "select", rows: [], message: `Country not found: ${country}` };
      const INDICATORS = { gdp_per_capita: "NY.GDP.PCAP.CD", gdp_growth_pct: "NY.GDP.MKTP.KD.ZG", inflation_pct: "FP.CPI.TOTL.ZG", unemployment_pct: "SL.UEM.TOTL.ZS", poverty_rate: "SI.POV.DDAY", population: "SP.POP.TOTL", urban_pop_pct: "SP.URB.TOTL.IN.ZS", pop_over_65_pct: "SP.POP.65UP.TO.ZS", life_expectancy: "SP.DYN.LE00.IN", internet_users_pct: "IT.NET.USER.ZS", mobile_subs: "IT.CEL.SETS.P2", healthcare_spend: "SH.XPD.CHEX.GD.ZS", education_spend: "SE.XPD.TOTL.GD.ZS", exports_gdp_pct: "NE.EXP.GNFS.ZS", fdi_inflows: "BX.KLT.DINV.WD.GD.ZS" };
      const results = {};
      await Promise.all(Object.entries(INDICATORS).map(async ([key, code]) => {
        try {
          const r = await fetch(`https://api.worldbank.org/v2/country/${iso2}/indicator/${code}?format=json&date=${yearFrom}:${yearTo}&per_page=10&mrv=5`);
          const d = await r.json();
          results[key] = (d[1] || []).filter(x => x.value !== null).map(x => ({ year: parseInt(x.date), value: x.value }));
        } catch { results[key] = []; }
      }));
      const years = [...new Set(Object.values(results).flat().map(x => x.year))].sort((a, b) => b - a);
      const get = (key, year) => results[key]?.find(x => x.year === year)?.value ?? null;
      rows = years.map(year => ({ country, country_code: iso2, year, gdp_per_capita_usd: get("gdp_per_capita", year), gdp_growth_pct: get("gdp_growth_pct", year), inflation_pct: get("inflation_pct", year), unemployment_pct: get("unemployment_pct", year), poverty_rate_pct: get("poverty_rate", year), population: get("population", year), urban_population_pct: get("urban_pop_pct", year), population_over65_pct: get("pop_over_65_pct", year), life_expectancy_years: get("life_expectancy", year), internet_users_pct: get("internet_users_pct", year), mobile_subscriptions: get("mobile_subs", year), healthcare_spend_gdp_pct: get("healthcare_spend", year), education_spend_gdp_pct: get("education_spend", year), exports_gdp_pct: get("exports_gdp_pct", year), fdi_inflows_gdp_pct: get("fdi_inflows", year) }));
      message = `Economic profile for ${country}: ${rows.length} years of data`;
    }

    // ── geo_population ────────────────────────────────────────────────────
    else if (table === "geo_population") {
      const country = w.country || "";
      const yearFrom = w.year_from || "2010", yearTo = w.year_to || "2023";
      if (!country) return { type: "select", rows: [], message: "Usage: WHERE country = 'Kenya'" };
      const cRes = await fetch(`https://restcountries.com/v3.1/name/${encodeURIComponent(country)}?fields=cca2,name`);
      const cData = await cRes.json();
      const iso2 = cData[0]?.cca2;
      if (!iso2) return { type: "select", rows: [], message: `Country not found: ${country}` };
      const POP_INDICATORS = { population: "SP.POP.TOTL", urban_pct: "SP.URB.TOTL.IN.ZS", pop_growth_pct: "SP.POP.GROW", birth_rate: "SP.DYN.CBRT.IN", death_rate: "SP.DYN.CDRT.IN", fertility_rate: "SP.DYN.TFRT.IN", life_expectancy: "SP.DYN.LE00.IN", pop_density: "EN.POP.DNST", youth_pct: "SP.POP.0014.TO.ZS", elderly_pct: "SP.POP.65UP.TO.ZS" };
      const results = {};
      await Promise.all(Object.entries(POP_INDICATORS).map(async ([key, code]) => {
        try {
          const r = await fetch(`https://api.worldbank.org/v2/country/${iso2}/indicator/${code}?format=json&date=${yearFrom}:${yearTo}&per_page=20`);
          const d = await r.json();
          results[key] = (d[1] || []).filter(x => x.value !== null).map(x => ({ year: parseInt(x.date), value: x.value }));
        } catch { results[key] = []; }
      }));
      const years = [...new Set(Object.values(results).flat().map(x => x.year))].sort((a, b) => b - a);
      const get = (key, year) => results[key]?.find(x => x.year === year)?.value ?? null;
      rows = years.map(year => ({ country, country_code: iso2, year, population: get("population", year), urban_population_pct: get("urban_pct", year), population_growth_pct: get("pop_growth_pct", year), birth_rate_per1000: get("birth_rate", year), death_rate_per1000: get("death_rate", year), fertility_rate: get("fertility_rate", year), life_expectancy: get("life_expectancy", year), population_density_km2: get("pop_density", year), youth_pct_under14: get("youth_pct", year), elderly_pct_over65: get("elderly_pct", year) }));
      message = `Population data for ${country}: ${rows.length} years`;
    }

    // ── geo_competitors ───────────────────────────────────────────────────
    else if (table === "geo_competitors") {
      const city = w.city || w.place || "";
      const businessType = w.business_type || w.type || "pharmacy";
      const radiusKm = parseInt(w.radius_km || "10");
      if (!city) return { type: "select", rows: [], message: "Usage: WHERE city = 'Lagos Nigeria' AND business_type = 'pharmacy' AND radius_km = 10" };
      const geoRes = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(city)}&format=json&limit=1`, { headers: { "User-Agent": "newsconseen/1.0" } });
      const geoData = await geoRes.json();
      if (!geoData.length) return { type: "select", rows: [], message: `City not found: ${city}` };
      const lat = geoData[0].lat, lon = geoData[0].lon;
      const radiusM = radiusKm * 1000;
      const TYPE_MAP = { pharmacy: "pharmacy", hospital: "hospital", clinic: "clinic", school: "school", university: "university", restaurant: "restaurant", cafe: "cafe", hotel: "hotel", bank: "bank", supermarket: "supermarket", gym: "gym", nursing_home: "nursing_home", childcare: "kindergarten", veterinary: "veterinary", dentist: "dentist", physiotherapy: "physiotherapist", coworking: "coworking", fuel: "fuel", atm: "atm" };
      const amenity = TYPE_MAP[businessType.toLowerCase()] || businessType;
      const query = `[out:json][timeout:25];node["amenity"="${amenity}"](around:${radiusM},${lat},${lon});out body;`;
      const res = await fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`);
      const resText = await res.text();
      if (!resText.trim().startsWith("{")) return { type: "select", rows: [], message: `Overpass API temporarily unavailable. Try again in a moment.` };
      const data = JSON.parse(resText);
      const locations = data.elements || [];
      const withDist = locations.map(r => ({ name: r.tags?.name || "Unnamed", business_type: businessType, lat: r.lat, lon: r.lon, address: [r.tags?.["addr:street"], r.tags?.["addr:city"]].filter(Boolean).join(", "), phone: r.tags?.phone || "", website: r.tags?.website || "", opening_hours: r.tags?.opening_hours || "", distance_km: +(Math.sqrt(Math.pow((r.lat - parseFloat(lat)) * 111, 2) + Math.pow((r.lon - parseFloat(lon)) * 111 * Math.cos(parseFloat(lat) * Math.PI / 180), 2))).toFixed(2) })).sort((a, b) => a.distance_km - b.distance_km);
      rows = [{ name: `SUMMARY: ${locations.length} ${businessType}s within ${radiusKm}km of ${city}`, business_type: businessType, lat: parseFloat(lat), lon: parseFloat(lon), address: `Center: ${city}`, phone: "", website: "", opening_hours: "", distance_km: 0 }, ...withDist];
      message = `Found ${locations.length} ${businessType} locations within ${radiusKm}km of ${city}`;
    }

    // ── geo_infrastructure ────────────────────────────────────────────────
    else if (table === "geo_infrastructure") {
      const city = w.city || w.place || "";
      const radiusKm = parseInt(w.radius_km || "15");
      if (!city) return { type: "select", rows: [], message: "Usage: WHERE city = 'Kigali Rwanda' AND radius_km = 15" };
      const geoRes = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(city)}&format=json&limit=1`, { headers: { "User-Agent": "newsconseen/1.0" } });
      const geoData = await geoRes.json();
      if (!geoData.length) return { type: "select", rows: [], message: `City not found: ${city}` };
      const lat = geoData[0].lat, lon = geoData[0].lon;
      const radiusM = radiusKm * 1000;
      const SCAN_TYPES = ["hospital", "clinic", "pharmacy", "school", "university", "kindergarten", "supermarket", "restaurant", "bank", "hotel", "fuel", "atm", "nursing_home", "veterinary", "gym", "library", "post_office", "police", "fire_station"];
      const query = `[out:json][timeout:30];(${SCAN_TYPES.map(t => `node["amenity"="${t}"](around:${radiusM},${lat},${lon});`).join("")});out body;`;
      const res = await fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`);
      const infraText = await res.text();
      if (!infraText.trim().startsWith("{")) return { type: "select", rows: [], message: `Overpass API temporarily unavailable. Infrastructure data could not be loaded.` };
      const data = JSON.parse(infraText);
      const elements = data.elements || [];
      const counts = {};
      SCAN_TYPES.forEach(t => { counts[t] = 0; });
      elements.forEach(el => { const t = el.tags?.amenity; if (t && counts[t] !== undefined) counts[t]++; });
      const score = Math.min(counts.hospital * 10, 20) + Math.min(counts.clinic * 5, 15) + Math.min(counts.pharmacy * 3, 10) + Math.min(counts.school * 2, 10) + Math.min(counts.supermarket * 3, 10) + Math.min(counts.bank * 2, 10) + Math.min(counts.restaurant * 1, 10) + Math.min(counts.fuel * 2, 5) + Math.min(counts.atm * 1, 5) + Math.min(counts.university * 5, 5);
      rows = [{ city, radius_km: radiusKm, infrastructure_type: "OVERALL SCORE", count: elements.length, density_per_100k: null, availability: `${score}/100`, investment_signal: score < 30 ? "🟢 Very underserved — high opportunity" : score < 60 ? "🟡 Partially served — selective opportunity" : "🔴 Well served — competitive market" }, ...SCAN_TYPES.map(type => ({ city, radius_km: radiusKm, infrastructure_type: type, count: counts[type], density_per_100k: null, availability: counts[type] === 0 ? "NONE — opportunity" : counts[type] < 3 ? "SCARCE — underserved" : counts[type] < 10 ? "MODERATE" : "WELL SERVED", investment_signal: counts[type] === 0 ? "🟢 High opportunity" : counts[type] < 3 ? "🟡 Some opportunity" : "🔴 Saturated" }))];
      message = `Infrastructure scan for ${city} within ${radiusKm}km: ${elements.length} total facilities`;
    }

    // ── geo_weather_profile ───────────────────────────────────────────────
    else if (table === "geo_weather_profile") {
      const city = w.city || w.place || "";
      if (!city) return { type: "select", rows: [], message: "Usage: WHERE city = 'Nairobi Kenya'" };
      const geoRes = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(city)}&format=json&limit=1`, { headers: { "User-Agent": "newsconseen/1.0" } });
      const geoData = await geoRes.json();
      if (!geoData.length) return { type: "select", rows: [], message: `City not found: ${city}` };
      const lat = geoData[0].lat, lon = geoData[0].lon;
      const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,weather_code&forecast_days=16&timezone=auto`);
      const data = await res.json();
      const daily = data.daily;
      rows = daily.time.map((date, i) => ({ city, lat: parseFloat(lat), lon: parseFloat(lon), date, temp_max_c: daily.temperature_2m_max[i], temp_min_c: daily.temperature_2m_min[i], temp_avg_c: +((daily.temperature_2m_max[i] + daily.temperature_2m_min[i]) / 2).toFixed(1), precipitation_mm: daily.precipitation_sum[i], wind_max_kmh: daily.wind_speed_10m_max[i], weather_code: daily.weather_code[i], season_suitability: daily.precipitation_sum[i] > 20 ? "Heavy rain — logistics challenge" : daily.temperature_2m_max[i] > 35 ? "Very hot — cooling costs high" : daily.temperature_2m_min[i] < -10 ? "Very cold — heating costs high" : "Suitable conditions" }));
      message = `16-day weather profile for ${city}`;
    }

    // ── geo_cost_of_living ────────────────────────────────────────────────
    else if (table === "geo_cost_of_living") {
      const country = w.country || "";
      if (!country) return { type: "select", rows: [], message: "Usage: WHERE country = 'Rwanda'" };
      const cRes = await fetch(`https://restcountries.com/v3.1/name/${encodeURIComponent(country)}?fields=cca2,name`);
      const cData = await cRes.json();
      const iso2 = cData[0]?.cca2;
      if (!iso2) return { type: "select", rows: [], message: `Country not found: ${country}` };
      const [gdpRes, wageRes, inflRes] = await Promise.all([
        fetch(`https://api.worldbank.org/v2/country/${iso2}/indicator/NY.GDP.PCAP.CD?format=json&mrv=1`).then(r => r.json()),
        fetch(`https://api.worldbank.org/v2/country/${iso2}/indicator/SL.GDP.PCAP.EM.KD?format=json&mrv=1`).then(r => r.json()),
        fetch(`https://api.worldbank.org/v2/country/${iso2}/indicator/FP.CPI.TOTL.ZG?format=json&mrv=3`).then(r => r.json()),
      ]);
      const gdp = gdpRes[1]?.[0]?.value || null;
      const inflation = inflRes[1]?.[0]?.value || null;
      const gdpMonthly = gdp ? Math.round(gdp / 12) : null;
      rows = [{ country, country_code: iso2, gdp_per_capita_usd: gdp ? Math.round(gdp) : null, estimated_monthly_income_usd: gdpMonthly, inflation_rate_pct: inflation, estimated_rent_usd: gdpMonthly ? Math.round(gdpMonthly * 0.25) : null, estimated_food_usd: gdpMonthly ? Math.round(gdpMonthly * 0.20) : null, estimated_transport_usd: gdpMonthly ? Math.round(gdpMonthly * 0.10) : null, estimated_utilities_usd: gdpMonthly ? Math.round(gdpMonthly * 0.05) : null, estimated_healthcare_usd: gdpMonthly ? Math.round(gdpMonthly * 0.08) : null, total_estimated_monthly_cost_usd: gdpMonthly ? Math.round(gdpMonthly * 0.68) : null, cost_index_vs_us: gdp ? +(gdp / 65000 * 100).toFixed(1) : null, note: "Estimates based on World Bank GDP data. Actual costs vary by city and lifestyle." }];
      message = `Cost of living estimate for ${country}`;
    }

    // ── geo_market_size ───────────────────────────────────────────────────
    else if (table === "geo_market_size") {
      const city = w.city || w.place || "";
      const businessType = w.business_type || "pharmacy";
      const radiusKm = parseInt(w.radius_km || "15");
      if (!city) return { type: "select", rows: [], message: "Usage: WHERE city = 'Kigali Rwanda' AND business_type = 'pharmacy'" };
      const geoRes = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(city)}&format=json&limit=1&addressdetails=1`, { headers: { "User-Agent": "newsconseen/1.0" } });
      const geoData = await geoRes.json();
      if (!geoData.length) return { type: "select", rows: [], message: `City not found: ${city}` };
      const lat = geoData[0].lat, lon = geoData[0].lon;
      const countryCode = geoData[0].address?.country_code?.toUpperCase();
      let gdpPerCapita = 5000;
      try {
        const wbRes = await fetch(`https://api.worldbank.org/v2/country/${countryCode}/indicator/NY.GDP.PCAP.CD?format=json&mrv=1`);
        const wbData = await wbRes.json();
        gdpPerCapita = wbData[1]?.[0]?.value || 5000;
      } catch {}
      const TYPE_MAP = { pharmacy: "pharmacy", home_healthcare: "nursing_home", hospital: "hospital", school: "school", restaurant: "restaurant", clinic: "clinic", gym: "gym", hotel: "hotel", childcare: "kindergarten", veterinary: "veterinary" };
      const amenity = TYPE_MAP[businessType] || businessType;
      const radiusM = radiusKm * 1000;
      const query = `[out:json][timeout:20];node["amenity"="${amenity}"](around:${radiusM},${lat},${lon});out body;`;
      let competitorCount = 0;
      try {
        const compRes = await fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`);
        const compText = await compRes.text();
        if (compText.trim().startsWith("{")) {
          const compData = JSON.parse(compText);
          competitorCount = compData.elements?.length || 0;
        }
      } catch {}
      const densityByGDP = gdpPerCapita > 30000 ? 3000 : gdpPerCapita > 10000 ? 2000 : gdpPerCapita > 3000 ? 1500 : 1000;
      const areaKm2 = Math.PI * radiusKm * radiusKm;
      const estimatedPopulation = Math.round(areaKm2 * densityByGDP);
      const MARKET_PARAMS = { pharmacy: { spend_pct_income: 0.03, ideal_pop_per_unit: 5000 }, home_healthcare: { spend_pct_income: 0.05, ideal_pop_per_unit: 15000 }, clinic: { spend_pct_income: 0.04, ideal_pop_per_unit: 8000 }, school: { spend_pct_income: 0.06, ideal_pop_per_unit: 3000 }, restaurant: { spend_pct_income: 0.08, ideal_pop_per_unit: 1000 }, gym: { spend_pct_income: 0.02, ideal_pop_per_unit: 8000 }, hotel: { spend_pct_income: 0.04, ideal_pop_per_unit: 20000 }, childcare: { spend_pct_income: 0.07, ideal_pop_per_unit: 4000 } };
      const params = MARKET_PARAMS[businessType] || { spend_pct_income: 0.03, ideal_pop_per_unit: 5000 };
      const annualMarket = Math.round(estimatedPopulation * gdpPerCapita * params.spend_pct_income);
      const idealUnits = Math.round(estimatedPopulation / params.ideal_pop_per_unit);
      const gap = Math.max(0, idealUnits - competitorCount);
      const saturation = competitorCount >= idealUnits ? "SATURATED" : competitorCount >= idealUnits * 0.7 ? "COMPETITIVE" : competitorCount >= idealUnits * 0.3 ? "UNDERSERVED" : "SIGNIFICANT GAP";
      rows = [{ city, country_code: countryCode, business_type: businessType, radius_km: radiusKm, estimated_population: estimatedPopulation, gdp_per_capita_usd: Math.round(gdpPerCapita), annual_market_usd: annualMarket, existing_competitors: competitorCount, ideal_market_units: idealUnits, supply_gap: gap, market_status: saturation, opportunity_score: Math.round((gap / Math.max(idealUnits, 1)) * 100), recommendation: saturation === "SIGNIFICANT GAP" ? `🟢 Strong opportunity — ${gap} more ${businessType} businesses needed` : saturation === "UNDERSERVED" ? `🟡 Good opportunity — market has room for ${gap} more units` : saturation === "COMPETITIVE" ? "🟠 Competitive — differentiation required" : "🔴 Saturated — consider different location or business type" }];
      message = `Market size analysis for ${businessType} in ${city}: ${saturation}`;
    }

    // ── us_state ──────────────────────────────────────────────────────────
    else if (table === "us_state" || table === "census_state") {
      const STATE_FIPS = { alabama: "01", alaska: "02", arizona: "04", arkansas: "05", california: "06", colorado: "08", connecticut: "09", delaware: "10", florida: "12", georgia: "13", hawaii: "15", idaho: "16", illinois: "17", indiana: "18", iowa: "19", kansas: "20", kentucky: "21", louisiana: "22", maine: "23", maryland: "24", massachusetts: "25", michigan: "26", minnesota: "27", mississippi: "28", missouri: "29", montana: "30", nebraska: "31", nevada: "32", "new hampshire": "33", "new jersey": "34", "new mexico": "35", "new york": "36", "north carolina": "37", "north dakota": "38", ohio: "39", oklahoma: "40", oregon: "41", pennsylvania: "42", "rhode island": "44", "south carolina": "45", "south dakota": "46", tennessee: "47", texas: "48", utah: "49", vermont: "50", virginia: "51", washington: "53", "west virginia": "54", wisconsin: "55", wyoming: "56" };
      const stateName = (w.state || "").toLowerCase().trim();
      if (!stateName) return { type: "select", rows: [], message: "Usage: WHERE state = 'Iowa'" };
      const fips = STATE_FIPS[stateName];
      if (!fips) return { type: "select", rows: [], message: `State not found: ${w.state}. Use full name like 'Iowa', 'New York', 'California'` };
      const vars = "B01003_001E,B19013_001E,B25077_001E,B01002_001E,B23025_005E,B23025_003E,B15003_022E,B15003_023E,B15003_025E,B01003_001E";
      const res = await fetch(`https://api.census.gov/data/2022/acs/acs5?get=NAME,${vars}&for=state:${fips}`);
      const data = await res.json();
      const [headers, ...dataRows] = data;
      rows = dataRows.map(row => {
        const r = {};
        headers.forEach((h, i) => r[h] = row[i]);
        const pop = parseInt(r.B01003_001E) || 0;
        const labor = parseInt(r.B23025_003E) || 1;
        const unemployed = parseInt(r.B23025_005E) || 0;
        const bach = (parseInt(r.B15003_022E) || 0) + (parseInt(r.B15003_023E) || 0) + (parseInt(r.B15003_025E) || 0);
        return { state: r.NAME?.replace(", United States", "") || w.state, population: pop, median_household_income: parseInt(r.B19013_001E) || null, median_home_value: parseInt(r.B25077_001E) || null, median_age: parseFloat(r.B01002_001E) || null, unemployment_pct: labor ? +((unemployed / labor) * 100).toFixed(1) : null, bachelors_degree_pct: pop ? +((bach / pop) * 100).toFixed(1) : null };
      });
      message = `US state demographics for ${w.state}`;
    }

    // ── us_zipcode ────────────────────────────────────────────────────────
    else if (table === "us_zipcode") {
      const zipcode = w.zipcode || w.zip || "";
      const year = w.year || "2022";
      if (!zipcode) return { type: "select", rows: [], message: "Usage: WHERE zipcode = '50301'" };
      const variables = ["B01003_001E","B19013_001E","B01002_001E","B17001_002E","B25001_001E","B25003_002E","B25003_003E","B23025_002E","B23025_005E","B15003_022E","B15003_023E","B08301_001E","B08301_010E","B11001_001E","B09001_001E","B01001_020E","B01001_044E","B19001_002E","B19001_017E","B25064_001E","B25077_001E"].join(",");
      const url = `https://api.census.gov/data/${year}/acs/acs5?get=NAME,${variables}&for=zip%20code%20tabulation%20area:${zipcode}`;
      let data;
      try {
        const res = await fetch(url);
        data = await res.json();
      } catch (e) {
        return { type: "select", rows: [], message: `Census API error: ${e.message}` };
      }
      if (!data || data.length < 2) return { type: "select", rows: [], message: `No Census data found for zipcode ${zipcode}.` };
      const headers = data[0], values = data[1];
      const obj = {};
      headers.forEach((h, i) => { obj[h] = values[i]; });
      const pop = parseInt(obj["B01003_001E"]) || 0;
      const poor = parseInt(obj["B17001_002E"]) || 0;
      const unemployed = parseInt(obj["B23025_005E"]) || 0;
      const laborForce = parseInt(obj["B23025_002E"]) || 1;
      const households = parseInt(obj["B11001_001E"]) || 1;
      const under18 = parseInt(obj["B09001_001E"]) || 0;
      const elderly = ((parseInt(obj["B01001_020E"]) || 0) + (parseInt(obj["B01001_044E"]) || 0)) * 10;
      const bachelor = parseInt(obj["B15003_022E"]) || 0;
      const master = parseInt(obj["B15003_023E"]) || 0;
      const highIncome = parseInt(obj["B19001_017E"]) || 0;
      const lowIncome = parseInt(obj["B19001_002E"]) || 0;
      const owners = parseInt(obj["B25003_002E"]) || 0;
      const renters = parseInt(obj["B25003_003E"]) || 0;
      let lat = null, lon = null;
      try {
        const geoRes = await fetch(`https://nominatim.openstreetmap.org/search?postalcode=${zipcode}&country=US&format=json&limit=1`, { headers: { "User-Agent": "newsconseen/1.0" } });
        const geoData = await geoRes.json();
        if (geoData.length) { lat = parseFloat(geoData[0].lat); lon = parseFloat(geoData[0].lon); }
      } catch {}
      const income = parseInt(obj["B19013_001E"]) || 0;
      const povertyPct = pop > 0 ? (poor / pop) * 100 : 0;
      const edPct = pop > 0 ? ((bachelor + master) / pop) * 100 : 0;
      let score = 50;
      if (income > 75000) score += 15; else if (income > 50000) score += 8; else if (income < 30000) score -= 10;
      if (pop > 20000) score += 10; else if (pop < 2000) score -= 10;
      if (povertyPct > 25) score -= 15; else if (povertyPct < 10) score += 10;
      if (edPct > 30) score += 10;
      rows = [{ zipcode, name: obj["NAME"] || "", year, lat, lon, total_population: pop, total_households: households, median_household_income: parseInt(obj["B19013_001E"]) || null, median_age: parseFloat(obj["B01002_001E"]) || null, poverty_rate_pct: pop > 0 ? +((poor / pop) * 100).toFixed(1) : null, unemployment_rate_pct: laborForce > 0 ? +((unemployed / laborForce) * 100).toFixed(1) : null, college_educated_pct: pop > 0 ? +(((bachelor + master) / pop) * 100).toFixed(1) : null, high_income_households_pct: households > 0 ? +((highIncome / households) * 100).toFixed(1) : null, low_income_households_pct: households > 0 ? +((lowIncome / households) * 100).toFixed(1) : null, homeownership_rate_pct: (owners + renters) > 0 ? +((owners / (owners + renters)) * 100).toFixed(1) : null, population_under18_pct: pop > 0 ? +((under18 / pop) * 100).toFixed(1) : null, population_over65_estimate: elderly, total_housing_units: parseInt(obj["B25001_001E"]) || null, median_gross_rent_usd: parseInt(obj["B25064_001E"]) || null, median_home_value_usd: parseInt(obj["B25077_001E"]) || null, public_transit_commuters_pct: parseInt(obj["B08301_001E"]) > 0 ? +((parseInt(obj["B08301_010E"]) / parseInt(obj["B08301_001E"])) * 100).toFixed(1) : null, business_opportunity_score: Math.min(Math.max(score, 0), 100) }];
      message = `Census ACS data for zip code ${zipcode} (${obj["NAME"] || ""})`;
    }

    // ── cms_healthcare ────────────────────────────────────────────────────
    else if (table === "cms_healthcare") {
      const state = w.state || "Iowa";
      const providerType = w.provider_type || "nursing_home";
      const city = w.city || "";
      const limit = parseInt(w.limit || "25");
      const minRating = parseInt(w.min_rating || "1");
      const ENDPOINTS = {
        nursing_home: "https://data.cms.gov/resource/4pq5-n9py.json",
        home_health:  "https://data.cms.gov/resource/6jpm-sxkc.json",
        hospice:      "https://data.cms.gov/resource/252m-zog8.json",
        hospital:     "https://data.cms.gov/resource/xubh-q36u.json",
        physician:    "https://data.cms.gov/resource/mj5m-pzi6.json",
      };
      const endpoint = ENDPOINTS[providerType];
      if (!endpoint) return { type: "select", rows: [], message: `Unknown provider type: ${providerType}. Options: nursing_home, home_health, hospice, hospital, physician` };
      const conditions = [];
      if (state) conditions.push(`state='${state.toUpperCase()}'`);
      if (city) conditions.push(`upper(city)='${city.toUpperCase()}'`);
      const whereClause = conditions.length > 0 ? conditions.join(" AND ") : "state IS NOT NULL";
      const url = `${endpoint}?$limit=${limit}&$where=${encodeURIComponent(whereClause)}`;
      let data;
      try {
        const res = await fetch(url);
        data = await res.json();
      } catch (e) {
        return { type: "select", rows: [], message: `CMS API error: ${e.message}` };
      }
      if (!Array.isArray(data) || !data.length) return { type: "select", rows: [], message: `No CMS data found for ${providerType} in ${state}${city ? ", " + city : ""}` };
      rows = data.map(r => ({ provider_name: r.provname || r.provider_name || r.facility_name || r.org_name || "", provider_type: providerType, address: r.address || r.provider_address || "", city: r.city || r.provider_city || "", state: r.state || r.provider_state || "", zipcode: r.zip || r.provider_zip_code || "", phone: r.phone_num || r.provider_phone_number || "", overall_rating: parseFloat(r.overall_rating || r.overall_star_rating || r.hcahps_base_score || 0) || null, staffing_rating: parseFloat(r.staffing_rating || 0) || null, quality_rating: parseFloat(r.quality_rating || r.quality_of_patient_care_star_rating || 0) || null, inspection_rating: parseFloat(r.inspection_rating || 0) || null, beds: parseInt(r.number_of_certified_beds || r.beds || 0) || null, ownership_type: r.ownership_type || r.type_of_ownership || "", in_hospital: r.located_in_hospital || "", certified_date: r.date_first_approved_to_provide_medicare || "", cms_certification: r.cms_certification_number || r.provider_id || "", lat: parseFloat(r.geocoded_coordinate?.latitude || r.lat || 0) || null, lon: parseFloat(r.geocoded_coordinate?.longitude || r.lng || 0) || null })).filter(r => !r.overall_rating || r.overall_rating >= minRating).sort((a, b) => (b.overall_rating || 0) - (a.overall_rating || 0));
      message = `${rows.length} ${providerType} providers in ${state}${city ? ", " + city : ""} from CMS`;
    }

    // ── usda_food_access ──────────────────────────────────────────────────
    else if (table === "usda_food_access") {
      const state = w.state || "Iowa";
      const county = w.county || "";
      const radiusM = county ? 30000 : 50000;
      const geoRes = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(county ? `${county} County, ${state}` : state)}&format=json&limit=1&addressdetails=1`, { headers: { "User-Agent": "newsconseen/1.0" } });
      const geoData = await geoRes.json();
      if (!geoData.length) return { type: "select", rows: [], message: `Location not found: ${county ? county + ", " : ""}${state}` };
      const lat = parseFloat(geoData[0].lat), lon = parseFloat(geoData[0].lon);
      const foodTypes = ["supermarket", "convenience", "fast_food", "restaurant", "farm", "marketplace"];
      const query = `[out:json][timeout:25];(${foodTypes.map(t => `node["shop"="${t}"](around:${radiusM},${lat},${lon});node["amenity"="${t}"](around:${radiusM},${lat},${lon});`).join("")}node["amenity"="fast_food"](around:${radiusM},${lat},${lon});node["shop"="supermarket"](around:${radiusM},${lat},${lon});node["shop"="grocery"](around:${radiusM},${lat},${lon}););out body;`;
      let elements = [];
      try {
        const foodRes = await fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`);
        const foodData = await foodRes.json();
        elements = foodData.elements || [];
      } catch {}
      const supermarkets = elements.filter(e => e.tags?.shop === "supermarket" || e.tags?.shop === "grocery").length;
      const fastFood = elements.filter(e => e.tags?.amenity === "fast_food").length;
      const restaurants = elements.filter(e => e.tags?.amenity === "restaurant").length;
      const convenience = elements.filter(e => e.tags?.shop === "convenience").length;
      const farms = elements.filter(e => e.tags?.shop === "farm" || e.tags?.amenity === "marketplace").length;
      const totalFood = supermarkets + fastFood + restaurants + convenience;
      const accessScore = Math.min(100, Math.round((supermarkets * 20) + (restaurants * 2) + (farms * 10) + (convenience * 3) - (fastFood * 1)));
      const foodDesert = supermarkets < 2;
      const fastFoodDominant = fastFood > supermarkets * 3;
      rows = [{ location: county ? `${county} County, ${state}` : state, state, county: county || "All counties", lat, lon, supermarkets_count: supermarkets, fast_food_count: fastFood, restaurants_count: restaurants, convenience_stores_count: convenience, farmers_markets_count: farms, total_food_outlets: totalFood, food_access_score: accessScore, is_food_desert: foodDesert ? "YES" : "NO", fast_food_dominant: fastFoodDominant ? "YES" : "NO", supermarket_to_fastfood_ratio: fastFood > 0 ? +(supermarkets / fastFood).toFixed(2) : supermarkets, food_environment_rating: accessScore > 70 ? "EXCELLENT — well served" : accessScore > 40 ? "MODERATE — some gaps" : accessScore > 20 ? "POOR — underserved" : "CRITICAL — food desert", business_opportunity: foodDesert ? "🟢 High — grocery/healthy food gap" : fastFoodDominant ? "🟡 Medium — healthy food alternatives needed" : "🔴 Low — market saturated", radius_km: Math.round(radiusM / 1000) }];
      message = `Food access analysis for ${county ? county + " County, " : ""}${state}`;
    }

    // ── us_county ─────────────────────────────────────────────────────────
    else if (table === "us_county" || table === "census_county") {
      const STATE_FIPS = { alabama: "01", alaska: "02", arizona: "04", arkansas: "05", california: "06", colorado: "08", connecticut: "09", delaware: "10", florida: "12", georgia: "13", hawaii: "15", idaho: "16", illinois: "17", indiana: "18", iowa: "19", kansas: "20", kentucky: "21", louisiana: "22", maine: "23", maryland: "24", massachusetts: "25", michigan: "26", minnesota: "27", mississippi: "28", missouri: "29", montana: "30", nebraska: "31", nevada: "32", "new hampshire": "33", "new jersey": "34", "new mexico": "35", "new york": "36", "north carolina": "37", "north dakota": "38", ohio: "39", oklahoma: "40", oregon: "41", pennsylvania: "42", "rhode island": "44", "south carolina": "45", "south dakota": "46", tennessee: "47", texas: "48", utah: "49", vermont: "50", virginia: "51", washington: "53", "west virginia": "54", wisconsin: "55", wyoming: "56" };
      const stateName = (w.state || "").toLowerCase().trim();
      if (!stateName) return { type: "select", rows: [], message: "Usage: WHERE state = 'Iowa'" };
      const fips = STATE_FIPS[stateName];
      if (!fips) return { type: "select", rows: [], message: `State not found: ${w.state}` };
      const vars = "NAME,B01003_001E,B19013_001E,B25077_001E,B01002_001E,B23025_005E,B23025_003E";
      const res = await fetch(`https://api.census.gov/data/2022/acs/acs5?get=${vars}&for=county:*&in=state:${fips}`);
      const data = await res.json();
      const [headers, ...dataRows] = data;
      rows = dataRows.map(row => {
        const r = {};
        headers.forEach((h, i) => r[h] = row[i]);
        const pop = parseInt(r.B01003_001E) || 0;
        const labor = parseInt(r.B23025_003E) || 1;
        const unemployed = parseInt(r.B23025_005E) || 0;
        return { county: r.NAME?.split(",")[0] || "", state: w.state, population: pop, median_household_income: parseInt(r.B19013_001E) || null, median_home_value: parseInt(r.B25077_001E) || null, median_age: parseFloat(r.B01002_001E) || null, unemployment_pct: labor ? +((unemployed / labor) * 100).toFixed(1) : null };
      }).sort((a, b) => b.population - a.population);
      message = `${rows.length} counties in ${w.state}`;
    }

    // ── stock_quote ────────────────────────────────────────────────────────
    else if (table === "stock_quote" || table === "stock_financials" || table === "market_index") {
      const symbol = (w.symbol || w.index || "").toUpperCase();
      if (!symbol) return { type: "select", rows: [], message: "Usage: WHERE symbol = 'AAPL'" };
      const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbol}&fields=symbol,longName,regularMarketPrice,regularMarketChange,regularMarketChangePercent,regularMarketVolume,marketCap,fiftyTwoWeekHigh,fiftyTwoWeekLow,regularMarketDayHigh,regularMarketDayLow,trailingPE,forwardPE,dividendYield,regularMarketPreviousClose,currency,exchangeName,sector,industry,fiftyDayAverage,twoHundredDayAverage`;
      let data;
      try {
        const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0", "Accept": "application/json" } });
        data = await res.json();
      } catch (e) {
        const avUrl = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=demo`;
        try {
          const avRes = await fetch(avUrl);
          const avData = await avRes.json();
          const q = avData["Global Quote"];
          if (q && q["01. symbol"]) {
            rows = [{ symbol: q["01. symbol"], company_name: symbol, price: parseFloat(q["05. price"]), change: parseFloat(q["09. change"]), change_pct: q["10. change percent"], volume: parseInt(q["06. volume"]), previous_close: parseFloat(q["08. previous close"]), open: parseFloat(q["02. open"]), day_high: parseFloat(q["03. high"]), day_low: parseFloat(q["04. low"]), data_source: "Alpha Vantage" }];
            message = `Stock quote for ${symbol}`;
            return { type: "select", rows, message };
          }
        } catch {}
        return { type: "select", rows: [], message: `Could not fetch quote for ${symbol}. Try again or check the symbol.` };
      }
      const result = data?.quoteResponse?.result?.[0];
      if (!result) return { type: "select", rows: [], message: `Symbol not found: ${symbol}` };
      const fmt = (n) => n != null ? Math.round(n * 100) / 100 : null;
      rows = [{ symbol: result.symbol, company_name: result.longName || symbol, sector: result.sector || "", industry: result.industry || "", exchange: result.exchangeName || "", currency: result.currency || "USD", current_price: fmt(result.regularMarketPrice), change: fmt(result.regularMarketChange), change_pct: fmt(result.regularMarketChangePercent), previous_close: fmt(result.regularMarketPreviousClose), day_high: fmt(result.regularMarketDayHigh), day_low: fmt(result.regularMarketDayLow), volume: result.regularMarketVolume, market_cap_billions: result.marketCap ? fmt(result.marketCap / 1e9) : null, pe_ratio_trailing: fmt(result.trailingPE), pe_ratio_forward: fmt(result.forwardPE), dividend_yield_pct: result.dividendYield ? fmt(result.dividendYield * 100) : null, week52_high: fmt(result.fiftyTwoWeekHigh), week52_low: fmt(result.fiftyTwoWeekLow), avg_50day: fmt(result.fiftyDayAverage), avg_200day: fmt(result.twoHundredDayAverage), price_vs_52w_high_pct: result.fiftyTwoWeekHigh ? fmt(((result.regularMarketPrice - result.fiftyTwoWeekHigh) / result.fiftyTwoWeekHigh) * 100) : null, signal: (() => { const chg = result.regularMarketChangePercent || 0; const p = result.regularMarketPrice || 0; const high52 = result.fiftyTwoWeekHigh || p; const low52 = result.fiftyTwoWeekLow || p; const range = high52 - low52; const pos = range > 0 ? (p - low52) / range : 0.5; if (chg > 2 && pos > 0.7) return "STRONG BUY signal"; if (chg > 0 && pos > 0.5) return "POSITIVE momentum"; if (chg < -2 && pos < 0.3) return "OVERSOLD — watch"; if (chg < 0) return "NEGATIVE momentum"; return "NEUTRAL"; })(), data_source: "Yahoo Finance" }];
      message = `Stock quote for ${result.longName || symbol}`;
    }

    // ── crypto_price ────────────────────────────────────────────────────────
    else if (table === "crypto_price") {
      const coin = (w.coin || "bitcoin").toLowerCase();
      const currency = (w.currency || "usd").toLowerCase();
      const limit = parseInt(w.limit || "10");
      let url;
      if (w.coin) {
        url = `https://api.coingecko.com/api/v3/coins/${coin}?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false`;
      } else {
        url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=${currency}&order=market_cap_desc&per_page=${limit}&page=1&sparkline=false`;
      }
      const res = await fetch(url);
      const data = await res.json();
      if (w.coin && data.id) {
        const md = data.market_data; const p = md.current_price;
        rows = [{ coin_id: data.id, name: data.name, symbol: data.symbol?.toUpperCase(), currency: currency.toUpperCase(), current_price: p?.[currency], price_usd: p?.usd, market_cap_billions: md.market_cap?.[currency] ? Math.round(md.market_cap[currency] / 1e9 * 100) / 100 : null, volume_24h: md.total_volume?.[currency], change_24h_pct: md.price_change_percentage_24h, change_7d_pct: md.price_change_percentage_7d, change_30d_pct: md.price_change_percentage_30d, all_time_high: md.ath?.[currency], all_time_high_date: md.ath_date?.[currency], pct_from_ath: md.ath_change_percentage?.[currency], circulating_supply: md.circulating_supply, total_supply: md.total_supply, last_updated: data.last_updated, signal: (() => { const d = md.price_change_percentage_24h || 0; const w7 = md.price_change_percentage_7d || 0; if (d > 5 && w7 > 10) return "STRONG BULL"; if (d > 2) return "BULLISH"; if (d < -5 && w7 < -10) return "STRONG BEAR"; if (d < -2) return "BEARISH"; return "SIDEWAYS"; })() }];
      } else if (Array.isArray(data)) {
        rows = data.map(c => ({ rank: c.market_cap_rank, coin_id: c.id, name: c.name, symbol: c.symbol?.toUpperCase(), currency: currency.toUpperCase(), current_price: c.current_price, market_cap_billions: c.market_cap ? Math.round(c.market_cap / 1e9 * 10) / 10 : null, change_24h_pct: c.price_change_percentage_24h, volume_24h: c.total_volume, all_time_high: c.ath, pct_from_ath: c.ath_change_percentage }));
      }
      message = w.coin ? `Crypto price for ${coin} in ${currency.toUpperCase()}` : `Top ${limit} cryptocurrencies by market cap`;
    }

    // ── fed_rates ────────────────────────────────────────────────────────────
    else if (table === "fed_rates") {
      const series = (w.series || "FEDFUNDS").toUpperCase();
      const yearFrom = w.year_from || "2020";
      const yearTo = w.year_to || new Date().getFullYear().toString();
      const limit = parseInt(w.limit || "60");
      const url = `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${series}&vintage_date=${yearTo}-12-31`;
      let csvText;
      try {
        const res = await fetch(url);
        csvText = await res.text();
      } catch (e) {
        return { type: "select", rows: [], message: `FRED data for ${series}. Visit fred.stlouisfed.org for full data. Try: WHERE series = 'FEDFUNDS' AND year_from = '2020'` };
      }
      const lines = csvText.trim().split("\n");
      const dataLines = lines.slice(1);
      const SERIES_LABELS = { FEDFUNDS: "Federal Funds Rate (%)", CPIAUCSL: "Consumer Price Index", UNRATE: "Unemployment Rate (%)", GDP: "GDP (Billions USD)", M2SL: "M2 Money Supply (Billions)", MORTGAGE30US: "30-Year Mortgage Rate (%)", T10Y2Y: "10Y-2Y Treasury Spread", DEXUSEU: "USD/EUR Exchange Rate", VIXCLS: "VIX Volatility Index" };
      rows = dataLines.filter(line => line.split(",")[0] >= `${yearFrom}-01-01`).map(line => { const [date, value] = line.split(","); const val = parseFloat(value); return { series_id: series, series_name: SERIES_LABELS[series] || series, date, value: isNaN(val) ? null : val, year: parseInt(date.split("-")[0]), month: date.split("-")[1] }; }).filter(r => r.value !== null).slice(-limit).reverse();
      if (series === "FEDFUNDS" && rows.length > 0) {
        const latest = rows[0].value; const trend = rows.length > 2 ? rows[0].value - rows[2].value : 0;
        const interpretation = latest > 5 ? "HIGH — expensive borrowing" : latest > 3 ? "ELEVATED — moderate cost" : latest > 1 ? "NORMAL — favorable" : "LOW — very cheap borrowing";
        rows = rows.map((r, i) => ({ ...r, interpretation: i === 0 ? interpretation : "", trend_signal: i === 0 ? (trend > 0.5 ? "RISING" : trend < -0.5 ? "FALLING" : "STABLE") : "" }));
      }
      message = `FRED data for ${series}: ${rows.length} observations from ${yearFrom}`;
    }

    // ── commodity_price ──────────────────────────────────────────────────────
    else if (table === "commodity_price") {
      const commodity = (w.commodity || "all").toLowerCase();
      const res = await fetch("https://open.er-api.com/v6/latest/USD");
      const fxData = await res.json();
      const rates = fxData.rates || {};
      const COMMODITIES = { gold: { code: "XAU", unit: "per troy oz", category: "precious_metal" }, silver: { code: "XAG", unit: "per troy oz", category: "precious_metal" }, platinum: { code: "XPT", unit: "per troy oz", category: "precious_metal" }, palladium: { code: "XPD", unit: "per troy oz", category: "precious_metal" } };
      const APPROX = { oil: { price: 78.50, unit: "per barrel", category: "energy" }, wheat: { price: 5.20, unit: "per bushel", category: "agricultural" }, corn: { price: 4.30, unit: "per bushel", category: "agricultural" }, coffee: { price: 1.85, unit: "per pound", category: "agricultural" }, copper: { price: 4.10, unit: "per pound", category: "industrial" }, natural_gas: { price: 2.80, unit: "per MMBtu", category: "energy" }, cotton: { price: 0.78, unit: "per pound", category: "agricultural" }, sugar: { price: 0.19, unit: "per pound", category: "agricultural" } };
      const results = [];
      const metals = commodity === "all" ? Object.entries(COMMODITIES) : COMMODITIES[commodity] ? [[commodity, COMMODITIES[commodity]]] : [];
      for (const [name, info] of metals) {
        if (rates[info.code]) results.push({ commodity: name, category: info.category, price_usd: Math.round((1 / rates[info.code]) * 100) / 100, unit: info.unit, currency: "USD", source: "Open Exchange Rates", last_updated: fxData.time_last_update_utc, signal: null });
      }
      const agri = commodity === "all" ? Object.entries(APPROX) : APPROX[commodity] ? [[commodity, APPROX[commodity]]] : [];
      for (const [name, info] of agri) {
        if (info) results.push({ commodity: name, category: info.category, price_usd: info.price, unit: info.unit, currency: "USD", source: "Market approximation", last_updated: new Date().toISOString(), signal: "Note: approximate — use stock_quote with commodity ETFs for real-time prices" });
      }
      rows = results.filter(r => commodity === "all" || r.commodity === commodity);
      message = commodity === "all" ? `${rows.length} commodity prices` : `Commodity price for ${commodity}`;
    }

    // ── bls_wages ────────────────────────────────────────────────────────────
    else if (table === "bls_wages" || table === "job_skills") {
      const occupation = w.occupation || "";
      const state = w.state || "";
      if (!occupation) return { type: "select", rows: [], message: "Usage: WHERE occupation = 'registered_nurse' AND state = 'Iowa'\n\nCommon occupations:\nregistered_nurse, home_health_aide, nursing_assistant, physical_therapist, physician, pharmacist, teacher, software_developer, accountant, restaurant_cook, truck_driver" };
      const WAGE_DATA = { registered_nurse: { national_median: 81220, hourly_median: 39.05, entry_level: 59450, experienced: 111220, job_growth_pct: 6, openings_annual: 177400 }, home_health_aide: { national_median: 30180, hourly_median: 14.51, entry_level: 22980, experienced: 40560, job_growth_pct: 22, openings_annual: 570400 }, nursing_assistant: { national_median: 35760, hourly_median: 17.19, entry_level: 27060, experienced: 48150, job_growth_pct: 5, openings_annual: 216800 }, physical_therapist: { national_median: 97720, hourly_median: 46.98, entry_level: 70180, experienced: 128870, job_growth_pct: 15, openings_annual: 15400 }, occupational_therapist: { national_median: 93180, hourly_median: 44.80, entry_level: 66420, experienced: 124430, job_growth_pct: 14, openings_annual: 11500 }, pharmacist: { national_median: 132750, hourly_median: 63.82, entry_level: 98700, experienced: 163720, job_growth_pct: -2, openings_annual: 13600 }, physician: { national_median: 208000, hourly_median: 100.00, entry_level: 150000, experienced: 280000, job_growth_pct: 3, openings_annual: 24200 }, social_worker: { national_median: 54590, hourly_median: 26.25, entry_level: 38200, experienced: 75440, job_growth_pct: 7, openings_annual: 74700 }, software_developer: { national_median: 124200, hourly_median: 59.71, entry_level: 78300, experienced: 168570, job_growth_pct: 25, openings_annual: 162900 }, teacher: { national_median: 61820, hourly_median: 29.72, entry_level: 41830, experienced: 98460, job_growth_pct: 4, openings_annual: 132400 }, accountant: { national_median: 77250, hourly_median: 37.14, entry_level: 48560, experienced: 118050, job_growth_pct: 4, openings_annual: 136400 }, restaurant_cook: { national_median: 33160, hourly_median: 15.94, entry_level: 24680, experienced: 45380, job_growth_pct: 8, openings_annual: 159900 }, truck_driver: { national_median: 49920, hourly_median: 24.00, entry_level: 36290, experienced: 68540, job_growth_pct: 4, openings_annual: 257100 }, electrician: { national_median: 61590, hourly_median: 29.61, entry_level: 42550, experienced: 91060, job_growth_pct: 11, openings_annual: 84800 }, security_guard: { national_median: 34750, hourly_median: 16.71, entry_level: 27050, experienced: 46380, job_growth_pct: 3, openings_annual: 135400 } };
      const STATE_COL = { "Iowa": 0.89, "Maine": 0.97, "Minnesota": 1.02, "Indiana": 0.88, "California": 1.42, "New York": 1.38, "Texas": 0.95, "Florida": 1.03, "Illinois": 1.08, "Ohio": 0.89, "Pennsylvania": 1.01, "Georgia": 0.93, "Arizona": 1.03, "Colorado": 1.12, "Washington": 1.25, "Oregon": 1.15, "Nevada": 1.04, "Michigan": 0.91, "Wisconsin": 0.93, "Missouri": 0.87, "Tennessee": 0.88, "North Carolina": 0.92, "Virginia": 1.07, "Maryland": 1.18, "New Jersey": 1.28, "Massachusetts": 1.32 };
      const occKey = occupation.toLowerCase().replace(/ /g, "_");
      const wages = WAGE_DATA[occKey];
      const colFactor = state ? (STATE_COL[state] || 1.0) : 1.0;
      if (wages) {
        const stateMedian = state ? Math.round(wages.national_median * colFactor) : null;
        rows = [{ occupation, state: state || "National", national_median_salary: wages.national_median, state_estimated_median: stateMedian, hourly_median: wages.hourly_median, entry_level_salary: wages.entry_level, experienced_salary: wages.experienced, job_growth_10yr_pct: wages.job_growth_pct, annual_openings: wages.openings_annual, cost_of_living_factor: colFactor, demand_signal: wages.job_growth_pct > 15 ? "VERY HIGH DEMAND — strong hiring market" : wages.job_growth_pct > 5 ? "HIGH DEMAND — growing occupation" : wages.job_growth_pct > 0 ? "STABLE DEMAND" : "DECLINING — automation risk", hiring_difficulty: wages.openings_annual > 100000 ? "EASY — large talent pool" : wages.openings_annual > 30000 ? "MODERATE — some competition for talent" : "DIFFICULT — specialized shortage", data_source: "BLS Occupational Employment Statistics 2023" }];
      } else {
        rows = [{ occupation, state: state || "National", note: `Specific data not available for "${occupation}". Available occupations: ${Object.keys(WAGE_DATA).join(", ")}` }];
      }
      message = `Wage data for ${occupation}${state ? ` in ${state}` : " nationally"}`;
    }

    // ── salary_benchmark ─────────────────────────────────────────────────────
    else if (table === "salary_benchmark") {
      const role = w.role || w.occupation || "";
      const states = w.states ? w.states.split(",").map(s => s.trim()) : ["Iowa", "Minnesota", "Maine", "Indiana", "Texas", "California", "New York"];
      if (!role) return { type: "select", rows: [], message: "Usage: WHERE role = 'registered_nurse' AND states = 'Iowa,Minnesota,Indiana'" };
      const STATE_COL = { "Iowa": 0.89, "Maine": 0.97, "Minnesota": 1.02, "Indiana": 0.88, "California": 1.42, "New York": 1.38, "Texas": 0.95, "Florida": 1.03, "Illinois": 1.08, "Ohio": 0.89, "Georgia": 0.93, "Arizona": 1.03, "Colorado": 1.12, "Washington": 1.25, "Oregon": 1.15, "Nevada": 1.04, "Michigan": 0.91, "Wisconsin": 0.93, "Missouri": 0.87, "Tennessee": 0.88, "North Carolina": 0.92, "Virginia": 1.07, "Maryland": 1.18, "New Jersey": 1.28, "Massachusetts": 1.32, "Pennsylvania": 1.01 };
      const BASE_SALARIES = { registered_nurse: 81220, home_health_aide: 30180, nursing_assistant: 35760, physical_therapist: 97720, pharmacist: 132750, software_developer: 124200, teacher: 61820, restaurant_cook: 33160, social_worker: 54590, physician: 208000, dentist: 163220, accountant: 77250, truck_driver: 49920, electrician: 61590 };
      const roleKey = role.toLowerCase().replace(/ /g, "_");
      const baseSalary = BASE_SALARIES[roleKey] || 55000;
      rows = states.map(state => { const col = STATE_COL[state] || 1.0; const estimated = Math.round(baseSalary * col); return { role, state, estimated_annual_salary: estimated, cost_of_living_factor: col, vs_national_avg_pct: Math.round((col - 1) * 100), monthly_cost: Math.round(estimated / 12), annual_employer_cost: Math.round(estimated * 1.25), affordability_rank: null, verdict: "" }; }).sort((a, b) => a.estimated_annual_salary - b.estimated_annual_salary);
      rows = rows.map((r, i) => ({ ...r, affordability_rank: i + 1, verdict: i === 0 ? "✅ Most affordable" : i === rows.length - 1 ? "🔴 Most expensive" : "" }));
      message = `Salary benchmark for ${role} across ${states.length} states`;
    }

    // ── news_search ──────────────────────────────────────────────────────────
    else if (table === "news_search") {
      const query = w.query || w.q || "";
      const limit = parseInt(w.limit || "10");
      const daysBack = parseInt(w.days_back || "30");
      const language = w.language || "English";
      if (!query) return { type: "select", rows: [], message: "Usage: WHERE query = 'home healthcare Iowa'" };
      const from = new Date(); from.setDate(from.getDate() - daysBack);
      const fromStr = from.toISOString().slice(0, 10).replace(/-/g, "");
      const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(query)}&mode=artlist&maxrecords=${limit}&startdatetime=${fromStr}000000&format=json&sourcelang=${language}`;
      let data;
      try { const res = await fetch(url); data = await res.json(); } catch (e) { return { type: "select", rows: [], message: `News search error: ${e.message}` }; }
      const articles = data?.articles || [];
      if (!articles.length) return { type: "select", rows: [], message: `No news found for "${query}" in last ${daysBack} days. Try broader search terms.` };
      rows = articles.map(a => ({ title: a.title || "", url: a.url || "", source: a.domain || "", language: a.language || "", country: a.sourcecountry || "", published: a.seendate ? a.seendate.slice(0, 4) + "-" + a.seendate.slice(4, 6) + "-" + a.seendate.slice(6, 8) : "", relevance: a.socialimage ? "High" : "Normal", has_image: a.socialimage ? "Yes" : "No", summary: a.title || "" }));
      message = `${rows.length} news articles for "${query}" in last ${daysBack} days`;
    }

    // ── global_events ────────────────────────────────────────────────────────
    else if (table === "global_events") {
      const country = w.country || "";
      const category = w.category || "";
      const daysBack = parseInt(w.days_back || "7");
      const limit = parseInt(w.limit || "20");
      const queryParts = [];
      if (country) queryParts.push(country);
      if (category) queryParts.push(category);
      if (!queryParts.length) queryParts.push("business");
      const query = queryParts.join(" ");
      const from = new Date(); from.setDate(from.getDate() - daysBack);
      const fromStr = from.toISOString().slice(0, 10).replace(/-/g, "");
      const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(query)}&mode=artlist&maxrecords=${limit}&startdatetime=${fromStr}000000&format=json`;
      try {
        const res = await fetch(url); const data = await res.json(); const articles = data?.articles || [];
        rows = articles.map(a => ({ headline: a.title || "", source: a.domain || "", country: a.sourcecountry || country, language: a.language || "", date: a.seendate ? a.seendate.slice(0, 4) + "-" + a.seendate.slice(4, 6) + "-" + a.seendate.slice(6, 8) : "", url: a.url || "", topic: category || "general" }));
      } catch (e) { return { type: "select", rows: [], message: `Global events error: ${e.message}` }; }
      message = `${rows.length} global events${country ? ` in ${country}` : ""}${category ? ` category: ${category}` : ""} last ${daysBack} days`;
    }

    // ── air_quality ──────────────────────────────────────────────────────────
    else if (table === "air_quality") {
      const city = w.city || w.place || "";
      if (!city) return { type: "select", rows: [], message: "Usage: WHERE city = 'Des Moines Iowa'" };
      const geoRes = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(city)}&format=json&limit=1&addressdetails=1`, { headers: { "User-Agent": "newsconseen/1.0" } });
      const geoData = await geoRes.json();
      if (!geoData.length) return { type: "select", rows: [], message: `City not found: ${city}` };
      const lat = parseFloat(geoData[0].lat), lon = parseFloat(geoData[0].lon);
      try {
        const aqRes = await fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,ozone,european_aqi,us_aqi`);
        const aqData = await aqRes.json();
        const c = aqData.current;
        if (c) {
          const usAqi = c.us_aqi || 0;
          rows = [{ city, lat, lon, pm25_ugm3: c.pm2_5, pm10_ugm3: c.pm10, ozone_ugm3: c.ozone, no2_ugm3: c.nitrogen_dioxide, co_ugm3: c.carbon_monoxide, us_aqi: usAqi, european_aqi: c.european_aqi, aqi_category: usAqi <= 50 ? "Good" : usAqi <= 100 ? "Moderate" : usAqi <= 150 ? "Unhealthy for sensitive" : usAqi <= 200 ? "Unhealthy" : usAqi <= 300 ? "Very Unhealthy" : "Hazardous", health_implication: usAqi <= 50 ? "Air quality is satisfactory" : usAqi <= 100 ? "Acceptable — some pollutants" : usAqi <= 150 ? "Sensitive groups affected" : usAqi <= 200 ? "Everyone may be affected" : "Health warnings — avoid outdoor activity", suitable_for_elderly: usAqi <= 100 ? "YES" : usAqi <= 150 ? "WITH CAUTION" : "NO", source: "Open-Meteo Air Quality", measured_at: new Date().toISOString() }];
          message = `Air quality for ${city}: AQI ${usAqi}`;
          return { type: "select", rows, message };
        }
      } catch {}
      return { type: "select", rows: [], message: `No air quality data found near ${city}.` };
    }

    // ── flood_risk (alias: earthquake_data handles seismic, flood_risk uses weather/elevation) ─
    else if (table === "flood_risk") {
      const city = w.city || w.place || "";
      if (!city) return { type: "select", rows: [], message: "Usage: WHERE city = 'New Orleans Louisiana'" };
      const geoRes = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(city)}&format=json&limit=1`, { headers: { "User-Agent": "newsconseen/1.0" } });
      const geoData = await geoRes.json();
      if (!geoData.length) return { type: "select", rows: [], message: `City not found: ${city}` };
      const lat = parseFloat(geoData[0].lat), lon = parseFloat(geoData[0].lon);
      const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=precipitation_sum,precipitation_hours,river_discharge_max&forecast_days=16&timezone=auto`);
      const data = await res.json();
      const daily = data.daily || {};
      const precip = daily.precipitation_sum || [];
      const totalPrecip = precip.reduce((a, b) => a + b, 0);
      const maxDaily = precip.length ? Math.max(...precip) : 0;
      const heavyRainDays = precip.filter(p => p > 25).length;
      const floodRisk = maxDaily > 80 ? "HIGH" : maxDaily > 40 ? "MODERATE" : heavyRainDays > 3 ? "ELEVATED" : "LOW";
      rows = [{ city, lat, lon, total_precipitation_16day_mm: Math.round(totalPrecip), max_daily_precipitation_mm: Math.round(maxDaily), heavy_rain_days: heavyRainDays, flood_risk_level: floodRisk, recommendation: floodRisk === "HIGH" ? "🔴 High flood risk — insurance and elevation critical" : floodRisk === "MODERATE" ? "🟡 Moderate risk — drainage planning needed" : "✅ Low flood risk — standard precautions sufficient", suitable_for_ground_floor_business: floodRisk === "HIGH" ? "NOT RECOMMENDED" : floodRisk === "MODERATE" ? "WITH FLOOD INSURANCE" : "YES", source: "Open-Meteo 16-day forecast" }];
      message = `Flood risk assessment for ${city}: ${floodRisk}`;
    }

    // ── earthquake_data ──────────────────────────────────────────────────────
    else if (table === "earthquake_data") {
      const city = w.city || w.place || "";
      const daysBack = parseInt(w.days_back || "30");
      const minMagnitude = parseFloat(w.min_magnitude || "2.5");
      const radiusKm = parseInt(w.radius_km || "200");
      if (!city) return { type: "select", rows: [], message: "Usage: WHERE city = 'San Francisco California' AND days_back = 30 AND min_magnitude = 3" };
      const geoRes = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(city)}&format=json&limit=1`, { headers: { "User-Agent": "newsconseen/1.0" } });
      const geoData = await geoRes.json();
      if (!geoData.length) return { type: "select", rows: [], message: `City not found: ${city}` };
      const lat = parseFloat(geoData[0].lat), lon = parseFloat(geoData[0].lon);
      const endDate = new Date(); const startDate = new Date(); startDate.setDate(startDate.getDate() - daysBack);
      const url = `https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&starttime=${startDate.toISOString().slice(0, 10)}&endtime=${endDate.toISOString().slice(0, 10)}&latitude=${lat}&longitude=${lon}&maxradiuskm=${radiusKm}&minmagnitude=${minMagnitude}&orderby=magnitude&limit=20`;
      const res = await fetch(url); const data = await res.json(); const events = data?.features || [];
      if (!events.length) {
        rows = [{ city, result: `No earthquakes magnitude ${minMagnitude}+ within ${radiusKm}km of ${city} in last ${daysBack} days`, risk_level: "LOW", total_events: 0, max_magnitude: 0, recommendation: "✅ Low seismic risk — safe for construction" }];
      } else {
        const magnitudes = events.map(e => e.properties.mag); const maxMag = Math.max(...magnitudes);
        const riskLevel = maxMag >= 6.0 ? "HIGH" : maxMag >= 4.5 ? "MODERATE" : events.length > 10 ? "ELEVATED" : "LOW";
        rows = events.map(e => ({ city, date: new Date(e.properties.time).toISOString().slice(0, 10), magnitude: e.properties.mag, depth_km: e.geometry.coordinates[2], location: e.properties.place, lat: e.geometry.coordinates[1], lon: e.geometry.coordinates[0], tsunami_risk: e.properties.tsunami ? "YES" : "No", significance: e.properties.sig, risk_level: riskLevel }));
      }
      message = `Earthquake data near ${city}: ${events.length} events found`;
    }

    // ── climate_risk ─────────────────────────────────────────────────────────
    else if (table === "climate_risk") {
      const city = w.city || w.place || "";
      if (!city) return { type: "select", rows: [], message: "Usage: WHERE city = 'Miami Florida'" };
      const geoRes = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(city)}&format=json&limit=1`, { headers: { "User-Agent": "newsconseen/1.0" } });
      const geoData = await geoRes.json();
      if (!geoData.length) return { type: "select", rows: [], message: `City not found: ${city}` };
      const lat = parseFloat(geoData[0].lat), lon = parseFloat(geoData[0].lon);
      const weatherRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,precipitation_hours&timezone=auto&forecast_days=16`);
      const weatherData = await weatherRes.json();
      const daily = weatherData.daily || {};
      const temps = daily.temperature_2m_max || []; const tempsMin = daily.temperature_2m_min || []; const precip = daily.precipitation_sum || []; const wind = daily.wind_speed_10m_max || [];
      const avgHigh = temps.length ? temps.reduce((a, b) => a + b, 0) / temps.length : 20;
      const avgLow = tempsMin.length ? tempsMin.reduce((a, b) => a + b, 0) / tempsMin.length : 10;
      const totalPrecip = precip.reduce((a, b) => a + b, 0);
      const maxWind = wind.length ? Math.max(...wind) : 0;
      const rainyDays = precip.filter(p => p > 5).length;
      const heatRisk = avgHigh > 40 ? "EXTREME" : avgHigh > 35 ? "HIGH" : avgHigh > 30 ? "MODERATE" : "LOW";
      const coldRisk = avgLow < -20 ? "EXTREME" : avgLow < -10 ? "HIGH" : avgLow < 0 ? "MODERATE" : "LOW";
      const floodRisk = totalPrecip > 200 ? "HIGH" : totalPrecip > 100 ? "MODERATE" : "LOW";
      const windRisk = maxWind > 100 ? "HIGH" : maxWind > 60 ? "MODERATE" : "LOW";
      const riskScore = (heatRisk === "EXTREME" ? 30 : heatRisk === "HIGH" ? 20 : heatRisk === "MODERATE" ? 10 : 0) + (coldRisk === "EXTREME" ? 30 : coldRisk === "HIGH" ? 20 : coldRisk === "MODERATE" ? 10 : 0) + (floodRisk === "HIGH" ? 20 : floodRisk === "MODERATE" ? 10 : 0) + (windRisk === "HIGH" ? 20 : windRisk === "MODERATE" ? 10 : 0);
      rows = [{ city, lat, lon, forecast_days: 16, avg_high_temp_c: Math.round(avgHigh * 10) / 10, avg_low_temp_c: Math.round(avgLow * 10) / 10, total_precipitation_mm: Math.round(totalPrecip), rainy_days: rainyDays, max_wind_kmh: Math.round(maxWind), heat_risk: heatRisk, cold_risk: coldRisk, flood_risk: floodRisk, wind_risk: windRisk, overall_risk_score: riskScore, overall_risk_level: riskScore > 50 ? "HIGH RISK" : riskScore > 25 ? "MODERATE RISK" : riskScore > 10 ? "LOW RISK" : "MINIMAL RISK", suitable_for_elderly: (heatRisk === "EXTREME" || coldRisk === "EXTREME") ? "NO" : (heatRisk === "HIGH" || coldRisk === "HIGH") ? "WITH PRECAUTIONS" : "YES", suitable_for_construction: (floodRisk === "HIGH" || windRisk === "HIGH") ? "SEASONAL ONLY" : "YES", business_climate_rating: riskScore <= 10 ? "EXCELLENT" : riskScore <= 25 ? "GOOD" : riskScore <= 50 ? "FAIR" : "CHALLENGING", recommendation: riskScore <= 10 ? "✅ Excellent climate for any business" : riskScore <= 25 ? "✅ Good climate with manageable risks" : riskScore <= 50 ? "⚠️ Moderate risk — factor into planning" : "🔴 High climate risk — significant impact on operations" }];
      message = `Climate risk assessment for ${city}: ${rows[0].overall_risk_level}`;
    }

    return { type: "select", rows: rows || [], message: message || `${rows?.length || 0} rows from ${table}` };
  } catch (err) {
    throw new Error(`API error for ${table}: ${err.message}`);
  }
}

async function fetchMedicationsAPI(sql) {
  const nameEqMatch = sql.match(/medications_api\s+WHERE\s+name\s*=\s*'([^']+)'/i);
  const nameLikeMatch = sql.match(/medications_api\s+WHERE\s+name\s+LIKE\s+'%([^%]+)%'/i);
  const recallMatch = sql.match(/medications_recalls\s+WHERE\s+name\s*=\s*'([^']+)'/i);

  if (recallMatch) {
    const q = recallMatch[1];
    try {
      const res = await fetch(`${RAILWAY_BASE}/medications/recalls?name=${encodeURIComponent(q)}`);
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : (data.results || data.data || []);
    } catch { return []; }
  }
  if (nameEqMatch) {
    const q = nameEqMatch[1];
    try {
      const res = await fetch(`${RAILWAY_BASE}/medications/search?q=${encodeURIComponent(q)}`);
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : (data.results || data.data || []);
    } catch { return []; }
  }
  if (nameLikeMatch) {
    const q = nameLikeMatch[1];
    try {
      const res = await fetch(`${RAILWAY_BASE}/medications/approximate?q=${encodeURIComponent(q)}`);
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : (data.results || data.data || []);
    } catch { return []; }
  }
  // SELECT * with no filter
  try {
    const res = await fetch(`${RAILWAY_BASE}/medications/search?q=a`);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : (data.results || data.data || []);
  } catch { return []; }
}

export const MASTER_SCHEMA = {
  enterprises: [
    { col: "id", type: "VARCHAR" }, { col: "enterprise_name", type: "VARCHAR" },
    { col: "short_name", type: "VARCHAR" }, { col: "status", type: "ENUM" },
    { col: "enterprise_type", type: "ENUM" }, { col: "city", type: "VARCHAR" },
    { col: "country", type: "VARCHAR" }, { col: "phone", type: "VARCHAR" },
    { col: "email", type: "VARCHAR" }, { col: "created_date", type: "DATETIME" },
  ],
  people: [
    { col: "id", type: "VARCHAR" }, { col: "first_name", type: "VARCHAR" },
    { col: "last_name", type: "VARCHAR" }, { col: "person_type", type: "ENUM" },
    { col: "status", type: "ENUM" }, { col: "primary_role", type: "VARCHAR" },
    { col: "email", type: "VARCHAR" }, { col: "phone", type: "VARCHAR" },
    { col: "start_date", type: "DATE" }, { col: "created_date", type: "DATETIME" },
  ],
  products: [
    { col: "id", type: "VARCHAR" }, { col: "name", type: "VARCHAR" },
    { col: "sku", type: "VARCHAR" }, { col: "status", type: "ENUM" },
    { col: "item_type", type: "ENUM" }, { col: "stock_quantity", type: "INT" },
    { col: "unit_price", type: "FLOAT" }, { col: "cost_price", type: "FLOAT" },
    { col: "min_stock_level", type: "INT" }, { col: "expiry_date", type: "DATE" },
    { col: "regulatory_status", type: "ENUM" }, { col: "category", type: "ENUM" },
    { col: "created_date", type: "DATETIME" },
  ],
  services: [
    { col: "id", type: "VARCHAR" }, { col: "name", type: "VARCHAR" },
    { col: "status", type: "ENUM" }, { col: "category", type: "ENUM" },
    { col: "price", type: "FLOAT" }, { col: "pricing_model", type: "ENUM" },
    { col: "created_date", type: "DATETIME" },
  ],
  addresses: [
    { col: "id", type: "VARCHAR" }, { col: "label", type: "VARCHAR" },
    { col: "address_line1", type: "VARCHAR" }, { col: "city", type: "VARCHAR" },
    { col: "state_region", type: "VARCHAR" }, { col: "country", type: "VARCHAR" },
    { col: "postal_code", type: "VARCHAR" }, { col: "lat", type: "FLOAT" },
    { col: "lon", type: "FLOAT" }, { col: "status", type: "ENUM" },
    { col: "created_date", type: "DATETIME" },
  ],
  relationships: [
    { col: "id", type: "VARCHAR" }, { col: "relationship_type", type: "ENUM" },
    { col: "person_name", type: "VARCHAR" }, { col: "enterprise_name", type: "VARCHAR" },
    { col: "item_name", type: "VARCHAR" }, { col: "service_name", type: "VARCHAR" },
    { col: "role", type: "VARCHAR" }, { col: "status", type: "ENUM" },
    { col: "start_date", type: "DATE" }, { col: "created_date", type: "DATETIME" },
  ],
  tasks: [
    { col: "id", type: "VARCHAR" }, { col: "title", type: "VARCHAR" },
    { col: "task_type", type: "ENUM" }, { col: "status", type: "ENUM" },
    { col: "priority", type: "ENUM" }, { col: "assigned_to_email", type: "VARCHAR" },
    { col: "assigned_to_name", type: "VARCHAR" }, { col: "enterprise", type: "VARCHAR" },
    { col: "outcome", type: "ENUM" }, { col: "scheduled_date", type: "DATE" },
    { col: "due_date", type: "DATE" }, { col: "created_date", type: "DATETIME" },
  ],
  transactions: [
    { col: "id", type: "VARCHAR" }, { col: "transaction_type", type: "ENUM" },
    { col: "status", type: "ENUM" }, { col: "date", type: "DATE" },
    { col: "amount", type: "FLOAT" }, { col: "payment_status", type: "ENUM" },
    { col: "primary_person", type: "VARCHAR" }, { col: "enterprise", type: "VARCHAR" },
    { col: "description", type: "VARCHAR" }, { col: "due_date", type: "DATE" },
    { col: "created_date", type: "DATETIME" },
  ],
};

// ── Helpers ────────────────────────────────────────────────────────────────

function evalCaseExpr(expr, row) {
  // CASE WHEN condition THEN value ... ELSE default END
  const whenMatches = [...expr.matchAll(/WHEN\s+(.+?)\s+THEN\s+(.+?)(?=\s+WHEN|\s+ELSE|\s+END)/gi)];
  const elseMatch = expr.match(/ELSE\s+(.+?)\s+END/i);
  for (const [, cond, val] of whenMatches) {
    if (evalCondition(cond.trim(), row)) {
      return evalValue(val.trim(), row);
    }
  }
  return elseMatch ? evalValue(elseMatch[1].trim(), row) : null;
}

function evalCondition(cond, row) {
  const m = cond.match(/^(\w+)\s*(=|!=|<>|<=|>=|<|>)\s*'?([^']*)'?$/i);
  if (!m) return false;
  const [, field, op, val] = m;
  const rowVal = String(row[field] ?? "").toLowerCase();
  const cmpVal = val.toLowerCase();
  const numRow = parseFloat(row[field]), numVal = parseFloat(val);
  switch (op) {
    case "=": return rowVal === cmpVal;
    case "!=": case "<>": return rowVal !== cmpVal;
    case "<": return !isNaN(numRow) && numRow < numVal;
    case ">": return !isNaN(numRow) && numRow > numVal;
    case "<=": return !isNaN(numRow) && numRow <= numVal;
    case ">=": return !isNaN(numRow) && numRow >= numVal;
    default: return false;
  }
}

function evalValue(val, row) {
  if (/^-?\d+(\.\d+)?$/.test(val)) return parseFloat(val);
  if (val.startsWith("'") && val.endsWith("'")) return val.slice(1, -1);
  return row[val] ?? null;
}

function applyWhere(rows, sql) {
  const whereMatch = sql.match(/WHERE\s+(.+?)(?:\s+GROUP\s+BY|\s+ORDER\s+BY|\s+LIMIT\s+|$)/i);
  if (!whereMatch) return rows;
  const conditions = whereMatch[1].split(/\s+AND\s+/i);
  return rows.filter((row) =>
    conditions.every((cond) => {
      const trimmed = cond.trim();
      // Handle IN subquery check: id NOT IN (SELECT ... FROM ...)
      const notInMatch = trimmed.match(/^(\w+)\s+NOT\s+IN\s*\((.+)\)$/i);
      if (notInMatch) {
        // Simple: treat the inner as a value list if it's not a SELECT
        const inner = notInMatch[2].trim();
        if (!inner.toUpperCase().startsWith("SELECT")) {
          const vals = inner.split(",").map((v) => v.trim().replace(/^'|'$/g, "").toLowerCase());
          return !vals.includes(String(row[notInMatch[1]] ?? "").toLowerCase());
        }
        return true; // subquery in filter — skip for now (handled at caller level)
      }
      const inMatch = trimmed.match(/^(\w+)\s+IN\s*\((.+)\)$/i);
      if (inMatch) {
        const inner = inMatch[2].trim();
        if (!inner.toUpperCase().startsWith("SELECT")) {
          const vals = inner.split(",").map((v) => v.trim().replace(/^'|'$/g, "").toLowerCase());
          return vals.includes(String(row[inMatch[1]] ?? "").toLowerCase());
        }
        return true;
      }
      // IS NULL / IS NOT NULL
      const isNullMatch = trimmed.match(/^(\w+)\s+IS\s+(NOT\s+)?NULL$/i);
      if (isNullMatch) {
        const v = row[isNullMatch[1]];
        const isNull = v === null || v === undefined || v === "";
        return isNullMatch[2] ? !isNull : isNull;
      }
      const m = trimmed.match(/^(\w+(?:\.\w+)?)\s*(=|!=|<>|<=|>=|<|>|LIKE|NOT\s+LIKE)\s*'?([^']*)'?$/i);
      if (!m) return true;
      let [, field, op, val] = m;
      // Support table.column notation
      if (field.includes(".")) field = field.split(".")[1];
      const rowVal = row[field];
      const numVal = parseFloat(val), rowNum = parseFloat(rowVal);
      switch (op.toUpperCase().replace(/\s+/g, " ")) {
        case "=":    return String(rowVal ?? "").toLowerCase() === val.toLowerCase();
        case "!=": case "<>": return String(rowVal ?? "").toLowerCase() !== val.toLowerCase();
        case "<":   return !isNaN(rowNum) && rowNum < numVal;
        case ">":   return !isNaN(rowNum) && rowNum > numVal;
        case "<=":  return !isNaN(rowNum) && rowNum <= numVal;
        case ">=":  return !isNaN(rowNum) && rowNum >= numVal;
        case "LIKE": return String(rowVal ?? "").toLowerCase().includes(val.replace(/%/g, "").toLowerCase());
        case "NOT LIKE": return !String(rowVal ?? "").toLowerCase().includes(val.replace(/%/g, "").toLowerCase());
        default:    return true;
      }
    })
  );
}

// Evaluate a select expression (field, aggregate, CASE, arithmetic) on a row
function evalExpr(expr, row) {
  const e = expr.trim();
  if (e === "*") return null;
  // CASE expression
  if (/^CASE\s+WHEN/i.test(e)) return evalCaseExpr(e, row);
  // String literal
  if (e.startsWith("'") && e.endsWith("'")) return e.slice(1, -1);
  // Numeric literal
  if (/^-?\d+(\.\d+)?$/.test(e)) return parseFloat(e);
  // simple field (possibly table.field)
  if (/^\w+(\.\w+)?$/.test(e)) {
    if (e.includes(".")) {
      const parts = e.split(".");
      return row[parts[1]] ?? row[e] ?? null;
    }
    return row[e] !== undefined ? row[e] : null;
  }
  // arithmetic: field op number
  const arithMatch = e.match(/^(\w+(?:\.\w+)?)\s*([\+\-\*\/])\s*(\w+(?:\.\w+)?)$/);
  if (arithMatch) {
    const [, a, op, b] = arithMatch;
    const av = parseFloat(a.includes(".") ? row[a.split(".")[1]] : row[a]) || 0;
    const bv = parseFloat(b.includes(".") ? row[b.split(".")[1]] : (row[b] !== undefined ? row[b] : b)) || 0;
    if (op === "+") return av + bv;
    if (op === "-") return av - bv;
    if (op === "*") return av * bv;
    if (op === "/") return bv !== 0 ? av / bv : null;
  }
  // fallback: treat as column name
  return row[e] !== undefined ? row[e] : null;
}

// Apply GROUP BY + aggregates
function applyGroupBy(rows, colDefs, groupByStr) {
  const groupKeys = groupByStr.split(",").map((g) => g.trim().replace(/^\w+\./, ""));
  const groups = {};
  rows.forEach((row) => {
    const key = groupKeys.map((k) => String(row[k] ?? "")).join("|__|");
    if (!groups[key]) groups[key] = { rows: [], repr: row };
    groups[key].rows.push(row);
  });

  return Object.values(groups).map(({ rows: gRows, repr }) => {
    const result = {};
    colDefs.forEach(({ expr, alias }) => {
      const e = expr.trim();
      const aggMatch = e.match(/^(COUNT|SUM|AVG|MAX|MIN)\s*\(\s*(DISTINCT\s+)?(.+?)\s*\)/i);
      if (aggMatch) {
        const [, fn, , col] = aggMatch;
        const vals = gRows.map((r) => col === "*" ? 1 : r[col.includes(".") ? col.split(".")[1] : col]);
        switch (fn.toUpperCase()) {
          case "COUNT": result[alias] = col === "*" ? gRows.length : vals.filter((v) => v != null && v !== "").length; break;
          case "SUM":   result[alias] = vals.reduce((acc, v) => acc + (parseFloat(v) || 0), 0); break;
          case "AVG":   result[alias] = vals.length ? vals.reduce((acc, v) => acc + (parseFloat(v) || 0), 0) / vals.length : 0; break;
          case "MAX":   result[alias] = Math.max(...vals.map((v) => parseFloat(v) || 0)); break;
          case "MIN":   result[alias] = Math.min(...vals.map((v) => parseFloat(v) || 0)); break;
          default: result[alias] = null;
        }
      } else if (/^CASE\s+WHEN/i.test(e)) {
        // CASE in GROUP BY context: aggregate after evaluation
        const sumCase = expr.trim().match(/^SUM\s*\(\s*(CASE.+?END)\s*\)$/i);
        if (sumCase) {
          result[alias] = gRows.reduce((acc, r) => acc + (parseFloat(evalCaseExpr(sumCase[1], r)) || 0), 0);
        } else {
          result[alias] = evalCaseExpr(e, repr);
        }
      } else {
        // Plain field or GROUP BY key
        result[alias] = repr[e.includes(".") ? e.split(".")[1] : e] !== undefined
          ? repr[e.includes(".") ? e.split(".")[1] : e]
          : evalExpr(e, repr);
      }
    });
    return result;
  });
}

// Parse column definitions from SELECT clause (handles nested parens like CASE WHEN ... END)
function parseColDefs(colStr) {
  const defs = [];
  let depth = 0, current = "", i = 0;
  while (i < colStr.length) {
    const ch = colStr[i];
    if (ch === "(") { depth++; current += ch; }
    else if (ch === ")") { depth--; current += ch; }
    else if (ch === "," && depth === 0) {
      defs.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
    i++;
  }
  if (current.trim()) defs.push(current.trim());

  return defs.map((seg) => {
    // Handle: SUM(CASE WHEN ... END) AS alias
    const asMatch = seg.match(/^(.+)\s+AS\s+(\w+)$/i);
    if (asMatch) return { expr: asMatch[1].trim(), alias: asMatch[2].trim() };
    // plain field
    return { expr: seg, alias: seg.includes(".") ? seg.split(".")[1] : seg };
  });
}

// Load rows for a table name
async function loadTable(name, uploadedTables, companyId, masterDataSnapshot = {}) {
  const lower = name.toLowerCase();
  if (uploadedTables && Object.prototype.hasOwnProperty.call(uploadedTables, lower)) {
    return uploadedTables[lower].rows.map((r) => ({ ...r }));
  }
  if (MASTER_TABLES[lower]) {
    // Use pre-loaded, company-scoped snapshot when available (avoids cross-tenant fetch)
    if (masterDataSnapshot[lower] && masterDataSnapshot[lower].length > 0) {
      return masterDataSnapshot[lower];
    }
    // Fallback: fetch live from Base44 scoped to this tenant
    const filter = companyId ? { company_id: companyId } : {};
    return base44.entities[MASTER_TABLES[lower].entity].filter(filter);
  }
  if (ANALYTICS_TABLES[lower]) {
    return fetchAnalyticsTable(lower, companyId);
  }
  if (RAW_TABLES[lower]) {
    return fetchRawTable(lower, companyId);
  }
  return null;
}

// ── Main executeSQL ────────────────────────────────────────────────────────
export async function executeSQL(sql, uploadedTables, companyId, masterDataSnapshot = {}) {
  const s = sql.trim().replace(/\s+/g, " ");
  const upper = s.toUpperCase();

  if (upper.startsWith("SELECT")) {
    // ── Handle virtual tables (external APIs) ─────────────────────────────
    const sqlLower = s.toLowerCase();
    const VIRTUAL_TABLE_NAMES = [
      "osm_places", "osm_nearby", "weather_current", "weather_forecast",
      "worldbank_indicators", "exchange_rates", "countries",
      "fda_devices", "fda_food_recalls", "medications_recalls", "medications_label",
      "geo_overview", "geo_economy", "geo_competitors", "geo_infrastructure",
      "geo_weather_profile", "geo_market_size", "geo_cost_of_living",
      "geo_population", "us_state", "us_county",
      "us_zipcode", "cms_healthcare", "usda_food_access",
      "stock_quote", "stock_financials", "market_index",
      "crypto_price", "fed_rates", "commodity_price",
      "bls_wages", "job_skills", "salary_benchmark",
      "news_search", "global_events",
      "air_quality", "flood_risk", "earthquake_data", "climate_risk",
    ];
    const matchedVirtual = VIRTUAL_TABLE_NAMES.find(t => sqlLower.includes(`from ${t}`));
    if (matchedVirtual) {
      return await executeVirtualTable(matchedVirtual, s);
    }
    // medications_api handled separately (supports LIKE pattern)
    if (/medications_api/i.test(s)) {
      const rows = await fetchMedicationsAPI(s);
      return { type: "select", rows, message: `${rows.length} row(s) returned.` };
    }

    // ── Extract clauses ───────────────────────────────────────────────────
    // Strip trailing semicolon
    const cleanSql = s.replace(/;$/, "");

    // ORDER BY (last)
    const orderMatch = cleanSql.match(/ORDER\s+BY\s+(.+?)(?:\s+LIMIT\s+\d+)?$/i);
    const orderBy = orderMatch ? orderMatch[1].trim() : null;

    // LIMIT
    const limitMatch = cleanSql.match(/LIMIT\s+(\d+)/i);
    const limitN = limitMatch ? parseInt(limitMatch[1], 10) : null;

    // GROUP BY
    const groupByMatch = cleanSql.match(/GROUP\s+BY\s+(.+?)(?:\s+ORDER\s+BY|\s+LIMIT|\s+HAVING|$)/i);
    const groupByStr = groupByMatch ? groupByMatch[1].trim() : null;

    // HAVING
    const havingMatch = cleanSql.match(/HAVING\s+(.+?)(?:\s+ORDER\s+BY|\s+LIMIT|$)/i);
    const havingStr = havingMatch ? havingMatch[1].trim() : null;

    // FROM + optional alias + optional JOIN
    const fromMatch = cleanSql.match(/FROM\s+(\w+)(?:\s+(?:AS\s+)?(\w+))?/i);
    if (!fromMatch) throw new Error("Missing FROM clause.");
    const mainTable = fromMatch[1].toLowerCase();
    const mainAlias = fromMatch[2] ? fromMatch[2].toLowerCase() : mainTable;

    // Detect JOINs
    const joinMatches = [...cleanSql.matchAll(/(?:LEFT\s+|INNER\s+|RIGHT\s+)?JOIN\s+(\w+)(?:\s+(?:AS\s+)?(\w+))?\s+ON\s+(.+?)(?=\s+(?:LEFT\s+|INNER\s+|RIGHT\s+)?JOIN\s+|\s+WHERE\s+|\s+GROUP\s+BY\s+|\s+ORDER\s+BY\s+|\s+LIMIT\s+|$)/gi)];

    // SELECT columns
    const sqlForCols = cleanSql
      .replace(/\s+ORDER\s+BY\s+.+$/i, "")
      .replace(/\s+LIMIT\s+\d+/i, "")
      .replace(/\s+GROUP\s+BY\s+.+$/i, "")
      .replace(/\s+HAVING\s+.+$/i, "");
    const colsMatch = sqlForCols.match(/SELECT\s+(.+?)\s+FROM/i);
    const colStr = colsMatch ? colsMatch[1].trim() : "*";

    // ── Load main table ───────────────────────────────────────────────────
    let rows = await loadTable(mainTable, uploadedTables, companyId, masterDataSnapshot);
    if (rows === null) throw new Error(`Unknown table "${mainTable}".`);

    // Tag with alias for JOIN disambiguation
    if (joinMatches.length > 0) {
      rows = rows.map((r) => {
        const tagged = {};
        Object.entries(r).forEach(([k, v]) => { tagged[`${mainAlias}.${k}`] = v; tagged[k] = v; });
        return tagged;
      });
    }

    // ── Process JOINs ─────────────────────────────────────────────────────
    for (const jm of joinMatches) {
      const [, joinTableName, joinAlias, onClause] = jm;
      const jName = joinTableName.toLowerCase();
      const jAlias = joinAlias ? joinAlias.toLowerCase() : jName;
      let joinRows = await loadTable(jName, uploadedTables, companyId, masterDataSnapshot);
      if (!joinRows) joinRows = [];

      // Parse ON: left = right
      const onMatch = onClause.trim().match(/(\w+(?:\.\w+)?)\s*=\s*(\w+(?:\.\w+)?)/i);
      if (!onMatch) continue;
      const [, leftKey, rightKey] = onMatch;
      const lk = leftKey.includes(".") ? leftKey : `${mainAlias}.${leftKey}`;
      const rk = rightKey.includes(".") ? rightKey : `${jAlias}.${rightKey}`;
      const lField = lk.split(".")[1] || lk;
      const rField = rk.split(".")[1] || rk;

      // Build join map
      const joinMap = {};
      joinRows.forEach((jr) => {
        const key = String(jr[rField] ?? "").toLowerCase();
        if (!joinMap[key]) joinMap[key] = [];
        joinMap[key].push(jr);
      });

      const joined = [];
      rows.forEach((mainRow) => {
        const mainVal = String(mainRow[lField] ?? mainRow[lk] ?? "").toLowerCase();
        const matches = joinMap[mainVal] || [];
        if (matches.length > 0) {
          matches.forEach((jr) => {
            const merged = { ...mainRow };
            Object.entries(jr).forEach(([k, v]) => {
              merged[`${jAlias}.${k}`] = v;
              if (!merged[k]) merged[k] = v;
            });
            joined.push(merged);
          });
        } else {
          joined.push({ ...mainRow }); // LEFT JOIN behavior
        }
      });
      rows = joined;
    }

    // ── WHERE ─────────────────────────────────────────────────────────────
    rows = applyWhere(rows, cleanSql);

    // ── Parse column defs & apply GROUP BY / aggregate ────────────────────
    if (colStr === "*") {
      // No grouping needed for SELECT *
      if (groupByStr) rows = applyGroupBy(rows, parseColDefs("*"), groupByStr);
    } else {
      const colDefs = parseColDefs(colStr);
      const hasAggregate = colDefs.some(({ expr }) => /^(COUNT|SUM|AVG|MAX|MIN)\s*\(/i.test(expr) || /^SUM\s*\(\s*CASE/i.test(expr));

      if (hasAggregate && groupByStr) {
        rows = applyGroupBy(rows, colDefs, groupByStr);
      } else if (hasAggregate) {
        // Global aggregates (no GROUP BY)
        const aggRow = {};
        colDefs.forEach(({ expr, alias }) => {
          const aggMatch = expr.trim().match(/^(COUNT|SUM|AVG|MAX|MIN)\s*\(\s*(DISTINCT\s+)?(.+?)\s*\)/i);
          const caseSum = expr.trim().match(/^SUM\s*\(\s*(CASE.+?END)\s*\)$/i);
          if (caseSum) {
            aggRow[alias] = rows.reduce((acc, r) => acc + (parseFloat(evalCaseExpr(caseSum[1], r)) || 0), 0);
          } else if (aggMatch) {
            const [, fn, , col] = aggMatch;
            const vals = rows.map((r) => col === "*" ? 1 : r[col.includes(".") ? col.split(".")[1] : col]);
            switch (fn.toUpperCase()) {
              case "COUNT": aggRow[alias] = col === "*" ? rows.length : vals.filter((v) => v != null && v !== "").length; break;
              case "SUM":   aggRow[alias] = vals.reduce((acc, v) => acc + (parseFloat(v) || 0), 0); break;
              case "AVG":   aggRow[alias] = vals.length ? vals.reduce((acc, v) => acc + (parseFloat(v) || 0), 0) / vals.length : 0; break;
              case "MAX":   aggRow[alias] = Math.max(...vals.map((v) => parseFloat(v) || 0)); break;
              case "MIN":   aggRow[alias] = Math.min(...vals.map((v) => parseFloat(v) || 0)); break;
              default: aggRow[alias] = null;
            }
          } else {
            aggRow[alias] = rows.length ? evalExpr(expr, rows[0]) : null;
          }
        });
        return { type: "select", rows: [aggRow], message: "1 row(s) returned." };
      } else {
        // Plain projection
        rows = rows.map((r) => {
          const out = {};
          colDefs.forEach(({ expr, alias }) => {
            const e = expr.trim();
            if (/^CASE\s+WHEN/i.test(e)) {
              out[alias] = evalCaseExpr(e, r);
            } else {
              out[alias] = evalExpr(e, r);
            }
          });
          return out;
        });
      }
    }

    // ── HAVING ────────────────────────────────────────────────────────────
    if (havingStr) {
      rows = applyWhere(rows, `SELECT * FROM x WHERE ${havingStr}`);
    }

    // ── ORDER BY ──────────────────────────────────────────────────────────
    if (orderBy) {
      const parts = orderBy.split(",").map((p) => {
        const [col, dir] = p.trim().split(/\s+/);
        return { col: col.includes(".") ? col.split(".")[1] : col, desc: dir?.toUpperCase() === "DESC" };
      });
      rows.sort((a, b) => {
        for (const { col, desc } of parts) {
          const av = a[col], bv = b[col];
          if (av == null && bv == null) continue;
          if (av == null) return desc ? -1 : 1;
          if (bv == null) return desc ? 1 : -1;
          const n = parseFloat(av), m = parseFloat(bv);
          const cmp = !isNaN(n) && !isNaN(m) ? n - m : String(av).localeCompare(String(bv));
          if (cmp !== 0) return desc ? -cmp : cmp;
        }
        return 0;
      });
    }

    // ── LIMIT ─────────────────────────────────────────────────────────────
    if (limitN !== null) rows = rows.slice(0, limitN);

    return { type: "select", rows, message: `${rows.length} row(s) returned.` };
  }

  // ── INSERT … SELECT ───────────────────────────────────────────────────────
  if (upper.startsWith("INSERT") && upper.includes("SELECT")) {
    const mWithCols = s.match(/INSERT\s+INTO\s+(\w+)\s*\(([^)]+)\)\s*SELECT\s+(.+?)\s+FROM\s+(\w+)(?:\s+WHERE\s+(.+))?$/i);
    const mNoCols   = s.match(/INSERT\s+INTO\s+(\w+)\s+SELECT\s+(.+?)\s+FROM\s+(\w+)(?:\s+WHERE\s+(.+))?$/i);
    if (!mWithCols && !mNoCols) throw new Error("Invalid INSERT...SELECT syntax.");
    let destTable, destCols, selectStr, srcTable, whereClause;
    if (mWithCols) {
      [, destTable, destCols, selectStr, srcTable, whereClause] = mWithCols;
      destCols = destCols.split(",").map((c) => c.trim());
    } else {
      [, destTable, selectStr, srcTable, whereClause] = mNoCols;
      destCols = null;
    }
    const dest = destTable.toLowerCase();
    const src  = srcTable.toLowerCase();
    if (!MASTER_TABLES[dest]) throw new Error(`INSERT destination "${dest}" must be a known master table.`);
    let srcRows = await loadTable(src, uploadedTables, companyId, masterDataSnapshot);
    if (!srcRows) throw new Error(`Source table "${src}" not found.`);
    if (whereClause) srcRows = applyWhere(srcRows, `SELECT * FROM x WHERE ${whereClause}`);
    const exprDefs = selectStr.split(",").map((e, i) => {
      const t = e.trim();
      const litStr = t.match(/^'([^']*)'\s+AS\s+(\w+)$/i);
      if (litStr) return { type: "literal", value: litStr[1], alias: litStr[2] };
      const litNum = t.match(/^(-?[\d.]+)\s+AS\s+(\w+)$/i);
      if (litNum) return { type: "literal", value: parseFloat(litNum[1]), alias: litNum[2] };
      const colAs = t.match(/^(\w+)\s+AS\s+(\w+)$/i);
      if (colAs) return { type: "column", field: colAs[1], alias: colAs[2] };
      return { type: "column", field: t, alias: (destCols && destCols[i]) ? destCols[i] : t };
    });
    const entity = base44.entities[MASTER_TABLES[dest].entity];
    let inserted = 0;
    for (const row of srcRows) {
      const payload = {};
      exprDefs.forEach(({ type: exprType, field, value, alias }) => {
        payload[alias] = exprType === "literal" ? value : (row[field] !== undefined ? row[field] : row[field?.toLowerCase()]);
      });
      if (companyId) payload.company_id = companyId;
      await entity.create(payload);
      inserted++;
    }
    _triggerETL(dest);
    return { type: "mutation", rows: [], message: `✓ Inserted ${inserted} row(s) into ${dest}.` };
  }

  // ── INSERT VALUES ─────────────────────────────────────────────────────────
  if (upper.startsWith("INSERT")) {
    const m = s.match(/INSERT\s+INTO\s+(\w+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i);
    if (!m) throw new Error("Invalid INSERT syntax.");
    const [, tableName, colsStr, valsStr] = m;
    const dest = tableName.toLowerCase();
    const cols = colsStr.split(",").map((c) => c.trim());
    const vals = valsStr.split(",").map((v) => v.trim().replace(/^['"]|['"]$/g, ""));
    const payload = {}; cols.forEach((c, i) => { payload[c] = vals[i] ?? ""; });
    if (MASTER_TABLES[dest]) {
      if (companyId) payload.company_id = companyId;
      const created = await base44.entities[MASTER_TABLES[dest].entity].create(payload);
      _triggerETL(dest);
      return { type: "mutation", rows: [created], message: `✓ Inserted 1 row into ${dest}.` };
    } else {
      UploadedDataStore.addRow(dest, payload);
      return { type: "mutation", rows: [], message: `✓ Inserted 1 row into "${dest}".` };
    }
  }

  // ── UPDATE ────────────────────────────────────────────────────────────────
  if (upper.startsWith("UPDATE")) {
    const m = s.match(/UPDATE\s+(\w+)\s+SET\s+(.+?)\s+WHERE\s+(.+)$/i);
    if (!m) throw new Error("Invalid UPDATE syntax.");
    const [, tableName, setStr, whereStr] = m;
    const tbl = tableName.toLowerCase();
    const updates = {};
    setStr.split(",").forEach((part) => {
      const eq = part.match(/^\s*(\w+)\s*=\s*'?([^']*)'?\s*$/);
      if (eq) updates[eq[1].trim()] = eq[2].trim();
    });
    if (MASTER_TABLES[tbl]) {
      const entity = base44.entities[MASTER_TABLES[tbl].entity];
      // Scope fetch to this tenant — never touch other companies' records
      const filter = companyId ? { company_id: companyId } : {};
      const allRows = await entity.filter(filter);
      const matched = applyWhere(allRows, `SELECT * FROM x WHERE ${whereStr}`);
      if (!matched.length) return { type: "mutation", rows: [], message: "No rows matched." };
      for (const row of matched) await entity.update(row.id, updates);
      _triggerETL(tbl);
      return { type: "mutation", rows: [], message: `✓ Updated ${matched.length} row(s) in ${tbl}.` };
    } else if (uploadedTables[tbl]) {
      const rows = uploadedTables[tbl].rows;
      const matched = applyWhere(rows.map((r, i) => ({ ...r, _idx: i })), `SELECT * FROM x WHERE ${whereStr}`);
      matched.forEach((r) => UploadedDataStore.updateRow(tbl, r._idx, updates));
      return { type: "mutation", rows: [], message: `✓ Updated ${matched.length} row(s) in "${tbl}".` };
    }
    throw new Error(`Unknown table "${tbl}".`);
  }

  // ── DELETE ────────────────────────────────────────────────────────────────
  if (upper.startsWith("DELETE")) {
    const m = s.match(/DELETE\s+FROM\s+(\w+)(?:\s+WHERE\s+(.+))?$/i);
    if (!m) throw new Error("Invalid DELETE syntax.");
    const [, tableName, whereStr] = m;
    const tbl = tableName.toLowerCase();
    // DELETE on any Base44 entity is always blocked in Query Builder.
    // Records must be deleted manually via the entity pages (People, Enterprises, etc.)
    // to preserve audit trail and prevent accidental bulk deletes.
    if (MASTER_TABLES[tbl]) {
      throw new Error(
        `❌ DELETE on "${tbl}" is not allowed in Query Builder.\n\n` +
        `To delete records, open the ${MASTER_TABLES[tbl].label} page and delete them individually.\n\n` +
        `This protects your data from accidental bulk deletions.`
      );
    }
    if (uploadedTables[tbl]) {
      if (whereStr) {
        const rows = uploadedTables[tbl].rows;
        const matched = applyWhere(rows.map((r, i) => ({ ...r, _idx: i })), `SELECT * FROM x WHERE ${whereStr}`);
        matched.reverse().forEach((r) => UploadedDataStore.deleteRow(tbl, r._idx));
        return { type: "mutation", rows: [], message: `✓ Deleted ${matched.length} row(s) from "${tbl}".` };
      } else {
        const count = uploadedTables[tbl].rows.length;
        UploadedDataStore.set(tbl, { ...uploadedTables[tbl], rows: [] });
        return { type: "mutation", rows: [], message: `✓ Deleted all ${count} row(s) from "${tbl}".` };
      }
    }
    throw new Error(`Unknown table "${tbl}".`);
  }

  throw new Error("Unsupported SQL. Supported: SELECT, INSERT, UPDATE, DELETE.");
}

// ── Mutation detector ─────────────────────────────────────────────────────
export function detectMutation(sql) {
  const s = sql.trim().replace(/\s+/g, " ");
  const upper = s.toUpperCase();
  if (upper.startsWith("INSERT") && upper.includes("SELECT")) {
    const m = s.match(/INSERT\s+INTO\s+(\w+)\s+SELECT/i);
    return m ? { type: "INSERT_SELECT", tableName: m[1].toLowerCase(), cols: [] } : null;
  }
  if (upper.startsWith("INSERT")) {
    const m = s.match(/INSERT\s+INTO\s+(\w+)\s*\(([^)]+)\)/i);
    return m ? { type: "INSERT", tableName: m[1].toLowerCase(), cols: m[2].split(",").map((c) => c.trim()) } : null;
  }
  if (upper.startsWith("UPDATE")) {
    const m = s.match(/UPDATE\s+(\w+)\s+SET\s+(.+?)\s+WHERE/i);
    if (!m) return null;
    const setCols = m[2].split(",").map((p) => { const eq = p.match(/(\w+)\s*=/); return eq ? eq[1].trim() : ""; }).filter(Boolean);
    return { type: "UPDATE", tableName: m[1].toLowerCase(), cols: setCols };
  }
  if (upper.startsWith("DELETE")) {
    const m = s.match(/DELETE\s+FROM\s+(\w+)/i);
    return m ? { type: "DELETE", tableName: m[1].toLowerCase(), cols: [] } : null;
  }
  return null;
}

// ── Column validation ─────────────────────────────────────────────────────
export function validateMutation(sql, uploadedTables) {
  const mutation = detectMutation(sql);
  if (!mutation) return [];
  const { type, tableName, cols } = mutation;
  const errors = [];
  const isKnownMaster = !!MASTER_TABLES[tableName];
  const isKnownUploaded = !!uploadedTables[tableName];
  if (!isKnownMaster && !isKnownUploaded && type !== "INSERT") {
    errors.push(`Table "${tableName}" does not exist.`);
    return errors;
  }
  if ((type === "INSERT" || type === "UPDATE") && isKnownMaster) {
    const knownCols = new Set((MASTER_SCHEMA[tableName] || []).map((f) => f.col));
    cols.forEach((col) => {
      if (col && !knownCols.has(col) && knownCols.size > 0) {
        errors.push(`Column "${col}" does not exist on table "${tableName}".`);
      }
    });
  }
  if (type === "DELETE" && MASTER_TABLES[tableName]) {
    errors.push(`DELETE on "${tableName}" is not allowed in Query Builder. Delete records manually via the ${MASTER_TABLES[tableName]?.label || tableName} page.`);
  }
  return errors;
}

// ── Export helpers ────────────────────────────────────────────────────────
export function exportCSV(rows, filename) {
  if (!rows.length) return;
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const fname = filename || `newsconseen_query_${ts}.csv`;
  const keys = Object.keys(rows[0]);
  const csv = [keys.join(","), ...rows.map((r) => keys.map((k) => JSON.stringify(r[k] ?? "")).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = fname; a.click();
  URL.revokeObjectURL(url);
}

export function exportJSON(rows) {
  if (!rows.length) return;
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const blob = new Blob([JSON.stringify(rows, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = `newsconseen_query_${ts}.json`; a.click();
  URL.revokeObjectURL(url);
}

export function copyToClipboard(rows) {
  if (!rows.length) return;
  const keys = Object.keys(rows[0]);
  const tsv = [keys.join("\t"), ...rows.map((r) => keys.map((k) => String(r[k] ?? "")).join("\t"))].join("\n");
  navigator.clipboard.writeText(tsv);
}

export function inferType(values) {
  const nonEmpty = values.filter((v) => v !== null && v !== undefined && String(v).trim() !== "");
  if (!nonEmpty.length) return "TEXT";
  if (nonEmpty.every((v) => !isNaN(Number(v)) && !isNaN(parseFloat(v)))) {
    return nonEmpty.every((v) => Number.isInteger(Number(v))) ? "INT" : "FLOAT";
  }
  if (nonEmpty.every((v) => /^\d{4}-\d{2}-\d{2}/.test(String(v)))) return "DATE";
  return "TEXT";
}

export function getUploadedSchema(rows) {
  if (!rows.length) return [];
  return Object.keys(rows[0]).map((col) => ({ col, type: inferType(rows.map((r) => r[col])) }));
}