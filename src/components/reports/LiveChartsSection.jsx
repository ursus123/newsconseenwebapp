import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { Loader2, RefreshCw, AlertCircle } from "lucide-react";
import { format } from "date-fns";

const PIE_COLORS = ["#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#f43f5e", "#84cc16"];

function ChartCard({ title, loading, error, onRetry, updatedAt, children }) {
  return (
    <Card className="border border-slate-100 rounded-2xl">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-bold text-slate-700">{title}</CardTitle>
        {updatedAt && !loading && !error && (
          <span className="text-[10px] text-slate-400">Updated {format(updatedAt, "h:mm:ss a")}</span>
        )}
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-56 flex items-center justify-center gap-2 text-slate-400">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Loading…</span>
          </div>
        ) : error ? (
          <div className="h-56 flex flex-col items-center justify-center gap-3 text-center">
            <AlertCircle className="w-6 h-6 text-rose-400" />
            <p className="text-sm text-slate-500">{error}</p>
            <Button size="sm" variant="outline" onClick={onRetry}>
              <RefreshCw className="w-3 h-3 mr-1" /> Retry
            </Button>
          </div>
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}

function NoData() {
  return <div className="h-56 flex items-center justify-center text-sm text-slate-400">No data available</div>;
}

export default function LiveChartsSection({ allData, loadingMap, errorMap, onRetry }) {
  const { enterprises, people, tasks, transactions, services, products } = allData;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

      {/* Chart 1: Enterprises by Type */}
      <ChartCard title="Enterprises by Type" loading={loadingMap.enterprises} error={errorMap.enterprises} onRetry={() => onRetry("enterprises")} updatedAt={enterprises?.updatedAt}>
        {!enterprises?.data?.length ? <NoData /> : (
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={enterprises.data}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="enterprise_type" tick={{ fontSize: 10, fill: "#94a3b8" }} angle={-15} textAnchor="end" height={50} />
                <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} />
                <Tooltip />
                <Bar dataKey="enterprise_count" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Enterprises" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </ChartCard>

      {/* Chart 2: People by Type */}
      <ChartCard title="People by Type" loading={loadingMap.people} error={errorMap.people} onRetry={() => onRetry("people")} updatedAt={people?.updatedAt}>
        {!people?.data?.length ? <NoData /> : (
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={people.data} dataKey="people_count" nameKey="person_type" cx="50%" cy="50%" outerRadius={80} label={({ person_type, percent }) => `${person_type} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                  {people.data.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(val) => [val, "People"]} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </ChartCard>

      {/* Chart 3: Tasks by Type */}
      <ChartCard title="Tasks by Type" loading={loadingMap.tasks} error={errorMap.tasks} onRetry={() => onRetry("tasks")} updatedAt={tasks?.updatedAt}>
        {!tasks?.data?.length ? <NoData /> : (
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={tasks.data}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="task_type" tick={{ fontSize: 9, fill: "#94a3b8" }} angle={-15} textAnchor="end" height={55} />
                <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="total_tasks" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Total Tasks" />
                <Bar dataKey="completed_tasks" fill="#10b981" radius={[4, 4, 0, 0]} name="Completed" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </ChartCard>

      {/* Chart 4: Transactions by Type */}
      <ChartCard title="Transactions by Type" loading={loadingMap.transactions} error={errorMap.transactions} onRetry={() => onRetry("transactions")} updatedAt={transactions?.updatedAt}>
        {!transactions?.data?.length ? <NoData /> : (
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={transactions.data}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="transaction_type" tick={{ fontSize: 10, fill: "#94a3b8" }} angle={-15} textAnchor="end" height={55} />
                <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} />
                <Tooltip />
                <Bar dataKey="total_transactions" fill="#f97316" radius={[4, 4, 0, 0]} name="Transactions" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </ChartCard>

      {/* Chart 5: Services by Category */}
      <ChartCard title="Services by Category" loading={loadingMap.services} error={errorMap.services} onRetry={() => onRetry("services")} updatedAt={services?.updatedAt}>
        {!services?.data?.length ? <NoData /> : (
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={services.data}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="category" tick={{ fontSize: 10, fill: "#94a3b8" }} angle={-15} textAnchor="end" height={55} />
                <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} />
                <Tooltip />
                <Bar dataKey="service_count" fill="#8b5cf6" radius={[4, 4, 0, 0]} name="Services" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </ChartCard>

      {/* Chart 6: Stock by Item Type */}
      <ChartCard title="Stock by Item Type" loading={loadingMap.products} error={errorMap.products} onRetry={() => onRetry("products")} updatedAt={products?.updatedAt}>
        {!products?.data?.length ? <NoData /> : (
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={products.data}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="item_type" tick={{ fontSize: 10, fill: "#94a3b8" }} angle={-15} textAnchor="end" height={55} />
                <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} />
                <Tooltip />
                <Bar dataKey="total_stock" fill="#0d9488" radius={[4, 4, 0, 0]} name="Total Stock" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </ChartCard>

    </div>
  );
}