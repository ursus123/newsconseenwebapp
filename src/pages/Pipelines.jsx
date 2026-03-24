import React, { useState } from "react";
import AirflowSection from "../components/reports/AirflowSection";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import {
  RefreshCw, ExternalLink, Database, CheckCircle2, AlertTriangle,
  Clock, Activity, Zap, Building2, Users, Package, Wrench,
  CheckSquare, Receipt, MapPin, Loader2, Info,
} from "lucide-react";

const AIRFLOW_URL = "http://localhost:8080";

const PIPELINE_ENTITIES = [
  { icon: CheckSquare,  label: "Tasks",        desc: "Operational task records and completion data",      color: "text-blue-500",    bg: "bg-blue-50"   },
  { icon: Receipt,      label: "Transactions",  desc: "Financial ledger — income, expenses, inventory",    color: "text-emerald-500", bg: "bg-emerald-50"},
  { icon: Wrench,       label: "Services",      desc: "Service catalog and delivery records",              color: "text-violet-500",  bg: "bg-violet-50" },
  { icon: Building2,    label: "Enterprises",   desc: "Organization profiles and metadata",                color: "text-amber-500",   bg: "bg-amber-50"  },
  { icon: Users,        label: "People",        desc: "Staff, clients, and external contacts",             color: "text-cyan-500",    bg: "bg-cyan-50"   },
  { icon: Package,      label: "Products",      desc: "Inventory items, assets, and medications",          color: "text-rose-500",    bg: "bg-rose-50"   },
  { icon: MapPin,       label: "Geospatial",    desc: "Location data enriched with census and demographics", color: "text-teal-500", bg: "bg-teal-50"   },
];

const MOCK_PIPELINE_STATUS = {
  total: 7,
  healthy: 7,
  failed: 0,
  lastRun: "Today at 3:00 AM",
  nextRun: "Tomorrow at 3:00 AM",
  avgDuration: "4m 12s",
};

export default function Pipelines() {
  const [etlLoading, setEtlLoading] = useState(false);
  const [lastTriggered, setLastTriggered] = useState(null);
  const { toast } = useToast();

  const triggerEtl = async () => {
    setEtlLoading(true);
    try {
      const res = await fetch("/cron/etl-all", { method: "POST" });
      if (!res.ok) throw new Error(`Status ${res.status}`);
      setLastTriggered(new Date().toLocaleTimeString());
      toast({ title: "ETL triggered successfully", description: "All pipelines are now refreshing. Check logs in Airflow for progress." });
    } catch (e) {
      toast({ title: "ETL trigger failed", description: e.message || "Could not reach the pipeline endpoint. Check your Airflow setup.", variant: "destructive" });
    } finally {
      setEtlLoading(false);
    }
  };

  const hasFailures = MOCK_PIPELINE_STATUS.failed > 0;
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
          <Button variant="outline" className="rounded-xl" asChild>
            <a href={AIRFLOW_URL} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="w-4 h-4 mr-2" /> View Airflow UI
            </a>
          </Button>
        </div>
      </div>

      {/* ── Status Overview ── */}
      <div className={`rounded-2xl border p-4 flex items-center gap-4 flex-wrap ${statusBg}`}>
        <div className="flex items-center gap-2">
          <StatusIcon className={`w-5 h-5 ${statusColor}`} />
          <span className={`font-bold text-sm ${statusColor}`}>
            {hasFailures
              ? `${MOCK_PIPELINE_STATUS.failed} pipeline${MOCK_PIPELINE_STATUS.failed !== 1 ? "s" : ""} failed`
              : `All ${MOCK_PIPELINE_STATUS.total} pipelines healthy`
            }
          </span>
        </div>
        <div className="flex items-center gap-6 flex-wrap ml-auto text-xs text-slate-500">
          <span className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" />
            Last run: <strong className="text-slate-700 ml-1">{lastTriggered ? `Manually at ${lastTriggered}` : MOCK_PIPELINE_STATUS.lastRun}</strong>
          </span>
          <span className="flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5" />
            Next scheduled: <strong className="text-slate-700 ml-1">{MOCK_PIPELINE_STATUS.nextRun}</strong>
          </span>
          <span className="flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5" />
            Avg duration: <strong className="text-slate-700 ml-1">{MOCK_PIPELINE_STATUS.avgDuration}</strong>
          </span>
        </div>
      </div>

      {/* ── Stats row ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Active Pipelines",  value: MOCK_PIPELINE_STATUS.total,   icon: Activity,      color: "text-blue-600",    bg: "bg-blue-50"   },
          { label: "Healthy",           value: MOCK_PIPELINE_STATUS.healthy,  icon: CheckCircle2,  color: "text-emerald-600", bg: "bg-emerald-50"},
          { label: "Failed",            value: MOCK_PIPELINE_STATUS.failed,   icon: AlertTriangle, color: hasFailures ? "text-rose-600" : "text-slate-400", bg: hasFailures ? "bg-rose-50" : "bg-slate-50" },
          { label: "Entities Synced",   value: "7",                           icon: Database,      color: "text-violet-600",  bg: "bg-violet-50" },
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

      {/* ── Airflow Section ── */}
      <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-slate-700">Pipeline Monitor</h2>
            <p className="text-xs text-slate-400 mt-0.5">Live Airflow DAG status and execution logs</p>
          </div>
          <a
            href={AIRFLOW_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs text-emerald-600 hover:text-emerald-700 font-medium"
          >
            Open Full UI <ExternalLink className="w-3 h-3" />
          </a>
        </div>
        <div className="p-5">
          <AirflowSection />
        </div>
      </div>

    </div>
  );
}