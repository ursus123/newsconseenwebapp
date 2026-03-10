import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PlayCircle, Download, ChevronDown, ChevronUp, Info } from "lucide-react";

// ── Table → SDK entity map ────────────────────────────────────────────────────
const TABLES = {
  enterprises:   { entity: "Enterprise",   label: "Enterprises" },
  people:        { entity: "Person",        label: "People" },
  products:      { entity: "Product",       label: "Products" },
  services:      { entity: "Service",       label: "Services" },
  addresses:     { entity: "Address",       label: "Addresses" },
  relationships: { entity: "Relationship",  label: "Relationships" },
  tasks:         { entity: "Task",          label: "Tasks" },
  transactions:  { entity: "Transaction",   label: "Transactions" },
};

const SAMPLES = [
  { label: "Active enterprises", query: "SELECT * FROM enterprises WHERE status = 'active'" },
  { label: "Active people", query: "SELECT * FROM people WHERE status = 'active'" },
  { label: "Low-stock products", query: "SELECT * FROM products WHERE stock_quantity < min_stock_level" },
  { label: "Open tasks", query: "SELECT * FROM tasks WHERE status = 'open'" },
  { label: "Posted transactions", query: "SELECT * FROM transactions WHERE status = 'posted'" },
  { label: "Person → Enterprise relationships", query: "SELECT * FROM relationships WHERE relationship_type = 'person_enterprise'" },
];

// ── Minimal SQL→JS interpreter (SELECT * FROM table WHERE field = 'val' [AND ...]) ──
function parseAndRun(sql, allData) {
  const s = sql.trim().replace(/\s+/g, " ");

  // Extract table name
  const fromMatch = s.match(/FROM\s+(\w+)/i);
  if (!fromMatch) throw new Error("Could not find FROM clause.");
  const tableName = fromMatch[1].toLowerCase();
  const tableConf = TABLES[tableName];
  if (!tableConf) throw new Error(`Unknown table "${tableName}". Available: ${Object.keys(TABLES).join(", ")}`);

  const rows = allData[tableName] || [];

  // Extract WHERE clause
  const whereMatch = s.match(/WHERE\s+(.+)$/i);
  if (!whereMatch) return rows;

  const whereStr = whereMatch[1];
  // Split by AND
  const conditions = whereStr.split(/\s+AND\s+/i);

  return rows.filter((row) =>
    conditions.every((cond) => {
      // field = 'value' or field = value or field < value or field > value
      const m = cond.trim().match(/^(\w+)\s*(=|!=|<>|<=|>=|<|>)\s*'?([^']*)'?$/);
      if (!m) return true;
      const [, field, op, val] = m;
      const rowVal = row[field];
      const numVal = parseFloat(val);
      const rowNum = parseFloat(rowVal);
      switch (op) {
        case "=":  return String(rowVal ?? "").toLowerCase() === val.toLowerCase();
        case "!=": case "<>": return String(rowVal ?? "").toLowerCase() !== val.toLowerCase();
        case "<":  return !isNaN(rowNum) && rowNum < numVal;
        case ">":  return !isNaN(rowNum) && rowNum > numVal;
        case "<=": return !isNaN(rowNum) && rowNum <= numVal;
        case ">=": return !isNaN(rowNum) && rowNum >= numVal;
        default:   return true;
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
  const a = document.createElement("a");
  a.href = url; a.download = "query_results.csv"; a.click();
  URL.revokeObjectURL(url);
}

export default function QueryBuilder() {
  const [sql, setSql] = useState("SELECT * FROM enterprises WHERE status = 'active'");
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showSchema, setShowSchema] = useState(false);

  const runQuery = async () => {
    setLoading(true);
    setError(null);
    setResults(null);

    // Detect table from query
    const fromMatch = sql.trim().replace(/\s+/g, " ").match(/FROM\s+(\w+)/i);
    if (!fromMatch) { setError('Could not find FROM clause.'); setLoading(false); return; }
    const tableName = fromMatch[1].toLowerCase();
    const tableConf = TABLES[tableName];
    if (!tableConf) { setError(`Unknown table "${tableName}". Available: ${Object.keys(TABLES).join(", ")}`); setLoading(false); return; }

    // Fetch only the needed table
    const entityRef = base44.entities[tableConf.entity];
    const rows = await entityRef.list("-created_date", 1000);
    const allData = { [tableName]: rows };

    const filtered = parseAndRun(sql, allData);
    setResults(filtered);
    setLoading(false);
  };

  const columns = results?.length > 0
    ? Object.keys(results[0]).filter((k) => !["attachment_urls", "image_url", "photo_url", "attachment_url"].includes(k))
    : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Query Builder</h1>
        <p className="text-sm text-slate-400 mt-1">Run SQL-style queries against your data tables</p>
      </div>

      {/* Sample Queries */}
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
            {loading ? "Running..." : "Run Query"}
          </Button>
        </div>
        <textarea
          value={sql}
          onChange={(e) => setSql(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) runQuery(); }}
          className="w-full bg-transparent text-emerald-300 font-mono text-sm p-4 outline-none resize-none min-h-[120px] placeholder-slate-600"
          placeholder="SELECT * FROM enterprises WHERE status = 'active'"
          spellCheck={false}
        />
        <div className="px-4 py-2 border-t border-white/5 flex items-center gap-2">
          <Info className="w-3 h-3 text-slate-600" />
          <span className="text-[11px] text-slate-600 font-mono">
            Tables: {Object.keys(TABLES).join(", ")} &nbsp;·&nbsp; Ctrl+Enter to run
          </span>
        </div>
      </div>

      {/* Schema reference toggle */}
      <button
        onClick={() => setShowSchema((v) => !v)}
        className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 transition-colors"
      >
        {showSchema ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        {showSchema ? "Hide" : "Show"} available tables &amp; common fields
      </button>

      {showSchema && (
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
          {[
            { t: "enterprises",   fields: "enterprise_name, status, enterprise_type, city, country" },
            { t: "people",        fields: "first_name, last_name, person_type, status, primary_role" },
            { t: "products",      fields: "name, sku, status, stock_quantity, unit_price, category" },
            { t: "services",      fields: "name, status, category, price, pricing_model" },
            { t: "addresses",     fields: "label, city, country, status" },
            { t: "relationships", fields: "relationship_type, person_name, enterprise_name, item_name, status" },
            { t: "tasks",         fields: "title, task_type, status, priority, scheduled_date" },
            { t: "transactions",  fields: "transaction_type, status, date, amount, payment_status" },
          ].map(({ t, fields }) => (
            <div key={t} className="bg-white border border-slate-200 rounded-xl p-3">
              <p className="font-mono text-xs font-bold text-slate-700 mb-1">{t}</p>
              <p className="text-[10px] text-slate-400 leading-relaxed">{fields}</p>
            </div>
          ))}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      {/* Results */}
      {results !== null && (
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
                      <th key={c} className="text-left px-4 py-2.5 text-slate-500 font-semibold whitespace-nowrap font-mono">
                        {c}
                      </th>
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
  );
}