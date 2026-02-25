import React, { useState } from "react";
import { Bell, X, AlertTriangle, Clock, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";

function NotifItem({ notif, onDismiss }) {
  const isOverdue = notif.type === "overdue";
  return (
    <div className={`flex items-start gap-3 px-4 py-3 border-b border-gray-100 last:border-0 ${isOverdue ? "bg-red-50" : "bg-amber-50"}`}>
      <div className={`mt-0.5 shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${isOverdue ? "bg-red-100" : "bg-amber-100"}`}>
        {isOverdue
          ? <AlertTriangle className="w-4 h-4 text-red-600" />
          : <Clock className="w-4 h-4 text-amber-600" />
        }
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-bold leading-tight ${isOverdue ? "text-red-800" : "text-amber-900"}`}>
          {isOverdue ? "Overdue" : "Due soon"} — {notif.title}
        </p>
        <p className="text-xs text-gray-500 mt-0.5">{notif.client} · Scheduled {notif.scheduledTime}</p>
        <p className="text-[10px] text-gray-400 mt-0.5">{format(notif.createdAt, "HH:mm")}</p>
      </div>
      <button onClick={() => onDismiss(notif.id)} className="p-1 rounded-lg text-gray-400 hover:bg-white/60 shrink-0">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

export default function NotificationCenter({ notifications, dismiss, dismissAll }) {
  const [open, setOpen] = useState(false);
  const count = notifications.length;
  const hasOverdue = notifications.some((n) => n.type === "overdue");

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative p-2 rounded-lg text-gray-400 hover:bg-gray-100 transition-colors"
        aria-label="Notifications"
      >
        <Bell className={`w-5 h-5 ${hasOverdue ? "text-red-500" : count > 0 ? "text-amber-500" : "text-gray-400"}`} />
        {count > 0 && (
          <span className={`absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full text-white text-[9px] font-bold flex items-center justify-center
            ${hasOverdue ? "bg-red-500 animate-pulse" : "bg-amber-500"}`}>
            {count > 9 ? "9+" : count}
          </span>
        )}
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />

          {/* Panel */}
          <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-2xl shadow-xl border border-gray-200 z-50 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <p className="text-sm font-bold text-gray-800">Notifications {count > 0 && `(${count})`}</p>
              {count > 0 && (
                <button
                  onClick={() => { dismissAll(); setOpen(false); }}
                  className="text-xs text-gray-400 hover:text-gray-600 font-semibold"
                >
                  Clear all
                </button>
              )}
            </div>

            <div className="max-h-80 overflow-y-auto">
              {count === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-gray-300">
                  <CheckCircle2 className="w-8 h-8 mb-2" />
                  <p className="text-sm font-semibold">All caught up</p>
                </div>
              ) : (
                notifications.map((n) => (
                  <NotifItem key={n.id} notif={n} onDismiss={dismiss} />
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}