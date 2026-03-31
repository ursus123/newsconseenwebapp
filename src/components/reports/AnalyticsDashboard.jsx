import React, { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Building2, Users, ClipboardList, ArrowLeftRight, ExternalLink, RefreshCw } from "lucide-react";

const API_BASE = "https://newsconseenwebapp-production.up.railway.app";
const RAILWAY_API_KEY = import.meta.env.VITE_RAILWAY_API_KEY || "";
const API_HEADERS = { "x-api-key": RAILWAY_API_KEY };
const SUPERSET_URL = "http://localhost:8089";

const sumField = (arr, field) => (arr || []).reduce((acc, row) => acc + (Number(row[field]) || 0), 0);

function KpiCard({ icon: Icon, label, value, loading, color }) {
  return (
    <Card className="border border-slate-100 rounded-2xl">
      <CardContent className="pt-5 pb-4 px-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">{label}</p>
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin text-slate-300 mt-1" />
            ) : (
              <p className={`text-3xl font-black ${color}`}>{value?.toLocaleString() ?? "—"}</p>
            )}
          </div>
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color.replace("text-", "bg-").replace("700", "100")}`}>
            <Icon className={`w-5 h-5 ${color}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AnalyticsDashboard() {
  const [data, setData] = useState({ enterprises: null, people: null, tasks: null, transactions: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchAll = async () => {
    setLoading(true);
    setError(null);
    try {
      const [entRes, peopleRes, taskRes, txRes] = await Promise.all([
        fetch(`${API_BASE}/enterprise-summary`, { headers: API_HEADERS }),
        fetch(`${API_BASE}/people-summary`,     { headers: API_HEADERS }),
        fetch(`${API_BASE}/task-summary`,        { headers: API_HEADERS }),
        fetch(`${API_BASE}/transaction-summary`, { headers: API_HEADERS }),
      ]);
      const [ent, people, tasks, tx] = await Promise.all([
        entRes.json(), peopleRes.json(), taskRes.json(), txRes.json(),
      ]);
      const toArr = (d) => Array.isArray(d) ? d : (d?.data || d?.results || []);
      setData({
        enterprises: sumField(toArr(ent), "enterprise_count"),
        people: sumField(toArr(people), "people_count"),
        tasks: sumField(toArr(tasks), "total_tasks"),
        transactions: sumField(toArr(tx), "total_transactions"),
      });
    } catch (e) {
      setError("Failed to load analytics. Check your API connection.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Analytics Dashboard</h2>
          <p className="text-sm text-slate-400 mt-0.5">Live KPIs from your business data</p>
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
        <KpiCard icon={Building2} label="Total Enterprises" value={data.enterprises} loading={loading} color="text-emerald-700" />
        <KpiCard icon={Users} label="Total People" value={data.people} loading={loading} color="text-blue-700" />
        <KpiCard icon={ClipboardList} label="Total Tasks" value={data.tasks} loading={loading} color="text-amber-700" />
        <KpiCard icon={ArrowLeftRight} label="Total Transactions" value={data.transactions} loading={loading} color="text-purple-700" />
      </div>
    </div>
  );
}