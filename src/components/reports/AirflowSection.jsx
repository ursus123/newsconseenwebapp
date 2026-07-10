import React, { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, RefreshCw, Wind, Calendar } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

const API_BASE = "https://newsconseenwebapp-production.up.railway.app";

const LOAD_ENDPOINTS = [
  { key: "enterprise_summary", path: "/load/enterprise-summary" },
  { key: "task_summary",       path: "/load/task-summary" },
  { key: "people_summary",     path: "/load/people-summary" },
  { key: "transaction_summary",path: "/load/transaction-summary" },
  { key: "service_summary",    path: "/load/service-summary" },
  { key: "product_summary",    path: "/load/product-summary" },
];

const PIPELINES = [
  { name: "tasks_etl",        description: "Syncs task summaries from Supabase" },
  { name: "transactions_etl", description: "Syncs transaction summaries from Supabase" },
  { name: "services_etl",     description: "Syncs service summaries from Supabase" },
  { name: "enterprises_etl",  description: "Syncs enterprise summaries from Supabase" },
  { name: "people_etl",       description: "Syncs people summaries from Supabase" },
  { name: "products_etl",     description: "Syncs product summaries from Supabase" },
  { name: "geospatial_etl",   description: "Geocodes enterprise addresses and clusters locations" },
];

export default function AirflowSection() {
  const [refreshing, setRefreshing] = useState(false);
  const { toast } = useToast();

  const handleManualRefresh = async () => {
    setRefreshing(true);
    const results = await Promise.allSettled(
      LOAD_ENDPOINTS.map(({ path }) =>
        fetch(`${API_BASE}${path}`, { method: "POST" }).then((r) => r.json())
      )
    );

    setRefreshing(false);

    const failed = [];
    const lines = [];

    results.forEach((result, i) => {
      const { key } = LOAD_ENDPOINTS[i];
      if (result.status === "fulfilled") {
        const data = result.value;
        const rows = data?.rows_loaded ?? data?.count ?? data?.inserted ?? data?.rows ?? "?";
        lines.push(`${key}: ${rows} row${rows === 1 ? "" : "s"}`);
      } else {
        failed.push(key);
      }
    });

    if (failed.length === 0) {
      toast({
        title: "✅ All analytics tables refreshed successfully",
        description: lines.join("\n"),
      });
    } else {
      toast({
        variant: "destructive",
        title: "Some endpoints failed",
        description: `Failed: ${failed.join(", ")}`,
      });
    }
  };

  return (
    <Card className="border border-blue-100 bg-blue-50/40 rounded-2xl mb-8">
      <CardContent className="pt-6 pb-6 px-6">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center shrink-0 mt-0.5">
            <Wind className="w-5 h-5 text-blue-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-bold text-blue-900 mb-1">Data Pipeline (Airflow)</h3>
            <p className="text-sm text-blue-700 mb-5">
              Airflow schedules and runs your ETL pipelines daily, keeping your analytics database fresh with the latest data from Supabase.
            </p>

            {/* Buttons */}
            <div className="flex flex-wrap items-start gap-4 mb-6">
              <div className="flex flex-col gap-1">
                <Button
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  onClick={() => window.open("http://localhost:8080", "_blank")}
                >
                  <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                  Open Airflow Dashboard
                </Button>
                <p className="text-[11px] text-blue-500 max-w-[240px]">
                  Run <code className="bg-blue-100 px-1 rounded font-mono">docker-compose up</code> in your python_layer folder to start Airflow locally
                </p>
              </div>

              <Button
                size="sm"
                variant="outline"
                className="border-blue-200 text-blue-700 hover:bg-blue-100"
                onClick={handleManualRefresh}
                disabled={refreshing}
              >
                <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${refreshing ? "animate-spin" : ""}`} />
                {refreshing ? "Refreshing…" : "Trigger Manual Refresh"}
              </Button>
            </div>

            {/* Pipeline cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {PIPELINES.map((p) => (
                <div
                  key={p.name}
                  className="bg-white border border-blue-100 rounded-xl px-4 py-3 flex flex-col gap-1.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-blue-900 truncate">{p.name}</span>
                    <Badge className="bg-emerald-50 text-emerald-700 border-0 shrink-0 text-xs">Active</Badge>
                  </div>
                  <p className="text-xs text-slate-500 leading-snug">{p.description}</p>
                  <div className="flex items-center gap-1 text-[11px] text-blue-400">
                    <Calendar className="w-3 h-3" />
                    @daily
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}