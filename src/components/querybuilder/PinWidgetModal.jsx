import React, { useState } from "react";
import { X, Pin, BarChart2, PieChart, TrendingUp, Table2, Hash, Map } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ncClient } from "@/api/ncClient";
import MapChart from "./MapChart";

const CHART_TYPES = [
  { key: "table",  label: "Table",   icon: Table2 },
  { key: "bar",    label: "Bar",     icon: BarChart2 },
  { key: "pie",    label: "Pie",     icon: PieChart },
  { key: "line",   label: "Line",    icon: TrendingUp },
  { key: "number", label: "Number",  icon: Hash },
  { key: "map",    label: "Map",     icon: Map },
];

export default function PinWidgetModal({ sql, chartType: initialChartType, data, onClose, onPinned }) {
  const [title, setTitle] = useState(sql.slice(0, 50).trim());
  const [chartType, setChartType] = useState(initialChartType || "bar");
  const [saving, setSaving] = useState(false);

  const hasLatLon = data?.length > 0 && "lat" in data[0] && "lon" in data[0];
  const visibleTypes = CHART_TYPES.filter((t) => t.key !== "map" || hasLatLon);

  const handleSave = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      const user = await ncClient.auth.me().catch(() => null);
      const companyId = user?.company_id || "";

      await ncClient.entities.SavedDashboardWidget.create({
        title: title.trim(),
        sql,
        chart_type: chartType,
        created_by: user?.email || "",
        company_id: companyId,
      });

      if (companyId) {
        const folders = await ncClient.entities.ChartFolder.filter({
          company_id: companyId,
          name: "From QueryBuilder",
        });
        let folderId = folders[0]?.id;
        if (!folderId) {
          const newFolder = await ncClient.entities.ChartFolder.create({
            name: "From QueryBuilder",
            company_id: companyId,
            status: "active",
            shared_with_roles: ["admin"],
          });
          folderId = newFolder.id;
        }
        await ncClient.entities.ReportChart.create({
          title: title.trim(),
          sql_query: sql,
          chart_type: chartType,
          company_id: companyId,
          folder_id: folderId,
          status: "active",
          description: "Pinned from QueryBuilder",
          shared_with_roles: ["admin"],
          is_public: false,
        });
      }

      onPinned?.();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-800 border border-white/10 rounded-2xl w-[440px] shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
          <div className="flex items-center gap-2 text-slate-200">
            <Pin className="w-4 h-4 text-emerald-400" />
            <span className="font-semibold text-sm">Pin to Dashboard</span>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1.5">Widget Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-slate-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-emerald-500"
              placeholder="Enter widget title…"
              autoFocus
            />
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1.5">Chart Type</label>
            <div className="grid grid-cols-3 gap-1.5">
              {visibleTypes.map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  onClick={() => setChartType(key)}
                  className={`flex flex-col items-center gap-1 px-2 py-2.5 rounded-lg border text-xs transition-all ${
                    chartType === key
                      ? "border-emerald-500 bg-emerald-500/10 text-emerald-400"
                      : "border-white/10 text-slate-500 hover:border-white/20 hover:text-slate-300"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span className="text-[9px] font-medium">{label}</span>
                </button>
              ))}
            </div>
            {chartType === "map" && (
              <p className="mt-2 text-[10px] text-slate-500">
                Map charts show location pins on OpenStreetMap. Requires <code className="text-emerald-400">lat</code> and <code className="text-emerald-400">lon</code> columns.
              </p>
            )}
          </div>

          {chartType === "map" && hasLatLon && (
            <div className="rounded-xl overflow-hidden border border-white/10">
              <MapChart data={data} height={180} />
            </div>
          )}

          <div className="bg-slate-900/50 rounded-lg px-3 py-2 border border-white/5">
            <p className="text-[9px] text-slate-600 font-mono uppercase tracking-widest mb-1">SQL</p>
            <p className="text-[11px] text-slate-400 font-mono line-clamp-3">{sql}</p>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-white/5">
          <button onClick={onClose} className="px-4 py-2 text-xs text-slate-500 hover:text-white transition-colors rounded-lg">Cancel</button>
          <Button onClick={handleSave} disabled={saving || !title.trim()}
            className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-8 px-4 rounded-lg gap-1.5">
            <Pin className="w-3.5 h-3.5" />
            {saving ? "Saving…" : "Pin Widget"}
          </Button>
        </div>
      </div>
    </div>
  );
}