import React, { useState, useMemo } from "react";
import { Search, X } from "lucide-react";
import { DESKTOP_APPS, DESKTOP_CATEGORIES } from "@/desktop/desktopApps";

export default function AppLauncher({ open, onClose, onOpenApp }) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");

  const filtered = useMemo(() => {
    return DESKTOP_APPS.filter(app => {
      const matchCat = category === "All" || app.category === category;
      const matchSearch = !search || app.name.toLowerCase().includes(search.toLowerCase());
      return matchCat && matchSearch;
    });
  }, [search, category]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[9998]"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0" style={{ background: "rgba(0,0,0,0.4)", backdropFilter: "blur(8px)" }} />

      {/* Launcher panel */}
      <div
        className="absolute bottom-14 left-4 w-[480px] rounded-2xl overflow-hidden shadow-2xl"
        style={{ background: "rgba(15, 23, 42, 0.97)", border: "1px solid rgba(255,255,255,0.1)" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Search */}
        <div className="p-4 border-b border-white/10">
          <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-white/10">
            <Search className="w-4 h-4 text-slate-400 shrink-0" />
            <input
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search apps..."
              className="flex-1 bg-transparent text-white text-sm placeholder-slate-400 outline-none"
            />
            {search && (
              <button onClick={() => setSearch("")}>
                <X className="w-3.5 h-3.5 text-slate-400 hover:text-white" />
              </button>
            )}
          </div>
        </div>

        {/* Category tabs */}
        <div className="flex gap-1 px-4 pt-3 pb-2 overflow-x-auto">
          {["All", ...DESKTOP_CATEGORIES].map(cat => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className="shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-all"
              style={{
                background: category === cat ? "#10b981" : "rgba(255,255,255,0.08)",
                color: category === cat ? "#fff" : "#94a3b8",
              }}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* App grid */}
        <div className="grid grid-cols-4 gap-1 p-4 max-h-80 overflow-y-auto">
          {filtered.map(app => (
            <button
              key={app.id}
              onClick={() => { onOpenApp(app); onClose(); }}
              className="flex flex-col items-center gap-2 p-3 rounded-xl hover:bg-white/10 transition-all group"
            >
              <div
                className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl shadow-lg transition-transform group-hover:scale-110"
                style={{ background: `${app.color}22`, border: `1px solid ${app.color}44` }}
              >
                {app.icon}
              </div>
              <span className="text-[11px] text-slate-300 text-center leading-tight line-clamp-2 group-hover:text-white transition-colors">
                {app.name}
              </span>
            </button>
          ))}
        </div>

        {filtered.length === 0 && (
          <div className="py-12 text-center">
            <span className="text-4xl block mb-2">🔍</span>
            <p className="text-slate-400 text-sm">No apps found</p>
          </div>
        )}

        {/* Footer */}
        <div className="border-t border-white/10 px-4 py-3 flex items-center justify-between">
          <span className="text-xs text-slate-500">{filtered.length} apps</span>
          <button onClick={onClose} className="text-xs text-slate-500 hover:text-slate-300 transition-colors">
            Press Esc to close
          </button>
        </div>
      </div>
    </div>
  );
}