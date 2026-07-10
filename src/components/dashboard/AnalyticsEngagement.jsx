import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ncClient } from "@/api/ncClient";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Users, MousePointerClick, Eye, Clock, Settings } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { format, parse } from "date-fns";

function MiniStat({ icon: Icon, label, value, color }) {
  return (
    <div className={`flex items-center gap-3 bg-${color}-50 rounded-xl p-3`}>
      <div className={`w-8 h-8 rounded-lg bg-${color}-100 flex items-center justify-center shrink-0`}>
        <Icon className={`w-4 h-4 text-${color}-600`} />
      </div>
      <div>
        <p className="text-lg font-bold text-slate-800">{value?.toLocaleString() ?? "—"}</p>
        <p className="text-xs text-slate-500">{label}</p>
      </div>
    </div>
  );
}

const STORAGE_KEY = "ga_property_id";

export default function AnalyticsEngagement() {
  const [propertyId, setPropertyId] = useState(() => localStorage.getItem(STORAGE_KEY) || "");
  const [inputValue, setInputValue] = useState(() => localStorage.getItem(STORAGE_KEY) || "");
  const [editing, setEditing] = useState(!localStorage.getItem(STORAGE_KEY));

  const { data, isLoading, error } = useQuery({
    queryKey: ["ga-engagement", propertyId],
    queryFn: () => ncClient.functions.invoke("getAnalyticsEngagement", { propertyId }).then((r) => r.data),
    enabled: !!propertyId,
    staleTime: 1000 * 60 * 15, // 15 min cache
  });

  const handleSave = () => {
    localStorage.setItem(STORAGE_KEY, inputValue);
    setPropertyId(inputValue);
    setEditing(false);
  };

  const chartData = (data?.rows || []).map((r) => ({
    date: format(parse(r.date, "yyyyMMdd", new Date()), "MMM d"),
    "Active Users": r.activeUsers,
    Sessions: r.sessions,
    "Page Views": r.pageViews,
  }));

  return (
    <Card className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-slate-800">User Engagement (Last 30 Days)</h3>
          <p className="text-xs text-slate-400 mt-0.5">Powered by Google Analytics</p>
        </div>
        <Button variant="ghost" size="icon" onClick={() => setEditing((e) => !e)} className="text-slate-400 hover:text-slate-600">
          <Settings className="w-4 h-4" />
        </Button>
      </div>

      {editing && (
        <div className="flex gap-2 items-center bg-slate-50 rounded-xl p-3">
          <Input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="GA4 Property ID (e.g. 123456789)"
            className="rounded-lg text-sm"
          />
          <Button size="sm" className="rounded-lg bg-emerald-600 hover:bg-emerald-700 shrink-0" onClick={handleSave}>
            Save
          </Button>
        </div>
      )}

      {!propertyId && !editing && (
        <p className="text-sm text-slate-400 text-center py-6">Enter your GA4 Property ID to load engagement data.</p>
      )}

      {propertyId && isLoading && (
        <div className="flex items-center justify-center py-10 text-slate-400 text-sm gap-2">
          <span className="w-4 h-4 border-2 border-slate-300 border-t-emerald-500 rounded-full animate-spin" />
          Loading analytics...
        </div>
      )}

      {error && (
        <div className="bg-rose-50 text-rose-700 rounded-xl p-4 text-sm">
          {error.message || "Failed to load analytics data. Check your Property ID and permissions."}
        </div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <MiniStat icon={Users} label="Active Users" value={data.totals?.activeUsers} color="blue" />
            <MiniStat icon={MousePointerClick} label="Sessions" value={data.totals?.sessions} color="emerald" />
            <MiniStat icon={Eye} label="Page Views" value={data.totals?.pageViews} color="purple" />
            <MiniStat icon={Clock} label="Avg Duration" value={`${Math.round((data.rows?.reduce((s, r) => s + r.avgSessionDuration, 0) / (data.rows?.length || 1)))}s`} color="amber" />
          </div>

          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="gaUsers" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gaSessions" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#94a3b8" }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }} />
              <Area type="monotone" dataKey="Active Users" stroke="#3b82f6" strokeWidth={2} fill="url(#gaUsers)" dot={false} />
              <Area type="monotone" dataKey="Sessions" stroke="#10b981" strokeWidth={2} fill="url(#gaSessions)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </>
      )}
    </Card>
  );
}