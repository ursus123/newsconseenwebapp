// ==============================================================
// TrendCharts — 30-day trend lines for People, Revenue, Tasks
// Reads from python_layer analytics endpoints (3-tier fallback).
// Uses Recharts (already installed).
// ==============================================================

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, AreaChart, Area, Legend,
} from "recharts";
import { format, subDays, parseISO } from "date-fns";
import { TrendingUp, Users, ArrowLeftRight, ClipboardList } from "lucide-react";
import { RAILWAY_URL } from "@/utils/fetchWithFallback";
import ExportMenu from "@/components/shared/ExportMenu";

// ── Fetch helpers ─────────────────────────────────────────────────────────────

async function fetchTrendData(endpoint, companyId) {
  try {
    const res = await fetch(
      `${RAILWAY_URL}${endpoint}?company_id=${encodeURIComponent(companyId)}`
    );
    if (!res.ok) return null;
    const json = await res.json();
    const rows = Array.isArray(json) ? json : (json.data ?? []);
    return rows;
  } catch {
    return null;
  }
}

// Build last 30 days skeleton — fills gaps so chart has continuous x-axis
function buildDaySkeleton(days = 30) {
  return Array.from({ length: days }, (_, i) => {
    const d = subDays(new Date(), days - 1 - i);
    return { date: format(d, "yyyy-MM-dd"), label: format(d, "MMM d") };
  });
}

// Merge analytics rows into the day skeleton
function mergeTrend(skeleton, rows, dateField, valueField) {
  const map = {};
  rows.forEach(r => {
    const d = r[dateField] ? String(r[dateField]).slice(0, 10) : null;
    if (d) map[d] = (map[d] || 0) + (Number(r[valueField]) || 0);
  });
  return skeleton.map(s => ({ ...s, value: map[s.date] ?? null }));
}

// ── Chart wrapper ─────────────────────────────────────────────────────────────

function TrendCard({ title, icon: Icon, color, data, valueLabel, isLoading, note, report, companyId }) {
  const gradientId = `grad-${color}`;
  const strokeColor = {
    blue:   "#3b82f6",
    emerald:"#10b981",
    rose:   "#f43f5e",
    amber:  "#f59e0b",
  }[color] || "#6366f1";

  const hasData = data.some(d => d.value !== null && d.value > 0);

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5">
      <div className="flex items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-2">
          <div className={`w-8 h-8 rounded-lg bg-${color}-50 flex items-center justify-center`}>
            <Icon className={`w-4 h-4 text-${color}-500`} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
            {note && <p className="text-[10px] text-slate-400">{note}</p>}
          </div>
        </div>
        {report && companyId && (
          <ExportMenu report={report} companyId={companyId} size="sm" />
        )}
      </div>

      {isLoading ? (
        <div className="h-32 flex items-center justify-center text-slate-300 text-sm">
          Loading…
        </div>
      ) : !hasData ? (
        <div className="h-32 flex flex-col items-center justify-center text-slate-300">
          <TrendingUp className="w-8 h-8 mb-1 opacity-30" />
          <p className="text-xs">No data yet — run ETL to populate</p>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={120}>
          <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor={strokeColor} stopOpacity={0.15} />
                <stop offset="95%" stopColor={strokeColor} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 9, fill: "#94a3b8" }}
              tickLine={false}
              axisLine={false}
              interval={6}
            />
            <YAxis
              tick={{ fontSize: 9, fill: "#94a3b8" }}
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
            />
            <Tooltip
              contentStyle={{
                fontSize: 11, borderRadius: 8,
                border: "1px solid #e2e8f0", boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
              }}
              labelStyle={{ fontWeight: 600, color: "#334155" }}
              formatter={v => [v ?? "—", valueLabel]}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke={strokeColor}
              strokeWidth={2}
              fill={`url(#${gradientId})`}
              dot={false}
              connectNulls
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function TrendCharts({ companyId }) {
  const skeleton = buildDaySkeleton(30);

  // People headcount trend — from analytics.people_summary (snapshot_date + total_count)
  const { data: peopleRows = [], isLoading: loadingPeople } = useQuery({
    queryKey: ["trend-people", companyId],
    queryFn:  () => fetchTrendData("/people-summary", companyId),
    enabled:  !!companyId,
    staleTime: 5 * 60 * 1000,
    select: rows => rows ?? [],
  });

  // Revenue trend — from analytics.transaction_summary (snapshot_date + total_revenue)
  const { data: txRows = [], isLoading: loadingTx } = useQuery({
    queryKey: ["trend-transactions", companyId],
    queryFn:  () => fetchTrendData("/transaction-summary", companyId),
    enabled:  !!companyId,
    staleTime: 5 * 60 * 1000,
    select: rows => rows ?? [],
  });

  // Task completion trend — from analytics.task_summary (snapshot_date + completed_count)
  const { data: taskRows = [], isLoading: loadingTasks } = useQuery({
    queryKey: ["trend-tasks", companyId],
    queryFn:  () => fetchTrendData("/task-summary", companyId),
    enabled:  !!companyId,
    staleTime: 5 * 60 * 1000,
    select: rows => rows ?? [],
  });

  const peopleTrend = mergeTrend(skeleton, peopleRows, "snapshot_date", "total_count");
  const revenueTrend = mergeTrend(skeleton, txRows,    "snapshot_date", "total_revenue");
  const taskTrend    = mergeTrend(skeleton, taskRows,  "snapshot_date", "completed_count");

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-semibold text-slate-700">30-Day Trends</h2>
          <p className="text-xs text-slate-400">From analytics · updated on ETL run</p>
        </div>
        <ExportMenu report="transactions" companyId={companyId} label="Export All" size="sm" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <TrendCard
          title="People"
          icon={Users}
          color="blue"
          data={peopleTrend}
          valueLabel="Total people"
          isLoading={loadingPeople}
          note="Headcount over 30 days"
          report="people"
          companyId={companyId}
        />
        <TrendCard
          title="Revenue"
          icon={ArrowLeftRight}
          color="emerald"
          data={revenueTrend}
          valueLabel="Revenue"
          isLoading={loadingTx}
          note="Posted transactions over 30 days"
          report="transactions"
          companyId={companyId}
        />
        <TrendCard
          title="Task Completions"
          icon={ClipboardList}
          color="rose"
          data={taskTrend}
          valueLabel="Completed"
          isLoading={loadingTasks}
          note="Tasks completed over 30 days"
          report="tasks"
          companyId={companyId}
        />
      </div>
    </div>
  );
}
