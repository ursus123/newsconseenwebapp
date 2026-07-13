// ==============================================================
// GeoMap — enterprise/address map with density heatmap + clusters
// Uses react-leaflet (already installed).
// Reads from /postgis/density and /postgis/clusters endpoints.
// Falls back to raw geospatial_summary dot map if PostGIS not set up.
// ==============================================================

import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { MapPin, Layers, Loader2, AlertCircle } from "lucide-react";
import { RAILWAY_URL } from "@/utils/fetchWithFallback";
import { authHeaders } from "@/config/api";

// Lazy-load Leaflet to avoid SSR issues
let L;
let MapContainer, TileLayer, CircleMarker, Popup, useMap;

async function loadLeaflet() {
  if (L) return;
  const leaflet = await import("leaflet");
  const reactLeaflet = await import("react-leaflet");
  L = leaflet.default;
  MapContainer   = reactLeaflet.MapContainer;
  TileLayer      = reactLeaflet.TileLayer;
  CircleMarker   = reactLeaflet.CircleMarker;
  Popup          = reactLeaflet.Popup;
  useMap         = reactLeaflet.useMap;
  // Fix Leaflet default icon path broken by bundlers
  delete L.Icon.Default.prototype._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
    iconUrl:       "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
    shadowUrl:     "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  });
}

// ── Data fetchers ─────────────────────────────────────────────────────────────

async function fetchDensity(companyId, gridDegrees = 0.3) {
  try {
    const res = await fetch(
      `${RAILWAY_URL}/postgis/density?company_id=${encodeURIComponent(companyId)}&grid_degrees=${gridDegrees}`,
      { headers: await authHeaders() }
    );
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

async function fetchClusters(companyId) {
  try {
    const res = await fetch(
      `${RAILWAY_URL}/postgis/clusters?company_id=${encodeURIComponent(companyId)}`,
      { headers: await authHeaders() }
    );
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

async function fetchRawGeo(companyId) {
  // Fallback: raw geospatial_summary dot map
  try {
    const res = await fetch(
      `${RAILWAY_URL}/geospatial-summary?company_id=${encodeURIComponent(companyId)}`
    );
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data.filter(r => r.latitude && r.longitude) : [];
  } catch {
    return [];
  }
}

// ── Colour scale for density heatmap ─────────────────────────────────────────

function densityColor(count, maxCount) {
  const ratio = Math.min(count / Math.max(maxCount, 1), 1);
  if (ratio > 0.75) return "#ef4444"; // red   — high density
  if (ratio > 0.5)  return "#f97316"; // orange
  if (ratio > 0.25) return "#eab308"; // yellow
  return "#22c55e";                   // green  — low density
}

// ── Map view fitter ───────────────────────────────────────────────────────────

function FitBounds({ points }) {
  const map = useMap?.();
  useEffect(() => {
    if (!map || !points.length || !L) return;
    try {
      const bounds = L.latLngBounds(points.map(p => [p.lat, p.lng]));
      if (bounds.isValid()) map.fitBounds(bounds, { padding: [40, 40] });
    } catch {}
  }, [map, points]);
  return null;
}

// ── Main component ────────────────────────────────────────────────────────────

export default function GeoMap({ companyId }) {
  const [leafletReady, setLeafletReady] = useState(false);
  const [mode, setMode]                 = useState("density"); // "density" | "clusters" | "dots"
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    loadLeaflet().then(() => {
      if (mountedRef.current) setLeafletReady(true);
    });
    return () => { mountedRef.current = false; };
  }, []);

  const { data: densityData, isLoading: loadingDensity } = useQuery({
    queryKey: ["geo-density", companyId],
    queryFn:  () => fetchDensity(companyId),
    enabled:  !!companyId && leafletReady,
    staleTime: 10 * 60 * 1000,
  });

  const { data: clusterData, isLoading: loadingClusters } = useQuery({
    queryKey: ["geo-clusters", companyId],
    queryFn:  () => fetchClusters(companyId),
    enabled:  !!companyId && leafletReady,
    staleTime: 10 * 60 * 1000,
  });

  const { data: rawDots = [], isLoading: loadingDots } = useQuery({
    queryKey: ["geo-raw", companyId],
    queryFn:  () => fetchRawGeo(companyId),
    enabled:  !!companyId && leafletReady,
    staleTime: 10 * 60 * 1000,
  });

  const postgisAvailable = densityData && !densityData.error;
  const cells    = densityData?.cells ?? [];
  const clusters = clusterData?.clusters ?? [];
  const isLoading = loadingDensity || loadingClusters || loadingDots;

  // Auto-switch to dots if PostGIS not available
  const effectiveMode = postgisAvailable ? mode : "dots";

  const maxCount = cells.length ? Math.max(...cells.map(c => c.count)) : 1;

  // Collect all points for FitBounds
  const allPoints = effectiveMode === "density"
    ? cells.map(c => ({ lat: c.grid_lat, lng: c.grid_lng }))
    : effectiveMode === "clusters"
    ? clusters.map(c => ({ lat: c.centroid_lat, lng: c.centroid_lng }))
    : rawDots.map(d => ({ lat: d.latitude, lng: d.longitude }));

  const defaultCenter = allPoints.length
    ? [allPoints[0].lat, allPoints[0].lng]
    : [0, 20]; // Africa centre

  if (!leafletReady) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-5">
        <div className="h-64 flex items-center justify-center text-slate-300">
          <Loader2 className="w-6 h-6 animate-spin mr-2" />
          <span className="text-sm">Loading map…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <MapPin className="w-4 h-4 text-emerald-500" />
          <h3 className="text-sm font-semibold text-slate-700">Location Intelligence</h3>
          {!postgisAvailable && (
            <span className="text-[10px] text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
              PostGIS offline — dot view
            </span>
          )}
        </div>

        {postgisAvailable && (
          <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1">
            {[
              { key: "density", label: "Heatmap" },
              { key: "clusters", label: "Clusters" },
              { key: "dots", label: "Dots" },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setMode(key)}
                className={`text-xs px-3 py-1 rounded-lg font-medium transition-colors ${
                  mode === key
                    ? "bg-white text-slate-800 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Map */}
      <div className="rounded-xl overflow-hidden border border-slate-100" style={{ height: 320 }}>
        {isLoading && allPoints.length === 0 ? (
          <div className="h-full flex items-center justify-center bg-slate-50 text-slate-300">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            <span className="text-sm">Loading data…</span>
          </div>
        ) : allPoints.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center bg-slate-50 text-slate-300">
            <MapPin className="w-8 h-8 mb-2 opacity-30" />
            <p className="text-sm">No location data yet</p>
            <p className="text-xs mt-1">Run POST /load/geospatial-summary to populate</p>
          </div>
        ) : (
          <MapContainer
            center={defaultCenter}
            zoom={5}
            style={{ height: "100%", width: "100%" }}
            scrollWheelZoom={false}
          >
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://openstreetmap.org">OpenStreetMap</a>'
            />

            <FitBounds points={allPoints} />

            {/* Density heatmap — grid cells coloured by count */}
            {effectiveMode === "density" && cells.map((cell, i) => (
              <CircleMarker
                key={i}
                center={[cell.grid_lat, cell.grid_lng]}
                radius={Math.max(8, Math.min(28, cell.count * 3))}
                pathOptions={{
                  color:       densityColor(cell.count, maxCount),
                  fillColor:   densityColor(cell.count, maxCount),
                  fillOpacity: 0.55,
                  weight:      1,
                }}
              >
                <Popup>
                  <div className="text-xs">
                    <p className="font-bold">{cell.count} location{cell.count !== 1 ? "s" : ""}</p>
                    <p className="text-slate-500">{cell.enterprise_types?.join(", ") || "Mixed types"}</p>
                  </div>
                </Popup>
              </CircleMarker>
            ))}

            {/* Cluster bubbles — sized by member count */}
            {effectiveMode === "clusters" && clusters.map((c, i) => (
              <CircleMarker
                key={i}
                center={[c.centroid_lat, c.centroid_lng]}
                radius={Math.max(10, Math.min(32, c.member_count * 4))}
                pathOptions={{
                  color:       "#6366f1",
                  fillColor:   "#6366f1",
                  fillOpacity: 0.6,
                  weight:      2,
                }}
              >
                <Popup>
                  <div className="text-xs">
                    <p className="font-bold">Cluster {c.cluster_id}</p>
                    <p className="text-slate-600">{c.member_count} locations</p>
                    <p className="text-slate-500 mt-1">{c.members?.slice(0, 3).join(", ")}{c.member_count > 3 ? "…" : ""}</p>
                  </div>
                </Popup>
              </CircleMarker>
            ))}

            {/* Dot map — raw coordinates fallback */}
            {effectiveMode === "dots" && rawDots.map((d, i) => (
              <CircleMarker
                key={i}
                center={[d.latitude, d.longitude]}
                radius={6}
                pathOptions={{
                  color:       "#10b981",
                  fillColor:   "#10b981",
                  fillOpacity: 0.7,
                  weight:      1.5,
                }}
              >
                <Popup>
                  <div className="text-xs">
                    <p className="font-bold">{d.name || "Location"}</p>
                    {d.enterprise_type && <p className="text-slate-500 capitalize">{d.enterprise_type.replace(/_/g, " ")}</p>}
                    {d.primary_address && <p className="text-slate-400 mt-1">{d.primary_address}</p>}
                    {d.status && <p className="text-slate-400 capitalize mt-0.5">{d.status}</p>}
                  </div>
                </Popup>
              </CircleMarker>
            ))}
          </MapContainer>
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-3 text-[10px] text-slate-400">
        {effectiveMode === "density" && (
          <>
            <span>Density:</span>
            {[
              { color: "#22c55e", label: "Low" },
              { color: "#eab308", label: "Med" },
              { color: "#f97316", label: "High" },
              { color: "#ef4444", label: "Very high" },
            ].map(({ color, label }) => (
              <span key={label} className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full inline-block" style={{ background: color }} />
                {label}
              </span>
            ))}
          </>
        )}
        {effectiveMode === "clusters" && (
          <span>{clusters.length} cluster{clusters.length !== 1 ? "s" : ""} · bubble size = member count</span>
        )}
        {effectiveMode === "dots" && (
          <span>{rawDots.length} location{rawDots.length !== 1 ? "s" : ""} · click a dot for details</span>
        )}
        <span className="ml-auto">© OpenStreetMap</span>
      </div>
    </div>
  );
}
