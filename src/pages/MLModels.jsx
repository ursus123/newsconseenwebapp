import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import {
  Brain, Play, Save, Plus, Trash2, ChevronDown, ChevronUp,
  Loader2, CheckCircle2, AlertTriangle, Code2, BarChart2,
  TrendingDown, Users, Clock, X, Cpu, Activity, Layers, Zap,
  RefreshCw, Database, Upload,
} from "lucide-react";
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

const RAILWAY_URL = "https://newsconseenwebapp-production.up.railway.app";
const RAILWAY_API_KEY = (import.meta["env"] || {})["VITE_RAILWAY_API_KEY"] || "";
const API_HEADERS = { "x-api-key": RAILWAY_API_KEY, "Content-Type": "application/json" };

// ── System default models ──────────────────────────────────────────────────────
const SYSTEM_MODELS = [
  {
    id: "retention-risk",
    name: "Retention Risk",
    description: "Cox Proportional Hazards survival model — predicts which clients or staff are likely to churn within 30 days based on engagement and activity patterns.",
    icon: TrendingDown,
    bg: "bg-rose-50", border: "border-rose-200", iconColor: "text-rose-600",
    tags: ["Survival Analysis", "Cox PH", "Churn"],
    endpoint: "retention-risk",
    defaultKernel: `# Retention Risk Model — Cox Proportional Hazards
# Reads from: raw.people, raw.tasks, raw.transactions
# Output saved to: raw.ml_predictions (model='retention-risk')
#
# Framework: lifelines.CoxPHFitter
# Per-enterprise isolation: company_id filter applied before fitting

import pandas as pd
import numpy as np
from lifelines import CoxPHFitter
from datetime import datetime

def run_retention_risk(company_id: str, df_people: pd.DataFrame, df_tasks: pd.DataFrame) -> list[dict]:
    """
    Predict disengagement risk for each person.
    Returns sorted list: highest risk_score first.
    """
    today = datetime.now()

    # ── Feature: days since last task activity ───────────────────────────────
    task_recency = df_tasks.groupby("person_id").agg(
        last_activity=("created_date", "max"),
        task_count=("id", "count"),
        completed_count=("status", lambda x: (x == "completed").sum()),
    ).reset_index()

    df = df_people.merge(task_recency, left_on="id", right_on="person_id", how="left")
    df["days_inactive"] = (today - pd.to_datetime(df["last_activity"])).dt.days.fillna(90).clip(1, 365)
    df["completion_rate"] = (df["completed_count"] / df["task_count"].replace(0, 1)).fillna(0)
    df["T"] = df["days_inactive"]
    df["E"] = (df["status"] == "inactive").astype(int)

    features = ["T", "E", "days_inactive", "completion_rate", "task_count"]
    df_model = df[features].fillna(0)

    if len(df_model) < 10:
        return [{"warning": "Insufficient data — need at least 10 person records"}]

    # ── Fit Cox PH ───────────────────────────────────────────────────────────
    cph = CoxPHFitter(penalizer=0.1)
    cph.fit(df_model, duration_col="T", event_col="E")

    df["risk_score"] = cph.predict_partial_hazard(
        df_model.drop(columns=["T", "E"])
    ).round(4)

    df["risk_tier"] = pd.cut(
        df["risk_score"],
        bins=[0, 0.33, 0.66, float("inf")],
        labels=["low", "medium", "high"]
    ).astype(str)

    return (
        df[["id", "full_name", "person_type", "risk_score", "risk_tier"]]
        .sort_values("risk_score", ascending=False)
        .head(100)
        .to_dict("records")
    )
`,
  },
  {
    id: "staffing-forecast",
    name: "Staffing Forecast",
    description: "Facebook Prophet time-series model — forecasts task demand over the next 90 days based on historical volume, seasonality, and growth trends.",
    icon: Users,
    bg: "bg-blue-50", border: "border-blue-200", iconColor: "text-blue-600",
    tags: ["Time Series", "Prophet", "Workforce"],
    endpoint: "staffing-forecast",
    defaultKernel: `# Staffing Forecast Model — Facebook Prophet
# Reads from: raw.tasks, raw.people
# Output saved to: raw.ml_predictions (model='staffing-forecast')
#
# Framework: prophet.Prophet
# Forecasts 90 days of task volume and converts to staffing estimates

import pandas as pd
from prophet import Prophet
from datetime import datetime, timedelta

TASKS_PER_STAFF_PER_DAY = 8   # operator-configurable

def run_staffing_forecast(company_id: str, df_tasks: pd.DataFrame) -> list[dict]:
    """
    Forecast daily task volume and recommended staff count for 90 days.
    Returns list of {date, predicted_tasks, staff_needed, lower, upper}.
    """
    # ── Prepare daily time series ────────────────────────────────────────────
    daily = (
        df_tasks
        .assign(ds=pd.to_datetime(df_tasks["created_date"]).dt.normalize())
        .groupby("ds")
        .size()
        .reset_index(name="y")
    )

    if len(daily) < 14:
        return [{"warning": "Insufficient history — need at least 14 days of task data"}]

    # ── Fit Prophet ──────────────────────────────────────────────────────────
    m = Prophet(
        weekly_seasonality=True,
        yearly_seasonality=len(daily) > 180,
        changepoint_prior_scale=0.05,
        seasonality_mode="multiplicative",
    )
    m.fit(daily)

    future = m.make_future_dataframe(periods=90)
    forecast = m.predict(future)

    # Keep future rows only
    cutoff = daily["ds"].max()
    fcast = forecast[forecast["ds"] > cutoff].copy()
    fcast["staff_needed"] = (fcast["yhat"].clip(0) / TASKS_PER_STAFF_PER_DAY).round().clip(0).astype(int)

    return fcast[["ds", "yhat", "yhat_lower", "yhat_upper", "staff_needed"]].rename(
        columns={"ds": "date", "yhat": "predicted_tasks", "yhat_lower": "lower", "yhat_upper": "upper"}
    ).assign(date=lambda d: d["date"].dt.strftime("%Y-%m-%d")).to_dict("records")
`,
  },
  {
    id: "ltv-segmentation",
    name: "LTV Segmentation",
    description: "K-Means clustering on RFM features — segments clients by lifetime value, frequency, and recency to identify Champions, Loyal, At Risk, and Lost segments.",
    icon: Layers,
    bg: "bg-violet-50", border: "border-violet-200", iconColor: "text-violet-600",
    tags: ["Clustering", "K-Means", "RFM"],
    endpoint: "ltv-segmentation",
    defaultKernel: `# LTV Segmentation — K-Means Clustering (RFM)
# Reads from: raw.transactions, raw.people
# Output saved to: raw.ml_predictions (model='ltv-segmentation')
#
# Framework: sklearn.cluster.KMeans
# Segments: Champions · Loyal · At Risk · Lost

import pandas as pd
import numpy as np
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler
from datetime import datetime

SEGMENT_LABELS = {0: "Champions", 1: "Loyal", 2: "At Risk", 3: "Lost"}
N_CLUSTERS = 4

def run_ltv_segmentation(
    company_id: str,
    df_transactions: pd.DataFrame,
    df_people: pd.DataFrame,
) -> list[dict]:
    """
    RFM segmentation: Recency, Frequency, Monetary value.
    Returns person_id + segment label for each client.
    """
    if df_transactions.empty or len(df_transactions) < N_CLUSTERS * 2:
        return [{"warning": "Insufficient transaction data for segmentation"}]

    today = datetime.now()

    # ── Build RFM table ──────────────────────────────────────────────────────
    rfm = df_transactions.groupby("person_id").agg(
        recency=("transaction_date", lambda x: (today - pd.to_datetime(x).max()).days),
        frequency=("id", "count"),
        monetary=("amount", "sum"),
    ).reset_index()

    # ── Normalize + cluster ──────────────────────────────────────────────────
    scaler = StandardScaler()
    X = scaler.fit_transform(rfm[["recency", "frequency", "monetary"]])

    km = KMeans(n_clusters=N_CLUSTERS, random_state=42, n_init=10)
    rfm["cluster_id"] = km.fit_predict(X)

    # ── Label clusters by value rank ─────────────────────────────────────────
    stats = rfm.groupby("cluster_id").agg(
        avg_monetary=("monetary", "mean"),
        avg_recency=("recency", "mean"),
    ).reset_index()
    # High monetary + low recency = best
    stats = stats.sort_values(["avg_monetary", "avg_recency"], ascending=[False, True]).reset_index(drop=True)
    label_map = {row["cluster_id"]: SEGMENT_LABELS[i] for i, row in stats.iterrows()}
    rfm["segment"] = rfm["cluster_id"].map(label_map)

    # ── Merge back to names ──────────────────────────────────────────────────
    result = rfm.merge(
        df_people[["id", "full_name", "person_type"]],
        left_on="person_id", right_on="id", how="left"
    )

    return result[["person_id", "full_name", "person_type", "recency", "frequency", "monetary", "segment"]].to_dict("records")
`,
  },
  {
    id: "shift-demand",
    name: "Shift Demand",
    description: "XGBoost regression — predicts task volume by hour and day-of-week to optimize shift scheduling and eliminate over- or under-staffing.",
    icon: Clock,
    bg: "bg-amber-50", border: "border-amber-200", iconColor: "text-amber-600",
    tags: ["Regression", "XGBoost", "Scheduling"],
    endpoint: "shift-demand",
    defaultKernel: `# Shift Demand Model — XGBoost Regression
# Reads from: raw.tasks
# Output saved to: raw.ml_predictions (model='shift-demand')
#
# Framework: xgboost.XGBRegressor
# Predicts task volume per hour × day-of-week grid

import pandas as pd
import numpy as np
import xgboost as xgb
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_absolute_error

def run_shift_demand(company_id: str, df_tasks: pd.DataFrame) -> list[dict]:
    """
    Predict demand per (hour, day-of-week) slot.
    Returns 168-row grid (24h × 7d) with predicted task count and recommended staff.
    """
    if len(df_tasks) < 50:
        return [{"warning": "Need at least 50 task records for shift demand modelling"}]

    # ── Feature engineering ──────────────────────────────────────────────────
    df = df_tasks.copy()
    df["dt"]         = pd.to_datetime(df["created_date"])
    df["hour"]       = df["dt"].dt.hour
    df["dayofweek"]  = df["dt"].dt.dayofweek          # Mon=0, Sun=6
    df["month"]      = df["dt"].dt.month
    df["is_weekend"] = (df["dayofweek"] >= 5).astype(int)

    hourly = df.groupby(["hour", "dayofweek", "month", "is_weekend"]).size().reset_index(name="task_count")

    X = hourly[["hour", "dayofweek", "month", "is_weekend"]]
    y = hourly["task_count"]

    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

    # ── Train XGBoost ─────────────────────────────────────────────────────────
    model = xgb.XGBRegressor(
        n_estimators=150, max_depth=4, learning_rate=0.08,
        subsample=0.8, colsample_bytree=0.8, random_state=42,
        eval_metric="mae",
    )
    model.fit(X_train, y_train, eval_set=[(X_test, y_test)], verbose=False)

    mae = mean_absolute_error(y_test, model.predict(X_test))

    # ── Predict full 24h × 7d grid ────────────────────────────────────────────
    import calendar
    current_month = pd.Timestamp.now().month
    grid = pd.DataFrame([
        {"hour": h, "dayofweek": d, "month": current_month, "is_weekend": int(d >= 5)}
        for d in range(7) for h in range(24)
    ])
    grid["predicted_tasks"]    = model.predict(grid).clip(0).round(1)
    grid["recommended_staff"]  = (grid["predicted_tasks"] / 8).clip(0).round().astype(int)
    grid["day_name"]           = grid["dayofweek"].apply(lambda d: calendar.day_name[d])
    grid["mae"]                = round(mae, 2)

    return grid.to_dict("records")
`,
  },
];

// ── ColdStartBanner ────────────────────────────────────────────────────────────
// Shows a one-time warning when the ETL pipeline hasn't run yet (raw tables empty).
// Models silently return "insufficient data" warnings without this — this makes
// the root cause obvious and links directly to the Pipelines page to fix it.
function ColdStartBanner({ companyId }) {
  const [dismissed, setDismissed] = useState(
    () => !!localStorage.getItem("ml_coldstart_dismissed")
  );

  const { data: health } = useQuery({
    queryKey: ["ml-health-check"],
    queryFn: async () => {
      const r = await fetch(`${RAILWAY_URL}/health`);
      if (!r.ok) return null;
      return r.json();
    },
    enabled: !dismissed,
    staleTime: 60000,
    refetchOnMount: "always",
    retry: false,
  });

  // Consider cold if health returned but no raw table counts, or python_layer unreachable
  const isCold = health === null || (health && (health.raw_people_count ?? 0) === 0 && (health.people_count ?? 0) === 0);

  if (dismissed || !isCold) return null;

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 flex items-start gap-3">
      <Database className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-amber-800">ETL pipeline hasn't run yet</p>
        <p className="text-xs text-amber-700 mt-0.5">
          ML models read from <span className="font-mono">raw.*</span> tables. If you see "insufficient data" warnings,
          run the ETL pipeline first to populate the analytics database.
        </p>
        <Link
          to={createPageUrl("Pipelines")}
          className="inline-flex items-center gap-1 mt-2 text-xs font-semibold text-amber-700 hover:text-amber-900 underline"
        >
          Go to Pipelines → run ETL
        </Link>
      </div>
      <button
        onClick={() => {
          localStorage.setItem("ml_coldstart_dismissed", "1");
          setDismissed(true);
        }}
        className="text-amber-400 hover:text-amber-600 shrink-0"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

// ── Shared helpers ─────────────────────────────────────────────────────────────
const SEG_COLORS = {
  Champions:  "#10b981",
  Loyal:      "#6366f1",
  "At Risk":  "#f59e0b",
  Lost:       "#f43f5e",
  high:       "#f43f5e",
  medium:     "#f59e0b",
  low:        "#10b981",
};
const TIER_BADGE = {
  high:   "bg-rose-100 text-rose-800",
  medium: "bg-amber-100 text-amber-800",
  low:    "bg-emerald-100 text-emerald-800",
  Champions: "bg-emerald-100 text-emerald-800",
  Loyal:     "bg-blue-100 text-blue-800",
  "At Risk": "bg-amber-100 text-amber-800",
  Lost:      "bg-rose-100 text-rose-800",
};

function SummaryCards({ entries }) {
  if (!entries.length) return null;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      {entries.slice(0, 8).map(([k, v]) => (
        <div key={k} className="bg-slate-50 border border-slate-100 rounded-xl p-3">
          <p className="text-[10px] text-slate-400 uppercase tracking-wide">{k.replace(/_/g, " ")}</p>
          <p className="text-base font-black text-slate-800 mt-0.5">{String(v)}</p>
        </div>
      ))}
    </div>
  );
}

function DataTable({ rows, maxRows = 20 }) {
  if (!rows.length) return null;
  const columns = Object.keys(rows[0]).slice(0, 8);
  return (
    <div className="rounded-xl border border-slate-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              {columns.map(col => (
                <th key={col} className="px-3 py-2 text-left font-bold text-slate-600 uppercase tracking-wide text-[10px] whitespace-nowrap">
                  {col.replace(/_/g, " ")}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, maxRows).map((row, i) => (
              <tr key={i} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                {columns.map(col => {
                  const val = row[col];
                  const isBadge = col === "segment" || col === "risk_tier";
                  return (
                    <td key={col} className="px-3 py-2 text-slate-700 whitespace-nowrap">
                      {isBadge && val ? (
                        <span className={`px-2 py-0.5 rounded-full font-semibold text-[10px] ${TIER_BADGE[val] || "bg-slate-100 text-slate-700"}`}>
                          {val}
                        </span>
                      ) : typeof val === "number" ? (
                        Number.isInteger(val) ? val : val.toFixed(3)
                      ) : (
                        String(val ?? "—")
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > maxRows && (
        <div className="px-3 py-2 bg-slate-50 border-t border-slate-200 text-xs text-slate-400">
          Showing {maxRows} of {rows.length} rows
        </div>
      )}
    </div>
  );
}

// ── Model-specific chart components ───────────────────────────────────────────

function RetentionRiskChart({ data }) {
  // Expects scored array with risk_tier counts, or summary.high/medium/low_risk
  const scored = data.scored || data.predictions || [];
  const tiers = ["high", "medium", "low"];
  const chartData = tiers.map(t => ({
    tier: t.charAt(0).toUpperCase() + t.slice(1),
    count: scored.filter(r => r.risk_tier === t).length ||
           data.summary?.[`${t}_risk`] || 0,
    fill: SEG_COLORS[t],
  }));
  if (chartData.every(d => d.count === 0)) return null;
  return (
    <div className="bg-slate-50 rounded-xl p-4">
      <p className="text-xs font-bold text-slate-600 mb-3">Risk Tier Distribution</p>
      <ResponsiveContainer width="100%" height={160}>
        <BarChart data={chartData} barSize={40}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis dataKey="tier" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
          <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 12 }} />
          <Bar dataKey="count" radius={[6, 6, 0, 0]}>
            {chartData.map((d, i) => <Cell key={i} fill={d.fill} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function LTVSegmentationChart({ data }) {
  const segments = data.segments || data.scored || [];
  const summary = data.segment_summary || {};
  // Build pie data from summary or by counting
  let pieData = Object.entries(summary).map(([name, v]) => ({
    name,
    value: v?.count ?? 0,
    fill: SEG_COLORS[name] || "#94a3b8",
  })).filter(d => d.value > 0);
  if (!pieData.length && segments.length) {
    const counts = {};
    segments.forEach(r => { counts[r.segment] = (counts[r.segment] || 0) + 1; });
    pieData = Object.entries(counts).map(([name, value]) => ({
      name, value, fill: SEG_COLORS[name] || "#94a3b8",
    }));
  }
  if (!pieData.length) return null;
  return (
    <div className="bg-slate-50 rounded-xl p-4">
      <p className="text-xs font-bold text-slate-600 mb-3">Segment Breakdown</p>
      <div className="flex items-center gap-4">
        <ResponsiveContainer width={160} height={160}>
          <PieChart>
            <Pie data={pieData} dataKey="value" cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={3}>
              {pieData.map((d, i) => <Cell key={i} fill={d.fill} />)}
            </Pie>
            <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 12 }} />
          </PieChart>
        </ResponsiveContainer>
        <div className="space-y-2">
          {pieData.map(d => (
            <div key={d.name} className="flex items-center gap-2 text-xs">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: d.fill }} />
              <span className="text-slate-700 font-medium">{d.name}</span>
              <span className="text-slate-400">{d.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ForecastChart({ data, label = "Predicted", color = "#10b981" }) {
  const fc = data.forecast || data.predictions || [];
  if (!fc.length) return null;
  const chartData = fc.slice(0, 30).map(r => ({
    date: (r.ds || r.date || "").slice(5), // MM-DD
    value: Math.round(r.yhat ?? r.predicted_shifts ?? r.predicted ?? 0),
    lower: Math.round(r.yhat_lower ?? r.predicted_shifts ?? 0),
    upper: Math.round(r.yhat_upper ?? r.predicted_shifts ?? 0),
  }));
  return (
    <div className="bg-slate-50 rounded-xl p-4">
      <p className="text-xs font-bold text-slate-600 mb-3">30-Day Forecast</p>
      <ResponsiveContainer width="100%" height={180}>
        <AreaChart data={chartData}>
          <defs>
            <linearGradient id="fcGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.15} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} interval={4} />
          <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
          <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 12 }}
            formatter={(v) => [v, label]} />
          <Area type="monotone" dataKey="value" stroke={color} strokeWidth={2}
            fill="url(#fcGrad)" dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function ShiftDemandChart({ data }) {
  const fc = data.forecast || data.predictions || [];
  if (!fc.length) return null;
  const chartData = fc.slice(0, 14).map(r => ({
    date: (r.date || r.ds || "").slice(5),
    shifts: Math.round(r.predicted_shifts ?? r.yhat ?? 0),
  }));
  return (
    <div className="bg-slate-50 rounded-xl p-4">
      <p className="text-xs font-bold text-slate-600 mb-3">Predicted Shifts — Next 14 Days</p>
      <ResponsiveContainer width="100%" height={160}>
        <BarChart data={chartData} barSize={28}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} allowDecimals={false} />
          <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 12 }} />
          <Bar dataKey="shifts" fill="#f59e0b" radius={[5, 5, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── ResultsView — model-aware ──────────────────────────────────────────────────
function ResultsView({ data, modelId, onPushToBase44, pushing }) {
  if (!data) return null;

  // Warning / error from backend
  const warningMsg = !Array.isArray(data) && (
    data.warning || (Array.isArray(data.predictions) && data.predictions[0]?.warning)
  );
  if (warningMsg) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
        <p className="text-sm text-amber-700">{warningMsg}</p>
      </div>
    );
  }

  const rows  = Array.isArray(data) ? data : (data.scored || data.segments || data.predictions || data.results || data.data || []);
  const summaryEntries = !Array.isArray(data)
    ? Object.entries(data).filter(([, v]) => typeof v !== "object" && !Array.isArray(v))
    : [];

  if (!rows.length && !summaryEntries.length) {
    return (
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm text-slate-500">
        No results returned.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary stat cards */}
      <SummaryCards entries={summaryEntries} />

      {/* Model-specific charts */}
      {modelId === "retention-risk"    && <RetentionRiskChart data={data} />}
      {modelId === "ltv-segmentation"  && <LTVSegmentationChart data={data} />}
      {modelId === "staffing-forecast" && <ForecastChart data={data} label="Predicted Tasks" color="#10b981" />}
      {modelId === "shift-demand"      && <ShiftDemandChart data={data} />}

      {/* Data table */}
      <DataTable rows={rows} />

      {/* Push to Base44 */}
      {onPushToBase44 && rows.length > 0 && (
        <div className="flex justify-end">
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs rounded-lg gap-1.5 border-indigo-200 text-indigo-700 hover:bg-indigo-50"
            onClick={onPushToBase44}
            disabled={pushing}
          >
            {pushing
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <Upload className="w-3.5 h-3.5" />}
            {pushing ? "Pushing…" : "Push to Base44"}
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function MLModels() {
  const { data: currentUser = null } = useQuery({
    queryKey: ["currentUser"],
    queryFn: () => base44.auth.me(),
    staleTime: 0,
    refetchOnMount: "always",
  });
  const [expandedModel, setExpandedModel] = useState(null);
  const [kernels, setKernels] = useState({});
  const [results, setResults] = useState({});
  const [loading, setLoading] = useState({});
  const [customModels, setCustomModels] = useState([]);
  const [addingCustom, setAddingCustom] = useState(false);
  const [newForm, setNewForm] = useState({ name: "", description: "", endpoint: "", code: "" });
  const [pushing, setPushing] = useState({});
  const { toast } = useToast();

  useEffect(() => {
    if (!currentUser) return;
    const cid = currentUser.company_id || "default";

    // Load custom models
    try {
      const saved = localStorage.getItem(`custom_models_${cid}`);
      if (saved) setCustomModels(JSON.parse(saved));
    } catch { /* ignore */ }

    // Load kernels for all system models
    const initial = {};
    for (const m of SYSTEM_MODELS) {
      const saved = localStorage.getItem(`kernel_${cid}_${m.id}`);
      initial[m.id] = saved || m.defaultKernel;
    }
    setKernels(initial);
  }, [currentUser?.company_id]);

  const saveKernel = (modelId, code) => {
    const cid = currentUser?.company_id || "default";
    localStorage.setItem(`kernel_${cid}_${modelId}`, code);
    toast({ title: "Kernel saved", description: "Code saved for this enterprise only." });
  };

  const resetKernel = (model) => {
    const cid = currentUser?.company_id || "default";
    localStorage.removeItem(`kernel_${cid}_${model.id}`);
    setKernels(prev => ({ ...prev, [model.id]: model.defaultKernel }));
    toast({ title: "Kernel reset to default" });
  };

  const runModel = async (model) => {
    const cid = currentUser?.company_id || "";
    setLoading(prev => ({ ...prev, [model.id]: true }));
    setResults(prev => ({ ...prev, [model.id]: null }));
    try {
      const params = new URLSearchParams({ company_id: cid });
      const res = await fetch(`${RAILWAY_URL}/ml/${model.endpoint}?${params}`, {
        headers: API_HEADERS,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`);
      setResults(prev => ({ ...prev, [model.id]: data }));
      toast({ title: `${model.name} complete`, description: "Results ready below the kernel." });
    } catch (e) {
      setResults(prev => ({ ...prev, [model.id]: { error: e.message } }));
      toast({ title: "Run failed", description: e.message, variant: "destructive" });
    } finally {
      setLoading(prev => ({ ...prev, [model.id]: false }));
    }
  };

  const saveCustomModel = () => {
    if (!newForm.name.trim()) return;
    const cid = currentUser?.company_id || "default";
    const model = {
      id: `custom_${Date.now()}`,
      name: newForm.name.trim(),
      description: newForm.description.trim(),
      endpoint: newForm.endpoint.trim(),
      defaultKernel: newForm.code || "# Write your Python model code here\n",
      isCustom: true,
      bg: "bg-slate-50", border: "border-slate-200", iconColor: "text-slate-600",
      tags: ["Custom"],
    };
    const updated = [...customModels, model];
    setCustomModels(updated);
    localStorage.setItem(`custom_models_${cid}`, JSON.stringify(updated));
    setKernels(prev => ({ ...prev, [model.id]: model.defaultKernel }));
    setNewForm({ name: "", description: "", endpoint: "", code: "" });
    setAddingCustom(false);
    toast({ title: "Custom model added" });
  };

  const pushToBase44 = async (modelId) => {
    const cid = currentUser?.company_id || "";
    setPushing(prev => ({ ...prev, [modelId]: true }));
    try {
      const res = await fetch(`${RAILWAY_URL}/ml/push-to-base44?company_id=${cid}&model=${modelId}`, {
        method: "POST",
        headers: API_HEADERS,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`);
      toast({ title: "Pushed to Base44", description: `${data.pushed ?? 0} predictions written.` });
    } catch (e) {
      toast({ title: "Push failed", description: e.message, variant: "destructive" });
    } finally {
      setPushing(prev => ({ ...prev, [modelId]: false }));
    }
  };

  const deleteCustomModel = (modelId) => {
    const cid = currentUser?.company_id || "default";
    const updated = customModels.filter(m => m.id !== modelId);
    setCustomModels(updated);
    localStorage.setItem(`custom_models_${cid}`, JSON.stringify(updated));
    localStorage.removeItem(`kernel_${cid}_${modelId}`);
    if (expandedModel === modelId) setExpandedModel(null);
    toast({ title: "Model removed" });
  };

  const allModels = [
    ...SYSTEM_MODELS,
    ...customModels.map(m => ({ ...m, icon: Cpu })),
  ];

  const runCount = Object.values(results).filter(r => r && !r.error).length;

  return (
    <div className="flex flex-col gap-6 min-h-full">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-black text-slate-800">ML Models</h1>
          <p className="text-slate-500 text-sm mt-1 max-w-2xl">
            Machine learning models running on your raw operational data. Each model has an editable Python kernel — kernel changes are saved per enterprise and never affect other tenants.
          </p>
        </div>
        <Button onClick={() => setAddingCustom(true)} className="bg-indigo-600 hover:bg-indigo-700 rounded-xl">
          <Plus className="w-4 h-4 mr-2" /> Add Custom Model
        </Button>
      </div>

      {/* ── Stats ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "System Models",  value: SYSTEM_MODELS.length, icon: Brain,     color: "text-violet-600", bg: "bg-violet-50" },
          { label: "Custom Models",  value: customModels.length,  icon: Code2,     color: "text-indigo-600", bg: "bg-indigo-50" },
          { label: "Models Run",     value: runCount,             icon: Activity,  color: "text-emerald-600",bg: "bg-emerald-50" },
          { label: "Data Source",    value: "raw.*",              icon: Database,  color: "text-amber-600",  bg: "bg-amber-50"  },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="bg-white border border-slate-100 rounded-2xl p-4 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center shrink-0`}>
              <Icon className={`w-5 h-5 ${color}`} />
            </div>
            <div>
              <p className="text-2xl font-black text-slate-800">{value}</p>
              <p className="text-xs text-slate-400">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Cold-start notice ── */}
      {!currentUser && null}
      {currentUser && (
        <ColdStartBanner companyId={currentUser.company_id} />
      )}

      {/* ── Add Custom Model Form ── */}
      {addingCustom && (
        <div className="bg-white border border-indigo-200 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Plus className="w-4 h-4 text-indigo-600" />
            <h2 className="text-sm font-bold text-slate-700">Add Custom ML Model</h2>
            <button onClick={() => setAddingCustom(false)} className="ml-auto text-slate-400 hover:text-slate-600">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="text-xs font-semibold text-slate-600 block mb-1">Model Name *</label>
              <input
                value={newForm.name}
                onChange={e => setNewForm(p => ({ ...p, name: e.target.value }))}
                placeholder="e.g. Revenue Anomaly Detector"
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600 block mb-1">API Endpoint (python_layer)</label>
              <input
                value={newForm.endpoint}
                onChange={e => setNewForm(p => ({ ...p, endpoint: e.target.value }))}
                placeholder="e.g. revenue-anomaly"
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-semibold text-slate-600 block mb-1">Description</label>
              <input
                value={newForm.description}
                onChange={e => setNewForm(p => ({ ...p, description: e.target.value }))}
                placeholder="What does this model predict?"
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
            </div>
          </div>
          <div className="mb-4">
            <label className="text-xs font-semibold text-slate-600 block mb-1">Initial Kernel Code (Python)</label>
            <div className="rounded-xl overflow-hidden border border-slate-700">
              <div className="flex items-center gap-1.5 px-4 py-2 bg-slate-800 border-b border-slate-700">
                <div className="w-3 h-3 rounded-full bg-rose-500" />
                <div className="w-3 h-3 rounded-full bg-amber-500" />
                <div className="w-3 h-3 rounded-full bg-emerald-500" />
                <span className="ml-2 text-slate-400 text-[11px] font-mono">new_model.py</span>
              </div>
              <textarea
                value={newForm.code}
                onChange={e => setNewForm(p => ({ ...p, code: e.target.value }))}
                rows={10}
                spellCheck={false}
                placeholder="# Write your model code here..."
                className="w-full bg-slate-950 text-emerald-300 font-mono text-[13px] leading-relaxed px-5 py-4 focus:outline-none resize-y"
              />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setAddingCustom(false)} className="rounded-xl">Cancel</Button>
            <Button onClick={saveCustomModel} disabled={!newForm.name.trim()} className="bg-indigo-600 hover:bg-indigo-700 rounded-xl">
              Add Model
            </Button>
          </div>
        </div>
      )}

      {/* ── Model Cards ── */}
      <div className="flex flex-col gap-4">
        {allModels.map((model) => {
          const isExpanded = expandedModel === model.id;
          const isLoading = !!loading[model.id];
          const result = results[model.id];
          const Icon = model.icon || Brain;
          const kernelCode = kernels[model.id] ?? model.defaultKernel ?? "";

          return (
            <div
              key={model.id}
              className={`bg-white border ${isExpanded ? (model.border || "border-slate-200") : "border-slate-100"} rounded-2xl overflow-hidden transition-colors shadow-sm`}
            >
              {/* Card header */}
              <div
                className="flex items-center gap-4 p-5 cursor-pointer hover:bg-slate-50 transition-colors"
                onClick={() => setExpandedModel(isExpanded ? null : model.id)}
              >
                <div className={`w-12 h-12 rounded-2xl ${model.bg} flex items-center justify-center shrink-0`}>
                  <Icon className={`w-6 h-6 ${model.iconColor}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm font-bold text-slate-800">{model.name}</h3>
                    {model.isCustom && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">Custom</span>
                    )}
                    {model.tags?.map(t => (
                      <span key={t} className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">{t}</span>
                    ))}
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5 leading-snug max-w-2xl">{model.description}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {result && !result.error && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                  {result?.error && <AlertTriangle className="w-4 h-4 text-rose-500" />}
                  {isExpanded
                    ? <ChevronUp className="w-4 h-4 text-slate-400" />
                    : <ChevronDown className="w-4 h-4 text-slate-400" />
                  }
                </div>
              </div>

              {/* Expanded body */}
              {isExpanded && (
                <div className="border-t border-slate-100">
                  {/* Kernel editor */}
                  <div className="p-5 pb-4">
                    <div className="flex items-center gap-2 mb-3 flex-wrap">
                      <Code2 className="w-4 h-4 text-slate-400" />
                      <span className="text-xs font-bold text-slate-600">Python Kernel</span>
                      <span className="text-[10px] text-slate-400">— changes saved per enterprise</span>
                      <div className="ml-auto flex items-center gap-2 flex-wrap">
                        <Button size="sm" variant="outline" onClick={() => resetKernel(model)} className="rounded-lg h-7 text-xs">
                          <RefreshCw className="w-3 h-3 mr-1" /> Reset
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => saveKernel(model.id, kernelCode)}
                          className="rounded-lg h-7 text-xs"
                        >
                          <Save className="w-3 h-3 mr-1" /> Save
                        </Button>
                        <Button
                          size="sm"
                          disabled={isLoading}
                          onClick={() => runModel(model)}
                          className="rounded-lg h-7 text-xs bg-emerald-600 hover:bg-emerald-700"
                        >
                          {isLoading
                            ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Running…</>
                            : <><Play className="w-3 h-3 mr-1" /> Run Model</>
                          }
                        </Button>
                        {model.isCustom && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => deleteCustomModel(model.id)}
                            className="rounded-lg h-7 text-xs text-rose-600 border-rose-200 hover:bg-rose-50"
                          >
                            <Trash2 className="w-3 h-3 mr-1" /> Remove
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Code editor */}
                    <div className="rounded-xl overflow-hidden border border-slate-700">
                      <div className="flex items-center gap-1.5 px-4 py-2 bg-slate-800 border-b border-slate-700">
                        <div className="w-3 h-3 rounded-full bg-rose-500" />
                        <div className="w-3 h-3 rounded-full bg-amber-500" />
                        <div className="w-3 h-3 rounded-full bg-emerald-500" />
                        <span className="ml-3 text-slate-400 text-[11px] font-mono">{model.id}.py</span>
                        <span className="ml-auto text-slate-500 text-[10px]">Python 3 · reads raw.*</span>
                      </div>
                      <textarea
                        value={kernelCode}
                        onChange={e => setKernels(prev => ({ ...prev, [model.id]: e.target.value }))}
                        rows={22}
                        spellCheck={false}
                        className="w-full bg-slate-950 text-emerald-300 font-mono text-[13px] leading-[1.7] px-5 py-4 focus:outline-none resize-y"
                        style={{ minHeight: 320, tabSize: 4 }}
                      />
                    </div>
                  </div>

                  {/* Results */}
                  {result && (
                    <div className="px-5 pb-5">
                      <div className="flex items-center gap-2 mb-3">
                        <BarChart2 className="w-4 h-4 text-slate-400" />
                        <span className="text-xs font-bold text-slate-600">Model Results</span>
                        {result.error && <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />}
                        {!result.error && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
                      </div>
                      {result.error ? (
                        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4">
                          <div className="flex items-start gap-2">
                            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                            <div>
                              <p className="text-sm font-semibold text-rose-700">Run failed</p>
                              <p className="text-xs text-rose-600 mt-1 font-mono">{result.error}</p>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <ResultsView
                          data={result}
                          modelId={model.id}
                          onPushToBase44={!model.isCustom ? () => pushToBase44(model.id) : null}
                          pushing={pushing[model.id]}
                        />
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Empty state for no custom models yet */}
      {customModels.length === 0 && !addingCustom && (
        <div className="bg-white border border-dashed border-slate-200 rounded-2xl p-8 text-center">
          <Cpu className="w-8 h-8 text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-semibold text-slate-500">No custom models yet</p>
          <p className="text-xs text-slate-400 mt-1">Add your own ML model with a custom Python kernel.</p>
          <Button
            variant="outline"
            onClick={() => setAddingCustom(true)}
            className="mt-4 rounded-xl"
          >
            <Plus className="w-4 h-4 mr-2" /> Add Custom Model
          </Button>
        </div>
      )}
    </div>
  );
}
