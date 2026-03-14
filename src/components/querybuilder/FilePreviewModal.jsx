import React, { useState, useMemo } from "react";
import { X, Trash2, CheckCircle, AlertCircle, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function FilePreviewModal({ fileData, onConfirm, onCancel }) {
  const isExcel = !!fileData.sheets;

  const [selectedSheet, setSelectedSheet] = useState(0);
  const [hiddenCols, setHiddenCols] = useState(new Set());
  const [dropMissing, setDropMissing] = useState(false);

  const rawRows = isExcel ? fileData.sheets[selectedSheet].rows : fileData.rows;

  const allCols = useMemo(() => {
    if (!rawRows.length) return [];
    return Object.keys(rawRows[0]);
  }, [rawRows]);

  const visibleCols = allCols.filter((c) => !hiddenCols.has(c));

  const previewRows = useMemo(() => {
    if (!dropMissing) return rawRows;
    return rawRows.filter((row) =>
      visibleCols.every((c) => {
        const v = row[c];
        return v !== null && v !== undefined && String(v).trim() !== "";
      })
    );
  }, [rawRows, dropMissing, visibleCols]);

  const missingCount = rawRows.length - previewRows.length;

  const toggleCol = (col) => {
    setHiddenCols((prev) => {
      const next = new Set(prev);
      if (next.has(col)) next.delete(col);
      else next.add(col);
      return next;
    });
  };

  const handleConfirm = () => {
    const finalRows = previewRows.map((row) => {
      const obj = {};
      visibleCols.forEach((c) => { obj[c] = row[c]; });
      return obj;
    });
    onConfirm({ rows: finalRows, columns: visibleCols });
  };

  const displayRows = previewRows.slice(0, 100);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
          <div>
            <h2 className="text-base font-bold text-slate-800">Preview &amp; Configure Data</h2>
            <p className="text-xs text-slate-400 mt-0.5">Review your data before importing. Deselect columns to exclude them.</p>
          </div>
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-4 px-6 py-3 border-b border-slate-100 bg-slate-50 shrink-0">
          {isExcel && fileData.sheets.length > 1 && (
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-slate-500">Sheet:</label>
              <div className="relative">
                <select
                  value={selectedSheet}
                  onChange={(e) => { setSelectedSheet(Number(e.target.value)); setHiddenCols(new Set()); }}
                  className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 pr-8 bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-400 appearance-none"
                >
                  {fileData.sheets.map((s, i) => (
                    <option key={i} value={i}>{s.name}</option>
                  ))}
                </select>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>
          )}
          {isExcel && fileData.sheets.length === 1 && (
            <Badge className="bg-indigo-50 text-indigo-600">Sheet: {fileData.sheets[0].name}</Badge>
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
              <Badge className="bg-rose-50 text-rose-600 text-[10px]">−{missingCount} rows</Badge>
            )}
          </label>

          <div className="ml-auto flex items-center gap-3 text-xs text-slate-500">
            <span><span className="font-semibold text-slate-700">{previewRows.length}</span> rows</span>
            <span><span className="font-semibold text-slate-700">{visibleCols.length}</span> / {allCols.length} columns</span>
          </div>
        </div>

        {/* Column chips */}
        <div className="flex flex-wrap gap-1.5 px-6 py-3 border-b border-slate-100 shrink-0 overflow-y-auto max-h-[80px]">
          {allCols.map((col) => {
            const active = !hiddenCols.has(col);
            return (
              <button
                key={col}
                onClick={() => toggleCol(col)}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all ${
                  active
                    ? "bg-indigo-50 border-indigo-200 text-indigo-700"
                    : "bg-slate-100 border-slate-200 text-slate-400 line-through"
                }`}
              >
                {active ? <CheckCircle className="w-3 h-3" /> : <X className="w-3 h-3" />}
                {col}
              </button>
            );
          })}
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
                    {visibleCols.map((col) => (
                      <th key={col} className="text-left px-3 py-2 text-slate-600 font-semibold border-b border-slate-200 whitespace-nowrap font-mono">
                        <div className="flex items-center gap-1.5">
                          {col}
                          <button
                            onClick={() => toggleCol(col)}
                            className="text-slate-300 hover:text-rose-500 transition-colors"
                            title="Remove column"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {displayRows.map((row, i) => (
                    <tr key={i} className="border-b border-slate-50 hover:bg-slate-50/50">
                      <td className="px-3 py-2 text-slate-300 font-mono">{i + 1}</td>
                      {visibleCols.map((col) => {
                        const val = row[col];
                        const isEmpty = val === null || val === undefined || String(val).trim() === "";
                        return (
                          <td
                            key={col}
                            className={`px-3 py-2 whitespace-nowrap max-w-[180px] overflow-hidden text-ellipsis font-mono ${
                              isEmpty ? "text-rose-300 bg-rose-50" : "text-slate-700"
                            }`}
                          >
                            {isEmpty ? <span className="italic">empty</span> : String(val)}
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
            disabled={previewRows.length === 0 || visibleCols.length === 0}
            className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2"
          >
            <CheckCircle className="w-4 h-4" />
            Import {previewRows.length} rows × {visibleCols.length} columns
          </Button>
        </div>
      </div>
    </div>
  );
}