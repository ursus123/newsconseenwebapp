import React, { useState, useRef, useCallback, useEffect } from "react";
import { DESKTOP_APPS } from "@/desktop/desktopApps";

// ── Grid constants ─────────────────────────────────────────────────────────────
const CELL_W   = 88;   // px per column
const CELL_H   = 100;  // px per row
const PAD_TOP  = 8;    // top padding inside grid
const PAD_LEFT = 8;    // left padding

function posToCell(x, y) {
  return {
    col: Math.max(0, Math.round((x - PAD_LEFT) / CELL_W)),
    row: Math.max(0, Math.round((y - PAD_TOP)  / CELL_H)),
  };
}
function cellToPos(col, row) {
  return { x: PAD_LEFT + col * CELL_W, y: PAD_TOP + row * CELL_H };
}

// ── Context menu ───────────────────────────────────────────────────────────────
function IconContextMenu({ app, pos, onOpen, onPin, onRemove, onClose, isPinned }) {
  const menuRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  // Clamp to viewport
  const left = Math.min(pos.x, window.innerWidth  - 210);
  const top  = Math.min(pos.y, window.innerHeight - 180);

  return (
    <div
      ref={menuRef}
      className="fixed z-[10001] rounded-xl overflow-hidden shadow-2xl select-none"
      style={{
        left, top,
        background: "rgba(8,15,30,0.97)",
        border: "1px solid rgba(255,255,255,0.13)",
        backdropFilter: "blur(24px)",
        minWidth: 200,
      }}
      onClick={e => e.stopPropagation()}
    >
      {/* App header */}
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-white/10">
        <span className="text-xl">{app.icon}</span>
        <span className="text-white text-sm font-semibold truncate">{app.name}</span>
      </div>

      <button
        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-300 hover:bg-white/10 hover:text-white transition-colors text-left"
        onClick={() => { onOpen(app); onClose(); }}
      >
        <span>↗️</span> Open
      </button>

      <button
        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-300 hover:bg-white/10 hover:text-white transition-colors text-left"
        onClick={() => { onPin(app.id); onClose(); }}
      >
        <span>{isPinned ? "📌" : "📍"}</span>
        {isPinned ? "Unpin from Taskbar" : "Pin to Taskbar"}
      </button>

      <div className="h-px bg-white/10 mx-3" />

      <button
        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-rose-400 hover:bg-rose-500/10 hover:text-rose-300 transition-colors text-left"
        onClick={() => { onRemove(app.id); onClose(); }}
      >
        <span>🗑️</span> Remove from Desktop
      </button>
    </div>
  );
}

// ── Single icon ────────────────────────────────────────────────────────────────
function DesktopIcon({
  app, x, y,
  isDragging, isSelected,
  onMouseDown,
  onContextMenu,
}) {
  return (
    <div
      className="absolute flex flex-col items-center gap-1.5 cursor-pointer group select-none"
      style={{
        left: x,
        top:  y,
        width: CELL_W,
        zIndex: isDragging ? 9999 : (isSelected ? 100 : 10),
        transition: isDragging ? "none" : "left 0.15s ease, top 0.15s ease",
      }}
      onMouseDown={onMouseDown}
      onContextMenu={onContextMenu}
    >
      {/* Icon shell */}
      <div
        className="flex items-center justify-center text-3xl rounded-2xl transition-all duration-150"
        style={{
          width: 56, height: 56,
          background: isSelected
            ? `${app.color}44`
            : isDragging
              ? `${app.color}55`
              : `${app.color}22`,
          border: isSelected
            ? `2px solid ${app.color}cc`
            : `1.5px solid ${app.color}44`,
          boxShadow: isDragging
            ? `0 12px 32px rgba(0,0,0,0.5), 0 0 0 2px ${app.color}88`
            : isSelected
              ? `0 4px 16px rgba(0,0,0,0.4), 0 0 0 2px ${app.color}55`
              : "0 4px 12px rgba(0,0,0,0.3)",
          transform: isDragging ? "scale(1.12) rotate(-2deg)" : "scale(1)",
        }}
      >
        {app.icon}
      </div>

      {/* Label */}
      <span
        className="text-[11px] font-semibold text-center leading-tight px-1 max-w-full truncate"
        style={{
          color: "white",
          textShadow: "0 1px 6px rgba(0,0,0,0.9), 0 0 2px rgba(0,0,0,0.8)",
          background: isSelected ? "rgba(59,130,246,0.45)" : "transparent",
          borderRadius: 4,
          padding: "1px 4px",
        }}
      >
        {app.name}
      </span>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function DesktopIcons({
  onOpenApp,
  pinnedDesktop,
  pinnedTaskbar = [],
  onToggleTaskbarPin,
  onToggleDesktopPin,
}) {
  const containerRef = useRef(null);

  // Build initial positions from pinnedDesktop list → column layout
  const iconIds = pinnedDesktop && pinnedDesktop.length > 0
    ? pinnedDesktop
    : ["attendance", "people", "enterprises", "tasks", "transactions", "reports", "location", "settings"];

  const apps = iconIds.map(id => DESKTOP_APPS.find(a => a.id === id)).filter(Boolean);

  // State: icon positions { [id]: {col, row} }
  const [positions, setPositions] = useState(() => {
    try {
      const saved = localStorage.getItem("desktop_icon_positions");
      if (saved) {
        const parsed = JSON.parse(saved);
        // Validate all current icons have positions
        const allPresent = apps.every(a => parsed[a.id]);
        if (allPresent) return parsed;
      }
    } catch {}
    // Default: 1 column on the left
    const init = {};
    apps.forEach((app, i) => { init[app.id] = { col: 0, row: i }; });
    return init;
  });

  const [selectedId,  setSelectedId]  = useState(null);
  const [contextMenu, setContextMenu] = useState(null); // { app, x, y }

  // Drag state (ref to avoid re-render)
  const drag = useRef({
    active: false,
    appId:  null,
    startMouseX: 0,
    startMouseY: 0,
    startIconX:  0,
    startIconY:  0,
    currentX: 0,
    currentY: 0,
  });
  const [draggingId, setDraggingId] = useState(null);
  const [dragPos,    setDragPos]    = useState({ x: 0, y: 0 });

  // Sync positions when pinnedDesktop changes (add/remove icons)
  useEffect(() => {
    setPositions(prev => {
      const next = { ...prev };
      let changed = false;

      // Add missing icons
      apps.forEach((app, i) => {
        if (!next[app.id]) {
          // Find a free cell
          const occupied = new Set(Object.values(next).map(p => `${p.col},${p.row}`));
          let row = i;
          while (occupied.has(`0,${row}`)) row++;
          next[app.id] = { col: 0, row };
          changed = true;
        }
      });

      // Remove icons no longer in desktop
      const activeIds = new Set(apps.map(a => a.id));
      Object.keys(next).forEach(id => {
        if (!activeIds.has(id)) { delete next[id]; changed = true; }
      });

      if (changed) localStorage.setItem("desktop_icon_positions", JSON.stringify(next));
      return changed ? next : prev;
    });
  }, [JSON.stringify(iconIds)]);

  const savePositions = useCallback((pos) => {
    localStorage.setItem("desktop_icon_positions", JSON.stringify(pos));
  }, []);

  const DRAG_THRESHOLD = 6; // px before we commit to a drag

  // ── Drag handlers ────────────────────────────────────────────────────────────
  const onMouseDown = useCallback((e, app) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    setSelectedId(app.id);

    const pos  = positions[app.id] || { col: 0, row: 0 };
    const { x, y } = cellToPos(pos.col, pos.row);

    drag.current = {
      active: false,       // not dragging yet — waiting for threshold
      appId:  app.id,
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      startIconX:  x,
      startIconY:  y,
      currentX: x,
      currentY: y,
    };
  }, [positions]);

  useEffect(() => {
    const onMove = (e) => {
      if (!drag.current.appId) return;
      const dx = e.clientX - drag.current.startMouseX;
      const dy = e.clientY - drag.current.startMouseY;

      // Only commit to drag once threshold is exceeded
      if (!drag.current.active) {
        if (Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return;
        drag.current.active = true;
        setDraggingId(drag.current.appId);
      }

      const newX = drag.current.startIconX + dx;
      const newY = drag.current.startIconY + dy;
      drag.current.currentX = newX;
      drag.current.currentY = newY;
      setDragPos({ x: newX, y: newY });
    };

    const onUp = (e) => {
      if (!drag.current.appId) return;
      const { appId, active, currentX, currentY } = drag.current;
      drag.current.appId  = null;
      drag.current.active = false;

      if (active) {
        // Snap to grid cell after drag
        const { col, row } = posToCell(currentX, currentY);
        setPositions(prev => {
          const next = { ...prev, [appId]: { col, row } };
          savePositions(next);
          return next;
        });
        setDraggingId(null);
      } else {
        // No drag movement → treat as click → open app
        const app = DESKTOP_APPS.find(a => a.id === appId);
        if (app) onOpenApp(app);
        setDraggingId(null);
      }
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup",   onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup",   onUp);
    };
  }, [savePositions, onOpenApp]);

  // ── Context menu ─────────────────────────────────────────────────────────────
  const handleContextMenu = useCallback((e, app) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedId(app.id);
    setContextMenu({ app, x: e.clientX, y: e.clientY });
  }, []);

  // Click on desktop background → deselect
  const handleBgClick = useCallback(() => {
    setSelectedId(null);
    setContextMenu(null);
  }, []);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0"
      onClick={handleBgClick}
    >
      {apps.map(app => {
        const isDragging  = draggingId === app.id;
        const isSelected  = selectedId === app.id && !isDragging;
        const pos         = positions[app.id] || { col: 0, row: apps.indexOf(app) };
        const { x, y }   = isDragging ? dragPos : cellToPos(pos.col, pos.row);

        return (
          <DesktopIcon
            key={app.id}
            app={app}
            x={x}
            y={y}
            isDragging={isDragging}
            isSelected={isSelected}
            onMouseDown={(e) => onMouseDown(e, app)}
            onContextMenu={(e) => handleContextMenu(e, app)}
          />
        );
      })}

      {/* Context menu */}
      {contextMenu && (
        <IconContextMenu
          app={contextMenu.app}
          pos={{ x: contextMenu.x, y: contextMenu.y }}
          isPinned={pinnedTaskbar.includes(contextMenu.app.id)}
          onOpen={onOpenApp}
          onPin={onToggleTaskbarPin}
          onRemove={(id) => { onToggleDesktopPin(id); }}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}