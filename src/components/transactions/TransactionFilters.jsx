import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const STATUS_FILTERS = [
  { value: "all", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "posted", label: "Posted" },
  { value: "voided", label: "Voided" },
];

const TYPE_FILTERS = [
  { value: "all", label: "All Types" },
  { value: "stock_in", label: "Stock In" },
  { value: "stock_out", label: "Stock Out" },
  { value: "sale_service", label: "Sale / Service" },
  { value: "expense", label: "Expense" },
  { value: "stock_transfer", label: "Transfer" },
];

export default function TransactionFilters({ filters, onChange }) {
  const set = (key, val) => onChange({ ...filters, [key]: val });

  return (
    <div className="space-y-3 mb-5">
      {/* Status filters */}
      <div className="flex flex-wrap gap-1.5">
        {STATUS_FILTERS.map((f) => (
          <Button
            key={f.value}
            type="button"
            size="sm"
            variant={filters.status === f.value ? "default" : "outline"}
            className={`rounded-full text-xs h-7 px-3 ${filters.status === f.value ? "bg-slate-800 text-white" : "border-slate-200 text-slate-600"}`}
            onClick={() => set("status", f.value)}
          >
            {f.label}
          </Button>
        ))}
        <div className="w-px bg-slate-200 mx-1" />
        {TYPE_FILTERS.map((f) => (
          <Button
            key={f.value}
            type="button"
            size="sm"
            variant={filters.type === f.value ? "default" : "outline"}
            className={`rounded-full text-xs h-7 px-3 ${filters.type === f.value ? "bg-slate-800 text-white" : "border-slate-200 text-slate-600"}`}
            onClick={() => set("type", f.value)}
          >
            {f.label}
          </Button>
        ))}
      </div>

      {/* Date range */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-slate-500 font-medium">Date:</span>
        <Input
          type="date"
          value={filters.dateFrom || ""}
          onChange={(e) => set("dateFrom", e.target.value)}
          className="rounded-lg h-8 text-xs w-36"
        />
        <span className="text-xs text-slate-400">—</span>
        <Input
          type="date"
          value={filters.dateTo || ""}
          onChange={(e) => set("dateTo", e.target.value)}
          className="rounded-lg h-8 text-xs w-36"
        />
        {(filters.dateFrom || filters.dateTo) && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-xs h-7 text-slate-400 hover:text-slate-600"
            onClick={() => onChange({ ...filters, dateFrom: "", dateTo: "" })}
          >
            Clear
          </Button>
        )}
      </div>
    </div>
  );
}