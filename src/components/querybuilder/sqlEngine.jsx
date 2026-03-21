import { base44 } from "@/api/base44Client";
import { UploadedDataStore } from "./UploadedDataStore";
import { fetchOpenDataTable, OPEN_DATA_TABLES } from "./openDataAPIs";

const RAILWAY_BASE = "https://newsconseenwebapp-production.up.railway.app";

export const MASTER_TABLES = {
  enterprises:        { entity: "Enterprise",        label: "Enterprises" },
  people:             { entity: "Person",             label: "People" },
  products:           { entity: "Product",            label: "Products" },
  services:           { entity: "Service",            label: "Services" },
  addresses:          { entity: "Address",            label: "Addresses" },
  relationships:      { entity: "Relationship",       label: "Relationships" },
  tasks:              { entity: "Task",               label: "Tasks" },
  transactions:       { entity: "Transaction",        label: "Transactions" },
  medication_profiles:{ entity: "MedicationProfile",  label: "Medication Profiles" },
  reports:            { entity: "Report",             label: "Reports" },
  clients:            { entity: "Client",             label: "Clients" },
};

export const PROTECTED_TABLES = new Set(["enterprises", "people", "products", "services", "addresses"]);

// ── Analytics virtual tables ───────────────────────────────────────────────
export const ANALYTICS_TABLES = {
  analytics_enterprises: {
    endpoint: "/enterprise-summary",
    columns: [
      { col: "status", type: "ENUM" },
      { col: "enterprise_type", type: "ENUM" },
      { col: "enterprise_count", type: "INT" },
    ],
  },
  analytics_tasks: {
    endpoint: "/task-summary",
    columns: [
      { col: "task_type", type: "ENUM" },
      { col: "status", type: "ENUM" },
      { col: "total_tasks", type: "INT" },
      { col: "completed_tasks", type: "INT" },
    ],
  },
  analytics_transactions: {
    endpoint: "/transaction-summary",
    columns: [
      { col: "transaction_type", type: "ENUM" },
      { col: "status", type: "ENUM" },
      { col: "total_transactions", type: "INT" },
      { col: "total_amount", type: "FLOAT" },
      { col: "avg_amount", type: "FLOAT" },
    ],
  },
  analytics_people: {
    endpoint: "/people-summary",
    columns: [
      { col: "person_type", type: "ENUM" },
      { col: "status", type: "ENUM" },
      { col: "people_count", type: "INT" },
    ],
  },
  analytics_services: {
    endpoint: "/service-summary",
    columns: [
      { col: "service_type", type: "ENUM" },
      { col: "status", type: "ENUM" },
      { col: "category", type: "ENUM" },
      { col: "service_count", type: "INT" },
    ],
  },
  analytics_products: {
    endpoint: "/product-summary",
    columns: [
      { col: "item_type", type: "ENUM" },
      { col: "status", type: "ENUM" },
      { col: "total_products", type: "INT" },
      { col: "total_stock", type: "INT" },
      { col: "avg_price", type: "FLOAT" },
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

// In-memory analytics cache
let analyticsCache = {};

export async function fetchAllAnalytics() {
  const results = {};
  await Promise.all(
    Object.entries(ANALYTICS_TABLES).map(async ([key, cfg]) => {
      try {
        const res = await fetch(`${RAILWAY_BASE}${cfg.endpoint}`);
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

async function fetchAnalyticsTable(name) {
  if (analyticsCache[name]) return analyticsCache[name];
  const cfg = ANALYTICS_TABLES[name];
  if (!cfg) return [];
  try {
    const res = await fetch(`${RAILWAY_BASE}${cfg.endpoint}`);
    if (!res.ok) return [];
    const data = await res.json();
    const rows = Array.isArray(data) ? data : (data.data || data.results || []);
    analyticsCache[name] = rows;
    return rows;
  } catch {
    return [];
  }
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
      const data = await res.json();
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
  medication_profiles: [
    { col: "id", type: "VARCHAR" }, { col: "client_name", type: "VARCHAR" },
    { col: "medication_name", type: "VARCHAR" }, { col: "strength", type: "VARCHAR" },
    { col: "route", type: "ENUM" }, { col: "frequency", type: "VARCHAR" },
    { col: "status", type: "ENUM" }, { col: "prescriber", type: "VARCHAR" },
    { col: "start_date", type: "DATE" }, { col: "created_date", type: "DATETIME" },
  ],
  reports: [
    { col: "id", type: "VARCHAR" }, { col: "title", type: "VARCHAR" },
    { col: "type", type: "ENUM" }, { col: "status", type: "ENUM" },
    { col: "date_range_start", type: "DATE" }, { col: "date_range_end", type: "DATE" },
    { col: "created_date", type: "DATETIME" },
  ],
  clients: [
    { col: "id", type: "VARCHAR" }, { col: "business_name", type: "VARCHAR" },
    { col: "contact_person", type: "VARCHAR" }, { col: "email", type: "VARCHAR" },
    { col: "industry", type: "ENUM" }, { col: "status", type: "ENUM" },
    { col: "monthly_revenue", type: "FLOAT" }, { col: "created_date", type: "DATETIME" },
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
async function loadTable(name, uploadedTables) {
  const lower = name.toLowerCase();
  if (uploadedTables && Object.prototype.hasOwnProperty.call(uploadedTables, lower)) {
    return uploadedTables[lower].rows.map((r) => ({ ...r }));
  }
  if (MASTER_TABLES[lower]) {
    return base44.entities[MASTER_TABLES[lower].entity].list("-created_date", 2000);
  }
  if (ANALYTICS_TABLES[lower]) {
    return fetchAnalyticsTable(lower);
  }
  return null;
}

// ── Main executeSQL ────────────────────────────────────────────────────────
export async function executeSQL(sql, uploadedTables) {
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
    let rows = await loadTable(mainTable, uploadedTables);
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
      let joinRows = await loadTable(jName, uploadedTables);
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
    let srcRows = await loadTable(src, uploadedTables);
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
      await entity.create(payload);
      inserted++;
    }
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
      const created = await base44.entities[MASTER_TABLES[dest].entity].create(payload);
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
      const allRows = await entity.list("-created_date", 2000);
      const matched = applyWhere(allRows, `SELECT * FROM x WHERE ${whereStr}`);
      if (!matched.length) return { type: "mutation", rows: [], message: "No rows matched." };
      for (const row of matched) await entity.update(row.id, updates);
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
    if (PROTECTED_TABLES.has(tbl)) throw new Error(`❌ DELETE blocked on protected table "${tbl}".`);
    if (MASTER_TABLES[tbl]) {
      const entity = base44.entities[MASTER_TABLES[tbl].entity];
      const allRows = await entity.list("-created_date", 2000);
      const matched = whereStr ? applyWhere(allRows, `SELECT * FROM x WHERE ${whereStr}`) : allRows;
      for (const row of matched) await entity.delete(row.id);
      return { type: "mutation", rows: [], message: `✓ Deleted ${matched.length} row(s) from ${tbl}.` };
    } else if (uploadedTables[tbl]) {
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
  if (type === "DELETE" && PROTECTED_TABLES.has(tableName)) {
    errors.push(`DELETE is blocked on protected table "${tableName}".`);
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