import React, { useState, useCallback } from "react";
import {
  DEFAULT_DESKTOP_ICONS,
  DEFAULT_PINNED,
  getAppSearchText,
  getVisibleDesktopApps,
} from "./desktopApps";

const PINNED_KEY = "desktop_pinned_apps";
const DESKTOP_PINNED_KEY = "desktop_icon_apps";

function loadPinned() {
  try {
    const raw = localStorage.getItem(PINNED_KEY);
    return raw ? JSON.parse(raw) : DEFAULT_PINNED;
  } catch { return DEFAULT_PINNED; }
}

function loadDesktopPinned() {
  try {
    const raw = localStorage.getItem(DESKTOP_PINNED_KEY);
    return raw ? JSON.parse(raw) : DEFAULT_DESKTOP_ICONS;
  } catch { return DEFAULT_DESKTOP_ICONS; }
}

export function useLauncherStore(user) {
  const [isOpen, setIsOpen]           = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [pinnedTaskbar, setPinnedTaskbar]       = useState(loadPinned);
  const [pinnedDesktop, setPinnedDesktop]       = useState(loadDesktopPinned);

  const openLauncher  = useCallback(() => { setIsOpen(true);  setSearchQuery(""); setSelectedCategory("All"); }, []);
  const closeLauncher = useCallback(() => { setIsOpen(false); setSearchQuery(""); }, []);
  const toggleLauncher = useCallback(() => setIsOpen(v => !v), []);

  const updateSearchQuery   = useCallback((q) => setSearchQuery(q), []);
  const updateCategory      = useCallback((c) => setSelectedCategory(c), []);

  const visibleApps = getVisibleDesktopApps(user);
  const filteredApps = visibleApps.filter(app => {
    const matchCat = selectedCategory === "All" || app.category === selectedCategory;
    const matchQ   = !searchQuery || getAppSearchText(app).includes(searchQuery.toLowerCase());
    return matchCat && matchQ;
  });

  // Taskbar pinning
  const pinToTaskbar = useCallback((appId) => {
    setPinnedTaskbar(prev => {
      if (prev.includes(appId)) return prev;
      const next = [...prev, appId];
      localStorage.setItem(PINNED_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const unpinFromTaskbar = useCallback((appId) => {
    setPinnedTaskbar(prev => {
      const next = prev.filter(id => id !== appId);
      localStorage.setItem(PINNED_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const toggleTaskbarPin = useCallback((appId) => {
    setPinnedTaskbar(prev => {
      const next = prev.includes(appId) ? prev.filter(id => id !== appId) : [...prev, appId];
      localStorage.setItem(PINNED_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  // Desktop pinning
  const toggleDesktopPin = useCallback((appId) => {
    setPinnedDesktop(prev => {
      const next = prev.includes(appId) ? prev.filter(id => id !== appId) : [...prev, appId];
      localStorage.setItem(DESKTOP_PINNED_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  return {
    isOpen, searchQuery, selectedCategory,
    openLauncher, closeLauncher, toggleLauncher,
    updateSearchQuery, updateCategory,
    filteredApps,
    visibleApps,
    pinnedTaskbar, pinnedDesktop,
    pinToTaskbar, unpinFromTaskbar, toggleTaskbarPin, toggleDesktopPin,
  };
}
