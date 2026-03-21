import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Folder, FolderOpen, ChevronRight, ChevronDown, Plus,
  Search, BarChart2, FileText, Star, Activity, Database,
  MoreHorizontal, Trash2, Edit2, RefreshCw, Loader2,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function FolderNode({ folder, allFolders, charts, reports, depth = 0, selectedId, onSelect, onNewSubfolder, onRename, onDelete }) {
  const [open, setOpen] = useState(depth === 0);
  const children = allFolders.filter((f) => f.parent_folder_id === folder.id);
  const chartCount = charts.filter((c) => c.folder_id === folder.id).length;
  const reportCount = reports.filter((r) => r.folder_id === folder.id).length;
  const totalCount = chartCount + reportCount;

  const isSelected = selectedId === folder.id;

  return (
    <div>
      <div
        className={`group flex items-center gap-1 px-2 py-1.5 rounded-lg cursor-pointer transition-all text-sm ${
          isSelected ? "bg-emerald-50 text-emerald-800" : "text-slate-600 hover:bg-slate-100"
        }`}
        style={{ paddingLeft: `${8 + depth * 16}px` }}
      >
        <button
          className="flex-shrink-0 text-slate-400"
          onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        >
          {children.length > 0 ? (
            open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />
          ) : (
            <span className="w-3.5 h-3.5 inline-block" />
          )}
        </button>
        <button
          className="flex items-center gap-1.5 flex-1 min-w-0 text-left"
          onClick={() => { setOpen(true); onSelect({ type: "folder", id: folder.id, folder }); }}
        >
          {open ? <FolderOpen className="w-4 h-4 text-amber-500 shrink-0" /> : <Folder className="w-4 h-4 text-amber-500 shrink-0" />}
          <span className="truncate text-xs font-medium">
            {folder.icon && `${folder.icon} `}{folder.name}
          </span>
          {totalCount > 0 && (
            <span className="ml-auto text-[10px] text-slate-400 bg-slate-100 px-1.5 rounded-full shrink-0">{totalCount}</span>
          )}
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-slate-200 transition-all ml-1 shrink-0" onClick={(e) => e.stopPropagation()}>
              <MoreHorizontal className="w-3 h-3 text-slate-400" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="text-xs">
            <DropdownMenuItem onClick={() => onNewSubfolder(folder.id)}>
              <Plus className="w-3 h-3 mr-1.5" /> Add Subfolder
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onRename(folder)}>
              <Edit2 className="w-3 h-3 mr-1.5" /> Rename
            </DropdownMenuItem>
            <DropdownMenuItem className="text-rose-600" onClick={() => onDelete(folder)}>
              <Trash2 className="w-3 h-3 mr-1.5" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {open && children.map((child) => (
        <FolderNode
          key={child.id}
          folder={child}
          allFolders={allFolders}
          charts={charts}
          reports={reports}
          depth={depth + 1}
          selectedId={selectedId}
          onSelect={onSelect}
          onNewSubfolder={onNewSubfolder}
          onRename={onRename}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}

export default function FolderTree({
  folders, charts, reports, selected, onSelect,
  onNewFolder, onNewChart, onNewReport,
  currentUser, onTriggerETL, etlLoading, etlResult,
}) {
  const [search, setSearch] = useState("");
  const [renamingFolder, setRenamingFolder] = useState(null);
  const [renameVal, setRenameVal] = useState("");
  const [deletingFolder, setDeletingFolder] = useState(null);
  const qc = useQueryClient();
  const isAdmin = currentUser?.role === "admin" || currentUser?.role === "super_admin";

  const updateFolderMut = useMutation({
    mutationFn: ({ id, data }) => base44.entities.ChartFolder.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chartFolders"] }),
  });
  const deleteFolderMut = useMutation({
    mutationFn: (id) => base44.entities.ChartFolder.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chartFolders"] }),
  });

  const rootFolders = folders.filter((f) => !f.parent_folder_id);

  const navItem = (icon, label, id, type = "system") => {
    const isSelected = selected?.id === id && selected?.type === type;
    return (
      <button
        key={id}
        onClick={() => onSelect({ type, id })}
        className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
          isSelected ? "bg-emerald-50 text-emerald-800" : "text-slate-500 hover:bg-slate-100"
        }`}
      >
        {icon}
        <span className="truncate">{label}</span>
      </button>
    );
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-3 py-3 border-b border-slate-100">
        <div className="flex items-center gap-1 mb-2">
          <BarChart2 className="w-4 h-4 text-emerald-600" />
          <span className="text-sm font-bold text-slate-800">Reports & Charts</span>
        </div>
        {isAdmin && (
          <div className="flex gap-1">
            <Button size="sm" variant="outline" className="h-7 text-[11px] flex-1 px-2" onClick={onNewChart}>
              <Plus className="w-3 h-3 mr-1" /> Chart
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-[11px] flex-1 px-2" onClick={onNewReport}>
              <Plus className="w-3 h-3 mr-1" /> Report
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-[11px] px-2" onClick={() => onNewFolder(null)}>
              <Folder className="w-3 h-3" />
            </Button>
          </div>
        )}
      </div>

      {/* Search */}
      <div className="px-3 py-2 border-b border-slate-100">
        <div className="flex items-center gap-2 bg-slate-50 rounded-lg px-2 py-1.5">
          <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search..."
            className="bg-transparent text-xs outline-none w-full text-slate-700 placeholder:text-slate-400"
          />
        </div>
      </div>

      {/* Nav */}
      <div className="flex-1 overflow-y-auto py-2 space-y-0.5 px-1">
        {/* My Workspace */}
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-2 pt-2 pb-1">My Workspace</p>
        {navItem(<BarChart2 className="w-3.5 h-3.5" />, "All Charts", "all-charts", "all-charts")}
        {navItem(<FileText className="w-3.5 h-3.5" />, "All Reports", "all-reports", "all-reports")}
        {navItem(<Star className="w-3.5 h-3.5" />, "Starred", "starred", "starred")}

        {/* Folders */}
        {rootFolders.length > 0 && (
          <>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-2 pt-3 pb-1">Folders</p>
            {rootFolders
              .filter((f) => !search || f.name.toLowerCase().includes(search.toLowerCase()))
              .map((folder) => (
                <FolderNode
                  key={folder.id}
                  folder={folder}
                  allFolders={folders}
                  charts={charts}
                  reports={reports}
                  depth={0}
                  selectedId={selected?.type === "folder" ? selected?.id : null}
                  onSelect={onSelect}
                  onNewSubfolder={(pid) => onNewFolder(pid)}
                  onRename={(f) => { setRenamingFolder(f); setRenameVal(f.name); }}
                  onDelete={(f) => setDeletingFolder(f)}
                />
              ))}
          </>
        )}

        {/* System Charts */}
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-2 pt-3 pb-1">System</p>
        {navItem(<BarChart2 className="w-3.5 h-3.5" />, "Live Charts", "live-charts", "system")}
        {navItem(<Database className="w-3.5 h-3.5" />, "Query Builder", "query-builder", "system")}
        {isAdmin && navItem(<Activity className="w-3.5 h-3.5" />, "Data Pipeline", "data-pipeline", "system")}
      </div>

      {/* Rename modal */}
      {renamingFolder && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" onClick={() => setRenamingFolder(null)}>
          <div className="bg-white rounded-2xl p-5 w-80 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm font-semibold text-slate-800 mb-3">Rename Folder</p>
            <Input value={renameVal} onChange={(e) => setRenameVal(e.target.value)} className="mb-3" autoFocus />
            <div className="flex gap-2 justify-end">
              <Button size="sm" variant="outline" onClick={() => setRenamingFolder(null)}>Cancel</Button>
              <Button size="sm" onClick={() => {
                updateFolderMut.mutate({ id: renamingFolder.id, data: { name: renameVal } });
                setRenamingFolder(null);
              }}>Save</Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deletingFolder && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" onClick={() => setDeletingFolder(null)}>
          <div className="bg-white rounded-2xl p-5 w-80 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm font-semibold text-slate-800 mb-1">Delete "{deletingFolder.name}"?</p>
            <p className="text-xs text-slate-500 mb-4">Charts inside will become uncategorized.</p>
            <div className="flex gap-2 justify-end">
              <Button size="sm" variant="outline" onClick={() => setDeletingFolder(null)}>Cancel</Button>
              <Button size="sm" variant="destructive" onClick={() => {
                deleteFolderMut.mutate(deletingFolder.id);
                setDeletingFolder(null);
              }}>Delete</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}