import React from "react";
import { X, Keyboard } from "lucide-react";

const SHORTCUTS = [
  { keys: ["Ctrl", "Enter"], desc: "Run query" },
  { keys: ["Ctrl", "S"], desc: "Save query" },
  { keys: ["Ctrl", "/"], desc: "Comment selected lines" },
  { keys: ["F5"], desc: "Refresh analytics tables" },
  { keys: ["Escape"], desc: "Close autocomplete" },
  { keys: ["Tab"], desc: "Indent selected lines" },
];

export default function ShortcutsModal({ onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-slate-800 border border-white/10 rounded-2xl w-[360px] shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
          <div className="flex items-center gap-2 text-slate-200">
            <Keyboard className="w-4 h-4 text-blue-400" />
            <span className="font-semibold text-sm">Keyboard Shortcuts</span>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 space-y-3">
          {SHORTCUTS.map(({ keys, desc }, i) => (
            <div key={i} className="flex items-center justify-between">
              <span className="text-xs text-slate-400">{desc}</span>
              <div className="flex items-center gap-1">
                {keys.map((k, j) => (
                  <React.Fragment key={j}>
                    {j > 0 && <span className="text-[10px] text-slate-600">+</span>}
                    <kbd className="px-1.5 py-0.5 bg-slate-700 border border-white/10 rounded text-[10px] font-mono text-slate-300">{k}</kbd>
                  </React.Fragment>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}