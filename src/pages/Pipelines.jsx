import React, { useState, useEffect } from "react";
import { useToast } from "@/components/ui/use-toast";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  RefreshCw, ExternalLink, Database, CheckCircle2, AlertTriangle,
  Clock, Activity, Building2, Users, Package, Wrench,
  CheckSquare, Receipt, MapPin, Loader2, Info, Link2, Globe,
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import PipelineBuilder from "@/components/pipelines/PipelineBuilder";

const RAILWAY_URL = "https://newsconseenwebapp-production.up.railway.app";
const CRON_SECRET = import.meta.env.VITE_CRON_SECRET || "";

const PIPELINE_ENTITIES = [
  { icon: CheckSquare, label: "Tasks",         desc: "Operational task records and completion metrics",         color: "text-blue-500",    bg: "bg-blue-50"    },
  { icon: Receipt,     label: "Transactions",  desc: "Posted financial records — revenue and expenses only",   color: "text-emerald-500", bg: "bg-emerald-50" },
  { icon: Wrench,      label: "Services",      desc: "Service catalog, rates, and delivery records",           color: "text-violet-500",  bg: "bg-violet-50"  },
  { icon: Building2,   label: "Enterprises",   desc: "Organization profiles, types, and operating status",     color: "text-amber-500",   bg: "bg-amber-50"   },
  { icon: Users,       label: "People",        desc: "Staff, participants, and external contacts",             color: "text-cyan-500",    bg: "bg-cyan-50"    },
  { icon: Package,     label: "Products",      desc: "Inventory, assets, medications, and equipment",          color: "text-rose-500",    bg: "bg-rose-50"    },
  { icon: MapPin,      label: "Addresses",     desc: "Location records with geocoordinates",                   color: "text-orange-500",  bg: "bg-orange-50"  },
  { icon: Link2,       label: "Relationships", desc: "Cross-entity links — the join backbone for dashboards",  color: "text-indigo-500",  bg: "bg-indigo-50"  },
  { icon: Globe,       label: "Geospatial",    desc: "Enterprise locations with DBSCAN spatial clustering",    color: "text-teal-500",    bg: "bg-teal-50"    },
];

export default function Pipelines() {
  const [etlLoading, setEtlLoading] = useState(false);
  const [etlResult, setEtlResult] = useState(null);
  const [lastTriggered, setLastTriggered] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const { toast } = useToast();

  useEffect(() => {
    base44.auth.me().then(setCurrentUser).catch(() => {});
  }, []);

  // Live health check — shows actual last-run timestamps from the API
  const { data: healthData, refetch: refetchHealth } = useQuery({
    queryKey: ["pipeline-health"],
    queryFn: async () => {
      const r = await fetch(`${RAILWAY_URL}/health`);
      if (!r.ok) return null;
      return r.json();
    },
    staleTime: 30000,
    retry: false,
  });

  const triggerEtl = async () => {
    setEtlLoading(true);
    setEtlResult(null);
    try {
      const res = await fetch(`${RAILWAY_URL}/cron/etl-all`, {
        method: "POST",
        headers: { "x-cron-secret": CRON_SECRET },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || `Status ${res.status}`);
      setEtlResult(data);
      setLastTriggered(new Date().toLocaleTimeString());
      refetchHealth();
      toast({
        title: data.all_success
          ? `ETL complete — ${data.success}/${data.total} entities synced`
          : `ETL partial — ${data.success}/${data.total} succeeded`,
        description: data.all_success
          ? "All analytics tables are now up to date."
          : "Some entities failed. Check results below.",
        variant: data.all_success ? "default" : "destructive",
      });
    } catch (e) {
      toast({
        title: "ETL trigger failed",
        description: e.message || "Could not reach the pipeline endpoint.",
        variant: "destructive",
      });
    } finally {
      setEtlLoading(false);
    }
  };

  const pipelineStats = etlResult ? {
    total:    etlResult.total,
    healthy:  etlResult.success,
    failed:   etlResult.total - etlResult.success,
  } : {
    total:   9,
    healthy: 9,
    failed:  0,
  };

  const hasFailures = pipelineStats.failed > 0;
  const statusColor = hasFailures ? "text-rose-600" : "text-emerald-600";
  const statusBg    = hasFailures ? "bg-rose-50 border-rose-200" : "bg-emerald-50 border-emerald-200";
  const StatusIcon  = hasFailures ? AlertTriangle : CheckCircle2;

  return (
    <div className="flex flex-col gap-6 min-h-full">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-black text-slate-800">Data Pipelines</h1>
          <p className="text-slate-500 text-sm mt-1 max-w-2xl">
            Daily ETL pipelines automatically refresh your analytics database from Base44. Monitor pipeline health, view execution logs, and trigger manual runs to keep your intelligence layer current.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            onClick={triggerEtl}
            disabled={etlLoading}
            className="bg-emerald-600 hover:bg-emerald-700 rounded-xl"
          >
            {etlLoading
              ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Running ETL…</>
              : <><RefreshCw className="w-4 h-4 mr-2" /> Run Full ETL Now</>
            }
          </Button>

        </div>
      </div>

      {/* ── Status Overview ── */}
      <div className={`rounded-2xl border p-4 flex items-center gap-4 flex-wrap ${statusBg}`}>
        <div className="flex items-center gap-2">
          <StatusIcon className={`w-5 h-5 ${statusColor}`} />
          <span className={`font-bold text-sm ${statusColor}`}>
            {hasFailures
              ? `${pipelineStats.failed} pipeline${pipelineStats.failed !== 1 ? "s" : ""} failed`
              : `All ${pipelineStats.total} pipelines healthy`
            }
          </span>
        </div>
        <div className="flex items-center gap-6 flex-wrap ml-auto text-xs text-slate-500">
          <span className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" />
            Last run:{" "}
            <strong className="text-slate-700 ml-1">
              {lastTriggered
                ? `Manually at ${lastTriggered}`
                : healthData?.last_etl_run
                ? new Date(healthData.last_etl_run).toLocaleString()
                : "Not yet triggered"}
            </strong>
          </span>
          {healthData && (
            <span className="flex items-center gap-1.5">
              <Database className="w-3.5 h-3.5" />
              DB:{" "}
              <strong className={`ml-1 ${healthData.database === "connected" ? "text-emerald-600" : "text-rose-600"}`}>
                {healthData.database ?? "unknown"}
              </strong>
            </span>
          )}
        </div>
      </div>

      {/* ── Stats row ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Active Pipelines",  value: pipelineStats.total,   icon: Activity,      color: "text-blue-600",    bg: "bg-blue-50"   },
          { label: "Healthy",           value: pipelineStats.healthy,  icon: CheckCircle2,  color: "text-emerald-600", bg: "bg-emerald-50"},
          { label: "Failed",            value: pipelineStats.failed,   icon: AlertTriangle, color: hasFailures ? "text-rose-600" : "text-slate-400", bg: hasFailures ? "bg-rose-50" : "bg-slate-50" },
          { label: "Entities Synced",   value: String(pipelineStats.total),                icon: Database,      color: "text-violet-600",  bg: "bg-violet-50" },
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

      {/* ── ETL Result Detail Table ── */}
      {etlResult && (
        <div className="bg-white border border-slate-100 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <Database className="w-4 h-4 text-slate-400" />
            <h2 className="text-sm font-bold text-slate-700">Last ETL Run Results</h2>
            <span className="ml-auto text-xs text-slate-400">Triggered at {lastTriggered}</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {Object.entries(etlResult.results || {}).map(([entity, result]) => (
              <div key={entity} className={`flex items-center gap-2 p-3 rounded-xl border text-xs ${
                result.status === "success"
                  ? "border-emerald-100 bg-emerald-50"
                  : result.status === "skipped"
                  ? "border-amber-100 bg-amber-50"
                  : "border-rose-100 bg-rose-50"
              }`}>
                <div className={`w-2 h-2 rounded-full shrink-0 ${
                  result.status === "success" ? "bg-emerald-500"
                  : result.status === "skipped" ? "bg-amber-400"
                  : "bg-rose-500"
                }`} />
                <div className="min-w-0">
                  <p className="font-bold text-slate-700 capitalize">{entity}</p>
                  <p className="text-slate-500 truncate">
                    {result.status === "success"
                      ? `${result.rows_loaded} rows`
                      : result.status === "skipped"
                      ? "skipped — no data"
                      : result.detail?.slice(0, 40) || "error"
                    }
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── What these pipelines do ── */}
      <div className="bg-white border border-slate-100 rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Info className="w-4 h-4 text-slate-400" />
          <h2 className="text-sm font-bold text-slate-700">What These Pipelines Sync</h2>
          <span className="ml-auto text-xs text-slate-400">Runs nightly at 3:00 AM UTC</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {PIPELINE_ENTITIES.map(({ icon: Icon, label, desc, color, bg }) => (
            <div key={label} className="flex items-start gap-3 p-3 rounded-xl border border-slate-100 hover:border-slate-200 transition-colors">
              <div className={`w-8 h-8 rounded-lg ${bg} flex items-center justify-center shrink-0`}>
                <Icon className={`w-4 h-4 ${color}`} />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-slate-700">{label}</p>
                <p className="text-[11px] text-slate-400 leading-snug mt-0.5">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Pipeline Logs Links ── */}
      <div className="bg-white border border-slate-100 rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <Activity className="w-4 h-4 text-slate-400" />
          <h2 className="text-sm font-bold text-slate-700">Pipeline Logs</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <a href={`${RAILWAY_URL}/docs`} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-3 p-4 rounded-xl border border-slate-100 hover:border-blue-200 hover:bg-blue-50 transition-all group">
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
              <Database className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-700 group-hover:text-blue-700">API Docs</p>
              <p className="text-xs text-slate-400">FastAPI Swagger UI</p>
            </div>
            <ExternalLink className="w-3.5 h-3.5 text-slate-300 ml-auto group-hover:text-blue-500" />
          </a>
          <a href={`${RAILWAY_URL}/health`} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-3 p-4 rounded-xl border border-slate-100 hover:border-violet-200 hover:bg-violet-50 transition-all group">
            <div className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-5 h-5 text-violet-600" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-700 group-hover:text-violet-700">Health Check</p>
              <p className="text-xs text-slate-400">API and database status</p>
            </div>
            <ExternalLink className="w-3.5 h-3.5 text-slate-300 ml-auto group-hover:text-violet-500" />
          </a>
        </div>
      </div>

      {/* ── Pipeline Builder ── */}
      <PipelineBuilder currentUser={currentUser} />

    </div>
  );
}