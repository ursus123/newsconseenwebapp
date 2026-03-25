import React from "react";
import { X, Bell, CheckCheck, Trash2 } from "lucide-react";
import { DESKTOP_APPS } from "@/desktop/desktopApps";

function timeAgo(date) {
  const seconds = Math.floor((new Date() - date) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const APP_ICON_MAP = Object.fromEntries(DESKTOP_APPS.map(a => [a.id, a.icon]));

export default function NotificationCenter({
  open,
  notifications,
  onClose,
  onMarkRead,
  onClearAll,
}) {
  if (!open) return null;

  const unread = notifications.filter(n => !n.read);

  return (
    <div className="fixed inset-0 z-[9997]" onClick={onClose}>
      <div
        className="absolute right-3 bottom-14 w-80 rounded-2xl overflow-hidden shadow-2xl"
        style={{ background: "rgba(15, 23, 42, 0.97)", border: "1px solid rgba(255,255,255,0.1)" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-emerald-400" />
            <span className="text-sm font-semibold text-white">Notifications</span>
            {unread.length > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-red-500 text-white text-[10px] font-bold">
                {unread.length}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {notifications.length > 0 && (
              <button
                onClick={onClearAll}
                className="text-slate-500 hover:text-rose-400 transition-colors"
                title="Clear all"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
            <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Notifications list */}
        <div className="max-h-96 overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="py-12 text-center">
              <CheckCheck className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
              <p className="text-slate-400 text-sm">All caught up!</p>
            </div>
          ) : (
            notifications.map(n => (
              <div
                key={n.id}
                onClick={() => onMarkRead(n.id)}
                className="flex items-start gap-3 px-4 py-3 border-b border-white/5 cursor-pointer hover:bg-white/5 transition-colors"
              >
                <div
                  className="w-8 h-8 rounded-xl flex items-center justify-center text-base shrink-0 mt-0.5"
                  style={{ background: "rgba(255,255,255,0.08)" }}
                >
                  {APP_ICON_MAP[n.appId] || "🔔"}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-xs leading-snug ${n.read ? "text-slate-400" : "text-white"}`}>
                    {n.message}
                  </p>
                  <p className="text-[10px] text-slate-500 mt-0.5">{timeAgo(n.time)}</p>
                </div>
                {!n.read && (
                  <div className="w-2 h-2 rounded-full bg-emerald-400 shrink-0 mt-1.5" />
                )}
              </div>
            ))
          )}
        </div>

        {notifications.length > 0 && (
          <div className="px-4 py-2.5 border-t border-white/10">
            <p className="text-[10px] text-slate-500 text-center">Click a notification to mark as read</p>
          </div>
        )}
      </div>
    </div>
  );
}