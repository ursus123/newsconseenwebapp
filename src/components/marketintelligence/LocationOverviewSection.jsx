import React from "react";
import SectionSkeleton from "./SectionSkeleton";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

// Fix leaflet default icon
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

const weatherIcon = (temp) => {
  if (temp === null || temp === undefined) return "";
  if (temp > 30) return "☀️";
  if (temp > 20) return "🌤️";
  if (temp > 10) return "⛅";
  if (temp > 0) return "🌥️";
  return "❄️";
};

export default function LocationOverviewSection({ data, loading }) {
  if (loading) return <SectionSkeleton title="Location Overview" rows={4} />;
  if (!data) return null;

  const d = data[0];
  if (!d) return (
    <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
      <h3 className="text-sm font-bold text-slate-800 mb-2">📍 Location Overview</h3>
      <p className="text-slate-400 text-sm">No location data found.</p>
    </div>
  );

  const hasMap = d.lat && d.lon;

  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
      <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
        📍 Location Overview
      </h3>
      <div className="flex flex-col lg:flex-row gap-4">
        <div className="flex-1 grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[
            { label: "City / Place", value: d.city || d.place },
            { label: "Country", value: d.country },
            { label: "Region", value: d.continent || d.subregion },
            { label: "Currency", value: d.currency ? `${d.currency} — ${d.currency_name}` : "—" },
            { label: "Language", value: d.language || "—" },
            { label: "Timezone", value: d.timezone || "—" },
            { label: "Calling Code", value: d.calling_code || "—" },
            { label: "GDP / Capita", value: d.gdp_per_capita_usd ? `$${d.gdp_per_capita_usd}` : "—" },
            { label: "Population", value: d.country_population ? d.country_population.toLocaleString() : "—" },
          ].map(({ label, value }) => (
            <div key={label} className="bg-slate-50 rounded-xl p-3">
              <p className="text-[10px] text-slate-400 uppercase tracking-wider font-medium">{label}</p>
              <p className="text-sm font-semibold text-slate-800 mt-0.5 truncate">{value || "—"}</p>
            </div>
          ))}
          {d.current_temp_c !== null && d.current_temp_c !== undefined && (
            <div className="bg-blue-50 rounded-xl p-3">
              <p className="text-[10px] text-blue-400 uppercase tracking-wider font-medium">Temperature</p>
              <p className="text-sm font-semibold text-blue-800 mt-0.5">
                {d.current_temp_c}°C {weatherIcon(d.current_temp_c)}
              </p>
            </div>
          )}
        </div>

        {hasMap && (
          <div className="lg:w-72 h-52 rounded-xl overflow-hidden border border-slate-100 shrink-0">
            <MapContainer
              center={[d.lat, d.lon]}
              zoom={10}
              style={{ height: "100%", width: "100%" }}
              scrollWheelZoom={false}
              zoomControl={false}
            >
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              <Marker position={[d.lat, d.lon]}>
                <Popup>{d.city || d.place}</Popup>
              </Marker>
            </MapContainer>
          </div>
        )}
      </div>
    </div>
  );
}