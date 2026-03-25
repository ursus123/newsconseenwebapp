import React, { useRef, useCallback, useState } from "react";
import { X, Minus, Maximize2, Minimize2, ExternalLink } from "lucide-react";

const TITLE_H = 36;

// Edge/corner resize cursors & delta calculations
const RESIZE_HANDLES = [
  { id: "n",  cursor: "n-resize",  style: { top: 0, left: 4, right: 4, height: 5 } },
  { id: "s",  cursor: "s-resize",  style: { bottom: 0, left: 4, right: 4, height: 5 } },
  { id: "w",  cursor: "w-resize",  style: { left: 0, top: 4, bottom: 4, width: 5 } },
  { id: "e",  cursor: "e-resize",  style: { right: 0, top: 4, bottom: 4, width: 5 } },
  { id: "nw", cursor: "nw-resize", style: { top: 0, left: 0, width: 10, height: 10 } },
  { id: "ne", cursor: "ne-resize", style: { top: 0, right: 0, width: 10, height: 10 } },
  { id: "sw", cursor: "sw-resize", style: { bottom: 0, left: 0, width: 10, height: 10 } },
  { id: "se", cursor: "se-resize", style: { bottom: 0, right: 0, width: 10, height: 10 } },
];

export default function AppWindow({ win, onClose, onFocus, onMinimize, onMaximize, onMove, onResize }) {
  const [isDragging, setIsDragging] = useState(false);

  // ── Drag title bar ────────────────────────────────────────────────────────
  const handleTitleMouseDown = useCallback((e) => {
    if (win.maximized || e.button !== 0) return;
    e.preventDefault();
    onFocus(win.id);
    setIsDragging(true);

    const ox = e.clientX - win.x;
    const oy = e.clientY - win.y;

    const onMouseMove = (me) => {
      onMove(win.id, me.clientX - ox, me.clientY - oy);
    };
    const onMouseUp = () => {
      setIsDragging(false);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }, [win, onFocus, onMove]);

  // ── Resize from any edge/corner ───────────────────────────────────────────
  const handleResizeMouseDown = useCallback((e, handleId) => {
    if (win.maximized || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    onFocus(win.id);

    const startX  = e.clientX;
    const startY  = e.clientY;
    const startW  = win.width;
    const startH  = win.height;
    const startPX = win.x;
    const startPY = win.y;

    const onMouseMove = (me) => {
      const dx = me.clientX - startX;
      const dy = me.clientY - startY;

      let nw = startW, nh = startH, nx = startPX, ny = startPY;

      if (handleId.includes("e")) nw = startW + dx;
      if (handleId.includes("s")) nh = startH + dy;
      if (handleId.includes("w")) { nw = startW - dx; nx = startPX + dx; }
      if (handleId.includes("n")) { nh = startH - dy; ny = startPY + dy; }

      onResize(
        win.id,
        Math.max(380, nw),
        Math.max(280, nh),
        handleId.includes("w") ? nx : undefined,
        handleId.includes("n") ? ny : undefined,
      );
    };
    const onMouseUp = () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }, [win, onFocus, onResize]);

  // ── Double-click title = maximize toggle ─────────────────────────────────
  const handleTitleDblClick = useCallback(() => {
    onMaximize(win.id);
  }, [win.id, onMaximize]);

  if (win.minimized) return null;

  const winStyle = win.maximized
    ? {
        left: win.x,
        top:  win.y,
        width:  win.width,
        height: win.height,
        zIndex: win.zIndex,
        borderRadius: 0,
      }
    : {
        left:   win.x,
        top:    win.y,
        width:  win.width,
        height: win.height,
        zIndex: win.zIndex,
      };

  const appUrl = window.location.origin + win.page;

  return (
    <div
      className="absolute flex flex-col overflow-hidden shadow-2xl"
      style={{
        ...winStyle,
        position: "absolute",
        borderRadius: win.maximized ? 0 : 12,
        border: "1px solid rgba(255,255,255,0.12)",
        background: "#0f172a",
        // Pointer events always on, but disable iframe events while dragging to prevent steal
        userSelect: isDragging ? "none" : "auto",
      }}
      onMouseDown={() => onFocus(win.id)}
    >
      {/* ── Title bar ───────────────────────────────────────────────────────── */}
      <div
        className="flex items-center gap-2 px-3 shrink-0 select-none"
        style={{
          height: TITLE_H,
          background: "rgba(30, 41, 59, 0.98)",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          cursor: win.maximized ? "default" : "move",
        }}
        onMouseDown={handleTitleMouseDown}
        onDoubleClick={handleTitleDblClick}
      >
        {/* Traffic lights */}
        <div className="flex items-center gap-1.5" onMouseDown={e => e.stopPropagation()}>
          <button
            onClick={() => onClose(win.id)}
            className="w-3 h-3 rounded-full bg-red-500 hover:bg-red-400 transition-colors group flex items-center justify-center"
            title="Close"
          >
            <X className="w-2 h-2 text-red-900 opacity-0 group-hover:opacity-100" />
          </button>
          <button
            onClick={() => onMinimize(win.id)}
            className="w-3 h-3 rounded-full bg-yellow-400 hover:bg-yellow-300 transition-colors group flex items-center justify-center"
            title="Minimize"
          >
            <Minus className="w-2 h-2 text-yellow-900 opacity-0 group-hover:opacity-100" />
          </button>
          <button
            onClick={() => onMaximize(win.id)}
            className="w-3 h-3 rounded-full bg-green-500 hover:bg-green-400 transition-colors group flex items-center justify-center"
            title={win.maximized ? "Restore" : "Maximize"}
          >
            {win.maximized
              ? <Minimize2 className="w-1.5 h-1.5 text-green-900 opacity-0 group-hover:opacity-100" />
              : <Maximize2 className="w-1.5 h-1.5 text-green-900 opacity-0 group-hover:opacity-100" />
            }
          </button>
        </div>

        {/* Title */}
        <div className="flex items-center gap-2 flex-1 min-w-0 justify-center pointer-events-none">
          <span className="text-base leading-none">{win.icon}</span>
          <span className="text-xs font-medium text-slate-300 truncate">{win.title}</span>
        </div>

        {/* Open in full tab */}
        <a
          href={win.page}
          target="_blank"
          rel="noopener noreferrer"
          onMouseDown={e => e.stopPropagation()}
          className="text-slate-600 hover:text-slate-300 transition-colors"
          title="Open in new tab"
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>

      {/* ── Content area ────────────────────────────────────────────────────── */}
      <div className="flex-1 relative overflow-hidden bg-white">
        {/* Drag shield: prevents iframe stealing mouse events during drag */}
        {isDragging && (
          <div className="absolute inset-0 z-10" style={{ cursor: "move" }} />
        )}
        <iframe
          src={appUrl}
          className="w-full h-full border-none"
          title={win.title}
          sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals allow-top-navigation-by-user-activation"
          loading="lazy"
        />
      </div>

      {/* ── Resize handles (8 directions) ────────────────────────────────────── */}
      {!win.maximized && RESIZE_HANDLES.map(h => (
        <div
          key={h.id}
          className="absolute z-20"
          style={{ ...h.style, cursor: h.cursor }}
          onMouseDown={e => handleResizeMouseDown(e, h.id)}
        />
      ))}
    </div>
  );
}