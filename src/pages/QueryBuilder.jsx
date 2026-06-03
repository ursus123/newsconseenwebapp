import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  PlayCircle, CheckCircle2, RefreshCw, History, Trash2,
  Database, ChevronDown, ChevronRight, Table2, Upload,
  Hash, Type, Calendar, ToggleLeft, Layers, Wand2, Code2,
  AlignLeft, GitBranch, AlertCircle, XCircle, Plus, X,
  Save, FolderOpen, BarChart2, Pin, Keyboard, FileText,
  PenLine, PlusCircle, ShieldAlert, Brain, Sparkles, ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useEntityListFn } from "@/components/shared/useDataQuery";

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
import TeachIdjwiButton from "@/components/shared/TeachIdjwiButton";
import { saveIdjwiMemory } from "@/services/idjwiMemoryClient";

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

function translateNaturalLanguageToSql(prompt) {
  const text = String(prompt || "").toLowerCase();
  if (text.includes("low stock") || text.includes("below reorder") || text.includes("reorder")) {
    return "SELECT name, stock_quantity, min_stock_level FROM products WHERE stock_quantity <= min_stock_level ORDER BY stock_quantity ASC LIMIT 100";
  }
  if (text.includes("overdue task") || text.includes("late task")) {
    return "SELECT title, status, due_date, assigned_to_name FROM tasks WHERE due_date < NOW() AND status NOT IN ('completed', 'cancelled') ORDER BY due_date ASC LIMIT 100";
  }
  if (text.includes("unpaid") || text.includes("invoice") || text.includes("who owes")) {
    return "SELECT counterparty_name, transaction_type, amount, due_date, payment_status FROM transactions WHERE payment_status = 'unpaid' ORDER BY due_date ASC LIMIT 100";
  }
  if (text.includes("revenue") && (text.includes("month") || text.includes("trend") || text.includes("over time"))) {
    return "SELECT DATE_TRUNC('month', date) AS month, SUM(amount) AS revenue FROM transactions WHERE transaction_type IN ('sale_service', 'product_sale', 'service_fee') GROUP BY 1 ORDER BY 1";
  }
  if (text.includes("staff") && (text.includes("task") || text.includes("completed"))) {
    return "SELECT assigned_to_name, COUNT(*) AS completed_tasks FROM tasks WHERE status = 'completed' GROUP BY assigned_to_name ORDER BY completed_tasks ASC LIMIT 100";
  }
  if (text.includes("active staff") || text.includes("show me staff") || text.includes("list staff")) {
    return "SELECT first_name, last_name, email, status FROM people WHERE person_type = 'staff' AND status = 'active' ORDER BY last_name ASC LIMIT 100";
  }
  if (text.includes("active client") || text.includes("show me clients") || text.includes("list clients")) {
    return "SELECT first_name, last_name, email, status FROM people WHERE person_type = 'client' AND status = 'active' ORDER BY last_name ASC LIMIT 100";
  }
  if (text.includes("relationship")) {
    return "SELECT role, COUNT(*) AS count FROM relationships WHERE role IS NOT NULL AND role != '' GROUP BY role ORDER BY count DESC LIMIT 8";
  }
  if (text.includes("product")) return "SELECT * FROM products LIMIT 100";
  if (text.includes("people") || text.includes("person")) return "SELECT * FROM people LIMIT 100";
  if (text.includes("task")) return "SELECT * FROM tasks LIMIT 100";
  if (text.includes("transaction")) return "SELECT * FROM transactions LIMIT 100";
  return "SELECT * FROM enterprises LIMIT 100";
}

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

// ── CRUD Helper Panel ─────────────────────────────────────────────────────
// Generates INSERT and UPDATE templates for Base44 entities from MASTER_SCHEMA.
// DELETE is always blocked — directs user to the entity pages instead.
function CrudHelperPanel({ onLoad }) {
  const [entity, setEntity] = useState("people");
  const [mode, setMode] = useState("insert"); // "insert" | "update"

  const schema = MASTER_SCHEMA[entity] || [];
  const writableCols = schema.filter(f => f.col !== "id" && f.col !== "created_date");

  function buildInsertSQL() {
    const cols = writableCols.map(f => f.col).join(", ");
    const placeholder = (f) => {
      if (f.type === "INT") return "0";
      if (f.type === "FLOAT") return "0.00";
      if (f.type === "DATE") return `'${new Date().toISOString().slice(0,10)}'`;
      return `'value'`;
    };
    const vals = writableCols.map(f => placeholder(f)).join(", ");
    return `INSERT INTO ${entity} (${cols})\nVALUES (${vals})`;
  }

  function buildUpdateSQL() {
    const setClauses = writableCols.slice(0, 3).map(f => `${f.col} = 'new_value'`).join(",\n  ");
    const firstTextCol = writableCols.find(f => f.type === "VARCHAR");
    const whereClause = firstTextCol ? `${firstTextCol.col} = 'existing_value'` : "id = 'record_id'";
    return `UPDATE ${entity}\nSET ${setClauses}\nWHERE ${whereClause}`;
  }

  const sql = mode === "insert" ? buildInsertSQL() : buildUpdateSQL();

  return (
    <div className="flex-1 overflow-y-auto py-3 px-2 space-y-3">
      {/* Entity selector */}
      <div>
        <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 px-1">Entity</p>
        <select
          value={entity}
          onChange={e => setEntity(e.target.value)}
          className="w-full bg-slate-800 border border-white/10 text-slate-300 text-xs rounded-lg px-2 py-1.5 outline-none"
        >
          {Object.entries(MASTER_TABLES).map(([key, { label }]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
      </div>

      {/* Mode selector */}
      <div className="flex gap-1">
        {[
          { key: "insert", label: "INSERT", icon: PlusCircle, color: "text-emerald-400" },
          { key: "update", label: "UPDATE", icon: PenLine, color: "text-amber-400" },
        ].map(({ key, label, icon: Icon, color }) => (
          <button
            key={key}
            onClick={() => setMode(key)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[10px] font-semibold transition-colors border ${
              mode === key
                ? key === "insert"
                  ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400"
                  : "bg-amber-500/15 border-amber-500/30 text-amber-400"
                : "border-white/10 text-slate-500 hover:text-slate-300"
            }`}
          >
            <Icon className="w-3 h-3" /> {label}
          </button>
        ))}
      </div>

      {/* Schema reference */}
      <div>
        <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 px-1">Fields</p>
        <div className="bg-slate-800/60 rounded-xl border border-white/5 divide-y divide-white/5 overflow-hidden">
          {schema.map(({ col, type }) => (
            <div key={col} className="flex items-center gap-2 px-3 py-1.5 text-[10px]">
              <span className={`font-mono flex-1 ${col === "id" || col === "created_date" ? "text-slate-600" : "text-slate-300"}`}>{col}</span>
              <span className={`font-mono text-[9px] font-bold ${
                type === "INT" || type === "FLOAT" ? "text-blue-400"
                : type === "DATE" || type === "DATETIME" ? "text-amber-400"
                : type === "ENUM" ? "text-violet-400"
                : "text-slate-500"
              }`}>{type}</span>
              {(col === "id" || col === "created_date") && (
                <span className="text-[8px] text-slate-600">auto</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Generated SQL */}
      <div>
        <div className="flex items-center justify-between mb-1.5 px-1">
          <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Generated SQL</p>
          <button
            onClick={() => onLoad(sql)}
            className={`text-[9px] font-bold px-2 py-0.5 rounded-full transition-colors ${
              mode === "insert"
                ? "bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25"
                : "bg-amber-500/15 text-amber-400 hover:bg-amber-500/25"
            }`}
          >
            load →
          </button>
        </div>
        <pre className="bg-slate-800 rounded-xl px-3 py-2.5 font-mono text-[10px] text-emerald-300 whitespace-pre-wrap break-all border border-white/5">
          {sql}
        </pre>
      </div>

      {/* DELETE notice */}
      <div className="flex items-start gap-2 bg-rose-500/5 border border-rose-500/20 rounded-xl px-3 py-2.5">
        <ShieldAlert className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
        <div>
          <p className="text-[10px] font-semibold text-rose-400 mb-0.5">DELETE is manual-only</p>
          <p className="text-[10px] text-slate-400 leading-relaxed">
            DELETE queries are blocked in Query Builder. To remove a record, open the entity
            page (e.g. People, Enterprises) and delete it there — this preserves the audit trail
            and prevents accidental bulk deletes.
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Left panel tabs ───────────────────────────────────────────────────────
const LEFT_TABS = [
  { key: "tables",    label: "Tables",    icon: Database },
  { key: "analytics", label: "Analytics", icon: BarChart2 },
  { key: "templates", label: "Templates", icon: FileText },
  { key: "crud",      label: "CRUD",      icon: PenLine },
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
  const [selectedChartType, setSelectedChartType] = useState("bar");
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showPinModal, setShowPinModal] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [queryHistory, setQueryHistory] = useState(() => {
    try { return JSON.parse(localStorage.getItem("qb_history") || "[]"); } catch { return []; }
  });
  const [confirmState, setConfirmState] = useState(null);
  const [validationErrors, setValidationErrors] = useState([]);
  const [nlPrompt, setNlPrompt] = useState("");
  const [nlBusy, setNlBusy] = useState(false);
  const [verifiedAt, setVerifiedAt] = useState(null);
  const [verifyBusy, setVerifyBusy] = useState(false);

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

  // ── Current user (for tenant isolation) ───────────────────────────────
  const { data: currentUser } = useQuery({
    queryKey: ["currentUser"],
    queryFn: () => base44.auth.me(),
  });
  
  const listFn = useEntityListFn(currentUser);

  // ── Data Models ───────────────────────────────────────────────────────
  const { data: dataModels = [] } = useQuery({
    queryKey: ["dataModels_qb", currentUser?.company_id],
    queryFn: () => listFn(base44.entities.DataModel),
    enabled: !!currentUser,
  });

  // ── Master data snapshot ─ SCOPED TO TENANT ─────────────────────────
  const { data: enterprisesSnap = [] } = useQuery({
    queryKey: ["snap_enterprises", currentUser?.company_id],
    queryFn: () => listFn(base44.entities.Enterprise),
    enabled: !!currentUser,
    staleTime: 0,
    refetchOnMount: "always",
  });
  const { data: peopleSnap = [] } = useQuery({
    queryKey: ["snap_people", currentUser?.company_id],
    queryFn: () => listFn(base44.entities.Person),
    enabled: !!currentUser,
    staleTime: 0,
    refetchOnMount: "always",
  });
  const { data: productsSnap = [] } = useQuery({
    queryKey: ["snap_products", currentUser?.company_id],
    queryFn: () => listFn(base44.entities.Product),
    enabled: !!currentUser,
    staleTime: 0,
    refetchOnMount: "always",
  });
  const { data: tasksSnap = [] } = useQuery({
    queryKey: ["snap_tasks", currentUser?.company_id],
    queryFn: () => listFn(base44.entities.Task),
    enabled: !!currentUser,
    staleTime: 0,
    refetchOnMount: "always",
  });
  const { data: transactionsSnap = [] } = useQuery({
    queryKey: ["snap_transactions", currentUser?.company_id],
    queryFn: () => listFn(base44.entities.Transaction),
    enabled: !!currentUser,
    staleTime: 0,
    refetchOnMount: "always",
  });
  const { data: addressesSnap = [] } = useQuery({
    queryKey: ["snap_addresses", currentUser?.company_id],
    queryFn: () => listFn(base44.entities.Address),
    enabled: !!currentUser,
    staleTime: 0,
    refetchOnMount: "always",
  });

  const masterDataSnapshot = {
    enterprises:   enterprisesSnap,
    people:        peopleSnap,
    products:      productsSnap,
    tasks:         tasksSnap,
    transactions:  transactionsSnap,
    addresses:     addressesSnap,
  };

  const qc = useQueryClient();

  useEffect(() => {
    return UploadedDataStore.subscribe((all) => { setUploadedTables({ ...all }); });
  }, []);

  // Load SQL from Reports page "Edit in QueryBuilder" action
  // or from Copilot "Run in Query Builder" (qb_preload_sql)
  useEffect(() => {
    const preloadSql = sessionStorage.getItem("qb_preload_sql");
    if (preloadSql) {
      setSql(preloadSql);
      setMidTab("script");
      setMessage("Copilot query loaded - verify or run it here.");
      sessionStorage.removeItem("qb_preload_sql");
      return;
    }
    const savedSql = sessionStorage.getItem("qb_load_sql");
    const savedTitle = sessionStorage.getItem("qb_load_title");
    if (savedSql) {
      setSql(savedSql);
      if (savedTitle) updateTab(activeTabId, { name: savedTitle + ".sql", sql: savedSql });
      setMidTab("script");
      setMessage(`Loaded: "${savedTitle || "pinned chart"}"`);
      sessionStorage.removeItem("qb_load_sql");
      sessionStorage.removeItem("qb_load_title");
      sessionStorage.removeItem("qb_source_widget_id");
    }
    const params = new URLSearchParams(window.location.search);
    const urlSql = params.get("sql");
    const urlTitle = params.get("title");
    if (urlSql) {
      const decoded = decodeURIComponent(urlSql);
      setSql(decoded);
      if (urlTitle) updateTab(activeTabId, { name: `${urlTitle}.sql`, sql: decoded });
      setMidTab("script");
      setMessage(`Loaded from link: "${urlTitle || "query"}"`);
      if (params.get("run") === "1") setTimeout(() => doExecute(decoded), 0);
    }
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
      const result = await executeSQL(runSql, currentUploaded, currentUser?.company_id, masterDataSnapshot);
      if (result.type === "select") { setResults(result.rows); if (result.rows.length > 0) setShowChart(false); }
      setMessage(result.message);
      setVerifiedAt(new Date().toISOString());
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
    setVerifiedAt(null);
  };

  const handleNlToSql = async () => {
    if (!nlPrompt.trim()) return;
    setNlBusy(true);
    try {
      const generated = translateNaturalLanguageToSql(nlPrompt);
      loadSql(generated);
      setMessage("Draft SQL generated locally. Run it to verify the result.");
    } finally {
      setNlBusy(false);
    }
  };

  const handleSaveVerification = async () => {
    if (!currentUser?.company_id || !sql.trim()) return;
    setVerifyBusy(true);
    try {
      await saveIdjwiMemory({
        user: currentUser,
        companyId: currentUser.company_id,
        memoryType: "business_rule",
        key: `verified_query_${(activeTab?.name || "query").replace(/[^a-z0-9]+/gi, "_").toLowerCase()}`,
        value: {
          sql,
          rows: results?.length ?? 0,
          verified_at: new Date().toISOString(),
          title: activeTab?.name || "Query Builder verification",
        },
        source: "operator_stated",
        confidence: 1,
        reviewStatus: "confirmed",
        metadata: {
          surface: "query_builder",
          natural_language_prompt: nlPrompt || null,
        },
      });
      setVerifiedAt(new Date().toISOString());
      setMessage("Verified query saved to Idjwi Memory.");
    } catch (e) {
      setError(e.message || "Could not save verification memory.");
    } finally {
      setVerifyBusy(false);
    }
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

        {leftTab === "crud" && (
          <CrudHelperPanel onLoad={(crudSql) => { loadSql(crudSql); setMidTab("script"); }} />
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

        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-white/5 bg-slate-900/80 shrink-0">
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-emerald-300 shrink-0">
            <Brain className="w-3.5 h-3.5" />
            Ask to SQL
          </div>
          <input
            value={nlPrompt}
            onChange={(e) => setNlPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleNlToSql();
              }
            }}
            placeholder="Example: show unpaid invoices, low stock items, revenue by month"
            className="flex-1 min-w-[180px] h-8 rounded-lg border border-white/10 bg-slate-950/70 px-3 text-xs text-slate-200 placeholder:text-slate-600 outline-none focus:border-emerald-400/50"
          />
          <button
            onClick={handleNlToSql}
            disabled={nlBusy || !nlPrompt.trim()}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-emerald-500 text-white text-xs font-semibold hover:bg-emerald-600 disabled:opacity-40 disabled:hover:bg-emerald-500"
          >
            {nlBusy ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            Draft
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
          {verifiedAt && (
            <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 font-mono">
              <ShieldCheck className="w-3 h-3" />
              verified {new Date(verifiedAt).toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={handleSaveVerification}
            disabled={!currentUser?.company_id || !sql.trim() || verifyBusy}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10 transition-colors h-7 disabled:opacity-30"
            title="Save this verified query to Idjwi Memory"
          >
            {verifyBusy ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
            Verify
          </button>
          {currentUser?.company_id && (
            <TeachIdjwiButton
              user={currentUser}
              companyId={currentUser.company_id}
              defaultType="business_rule"
              defaultKey={`query_${(activeTab?.name || "draft").replace(/[^a-z0-9]+/gi, "_").toLowerCase()}`}
              defaultValue={{
                sql,
                rows: results?.length ?? 0,
                note: "Saved from Query Builder",
              }}
              label="Teach"
              className="h-7 px-2.5 rounded-lg border border-white/10 text-xs text-slate-400 hover:text-emerald-300 hover:bg-white/5"
            />
          )}
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
            <ResultChart
              results={results}
              chartType={selectedChartType}
              onChartTypeChange={setSelectedChartType}
              onClose={() => setShowChart(false)}
            />
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
        {results?.length > 0 && (
          <div className="shrink-0 h-[340px] border-t border-white/5">
            <ResultChart
              results={results}
              chartType={selectedChartType}
              onChartTypeChange={setSelectedChartType}
              onClose={() => {}}
            />
          </div>
        )}
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
          chartType={selectedChartType}
          data={results}
          onClose={() => setShowPinModal(false)}
          onPinned={() => {
            qc.invalidateQueries({ queryKey: ["dashboardWidgets"] });
            qc.invalidateQueries({ queryKey: ["reportCharts"] });
          }}
        />
      )}

      {/* Shortcuts Modal */}
      {showShortcuts && <ShortcutsModal onClose={() => setShowShortcuts(false)} />}
    </div>
  );
}
