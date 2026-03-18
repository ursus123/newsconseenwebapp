import React, { useState } from "react";
import { Plus, Trash2, ChevronDown } from "lucide-react";
import { MASTER_TABLES } from "./sqlEngine";

const ALL_TABLES = Object.keys(MASTER_TABLES);
const OPERATORS = ["=", "!=", "<", ">", "<=", ">=", "LIKE", "IS NULL", "IS NOT NULL"];
const ORDER_DIRS = ["ASC", "DESC"];

export default function VisualQueryBuilder({ onGenerate }) {
  const [table, setTable] = useState("");
  const [fields, setFields] = useState(["*"]);
  const [filters, setFilters] = useState([{ field: "", op: "=", value: "" }]);
  const [joins, setJoins] = useState([]);
  const [groupBy, setGroupBy] = useState("");
  const [orderBy, setOrderBy] = useState("");
  const [orderDir, setOrderDir] = useState("ASC");
  const [limit, setLimit] = useState("");

  const addFilter = () => setFilters((f) => [...f, { field: "", op: "=", value: "" }]);
  const removeFilter = (i) => setFilters((f) => f.filter((_, idx) => idx !== i));
  const updateFilter = (i, key, val) => setFilters((f) => f.map((item, idx) => idx === i ? { ...item, [key]: val } : item));

  const addJoin = () => setJoins((j) => [...j, { table: "", on: "" }]);
  const removeJoin = (i) => setJoins((j) => j.filter((_, idx) => idx !== i));
  const updateJoin = (i, key, val) => setJoins((j) => j.map((item, idx) => idx === i ? { ...item, [key]: val } : item));

  const generate = () => {
    if (!table) return;
    const selectFields = fields.filter(Boolean).join(", ") || "*";
    let sql = `SELECT ${selectFields} FROM ${table}`;
    joins.forEach(({ table: jt, on }) => { if (jt && on) sql += ` JOIN ${jt} ON ${on}`; });
    const activeFilters = filters.filter((f) => f.field);
    if (activeFilters.length) {
      const whereParts = activeFilters.map(({ field, op, value }) => {
        if (op === "IS NULL" || op === "IS NOT NULL") return `${field} ${op}`;
        return `${field} ${op} '${value}'`;
      });
      sql += ` WHERE ${whereParts.join(" AND ")}`;
    }
    if (groupBy) sql += ` GROUP BY ${groupBy}`;
    if (orderBy) sql += ` ORDER BY ${orderBy} ${orderDir}`;
    if (limit) sql += ` LIMIT ${limit}`;
    onGenerate(sql);
  };

  const inputCls = "bg-slate-800 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-emerald-500/50 w-full";
  const selectCls = `${inputCls} cursor-pointer`;

  return (
    <div className="space-y-3 p-3">
      {/* Source */}
      <div>
        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Data Source</label>
        <select value={table} onChange={(e) => setTable(e.target.value)} className={selectCls}>
          <option value="">— select table —</option>
          {ALL_TABLES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      {/* Fields */}
      <div>
        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Fields</label>
        <input
          value={fields.join(", ")}
          onChange={(e) => setFields(e.target.value.split(",").map((f) => f.trim()))}
          placeholder="* or field1, field2, ..."
          className={inputCls}
        />
      </div>

      {/* Filters */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Filters</label>
          <button onClick={addFilter} className="flex items-center gap-1 text-[9px] text-emerald-500 hover:text-emerald-400 transition-colors">
            <Plus className="w-2.5 h-2.5" /> Add
          </button>
        </div>
        <div className="space-y-1.5">
          {filters.map((f, i) => (
            <div key={i} className="flex items-center gap-1">
              <input value={f.field} onChange={(e) => updateFilter(i, "field", e.target.value)} placeholder="field" className={`${inputCls} w-24`} />
              <select value={f.op} onChange={(e) => updateFilter(i, "op", e.target.value)} className={`${selectCls} w-24`}>
                {OPERATORS.map((op) => <option key={op} value={op}>{op}</option>)}
              </select>
              <input value={f.value} onChange={(e) => updateFilter(i, "value", e.target.value)} placeholder="value" className={`${inputCls} flex-1`} />
              <button onClick={() => removeFilter(i)} className="p-1 text-slate-600 hover:text-rose-400 transition-colors shrink-0">
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Joins */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Joins</label>
          <button onClick={addJoin} className="flex items-center gap-1 text-[9px] text-indigo-400 hover:text-indigo-300 transition-colors">
            <Plus className="w-2.5 h-2.5" /> Add Join
          </button>
        </div>
        <div className="space-y-1.5">
          {joins.map((j, i) => (
            <div key={i} className="flex items-center gap-1">
              <select value={j.table} onChange={(e) => updateJoin(i, "table", e.target.value)} className={`${selectCls} w-28`}>
                <option value="">table</option>
                {ALL_TABLES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <span className="text-[9px] text-slate-600">ON</span>
              <input value={j.on} onChange={(e) => updateJoin(i, "on", e.target.value)} placeholder="t1.col = t2.col" className={`${inputCls} flex-1`} />
              <button onClick={() => removeJoin(i)} className="p-1 text-slate-600 hover:text-rose-400 transition-colors shrink-0">
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Group / Order / Limit */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Group By</label>
          <input value={groupBy} onChange={(e) => setGroupBy(e.target.value)} placeholder="field" className={inputCls} />
        </div>
        <div>
          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Order By</label>
          <div className="flex gap-1">
            <input value={orderBy} onChange={(e) => setOrderBy(e.target.value)} placeholder="field" className={inputCls} />
            <select value={orderDir} onChange={(e) => setOrderDir(e.target.value)} className={`${selectCls} w-16`}>
              {ORDER_DIRS.map((d) => <option key={d}>{d}</option>)}
            </select>
          </div>
        </div>
      </div>
      <div>
        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Limit</label>
        <input value={limit} onChange={(e) => setLimit(e.target.value)} placeholder="100" type="number" className={`${inputCls} w-24`} />
      </div>

      <button
        onClick={generate}
        disabled={!table}
        className="w-full py-2 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 text-xs font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Generate SQL →
      </button>
    </div>
  );
}