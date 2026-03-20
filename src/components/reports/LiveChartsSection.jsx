import React, { useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  BarChart, Bar, PieChart, Pie, LineChart, Line,
  Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { RefreshCw, AlertCircle, Download, CheckCircle, DollarSign, Package } from "lucide-react";
import { format } from "date-fns";

const PIE_COLORS = ["#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#f43f5e", "#84cc16"];

// ── Download helper ────────────────────────────────────────────────
async function downloadChart(ref, title) {
  if (!ref.current) return;
  try {
    const html2canvas = (await import("html2canvas")).default;
    const canvas = await html2canvas(ref.current, { backgroundColor: "#ffffff", scale: 2 });
    const link = document.createElement("a");
    link.download = `${title.replace(/ /g, "_")}_chart.png`;
    link.href = canvas.toDataURL();
    link.click();
  } catch (e) {
    console.error("Download failed:", e);
  }
}

// ── ChartCard ──────────────────────────────────────────────────────
function ChartCard({ title, loading, error, onRetry, updatedAt, chartType, onChartTypeChange, children }) {
  const chartRef = useRef(null);
  return (
    <Card className="border border-slate-100 rounded-2xl">
      <CardHeader className="flex flex-row items-center justify-between pb-2 gap-2 flex-wrap">
        <CardTitle className="text-sm font-bold text-slate-700">{title}</CardTitle>
        <div className="flex items-center gap-2">
          {updatedAt && !loading && !error && (
            <span className="text-[10px] text-slate-400">Updated {format(updatedAt, "h:mm:ss a")}</span>
          )}
          {onChartTypeChange && (
            <div className="flex items-center gap-0.5 bg-slate-100 rounded-lg p-0.5">
              {["bar", "pie", "line"].map(type => (
                <button
                  key={type}
                  onClick={() => onChartTypeChange(type)}
                  className={`px-2 py-0.5 rounded text-[10px] font-medium transition-all ${
                    chartType === type
                      ? "bg-white text-slate-700 shadow-sm"
                      : "text-slate-400 hover:text-slate-600"
                  }`}
                >
                  {type === "bar" ? "📊" : type === "pie" ? "🥧" : "📈"}
                </button>
              ))}
            </div>
          )}
          {!loading && !error && (
            <button
              onClick={() => downloadChart(chartRef, title)}
              className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
              title="Download as PNG"
            >
              <Download className="w-3 h-3" />
            </button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-48 flex items-end gap-2 px-4 pb-4">
            {[60, 85, 45, 90, 70, 55, 80, 65].map((h, i) => (
              <div
                key={i}
                className="flex-1 bg-slate-100 rounded-t-lg animate-pulse"
                style={{ height: `${h}%` }}
              />
            ))}
          </div>
        ) : error ? (
          <div className="h-48 flex flex-col items-center justify-center gap-3 text-center">
            <AlertCircle className="w-6 h-6 text-rose-400" />
            <p className="text-sm text-slate-500">{error}</p>
            <Button size="sm" variant="outline" onClick={onRetry}>
              <RefreshCw className="w-3 h-3 mr-1" /> Retry
            </Button>
          </div>
        ) : (
          <div ref={chartRef} className="bg-white p-2">
            {children}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function NoData() {
  return <div className="h-48 flex items-center justify-center text-sm text-slate-400">No data available</div>;
}

// ── Generic chart renderer (bar / pie / line) ──────────────────────
function FlexChart({ data, valueKey, nameKey, barColor, chartType, previousData, previousValueKey }) {
  if (!data?.length) return <NoData />;
  const H = 200;

  if (chartType === "pie") {
    return (
      <ResponsiveContainer width="100%" height={H}>
        <PieChart>
          <Pie
            data={data} dataKey={valueKey} nameKey={nameKey}
            cx="50%" cy="50%" outerRadius={70}
            label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
            labelLine={false} fontSize={10}
          >
            {data.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
          </Pie>
          <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
        </PieChart>
      </ResponsiveContainer>
    );
  }

  if (chartType === "line") {
    return (
      <ResponsiveContainer width="100%" height={H}>
        <LineChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis dataKey={nameKey} tick={{ fontSize: 10, fill: "#94a3b8" }} tickLine={false} />
          <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} tickLine={false} axisLine={false} />
          <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
          <Line type="monotone" dataKey={valueKey} stroke={barColor} strokeWidth={2} dot={{ fill: barColor, r: 3 }} name="Current" />
        </LineChart>
      </ResponsiveContainer>
    );
  }

  // Default: bar
  return (
    <ResponsiveContainer width="100%" height={H}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 40 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
        <XAxis dataKey={nameKey} tick={{ fontSize: 10, fill: "#94a3b8" }} angle={-15} textAnchor="end" height={55} tickLine={false} />
        <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} tickLine={false} axisLine={false} />
        <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
        {previousData && <Legend wrapperStyle={{ fontSize: 11 }} />}
        <Bar dataKey={valueKey} fill={barColor} radius={[4, 4, 0, 0]} name="Current" />
        {previousData && previousValueKey && (
          <Bar dataKey={previousValueKey} fill={`${barColor}66`} radius={[4, 4, 0, 0]} name="Previous" />
        )}
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── Tasks chart needs two bars ─────────────────────────────────────
function TasksChart({ data, chartType, previousData }) {
  if (!data?.length) return <NoData />;
  const H = 200;

  if (chartType === "pie") {
    const pieData = data.map(r => ({ name: r.task_type, value: Number(r.total_tasks) || 0 }));
    return (
      <ResponsiveContainer width="100%" height={H}>
        <PieChart>
          <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70}
            label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false} fontSize={10}>
            {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
          </Pie>
          <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
        </PieChart>
      </ResponsiveContainer>
    );
  }

  if (chartType === "line") {
    return (
      <ResponsiveContainer width="100%" height={H}>
        <LineChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis dataKey="task_type" tick={{ fontSize: 10, fill: "#94a3b8" }} tickLine={false} />
          <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} tickLine={false} axisLine={false} />
          <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Line type="monotone" dataKey="total_tasks" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} name="Total" />
          <Line type="monotone" dataKey="completed_tasks" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} name="Completed" />
        </LineChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={H}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 40 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
        <XAxis dataKey="task_type" tick={{ fontSize: 9, fill: "#94a3b8" }} angle={-15} textAnchor="end" height={55} tickLine={false} />
        <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} tickLine={false} axisLine={false} />
        <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Bar dataKey="total_tasks" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Total Tasks" />
        <Bar dataKey="completed_tasks" fill="#10b981" radius={[4, 4, 0, 0]} name="Completed" />
        {previousData && <Bar dataKey="prev_total_tasks" fill="#93c5fd" radius={[4, 4, 0, 0]} name="Previous" />}
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── Main component ─────────────────────────────────────────────────
export default function LiveChartsSection({ allData, loadingMap, errorMap, onRetry, allDataPrevious }) {
  const { enterprises, people, tasks, transactions, services, products } = allData;

  const [chartTypes, setChartTypes] = useState({
    enterprises: "bar",
    people:      "pie",
    tasks:       "bar",
    transactions:"bar",
    services:    "bar",
    products:    "bar",
  });

  const setType = (key, type) => setChartTypes(prev => ({ ...prev, [key]: type }));

  // ── Summary metrics ──────────────────────────────────────────────
  const totalTasks     = tasks?.data ? tasks.data.reduce((s, r) => s + (Number(r.total_tasks) || 0), 0) : null;
  const completedTasks = tasks?.data ? tasks.data.reduce((s, r) => s + (Number(r.completed_tasks) || 0), 0) : null;
  const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : null;
  const totalRevenue   = transactions?.data ? transactions.data.reduce((s, r) => s + (Number(r.total_amount) || 0), 0) : null;
  const totalStock     = products?.data ? products.data.reduce((s, r) => s + (Number(r.total_stock) || 0), 0) : null;

  const hasSummary = completionRate !== null || totalRevenue !== null || totalStock !== null;

  return (
    <div>
      {/* Summary metrics */}
      {hasSummary && (
        <div className="flex flex-wrap gap-3 mb-6">
          {completionRate !== null && (
            <div className="bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-2 flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-500" />
              <div>
                <p className="text-lg font-black text-emerald-700">{completionRate}%</p>
                <p className="text-[10px] text-emerald-500">Task completion rate</p>
              </div>
            </div>
          )}
          {totalRevenue !== null && (
            <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-2 flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-blue-500" />
              <div>
                <p className="text-lg font-black text-blue-700">${totalRevenue.toLocaleString()}</p>
                <p className="text-[10px] text-blue-500">Total revenue</p>
              </div>
            </div>
          )}
          {totalStock !== null && (
            <div className="bg-purple-50 border border-purple-100 rounded-xl px-4 py-2 flex items-center gap-2">
              <Package className="w-4 h-4 text-purple-500" />
              <div>
                <p className="text-lg font-black text-purple-700">{totalStock.toLocaleString()}</p>
                <p className="text-[10px] text-purple-500">Total stock units</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Charts grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        <ChartCard title="Enterprises by Type" loading={loadingMap.enterprises} error={errorMap.enterprises}
          onRetry={() => onRetry("enterprises")} updatedAt={enterprises?.updatedAt}
          chartType={chartTypes.enterprises} onChartTypeChange={(t) => setType("enterprises", t)}>
          <FlexChart data={enterprises?.data} valueKey="enterprise_count" nameKey="enterprise_type"
            barColor="#3b82f6" chartType={chartTypes.enterprises} />
        </ChartCard>

        <ChartCard title="People by Type" loading={loadingMap.people} error={errorMap.people}
          onRetry={() => onRetry("people")} updatedAt={people?.updatedAt}
          chartType={chartTypes.people} onChartTypeChange={(t) => setType("people", t)}>
          <FlexChart data={people?.data} valueKey="people_count" nameKey="person_type"
            barColor="#10b981" chartType={chartTypes.people} />
        </ChartCard>

        <ChartCard title="Tasks by Type" loading={loadingMap.tasks} error={errorMap.tasks}
          onRetry={() => onRetry("tasks")} updatedAt={tasks?.updatedAt}
          chartType={chartTypes.tasks} onChartTypeChange={(t) => setType("tasks", t)}>
          <TasksChart data={tasks?.data} chartType={chartTypes.tasks} previousData={allDataPrevious?.tasks?.data} />
        </ChartCard>

        <ChartCard title="Transactions by Type" loading={loadingMap.transactions} error={errorMap.transactions}
          onRetry={() => onRetry("transactions")} updatedAt={transactions?.updatedAt}
          chartType={chartTypes.transactions} onChartTypeChange={(t) => setType("transactions", t)}>
          <FlexChart data={transactions?.data} valueKey="total_transactions" nameKey="transaction_type"
            barColor="#f97316" chartType={chartTypes.transactions} />
        </ChartCard>

        <ChartCard title="Services by Category" loading={loadingMap.services} error={errorMap.services}
          onRetry={() => onRetry("services")} updatedAt={services?.updatedAt}
          chartType={chartTypes.services} onChartTypeChange={(t) => setType("services", t)}>
          <FlexChart data={services?.data} valueKey="service_count" nameKey="category"
            barColor="#8b5cf6" chartType={chartTypes.services} />
        </ChartCard>

        <ChartCard title="Stock by Item Type" loading={loadingMap.products} error={errorMap.products}
          onRetry={() => onRetry("products")} updatedAt={products?.updatedAt}
          chartType={chartTypes.products} onChartTypeChange={(t) => setType("products", t)}>
          <FlexChart data={products?.data} valueKey="total_stock" nameKey="item_type"
            barColor="#0d9488" chartType={chartTypes.products} />
        </ChartCard>

      </div>
    </div>
  );
}