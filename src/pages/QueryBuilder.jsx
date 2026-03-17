import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  PlayCircle, CheckCircle2, RefreshCw, History, Trash2,
  Database, ChevronDown, ChevronRight, Table2, Upload,
  Hash, Type, Calendar, ToggleLeft, Layers, Wand2, Code2,
  AlignLeft, GitBranch, AlertCircle, XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";

import { UploadedDataStore } from "../components/querybuilder/UploadedDataStore";
import {
  executeSQL, MASTER_TABLES, MASTER_SCHEMA, PROTECTED_TABLES,
  getUploadedSchema, detectMutation, validateMutation,
} from "../components/querybuilder/sqlEngine";
import DataSourcesPanel from "../components/querybuilder/DataSourcesPanel";
import VisualQueryBuilder from "../components/querybuilder/VisualQueryBuilder";
import OutputPanel from "../components/querybuilder/OutputPanel";
import MutationConfirmDialog from "../components/querybuilder/MutationConfirmDialog";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";

// ── Type display helpers ──────────────────────────────────────────────────
function TypeIcon({ type }) {
  const cls = "w-3 h-3 shrink-0";
  if (type === "INT" || type === "FLOAT") return <Hash className={`${cls} text-blue-400`} />;
  if (type === "DATE" || type === "DATETIME") return <Calendar className={`${cls} text-amber-400`} />;
  if (type === "ENUM") return <ToggleLeft className={`${cls} text-violet-400`} />;
  return <Type className={`${cls} text-slate-400`} />;
}
function TypeBadge({ type }) {
  const color = type === "INT" || type === "FLOAT" ? "text-blue-400"
    : type === "DATE" || type === "DATETIME" ? "text-amber-400"
    : type === "ENUM" ? "text-violet-400"
    : "text-slate-500";
  return <span className={`font-mono text-[9px] font-bold ${color}`}>{type}</span>;
}

// ── Schema tree item ──────────────────────────────────────────────────────
function TableTreeItem({ name, schema, isUploaded, isDataModel, isActive, onSelect, onQueryClick }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <div
        className={`group flex items-center gap-1.5 px-2 py-1.5 rounded-lg cursor-pointer transition-all text-xs select-none
          ${isActive ? "bg-emerald-500/15 text-emerald-300" : "text-slate-400 hover:bg-white/5 hover:text-white"}`}
        onClick={() => { setOpen((v) => !v); onSelect(name); }}
      >
        {open ? <ChevronDown className="w-3 h-3 shrink-0" /> : <ChevronRight className="w-3 h-3 shrink-0" />}
        <Table2 className={`w-3 h-3 shrink-0 ${isUploaded ? "text-indigo-400" : isDataModel ? "text-violet-400" : "text-slate-500"}`} />
        <span className="font-mono truncate flex-1">{name}</span>
        {PROTECTED_TABLES.has(name) && <span className="text-[8px] text-slate-600">RO</span>}
        <button
          onClick={(e) => { e.stopPropagation(); onQueryClick(name); }}
          className="opacity-0 group-hover:opacity-100 text-[9px] text-emerald-400 font-bold px-1 rounded transition-opacity"
        >▶</button>
      </div>
      {open && schema.length > 0 && (
        <div className="ml-4 mt-0.5 border-l border-white/5 pl-2 space-y-0.5">
          {schema.map(({ col, type }) => (
            <div key={col} className="flex items-center gap-2 px-2 py-1 text-[10px] text-slate-500 hover:text-slate-300 hover:bg-white/5 rounded cursor-default">
              <TypeIcon type={type} />
              <span className="font-mono flex-1 truncate">{col}</span>
              <TypeBadge type={type} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const SAMPLES = [
  { label: "Active enterprises", query: "SELECT * FROM enterprises WHERE status = 'active'" },
  { label: "Active people",      query: "SELECT * FROM people WHERE status = 'active'" },
  { label: "Low stock",          query: "SELECT * FROM products WHERE stock_quantity < min_stock_level" },
  { label: "Open tasks",         query: "SELECT * FROM tasks WHERE status = 'open'" },
  { label: "Posted transactions",query: "SELECT * FROM transactions WHERE status = 'posted'" },
];

const MID_TABS = [
  { key: "visual",  label: "Visual Builder", icon: Wand2 },
  { key: "script",  label: "Script Editor",  icon: Code2 },
  { key: "history", label: "History",        icon: History },
];

// ── Resize divider ────────────────────────────────────────────────────────
function ResizeDivider({ onMouseDown }) {
  return (
    <div
      onMouseDown={onMouseDown}
      className="w-1.5 shrink-0 cursor-col-resize bg-white/5 hover:bg-emerald-500/40 active:bg-emerald-500/60 transition-colors group flex items-center justify-center relative z-10"
      title="Drag to resize"
    >
      <div className="w-0.5 h-8 rounded-full bg-white/10 group-hover:bg-emerald-400/50 transition-colors" />
    </div>
  );
}

// ── Validation Error Banner ────────────────────────────────────────────────
function ValidationErrors({ errors, onDismiss }) {
  if (!errors.length) return null;
  return (
    <div className="shrink-0 mx-3 mt-2 mb-1 bg-rose-500/10 border border-rose-500/30 rounded-xl px-4 py-3 space-y-1.5">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <XCircle className="w-4 h-4 text-rose-400" />
          <span className="text-xs font-semibold text-rose-400">Validation Errors</span>
        </div>
        <button onClick={onDismiss} className="text-slate-500 hover:text-white transition-colors">
          <XCircle className="w-3.5 h-3.5" />
        </button>
      </div>
      {errors.map((e, i) => (
        <div key={i} className="flex items-start gap-2 text-xs text-rose-300 font-mono">
          <AlertCircle className="w-3 h-3 shrink-0 mt-0.5 text-rose-400" />
          <span>{e}</span>
        </div>
      ))}
    </div>
  );
}

export default function QueryBuilder() {
  const [sql, setSql] = useState("SELECT * FROM enterprises WHERE status = 'active'");
  const [results, setResults] = useState(null);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [activeTable, setActiveTable] = useState(null);
  const [uploadedTables, setUploadedTables] = useState(() => UploadedDataStore.getAll());
  const [midTab, setMidTab] = useState("script");
  const [queryHistory, setQueryHistory] = useState(() => {
    try { return JSON.parse(localStorage.getItem("qb_history") || "[]"); } catch { return []; }
  });
  const [confirmState, setConfirmState] = useState(null); // { mutationType, preview }
  const [validationErrors, setValidationErrors] = useState([]);
  const loadingRef = useRef(false);

  // ── Panel widths (px) ─────────────────────────────────────────────────
  const containerRef = useRef(null);
  const [leftWidth, setLeftWidth] = useState(256);
  const [rightWidth, setRightWidth] = useState(288);
  const dragRef = useRef(null); // { divider: "left"|"right", startX, startLeft, startRight }

  const onDividerMouseDown = useCallback((divider) => (e) => {
    e.preventDefault();
    dragRef.current = { divider, startX: e.clientX, startLeft: leftWidth, startRight: rightWidth };
  }, [leftWidth, rightWidth]);

  useEffect(() => {
    const onMove = (e) => {
      if (!dragRef.current || !containerRef.current) return;
      const { divider, startX, startLeft, startRight } = dragRef.current;
      const dx = e.clientX - startX;
      const containerW = containerRef.current.offsetWidth;
      const minPanel = 180;
      if (divider === "left") {
        const newLeft = Math.min(Math.max(minPanel, startLeft + dx), containerW - rightWidth - 300);
        setLeftWidth(newLeft);
      } else {
        const newRight = Math.min(Math.max(minPanel, startRight - dx), containerW - leftWidth - 300);
        setRightWidth(newRight);
      }
    };
    const onUp = () => { dragRef.current = null; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, [leftWidth, rightWidth]);

  // ── Data Models ───────────────────────────────────────────────────────
  const { data: dataModels = [] } = useQuery({
    queryKey: ["dataModels_qb"],
    queryFn: () => base44.entities.DataModel.list("-created_date", 200),
  });

  useEffect(() => {
    return UploadedDataStore.subscribe((all) => {
      if (!loadingRef.current) setUploadedTables({ ...all });
    });
  }, []);

  // ── Run logic ─────────────────────────────────────────────────────────
  const doExecute = async () => {
    if (loading) return;
    loadingRef.current = true;
    setLoading(true); setError(null); setResults(null); setMessage(null); setValidationErrors([]);
    const startTime = Date.now();
    const currentUploaded = UploadedDataStore.getAll();
    try {
      const result = await executeSQL(sql, currentUploaded);
      if (result.type === "select") setResults(result.rows);
      setMessage(result.message);
      const entry = { sql, status: "ok", message: result.message, rows: result.rows?.length ?? 0, ts: new Date().toISOString(), ms: Date.now() - startTime };
      setQueryHistory((prev) => { const next = [entry, ...prev].slice(0, 50); localStorage.setItem("qb_history", JSON.stringify(next)); return next; });
    } catch (e) {
      setError(e.message);
      const entry = { sql, status: "error", message: e.message, rows: 0, ts: new Date().toISOString(), ms: Date.now() - startTime };
      setQueryHistory((prev) => { const next = [entry, ...prev].slice(0, 50); localStorage.setItem("qb_history", JSON.stringify(next)); return next; });
    } finally {
      loadingRef.current = false;
      setLoading(false);
      setUploadedTables(UploadedDataStore.getAll());
    }
  };

  const runQuery = async () => {
    const mutation = detectMutation(sql);

    if (mutation) {
      // First validate
      const currentUploaded = UploadedDataStore.getAll();
      const errors = validateMutation(sql, currentUploaded);
      if (errors.length) {
        setValidationErrors(errors);
        return;
      }
      // Show confirmation dialog
      const previewMap = {
        INSERT: "Inserts a new row into the database.",
        INSERT_SELECT: "Inserts rows from a source into a master table.",
        UPDATE: "Updates existing rows matching the WHERE clause.",
        DELETE: "Permanently deletes matching rows.",
      };
      setConfirmState({ mutationType: mutation.type, preview: previewMap[mutation.type] || "" });
      return;
    }

    await doExecute();
  };

  const handleConfirm = async () => {
    setConfirmState(null);
    await doExecute();
  };

  const uploadedNames = Object.keys(uploadedTables);

  return (
    <div
      ref={containerRef}
      className="flex h-[calc(100vh-7rem)] bg-slate-900 rounded-2xl overflow-hidden shadow-2xl border border-slate-700 select-none"
    >

      {/* ── LEFT — Data Sources ──────────────────────────────────────── */}
      <aside
        style={{ width: leftWidth, minWidth: 180 }}
        className="shrink-0 flex flex-col border-r border-white/5 overflow-hidden"
      >
        <div className="flex items-center gap-2 px-3 py-3 border-b border-white/5 shrink-0">
          <Database className="w-3.5 h-3.5 text-emerald-400" />
          <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">Data Sources</span>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="px-2 py-2 space-y-1">
            {/* Master tables */}
            <div className="px-2 py-1">
              <div className="flex items-center gap-1.5 mb-1">
                <Layers className="w-3 h-3 text-slate-600" />
                <span className="text-[9px] font-bold text-slate-600 uppercase tracking-widest">Master Tables</span>
              </div>
              {Object.keys(MASTER_TABLES).map((name) => (
                <TableTreeItem
                  key={name}
                  name={name}
                  schema={MASTER_SCHEMA[name] || []}
                  isUploaded={false}
                  isActive={activeTable === name}
                  onSelect={setActiveTable}
                  onQueryClick={(n) => { setSql(`SELECT * FROM ${n}`); setMidTab("script"); }}
                />
              ))}
            </div>

            {/* Data Model tables */}
            {dataModels.length > 0 && (
              <div className="px-2 py-1">
                <div className="flex items-center gap-1.5 mb-1">
                  <GitBranch className="w-3 h-3 text-violet-500" />
                  <span className="text-[9px] font-bold text-violet-500 uppercase tracking-widest">Data Models</span>
                </div>
                {dataModels.map((dm) => {
                  const schemaFields = (dm.fields || []).map((f) => ({ col: f.name, type: (f.type || "TEXT").toUpperCase() }));
                  const sampleFields = dm.sample_rows?.length
                    ? getUploadedSchema(dm.sample_rows)
                    : schemaFields;
                  return (
                    <TableTreeItem
                      key={dm.id}
                      name={dm.name}
                      schema={sampleFields}
                      isDataModel
                      isActive={activeTable === dm.name}
                      onSelect={setActiveTable}
                      onQueryClick={(n) => { setSql(`SELECT * FROM ${n}`); setMidTab("script"); }}
                    />
                  );
                })}
              </div>
            )}

            {/* Uploaded tables */}
            {uploadedNames.length > 0 && (
              <div className="px-2 py-1">
                <div className="flex items-center gap-1.5 mb-1">
                  <Upload className="w-3 h-3 text-indigo-500" />
                  <span className="text-[9px] font-bold text-indigo-500 uppercase tracking-widest">Uploaded</span>
                </div>
                {uploadedNames.map((name) => {
                  const tbl = uploadedTables[name];
                  const schema = getUploadedSchema(tbl.rows || []);
                  return (
                    <TableTreeItem
                      key={name}
                      name={name}
                      schema={schema}
                      isUploaded
                      isActive={activeTable === name}
                      onSelect={setActiveTable}
                      onQueryClick={(n) => { setSql(`SELECT * FROM ${n}`); setMidTab("script"); }}
                    />
                  );
                })}
              </div>
            )}
          </div>

          <div className="border-t border-white/5 mt-1">
            <DataSourcesPanel
              uploadedTables={uploadedTables}
              onTablesChange={setUploadedTables}
              onUseInQuery={(q) => { setSql(q); setMidTab("script"); }}
              onPreview={(table) => { setSql(`SELECT * FROM ${table}`); runQuery(); }}
            />
          </div>
        </div>
      </aside>

      {/* Left resize divider */}
      <ResizeDivider onMouseDown={onDividerMouseDown("left")} />

      {/* ── MIDDLE — Query Builder ───────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden border-r border-white/5 min-w-[240px]">

        {/* Toolbar */}
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-white/5 shrink-0">
          <Button
            size="sm"
            onClick={runQuery}
            disabled={loading}
            className="bg-emerald-500 hover:bg-emerald-600 text-white gap-1.5 h-7 px-3 text-xs rounded-lg"
          >
            {loading
              ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              : <PlayCircle className="w-3.5 h-3.5" />}
            {loading ? "Running…" : "Run Query"}
          </Button>
          <button
            onClick={() => {
              const errors = validateMutation(sql, UploadedDataStore.getAll());
              if (errors.length) { setValidationErrors(errors); } else { setValidationErrors([]); setMessage("✓ SQL looks valid."); }
            }}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg border border-white/10 text-slate-400 hover:text-slate-200 hover:bg-white/5 transition-colors h-7"
          >
            <CheckCircle2 className="w-3.5 h-3.5" /> Validate
          </button>
          <span className="text-[10px] text-slate-600 font-mono hidden md:block">Ctrl+Enter to run</span>
          <div className="flex-1" />
          <div className="flex items-center gap-1 overflow-x-auto">
            {SAMPLES.map((s) => (
              <button
                key={s.label}
                onClick={() => { setSql(s.query); setMidTab("script"); }}
                className="text-[9px] px-2 py-1 rounded-full border border-white/10 bg-white/5 text-slate-500 hover:text-slate-300 hover:bg-white/10 whitespace-nowrap transition-all"
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex items-center border-b border-white/5 bg-slate-800/30 shrink-0">
          {MID_TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setMidTab(key)}
              className={`flex items-center gap-1.5 px-4 py-2 text-xs font-medium border-b-2 transition-colors ${
                midTab === key
                  ? "border-emerald-400 text-emerald-300"
                  : "border-transparent text-slate-500 hover:text-slate-300"
              }`}
            >
              <Icon className="w-3 h-3" />
              {label}
              {key === "history" && queryHistory.length > 0 && (
                <span className="ml-1 px-1.5 py-0.5 bg-slate-500/20 text-slate-400 text-[9px] rounded-full font-bold">{queryHistory.length}</span>
              )}
            </button>
          ))}
        </div>

        {/* Validation errors */}
        <ValidationErrors errors={validationErrors} onDismiss={() => setValidationErrors([])} />

        {/* Tab content */}
        <div className="flex-1 overflow-auto">

          {midTab === "visual" && (
            <VisualQueryBuilder onGenerate={(q) => { setSql(q); setMidTab("script"); }} />
          )}

          {midTab === "script" && (
            <div className="flex flex-col h-full">
              <div className="flex items-center gap-2 px-4 py-1.5 bg-slate-800/50 border-b border-white/5 shrink-0">
                <AlignLeft className="w-3 h-3 text-slate-600" />
                <span className="text-[10px] text-slate-600 font-mono">query.sql</span>
              </div>
              <div className="flex flex-1">
                <div className="select-none px-3 py-4 text-right font-mono text-[12px] text-slate-700 bg-slate-900/50 min-w-[36px] leading-5">
                  {sql.split("\n").map((_, i) => <div key={i}>{i + 1}</div>)}
                </div>
                <textarea
                  value={sql}
                  onChange={(e) => { setSql(e.target.value); setValidationErrors([]); }}
                  onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) runQuery(); }}
                  className="flex-1 bg-transparent text-emerald-300 font-mono text-[13px] px-4 py-4 outline-none resize-none leading-5"
                  spellCheck={false}
                  style={{ minHeight: "300px" }}
                />
              </div>
            </div>
          )}

          {midTab === "history" && (
            <div className="p-3">
              {queryHistory.length === 0 ? (
                <div className="flex items-center justify-center h-32 text-slate-600 text-xs font-mono">No queries run yet</div>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-2 px-1">
                    <span className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">{queryHistory.length} queries</span>
                    <button
                      onClick={() => { setQueryHistory([]); localStorage.removeItem("qb_history"); }}
                      className="flex items-center gap-1 text-[10px] text-slate-600 hover:text-rose-400 transition-colors"
                    >
                      <Trash2 className="w-3 h-3" /> Clear
                    </button>
                  </div>
                  <div className="space-y-1">
                    {queryHistory.map((entry, i) => (
                      <div
                        key={i}
                        onClick={() => { setSql(entry.sql); setMidTab("script"); }}
                        className="group flex items-start gap-2 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 cursor-pointer border border-white/5 transition-all"
                      >
                        <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${entry.status === "ok" ? "bg-emerald-400" : "bg-rose-400"}`} />
                        <div className="flex-1 min-w-0">
                          <pre className="font-mono text-[11px] text-slate-300 whitespace-pre-wrap line-clamp-2 leading-4">{entry.sql}</pre>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[9px] text-slate-600">{new Date(entry.ts).toLocaleTimeString()}</span>
                            {entry.status === "ok" && <span className="text-[9px] text-emerald-600">{entry.rows} rows · {entry.ms}ms</span>}
                            {entry.status === "error" && <span className="text-[9px] text-rose-500 truncate">{entry.message}</span>}
                          </div>
                        </div>
                        <span className="text-[9px] text-slate-600 opacity-0 group-hover:opacity-100 shrink-0 mt-1">load →</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Right resize divider */}
      <ResizeDivider onMouseDown={onDividerMouseDown("right")} />

      {/* ── RIGHT — Output & Actions ─────────────────────────────────── */}
      <aside
        style={{ width: rightWidth, minWidth: 180 }}
        className="shrink-0 flex flex-col overflow-hidden"
      >
        <div className="flex items-center gap-2 px-3 py-3 border-b border-white/5 shrink-0">
          <AlignLeft className="w-3.5 h-3.5 text-amber-400" />
          <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">Output & Actions</span>
        </div>
        <OutputPanel
          results={results}
          error={error}
          message={message}
          loading={loading}
          sql={sql}
        />
      </aside>

      {/* Mutation Confirmation Dialog */}
      {confirmState && (
        <MutationConfirmDialog
          mutationType={confirmState.mutationType}
          sql={sql}
          preview={confirmState.preview}
          onConfirm={handleConfirm}
          onCancel={() => setConfirmState(null)}
        />
      )}
    </div>
  );
}