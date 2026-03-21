import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import FolderTree from "@/components/reports/FolderTree";
import FolderContents from "@/components/reports/FolderContents";
import ChartBuilder from "@/components/reports/ChartBuilder";
import ReportBuilder from "@/components/reports/ReportBuilder";
import ReportViewer from "@/components/reports/ReportViewer";
import WelcomeSetup from "@/components/reports/WelcomeSetup";
import { Loader2, RefreshCw } from "lucide-react";

function canUserSee(item, currentUser) {
  if (!currentUser) return false;
  if (currentUser.role === "admin" || currentUser.role === "super_admin") return true;
  if (item.is_public) return true;
  if (item.shared_with_roles?.includes(currentUser.role)) return true;
  if (item.shared_with_users?.includes(currentUser.email)) return true;
  if (item.created_by === currentUser.email) return true;
  return false;
}

export default function Reports() {
  const [currentUser, setCurrentUser] = useState(null);
  const [selected, setSelected] = useState({ type: "all-charts", id: "all-charts" });
  const [view, setView] = useState("folders"); // folders | chart-builder | report-builder | report-viewer | chart-viewer
  const [editingChart, setEditingChart] = useState(null);
  const [editingReport, setEditingReport] = useState(null);
  const [viewingReport, setViewingReport] = useState(null);
  const [newFolderParentId, setNewFolderParentId] = useState(null);
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [setupDone, setSetupDone] = useState(false);
  const [etlLoading, setEtlLoading] = useState(false);
  const [etlResult, setEtlResult] = useState(null);

  const qc = useQueryClient();

  useEffect(() => {
    base44.auth.me().then(setCurrentUser).catch(() => {});
  }, []);

  const isAdmin = currentUser?.role === "admin" || currentUser?.role === "super_admin";

  const { data: folders = [] } = useQuery({
    queryKey: ["chartFolders"],
    queryFn: () => base44.entities.ChartFolder.filter({ status: "active" }),
    enabled: !!currentUser,
  });

  const { data: allCharts = [] } = useQuery({
    queryKey: ["reportCharts"],
    queryFn: () => base44.entities.ReportChart.filter({ status: "active" }),
    enabled: !!currentUser,
  });

  const { data: allReports = [] } = useQuery({
    queryKey: ["reports"],
    queryFn: () => base44.entities.Report.list(),
    enabled: !!currentUser,
  });

  const createFolderMut = useMutation({
    mutationFn: (data) => base44.entities.ChartFolder.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["chartFolders"] });
      setShowNewFolderModal(false);
      setNewFolderName("");
    },
  });

  const deleteChartMut = useMutation({
    mutationFn: (id) => base44.entities.ReportChart.update(id, { status: "archived" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["reportCharts"] }),
  });

  const deleteReportMut = useMutation({
    mutationFn: (id) => base44.entities.Report.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["reports"] }),
  });

  // Filter by company and visibility
  const charts = allCharts.filter((c) => {
    if (currentUser?.role === "super_admin") return true;
    if (c.company_id && currentUser?.company_id && c.company_id !== currentUser.company_id) return false;
    return canUserSee(c, currentUser);
  });

  const reports = allReports.filter((r) => {
    if (currentUser?.role === "super_admin") return true;
    if (r.company_id && currentUser?.company_id && r.company_id !== currentUser.company_id) return false;
    return canUserSee(r, currentUser);
  });

  // Check if setup needed
  const myFolders = folders.filter((f) => {
    if (currentUser?.role === "super_admin") return true;
    return !f.company_id || f.company_id === currentUser?.company_id;
  });
  const showSetup = isAdmin && myFolders.length === 0 && charts.length === 0 && !setupDone;

  const handleNewFolder = (parentId) => {
    setNewFolderParentId(parentId);
    setShowNewFolderModal(true);
  };

  const handleCreateFolder = () => {
    if (!newFolderName.trim()) return;
    createFolderMut.mutate({
      name: newFolderName.trim(),
      parent_folder_id: newFolderParentId || null,
      company_id: currentUser?.company_id,
      status: "active",
      shared_with_roles: ["admin"],
    });
  };

  const handleViewChart = (chart) => {
    setEditingChart(chart);
    setView("chart-viewer");
  };

  const handleEditChart = (chart) => {
    setEditingChart(chart);
    setView("chart-builder");
  };

  const handleViewReport = (report) => {
    setViewingReport(report);
    setView("report-viewer");
  };

  const handleEditReport = (report) => {
    setEditingReport(report);
    setView("report-builder");
  };

  const handleBack = () => {
    setView("folders");
    setEditingChart(null);
    setEditingReport(null);
    setViewingReport(null);
  };

  if (!currentUser) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
      {/* Left Sidebar */}
      <div className="w-60 border-r border-slate-100 shrink-0 overflow-hidden">
        <FolderTree
          folders={myFolders}
          charts={charts}
          reports={reports}
          selected={selected}
          onSelect={(s) => { setSelected(s); setView("folders"); }}
          onNewFolder={handleNewFolder}
          onNewChart={() => { setEditingChart(null); setView("chart-builder"); }}
          onNewReport={() => { setEditingReport(null); setView("report-builder"); }}
          currentUser={currentUser}
        />
      </div>

      {/* Right Content */}
      <div className="flex-1 overflow-hidden">
        {showSetup ? (
          <WelcomeSetup currentUser={currentUser} onComplete={() => setSetupDone(true)} />
        ) : view === "chart-builder" ? (
          <ChartBuilder
            chart={editingChart}
            folders={myFolders}
            currentUser={currentUser}
            onClose={handleBack}
          />
        ) : view === "report-builder" ? (
          <ReportBuilder
            report={editingReport}
            folders={myFolders}
            charts={charts}
            currentUser={currentUser}
            onClose={handleBack}
          />
        ) : view === "report-viewer" ? (
          <ReportViewer
            report={viewingReport}
            charts={charts}
            currentUser={currentUser}
            onClose={handleBack}
            onEdit={isAdmin ? handleEditReport : null}
          />
        ) : view === "chart-viewer" ? (
          <ChartBuilder
            chart={editingChart}
            folders={myFolders}
            currentUser={currentUser}
            onClose={handleBack}
          />
        ) : (
          <FolderContents
            selected={selected}
            folders={myFolders}
            charts={charts}
            reports={reports}
            currentUser={currentUser}
            onViewChart={handleViewChart}
            onEditChart={handleEditChart}
            onDeleteChart={(c) => deleteChartMut.mutate(c.id)}
            onViewReport={handleViewReport}
            onEditReport={handleEditReport}
            onDeleteReport={(r) => deleteReportMut.mutate(r.id)}
          />
        )}
      </div>

      {/* New Folder Modal */}
      {showNewFolderModal && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" onClick={() => setShowNewFolderModal(false)}>
          <div className="bg-white rounded-2xl p-5 w-80 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm font-semibold text-slate-800 mb-3">
              {newFolderParentId ? "New Subfolder" : "New Folder"}
            </p>
            <input
              autoFocus
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreateFolder()}
              placeholder="Folder name..."
              className="w-full border border-slate-200 rounded-lg text-sm px-3 py-2 outline-none mb-3"
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowNewFolderModal(false)} className="px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-all">Cancel</button>
              <button
                onClick={handleCreateFolder}
                disabled={!newFolderName.trim() || createFolderMut.isPending}
                className="px-3 py-1.5 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-all disabled:opacity-50"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}