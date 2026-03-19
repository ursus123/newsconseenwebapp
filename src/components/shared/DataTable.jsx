import React, { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, Pencil, Trash2, ChevronLeft, ChevronRight, AlertTriangle, RefreshCw } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const PAGE_SIZE = 10;

export default function DataTable({ columns, data, onEdit, onDelete, searchField, onRowClick, isLoading, error, onRetry }) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);

  const filtered = data.filter((row) => {
    if (!search || !searchField) return true;
    const val = row[searchField];
    return val && val.toString().toLowerCase().includes(search.toLowerCase());
  });

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <div>
      {searchField && (
        <div className="relative mb-4 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Search..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            className="pl-10 bg-white border-slate-200 rounded-xl"
          />
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/50">
                {columns.map((col) => (
                  <TableHead key={col.key} className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    {col.label}
                  </TableHead>
                ))}
                {(onEdit || onDelete) && <TableHead className="w-24" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              <AnimatePresence>
                {paginated.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={columns.length + 1} className="text-center py-12 text-slate-400">
                      No records found
                    </TableCell>
                  </TableRow>
                ) : (
                  paginated.map((row) => (
                    <motion.tr
                      key={row.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className={`border-b border-slate-50 hover:bg-slate-50/50 transition-colors ${onRowClick ? "cursor-pointer" : ""}`}
                      onClick={onRowClick ? () => onRowClick(row) : undefined}
                    >
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
                              <Button variant="ghost" size="icon" onClick={() => onEdit(row)} className="h-8 w-8 text-slate-400 hover:text-emerald-600">
                                <Pencil className="w-3.5 h-3.5" />
                              </Button>
                            )}
                            {onDelete && (
                              <Button variant="ghost" size="icon" onClick={() => onDelete(row)} className="h-8 w-8 text-slate-400 hover:text-rose-600">
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      )}
                    </motion.tr>
                  ))
                )}
              </AnimatePresence>
            </TableBody>
          </Table>
        </div>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-slate-400">{filtered.length} records</p>
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