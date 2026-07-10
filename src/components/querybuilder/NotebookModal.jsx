import React, { useState } from "react";
import {
  X, Play, Plus, Trash2, Globe, Code2, CheckCircle, AlertCircle,
  Loader2, Link2, Database, ChevronDown, ChevronRight, Upload, Save,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { NotebookStore } from "./NotebookStore";
import { UploadedDataStore } from "./UploadedDataStore";
import { ncClient } from "@/api/ncClient";

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

function buildDefaultPythonCell(masterDataSnapshot, uploadedTables) {
  const masterTables = Object.keys(masterDataSnapshot || {}).filter((k) => (masterDataSnapshot[k]?.length ?? 0) > 0);
  const uploadedNames = Object.keys(uploadedTables || {});
  const allTables = [...masterTables, ...uploadedNames];
  const tableLines = allTables.map((t) => `# ${t}: ${(masterDataSnapshot?.[t] || uploadedTables?.[t]?.rows || []).length} rows`).join("\n");

  return `import pandas as pd

# ── App Data Access ──────────────────────────────────────────────────────
# Use get_table("table_name") to load any app table as a DataFrame
# Available tables:
${tableLines || "# (no tables loaded yet)"}
# ─────────────────────────────────────────────────────────────────────────

${masterTables[0] ? `df_${masterTables[0]} = get_table("${masterTables[0]}")
print(f"Loaded {len(df_${masterTables[0]})} rows from ${masterTables[0]}")
print(df_${masterTables[0]}.head())` : `# df = get_table("enterprises")
# print(df.head())`}

# Your analysis here...
`;
}

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

function DataContextPanel({ masterDataSnapshot, uploadedTables, onInsert }) {
  const [open, setOpen] = useState(true);
  const masterEntries = Object.entries(masterDataSnapshot || {}).filter(([, v]) => v?.length > 0);
  const uploadedEntries = Object.entries(uploadedTables || {});
  const allEntries = [
    ...masterEntries.map(([k, v]) => ({ name: k, rows: v.length, src: "master" })),
    ...uploadedEntries.map(([k, v]) => ({ name: k, rows: v.rows?.length ?? 0, src: "uploaded" })),
  ];

  if (!allEntries.length) return null;

  return (
    <div className="border border-emerald-500/20 rounded-xl overflow-hidden mb-3 bg-emerald-500/5">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-emerald-500/10 transition-colors"
      >
        <Database className="w-3.5 h-3.5 text-emerald-400" />
        <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest flex-1 text-left">App Data — Available Tables</span>
        <span className="text-[9px] text-emerald-600">{allEntries.length} tables</span>
        {open ? <ChevronDown className="w-3 h-3 text-emerald-600" /> : <ChevronRight className="w-3 h-3 text-emerald-600" />}
      </button>
      {open && (
        <div className="px-3 pb-3 flex flex-wrap gap-1.5">
          {allEntries.map(({ name, rows, src }) => (
            <button
              key={name}
              onClick={() => onInsert(name)}
              title={`Click to insert: get_table("${name}")`}
              className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-mono transition-colors border
                ${src === "uploaded"
                  ? "bg-indigo-500/10 border-indigo-500/20 text-indigo-300 hover:bg-indigo-500/20"
                  : "bg-emerald-500/10 border-emerald-500/20 text-emerald-300 hover:bg-emerald-500/20"
                }`}
            >
              {src === "uploaded" ? <Upload className="w-2.5 h-2.5" /> : <Database className="w-2.5 h-2.5" />}
              {name}
              <span className="text-[9px] opacity-60">{rows}r</span>
            </button>
          ))}
          <p className="w-full text-[9px] text-emerald-700 mt-1 font-mono">Click a table to insert <code>get_table("…")</code> at cursor</p>
        </div>
      )}
    </div>
  );
}

export default function NotebookModal({ initialType = "api", editNotebook = null, uploadedTables = {}, masterDataSnapshot = {}, onClose, onSaved }) {
  const isEdit = !!editNotebook;
  const [nbName, setNbName] = useState(editNotebook?.name || "");
  const [nbType, setNbType] = useState(editNotebook?.type || initialType);

  const defaultSrc = initialType === "api"
    ? DEFAULT_API_CONFIG
    : buildDefaultPythonCell(masterDataSnapshot, uploadedTables);

  const [cells, setCells] = useState(editNotebook?.cells || [
    { id: Date.now().toString(), type: initialType === "api" ? "api_config" : "code", source: defaultSrc, output: null, status: "idle" },
  ]);
  const [connecting, setConnecting] = useState(false);
  const [connected, setConnected] = useState(editNotebook?.connected || false);
  const [outputSchema, setOutputSchema] = useState(editNotebook?.outputSchema || null);
  const [outputPreview, setOutputPreview] = useState(null);
  const textareaRefs = {};

  const addCell = (type) => {
    const defaults = {
      code: buildDefaultPythonCell(masterDataSnapshot, uploadedTables),
      markdown: "## Notes\n\nDescribe your analysis here.",
      api_config: DEFAULT_API_CONFIG,
    };
    setCells((prev) => [...prev, { id: Date.now().toString(), type, source: defaults[type], output: null, status: "idle" }]);
  };

  const updateCell = (id, field, value) => {
    setCells((prev) => prev.map((c) => c.id === id ? { ...c, [field]: value } : c));
  };

  const removeCell = (id) => setCells((prev) => prev.filter((c) => c.id !== id));

  // Insert get_table("name") at cursor or end of textarea
  const insertTableRef = (cellId, tableName) => {
    const el = textareaRefs[cellId];
    const snippet = `get_table("${tableName}")`;
    if (el) {
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const prev = el.value;
      const next = prev.slice(0, start) + snippet + prev.slice(end);
      updateCell(cellId, "source", next);
      setTimeout(() => {
        el.focus();
        el.setSelectionRange(start + snippet.length, start + snippet.length);
      }, 0);
    } else {
      updateCell(cellId, "source", (c) => c + `\n${snippet}`);
    }
  };

  const runCell = async (cell) => {
    updateCell(cell.id, "status", "running");
    updateCell(cell.id, "output", null);
    try {
      if (cell.type === "api_config") {
        const config = JSON.parse(cell.source);
        const fetchOpts = { method: config.method || "GET", headers: config.headers || {} };
        if (config.body && config.method !== "GET") fetchOpts.body = JSON.stringify(config.body);
        const urlWithParams = config.params && Object.keys(config.params).length
          ? config.url + "?" + new URLSearchParams(config.params).toString()
          : config.url;
        const res = await fetch(urlWithParams, fetchOpts);
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        const data = await res.json();
        const rows = Array.isArray(data) ? data : [data];
        const schema = inferColumns(rows);
        updateCell(cell.id, "output", { rows, preview: rows.slice(0, 5), schema });
        updateCell(cell.id, "status", "success");
        setOutputSchema(schema);
        setOutputPreview(rows.slice(0, 5));
      } else if (cell.type === "code") {
        // Build data context summary for the LLM
        const masterEntries = Object.entries(masterDataSnapshot).filter(([, v]) => v?.length > 0);
        const uploadedEntries = Object.entries(uploadedTables);

        const dataContextLines = [
          ...masterEntries.map(([name, rows]) => {
            const sample = rows.slice(0, 3);
            return `Table "${name}" (${rows.length} rows): ${JSON.stringify(sample)}`;
          }),
          ...uploadedEntries.map(([name, tbl]) => {
            const sample = (tbl.rows || []).slice(0, 3);
            return `Uploaded table "${name}" (${tbl.rows?.length ?? 0} rows): ${JSON.stringify(sample)}`;
          }),
        ].join("\n\n");

        const prompt = `You are a Python execution simulator with access to the following app data tables.

When the script calls get_table("table_name"), it returns a pandas DataFrame loaded with REAL data from the app.

AVAILABLE DATA:
${dataContextLines || "(no data loaded)"}

SCRIPT TO SIMULATE:
${cell.source}

Execute this script using the real data above. Return a JSON with:
- "rows": array of result objects (max 20 rows) representing what df / print output would look like
- "error": string if there's an error, null otherwise
- "print_output": any print() text output

Return ONLY valid JSON, no explanation.`;

        const result = await ncClient.integrations.Core.InvokeLLM({
          prompt,
          response_json_schema: {
            type: "object",
            properties: {
              rows: { type: "array", items: { type: "object" } },
              error: { type: "string" },
              print_output: { type: "string" },
            },
          },
        });

        if (result.error) throw new Error(result.error);
        const rows = result.rows || [];
        const schema = inferColumns(rows);
        updateCell(cell.id, "output", { rows, preview: rows.slice(0, 10), schema, print_output: result.print_output });
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

  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    if (!nbName.trim()) { alert("Please give this notebook a name first."); return; }
    const id = editNotebook?.id || nbName.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_");
    const notebook = { id, name: nbName.trim(), type: nbType, cells, connected: false, outputSchema: outputSchema || [], updatedAt: new Date().toISOString() };
    NotebookStore.set(id, notebook);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const [connectMessage, setConnectMessage] = useState(null);

  const handleConnect = async () => {
    if (!nbName.trim()) { alert("Please give this notebook a name first."); return; }
    const id = editNotebook?.id || nbName.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_");

    // For API cells: run all api_config cells and save their rows to UploadedDataStore
    const apiCells = cells.filter(c => c.type === "api_config");
    let savedRows = [];
    for (const cell of apiCells) {
      try {
        const config = JSON.parse(cell.source);
        const fetchOpts = { method: config.method || "GET", headers: config.headers || {} };
        if (config.body && config.method !== "GET") fetchOpts.body = JSON.stringify(config.body);
        const urlWithParams = config.params && Object.keys(config.params).length
          ? config.url + "?" + new URLSearchParams(config.params).toString()
          : config.url;
        const res = await fetch(urlWithParams, fetchOpts);
        const data = await res.json();
        const rows = Array.isArray(data) ? data : data.results || data.data || data.items || [data];
        const tableName = id;
        UploadedDataStore.set(tableName, { rows, source: "api_connector", url: config.url, savedAt: new Date().toISOString() });
        savedRows = rows;
        setConnectMessage(`✅ Connected as table: ${tableName} — ${rows.length} rows loaded. Query with: SELECT * FROM ${tableName}`);
      } catch (e) {
        setConnectMessage(`❌ API error: ${e.message}`);
      }
    }

    // For Python cells with output: save result rows
    const codeCells = cells.filter(c => c.type === "code" && c.output?.rows?.length);
    for (const cell of codeCells) {
      const tableName = `${id}_output`;
      UploadedDataStore.set(tableName, { rows: cell.output.rows, source: "python_output", savedAt: new Date().toISOString() });
      if (!apiCells.length) setConnectMessage(`✅ Python output saved as table: ${tableName} — ${cell.output.rows.length} rows`);
    }

    const schema = savedRows.length ? inferColumns(savedRows) : outputSchema || [];
    const notebook = { id, name: nbName.trim(), type: nbType, cells, connected: true, outputSchema: schema, updatedAt: new Date().toISOString() };
    NotebookStore.set(id, notebook);
    setConnected(true);
    onSaved?.(notebook);
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

        {/* Cells */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {cells.map((cell, idx) => {
            const isCode = cell.type === "code";
            const isApi = cell.type === "api_config";
            const headerCls = isCode ? "bg-amber-500/10 border-amber-500/20" : isApi ? "bg-sky-500/10 border-sky-500/20" : "bg-white/5 border-white/10";
            const iconCls = isCode ? "text-amber-400" : isApi ? "text-sky-400" : "text-slate-400";

            return (
              <div key={cell.id} className="rounded-xl border border-white/10 overflow-hidden bg-white/[0.02]">
                {/* Cell header */}
                <div className={`flex items-center gap-2 px-3 py-2 border-b border-white/10 ${headerCls}`}>
                  {isCode ? <Code2 className={`w-3.5 h-3.5 ${iconCls}`} /> : isApi ? <Globe className={`w-3.5 h-3.5 ${iconCls}`} /> : <Code2 className={`w-3.5 h-3.5 ${iconCls}`} />}
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

                {/* Data context panel for Python cells */}
                {isCode && (
                  <div className="px-4 pt-3">
                    <DataContextPanel
                      masterDataSnapshot={masterDataSnapshot}
                      uploadedTables={uploadedTables}
                      onInsert={(tableName) => {
                        const el = textareaRefs[cell.id];
                        const snippet = `get_table("${tableName}")`;
                        if (el) {
                          const start = el.selectionStart ?? el.value.length;
                          const prev = el.value;
                          const next = prev.slice(0, start) + snippet + prev.slice(start);
                          updateCell(cell.id, "source", next);
                          setTimeout(() => { el.focus(); el.setSelectionRange(start + snippet.length, start + snippet.length); }, 0);
                        } else {
                          updateCell(cell.id, "source", cell.source + `\ndf = ${snippet}`);
                        }
                      }}
                    />
                  </div>
                )}

                {/* Editor */}
                <textarea
                  ref={(el) => { if (el) textareaRefs[cell.id] = el; }}
                  value={cell.source}
                  onChange={(e) => updateCell(cell.id, "source", e.target.value)}
                  spellCheck={false}
                  rows={Math.max(6, cell.source.split("\n").length)}
                  className="w-full bg-transparent text-[12px] font-mono text-slate-200 px-4 py-3 focus:outline-none resize-none leading-relaxed"
                  style={{ minHeight: 100 }}
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
                        {cell.output.print_output && (
                          <pre className="text-[10px] text-amber-300/80 font-mono bg-black/30 rounded-lg px-3 py-2 mb-2 whitespace-pre-wrap">{cell.output.print_output}</pre>
                        )}
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
            <button key={type} onClick={() => addCell(type)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors ${cls}`}
            >
              <Icon className="w-3 h-3" /> {label}
            </button>
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-white/10 shrink-0">
          <div className="text-xs text-white/30 max-w-sm">
            {connectMessage ? (
              <span className={`flex items-start gap-1.5 font-mono text-[10px] leading-snug ${connectMessage.startsWith("✅") ? "text-emerald-400" : "text-rose-400"}`}>
                {connectMessage}
              </span>
            ) : outputSchema ? (
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
            <Button onClick={handleSave} disabled={!nbName.trim()} variant="outline" className="border-white/20 text-white/70 hover:text-white hover:bg-white/10 gap-2 text-sm bg-transparent">
              <Save className="w-4 h-4" />
              {saved ? "Saved!" : "Save Script"}
            </Button>
            <Button onClick={handleConnect} disabled={!nbName.trim()} className="bg-indigo-600 hover:bg-indigo-500 text-white gap-2 text-sm">
              <Link2 className="w-4 h-4" />
              {connected ? "Update Connection" : "Connect to Master"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}