import React, { useState, useEffect, useRef, useCallback } from "react";
import { DESKTOP_APPS } from "@/desktop/desktopApps";
import { Bell } from "lucide-react";

// ── Clock ─────────────────────────────────────────────────────────────────────
function Clock() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="text-right leading-tight select-none cursor-default">
      <div className="text-white text-xs font-semibold tabular-nums">
        {time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
      </div>
      <div className="text-slate-400 text-[10px]">
        {time.toLocaleDateString([], { month: "short", day: "numeric" })}
      </div>
    </div>
  );
}

// ── Tooltip ───────────────────────────────────────────────────────────────────
function Tooltip({ label, children }) {
  const [show, setShow] = useState(false);
  return (
    <div
      className="relative flex items-center justify-center"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show && label && (
        <div
          className="absolute bottom-full mb-2 px-2.5 py-1 rounded-lg text-xs text-white font-medium whitespace-nowrap pointer-events-none z-[99999]"
          style={{
            background: "rgba(15,23,42,0.97)",
            border: "1px solid rgba(255,255,255,0.12)",
            boxShadow: "0 4px 16px rgba(0,0,0,0.5)",
          }}
        >
          {label}
          <div
            className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent"
            style={{ borderTopColor: "rgba(15,23,42,0.97)" }}
          />
        </div>
      )}
    </div>
  );
}

// ── Icon right-click context menu ─────────────────────────────────────────────
function IconContextMenu({ x, y, appId, winId, isPinned, onClose, onCloseWindow, onTogglePin }) {
  const ref = useRef(null);
  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  const cx = Math.min(x, window.innerWidth  - 180);
  const cy = Math.max(8, y - 120);

  return (
    <div
      ref={ref}
      className="fixed z-[99999] rounded-xl overflow-hidden shadow-2xl text-sm"
      style={{
        left: cx, top: cy,
        minWidth: 168,
        background: "rgba(10,18,36,0.98)",
        border: "1px solid rgba(255,255,255,0.12)",
        backdropFilter: "blur(24px)",
      }}
    >
      {winId && (
        <button
          className="w-full flex items-center gap-3 px-4 py-2.5 text-slate-300 hover:bg-white/10 hover:text-white transition-colors text-left"
          onClick={() => { onCloseWindow(winId); onClose(); }}
        >
          ✕ Close Window
        </button>
      )}
      <button
        className="w-full flex items-center gap-3 px-4 py-2.5 text-slate-300 hover:bg-white/10 hover:text-white transition-colors text-left"
        onClick={() => { onTogglePin(appId); onClose(); }}
      >
        {isPinned ? "📌 Unpin from Taskbar" : "📌 Pin to Taskbar"}
      </button>
    </div>
  );
}

// ── Single taskbar icon ───────────────────────────────────────────────────────
function TaskbarIcon({ app, win, isActive, isOpen, onClick, onContextMenu }) {
  return (
    <Tooltip label={app?.name || win?.title}>
      <button
        onClick={onClick}
        onContextMenu={onContextMenu}
        className="relative flex flex-col items-center justify-center w-11 h-11 rounded-xl transition-all duration-150 shrink-0 group"
        style={{
          background: isActive
            ? "rgba(255,255,255,0.16)"
            : "transparent",
          transform: "scale(1)",
        }}
        onMouseDown={e => { e.currentTarget.style.transform = "scale(0.90)"; }}
        onMouseUp={e   => { e.currentTarget.style.transform = "scale(1)"; }}
        onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.background = isActive ? "rgba(255,255,255,0.16)" : "transparent"; }}
        onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = "rgba(255,255,255,0.09)"; }}
      >
        <span className="text-[22px] leading-none select-none transition-transform duration-150 group-hover:scale-110">
          {app?.icon || win?.icon || "🔲"}
        </span>

        {/* Open indicator dot */}
        {isOpen && (
          <span
            className="absolute bottom-0.5 rounded-full transition-all"
            style={{
              width:  isActive ? 12 : 4,
              height: 3,
              background: isActive ? "#10b981" : "#475569",
              left: "50%",
              transform: "translateX(-50%)",
              borderRadius: 9999,
            }}
          />
        )}
      </button>
    </Tooltip>
  );
}

// ── Taskbar ───────────────────────────────────────────────────────────────────
export default function Taskbar({
  windows,
  onOpenApp,
  onFocusWindow,
  onMinimizeWindow,
  onCloseWindow,
  onToggleLauncher,
  onToggleNotifications,
  unreadCount,
  pinnedApps,
  launcherOpen,
  onToggleTaskbarPin,
  onOpenSettings,
  user,
  onProfileClick,
  profileSwitcherRef,
}) {
  const [ctxMenu, setCtxMenu] = useState(null); // { x, y, appId, winId, isPinned }

  const openAppIds = new Set(windows.map(w => w.appId));

  const pinnedAppObjects = pinnedApps
    .map(id => DESKTOP_APPS.find(a => a.id === id))
    .filter(Boolean);

  const handleIconClick = useCallback((app, win) => {
    if (win) {
      if (win.minimized) onFocusWindow(win.id);
      else onMinimizeWindow(win.id);
    } else {
      onOpenApp(app);
    }
  }, [onFocusWindow, onMinimizeWindow, onOpenApp]);

  const handleIconContextMenu = useCallback((e, appId, winId, isPinned) => {
    e.preventDefault();
    setCtxMenu({ x: e.clientX, y: e.clientY, appId, winId, isPinned });
  }, []);

  // Unpinned open windows
  const unpinnedOpen = windows.filter(w => !pinnedApps.includes(w.appId));

  return (
    <>
      <div
        className="fixed bottom-0 left-0 right-0 flex items-center px-2 gap-1 z-[9999] select-none"
        style={{
          height: 52,
          background: "rgba(8, 15, 30, 0.93)",
          backdropFilter: "blur(28px)",
          WebkitBackdropFilter: "blur(28px)",
          borderTop: "1px solid rgba(255,255,255,0.07)",
        }}
      >
        {/* ── Launcher button ──────────────────────────────────── */}
        <Tooltip label="App Launcher  (Ctrl+Space)">
          <button
            onClick={onToggleLauncher}
            className="w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 shrink-0 mr-0.5 text-xl"
            style={{
              background: launcherOpen
                ? "rgba(16,185,129,0.85)"
                : "rgba(16,185,129,0.65)",
              boxShadow: launcherOpen ? "0 0 18px #10b98160" : "none",
              transform: launcherOpen ? "scale(0.92)" : "scale(1)",
            }}
          >
            🖥️
          </button>
        </Tooltip>

        {/* Divider */}
        <div className="w-px h-6 bg-white/10 mx-1 shrink-0" />

        {/* ── Pinned apps ────────────────────────────────────────── */}
        {pinnedAppObjects.map(app => {
          const win      = windows.find(w => w.appId === app.id);
          const isOpen   = !!win;
          const isActive = win ? !win.minimized : false;
          return (
            <TaskbarIcon
              key={app.id}
              app={app}
              win={win}
              isOpen={isOpen}
              isActive={isActive}
              onClick={() => handleIconClick(app, win)}
              onContextMenu={e => handleIconContextMenu(e, app.id, win?.id, true)}
            />
          );
        })}

        {/* ── Unpinned open windows ──────────────────────────────── */}
        {unpinnedOpen.length > 0 && (
          <>
            <div className="w-px h-6 bg-white/10 mx-1 shrink-0" />
            {unpinnedOpen.map(win => {
              const app      = DESKTOP_APPS.find(a => a.id === win.appId);
              const isActive = !win.minimized;
              return (
                <TaskbarIcon
                  key={win.id}
                  app={app}
                  win={win}
                  isOpen
                  isActive={isActive}
                  onClick={() => handleIconClick(app, win)}
                  onContextMenu={e => handleIconContextMenu(e, win.appId, win.id, false)}
                />
              );
            })}
          </>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* ── System tray ────────────────────────────────────────── */}
        {/* Notifications */}
        <Tooltip label="Notifications">
          <button
            onClick={onToggleNotifications}
            className="relative w-9 h-9 rounded-xl flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-all"
          >
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>
        </Tooltip>

        {/* Profiles */}
        <Tooltip label="Switch Profile">
          <button
            onClick={onProfileClick}
            ref={profileSwitcherRef}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-all text-sm font-bold"
            title="Switch Profile"
          >
            👤
          </button>
        </Tooltip>

        {/* User avatar → Settings */}
        <Tooltip label={user ? `${user.full_name || user.email} · Settings` : "Settings"}>
          <button
            onClick={onOpenSettings}
            className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold transition-all hover:ring-2 hover:ring-emerald-400 ml-1 shrink-0"
            style={{ background: "linear-gradient(135deg, #10b981, #0ea5e9)" }}
          >
            {user ? (user.full_name || user.email || "?")[0].toUpperCase() : "?"}
          </button>
        </Tooltip>

        {/* Clock */}
        <div className="ml-2 mr-1">
          <Clock />
        </div>
      </div>

      {/* Right-click context menu */}
      {ctxMenu && (
        <IconContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          appId={ctxMenu.appId}
          winId={ctxMenu.winId}
          isPinned={ctxMenu.isPinned}
          onClose={() => setCtxMenu(null)}
          onCloseWindow={onCloseWindow}
          onTogglePin={onToggleTaskbarPin}
        />
      )}
    </>
  );
}