/**
 * IntelligenceHub — ontology-grounded market intelligence for SMEs.
 *
 * All data comes from python_layer (Layer 2):
 *   /market/my-enterprises         → own enterprises from analytics.enterprise_summary
 *   /market/nearby                 → OSM competitor locations (Overpass API)
 *   /market/ml/*                   → ML models (segmentation, staffing, price, churn, demand)
 *   /market/economic-context       → World Bank macroeconomic data
 *   /market/labor-context          → ILO labor data
 *   /market/apis-catalog           → 50 free API catalog
 *   /market/industry-news          → Hacker News / NewsAPI
 *
 * Ontology objects in use:
 *   Enterprise   → own locations + competitor locations
 *   Person       → segmentation, churn risk, staffing
 *   Product      → price positioning, product segmentation
 *   Task         → staffing gap analysis
 *   Transaction  → demand forecasting, brand awareness
 *   Address      → geocoding, service gap detection
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { ncClient } from "@/api/ncClient";
import { MapContainer, TileLayer, Marker, Popup, Circle } from "react-leaflet";
import L from "leaflet";
import {
  Building2, Users, Package, CheckSquare, Receipt, MapPin,
  TrendingUp, Search, RefreshCw, Globe, Zap, BarChart2,
  AlertTriangle, ChevronRight, Info, Layers, ExternalLink,
  Star, ShieldAlert, Target, Activity, Filter, Play,
  CheckCircle2, XCircle, Loader2, DollarSign, Newspaper, PieChart as PieIcon,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, RadarChart, Radar, PolarGrid, PolarAngleAxis,
} from "recharts";
import { fetchPeopleFallback, fetchEnterprisesFallback } from "@/utils/fetchWithFallback";
import { useEntityListFn } from "@/components/shared/useDataQuery";

const RAILWAY_URL = "https://newsconseenwebapp-production.up.railway.app";
const RAILWAY_API_KEY = (import.meta["env"] || {})["VITE_RAILWAY_API_KEY"] || "";
const API_HEADERS = {
  "Content-Type": "application/json",
  ...(RAILWAY_API_KEY ? { "x-api-key": RAILWAY_API_KEY } : {}),
};

// ── Leaflet icons ────────────────────────────────────────────────────────────
// Fix default marker icon broken by webpack
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl:       "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl:     "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

function makeIcon(color, size = 24) {
  return L.divIcon({
    className: "",
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.35)"></div>`,
    iconSize:   [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor:[0, -size / 2],
  });
}

const OWN_ICON        = makeIcon("#10b981", 26);  // emerald — own enterprises
const COMPETITOR_ICON = makeIcon("#f43f5e", 18);   // rose    — OSM competitors

// ── Ontology type colour map ─────────────────────────────────────────────────
const ENT_TYPE_COLORS = {
  commercial: "#f59e0b", nonprofit: "#8b5cf6", government: "#3b82f6",
  healthcare: "#ef4444", education: "#06b6d4", cooperative: "#22c55e",
  trust:      "#6366f1",
};

function entTypeColor(t) { return ENT_TYPE_COLORS[t] || "#94a3b8"; }

// ── Fetch helper ─────────────────────────────────────────────────────────────
async function apiFetch(path, opts = {}) {
  const res = await fetch(`${RAILWAY_URL}${path}`, {
    ...opts,
    headers: { ...API_HEADERS, ...(opts.headers || {}) },
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

// ── Stat card ────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, icon: Icon, color = "text-slate-700", bg = "bg-slate-50" }) {
  return (
    <div className={`${bg} rounded-2xl p-4 border border-slate-200`}>
      <div className="flex items-center gap-2 mb-1">
        {Icon && <Icon className={`w-4 h-4 ${color}`} />}
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</p>
      </div>
      <p className={`text-2xl font-black ${color}`}>{value ?? "—"}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}

// ── Section header ───────────────────────────────────────────────────────────
function SectionHeader({ icon: Icon, title, sub, badge }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4 text-slate-600" />
      </div>
      <div>
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-bold text-slate-800">{title}</h2>
          {badge && <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded-full font-semibold">{badge}</span>}
        </div>
        {sub && <p className="text-xs text-slate-500">{sub}</p>}
      </div>
    </div>
  );
}

// ── ML Run button + result panel ─────────────────────────────────────────────
function MLPanel({ title, description, endpoint, body, onResult, resultRenderer, actionPrompt }) {
  const [loading, setLoading]   = useState(false);
  const [result, setResult]     = useState(null);
  const [error, setError]       = useState(null);
  const [acted, setActed]       = useState(false);
  const [acting, setActing]     = useState(false);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch(endpoint, {
        method: "POST",
        body:   JSON.stringify(body),
      });
      setResult(data);
      if (onResult) onResult(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  const handleAct = async () => {
    if (!result || acted) return;
    const prompt = actionPrompt
      ? (typeof actionPrompt === "function" ? actionPrompt(result) : actionPrompt)
      : `Based on the ${title} analysis, I want to take action on these findings.`;
    const companyId = body?.company_id;
    if (!companyId) return;
    setActing(true);
    try {
      await ncClient.entities.Task.create({
        title:       `Action: ${title}`,
        description: prompt,
        task_type:   "strategic_review",
        status:      "open",
        priority:    "medium",
        company_id:  companyId,
      });
      setActed(true);
    } catch (_) {
      // best-effort — don't block the UI
    } finally {
      setActing(false);
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4">
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-sm font-bold text-slate-800">{title}</p>
          <p className="text-xs text-slate-500 mt-0.5">{description}</p>
        </div>
        <div className="flex items-center gap-2 ml-3">
          {result && (
            <button
              onClick={handleAct}
              disabled={acting || acted || !body?.company_id}
              className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg shrink-0 transition-colors disabled:cursor-not-allowed
                ${acted
                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                  : "bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50"}`}
              title={acted ? "Task created" : "Create a task from this insight"}
            >
              {acting
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : acted
                  ? <CheckCircle2 className="w-3.5 h-3.5" />
                  : <Zap className="w-3.5 h-3.5" />}
              {acted ? "Done" : "Act"}
            </button>
          )}
          <button
            onClick={run}
            disabled={loading}
            className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg shrink-0 disabled:opacity-50 transition-colors"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
            Run
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
          <XCircle className="w-3.5 h-3.5 shrink-0" /> {error}
        </div>
      )}

      {result && resultRenderer && resultRenderer(result)}
    </div>
  );
}

// ── Segment badge ─────────────────────────────────────────────────────────────
const SEGMENT_COLORS = {
  high_value: "bg-emerald-50 text-emerald-700 border-emerald-200",
  mid_value:  "bg-amber-50 text-amber-700 border-amber-200",
  low_engagement: "bg-rose-50 text-rose-700 border-rose-200",
  premium:    "bg-violet-50 text-violet-700 border-violet-200",
  mid_range:  "bg-blue-50 text-blue-700 border-blue-200",
  value:      "bg-amber-50 text-amber-700 border-amber-200",
  budget:     "bg-slate-50 text-slate-600 border-slate-200",
  high:       "bg-rose-50 text-rose-700 border-rose-200",
  medium:     "bg-amber-50 text-amber-700 border-amber-200",
  low:        "bg-emerald-50 text-emerald-700 border-emerald-200",
};
function SegBadge({ label }) {
  const cls = SEGMENT_COLORS[label] || "bg-slate-50 text-slate-600 border-slate-200";
  return <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${cls}`}>{label}</span>;
}

// ── Tab component ─────────────────────────────────────────────────────────────
const TABS = [
  { id: "map",          label: "Competitor Map",    icon: MapPin     },
  { id: "ml",           label: "Market ML",         icon: Zap        },
  { id: "demographics", label: "Demographics",      icon: PieIcon    },
  { id: "staffing",     label: "Staffing Intel",    icon: Users      },
  { id: "products",     label: "Product Intel",     icon: Package    },
  { id: "economic",     label: "Economic Context",  icon: Globe      },
  { id: "news",         label: "Industry News",     icon: Newspaper  },
  { id: "apis",         label: "API Catalog",       icon: Layers     },
];

const PIE_COLORS = ["#10b981","#3b82f6","#f59e0b","#f43f5e","#8b5cf6","#06b6d4","#ec4899"];

// ────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ────────────────────────────────────────────────────────────────────────────
export default function IntelligenceHub({ currentUser, enrichedCoords = {} }) {
  const [activeTab, setActiveTab] = useState("map");

  // State
  const [myEnterprises, setMyEnterprises]   = useState([]);
  const [competitors, setCompetitors]        = useState([]);
  const [selectedEnterprise, setSelected]    = useState(null);
  const [radiusKm, setRadiusKm]              = useState(2);
  const [typeFilter, setTypeFilter]          = useState("");
  const [loading, setLoading]               = useState(false);
  const [economic, setEconomic]             = useState(null);
  const [labor, setLabor]                   = useState(null);
  const [news, setNews]                     = useState(null);
  const [newsQuery, setNewsQuery]           = useState("");
  const [apisCatalog, setApisCatalog]       = useState(null);
  const [apiCatFilter, setApiCatFilter]     = useState("all");
  const [scoredCompetitors, setScoredCompetitors] = useState([]);
  const [demoData, setDemoData]                   = useState(null);
  const [demoLoading, setDemoLoading]             = useState(false);
  const [localNewsQuery, setLocalNewsQuery]       = useState("");

  const companyId = currentUser?.company_id;
  const listFn = useEntityListFn(currentUser);
  const [manualLat, setManualLat] = useState("");
  const [manualLng, setManualLng] = useState("");
  const [geocoding, setGeocoding] = useState(false);

  // ── Nominatim geocode helper ─────────────────────────────────────────────
  async function geocodeAddress(query) {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`,
        { headers: { "User-Agent": "newsconseen-app/1.0" } }
      );
      const hits = await res.json();
      if (hits?.length) return { lat: parseFloat(hits[0].lat), lng: parseFloat(hits[0].lon) };
    } catch (_) {}
    return null;
  }

  // ── Normalize a Base44 enterprise record to match python_layer shape ─────
  function normalizeEnterprise(e) {
    return {
      id:               e.id,
      enterprise_name:  e.enterprise_name || e.name || "Unnamed",
      enterprise_type:  e.enterprise_type,
      enterprise_tier:  e.enterprise_tier,
      operating_status: e.operating_status,
      status:           e.status,
      city:             e.city,
      region:           e.region,
      country:          e.country,
      latitude:         e.latitude  || null,
      longitude:        e.longitude || null,
      _needsGeocode:    !e.latitude || !e.longitude,
    };
  }

  // Load own enterprises — python_layer first, then Base44 live fallback
  useEffect(() => {
    if (!companyId) return;
    (async () => {
      // Try python_layer
      try {
        const d = await apiFetch(`/market/my-enterprises?company_id=${companyId}`);
        const ents = d.enterprises || [];
        if (ents.length > 0) {
          // Also include any that have no coordinates — python_layer filters them out
          // so merge with Base44 to catch the ones it dropped
          let all = [...ents];
          try {
            const b44 = await listFn(ncClient.entities.Enterprise);
            b44.forEach(e => {
              if (!all.find(a => a.id === e.id)) all.push(normalizeEnterprise(e));
            });
          } catch (_) {}
          setMyEnterprises(all);
          return;
        }
      } catch (_) {}
      // Full Base44 fallback
      try {
        const b44 = await listFn(ncClient.entities.Enterprise);
        setMyEnterprises(b44.map(normalizeEnterprise));
      } catch (_) {}
    })();
  }, [companyId]);

  // Enrich enterprises missing coordinates from linked Address relationships
  useEffect(() => {
    if (!myEnterprises.length || !companyId) return;
    const stillMissing = myEnterprises.filter(e => !e.latitude || !e.longitude);
    if (!stillMissing.length) return;
    (async () => {
      try {
        // Fetch enterprise_address relationships + addresses in parallel
        const [rels, addrs] = await Promise.all([
          listFn(ncClient.entities.Relationship),
          listFn(ncClient.entities.Address),
        ]);

        // Build address lookup by label AND address_line1 (Relationships store location as text, not ID)
        const addrByLabel = new Map();
        addrs.forEach(a => {
          if (a.label)         addrByLabel.set(a.label.toLowerCase().trim(), a);
          if (a.address_line1) addrByLabel.set(a.address_line1.toLowerCase().trim(), a);
        });

        // Build enterprise → address coords map via enterprise_address relationships
        // Relationships store location as a text string matching addr.label / addr.address_line1
        const enterpriseCoords = new Map();
        rels
          .filter(r => r.relationship_type === "enterprise_address" && r.status !== "ended")
          .forEach(r => {
            const entKey = r.enterprise_name;
            const locKey = (r.location || "").toLowerCase().trim();
            if (!entKey || !locKey) return;
            const addr = addrByLabel.get(locKey);
            if (!addr?.latitude || !addr?.longitude) return;
            if (!enterpriseCoords.has(entKey)) {
              enterpriseCoords.set(entKey, { latitude: parseFloat(addr.latitude), longitude: parseFloat(addr.longitude) });
            }
          });

        if (!enterpriseCoords.size) return;

        const updated = myEnterprises.map(ent => {
          if (ent.latitude && ent.longitude) return ent;
          // Keys are enterprise_name strings — ID lookup never matches, name lookup is correct
          const coords = enterpriseCoords.get(ent.enterprise_name);
          if (!coords) return ent;
          return { ...ent, latitude: coords.latitude, longitude: coords.longitude, _needsGeocode: false, _coordSource: "address_relationship" };
        });

        setMyEnterprises(updated);
      } catch (_) {}
    })();
  }, [myEnterprises.length, companyId]);

  // Auto-geocode enterprises still missing coordinates using city/country (Nominatim fallback)
  useEffect(() => {
    if (!myEnterprises.length) return;
    const missing = myEnterprises.filter(e => e._needsGeocode);
    if (!missing.length) return;
    (async () => {
      const updated = [...myEnterprises];
      for (const ent of missing) {
        const query = [ent.enterprise_name, ent.city, ent.region, ent.country].filter(Boolean).join(", ");
        const coords = await geocodeAddress(query);
        if (coords) {
          const idx = updated.findIndex(e => e.id === ent.id);
          if (idx !== -1) {
            updated[idx] = { ...updated[idx], latitude: coords.lat, longitude: coords.lng, _needsGeocode: false };
          }
        }
      }
      setMyEnterprises(updated);
    })();
  }, [myEnterprises.length]);

  // Apply parent-supplied coord hints (from MarketIntelligence enterpriseCoords + nominatimCoords)
  // whenever enrichedCoords changes. This handles the case where parent resolves coords after
  // IntelligenceHub's own enterprise load has already run.
  useEffect(() => {
    if (!myEnterprises.length) return;
    const entries = Object.entries(enrichedCoords);
    if (!entries.length) return;
    let changed = false;
    const updated = /** @type {any[]} */ (myEnterprises).map(ent => {
      if (ent.latitude && ent.longitude) return ent;
      const match = entries.find(([k]) => k === ent.enterprise_name);
      if (!match) return ent;
      const hint = match[1];
      if (!hint || !hint.latitude || !hint.longitude) return ent;
      changed = true;
      return { ...ent, latitude: hint.latitude, longitude: hint.longitude, _needsGeocode: false, _coordSource: "parent" };
    });
    if (changed) setMyEnterprises(updated);
  }, [enrichedCoords]); // eslint-disable-line react-hooks/exhaustive-deps

  // Geocode selected enterprise on-demand if still missing coords
  async function ensureCoords(ent) {
    if (ent?.latitude && ent?.longitude) return ent;
    // Try manual input first
    const lat = parseFloat(manualLat);
    const lng = parseFloat(manualLng);
    if (!isNaN(lat) && !isNaN(lng)) return { ...ent, latitude: lat, longitude: lng };
    // Try Nominatim — use all available fields; fall back to name only
    if (ent?.enterprise_name || ent?.city || ent?.country) {
      setGeocoding(true);
      const query = [ent?.enterprise_name, ent?.city, ent?.region, ent?.country].filter(Boolean).join(", ");
      const coords = await geocodeAddress(query);
      setGeocoding(false);
      if (coords) {
        const enriched = { ...ent, latitude: coords.lat, longitude: coords.lng, _needsGeocode: false };
        setMyEnterprises(prev => prev.map(e => e.id === ent.id ? enriched : e));
        return enriched;
      }
    }
    return null;
  }

  // Load nearby competitors when an enterprise is selected
  const loadCompetitors = useCallback(async (ent) => {
    const located = await ensureCoords(ent);
    if (!located?.latitude || !located?.longitude) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        lat: located.latitude, lng: located.longitude,
        radius_km: radiusKm,
        ...(typeFilter ? { enterprise_type: typeFilter } : {}),
        ...(companyId ? { company_id: companyId } : {}),
        limit: 100,
      });
      const data = await apiFetch(`/market/nearby?${params}`);
      setCompetitors(data.businesses || []);

      // Score them
      const scored = await apiFetch("/market/ml/competitor-score", {
        method: "POST",
        body: JSON.stringify({
          company_id: companyId,
          options: {
            competitors: data.businesses || [],
            enterprise_type: located.enterprise_type,
            lat: located.latitude,
            lng: located.longitude,
            radius_km: radiusKm,
          },
        }),
      });
      setScoredCompetitors(scored.competitors || []);
    } catch (e) {
      setCompetitors([]);
    } finally {
      setLoading(false);
    }
  }, [radiusKm, typeFilter, companyId]);

  useEffect(() => {
    if (selectedEnterprise) loadCompetitors(selectedEnterprise);
  }, [selectedEnterprise, loadCompetitors]);

  // Economic context
  // ── Load demographics (three-tier fallback) ──────────────────────────────
  useEffect(() => {
    if (activeTab !== "demographics" || !companyId || demoData) return;
    setDemoLoading(true);
    (async () => {
      try {
        const [peopleResult, entResult] = await Promise.all([
          fetchPeopleFallback(companyId, () => ncClient.entities.Person.filter({ company_id: companyId })),
          fetchEnterprisesFallback(companyId, () => ncClient.entities.Enterprise.filter({ company_id: companyId })),
        ]);

        const people = peopleResult.data;
        const enterprises = entResult.data;

        // Person type breakdown (staff / client / contact / volunteer)
        const byType = {};
        people.forEach(p => {
          const t = p.person_type || "unknown";
          byType[t] = (byType[t] || 0) + (peopleResult.source === "analytics" ? (p.people_count || p.total_count || 1) : 1);
        });

        // Status breakdown (active / inactive / on_leave)
        const byStatus = {};
        if (peopleResult.source === "analytics") {
          people.forEach(p => {
            const s = p.status || "unknown";
            byStatus[s] = (byStatus[s] || 0) + (p.active_count || p.people_count || 1);
          });
        } else {
          people.forEach(p => {
            const s = p.status || "unknown";
            byStatus[s] = (byStatus[s] || 0) + 1;
          });
        }

        // Enterprise type breakdown
        const entByType = {};
        enterprises.forEach(e => {
          const t = e.enterprise_type || "unknown";
          entByType[t] = (entByType[t] || 0) + (entResult.source === "analytics" ? (e.enterprise_count || 1) : 1);
        });

        // Enterprise status breakdown
        const entByStatus = {};
        enterprises.forEach(e => {
          const s = e.operating_status || e.status || "unknown";
          entByStatus[s] = (entByStatus[s] || 0) + 1;
        });

        // Engagement model breakdown (employed / contracted / freelance / volunteer / enrolled / subscribed)
        const byEngagement = {};
        if (peopleResult.source !== "analytics") {
          people.forEach(p => {
            if (p.engagement_model) {
              byEngagement[p.engagement_model] = (byEngagement[p.engagement_model] || 0) + 1;
            }
          });
        }

        setDemoData({
          people,
          enterprises,
          byType,
          byStatus,
          byEngagement,
          entByType,
          entByStatus,
          totalPeople: Object.values(byType).reduce((a, b) => a + b, 0),
          totalEnterprises: Object.values(entByType).reduce((a, b) => a + b, 0),
          dataTier: peopleResult.tier,
          dataSource: peopleResult.source,
        });
      } catch (_) {}
      setDemoLoading(false);
    })();
  }, [activeTab, companyId, demoData]);

  useEffect(() => {
    if (activeTab !== "economic") return;
    const country = currentUser?.country_code || "ZA";
    apiFetch(`/market/economic-context?country_code=${country}&company_id=${companyId}`)
      .then(setEconomic).catch(() => {});
    apiFetch(`/market/labor-context?country_code=${country}&company_id=${companyId}`)
      .then(setLabor).catch(() => {});
  }, [activeTab, companyId, currentUser?.country_code]);

  // APIs catalog
  useEffect(() => {
    if (activeTab !== "apis" || apisCatalog) return;
    apiFetch("/market/apis-catalog").then(setApisCatalog).catch(() => {});
  }, [activeTab, apisCatalog]);

  // Map centre — use selected enterprise, first geocoded enterprise, or world centre
  const mapCenter = selectedEnterprise?.latitude
    ? [parseFloat(selectedEnterprise.latitude), parseFloat(selectedEnterprise.longitude)]
    : myEnterprises.find(e => e.latitude)?.latitude
    ? [parseFloat(myEnterprises.find(e => e.latitude).latitude), parseFloat(myEnterprises.find(e => e.latitude).longitude)]
    : [20, 0]; // world centre — works for any country

  const isSuperAdmin = currentUser?.role === "super_admin";

  // ── Tab: Map ──────────────────────────────────────────────────────────────
  const MapTab = () => (
    <div className="space-y-4">
      <SectionHeader
        icon={MapPin}
        title="Competitor Map"
        sub="Your enterprises vs nearby businesses from OpenStreetMap — filtered by ontology enterprise_type"
        badge="OSM Overpass"
      />

      {/* Controls */}
      <div className="flex flex-wrap gap-3 items-center bg-slate-50 border border-slate-200 rounded-xl p-3">
        {/* Enterprise selector */}
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Your Enterprise</label>
          <select
            className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white"
            value={selectedEnterprise?.id || ""}
            onChange={e => {
              const ent = myEnterprises.find(x => x.id === e.target.value);
              setSelected(ent || null);
            }}
          >
            <option value="">— Select enterprise —</option>
            {myEnterprises.map(e => (
              <option key={e.id} value={e.id}>
                {e.enterprise_name}
                {e.enterprise_type ? ` (${e.enterprise_type})` : ""}
                {!e.latitude ? " 📍?" : ""}
              </option>
            ))}
          </select>
        </div>

        {/* Radius */}
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Radius</label>
          <select
            className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white"
            value={radiusKm}
            onChange={e => setRadiusKm(Number(e.target.value))}
          >
            {[0.5,1,2,3,5,10].map(r => <option key={r} value={r}>{r} km</option>)}
          </select>
        </div>

        {/* Enterprise type filter */}
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Filter by Type</label>
          <select
            className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white"
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
          >
            <option value="">All types</option>
            {["commercial","nonprofit","government","healthcare","education","cooperative","trust"].map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>

        {selectedEnterprise && (
          <button
            onClick={() => loadCompetitors(selectedEnterprise)}
            disabled={loading}
            className="flex items-center gap-1.5 bg-slate-800 text-white text-xs font-semibold px-3 py-1.5 rounded-lg mt-4 disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
            Refresh
          </button>
        )}
      </div>

      {myEnterprises.length === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-800 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">No enterprises found.</p>
            <p className="mt-0.5">Go to <strong>Enterprises</strong> and create your first enterprise record. Once saved it will appear here automatically. Adding a city or country enables automatic geocoding.</p>
          </div>
        </div>
      )}

      {/* Manual coordinates fallback — shown when selected enterprise has no geocoords yet */}
      {selectedEnterprise && !selectedEnterprise.latitude && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 space-y-2">
          <p className="text-xs font-semibold text-blue-800 flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5" />
            {geocoding ? "Geocoding from city/country…" : "No coordinates on this enterprise — enter them manually or we'll try to geocode from city/country."}
          </p>
          {!geocoding && (
            <div className="flex items-center gap-2 flex-wrap">
              <input
                type="number" step="any" placeholder="Latitude (e.g. 43.66)"
                value={manualLat}
                onChange={e => setManualLat(e.target.value)}
                className="text-xs border border-blue-300 rounded-lg px-2 py-1.5 w-36 bg-white"
              />
              <input
                type="number" step="any" placeholder="Longitude (e.g. -70.26)"
                value={manualLng}
                onChange={e => setManualLng(e.target.value)}
                className="text-xs border border-blue-300 rounded-lg px-2 py-1.5 w-36 bg-white"
              />
              <button
                onClick={() => loadCompetitors(selectedEnterprise)}
                disabled={(!manualLat || !manualLng) && !selectedEnterprise.city}
                className="text-xs bg-blue-700 text-white font-semibold px-3 py-1.5 rounded-lg disabled:opacity-40"
              >
                Search this location
              </button>
            </div>
          )}
        </div>
      )}

      {/* Stats */}
      {selectedEnterprise && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Nearby Businesses" value={competitors.length} icon={Building2} color="text-slate-700" />
          <StatCard label="High Threat" value={scoredCompetitors.filter(c => c.threat_level === "high").length} icon={ShieldAlert} color="text-rose-600" bg="bg-rose-50" />
          <StatCard label="Same Industry" value={competitors.filter(c => c.enterprise_type === selectedEnterprise?.enterprise_type).length} icon={Target} color="text-violet-600" bg="bg-violet-50" />
          <StatCard label="Radius" value={`${radiusKm} km`} icon={Activity} color="text-blue-600" bg="bg-blue-50" />
        </div>
      )}

      {/* Map */}
      <div className="h-[420px] rounded-2xl overflow-hidden border border-slate-200">
        <MapContainer center={mapCenter} zoom={selectedEnterprise ? 14 : 6} style={{ height: "100%", width: "100%" }}>
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          />

          {/* Own enterprises */}
          {myEnterprises.filter(e => e.latitude && e.longitude).map(e => (
            <Marker
              key={e.id}
              position={[parseFloat(e.latitude), parseFloat(e.longitude)]}
              icon={OWN_ICON}
              eventHandlers={{ click: () => setSelected(e) }}
            >
              <Popup>
                <div className="text-xs space-y-1 min-w-[160px]">
                  <p className="font-bold text-slate-800">{e.enterprise_name}</p>
                  <p className="text-emerald-700 font-semibold">✅ Your Enterprise</p>
                  {e.enterprise_type && <p className="text-slate-500">Type: {e.enterprise_type}</p>}
                  {e.enterprise_tier && <p className="text-slate-500">Tier: {e.enterprise_tier}</p>}
                  {e.operating_status && <p className="text-slate-500">Status: {e.operating_status}</p>}
                </div>
              </Popup>
            </Marker>
          ))}

          {/* Radius circle */}
          {selectedEnterprise?.latitude && (
            <Circle
              center={[parseFloat(selectedEnterprise.latitude), parseFloat(selectedEnterprise.longitude)]}
              radius={radiusKm * 1000}
              pathOptions={{ color: "#10b981", fillColor: "#10b981", fillOpacity: 0.05, weight: 1.5 }}
            />
          )}

          {/* Competitors */}
          {(scoredCompetitors.length ? scoredCompetitors : competitors).map((c, i) => {
            const color = c.threat_level === "high" ? "#f43f5e" : c.threat_level === "medium" ? "#f59e0b" : "#64748b";
            const icon  = makeIcon(color, 16);
            return (
              <Marker key={c.osm_id || i} position={[c.lat, c.lng]} icon={icon}>
                <Popup>
                  <div className="text-xs space-y-1 min-w-[160px]">
                    <p className="font-bold text-slate-800">{c.name}</p>
                    <p style={{ color }} className="font-semibold capitalize">
                      {c.threat_level ? `${c.threat_level} threat` : "Competitor"}
                    </p>
                    {c.enterprise_type && <p className="text-slate-500 capitalize">Industry: {c.enterprise_type}</p>}
                    <p className="text-slate-500">{c.distance_km} km away</p>
                    {c.threat_score != null && <p className="text-slate-500">Threat score: {c.threat_score}/100</p>}
                    {c.address && <p className="text-slate-400">{c.address}</p>}
                    {c.phone && <p className="text-slate-400">{c.phone}</p>}
                    {c.website && (
                      <a href={c.website} target="_blank" rel="noreferrer" className="text-blue-600 underline">Website</a>
                    )}
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>
      </div>

      {/* Competitor table */}
      {scoredCompetitors.length > 0 && (
        <div>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Nearby Competitors — Scored by Threat</p>
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-xs">
              <thead className="bg-slate-50">
                <tr>
                  {["Name","Industry","Distance","Threat","Type Match","Score"].map(h => (
                    <th key={h} className="text-left text-[10px] font-bold text-slate-500 uppercase tracking-wide px-3 py-2">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {scoredCompetitors.slice(0, 20).map((c, i) => (
                  <tr key={i} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-2 font-medium text-slate-800 max-w-[140px] truncate">{c.name}</td>
                    <td className="px-3 py-2 text-slate-600 capitalize">{c.enterprise_type}</td>
                    <td className="px-3 py-2 text-slate-600">{c.distance_km} km</td>
                    <td className="px-3 py-2"><SegBadge label={c.threat_level || "low"} /></td>
                    <td className="px-3 py-2">{c.type_match ? "✅" : "—"}</td>
                    <td className="px-3 py-2 font-bold text-slate-700">{c.threat_score}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );

  // ── Tab: ML ───────────────────────────────────────────────────────────────
  const [researchMode, setResearchMode] = useState(false);

  const MLTab = () => (
    <div className="space-y-4">
      <SectionHeader
        icon={Zap}
        title="Market ML Models"
        sub="Machine learning analysis grounded in your ontology data — all computed in python_layer"
        badge="scikit-learn"
      />

      {/* Research Mode toggle */}
      <div className="flex items-center justify-between bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-3">
        <div>
          <p className="text-xs font-semibold text-indigo-800">Research Mode</p>
          <p className="text-[10px] text-indigo-600 mt-0.5">
            Enables ML models on sparse or synthetic datasets. Results are illustrative projections, not statistically validated predictions.
          </p>
        </div>
        <button
          onClick={() => setResearchMode(v => !v)}
          className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors ${researchMode ? "bg-indigo-600" : "bg-slate-300"}`}
        >
          <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${researchMode ? "translate-x-4" : "translate-x-0"}`} />
        </button>
      </div>

      {researchMode && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2 text-xs text-amber-800 flex items-center gap-2">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          Research mode active — models will produce illustrative projections. Label all outputs accordingly in reports.
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Customer segmentation */}
        <MLPanel
          title="Customer Segmentation"
          description="KMeans clustering of your clients by tenure, revenue, and activity (Person ontology)"
          endpoint="/market/ml/segment"
          body={{ company_id: companyId, options: { object_type: "Person", n_clusters: 3, research_mode: researchMode } }}
          actionPrompt={r => {
            const seg = r?.segment_summary?.[0];
            return seg
              ? `Create a follow-up task for the ${seg.segment} client segment (${seg.group_count} groups, LTV: ${seg.estimated_ltv || "unknown"}). Focus on retention and upsell opportunities.`
              : "Create follow-up tasks for each client segment identified in the customer segmentation analysis.";
          }}
          resultRenderer={r => r.segments?.length ? (
            <div className="mt-3 space-y-2">
              <p className="text-[10px] font-bold text-slate-500 uppercase">Segment Summary</p>
              <div className="flex flex-wrap gap-2">
                {(r.segment_summary || []).map((s, i) => (
                  <div key={i} className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs">
                    <SegBadge label={s.segment} />
                    <p className="mt-1 font-bold text-slate-700">{s.group_count} groups</p>
                    {s.total_revenue_per_client != null && <p className="text-slate-500">Rev/client: ${s.total_revenue_per_client}</p>}
                    {s.estimated_ltv != null && <p className="text-slate-500">LTV: {s.estimated_ltv}</p>}
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-slate-400">Features: {r.features_used?.join(", ")}</p>
            </div>
          ) : <p className="text-xs text-slate-400 mt-2">{r.reason || "No segments returned"}</p>}
        />

        {/* Product segmentation */}
        <MLPanel
          title="Product Segmentation"
          description="Segment products by price, cost, and stock level (Product ontology)"
          endpoint="/market/ml/segment"
          body={{ company_id: companyId, options: { object_type: "Product", n_clusters: 3, research_mode: researchMode } }}
          resultRenderer={r => r.segments?.length ? (
            <div className="mt-3 space-y-2">
              <p className="text-[10px] font-bold text-slate-500 uppercase">Product Segments</p>
              <div className="flex flex-wrap gap-2">
                {(r.summary || []).map((s, i) => (
                  <div key={i} className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs">
                    <SegBadge label={s.segment} />
                    <p className="mt-1 font-bold text-slate-700">{s.count} products</p>
                    {s.avg_price != null && <p className="text-slate-500">Avg price: {s.avg_price}</p>}
                  </div>
                ))}
              </div>
            </div>
          ) : <p className="text-xs text-slate-400 mt-2">{r.reason || "No product data"}</p>}
        />

        {/* Geographic segmentation */}
        <MLPanel
          title="Geographic Segmentation"
          description="KMeans clustering of enterprise locations into market zones (Enterprise + Address)"
          endpoint="/market/ml/segment"
          body={{ company_id: companyId, options: { object_type: "Geography", n_clusters: 3, research_mode: researchMode } }}
          resultRenderer={r => r.segments?.length ? (
            <div className="mt-3 space-y-2">
              <p className="text-[10px] font-bold text-slate-500 uppercase">Geographic Zones</p>
              {(r.cluster_centers || []).map((c, i) => (
                <div key={i} className="text-xs text-slate-600 flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-[10px]">{i+1}</span>
                  Zone {i+1}: lat {c.lat?.toFixed(3)}, lng {c.lng?.toFixed(3)}
                </div>
              ))}
            </div>
          ) : <p className="text-xs text-slate-400 mt-2">{r.reason || "Add geocoords to enterprises first"}</p>}
        />

        {/* Demand forecast */}
        <MLPanel
          title="Demand Forecasting"
          description="Linear regression forecast of next 3 months' revenue (Transaction ontology)"
          endpoint="/market/ml/demand-forecast"
          body={{ company_id: companyId, options: {} }}
          actionPrompt={r => {
            const months = r?.forecast || [];
            const next = months[0];
            return next
              ? `Revenue forecast shows ${r?.trend || "unknown"} trend. Next month predicted: $${next.predicted_amount?.toLocaleString() || "—"}. Create a sales target task to hit this forecast.`
              : "Create a revenue target task based on the demand forecast analysis.";
          }}
          resultRenderer={r => r.forecast?.length ? (
            <div className="mt-3 space-y-2">
              <div className="flex items-center gap-2">
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${r.trend === "growing" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
                  {r.trend === "growing" ? "📈 Growing" : "📉 Declining"}
                </span>
                <span className="text-[10px] text-slate-500">R²: {r.r_squared}</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {r.forecast.map((f, i) => (
                  <div key={i} className="bg-slate-50 border border-slate-200 rounded-xl p-2 text-center">
                    <p className="text-[10px] text-slate-500">Month +{f.period_offset}</p>
                    <p className="text-sm font-bold text-slate-800">${f.predicted_amount?.toLocaleString()}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : <p className="text-xs text-slate-400 mt-2">{r.reason || "No transaction data"}</p>}
        />

        {/* Brand awareness */}
        <MLPanel
          title="Brand Awareness Score"
          description="Heuristic from enterprise presence, client engagement, and OSM visibility"
          endpoint="/market/ml/brand-awareness"
          body={{ company_id: companyId, options: { enterprise_name: myEnterprises[0]?.enterprise_name || "" } }}
          actionPrompt={r => r?.recommendation
            ? `Brand awareness score is ${r.brand_score}/100 (${r.level}). ${r.recommendation} Create a task to act on this recommendation.`
            : "Create a brand improvement task based on the brand awareness analysis."}
          resultRenderer={r => r.brand_score != null ? (
            <div className="mt-3 space-y-2">
              <div className="flex items-center gap-3">
                <div className="text-3xl font-black text-slate-800">{r.brand_score}<span className="text-base font-bold text-slate-400">/100</span></div>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${r.level === "strong" ? "bg-emerald-50 text-emerald-700" : r.level === "developing" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-600"}`}>
                  {r.level}
                </span>
              </div>
              <p className="text-xs text-slate-600">{r.recommendation}</p>
              <div className="space-y-1">
                {(r.factors || []).map((f, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <span className="text-slate-500 capitalize">{f.factor.replace(/_/g," ")}</span>
                    <span className="font-bold text-slate-700">{f.score}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : <p className="text-xs text-slate-400 mt-2">{r.reason || ""}</p>}
        />

        {/* Service gap */}
        <MLPanel
          title="Service Gap Detection"
          description="DBSCAN: find geographically isolated enterprises (underserved areas)"
          endpoint="/market/ml/service-gap"
          body={{ company_id: companyId, options: { eps_km: 2, min_samples: 2 } }}
          resultRenderer={r => (
            <div className="mt-3 space-y-2">
              <div className="grid grid-cols-3 gap-2 text-xs text-center">
                <div className="bg-slate-50 border rounded-xl p-2"><p className="text-slate-500">Total</p><p className="font-bold">{r.total_enterprises || 0}</p></div>
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-2"><p className="text-blue-600">Clustered</p><p className="font-bold text-blue-700">{r.clustered || 0}</p></div>
                <div className="bg-rose-50 border border-rose-200 rounded-xl p-2"><p className="text-rose-600">Isolated</p><p className="font-bold text-rose-700">{r.isolated || 0}</p></div>
              </div>
              {r.interpretation && <p className="text-xs text-slate-600">{r.interpretation}</p>}
            </div>
          )}
        />
      </div>
    </div>
  );

  // ── Tab: Staffing ─────────────────────────────────────────────────────────
  const StaffingTab = () => (
    <div className="space-y-4">
      <SectionHeader
        icon={Users}
        title="Staffing Intelligence"
        sub="Person vs Task demand analysis — workforce planning grounded in your ontology"
      />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <MLPanel
          title="Staffing Gap Analysis"
          description="Compare staff headcount (Person) vs task load (Task) per enterprise"
          endpoint="/market/ml/staffing-gap"
          body={{ company_id: companyId, options: {} }}
          actionPrompt={r => {
            const understaffed = (r?.gaps || []).filter(g => g.staffing_status === "understaffed");
            return understaffed.length > 0
              ? `Staffing gap found: ${understaffed.length} understaffed enterprise(s). Create a hiring task or reassign staff to address the shortfall.`
              : "Review staffing levels and create tasks to address any gaps identified.";
          }}
          resultRenderer={r => r.gaps?.length ? (
            <div className="mt-3 space-y-2">
              <div className="grid grid-cols-4 gap-2 text-xs text-center">
                {(r.summary || []).map((s, i) => (
                  <div key={i} className="bg-slate-50 border rounded-xl p-2">
                    <SegBadge label={s.staffing_status} />
                    <p className="font-bold text-slate-700 mt-1">{s.count}</p>
                  </div>
                ))}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs mt-2">
                  <thead><tr className="border-b border-slate-100">
                    <th className="text-left pb-1 font-bold text-slate-500">Enterprise</th>
                    <th className="text-left pb-1 font-bold text-slate-500">Staff</th>
                    <th className="text-left pb-1 font-bold text-slate-500">Tasks</th>
                    <th className="text-left pb-1 font-bold text-slate-500">Status</th>
                  </tr></thead>
                  <tbody>
                    {r.gaps.slice(0, 10).map((g, i) => (
                      <tr key={i} className="border-b border-slate-50">
                        <td className="py-1 text-slate-700 max-w-[120px] truncate">{g.enterprise_id}</td>
                        <td className="py-1 text-slate-600">{g.staff_count}</td>
                        <td className="py-1 text-slate-600">{g.total_tasks}</td>
                        <td className="py-1"><SegBadge label={g.staffing_status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : <p className="text-xs text-slate-400 mt-2">{r.reason || "No data"}</p>}
        />

        <MLPanel
          title="Client Churn Risk"
          description="Logistic regression: identify clients at risk of lapsing (Person + Transaction)"
          endpoint="/market/ml/churn-risk"
          body={{ company_id: companyId, options: { person_type: "client" } }}
          resultRenderer={r => (
            <div className="mt-3 space-y-2">
              <div className="grid grid-cols-3 gap-2 text-xs text-center">
                <div className="bg-rose-50 border border-rose-200 rounded-xl p-2"><p className="text-rose-600">High Risk</p><p className="font-bold text-rose-700">{r.high_risk || 0}</p></div>
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-2"><p className="text-amber-600">Medium Risk</p><p className="font-bold text-amber-700">{r.medium_risk || 0}</p></div>
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-2"><p className="text-emerald-600">Low Risk</p><p className="font-bold text-emerald-700">{r.low_risk || 0}</p></div>
              </div>
              {r.at_risk?.slice(0, 5).map((p, i) => (
                <div key={i} className="flex items-center justify-between text-xs border-b border-slate-50 py-1">
                  <span className="text-slate-700">{p.full_name || p.id}</span>
                  <span className="text-rose-600 font-bold">{p.churn_probability}%</span>
                </div>
              ))}
            </div>
          )}
        />

        <MLPanel
          title="Staff Churn Risk"
          description="Identify staff at risk of leaving (Person type=staff)"
          endpoint="/market/ml/churn-risk"
          body={{ company_id: companyId, options: { person_type: "staff" } }}
          resultRenderer={r => (
            <div className="mt-3 space-y-2">
              <div className="grid grid-cols-3 gap-2 text-xs text-center">
                <div className="bg-rose-50 border border-rose-200 rounded-xl p-2"><p className="text-rose-600">High Risk</p><p className="font-bold text-rose-700">{r.high_risk || 0}</p></div>
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-2"><p className="text-amber-600">Medium</p><p className="font-bold text-amber-700">{r.medium_risk || 0}</p></div>
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-2"><p className="text-emerald-600">Low</p><p className="font-bold text-emerald-700">{r.low_risk || 0}</p></div>
              </div>
              {r.reason && <p className="text-xs text-slate-400">{r.reason}</p>}
            </div>
          )}
        />
      </div>
    </div>
  );

  // ── Tab: Products ─────────────────────────────────────────────────────────
  const ProductsTab = () => (
    <div className="space-y-4">
      <SectionHeader
        icon={Package}
        title="Product Intelligence"
        sub="Price positioning, product testing, and market fit analysis (Product + Transaction ontology)"
      />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <MLPanel
          title="Price Positioning"
          description="Rank your products within your portfolio — premium, mid-range, value, or budget"
          endpoint="/market/ml/price-position"
          body={{ company_id: companyId, options: {} }}
          resultRenderer={r => r.products?.length ? (
            <div className="mt-3 space-y-2">
              <div className="flex items-center gap-3 text-xs">
                <span className="text-slate-500">Portfolio avg: <strong>${r.market_avg}</strong></span>
                <span className="text-slate-500">Median: <strong>${r.market_median}</strong></span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(r.distribution || []).map((d, i) => (
                  <div key={i} className="bg-slate-50 border rounded-xl px-2 py-1 text-xs flex items-center gap-1.5">
                    <SegBadge label={d.price_position} />
                    <span className="font-bold text-slate-700">{d.count}</span>
                  </div>
                ))}
              </div>
              <div className="overflow-x-auto max-h-48">
                <table className="w-full text-xs">
                  <thead><tr className="border-b border-slate-100">
                    <th className="text-left pb-1 font-bold text-slate-500">Product</th>
                    <th className="text-left pb-1 font-bold text-slate-500">Price</th>
                    <th className="text-left pb-1 font-bold text-slate-500">Percentile</th>
                    <th className="text-left pb-1 font-bold text-slate-500">Position</th>
                    <th className="text-left pb-1 font-bold text-slate-500">Margin</th>
                  </tr></thead>
                  <tbody>
                    {r.products.slice(0, 15).map((p, i) => (
                      <tr key={i} className="border-b border-slate-50">
                        <td className="py-1 text-slate-700 max-w-[120px] truncate">{p.name}</td>
                        <td className="py-1 text-slate-600">{p[r.price_field]}</td>
                        <td className="py-1 text-slate-600">{p.price_percentile}%</td>
                        <td className="py-1"><SegBadge label={p.price_position} /></td>
                        <td className="py-1 text-slate-600">{p.margin_pct != null ? `${p.margin_pct}%` : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : <p className="text-xs text-slate-400 mt-2">{r.reason || "No product data"}</p>}
        />

        <MLPanel
          title="Demand Forecast by Product"
          description="Revenue trend and 3-month forecast from transaction data"
          endpoint="/market/ml/demand-forecast"
          body={{ company_id: companyId, options: {} }}
          resultRenderer={r => r.forecast?.length ? (
            <div className="mt-3 space-y-2">
              <div className="flex items-center gap-2">
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${r.trend === "growing" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
                  {r.trend === "growing" ? "📈 Growing" : "📉 Declining"}
                </span>
                <span className="text-[10px] text-slate-500">+${r.monthly_change}/month · R²={r.r_squared}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                {r.forecast.map((f, i) => (
                  <div key={i} className="bg-slate-50 border rounded-xl p-2 text-xs">
                    <p className="text-slate-500">+{f.period_offset} month</p>
                    <p className="font-black text-slate-800">${f.predicted_amount?.toLocaleString()}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : <p className="text-xs text-slate-400 mt-2">{r.reason || "Run ETL first"}</p>}
        />
      </div>
    </div>
  );

  // ── Tab: Economic ─────────────────────────────────────────────────────────
  const EconomicTab = () => (
    <div className="space-y-4">
      <SectionHeader
        icon={Globe}
        title="Economic Context"
        sub="World Bank macroeconomic indicators + ILO labor data — no API key required"
        badge="World Bank"
      />

      {/* Source attribution banner — always visible */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5 flex items-center gap-3 text-xs">
        <Globe className="w-4 h-4 text-blue-500 shrink-0" />
        <div className="flex-1">
          <span className="font-semibold text-blue-800">Data sources: </span>
          <span className="text-blue-700">World Bank Open Data (GDP, inflation, population, trade) · ILO/World Bank (labour market indicators)</span>
        </div>
        <span className="text-[10px] text-blue-500 shrink-0 font-mono">
          Country: {currentUser?.country_code || "ZA"}
        </span>
      </div>

      {!economic && (
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading World Bank data…
        </div>
      )}

      {economic && (
        <div>
          {economic.country_info && (
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 mb-4">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Country: {economic.country_info.name}</p>
              <div className="flex flex-wrap gap-3 text-xs text-slate-600">
                <span>Region: <strong>{economic.country_info.region}</strong></span>
                <span>Capital: <strong>{economic.country_info.capital}</strong></span>
                <span>Currency: <strong>{economic.country_info.currencies?.join(", ")}</strong></span>
                <span>Language: <strong>{economic.country_info.languages?.join(", ")}</strong></span>
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {Object.entries(economic.indicators || {}).map(([key, data]) => (
              <StatCard
                key={key}
                label={key.replace(/_/g," ").replace(" pct"," %")}
                value={typeof data.value === "number" ? (data.value > 1000000 ? `$${(data.value/1e9).toFixed(1)}B` : data.value.toFixed(1)) : data.value}
                sub={`${data.year} · World Bank`}
                icon={TrendingUp}
                color="text-blue-600"
                bg="bg-blue-50"
              />
            ))}
          </div>
        </div>
      )}

      {labor && Object.keys(labor.indicators || {}).length > 0 && (
        <div>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3 mt-2">Labor Market Indicators</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {Object.entries(labor.indicators).map(([key, data]) => (
              <StatCard
                key={key}
                label={key.replace(/_/g," ").replace(" pct"," %")}
                value={`${data.value}%`}
                sub={`${data.year} · ILO/World Bank`}
                icon={Users}
                color="text-violet-600"
                bg="bg-violet-50"
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );

  // ── Tab: News ─────────────────────────────────────────────────────────────
  // NOTE: localNewsQuery lives in parent state (not here) to avoid React hook
  // violations — this component is defined inside the render body, so any
  // useState call here causes React error #310 on every parent re-render.
  const NewsTab = () => (
      <div className="space-y-4">
        <SectionHeader icon={Newspaper} title="Industry News" sub="Hacker News Algolia (free) or NewsAPI with key — filtered by your industry" />
        <div className="flex gap-2">
          <input
            value={localNewsQuery}
            onChange={e => setLocalNewsQuery(e.target.value)}
            placeholder="e.g. healthcare SME Africa"
            className="flex-1 text-xs border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-200"
          />
          <button
            onClick={() => {
              setNewsQuery(localNewsQuery);
              setNews(null);
              apiFetch(`/market/industry-news?query=${encodeURIComponent(localNewsQuery)}&company_id=${companyId}`)
                .then(setNews).catch(() => {});
            }}
            className="flex items-center gap-1.5 bg-slate-800 text-white text-xs font-semibold px-3 py-2 rounded-xl"
          >
            <Search className="w-3.5 h-3.5" /> Search
          </button>
        </div>
        {news && (
          <div className="space-y-2">
            <p className="text-[10px] text-slate-400">{news.count} results via {news.results?.[0]?.api || "News"}</p>
            {news.results?.map((a, i) => (
              <div key={i} className="bg-white border border-slate-200 rounded-xl p-3">
                <a href={a.url} target="_blank" rel="noreferrer" className="text-sm font-semibold text-slate-800 hover:text-blue-600 line-clamp-2">{a.title}</a>
                <div className="flex items-center gap-2 mt-1 text-[10px] text-slate-400">
                  <span>{a.source}</span>
                  {a.published_at && <span>{a.published_at?.substring(0, 10)}</span>}
                  <ExternalLink className="w-3 h-3" />
                </div>
                {a.summary && <p className="text-xs text-slate-500 mt-1 line-clamp-2">{a.summary}</p>}
              </div>
            ))}
          </div>
        )}
      </div>
  );

  // ── Tab: APIs Catalog ─────────────────────────────────────────────────────
  const APIsTab = () => {
    const cats = apisCatalog ? ["all", ...Object.keys(apisCatalog.by_category)] : ["all"];
    const apis = (apisCatalog?.apis || []).filter(a => apiCatFilter === "all" || a.category === apiCatFilter);
    return (
      <div className="space-y-4">
        <SectionHeader icon={Layers} title="50 Free Market Intelligence APIs" sub="All integrated via python_layer — no frontend API calls. Ontology-mapped." badge={`${apisCatalog?.total_apis || 0} APIs`} />

        {!apisCatalog && <div className="flex items-center gap-2 text-xs text-slate-400"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>}

        {apisCatalog && (
          <>
            <div className="grid grid-cols-3 gap-3 text-center text-xs">
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3"><p className="text-emerald-600 font-bold text-xl">{apisCatalog.free_no_key}</p><p className="text-slate-500">No Key Required</p></div>
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3"><p className="text-amber-600 font-bold text-xl">{apisCatalog.free_key_needed}</p><p className="text-slate-500">Free Key Needed</p></div>
              <div className="bg-violet-50 border border-violet-200 rounded-xl p-3"><p className="text-violet-600 font-bold text-xl">{apisCatalog.used_by_platform}</p><p className="text-slate-500">Active in Platform</p></div>
            </div>

            <div className="flex gap-2 flex-wrap">
              {cats.map(c => (
                <button key={c} onClick={() => setApiCatFilter(c)}
                  className={`text-xs px-3 py-1 rounded-full font-medium border transition-colors ${apiCatFilter === c ? "bg-slate-800 text-white border-slate-800" : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"}`}
                >{c} {c !== "all" && `(${apisCatalog.by_category[c] || 0})`}</button>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {apis.map(api => (
                <div key={api.id} className={`bg-white border rounded-xl p-3 ${api.used_by_platform ? "border-emerald-300" : "border-slate-200"}`}>
                  <div className="flex items-start justify-between mb-1.5">
                    <p className="text-xs font-bold text-slate-800 leading-tight">{api.name}</p>
                    {api.used_by_platform && <span className="text-[9px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-1 py-0.5 rounded font-bold shrink-0 ml-1">ACTIVE</span>}
                  </div>
                  <p className="text-[10px] text-slate-500 mb-1.5 capitalize">{api.category} · {api.update_freq}</p>
                  <div className="flex flex-wrap gap-1 mb-1.5">
                    {api.ontology_objects?.map(o => (
                      <span key={o} className="text-[9px] bg-slate-100 text-slate-600 px-1 py-0.5 rounded font-medium">{o}</span>
                    ))}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${api.key_required ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-emerald-50 text-emerald-700 border-emerald-200"}`}>
                      {api.key_required ? "Free key" : "No key"}
                    </span>
                    <a href={api.url} target="_blank" rel="noreferrer" className="text-[10px] text-blue-500 hover:underline flex items-center gap-0.5">
                      Docs <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    );
  };

  // ── Tab: Demographics ─────────────────────────────────────────────────────
  const DemographicsTab = () => {
    if (demoLoading) return (
      <div className="flex items-center gap-2 text-xs text-slate-400 py-8">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading demographics…
      </div>
    );
    if (!demoData) return (
      <div className="py-8 text-center space-y-3">
        <p className="text-xs text-slate-400">No demographic data found.</p>
        <p className="text-[10px] text-slate-300">Ensure People and Enterprise records exist in your organisation.</p>
        <button
          onClick={() => { setDemoData(null); setDemoLoading(false); }}
          className="text-xs text-slate-600 border border-slate-200 rounded-lg px-3 py-1.5 hover:bg-slate-50"
        >
          Retry
        </button>
      </div>
    );

    // Empty data guard — data loaded but nothing to show
    const hasAnyData = demoData.totalPeople > 0 || demoData.totalEnterprises > 0;

    const toChartData = (obj) =>
      Object.entries(obj)
        .filter(([, v]) => v > 0)
        .sort(([, a], [, b]) => b - a)
        .map(([name, value]) => ({ name: name.replace(/_/g, " "), value }));

    const personTypeData   = toChartData(demoData.byType);
    const personStatusData = toChartData(demoData.byStatus);
    const engagementData   = toChartData(demoData.byEngagement);
    const entTypeData      = toChartData(demoData.entByType);
    const entStatusData    = toChartData(demoData.entByStatus);

    const tierLabel = { 1: "Analytics (T1)", 2: "Raw DB (T2)", 3: "Supabase Live (T3)" }[demoData.dataTier] || "—";

    return (
      <div className="space-y-6">
        <SectionHeader
          icon={PieIcon}
          title="Organisation Demographics"
          sub="People and Enterprise breakdown from your own data — Person + Enterprise ontology"
          badge={tierLabel}
        />

        {/* Empty-data notice */}
        {!hasAnyData && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-800 flex items-center justify-between gap-3">
            <span>No people or enterprise records found via {demoData.dataSource || "any tier"}. Add records to see demographic breakdowns.</span>
            <button onClick={() => setDemoData(null)} className="text-xs font-semibold underline shrink-0">Refresh</button>
          </div>
        )}

        {/* Summary metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Total People",      value: demoData.totalPeople,      icon: Users,     color: "text-blue-600",    bg: "bg-blue-50" },
            { label: "Total Enterprises", value: demoData.totalEnterprises,  icon: Building2, color: "text-emerald-600", bg: "bg-emerald-50" },
            { label: "Person Types",      value: personTypeData.length,      icon: PieIcon,   color: "text-violet-600",  bg: "bg-violet-50" },
            { label: "Enterprise Types",  value: entTypeData.length,         icon: Layers,    color: "text-amber-600",   bg: "bg-amber-50" },
          ].map(({ label, value, icon: Icon, color, bg }) => (
            <div key={label} className={`${bg} rounded-2xl p-4 flex items-center gap-3`}>
              <Icon className={`w-5 h-5 ${color} shrink-0`} />
              <div>
                <p className={`text-2xl font-black ${color}`}>{value ?? "—"}</p>
                <p className="text-[10px] text-slate-500 mt-0.5">{label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* People charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Person type — pie */}
          {personTypeData.length > 0 && (
            <div className="bg-white border border-slate-100 rounded-2xl p-5">
              <p className="text-sm font-semibold text-slate-800 mb-1">People by Type</p>
              <p className="text-[10px] text-slate-400 mb-4">Ontology: staff · client · contact · volunteer</p>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={personTypeData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                    {personTypeData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Person status — bar */}
          {personStatusData.length > 0 && (
            <div className="bg-white border border-slate-100 rounded-2xl p-5">
              <p className="text-sm font-semibold text-slate-800 mb-1">People by Status</p>
              <p className="text-[10px] text-slate-400 mb-4">Ontology: active · inactive · on_leave</p>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={personStatusData} layout="vertical">
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={80} />
                  <Tooltip />
                  <Bar dataKey="value" fill="#3b82f6" radius={[0, 4, 4, 0]}>
                    {personStatusData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Engagement model */}
        {engagementData.length > 0 && (
          <div className="bg-white border border-slate-100 rounded-2xl p-5">
            <p className="text-sm font-semibold text-slate-800 mb-1">Engagement Model</p>
            <p className="text-[10px] text-slate-400 mb-4">Ontology: employed · contracted · freelance · volunteer · enrolled · subscribed</p>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={engagementData}>
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="value" fill="#8b5cf6" radius={[4, 4, 0, 0]}>
                  {engagementData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Enterprise charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {entTypeData.length > 0 && (
            <div className="bg-white border border-slate-100 rounded-2xl p-5">
              <p className="text-sm font-semibold text-slate-800 mb-1">Enterprises by Type</p>
              <p className="text-[10px] text-slate-400 mb-4">Ontology: commercial · nonprofit · government · household · cooperative · trust</p>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={entTypeData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                    {entTypeData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}

          {entStatusData.length > 0 && (
            <div className="bg-white border border-slate-100 rounded-2xl p-5">
              <p className="text-sm font-semibold text-slate-800 mb-1">Enterprises by Status</p>
              <p className="text-[10px] text-slate-400 mb-4">Ontology: open · closed · temporarily_closed · seasonal</p>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={entStatusData} layout="vertical">
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={100} />
                  <Tooltip />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                    {entStatusData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Person type detail table */}
        {personTypeData.length > 0 && (
          <div className="bg-white border border-slate-100 rounded-2xl p-5">
            <p className="text-sm font-semibold text-slate-800 mb-3">People — Full Breakdown</p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="text-left pb-2 font-semibold text-slate-500">Person Type</th>
                    <th className="text-right pb-2 font-semibold text-slate-500">Count</th>
                    <th className="text-right pb-2 font-semibold text-slate-500">Share</th>
                  </tr>
                </thead>
                <tbody>
                  {personTypeData.map(({ name, value }, i) => (
                    <tr key={i} className="border-b border-slate-50">
                      <td className="py-2 text-slate-700 capitalize flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full inline-block shrink-0" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                        {name}
                      </td>
                      <td className="py-2 text-right font-semibold text-slate-800">{value.toLocaleString()}</td>
                      <td className="py-2 text-right text-slate-500">{demoData.totalPeople > 0 ? `${((value / demoData.totalPeople) * 100).toFixed(1)}%` : "—"}</td>
                    </tr>
                  ))}
                  <tr className="border-t border-slate-200 font-bold">
                    <td className="py-2 text-slate-700">Total</td>
                    <td className="py-2 text-right text-slate-800">{demoData.totalPeople.toLocaleString()}</td>
                    <td className="py-2 text-right text-slate-500">100%</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  };

  // ── Render ────────────────────────────────────────────────────────────────
  // IMPORTANT: call as plain functions, not JSX elements (<MapTab />).
  // Defining components inside another component causes React to treat them
  // as a new type on every render → full unmount/remount → Leaflet loses its
  // DOM node references → "_leaflet_pos" crash.
  // Calling as functions inlines the JSX without a React component boundary.
  const TAB_RENDERERS = { map: MapTab, ml: MLTab, demographics: DemographicsTab, staffing: StaffingTab, products: ProductsTab, economic: EconomicTab, news: NewsTab, apis: APIsTab };
  const activeContent = (TAB_RENDERERS[activeTab] || MapTab)();

  return (
    <div>
      {/* Ontology grounding banner */}
      <div className="bg-gradient-to-r from-slate-900 to-slate-800 rounded-2xl p-3 mb-5 flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-violet-400" />
          <span className="text-xs font-bold text-white">Intelligence grounded in ontology</span>
        </div>
        {[
          ["Enterprise","#f59e0b"], ["Person","#3b82f6"], ["Product","#f43f5e"],
          ["Task","#8b5cf6"], ["Transaction","#10b981"], ["Address","#06b6d4"],
        ].map(([obj, color]) => (
          <span key={obj} className="text-[10px] font-bold px-2 py-0.5 rounded-lg border border-white/10 text-white/80" style={{ backgroundColor: `${color}22` }}>
            {obj}
          </span>
        ))}
        <span className="text-[10px] text-slate-400 ml-auto">All data from python_layer</span>
      </div>

      {/* Tab bar */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-5 scrollbar-hide">
        {TABS.map(t => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`flex-shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                activeTab === t.id
                  ? "bg-slate-800 text-white"
                  : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />{t.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {activeContent}
    </div>
  );
}
