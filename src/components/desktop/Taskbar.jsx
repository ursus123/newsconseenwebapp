import React, { useState, useEffect } from "react";
import { DESKTOP_APPS, DEFAULT_PINNED } from "@/desktop/desktopApps";
import { Bell, Grid3x3 } from "lucide-react";

function Clock() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="text-right leading-tight">
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
}) {
  const pinnedApps = DESKTOP_APPS.filter(a => DEFAULT_PINNED.includes(a.id));
  const openAppIds = new Set(windows.map(w => w.appId));

  const handleTaskbarClick = (app) => {
    const openWin = windows.find(w => w.appId === app.id);
    if (openWin) {
      if (openWin.minimized) {
        onFocusWindow(openWin.id);
      } else {
        onMinimizeWindow(openWin.id);
      }
    } else {
      onOpenApp(app);
    }
  };

  // Open windows not in pinned
  const unpinnedOpen = windows.filter(w => !DEFAULT_PINNED.includes(w.appId));

  return (
    <div
      className="fixed bottom-0 left-0 right-0 h-13 flex items-center px-3 gap-2 z-[9999]"
      style={{
        height: 52,
        background: "rgba(15, 23, 42, 0.92)",
        backdropFilter: "blur(20px)",
        borderTop: "1px solid rgba(255,255,255,0.07)",
      }}
    >
      {/* Launcher button */}
      <button
        onClick={onToggleLauncher}
        className="w-9 h-9 rounded-xl bg-emerald-600 hover:bg-emerald-500 flex items-center justify-center transition-all shadow-lg text-white mr-1"
        title="App Launcher"
      >
        <Grid3x3 className="w-4 h-4" />
      </button>

      {/* Divider */}
      <div className="w-px h-6 bg-white/10 mx-1" />

      {/* Pinned apps */}
      {pinnedApps.map(app => {
        const isOpen = openAppIds.has(app.id);
        const win = windows.find(w => w.appId === app.id);
        const isActive = win && !win.minimized;
        return (
          <button
            key={app.id}
            onClick={() => handleTaskbarClick(app)}
            title={app.name}
            className="relative flex flex-col items-center justify-center w-10 h-10 rounded-xl transition-all hover:bg-white/10"
            style={{ background: isActive ? "rgba(255,255,255,0.12)" : "transparent" }}
          >
            <span className="text-xl leading-none">{app.icon}</span>
            {isOpen && (
              <span
                className="absolute bottom-0.5 w-1 h-1 rounded-full"
                style={{ background: isActive ? "#10b981" : "#64748b" }}
              />
            )}
          </button>
        );
      })}

      {/* Unpinned open windows */}
      {unpinnedOpen.length > 0 && (
        <>
          <div className="w-px h-6 bg-white/10 mx-1" />
          {unpinnedOpen.map(win => {
            const app = DESKTOP_APPS.find(a => a.id === win.appId);
            const isActive = !win.minimized;
            return (
              <button
                key={win.id}
                onClick={() => {
                  if (win.minimized) onFocusWindow(win.id);
                  else onMinimizeWindow(win.id);
                }}
                title={win.title}
                className="relative flex flex-col items-center justify-center w-10 h-10 rounded-xl transition-all hover:bg-white/10"
                style={{ background: isActive ? "rgba(255,255,255,0.12)" : "transparent" }}
              >
                <span className="text-xl leading-none">{win.icon}</span>
                <span
                  className="absolute bottom-0.5 w-1 h-1 rounded-full"
                  style={{ background: isActive ? "#10b981" : "#64748b" }}
                />
              </button>
            );
          })}
        </>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Notifications */}
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
      <div className="ml-1">
        <Clock />
      </div>
    </div>
  );
}