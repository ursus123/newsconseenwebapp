export const CHART_COLORS = [
  "#2563eb", "#10b981", "#8b5cf6", "#f59e0b",
  "#ef4444", "#06b6d4", "#6366f1", "#14b8a6",
  "#f97316", "#ec4899",
];

export const SEMANTIC_COLORS = {
  success: "#10b981",
  warning: "#f59e0b",
  danger:  "#ef4444",
  neutral: "#64748b",
  revenue: "#059669",
  expense: "#e11d48",
  ml:      "#8b5cf6",
  market:  "#2563eb",
};

export function titleize(value) {
  if (value === null || value === undefined || value === "") return "Unknown";
  return String(value)
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

export function compactNumber(value, { currency, percent = false } = {}) {
  if (value === null || value === undefined || value === "") return "-";
  const n = Number(value);
  if (Number.isNaN(n)) return String(value);

  const opts = {
    maximumFractionDigits: Math.abs(n) >= 100 ? 0 : 1,
    notation: Math.abs(n) >= 100000 ? "compact" : "standard",
  };
  if (currency) {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: Math.abs(n) >= 100 ? 0 : 2,
      notation: Math.abs(n) >= 100000 ? "compact" : "standard",
    }).format(n);
  }
  if (percent) return `${n.toLocaleString(undefined, { maximumFractionDigits: 1 })}%`;
  return new Intl.NumberFormat(undefined, opts).format(n);
}

export function inferUnit(key = "", chart = {}) {
  const joined = `${key} ${chart.title || ""} ${chart.description || ""}`.toLowerCase();
  if (joined.includes("rate") || joined.includes("percent") || joined.includes("%")) return "percent";
  if (joined.includes("amount") || joined.includes("revenue") || joined.includes("expense") || joined.includes("cost") || joined.includes("price") || joined.includes("p&l")) return "currency";
  return "count";
}

export function formatChartValue(value, key, chart = {}) {
  const unit = chart.value_unit || inferUnit(key, chart);
  const currency = chart.currency || chart.currency_code;
  if (unit === "currency") return compactNumber(value, { currency: currency || undefined });
  if (unit === "percent") return compactNumber(value, { percent: true });
  return compactNumber(value);
}

export function sourceMeta(chart = {}, fallback = {}) {
  if (chart.sql_query || chart.sql) {
    const sql = String(chart.sql_query || chart.sql).toLowerCase();
    if (sql.includes("analytics_") || sql.includes("analytics.")) {
      return { label: "Analytics", detail: "Live datamart query", tone: "emerald" };
    }
    if (sql.includes("raw_") || sql.includes("raw.")) {
      return { label: "Raw", detail: "Raw warehouse rows", tone: "blue" };
    }
    return { label: "Query", detail: "Live query", tone: "indigo" };
  }
  if (fallback.source) return sourceMeta({ source: fallback.source });
  if (chart.tool_name) return { label: "Idjwi", detail: "Tool re-called live", tone: "violet" };
  if (chart.table_snapshot) return { label: "Snapshot", detail: "Saved table result", tone: "slate" };
  if (chart.source === "query") return { label: "Query", detail: "Live query", tone: "indigo" };
  if (chart.source === "copilot" || chart.source === "idjwi") return { label: "Idjwi", detail: "Pinned insight", tone: "violet" };
  if (chart.source === "base44" || fallback.source === "base44") return { label: "Live", detail: "Live records", tone: "blue" };
  if (chart.source === "ml") return { label: "ML", detail: "Model output", tone: "violet" };
  if (chart.source === "public") return { label: "Public API", detail: "External source", tone: "amber" };
  return { label: fallback.label || "Local", detail: fallback.detail || "Current page data", tone: "slate" };
}

export function freshnessLabel(date) {
  if (!date) return "";
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  const diff = Date.now() - d.getTime();
  const minutes = Math.max(0, Math.round(diff / 60000));
  if (minutes < 1) return "refreshed just now";
  if (minutes < 60) return `refreshed ${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `refreshed ${hours}h ago`;
  return `refreshed ${d.toLocaleDateString()}`;
}

export function rowCountLabel(rows) {
  if (!Array.isArray(rows)) return "";
  return `${rows.length.toLocaleString()} row${rows.length === 1 ? "" : "s"}`;
}

export function shouldShowBarLabels(rows = [], key) {
  if (!Array.isArray(rows) || rows.length === 0 || rows.length > 12) return false;
  return rows.every((r) => Number.isFinite(Number(r?.[key])));
}

export function makeChartDescription({ chart, entity, sql, rows }) {
  const meta = sourceMeta(chart || {}, { source: sql ? "query" : "local" });
  const count = rowCountLabel(rows);
  return [
    chart?.description,
    entity ? `From ${entity} analytics` : "",
    meta.detail,
    count,
  ].filter(Boolean).join(" · ");
}
