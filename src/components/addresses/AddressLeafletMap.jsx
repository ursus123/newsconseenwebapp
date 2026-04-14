/**
 * AddressLeafletMap
 *
 * Interactive Leaflet map showing all geocoded addresses as pins.
 * - OpenStreetMap tiles (no API key)
 * - Custom divIcon markers coloured by address_type
 * - Click marker → detail popup
 * - Auto-fits bounds to all markers on load
 * - Non-geocoded addresses listed in a sidebar strip
 * - Distance measurement mode (click two pins → Haversine km)
 * - Collapsible filter panel (address_type + status chips)
 * - onAutoGeocode prop wires to external geocode-all handler
 */
import { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MapPin, AlertCircle, Ruler, X, ChevronDown, ChevronUp } from "lucide-react";

/* ── Type colours ─────────────────────────────────────────────────────────── */
const TYPE_COLORS = {
  operational: "#10b981",   // emerald
  supplier:    "#3b82f6",   // blue
  government:  "#8b5cf6",   // violet
  residential: "#f59e0b",   // amber
  other:       "#64748b",   // slate
};
const ARCHIVED_COLOR = "#94a3b8";

function colorForAddress(addr) {
  if (addr.status === "archived") return ARCHIVED_COLOR;
  return TYPE_COLORS[addr.address_type] || TYPE_COLORS.other;
}

/* ── Pin icon factory ─────────────────────────────────────────────────────── */
const iconCache = {};
function makeIcon(color, highlight = false) {
  const key = `${color}-${highlight}`;
  if (iconCache[key]) return iconCache[key];
  const ring = highlight ? `<circle cx="14" cy="14" r="10" fill="none" stroke="${color}" stroke-width="3" stroke-dasharray="4 2" opacity="0.8"/>` : "";
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

/* ── Haversine distance ───────────────────────────────────────────────────── */
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/* ── FitBounds ────────────────────────────────────────────────────────────── */
function FitBounds({ points }) {
  const map = useMap();
  useEffect(() => {
    if (!map || !points.length) return;
    try {
      const bounds = L.latLngBounds(points.map((p) => [parseFloat(p.latitude), parseFloat(p.longitude)]));
      if (bounds.isValid()) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
    } catch (_) {}
  }, [map, points]);
  return null;
}

/* ── FilterChip ───────────────────────────────────────────────────────────── */
function FilterChip({ label, active, onClick, color }) {
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-all capitalize ${
        active ? "text-white border-transparent shadow-sm" : "bg-white text-slate-500 border-slate-200 hover:border-slate-400"
      }`}
      style={active ? { backgroundColor: color || "#10b981", borderColor: color || "#10b981" } : {}}
    >
      {label}
    </button>
  );
}

/* ── Main component ───────────────────────────────────────────────────────── */
export default function AddressLeafletMap({ addresses = [], onAddressClick, onAutoGeocode }) {
  // Distance measurement state
  const [measureMode, setMeasureMode] = useState(false);
  const [pinA, setPinA] = useState(null);
  const [pinB, setPinB] = useState(null);

  // Filter state
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [typeFilter, setTypeFilter] = useState(null);   // null = All
  const [statusFilter, setStatusFilter] = useState(null); // null = All

  // Filtered addresses
  const filtered = useMemo(() => {
    return addresses.filter(a => {
      if (typeFilter && (a.address_type || "other") !== typeFilter) return false;
      if (statusFilter && (a.status || "active") !== statusFilter) return false;
      return true;
    });
  }, [addresses, typeFilter, statusFilter]);

  const geocoded    = useMemo(() => filtered.filter(a => a.latitude && a.longitude), [filtered]);
  const notGeocoded = useMemo(() => filtered.filter(a => !a.latitude || !a.longitude), [filtered]);

  const center = useMemo(() => {
    if (!geocoded.length) return [20, 0];
    const avgLat = geocoded.reduce((s, a) => s + parseFloat(a.latitude), 0) / geocoded.length;
    const avgLng = geocoded.reduce((s, a) => s + parseFloat(a.longitude), 0) / geocoded.length;
    return [avgLat, avgLng];
  }, [geocoded]);

  // Distance result
  const distance = useMemo(() => {
    if (!pinA || !pinB) return null;
    const km = haversineKm(parseFloat(pinA.latitude), parseFloat(pinA.longitude), parseFloat(pinB.latitude), parseFloat(pinB.longitude));
    return { km: km.toFixed(2), labelA: pinA.label || pinA.address_line1 || "Address A", labelB: pinB.label || pinB.address_line1 || "Address B" };
  }, [pinA, pinB]);

  const handlePinClick = (addr) => {
    if (!measureMode) {
      onAddressClick && onAddressClick(addr);
      return;
    }
    if (!pinA) { setPinA(addr); return; }
    if (!pinB && addr.id !== pinA.id) { setPinB(addr); return; }
    // Third click — reset
    setPinA(addr);
    setPinB(null);
  };

  const toggleMeasure = () => {
    setMeasureMode(v => !v);
    setPinA(null);
    setPinB(null);
  };

  const notGeocodedAll = useMemo(() => addresses.filter(a => !a.latitude || !a.longitude), [addresses]);

  if (!addresses.length) return null;

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50/50 flex-wrap gap-2">
        <div>
          <p className="text-sm font-semibold text-slate-800">Address Map</p>
          <p className="text-[10px] text-slate-400">
            {geocoded.length} of {filtered.length} addresses plotted · click a pin to view details
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Geocode missing button */}
          {onAutoGeocode && notGeocodedAll.length > 0 && (
            <button
              onClick={onAutoGeocode}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold rounded-lg border border-amber-300 text-amber-700 bg-amber-50 hover:bg-amber-100 transition-colors"
            >
              <MapPin className="w-3.5 h-3.5" />
              Geocode missing ({notGeocodedAll.length})
            </button>
          )}
          {/* Measure distance toggle */}
          <button
            onClick={toggleMeasure}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold rounded-lg border transition-colors ${
              measureMode
                ? "bg-indigo-600 text-white border-indigo-600"
                : "border-slate-200 text-slate-600 bg-white hover:border-slate-400"
            }`}
          >
            <Ruler className="w-3.5 h-3.5" />
            {measureMode ? "Cancel Measure" : "Measure Distance"}
          </button>
          {/* Filter toggle */}
          <button
            onClick={() => setFiltersOpen(v => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold rounded-lg border border-slate-200 text-slate-600 bg-white hover:border-slate-400 transition-colors"
          >
            Filters {filtersOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
          {/* Legend */}
          <div className="flex items-center gap-2 text-[10px] text-slate-500">
            {Object.entries(TYPE_COLORS).map(([type, color]) => (
              <span key={type} className="flex items-center gap-1 capitalize">
                <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: color }} /> {type}
              </span>
            ))}
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full inline-block bg-slate-400" /> Archived
            </span>
          </div>
        </div>
      </div>

      {/* Filter panel */}
      {filtersOpen && (
        <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex flex-wrap gap-4">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Type:</span>
            <FilterChip label="All" active={!typeFilter} onClick={() => setTypeFilter(null)} color="#64748b" />
            {Object.entries(TYPE_COLORS).map(([type, color]) => (
              <FilterChip key={type} label={type} active={typeFilter === type} onClick={() => setTypeFilter(typeFilter === type ? null : type)} color={color} />
            ))}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Status:</span>
            <FilterChip label="All" active={!statusFilter} onClick={() => setStatusFilter(null)} color="#64748b" />
            <FilterChip label="Active" active={statusFilter === "active"} onClick={() => setStatusFilter(statusFilter === "active" ? null : "active")} color="#10b981" />
            <FilterChip label="Archived" active={statusFilter === "archived"} onClick={() => setStatusFilter(statusFilter === "archived" ? null : "archived")} color="#94a3b8" />
          </div>
        </div>
      )}

      {/* Measure mode instruction banner */}
      {measureMode && (
        <div className="px-4 py-2 bg-indigo-50 border-b border-indigo-100 text-[11px] text-indigo-700 font-medium flex items-center gap-2">
          <Ruler className="w-3.5 h-3.5 shrink-0" />
          {!pinA ? "Click a pin to set Point A" : !pinB ? `Point A: "${pinA.label || pinA.address_line1}" — now click Point B` : "Click any pin to reset"}
        </div>
      )}

      {/* Distance result banner */}
      {distance && (
        <div className="px-4 py-2.5 bg-emerald-50 border-b border-emerald-200 flex items-center gap-3">
          <Ruler className="w-4 h-4 text-emerald-600 shrink-0" />
          <p className="text-sm font-semibold text-emerald-800">
            Distance: {distance.km} km (straight line)
          </p>
          <p className="text-xs text-emerald-600">
            {distance.labelA} → {distance.labelB}
          </p>
          <button onClick={() => { setPinA(null); setPinB(null); }} className="ml-auto text-emerald-500 hover:text-emerald-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Map */}
      <div style={{ height: 460 }}>
        <MapContainer center={center} zoom={geocoded.length === 1 ? 14 : 4} style={{ width: "100%", height: "100%" }}
          scrollWheelZoom zoomControl>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {geocoded.length > 1 && <FitBounds points={geocoded} />}
          {geocoded.map((addr) => {
            const color = colorForAddress(addr);
            const isSelected = (pinA?.id === addr.id || pinB?.id === addr.id);
            const icon = makeIcon(color, measureMode || isSelected);
            return (
              <Marker
                key={addr.id}
                position={[parseFloat(addr.latitude), parseFloat(addr.longitude)]}
                icon={icon}
                eventHandlers={{ click: () => { try { handlePinClick(addr); } catch (_) {} } }}
              >
                <Popup>
                  <div className="text-sm leading-snug" style={{ minWidth: 180 }}>
                    <p className="font-semibold text-slate-800 mb-0.5">{addr.label || addr.address_line1 || "Address"}</p>
                    {addr.address_line1 && addr.label !== addr.address_line1 && (
                      <p className="text-xs text-slate-500">{addr.address_line1}</p>
                    )}
                    <p className="text-xs text-slate-500">{[addr.city, addr.state_region, addr.country].filter(Boolean).join(", ")}</p>
                    {addr.postal_code && <p className="text-xs text-slate-400">{addr.postal_code}</p>}
                    {addr.address_type && <p className="text-xs capitalize mt-0.5" style={{ color }}>{addr.address_type}</p>}
                    {!measureMode && (
                      <button onClick={() => onAddressClick && onAddressClick(addr)} className="mt-2 text-xs text-emerald-600 font-semibold hover:underline">
                        View details →
                      </button>
                    )}
                    {measureMode && (
                      <p className="mt-1 text-xs text-indigo-600 font-medium">
                        {pinA?.id === addr.id ? "📍 Point A" : pinB?.id === addr.id ? "📍 Point B" : "Click to select"}
                      </p>
                    )}
                  </div>
                </Popup>
              </Marker>
            );
          })}
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
