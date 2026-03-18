import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  PlayCircle, CheckCircle2, RefreshCw, History, Trash2,
  Database, ChevronDown, ChevronRight, Table2, Upload,
  Hash, Type, Calendar, ToggleLeft, Layers, Wand2, Code2,
  AlignLeft, GitBranch, AlertCircle, XCircle, Plus, X,
  Save, FolderOpen, BarChart2, Pin, Keyboard, FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";

import { UploadedDataStore } from "../components/querybuilder/UploadedDataStore";
import {
  executeSQL, MASTER_TABLES, MASTER_SCHEMA, PROTECTED_TABLES,
  getUploadedSchema, detectMutation, validateMutation, exportCSV,
} from "../components/querybuilder/sqlEngine";
import DataSourcesPanel from "../components/querybuilder/DataSourcesPanel";
import VisualQueryBuilder from "../components/querybuilder/VisualQueryBuilder";
import OutputPanel from "../components/querybuilder/OutputPanel";
import MutationConfirmDialog from "../components/querybuilder/MutationConfirmDialog";
import ResultChart from "../components/querybuilder/ResultChart";
import SqlAutocomplete from "../components/querybuilder/SqlAutocomplete";
import SavedQueriesPanel from "../components/querybuilder/SavedQueriesPanel";
import SaveQueryModal from "../components/querybuilder/SaveQueryModal";
import { TabStore } from "../components/querybuilder/TabStore";
import AnalyticsPanel from "../components/querybuilder/AnalyticsPanel";
import TemplatesPanel from "../components/querybuilder/TemplatesPanel";
import DashboardWidgetsPanel from "../components/querybuilder/DashboardWidgetsPanel";
import ExportMenu from "../components/querybuilder/ExportMenu";
import PinWidgetModal from "../components/querybuilder/PinWidgetModal";
import ShortcutsModal from "../components/querybuilder/ShortcutsModal";

// ── Type helpers ─────────────────────────────────────────────────────────
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
    : type === "ENUM" ? "text-violet-400" : "text-slate-500";
  return <span className={`font-mono text-[9px] font-bold ${color}`}>{type}</span>;
}

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

// ── Sample queries ─────────────────────────────────────────────────────────
const SAMPLES = [
  { label: "Active enterprises", query: "SELECT * FROM enterprises WHERE status = 'active'" },
  { label: "Active people",      query: "SELECT * FROM people WHERE status = 'active'" },
  { label: "Low stock",          query: "SELECT name, stock_quantity, min_stock_level FROM products WHERE stock_quantity < min_stock_level ORDER BY stock_quantity ASC" },
  { label: "Open tasks",         query: "SELECT * FROM tasks WHERE status = 'open'" },
  { label: "Enterprise breakdown", query: "SELECT * FROM analytics_enterprises" },
  { label: "Task completion",    query: "SELECT task_type, total_tasks, completed_tasks FROM analytics_tasks" },
  { label: "Revenue by type",    query: "SELECT transaction_type, total_amount FROM analytics_transactions ORDER BY total_amount DESC" },
  { label: "Stock levels",       query: "SELECT item_type, total_stock FROM analytics_products ORDER BY total_stock ASC" },
  { label: "Search medication",  query: "SELECT * FROM medications_api WHERE name = 'metformin'" },
  { label: "Check recalls",      query: "SELECT * FROM medications_recalls WHERE name = 'metformin'" },
];

function ResizeDivider({ onMouseDown }) {
  return (
    <div
      onMouseDown={onMouseDown}
      className="w-1.5 shrink-0 cursor-col-resize bg-white/5 hover:bg-emerald-500/40 active:bg-emerald-500/60 transition-colors group flex items-center justify-center relative z-10"
    >
      <div className="w-0.5 h-8 rounded-full bg-white/10 group-hover:bg-emerald-400/50 transition-colors" />
    </div>
  );
}

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

// ── Left panel tabs ───────────────────────────────────────────────────────
const LEFT_TABS = [
  { key: "tables",    label: "Tables",    icon: Database },
  { key: "analytics", label: "Analytics", icon: BarChart2 },
  { key: "templates", label: "Templates", icon: FileText },
  { key: "saved",     label: "Saved",     icon: FolderOpen },
];

// ── Generate unique tab id ────────────────────────────────────────────────
let _tabIdCounter = Date.now();
const newTabId = () => String(++_tabIdCounter);

export default function QueryBuilder() {
  // ── Tabs state ───────────────────────────────────────────────────────
  const [tabs, setTabs] = useState(() => TabStore.getTabs());
  const [activeTabId, setActiveTabId] = useState(() => TabStore.getActiveId());

  const activeTab = tabs.find((t) => t.id === activeTabId) || tabs[0];
  const sql = activeTab?.sql || "";
  const setSql = (val) => updateTab(activeTabId, { sql: val });

  const updateTab = (id, patch) => {
    setTabs((prev) => {
      const next = prev.map((t) => t.id === id ? { ...t, ...patch } : t);
      TabStore.setTabs(next);
      return next;
    });
  };

  const addTab = () => {
    const id = newTabId();
    const name = `query_${tabs.length + 1}.sql`;
    const newTab = { id, name, sql: "SELECT * FROM enterprises", savedQueryId: null };
    setTabs((prev) => { const next = [...prev, newTab]; TabStore.setTabs(next); return next; });
    setActiveTabId(id);
    TabStore.setActiveId(id);
  };

  const closeTab = (id) => {
    if (tabs.length === 1) return;
    const idx = tabs.findIndex((t) => t.id === id);
    const next = tabs.filter((t) => t.id !== id);
    TabStore.setTabs(next);
    setTabs(next);
    if (activeTabId === id) {
      const newActive = next[Math.max(0, idx - 1)]?.id;
      setActiveTabId(newActive);
      TabStore.setActiveId(newActive);
    }
  };

  const renameTab = (id, name) => updateTab(id, { name });

  const [renamingTab, setRenamingTab] = useState(null);
  const [renameVal, setRenameVal] = useState("");

  // ── Query execution ───────────────────────────────────────────────────
  const [results, setResults] = useState(null);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [activeTable, setActiveTable] = useState(null);
  const [uploadedTables, setUploadedTables] = useState(() => UploadedDataStore.getAll());
  const [leftTab, setLeftTab] = useState("tables");
  const [midTab, setMidTab] = useState("script");
  const [showChart, setShowChart] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showPinModal, setShowPinModal] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [queryHistory, setQueryHistory] = useState(() => {
    try { return JSON.parse(localStorage.getItem("qb_history") || "[]"); } catch { return []; }
  });
  const [confirmState, setConfirmState] = useState(null);
  const [validationErrors, setValidationErrors] = useState([]);

  // ── SQL Autocomplete ──────────────────────────────────────────────────
  const textareaRef = useRef(null);
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [cursorPos, setCursorPos] = useState(0);

  const allTableNames = [
    ...Object.keys(MASTER_TABLES),
    ...Object.keys(uploadedTables),
  ];
  const allColumns = [
    ...Object.values(MASTER_SCHEMA).flat().map((f) => f.col),
  ];

  const handleAutocompleteSelect = (label, wordLen) => {
    const before = sql.slice(0, cursorPos - wordLen);
    const after = sql.slice(cursorPos);
    const newSql = before + label + " " + after;
    setSql(newSql);
    setShowAutocomplete(false);
    setTimeout(() => {
      if (textareaRef.current) {
        const newPos = before.length + label.length + 1;
        textareaRef.current.setSelectionRange(newPos, newPos);
        textareaRef.current.focus();
      }
    }, 0);
  };

  // ── Panel resize ──────────────────────────────────────────────────────
  const containerRef = useRef(null);
  const [leftWidth, setLeftWidth] = useState(256);
  const [rightWidth, setRightWidth] = useState(288);
  const dragRef = useRef(null);

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
        setLeftWidth(Math.min(Math.max(minPanel, startLeft + dx), containerW - rightWidth - 300));
      } else {
        setRightWidth(Math.min(Math.max(minPanel, startRight - dx), containerW - leftWidth - 300));
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

  // ── Master data snapshot ───────────────────────────────────────────────
  const { data: enterprisesSnap = [] } = useQuery({ queryKey: ["snap_enterprises"], queryFn: () => base44.entities.Enterprise.list("-created_date", 500) });
  const { data: peopleSnap = [] } = useQuery({ queryKey: ["snap_people"], queryFn: () => base44.entities.Person.list("-created_date", 500) });
  const { data: productsSnap = [] } = useQuery({ queryKey: ["snap_products"], queryFn: () => base44.entities.Product.list("-created_date", 500) });
  const { data: tasksSnap = [] } = useQuery({ queryKey: ["snap_tasks"], queryFn: () => base44.entities.Task.list("-created_date", 500) });
  const { data: transactionsSnap = [] } = useQuery({ queryKey: ["snap_transactions"], queryFn: () => base44.entities.Transaction.list("-created_date", 500) });
  const { data: medicationsSnap = [] } = useQuery({ queryKey: ["snap_medications"], queryFn: () => base44.entities.MedicationProfile.list("-created_date", 500) });

  const masterDataSnapshot = {
    enterprises: enterprisesSnap, people: peopleSnap, products: productsSnap,
    tasks: tasksSnap, transactions: transactionsSnap, medication_profiles: medicationsSnap,
  };

  const qc = useQueryClient();

  useEffect(() => {
    return UploadedDataStore.subscribe((all) => { setUploadedTables({ ...all }); });
  }, []);

  // ── Execute ───────────────────────────────────────────────────────────
  const loadingRef = useRef(false);

  const doExecute = async (sqlOverride) => {
    const runSql = sqlOverride || sql;
    if (loading) return;
    loadingRef.current = true;
    setLoading(true); setError(null); setResults(null); setMessage(null); setValidationErrors([]);
    const startTime = Date.now();
    const currentUploaded = UploadedDataStore.getAll();
    try {
      const result = await executeSQL(runSql, currentUploaded);
      if (result.type === "select") { setResults(result.rows); if (result.rows.length > 0) setShowChart(false); }
      setMessage(result.message);
      const entry = { sql: runSql, status: "ok", message: result.message, rows: result.rows?.length ?? 0, ts: new Date().toISOString(), ms: Date.now() - startTime };
      setQueryHistory((prev) => { const next = [entry, ...prev].slice(0, 50); localStorage.setItem("qb_history", JSON.stringify(next)); return next; });
    } catch (e) {
      setError(e.message);
      const entry = { sql: runSql, status: "error", message: e.message, rows: 0, ts: new Date().toISOString(), ms: Date.now() - startTime };
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
      const errors = validateMutation(sql, UploadedDataStore.getAll());
      if (errors.length) { setValidationErrors(errors); return; }
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

  const uploadedNames = Object.keys(uploadedTables);

  const loadSql = (newSql) => {
    setSql(newSql);
    setMidTab("script");
    setShowChart(false);
  };

  return (
    <div
      ref={containerRef}
      className="flex h-[calc(100vh-7rem)] bg-slate-900 rounded-2xl overflow-hidden shadow-2xl border border-slate-700 select-none"
    >

      {/* ── LEFT ─────────────────────────────────────────────────────── */}
      <aside style={{ width: leftWidth, minWidth: 180 }} className="shrink-0 flex flex-col border-r border-white/5 overflow-hidden">
        {/* Left tab bar */}
        <div className="flex items-center border-b border-white/5 shrink-0 bg-slate-800/30 overflow-x-auto">
          {LEFT_TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setLeftTab(key)}
              className={`flex items-center gap-1 flex-1 justify-center py-2.5 text-[9px] font-bold uppercase tracking-widest border-b-2 transition-colors whitespace-nowrap min-w-0 px-1 ${
                leftTab === key ? "border-emerald-400 text-emerald-300" : "border-transparent text-slate-500 hover:text-slate-300"
              }`}
            >
              <Icon className="w-3 h-3 shrink-0" />
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>

        {leftTab === "tables" && (
          <div className="flex-1 overflow-y-auto">
            <div className="px-2 py-2 space-y-1">
              <div className="px-2 py-1">
                <div className="flex items-center gap-1.5 mb-1">
                  <Layers className="w-3 h-3 text-slate-600" />
                  <span className="text-[9px] font-bold text-slate-600 uppercase tracking-widest">Master Tables</span>
                </div>
                {Object.keys(MASTER_TABLES).map((name) => (
                  <TableTreeItem key={name} name={name} schema={MASTER_SCHEMA[name] || []}
                    isActive={activeTable === name} onSelect={setActiveTable}
                    onQueryClick={(n) => loadSql(`SELECT * FROM ${n}`)}
                  />
                ))}
              </div>
              {dataModels.length > 0 && (
                <div className="px-2 py-1">
                  <div className="flex items-center gap-1.5 mb-1">
                    <GitBranch className="w-3 h-3 text-violet-500" />
                    <span className="text-[9px] font-bold text-violet-500 uppercase tracking-widest">Data Models</span>
                  </div>
                  {dataModels.map((dm) => {
                    const schemaFields = (dm.fields || []).map((f) => ({ col: f.name, type: (f.type || "TEXT").toUpperCase() }));
                    return (
                      <TableTreeItem key={dm.id} name={dm.name}
                        schema={dm.sample_rows?.length ? getUploadedSchema(dm.sample_rows) : schemaFields}
                        isDataModel isActive={activeTable === dm.name} onSelect={setActiveTable}
                        onQueryClick={(n) => loadSql(`SELECT * FROM ${n}`)}
                      />
                    );
                  })}
                </div>
              )}
              {uploadedNames.length > 0 && (
                <div className="px-2 py-1">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Upload className="w-3 h-3 text-indigo-500" />
                    <span className="text-[9px] font-bold text-indigo-500 uppercase tracking-widest">Uploaded</span>
                  </div>
                  {uploadedNames.map((name) => (
                    <TableTreeItem key={name} name={name} schema={getUploadedSchema(uploadedTables[name].rows || [])}
                      isUploaded isActive={activeTable === name} onSelect={setActiveTable}
                      onQueryClick={(n) => loadSql(`SELECT * FROM ${n}`)}
                    />
                  ))}
                </div>
              )}
            </div>
            <div className="border-t border-white/5 mt-1">
              <DataSourcesPanel uploadedTables={uploadedTables} onTablesChange={setUploadedTables}
                masterDataSnapshot={masterDataSnapshot}
                onUseInQuery={(q) => loadSql(q)}
                onPreview={(table) => { loadSql(`SELECT * FROM ${table}`); doExecute(`SELECT * FROM ${table}`); }}
              />
            </div>
          </div>
        )}

        {leftTab === "analytics" && (
          <AnalyticsPanel
            activeTable={activeTable}
            onSelect={setActiveTable}
            onQueryClick={(n, customSql) => {
              const q = customSql || `SELECT * FROM ${n}`;
              loadSql(q);
              doExecute(q);
            }}
          />
        )}

        {leftTab === "templates" && (
          <TemplatesPanel onLoad={(tmplSql) => loadSql(tmplSql)} />
        )}

        {leftTab === "saved" && (
          <div className="flex flex-col flex-1 overflow-hidden">
            {/* Dashboard widgets sub-section */}
            <div className="shrink-0 border-b border-white/5">
              <div className="px-3 pt-2 pb-1 flex items-center gap-1">
                <Pin className="w-3 h-3 text-amber-500" />
                <span className="text-[9px] font-bold text-amber-500 uppercase tracking-widest">Dashboard Widgets</span>
              </div>
              <DashboardWidgetsPanel onEditWidget={(w) => loadSql(w.sql)} />
            </div>
            {/* Saved queries */}
            <div className="flex-1 overflow-hidden">
              <div className="px-3 pt-2 pb-1">
                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Saved Queries</span>
              </div>
              <SavedQueriesPanel
                onLoadQuery={(querySql, queryName) => {
                  setSql(querySql);
                  setMidTab("script");
                  if (queryName) updateTab(activeTabId, { name: queryName + ".sql", sql: querySql });
                }}
              />
            </div>
          </div>
        )}
      </aside>

      {/* Left resize divider */}
      <ResizeDivider onMouseDown={onDividerMouseDown("left")} />

      {/* ── MIDDLE ───────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden border-r border-white/5 min-w-[240px]">

        {/* SQL File Tabs */}
        <div className="flex items-center border-b border-white/5 bg-slate-950/60 shrink-0 overflow-x-auto">
          {tabs.map((tab) => (
            <div
              key={tab.id}
              className={`group flex items-center gap-1 px-3 py-2 border-r border-white/5 cursor-pointer shrink-0 transition-colors ${
                tab.id === activeTabId ? "bg-slate-800/60 text-slate-200" : "text-slate-500 hover:text-slate-300 hover:bg-white/5"
              }`}
              onClick={() => { setActiveTabId(tab.id); TabStore.setActiveId(tab.id); }}
            >
              {renamingTab === tab.id ? (
                <input
                  autoFocus value={renameVal} onChange={(e) => setRenameVal(e.target.value)}
                  onBlur={() => { renameTab(tab.id, renameVal || tab.name); setRenamingTab(null); }}
                  onKeyDown={(e) => { if (e.key === "Enter") { renameTab(tab.id, renameVal || tab.name); setRenamingTab(null); } e.stopPropagation(); }}
                  className="bg-transparent outline-none text-xs text-white w-24 border-b border-emerald-400"
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <span className="text-[11px] font-mono max-w-[120px] truncate"
                  onDoubleClick={(e) => { e.stopPropagation(); setRenamingTab(tab.id); setRenameVal(tab.name); }}
                  title="Double-click to rename">
                  {tab.name}
                </span>
              )}
              {tabs.length > 1 && (
                <button
                  onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }}
                  className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-white/10 text-slate-500 hover:text-white transition-all ml-1"
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              )}
            </div>
          ))}
          <button onClick={addTab}
            className="flex items-center justify-center px-3 py-2 text-slate-600 hover:text-slate-300 hover:bg-white/5 transition-colors shrink-0"
            title="New tab">
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-white/5 shrink-0 flex-wrap">
          <Button size="sm" onClick={runQuery} disabled={loading}
            className="bg-emerald-500 hover:bg-emerald-600 text-white gap-1.5 h-7 px-3 text-xs rounded-lg">
            {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <PlayCircle className="w-3.5 h-3.5" />}
            {loading ? "Running…" : "Run"}
          </Button>
          <button
            onClick={() => {
              const errors = validateMutation(sql, UploadedDataStore.getAll());
              if (errors.length) setValidationErrors(errors); else { setValidationErrors([]); setMessage("✓ SQL looks valid."); }
            }}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg border border-white/10 text-slate-400 hover:text-slate-200 hover:bg-white/5 transition-colors h-7"
          >
            <CheckCircle2 className="w-3.5 h-3.5" /> Validate
          </button>
          <button
            onClick={() => setShowSaveModal(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg border border-white/10 text-slate-400 hover:text-emerald-400 hover:bg-white/5 transition-colors h-7"
            title="Save query (Ctrl+S)"
          >
            <Save className="w-3.5 h-3.5" />
          </button>
          {/* Pin to dashboard */}
          <button
            onClick={() => results?.length && setShowPinModal(true)}
            disabled={!results?.length}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg border border-white/10 text-slate-400 hover:text-amber-400 hover:bg-white/5 transition-colors h-7 disabled:opacity-30"
            title="Pin to Dashboard"
          >
            <Pin className="w-3.5 h-3.5" />
          </button>
          {/* Export */}
          <ExportMenu results={results} sql={sql} />
          {/* Shortcuts help */}
          <button
            onClick={() => setShowShortcuts(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg border border-white/10 text-slate-400 hover:text-blue-400 hover:bg-white/5 transition-colors h-7"
            title="Keyboard shortcuts"
          >
            <Keyboard className="w-3.5 h-3.5" />
          </button>
          <span className="text-[10px] text-slate-600 font-mono hidden lg:block">Ctrl+Enter to run</span>
          <div className="flex-1" />
          <div className="flex items-center gap-1 overflow-x-auto max-w-[400px]">
            {SAMPLES.slice(0, 6).map((s) => (
              <button key={s.label} onClick={() => loadSql(s.query)}
                className="text-[9px] px-2 py-1 rounded-full border border-white/10 bg-white/5 text-slate-500 hover:text-slate-300 hover:bg-white/10 whitespace-nowrap transition-all">
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Inner tab bar (Visual / Script / History) */}
        <div className="flex items-center border-b border-white/5 bg-slate-800/30 shrink-0">
          {[
            { key: "visual", label: "Visual", icon: Wand2 },
            { key: "script", label: "Script", icon: Code2 },
            { key: "history", label: "History", icon: History },
          ].map(({ key, label, icon: Icon }) => (
            <button key={key} onClick={() => setMidTab(key)}
              className={`flex items-center gap-1.5 px-4 py-2 text-xs font-medium border-b-2 transition-colors ${
                midTab === key ? "border-emerald-400 text-emerald-300" : "border-transparent text-slate-500 hover:text-slate-300"
              }`}
            >
              <Icon className="w-3 h-3" />{label}
              {key === "history" && queryHistory.length > 0 && (
                <span className="ml-1 px-1.5 py-0.5 bg-slate-500/20 text-slate-400 text-[9px] rounded-full font-bold">{queryHistory.length}</span>
              )}
            </button>
          ))}
          {results?.length > 0 && (
            <button onClick={() => setShowChart((v) => !v)}
              className={`flex items-center gap-1.5 px-4 py-2 text-xs font-medium border-b-2 transition-colors ml-auto ${
                showChart ? "border-amber-400 text-amber-300" : "border-transparent text-slate-500 hover:text-amber-300"
              }`}
            >
              <BarChart2 className="w-3 h-3" /> Chart
            </button>
          )}
        </div>

        {/* Validation errors */}
        <ValidationErrors errors={validationErrors} onDismiss={() => setValidationErrors([])} />

        {/* Content area */}
        <div className="flex-1 overflow-auto">

          {midTab === "visual" && (
            <VisualQueryBuilder onGenerate={(q) => loadSql(q)} />
          )}

          {midTab === "script" && !showChart && (
            <div className="flex flex-col h-full">
              <div className="flex items-center gap-2 px-4 py-1.5 bg-slate-800/50 border-b border-white/5 shrink-0">
                <AlignLeft className="w-3 h-3 text-slate-600" />
                <span className="text-[10px] text-slate-600 font-mono">{activeTab?.name || "query.sql"}</span>
              </div>
              <div className="flex flex-1 relative">
                <div className="select-none px-3 py-4 text-right font-mono text-[12px] text-slate-700 bg-slate-900/50 min-w-[36px] leading-5">
                  {sql.split("\n").map((_, i) => <div key={i}>{i + 1}</div>)}
                </div>
                <div className="flex-1 relative">
                  <textarea
                    ref={textareaRef}
                    value={sql}
                    onChange={(e) => {
                      setSql(e.target.value);
                      setValidationErrors([]);
                      setCursorPos(e.target.selectionStart);
                      setShowAutocomplete(true);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { runQuery(); return; }
                      if (e.key === "s" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); setShowSaveModal(true); return; }
                      if (e.key === "F5") { e.preventDefault(); return; }
                      if (e.key === "Escape") setShowAutocomplete(false);
                    }}
                    onSelect={(e) => setCursorPos(e.target.selectionStart)}
                    onClick={(e) => setCursorPos(e.target.selectionStart)}
                    onBlur={() => setTimeout(() => setShowAutocomplete(false), 150)}
                    className="w-full h-full bg-transparent text-emerald-300 font-mono text-[13px] px-4 py-4 outline-none resize-none leading-5"
                    spellCheck={false}
                    style={{ minHeight: "300px" }}
                  />
                  {showAutocomplete && (
                    <div className="absolute bottom-full left-4 mb-1">
                      <SqlAutocomplete
                        sql={sql} cursorPos={cursorPos}
                        allTableNames={allTableNames} allColumns={allColumns}
                        onSelect={handleAutocompleteSelect}
                        onClose={() => setShowAutocomplete(false)}
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {midTab === "script" && showChart && results?.length > 0 && (
            <ResultChart results={results} onClose={() => setShowChart(false)} />
          )}

          {midTab === "history" && (
            <div className="p-3">
              {queryHistory.length === 0 ? (
                <div className="flex items-center justify-center h-32 text-slate-600 text-xs font-mono">No queries run yet</div>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-2 px-1">
                    <span className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">{queryHistory.length} queries</span>
                    <button onClick={() => { setQueryHistory([]); localStorage.removeItem("qb_history"); }}
                      className="flex items-center gap-1 text-[10px] text-slate-600 hover:text-rose-400 transition-colors">
                      <Trash2 className="w-3 h-3" /> Clear
                    </button>
                  </div>
                  <div className="space-y-1">
                    {queryHistory.map((entry, i) => (
                      <div key={i} onClick={() => loadSql(entry.sql)}
                        className="group flex items-start gap-2 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 cursor-pointer border border-white/5 transition-all">
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

      {/* ── RIGHT ────────────────────────────────────────────────────── */}
      <aside style={{ width: rightWidth, minWidth: 180 }} className="shrink-0 flex flex-col overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-3 border-b border-white/5 shrink-0">
          <AlignLeft className="w-3.5 h-3.5 text-amber-400" />
          <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">Output & Actions</span>
        </div>
        <OutputPanel
          results={results} error={error} message={message} loading={loading} sql={sql}
          onPinWidget={() => setShowPinModal(true)}
          onOpenChart={() => { setMidTab("script"); setShowChart(true); }}
        />
      </aside>

      {/* Mutation Confirm */}
      {confirmState && (
        <MutationConfirmDialog
          mutationType={confirmState.mutationType}
          sql={sql}
          preview={confirmState.preview}
          onConfirm={() => { setConfirmState(null); doExecute(); }}
          onCancel={() => setConfirmState(null)}
        />
      )}

      {/* Save Query Modal */}
      {showSaveModal && (
        <SaveQueryModal
          sql={sql} results={results}
          onClose={() => setShowSaveModal(false)}
          onSaved={() => { setShowSaveModal(false); qc.invalidateQueries({ queryKey: ["savedQueries"] }); }}
        />
      )}

      {/* Pin Widget Modal */}
      {showPinModal && (
        <PinWidgetModal
          sql={sql}
          onClose={() => setShowPinModal(false)}
          onPinned={() => { qc.invalidateQueries({ queryKey: ["dashboardWidgets"] }); }}
        />
      )}

      {/* Shortcuts Modal */}
      {showShortcuts && <ShortcutsModal onClose={() => setShowShortcuts(false)} />}
    </div>
  );
}