import React, { useState } from "react";
import {
  Upload, Globe, Code2, ChevronDown, ChevronRight,
  Zap, Plus,
} from "lucide-react";
import UploadPanel from "./UploadPanel";

const EXTERNAL_APIS = [
  { key: "python_analytics", name: "Python Analytics", endpoint: "/analytics/run", method: "POST", color: "text-amber-400", bg: "bg-amber-500/10" },
  { key: "rest_api", name: "Custom REST API", endpoint: "user-configured", method: "GET", color: "text-sky-400", bg: "bg-sky-500/10" },
];

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

export default function DataSourcesPanel({ uploadedTables, onTablesChange, onUseInQuery, onPreview }) {
  const [showUpload, setShowUpload] = useState(false);

  return (
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
          {EXTERNAL_APIS.map((api) => (
            <div key={api.key} className={`flex items-center gap-2 px-3 py-2 rounded-lg ${api.bg}`}>
              <Globe className={`w-3.5 h-3.5 shrink-0 ${api.color}`} />
              <div className="flex-1 min-w-0">
                <span className={`text-xs font-medium ${api.color} block`}>{api.name}</span>
                <span className="text-[9px] text-slate-600 font-mono">{api.method} {api.endpoint}</span>
              </div>
              <button
                onClick={() => onUseInQuery(`-- POST to ${api.endpoint}\n-- { "script": "..." }`)}
                className="p-1 rounded hover:bg-white/10 text-slate-500 hover:text-slate-300 transition-colors"
              >
                <Zap className="w-3 h-3" />
              </button>
            </div>
          ))}
          <button className="w-full flex items-center gap-1.5 px-2 py-1.5 mt-1 rounded-lg border border-dashed border-white/10 text-[10px] text-slate-600 hover:text-slate-300 hover:border-white/20 transition-all">
            <Plus className="w-3 h-3" /> Add API Source
          </button>
        </div>
      </Section>

      {/* Python */}
      <Section title="Python Analytics" icon={Code2} iconColor="text-amber-400" defaultOpen={false}>
        <div className="px-3 py-2 space-y-2">
          <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-3">
            <div className="flex items-center gap-2 mb-1">
              <Code2 className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-xs font-medium text-amber-300">FastAPI Endpoint</span>
            </div>
            <p className="text-[10px] text-slate-500 font-mono">POST /analytics/run</p>
            <p className="text-[10px] text-slate-600 mt-1">Send script or query definition to run analytics transformations.</p>
          </div>
          <button
            onClick={() => onUseInQuery(`-- Python Analytics\n-- POST /analytics/run\n-- Body: { "script": "import pandas as pd\\n..." }`)}
            className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg bg-amber-500/10 text-amber-400 text-xs hover:bg-amber-500/20 transition-colors"
          >
            <Zap className="w-3 h-3" /> Use Python Script
          </button>
        </div>
      </Section>
    </div>
  );
}