import React, { useState, useEffect } from "react";
import {
  Upload, Globe, Code2, ChevronDown, ChevronRight,
  Zap, Plus, CheckCircle, Trash2,
} from "lucide-react";
import UploadPanel from "./UploadPanel";
import NotebookModal from "./NotebookModal";
import { NotebookStore } from "./NotebookStore";

function Section({ title, icon: Icon, iconColor, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-white/5 last:border-0">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-white/5 transition-colors"
      >
        <Icon className={`w-3.5 h-3.5 ${iconColor}`} />
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 flex-1 text-left">{title}</span>
        {open ? <ChevronDown className="w-3 h-3 text-slate-600" /> : <ChevronRight className="w-3 h-3 text-slate-600" />}
      </button>
      {open && <div className="pb-2">{children}</div>}
    </div>
  );
}

export default function DataSourcesPanel({ uploadedTables, onTablesChange, onUseInQuery, masterDataSnapshot }) {
  const [showUpload, setShowUpload] = useState(false);
  const [notebooks, setNotebooks] = useState(NotebookStore.getAll());
  const [notebookModal, setNotebookModal] = useState(null); // null | { type, edit }

  useEffect(() => {
    const unsub = NotebookStore.subscribe(setNotebooks);
    return unsub;
  }, []);

  const openNew = (type) => setNotebookModal({ type, edit: null });
  const openEdit = (nb) => setNotebookModal({ type: nb.type, edit: nb });

  const removeNotebook = (id) => {
    NotebookStore.remove(id);
    setNotebooks(NotebookStore.getAll());
  };

  const apiNotebooks = Object.values(notebooks).filter((n) => n.type === "api");
  const pythonNotebooks = Object.values(notebooks).filter((n) => n.type === "python");

  return (
    <>
      <div className="flex flex-col h-full overflow-y-auto text-sm">

        {/* Uploaded CSV/Excel */}
        <Section title="Uploaded Files" icon={Upload} iconColor="text-indigo-400">
          <div className="px-2 space-y-0.5">
            {Object.keys(uploadedTables).length === 0 && (
              <p className="text-[10px] text-slate-600 px-2 py-1 font-mono">No files uploaded yet</p>
            )}
            {Object.entries(uploadedTables).map(([key, tbl]) => (
              <div key={key} className="group flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/5 transition-all">
                <Upload className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="font-mono text-xs text-slate-300 block truncate">{key}</span>
                  <span className="text-[9px] text-slate-600">{tbl.rows?.length ?? 0} rows</span>
                </div>
                <div className="hidden group-hover:flex items-center gap-1">
                  <button
                    onClick={() => onUseInQuery(`SELECT * FROM ${key}`)}
                    title="Use in Query"
                    className="p-1 rounded hover:bg-indigo-500/20 text-slate-500 hover:text-indigo-400 transition-colors"
                  >
                    <Zap className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
            <button
              onClick={() => setShowUpload((v) => !v)}
              className="w-full flex items-center gap-1.5 px-2 py-1.5 mt-1 rounded-lg border border-dashed border-white/10 text-[10px] text-slate-600 hover:text-slate-300 hover:border-white/20 transition-all"
            >
              <Plus className="w-3 h-3" /> Upload CSV / Excel
            </button>
            {showUpload && (
              <div className="mt-2">
                <UploadPanel uploadedTables={uploadedTables} onTablesChange={onTablesChange} />
              </div>
            )}
          </div>
        </Section>

        {/* External APIs */}
        <Section title="External APIs" icon={Globe} iconColor="text-sky-400" defaultOpen={false}>
          <div className="px-2 space-y-1">
            {apiNotebooks.length === 0 && (
              <p className="text-[10px] text-slate-600 px-2 py-1 font-mono">No API sources connected yet</p>
            )}
            {apiNotebooks.map((nb) => (
              <div key={nb.id} className="group flex items-center gap-2 px-2 py-1.5 rounded-lg bg-sky-500/5 border border-sky-500/10 hover:bg-sky-500/10 transition-all">
                <Globe className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="text-xs font-medium text-sky-300 block truncate">{nb.name}</span>
                  {nb.connected && (
                    <span className="text-[9px] text-emerald-400 flex items-center gap-0.5">
                      <CheckCircle className="w-2.5 h-2.5" /> connected · {nb.outputSchema?.length || 0} cols
                    </span>
                  )}
                </div>
                <div className="hidden group-hover:flex items-center gap-1">
                  <button onClick={() => onUseInQuery(`SELECT * FROM ${nb.id}`)} className="p-1 rounded hover:bg-white/10 text-slate-500 hover:text-sky-400 transition-colors">
                    <Zap className="w-3 h-3" />
                  </button>
                  <button onClick={() => openEdit(nb)} className="p-1 rounded hover:bg-white/10 text-slate-500 hover:text-slate-300 transition-colors">
                    <Code2 className="w-3 h-3" />
                  </button>
                  <button onClick={() => removeNotebook(nb.id)} className="p-1 rounded hover:bg-white/10 text-slate-500 hover:text-rose-400 transition-colors">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
            <button
              onClick={() => openNew("api")}
              className="w-full flex items-center gap-1.5 px-2 py-1.5 mt-1 rounded-lg border border-dashed border-white/10 text-[10px] text-slate-600 hover:text-sky-400 hover:border-sky-500/30 transition-all"
            >
              <Plus className="w-3 h-3" /> Add API Source
            </button>
          </div>
        </Section>

        {/* Python Analytics */}
        <Section title="Python Scripts" icon={Code2} iconColor="text-amber-400" defaultOpen={false}>
          <div className="px-2 space-y-1">
            {pythonNotebooks.length === 0 && (
              <p className="text-[10px] text-slate-600 px-2 py-1 font-mono">No Python scripts yet</p>
            )}
            {pythonNotebooks.map((nb) => (
              <div key={nb.id} className="group flex items-center gap-2 px-2 py-1.5 rounded-lg bg-amber-500/5 border border-amber-500/10 hover:bg-amber-500/10 transition-all">
                <Code2 className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="text-xs font-medium text-amber-300 block truncate">{nb.name}</span>
                  {nb.connected && (
                    <span className="text-[9px] text-emerald-400 flex items-center gap-0.5">
                      <CheckCircle className="w-2.5 h-2.5" /> connected · {nb.outputSchema?.length || 0} cols
                    </span>
                  )}
                </div>
                <div className="hidden group-hover:flex items-center gap-1">
                  <button onClick={() => onUseInQuery(`SELECT * FROM ${nb.id}`)} className="p-1 rounded hover:bg-white/10 text-slate-500 hover:text-amber-400 transition-colors">
                    <Zap className="w-3 h-3" />
                  </button>
                  <button onClick={() => openEdit(nb)} className="p-1 rounded hover:bg-white/10 text-slate-500 hover:text-slate-300 transition-colors">
                    <Code2 className="w-3 h-3" />
                  </button>
                  <button onClick={() => removeNotebook(nb.id)} className="p-1 rounded hover:bg-white/10 text-slate-500 hover:text-rose-400 transition-colors">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
            <button
              onClick={() => openNew("python")}
              className="w-full flex items-center gap-1.5 px-2 py-1.5 mt-1 rounded-lg border border-dashed border-white/10 text-[10px] text-slate-600 hover:text-amber-400 hover:border-amber-500/30 transition-all"
            >
              <Plus className="w-3 h-3" /> New Python Script
            </button>
          </div>
        </Section>
      </div>

      {notebookModal && (
        <NotebookModal
          initialType={notebookModal.type}
          editNotebook={notebookModal.edit}
          uploadedTables={uploadedTables}
          masterDataSnapshot={masterDataSnapshot}
          onClose={() => setNotebookModal(null)}
          onSaved={() => {
            setNotebooks(NotebookStore.getAll());
            setNotebookModal(null);
          }}
        />
      )}
    </>
  );
}