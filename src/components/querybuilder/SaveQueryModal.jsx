import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { X, Save } from "lucide-react";

export default function SaveQueryModal({ sql, results, onClose, onSaved }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    const outputSchema = results?.length
      ? Object.keys(results[0]).map((k) => ({ name: k, type: "string" }))
      : [];
    await base44.entities.QueryDefinition.create({
      name: name.trim(),
      description: description.trim(),
      script: sql,
      data_source: sql.match(/FROM\s+(\w+)/i)?.[1] ?? "unknown",
      output_schema: outputSchema,
      last_run_rows: results?.length ?? 0,
    });
    setSaving(false);
    setDone(true);
    setTimeout(() => { onSaved?.(); onClose(); }, 900);
  };

  const inputCls = "w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500/50";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-900 border border-white/10 rounded-2xl w-full max-w-md p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-white">Save Query</h3>
          <button onClick={onClose} className="p-1 text-slate-500 hover:text-white transition-colors"><X className="w-4 h-4" /></button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Query Name *</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="My Query" className={inputCls} />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Description</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Optional description..." className={inputCls + " resize-none"} />
          </div>
          <div className="bg-slate-800/50 rounded-lg p-3 border border-white/5">
            <p className="text-[10px] text-slate-500 font-mono mb-1">Script preview</p>
            <pre className="text-[10px] text-emerald-400 font-mono line-clamp-3 whitespace-pre-wrap">{sql}</pre>
          </div>
          {results?.length > 0 && (
            <p className="text-[10px] text-slate-500">Will store output schema from {results.length} result rows.</p>
          )}
        </div>

        <div className="flex items-center gap-2 mt-5">
          <button onClick={onClose} className="flex-1 py-2 rounded-lg border border-white/10 text-slate-400 text-sm hover:bg-white/5 transition-colors">Cancel</button>
          <button
            onClick={save}
            disabled={!name.trim() || saving || done}
            className="flex-1 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-60"
          >
            {done ? "✓ Saved!" : saving ? "Saving…" : <><Save className="w-3.5 h-3.5" /> Save Query</>}
          </button>
        </div>
      </div>
    </div>
  );
}