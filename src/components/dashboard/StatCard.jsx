import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

const colorMap = {
  emerald: {
    gradient: "from-emerald-500 to-emerald-600 shadow-emerald-500/20",
    ring:     "ring-emerald-100",
    trend:    "text-emerald-600 bg-emerald-50",
    trendNeg: "text-rose-600 bg-rose-50",
  },
  blue: {
    gradient: "from-blue-500 to-blue-600 shadow-blue-500/20",
    ring:     "ring-blue-100",
    trend:    "text-blue-600 bg-blue-50",
    trendNeg: "text-rose-600 bg-rose-50",
  },
  amber: {
    gradient: "from-amber-500 to-amber-600 shadow-amber-500/20",
    ring:     "ring-amber-100",
    trend:    "text-amber-600 bg-amber-50",
    trendNeg: "text-rose-600 bg-rose-50",
  },
  purple: {
    gradient: "from-purple-500 to-purple-600 shadow-purple-500/20",
    ring:     "ring-purple-100",
    trend:    "text-purple-600 bg-purple-50",
    trendNeg: "text-rose-600 bg-rose-50",
  },
  rose: {
    gradient: "from-rose-500 to-rose-600 shadow-rose-500/20",
    ring:     "ring-rose-100",
    trend:    "text-rose-600 bg-rose-50",
    trendNeg: "text-emerald-600 bg-emerald-50",
  },
  teal: {
    gradient: "from-teal-500 to-teal-600 shadow-teal-500/20",
    ring:     "ring-teal-100",
    trend:    "text-teal-600 bg-teal-50",
    trendNeg: "text-rose-600 bg-rose-50",
  },
  cyan: {
    gradient: "from-cyan-500 to-cyan-600 shadow-cyan-500/20",
    ring:     "ring-cyan-100",
    trend:    "text-cyan-600 bg-cyan-50",
    trendNeg: "text-rose-600 bg-rose-50",
  },
};

// ── Skeleton ─────────────────────────────────────────────────────────────────
function SkeletonCard() {
  return (
    <div className="bg-white rounded-2xl p-6 border border-slate-100 animate-pulse">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="h-3 w-24 bg-slate-100 rounded mb-3" />
          <div className="h-8 w-16 bg-slate-100 rounded mb-2" />
          <div className="h-2.5 w-32 bg-slate-100 rounded" />
        </div>
        <div className="w-12 h-12 rounded-2xl bg-slate-100" />
      </div>
    </div>
  );
}

// ── Trend badge ──────────────────────────────────────────────────────────────
function TrendBadge({ trend, colors }) {
  if (trend === null || trend === undefined) return null;
  const abs = Math.abs(trend);
  const isUp = trend > 0;
  const isFlat = trend === 0;

  const cls = isFlat
    ? "text-slate-400 bg-slate-50"
    : isUp
    ? colors.trend
    : colors.trendNeg;

  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${cls}`}>
      {isFlat
        ? <Minus className="w-2.5 h-2.5" />
        : isUp
        ? <TrendingUp className="w-2.5 h-2.5" />
        : <TrendingDown className="w-2.5 h-2.5" />}
      {isFlat ? "flat" : `${abs}%`}
    </span>
  );
}

/**
 * StatCard
 *
 * Props:
 *   title        string     — label above the value
 *   value        number     — big number
 *   icon         Component  — lucide icon
 *   color        string     — emerald | blue | amber | purple | rose | teal | cyan
 *   subtitle     string     — small line below value
 *   subtitleColor string    — tailwind text class (default text-slate-400)
 *   loading      bool       — show skeleton
 *   trend        number     — % change vs prev period (e.g. 12 = +12%, -5 = -5%)
 *   trendLabel   string     — "vs last week" etc.
 *   insight      string     — short AI-style insight sentence
 *   to           string     — react-router path — makes whole card clickable
 *   onClick      fn         — alternative to `to`
 */
export default function StatCard({
  title,
  value,
  icon: Icon,
  color = "emerald",
  subtitle,
  subtitleColor,
  loading,
  trend,
  trendLabel,
  insight,
  to,
  onClick,
}) {
  if (loading) return <SkeletonCard />;

  const colors = colorMap[color] || colorMap.emerald;
  const isClickable = !!(to || onClick);

  const inner = (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={`bg-white rounded-2xl p-6 border border-slate-100 transition-all duration-200 ${
        isClickable
          ? "cursor-pointer hover:shadow-lg hover:shadow-slate-100 hover:-translate-y-0.5 active:translate-y-0"
          : "hover:shadow-md hover:shadow-slate-100"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider truncate">
              {title}
            </p>
            {(trend !== null && trend !== undefined) && (
              <TrendBadge trend={trend} colors={colors} />
            )}
          </div>
          <p className="text-3xl font-bold text-slate-800 tabular-nums">
            {typeof value === "number" ? value.toLocaleString() : value}
          </p>
          {subtitle && (
            <p className={`text-xs mt-1 truncate ${subtitleColor || "text-slate-400"}`}>
              {subtitle}
            </p>
          )}
          {trendLabel && (
            <p className="text-[10px] text-slate-300 mt-0.5">{trendLabel}</p>
          )}
          {insight && (
            <p className="text-[11px] text-slate-500 italic mt-2 leading-snug border-t border-slate-50 pt-2">
              {insight}
            </p>
          )}
        </div>
        <div
          className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${colors.gradient} flex items-center justify-center shadow-lg shrink-0`}
        >
          <Icon className="w-6 h-6 text-white" />
        </div>
      </div>

      {isClickable && (
        <p className="text-[10px] text-slate-300 mt-3 text-right">
          View details →
        </p>
      )}
    </motion.div>
  );

  if (to) return <Link to={to}>{inner}</Link>;
  if (onClick) return <div onClick={onClick}>{inner}</div>;
  return inner;
}
