import React, { useMemo, useState } from "react";
import SectionSkeleton from "./SectionSkeleton";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell
} from "recharts";
import ClusterAnalysisView from "./ClusterAnalysisView";
import PlottableCompetitorScatter from "./PlottableCompetitorScatter";
import { PlusCircle, CheckCircle2, Loader2, X } from "lucide-react";

const RAILWAY_URL = "https://newsconseenwebapp-production.up.railway.app";

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

const DISTANCE_BUCKETS = [
  { label: "0–5 km",  min: 0,  max: 5 },
  { label: "5–10 km", min: 5,  max: 10 },
  { label: "10–20 km",min: 10, max: 20 },
  { label: "20–30 km",min: 20, max: 30 },
  { label: "30+ km",  min: 30, max: Infinity },
];

const BUCKET_COLORS = ["#ef4444", "#f97316", "#f59e0b", "#84cc16", "#22c55e"];

// ── AddToBase44 button — inline enterprise picker ────────────────────────────
function AddToBase44Button({ competitor, myEnterprises, companyId, businessType, location }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [selectedId, setSelectedId] = useState("");

  if (saved) {
    return (
      <span className="flex items-center gap-1 text-[10px] text-emerald-600 font-semibold">
        <CheckCircle2 className="w-3 h-3" /> Saved
      </span>
    );
  }

  const handleSave = async () => {
    const ent = myEnterprises.find(e => e.id === selectedId);
    if (!ent) return;
    setSaving(true);
    try {
      const resp = await fetch(`${RAILWAY_URL}/market/save-competitor`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_id:             companyId,
          linked_enterprise_id:   ent.id,
          linked_enterprise_name: ent.enterprise_name || ent.name || "",
          competitor_name:        competitor.name || "Unknown",
          competitor_type:        competitor.type || "",
          distance_km:            competitor.distance_km || null,
          address:                competitor.address || "",
          phone:                  competitor.phone || "",
          website:                competitor.website || "",
          rating:                 competitor.rating || null,
          lat:                    competitor.lat || null,
          lon:                    competitor.lon || null,
          source_location:        location || "",
          business_type:          businessType || "",
        }),
      });
      if (resp.ok) setSaved(true);
    } catch (_) {}
    setSaving(false);
    setOpen(false);
  };

  return (
    <div className="relative">
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-1 text-[10px] text-violet-600 hover:text-violet-800 font-semibold whitespace-nowrap"
          title="Add to Base44"
        >
          <PlusCircle className="w-3 h-3" /> Add
        </button>
      ) : (
        <div className="absolute right-0 top-0 z-20 bg-white border border-slate-200 rounded-xl shadow-lg p-3 w-52">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-bold text-slate-600 uppercase tracking-wide">Link to enterprise</p>
            <button onClick={() => setOpen(false)}><X className="w-3 h-3 text-slate-400" /></button>
          </div>
          <select
            className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 mb-2 bg-white"
            value={selectedId}
            onChange={e => setSelectedId(e.target.value)}
          >
            <option value="">Select enterprise…</option>
            {myEnterprises.map(e => (
              <option key={e.id} value={e.id}>{e.enterprise_name || e.name}</option>
            ))}
          </select>
          <button
            onClick={handleSave}
            disabled={!selectedId || saving}
            className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold bg-violet-600 text-white px-3 py-1.5 rounded-lg disabled:opacity-50 hover:bg-violet-700"
          >
            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
            {saving ? "Saving…" : "Save & Link"}
          </button>
        </div>
      )}
    </div>
  );
}

export default function CompetitorSection({ data, businessType, location, radiusKm, loading, myEnterprises, currentUser }) {
  const [view, setView] = useState("chart"); // "chart" | "cluster" | "map" | "table"
  const companyId = currentUser?.company_id;

  const summary = data ? data.find(r => r.name?.startsWith("SUMMARY:") || r.distance_km === 0) : null;
  const competitors = data ? data.filter(r => r.distance_km > 0).slice(0, 20) : [];

  const mapCenter = useMemo(() => {
    if (!data) return null;
    if (summary?.lat && summary?.lon) return [summary.lat, summary.lon];
    const first = data.find(r => r.lat && r.lon);
    return first ? [first.lat, first.lon] : null;
  }, [data, summary]);

  if (loading) return <SectionSkeleton title="Competitor Analysis" rows={4} />;
  if (!data) return null;

  const totalCount = competitors.length;

  const bucketData = DISTANCE_BUCKETS.map((b, i) => ({
    label: b.label,
    count: competitors.filter(c => c.distance_km >= b.min && c.distance_km < b.max).length,
    color: BUCKET_COLORS[i],
  })).filter(b => b.count > 0);

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-white border border-slate-200 rounded-xl px-3 py-2 shadow-lg text-xs">
        <p className="font-semibold text-slate-700">{label}</p>
        <p className="text-rose-600 font-bold">{payload[0].value} competitors</p>
      </div>
    );
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-bold text-slate-800">🏢 Competitor Analysis</h3>
        <div className="flex gap-1">
          {[
            { key: "chart",   label: "📊 Distance" },
            { key: "scatter", label: "✦ Scatter" },
            { key: "cluster", label: "🔵 Clusters" },
            { key: "map",     label: "🗺️ Map" },
            { key: "table",   label: "📋 Table" },
          ].map(({ key, label }) => (
            <button key={key} onClick={() => setView(key)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${view === key ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-slate-50 rounded-xl p-3 mb-4 text-sm text-slate-600">
        Found <span className="font-bold text-slate-800">{totalCount}</span> {businessType} providers within{" "}
        <span className="font-bold">{radiusKm}km</span> of {location}
      </div>

      <div className="mb-4">
        <p className="text-xs text-slate-500 mb-1.5 font-medium">Competition Density</p>
        <DensityGauge count={totalCount} ideal={Math.max(10, totalCount * 1.5)} />
      </div>

      {competitors.length === 0 ? (
        <div className="py-6 text-center text-slate-400 text-sm">🟢 No competitors found — potential first-mover advantage!</div>
      ) : (
        <>
          {/* Plottable Scatter — distance vs rating, zoom + pan */}
          {view === "scatter" && (
            <PlottableCompetitorScatter competitors={competitors} radiusKm={radiusKm} />
          )}

          {/* Cluster Analysis View */}
          {view === "cluster" && (
            <ClusterAnalysisView competitors={competitors} radiusKm={radiusKm} />
          )}

          {/* Chart View */}
          {view === "chart" && (
            <div>
              <p className="text-xs text-slate-500 mb-2 font-medium">Competitors by Distance</p>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={bucketData} barCategoryGap="30%">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#94a3b8" }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#94a3b8" }} width={28} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                    {bucketData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>

              <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
                {competitors.slice(0, 6).map((c, i) => (
                  <div key={i} className="relative bg-slate-50 rounded-xl px-3 py-2 border border-slate-100">
                    <p className="text-xs font-semibold text-slate-800 truncate pr-8">{c.name}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">{c.distance_km} km away</p>
                    {c.address && <p className="text-[10px] text-slate-400 truncate">{c.address}</p>}
                    {myEnterprises?.length > 0 && companyId && (
                      <div className="absolute top-2 right-2">
                        <AddToBase44Button
                          competitor={c}
                          myEnterprises={myEnterprises}
                          companyId={companyId}
                          businessType={businessType}
                          location={location}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Map View */}
          {view === "map" && mapCenter && (
            <div className="h-72 rounded-xl overflow-hidden border border-slate-100">
              <MapContainer center={mapCenter} zoom={11} style={{ height: "100%", width: "100%" }} scrollWheelZoom={false} zoomControl={false}>
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                {summary?.lat && <Marker position={[summary.lat, summary.lon]} icon={centerIcon}><Popup>📍 {location} (center)</Popup></Marker>}
                {competitors.filter(c => c.lat && c.lon).map((c, i) => (
                  <Marker key={i} position={[c.lat, c.lon]} icon={redIcon}>
                    <Popup><div className="text-sm"><strong>{c.name}</strong><br />{c.address && <span className="text-xs text-slate-500">{c.address}</span>}<br /><span className="text-xs">{c.distance_km} km away</span></div></Popup>
                  </Marker>
                ))}
              </MapContainer>
            </div>
          )}

          {/* Table View */}
          {view === "table" && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="text-left text-xs text-slate-400 pb-2 font-medium">#</th>
                    <th className="text-left text-xs text-slate-400 pb-2 font-medium">Name</th>
                    <th className="text-left text-xs text-slate-400 pb-2 font-medium">Distance</th>
                    {myEnterprises?.length > 0 && companyId && (
                      <th className="text-left text-xs text-slate-400 pb-2 font-medium">Add</th>
                    )}
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
                      {myEnterprises?.length > 0 && companyId && (
                        <td className="py-1.5 relative">
                          <AddToBase44Button
                            competitor={c}
                            myEnterprises={myEnterprises}
                            companyId={companyId}
                            businessType={businessType}
                            location={location}
                          />
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}