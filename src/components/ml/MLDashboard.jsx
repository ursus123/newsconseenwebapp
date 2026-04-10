/**
 * MLDashboard
 *
 * Shows the current state of all four ML models:
 *   retention-risk    Cox PH / KNIME PMML
 *   ltv-segmentation  K-Means / KNIME PMML
 *   staffing-forecast Prophet / KNIME PMML
 *   shift-demand      XGBoost / KNIME PMML
 *
 * Source badge: green = KNIME PMML deployed, slate = sklearn fallback.
 * Each card shows the latest stored prediction summary + a Run button.
 * Reads from GET /ml/predictions and GET /ml/pmml-status.
 * Runs via POST /ml/<model>.
 */
import { useState, useEffect } from "react";
import { Brain, RefreshCw, Play, AlertTriangle, CheckCircle, TrendingUp, Users, BarChart2, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const RAILWAY_URL = "https://newsconseenwebapp-production.up.railway.app";

const MODELS = [
  {
    id:       "retention-risk",
    label:    "Retention Risk",
    desc:     "Cox PH — scores active people by predicted disengagement risk",
    icon:     Users,
    color:    "rose",
    endpoint: "/ml/retention-risk",
    method:   "POST",
    insightFn: (r) => {
      const scored = r?.scored || [];
      const high   = scored.filter(s => s.risk_tier === "high").length;
      const total  = scored.length;
      return total > 0
        ? `${high} high-risk of ${total} scored`
        : r?.summary?.high_risk != null
        ? `${r.summary.high_risk} high-risk entities`
        : "Run model to see risk scores";
    },
  },
  {
    id:       "ltv-segmentation",
    label:    "LTV Segmentation",
    desc:     "K-Means — clusters people into high / mid / low-engagement tiers",
    icon:     BarChart2,
    color:    "violet",
    endpoint: "/ml/ltv-segmentation",
    method:   "POST",
    insightFn: (r) => {
      const summary = r?.segment_summary || {};
      const keys = Object.keys(summary);
      if (keys.length > 0) {
        return keys.map(k => `${k}: ${summary[k]?.count ?? 0}`).join(" · ");
      }
      const segs = r?.segments || [];
      return segs.length > 0 ? `${segs.length} entities segmented` : "Run model to segment clients";
    },
  },
  {
    id:       "staffing-forecast",
    label:    "Staffing Forecast",
    desc:     "Prophet — 30-day task volume forecast for staffing decisions",
    icon:     TrendingUp,
    color:    "emerald",
    endpoint: "/ml/staffing-forecast",
    method:   "POST",
    insightFn: (r) => {
      const fc = r?.forecast || [];
      if (!fc.length) return "Run model to see forecast";
      const peak = Math.max(...fc.map(f => f.yhat || f.predicted_shifts || 0));
      return `${fc.length}-day forecast · peak ${peak.toFixed(0)}`;
    },
  },
  {
    id:       "shift-demand",
    label:    "Shift Demand",
    desc:     "XGBoost — day-level shift demand prediction including weekday patterns",
    icon:     Calendar,
    color:    "amber",
    endpoint: "/ml/shift-demand",
    method:   "POST",
    insightFn: (r) => {
      const fc = r?.forecast || [];
      if (!fc.length) return "Run model to see shift demand";
      const next = fc[0];
      return `Next: ${next?.predicted_shifts ?? "—"} shifts on ${next?.date ?? "—"}`;
    },
  },
];

const COLOR_MAP = {
  rose:    { bg: "bg-rose-50",    text: "text-rose-600",    border: "border-rose-200",    icon: "text-rose-400"    },
  violet:  { bg: "bg-violet-50",  text: "text-violet-600",  border: "border-violet-200",  icon: "text-violet-400"  },
  emerald: { bg: "bg-emerald-50", text: "text-emerald-600", border: "border-emerald-200", icon: "text-emerald-400" },
  amber:   { bg: "bg-amber-50",   text: "text-amber-600",   border: "border-amber-200",   icon: "text-amber-400"   },
};

function SourceBadge({ source }) {
  if (!source) return null;
  const isKnime = source === "knime_pmml";
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${
      isKnime
        ? "bg-emerald-100 text-emerald-700"
        : "bg-slate-100 text-slate-500"
    }`}>
      <span className={`w-1.5 h-1.5 rounded-full inline-block ${isKnime ? "bg-emerald-500" : "bg-slate-400"}`} />
      {isKnime ? "KNIME PMML" : source?.replace(/_/g, " ") || "fallback"}
    </span>
  );
}

function ModelCard({ model, prediction, pmmlInfo, mlEnabled, onRun, running }) {
  const c     = COLOR_MAP[model.color];
  const Icon  = model.icon;
  const pred  = prediction?.result;
  const ts    = prediction?.computed_at;
  const src   = pred?.source || (pmmlInfo?.installed ? "knime_pmml" : null);
  const insight = pred ? model.insightFn(pred) : null;

  const timeAgo = (iso) => {
    if (!iso) return null;
    const diff = Date.now() - new Date(iso).getTime();
    const h = Math.floor(diff / 3600000);
    const m = Math.floor(diff / 60000);
    if (h > 48) return `${Math.floor(h / 24)}d ago`;
    if (h >= 1) return `${h}h ago`;
    return `${m}m ago`;
  };

  return (
    <div className={`bg-white border rounded-2xl p-4 flex flex-col gap-3 ${pred ? "border-slate-100" : "border-dashed border-slate-200"}`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${c.bg}`}>
            <Icon className={`w-4 h-4 ${c.icon}`} />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-800 leading-tight">{model.label}</p>
            <p className="text-[10px] text-slate-400 leading-tight mt-0.5">{model.desc}</p>
          </div>
        </div>
        {src && <SourceBadge source={src} />}
      </div>

      {/* Insight */}
      <div className={`rounded-xl px-3 py-2 text-xs ${pred ? `${c.bg} ${c.text}` : "bg-slate-50 text-slate-400"}`}>
        {insight || (mlEnabled ? "No predictions yet" : "ML disabled")}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-slate-400">
          {ts ? `Last run ${timeAgo(ts)}` : "Never run"}
        </span>
        <Button
          size="sm"
          variant="outline"
          disabled={!mlEnabled || running === model.id}
          onClick={() => onRun(model)}
          className="h-7 text-xs rounded-lg gap-1.5"
        >
          {running === model.id
            ? <RefreshCw className="w-3 h-3 animate-spin" />
            : <Play className="w-3 h-3" />}
          {running === model.id ? "Running…" : "Run"}
        </Button>
      </div>
    </div>
  );
}

export default function MLDashboard({ currentUser }) {
  const companyId = currentUser?.company_id;

  const [predictions, setPredictions] = useState({});
  const [pmmlStatus, setPmmlStatus]   = useState(null);
  const [mlEnabled, setMlEnabled]     = useState(null);
  const [running, setRunning]         = useState(null);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [statusRes, predsRes, pmmlRes] = await Promise.all([
        fetch(`${RAILWAY_URL}/ml/status`),
        fetch(`${RAILWAY_URL}/ml/predictions?company_id=${companyId}&limit=10`),
        fetch(`${RAILWAY_URL}/ml/pmml-status`),
      ]);

      if (statusRes.ok) {
        const s = await statusRes.json();
        setMlEnabled(s.ml_enabled);
      }
      if (predsRes.ok) {
        const p = await predsRes.json();
        const byModel = {};
        (p.predictions || []).forEach(pred => { byModel[pred.model] = pred; });
        setPredictions(byModel);
      }
      if (pmmlRes.ok) {
        setPmmlStatus(await pmmlRes.json());
      }
    } catch (e) {
      setError("Could not reach python_layer");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (companyId) load(); }, [companyId]);

  const runModel = async (model) => {
    setRunning(model.id);
    try {
      const url = new URL(`${RAILWAY_URL}${model.endpoint}`);
      url.searchParams.set("company_id", companyId);
      const res = await fetch(url.toString(), { method: model.method });
      if (res.ok) await load();
    } catch (_) {}
    finally { setRunning(null); }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-slate-100 p-5">
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <RefreshCw className="w-4 h-4 animate-spin" /> Loading ML status…
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-2xl border border-slate-100 p-5 flex items-center gap-3 text-sm text-slate-500">
        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
        {error} — python_layer may be cold-starting.
      </div>
    );
  }

  const knimeCount = pmmlStatus
    ? Object.values(pmmlStatus.models || {}).filter(m => m.installed).length
    : 0;

  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Brain className="w-4 h-4 text-violet-500" />
          <p className="text-sm font-semibold text-slate-800">ML Models</p>
          {mlEnabled === false && (
            <span className="text-[10px] bg-amber-50 text-amber-600 border border-amber-200 px-2 py-0.5 rounded-full font-medium">
              ML_ENABLED=false — set true in Railway to activate
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {knimeCount > 0 && (
            <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
              <CheckCircle className="w-3 h-3" />
              {knimeCount} KNIME model{knimeCount > 1 ? "s" : ""} deployed
            </span>
          )}
          <button onClick={load} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* PMML status strip */}
      {pmmlStatus && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 mb-4">
          {MODELS.map(m => {
            const info = pmmlStatus.models?.[m.id];
            const installed = info?.installed;
            return (
              <div key={m.id} className={`flex items-center gap-1.5 text-[10px] px-2 py-1.5 rounded-lg border ${
                installed
                  ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                  : "bg-slate-50 border-slate-200 text-slate-400"
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${installed ? "bg-emerald-500" : "bg-slate-300"}`} />
                <span className="truncate font-medium">{m.label}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Model cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {MODELS.map(m => (
          <ModelCard
            key={m.id}
            model={m}
            prediction={predictions[m.id]}
            pmmlInfo={pmmlStatus?.models?.[m.id]}
            mlEnabled={mlEnabled !== false}
            onRun={runModel}
            running={running}
          />
        ))}
      </div>

      {/* KNIME guide — shown only when no PMML files installed */}
      {knimeCount === 0 && pmmlStatus && (
        <div className="mt-4 bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-500">
          <p className="font-semibold text-slate-700 mb-1">Connect KNIME Desktop</p>
          <ol className="space-y-0.5 list-decimal list-inside">
            <li>Build your model workflow in KNIME Desktop</li>
            <li>Add a <span className="font-mono text-slate-700">PMML Writer</span> node at the end</li>
            <li>Execute → right-click PMML Writer → Browse Output</li>
            <li>Save to <span className="font-mono text-slate-700">python_layer/ml/pmml/&lt;model&gt;.pmml</span></li>
            <li>Deploy to Railway — source badge turns green automatically</li>
          </ol>
          <p className="mt-2 text-[10px] text-slate-400">
            Until PMML files are placed, all models run with built-in sklearn / Prophet / XGBoost fallbacks.
          </p>
        </div>
      )}
    </div>
  );
}
