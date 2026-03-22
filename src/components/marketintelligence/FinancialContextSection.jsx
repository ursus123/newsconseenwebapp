import React from "react";
import { TrendingUp, TrendingDown, Minus, Loader2 } from "lucide-react";
import SectionSkeleton from "./SectionSkeleton";

const BIZ_TO_LABEL = {
  home_healthcare: "Amedisys (Home Healthcare)",
  clinic:          "UnitedHealth Group (Healthcare)",
  pharmacy:        "CVS Health",
  school:          "Strategic Education",
  restaurant:      "McDonald's (Restaurant)",
  hotel:           "Marriott (Hospitality)",
  gym:             "Planet Fitness",
  nursing_home:    "Ensign Group (SNF)",
  hospital:        "HCA Healthcare",
};

function TrendIcon({ value }) {
  if (value > 0.3)  return <TrendingUp   className="w-4 h-4 text-emerald-500" />;
  if (value < -0.3) return <TrendingDown  className="w-4 h-4 text-rose-500" />;
  return              <Minus className="w-4 h-4 text-slate-400" />;
}

export default function FinancialContextSection({ fedData, stockData, businessType, isUS, loading }) {
  if (loading && !fedData && !stockData) return <SectionSkeleton title="💹 Financial Context" />;
  if (!fedData && !stockData) return null;

  const latestFed  = fedData?.[0];
  const stock      = stockData?.[0];

  const fedRate    = latestFed?.value;
  const fedTrend   = latestFed?.trend_signal || "";
  const fedInterp  = latestFed?.interpretation || "";

  const stockChange = stock?.change_pct;
  const stockSignal = stock?.signal || "";

  // Investment climate based on fed rate + stock
  let climate = null;
  if (fedRate != null && stock) {
    const borrowingGood = fedRate < 4;
    const stockPositive = (stockChange || 0) >= 0;
    if (borrowingGood && stockPositive)      climate = { label: "FAVORABLE", color: "text-emerald-600", bg: "bg-emerald-50", icon: "✅" };
    else if (!borrowingGood && !stockPositive) climate = { label: "CHALLENGING", color: "text-rose-600", bg: "bg-rose-50", icon: "🔴" };
    else                                     climate = { label: "NEUTRAL", color: "text-amber-600", bg: "bg-amber-50", icon: "⚠️" };
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5">
      <h3 className="text-base font-semibold text-slate-800 mb-4 flex items-center gap-2">
        💹 Financial Context
      </h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Fed Rate */}
        {latestFed && (
          <div className="bg-slate-50 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-lg">🏦</span>
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Fed Funds Rate</span>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-2xl font-bold text-slate-800">{fedRate?.toFixed(2)}%</span>
              {fedTrend && (
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                  fedTrend === "FALLING" ? "bg-emerald-100 text-emerald-700" :
                  fedTrend === "RISING"  ? "bg-rose-100 text-rose-700" :
                                           "bg-slate-100 text-slate-600"
                }`}>
                  {fedTrend === "FALLING" ? "↓ " : fedTrend === "RISING" ? "↑ " : "→ "}{fedTrend}
                </span>
              )}
            </div>
            {fedInterp && <p className="text-xs text-slate-500 mt-1">{fedInterp}</p>}
          </div>
        )}

        {/* Sector Stock */}
        {stock && (
          <div className="bg-slate-50 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-lg">📈</span>
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Sector Stock</span>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-2xl font-bold text-slate-800">${stock.current_price?.toLocaleString()}</span>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                (stockChange || 0) >= 0 ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
              }`}>
                {(stockChange || 0) >= 0 ? "+" : ""}{stockChange?.toFixed(2)}%
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">{stock.symbol} — {BIZ_TO_LABEL[businessType] || stock.company_name}</p>
            {stockSignal && <p className="text-xs text-slate-400 mt-0.5">{stockSignal}</p>}
          </div>
        )}

        {/* Investment Climate */}
        {climate && (
          <div className={`sm:col-span-2 ${climate.bg} rounded-xl p-4 flex items-center gap-3`}>
            <span className="text-2xl">{climate.icon}</span>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-0.5">Investment Climate</p>
              <p className={`text-sm font-bold ${climate.color}`}>{climate.label} — {
                climate.label === "FAVORABLE"   ? "rates falling, sector performing well" :
                climate.label === "CHALLENGING" ? "high borrowing costs, sector pressure" :
                                                  "mixed signals — monitor closely"
              }</p>
            </div>
          </div>
        )}

        {/* Loading placeholders */}
        {loading && !latestFed && (
          <div className="bg-slate-50 rounded-xl p-4 flex items-center gap-2 text-slate-400">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-xs">Loading Fed data…</span>
          </div>
        )}
        {loading && !stock && (
          <div className="bg-slate-50 rounded-xl p-4 flex items-center gap-2 text-slate-400">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-xs">Loading sector stock…</span>
          </div>
        )}
      </div>
    </div>
  );
}