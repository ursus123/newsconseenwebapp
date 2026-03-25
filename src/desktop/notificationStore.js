import { useState, useCallback } from "react";

let nextNid = 1;

export function useNotifications() {
  const [notifications, setNotifications] = useState([
    { id: nextNid++, appId: "tasks",        message: "3 tasks are overdue",                  time: new Date(Date.now() - 300000),  read: false },
    { id: nextNid++, appId: "attendance",   message: "Attendance submitted for Class 9A",     time: new Date(Date.now() - 900000),  read: false },
    { id: nextNid++, appId: "transactions", message: "Transaction #INV-2025-0042 posted",     time: new Date(Date.now() - 1800000), read: true  },
  ]);

  const pushNotification = useCallback((message, appId = "system") => {
    setNotifications(prev => [
      { id: nextNid++, appId, message, time: new Date(), read: false },
      ...prev,
    ]);
  }, []);

  const markAsRead = useCallback((id) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  }, []);

  const clearAll = useCallback(() => {
    setNotifications([]);
  }, []);

  const unreadCount = notifications.filter(n => !n.read).length;

  return { notifications, pushNotification, markAsRead, clearAll, unreadCount };
}