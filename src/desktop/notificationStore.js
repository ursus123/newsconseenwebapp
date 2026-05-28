import { useState, useCallback, useEffect, useRef } from "react";
import { RAILWAY_URL } from "@/config/api";

const POLL_INTERVAL  = 3 * 60 * 1000; // 3 minutes

let nextNid = 100;

// Map alert_type → desktop app id so clicking a notification opens the right app
const ALERT_TYPE_TO_APP = {
  overdue_tasks:        "tasks",
  low_stock:            "inventory",
  expiring_stock:       "inventory",
  high_churn_risk:      "people",
  inactive_clients:     "people",
  outstanding_invoices: "transactions",
  unpaid_invoices:      "transactions",
  low_attendance:       "attendance",
  staff_absent:         "attendance",
  pending_tasks:        "tasks",
};

const SEVERITY_ICONS = {
  critical: "🔴",
  warning:  "🟡",
  info:     "🔵",
};

function alertToNotification(alert) {
  return {
    id:        nextNid++,
    appId:     ALERT_TYPE_TO_APP[alert.alert_type] || "alerts",
    title:     alert.title    || alert.alert_type,
    message:   alert.message  || "",
    severity:  alert.severity || "info",
    timestamp: alert.triggered_at ? new Date(alert.triggered_at).getTime() : Date.now(),
    read:      false,
    fromAlerts: true,
  };
}

async function fetchAlerts(companyId) {
  if (!companyId) return [];
  try {
    const res = await fetch(
      `${RAILWAY_URL}/alerts/preview?company_id=${encodeURIComponent(companyId)}&dry_run=true`,
      { signal: AbortSignal.timeout(10_000) }
    );
    if (!res.ok) return [];
    const data = await res.json();
    // preview returns { critical: [], warning: [], info: [] }
    return [
      ...(data.critical || []),
      ...(data.warning  || []),
      ...(data.info     || []),
    ];
  } catch {
    return [];
  }
}

export function useNotifications(companyId) {
  const [items, setItems]   = useState([]);
  const mountedRef           = useRef(true);
  const seenAlertKeys        = useRef(new Set()); // deduplicate across polls

  const loadAlerts = useCallback(async () => {
    const alerts = await fetchAlerts(companyId);
    if (!mountedRef.current) return;

    const newNotifs = [];
    for (const alert of alerts) {
      // Key: alert_type + enterprise_id (if present) — stable across polls
      const key = `${alert.alert_type}::${alert.enterprise_id || "global"}`;
      if (seenAlertKeys.current.has(key)) continue;
      seenAlertKeys.current.add(key);
      newNotifs.push(alertToNotification(alert));
    }

    if (newNotifs.length > 0) {
      setItems(prev => [...newNotifs, ...prev]);
    }
  }, [companyId]);

  // Initial load
  useEffect(() => {
    mountedRef.current = true;
    loadAlerts();
    return () => { mountedRef.current = false; };
  }, [loadAlerts]);

  // Poll every 3 minutes
  useEffect(() => {
    if (!companyId) return;
    const interval = setInterval(loadAlerts, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [loadAlerts, companyId]);

  /** Push a one-off notification from any desktop app */
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

  const markAsRead  = useCallback((id) =>
    setItems(prev => prev.map(n => n.id === id ? { ...n, read: true } : n)), []);

  const markAllRead = useCallback(() =>
    setItems(prev => prev.map(n => ({ ...n, read: true }))), []);

  const clearAll    = useCallback(() => {
    seenAlertKeys.current.clear(); // allow re-loading fresh alerts after clear
    setItems([]);
  }, []);

  const dismissOne  = useCallback((id) =>
    setItems(prev => prev.filter(n => n.id !== id)), []);

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
