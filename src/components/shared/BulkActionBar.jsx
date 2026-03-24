import React from "react";
import { Button } from "@/components/ui/button";
import { Trash2, X, CheckSquare } from "lucide-react";

/**
 * Sticky bulk-action bar that appears when items are selected.
 * Props:
 *   selectedIds: string[]
 *   onClear: fn
 *   onDeleteSelected: fn (optional)
 *   extraActions: ReactNode (optional, for page-specific actions)
 *   canDelete: boolean
 */
export default function BulkActionBar({
  selectedIds = [],
  onClear,
  onDeleteSelected,
  canDelete = true,
  extraActions,
}) {
  if (selectedIds.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-3 bg-slate-900 text-white rounded-2xl px-5 py-3 mb-4 shadow-lg animate-in slide-in-from-bottom-2">
      <div className="flex items-center gap-2">
        <CheckSquare className="w-4 h-4 text-emerald-400" />
        <span className="text-sm font-semibold">{selectedIds.length} selected</span>
      </div>

      {extraActions}

      {canDelete && onDeleteSelected && (
        <Button
          size="sm"
          variant="outline"
          className="h-7 border-rose-400 text-rose-300 hover:bg-rose-500/20 hover:border-rose-300"
          onClick={onDeleteSelected}
        >
          <Trash2 className="w-3.5 h-3.5 mr-1.5" />
          Delete {selectedIds.length}
        </Button>
      )}

      <Button
        size="sm"
        variant="ghost"
        className="h-7 text-slate-400 hover:text-white ml-auto"
        onClick={onClear}
      >
        <X className="w-3.5 h-3.5" />
      </Button>
    </div>
  );
}