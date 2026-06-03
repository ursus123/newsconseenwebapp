import React, { useMemo, useState } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup, Polygon, Marker, Circle, useMapEvents } from "react-leaflet";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { base44 } from "@/api/base44Client";
import dataService from "@/services/dataService";
import TeachIdjwiButton from "@/components/shared/TeachIdjwiButton";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle, BarChart2, Brain, Building2, CheckCircle2, Circle as CircleIcon,
  Database, Edit3, ExternalLink, Filter, Grid3X3, Home, Layers, Loader2,
  Map, MapPin, Navigation, Pin, Ruler, Save, Search, ShieldCheck, Target,
  Tractor, X,
} from "lucide-react";

const RAILWAY_URL = "https://newsconseenwebapp-production.up.railway.app";

const MODES = [
  { value: "pins", label: "Pins", Icon: MapPin },
  { value: "clusters", label: "Clusters", Icon: CircleIcon },
  { value: "density", label: "Density", Icon: Grid3X3 },
  { value: "boundaries", label: "Boundaries", Icon: Map },
];

const LAYERS = [
  { value: "addresses", label: "Addresses", Icon: Home, color: "#2563eb" },
  { value: "enterprises", label: "Enterprises", Icon: Building2, color: "#059669" },
  { value: "plots", label: "Plots", Icon: Tractor, color: "#d97706" },
];

const LAYER_COLOR = {
  address: "#2563eb",
  addresses: "#2563eb",
  enterprise: "#059669",
  enterprises: "#059669",
  plot: "#d97706",
  plots: "#d97706",
};

const ADDRESS_TYPE_COLOR = {
  operational: "#10b981",
  supplier: "#3b82f6",
  government: "#8b5cf6",
  residential: "#f59e0b",
  contact: "#06b6d4",
  billing: "#14b8a6",
  service: "#ef4444",
  other: "#64748b",
};

const iconCache = {};
function makeAddressIcon(color, selected = false) {
  const key = `${color}-${selected}`;
  if (iconCache[key]) return iconCache[key];
  const ring = selected ? `<circle cx="14" cy="14" r="11" fill="none" stroke="${color}" stroke-width="3" stroke-dasharray="4 2"/>` : "";
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="28" height="36" viewBox="0 0 28 36">
      <path d="M14 0C6.27 0 0 6.27 0 14c0 9.63 14 22 14 22S28 23.63 28 14C28 6.27 21.73 0 14 0z"
        fill="${color}" stroke="white" stroke-width="2"/>
      <circle cx="14" cy="14" r="5" fill="white"/>
      ${ring}
    </svg>`;
  const icon = L.divIcon({ html: svg, className: "", iconSize: [28, 36], iconAnchor: [14, 36], popupAnchor: [0, -36] });
  iconCache[key] = icon;
  return icon;
}

function asNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function hasCoords(row) {
  return asNumber(row?.latitude) !== null && asNumber(row?.longitude) !== null;
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function pointInPolygon(lat, lng, coordinates = []) {
  const ring = coordinates?.[0] || [];
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][1], yi = ring[i][0];
    const xj = ring[j][1], yj = ring[j][0];
    const intersects = ((yi > lng) !== (yj > lng)) &&
      (lat < (xj - xi) * (lng - yi) / ((yj - yi) || 1e-9) + xi);
    if (intersects) inside = !inside;
  }
  return inside;
}

function recordName(a) {
  return a?.label || a?.address_line1 || a?.city || "Address";
}

function addressSql(where = "latitude IS NOT NULL AND longitude IS NOT NULL") {
  return `SELECT id, label, address_line1, city, state_region, country, latitude, longitude, address_type, status FROM addresses WHERE ${where} LIMIT 500;`;
}

async function fetchPins(companyId, layers) {
  try {
    const r = await fetch(`${RAILWAY_URL}/postgis/spatial-pins?company_id=${companyId}&entity_layers=${layers.join(",")}&limit=1000`);
    if (r.ok) {
      const d = await r.json();
      if (d.pins?.length > 0) return d.pins;
    }
  } catch (_) {}
  try {
    const [enterprises, plots] = await Promise.all([
      layers.includes("enterprises") ? base44.entities.Enterprise.filter({ company_id: companyId }).catch(() => []) : Promise.resolve([]),
      layers.includes("plots") && base44.entities.Plot ? base44.entities.Plot.filter({ company_id: companyId }).catch(() => []) : Promise.resolve([]),
    ]);
    const pins = [];
    enterprises.forEach(e => {
      if (hasCoords(e)) pins.push({
        entity_layer: "enterprise",
        name: e.enterprise_name || "Enterprise",
        entity_type: e.enterprise_type,
        status: e.status,
        latitude: asNumber(e.latitude),
        longitude: asNumber(e.longitude),
      });
    });
    plots.forEach(p => {
      if (hasCoords(p)) pins.push({
        entity_layer: "plot",
        name: p.name || p.plot_name || "Plot",
        entity_type: p.plot_type,
        status: p.status,
        latitude: asNumber(p.latitude),
        longitude: asNumber(p.longitude),
      });
    });
    return pins;
  } catch (_) {
    return [];
  }
}

async function fetchClusters(companyId) {
  try {
    const r = await fetch(`${RAILWAY_URL}/postgis/clusters?company_id=${companyId}`);
    if (r.ok) return r.json();
  } catch (_) {}
  return null;
}

async function fetchDensity(companyId, layers, gridDegrees) {
  try {
    const r = await fetch(`${RAILWAY_URL}/postgis/spatial-density?company_id=${companyId}&entity_layers=${layers.join(",")}&grid_degrees=${gridDegrees}`);
    if (r.ok) return r.json();
  } catch (_) {}
  return null;
}

async function fetchBoundaries(companyId) {
  try {
    const r = await fetch(`${RAILWAY_URL}/postgis/boundaries?company_id=${companyId}`);
    if (r.ok) return r.json();
  } catch (_) {}
  return null;
}

function MapClickCapture({ onClick }) {
  useMapEvents({
    click: (event) => onClick?.(event.latlng),
  });
  return null;
}

function Metric({ label, value, tone = "slate" }) {
  const tones = {
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-100",
    amber: "bg-amber-50 text-amber-700 border-amber-100",
    rose: "bg-rose-50 text-rose-700 border-rose-100",
    blue: "bg-blue-50 text-blue-700 border-blue-100",
    slate: "bg-slate-50 text-slate-700 border-slate-100",
  };
  return (
    <div className={`rounded-xl border px-3 py-2 ${tones[tone] || tones.slate}`}>
      <p className="text-[10px] font-bold uppercase tracking-wide opacity-70">{label}</p>
      <p className="text-lg font-black">{value}</p>
    </div>
  );
}

export default function MapView() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [mode, setMode] = useState("pins");
  const [activeLayers, setActiveLayers] = useState(["addresses"]);
  const [gridDegrees, setGridDegrees] = useState(0.1);
  const [selectedAddress, setSelectedAddress] = useState(null);
  const [editDraft, setEditDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [analysisMode, setAnalysisMode] = useState("quality");
  const [radiusKm, setRadiusKm] = useState(5);
  const [nearestLimit, setNearestLimit] = useState(10);
  const [mapPoint, setMapPoint] = useState(null);
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showUngrouped, setShowUngrouped] = useState(true);

  const { data: currentUser = null } = useQuery({
    queryKey: ["currentUser"],
    queryFn: () => base44.auth.me(),
  });
  const companyId = currentUser?.company_id;

  const { data: addresses = [], isLoading: addressesLoading } = useQuery({
    queryKey: ["spatial-addresses", companyId],
    queryFn: () => base44.entities.Address.filter({ company_id: companyId }).catch(() => []),
    enabled: !!companyId,
    staleTime: 30000,
  });

  const { data: otherPins = [], isLoading: pinsLoading } = useQuery({
    queryKey: ["spatial-pins", companyId, activeLayers.filter(l => l !== "addresses")],
    queryFn: () => fetchPins(companyId, activeLayers.filter(l => l !== "addresses")),
    enabled: !!companyId && mode === "pins" && activeLayers.some(l => l !== "addresses"),
    staleTime: 30000,
  });

  const { data: clustersPayload, isLoading: clustersLoading } = useQuery({
    queryKey: ["spatial-clusters", companyId],
    queryFn: () => fetchClusters(companyId),
    enabled: !!companyId && mode === "clusters",
    staleTime: 60000,
  });

  const { data: densityPayload, isLoading: densityLoading } = useQuery({
    queryKey: ["spatial-density", companyId, activeLayers, gridDegrees],
    queryFn: () => fetchDensity(companyId, activeLayers, gridDegrees),
    enabled: !!companyId && mode === "density",
    staleTime: 60000,
  });

  const { data: boundariesPayload, isLoading: boundariesLoading } = useQuery({
    queryKey: ["spatial-boundaries", companyId],
    queryFn: () => fetchBoundaries(companyId),
    enabled: !!companyId,
    staleTime: 60000,
  });

  const clusters = clustersPayload?.clusters || [];
  const densityCells = densityPayload?.cells || [];
  const boundaries = boundariesPayload?.boundaries || [];
  const isLoading = addressesLoading || pinsLoading || clustersLoading || densityLoading || boundariesLoading;

  const filteredAddresses = useMemo(() => {
    return addresses.filter(a => {
      if (typeFilter !== "all" && (a.address_type || "other") !== typeFilter) return false;
      if (statusFilter !== "all" && (a.status || "active") !== statusFilter) return false;
      return true;
    });
  }, [addresses, typeFilter, statusFilter]);

  const geocodedAddresses = useMemo(() => filteredAddresses.filter(hasCoords), [filteredAddresses]);
  const missingGps = useMemo(() => addresses.filter(a => !hasCoords(a)), [addresses]);

  const addressPins = useMemo(() => (
    activeLayers.includes("addresses")
      ? geocodedAddresses.map(a => ({
          ...a,
          entity_layer: "address",
          name: recordName(a),
          latitude: asNumber(a.latitude),
          longitude: asNumber(a.longitude),
        }))
      : []
  ), [activeLayers, geocodedAddresses]);

  const allPins = useMemo(() => [...addressPins, ...otherPins], [addressPins, otherPins]);

  const center = useMemo(() => {
    let pts = [];
    if (mode === "pins" && allPins.length) pts = allPins;
    if (mode === "clusters" && clusters.length) pts = clusters.map(c => ({ latitude: c.centroid_lat, longitude: c.centroid_lng }));
    if (mode === "density" && densityCells.length) pts = densityCells.map(c => ({ latitude: c.grid_lat, longitude: c.grid_lng }));
    if (!pts.length) return [20, 0];
    const lat = pts.reduce((s, p) => s + Number(p.latitude || 0), 0) / pts.length;
    const lng = pts.reduce((s, p) => s + Number(p.longitude || 0), 0) / pts.length;
    return [lat, lng];
  }, [mode, allPins, clusters, densityCells]);

  const quality = useMemo(() => {
    const total = addresses.length;
    const geocoded = addresses.filter(hasCoords).length;
    const missingCity = addresses.filter(a => !a.city).length;
    const missingCountry = addresses.filter(a => !a.country).length;
    const archived = addresses.filter(a => a.status === "archived").length;
    const pct = total ? Math.round((geocoded / total) * 100) : 0;
    return { total, geocoded, missingGps: total - geocoded, missingCity, missingCountry, archived, pct };
  }, [addresses]);

  const duplicateCandidates = useMemo(() => {
    const rows = addresses.filter(hasCoords);
    const out = [];
    for (let i = 0; i < rows.length; i++) {
      for (let j = i + 1; j < rows.length; j++) {
        const a = rows[i], b = rows[j];
        const dist = haversineKm(asNumber(a.latitude), asNumber(a.longitude), asNumber(b.latitude), asNumber(b.longitude));
        const similar = String(recordName(a)).toLowerCase().slice(0, 8) === String(recordName(b)).toLowerCase().slice(0, 8);
        if (dist <= 0.05 || (dist <= 0.15 && similar)) out.push({ a, b, dist });
      }
    }
    return out.slice(0, 25);
  }, [addresses]);

  const outliers = useMemo(() => {
    const rows = addresses.filter(hasCoords);
    if (rows.length < 3) return [];
    const avgLat = rows.reduce((s, a) => s + asNumber(a.latitude), 0) / rows.length;
    const avgLng = rows.reduce((s, a) => s + asNumber(a.longitude), 0) / rows.length;
    return rows
      .map(a => ({ address: a, km: haversineKm(avgLat, avgLng, asNumber(a.latitude), asNumber(a.longitude)) }))
      .filter(item => item.km > 100)
      .sort((a, b) => b.km - a.km)
      .slice(0, 25);
  }, [addresses]);

  const coverage = useMemo(() => {
    if (!boundaries.length) return [];
    return boundaries.map(boundary => {
      const coords = boundary.geojson?.coordinates || [];
      const inside = addresses.filter(a => hasCoords(a) && pointInPolygon(asNumber(a.latitude), asNumber(a.longitude), coords));
      return { boundary, inside, outsideCount: addresses.filter(hasCoords).length - inside.length };
    });
  }, [addresses, boundaries]);

  const analysisOrigin = selectedAddress && hasCoords(selectedAddress)
    ? { latitude: asNumber(selectedAddress.latitude), longitude: asNumber(selectedAddress.longitude), label: recordName(selectedAddress) }
    : mapPoint
    ? { latitude: mapPoint.lat, longitude: mapPoint.lng, label: "Map point" }
    : null;

  const radiusResults = useMemo(() => {
    if (!analysisOrigin) return [];
    return addresses
      .filter(hasCoords)
      .map(a => ({ address: a, km: haversineKm(analysisOrigin.latitude, analysisOrigin.longitude, asNumber(a.latitude), asNumber(a.longitude)) }))
      .filter(item => item.km <= Number(radiusKm || 0))
      .sort((a, b) => a.km - b.km);
  }, [addresses, analysisOrigin, radiusKm]);

  const nearestResults = useMemo(() => {
    if (!analysisOrigin) return [];
    return addresses
      .filter(hasCoords)
      .map(a => ({ address: a, km: haversineKm(analysisOrigin.latitude, analysisOrigin.longitude, asNumber(a.latitude), asNumber(a.longitude)) }))
      .sort((a, b) => a.km - b.km)
      .slice(0, Number(nearestLimit || 10));
  }, [addresses, analysisOrigin, nearestLimit]);

  const autonomousExplanation = useMemo(() => {
    const lines = [
      `Idjwi Autonomous reviewed ${quality.total} address records.`,
      `${quality.geocoded} are geocoded (${quality.pct}%), and ${quality.missingGps} still need GPS coordinates.`,
    ];
    if (duplicateCandidates.length) lines.push(`${duplicateCandidates.length} nearby duplicate candidates are visible.`);
    if (outliers.length) lines.push(`${outliers.length} spatial outliers are more than 100 km from the address centroid.`);
    if (boundaries.length) lines.push(`${boundaries.length} stored boundary${boundaries.length === 1 ? "" : "ies"} can be used for coverage analysis.`);
    if (analysisOrigin) lines.push(`Current analysis origin: ${analysisOrigin.label}.`);
    return lines.join(" ");
  }, [quality, duplicateCandidates.length, outliers.length, boundaries.length, analysisOrigin]);

  const maxDensity = useMemo(() => Math.max(...densityCells.map(c => c.count), 1), [densityCells]);
  const maxCluster = useMemo(() => Math.max(...clusters.map(c => c.member_count || 1), 1), [clusters]);

  const activeAddressTypes = useMemo(() => {
    return [...new Set(addresses.map(a => a.address_type || "other"))].sort();
  }, [addresses]);

  const toggleLayer = (layer) => {
    setActiveLayers(prev => prev.includes(layer) ? prev.filter(l => l !== layer) : [...prev, layer]);
  };

  const selectAddress = (address) => {
    setSelectedAddress(address);
    setEditDraft({
      label: address.label || "",
      address_line1: address.address_line1 || "",
      city: address.city || "",
      state_region: address.state_region || "",
      country: address.country || "",
      address_type: address.address_type || "other",
      status: address.status || "active",
      latitude: String(address.latitude || ""),
      longitude: String(address.longitude || ""),
    });
  };

  const saveAddress = async (patch = null, record = selectedAddress) => {
    if (!record?.id || !currentUser) return;
    setSaving(true);
    try {
      const payload = patch || {
        ...editDraft,
        latitude: editDraft.latitude === "" ? null : Number(editDraft.latitude),
        longitude: editDraft.longitude === "" ? null : Number(editDraft.longitude),
      };
      const updated = await dataService.updateRecord("address", record.id, payload, currentUser, { queryClient: qc, record });
      setSelectedAddress({ ...record, ...payload, ...updated });
      qc.invalidateQueries({ queryKey: ["spatial-addresses", companyId] });
      qc.invalidateQueries({ queryKey: ["addresses"] });
    } finally {
      setSaving(false);
    }
  };

  const handleDragAddress = (address, latlng) => {
    saveAddress({ latitude: Number(latlng.lat.toFixed(7)), longitude: Number(latlng.lng.toFixed(7)) }, address);
  };

  const openQueryBuilder = (sql, title = "spatial_analysis") => {
    sessionStorage.setItem("qb_load_sql", sql);
    sessionStorage.setItem("qb_load_title", title);
    navigate("/QueryBuilder");
  };

  const mapHeight = "min(72vh, 760px)";

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[300px_minmax(0,1fr)_340px] gap-4">
      <aside className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <MapPin className="w-5 h-5 text-emerald-600" />
            <h2 className="text-base font-semibold text-slate-800">Spatial Intelligence</h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">Address-first GIS workbench for cleaning, analysis, and Idjwi teaching.</p>
        </div>

        <div className="p-3 space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <Metric label="Addresses" value={quality.total} tone="blue" />
            <Metric label="Geocoded" value={`${quality.pct}%`} tone={quality.pct >= 80 ? "emerald" : "amber"} />
            <Metric label="Missing GPS" value={quality.missingGps} tone={quality.missingGps ? "amber" : "emerald"} />
            <Metric label="Duplicates" value={duplicateCandidates.length} tone={duplicateCandidates.length ? "rose" : "emerald"} />
          </div>

          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Map Mode</p>
            <div className="grid grid-cols-2 gap-1.5">
              {MODES.map(({ value, label, Icon }) => (
                <button
                  key={value}
                  onClick={() => setMode(value)}
                  className={`flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-semibold border transition-all ${
                    mode === value ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-slate-600 border-slate-200 hover:border-emerald-300"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Layers</p>
            <div className="space-y-1.5">
              {LAYERS.map(({ value, label, Icon, color }) => {
                const active = activeLayers.includes(value);
                return (
                  <button
                    key={value}
                    onClick={() => toggleLayer(value)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold border transition-all ${
                      active ? "text-white border-transparent" : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                    }`}
                    style={active ? { backgroundColor: color, borderColor: color } : {}}
                  >
                    <span className="inline-flex items-center gap-2"><Icon className="w-3.5 h-3.5" />{label}</span>
                    <CheckCircle2 className={`w-3.5 h-3.5 ${active ? "opacity-100" : "opacity-0"}`} />
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">
              <Filter className="w-3.5 h-3.5" />
              Address Filters
            </div>
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-600">
              <option value="all">All address types</option>
              {activeAddressTypes.map(type => <option key={type} value={type}>{type.replace(/_/g, " ")}</option>)}
            </select>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-600">
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="archived">Archived</option>
            </select>
          </div>

          {mode === "density" && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Density Grid</p>
              <div className="grid grid-cols-4 gap-1">
                {[0.05, 0.1, 0.5, 1].map(g => (
                  <button
                    key={g}
                    onClick={() => setGridDegrees(g)}
                    className={`px-2 py-1 rounded-lg border text-xs ${gridDegrees === g ? "bg-slate-800 text-white border-slate-800" : "border-slate-200 text-slate-500"}`}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Brain className="w-3.5 h-3.5 text-emerald-700" />
              <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-700">Idjwi Autonomous</p>
            </div>
            <p className="text-xs text-slate-700 leading-relaxed">{autonomousExplanation}</p>
            {currentUser?.company_id && (
              <div className="mt-2">
                <TeachIdjwiButton
                  user={currentUser}
                  companyId={currentUser.company_id}
                  defaultType="structure"
                  defaultKey="spatial_address_profile"
                  defaultValue={{
                    total_addresses: quality.total,
                    geocoded: quality.geocoded,
                    missing_gps: quality.missingGps,
                    duplicate_candidates: duplicateCandidates.length,
                    outliers: outliers.length,
                  }}
                  context={{ surface: "spatial_intelligence", analysis: "quality_profile" }}
                  label="Teach"
                  compact
                />
              </div>
            )}
          </div>
        </div>
      </aside>

      <section className="bg-white rounded-xl border border-slate-200 overflow-hidden" style={{ minHeight: mapHeight }}>
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-sm font-semibold text-slate-800">Enterprise Spatial Map</p>
            <p className="text-xs text-slate-400">
              {geocodedAddresses.length} plotted addresses. Drag address pins to correct coordinates.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => openQueryBuilder(addressSql(), "all_geocoded_addresses")} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:border-emerald-300">
              <Database className="w-3.5 h-3.5" />
              Verify in Query Builder
            </button>
            <button onClick={() => navigate("/Addresses")} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:border-blue-300">
              <ExternalLink className="w-3.5 h-3.5" />
              Addresses
            </button>
          </div>
        </div>

        <div className="relative" style={{ height: mapHeight }}>
          {isLoading && (
            <div className="absolute inset-0 z-[500] flex items-center justify-center bg-white/80">
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="w-6 h-6 text-emerald-600 animate-spin" />
                <p className="text-sm text-slate-500">Loading spatial data...</p>
              </div>
            </div>
          )}
          <MapContainer key={`spatial-${mode}`} center={center} zoom={allPins.length ? 6 : 2} className="h-full w-full" zoomAnimation={false}>
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap contributors" />
            <MapClickCapture onClick={(latlng) => {
              if (analysisMode === "radius" || analysisMode === "nearest") {
                setMapPoint(latlng);
                setSelectedAddress(null);
              }
            }} />

            {mode === "pins" && addressPins.map(address => {
              const color = address.status === "archived" ? "#94a3b8" : (ADDRESS_TYPE_COLOR[address.address_type] || ADDRESS_TYPE_COLOR.other);
              return (
                <Marker
                  key={address.id}
                  position={[address.latitude, address.longitude]}
                  icon={makeAddressIcon(color, selectedAddress?.id === address.id)}
                  draggable
                  eventHandlers={{
                    click: () => selectAddress(address),
                    dragend: (event) => handleDragAddress(address, event.target.getLatLng()),
                  }}
                >
                  <Popup>
                    <div className="text-sm min-w-[190px]">
                      <p className="font-semibold text-slate-800">{recordName(address)}</p>
                      <p className="text-xs text-slate-500">{[address.city, address.state_region, address.country].filter(Boolean).join(", ") || "No city/country"}</p>
                      <p className="text-xs text-slate-400 mt-1">{address.latitude.toFixed(5)}, {address.longitude.toFixed(5)}</p>
                      <button onClick={() => selectAddress(address)} className="mt-2 text-xs font-semibold text-emerald-600 hover:underline">Open workbench</button>
                    </div>
                  </Popup>
                </Marker>
              );
            })}

            {mode === "pins" && otherPins.map((pin, i) => (
              <CircleMarker
                key={pin.id || `pin-${i}`}
                center={[pin.latitude, pin.longitude]}
                radius={7}
                pathOptions={{ fillColor: LAYER_COLOR[pin.entity_layer] || "#64748b", fillOpacity: 0.85, color: "#fff", weight: 1.5 }}
              >
                <Popup>
                  <div className="text-sm space-y-1 min-w-[180px]">
                    <p className="font-semibold text-slate-800">{pin.name || "-"}</p>
                    <p className="text-slate-500 capitalize">{pin.entity_layer} - {pin.entity_type || "-"}</p>
                    {pin.status && <p className="text-slate-500">Status: {pin.status}</p>}
                  </div>
                </Popup>
              </CircleMarker>
            ))}

            {mode === "clusters" && clusters.map((cl, i) => {
              const r = 6 + Math.round(((cl.member_count || 1) / maxCluster) * 28);
              return (
                <CircleMarker
                  key={cl.cluster_id ?? `cluster-${i}`}
                  center={[cl.centroid_lat, cl.centroid_lng]}
                  radius={r}
                  pathOptions={{ fillColor: "#2563eb", fillOpacity: 0.6, color: "#1d4ed8", weight: 1.5 }}
                >
                  <Popup>
                    <div className="text-sm space-y-1 min-w-[160px]">
                      <p className="font-semibold">Cluster {cl.cluster_id ?? i + 1}</p>
                      <p className="text-slate-600">{cl.member_count} members</p>
                      <button onClick={() => {
                        setMapPoint({ lat: cl.centroid_lat, lng: cl.centroid_lng });
                        setAnalysisMode("nearest");
                      }} className="text-xs font-semibold text-emerald-600">Study nearest addresses</button>
                    </div>
                  </Popup>
                </CircleMarker>
              );
            })}

            {mode === "density" && densityCells.map((cell, i) => {
              const intensity = cell.count / maxDensity;
              const radius = 8 + Math.round(intensity * 36);
              const hue = Math.round(120 - intensity * 120);
              return (
                <CircleMarker
                  key={`density-${i}`}
                  center={[cell.grid_lat, cell.grid_lng]}
                  radius={radius}
                  pathOptions={{ fillColor: `hsl(${hue},80%,45%)`, fillOpacity: 0.55, color: `hsl(${hue},80%,30%)`, weight: 1 }}
                >
                  <Popup>
                    <div className="text-sm space-y-1 min-w-[160px]">
                      <p className="font-semibold">{cell.count} records</p>
                      <p className="text-slate-500 capitalize">Dominant: {cell.dominant_layer}</p>
                      <button onClick={() => {
                        setMapPoint({ lat: cell.grid_lat, lng: cell.grid_lng });
                        setAnalysisMode("radius");
                      }} className="text-xs font-semibold text-emerald-600">Run radius analysis</button>
                    </div>
                  </Popup>
                </CircleMarker>
              );
            })}

            {mode === "boundaries" && boundaries.map((b, i) => {
              if (!b.geojson?.coordinates?.[0]) return null;
              const positions = b.geojson.coordinates[0].map(([lng, lat]) => [lat, lng]);
              return (
                <Polygon
                  key={b.id || `boundary-${i}`}
                  positions={positions}
                  pathOptions={{ color: "#7c3aed", fillColor: "#8b5cf6", fillOpacity: 0.15, weight: 2 }}
                >
                  <Popup>
                    <div className="text-sm space-y-1 min-w-[170px]">
                      <p className="font-semibold">{b.boundary_name}</p>
                      <p className="text-slate-500 capitalize">{b.boundary_type}</p>
                      <button onClick={() => setAnalysisMode("coverage")} className="text-xs font-semibold text-emerald-600">View coverage</button>
                    </div>
                  </Popup>
                </Polygon>
              );
            })}

            {analysisOrigin && analysisMode === "radius" && (
              <Circle
                center={[analysisOrigin.latitude, analysisOrigin.longitude]}
                radius={Number(radiusKm || 0) * 1000}
                pathOptions={{ color: "#10b981", fillColor: "#10b981", fillOpacity: 0.08 }}
              />
            )}
          </MapContainer>
        </div>
      </section>

      <aside className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-800">GIS Workbench</p>
            <p className="text-xs text-slate-400">Edit, study, verify, teach.</p>
          </div>
          {selectedAddress && (
            <button onClick={() => { setSelectedAddress(null); setEditDraft(null); }} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="p-3 space-y-4 max-h-[760px] overflow-y-auto">
          {selectedAddress && editDraft ? (
            <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-3 space-y-3">
              <div className="flex items-center gap-2">
                <Pin className="w-4 h-4 text-blue-600" />
                <p className="text-sm font-bold text-slate-800">Selected Address</p>
              </div>
              <input value={editDraft.label} onChange={e => setEditDraft({ ...editDraft, label: e.target.value })} placeholder="Label" className="w-full rounded-lg border border-blue-100 px-3 py-2 text-xs" />
              <input value={editDraft.address_line1} onChange={e => setEditDraft({ ...editDraft, address_line1: e.target.value })} placeholder="Address line 1" className="w-full rounded-lg border border-blue-100 px-3 py-2 text-xs" />
              <div className="grid grid-cols-2 gap-2">
                <input value={editDraft.city} onChange={e => setEditDraft({ ...editDraft, city: e.target.value })} placeholder="City" className="rounded-lg border border-blue-100 px-3 py-2 text-xs" />
                <input value={editDraft.state_region} onChange={e => setEditDraft({ ...editDraft, state_region: e.target.value })} placeholder="Region" className="rounded-lg border border-blue-100 px-3 py-2 text-xs" />
                <input value={editDraft.country} onChange={e => setEditDraft({ ...editDraft, country: e.target.value })} placeholder="Country" className="rounded-lg border border-blue-100 px-3 py-2 text-xs" />
                <select value={editDraft.status} onChange={e => setEditDraft({ ...editDraft, status: e.target.value })} className="rounded-lg border border-blue-100 px-3 py-2 text-xs">
                  <option value="active">active</option>
                  <option value="archived">archived</option>
                </select>
                <input value={editDraft.latitude} onChange={e => setEditDraft({ ...editDraft, latitude: e.target.value })} placeholder="Latitude" className="rounded-lg border border-blue-100 px-3 py-2 text-xs" />
                <input value={editDraft.longitude} onChange={e => setEditDraft({ ...editDraft, longitude: e.target.value })} placeholder="Longitude" className="rounded-lg border border-blue-100 px-3 py-2 text-xs" />
              </div>
              <select value={editDraft.address_type} onChange={e => setEditDraft({ ...editDraft, address_type: e.target.value })} className="w-full rounded-lg border border-blue-100 px-3 py-2 text-xs">
                {Object.keys(ADDRESS_TYPE_COLOR).map(type => <option key={type} value={type}>{type}</option>)}
              </select>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => saveAddress()} disabled={saving} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold disabled:opacity-50">
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  Save
                </button>
                <button onClick={() => navigate(`/Addresses?selected=${selectedAddress.id}`)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-blue-100 bg-white text-blue-700 text-xs font-semibold">
                  <ExternalLink className="w-3.5 h-3.5" />
                  Record
                </button>
                <button onClick={() => {
                  setAnalysisMode("nearest");
                  setMapPoint(null);
                }} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-blue-100 bg-white text-blue-700 text-xs font-semibold">
                  <Navigation className="w-3.5 h-3.5" />
                  Study
                </button>
                {currentUser?.company_id && (
                  <TeachIdjwiButton
                    user={currentUser}
                    companyId={currentUser.company_id}
                    defaultType="structure"
                    defaultKey={`location_${selectedAddress.id}`}
                    defaultValue={{
                      label: recordName(selectedAddress),
                      city: selectedAddress.city || "",
                      country: selectedAddress.country || "",
                      latitude: selectedAddress.latitude,
                      longitude: selectedAddress.longitude,
                      address_type: selectedAddress.address_type || "other",
                    }}
                    context={{ surface: "spatial_intelligence", record_type: "address", record_id: selectedAddress.id }}
                    label="Teach"
                    compact
                  />
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 text-center">
              <MapPin className="w-7 h-7 text-slate-300 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-600">Select an address pin</p>
              <p className="text-xs text-slate-400 mt-1">Click or drag address pins to edit spatial records.</p>
            </div>
          )}

          <div className="space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">GIS Analysis</p>
            <div className="grid grid-cols-2 gap-1.5">
              {[
                ["quality", "Quality", ShieldCheck],
                ["radius", "Radius", Target],
                ["nearest", "Nearest", Navigation],
                ["coverage", "Coverage", Map],
                ["duplicates", "Duplicates", Search],
                ["outliers", "Outliers", AlertTriangle],
              ].map(([key, label, Icon]) => (
                <button
                  key={key}
                  onClick={() => setAnalysisMode(key)}
                  className={`flex items-center gap-1.5 rounded-lg border px-2 py-2 text-xs font-semibold ${
                    analysisMode === key ? "bg-slate-800 text-white border-slate-800" : "border-slate-200 text-slate-600 hover:border-slate-300"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {label}
                </button>
              ))}
            </div>
          </div>

          {analysisMode === "quality" && (
            <div className="rounded-xl border border-slate-100 p-3 space-y-2">
              <p className="text-sm font-bold text-slate-800">Spatial Quality</p>
              <Metric label="Missing city" value={quality.missingCity} tone={quality.missingCity ? "amber" : "emerald"} />
              <Metric label="Missing country" value={quality.missingCountry} tone={quality.missingCountry ? "amber" : "emerald"} />
              <Metric label="Archived" value={quality.archived} />
              {missingGps.length > 0 && (
                <div>
                  <button onClick={() => setShowUngrouped(v => !v)} className="text-xs font-semibold text-amber-700">Missing GPS list</button>
                  {showUngrouped && (
                    <div className="mt-2 max-h-32 overflow-auto space-y-1">
                      {missingGps.slice(0, 25).map(a => (
                        <button key={a.id} onClick={() => selectAddress(a)} className="block w-full text-left rounded-lg border border-amber-100 bg-amber-50 px-2 py-1 text-[11px] text-slate-600">
                          {recordName(a)}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {analysisMode === "radius" && (
            <div className="rounded-xl border border-slate-100 p-3 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold text-slate-800">Radius Analysis</p>
                <Badge className="bg-emerald-100 text-emerald-700">{radiusResults.length} addresses</Badge>
              </div>
              <p className="text-xs text-slate-400">Select an address or click the map to set an origin.</p>
              <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400">Radius km</label>
              <input type="number" min="0.1" step="0.5" value={radiusKm} onChange={e => setRadiusKm(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs" />
              <ResultList rows={radiusResults} onSelect={selectAddress} />
              <AnalysisTeach currentUser={currentUser} keyName="radius_analysis_rule" value={{ origin: analysisOrigin, radius_km: radiusKm, count: radiusResults.length }} />
            </div>
          )}

          {analysisMode === "nearest" && (
            <div className="rounded-xl border border-slate-100 p-3 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold text-slate-800">Nearest Addresses</p>
                <Badge className="bg-blue-100 text-blue-700">{nearestResults.length} shown</Badge>
              </div>
              <p className="text-xs text-slate-400">Select an address or click the map to set an origin.</p>
              <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400">Limit</label>
              <input type="number" min="1" max="50" value={nearestLimit} onChange={e => setNearestLimit(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs" />
              <ResultList rows={nearestResults} onSelect={selectAddress} />
              <AnalysisTeach currentUser={currentUser} keyName="nearest_address_analysis" value={{ origin: analysisOrigin, limit: nearestLimit, results: nearestResults.slice(0, 5).map(r => ({ name: recordName(r.address), km: r.km })) }} />
            </div>
          )}

          {analysisMode === "coverage" && (
            <div className="rounded-xl border border-slate-100 p-3 space-y-3">
              <p className="text-sm font-bold text-slate-800">Boundary Coverage</p>
              {coverage.length === 0 ? <p className="text-xs text-slate-400">No stored boundaries were found.</p> : coverage.map(item => (
                <div key={item.boundary.id || item.boundary.boundary_name} className="rounded-lg bg-violet-50 border border-violet-100 p-2">
                  <p className="text-xs font-bold text-slate-700">{item.boundary.boundary_name || "Boundary"}</p>
                  <p className="text-[11px] text-slate-500">{item.inside.length} inside, {item.outsideCount} outside</p>
                  {currentUser?.company_id && (
                    <TeachIdjwiButton
                      user={currentUser}
                      companyId={currentUser.company_id}
                      defaultType="structure"
                      defaultKey={`territory_${String(item.boundary.boundary_name || item.boundary.id).replace(/[^a-z0-9]+/gi, "_").toLowerCase()}`}
                      defaultValue={{ boundary: item.boundary.boundary_name, inside_addresses: item.inside.length, outside_addresses: item.outsideCount }}
                      context={{ surface: "spatial_intelligence", analysis: "coverage" }}
                      label="Teach"
                      compact
                    />
                  )}
                </div>
              ))}
            </div>
          )}

          {analysisMode === "duplicates" && (
            <div className="rounded-xl border border-slate-100 p-3 space-y-2">
              <p className="text-sm font-bold text-slate-800">Duplicate Candidates</p>
              {duplicateCandidates.length === 0 ? <p className="text-xs text-slate-400">No nearby duplicate candidates found.</p> : duplicateCandidates.map(item => (
                <div key={`${item.a.id}-${item.b.id}`} className="rounded-lg border border-rose-100 bg-rose-50 px-2 py-1.5">
                  <p className="text-xs font-semibold text-slate-700">{recordName(item.a)} / {recordName(item.b)}</p>
                  <p className="text-[11px] text-rose-600">{(item.dist * 1000).toFixed(0)} meters apart</p>
                </div>
              ))}
            </div>
          )}

          {analysisMode === "outliers" && (
            <div className="rounded-xl border border-slate-100 p-3 space-y-2">
              <p className="text-sm font-bold text-slate-800">Spatial Outliers</p>
              {outliers.length === 0 ? <p className="text-xs text-slate-400">No large-distance outliers found.</p> : outliers.map(item => (
                <button key={item.address.id} onClick={() => selectAddress(item.address)} className="block w-full text-left rounded-lg border border-amber-100 bg-amber-50 px-2 py-1.5">
                  <p className="text-xs font-semibold text-slate-700">{recordName(item.address)}</p>
                  <p className="text-[11px] text-amber-700">{item.km.toFixed(1)} km from address centroid</p>
                </button>
              ))}
            </div>
          )}

          <div className="rounded-xl border border-slate-100 p-3">
            <div className="flex items-center gap-1.5 mb-2">
              <BarChart2 className="w-3.5 h-3.5 text-slate-500" />
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Verify</p>
            </div>
            <button onClick={() => openQueryBuilder(addressSql(), "spatial_addresses")} className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:border-emerald-300">
              <Database className="w-3.5 h-3.5" />
              Open address SQL
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}

function ResultList({ rows, onSelect }) {
  if (!rows.length) return <p className="text-xs text-slate-400">No results yet.</p>;
  return (
    <div className="max-h-44 overflow-auto space-y-1">
      {rows.slice(0, 30).map(item => (
        <button key={item.address.id} onClick={() => onSelect(item.address)} className="block w-full text-left rounded-lg border border-slate-100 bg-slate-50 px-2 py-1.5 hover:border-emerald-200">
          <p className="text-xs font-semibold text-slate-700">{recordName(item.address)}</p>
          <p className="text-[11px] text-slate-400">{item.km.toFixed(2)} km</p>
        </button>
      ))}
    </div>
  );
}

function AnalysisTeach({ currentUser, keyName, value }) {
  if (!currentUser?.company_id) return null;
  return (
    <TeachIdjwiButton
      user={currentUser}
      companyId={currentUser.company_id}
      defaultType="business_rule"
      defaultKey={keyName}
      defaultValue={value}
      context={{ surface: "spatial_intelligence" }}
      label="Teach"
      compact
    />
  );
}
