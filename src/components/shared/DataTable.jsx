import React, { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ChevronLeft, ChevronRight, AlertTriangle, RefreshCw } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const PAGE_SIZE = 15;

/**
 * DataTable — supports external data (fuzzy search done upstream), pagination,
 * bulk selection via checkboxes, and custom row rendering.
 *
 * Props:
 *   columns, data, onEdit, onDelete, onRowClick
 *   isLoading, error, onRetry
 *   selectedIds: string[] (optional) — controlled selection
 *   onSelectionChange: (ids: string[]) => void (optional)
 *   bulkMode: boolean — show checkboxes
 */
export default function DataTable({
  columns,
  data,
  onEdit,
  onDelete,
  onRowClick,
  isLoading,
  error,
  onRetry,
  // Bulk selection (controlled)
  selectedIds = [],
  onSelectionChange,
  bulkMode = false,
}) {
  const [page, setPage] = useState(0);

  const safeData = data || [];
  const totalPages = Math.ceil(safeData.length / PAGE_SIZE);
  const paginated = safeData.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // Bulk helpers
  const allOnPageSelected = paginated.length > 0 && paginated.every((r) => selectedIds.includes(r.id));
  const someSelected = paginated.some((r) => selectedIds.includes(r.id));

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

  const showCheckboxes = bulkMode && !!onSelectionChange;

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

  return (
    <div>
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
                  <TableHead key={col.key} className="text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                    {col.label}
                  </TableHead>
                ))}
                {(onEdit || onDelete) && <TableHead className="w-20" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              <AnimatePresence>
                {paginated.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={columns.length + (showCheckboxes ? 2 : 1)} className="text-center py-12 text-slate-400">
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
                        {columns.map((col) => (
                          <TableCell key={col.key} className="text-sm text-slate-700">
                            {col.render ? col.render(row[col.key], row) : (
                              col.badge ? (
                                <Badge variant="secondary" className={col.badgeColor?.(row[col.key]) || "bg-slate-100 text-slate-600"}>
                                  {(row[col.key] || "—").toString().replace(/_/g, " ")}
                                </Badge>
                              ) : (
                                row[col.key] || "—"
                              )
                            )}
                          </TableCell>
                        ))}
                        {(onEdit || onDelete) && (
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center gap-1">
                              {onEdit && (
                                <Button variant="ghost" size="icon" onClick={() => onEdit(row)} className="h-7 w-7 text-slate-400 hover:text-emerald-600">
                                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                </Button>
                              )}
                              {onDelete && (
                                <Button variant="ghost" size="icon" onClick={() => onDelete(row)} className="h-7 w-7 text-slate-400 hover:text-rose-600">
                                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
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