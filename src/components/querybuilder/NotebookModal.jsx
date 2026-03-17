import React, { useState, useRef } from "react";
import { X, Play, Plus, Trash2, ChevronDown, Globe, Code2, CheckCircle, AlertCircle, Loader2, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NotebookStore } from "./NotebookStore";
import { base44 } from "@/api/base44Client";

const CELL_TYPES = ["code", "markdown", "api_config"];

const DEFAULT_PYTHON_CELL = `import pandas as pd
import requests

# Example: fetch data from an API
# response = requests.get("https://api.example.com/data")
# df = pd.DataFrame(response.json())

# Your script here...
df = pd.DataFrame({
    "id": [1, 2, 3],
    "name": ["Alice", "Bob", "Charlie"],
    "value": [100, 200, 300]
})

print(df.to_json(orient="records"))
`;

const DEFAULT_API_CONFIG = `{
  "url": "https://api.example.com/endpoint",
  "method": "GET",
  "headers": {
    "Authorization": "Bearer YOUR_TOKEN",
    "Content-Type": "application/json"
  },
  "params": {},
  "body": null
}`;

function inferColumns(rows) {
  if (!rows?.length) return [];
  return Object.keys(rows[0]).map((name) => {
    const sample = rows.map((r) => r[name]).filter((v) => v != null).slice(0, 10);
    let type = "TEXT";
    if (sample.every((v) => /^-?\d+$/.test(String(v)))) type = "INTEGER";
    else if (sample.every((v) => /^-?\d*\.?\d+$/.test(String(v)))) type = "FLOAT";
    else if (sample.every((v) => /^\d{4}-\d{2}-\d{2}/.test(String(v)))) type = "DATE";
    return { name, type };
  });
}

export default function NotebookModal({ initialType = "api", editNotebook = null, onClose, onSaved }) {
  const isEdit = !!editNotebook;
  const [nbName, setNbName] = useState(editNotebook?.name || "");
  const [nbType, setNbType] = useState(editNotebook?.type || initialType); // "api" | "python"
  const [cells, setCells] = useState(editNotebook?.cells || [
    {
      id: Date.now().toString(),
      type: initialType === "api" ? "api_config" : "code",
      source: initialType === "api" ? DEFAULT_API_CONFIG : DEFAULT_PYTHON_CELL,
      output: null,
      status: "idle", // idle | running | success | error
    },
  ]);
  const [connecting, setConnecting] = useState(false);
  const [connected, setConnected] = useState(editNotebook?.connected || false);
  const [outputSchema, setOutputSchema] = useState(editNotebook?.outputSchema || null);
  const [outputPreview, setOutputPreview] = useState(null);

  const addCell = (type) => {
    const defaults = {
      code: DEFAULT_PYTHON_CELL,
      markdown: "## Notes\n\nDescribe your data source here.",
      api_config: DEFAULT_API_CONFIG,
    };
    setCells((prev) => [...prev, {
      id: Date.now().toString(),
      type,
      source: defaults[type],
      output: null,
      status: "idle",
    }]);
  };

  const updateCell = (id, field, value) => {
    setCells((prev) => prev.map((c) => c.id === id ? { ...c, [field]: value } : c));
  };

  const removeCell = (id) => {
    setCells((prev) => prev.filter((c) => c.id !== id));
  };

  const runCell = async (cell) => {
    updateCell(cell.id, "status", "running");
    updateCell(cell.id, "output", null);

    try {
      if (cell.type === "api_config") {
        const config = JSON.parse(cell.source);
        const fetchOpts = {
          method: config.method || "GET",
          headers: config.headers || {},
        };
        if (config.body && config.method !== "GET") {
          fetchOpts.body = JSON.stringify(config.body);
        }
        const urlWithParams = config.params && Object.keys(config.params).length
          ? config.url + "?" + new URLSearchParams(config.params).toString()
          : config.url;

        const res = await fetch(urlWithParams, fetchOpts);
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        const data = await res.json();
        const rows = Array.isArray(data) ? data : [data];
        const preview = rows.slice(0, 5);
        const schema = inferColumns(rows);
        updateCell(cell.id, "output", { rows, preview, schema });
        updateCell(cell.id, "status", "success");
        setOutputSchema(schema);
        setOutputPreview(preview);
      } else if (cell.type === "code") {
        // Run via LLM simulation – ask AI to describe what the script would return
        const result = await base44.integrations.Core.InvokeLLM({
          prompt: `You are a Python execution simulator. Given this Python script, return a JSON array of sample output rows (max 5) that this script would produce. Return ONLY valid JSON array, no explanation.\n\nScript:\n${cell.source}`,
          response_json_schema: {
            type: "object",
            properties: {
              rows: { type: "array", items: { type: "object" } },
              error: { type: "string" },
            },
          },
        });
        if (result.error) throw new Error(result.error);
        const rows = result.rows || [];
        const schema = inferColumns(rows);
        updateCell(cell.id, "output", { rows, preview: rows.slice(0, 5), schema });
        updateCell(cell.id, "status", "success");
        setOutputSchema(schema);
        setOutputPreview(rows.slice(0, 5));
      } else {
        updateCell(cell.id, "output", { text: "Markdown cell — no execution." });
        updateCell(cell.id, "status", "success");
      }
    } catch (e) {
      updateCell(cell.id, "output", { error: e.message });
      updateCell(cell.id, "status", "error");
    }
  };

  const handleConnect = () => {
    if (!nbName.trim()) { alert("Please give this notebook a name first."); return; }
    const id = nbName.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_");
    const notebook = {
      id,
      name: nbName.trim(),
      type: nbType,
      cells,
      connected: true,
      outputSchema: outputSchema || [],
      updatedAt: new Date().toISOString(),
    };
    NotebookStore.set(id, notebook);
    setConnected(true);
    onSaved?.(notebook);
  };

  const CELL_COLORS = {
    code: { header: "bg-amber-50 border-amber-200", badge: "bg-amber-100 text-amber-700", icon: Code2, iconCls: "text-amber-500" },
    markdown: { header: "bg-slate-50 border-slate-200", badge: "bg-slate-100 text-slate-600", icon: Code2, iconCls: "text-slate-400" },
    api_config: { header: "bg-sky-50 border-sky-200", badge: "bg-sky-100 text-sky-700", icon: Globe, iconCls: "text-sky-500" },
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-[#0f1117] rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col border border-white/10 text-white">

        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-white/10 shrink-0">
          <div className={`p-2 rounded-lg ${nbType === "api" ? "bg-sky-500/10" : "bg-amber-500/10"}`}>
            {nbType === "api" ? <Globe className="w-4 h-4 text-sky-400" /> : <Code2 className="w-4 h-4 text-amber-400" />}
          </div>
          <input
            value={nbName}
            onChange={(e) => setNbName(e.target.value)}
            placeholder={nbType === "api" ? "API Source Name…" : "Python Script Name…"}
            className="bg-transparent text-white font-semibold text-base outline-none flex-1 placeholder:text-white/20"
          />
          <div className="flex items-center gap-2">
            <select
              value={nbType}
              onChange={(e) => setNbType(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-xs text-white/60 focus:outline-none"
            >
              <option value="api">API Connector</option>
              <option value="python">Python Script</option>
            </select>
            {connected && (
              <span className="flex items-center gap-1 text-emerald-400 text-xs font-semibold bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-2 py-1">
                <CheckCircle className="w-3 h-3" /> Connected
              </span>
            )}
            <button onClick={onClose} className="text-white/40 hover:text-white/80 transition-colors ml-1">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Notebook cells */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {cells.map((cell, idx) => {
            const style = CELL_COLORS[cell.type] || CELL_COLORS.code;
            const Icon = style.icon;
            return (
              <div key={cell.id} className="rounded-xl border border-white/10 overflow-hidden bg-white/[0.02]">
                {/* Cell header */}
                <div className="flex items-center gap-2 px-3 py-2 bg-white/5 border-b border-white/10">
                  <Icon className={`w-3.5 h-3.5 ${style.iconCls}`} />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-white/40">{cell.type.replace("_", " ")}</span>
                  <span className="text-[10px] text-white/20 ml-1">In [{idx + 1}]:</span>
                  <div className="flex items-center gap-1 ml-auto">
                    {cell.type !== "markdown" && (
                      <button
                        onClick={() => runCell(cell)}
                        disabled={cell.status === "running"}
                        className="flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 text-[10px] font-semibold hover:bg-emerald-500/30 transition-colors disabled:opacity-50"
                      >
                        {cell.status === "running" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                        Run
                      </button>
                    )}
                    <button onClick={() => removeCell(cell.id)} className="p-1 rounded hover:bg-white/10 text-white/30 hover:text-rose-400 transition-colors">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                {/* Editor */}
                <textarea
                  value={cell.source}
                  onChange={(e) => updateCell(cell.id, "source", e.target.value)}
                  spellCheck={false}
                  rows={Math.max(5, cell.source.split("\n").length)}
                  className="w-full bg-transparent text-[12px] font-mono text-slate-200 px-4 py-3 focus:outline-none resize-none leading-relaxed"
                  style={{ minHeight: 80 }}
                />

                {/* Output */}
                {cell.output && (
                  <div className="border-t border-white/10 px-4 py-3 bg-black/20">
                    {cell.output.error ? (
                      <div className="flex items-start gap-2 text-rose-400 text-xs">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        <pre className="whitespace-pre-wrap">{cell.output.error}</pre>
                      </div>
                    ) : cell.output.text ? (
                      <p className="text-xs text-slate-400 italic">{cell.output.text}</p>
                    ) : (
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="text-xs text-emerald-400 font-semibold">
                            {cell.output.rows?.length} rows · {cell.output.schema?.length} columns
                          </span>
                        </div>
                        {cell.output.schema?.length > 0 && (
                          <div className="flex flex-wrap gap-1 mb-2">
                            {cell.output.schema.map((col) => (
                              <span key={col.name} className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-white/50 font-mono">
                                {col.name} <span className="text-indigo-400">{col.type}</span>
                              </span>
                            ))}
                          </div>
                        )}
                        {cell.output.preview?.length > 0 && (
                          <div className="overflow-x-auto">
                            <table className="text-[10px] font-mono w-full">
                              <thead>
                                <tr className="border-b border-white/10">
                                  {Object.keys(cell.output.preview[0]).map((k) => (
                                    <th key={k} className="px-2 py-1 text-left text-white/40 whitespace-nowrap">{k}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {cell.output.preview.map((row, ri) => (
                                  <tr key={ri} className="border-b border-white/5">
                                    {Object.values(row).map((v, vi) => (
                                      <td key={vi} className="px-2 py-1 text-white/60 whitespace-nowrap max-w-[120px] overflow-hidden text-ellipsis">
                                        {String(v ?? "")}
                                      </td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Add cell bar */}
        <div className="flex items-center gap-2 px-5 py-2 border-t border-white/5 shrink-0">
          <span className="text-[10px] text-white/20 uppercase tracking-widest">Add cell:</span>
          {[
            { type: "api_config", label: "API Config", icon: Globe, cls: "text-sky-400 hover:bg-sky-500/10" },
            { type: "code", label: "Python", icon: Code2, cls: "text-amber-400 hover:bg-amber-500/10" },
            { type: "markdown", label: "Notes", icon: Plus, cls: "text-white/30 hover:bg-white/5" },
          ].map(({ type, label, icon: Icon, cls }) => (
            <button
              key={type}
              onClick={() => addCell(type)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors ${cls}`}
            >
              <Icon className="w-3 h-3" /> {label}
            </button>
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-white/10 shrink-0">
          <div className="text-xs text-white/30">
            {outputSchema ? (
              <span className="flex items-center gap-1.5 text-emerald-400/70">
                <CheckCircle className="w-3.5 h-3.5" />
                Schema detected: {outputSchema.length} columns
              </span>
            ) : "Run a cell to detect output schema"}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="text-sm text-white/30 hover:text-white/60 transition-colors px-3 py-1.5">
              Cancel
            </button>
            <Button
              onClick={handleConnect}
              disabled={!nbName.trim()}
              className="bg-indigo-600 hover:bg-indigo-500 text-white gap-2 text-sm"
            >
              <Link2 className="w-4 h-4" />
              {connected ? "Update Connection" : "Connect to Master"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}