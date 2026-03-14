import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  PlayCircle, Download, ChevronDown, ChevronRight, ChevronUp,
  Database, Table2, Upload, CheckCircle2, AlertCircle,
  Hash, Type, Calendar, ToggleLeft, Layers, RefreshCw,
} from "lucide-react";
import UploadPanel from "../components/querybuilder/UploadPanel.jsx";
import { UploadedDataStore } from "../components/querybuilder/UploadedDataStore";

// ── Entity → column schema map ─────────────────────────────────────────────
const MASTER_TABLES = {
  enterprises:   { entity: "Enterprise",   label: "Enterprises" },
  people:        { entity: "Person",        label: "People" },
  products:      { entity: "Product",       label: "Products" },
  services:      { entity: "Service",       label: "Services" },
  addresses:     { entity: "Address",       label: "Addresses" },
  relationships: { entity: "Relationship",  label: "Relationships" },
  tasks:         { entity: "Task",          label: "Tasks" },
  transactions:  { entity: "Transaction",   label: "Transactions" },
};

const PROTECTED_TABLES = new Set(["enterprises", "people", "products", "services", "addresses"]);

const MASTER_SCHEMA = {
  enterprises:   [
    { col: "id", type: "VARCHAR" }, { col: "enterprise_name", type: "VARCHAR" },
    { col: "short_name", type: "VARCHAR" }, { col: "status", type: "ENUM" },
    { col: "enterprise_type", type: "ENUM" }, { col: "city", type: "VARCHAR" },
    { col: "country", type: "VARCHAR" }, { col: "phone", type: "VARCHAR" },
    { col: "email", type: "VARCHAR" }, { col: "created_date", type: "DATETIME" },
  ],
  people: [
    { col: "id", type: "VARCHAR" }, { col: "first_name", type: "VARCHAR" },
    { col: "last_name", type: "VARCHAR" }, { col: "person_type", type: "ENUM" },
    { col: "status", type: "ENUM" }, { col: "primary_role", type: "VARCHAR" },
    { col: "email", type: "VARCHAR" }, { col: "phone", type: "VARCHAR" },
    { col: "start_date", type: "DATE" }, { col: "created_date", type: "DATETIME" },
  ],
  products: [
    { col: "id", type: "VARCHAR" }, { col: "name", type: "VARCHAR" },
    { col: "sku", type: "VARCHAR" }, { col: "status", type: "ENUM" },
    { col: "item_type", type: "ENUM" }, { col: "stock_quantity", type: "INT" },
    { col: "unit_price", type: "FLOAT" }, { col: "cost_price", type: "FLOAT" },
    { col: "category", type: "ENUM" }, { col: "created_date", type: "DATETIME" },
  ],
  services: [
    { col: "id", type: "VARCHAR" }, { col: "name", type: "VARCHAR" },
    { col: "status", type: "ENUM" }, { col: "category", type: "ENUM" },
    { col: "price", type: "FLOAT" }, { col: "pricing_model", type: "ENUM" },
    { col: "created_date", type: "DATETIME" },
  ],
  addresses: [
    { col: "id", type: "VARCHAR" }, { col: "label", type: "VARCHAR" },
    { col: "address_line1", type: "VARCHAR" }, { col: "city", type: "VARCHAR" },
    { col: "country", type: "VARCHAR" }, { col: "status", type: "ENUM" },
    { col: "created_date", type: "DATETIME" },
  ],
  relationships: [
    { col: "id", type: "VARCHAR" }, { col: "relationship_type", type: "ENUM" },
    { col: "person_name", type: "VARCHAR" }, { col: "enterprise_name", type: "VARCHAR" },
    { col: "status", type: "ENUM" }, { col: "start_date", type: "DATE" },
    { col: "created_date", type: "DATETIME" },
  ],
  tasks: [
    { col: "id", type: "VARCHAR" }, { col: "title", type: "VARCHAR" },
    { col: "task_type", type: "ENUM" }, { col: "status", type: "ENUM" },
    { col: "priority", type: "ENUM" }, { col: "assigned_to_email", type: "VARCHAR" },
    { col: "scheduled_date", type: "DATE" }, { col: "due_date", type: "DATE" },
    { col: "created_date", type: "DATETIME" },
  ],
  transactions: [
    { col: "id", type: "VARCHAR" }, { col: "transaction_type", type: "ENUM" },
    { col: "status", type: "ENUM" }, { col: "date", type: "DATE" },
    { col: "amount", type: "FLOAT" }, { col: "payment_status", type: "ENUM" },
    { col: "primary_person", type: "VARCHAR" }, { col: "enterprise", type: "VARCHAR" },
    { col: "created_date", type: "DATETIME" },
  ],
};

const SAMPLES = [
  { label: "Active enterprises",    query: "SELECT * FROM enterprises WHERE status = 'active'" },
  { label: "Active people",         query: "SELECT * FROM people WHERE status = 'active'" },
  { label: "Low-stock products",    query: "SELECT * FROM products WHERE stock_quantity < min_stock_level" },
  { label: "Open tasks",            query: "SELECT * FROM tasks WHERE status = 'open'" },
  { label: "Posted transactions",   query: "SELECT * FROM transactions WHERE status = 'posted'" },
  { label: "INSERT into master",    query: "INSERT INTO enterprises (enterprise_name, status) VALUES ('New Co', 'active')" },
  { label: "UPDATE master",         query: "UPDATE tasks SET status = 'completed' WHERE id = 'REPLACE_WITH_ID'" },
  { label: "INSERT uploaded → master", query: "INSERT INTO people SELECT first_name, last_name, person_type FROM my_uploaded_table" },
];

// ── Type icon helper ──────────────────────────────────────────────────────
function TypeIcon({ type }) {
  const cls = "w-3 h-3 shrink-0";
  if (type === "INT" || type === "FLOAT") return <Hash className={`${cls} text-blue-400`} />;
  if (type === "DATE" || type === "DATETIME") return <Calendar className={`${cls} text-amber-400`} />;
  if (type === "ENUM") return <ToggleLeft className={`${cls} text-violet-400`} />;
  return <Type className={`${cls} text-slate-400`} />;
}

function TypeBadge({ type }) {
  const color = type === "INT" || type === "FLOAT" ? "text-blue-400" :
    type === "DATE" || type === "DATETIME" ? "text-amber-400" :
    type === "ENUM" ? "text-violet-400" : "text-slate-500";
  return <span className={`font-mono text-[9px] font-bold ${color}`}>{type}</span>;
}

function inferType(values) {
  const nonEmpty = values.filter((v) => v !== null && v !== undefined && String(v).trim() !== "");
  if (!nonEmpty.length) return "TEXT";
  if (nonEmpty.every((v) => !isNaN(Number(v)) && !isNaN(parseFloat(v)))) {
    return nonEmpty.every((v) => Number.isInteger(Number(v))) ? "INT" : "FLOAT";
  }
  if (nonEmpty.every((v) => /^\d{4}-\d{2}-\d{2}/.test(String(v)))) return "DATE";
  return "TEXT";
}

function getUploadedSchema(rows) {
  if (!rows.length) return [];
  return Object.keys(rows[0]).map((col) => ({ col, type: inferType(rows.map((r) => r[col])) }));
}

// ── SQL Executor ──────────────────────────────────────────────────────────
async function executeSQL(sql, uploadedTables) {
  const s = sql.trim().replace(/\s+/g, " ");
  const upper = s.toUpperCase();

  if (upper.startsWith("SELECT")) {
    const fromMatch = s.match(/FROM\s+(\w+)/i);
    if (!fromMatch) throw new Error("Missing FROM clause.");
    const tableName = fromMatch[1].toLowerCase();
    let rows;
    if (Object.prototype.hasOwnProperty.call(uploadedTables, tableName)) {
      rows = uploadedTables[tableName].rows.map((r) => ({ ...r }));
    } else if (MASTER_TABLES[tableName]) {
      rows = await base44.entities[MASTER_TABLES[tableName].entity].list("-created_date", 2000);
    } else {
      throw new Error(`Unknown table "${tableName}".`);
    }
    const colsMatch = s.match(/SELECT\s+(.+?)\s+FROM/i);
    const colStr = colsMatch ? colsMatch[1].trim() : "*";
    if (colStr !== "*") {
      const cols = colStr.split(",").map((c) => c.trim());
      rows = rows.map((r) => { const o = {}; cols.forEach((c) => { o[c] = r[c]; }); return o; });
    }
    rows = applyWhere(rows, s);
    return { type: "select", rows, message: `${rows.length} row(s) returned.` };
  }

  if (upper.startsWith("INSERT") && upper.includes("SELECT")) {
    const m = s.match(/INSERT\s+INTO\s+(\w+)\s+SELECT\s+(.+?)\s+FROM\s+(\w+)(?:\s+WHERE\s+(.+))?$/i);
    if (!m) throw new Error("Invalid INSERT...SELECT syntax.");
    const [, destTable, colStr, srcTable, whereClause] = m;
    const dest = destTable.toLowerCase(), src = srcTable.toLowerCase();
    if (!MASTER_TABLES[dest]) throw new Error(`INSERT destination must be a master table.`);
    if (!uploadedTables[src]) throw new Error(`Source table "${src}" not found.`);
    const cols = colStr.trim() === "*" ? uploadedTables[src].columns : colStr.split(",").map((c) => c.trim());
    let srcRows = [...uploadedTables[src].rows];
    if (whereClause) srcRows = applyWhere(srcRows, `SELECT * FROM x WHERE ${whereClause}`);
    const entity = base44.entities[MASTER_TABLES[dest].entity];
    let inserted = 0;
    for (const row of srcRows) {
      const payload = {};
      cols.forEach((c) => { if (row[c] !== undefined) payload[c] = row[c]; });
      await entity.create(payload);
      inserted++;
    }
    return { type: "mutation", rows: [], message: `✓ Inserted ${inserted} row(s) into ${dest}.` };
  }

  if (upper.startsWith("INSERT")) {
    const m = s.match(/INSERT\s+INTO\s+(\w+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i);
    if (!m) throw new Error("Invalid INSERT syntax.");
    const [, tableName, colsStr, valsStr] = m;
    const dest = tableName.toLowerCase();
    const cols = colsStr.split(",").map((c) => c.trim());
    const vals = valsStr.split(",").map((v) => v.trim().replace(/^['"]|['"]$/g, ""));
    const payload = {}; cols.forEach((c, i) => { payload[c] = vals[i] ?? ""; });
    if (MASTER_TABLES[dest]) {
      const created = await base44.entities[MASTER_TABLES[dest].entity].create(payload);
      return { type: "mutation", rows: [created], message: `✓ Inserted 1 row into ${dest}.` };
    } else {
      UploadedDataStore.addRow(dest, payload);
      return { type: "mutation", rows: [], message: `✓ Inserted 1 row into "${dest}".` };
    }
  }

  if (upper.startsWith("UPDATE")) {
    const m = s.match(/UPDATE\s+(\w+)\s+SET\s+(.+?)\s+WHERE\s+(.+)$/i);
    if (!m) throw new Error("Invalid UPDATE syntax.");
    const [, tableName, setStr, whereStr] = m;
    const tbl = tableName.toLowerCase();
    const updates = {};
    setStr.split(",").forEach((part) => {
      const eq = part.match(/^\s*(\w+)\s*=\s*'?([^']*)'?\s*$/);
      if (eq) updates[eq[1].trim()] = eq[2].trim();
    });
    if (MASTER_TABLES[tbl]) {
      const entity = base44.entities[MASTER_TABLES[tbl].entity];
      const allRows = await entity.list("-created_date", 2000);
      const matched = applyWhere(allRows, `SELECT * FROM x WHERE ${whereStr}`);
      if (!matched.length) return { type: "mutation", rows: [], message: "No rows matched." };
      for (const row of matched) await entity.update(row.id, updates);
      return { type: "mutation", rows: [], message: `✓ Updated ${matched.length} row(s) in ${tbl}.` };
    } else if (uploadedTables[tbl]) {
      const rows = uploadedTables[tbl].rows;
      const matched = applyWhere(rows.map((r, i) => ({ ...r, _idx: i })), `SELECT * FROM x WHERE ${whereStr}`);
      matched.forEach((r) => UploadedDataStore.updateRow(tbl, r._idx, updates));
      return { type: "mutation", rows: [], message: `✓ Updated ${matched.length} row(s) in "${tbl}".` };
    }
    throw new Error(`Unknown table "${tbl}".`);
  }

  if (upper.startsWith("DELETE")) {
    const m = s.match(/DELETE\s+FROM\s+(\w+)(?:\s+WHERE\s+(.+))?$/i);
    if (!m) throw new Error("Invalid DELETE syntax.");
    const [, tableName, whereStr] = m;
    const tbl = tableName.toLowerCase();
    if (PROTECTED_TABLES.has(tbl)) throw new Error(`❌ DELETE blocked on protected table "${tbl}".`);
    if (MASTER_TABLES[tbl]) {
      const entity = base44.entities[MASTER_TABLES[tbl].entity];
      const allRows = await entity.list("-created_date", 2000);
      const matched = whereStr ? applyWhere(allRows, `SELECT * FROM x WHERE ${whereStr}`) : allRows;
      for (const row of matched) await entity.delete(row.id);
      return { type: "mutation", rows: [], message: `✓ Deleted ${matched.length} row(s) from ${tbl}.` };
    } else if (uploadedTables[tbl]) {
      if (whereStr) {
        const rows = uploadedTables[tbl].rows;
        const matched = applyWhere(rows.map((r, i) => ({ ...r, _idx: i })), `SELECT * FROM x WHERE ${whereStr}`);
        matched.reverse().forEach((r) => UploadedDataStore.deleteRow(tbl, r._idx));
        return { type: "mutation", rows: [], message: `✓ Deleted ${matched.length} row(s) from "${tbl}".` };
      } else {
        const count = uploadedTables[tbl].rows.length;
        UploadedDataStore.set(tbl, { ...uploadedTables[tbl], rows: [] });
        return { type: "mutation", rows: [], message: `✓ Deleted all ${count} row(s) from "${tbl}".` };
      }
    }
    throw new Error(`Unknown table "${tbl}".`);
  }

  throw new Error("Unsupported SQL. Supported: SELECT, INSERT, UPDATE, DELETE.");
}

function applyWhere(rows, sql) {
  const whereMatch = sql.match(/WHERE\s+(.+)$/i);
  if (!whereMatch) return rows;
  const conditions = whereMatch[1].split(/\s+AND\s+/i);
  return rows.filter((row) =>
    conditions.every((cond) => {
      const m = cond.trim().match(/^(\w+)\s*(=|!=|<>|<=|>=|<|>|LIKE)\s*'?([^']*)'?$/i);
      if (!m) return true;
      const [, field, op, val] = m;
      const rowVal = row[field];
      const numVal = parseFloat(val), rowNum = parseFloat(rowVal);
      switch (op.toUpperCase()) {
        case "=":    return String(rowVal ?? "").toLowerCase() === val.toLowerCase();
        case "!=": case "<>": return String(rowVal ?? "").toLowerCase() !== val.toLowerCase();
        case "<":   return !isNaN(rowNum) && rowNum < numVal;
        case ">":   return !isNaN(rowNum) && rowNum > numVal;
        case "<=":  return !isNaN(rowNum) && rowNum <= numVal;
        case ">=":  return !isNaN(rowNum) && rowNum >= numVal;
        case "LIKE": return String(rowVal ?? "").toLowerCase().includes(val.replace(/%/g, "").toLowerCase());
        default:    return true;
      }
    })
  );
}

function exportCSV(rows) {
  if (!rows.length) return;
  const keys = Object.keys(rows[0]);
  const csv = [keys.join(","), ...rows.map((r) => keys.map((k) => JSON.stringify(r[k] ?? "")).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = "query_results.csv"; a.click();
  URL.revokeObjectURL(url);
}

// ── Schema Tree Item ──────────────────────────────────────────────────────
function TableTreeItem({ name, schema, isUploaded, onSelect, isActive, onQueryClick }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <div
        className={`group flex items-center gap-1.5 px-2 py-1.5 rounded-lg cursor-pointer transition-all text-xs select-none
          ${isActive ? "bg-emerald-500/15 text-emerald-300" : "text-slate-400 hover:bg-white/5 hover:text-white"}`}
        onClick={() => { setOpen((v) => !v); onSelect(name); }}
      >
        {open ? <ChevronDown className="w-3 h-3 shrink-0" /> : <ChevronRight className="w-3 h-3 shrink-0" />}
        <Table2 className={`w-3 h-3 shrink-0 ${isUploaded ? "text-indigo-400" : "text-slate-500"}`} />
        <span className="font-mono truncate flex-1">{name}</span>
        {PROTECTED_TABLES.has(name) && <span className="text-[8px] text-slate-600">RO</span>}
        <button
          onClick={(e) => { e.stopPropagation(); onQueryClick(name); }}
          className="opacity-0 group-hover:opacity-100 text-[9px] text-emerald-400 hover:text-emerald-300 font-bold transition-opacity px-1 rounded"
          title="SELECT * FROM this table"
        >
          ▶
        </button>
      </div>
      {open && (
        <div className="ml-4 mt-0.5 space-y-0.5 border-l border-white/5 pl-2">
          {schema.map(({ col, type }) => (
            <div key={col} className="flex items-center gap-2 px-2 py-1 rounded text-[10px] text-slate-500 hover:text-slate-300 hover:bg-white/5 cursor-default">
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

// ── Main Component ────────────────────────────────────────────────────────
export default function QueryBuilder() {
  const [sql, setSql] = useState("SELECT * FROM enterprises WHERE status = 'active'");
  const [results, setResults] = useState(null);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [activeTable, setActiveTable] = useState(null);
  const [uploadedTables, setUploadedTables] = useState(() => UploadedDataStore.getAll());
  const [bottomTab, setBottomTab] = useState("output"); // "output" | "upload"
  const loadingRef = useRef(false);
  const textareaRef = useRef(null);

  useEffect(() => {
    return UploadedDataStore.subscribe((all) => {
      if (!loadingRef.current) setUploadedTables({ ...all });
    });
  }, []);

  const runQuery = async () => {
    loadingRef.current = true;
    setLoading(true); setError(null); setResults(null); setMessage(null);
    const currentUploaded = UploadedDataStore.getAll();
    try {
      const result = await executeSQL(sql, currentUploaded);
      if (result.type === "select") setResults(result.rows);
      setMessage(result.message);
      setBottomTab("output");
    } catch (e) {
      setError(e.message);
      setBottomTab("output");
    } finally {
      loadingRef.current = false;
      setLoading(false);
      setUploadedTables(UploadedDataStore.getAll());
    }
  };

  const columns = results?.length > 0
    ? Object.keys(results[0]).filter((k) => !["attachment_urls", "image_url", "photo_url", "attachment_url"].includes(k))
    : [];

  const uploadedNames = Object.keys(uploadedTables);

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-0 bg-slate-900 rounded-2xl overflow-hidden shadow-2xl border border-slate-700">

      {/* ── Schema sidebar ──────────────────────────────────────────────── */}
      <aside className="w-60 shrink-0 flex flex-col border-r border-white/5 overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-3 border-b border-white/5">
          <Database className="w-3.5 h-3.5 text-emerald-400" />
          <span className="text-xs font-bold text-slate-300 uppercase tracking-widest">Schema</span>
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-2 space-y-4">
          {/* Master tables */}
          <div>
            <div className="flex items-center gap-1.5 px-2 py-1 mb-1">
              <Layers className="w-3 h-3 text-slate-600" />
              <span className="text-[9px] font-bold text-slate-600 uppercase tracking-widest">Master</span>
            </div>
            {Object.keys(MASTER_TABLES).map((name) => (
              <TableTreeItem
                key={name}
                name={name}
                schema={MASTER_SCHEMA[name] || []}
                isUploaded={false}
                isActive={activeTable === name}
                onSelect={setActiveTable}
                onQueryClick={(n) => setSql(`SELECT * FROM ${n}`)}
              />
            ))}
          </div>

          {/* Uploaded tables */}
          {uploadedNames.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 px-2 py-1 mb-1">
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
                    isUploaded={true}
                    isActive={activeTable === name}
                    onSelect={setActiveTable}
                    onQueryClick={(n) => setSql(`SELECT * FROM ${n}`)}
                  />
                );
              })}
            </div>
          )}
        </div>
      </aside>

      {/* ── Main area ───────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* ── Toolbar ─────────────────────────────────────────────────── */}
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/5 bg-slate-900 shrink-0">
          <Button
            size="sm"
            onClick={runQuery}
            disabled={loading}
            className="bg-emerald-500 hover:bg-emerald-600 text-white gap-1.5 h-7 px-3 text-xs rounded-lg"
          >
            {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <PlayCircle className="w-3.5 h-3.5" />}
            {loading ? "Running…" : "Run"}
          </Button>
          <span className="text-[10px] text-slate-600 font-mono">Ctrl+Enter to run</span>
          <div className="flex-1" />
          {/* Sample queries */}
          <div className="flex items-center gap-1 overflow-x-auto max-w-[500px]">
            {SAMPLES.slice(0, 5).map((s) => (
              <button
                key={s.label}
                onClick={() => setSql(s.query)}
                className="text-[10px] px-2.5 py-1 rounded-full border border-white/10 bg-white/5 text-slate-500 hover:text-slate-300 hover:bg-white/10 whitespace-nowrap transition-all"
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── SQL Editor ──────────────────────────────────────────────── */}
        <div className="shrink-0 border-b border-white/5 relative">
          <div className="flex items-center gap-2 px-4 py-1.5 bg-slate-800/50 border-b border-white/5">
            <span className="text-[10px] text-slate-600 font-mono">query.sql</span>
          </div>
          <div className="flex">
            {/* Line numbers */}
            <div className="select-none px-3 py-4 text-right font-mono text-[12px] text-slate-700 bg-slate-900/50 min-w-[40px] leading-5">
              {sql.split("\n").map((_, i) => <div key={i}>{i + 1}</div>)}
            </div>
            <textarea
              ref={textareaRef}
              value={sql}
              onChange={(e) => setSql(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) runQuery(); }}
              className="flex-1 bg-transparent text-emerald-300 font-mono text-[13px] px-4 py-4 outline-none resize-none leading-5 min-h-[120px] max-h-[240px]"
              spellCheck={false}
            />
          </div>
        </div>

        {/* ── Bottom panel ────────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Tab bar */}
          <div className="flex items-center gap-0 border-b border-white/5 bg-slate-800/30 shrink-0">
            {[
              { key: "output", label: "Output" },
              { key: "upload", label: "Upload Table" },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setBottomTab(key)}
                className={`px-4 py-2 text-xs font-medium border-b-2 transition-colors ${
                  bottomTab === key
                    ? "border-emerald-400 text-emerald-300"
                    : "border-transparent text-slate-500 hover:text-slate-300"
                }`}
              >
                {label}
                {key === "upload" && uploadedNames.length > 0 && (
                  <span className="ml-1.5 px-1.5 py-0.5 bg-indigo-500/20 text-indigo-400 text-[9px] rounded-full font-bold">{uploadedNames.length}</span>
                )}
              </button>
            ))}
            {/* Right: status info */}
            <div className="ml-auto px-4 text-[10px] text-slate-600 font-mono">
              {message && !error && <span className="text-emerald-500">{message}</span>}
              {error && <span className="text-rose-400 truncate max-w-[300px] block">{error}</span>}
            </div>
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-auto">
            {bottomTab === "output" && (
              <>
                {!results && !error && !message && (
                  <div className="flex items-center justify-center h-full text-slate-600 text-sm font-mono">
                    Run a query to see results
                  </div>
                )}
                {error && (
                  <div className="flex items-start gap-2 px-4 py-4 text-sm text-rose-400">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <pre className="font-mono text-xs whitespace-pre-wrap">{error}</pre>
                  </div>
                )}
                {results !== null && results.length === 0 && !error && (
                  <div className="flex items-center justify-center h-full text-slate-500 text-sm font-mono">No rows matched.</div>
                )}
                {results !== null && results.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between px-4 py-2 border-b border-white/5 bg-slate-800/20 sticky top-0 z-10">
                      <div className="flex items-center gap-2">
                        <Badge className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px]">{results.length} rows</Badge>
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => exportCSV(results)} className="gap-1.5 h-6 px-2 text-[10px] text-slate-400 hover:text-white">
                        <Download className="w-3 h-3" /> Export CSV
                      </Button>
                    </div>
                    <table className="w-full text-xs">
                      <thead className="sticky top-10 z-10">
                        <tr className="bg-slate-800">
                          <th className="text-left px-3 py-2 text-slate-500 font-mono font-semibold border-b border-white/5 w-10">#</th>
                          {columns.map((c) => (
                            <th key={c} className="text-left px-4 py-2 text-slate-400 font-mono font-semibold border-b border-white/5 whitespace-nowrap">{c}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {results.map((row, i) => (
                          <tr key={row.id || i} className={`border-b border-white/3 hover:bg-white/3 transition-colors ${i % 2 === 0 ? "" : "bg-white/[0.02]"}`}>
                            <td className="px-3 py-2 text-slate-600 font-mono">{i + 1}</td>
                            {columns.map((c) => {
                              const val = row[c];
                              const display = Array.isArray(val) ? `[${val.length}]` :
                                typeof val === "object" && val !== null ? JSON.stringify(val).slice(0, 60) :
                                String(val ?? "");
                              return (
                                <td key={c} className="px-4 py-2 text-slate-300 whitespace-nowrap max-w-[200px] overflow-hidden text-ellipsis font-mono">
                                  {display || <span className="text-slate-600">NULL</span>}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}

            {bottomTab === "upload" && (
              <div className="p-4">
                <UploadPanel uploadedTables={uploadedTables} onTablesChange={setUploadedTables} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}