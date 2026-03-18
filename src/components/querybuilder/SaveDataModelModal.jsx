import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { X, Layers } from "lucide-react";
import { inferType } from "./sqlEngine";

export default function SaveDataModelModal({ sql, results, onClose, onSaved }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  const fields = results?.length
    ? Object.keys(results[0]).map((k) => ({
        name: k,
        type: inferType(results.map((r) => r[k])),
      }))
    : [];

  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    await base44.entities.DataModel.create({
      name: name.trim(),
      description: description.trim(),
      fields,
      source_script: sql,
      sample_rows: (results || []).slice(0, 10),
    });
    setSaving(false);
    setDone(true);
    setTimeout(() => { onSaved?.(); onClose(); }, 900);
  };

  const inputCls = "w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-violet-500/50";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-900 border border-white/10 rounded-2xl w-full max-w-md p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-white">Save as Data Model</h3>
          <button onClick={onClose} className="p-1 text-slate-500 hover:text-white transition-colors"><X className="w-4 h-4" /></button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Model Name *</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="My Data Model" className={inputCls} />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Description</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Optional description..." className={inputCls + " resize-none"} />
          </div>
          {fields.length > 0 && (
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Inferred Fields ({fields.length})</label>
              <div className="bg-slate-800/50 rounded-lg p-3 border border-white/5 max-h-36 overflow-auto space-y-1">
                {fields.map(({ name: fn, type }) => (
                  <div key={fn} className="flex items-center justify-between">
                    <span className="font-mono text-[11px] text-slate-300">{fn}</span>
                    <span className={`text-[9px] font-bold font-mono ${
                      type === "INT" || type === "FLOAT" ? "text-blue-400" :
                      type === "DATE" ? "text-amber-400" : "text-slate-500"
                    }`}>{type}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 mt-5">
          <button onClick={onClose} className="flex-1 py-2 rounded-lg border border-white/10 text-slate-400 text-sm hover:bg-white/5 transition-colors">Cancel</button>
          <button
            onClick={save}
            disabled={!name.trim() || saving || done}
            className="flex-1 py-2 rounded-lg bg-violet-500 hover:bg-violet-600 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-60"
          >
            {done ? "✓ Saved!" : saving ? "Saving…" : <><Layers className="w-3.5 h-3.5" /> Save Model</>}
          </button>
        </div>
      </div>
    </div>
  );
}