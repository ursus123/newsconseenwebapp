import React, { useState, useRef, useCallback, useEffect } from "react";
import { DESKTOP_APPS } from "@/desktop/desktopApps";

// ── Grid constants ─────────────────────────────────────────────────────────────
const CELL_W   = 88;
const CELL_H   = 100;
const PAD_TOP  = 8;
const PAD_LEFT = 8;

function posToCell(x, y) {
  return {
    col: Math.max(0, Math.round((x - PAD_LEFT) / CELL_W)),
    row: Math.max(0, Math.round((y - PAD_TOP)  / CELL_H)),
  };
}
function cellToPos(col, row) {
  return { x: PAD_LEFT + col * CELL_W, y: PAD_TOP + row * CELL_H };
}

function savePositions(pos) {
  try { localStorage.setItem("desktop_icon_positions", JSON.stringify(pos)); } catch {}
}
function loadPositions() {
  try {
    const s = localStorage.getItem("desktop_icon_positions");
    return s ? JSON.parse(s) : null;
  } catch { return null; }
}

// ── Context menu ───────────────────────────────────────────────────────────────
function IconContextMenu({ app, x, y, isPinned, onOpen, onPin, onRemove, onClose }) {
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) { onClose(); window.dispatchEvent(new CustomEvent("icon-context-menu-close")); }
    };
    setTimeout(() => document.addEventListener("mousedown", handler), 0);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  const left = Math.min(x, window.innerWidth  - 220);
  const top  = Math.min(y, window.innerHeight - 200);

  return (
    <div
      ref={ref}
      style={{
        position: "fixed",
        left, top,
        zIndex: 99999,
        background: "rgba(8,15,30,0.97)",
        border: "1px solid rgba(255,255,255,0.13)",
        backdropFilter: "blur(24px)",
        borderRadius: 12,
        minWidth: 200,
        overflow: "hidden",
        boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
      }}
      onMouseDown={e => e.stopPropagation()}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
        <span style={{ fontSize: 20 }}>{app.icon}</span>
        <span style={{ color: "white", fontWeight: 600, fontSize: 13 }}>{app.name}</span>
      </div>
      <button style={menuBtnStyle} onClick={() => { onOpen(app); onClose(); }}>↗️ Open</button>
      <button style={menuBtnStyle} onClick={() => { onPin(app.id); onClose(); }}>
        {isPinned ? "📌 Unpin from Taskbar" : "📍 Pin to Taskbar"}
      </button>
      <div style={{ height: 1, background: "rgba(255,255,255,0.1)", margin: "2px 12px" }} />
      <button style={{ ...menuBtnStyle, color: "#f87171" }} onClick={() => { onRemove(app.id); onClose(); }}>
        🗑️ Remove from Desktop
      </button>
    </div>
  );
}

const menuBtnStyle = {
  display: "block",
  width: "100%",
  textAlign: "left",
  padding: "9px 16px",
  background: "none",
  border: "none",
  color: "#cbd5e1",
  fontSize: 13,
  cursor: "pointer",
};

// ── Single icon ────────────────────────────────────────────────────────────────
function DesktopIcon({ app, x, y, isDragging, isSelected, onMouseDown, onContextMenu }) {
  return (
    <div
      onMouseDown={onMouseDown}
      onContextMenu={onContextMenu}
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: CELL_W,
        zIndex: isDragging ? 9999 : (isSelected ? 100 : 10),
        transition: isDragging ? "none" : "left 0.15s ease, top 0.15s ease",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 6,
        cursor: "pointer",
        userSelect: "none",
      }}
    >
      <div style={{
        width: 56, height: 56,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 28,
        borderRadius: 16,
        background: isSelected ? `${app.color}44` : isDragging ? `${app.color}55` : `${app.color}22`,
        border: isSelected ? `2px solid ${app.color}cc` : `1.5px solid ${app.color}44`,
        boxShadow: isDragging
          ? `0 12px 32px rgba(0,0,0,0.5), 0 0 0 2px ${app.color}88`
          : isSelected
            ? `0 4px 16px rgba(0,0,0,0.4), 0 0 0 2px ${app.color}55`
            : "0 4px 12px rgba(0,0,0,0.3)",
        transform: isDragging ? "scale(1.12) rotate(-2deg)" : "scale(1)",
        transition: isDragging ? "none" : "all 0.15s ease",
      }}>
        {app.icon}
      </div>
      <span style={{
        color: "white",
        fontSize: 11,
        fontWeight: 600,
        textAlign: "center",
        textShadow: "0 1px 6px rgba(0,0,0,0.9)",
        background: isSelected ? "rgba(59,130,246,0.45)" : "transparent",
        borderRadius: 4,
        padding: "1px 4px",
        maxWidth: "100%",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      }}>
        {app.name}
      </span>
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────────
export default function DesktopIcons({ onOpenApp, pinnedDesktop, pinnedTaskbar = [], onToggleTaskbarPin, onToggleDesktopPin }) {
  const iconIds = (pinnedDesktop && pinnedDesktop.length > 0)
    ? pinnedDesktop
    : ["attendance", "people", "enterprises", "tasks", "transactions", "reports", "location", "settings"];

  const apps = iconIds.map(id => DESKTOP_APPS.find(a => a.id === id)).filter(Boolean);

  const [positions, setPositions] = useState(() => {
    const saved = loadPositions();
    if (saved && apps.every(a => saved[a.id] !== undefined)) return saved;
    const init = {};
    apps.forEach((app, i) => { init[app.id] = { col: 0, row: i }; });
    return init;
  });

  const [selectedId,  setSelectedId]  = useState(null);
  const [draggingId,  setDraggingId]  = useState(null);
  const [dragPos,     setDragPos]     = useState({ x: 0, y: 0 });
  const [contextMenu, setContextMenu] = useState(null);

  // Sync positions when pinnedDesktop changes
  useEffect(() => {
    setPositions(prev => {
      const next = { ...prev };
      let changed = false;
      apps.forEach((app, i) => {
        if (next[app.id] === undefined) {
          next[app.id] = { col: 0, row: i };
          changed = true;
        }
      });
      const activeIds = new Set(apps.map(a => a.id));
      Object.keys(next).forEach(id => {
        if (!activeIds.has(id)) { delete next[id]; changed = true; }
      });
      if (changed) savePositions(next);
      return changed ? next : prev;
    });
  }, [JSON.stringify(iconIds)]);

  // All drag state in a single ref — never causes re-renders mid-drag
  const drag = useRef({ down: false, active: false, appId: null, startMX: 0, startMY: 0, startIX: 0, startIY: 0, curX: 0, curY: 0 });

  const handleMouseDown = useCallback((e, app) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    setSelectedId(app.id);
    setContextMenu(null);

    const pos = positions[app.id] || { col: 0, row: 0 };
    const { x, y } = cellToPos(pos.col, pos.row);

    drag.current = { down: true, active: false, appId: app.id, startMX: e.clientX, startMY: e.clientY, startIX: x, startIY: y, curX: x, curY: y };
  }, [positions]);

  const handleContextMenu = useCallback((e, app) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedId(app.id);
    // Dispatch event so Desktop knows icon context menu is open and doesn't show desktop menu
    window.dispatchEvent(new CustomEvent("icon-context-menu-open"));
    setContextMenu({ app, x: e.clientX, y: e.clientY });
  }, []);

  // Global mouse move + up listeners — mounted once, read from ref
  useEffect(() => {
    const onMove = (e) => {
      if (!drag.current.down) return;
      const dx = e.clientX - drag.current.startMX;
      const dy = e.clientY - drag.current.startMY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (!drag.current.active) {
        if (dist < 6) return;
        drag.current.active = true;
        setDraggingId(drag.current.appId);
      }

      drag.current.curX = drag.current.startIX + dx;
      drag.current.curY = drag.current.startIY + dy;
      setDragPos({ x: drag.current.curX, y: drag.current.curY });
    };

    const onUp = (e) => {
      if (!drag.current.down) return;

      const { appId, active, curX, curY } = drag.current;
      drag.current.down = false;
      drag.current.active = false;
      drag.current.appId = null;

      if (active) {
        setDraggingId(null);
        const { col, row } = posToCell(curX, curY);
        setPositions(prev => {
          const next = { ...prev, [appId]: { col, row } };
          savePositions(next);
          return next;
        });
      } else {
        setDraggingId(null);
        // It's a click — open the app
        const app = DESKTOP_APPS.find(a => a.id === appId);
        if (app && onOpenApp) onOpenApp(app);
      }
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [onOpenApp]);

  return (
    <div
      style={{ position: "absolute", inset: 0 }}
      onClick={() => { setSelectedId(null); setContextMenu(null); }}
    >
      {apps.map(app => {
        const isD = draggingId === app.id;
        const pos = positions[app.id] || { col: 0, row: apps.indexOf(app) };
        const { x, y } = isD ? dragPos : cellToPos(pos.col, pos.row);

        return (
          <DesktopIcon
            key={app.id}
            app={app}
            x={x} y={y}
            isDragging={isD}
            isSelected={selectedId === app.id && !isD}
            onMouseDown={(e) => handleMouseDown(e, app)}
            onContextMenu={(e) => handleContextMenu(e, app)}
          />
        );
      })}

      {contextMenu && (
        <IconContextMenu
          app={contextMenu.app}
          x={contextMenu.x}
          y={contextMenu.y}
          isPinned={pinnedTaskbar.includes(contextMenu.app.id)}
          onOpen={onOpenApp}
          onPin={onToggleTaskbarPin}
          onRemove={onToggleDesktopPin}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}