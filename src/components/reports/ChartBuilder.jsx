import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { BarChart, Bar, PieChart, Pie, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Cell, ResponsiveContainer } from "recharts";
import { Loader2, RefreshCw, AlertCircle } from "lucide-react";

const API_BASE = "https://newsconseenwebapp-production.up.railway.app";

const CHART_TYPES = [
  { value: "bar", label: "Bar Chart" },
  { value: "pie", label: "Pie Chart" },
  { value: "line", label: "Line Chart" },
];

const COLORS = ["#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4"];

const DATA_SOURCES = {
  enterprise_summary: {
    label: "Enterprise Summary",
    endpoint: "/enterprise-summary",
    columns: ["status", "enterprise_type", "enterprise_count"],
  },
  task_summary: {
    label: "Task Summary",
    endpoint: "/task-summary",
    columns: ["task_type", "status", "total_tasks", "completed_tasks"],
  },
  transaction_summary: {
    label: "Transaction Summary",
    endpoint: "/transaction-summary",
    columns: ["transaction_type", "status", "total_transactions", "total_amount", "avg_amount"],
  },
  people_summary: {
    label: "People Summary",
    endpoint: "/people-summary",
    columns: ["person_type", "status", "people_count"],
  },
  service_summary: {
    label: "Service Summary",
    endpoint: "/service-summary",
    columns: ["service_type", "status", "category", "service_count"],
  },
  product_summary: {
    label: "Product Summary",
    endpoint: "/product-summary",
    columns: ["item_type", "status", "total_products", "total_stock", "avg_price"],
  },
};

export default function ChartBuilder({ open, onClose, onSave, initialData = null }) {
  const [selectedTable, setSelectedTable] = useState(initialData?.table || "");
  const [selectedXAxis, setSelectedXAxis] = useState(initialData?.xAxis || "");
  const [selectedYAxis, setSelectedYAxis] = useState(initialData?.yAxis || "");
  const [chartType, setChartType] = useState(initialData?.type || "bar");
  const [title, setTitle] = useState(initialData?.title || "");
  const [saving, setSaving] = useState(false);

  const [apiData, setApiData] = useState([]);
  const [apiLoading, setApiLoading] = useState(false);
  const [apiError, setApiError] = useState(null);

  const currentSource = DATA_SOURCES[selectedTable];
  const columns = currentSource?.columns || [];

  const fetchData = async (tableKey) => {
    const source = DATA_SOURCES[tableKey];
    if (!source) return;
    setApiLoading(true);
    setApiError(null);
    setApiData([]);
    try {
      const res = await fetch(`${API_BASE}${source.endpoint}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      // API may return array directly or wrapped
      const rows = Array.isArray(json) ? json : (json.data || json.results || []);
      setApiData(rows);
    } catch (e) {
      setApiError(e.message || "Failed to fetch data");
    } finally {
      setApiLoading(false);
    }
  };

  useEffect(() => {
    if (selectedTable) {
      setSelectedXAxis("");
      setSelectedYAxis("");
      fetchData(selectedTable);
    }
  }, [selectedTable]);

  const previewData = apiData.slice(0, 10); // cap for readability

  const renderChart = () => {
    if (apiLoading) return (
      <div className="flex items-center justify-center py-16 gap-2 text-slate-400">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="text-sm">Loading data…</span>
      </div>
    );

    if (apiError) return (
      <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
        <AlertCircle className="w-6 h-6 text-rose-400" />
        <p className="text-sm text-rose-500">{apiError}</p>
        <Button size="sm" variant="outline" onClick={() => fetchData(selectedTable)}>
          <RefreshCw className="w-3 h-3 mr-1" /> Retry
        </Button>
      </div>
    );

    if (!selectedXAxis || !selectedYAxis) return (
      <p className="text-sm text-slate-400 text-center py-16">Select axes to preview chart</p>
    );

    if (!previewData.length) return (
      <p className="text-sm text-slate-400 text-center py-16">No data available</p>
    );

    return (
      <ResponsiveContainer width="100%" height={250}>
        {chartType === "bar" ? (
          <BarChart data={previewData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey={selectedXAxis} tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip />
            <Bar dataKey={selectedYAxis} fill="#10b981" radius={[6, 6, 0, 0]} />
          </BarChart>
        ) : chartType === "pie" ? (
          <PieChart>
            <Pie data={previewData} dataKey={selectedYAxis} nameKey={selectedXAxis} cx="50%" cy="50%" outerRadius={80} label>
              {previewData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Pie>
            <Tooltip />
          </PieChart>
        ) : (
          <LineChart data={previewData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey={selectedXAxis} tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey={selectedYAxis} stroke="#10b981" strokeWidth={2} />
          </LineChart>
        )}
      </ResponsiveContainer>
    );
  };

  const handleSave = async () => {
    if (!title || !selectedTable || !selectedXAxis || !selectedYAxis) {
      alert("Please fill in all fields");
      return;
    }
    setSaving(true);
    await onSave({ title, table: selectedTable, xAxis: selectedXAxis, yAxis: selectedYAxis, type: chartType });
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{initialData ? "Edit Chart" : "Create Chart"}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-6 py-4">
          {/* Config */}
          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-slate-600 uppercase block mb-2">Chart Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Tasks by Type"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-600 uppercase block mb-2">Data Source</label>
              <Select value={selectedTable} onValueChange={setSelectedTable}>
                <SelectTrigger>
                  <SelectValue placeholder="Select data source..." />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(DATA_SOURCES).map(([key, { label }]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {apiLoading && (
                <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" /> Fetching data…
                </p>
              )}
              {apiData.length > 0 && !apiLoading && (
                <p className="text-xs text-emerald-600 mt-1">{apiData.length} rows loaded</p>
              )}
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-600 uppercase block mb-2">X-Axis (Categories)</label>
              <Select value={selectedXAxis} onValueChange={setSelectedXAxis} disabled={!selectedTable || apiLoading}>
                <SelectTrigger><SelectValue placeholder="Select column..." /></SelectTrigger>
                <SelectContent>
                  {columns.map((col) => <SelectItem key={col} value={col}>{col}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-600 uppercase block mb-2">Y-Axis (Values)</label>
              <Select value={selectedYAxis} onValueChange={setSelectedYAxis} disabled={!selectedTable || apiLoading}>
                <SelectTrigger><SelectValue placeholder="Select column..." /></SelectTrigger>
                <SelectContent>
                  {columns.map((col) => <SelectItem key={col} value={col}>{col}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-600 uppercase block mb-2">Chart Type</label>
              <Select value={chartType} onValueChange={setChartType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CHART_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Preview */}
          <div>
            <label className="text-xs font-semibold text-slate-600 uppercase block mb-2">Preview</label>
            <Card className="border border-slate-100">
              <CardContent className="pt-4 min-h-[280px] flex flex-col justify-center">
                {renderChart()}
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
            {initialData ? "Update Chart" : "Create Chart"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}