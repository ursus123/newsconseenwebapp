import React from "react";
import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, AlertCircle, RefreshCw } from "lucide-react";
import { format } from "date-fns";

const COLORS = [
  "#10b981", "#3b82f6", "#f59e0b", "#ef4444",
  "#8b5cf6", "#06b6d4", "#f97316", "#ec4899",
];

function ChartCard({ title, loading, error, onRetry, updatedAt, children }) {
  return (
    <Card className="border border-slate-100 rounded-2xl">
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-semibold text-slate-700">{title}</CardTitle>
        <div className="flex items-center gap-2">
          {updatedAt && (
            <span className="text-[10px] text-slate-400">
              {format(updatedAt, "h:mm a")}
            </span>
          )}
          {onRetry && (
            <button
              onClick={onRetry}
              className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
            >
              <RefreshCw className="w-3 h-3" />
            </button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <Loader2 className="w-6 h-6 animate-spin text-slate-300" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-48 gap-2">
            <AlertCircle className="w-6 h-6 text-rose-400" />
            <p className="text-xs text-slate-400">{error}</p>
            {onRetry && (
              <button
                onClick={onRetry}
                className="text-xs text-emerald-600 hover:underline font-medium"
              >
                Retry
              </button>
            )}
          </div>
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}

function EmptyState() {
  return (
    <div className="flex items-center justify-center h-48">
      <p className="text-xs text-slate-400">No data available</p>
    </div>
  );
}

// ── Chart 1: Enterprises by Type ─────────────────────────────────────────────
function EnterprisesChart({ data }) {
  if (!data?.length) return <EmptyState />;
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
        <XAxis
          dataKey="enterprise_type"
          tick={{ fontSize: 10, fill: "#94a3b8" }}
          tickLine={false}
        />
        <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} tickLine={false} axisLine={false} />
        <Tooltip
          contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid #e2e8f0" }}
        />
        <Bar dataKey="enterprise_count" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Count" />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── Chart 2: People by Type (Pie) ────────────────────────────────────────────
function PeopleChart({ data }) {
  if (!data?.length) return <EmptyState />;
  return (
    <ResponsiveContainer width="100%" height={200}>
      <PieChart>
        <Pie
          data={data}
          dataKey="people_count"
          nameKey="person_type"
          cx="50%"
          cy="50%"
          outerRadius={70}
          label={({ name, percent }) =>
            `${name} ${(percent * 100).toFixed(0)}%`
          }
          labelLine={false}
          fontSize={10}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid #e2e8f0" }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

// ── Chart 3: Tasks by Type (Grouped Bar) ─────────────────────────────────────
function TasksChart({ data }) {
  if (!data?.length) return <EmptyState />;
  // Aggregate by task_type across all statuses
  const aggregated = data.reduce((acc, row) => {
    const key = row.task_type;
    if (!acc[key]) acc[key] = { task_type: key, total_tasks: 0, completed_tasks: 0 };
    acc[key].total_tasks += Number(row.total_tasks) || 0;
    acc[key].completed_tasks += Number(row.completed_tasks) || 0;
    return acc;
  }, {});
  const chartData = Object.values(aggregated);

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
        <XAxis
          dataKey="task_type"
          tick={{ fontSize: 9, fill: "#94a3b8" }}
          tickLine={false}
        />
        <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} tickLine={false} axisLine={false} />
        <Tooltip
          contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid #e2e8f0" }}
        />
        <Legend wrapperStyle={{ fontSize: 10 }} />
        <Bar dataKey="total_tasks" fill="#8b5cf6" radius={[4, 4, 0, 0]} name="Total" />
        <Bar dataKey="completed_tasks" fill="#10b981" radius={[4, 4, 0, 0]} name="Completed" />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── Chart 4: Transactions by Type ────────────────────────────────────────────
function TransactionsChart({ data }) {
  if (!data?.length) return <EmptyState />;
  const aggregated = data.reduce((acc, row) => {
    const key = row.transaction_type;
    if (!acc[key]) acc[key] = { transaction_type: key, total_transactions: 0, total_amount: 0 };
    acc[key].total_transactions += Number(row.total_transactions) || 0;
    acc[key].total_amount += Number(row.total_amount) || 0;
    return acc;
  }, {});
  const chartData = Object.values(aggregated);

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
        <XAxis
          dataKey="transaction_type"
          tick={{ fontSize: 9, fill: "#94a3b8" }}
          tickLine={false}
        />
        <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} tickLine={false} axisLine={false} />
        <Tooltip
          contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid #e2e8f0" }}
          formatter={(val, name) =>
            name === "total_amount" ? [`$${val.toLocaleString()}`, "Amount"] : [val, "Count"]
          }
        />
        <Legend wrapperStyle={{ fontSize: 10 }} />
        <Bar dataKey="total_transactions" fill="#f97316" radius={[4, 4, 0, 0]} name="Count" />
        <Bar dataKey="total_amount" fill="#fbbf24" radius={[4, 4, 0, 0]} name="Amount ($)" />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── Chart 5: Services by Category ────────────────────────────────────────────
function ServicesChart({ data }) {
  if (!data?.length) return <EmptyState />;
  const aggregated = data.reduce((acc, row) => {
    const key = row.category || row.service_type || "other";
    if (!acc[key]) acc[key] = { category: key, service_count: 0 };
    acc[key].service_count += Number(row.service_count) || 0;
    return acc;
  }, {});
  const chartData = Object.values(aggregated);

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
        <XAxis
          dataKey="category"
          tick={{ fontSize: 10, fill: "#94a3b8" }}
          tickLine={false}
        />
        <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} tickLine={false} axisLine={false} />
        <Tooltip
          contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid #e2e8f0" }}
        />
        <Bar dataKey="service_count" fill="#06b6d4" radius={[4, 4, 0, 0]} name="Services" />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── Chart 6: Stock by Item Type ───────────────────────────────────────────────
function ProductsChart({ data }) {
  if (!data?.length) return <EmptyState />;
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
        <XAxis
          dataKey="item_type"
          tick={{ fontSize: 10, fill: "#94a3b8" }}
          tickLine={false}
        />
        <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} tickLine={false} axisLine={false} />
        <Tooltip
          contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid #e2e8f0" }}
        />
        <Legend wrapperStyle={{ fontSize: 10 }} />
        <Bar dataKey="total_stock" fill="#10b981" radius={[4, 4, 0, 0]} name="Stock" />
        <Bar dataKey="total_products" fill="#6366f1" radius={[4, 4, 0, 0]} name="Products" />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── Main Export ───────────────────────────────────────────────────────────────
export default function LiveChartsSection({ allData, loadingMap, errorMap, onRetry }) {
  const charts = [
    {
      key: "enterprises",
      title: "Enterprises by Type",
      component: <EnterprisesChart data={allData.enterprises?.data} />,
    },
    {
      key: "people",
      title: "People by Type",
      component: <PeopleChart data={allData.people?.data} />,
    },
    {
      key: "tasks",
      title: "Tasks by Type",
      component: <TasksChart data={allData.tasks?.data} />,
    },
    {
      key: "transactions",
      title: "Transactions by Type",
      component: <TransactionsChart data={allData.transactions?.data} />,
    },
    {
      key: "services",
      title: "Services by Category",
      component: <ServicesChart data={allData.services?.data} />,
    },
    {
      key: "products",
      title: "Stock by Item Type",
      component: <ProductsChart data={allData.products?.data} />,
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {charts.map(({ key, title, component }) => (
        <ChartCard
          key={key}
          title={title}
          loading={loadingMap[key]}
          error={errorMap[key]}
          onRetry={() => onRetry(key)}
          updatedAt={allData[key]?.updatedAt}
        >
          {component}
        </ChartCard>
      ))}
    </div>
  );
}
