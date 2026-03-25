import React, { useState, useEffect } from "react";
import { DESKTOP_APPS } from "@/desktop/desktopApps";
import { Bell } from "lucide-react";

function Clock() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="text-right leading-tight select-none">
      <div className="text-white text-xs font-semibold">
        {time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
      </div>
      <div className="text-slate-400 text-[10px]">
        {time.toLocaleDateString([], { month: "short", day: "numeric" })}
      </div>
    </div>
  );
}

export default function Taskbar({
  windows,
  onOpenApp,
  onFocusWindow,
  onMinimizeWindow,
  onToggleLauncher,
  onToggleNotifications,
  unreadCount,
  pinnedApps,       // dynamic from launcherStore
  launcherOpen,     // so the button shows active state
}) {
  const openAppIds = new Set(windows.map(w => w.appId));

  const pinnedAppObjects = pinnedApps
    .map(id => DESKTOP_APPS.find(a => a.id === id))
    .filter(Boolean);

  const handleTaskbarClick = (app) => {
    const openWin = windows.find(w => w.appId === app.id);
    if (openWin) {
      if (openWin.minimized) onFocusWindow(openWin.id);
      else onMinimizeWindow(openWin.id);
    } else {
      onOpenApp(app);
    }
  };

  // Unpinned open windows (not in pinned list)
  const unpinnedOpen = windows.filter(w => !pinnedApps.includes(w.appId));

  return (
    <div
      className="fixed bottom-0 left-0 right-0 flex items-center px-2 gap-1.5 z-[9999] select-none"
      style={{
        height: 52,
        background: "rgba(10, 18, 36, 0.94)",
        backdropFilter: "blur(24px)",
        borderTop: "1px solid rgba(255,255,255,0.07)",
      }}
    >
      {/* ── Launcher button ─────────────────────────────────────── */}
      <button
        onClick={onToggleLauncher}
        title="App Launcher  (Ctrl+Space)"
        className="w-9 h-9 rounded-xl flex items-center justify-center transition-all shadow-lg text-lg shrink-0 mr-0.5"
        style={{
          background: launcherOpen
            ? "rgba(16, 185, 129, 0.9)"
            : "rgba(16, 185, 129, 0.7)",
          boxShadow: launcherOpen ? "0 0 16px #10b98155" : undefined,
        }}
      >
        🖥️
      </button>

      {/* Divider */}
      <div className="w-px h-6 bg-white/10 mx-0.5 shrink-0" />

      {/* ── Pinned apps ──────────────────────────────────────────── */}
      {pinnedAppObjects.map(app => {
        const isOpen   = openAppIds.has(app.id);
        const win      = windows.find(w => w.appId === app.id);
        const isActive = win && !win.minimized;
        return (
          <TaskbarButton
            key={app.id}
            label={app.name}
            icon={app.icon}
            isOpen={isOpen}
            isActive={isActive}
            onClick={() => handleTaskbarClick(app)}
          />
        );
      })}

      {/* ── Unpinned open windows ─────────────────────────────────── */}
      {unpinnedOpen.length > 0 && (
        <>
          <div className="w-px h-6 bg-white/10 mx-0.5 shrink-0" />
          {unpinnedOpen.map(win => {
            const isActive = !win.minimized;
            return (
              <TaskbarButton
                key={win.id}
                label={win.title}
                icon={win.icon}
                isOpen
                isActive={isActive}
                onClick={() => {
                  if (win.minimized) onFocusWindow(win.id);
                  else onMinimizeWindow(win.id);
                }}
              />
            );
          })}
        </>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* ── Notifications bell ───────────────────────────────────── */}
      <button
        onClick={onToggleNotifications}
        className="relative w-9 h-9 rounded-xl flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-all"
        title="Notifications"
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* Clock */}
      <div className="ml-1 mr-1">
        <Clock />
      </div>
    </div>
  );
}

function TaskbarButton({ label, icon, isOpen, isActive, onClick }) {
  return (
    <button
      onClick={onClick}
      title={label}
      className="relative flex flex-col items-center justify-center w-10 h-10 rounded-xl transition-all hover:bg-white/10 shrink-0"
      style={{ background: isActive ? "rgba(255,255,255,0.13)" : "transparent" }}
    >
      <span className="text-xl leading-none">{icon}</span>
      {isOpen && (
        <span
          className="absolute bottom-0.5 w-1 h-1 rounded-full"
          style={{ background: isActive ? "#10b981" : "#475569" }}
        />
      )}
    </button>
  );
}