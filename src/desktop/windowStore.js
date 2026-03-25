import { useState, useCallback, useRef } from "react";

let nextId = 1;

const DEFAULT_SIZE = { w: 900, h: 600 };
const DEFAULT_POS  = () => ({ x: 60 + Math.random() * 80, y: 40 + Math.random() * 60 });

export function useWindowManager() {
  const [windows, setWindows] = useState([]);
  const topZ = useRef(100);

  const openWindow = useCallback((app) => {
    setWindows(prev => {
      const existing = prev.find(w => w.appId === app.id && !w.closed);
      if (existing) {
        // focus & unminimize
        topZ.current += 1;
        return prev.map(w =>
          w.id === existing.id
            ? { ...w, minimized: false, z: topZ.current }
            : w
        );
      }
      topZ.current += 1;
      const pos = DEFAULT_POS();
      return [...prev, {
        id: nextId++,
        appId: app.id,
        title: app.name,
        icon: app.icon,
        route: app.route,
        x: pos.x,
        y: pos.y,
        w: DEFAULT_SIZE.w,
        h: DEFAULT_SIZE.h,
        z: topZ.current,
        minimized: false,
        maximized: false,
        closed: false,
      }];
    });
  }, []);

  const closeWindow = useCallback((id) => {
    setWindows(prev => prev.filter(w => w.id !== id));
  }, []);

  const focusWindow = useCallback((id) => {
    topZ.current += 1;
    const z = topZ.current;
    setWindows(prev => prev.map(w =>
      w.id === id ? { ...w, z, minimized: false } : w
    ));
  }, []);

  const minimizeWindow = useCallback((id) => {
    setWindows(prev => prev.map(w =>
      w.id === id ? { ...w, minimized: !w.minimized } : w
    ));
  }, []);

  const maximizeWindow = useCallback((id) => {
    setWindows(prev => prev.map(w =>
      w.id === id ? { ...w, maximized: !w.maximized } : w
    ));
  }, []);

  const moveWindow = useCallback((id, x, y) => {
    setWindows(prev => prev.map(w =>
      w.id === id ? { ...w, x, y } : w
    ));
  }, []);

  const resizeWindow = useCallback((id, w, h) => {
    setWindows(prev => prev.map(win =>
      win.id === id ? { ...win, w, h } : win
    ));
  }, []);

  const openWindows = windows.filter(w => !w.closed);

  return {
    windows: openWindows,
    openWindow,
    closeWindow,
    focusWindow,
    minimizeWindow,
    maximizeWindow,
    moveWindow,
    resizeWindow,
  };
}