import React, { useMemo } from "react";
import SectionSkeleton from "./SectionSkeleton";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

const INFRA_ICONS = {
  hospital: { emoji: "🏥", color: "#ef4444" },
  clinic: { emoji: "💊", color: "#3b82f6" },
  pharmacy: { emoji: "💊", color: "#3b82f6" },
  school: { emoji: "🏫", color: "#f59e0b" },
  university: { emoji: "🎓", color: "#f59e0b" },
  kindergarten: { emoji: "👶", color: "#ec4899" },
  supermarket: { emoji: "🛒", color: "#10b981" },
  restaurant: { emoji: "🍽️", color: "#10b981" },
  bank: { emoji: "🏦", color: "#6366f1" },
  hotel: { emoji: "🏨", color: "#8b5cf6" },
  nursing_home: { emoji: "🏠", color: "#f97316" },
  veterinary: { emoji: "🐾", color: "#06b6d4" },
  gym: { emoji: "💪", color: "#84cc16" },
  police: { emoji: "👮", color: "#1d4ed8" },
  fire_station: { emoji: "🚒", color: "#dc2626" },
};

function coloredIcon(color) {
  return L.divIcon({
    html: `<div style="width:12px;height:12px;background:${color};border:2px solid white;border-radius:50%;box-shadow:0 1px 3px rgba(0,0,0,0.4)"></div>`,
    className: "",
    iconSize: [12, 12],
    iconAnchor: [6, 6],
  });
}

export default function InfrastructureSection({ data, location, loading }) {
  const overall = data?.find(r => r.infrastructure_type === "OVERALL SCORE");
  const rows = data?.filter(r => r.infrastructure_type !== "OVERALL SCORE") ?? [];
  const score = parseInt(overall?.availability) || 0;

  // eslint-disable-next-line no-unused-vars
  const mapCenter = useMemo(() => null, []);

  if (loading) return <SectionSkeleton title="Infrastructure" rows={5} />;
  if (!data) return null;

  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-slate-800">🏗️ Infrastructure Analysis</h3>
        <div className={`px-3 py-1 rounded-full text-xs font-bold ${
          score >= 60 ? "bg-rose-50 text-rose-700" :
          score >= 30 ? "bg-amber-50 text-amber-700" :
          "bg-emerald-50 text-emerald-700"
        }`}>
          Score: {score}/100
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100">
              <th className="text-left text-xs text-slate-400 pb-2 font-medium">Type</th>
              <th className="text-center text-xs text-slate-400 pb-2 font-medium">Count</th>
              <th className="text-left text-xs text-slate-400 pb-2 font-medium">Status</th>
              <th className="text-left text-xs text-slate-400 pb-2 font-medium">Signal</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const icon = INFRA_ICONS[r.infrastructure_type] || { emoji: "📍", color: "#94a3b8" };
              return (
                <tr key={i} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                  <td className="py-2 pr-4">
                    <span className="mr-1.5">{icon.emoji}</span>
                    <span className="text-slate-700 capitalize">{r.infrastructure_type.replace(/_/g, " ")}</span>
                  </td>
                  <td className="text-center py-2 font-bold text-slate-800">{r.count}</td>
                  <td className="py-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      r.availability?.includes("NONE") ? "bg-emerald-50 text-emerald-700" :
                      r.availability?.includes("SCARCE") ? "bg-amber-50 text-amber-700" :
                      r.availability?.includes("MODERATE") ? "bg-blue-50 text-blue-700" :
                      "bg-slate-100 text-slate-600"
                    }`}>
                      {r.availability?.split("—")[0]?.trim() || r.availability}
                    </span>
                  </td>
                  <td className="py-2 text-sm">{r.investment_signal}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {overall && (
        <div className={`mt-4 p-3 rounded-xl text-sm font-medium ${
          score < 30 ? "bg-emerald-50 text-emerald-800" :
          score < 60 ? "bg-amber-50 text-amber-800" :
          "bg-rose-50 text-rose-800"
        }`}>
          {overall.investment_signal}
        </div>
      )}
    </div>
  );
}