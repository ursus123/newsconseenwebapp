import React, { useEffect, useRef, useState } from "react";
import { Search, X, Pin, Monitor, ExternalLink } from "lucide-react";
import { DESKTOP_CATEGORIES } from "@/desktop/desktopApps";
import { motion, AnimatePresence } from "framer-motion";

const CATEGORY_ICONS = {
  All:         "🌐",
  Operations:  "⚡",
  Inventory:   "📦",
  Finance:     "💰",
  Analytics:   "📊",
  Healthcare:  "🏥",
  Tools:       "🔧",
};

function ContextMenu({ app, x, y, onClose, onOpenApp, onToggleTaskbar, onToggleDesktop, isPinnedTaskbar, isPinnedDesktop }) {
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  // Clamp position so menu doesn't go off-screen
  const clampedX = Math.min(x, window.innerWidth  - 200);
  const clampedY = Math.min(y, window.innerHeight - 180);

  return (
    <div
      ref={ref}
      className="fixed z-[99999] rounded-xl overflow-hidden shadow-2xl text-sm"
      style={{
        left: clampedX,
        top: clampedY,
        minWidth: 192,
        background: "rgba(15,23,42,0.98)",
        border: "1px solid rgba(255,255,255,0.12)",
        backdropFilter: "blur(20px)",
      }}
    >
      <div className="px-3 py-2 border-b border-white/10 flex items-center gap-2">
        <span className="text-base">{app.icon}</span>
        <span className="text-white text-xs font-semibold truncate">{app.name}</span>
      </div>
      <button
        className="w-full flex items-center gap-3 px-4 py-2.5 text-slate-300 hover:bg-white/10 hover:text-white transition-colors text-left"
        onClick={() => { onOpenApp(app); onClose(); }}
      >
        <ExternalLink className="w-3.5 h-3.5 shrink-0" />
        Open in Window
      </button>
      <button
        className="w-full flex items-center gap-3 px-4 py-2.5 text-slate-300 hover:bg-white/10 hover:text-white transition-colors text-left"
        onClick={() => { onToggleTaskbar(app.id); onClose(); }}
      >
        <Pin className="w-3.5 h-3.5 shrink-0" style={{ color: isPinnedTaskbar ? "#10b981" : undefined }} />
        {isPinnedTaskbar ? "Unpin from Taskbar" : "Pin to Taskbar"}
      </button>
      <button
        className="w-full flex items-center gap-3 px-4 py-2.5 text-slate-300 hover:bg-white/10 hover:text-white transition-colors text-left"
        onClick={() => { onToggleDesktop(app.id); onClose(); }}
      >
        <Monitor className="w-3.5 h-3.5 shrink-0" style={{ color: isPinnedDesktop ? "#10b981" : undefined }} />
        {isPinnedDesktop ? "Remove from Desktop" : "Add to Desktop"}
      </button>
    </div>
  );
}

export default function AppLauncher({
  open,
  onClose,
  onOpenApp,
  searchQuery,
  selectedCategory,
  filteredApps,
  onSearchChange,
  onCategoryChange,
  pinnedTaskbar,
  pinnedDesktop,
  onToggleTaskbarPin,
  onToggleDesktopPin,
}) {
  const searchRef  = useRef(null);
  const [ctxMenu, setCtxMenu] = useState(null); // { app, x, y }

  // Auto-focus search when opened
  useEffect(() => {
    if (open) setTimeout(() => searchRef.current?.focus(), 80);
  }, [open]);

  const handleAppRightClick = (e, app) => {
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu({ app, x: e.clientX, y: e.clientY });
  };

  const handleAppClick = (app) => {
    onOpenApp(app);
    onClose();
  };

  const categories = ["All", ...DESKTOP_CATEGORIES];

  return (
    <>
      <AnimatePresence>
        {open && (
          <>
            {/* Backdrop */}
            <motion.div
              className="fixed inset-0 z-[9990]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              style={{ background: "rgba(0,0,0,0.35)", backdropFilter: "blur(4px)" }}
              onClick={onClose}
            />

            {/* Launcher panel */}
            <motion.div
              className="fixed z-[9995] flex flex-col"
              style={{
                bottom: 60,
                left: 8,
                width: 520,
                maxHeight: "calc(100vh - 100px)",
                background: "rgba(10, 18, 36, 0.97)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 18,
                boxShadow: "0 32px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.05) inset",
                backdropFilter: "blur(40px)",
                overflow: "hidden",
              }}
              initial={{ opacity: 0, y: 24, scale: 0.97 }}
              animate={{ opacity: 1, y: 0,  scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.97 }}
              transition={{ type: "spring", stiffness: 380, damping: 30 }}
              onClick={e => e.stopPropagation()}
            >
              {/* ── Header ──────────────────────────────────────────────── */}
              <div className="px-4 pt-4 pb-3 border-b border-white/8 shrink-0">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg bg-emerald-500 flex items-center justify-center">
                      <span className="text-xs">🖥️</span>
                    </div>
                    <span className="text-white font-semibold text-sm">App Launcher</span>
                  </div>
                  <button
                    onClick={onClose}
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-500 hover:text-white hover:bg-white/10 transition-all"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Search bar */}
                <div
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
                  style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.08)" }}
                >
                  <Search className="w-4 h-4 text-slate-400 shrink-0" />
                  <input
                    ref={searchRef}
                    value={searchQuery}
                    onChange={e => onSearchChange(e.target.value)}
                    placeholder="Search apps…"
                    className="flex-1 bg-transparent text-white text-sm placeholder-slate-500 outline-none"
                  />
                  {searchQuery && (
                    <button onClick={() => onSearchChange("")} className="text-slate-500 hover:text-white transition-colors">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* ── Category tabs ────────────────────────────────────────── */}
              <div className="flex gap-1.5 px-4 py-2.5 overflow-x-auto shrink-0" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                {categories.map(cat => {
                  const isActive = selectedCategory === cat;
                  return (
                    <button
                      key={cat}
                      onClick={() => onCategoryChange(cat)}
                      className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap"
                      style={{
                        background: isActive ? "#10b981" : "rgba(255,255,255,0.07)",
                        color:      isActive ? "#fff"    : "#94a3b8",
                        border:     isActive ? "1px solid #10b98155" : "1px solid rgba(255,255,255,0.06)",
                      }}
                    >
                      <span className="text-[11px]">{CATEGORY_ICONS[cat] || "📁"}</span>
                      {cat}
                    </button>
                  );
                })}
              </div>

              {/* ── App Grid ─────────────────────────────────────────────── */}
              <div className="flex-1 overflow-y-auto p-4">
                {filteredApps.length === 0 ? (
                  <div className="py-14 text-center">
                    <span className="text-5xl block mb-3">🔍</span>
                    <p className="text-slate-400 text-sm">No apps match your search</p>
                    <button
                      onClick={() => { onSearchChange(""); onCategoryChange("All"); }}
                      className="mt-3 text-xs text-emerald-400 hover:text-emerald-300 transition-colors"
                    >
                      Clear filters
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-5 gap-1">
                    {filteredApps.map(app => {
                      const isTaskbarPinned = pinnedTaskbar.includes(app.id);
                      return (
                        <button
                          key={app.id}
                          onClick={() => handleAppClick(app)}
                          onContextMenu={e => handleAppRightClick(e, app)}
                          className="relative flex flex-col items-center gap-2 p-3 rounded-xl transition-all group"
                          style={{ outline: "none" }}
                          onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.08)"}
                          onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                        >
                          {/* Icon */}
                          <div
                            className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl transition-transform group-hover:scale-110 group-active:scale-95"
                            style={{
                              background: `${app.color}1a`,
                              border: `1px solid ${app.color}33`,
                              boxShadow: `0 4px 16px ${app.color}22`,
                            }}
                          >
                            {app.icon}
                          </div>

                          {/* Name */}
                          <span className="text-[10px] text-slate-400 group-hover:text-slate-200 text-center leading-tight line-clamp-2 transition-colors w-full">
                            {app.name}
                          </span>

                          {/* Taskbar pin indicator */}
                          {isTaskbarPinned && (
                            <span
                              className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-emerald-400"
                              title="Pinned to taskbar"
                            />
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* ── Footer ───────────────────────────────────────────────── */}
              <div
                className="shrink-0 flex items-center justify-between px-4 py-2.5"
                style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
              >
                <span className="text-[11px] text-slate-600">
                  {filteredApps.length} app{filteredApps.length !== 1 ? "s" : ""}
                  {selectedCategory !== "All" ? ` in ${selectedCategory}` : ""}
                </span>
                <span className="text-[11px] text-slate-600">
                  Right-click to pin · Esc to close
                </span>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Context Menu */}
      {ctxMenu && (
        <ContextMenu
          app={ctxMenu.app}
          x={ctxMenu.x}
          y={ctxMenu.y}
          onClose={() => setCtxMenu(null)}
          onOpenApp={handleAppClick}
          onToggleTaskbar={onToggleTaskbarPin}
          onToggleDesktop={onToggleDesktopPin}
          isPinnedTaskbar={pinnedTaskbar.includes(ctxMenu.app.id)}
          isPinnedDesktop={pinnedDesktop.includes(ctxMenu.app.id)}
        />
      )}
    </>
  );
}