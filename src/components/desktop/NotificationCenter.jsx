import React, { useRef, useEffect } from "react";
import { X, Bell, CheckCheck, Trash2, CheckCircle2 } from "lucide-react";
import { DESKTOP_APPS } from "@/desktop/desktopApps";
import { motion, AnimatePresence } from "framer-motion";

// ── Helpers ───────────────────────────────────────────────────────────────────
const APP_MAP = Object.fromEntries(DESKTOP_APPS.map(a => [a.id, a]));

function timeAgo(ts) {
  const sec = Math.floor((Date.now() - ts) / 1000);
  if (sec < 60)  return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60)  return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr  < 24)  return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

function groupByApp(notifications) {
  const groups = {};
  for (const n of notifications) {
    if (!groups[n.appId]) groups[n.appId] = [];
    groups[n.appId].push(n);
  }
  // Sort groups: unread first, then by latest timestamp
  return Object.entries(groups).sort(([, a], [, b]) => {
    const aUnread = a.some(n => !n.read) ? 1 : 0;
    const bUnread = b.some(n => !n.read) ? 1 : 0;
    if (bUnread !== aUnread) return bUnread - aUnread;
    return Math.max(...b.map(n => n.timestamp)) - Math.max(...a.map(n => n.timestamp));
  });
}

// ── Notification item ─────────────────────────────────────────────────────────
function NotifItem({ notif, onRead, onDismiss, onOpenApp }) {
  const app = APP_MAP[notif.appId];

  const handleClick = () => {
    onRead(notif.id);
    if (app) onOpenApp(app);
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20, height: 0, marginBottom: 0 }}
      transition={{ duration: 0.18 }}
      className="group relative flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors"
      style={{ background: notif.read ? "transparent" : "rgba(16,185,129,0.05)" }}
      onClick={handleClick}
      onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.06)"}
      onMouseLeave={e => e.currentTarget.style.background = notif.read ? "transparent" : "rgba(16,185,129,0.05)"}
    >
      {/* App icon */}
      <div
        className="w-8 h-8 rounded-xl flex items-center justify-center text-[18px] shrink-0 mt-0.5"
        style={{
          background: app ? `${app.color}22` : "rgba(255,255,255,0.08)",
          border:     app ? `1px solid ${app.color}33` : "1px solid rgba(255,255,255,0.1)",
        }}
      >
        {app?.icon || "🔔"}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 pr-5">
        <p className={`text-xs font-semibold leading-tight truncate ${notif.read ? "text-slate-400" : "text-white"}`}>
          {notif.title}
        </p>
        <p className={`text-[11px] mt-0.5 leading-snug ${notif.read ? "text-slate-500" : "text-slate-300"}`}>
          {notif.message}
        </p>
        <p className="text-[10px] text-slate-600 mt-1">{timeAgo(notif.timestamp)}</p>
      </div>

      {/* Unread dot */}
      {!notif.read && (
        <div className="absolute top-3.5 right-9 w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
      )}

      {/* Dismiss button */}
      <button
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 w-5 h-5 rounded-full flex items-center justify-center text-slate-500 hover:text-white hover:bg-white/10 transition-all"
        onClick={e => { e.stopPropagation(); onDismiss(notif.id); }}
        title="Dismiss"
      >
        <X className="w-3 h-3" />
      </button>
    </motion.div>
  );
}

// ── App group header ──────────────────────────────────────────────────────────
function GroupHeader({ appId }) {
  const app = APP_MAP[appId];
  return (
    <div className="flex items-center gap-2 px-4 pt-3 pb-1">
      <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">
        {app?.name || appId}
      </span>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function NotificationCenter({
  open,
  notifications,
  onClose,
  onMarkRead,
  onMarkAllRead,
  onClearAll,
  onDismissOne,
  onOpenApp,
}) {
  const panelRef = useRef(null);

  // Click outside to close
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) onClose();
    };
    // Delay so the open-click doesn't immediately close
    const t = setTimeout(() => document.addEventListener("mousedown", handler), 100);
    return () => { clearTimeout(t); document.removeEventListener("mousedown", handler); };
  }, [open, onClose]);

  const unread  = notifications.filter(n => !n.read).length;
  const grouped = groupByApp(notifications);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 z-[9990]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            style={{ background: "rgba(0,0,0,0.25)" }}
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            ref={panelRef}
            className="fixed right-0 top-0 bottom-0 z-[9995] flex flex-col overflow-hidden"
            style={{
              width: 360,
              background: "rgba(8,15,30,0.97)",
              borderLeft: "1px solid rgba(255,255,255,0.09)",
              boxShadow: "-24px 0 80px rgba(0,0,0,0.6)",
              backdropFilter: "blur(32px)",
              WebkitBackdropFilter: "blur(32px)",
            }}
            initial={{ x: 360 }}
            animate={{ x: 0 }}
            exit={{ x: 360 }}
            transition={{ type: "spring", stiffness: 340, damping: 32 }}
            onClick={e => e.stopPropagation()}
          >
            {/* ── Header ────────────────────────────────────────────── */}
            <div
              className="shrink-0 flex items-center justify-between px-4 py-4"
              style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}
            >
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-slate-800 flex items-center justify-center">
                  <Bell className="w-3.5 h-3.5 text-emerald-400" />
                </div>
                <span className="text-white font-semibold text-sm">Notifications</span>
                {unread > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-red-500 text-white text-[10px] font-bold leading-none">
                    {unread}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1">
                {unread > 0 && (
                  <button
                    onClick={onMarkAllRead}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] text-slate-400 hover:text-white hover:bg-white/8 transition-all"
                    title="Mark all read"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Mark all read
                  </button>
                )}
                {notifications.length > 0 && (
                  <button
                    onClick={onClearAll}
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-500 hover:text-rose-400 hover:bg-white/8 transition-all"
                    title="Clear all"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  onClick={onClose}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-500 hover:text-white hover:bg-white/8 transition-all"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* ── Notifications list ────────────────────────────────── */}
            <div className="flex-1 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full pb-16">
                  <CheckCheck className="w-10 h-10 text-emerald-500 mb-3 opacity-60" />
                  <p className="text-slate-400 text-sm font-medium">All caught up!</p>
                  <p className="text-slate-600 text-xs mt-1">No new notifications</p>
                </div>
              ) : (
                <motion.div layout>
                  {grouped.map(([appId, notifs]) => (
                    <div key={appId}>
                      <GroupHeader appId={appId} />
                      <div style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                        <AnimatePresence>
                          {notifs.map(n => (
                            <NotifItem
                              key={n.id}
                              notif={n}
                              onRead={onMarkRead}
                              onDismiss={onDismissOne}
                              onOpenApp={(app) => { onOpenApp(app); onClose(); }}
                            />
                          ))}
                        </AnimatePresence>
                      </div>
                    </div>
                  ))}
                </motion.div>
              )}
            </div>

            {/* ── Footer ───────────────────────────────────────────── */}
            {notifications.length > 0 && (
              <div
                className="shrink-0 px-4 py-3 text-center"
                style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}
              >
                <p className="text-[11px] text-slate-600">
                  Click a notification to open its app
                </p>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}