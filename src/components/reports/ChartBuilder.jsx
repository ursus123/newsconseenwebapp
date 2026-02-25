import React, { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, PieChart, Pie, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Cell, ResponsiveContainer } from "recharts";
import { Loader2 } from "lucide-react";

const CHART_TYPES = [
  { value: "bar", label: "Bar Chart" },
  { value: "pie", label: "Pie Chart" },
  { value: "line", label: "Line Chart" },
];

const COLORS = ["#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4"];

export default function ChartBuilder({ open, onClose, onSave, initialData = null }) {
  const [selectedTable, setSelectedTable] = useState(initialData?.table || "");
  const [selectedXAxis, setSelectedXAxis] = useState(initialData?.xAxis || "");
  const [selectedYAxis, setSelectedYAxis] = useState(initialData?.yAxis || "");
  const [chartType, setChartType] = useState(initialData?.type || "bar");
  const [title, setTitle] = useState(initialData?.title || "");
  const [loading, setLoading] = useState(false);

  // Mock data tables - in production, would fetch actual entity data
  const tables = {
    transactions: { label: "Transactions", columns: ["date", "amount", "type", "enterprise", "status"] },
    people: { label: "People", columns: ["first_name", "last_name", "person_type", "status", "engagement_type"] },
    enterprises: { label: "Enterprises", columns: ["enterprise_name", "enterprise_type", "status", "operating_status"] },
    products: { label: "Products", columns: ["name", "category", "stock_quantity", "unit_price", "status"] },
    addresses: { label: "Addresses", columns: ["label", "city", "state_region", "country"] },
  };

  const currentTable = tables[selectedTable];
  const columns = currentTable?.columns || [];

  // Generate mock preview data
  const previewData = useMemo(() => {
    if (!selectedXAxis || !selectedYAxis) return [];
    
    const data = [];
    for (let i = 0; i < 5; i++) {
      data.push({
        [selectedXAxis]: `${selectedXAxis} ${i + 1}`,
        [selectedYAxis]: Math.floor(Math.random() * 1000) + 100,
      });
    }
    return data;
  }, [selectedXAxis, selectedYAxis]);

  const renderChart = () => {
    if (!previewData.length) return <p className="text-sm text-slate-400 text-center py-8">Select axes to preview</p>;

    return (
      <ResponsiveContainer width="100%" height={250}>
        {chartType === "bar" && (
          <BarChart data={previewData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey={selectedXAxis} tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip />
            <Bar dataKey={selectedYAxis} fill="#10b981" radius={[6, 6, 0, 0]} />
          </BarChart>
        )}
        {chartType === "pie" && (
          <PieChart>
            <Pie data={previewData} dataKey={selectedYAxis} nameKey={selectedXAxis} cx="50%" cy="50%" outerRadius={80} label>
              {previewData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Pie>
            <Tooltip />
          </PieChart>
        )}
        {chartType === "line" && (
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

    setLoading(true);
    await onSave({
      title,
      table: selectedTable,
      xAxis: selectedXAxis,
      yAxis: selectedYAxis,
      type: chartType,
    });
    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{initialData ? "Edit Chart" : "Create Chart"}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-6 py-4">
          {/* Configuration */}
          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-slate-600 uppercase block mb-2">Chart Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Monthly Revenue"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-600 uppercase block mb-2">Data Source</label>
              <Select value={selectedTable} onValueChange={setSelectedTable}>
                <SelectTrigger>
                  <SelectValue placeholder="Select table..." />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(tables).map(([key, { label }]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-600 uppercase block mb-2">X-Axis (Categories)</label>
              <Select value={selectedXAxis} onValueChange={setSelectedXAxis} disabled={!selectedTable}>
                <SelectTrigger>
                  <SelectValue placeholder="Select column..." />
                </SelectTrigger>
                <SelectContent>
                  {columns.map((col) => (
                    <SelectItem key={col} value={col}>{col}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-600 uppercase block mb-2">Y-Axis (Values)</label>
              <Select value={selectedYAxis} onValueChange={setSelectedYAxis} disabled={!selectedTable}>
                <SelectTrigger>
                  <SelectValue placeholder="Select column..." />
                </SelectTrigger>
                <SelectContent>
                  {columns.map((col) => (
                    <SelectItem key={col} value={col}>{col}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-600 uppercase block mb-2">Chart Type</label>
              <Select value={chartType} onValueChange={setChartType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CHART_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Preview */}
          <div>
            <label className="text-xs font-semibold text-slate-600 uppercase block mb-2">Preview</label>
            <Card className="border border-slate-100">
              <CardContent className="pt-4">
                {renderChart()}
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            {initialData ? "Update Chart" : "Create Chart"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}