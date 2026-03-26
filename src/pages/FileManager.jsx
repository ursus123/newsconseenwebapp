import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import {
  Folder, FileText, BarChart2, Download, Trash2, Upload,
  FolderPlus, Edit2, Search, Grid, List, ChevronRight,
  File, Settings, Share2, Star, Clock, RefreshCw, X, Check,
  AlertTriangle, Eye, FileImage, FileCode, HardDrive
} from "lucide-react";

const TYPE_ICONS = {
  folder:    { icon: Folder,    color: "#f59e0b" },
  report:    { icon: BarChart2, color: "#6366f1" },
  export:    { icon: FileText,  color: "#10b981" },
  attachment:{ icon: File,      color: "#3b82f6" },
  dashboard: { icon: BarChart2, color: "#ec4899" },
  config:    { icon: Settings,  color: "#64748b" },
  other:     { icon: File,      color: "#94a3b8" },
};

const TYPE_LABELS = {
  folder: "Folder", report: "Report", export: "Export",
  attachment: "Attachment", dashboard: "Dashboard", config: "Config", other: "File"
};

function formatSize(bytes) {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

const SIDEBAR_SECTIONS = [
  { key: "personal", label: "My Files",        icon: Folder },
  { key: "enterprise", label: "Enterprise Files", icon: Share2 },
  { key: "shared",    label: "Shared",          icon: Star },
  { key: "trash",     label: "Trash",           icon: Trash2 },
];

const MAX_STORAGE_MB = 500;

export default function FileManager() {
  const [user, setUser] = useState(null);
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [section, setSection] = useState("personal");
  const [currentFolderId, setCurrentFolderId] = useState(null);
  const [breadcrumb, setBreadcrumb] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [viewMode, setViewMode] = useState("list"); // list | grid
  const [search, setSearch] = useState("");
  const [renaming, setRenaming] = useState(null); // file id being renamed
  const [renameValue, setRenameValue] = useState("");
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState(null); // {file, type} for modal
  const [dragOver, setDragOver] = useState(false);
  const [draggedFile, setDraggedFile] = useState(null); // {id, sourceFolder} for drag reorder
  const fileInputRef = useRef();

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => {});
  }, []);

  useEffect(() => {
    if (user) load();
  }, [user, section, currentFolderId]);

  async function load() {
    setLoading(true);
    setSelected(new Set());
    const query = { is_trashed: section === "trash" ? true : false };
    if (section !== "trash") query.scope = section === "shared" ? "shared" : section === "enterprise" ? "enterprise" : "personal";
    if (section !== "trash" && section !== "shared") query.company_id = user?.company_id || null;
    if (currentFolderId) query.folder_id = currentFolderId;
    else if (section !== "trash") query.folder_id = null; // root only
    const data = await base44.entities.FileRecord.filter(query, "-created_date", 200);
    setFiles(data);
    setLoading(false);
  }

  async function handleNewFolder() {
    const name = window.prompt("Folder name:");
    if (!name?.trim()) return;
    await base44.entities.FileRecord.create({
      name: name.trim(),
      file_type: "folder",
      folder_id: currentFolderId,
      scope: section === "enterprise" ? "enterprise" : section === "shared" ? "shared" : "personal",
      owner_email: user?.email,
      owner_name: user?.full_name,
      company_id: user?.company_id,
      is_trashed: false,
    });
    load();
  }

  async function handleUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const totalSize = [...files].reduce((acc, f) => acc + (f.size_bytes || 0), 0) + file.size;
    if (totalSize > MAX_STORAGE_MB * 1024 * 1024) {
      alert("Storage quota exceeded. Please delete some files.");
      e.target.value = "";
      return;
    }
    setUploading(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    await base44.entities.FileRecord.create({
      name: file.name,
      file_type: "attachment",
      file_url,
      size_bytes: file.size,
      mime_type: file.type,
      folder_id: currentFolderId,
      scope: section === "enterprise" ? "enterprise" : section === "shared" ? "shared" : "personal",
      owner_email: user?.email,
      owner_name: user?.full_name,
      company_id: user?.company_id,
      is_trashed: false,
    });
    setUploading(false);
    e.target.value = "";
    load();
  }

  function handleDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }

  function handleDragLeave(e) {
    e.preventDefault();
    if (e.currentTarget === e.target) setDragOver(false);
  }

  async function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);

    // Handle file upload
    const fileList = e.dataTransfer.files;
    if (fileList.length > 0) {
      const file = fileList[0];
      const totalSize = [...files].reduce((acc, f) => acc + (f.size_bytes || 0), 0) + file.size;
      if (totalSize > MAX_STORAGE_MB * 1024 * 1024) {
        alert("Storage quota exceeded. Please delete some files.");
        return;
      }
      setUploading(true);
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      await base44.entities.FileRecord.create({
        name: file.name,
        file_type: "attachment",
        file_url,
        size_bytes: file.size,
        mime_type: file.type,
        folder_id: currentFolderId,
        scope: section === "enterprise" ? "enterprise" : section === "shared" ? "shared" : "personal",
        owner_email: user?.email,
        owner_name: user?.full_name,
        company_id: user?.company_id,
        is_trashed: false,
      });
      setUploading(false);
      load();
    }
  }

  function startDragFile(f) {
    setDraggedFile({ id: f.id, sourceFolder: currentFolderId });
  }

  async function handleDropOnFolder(targetFolder) {
    if (!draggedFile || draggedFile.id === targetFolder.id) {
      setDraggedFile(null);
      return;
    }
    const f = files.find(x => x.id === draggedFile.id);
    if (f) {
      await base44.entities.FileRecord.update(f.id, { folder_id: targetFolder.id });
      setDraggedFile(null);
      load();
    }
  }

  function handlePreview(f) {
    if (f.file_type === "folder") return;
    const mimeType = f.mime_type || "";
    let previewType = "unknown";
    if (mimeType.startsWith("image/")) previewType = "image";
    else if (mimeType === "application/pdf") previewType = "pdf";
    else if (mimeType.startsWith("text/") || f.name?.endsWith(".txt")) previewType = "text";
    setPreview({ file: f, type: previewType });
  }

  async function handleDelete() {
    if (!selected.size) return;
    if (section === "trash") {
      if (!window.confirm(`Permanently delete ${selected.size} item(s)?`)) return;
      for (const id of selected) await base44.entities.FileRecord.delete(id);
    } else {
      for (const id of selected) await base44.entities.FileRecord.update(id, { is_trashed: true });
    }
    load();
  }

  async function handleRestore(id) {
    await base44.entities.FileRecord.update(id, { is_trashed: false });
    load();
  }

  async function handleDownload() {
    for (const id of selected) {
      const f = files.find(x => x.id === id);
      if (f?.file_url) window.open(f.file_url, "_blank");
    }
  }

  function startRename(f) {
    setRenaming(f.id);
    setRenameValue(f.name);
  }

  async function commitRename() {
    if (!renaming || !renameValue.trim()) { setRenaming(null); return; }
    await base44.entities.FileRecord.update(renaming, { name: renameValue.trim() });
    setRenaming(null);
    load();
  }

  function openFolder(f) {
    if (f.file_type !== "folder") return;
    setBreadcrumb(b => [...b, { id: f.folder_id, name: f.folder_id ? "..." : "Root" }]);
    setCurrentFolderId(f.id);
    setSelected(new Set());
  }

  function navigateBreadcrumb(idx) {
    const crumb = breadcrumb[idx];
    setBreadcrumb(b => b.slice(0, idx));
    setCurrentFolderId(crumb.id || null);
    setSelected(new Set());
  }

  function toggleSelect(id, e) {
    e.stopPropagation();
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const filtered = files.filter(f =>
    !search || f.name?.toLowerCase().includes(search.toLowerCase())
  );

  // Sort: folders first
  const sorted = [...filtered].sort((a, b) => {
    if (a.file_type === "folder" && b.file_type !== "folder") return -1;
    if (b.file_type === "folder" && a.file_type !== "folder") return 1;
    return 0;
  });

  const hasDownloadable = [...selected].some(id => files.find(f => f.id === id)?.file_url);

  // Storage stats
  const totalUsedBytes = files.filter(f => f.file_type !== "folder").reduce((acc, f) => acc + (f.size_bytes || 0), 0);
  const totalQuotaBytes = MAX_STORAGE_MB * 1024 * 1024;
  const usedPercent = (totalUsedBytes / totalQuotaBytes) * 100;
  const isStorageFull = usedPercent > 90;

  // Breakdown by type
  const typeBreakdown = {};
  sorted.filter(f => f.file_type !== "folder").forEach(f => {
    const type = f.file_type || "other";
    if (!typeBreakdown[type]) typeBreakdown[type] = { count: 0, bytes: 0 };
    typeBreakdown[type].count += 1;
    typeBreakdown[type].bytes += f.size_bytes || 0;
  });

  return (
    <div style={{ display: "flex", height: "100%", background: "#0f172a", color: "#e2e8f0", fontFamily: "system-ui, sans-serif", fontSize: 13 }}>

      {/* Sidebar */}
      <div style={{ width: 240, borderRight: "1px solid rgba(255,255,255,0.08)", display: "flex", flexDirection: "column", padding: "16px 8px", gap: 4, flexShrink: 0, overflowY: "auto" }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "#475569", padding: "0 8px", marginBottom: 8 }}>
          File Manager
        </div>
        {SIDEBAR_SECTIONS.map(s => {
          const Icon = s.icon;
          const active = section === s.key;
          return (
            <button key={s.key} onClick={() => { setSection(s.key); setCurrentFolderId(null); setBreadcrumb([]); }}
              style={{
                display: "flex", alignItems: "center", gap: 8, padding: "7px 10px",
                borderRadius: 8, border: "none", cursor: "pointer", textAlign: "left",
                background: active ? "rgba(99,102,241,0.2)" : "transparent",
                color: active ? "#a5b4fc" : "#94a3b8",
                fontWeight: active ? 600 : 400, fontSize: 13,
                transition: "all 0.15s",
              }}
            >
              <Icon size={15} />
              {s.label}
            </button>
          );
        })}

        {/* Storage stats */}
        <div style={{ marginTop: "auto", borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 12 }}>
          {isStorageFull && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", padding: 8, borderRadius: 6, marginBottom: 10 }}>
              <AlertTriangle size={14} color="#fca5a5" />
              <span style={{ fontSize: 11, color: "#fca5a5" }}>Storage nearly full</span>
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
            <HardDrive size={14} color="#94a3b8" />
            <span style={{ fontSize: 11, color: "#64748b" }}>Storage</span>
          </div>
          <div style={{ marginBottom: 6 }}>
            <div style={{ height: 4, borderRadius: 2, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
              <div style={{ height: "100%", background: usedPercent > 90 ? "#f87171" : "#4ade80", width: `${Math.min(usedPercent, 100)}%` }} />
            </div>
          </div>
          <div style={{ fontSize: 10, color: "#475569", marginBottom: 10 }}>
            {(totalUsedBytes / (1024 * 1024)).toFixed(1)} MB / {MAX_STORAGE_MB} MB
          </div>
          <div style={{ fontSize: 10, color: "#475569", marginBottom: 4, fontWeight: 600 }}>Breakdown:</div>
          {Object.entries(typeBreakdown).map(([type, stats]) => (
            <div key={type} style={{ fontSize: 9, color: "#64748b", padding: "3px 0" }}>
              {TYPE_LABELS[type]}: {stats.count} ({formatSize(stats.bytes)})
            </div>
          ))}
        </div>
      </div>

      {/* Main panel */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

        {/* Toolbar */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 16px", borderBottom: "1px solid rgba(255,255,255,0.06)", flexShrink: 0, flexWrap: "wrap" }}>

          {/* Breadcrumb */}
          <div style={{ display: "flex", alignItems: "center", gap: 4, flex: 1, minWidth: 0, color: "#64748b", fontSize: 12 }}>
            <button onClick={() => { setCurrentFolderId(null); setBreadcrumb([]); }} style={{ color: "#94a3b8", background: "none", border: "none", cursor: "pointer", fontSize: 12 }}>
              {SIDEBAR_SECTIONS.find(s => s.key === section)?.label}
            </button>
            {breadcrumb.map((crumb, i) => (
              <React.Fragment key={i}>
                <ChevronRight size={12} />
                <button onClick={() => navigateBreadcrumb(i)} style={{ color: "#94a3b8", background: "none", border: "none", cursor: "pointer", fontSize: 12 }}>
                  {crumb.name}
                </button>
              </React.Fragment>
            ))}
          </div>

          {/* Search */}
          <div style={{ position: "relative" }}>
            <Search size={13} style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", color: "#475569" }} />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search files..."
              style={{ paddingLeft: 28, paddingRight: 10, paddingTop: 5, paddingBottom: 5, borderRadius: 6, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.05)", color: "#e2e8f0", fontSize: 12, outline: "none", width: 160 }}
            />
          </div>

          {/* Action buttons */}
          <ToolBtn icon={FolderPlus} label="New Folder" onClick={handleNewFolder} />
          <ToolBtn icon={Upload} label={uploading ? "Uploading…" : "Upload"} onClick={() => fileInputRef.current?.click()} disabled={uploading} />
          <input ref={fileInputRef} type="file" style={{ display: "none" }} onChange={handleUpload} />
          {hasDownloadable && <ToolBtn icon={Download} label="Download" onClick={handleDownload} />}
          {selected.size > 0 && renaming === null && (
            <>
              {selected.size === 1 && <ToolBtn icon={Edit2} label="Rename" onClick={() => startRename(files.find(f => f.id === [...selected][0]))} />}
              <ToolBtn icon={Trash2} label={section === "trash" ? "Delete" : "Trash"} onClick={handleDelete} danger />
            </>
          )}

          {/* View toggle */}
          <button onClick={() => setViewMode(v => v === "list" ? "grid" : "list")}
            style={{ padding: "5px 8px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.05)", color: "#94a3b8", cursor: "pointer" }}>
            {viewMode === "list" ? <Grid size={14} /> : <List size={14} />}
          </button>

          <button onClick={load} style={{ padding: "5px 8px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.05)", color: "#94a3b8", cursor: "pointer" }}>
            <RefreshCw size={14} />
          </button>
        </div>

        {/* File area */}
        <div
          style={{ flex: 1, overflow: "auto", padding: 16, position: "relative" }}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {dragOver && (
            <div style={{ position: "absolute", inset: 0, background: "rgba(99,102,241,0.15)", border: "2px dashed rgba(99,102,241,0.5)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, pointerEvents: "none" }}>
              <div style={{ color: "#a5b4fc", fontSize: 14, fontWeight: 600 }}>Drop files here</div>
            </div>
          )}
          {loading ? (
            <div style={{ color: "#475569", textAlign: "center", marginTop: 60 }}>Loading…</div>
          ) : sorted.length === 0 ? (
            <EmptyState section={section} search={search} />
          ) : viewMode === "list" ? (
            <ListView
              files={sorted} selected={selected} renaming={renaming} renameValue={renameValue}
              setRenameValue={setRenameValue} commitRename={commitRename}
              toggleSelect={toggleSelect} openFolder={openFolder} section={section}
              onRestore={handleRestore} onPreview={handlePreview} draggedFile={draggedFile}
              startDragFile={startDragFile} handleDropOnFolder={handleDropOnFolder}
            />
          ) : (
            <GridView
              files={sorted} selected={selected} renaming={renaming} renameValue={renameValue}
              setRenameValue={setRenameValue} commitRename={commitRename}
              toggleSelect={toggleSelect} openFolder={openFolder} onPreview={handlePreview}
            />
          )}
        </div>
      </div>

      {/* Preview modal */}
      {preview && (
        <PreviewModal file={preview.file} type={preview.type} onClose={() => setPreview(null)} />
      )}
    </div>
  );
}

function ToolBtn({ icon: Icon, label, onClick, danger, disabled }) {
  return (
    <button onClick={onClick} disabled={disabled}
      style={{
        display: "flex", alignItems: "center", gap: 5, padding: "5px 10px",
        borderRadius: 6, border: `1px solid ${danger ? "rgba(239,68,68,0.3)" : "rgba(255,255,255,0.1)"}`,
        background: danger ? "rgba(239,68,68,0.1)" : "rgba(255,255,255,0.05)",
        color: danger ? "#fca5a5" : "#94a3b8", cursor: disabled ? "not-allowed" : "pointer",
        fontSize: 12, opacity: disabled ? 0.5 : 1, whiteSpace: "nowrap",
      }}
    >
      <Icon size={13} /> {label}
    </button>
  );
}

function FileIcon({ type, size = 20 }) {
  const cfg = TYPE_ICONS[type] || TYPE_ICONS.other;
  const Icon = cfg.icon;
  return <Icon size={size} color={cfg.color} />;
}

function ListView({ files, selected, renaming, renameValue, setRenameValue, commitRename, toggleSelect, openFolder, section, onRestore, onPreview, draggedFile, startDragFile, handleDropOnFolder }) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead>
        <tr style={{ color: "#475569", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em" }}>
          <th style={{ textAlign: "left", padding: "4px 8px", fontWeight: 600 }}>Name</th>
          <th style={{ textAlign: "left", padding: "4px 8px", fontWeight: 600 }}>Type</th>
          <th style={{ textAlign: "left", padding: "4px 8px", fontWeight: 600 }}>Owner</th>
          <th style={{ textAlign: "left", padding: "4px 8px", fontWeight: 600 }}>Size</th>
          <th style={{ textAlign: "left", padding: "4px 8px", fontWeight: 600 }}>Created</th>
          {section === "trash" && <th style={{ padding: "4px 8px" }} />}
        </tr>
      </thead>
      <tbody>
        {files.map(f => {
          const isSelected = selected.has(f.id);
          const isRenaming = renaming === f.id;
          const isDragging = draggedFile?.id === f.id;
          return (
            <tr key={f.id}
              onClick={e => { if (!isRenaming) toggleSelect(f.id, e); }}
              onDoubleClick={() => { if (f.file_type === "folder") openFolder(f); else onPreview(f); }}
              onDragStart={() => { if (f.file_type !== "folder") startDragFile(f); }}
              onDragOver={e => { if (f.file_type === "folder") e.preventDefault(); }}
              onDrop={() => { if (f.file_type === "folder") handleDropOnFolder(f); }}
              draggable={f.file_type !== "folder"}
              style={{
                background: isDragging ? "rgba(168,85,247,0.15)" : isSelected ? "rgba(99,102,241,0.15)" : "transparent",
                borderRadius: 6, cursor: "pointer",
                transition: "background 0.1s", opacity: isDragging ? 0.5 : 1,
              }}
              onMouseEnter={e => { if (!isSelected && !isDragging) e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
              onMouseLeave={e => { if (!isSelected && !isDragging) e.currentTarget.style.background = "transparent"; }}
            >
              <td style={{ padding: "7px 8px", borderRadius: "6px 0 0 6px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <FileIcon type={f.file_type} size={16} />
                  {isRenaming ? (
                    <input
                      autoFocus value={renameValue} onChange={e => setRenameValue(e.target.value)}
                      onBlur={commitRename} onKeyDown={e => { if (e.key === "Enter") commitRename(); if (e.key === "Escape") commitRename(); }}
                      onClick={e => e.stopPropagation()}
                      style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(99,102,241,0.5)", borderRadius: 4, color: "#e2e8f0", padding: "2px 6px", fontSize: 13, outline: "none" }}
                    />
                  ) : (
                    <span style={{ color: "#e2e8f0", fontWeight: f.file_type === "folder" ? 600 : 400 }}>{f.name}</span>
                  )}
                </div>
              </td>
              <td style={{ padding: "7px 8px", color: "#64748b" }}>{TYPE_LABELS[f.file_type] || "File"}</td>
              <td style={{ padding: "7px 8px", color: "#64748b" }}>{f.owner_name || f.owner_email || "—"}</td>
              <td style={{ padding: "7px 8px", color: "#64748b" }}>{formatSize(f.size_bytes)}</td>
              <td style={{ padding: "7px 8px", color: "#64748b", borderRadius: "0 6px 6px 0" }}>{formatDate(f.created_date)}</td>
              {section === "trash" && (
                <td style={{ padding: "7px 8px" }}>
                  <button onClick={e => { e.stopPropagation(); onRestore(f.id); }}
                    style={{ fontSize: 11, color: "#4ade80", background: "rgba(74,222,128,0.1)", border: "1px solid rgba(74,222,128,0.2)", borderRadius: 4, padding: "2px 8px", cursor: "pointer" }}>
                    Restore
                  </button>
                </td>
              )}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function GridView({ files, selected, renaming, renameValue, setRenameValue, commitRename, toggleSelect, openFolder, onPreview }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 12 }}>
      {files.map(f => {
        const isSelected = selected.has(f.id);
        const isRenaming = renaming === f.id;
        return (
          <div key={f.id}
            onClick={e => { if (!isRenaming) toggleSelect(f.id, e); }}
            onDoubleClick={() => { if (f.file_type === "folder") openFolder(f); else onPreview(f); }}
            style={{
              padding: 12, borderRadius: 10, border: `1.5px solid ${isSelected ? "rgba(99,102,241,0.5)" : "rgba(255,255,255,0.06)"}`,
              background: isSelected ? "rgba(99,102,241,0.15)" : "rgba(255,255,255,0.03)",
              cursor: "pointer", textAlign: "center", transition: "all 0.15s",
              display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
            }}
          >
            <FileIcon type={f.file_type} size={36} />
            {isRenaming ? (
              <input autoFocus value={renameValue} onChange={e => setRenameValue(e.target.value)}
                onBlur={commitRename} onKeyDown={e => { if (e.key === "Enter") commitRename(); }}
                onClick={e => e.stopPropagation()}
                style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(99,102,241,0.5)", borderRadius: 4, color: "#e2e8f0", padding: "2px 6px", fontSize: 11, outline: "none", width: "90%" }}
              />
            ) : (
              <span style={{ fontSize: 11, color: "#e2e8f0", wordBreak: "break-word", lineHeight: 1.3 }}>{f.name}</span>
            )}
            <span style={{ fontSize: 10, color: "#475569" }}>{TYPE_LABELS[f.file_type]}</span>
          </div>
        );
      })}
    </div>
  );
}

function PreviewModal({ file, type, onClose }) {
  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 99999, padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#0f172a", borderRadius: 12, maxWidth: "90vw", maxHeight: "90vh",
          overflow: "auto", border: "1px solid rgba(255,255,255,0.1)",
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
          <span style={{ color: "#e2e8f0", fontWeight: 600 }}>{file.name}</span>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: 20 }}>×</button>
        </div>

        {/* Content */}
        <div style={{ padding: 20 }}>
          {type === "image" && file.file_url && (
            <img src={file.file_url} alt={file.name} style={{ maxWidth: "100%", maxHeight: "70vh", borderRadius: 8 }} />
          )}
          {type === "pdf" && file.file_url && (
            <iframe src={file.file_url} style={{ width: "100%", height: "70vh", border: "none", borderRadius: 8 }} />
          )}
          {type === "text" && file.file_url && (
            <TextPreview fileUrl={file.file_url} />
          )}
          {type === "unknown" && (
            <div style={{ textAlign: "center", color: "#64748b", padding: "40px 20px" }}>
              <File size={48} style={{ margin: "0 auto 16px", opacity: 0.5 }} />
              <p>Preview not available for this file type</p>
              {file.file_url && (
                <a href={file.file_url} target="_blank" rel="noopener noreferrer"
                  style={{ color: "#6366f1", textDecoration: "underline", marginTop: 12, display: "inline-block" }}>
                  Download file →
                </a>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TextPreview({ fileUrl }) {
  const [content, setContent] = React.useState("");
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    fetch(fileUrl)
      .then(r => r.text())
      .then(t => { setContent(t); setLoading(false); })
      .catch(() => { setLoading(false); });
  }, [fileUrl]);

  return (
    <div style={{ background: "rgba(255,255,255,0.05)", borderRadius: 8, padding: 16, maxHeight: "70vh", overflow: "auto" }}>
      {loading ? (
        <div style={{ color: "#475569" }}>Loading…</div>
      ) : (
        <pre style={{ color: "#cbd5e1", fontSize: 12, margin: 0, fontFamily: "monospace", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
          {content}
        </pre>
      )}
    </div>
  );
}

function EmptyState({ section, search }) {
  return (
    <div style={{ textAlign: "center", marginTop: 80, color: "#475569" }}>
      <Folder size={48} style={{ margin: "0 auto 16px", opacity: 0.3 }} />
      <p style={{ fontSize: 15, fontWeight: 600, color: "#64748b", marginBottom: 6 }}>
        {search ? "No matching files" : section === "trash" ? "Trash is empty" : "No files here"}
      </p>
      <p style={{ fontSize: 12 }}>
        {search ? "Try a different search term" : "Create a folder or upload a file to get started"}
      </p>
    </div>
  );
}