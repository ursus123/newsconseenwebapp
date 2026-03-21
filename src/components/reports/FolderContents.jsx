import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { BarChart2, FileText, LayoutGrid, List, Clock, Trash2, Edit2, Eye, Pin, ArrowUpRight } from "lucide-react";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";

function PinnedWidgetCard({ widget, onDelete, onPromote, isAdmin }) {
  return (
    <div className="bg-white rounded-2xl border border-dashed border-emerald-200 hover:shadow-md transition-all overflow-hidden">
      <div className="h-28 bg-gradient-to-br from-emerald-50 to-teal-50 flex items-center justify-center border-b border-emerald-100">
        <BarChart2 className="w-8 h-8 text-emerald-300" />
      </div>
      <div className="p-4">
        <p className="text-sm font-semibold text-slate-800 truncate">{widget.title}</p>
        <div className="flex items-center gap-2 mt-1">
          <Badge className="text-[10px] bg-emerald-50 text-emerald-700 capitalize">{widget.chart_type || "table"}</Badge>
          <span className="text-[10px] text-slate-400">From QueryBuilder</span>
        </div>
        {widget.sql && (
          <p className="text-[10px] font-mono text-slate-400 mt-1.5 truncate bg-slate-50 px-2 py-1 rounded">
            {widget.sql.substring(0, 60)}...
          </p>
        )}
        {isAdmin && (
          <div className="flex gap-2 mt-3">
            <button
              onClick={onPromote}
              className="flex-1 flex items-center justify-center gap-1 h-7 text-[11px] bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-all"
            >
              <ArrowUpRight className="w-3 h-3" /> Add to Reports
            </button>
            <button
              onClick={onDelete}
              className="h-7 px-2 text-[11px] border border-slate-200 text-rose-500 rounded-lg hover:bg-rose-50 transition-all"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const CHART_TYPE_LABELS = { bar: "Bar", line: "Line", pie: "Pie", area: "Area", number: "Number", table: "Table", gauge: "Gauge", scatter: "Scatter" };

function canUserSee(item, currentUser) {
  if (!currentUser) return false;
  if (currentUser.role === "admin" || currentUser.role === "super_admin") return true;
  if (item.is_public) return true;
  if (item.shared_with_roles?.includes(currentUser.role)) return true;
  if (item.shared_with_users?.includes(currentUser.email)) return true;
  if (item.created_by === currentUser.email) return true;
  return false;
}

function ChartCard({ chart, onView, onEdit, onDelete, isAdmin }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 hover:shadow-md transition-all overflow-hidden group">
      <div className="h-32 bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center border-b border-slate-100">
        <BarChart2 className="w-10 h-10 text-slate-300" />
      </div>
      <div className="p-4">
        <p className="text-sm font-semibold text-slate-800 truncate">{chart.title}</p>
        <div className="flex items-center gap-2 mt-1.5">
          <Badge className="text-[10px] bg-blue-50 text-blue-700 capitalize">{CHART_TYPE_LABELS[chart.chart_type] || chart.chart_type}</Badge>
          {chart.tags?.slice(0, 1).map((t) => (
            <span key={t} className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">{t}</span>
          ))}
        </div>
        {chart.updated_date && (
          <p className="text-[11px] text-slate-400 mt-1.5 flex items-center gap-1">
            <Clock className="w-3 h-3" /> Updated {format(new Date(chart.updated_date), "MMM d, h:mm a")}
          </p>
        )}
        <div className="flex gap-2 mt-3">
          <Button size="sm" className="h-7 text-[11px] bg-emerald-600 hover:bg-emerald-700 text-white flex-1" onClick={() => onView(chart)}>
            <Eye className="w-3 h-3 mr-1" /> View
          </Button>
          {isAdmin && (
            <>
              <Button size="sm" variant="outline" className="h-7 text-[11px] px-2" onClick={() => onEdit(chart)}>
                <Edit2 className="w-3 h-3" />
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-[11px] px-2 text-rose-500 hover:bg-rose-50" onClick={() => onDelete(chart)}>
                <Trash2 className="w-3 h-3" />
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ReportCard({ report, onView, onEdit, onDelete, isAdmin }) {
  const sectionCount = report.sections?.length || 0;
  return (
    <div className="bg-white rounded-2xl border border-slate-200 hover:shadow-md transition-all overflow-hidden group">
      <div className="h-32 bg-gradient-to-br from-violet-50 to-violet-100 flex items-center justify-center border-b border-slate-100">
        <FileText className="w-10 h-10 text-violet-300" />
      </div>
      <div className="p-4">
        <p className="text-sm font-semibold text-slate-800 truncate">{report.title}</p>
        <div className="flex items-center gap-2 mt-1.5">
          <Badge className={`text-[10px] capitalize ${report.status === "published" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
            {report.status}
          </Badge>
          <span className="text-[10px] text-slate-400">{sectionCount} sections</span>
        </div>
        {report.updated_date && (
          <p className="text-[11px] text-slate-400 mt-1.5 flex items-center gap-1">
            <Clock className="w-3 h-3" /> {format(new Date(report.updated_date), "MMM d, h:mm a")}
          </p>
        )}
        <div className="flex gap-2 mt-3">
          <Button size="sm" className="h-7 text-[11px] bg-violet-600 hover:bg-violet-700 text-white flex-1" onClick={() => onView(report)}>
            <Eye className="w-3 h-3 mr-1" /> Open
          </Button>
          {isAdmin && (
            <>
              <Button size="sm" variant="outline" className="h-7 text-[11px] px-2" onClick={() => onEdit(report)}>
                <Edit2 className="w-3 h-3" />
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-[11px] px-2 text-rose-500 hover:bg-rose-50" onClick={() => onDelete(report)}>
                <Trash2 className="w-3 h-3" />
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function FolderContents({
  selected, folders, charts, reports, currentUser,
  onViewChart, onEditChart, onDeleteChart,
  onViewReport, onEditReport, onDeleteReport,
  pinnedWidgets = [], onPinnedWidgetsChange,
}) {
  const [viewMode, setViewMode] = useState("grid");
  const isAdmin = currentUser?.role === "admin" || currentUser?.role === "super_admin";
  const qc = useQueryClient();

  let visibleCharts = charts.filter((c) => canUserSee(c, currentUser));
  let visibleReports = reports.filter((r) => canUserSee(r, currentUser));
  let breadcrumb = [];
  let title = "All Items";

  if (selected?.type === "all-charts") {
    visibleReports = [];
    title = "All Charts";
    breadcrumb = ["Reports & Charts", "All Charts"];
  } else if (selected?.type === "all-reports") {
    visibleCharts = [];
    title = "All Reports";
    breadcrumb = ["Reports & Charts", "All Reports"];
  } else if (selected?.type === "starred") {
    // placeholder
    visibleCharts = [];
    visibleReports = [];
    title = "Starred";
    breadcrumb = ["Reports & Charts", "Starred"];
  } else if (selected?.type === "folder") {
    const folder = folders.find((f) => f.id === selected.id);
    if (folder) {
      visibleCharts = visibleCharts.filter((c) => c.folder_id === folder.id);
      visibleReports = visibleReports.filter((r) => r.folder_id === folder.id);
      title = `${folder.icon || "📁"} ${folder.name}`;
      // Build breadcrumb
      const crumbs = [folder.name];
      let parent = folders.find((f) => f.id === folder.parent_folder_id);
      while (parent) {
        crumbs.unshift(parent.name);
        parent = folders.find((f) => f.id === parent.parent_folder_id);
      }
      breadcrumb = ["Reports & Charts", ...crumbs];
    }
  }

  const totalItems = visibleCharts.length + visibleReports.length;

  return (
    <div className="flex flex-col h-full">
      {/* Breadcrumb + controls */}
      <div className="px-6 py-4 border-b border-slate-100 bg-white shrink-0">
        <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1">
          {breadcrumb.map((crumb, i) => (
            <React.Fragment key={i}>
              {i > 0 && <span>/</span>}
              <span className={i === breadcrumb.length - 1 ? "text-slate-700 font-medium" : "hover:text-slate-600 cursor-pointer"}>
                {crumb}
              </span>
            </React.Fragment>
          ))}
        </div>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-800">{title}</h2>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">{totalItems} items</span>
            <div className="flex border border-slate-200 rounded-lg overflow-hidden">
              <button
                onClick={() => setViewMode("grid")}
                className={`p-1.5 ${viewMode === "grid" ? "bg-slate-100" : "hover:bg-slate-50"}`}
              >
                <LayoutGrid className="w-3.5 h-3.5 text-slate-500" />
              </button>
              <button
                onClick={() => setViewMode("list")}
                className={`p-1.5 ${viewMode === "list" ? "bg-slate-100" : "hover:bg-slate-50"}`}
              >
                <List className="w-3.5 h-3.5 text-slate-500" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* Pinned from QueryBuilder — only on All Charts view */}
        {selected?.type === "all-charts" && pinnedWidgets.length > 0 && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Pin className="w-4 h-4 text-emerald-500" />
                <h3 className="text-sm font-bold text-slate-700">Pinned from QueryBuilder</h3>
                <span className="text-xs text-slate-400">({pinnedWidgets.length})</span>
              </div>
              <span className="text-xs text-slate-400 hidden sm:block">Charts pinned directly from SQL queries</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {pinnedWidgets.map((widget) => (
                <PinnedWidgetCard
                  key={widget.id}
                  widget={widget}
                  isAdmin={isAdmin}
                  onDelete={async () => {
                    await base44.entities.SavedDashboardWidget.delete(widget.id);
                    qc.invalidateQueries({ queryKey: ["pinnedWidgets"] });
                    if (onPinnedWidgetsChange) onPinnedWidgetsChange();
                  }}
                  onPromote={async () => {
                    await base44.entities.ReportChart.create({
                      title: widget.title,
                      sql_query: widget.sql,
                      chart_type: widget.chart_type || "bar",
                      company_id: widget.company_id,
                      status: "active",
                      is_public: false,
                      shared_with_roles: ["admin"],
                    });
                    await base44.entities.SavedDashboardWidget.delete(widget.id);
                    qc.invalidateQueries({ queryKey: ["pinnedWidgets"] });
                    qc.invalidateQueries({ queryKey: ["reportCharts"] });
                    if (onPinnedWidgetsChange) onPinnedWidgetsChange();
                  }}
                />
              ))}
            </div>
            {totalItems > 0 && <div className="border-t border-slate-100 mt-6 mb-2" />}
          </div>
        )}

        {totalItems === 0 && (selected?.type !== "all-charts" || pinnedWidgets.length === 0) && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <BarChart2 className="w-12 h-12 text-slate-200 mb-3" />
            <p className="text-slate-500 font-medium">No items here yet</p>
            <p className="text-slate-400 text-sm mt-1">Create a chart or report to get started</p>
          </div>
        )}
        {totalItems > 0 && viewMode === "grid" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {visibleCharts.map((chart) => (
              <ChartCard
                key={chart.id}
                chart={chart}
                isAdmin={isAdmin}
                onView={onViewChart}
                onEdit={onEditChart}
                onDelete={onDeleteChart}
              />
            ))}
            {visibleReports.map((report) => (
              <ReportCard
                key={report.id}
                report={report}
                isAdmin={isAdmin}
                onView={onViewReport}
                onEdit={onEditReport}
                onDelete={onDeleteReport}
              />
            ))}
          </div>
        )}
        {totalItems > 0 && viewMode === "list" && (
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="text-left py-3 px-4 font-semibold text-slate-600">Name</th>
                  <th className="text-left py-3 px-4 font-semibold text-slate-600">Type</th>
                  <th className="text-left py-3 px-4 font-semibold text-slate-600">Last Updated</th>
                  <th className="text-left py-3 px-4 font-semibold text-slate-600">Shared With</th>
                  <th className="py-3 px-4" />
                </tr>
              </thead>
              <tbody>
                {visibleCharts.map((chart) => (
                  <tr key={chart.id} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <BarChart2 className="w-4 h-4 text-blue-400" />
                        <span className="font-medium text-slate-700">{chart.title}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4"><Badge className="text-[10px] bg-blue-50 text-blue-700 capitalize">{chart.chart_type}</Badge></td>
                    <td className="py-3 px-4 text-slate-400">{chart.updated_date ? format(new Date(chart.updated_date), "MMM d, yyyy") : "—"}</td>
                    <td className="py-3 px-4 text-slate-400">{chart.is_public ? "Everyone" : (chart.shared_with_roles || []).join(", ") || "Private"}</td>
                    <td className="py-3 px-4">
                      <div className="flex gap-1 justify-end">
                        <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => onViewChart(chart)}>View</Button>
                        {isAdmin && <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => onEditChart(chart)}>Edit</Button>}
                      </div>
                    </td>
                  </tr>
                ))}
                {visibleReports.map((report) => (
                  <tr key={report.id} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-violet-400" />
                        <span className="font-medium text-slate-700">{report.title}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4"><Badge className={`text-[10px] capitalize ${report.status === "published" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{report.status}</Badge></td>
                    <td className="py-3 px-4 text-slate-400">{report.updated_date ? format(new Date(report.updated_date), "MMM d, yyyy") : "—"}</td>
                    <td className="py-3 px-4 text-slate-400">{report.is_public ? "Everyone" : (report.shared_with_roles || []).join(", ") || "Private"}</td>
                    <td className="py-3 px-4">
                      <div className="flex gap-1 justify-end">
                        <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => onViewReport(report)}>Open</Button>
                        {isAdmin && <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => onEditReport(report)}>Edit</Button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}