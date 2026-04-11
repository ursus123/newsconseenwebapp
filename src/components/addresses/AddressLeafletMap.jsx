/**
 * AddressLeafletMap
 *
 * Interactive Leaflet map showing all geocoded addresses as pins.
 * - OpenStreetMap tiles (no API key)
 * - Custom divIcon markers (avoids Vite default-icon issue)
 * - Click marker → detail popup
 * - Auto-fits bounds to all markers on load
 * - Non-geocoded addresses listed in a sidebar strip
 */
import { useEffect, useMemo } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MapPin, AlertCircle } from "lucide-react";

/* ── Custom circular pin icon (no broken image risk) ──────────────────────── */
function makeIcon(color = "#10b981") {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="28" height="36" viewBox="0 0 28 36">
      <path d="M14 0C6.27 0 0 6.27 0 14c0 9.63 14 22 14 22S28 23.63 28 14C28 6.27 21.73 0 14 0z"
            fill="${color}" stroke="white" stroke-width="2"/>
      <circle cx="14" cy="14" r="5" fill="white"/>
    </svg>`;
  return L.divIcon({
    html: svg,
    className: "",
    iconSize: [28, 36],
    iconAnchor: [14, 36],
    popupAnchor: [0, -36],
  });
}

const ACTIVE_ICON   = makeIcon("#10b981");   // emerald — active
const ARCHIVED_ICON = makeIcon("#94a3b8");   // slate   — archived

/* ── FitBounds — child component that reads map context ───────────────────── */
function FitBounds({ points }) {
  const map = useMap();
  useEffect(() => {
    if (!points.length) return;
    const bounds = L.latLngBounds(points.map((p) => [p.latitude, p.longitude]));
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
  }, [map, points]);
  return null;
}

/* ── Main component ────────────────────────────────────────────────────────── */
export default function AddressLeafletMap({ addresses = [], onAddressClick }) {
  const geocoded    = useMemo(() => addresses.filter((a) => a.latitude && a.longitude), [addresses]);
  const notGeocoded = useMemo(() => addresses.filter((a) => !a.latitude || !a.longitude), [addresses]);

  const center = useMemo(() => {
    if (!geocoded.length) return [20, 0];
    const avgLat = geocoded.reduce((s, a) => s + parseFloat(a.latitude),  0) / geocoded.length;
    const avgLng = geocoded.reduce((s, a) => s + parseFloat(a.longitude), 0) / geocoded.length;
    return [avgLat, avgLng];
  }, [geocoded]);

  if (!addresses.length) return null;

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50/50">
        <div>
          <p className="text-sm font-semibold text-slate-800">Address Map</p>
          <p className="text-[10px] text-slate-400">
            {geocoded.length} of {addresses.length} addresses plotted · click a pin to view details
          </p>
        </div>
        <div className="flex items-center gap-3 text-[10px] text-slate-500">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" /> Active
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-slate-400 inline-block" /> Archived
          </span>
        </div>
      </div>

      {/* Map */}
      <div style={{ height: 460 }}>
        <MapContainer center={center} zoom={geocoded.length === 1 ? 14 : 4} style={{ width: "100%", height: "100%" }}
          scrollWheelZoom zoomControl>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {geocoded.length > 1 && <FitBounds points={geocoded} />}
          {geocoded.map((addr) => (
            <Marker
              key={addr.id}
              position={[parseFloat(addr.latitude), parseFloat(addr.longitude)]}
              icon={addr.status === "archived" ? ARCHIVED_ICON : ACTIVE_ICON}
              eventHandlers={{ click: () => onAddressClick && onAddressClick(addr) }}
            >
              <Popup>
                <div className="text-sm leading-snug" style={{ minWidth: 180 }}>
                  <p className="font-semibold text-slate-800 mb-0.5">{addr.label || addr.address_line1 || "Address"}</p>
                  {addr.address_line1 && addr.label !== addr.address_line1 && (
                    <p className="text-xs text-slate-500">{addr.address_line1}</p>
                  )}
                  <p className="text-xs text-slate-500">{[addr.city, addr.state_region, addr.country].filter(Boolean).join(", ")}</p>
                  {addr.postal_code && <p className="text-xs text-slate-400">{addr.postal_code}</p>}
                  <button
                    onClick={() => onAddressClick && onAddressClick(addr)}
                    className="mt-2 text-xs text-emerald-600 font-semibold hover:underline"
                  >
                    View details →
                  </button>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>

      {/* Non-geocoded strip */}
      {notGeocoded.length > 0 && (
        <div className="px-4 py-3 border-t border-slate-100 bg-amber-50/60">
          <p className="text-xs font-semibold text-amber-700 mb-2 flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5" />
            {notGeocoded.length} address{notGeocoded.length > 1 ? "es" : ""} not plotted — no GPS coordinates
          </p>
          <div className="flex flex-wrap gap-1.5">
            {notGeocoded.map((a) => (
              <button
                key={a.id}
                onClick={() => onAddressClick && onAddressClick(a)}
                className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg bg-white border border-amber-200 text-slate-600 hover:border-amber-400 transition-colors"
              >
                <MapPin className="w-3 h-3 text-amber-500" />
                {a.label || a.address_line1 || "Unlabelled"}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
