import React, { useState, useCallback } from "react";
import { DESKTOP_APPS } from "./desktopApps";

const PINNED_KEY = "desktop_pinned_apps";
const DESKTOP_PINNED_KEY = "desktop_icon_apps";

function loadPinned() {
  try {
    const raw = localStorage.getItem(PINNED_KEY);
    return raw ? JSON.parse(raw) : ["attendance", "tasks", "people", "transactions", "settings"];
  } catch { return ["attendance", "tasks", "people", "transactions", "settings"]; }
}

function loadDesktopPinned() {
  try {
    const raw = localStorage.getItem(DESKTOP_PINNED_KEY);
    return raw ? JSON.parse(raw) : ["attendance", "tasks", "people", "transactions"];
  } catch { return ["attendance", "tasks", "people", "transactions"]; }
}

export function useLauncherStore() {
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

  const filteredApps = DESKTOP_APPS.filter(app => {
    const matchCat = selectedCategory === "All" || app.category === selectedCategory;
    const matchQ   = !searchQuery || app.name.toLowerCase().includes(searchQuery.toLowerCase()) || app.id.includes(searchQuery.toLowerCase());
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
    pinnedTaskbar, pinnedDesktop,
    pinToTaskbar, unpinFromTaskbar, toggleTaskbarPin, toggleDesktopPin,
  };
}