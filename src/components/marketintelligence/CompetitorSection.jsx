import React, { useMemo } from "react";
import SectionSkeleton from "./SectionSkeleton";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

const redIcon = L.divIcon({
  html: `<div style="width:14px;height:14px;background:#ef4444;border:2px solid white;border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,0.5)"></div>`,
  className: "",
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

const centerIcon = L.divIcon({
  html: `<div style="width:18px;height:18px;background:#10b981;border:3px solid white;border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,0.5)"></div>`,
  className: "",
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

function renderStars(rating) {
  if (!rating) return "—";
  const full = Math.round(rating);
  return "⭐".repeat(Math.min(full, 5));
}

function DensityGauge({ count, ideal }) {
  const pct = Math.min(100, ideal > 0 ? (count / ideal) * 100 : 0);
  const label = pct < 30 ? "Low" : pct < 70 ? "Moderate" : "High";
  const color = pct < 30 ? "bg-emerald-400" : pct < 70 ? "bg-amber-400" : "bg-rose-400";
  return (
    <div className="flex items-center gap-3 text-xs">
      <span className="text-slate-400 w-8">Low</span>
      <div className="flex-1 bg-slate-100 rounded-full h-2.5 relative">
        <div className={`${color} h-2.5 rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-slate-400 w-8 text-right">High</span>
      <span className={`font-bold ml-1 ${pct < 30 ? "text-emerald-600" : pct < 70 ? "text-amber-600" : "text-rose-600"}`}>{label}</span>
    </div>
  );
}

export default function CompetitorSection({ data, businessType, location, radiusKm, loading }) {
  if (loading) return <SectionSkeleton title="Competitor Analysis" rows={4} />;
  if (!data) return null;

  const summary = data.find(r => r.name?.startsWith("SUMMARY:") || r.distance_km === 0);
  const competitors = data.filter(r => r.distance_km > 0).slice(0, 20);

  const mapCenter = useMemo(() => {
    if (summary?.lat && summary?.lon) return [summary.lat, summary.lon];
    const first = data.find(r => r.lat && r.lon);
    return first ? [first.lat, first.lon] : null;
  }, [data, summary]);

  const totalCount = competitors.length;

  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
      <h3 className="text-sm font-bold text-slate-800 mb-2">🏢 Competitor Analysis</h3>

      <div className="bg-slate-50 rounded-xl p-3 mb-4 text-sm text-slate-600">
        Found <span className="font-bold text-slate-800">{totalCount}</span> {businessType} providers within{" "}
        <span className="font-bold">{radiusKm}km</span> of {location}
      </div>

      <div className="mb-3">
        <p className="text-xs text-slate-500 mb-1.5 font-medium">Competition Density</p>
        <DensityGauge count={totalCount} ideal={Math.max(10, totalCount * 1.5)} />
      </div>

      <div className="flex flex-col lg:flex-row gap-4">
        {mapCenter && (
          <div className="lg:w-72 h-56 rounded-xl overflow-hidden border border-slate-100 shrink-0">
            <MapContainer
              center={mapCenter}
              zoom={11}
              style={{ height: "100%", width: "100%" }}
              scrollWheelZoom={false}
              zoomControl={false}
            >
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              {summary?.lat && (
                <Marker position={[summary.lat, summary.lon]} icon={centerIcon}>
                  <Popup>📍 {location} (center)</Popup>
                </Marker>
              )}
              {competitors.filter(c => c.lat && c.lon).map((c, i) => (
                <Marker key={i} position={[c.lat, c.lon]} icon={redIcon}>
                  <Popup>
                    <div className="text-sm">
                      <strong>{c.name}</strong><br />
                      {c.address && <span className="text-xs text-slate-500">{c.address}</span>}<br />
                      <span className="text-xs">{c.distance_km} km away</span>
                    </div>
                  </Popup>
                </Marker>
              ))}
            </MapContainer>
          </div>
        )}

        <div className="flex-1 overflow-x-auto">
          {competitors.length === 0 ? (
            <div className="py-6 text-center text-slate-400 text-sm">
              🟢 No competitors found — potential first-mover advantage!
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left text-xs text-slate-400 pb-2 font-medium">#</th>
                  <th className="text-left text-xs text-slate-400 pb-2 font-medium">Name</th>
                  <th className="text-left text-xs text-slate-400 pb-2 font-medium">Distance</th>
                </tr>
              </thead>
              <tbody>
                {competitors.slice(0, 15).map((c, i) => (
                  <tr key={i} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="py-1.5 pr-2 text-slate-400 text-xs">{i + 1}</td>
                    <td className="py-1.5 pr-4">
                      <p className="font-medium text-slate-800 truncate max-w-[200px]">{c.name}</p>
                      {c.address && <p className="text-xs text-slate-400 truncate">{c.address}</p>}
                    </td>
                    <td className="py-1.5 text-slate-500 text-xs whitespace-nowrap">{c.distance_km} km</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}