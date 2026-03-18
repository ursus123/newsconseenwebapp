import React, { useState, useMemo } from "react";
import { X, CheckCircle, AlertCircle, ChevronDown, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const DATA_TYPES = ["TEXT", "INTEGER", "FLOAT", "DATE", "BOOLEAN"];

function inferType(values) {
  const sample = values.filter((v) => v !== null && v !== undefined && String(v).trim() !== "").slice(0, 50);
  if (!sample.length) return "TEXT";
  if (sample.every((v) => /^\d{4}-\d{2}-\d{2}/.test(String(v)))) return "DATE";
  if (sample.every((v) => /^-?\d+$/.test(String(v).trim()))) return "INTEGER";
  if (sample.every((v) => /^-?\d*\.?\d+$/.test(String(v).trim()))) return "FLOAT";
  if (sample.every((v) => /^(true|false|yes|no|1|0)$/i.test(String(v).trim()))) return "BOOLEAN";
  return "TEXT";
}

function castValue(val, type) {
  if (val === null || val === undefined || String(val).trim() === "") return null;
  const s = String(val).trim();
  if (type === "INTEGER") return parseInt(s, 10);
  if (type === "FLOAT") return parseFloat(s);
  if (type === "BOOLEAN") return /^(true|yes|1)$/i.test(s);
  return s;
}

export default function FilePreviewModal({ fileData, onConfirm, onCancel }) {
  const isMultiSheet = !!fileData.sheets;

  const [selectedSheet, setSelectedSheet] = useState(0);
  const [excludedCols, setExcludedCols] = useState(new Set());
  const [dropMissing, setDropMissing] = useState(false);
  // { colName: type }
  const [colTypes, setColTypes] = useState({});
  // { colName: newName }
  const [colRenames, setColRenames] = useState({});
  const [editingRename, setEditingRename] = useState(null);
  const [renameValue, setRenameValue] = useState("");

  const rawRows = isMultiSheet ? fileData.sheets[selectedSheet].rows : fileData.rows;

  const allCols = useMemo(() => {
    if (!rawRows?.length) return [];
    return Object.keys(rawRows[0]);
  }, [rawRows]);

  // Init types when sheet changes
  useMemo(() => {
    const types = {};
    allCols.forEach((col) => {
      if (!colTypes[col]) {
        const vals = rawRows.map((r) => r[col]);
        types[col] = inferType(vals);
      } else {
        types[col] = colTypes[col];
      }
    });
    setColTypes(types);
    setExcludedCols(new Set());
    setColRenames({});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSheet, allCols.join(",")]);

  const includedCols = allCols.filter((c) => !excludedCols.has(c));

  const previewRows = useMemo(() => {
    if (!dropMissing) return rawRows;
    return rawRows.filter((row) =>
      includedCols.every((c) => {
        const v = row[c];
        return v !== null && v !== undefined && String(v).trim() !== "";
      })
    );
  }, [rawRows, dropMissing, includedCols]);

  const missingCount = rawRows.length - previewRows.length;
  const displayRows = previewRows.slice(0, 100);

  const toggleCol = (col) => {
    setExcludedCols((prev) => {
      const next = new Set(prev);
      if (next.has(col)) next.delete(col);
      else next.add(col);
      return next;
    });
  };

  const startRename = (col) => {
    setEditingRename(col);
    setRenameValue(colRenames[col] || col);
  };

  const commitRename = () => {
    if (editingRename && renameValue.trim()) {
      const safe = renameValue.trim().replace(/[^a-zA-Z0-9_]/g, "_");
      setColRenames((prev) => ({ ...prev, [editingRename]: safe }));
    }
    setEditingRename(null);
  };

  const handleConfirm = () => {
    const finalCols = includedCols.map((c) => colRenames[c] || c);
    const finalRows = previewRows.map((row) => {
      const obj = {};
      includedCols.forEach((c) => {
        const newName = colRenames[c] || c;
        obj[newName] = castValue(row[c], colTypes[c] || "TEXT");
      });
      return obj;
    });
    const schema = includedCols.map((c) => ({
      name: colRenames[c] || c,
      type: colTypes[c] || "TEXT",
    }));
    onConfirm({ rows: finalRows, columns: finalCols, schema });
  };

  const TYPE_COLORS = {
    TEXT: "bg-slate-100 text-slate-600 border-slate-200",
    INTEGER: "bg-blue-50 text-blue-600 border-blue-200",
    FLOAT: "bg-purple-50 text-purple-600 border-purple-200",
    DATE: "bg-amber-50 text-amber-600 border-amber-200",
    BOOLEAN: "bg-green-50 text-green-600 border-green-200",
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[92vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
          <div>
            <h2 className="text-base font-bold text-slate-800">Preview &amp; Configure Data</h2>
            <p className="text-xs text-slate-400 mt-0.5">Select columns, rename them, change data types, and filter rows before importing.</p>
          </div>
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Controls bar */}
        <div className="flex flex-wrap items-center gap-4 px-6 py-3 border-b border-slate-100 bg-slate-50 shrink-0">
          {isMultiSheet && (
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-slate-500">Sheet:</label>
              <div className="relative">
                <select
                  value={selectedSheet}
                  onChange={(e) => setSelectedSheet(Number(e.target.value))}
                  className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 pr-8 bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-400 appearance-none"
                >
                  {fileData.sheets.map((s, i) => (
                    <option key={i} value={i}>{s.name || `Sheet ${i + 1}`}</option>
                  ))}
                </select>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>
          )}

          <label className="flex items-center gap-2 cursor-pointer">
            <div
              onClick={() => setDropMissing((v) => !v)}
              className={`w-9 h-5 rounded-full transition-colors relative cursor-pointer ${dropMissing ? "bg-indigo-500" : "bg-slate-200"}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${dropMissing ? "translate-x-4" : ""}`} />
            </div>
            <span className="text-xs text-slate-600 font-medium">Drop rows with missing values</span>
            {dropMissing && missingCount > 0 && (
              <Badge className="bg-rose-50 text-rose-600 border border-rose-200 text-[10px]">−{missingCount} rows</Badge>
            )}
          </label>

          <div className="ml-auto flex items-center gap-3 text-xs text-slate-500">
            <span><span className="font-semibold text-slate-700">{previewRows.length}</span> rows</span>
            <span><span className="font-semibold text-slate-700">{includedCols.length}</span> / {allCols.length} columns selected</span>
          </div>
        </div>

        {/* Column configurator */}
        <div className="px-6 py-3 border-b border-slate-100 shrink-0">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Columns — click to toggle, rename or change type</p>
          <div className="flex flex-wrap gap-2 max-h-[120px] overflow-y-auto">
            {allCols.map((col) => {
              const included = !excludedCols.has(col);
              const type = colTypes[col] || "TEXT";
              const displayName = colRenames[col] || col;
              return (
                <div
                  key={col}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-[11px] font-medium transition-all group
                    ${included ? "bg-white border-slate-200 text-slate-700 shadow-sm" : "bg-slate-100 border-slate-200 text-slate-400 opacity-50"}`}
                >
                  <input
                    type="checkbox"
                    checked={included}
                    onChange={() => toggleCol(col)}
                    className="w-3 h-3 accent-indigo-500 cursor-pointer"
                  />
                  {editingRename === col ? (
                    <input
                      autoFocus
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onBlur={commitRename}
                      onKeyDown={(e) => e.key === "Enter" && commitRename()}
                      className="font-mono text-[11px] border-b border-indigo-400 bg-transparent outline-none w-20"
                    />
                  ) : (
                    <span
                      className="font-mono cursor-pointer hover:text-indigo-600 transition-colors"
                      title="Click to rename"
                      onClick={() => included && startRename(col)}
                    >
                      {displayName}
                      {colRenames[col] && <span className="text-slate-400 ml-0.5 text-[9px]">(renamed)</span>}
                    </span>
                  )}
                  {included && (
                    <select
                      value={type}
                      onChange={(e) => setColTypes((prev) => ({ ...prev, [col]: e.target.value }))}
                      className={`text-[10px] font-bold border rounded-md px-1.5 py-0.5 cursor-pointer focus:outline-none ${TYPE_COLORS[type]}`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {DATA_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Data preview table */}
        <div className="flex-1 overflow-auto px-6 py-3">
          {previewRows.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-slate-400">
              <AlertCircle className="w-6 h-6 mb-2" />
              <p className="text-sm">No rows to preview with current settings.</p>
            </div>
          ) : (
            <>
              <table className="w-full text-xs border-collapse">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-slate-50">
                    <th className="text-left px-3 py-2 text-slate-400 font-semibold border-b border-slate-200 w-10">#</th>
                    {includedCols.map((col) => (
                      <th key={col} className="text-left px-3 py-2 text-slate-600 font-semibold border-b border-slate-200 whitespace-nowrap font-mono">
                        <div className="flex items-center gap-1.5">
                          <span>{colRenames[col] || col}</span>
                          <span className={`text-[9px] font-bold border rounded px-1 ${TYPE_COLORS[colTypes[col] || "TEXT"]}`}>
                            {colTypes[col] || "TEXT"}
                          </span>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {displayRows.map((row, i) => (
                    <tr key={i} className="border-b border-slate-50 hover:bg-slate-50/50">
                      <td className="px-3 py-2 text-slate-300 font-mono">{i + 1}</td>
                      {includedCols.map((col) => {
                        const val = row[col];
                        const isEmpty = val === null || val === undefined || String(val).trim() === "";
                        return (
                          <td
                            key={col}
                            className={`px-3 py-2 whitespace-nowrap max-w-[200px] overflow-hidden text-ellipsis font-mono ${
                              isEmpty ? "text-rose-300 bg-rose-50/50" : "text-slate-700"
                            }`}
                          >
                            {isEmpty ? <span className="italic text-rose-300">empty</span> : String(val)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              {previewRows.length > 100 && (
                <p className="text-center text-xs text-slate-400 py-3">Showing first 100 of {previewRows.length} rows</p>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-slate-100 shrink-0">
          <button onClick={onCancel} className="text-sm text-slate-400 hover:text-slate-600 transition-colors">Cancel</button>
          <Button
            onClick={handleConfirm}
            disabled={previewRows.length === 0 || includedCols.length === 0}
            className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2"
          >
            <CheckCircle className="w-4 h-4" />
            Import {previewRows.length} rows × {includedCols.length} columns
          </Button>
        </div>
      </div>
    </div>
  );
}