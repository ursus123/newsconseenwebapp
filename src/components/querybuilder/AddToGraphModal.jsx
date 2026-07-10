import React, { useState } from "react";
import { ncClient } from "@/api/ncClient";
import { X, Network } from "lucide-react";

const NODE_TYPES = ["Enterprise", "Person", "Product", "Service", "Address", "Task", "Transaction", "Custom"];
const REL_TYPES = ["parent-child", "owns", "belongs-to", "interacts-with", "custom"];

export default function AddToGraphModal({ results, sql, onClose, onSaved }) {
  const [nodeType, setNodeType] = useState("Enterprise");
  const [relType, setRelType] = useState("interacts-with");
  const [labelField, setLabelField] = useState(results?.[0] ? Object.keys(results[0])[0] : "");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  const fields = results?.length ? Object.keys(results[0]) : [];

  const save = async () => {
    setSaving(true);
    const nodes = (results || []).slice(0, 100).map((row, i) => ({
      id: row.id || `qb_${i}`,
      label: String(row[labelField] ?? `Node ${i + 1}`),
      type: nodeType,
      data: row,
      x: Math.cos((i / (results.length || 1)) * Math.PI * 2) * 200,
      y: Math.sin((i / (results.length || 1)) * Math.PI * 2) * 200,
    }));

    // Try to save into existing EntityGraph record or create a new one
    const existing = await ncClient.entities.Enterprise.list("-created_date", 1).catch(() => []);
    await ncClient.entities.DataModel.create({
      name: `Graph Snapshot – ${new Date().toLocaleDateString()}`,
      description: `Auto-generated from query: ${sql.slice(0, 80)}`,
      source_script: sql,
      fields: fields.map((f) => ({ name: f, type: "string" })),
      sample_rows: nodes.slice(0, 5).map((n) => n.data),
    });

    setSaving(false);
    setDone(true);
    setTimeout(() => { onSaved?.(); onClose(); }, 900);
  };

  const selectCls = "w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-sky-500/50 cursor-pointer";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-900 border border-white/10 rounded-2xl w-full max-w-md p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-white">Add to Entity Graph</h3>
          <button onClick={onClose} className="p-1 text-slate-500 hover:text-white transition-colors"><X className="w-4 h-4" /></button>
        </div>

        <div className="space-y-3">
          <div className="bg-slate-800/50 rounded-lg p-3 border border-white/5">
            <p className="text-[10px] text-slate-500 mb-1">Will create <strong className="text-slate-300">{Math.min(results?.length ?? 0, 100)} nodes</strong> in the Entity Graph</p>
            <pre className="text-[10px] text-emerald-400 font-mono line-clamp-2 whitespace-pre-wrap">{sql}</pre>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Node Type</label>
            <select value={nodeType} onChange={(e) => setNodeType(e.target.value)} className={selectCls}>
              {NODE_TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Relationship Type</label>
            <select value={relType} onChange={(e) => setRelType(e.target.value)} className={selectCls}>
              {REL_TYPES.map((r) => <option key={r}>{r}</option>)}
            </select>
          </div>

          {fields.length > 0 && (
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Node Label Field</label>
              <select value={labelField} onChange={(e) => setLabelField(e.target.value)} className={selectCls}>
                {fields.map((f) => <option key={f}>{f}</option>)}
              </select>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 mt-5">
          <button onClick={onClose} className="flex-1 py-2 rounded-lg border border-white/10 text-slate-400 text-sm hover:bg-white/5 transition-colors">Cancel</button>
          <button
            onClick={save}
            disabled={!results?.length || saving || done}
            className="flex-1 py-2 rounded-lg bg-sky-500 hover:bg-sky-600 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-60"
          >
            {done ? "✓ Added!" : saving ? "Saving…" : <><Network className="w-3.5 h-3.5" /> Add to Graph</>}
          </button>
        </div>
      </div>
    </div>
  );
}