import React from "react";
import { AlertTriangle, CheckCircle2, X, Trash2, PenLine, PlusCircle, ArrowRightLeft } from "lucide-react";

const MUTATION_META = {
  INSERT: { label: "INSERT", icon: PlusCircle, color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20", dot: "bg-emerald-400" },
  UPDATE: { label: "UPDATE", icon: PenLine, color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20", dot: "bg-amber-400" },
  DELETE: { label: "DELETE", icon: Trash2, color: "text-rose-400", bg: "bg-rose-500/10 border-rose-500/20", dot: "bg-rose-400" },
  INSERT_SELECT: { label: "INSERT…SELECT", icon: ArrowRightLeft, color: "text-sky-400", bg: "bg-sky-500/10 border-sky-500/20", dot: "bg-sky-400" },
};

export default function MutationConfirmDialog({ mutationType, sql, preview, onConfirm, onCancel }) {
  const meta = MUTATION_META[mutationType] || MUTATION_META.UPDATE;
  const Icon = meta.icon;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-white/10 rounded-2xl shadow-2xl w-full max-w-lg">
        {/* Header */}
        <div className={`flex items-center gap-3 px-5 py-4 border-b border-white/5 rounded-t-2xl ${meta.bg} border`}>
          <div className={`p-2 rounded-lg bg-slate-900/60`}>
            <Icon className={`w-5 h-5 ${meta.color}`} />
          </div>
          <div className="flex-1">
            <h3 className={`font-semibold text-sm ${meta.color}`}>Confirm {meta.label}</h3>
            <p className="text-xs text-slate-400 mt-0.5">This operation will modify data in the database.</p>
          </div>
          <button onClick={onCancel} className="p-1 rounded-lg hover:bg-white/10 text-slate-500 hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* SQL preview */}
        <div className="px-5 py-4 space-y-4">
          <div>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">SQL to Execute</p>
            <pre className="bg-slate-800 rounded-xl px-4 py-3 font-mono text-[12px] text-emerald-300 whitespace-pre-wrap break-all border border-white/5">
              {sql}
            </pre>
          </div>

          {preview && (
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Preview</p>
              <div className={`rounded-xl px-4 py-3 text-xs border ${meta.bg}`}>
                <p className={`font-mono ${meta.color}`}>{preview}</p>
              </div>
            </div>
          )}

          <div className="flex items-start gap-2 bg-amber-500/5 border border-amber-500/20 rounded-xl px-4 py-3">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-300">
              {mutationType === "DELETE"
                ? "This will permanently delete records. This action cannot be undone."
                : "This will modify live data. Review the SQL carefully before confirming."}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-white/5">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-xl text-sm text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold transition-colors ${
              mutationType === "DELETE"
                ? "bg-rose-500 hover:bg-rose-600 text-white"
                : mutationType === "INSERT" || mutationType === "INSERT_SELECT"
                ? "bg-emerald-500 hover:bg-emerald-600 text-white"
                : "bg-amber-500 hover:bg-amber-600 text-white"
            }`}
          >
            <CheckCircle2 className="w-4 h-4" />
            Confirm {meta.label}
          </button>
        </div>
      </div>
    </div>
  );
}