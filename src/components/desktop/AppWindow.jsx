import React, { useRef, useEffect, useState, useCallback } from "react";
import { X, Minus, Square, Maximize2, ExternalLink } from "lucide-react";

export default function AppWindow({
  win,
  onClose,
  onFocus,
  onMinimize,
  onMaximize,
  onMove,
  onResize,
}) {
  const windowRef = useRef(null);

  // ── Drag ──────────────────────────────────────────────────────────────────
  const handleDragMouseDown = useCallback((e) => {
    if (win.maximized) return;
    e.preventDefault();
    onFocus(win.id);
    const startX = e.clientX - win.x;
    const startY = e.clientY - win.y;

    const handleMouseMove = (me) => {
      const nx = Math.max(0, me.clientX - startX);
      const ny = Math.max(0, me.clientY - startY);
      onMove(win.id, nx, ny);
    };
    const handleMouseUp = () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  }, [win, onFocus, onMove]);

  // ── Resize ─────────────────────────────────────────────────────────────────
  const handleResizeMouseDown = useCallback((e) => {
    if (win.maximized) return;
    e.preventDefault();
    e.stopPropagation();
    onFocus(win.id);
    const startX = e.clientX;
    const startY = e.clientY;
    const startW = win.w;
    const startH = win.h;

    const onMouseMove = (me) => {
      const nw = Math.max(400, startW + me.clientX - startX);
      const nh = Math.max(300, startH + me.clientY - startY);
      onResize?.(win.id, nw, nh);
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onUp);
  }, [win, onFocus, onResize]);

  if (win.minimized) return null;

  const style = win.maximized
    ? { left: 0, top: 0, width: "calc(100vw)", height: "calc(100vh - 52px)", zIndex: win.z }
    : { left: win.x, top: win.y, width: win.w, height: win.h, zIndex: win.z };

  const appUrl = window.location.origin + win.route;

  return (
    <div
      ref={windowRef}
      className="absolute rounded-xl shadow-2xl flex flex-col overflow-hidden border border-white/20"
      style={{ ...style, position: "absolute", minWidth: 400, minHeight: 300, background: "#1e293b" }}
      onMouseDown={() => onFocus(win.id)}
    >
      {/* Title bar */}
      <div
        className="flex items-center gap-2 px-3 py-2 bg-slate-800 border-b border-slate-700 select-none cursor-default"
        onMouseDown={handleDragMouseDown}
        style={{ cursor: win.maximized ? "default" : "move" }}
      >
        {/* Traffic lights */}
        <button
          onMouseDown={e => e.stopPropagation()}
          onClick={() => onClose(win.id)}
          className="w-3 h-3 rounded-full bg-red-500 hover:bg-red-600 transition-colors flex items-center justify-center group"
          title="Close"
        >
          <X className="w-2 h-2 text-red-900 opacity-0 group-hover:opacity-100" />
        </button>
        <button
          onMouseDown={e => e.stopPropagation()}
          onClick={() => onMinimize(win.id)}
          className="w-3 h-3 rounded-full bg-yellow-400 hover:bg-yellow-500 transition-colors flex items-center justify-center group"
          title="Minimize"
        >
          <Minus className="w-2 h-2 text-yellow-900 opacity-0 group-hover:opacity-100" />
        </button>
        <button
          onMouseDown={e => e.stopPropagation()}
          onClick={() => onMaximize(win.id)}
          className="w-3 h-3 rounded-full bg-green-500 hover:bg-green-600 transition-colors flex items-center justify-center group"
          title="Maximize"
        >
          <Maximize2 className="w-1.5 h-1.5 text-green-900 opacity-0 group-hover:opacity-100" />
        </button>

        {/* Title */}
        <div className="flex items-center gap-2 flex-1 min-w-0 justify-center">
          <span className="text-sm">{win.icon}</span>
          <span className="text-xs font-medium text-slate-300 truncate">{win.title}</span>
        </div>

        {/* Open in tab */}
        <a
          href={win.route}
          target="_blank"
          rel="noopener noreferrer"
          onMouseDown={e => e.stopPropagation()}
          className="text-slate-500 hover:text-slate-300 transition-colors"
          title="Open in new tab"
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>

      {/* Content */}
      <div className="flex-1 bg-white overflow-hidden relative">
        <iframe
          src={appUrl}
          className="w-full h-full border-none"
          title={win.title}
          sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-top-navigation-by-user-activation"
        />
      </div>

      {/* Resize handle */}
      {!win.maximized && (
        <div
          className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize"
          onMouseDown={handleResizeMouseDown}
          style={{
            background: "linear-gradient(135deg, transparent 50%, rgba(148,163,184,0.4) 50%)",
            borderBottomRightRadius: 12,
          }}
        />
      )}
    </div>
  );
}