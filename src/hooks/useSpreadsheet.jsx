/**
 * useSpreadsheet.js
 * ─────────────────
 * Shared state hook that wires SpreadsheetToolbar ↔ DataTable.
 *
 * Usage in an entity page:
 *
 *   const ss = useSpreadsheet(processedData, baseColumns);
 *
 *   <SpreadsheetToolbar {...ss.toolbarProps} numericFields={[...]} ... />
 *   <DataTable
 *     {...ss.tableProps}
 *     onEdit={...}
 *     onDelete={...}
 *     bulkMode
 *     selectedIds={selectedIds}
 *     onSelectionChange={setSelectedIds}
 *     onCellEdit={async (id, field, value) => { ... }}
 *   />
 */

import { useState, useMemo, useCallback } from "react";
import { evalFormula } from "@/components/shared/formulaEngine";

export function useSpreadsheet(data = [], baseColumns = []) {
  const [computedColumns, setComputedColumns] = useState([]);  // [{key, label, formula, mapToField}]
  const [hiddenCols,      setHiddenCols]      = useState(new Set());
  const [sortKey,         setSortKey]         = useState(null);
  const [sortDir,         setSortDir]         = useState("asc");

  // ── Sort ────────────────────────────────────────────────────────────────
  const handleSort = useCallback((key) => {
    setSortKey((prev) => {
      if (prev === key) {
        setSortDir((d) => {
          if (d === "asc") return "desc";
          // third click — remove sort
          setSortKey(null);
          return "asc";
        });
        return key;
      }
      setSortDir("asc");
      return key;
    });
  }, []);

  // ── Column visibility ──────────────────────────────────────────────────
  const toggleColumn = useCallback((key) => {
    setHiddenCols((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const showAllColumns = useCallback(() => setHiddenCols(new Set()), []);

  // ── Computed columns ───────────────────────────────────────────────────
  const addComputedColumn = useCallback((col) => {
    setComputedColumns((prev) => [
      ...prev,
      { ...col, key: `__fx_${Date.now()}` },
    ]);
  }, []);

  const removeComputedColumn = useCallback((key) => {
    setComputedColumns((prev) => prev.filter((c) => c.key !== key));
  }, []);

  const updateComputedColumn = useCallback((key, patch) => {
    setComputedColumns((prev) =>
      prev.map((c) => (c.key === key ? { ...c, ...patch } : c))
    );
  }, []);

  // ── Derived data ────────────────────────────────────────────────────────

  // Sorted
  const sortedData = useMemo(() => {
    if (!sortKey) return data;
    return [...data].sort((a, b) => {
      let av = a[sortKey];
      let bv = b[sortKey];
      // Computed column sort — evaluate formula on the fly
      const cc = computedColumns.find((c) => c.key === sortKey);
      if (cc) {
        av = evalFormula(cc.formula, a);
        bv = evalFormula(cc.formula, b);
      }
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      const cmp =
        typeof av === "number" && typeof bv === "number"
          ? av - bv
          : String(av).localeCompare(String(bv), undefined, { numeric: true });
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [data, sortKey, sortDir, computedColumns]);

  // All columns (base + computed) — used by toolbar for show/hide list
  const allColumns = useMemo(() => {
    const extras = computedColumns.map((col) => ({
      key:        col.key,
      label:      col.label,
      computed:   true,
      formula:    col.formula,
      mapToField: col.mapToField || null,
      render:     (_, row) => {
        const val = evalFormula(col.formula, row);
        if (val == null || val === "") return <span className="text-slate-300">—</span>;
        const str = String(val);
        const isErr = str.startsWith("#ERR");
        return (
          <span className={isErr ? "text-rose-400 text-xs font-mono" : ""}>
            {str}
          </span>
        );
      },
    }));
    return [...baseColumns, ...extras];
  }, [baseColumns, computedColumns]);

  // Visible columns (filtered for hidden)
  const visibleColumns = useMemo(
    () => allColumns.filter((c) => !hiddenCols.has(c.key)),
    [allColumns, hiddenCols]
  );

  // ── Toolbar props (spread onto SpreadsheetToolbar) ──────────────────────
  const toolbarProps = {
    data:                  sortedData,
    allColumns:            baseColumns,       // base columns for column manager
    computedColumns,
    hiddenCols,
    sortKey,
    sortDir,
    onAddColumn:           addComputedColumn,
    onRemoveColumn:        removeComputedColumn,
    onUpdateColumn:        updateComputedColumn,
    onToggleColumn:        toggleColumn,
    onShowAllColumns:      showAllColumns,
    onSort:                handleSort,
  };

  // ── DataTable props (spread onto DataTable) ─────────────────────────────
  const tableProps = {
    columns:  visibleColumns,
    data:     sortedData,
    sortKey,
    sortDir,
    onSort:   handleSort,
  };

  return {
    processedData:        sortedData,
    allColumns,
    visibleColumns,
    computedColumns,
    hiddenCols,
    sortKey,
    sortDir,
    addComputedColumn,
    removeComputedColumn,
    toggleColumn,
    showAllColumns,
    handleSort,
    toolbarProps,
    tableProps,
  };
}
