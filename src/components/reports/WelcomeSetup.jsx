import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { BarChart2, Loader2 } from "lucide-react";

const TEMPLATES = [
  { id: "healthcare", label: "Healthcare Operations", icon: "🏥", description: "Client care, staffing, medication, revenue" },
  { id: "school", label: "School Management", icon: "🎓", description: "Enrollment, attendance, staff, finances" },
  { id: "social", label: "Social Services", icon: "🤝", description: "Case management, outcomes, compliance" },
  { id: "general", label: "General Business", icon: "🏢", description: "Sales, operations, HR, finance" },
];

const HEALTHCARE_FOLDERS = [
  { name: "Client Care", icon: "🏥", children: [
    { name: "Retention & Risk", icon: "📉" },
    { name: "Medication Compliance", icon: "💊" },
  ]},
  { name: "Staffing", icon: "👥", children: [
    { name: "Certifications", icon: "🏅" },
    { name: "Performance", icon: "📊" },
  ]},
  { name: "Revenue", icon: "💰", children: [
    { name: "By Enterprise", icon: "🏢" },
    { name: "Outstanding Payments", icon: "💳" },
  ]},
  { name: "Inventory", icon: "📦", children: [
    { name: "Stock Levels", icon: "📋" },
    { name: "Medication Supplies", icon: "🩺" },
  ]},
];

const DEFAULT_CHARTS = (folderMap, companyId) => [
  {
    title: "Revenue by Enterprise",
    chart_type: "bar",
    sql_query: `SELECT enterprise, SUM(amount) as revenue FROM transactions WHERE transaction_type = 'service_fee' AND status = 'posted' GROUP BY enterprise`,
    x_axis_key: "enterprise",
    y_axis_key: "revenue",
    color_scheme: "emerald",
    folder_id: folderMap["By Enterprise"] || null,
    shared_with_roles: ["admin", "executive"],
    is_public: false,
    company_id: companyId,
    status: "active",
  },
  {
    title: "Staff to Client Ratio",
    chart_type: "bar",
    sql_query: `SELECT enterprise_name, COUNT(DISTINCT CASE WHEN person_type='employee' THEN id END) as staff, COUNT(DISTINCT CASE WHEN person_type='client' THEN id END) as clients FROM people GROUP BY enterprise_name`,
    x_axis_key: "enterprise_name",
    y_axis_key: "clients",
    color_scheme: "blue",
    folder_id: folderMap["Performance"] || null,
    shared_with_roles: ["admin"],
    is_public: false,
    company_id: companyId,
    status: "active",
  },
  {
    title: "Task Completion Rate",
    chart_type: "number",
    sql_query: `SELECT SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) * 100.0 / COUNT(*) as completion_rate FROM tasks`,
    x_axis_key: "",
    y_axis_key: "completion_rate",
    color_scheme: "emerald",
    folder_id: folderMap["Retention & Risk"] || null,
    shared_with_roles: ["admin", "executive"],
    is_public: false,
    company_id: companyId,
    status: "active",
  },
  {
    title: "Active Clients by Enterprise",
    chart_type: "pie",
    sql_query: `SELECT enterprise, COUNT(*) as clients FROM people WHERE person_type='client' AND status='active' GROUP BY enterprise`,
    x_axis_key: "enterprise",
    y_axis_key: "clients",
    color_scheme: "purple",
    folder_id: folderMap["Client Care"] || null,
    shared_with_roles: ["admin", "executive"],
    is_public: false,
    company_id: companyId,
    status: "active",
  },
  {
    title: "Revenue by Service Type",
    chart_type: "bar",
    sql_query: `SELECT CASE WHEN description LIKE '%Companion%' THEN 'Companion Care' WHEN description LIKE '%Personal%' THEN 'Personal Care' WHEN description LIKE '%Nursing%' THEN 'Skilled Nursing' WHEN description LIKE '%Dementia%' THEN 'Dementia Care' ELSE 'Other' END as service, SUM(amount) as revenue FROM transactions WHERE transaction_type='service_fee' GROUP BY service ORDER BY revenue DESC`,
    x_axis_key: "service",
    y_axis_key: "revenue",
    color_scheme: "orange",
    folder_id: folderMap["Revenue"] || null,
    shared_with_roles: ["admin", "executive"],
    is_public: false,
    company_id: companyId,
    status: "active",
  },
];

export default function WelcomeSetup({ currentUser, onComplete }) {
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);

  const handleTemplate = async (templateId) => {
    setCreating(true);
    const companyId = currentUser?.company_id;

    if (templateId === "healthcare") {
      // Create folders
      const folderMap = {};
      for (const rootDef of HEALTHCARE_FOLDERS) {
        const root = await base44.entities.ChartFolder.create({
          name: rootDef.name, icon: rootDef.icon,
          company_id: companyId, status: "active",
          shared_with_roles: ["admin", "executive"],
        });
        folderMap[rootDef.name] = root.id;
        for (const childDef of rootDef.children) {
          const child = await base44.entities.ChartFolder.create({
            name: childDef.name, icon: childDef.icon,
            parent_folder_id: root.id,
            company_id: companyId, status: "active",
            shared_with_roles: ["admin", "executive"],
          });
          folderMap[childDef.name] = child.id;
        }
      }

      // Create charts
      const chartDefs = DEFAULT_CHARTS(folderMap, companyId);
      const createdCharts = [];
      for (const chartData of chartDefs) {
        const c = await base44.entities.ReportChart.create(chartData);
        createdCharts.push(c);
      }

      // Create default report
      await base44.entities.Report.create({
        title: "BrightStar Care — Operations Overview",
        status: "published",
        folder_id: folderMap["Revenue"] || null,
        shared_with_roles: ["admin", "executive"],
        is_public: false,
        allow_comments: true,
        company_id: companyId,
        published_at: new Date().toISOString(),
        sections: [
          { type: "heading", content: "BrightStar Care LLC", level: "H1" },
          { type: "heading", content: "Operations Overview Report", level: "H2" },
          { type: "text", content: "This report provides an executive summary of operations across all three subsidiaries: Chiloh Residential Care LLC (Maine), Gracia Deus Care LLC (Indiana), and Bridges LLC (Minnesota)." },
          { type: "divider" },
          { type: "heading", content: "Key Metrics", level: "H2" },
          { type: "metric", icon: "👥", value: "—", label: "Total Clients" },
          { type: "metric", icon: "🏥", value: "—", label: "Total Staff" },
          { type: "metric", icon: "🏢", value: "4", label: "Active Enterprises" },
          { type: "divider" },
          { type: "heading", content: "Revenue Performance", level: "H2" },
          { type: "chart", chart_id: createdCharts[0]?.id, width: "full", caption: "Revenue breakdown by enterprise" },
          { type: "chart", chart_id: createdCharts[4]?.id, width: "full", caption: "Revenue by service type" },
          { type: "divider" },
          { type: "heading", content: "Operations", level: "H2" },
          { type: "chart", chart_id: createdCharts[2]?.id, width: "half", caption: "Overall task completion rate" },
          { type: "chart", chart_id: createdCharts[3]?.id, width: "half", caption: "Active clients by enterprise" },
          { type: "divider" },
          { type: "text", content: "Report generated by Newsconseen. For questions contact your administrator." },
        ],
      });
    } else {
      // For other templates just create a root folder
      await base44.entities.ChartFolder.create({
        name: TEMPLATES.find((t) => t.id === templateId)?.label || "My Workspace",
        icon: TEMPLATES.find((t) => t.id === templateId)?.icon || "📁",
        company_id: companyId, status: "active",
        shared_with_roles: ["admin"],
      });
    }

    qc.invalidateQueries({ queryKey: ["chartFolders"] });
    qc.invalidateQueries({ queryKey: ["reportCharts"] });
    qc.invalidateQueries({ queryKey: ["reports"] });
    setCreating(false);
    onComplete();
  };

  return (
    <div className="flex flex-col items-center justify-center h-full py-20 px-8">
      <div className="w-16 h-16 rounded-2xl bg-emerald-50 flex items-center justify-center mb-6">
        <BarChart2 className="w-8 h-8 text-emerald-600" />
      </div>
      <h2 className="text-2xl font-bold text-slate-800 mb-2">Welcome to Reports & Charts</h2>
      <p className="text-slate-500 text-sm mb-8 text-center max-w-md">
        Choose a template to set up your folder structure, default charts, and a sample report — or start from scratch.
      </p>

      <div className="grid grid-cols-2 gap-4 mb-6 w-full max-w-xl">
        {TEMPLATES.map((t) => (
          <button
            key={t.id}
            disabled={creating}
            onClick={() => handleTemplate(t.id)}
            className="flex flex-col items-start p-5 bg-white border-2 border-slate-200 hover:border-emerald-400 rounded-2xl transition-all text-left"
          >
            <span className="text-2xl mb-2">{t.icon}</span>
            <p className="text-sm font-semibold text-slate-800">{t.label}</p>
            <p className="text-xs text-slate-400 mt-0.5">{t.description}</p>
          </button>
        ))}
      </div>

      {creating && (
        <div className="flex items-center gap-2 text-sm text-emerald-600 font-medium">
          <Loader2 className="w-4 h-4 animate-spin" />
          Setting up your workspace...
        </div>
      )}

      <button
        disabled={creating}
        onClick={onComplete}
        className="text-xs text-slate-400 hover:text-slate-600 mt-3 underline"
      >
        Skip and start from scratch
      </button>
    </div>
  );
}