import React from "react";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

export default function PageHeader({ title, subtitle, onAdd, addLabel, children }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-slate-400 mt-1">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-2">
        {children}
        {onAdd && (
          <Button
            onClick={onAdd}
            className="bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-lg shadow-emerald-500/20 transition-all hover:shadow-xl hover:shadow-emerald-500/25"
          >
            <Plus className="w-4 h-4 mr-2" />
            {addLabel || "Add New"}
          </Button>
        )}
      </div>
    </div>
  );
}