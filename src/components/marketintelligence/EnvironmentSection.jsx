import React from "react";
import { Loader2 } from "lucide-react";
import SectionSkeleton from "./SectionSkeleton";

function RiskBadge({ level }) {
  const map = {
    "MINIMAL RISK": { color: "bg-emerald-100 text-emerald-700", icon: "✅" },
    "LOW RISK":     { color: "bg-emerald-100 text-emerald-700", icon: "✅" },
    "LOW":          { color: "bg-emerald-100 text-emerald-700", icon: "✅" },
    "MODERATE RISK":{ color: "bg-amber-100 text-amber-700",    icon: "⚠️" },
    "MODERATE":     { color: "bg-amber-100 text-amber-700",    icon: "⚠️" },
    "ELEVATED":     { color: "bg-amber-100 text-amber-700",    icon: "⚠️" },
    "HIGH RISK":    { color: "bg-rose-100 text-rose-700",      icon: "🔴" },
    "HIGH":         { color: "bg-rose-100 text-rose-700",      icon: "🔴" },
    "EXTREME":      { color: "bg-rose-100 text-rose-700",      icon: "🔴" },
  };
  const cfg = map[level] || { color: "bg-slate-100 text-slate-600", icon: "—" };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${cfg.color}`}>
      {cfg.icon} {level}
    </span>
  );
}

function AQIBadge({ aqi }) {
  if (aqi == null) return null;
  const color =
    aqi <= 50  ? "bg-emerald-100 text-emerald-700" :
    aqi <= 100 ? "bg-yellow-100 text-yellow-700" :
    aqi <= 150 ? "bg-orange-100 text-orange-700" :
                 "bg-rose-100 text-rose-700";
  const label =
    aqi <= 50  ? "Good" :
    aqi <= 100 ? "Moderate" :
    aqi <= 150 ? "Unhealthy for Sensitive" : "Unhealthy";
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${color}`}>
      AQI {aqi} — {label}
    </span>
  );
}

export default function EnvironmentSection({ climateData, airData, loading }) {
  if (loading && !climateData && !airData) return <SectionSkeleton title="🌡️ Environmental Factors" />;
  if (!climateData && !airData) return null;

  const climate = climateData?.[0] || null;
  const air     = airData?.[0]     || null;

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5">
      <h3 className="text-base font-semibold text-slate-800 mb-4 flex items-center gap-2">
        🌡️ Environmental Factors
      </h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Climate Risk */}
        {climate && (
          <div className="bg-slate-50 rounded-xl p-4 space-y-2">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Climate Risk</p>

            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-600">Overall Risk</span>
              <RiskBadge level={climate.overall_risk_level} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-600">Heat Risk</span>
              <RiskBadge level={climate.heat_risk} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-600">Cold Risk</span>
              <RiskBadge level={climate.cold_risk} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-600">Flood Risk</span>
              <RiskBadge level={climate.flood_risk} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-600">Wind Risk</span>
              <RiskBadge level={climate.wind_risk} />
            </div>
          </div>
        )}

        {/* Stats + Air Quality */}
        <div className="bg-slate-50 rounded-xl p-4 space-y-2">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Conditions (16-day)</p>

          {climate && (
            <>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-600">Avg High Temp</span>
                <span className="text-xs font-semibold text-slate-800">{climate.avg_high_temp_c}°C</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-600">Avg Low Temp</span>
                <span className="text-xs font-semibold text-slate-800">{climate.avg_low_temp_c}°C</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-600">Rainy Days</span>
                <span className="text-xs font-semibold text-slate-800">{climate.rainy_days} / 16</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-600">Business Climate</span>
                <span className="text-xs font-semibold text-slate-800">{climate.business_climate_rating}</span>
              </div>
            </>
          )}

          {air?.us_aqi != null && (
            <div className="flex items-center justify-between pt-1">
              <span className="text-xs text-slate-600">Air Quality</span>
              <AQIBadge aqi={air.us_aqi} />
            </div>
          )}

          {climate && (
            <div className="flex items-center justify-between pt-1">
              <span className="text-xs text-slate-600">Suitable for Elderly</span>
              <span className={`text-xs font-semibold ${climate.suitable_for_elderly === "YES" ? "text-emerald-600" : climate.suitable_for_elderly === "NO" ? "text-rose-600" : "text-amber-600"}`}>
                {climate.suitable_for_elderly}
              </span>
            </div>
          )}
        </div>

        {/* Recommendation */}
        {climate?.recommendation && (
          <div className="sm:col-span-2 bg-slate-50 rounded-xl p-3">
            <p className="text-xs text-slate-700">{climate.recommendation}</p>
          </div>
        )}

        {loading && (
          <div className="flex items-center gap-2 text-slate-400">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span className="text-xs">Loading environmental data…</span>
          </div>
        )}
      </div>
    </div>
  );
}