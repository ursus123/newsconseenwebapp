// ─── Open Data API Virtual Tables ─────────────────────────────────────────────
// All free, no API key required.

const NOMINATIM = "https://nominatim.openstreetmap.org";
const OVERPASS  = "https://overpass-api.de/api/interpreter";
const OPEN_METEO = "https://api.open-meteo.com/v1/forecast";
const WORLDBANK  = "https://api.worldbank.org/v2";
const ER_API     = "https://open.er-api.com/v6/latest";
const REST_COUNTRIES = "https://restcountries.com/v3.1";
const FDA_API    = "https://api.fda.gov";
const RAILWAY_BASE = "https://newsconseenwebapp-production.up.railway.app";

// WMO weather codes → human readable
const WMO_CODES = {
  0:"Clear sky",1:"Mainly clear",2:"Partly cloudy",3:"Overcast",
  45:"Fog",48:"Fog",51:"Light drizzle",53:"Drizzle",55:"Dense drizzle",
  61:"Slight rain",63:"Rain",65:"Heavy rain",71:"Slight snow",73:"Snow",
  75:"Heavy snow",80:"Rain showers",81:"Rain showers",82:"Violent showers",
  85:"Snow showers",86:"Snow showers",95:"Thunderstorm",96:"Thunderstorm",99:"Thunderstorm"
};

// ── Geocode helper ──────────────────────────────────────────────────────────
async function geocode(city) {
  const res = await fetch(
    `${NOMINATIM}/search?q=${encodeURIComponent(city)}&format=json&limit=1`,
    { headers: { "User-Agent": "newsconseen-querybuilder/1.0" } }
  );
  if (!res.ok) throw new Error("Nominatim geocode failed");
  const data = await res.json();
  if (!data.length) throw new Error(`City not found: ${city}`);
  return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
}

// Parse simple WHERE clause into key=value map
function parseWhere(sql, tableName) {
  const whereMatch = sql.match(new RegExp(`FROM\\s+${tableName}\\s+WHERE\\s+(.+)$`, "i"));
  if (!whereMatch) return {};
  const params = {};
  const raw = whereMatch[1].replace(/;$/, "");
  // split on AND
  raw.split(/\s+AND\s+/i).forEach((cond) => {
    const m = cond.trim().match(/^(\w+)\s*=\s*'?([^']+)'?\s*$/i);
    if (m) params[m[1].toLowerCase()] = m[2].trim();
  });
  return params;
}

// haversine distance km
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371, dLat = (lat2-lat1)*Math.PI/180, dLon = (lon2-lon1)*Math.PI/180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// ── 1. osm_places ───────────────────────────────────────────────────────────
async function fetchOsmPlaces(sql) {
  const p = parseWhere(sql, "osm_places");
  let q = p.query || p.q || "";
  if (p.city) q += ` ${p.city}`;
  if (p.country) q += ` ${p.country}`;
  if (!q.trim()) throw new Error("osm_places requires WHERE query = '...'");
  const url = `${NOMINATIM}/search?q=${encodeURIComponent(q.trim())}&format=json&limit=20&addressdetails=1`;
  const res = await fetch(url, { headers: { "User-Agent": "newsconseen-querybuilder/1.0" } });
  if (!res.ok) throw new Error("OpenStreetMap API error");
  const data = await res.json();
  return data.map((r) => ({
    place_id: r.place_id,
    name: r.name || r.display_name?.split(",")[0] || "",
    display_name: r.display_name,
    type: r.type,
    amenity: r.extratags?.amenity || r.type,
    lat: parseFloat(r.lat),
    lon: parseFloat(r.lon),
    city: r.address?.city || r.address?.town || r.address?.village || "",
    country: r.address?.country || "",
    postcode: r.address?.postcode || "",
    distance_km: null,
  }));
}

// ── 2. osm_nearby (Overpass) ────────────────────────────────────────────────
async function fetchOsmNearby(sql) {
  const p = parseWhere(sql, "osm_nearby");
  const lat = parseFloat(p.lat);
  const lon = parseFloat(p.lon);
  const amenity = p.type || p.amenity || "pharmacy";
  const radiusKm = parseFloat(p.radius_km || p.radius || 5);
  const radiusM = Math.round(radiusKm * 1000);
  if (isNaN(lat) || isNaN(lon)) throw new Error("osm_nearby requires WHERE lat = ... AND lon = ...");
  const query = `[out:json][timeout:25];node["amenity"="${amenity}"](around:${radiusM},${lat},${lon});out body;`;
  const res = await fetch(OVERPASS, { method: "POST", body: "data=" + encodeURIComponent(query), headers: { "Content-Type": "application/x-www-form-urlencoded" } });
  if (!res.ok) throw new Error("Overpass API error");
  const data = await res.json();
  return (data.elements || []).map((el) => ({
    osm_id: el.id,
    name: el.tags?.name || "(unnamed)",
    amenity: el.tags?.amenity || amenity,
    lat: el.lat,
    lon: el.lon,
    address: [el.tags?.["addr:street"], el.tags?.["addr:housenumber"], el.tags?.["addr:city"]].filter(Boolean).join(" ") || "",
    opening_hours: el.tags?.opening_hours || "",
    phone: el.tags?.phone || el.tags?.["contact:phone"] || "",
    distance_km: parseFloat(haversine(lat, lon, el.lat, el.lon).toFixed(2)),
  })).sort((a, b) => a.distance_km - b.distance_km);
}

// ── 3. weather_current ──────────────────────────────────────────────────────
async function fetchWeatherCurrent(sql) {
  const p = parseWhere(sql, "weather_current");
  let lat = parseFloat(p.lat), lon = parseFloat(p.lon);
  let city = p.city || "";
  if (p.city && (isNaN(lat) || isNaN(lon))) {
    const coords = await geocode(p.city);
    lat = coords.lat; lon = coords.lon;
  }
  if (isNaN(lat) || isNaN(lon)) throw new Error("weather_current requires WHERE city='...' or lat/lon");
  const url = `${OPEN_METEO}?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code,precipitation,apparent_temperature&timezone=auto`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Open-Meteo API error");
  const data = await res.json();
  const c = data.current || {};
  return [{
    city: city || `${lat.toFixed(2)},${lon.toFixed(2)}`,
    lat, lon,
    temperature_c: c.temperature_2m,
    feels_like_c: c.apparent_temperature,
    humidity_pct: c.relative_humidity_2m,
    wind_speed_kmh: c.wind_speed_10m,
    precipitation_mm: c.precipitation,
    weather_description: WMO_CODES[c.weather_code] || `Code ${c.weather_code}`,
    local_time: data.current_units?.time || c.time || "",
  }];
}

// ── 4. weather_forecast ─────────────────────────────────────────────────────
async function fetchWeatherForecast(sql) {
  const p = parseWhere(sql, "weather_forecast");
  let lat = parseFloat(p.lat), lon = parseFloat(p.lon);
  const days = parseInt(p.days || "7", 10);
  if (p.city && (isNaN(lat) || isNaN(lon))) {
    const coords = await geocode(p.city);
    lat = coords.lat; lon = coords.lon;
  }
  if (isNaN(lat) || isNaN(lon)) throw new Error("weather_forecast requires WHERE city='...' or lat/lon");
  const url = `${OPEN_METEO}?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weather_code&timezone=auto&forecast_days=${Math.min(days, 16)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Open-Meteo forecast API error");
  const data = await res.json();
  const d = data.daily || {};
  return (d.time || []).map((date, i) => ({
    date,
    temp_max_c: d.temperature_2m_max?.[i],
    temp_min_c: d.temperature_2m_min?.[i],
    precipitation_mm: d.precipitation_sum?.[i],
    weather_description: WMO_CODES[d.weather_code?.[i]] || `Code ${d.weather_code?.[i]}`,
  }));
}

// ── 5. medications_interactions ─────────────────────────────────────────────
async function fetchMedInteractions(sql) {
  const p = parseWhere(sql, "medications_interactions");
  const drug1 = p.drug1, drug2 = p.drug2;
  if (!drug1 || !drug2) throw new Error("medications_interactions requires WHERE drug1='...' AND drug2='...'");
  const res = await fetch(`${RAILWAY_BASE}/medications/interactions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ drug1, drug2 }),
  });
  if (!res.ok) throw new Error("Interactions API error");
  const data = await res.json();
  const rows = Array.isArray(data) ? data : (data.results || data.interactions || []);
  if (!rows.length) return [{ drug1, drug2, severity: "none", description: "No known interactions found", is_serious: false, source: "RxNorm" }];
  return rows.map((r) => ({ drug1, drug2, severity: r.severity || r.interactionType || "unknown", description: r.description || r.interactionComment || "", is_serious: r.is_serious ?? (r.severity === "high"), source: r.source || "RxNorm" }));
}

// ── 6. medications_label ────────────────────────────────────────────────────
async function fetchMedLabel(sql) {
  const p = parseWhere(sql, "medications_label");
  const name = p.name;
  if (!name) throw new Error("medications_label requires WHERE name='...'");
  const res = await fetch(`${RAILWAY_BASE}/medications/label?name=${encodeURIComponent(name)}`);
  if (!res.ok) throw new Error("Medication label API error");
  const data = await res.json();
  const d = Array.isArray(data) ? data[0] : data;
  if (!d) return [];
  return [{
    drug_name: d.drug_name || name,
    warnings: Array.isArray(d.warnings) ? d.warnings.join("; ") : d.warnings || "",
    dosage_and_admin: Array.isArray(d.dosage_and_admin) ? d.dosage_and_admin.join("; ") : d.dosage_and_admin || "",
    contraindications: Array.isArray(d.contraindications) ? d.contraindications.join("; ") : d.contraindications || "",
    adverse_reactions: Array.isArray(d.adverse_reactions) ? d.adverse_reactions.join("; ") : d.adverse_reactions || "",
    storage_conditions: Array.isArray(d.storage_conditions) ? d.storage_conditions.join("; ") : d.storage_conditions || "",
    drug_interactions: Array.isArray(d.drug_interactions) ? d.drug_interactions.join("; ") : d.drug_interactions || "",
    pregnancy_category: d.pregnancy_category || "",
  }];
}

// ── 7. worldbank_indicators ─────────────────────────────────────────────────
async function fetchWorldBank(sql) {
  const p = parseWhere(sql, "worldbank_indicators");
  const country = p.country || "WLD";
  const indicator = p.indicator || "SP.POP.TOTL";
  const yearFrom = p.year_from || "2015";
  const yearTo   = p.year_to   || "2023";
  const url = `${WORLDBANK}/country/${country}/indicator/${indicator}?format=json&date=${yearFrom}:${yearTo}&per_page=100`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("World Bank API error");
  const data = await res.json();
  const rows = data[1] || [];
  return rows.filter((r) => r.value !== null).map((r) => ({
    country_name: r.country?.value || country,
    country_code: r.countryiso3code || country,
    indicator_name: r.indicator?.value || indicator,
    indicator_code: r.indicator?.id || indicator,
    year: r.date,
    value: r.value,
    unit: r.unit || "",
  }));
}

// ── 8. exchange_rates ───────────────────────────────────────────────────────
async function fetchExchangeRates(sql) {
  const p = parseWhere(sql, "exchange_rates");
  const base = (p.base || p.base_currency || "USD").toUpperCase();
  const res = await fetch(`${ER_API}/${base}`);
  if (!res.ok) throw new Error("Exchange rates API error");
  const data = await res.json();
  if (data.result !== "success") throw new Error(data["error-type"] || "Exchange rates API error");
  const filterCurrency = p.currency?.toUpperCase() || null;
  const rows = Object.entries(data.rates || {})
    .filter(([cur]) => !filterCurrency || cur === filterCurrency)
    .map(([currency, rate]) => ({
      base_currency: base,
      currency,
      rate,
      last_updated: data.time_last_update_utc || "",
    }));
  return rows.sort((a, b) => a.currency.localeCompare(b.currency));
}

// ── 9. countries ────────────────────────────────────────────────────────────
async function fetchCountries(sql) {
  const p = parseWhere(sql, "countries");
  let url;
  if (p.name) url = `${REST_COUNTRIES}/name/${encodeURIComponent(p.name)}?fullText=false`;
  else if (p.region) url = `${REST_COUNTRIES}/region/${encodeURIComponent(p.region)}`;
  else if (p.subregion) url = `${REST_COUNTRIES}/subregion/${encodeURIComponent(p.subregion)}`;
  else url = `${REST_COUNTRIES}/all?fields=name,capital,region,subregion,population,area,currencies,languages,flags,timezones,idd`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Rest Countries API error");
  const data = await res.json();
  const arr = Array.isArray(data) ? data : [data];
  return arr.map((c) => {
    const currencyCode = Object.keys(c.currencies || {})[0] || "";
    const currencyInfo = c.currencies?.[currencyCode] || {};
    const langCode = Object.keys(c.languages || {})[0] || "";
    return {
      name: c.name?.common || "",
      official_name: c.name?.official || "",
      capital: (c.capital || [])[0] || "",
      region: c.region || "",
      subregion: c.subregion || "",
      population: c.population || 0,
      area_km2: c.area || 0,
      currency: currencyCode,
      currency_symbol: currencyInfo.symbol || "",
      language: c.languages?.[langCode] || langCode,
      flag_emoji: c.flags?.alt || c.flag || "",
      timezone: (c.timezones || [])[0] || "",
      calling_code: `+${(c.idd?.root || "").replace("+","")}${(c.idd?.suffixes || [])[0] || ""}`,
    };
  }).sort((a, b) => a.name.localeCompare(b.name));
}

// ── 10. fda_devices ─────────────────────────────────────────────────────────
async function fetchFdaDevices(sql) {
  const p = parseWhere(sql, "fda_devices");
  const product = p.product || "";
  const manufacturer = p.manufacturer || "";
  let search = "";
  if (product) search += `product_description:"${product}"`;
  if (manufacturer) search += (search ? "+AND+" : "") + `recalling_firm:"${manufacturer}"`;
  if (!search) search = "product_description:device";
  const url = `${FDA_API}/device/recall.json?search=${encodeURIComponent(search)}&limit=10`;
  const res = await fetch(url);
  if (!res.ok) {
    if (res.status === 404) return [];
    throw new Error("FDA Devices API error");
  }
  const data = await res.json();
  return (data.results || []).map((r) => ({
    product_description: r.product_description || "",
    reason_for_recall: r.reason_for_recall || "",
    recall_initiation_date: r.recall_initiation_date || "",
    recalling_firm: r.recalling_firm || "",
    distribution_pattern: r.distribution_pattern || "",
    classification: r.classification || "",
    status: r.status || "",
  }));
}

// ── 11. fda_food_recalls ────────────────────────────────────────────────────
async function fetchFdaFood(sql) {
  const p = parseWhere(sql, "fda_food_recalls");
  const product = p.product || "";
  const search = product ? `product_description:"${product}"` : "status:Ongoing";
  const url = `${FDA_API}/food/enforcement.json?search=${encodeURIComponent(search)}&limit=10`;
  const res = await fetch(url);
  if (!res.ok) {
    if (res.status === 404) return [];
    throw new Error("FDA Food API error");
  }
  const data = await res.json();
  return (data.results || []).map((r) => ({
    product_description: r.product_description || "",
    reason_for_recall: r.reason_for_recall || "",
    recall_initiation_date: r.recall_initiation_date || "",
    recalling_firm: r.recalling_firm || "",
    status: r.status || "",
  }));
}

// ── Dispatch table ───────────────────────────────────────────────────────────
export const OPEN_DATA_TABLES = {
  osm_places:                { label: "OSM Places",          provider: "OpenStreetMap", icon: "🗺️", color: "#16a34a", pingUrl: "https://nominatim.openstreetmap.org", columns: ["place_id","name","display_name","type","amenity","lat","lon","city","country","postcode","distance_km"] },
  osm_nearby:                { label: "OSM Nearby",          provider: "OpenStreetMap", icon: "📍", color: "#16a34a", pingUrl: "https://nominatim.openstreetmap.org", columns: ["osm_id","name","amenity","lat","lon","address","opening_hours","phone","distance_km"] },
  weather_current:           { label: "Weather Current",     provider: "Open-Meteo",    icon: "🌤️", color: "#0284c7", pingUrl: "https://api.open-meteo.com",           columns: ["city","lat","lon","temperature_c","feels_like_c","humidity_pct","wind_speed_kmh","precipitation_mm","weather_description","local_time"] },
  weather_forecast:          { label: "Weather Forecast",    provider: "Open-Meteo",    icon: "🌧️", color: "#0284c7", pingUrl: "https://api.open-meteo.com",           columns: ["date","temp_max_c","temp_min_c","precipitation_mm","weather_description"] },
  medications_api:           { label: "Medications Search",  provider: "Railway API",   icon: "💊", color: "#7c3aed", pingUrl: "https://newsconseenwebapp-production.up.railway.app", columns: ["rxcui","name","synonym","tty_label","is_generic","is_branded"] },
  medications_recalls:       { label: "Med Recalls",         provider: "Railway API",   icon: "⚠️", color: "#7c3aed", pingUrl: "https://newsconseenwebapp-production.up.railway.app", columns: ["product_description","reason_for_recall","status","recall_initiation_date","recalling_firm","is_active"] },
  medications_interactions:  { label: "Drug Interactions",   provider: "Railway API",   icon: "🔬", color: "#7c3aed", pingUrl: "https://newsconseenwebapp-production.up.railway.app", columns: ["drug1","drug2","severity","description","is_serious","source"] },
  medications_label:         { label: "Drug Label",          provider: "Railway API",   icon: "📋", color: "#7c3aed", pingUrl: "https://newsconseenwebapp-production.up.railway.app", columns: ["drug_name","warnings","dosage_and_admin","contraindications","adverse_reactions","storage_conditions","drug_interactions","pregnancy_category"] },
  fda_devices:               { label: "FDA Devices",         provider: "OpenFDA",       icon: "⚕️", color: "#dc2626", pingUrl: "https://api.fda.gov",                 columns: ["product_description","reason_for_recall","recall_initiation_date","recalling_firm","distribution_pattern","classification","status"] },
  fda_food_recalls:          { label: "FDA Food Recalls",    provider: "OpenFDA",       icon: "🍎", color: "#dc2626", pingUrl: "https://api.fda.gov",                 columns: ["product_description","reason_for_recall","recall_initiation_date","recalling_firm","status"] },
  worldbank_indicators:      { label: "World Bank",          provider: "World Bank",    icon: "🌍", color: "#ca8a04", pingUrl: "https://api.worldbank.org",            columns: ["country_name","country_code","indicator_name","indicator_code","year","value","unit"] },
  exchange_rates:            { label: "Exchange Rates",      provider: "Open ER-API",   icon: "💱", color: "#15803d", pingUrl: "https://open.er-api.com",              columns: ["base_currency","currency","rate","last_updated"] },
  countries:                 { label: "Countries",           provider: "RestCountries", icon: "🏳️", color: "#0891b2", pingUrl: "https://restcountries.com",            columns: ["name","official_name","capital","region","subregion","population","area_km2","currency","currency_symbol","language","flag_emoji","timezone","calling_code"] },
};

export const OPEN_DATA_PROVIDERS = [
  {
    key: "OpenStreetMap",
    label: "🗺️ OpenStreetMap (Free)",
    tables: ["osm_places", "osm_nearby"],
  },
  {
    key: "Open-Meteo",
    label: "🌤️ Open-Meteo Weather (Free)",
    tables: ["weather_current", "weather_forecast"],
  },
  {
    key: "Medications",
    label: "💊 Medications / FDA (Free)",
    tables: ["medications_api", "medications_recalls", "medications_interactions", "medications_label", "fda_devices", "fda_food_recalls"],
  },
  {
    key: "WorldData",
    label: "🌍 World Data (Free)",
    tables: ["worldbank_indicators", "countries", "exchange_rates"],
  },
];

// ── Main dispatch function ────────────────────────────────────────────────────
export async function fetchOpenDataTable(tableName, sql) {
  switch (tableName) {
    case "osm_places":               return fetchOsmPlaces(sql);
    case "osm_nearby":               return fetchOsmNearby(sql);
    case "weather_current":          return fetchWeatherCurrent(sql);
    case "weather_forecast":         return fetchWeatherForecast(sql);
    case "medications_interactions": return fetchMedInteractions(sql);
    case "medications_label":        return fetchMedLabel(sql);
    case "worldbank_indicators":     return fetchWorldBank(sql);
    case "exchange_rates":           return fetchExchangeRates(sql);
    case "countries":                return fetchCountries(sql);
    case "fda_devices":              return fetchFdaDevices(sql);
    case "fda_food_recalls":         return fetchFdaFood(sql);
    default: return null;
  }
}

// ── API status ping ───────────────────────────────────────────────────────────
const _pingCache = {};
export async function pingApiStatus(url) {
  if (_pingCache[url] !== undefined) return _pingCache[url];
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 3000);
    const res = await fetch(url, { method: "HEAD", signal: ctrl.signal, mode: "no-cors" });
    clearTimeout(t);
    _pingCache[url] = true;
    return true;
  } catch {
    _pingCache[url] = false;
    return false;
  }
}