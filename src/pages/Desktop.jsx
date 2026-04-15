import React, { useState, useEffect, useCallback, useRef } from "react";
import { useWindowManager } from "@/desktop/windowStore";
import { useNotifications } from "@/desktop/notificationStore";
import { useLauncherStore } from "@/desktop/launcherStore";
import { useProfileStore } from "@/desktop/profileStore";
import { DESKTOP_APPS } from "@/desktop/desktopApps";
import AppWindow from "@/components/desktop/AppWindow";
import Taskbar from "@/components/desktop/Taskbar";
import AppLauncher from "@/components/desktop/AppLauncher";
import NotificationCenter from "@/components/desktop/NotificationCenter";
import DesktopIcons from "@/components/desktop/DesktopIcons";
import ProfileSwitcher from "@/components/desktop/ProfileSwitcher";
import OfflineIndicator from "@/components/desktop/OfflineIndicator";
import PWAInstallBanner from "@/components/desktop/PWAInstallBanner";
import GlobalSearch from "@/components/desktop/GlobalSearch";
import DesktopWidgets from "@/components/desktop/DesktopWidgets";
import DailyBriefing from "@/components/desktop/DailyBriefing";
import EnterpriseContextSwitcher from "@/components/desktop/EnterpriseContextSwitcher";
import { usePWA } from "@/hooks/usePWA";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { useLockStore } from "@/desktop/lockStore";
import LockScreen from "@/components/desktop/LockScreen";

const WALLPAPERS = [
  { type: "gradient", value: "linear-gradient(135deg, #0a0f1e 0%, #0f172a 35%, #0c2a4a 70%, #0c4a6e 100%)" },
  { type: "gradient", value: "linear-gradient(135deg, #020617 0%, #0f172a 40%, #1e1b4b 80%, #312e81 100%)" },
  { type: "gradient", value: "linear-gradient(135deg, #021a12 0%, #022c1c 40%, #064e3b 70%, #0f766e 100%)" },
  { type: "gradient", value: "linear-gradient(135deg, #12032e 0%, #1e1b4b 40%, #4338ca 80%, #6d28d9 100%)" },
  { type: "gradient", value: "linear-gradient(135deg, #1c0202 0%, #450a0a 35%, #7f1d1d 70%, #b91c1c 100%)" },
  { type: "gradient", value: "linear-gradient(160deg, #e0f2fe 0%, #bae6fd 40%, #f0abfc 80%, #fda4af 100%)" },
  { type: "gradient", value: "linear-gradient(135deg, #f8fafc 0%, #e2e8f0 40%, #cbd5e1 80%, #94a3b8 100%)" },
];

export default function Desktop() {
  const { data: user = null } = useQuery({
    queryKey: ["currentUser"],
    queryFn: () => base44.auth.me(),
    staleTime: 0,
    refetchOnMount: "always",
  });
  const [notifOpen, setNotifOpen]     = useState(false);
  const [wallpaperIdx, setWallpaperIdx] = useState(0);
  const [contextMenu, setContextMenu] = useState(null);
  const [iconContextMenuOpen, setIconContextMenuOpen] = useState(false);
  const [quickActionsOpen, setQuickActionsOpen] = useState(false);
  const [profileSwitcherOpen, setProfileSwitcherOpen] = useState(false);
  const [navOpen, setNavOpen]         = useState(false);
  const navRef                        = useRef(null);
  const profileSwitcherPopupRef = useRef(null);
  const quickActionsRef = useRef(null);

  const wm          = useWindowManager();
  const notifStore  = useNotifications();
  const launcher    = useLauncherStore();
  const profileMgr  = useProfileStore();
  const pwa         = usePWA();
  const lockStore   = useLockStore();

  useEffect(() => {
    // Load wallpaper from current profile
    setWallpaperIdx(profileMgr.currentProfile.theme.wallpaperIdx);

    // Listen for theme changes dispatched by DesktopSettings
    const onTheme = (e) => {
      if (e.detail?.wpIdx !== undefined) {
        setWallpaperIdx(e.detail.wpIdx);
        profileMgr.updateProfileTheme(profileMgr.currentProfileId, { wallpaperIdx: e.detail.wpIdx });
      }
    };
    window.addEventListener("desktop-theme-change", onTheme);
    return () => window.removeEventListener("desktop-theme-change", onTheme);
  }, [profileMgr.currentProfileId, profileMgr]);

  // Handle profile switch: close all windows, reload icons/apps
  const handleSwitchProfile = useCallback((profileId) => {
    // Close all open windows
    wm.windows.forEach((win) => wm.closeWindow(win.id));
    
    // Switch profile
    profileMgr.switchProfile(profileId);
    
    // Reload wallpaper
    const newProfile = profileMgr.profiles.find((p) => p.id === profileId);
    if (newProfile) {
      setWallpaperIdx(newProfile.theme.wallpaperIdx);
    }
    
    setProfileSwitcherOpen(false);
  }, [wm, profileMgr]);

  // Close popovers on outside click
  useEffect(() => {
    const handler = (e) => {
      if (quickActionsRef.current && !quickActionsRef.current.contains(e.target)) {
        setQuickActionsOpen(false);
      }
      if (profileSwitcherPopupRef.current && !profileSwitcherPopupRef.current.contains(e.target)) {
        setProfileSwitcherOpen(false);
      }
      if (navRef.current && !navRef.current.contains(e.target)) {
        setNavOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleOpenApp = useCallback((app) => {
    if (!app) return;
    wm.openWindow(app);
    launcher.closeLauncher();
  }, [wm, launcher]);

  const openAppById = useCallback((id) => {
    const app = DESKTOP_APPS.find(a => a.id === id);
    if (app) handleOpenApp(app);
    setContextMenu(null);
    setQuickActionsOpen(false);
  }, [handleOpenApp]);

  const handleContextMenu = (e) => {
    // Don't show desktop context menu if icon context menu is open
    if (iconContextMenuOpen) return;
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  // Auto-lock: track inactivity
  useEffect(() => {
    if (lockStore.autoLockMinutes <= 0) return;
    const events = ["mousemove", "mousedown", "keydown", "touchstart"];
    const onActivity = () => lockStore.updateActivity();
    events.forEach(ev => window.addEventListener(ev, onActivity, { passive: true }));

    const interval = setInterval(() => {
      const idle = (Date.now() - lockStore.lastActiveAt) / 1000 / 60;
      if (idle >= lockStore.autoLockMinutes && !lockStore.isLocked) {
        lockStore.lock();
      }
    }, 30000); // check every 30s

    return () => {
      events.forEach(ev => window.removeEventListener(ev, onActivity));
      clearInterval(interval);
    };
  }, [lockStore.autoLockMinutes, lockStore.isLocked]);

  // Listen for lock / auto-lock-change events dispatched by Settings
  useEffect(() => {
    const onLockEvent = () => lockStore.lock();
    const onAutoLockChange = (e) => lockStore.setAutoLockMinutes(e.detail.minutes);
    window.addEventListener("desktop-lock", onLockEvent);
    window.addEventListener("desktop-auto-lock-change", onAutoLockChange);
    return () => {
      window.removeEventListener("desktop-lock", onLockEvent);
      window.removeEventListener("desktop-auto-lock-change", onAutoLockChange);
    };
  }, [lockStore]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e) => {
      // When locked, block ALL shortcuts except pass-through to LockScreen
      if (lockStore.isLocked) {
        e.stopPropagation();
        return;
      }
      if (e.key === "Escape") {
        launcher.closeLauncher();
        setNotifOpen(false);
        setContextMenu(null);
        setQuickActionsOpen(false);
      }
      if (e.ctrlKey && e.code === "Space") {
        e.preventDefault();
        launcher.toggleLauncher();
      }
      // Ctrl+L = lock
      if (e.ctrlKey && e.key === "l") {
        e.preventDefault();
        lockStore.lock();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [launcher, lockStore, lockStore.isLocked]);

  // Listen for icon context menu open/close
  useEffect(() => {
    const onIconMenuOpen = () => setIconContextMenuOpen(true);
    const onIconMenuClose = () => setIconContextMenuOpen(false);
    window.addEventListener("icon-context-menu-open", onIconMenuOpen);
    window.addEventListener("icon-context-menu-close", onIconMenuClose);
    return () => {
      window.removeEventListener("icon-context-menu-open", onIconMenuOpen);
      window.removeEventListener("icon-context-menu-close", onIconMenuClose);
    };
  }, []);

  const wp = WALLPAPERS[wallpaperIdx] || WALLPAPERS[0];
  const isLight = wallpaperIdx >= 5;

  const topBarBg = isLight ? "rgba(248,250,252,0.7)" : "rgba(0,0,0,0.35)";
  const topBarBorder = isLight ? "1px solid rgba(0,0,0,0.08)" : "1px solid rgba(255,255,255,0.06)";
  const textColor = isLight ? "#374151" : "white";
  const mutedColor = isLight ? "#6b7280" : "#94a3b8";

  // Quick actions list
  const QUICK_ACTIONS = [
    { label: "✚ New Task",        id: "tasks" },
    { label: "✚ New Transaction", id: "transactions" },
    { label: "✚ New Person",      id: "people" },
    { label: "✚ New Enterprise",  id: "enterprises" },
  ];

  const quickBtnStyle = {
    display: "block", width: "100%", textAlign: "left",
    padding: "9px 16px", background: "none", border: "none",
    color: isLight ? "#374151" : "#cbd5e1",
    fontSize: 13, cursor: "pointer",
  };

  const locked = lockStore.isLocked;

  return (
    <div
      className="fixed inset-0 overflow-hidden"
      style={{ background: wp.value, cursor: "default" }}
      onContextMenu={locked ? undefined : handleContextMenu}
      onClick={locked ? undefined : () => { setContextMenu(null); }}
    >
      {/* Dot grid overlay */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: `radial-gradient(circle, ${isLight ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.035)"} 1px, transparent 1px)`,
          backgroundSize: "32px 32px",
        }}
      />
      {/* Vignette */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: isLight
            ? "radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.12) 100%)"
            : "radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.5) 100%)",
        }}
      />

      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      <div
        className="absolute top-0 left-0 right-0 h-9 flex items-center px-4 gap-3 z-50 select-none"
        style={{ background: topBarBg, backdropFilter: "blur(12px)", borderBottom: topBarBorder }}
        onClick={e => e.stopPropagation()}
      >
        {/* Logo pill — clickable to open nav */}
        <button
          ref={navRef}
          onClick={(e) => { e.stopPropagation(); setNavOpen(v => !v); }}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "2px 10px 2px 6px",
            borderRadius: 20,
            background: navOpen
              ? (isLight ? "rgba(0,0,0,0.13)" : "rgba(255,255,255,0.18)")
              : (isLight ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.08)"),
            border: isLight ? "1px solid rgba(0,0,0,0.08)" : "1px solid rgba(255,255,255,0.1)",
            flexShrink: 0, cursor: "pointer",
            transition: "background 0.15s",
          }}
        >
          <span style={{ fontSize: 14 }}>🖥️</span>
          <span style={{ fontWeight: 700, fontSize: 11, letterSpacing: "0.05em", color: textColor }}>
            Newsconseen
          </span>
        </button>

        {/* ── System nav panel ─────────────────────────────────────────── */}
        {navOpen && (
          <div
            onClick={e => e.stopPropagation()}
            style={{
              position: "absolute",
              top: "calc(100% + 2px)",
              left: 0,
              width: 260,
              background: isLight ? "rgba(248,250,252,0.95)" : "rgba(8,14,28,0.97)",
              border: isLight ? "1px solid rgba(0,0,0,0.08)" : "1px solid rgba(255,255,255,0.1)",
              borderTop: "none",
              borderRadius: "0 0 14px 14px",
              backdropFilter: "blur(24px)",
              boxShadow: "0 20px 48px rgba(0,0,0,0.4)",
              overflow: "hidden",
              zIndex: 99999,
            }}
          >
            {/* User header */}
            {user && (
              <div style={{
                padding: "14px 16px 10px",
                borderBottom: isLight ? "1px solid rgba(0,0,0,0.07)" : "1px solid rgba(255,255,255,0.07)",
                display: "flex", alignItems: "center", gap: 10,
              }}>
                <div style={{
                  width: 32, height: 32, borderRadius: "50%",
                  background: "linear-gradient(135deg,#10b981,#3b82f6)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 13, fontWeight: 700, color: "white", flexShrink: 0,
                }}>
                  {(user.full_name || user.email || "?")[0].toUpperCase()}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: textColor, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {user.full_name || user.email}
                  </div>
                  <div style={{ fontSize: 10, color: mutedColor }}>{user.role}</div>
                </div>
              </div>
            )}

            {/* App grid grouped by category */}
            {Object.entries(
              DESKTOP_APPS.reduce((acc, app) => {
                (acc[app.category] = acc[app.category] || []).push(app);
                return acc;
              }, {})
            ).map(([cat, apps]) => (
              <div key={cat}>
                <div style={{ padding: "8px 16px 4px", fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: mutedColor }}>
                  {cat}
                </div>
                {apps.map(app => (
                  <button
                    key={app.id}
                    onClick={() => { handleOpenApp(app); setNavOpen(false); }}
                    style={{
                      display: "flex", alignItems: "center", gap: 10,
                      width: "100%", padding: "7px 16px",
                      background: "none", border: "none", cursor: "pointer",
                      color: isLight ? "#374151" : "#e2e8f0",
                      fontSize: 13, textAlign: "left",
                      transition: "background 0.1s",
                    }}
                    onMouseEnter={ev => ev.currentTarget.style.background = isLight ? "rgba(0,0,0,0.05)" : "rgba(255,255,255,0.07)"}
                    onMouseLeave={ev => ev.currentTarget.style.background = "none"}
                  >
                    <span style={{
                      width: 24, height: 24, borderRadius: 7, flexShrink: 0,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      background: app.color + "22", fontSize: 13,
                    }}>
                      {app.icon}
                    </span>
                    <span style={{ fontWeight: 500 }}>{app.name}</span>
                  </button>
                ))}
              </div>
            ))}

            {/* Footer */}
            <div style={{ height: 1, background: isLight ? "rgba(0,0,0,0.07)" : "rgba(255,255,255,0.07)", margin: "6px 0" }} />
            <button
              onClick={() => { base44.auth.logout(); }}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                width: "100%", padding: "9px 16px 12px",
                background: "none", border: "none", cursor: "pointer",
                color: "#f87171", fontSize: 13, textAlign: "left",
              }}
              onMouseEnter={ev => ev.currentTarget.style.background = "rgba(248,113,113,0.08)"}
              onMouseLeave={ev => ev.currentTarget.style.background = "none"}
            >
              <span style={{ width: 24, height: 24, borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(248,113,113,0.15)", fontSize: 13 }}>
                🚪
              </span>
              <span style={{ fontWeight: 500 }}>Sign Out</span>
            </button>
          </div>
        )}

        {/* Divider */}
        <div style={{ width: 1, height: 16, background: isLight ? "rgba(0,0,0,0.1)" : "rgba(255,255,255,0.1)", flexShrink: 0 }} />

        {/* Enterprise context switcher */}
        <EnterpriseContextSwitcher isLight={isLight} currentUser={user} />

        {/* Divider */}
        <div style={{ width: 1, height: 16, background: isLight ? "rgba(0,0,0,0.1)" : "rgba(255,255,255,0.1)", flexShrink: 0 }} />

        {/* Global Search — centered */}
        <div className="flex-1 flex justify-center px-2">
          <GlobalSearch onOpenApp={handleOpenApp} isLight={isLight} />
        </div>

        {/* Divider */}
        <div style={{ width: 1, height: 16, background: isLight ? "rgba(0,0,0,0.1)" : "rgba(255,255,255,0.1)", flexShrink: 0 }} />

        {/* Quick actions pill button */}
        <div ref={quickActionsRef} style={{ position: "relative", flexShrink: 0 }}>
          <button
            onClick={(e) => { e.stopPropagation(); setQuickActionsOpen(v => !v); }}
            style={{
              height: 22, borderRadius: 11, padding: "0 10px",
              display: "flex", alignItems: "center", gap: 4,
              fontSize: 11, fontWeight: 600,
              background: isLight ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.12)",
              border: isLight ? "1px solid rgba(0,0,0,0.1)" : "1px solid rgba(255,255,255,0.15)",
              color: textColor, cursor: "pointer",
            }}
            title="Quick Actions"
          >
            + Create
          </button>

          {quickActionsOpen && (
            <div
              style={{
                position: "absolute", top: "calc(100% + 6px)", right: 0,
                background: isLight ? "rgba(255,255,255,0.97)" : "rgba(8,15,30,0.97)",
                border: isLight ? "1px solid rgba(0,0,0,0.1)" : "1px solid rgba(255,255,255,0.12)",
                borderRadius: 12, overflow: "hidden",
                boxShadow: "0 16px 48px rgba(0,0,0,0.35)",
                backdropFilter: "blur(20px)",
                minWidth: 200, zIndex: 99999,
              }}
              onClick={e => e.stopPropagation()}
            >
              <div style={{ padding: "8px 14px 6px", fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: mutedColor }}>
                Quick Create
              </div>
              {QUICK_ACTIONS.map(a => (
                <button key={a.id} style={quickBtnStyle} onClick={() => openAppById(a.id)}
                  onMouseEnter={ev => ev.currentTarget.style.background = isLight ? "rgba(0,0,0,0.05)" : "rgba(255,255,255,0.07)"}
                  onMouseLeave={ev => ev.currentTarget.style.background = "none"}
                >
                  {a.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Offline indicator */}
        {!pwa.isOnline && (
          <span style={{ display: "flex", alignItems: "center", gap: 4, color: "#f87171", fontSize: 12, fontWeight: 600, flexShrink: 0 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#f87171", display: "inline-block" }} />
            Offline
          </span>
        )}

        {/* Username */}
        {user && (
          <span style={{ fontSize: 12, color: mutedColor, flexShrink: 0, maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {user.full_name || user.email}
          </span>
        )}

        <span style={{ fontSize: 11, color: mutedColor, flexShrink: 0, display: "none" }} className="sm:block">
          Ctrl+Space
        </span>
      </div>

      {/* ── Interactive desktop content — blocked when locked ── */}
      <div style={{ pointerEvents: locked ? "none" : undefined }}>

      {/* Widget layer */}
      <div className="absolute top-9 left-0 right-0 bottom-14" style={{ zIndex: 5 }}>
        <DesktopWidgets isLight={isLight} />
      </div>

      {/* Desktop icons */}
      <div className="absolute top-9 left-0 right-0 bottom-14" style={{ zIndex: 6 }}>
        <DesktopIcons
          onOpenApp={handleOpenApp}
          pinnedDesktop={profileMgr.currentProfile.desktopIcons}
          pinnedTaskbar={profileMgr.currentProfile.pinnedApps}
          onToggleTaskbarPin={(appId) => {
            const next = profileMgr.currentProfile.pinnedApps.includes(appId)
              ? profileMgr.currentProfile.pinnedApps.filter(id => id !== appId)
              : [...profileMgr.currentProfile.pinnedApps, appId];
            profileMgr.updatePinnedApps(profileMgr.currentProfileId, next);
          }}
          onToggleDesktopPin={(appId) => {
            const next = profileMgr.currentProfile.desktopIcons.includes(appId)
              ? profileMgr.currentProfile.desktopIcons.filter(id => id !== appId)
              : [...profileMgr.currentProfile.desktopIcons, appId];
            profileMgr.updateDesktopIcons(profileMgr.currentProfileId, next);
          }}
        />
      </div>

      {/* Window layer */}
      <div className="absolute top-9 left-0 right-0 bottom-14" style={{ zIndex: 10, pointerEvents: "none" }}>
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
            onSnap={wm.snapWindow}
          />
        ))}

        {/* Daily Briefing — shown when no windows are open */}
        {wm.windows.length === 0 && (
          <div style={{ pointerEvents: "all" }}>
            <DailyBriefing isLight={isLight} currentUser={user} />
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
        pinnedApps={profileMgr.currentProfile.pinnedApps}
        launcherOpen={launcher.isOpen}
        onToggleTaskbarPin={(appId) => {
          const next = profileMgr.currentProfile.pinnedApps.includes(appId)
            ? profileMgr.currentProfile.pinnedApps.filter(id => id !== appId)
            : [...profileMgr.currentProfile.pinnedApps, appId];
          profileMgr.updatePinnedApps(profileMgr.currentProfileId, next);
        }}
        onOpenSettings={() => handleOpenApp(DESKTOP_APPS.find(a => a.id === "settings"))}
        user={user}
        onProfileClick={() => setProfileSwitcherOpen(v => !v)}
        onLock={lockStore.lock}
      />

      {/* Profile Switcher */}
      {profileSwitcherOpen && (
        <div
          ref={profileSwitcherPopupRef}
          style={{
            position: "fixed",
            bottom: 60,
            right: 20,
            zIndex: 100,
          }}
        >
          <ProfileSwitcher
            profiles={profileMgr.profiles}
            currentProfileId={profileMgr.currentProfileId}
            onSwitchProfile={handleSwitchProfile}
            onAddProfile={(name, type, enterpriseId) => {
              const newProfile = profileMgr.addProfile(name, type, enterpriseId);
              handleSwitchProfile(newProfile.id);
            }}
            onDeleteProfile={profileMgr.deleteProfile}
            isLight={isLight}
          />
        </div>
      )}

      {/* PWA */}
      <OfflineIndicator isOnline={pwa.isOnline} />
      <PWAInstallBanner canInstall={pwa.canInstall} onInstall={pwa.promptInstall} />

      {/* Right-click context menu */}
      {contextMenu && (
        <div
          style={{
            position: "fixed",
            left: Math.min(contextMenu.x, window.innerWidth - 210),
            top:  Math.min(contextMenu.y, window.innerHeight - 260),
            zIndex: 10000,
            background: "rgba(10,18,36,0.97)",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 12,
            minWidth: 200,
            backdropFilter: "blur(20px)",
            overflow: "hidden",
            boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
          }}
          onClick={e => e.stopPropagation()}
        >
          {/* Context menu time header */}
          <div style={{ padding: "10px 16px 8px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: "white", fontVariantNumeric: "tabular-nums" }}>
              {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </div>
            <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
              {new Date().toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}
            </div>
          </div>
          <div style={{ padding: "8px 14px 6px", fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#64748b" }}>
            Quick Create
          </div>
          {QUICK_ACTIONS.map(a => (
            <button key={a.id}
              style={{ display: "block", width: "100%", textAlign: "left", padding: "9px 16px", background: "none", border: "none", color: "#cbd5e1", fontSize: 13, cursor: "pointer" }}
              onClick={() => openAppById(a.id)}
              onMouseEnter={ev => ev.currentTarget.style.background = "rgba(255,255,255,0.07)"}
              onMouseLeave={ev => ev.currentTarget.style.background = "none"}
            >
              {a.label}
            </button>
          ))}
          <div style={{ height: 1, background: "rgba(255,255,255,0.1)", margin: "4px 12px" }} />
          <button
            style={{ display: "block", width: "100%", textAlign: "left", padding: "9px 16px", background: "none", border: "none", color: "#cbd5e1", fontSize: 13, cursor: "pointer" }}
            onClick={() => { openAppById("settings"); }}
            onMouseEnter={ev => ev.currentTarget.style.background = "rgba(255,255,255,0.07)"}
            onMouseLeave={ev => ev.currentTarget.style.background = "none"}
          >
            ⚙️ System Settings
          </button>
          <button
            style={{ display: "block", width: "100%", textAlign: "left", padding: "9px 16px", background: "none", border: "none", color: "#cbd5e1", fontSize: 13, cursor: "pointer" }}
            onClick={() => { launcher.openLauncher(); setContextMenu(null); }}
            onMouseEnter={ev => ev.currentTarget.style.background = "rgba(255,255,255,0.07)"}
            onMouseLeave={ev => ev.currentTarget.style.background = "none"}
          >
            🛍️ Open App Launcher
          </button>
          <div style={{ height: 1, background: "rgba(255,255,255,0.1)", margin: "4px 12px" }} />
          <button
            style={{ display: "block", width: "100%", textAlign: "left", padding: "9px 16px", background: "none", border: "none", color: "#94a3b8", fontSize: 13, cursor: "pointer" }}
            onClick={() => setContextMenu(null)}
            onMouseEnter={ev => ev.currentTarget.style.background = "rgba(255,255,255,0.07)"}
            onMouseLeave={ev => ev.currentTarget.style.background = "none"}
          >
            ✕ Close Menu
          </button>
        </div>
      )}

      </div>{/* end blocked-when-locked wrapper */}

      {/* Lock Screen — rendered on top of everything, blocks all interaction */}
      {lockStore.isLocked && (
        <LockScreen
          onUnlock={lockStore.unlock}
          wallpaperValue={wp.value}
          profileName={profileMgr.currentProfile?.name}
        />
      )}
    </div>
  );
}