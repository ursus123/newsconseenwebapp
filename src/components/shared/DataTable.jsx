import React, { useState, useCallback, useRef, useEffect } from "react";
import { Column, Table2, Cell, ColumnHeaderCell, SelectionModes, RenderMode } from "@blueprintjs/table";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ChevronLeft, ChevronRight, AlertTriangle, RefreshCw, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const PAGE_SIZE = 15;
const VIRTUALIZE_THRESHOLD = 200;

// ── Inline-edit cell ──────────────────────────────────────────────────────────

function EditableCell({ value, onSave, children }) {
  const [editing, setEditing] = useState(false);
  const [draft,   setDraft]   = useState("");
  const inputRef = useRef(null);

  const startEdit = (e) => {
    e.stopPropagation();
    setDraft(value != null ? String(value) : "");
    setEditing(true);
  };

  useEffect(() => {
    if (editing && inputRef.current) inputRef.current.focus();
  }, [editing]);

  const commit = () => {
    setEditing(false);
    if (draft !== String(value ?? "")) onSave(draft);
  };

  const cancel = () => setEditing(false);

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); commit(); }
          if (e.key === "Escape") cancel();
        }}
        className="w-full text-sm text-slate-800 bg-emerald-50 border border-emerald-300 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-emerald-400"
        onClick={(e) => e.stopPropagation()}
      />
    );
  }

  return (
    <div
      onDoubleClick={startEdit}
      className="cursor-text group relative"
      title="Double-click to edit"
    >
      {children}
      <span className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none rounded border border-emerald-200" />
    </div>
  );
}

// ── Sort header ───────────────────────────────────────────────────────────────

function SortableHeader({ col, sortKey, sortDir, onSort }) {
  const active = sortKey === col.key;
  return (
    <button
      onClick={() => onSort && onSort(col.key)}
      className={`flex items-center gap-1 group text-xs font-semibold uppercase tracking-wider whitespace-nowrap transition-colors ${
        active ? "text-emerald-600" : "text-slate-500 hover:text-slate-700"
      }`}
    >
      {col.label}
      {active ? (
        sortDir === "asc"
          ? <ArrowUp className="w-3 h-3 text-emerald-500" />
          : <ArrowDown className="w-3 h-3 text-emerald-500" />
      ) : (
        <ArrowUpDown className="w-3 h-3 opacity-0 group-hover:opacity-40 transition-opacity" />
      )}
      {col.computed && <span className="text-[9px] text-emerald-500 font-mono ml-0.5">fx</span>}
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function DataTable({
  columns,
  data,
  onEdit,
  onDelete,
  onRowClick,
  isLoading,
  error,
  onRetry,
  selectedIds    = [],
  onSelectionChange,
  bulkMode       = false,
  // Spreadsheet extensions
  sortKey        = null,
  sortDir        = "asc",
  onSort,
  onCellEdit,    // fn(rowId, fieldKey, newValue) — enables inline editing
}) {
  const [page, setPage] = useState(0);

  // Reset to page 0 when data changes (e.g. after sort/filter)
  const prevDataLen = useRef(data?.length);
  if (data?.length !== prevDataLen.current) {
    prevDataLen.current = data?.length;
    if (page !== 0) setPage(0);
  }

  const safeData    = data || [];
  const totalPages  = Math.ceil(safeData.length / PAGE_SIZE);
  const paginated   = safeData.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const showCheckboxes     = bulkMode && !!onSelectionChange;
  const allOnPageSelected  = paginated.length > 0 && paginated.every((r) => selectedIds.includes(r.id));
  const someSelected       = paginated.some((r) => selectedIds.includes(r.id));
  const allSelected        = safeData.length > 0 && safeData.every((r) => selectedIds.includes(r.id));
  const someNotOnPage      = showCheckboxes && allOnPageSelected && !allSelected && safeData.length > PAGE_SIZE;

  const toggleRow = (id) => {
    if (!onSelectionChange) return;
    onSelectionChange(
      selectedIds.includes(id)
        ? selectedIds.filter((x) => x !== id)
        : [...selectedIds, id]
    );
  };

  const toggleAll = () => {
    if (!onSelectionChange) return;
    const pageIds = paginated.map((r) => r.id);
    if (allOnPageSelected) {
      onSelectionChange(selectedIds.filter((id) => !pageIds.includes(id)));
    } else {
      const added = pageIds.filter((id) => !selectedIds.includes(id));
      onSelectionChange([...selectedIds, ...added]);
    }
  };

  const selectAllGlobal = () => {
    if (!onSelectionChange) return;
    onSelectionChange(safeData.map((r) => r.id));
  };

  // Blueprint virtualized renderer (large datasets, no inline edit)
  const cellRenderer = useCallback((col) => (rowIndex) => {
    const row = safeData[rowIndex];
    if (!row) return <Cell />;
    const val = row[col.key];
    if (col.render) return <Cell>{col.render(val, row)}</Cell>;
    if (col.badge) {
      return (
        <Cell>
          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${col.badgeColor?.(val) || "bg-slate-100 text-slate-600"}`}>
            {(val || "—").toString().replace(/_/g, " ")}
          </span>
        </Cell>
      );
    }
    return <Cell>{val != null && val !== "" ? String(val) : "—"}</Cell>;
  }, [safeData]);

  // ── Virtualized view (Blueprint) ─────────────────────────────────────────
  if (safeData.length >= VIRTUALIZE_THRESHOLD && !bulkMode) {
    return (
      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
        <div className="px-4 py-2 border-b border-slate-100 text-xs text-slate-400">
          {safeData.length} records — virtualized view · double-click a row to edit
        </div>
        <Table2
          numRows={safeData.length}
          selectionModes={SelectionModes.ROWS_AND_CELLS}
          renderMode={RenderMode.BATCH_ON_UPDATE}
          defaultRowHeight={36}
          className="w-full"
        >
          {columns.map((col) => (
            <Column
              key={col.key}
              name={col.label}
              nameRenderer={() => (
                <ColumnHeaderCell
                  name={col.label}
                  style={{ fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}
                />
              )}
              cellRenderer={cellRenderer(col)}
            />
          ))}
        </Table2>
      </div>
    );
  }

  // ── Loading skeleton ─────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
        <div className="divide-y divide-slate-50">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3 animate-pulse">
              <div className="h-3 bg-slate-100 rounded w-1/4" />
              <div className="h-3 bg-slate-100 rounded w-1/3" />
              <div className="h-3 bg-slate-100 rounded w-1/5" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── Error state ──────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
        <div className="flex flex-col items-center justify-center py-14 gap-3">
          <div className="w-10 h-10 bg-rose-50 rounded-xl flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-rose-400" />
          </div>
          <p className="text-sm font-semibold text-slate-700">Failed to load data</p>
          <p className="text-xs text-slate-400">Could not connect to the server.</p>
          {onRetry && (
            <Button size="sm" variant="outline" onClick={onRetry} className="rounded-xl gap-1.5 mt-1">
              <RefreshCw className="w-3.5 h-3.5" /> Try Again
            </Button>
          )}
        </div>
      </div>
    );
  }

  // ── Normal paginated table ───────────────────────────────────────────────
  return (
    <div>
      {someNotOnPage && (
        <div className="flex items-center justify-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2 mb-2 text-sm text-emerald-700">
          <span>All {paginated.length} rows on this page are selected.</span>
          <button onClick={selectAllGlobal} className="font-semibold underline hover:text-emerald-900 transition-colors">
            Select all {safeData.length} records
          </button>
        </div>
      )}
      {allSelected && safeData.length > PAGE_SIZE && (
        <div className="flex items-center justify-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2 mb-2 text-sm text-emerald-700">
          <span>All {safeData.length} records are selected.</span>
          <button onClick={() => onSelectionChange && onSelectionChange([])} className="font-semibold underline hover:text-emerald-900 transition-colors">
            Clear selection
          </button>
        </div>
      )}

      {onCellEdit && (
        <div className="flex items-center gap-1.5 mb-1.5 text-[11px] text-slate-400">
          <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
          Double-click any cell to edit inline · Enter to save · Escape to cancel
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/50">
                {showCheckboxes && (
                  <TableHead className="w-10">
                    <Checkbox
                      checked={allOnPageSelected}
                      indeterminate={someSelected && !allOnPageSelected}
                      onCheckedChange={toggleAll}
                    />
                  </TableHead>
                )}
                {columns.map((col) => (
                  <TableHead key={col.key} className="whitespace-nowrap">
                    {onSort ? (
                      <SortableHeader col={col} sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                    ) : (
                      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                        {col.label}
                        {col.computed && <span className="text-[9px] text-emerald-500 font-mono ml-1">fx</span>}
                      </span>
                    )}
                  </TableHead>
                ))}
                {(onEdit || onDelete) && <TableHead className="w-20" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              <AnimatePresence>
                {paginated.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={columns.length + (showCheckboxes ? 2 : 1)}
                      className="text-center py-12 text-slate-400"
                    >
                      No records found
                    </TableCell>
                  </TableRow>
                ) : (
                  paginated.map((row) => {
                    const isSelected = selectedIds.includes(row.id);
                    return (
                      <motion.tr
                        key={row.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className={`border-b border-slate-50 transition-colors ${
                          isSelected ? "bg-emerald-50/40" : "hover:bg-slate-50/50"
                        } ${onRowClick ? "cursor-pointer" : ""}`}
                        onClick={onRowClick ? () => onRowClick(row) : undefined}
                      >
                        {showCheckboxes && (
                          <TableCell onClick={(e) => { e.stopPropagation(); toggleRow(row.id); }}>
                            <Checkbox checked={isSelected} onCheckedChange={() => toggleRow(row.id)} />
                          </TableCell>
                        )}
                        {columns.map((col) => {
                          const rawVal = row[col.key];
                          // Computed columns are display-only — no inline edit
                          const editable = onCellEdit && !col.computed && !col.render;

                          const cellContent = col.render
                            ? col.render(rawVal, row)
                            : col.badge
                              ? (
                                <Badge
                                  variant="secondary"
                                  className={col.badgeColor?.(rawVal) || "bg-slate-100 text-slate-600"}
                                >
                                  {(rawVal || "—").toString().replace(/_/g, " ")}
                                </Badge>
                              )
                              : (rawVal != null && rawVal !== "" ? String(rawVal) : "—");

                          return (
                            <TableCell key={col.key} className="text-sm text-slate-700">
                              {editable ? (
                                <EditableCell
                                  value={rawVal}
                                  onSave={(val) => onCellEdit(row.id, col.key, val)}
                                >
                                  {cellContent}
                                </EditableCell>
                              ) : (
                                cellContent
                              )}
                            </TableCell>
                          );
                        })}
                        {(onEdit || onDelete) && (
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center gap-1">
                              {onEdit && (
                                <Button
                                  variant="ghost" size="icon"
                                  onClick={() => onEdit(row)}
                                  className="h-7 w-7 text-slate-400 hover:text-emerald-600"
                                >
                                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                                  </svg>
                                </Button>
                              )}
                              {onDelete && (
                                <Button
                                  variant="ghost" size="icon"
                                  onClick={() => onDelete(row)}
                                  className="h-7 w-7 text-slate-400 hover:text-rose-600"
                                >
                                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <polyline points="3 6 5 6 21 6"/>
                                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                                    <path d="M10 11v6"/><path d="M14 11v6"/>
                                    <path d="M9 6V4h6v2"/>
                                  </svg>
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        )}
                      </motion.tr>
                    );
                  })
                )}
              </AnimatePresence>
            </TableBody>
          </Table>
        </div>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-slate-400">{safeData.length} records</p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" className="h-8 w-8" disabled={page === 0} onClick={() => setPage(page - 1)}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-sm text-slate-600">{page + 1} / {totalPages}</span>
            <Button variant="outline" size="icon" className="h-8 w-8" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
