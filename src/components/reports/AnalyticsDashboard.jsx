import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Building2, Users, ClipboardList, ArrowLeftRight, ExternalLink, RefreshCw, Zap, Database, Server } from "lucide-react";
import { fetchWithFallback } from "@/utils/fetchWithFallback";
import { ncClient } from "@/api/ncClient";

const SUPERSET_URL = "http://localhost:8089";

// ── Tier badge ────────────────────────────────────────────────────────────────
const TIER_LABELS = { 1: "Analytics", 2: "Raw DB", 3: "Live" };
const TIER_ICONS  = { 1: Zap, 2: Database, 3: Server };
const TIER_COLORS = {
  1: "text-emerald-600 bg-emerald-50 border-emerald-200",
  2: "text-blue-600 bg-blue-50 border-blue-200",
  3: "text-amber-600 bg-amber-50 border-amber-200",
};

function TierPill({ tier }) {
  if (!tier) return null;
  const Icon = TIER_ICONS[tier] ?? Database;
  const cls  = TIER_COLORS[tier] ?? "text-slate-500 bg-slate-50 border-slate-200";
  return (
    <span className={`inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${cls}`}>
      <Icon className="w-2.5 h-2.5" /> T{tier} {TIER_LABELS[tier]}
    </span>
  );
}

// ── KPI card ──────────────────────────────────────────────────────────────────
function KpiCard({ icon: Icon, label, value, loading, color, tier }) {
  return (
    <Card className="border border-slate-100 rounded-2xl">
      <CardContent className="pt-5 pb-4 px-5">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">{label}</p>
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin text-slate-300 mt-1" />
            ) : (
              <p className={`text-3xl font-black ${color}`}>{value?.toLocaleString() ?? "—"}</p>
            )}
            {!loading && <div className="mt-2"><TierPill tier={tier} /></div>}
          </div>
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${color.replace("text-", "bg-").replace("700", "100")}`}>
            <Icon className={`w-5 h-5 ${color}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Aggregation helpers (analytics → raw/ncClient field-name differences) ───────
const sumF = (arr, field) => (arr || []).reduce((acc, r) => acc + (Number(r[field]) || 0), 0);

function aggregateEnterprise(result) {
  if (result.source === "analytics") return sumF(result.data, "enterprise_count");
  return result.data.length;
}

function aggregatePeople(result) {
  if (result.source === "analytics") return sumF(result.data, "total_count");
  return result.data.length;
}

function aggregateTasks(result) {
  if (result.source === "analytics") return sumF(result.data, "total_count");
  return result.data.length;
}

function aggregateTransactions(result) {
  if (result.source === "analytics") return sumF(result.data, "total_count");
  return result.data.length;
}

// ── Main component ────────────────────────────────────────────────────────────
export default function AnalyticsDashboard({ companyId }) {
  const [results, setResults]   = useState({ enterprises: null, people: null, tasks: null, transactions: null });
  const [tiers,   setTiers]     = useState({ enterprises: 0,    people: 0,    tasks: 0,    transactions: 0 });
  const [loading, setLoading]   = useState(true);
  const [error,   setError]     = useState(null);

  const fetchAll = async () => {
    setLoading(true);
    setError(null);
    try {
      const [entR, peopleR, taskR, txR] = await Promise.all([
        fetchWithFallback({
          analyticsEndpoint: "/enterprise-summary",
          rawEntity:         "enterprises",
          base44Fn:          () => ncClient.entities.Enterprise.filter(companyId ? { company_id: companyId } : {}),
          companyId,
        }),
        fetchWithFallback({
          analyticsEndpoint: "/people-summary",
          rawEntity:         "people",
          base44Fn:          () => ncClient.entities.Person.filter(companyId ? { company_id: companyId } : {}),
          companyId,
        }),
        fetchWithFallback({
          analyticsEndpoint: "/task-summary",
          rawEntity:         "tasks",
          base44Fn:          () => ncClient.entities.Task.filter(companyId ? { company_id: companyId } : {}),
          companyId,
        }),
        fetchWithFallback({
          analyticsEndpoint: "/transaction-summary",
          rawEntity:         "transactions",
          base44Fn:          () => ncClient.entities.Transaction.filter(companyId ? { company_id: companyId } : {}),
          companyId,
        }),
      ]);

      setResults({
        enterprises:  aggregateEnterprise(entR),
        people:       aggregatePeople(peopleR),
        tasks:        aggregateTasks(taskR),
        transactions: aggregateTransactions(txR),
      });
      setTiers({
        enterprises:  entR.tier,
        people:       peopleR.tier,
        tasks:        taskR.tier,
        transactions: txR.tier,
      });
    } catch (e) {
      setError("Failed to load analytics data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, [companyId]);

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Analytics Dashboard</h2>
          <p className="text-sm text-slate-400 mt-0.5">Live KPIs — analytics → raw DB → Supabase fallback</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchAll} disabled={loading}>
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button size="sm" onClick={() => window.open(SUPERSET_URL, "_blank")}>
            <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
            Open Advanced Analytics
          </Button>
        </div>
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-3 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3">
          <p className="text-sm text-rose-600 flex-1">{error}</p>
          <Button size="sm" variant="outline" className="border-rose-200 text-rose-600 hover:bg-rose-50" onClick={fetchAll}>
            <RefreshCw className="w-3.5 h-3.5 mr-1" /> Retry
          </Button>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard icon={Building2}    label="Total Enterprises"  value={results.enterprises}  loading={loading} color="text-emerald-700" tier={tiers.enterprises} />
        <KpiCard icon={Users}        label="Total People"       value={results.people}       loading={loading} color="text-blue-700"    tier={tiers.people} />
        <KpiCard icon={ClipboardList} label="Total Tasks"       value={results.tasks}        loading={loading} color="text-amber-700"   tier={tiers.tasks} />
        <KpiCard icon={ArrowLeftRight} label="Total Transactions" value={results.transactions} loading={loading} color="text-purple-700" tier={tiers.transactions} />
      </div>
    </div>
  );
}
