import { useState, useCallback } from "react";

let nextNid = 100;

const SEED = [
  {
    id: nextNid++,
    appId:     "tasks",
    title:     "Overdue Tasks",
    message:   "3 tasks are overdue and require attention",
    timestamp: Date.now() - 5 * 60 * 1000,
    read:      false,
  },
  {
    id: nextNid++,
    appId:     "attendance",
    title:     "Attendance Submitted",
    message:   "Attendance recorded for Class 9A — 24 students present",
    timestamp: Date.now() - 15 * 60 * 1000,
    read:      false,
  },
  {
    id: nextNid++,
    appId:     "transactions",
    title:     "Invoice Posted",
    message:   "Transaction #INV-2025-0042 has been posted",
    timestamp: Date.now() - 30 * 60 * 1000,
    read:      true,
  },
];

export function useNotifications() {
  const [items, setItems] = useState(SEED);

  /** Push a new notification from any app */
  const pushNotification = useCallback((appId, title, message) => {
    setItems(prev => [{
      id:        nextNid++,
      appId:     appId || "system",
      title:     title || "System",
      message:   message || "",
      timestamp: Date.now(),
      read:      false,
    }, ...prev]);
  }, []);

  const markAsRead = useCallback((id) => {
    setItems(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  }, []);

  const markAllRead = useCallback(() => {
    setItems(prev => prev.map(n => ({ ...n, read: true })));
  }, []);

  const clearAll = useCallback(() => setItems([]), []);

  const dismissOne = useCallback((id) => {
    setItems(prev => prev.filter(n => n.id !== id));
  }, []);

  const unreadCount = items.filter(n => !n.read).length;

  return {
    notifications: items,
    pushNotification,
    markAsRead,
    markAllRead,
    clearAll,
    dismissOne,
    unreadCount,
  };
}