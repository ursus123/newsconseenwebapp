import React, { useState, useMemo } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup, Polygon } from "react-leaflet";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Badge } from "@/components/ui/badge";
import {
  MapPin, Building2, Tractor, Home, Layers,
  Loader2, Grid3X3, Circle as CircleIcon, Map,
} from "lucide-react";

const RAILWAY_URL = "https://newsconseenwebapp-production.up.railway.app";

const MODES = [
  { value: "pins",       label: "Pins",       Icon: MapPin },
  { value: "clusters",   label: "Clusters",   Icon: CircleIcon },
  { value: "density",    label: "Density",    Icon: Grid3X3 },
  { value: "boundaries", label: "Boundaries", Icon: Map },
];

const LAYERS = [
  { value: "enterprises", label: "Enterprises", Icon: Building2, color: "#059669" },
  { value: "addresses",   label: "Addresses",   Icon: Home,      color: "#2563eb" },
  { value: "plots",       label: "Plots",       Icon: Tractor,   color: "#d97706" },
];

const LAYER_COLOR = {
  enterprise:  "#059669",
  enterprises: "#059669",
  address:     "#2563eb",
  addresses:   "#2563eb",
  plot:        "#d97706",
  plots:       "#d97706",
};

// ── Data fetchers ──────────────────────────────────────────────────────────────

async function fetchPins(companyId, layers) {
  try {
    const r = await fetch(
      `${RAILWAY_URL}/postgis/spatial-pins?company_id=${companyId}&entity_layers=${layers.join(",")}&limit=1000`
    );
    if (r.ok) {
      const d = await r.json();
      if (d.pins?.length > 0) return d.pins;
    }
  } catch (_) {}
  // Fallback: read Base44 directly
  try {
    const [enterprises, addresses] = await Promise.all([
      base44.entities.Enterprise.filter({ company_id: companyId }).catch(() => []),
      base44.entities.Address.filter({ company_id: companyId }).catch(() => []),
    ]);
    const pins = [];
    enterprises.forEach(e => {
      if (e.latitude && e.longitude && layers.includes("enterprises"))
        pins.push({
          entity_layer: "enterprise",
          name:         e.enterprise_name || "Enterprise",
          entity_type:  e.enterprise_type,
          status:       e.status,
          latitude:     parseFloat(e.latitude),
          longitude:    parseFloat(e.longitude),
        });
    });
    addresses.forEach(a => {
      if (a.latitude && a.longitude && layers.includes("addresses"))
        pins.push({
          entity_layer: "address",
          name:         a.label || a.address_line1 || "Address",
          entity_type:  a.address_type,
          status:       null,
          latitude:     parseFloat(a.latitude),
          longitude:    parseFloat(a.longitude),
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
    const r = await fetch(
      `${RAILWAY_URL}/postgis/spatial-density?company_id=${companyId}&entity_layers=${layers.join(",")}&grid_degrees=${gridDegrees}`
    );
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

// ── Component ──────────────────────────────────────────────────────────────────

export default function MapView() {
  const [mode, setMode]               = useState("pins");
  const [activeLayers, setActiveLayers] = useState(["enterprises", "addresses"]);
  const [gridDegrees, setGridDegrees] = useState(0.1);

  const { data: currentUser = null } = useQuery({
    queryKey: ["currentUser"],
    queryFn:  () => base44.auth.me(),
  });
  const companyId = currentUser?.company_id;

  const { data: pins = [], isLoading: pinsLoading } = useQuery({
    queryKey: ["spatial-pins", companyId, activeLayers],
    queryFn:  () => fetchPins(companyId, activeLayers),
    enabled:  !!companyId && mode === "pins",
    staleTime: 30000,
  });

  const { data: clustersPayload, isLoading: clustersLoading } = useQuery({
    queryKey: ["spatial-clusters", companyId],
    queryFn:  () => fetchClusters(companyId),
    enabled:  !!companyId && mode === "clusters",
    staleTime: 60000,
  });

  const { data: densityPayload, isLoading: densityLoading } = useQuery({
    queryKey: ["spatial-density", companyId, activeLayers, gridDegrees],
    queryFn:  () => fetchDensity(companyId, activeLayers, gridDegrees),
    enabled:  !!companyId && mode === "density",
    staleTime: 60000,
  });

  const { data: boundariesPayload, isLoading: boundariesLoading } = useQuery({
    queryKey: ["spatial-boundaries", companyId],
    queryFn:  () => fetchBoundaries(companyId),
    enabled:  !!companyId && mode === "boundaries",
    staleTime: 60000,
  });

  const clusters     = clustersPayload?.clusters || [];
  const densityCells = densityPayload?.cells      || [];
  const boundaries   = boundariesPayload?.boundaries || [];

  const isLoading = pinsLoading || clustersLoading || densityLoading || boundariesLoading;

  const hasData = (
    (mode === "pins"       && pins.length > 0) ||
    (mode === "clusters"   && clusters.length > 0) ||
    (mode === "density"    && densityCells.length > 0) ||
    (mode === "boundaries" && boundaries.length > 0)
  );

  // Map centre
  const center = useMemo(() => {
    let pts = [];
    if (mode === "pins"     && pins.length)         pts = pins;
    if (mode === "clusters" && clusters.length)      pts = clusters.map(c => ({ latitude: c.centroid_lat, longitude: c.centroid_lng }));
    if (mode === "density"  && densityCells.length)  pts = densityCells.map(c => ({ latitude: c.grid_lat, longitude: c.grid_lng }));
    if (!pts.length) return [20, 0];
    const lat = pts.reduce((s, p) => s + (p.latitude  || 0), 0) / pts.length;
    const lng = pts.reduce((s, p) => s + (p.longitude || 0), 0) / pts.length;
    return [lat, lng];
  }, [mode, pins, clusters, densityCells]);

  const maxDensity     = useMemo(() => Math.max(...densityCells.map(c => c.count), 1), [densityCells]);
  const maxCluster     = useMemo(() => Math.max(...clusters.map(c => c.member_count || 1), 1), [clusters]);

  const byLayer = useMemo(() => {
    if (mode !== "pins") return {};
    return pins.reduce((acc, p) => {
      const lyr = p.entity_layer || "unknown";
      acc[lyr] = (acc[lyr] || 0) + 1;
      return acc;
    }, {});
  }, [pins, mode]);

  const toggleLayer = (lyr) =>
    setActiveLayers(prev =>
      prev.includes(lyr) ? prev.filter(l => l !== lyr) : [...prev, lyr]
    );

  return (
    <div className="flex flex-col h-full bg-white rounded-xl border border-slate-200 overflow-hidden">
      {/* ── Header ── */}
      <div className="px-6 py-4 border-b border-slate-100 space-y-3">
        <div className="flex items-center gap-2">
          <MapPin className="w-5 h-5 text-emerald-600" />
          <h2 className="text-lg font-semibold text-slate-800">Spatial Intelligence</h2>
          {mode === "pins" && pins.length > 0 && (
            <Badge className="bg-emerald-100 text-emerald-700 ml-1">
              {pins.length} location{pins.length !== 1 ? "s" : ""}
            </Badge>
          )}
          {mode === "clusters" && clusters.length > 0 && (
            <Badge className="bg-blue-100 text-blue-700 ml-1">
              {clusters.length} cluster{clusters.length !== 1 ? "s" : ""}
            </Badge>
          )}
          {mode === "density" && densityCells.length > 0 && (
            <Badge className="bg-purple-100 text-purple-700 ml-1">
              {densityPayload?.total_records || 0} records · {densityCells.length} cells
            </Badge>
          )}
        </div>

        {/* Mode tabs */}
        <div className="flex items-center gap-1">
          {MODES.map(({ value, label, Icon }) => (
            <button
              key={value}
              onClick={() => setMode(value)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all border
                ${mode === value
                  ? "bg-emerald-600 text-white border-emerald-600"
                  : "bg-white text-slate-600 border-slate-200 hover:border-emerald-300"}`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>

        {/* Layer toggles */}
        {mode !== "boundaries" && (
          <div className="flex items-center gap-2 flex-wrap">
            <Layers className="w-4 h-4 text-slate-400 shrink-0" />
            {LAYERS.map(({ value, label, Icon, color }) => {
              const active = activeLayers.includes(value);
              return (
                <button
                  key={value}
                  onClick={() => toggleLayer(value)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all border
                    ${active ? "text-white border-transparent" : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"}`}
                  style={active ? { backgroundColor: color, borderColor: color } : {}}
                >
                  <Icon className="w-3 h-3" />
                  {label}
                </button>
              );
            })}
            {mode === "density" && (
              <div className="ml-auto flex items-center gap-1.5 text-xs text-slate-500">
                <span>Grid:</span>
                {[0.05, 0.1, 0.5, 1.0].map(g => (
                  <button
                    key={g}
                    onClick={() => setGridDegrees(g)}
                    className={`px-2 py-0.5 rounded border text-xs transition-all
                      ${gridDegrees === g ? "bg-slate-700 text-white border-slate-700" : "border-slate-200 hover:border-slate-400"}`}
                  >
                    {g}°
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Layer stats */}
        {mode === "pins" && Object.keys(byLayer).length > 0 && (
          <div className="flex items-center gap-4">
            {Object.entries(byLayer).map(([lyr, cnt]) => (
              <span key={lyr} className="flex items-center gap-1.5 text-xs text-slate-500">
                <span
                  className="inline-block w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: LAYER_COLOR[lyr] || "#64748b" }}
                />
                <span className="capitalize">{lyr}</span>: {cnt}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* ── Map ── */}
      <div className="flex-1 relative">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/80 z-40">
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="w-6 h-6 text-emerald-600 animate-spin" />
              <p className="text-sm text-slate-500">Loading spatial data...</p>
            </div>
          </div>
        )}

        {!isLoading && !hasData && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-50">
            <div className="text-center">
              <MapPin className="w-12 h-12 text-slate-300 mx-auto mb-2" />
              <p className="text-slate-500 text-sm">No spatial data found</p>
              <p className="text-slate-400 text-xs mt-1">
                {mode === "boundaries"
                  ? "Upload boundary polygons via POST /postgis/boundaries"
                  : "Add latitude/longitude to enterprises, addresses, or plots"}
              </p>
            </div>
          </div>
        )}

        <MapContainer
          key={`map-${mode}`}
          center={center}
          zoom={hasData ? 5 : 2}
          className="h-full w-full"
          zoomAnimation={false}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution="&copy; OpenStreetMap contributors"
          />

          {/* PINS */}
          {mode === "pins" && pins.map((pin, i) => (
            <CircleMarker
              key={pin.id || `pin-${i}`}
              center={[pin.latitude, pin.longitude]}
              radius={7}
              pathOptions={{
                fillColor:   LAYER_COLOR[pin.entity_layer] || "#64748b",
                fillOpacity: 0.85,
                color:       "#fff",
                weight:      1.5,
              }}
            >
              <Popup>
                <div className="text-sm space-y-1 min-w-[180px]">
                  <p className="font-semibold text-slate-800">{pin.name || "—"}</p>
                  <p className="text-slate-500 capitalize">
                    {pin.entity_layer} · {pin.entity_type || "—"}
                  </p>
                  {pin.status && <p className="text-slate-500">Status: {pin.status}</p>}
                  {pin.address_label && <p className="text-slate-500">{pin.address_label}</p>}
                  <p className="text-slate-400 text-xs">
                    {pin.latitude?.toFixed(4)}, {pin.longitude?.toFixed(4)}
                  </p>
                </div>
              </Popup>
            </CircleMarker>
          ))}

          {/* CLUSTERS */}
          {mode === "clusters" && clusters.map((cl, i) => {
            const r = 6 + Math.round((cl.member_count / maxCluster) * 28);
            return (
              <CircleMarker
                key={cl.cluster_id ?? `cluster-${i}`}
                center={[cl.centroid_lat, cl.centroid_lng]}
                radius={r}
                pathOptions={{
                  fillColor:   "#2563eb",
                  fillOpacity: 0.6,
                  color:       "#1d4ed8",
                  weight:      1.5,
                }}
              >
                <Popup>
                  <div className="text-sm space-y-1 min-w-[160px]">
                    <p className="font-semibold">Cluster {cl.cluster_id ?? i + 1}</p>
                    <p className="text-slate-600">{cl.member_count} members</p>
                    <p className="text-slate-400 text-xs">
                      {cl.centroid_lat?.toFixed(4)}, {cl.centroid_lng?.toFixed(4)}
                    </p>
                  </div>
                </Popup>
              </CircleMarker>
            );
          })}

          {/* DENSITY */}
          {mode === "density" && densityCells.map((cell, i) => {
            const intensity = cell.count / maxDensity;
            const r   = 8 + Math.round(intensity * 36);
            const hue = Math.round(120 - intensity * 120);
            return (
              <CircleMarker
                key={`density-${i}`}
                center={[cell.grid_lat, cell.grid_lng]}
                radius={r}
                pathOptions={{
                  fillColor:   `hsl(${hue},80%,45%)`,
                  fillOpacity: 0.55,
                  color:       `hsl(${hue},80%,30%)`,
                  weight:      1,
                }}
              >
                <Popup>
                  <div className="text-sm space-y-1 min-w-[160px]">
                    <p className="font-semibold">{cell.count} records</p>
                    <p className="text-slate-500 capitalize">Dominant: {cell.dominant_layer}</p>
                    {Object.entries(cell.layer_breakdown || {}).map(([lyr, cnt]) => (
                      <p key={lyr} className="text-xs text-slate-400 capitalize">{lyr}: {cnt}</p>
                    ))}
                    <p className="text-slate-400 text-xs">
                      {cell.grid_lat?.toFixed(3)}, {cell.grid_lng?.toFixed(3)}
                    </p>
                  </div>
                </Popup>
              </CircleMarker>
            );
          })}

          {/* BOUNDARIES */}
          {mode === "boundaries" && boundaries.map((b, i) => {
            if (!b.geojson?.coordinates?.[0]) return null;
            const positions = b.geojson.coordinates[0].map(([lng, lat]) => [lat, lng]);
            return (
              <Polygon
                key={b.id || `boundary-${i}`}
                positions={positions}
                pathOptions={{
                  color:       "#7c3aed",
                  fillColor:   "#8b5cf6",
                  fillOpacity: 0.15,
                  weight:      2,
                }}
              >
                <Popup>
                  <div className="text-sm space-y-1 min-w-[160px]">
                    <p className="font-semibold">{b.boundary_name}</p>
                    <p className="text-slate-500 capitalize">{b.boundary_type}</p>
                  </div>
                </Popup>
              </Polygon>
            );
          })}
        </MapContainer>
      </div>
    </div>
  );
}
