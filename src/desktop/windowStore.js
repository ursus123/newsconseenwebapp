import { useState, useCallback, useRef } from "react";

let nextId = 1;

const TASKBAR_H   = 52;
const TOP_BAR_H   = 32;
const DEFAULT_W   = 900;
const DEFAULT_H   = 580;
const MIN_W       = 380;
const MIN_H       = 280;

function clampPos(x, y, w, h) {
  const maxX = Math.max(0, window.innerWidth  - w);
  const maxY = Math.max(TOP_BAR_H, window.innerHeight - TASKBAR_H - h);
  return {
    x: Math.min(Math.max(0, x), maxX),
    y: Math.min(Math.max(TOP_BAR_H, y), maxY),
  };
}

function randomPos() {
  const x = 80 + Math.floor(Math.random() * 140);
  const y = TOP_BAR_H + 20 + Math.floor(Math.random() * 80);
  return { x, y };
}

export function useWindowManager() {
  const [windows, setWindows] = useState([]);
  const zCounter = useRef(10);

  const nextZ = () => { zCounter.current += 1; return zCounter.current; };

  // ── Open ─────────────────────────────────────────────────────────────────
  const openWindow = useCallback((app) => {
    setWindows(prev => {
      const existing = prev.find(w => w.appId === app.id);
      if (existing) {
        // already open — focus & restore
        return prev.map(w =>
          w.id === existing.id
            ? { ...w, minimized: false, zIndex: nextZ() }
            : w
        );
      }
      const { x, y } = randomPos();
      return [...prev, {
        id: nextId++,
        appId:     app.id,
        title:     app.name,
        icon:      app.icon,
        page:      app.route,            // renamed to `page` per spec
        x, y,
        width:     DEFAULT_W,
        height:    DEFAULT_H,
        // save pre-maximize position/size
        prevX: x, prevY: y, prevW: DEFAULT_W, prevH: DEFAULT_H,
        zIndex:    nextZ(),
        minimized: false,
        maximized: false,
      }];
    });
  }, []);

  // ── Close ─────────────────────────────────────────────────────────────────
  const closeWindow = useCallback((id) => {
    setWindows(prev => prev.filter(w => w.id !== id));
  }, []);

  // ── Focus ─────────────────────────────────────────────────────────────────
  const focusWindow = useCallback((id) => {
    const z = nextZ();
    setWindows(prev => prev.map(w =>
      w.id === id ? { ...w, zIndex: z, minimized: false } : w
    ));
  }, []);

  // ── Minimize ──────────────────────────────────────────────────────────────
  const minimizeWindow = useCallback((id) => {
    setWindows(prev => prev.map(w =>
      w.id === id ? { ...w, minimized: true } : w
    ));
  }, []);

  // ── Maximize / Restore ────────────────────────────────────────────────────
  const maximizeWindow = useCallback((id) => {
    setWindows(prev => prev.map(w => {
      if (w.id !== id) return w;
      if (w.maximized) {
        // restore
        return {
          ...w,
          maximized: false,
          x: w.prevX, y: w.prevY,
          width: w.prevW, height: w.prevH,
        };
      }
      // maximize — save current position first
      return {
        ...w,
        maximized: true,
        prevX: w.x, prevY: w.y, prevW: w.width, prevH: w.height,
        x: 0,
        y: TOP_BAR_H,
        width:  window.innerWidth,
        height: window.innerHeight - TASKBAR_H - TOP_BAR_H,
        zIndex: nextZ(),
      };
    }));
  }, []);

  // ── Restore (from minimized) ───────────────────────────────────────────────
  const restoreWindow = useCallback((id) => {
    const z = nextZ();
    setWindows(prev => prev.map(w =>
      w.id === id ? { ...w, minimized: false, zIndex: z } : w
    ));
  }, []);

  // ── Move ──────────────────────────────────────────────────────────────────
  const moveWindow = useCallback((id, x, y) => {
    setWindows(prev => prev.map(w => {
      if (w.id !== id || w.maximized) return w;
      const clamped = clampPos(x, y, w.width, w.height);
      return { ...w, ...clamped };
    }));
  }, []);

  // ── Resize ────────────────────────────────────────────────────────────────
  const resizeWindow = useCallback((id, width, height, x, y) => {
    setWindows(prev => prev.map(w => {
      if (w.id !== id || w.maximized) return w;
      const nw = Math.max(MIN_W, width);
      const nh = Math.max(MIN_H, height);
      const update = { ...w, width: nw, height: nh };
      // x/y only change when resizing from left/top edges
      if (x !== undefined) update.x = x;
      if (y !== undefined) update.y = y;
      return update;
    }));
  }, []);

  // Return sorted by zIndex so highest renders last (on top)
  const sorted = [...windows].sort((a, b) => a.zIndex - b.zIndex);

  return {
    windows: sorted,
    openWindow,
    closeWindow,
    focusWindow,
    minimizeWindow,
    maximizeWindow,
    restoreWindow,
    moveWindow,
    resizeWindow,
    TASKBAR_H,
    TOP_BAR_H,
  };
}