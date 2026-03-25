import React, { useState, useEffect, useCallback } from "react";
import { useWindowManager } from "@/desktop/windowStore";
import { useNotifications } from "@/desktop/notificationStore";
import { useLauncherStore } from "@/desktop/launcherStore";
import { DESKTOP_APPS } from "@/desktop/desktopApps";
import AppWindow from "@/components/desktop/AppWindow";
import Taskbar from "@/components/desktop/Taskbar";
import AppLauncher from "@/components/desktop/AppLauncher";
import NotificationCenter from "@/components/desktop/NotificationCenter";
import DesktopIcons from "@/components/desktop/DesktopIcons";
import { base44 } from "@/api/base44Client";

const WALLPAPERS = [
  "linear-gradient(135deg, #0f172a 0%, #1e293b 40%, #0c4a6e 100%)",
  "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)",
  "linear-gradient(135deg, #064e3b 0%, #065f46 40%, #0f766e 100%)",
  "linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #4338ca 100%)",
  "linear-gradient(135deg, #450a0a 0%, #7f1d1d 40%, #991b1b 100%)",
];

export default function Desktop() {
  const [user, setUser]           = useState(null);
  const [notifOpen, setNotifOpen] = useState(false);
  const [wallpaperIdx, setWallpaperIdx] = useState(0);
  const [contextMenu, setContextMenu]   = useState(null);

  const wm           = useWindowManager();
  const notifStore   = useNotifications();
  const launcher     = useLauncherStore();

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => {});
    const saved = localStorage.getItem("desktop_wallpaper");
    if (saved !== null) setWallpaperIdx(parseInt(saved, 10));
  }, []);

  const handleOpenApp = useCallback((app) => {
    wm.openWindow(app);
    launcher.closeLauncher();
  }, [wm, launcher]);

  const handleContextMenu = (e) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  const handleChangeWallpaper = () => {
    const next = (wallpaperIdx + 1) % WALLPAPERS.length;
    setWallpaperIdx(next);
    localStorage.setItem("desktop_wallpaper", String(next));
    setContextMenu(null);
  };

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") {
        launcher.closeLauncher();
        setNotifOpen(false);
        setContextMenu(null);
      }
      if (e.ctrlKey && e.code === "Space") {
        e.preventDefault();
        launcher.toggleLauncher();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [launcher]);

  return (
    <div
      className="fixed inset-0 overflow-hidden"
      style={{ background: WALLPAPERS[wallpaperIdx], cursor: "default" }}
      onContextMenu={handleContextMenu}
      onClick={() => { setContextMenu(null); }}
    >
      {/* Grid overlay */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.03) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      />

      {/* Top bar */}
      <div
        className="absolute top-0 left-0 right-0 h-8 flex items-center px-4 gap-4 z-50 select-none"
        style={{ background: "rgba(0,0,0,0.3)", backdropFilter: "blur(10px)" }}
      >
        <span className="text-white font-bold text-xs tracking-wide">Newsconseen OS</span>
        <div className="flex-1" />
        {user && <span className="text-slate-300 text-xs">{user.full_name || user.email}</span>}
        <span className="text-slate-500 text-xs hidden sm:block">Ctrl+Space for launcher</span>
      </div>

      {/* Desktop icons */}
      <div className="absolute top-10 left-0 bottom-14 overflow-y-auto">
        <DesktopIcons onOpenApp={handleOpenApp} pinnedDesktop={launcher.pinnedDesktop} />
      </div>

      {/* Window layer */}
      <div className="absolute top-8 left-0 right-0 bottom-14" style={{ pointerEvents: "none" }}>
        {wm.windows.map(win => (
          <AppWindow
            key={win.id}
            win={win}
            onClose={wm.closeWindow}
            onFocus={wm.focusWindow}
            onMinimize={wm.minimizeWindow}
            onMaximize={wm.maximizeWindow}
            onMove={wm.moveWindow}
            onResize={wm.resizeWindow}
          />
        ))}

        {wm.windows.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <div className="text-center opacity-25">
              <div className="text-6xl mb-4">🖥️</div>
              <p className="text-white text-lg font-medium">Newsconseen Desktop</p>
              <p className="text-slate-300 text-sm mt-1">Double-click an icon or press Ctrl+Space</p>
            </div>
          </div>
        )}
      </div>

      {/* App Launcher */}
      <AppLauncher
        open={launcher.isOpen}
        onClose={launcher.closeLauncher}
        onOpenApp={handleOpenApp}
        searchQuery={launcher.searchQuery}
        selectedCategory={launcher.selectedCategory}
        filteredApps={launcher.filteredApps}
        onSearchChange={launcher.updateSearchQuery}
        onCategoryChange={launcher.updateCategory}
        pinnedTaskbar={launcher.pinnedTaskbar}
        pinnedDesktop={launcher.pinnedDesktop}
        onToggleTaskbarPin={launcher.toggleTaskbarPin}
        onToggleDesktopPin={launcher.toggleDesktopPin}
      />

      {/* Notification Center */}
      <NotificationCenter
        open={notifOpen}
        notifications={notifStore.notifications}
        onClose={() => setNotifOpen(false)}
        onMarkRead={notifStore.markAsRead}
        onMarkAllRead={notifStore.markAllRead}
        onClearAll={notifStore.clearAll}
        onDismissOne={notifStore.dismissOne}
        onOpenApp={handleOpenApp}
      />

      {/* Taskbar */}
      <Taskbar
        windows={wm.windows}
        onOpenApp={handleOpenApp}
        onFocusWindow={wm.focusWindow}
        onMinimizeWindow={wm.minimizeWindow}
        onCloseWindow={wm.closeWindow}
        onToggleLauncher={launcher.toggleLauncher}
        onToggleNotifications={() => setNotifOpen(v => !v)}
        unreadCount={notifStore.unreadCount}
        pinnedApps={launcher.pinnedTaskbar}
        launcherOpen={launcher.isOpen}
        onToggleTaskbarPin={launcher.toggleTaskbarPin}
        onOpenSettings={() => handleOpenApp(DESKTOP_APPS.find(a => a.id === "settings"))}
        user={user}
      />

      {/* Right-click context menu */}
      {contextMenu && (
        <div
          className="fixed z-[10000] rounded-xl overflow-hidden shadow-2xl"
          style={{
            left: Math.min(contextMenu.x, window.innerWidth - 200),
            top:  Math.min(contextMenu.y, window.innerHeight - 160),
            background: "rgba(10,18,36,0.97)",
            border: "1px solid rgba(255,255,255,0.12)",
            minWidth: 192,
            backdropFilter: "blur(20px)",
          }}
          onClick={e => e.stopPropagation()}
        >
          <button className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-300 hover:bg-white/10 hover:text-white transition-colors text-left" onClick={handleChangeWallpaper}>
            🎨 Change Wallpaper
          </button>
          <button className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-300 hover:bg-white/10 hover:text-white transition-colors text-left" onClick={() => { handleOpenApp(DESKTOP_APPS.find(a => a.id === "settings")); setContextMenu(null); }}>
            ⚙️ System Settings
          </button>
          <button className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-300 hover:bg-white/10 hover:text-white transition-colors text-left" onClick={() => { launcher.openLauncher(); setContextMenu(null); }}>
            🛍️ Open App Launcher
          </button>
          <div className="h-px bg-white/10 my-1" />
          <button className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-400 hover:bg-white/10 transition-colors text-left" onClick={() => setContextMenu(null)}>
            ✕ Close Menu
          </button>
        </div>
      )}
    </div>
  );
}