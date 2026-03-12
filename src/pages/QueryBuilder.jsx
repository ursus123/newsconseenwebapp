import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  PlayCircle, Download, ChevronDown, ChevronUp, Info,
  Database, Table2, Upload, CheckCircle2, AlertCircle,
} from "lucide-react";
import UploadPanel from "../components/querybuilder/UploadPanel";
import { UploadedDataStore } from "../components/querybuilder/UploadedDataStore";

// ── Master table → SDK entity map ─────────────────────────────────────────────
const MASTER_TABLES = {
  enterprises:   { entity: "Enterprise",   label: "Enterprises",   readOnly: false },
  people:        { entity: "Person",        label: "People",        readOnly: false },
  products:      { entity: "Product",       label: "Products",      readOnly: false },
  services:      { entity: "Service",       label: "Services",      readOnly: false },
  addresses:     { entity: "Address",       label: "Addresses",     readOnly: false },
  relationships: { entity: "Relationship",  label: "Relationships", readOnly: false },
  tasks:         { entity: "Task",          label: "Tasks",         readOnly: false },
  transactions:  { entity: "Transaction",   label: "Transactions",  readOnly: false },
};

const PROTECTED_TABLES = new Set(["enterprises", "people", "products", "services", "addresses"]);

const MASTER_SCHEMA = [
  { t: "enterprises",   fields: "enterprise_name, status, enterprise_type, city, country" },
  { t: "people",        fields: "first_name, last_name, person_type, status, primary_role" },
  { t: "products",      fields: "name, sku, status, stock_quantity, unit_price, category" },
  { t: "services",      fields: "name, status, category, price, pricing_model" },
  { t: "addresses",     fields: "label, city, country, status" },
  { t: "relationships", fields: "relationship_type, person_name, enterprise_name, status" },
  { t: "tasks",         fields: "title, task_type, status, priority, scheduled_date" },
  { t: "transactions",  fields: "transaction_type, status, date, amount, payment_status" },
];

const SAMPLES = [
  { label: "Active enterprises",    query: "SELECT * FROM enterprises WHERE status = 'active'" },
  { label: "Active people",         query: "SELECT * FROM people WHERE status = 'active'" },
  { label: "Low-stock products",    query: "SELECT * FROM products WHERE stock_quantity < min_stock_level" },
  { label: "Open tasks",            query: "SELECT * FROM tasks WHERE status = 'open'" },
  { label: "Posted transactions",   query: "SELECT * FROM transactions WHERE status = 'posted'" },
  { label: "INSERT into master",    query: "INSERT INTO enterprises (enterprise_name, status) VALUES ('New Co', 'active')" },
  { label: "UPDATE master",         query: "UPDATE tasks SET status = 'completed' WHERE id = 'REPLACE_WITH_ID'" },
  { label: "DELETE uploaded row",   query: "DELETE FROM my_uploaded_table WHERE row_index = 0" },
  { label: "INSERT uploaded → master", query: "INSERT INTO people SELECT first_name, last_name, person_type FROM my_uploaded_table" },
];

// ── SQL Parser / Executor ─────────────────────────────────────────────────────
async function executeSQL(sql, uploadedTables) {
  const s = sql.trim().replace(/\s+/g, " ");
  const upper = s.toUpperCase();

  // ── SELECT ────────────────────────────────────────────────────────────────
  if (upper.startsWith("SELECT")) {
    const fromMatch = s.match(/FROM\s+(\w+)/i);
    if (!fromMatch) throw new Error("Missing FROM clause.");
    const tableName = fromMatch[1].toLowerCase();

    let rows;
    if (MASTER_TABLES[tableName]) {
      const entity = base44.entities[MASTER_TABLES[tableName].entity];
      rows = await entity.list("-created_date", 2000);
    } else if (uploadedTables[tableName]) {
      rows = [...uploadedTables[tableName].rows];
    } else {
      throw new Error(`Unknown table "${tableName}". Master tables: ${Object.keys(MASTER_TABLES).join(", ")}. Uploaded: ${Object.keys(uploadedTables).join(", ") || "none"}`);
    }

    // SELECT columns
    const colsMatch = s.match(/SELECT\s+(.+?)\s+FROM/i);
    const colStr = colsMatch ? colsMatch[1].trim() : "*";
    if (colStr !== "*") {
      const cols = colStr.split(",").map((c) => c.trim());
      rows = rows.map((r) => {
        const obj = {};
        cols.forEach((c) => { obj[c] = r[c]; });
        return obj;
      });
    }

    // WHERE
    rows = applyWhere(rows, s);
    return { type: "select", rows, message: `${rows.length} row(s) returned.` };
  }

  // ── INSERT INTO … SELECT (copy uploaded → master) ─────────────────────────
  if (upper.startsWith("INSERT") && upper.includes("SELECT")) {
    const m = s.match(/INSERT\s+INTO\s+(\w+)\s+SELECT\s+(.+?)\s+FROM\s+(\w+)(?:\s+WHERE\s+(.+))?$/i);
    if (!m) throw new Error("Invalid INSERT...SELECT syntax. Example: INSERT INTO people SELECT first_name, last_name FROM my_table");
    const [, destTable, colStr, srcTable, whereClause] = m;
    const dest = destTable.toLowerCase();
    const src = srcTable.toLowerCase();

    if (!MASTER_TABLES[dest]) throw new Error(`INSERT destination must be a master table. Got: "${dest}"`);
    if (!uploadedTables[src]) throw new Error(`Source table "${src}" not found in uploaded tables.`);

    const cols = colStr.trim() === "*"
      ? uploadedTables[src].columns
      : colStr.split(",").map((c) => c.trim());

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

  // ── INSERT INTO … VALUES ───────────────────────────────────────────────────
  if (upper.startsWith("INSERT")) {
    const m = s.match(/INSERT\s+INTO\s+(\w+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i);
    if (!m) throw new Error("Invalid INSERT syntax. Example: INSERT INTO enterprises (enterprise_name, status) VALUES ('Acme', 'active')");
    const [, tableName, colsStr, valsStr] = m;
    const dest = tableName.toLowerCase();
    if (!MASTER_TABLES[dest] && !uploadedTables[dest]) throw new Error(`Unknown table "${dest}".`);

    const cols = colsStr.split(",").map((c) => c.trim());
    const vals = valsStr.split(",").map((v) => v.trim().replace(/^['"]|['"]$/g, ""));
    const payload = {};
    cols.forEach((c, i) => { payload[c] = vals[i] ?? ""; });

    if (MASTER_TABLES[dest]) {
      const entity = base44.entities[MASTER_TABLES[dest].entity];
      const created = await entity.create(payload);
      return { type: "mutation", rows: [created], message: `✓ Inserted 1 row into ${dest}.` };
    } else {
      UploadedDataStore.addRow(dest, payload);
      return { type: "mutation", rows: [], message: `✓ Inserted 1 row into uploaded table "${dest}".` };
    }
  }

  // ── UPDATE ─────────────────────────────────────────────────────────────────
  if (upper.startsWith("UPDATE")) {
    const m = s.match(/UPDATE\s+(\w+)\s+SET\s+(.+?)\s+WHERE\s+(.+)$/i);
    if (!m) throw new Error("Invalid UPDATE syntax. Example: UPDATE tasks SET status = 'completed' WHERE id = 'abc'");
    const [, tableName, setStr, whereStr] = m;
    const tbl = tableName.toLowerCase();

    const updates = {};
    setStr.split(",").forEach((part) => {
      const eq = part.match(/^\s*(\w+)\s*=\s*'?([^']*)'?\s*$/);
      if (eq) updates[eq[1].trim()] = eq[2].trim();
    });

    if (MASTER_TABLES[tbl]) {
      // Fetch matching rows then update each
      const entity = base44.entities[MASTER_TABLES[tbl].entity];
      const allRows = await entity.list("-created_date", 2000);
      const matched = applyWhere(allRows, `SELECT * FROM x WHERE ${whereStr}`);
      if (!matched.length) return { type: "mutation", rows: [], message: "No rows matched the WHERE clause." };
      for (const row of matched) await entity.update(row.id, updates);
      return { type: "mutation", rows: [], message: `✓ Updated ${matched.length} row(s) in ${tbl}.` };
    } else if (uploadedTables[tbl]) {
      const rows = uploadedTables[tbl].rows;
      const matched = applyWhere(rows.map((r, i) => ({ ...r, _idx: i })), `SELECT * FROM x WHERE ${whereStr}`);
      matched.forEach((r) => UploadedDataStore.updateRow(tbl, r._idx, updates));
      return { type: "mutation", rows: [], message: `✓ Updated ${matched.length} row(s) in uploaded table "${tbl}".` };
    } else {
      throw new Error(`Unknown table "${tbl}".`);
    }
  }

  // ── DELETE ─────────────────────────────────────────────────────────────────
  if (upper.startsWith("DELETE")) {
    const m = s.match(/DELETE\s+FROM\s+(\w+)(?:\s+WHERE\s+(.+))?$/i);
    if (!m) throw new Error("Invalid DELETE syntax.");
    const [, tableName, whereStr] = m;
    const tbl = tableName.toLowerCase();

    if (PROTECTED_TABLES.has(tbl)) throw new Error(`❌ DELETE is not allowed on master table "${tbl}" to protect data integrity. Use the app pages to archive records instead.`);

    if (MASTER_TABLES[tbl]) {
      const entity = base44.entities[MASTER_TABLES[tbl].entity];
      const allRows = await entity.list("-created_date", 2000);
      const matched = whereStr ? applyWhere(allRows, `SELECT * FROM x WHERE ${whereStr}`) : allRows;
      if (!matched.length) return { type: "mutation", rows: [], message: "No rows matched." };
      for (const row of matched) await entity.delete(row.id);
      return { type: "mutation", rows: [], message: `✓ Deleted ${matched.length} row(s) from ${tbl}.` };
    } else if (uploadedTables[tbl]) {
      if (whereStr) {
        const rows = uploadedTables[tbl].rows;
        const matched = applyWhere(rows.map((r, i) => ({ ...r, _idx: i })), `SELECT * FROM x WHERE ${whereStr}`);
        // delete in reverse to keep indices valid
        matched.reverse().forEach((r) => UploadedDataStore.deleteRow(tbl, r._idx));
        return { type: "mutation", rows: [], message: `✓ Deleted ${matched.length} row(s) from "${tbl}".` };
      } else {
        const count = uploadedTables[tbl].rows.length;
        UploadedDataStore.set(tbl, { ...uploadedTables[tbl], rows: [] });
        return { type: "mutation", rows: [], message: `✓ Deleted all ${count} row(s) from "${tbl}".` };
      }
    } else {
      throw new Error(`Unknown table "${tbl}".`);
    }
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
      const numVal = parseFloat(val);
      const rowNum = parseFloat(rowVal);
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

// ── Component ─────────────────────────────────────────────────────────────────
export default function QueryBuilder() {
  const [sql, setSql] = useState("SELECT * FROM enterprises WHERE status = 'active'");
  const [results, setResults] = useState(null);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showSchema, setShowSchema] = useState(false);
  const [uploadedTables, setUploadedTables] = useState(() => UploadedDataStore.getAll());

  // Keep local state in sync with the store (e.g. after row mutations)
  useEffect(() => {
    return UploadedDataStore.subscribe((all) => setUploadedTables({ ...all }));
  }, []);

  const runQuery = async () => {
    setLoading(true);
    setError(null);
    setResults(null);
    setMessage(null);
    // Always get the freshest snapshot right before executing
    const currentUploaded = UploadedDataStore.getAll();
    try {
      const result = await executeSQL(sql, currentUploaded);
      if (result.type === "select") setResults(result.rows);
      setMessage(result.message);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const columns = results?.length > 0
    ? Object.keys(results[0]).filter((k) => !["attachment_urls", "image_url", "photo_url", "attachment_url"].includes(k))
    : [];

  return (
    <div className="flex gap-6 min-h-0">
      {/* ── Left sidebar ──────────────────────────────────────────────────── */}
      <aside className="w-64 shrink-0 space-y-5">
        {/* Master tables */}
        <div>
          <div className="flex items-center gap-2 mb-2.5">
            <Database className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Master Tables</span>
          </div>
          <div className="space-y-1">
            {Object.entries(MASTER_TABLES).map(([name, conf]) => (
              <button
                key={name}
                onClick={() => setSql(`SELECT * FROM ${name}`)}
                className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-slate-100 transition-colors group text-left"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Table2 className="w-3 h-3 text-slate-400 shrink-0" />
                  <span className="font-mono text-xs text-slate-700 truncate">{name}</span>
                </div>
                {PROTECTED_TABLES.has(name) && (
                  <span className="text-[9px] text-slate-300 font-medium">no DELETE</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Uploaded tables */}
        <div>
          <div className="flex items-center gap-2 mb-2.5">
            <Upload className="w-3.5 h-3.5 text-indigo-400" />
            <span className="text-xs font-bold text-indigo-500 uppercase tracking-wider">Uploaded Tables</span>
          </div>
          <UploadPanel uploadedTables={uploadedTables} onTablesChange={setUploadedTables} />
          {Object.keys(uploadedTables).length > 0 && (
            <div className="mt-2 space-y-1">
              {Object.entries(uploadedTables).map(([name, t]) => (
                <button
                  key={name}
                  onClick={() => setSql(`SELECT * FROM ${name}`)}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-indigo-50 transition-colors text-left"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Table2 className="w-3 h-3 text-indigo-400 shrink-0" />
                    <span className="font-mono text-xs text-indigo-700 truncate">{name}</span>
                  </div>
                  <Badge className="bg-indigo-50 text-indigo-500 text-[9px] px-1.5">{t.rows.length}</Badge>
                </button>
              ))}
            </div>
          )}
        </div>
      </aside>

      {/* ── Main area ─────────────────────────────────────────────────────── */}
      <div className="flex-1 space-y-5 min-w-0">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Query Builder</h1>
          <p className="text-sm text-slate-400 mt-1">Run SQL queries — SELECT, INSERT, UPDATE, DELETE across master &amp; uploaded tables</p>
        </div>

        {/* Sample queries */}
        <div className="flex flex-wrap gap-2">
          {SAMPLES.map((s) => (
            <button
              key={s.label}
              onClick={() => setSql(s.query)}
              className="text-xs px-3 py-1.5 rounded-full border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-all"
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* SQL Editor */}
        <div className="bg-slate-950 rounded-2xl overflow-hidden shadow-xl">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/10">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-rose-500/80" />
              <span className="w-3 h-3 rounded-full bg-amber-500/80" />
              <span className="w-3 h-3 rounded-full bg-emerald-500/80" />
              <span className="ml-3 text-xs text-slate-500 font-mono">query.sql</span>
            </div>
            <Button
              size="sm"
              onClick={runQuery}
              disabled={loading}
              className="bg-emerald-500 hover:bg-emerald-600 text-white gap-2 rounded-lg h-7 px-3 text-xs"
            >
              <PlayCircle className="w-3.5 h-3.5" />
              {loading ? "Running…" : "Run Query"}
            </Button>
          </div>
          <textarea
            value={sql}
            onChange={(e) => setSql(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) runQuery(); }}
            className="w-full bg-transparent text-emerald-300 font-mono text-sm p-4 outline-none resize-none min-h-[120px] placeholder-slate-600"
            spellCheck={false}
          />
          <div className="px-4 py-2 border-t border-white/5 flex items-center gap-2">
            <Info className="w-3 h-3 text-slate-600" />
            <span className="text-[11px] text-slate-600 font-mono">
              Ctrl+Enter to run &nbsp;·&nbsp; SELECT, INSERT, UPDATE, DELETE &nbsp;·&nbsp; DELETE blocked on master data tables
            </span>
          </div>
        </div>

        {/* Schema reference */}
        <button
          onClick={() => setShowSchema((v) => !v)}
          className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 transition-colors"
        >
          {showSchema ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          {showSchema ? "Hide" : "Show"} master table fields
        </button>

        {showSchema && (
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
            {MASTER_SCHEMA.map(({ t, fields }) => (
              <div key={t} className="bg-white border border-slate-200 rounded-xl p-3">
                <p className="font-mono text-xs font-bold text-slate-700 mb-1">{t}</p>
                <p className="text-[10px] text-slate-400 leading-relaxed">{fields}</p>
              </div>
            ))}
          </div>
        )}

        {/* Success message */}
        {message && !error && (
          <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-sm text-emerald-700">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            {message}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="flex items-start gap-2 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 text-sm text-rose-700">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            {error}
          </div>
        )}

        {/* Results */}
        {results !== null && results.length >= 0 && (
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-slate-700">Results</span>
                <Badge className="bg-slate-100 text-slate-600">{results.length} rows</Badge>
              </div>
              {results.length > 0 && (
                <Button size="sm" variant="outline" onClick={() => exportCSV(results)} className="gap-1.5 h-7 px-3 text-xs">
                  <Download className="w-3.5 h-3.5" /> Export CSV
                </Button>
              )}
            </div>
            {results.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-sm">No rows matched your query.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      {columns.map((c) => (
                        <th key={c} className="text-left px-4 py-2.5 text-slate-500 font-semibold whitespace-nowrap font-mono">{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((row, i) => (
                      <tr key={row.id || i} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                        {columns.map((c) => {
                          const val = row[c];
                          const display = Array.isArray(val)
                            ? `[${val.length} items]`
                            : typeof val === "object" && val !== null
                            ? JSON.stringify(val).slice(0, 60)
                            : String(val ?? "");
                          return (
                            <td key={c} className="px-4 py-2.5 text-slate-700 whitespace-nowrap max-w-[200px] overflow-hidden text-ellipsis font-mono">
                              {display || <span className="text-slate-300">—</span>}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}