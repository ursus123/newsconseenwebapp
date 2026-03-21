import React, { useEffect, useRef } from "react";

export default function MapChart({ data, height = 400 }) {
  const mapInstanceRef = useRef(null);
  const containerId = useRef(`map-${Math.random().toString(36).slice(2)}`);

  useEffect(() => {
    if (!data?.length) return;

    const loadLeaflet = async () => {
      if (!window.L) {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
        document.head.appendChild(link);

        await new Promise((resolve) => {
          const script = document.createElement("script");
          script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
          script.onload = resolve;
          document.head.appendChild(script);
        });
      }

      const L = window.L;

      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }

      const container = document.getElementById(containerId.current);
      if (!container) return;

      const lats = data.map((r) => parseFloat(r.lat)).filter((n) => !isNaN(n));
      const lons = data.map((r) => parseFloat(r.lon)).filter((n) => !isNaN(n));
      if (!lats.length) return;

      const centerLat = lats.reduce((a, b) => a + b, 0) / lats.length;
      const centerLon = lons.reduce((a, b) => a + b, 0) / lons.length;

      const map = L.map(containerId.current).setView([centerLat, centerLon], 12);
      mapInstanceRef.current = map;

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap contributors",
        maxZoom: 19,
      }).addTo(map);

      data.forEach((row) => {
        const lat = parseFloat(row.lat);
        const lon = parseFloat(row.lon);
        if (isNaN(lat) || isNaN(lon)) return;

        const popupFields = Object.entries(row)
          .filter(([k]) => k !== "lat" && k !== "lon")
          .map(([k, v]) => `<b>${k.replace(/_/g, " ")}:</b> ${v ?? "—"}`)
          .join("<br>");

        L.marker([lat, lon])
          .bindPopup(
            `<div style="font-size:12px;min-width:150px">${popupFields || "No extra data"}</div>`,
            { maxWidth: 300 }
          )
          .addTo(map);
      });

      if (lats.length > 1) {
        const bounds = L.latLngBounds(
          data
            .filter((r) => !isNaN(parseFloat(r.lat)))
            .map((r) => [parseFloat(r.lat), parseFloat(r.lon)])
        );
        map.fitBounds(bounds, { padding: [20, 20] });
      }
    };

    loadLeaflet();

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [data]);

  if (!data?.length) {
    return (
      <div className="flex items-center justify-center h-40 text-slate-400 text-sm">
        No data to display on map
      </div>
    );
  }

  if (!("lat" in data[0]) || !("lon" in data[0])) {
    return (
      <div className="flex items-center justify-center h-40 text-slate-400 text-sm">
        Map requires <code className="mx-1 px-1 bg-slate-100 rounded">lat</code> and{" "}
        <code className="mx-1 px-1 bg-slate-100 rounded">lon</code> columns in results
      </div>
    );
  }

  return (
    <div>
      <div className="text-xs text-slate-500 mb-2">📍 {data.length} location{data.length !== 1 ? "s" : ""} plotted</div>
      <div
        id={containerId.current}
        style={{ height: `${height}px` }}
        className="rounded-xl overflow-hidden border border-slate-200"
      />
    </div>
  );
}