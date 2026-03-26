import React, { useState, useEffect } from "react";

/**
 * usePWA
 * Registers the service worker, tracks online/offline status,
 * exposes install prompt, and provides a helper to request push permission.
 */
export function usePWA() {
  const [isOnline,        setIsOnline]        = useState(navigator.onLine);
  const [swReady,         setSwReady]         = useState(false);
  const [installPrompt,   setInstallPrompt]   = useState(null);
  const [isInstalled,     setIsInstalled]     = useState(false);
  const [pushPermission,  setPushPermission]  = useState(
    typeof Notification !== "undefined" ? Notification.permission : "default"
  );

  // ── Register service worker ─────────────────────────────────────────────
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((reg) => {
        setSwReady(true);
        // Trigger background sync registration when online
        if ("sync" in reg) {
          navigator.serviceWorker.ready.then(r =>
            r.sync.register("newsconseen-sync").catch(() => {})
          );
        }
      })
      .catch(() => {});
  }, []);

  // ── Online / Offline ────────────────────────────────────────────────────
  useEffect(() => {
    const online  = () => setIsOnline(true);
    const offline = () => setIsOnline(false);
    window.addEventListener("online",  online);
    window.addEventListener("offline", offline);
    return () => {
      window.removeEventListener("online",  online);
      window.removeEventListener("offline", offline);
    };
  }, []);

  // ── PWA install prompt ──────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      setInstallPrompt(e);
    };
    window.addEventListener("beforeinstallprompt", handler);

    // Check if already installed (standalone mode)
    if (window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone) {
      setIsInstalled(true);
    }

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  // ── Install trigger ─────────────────────────────────────────────────────
  const promptInstall = async () => {
    if (!installPrompt) return false;
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === "accepted") {
      setIsInstalled(true);
      setInstallPrompt(null);
    }
    return outcome === "accepted";
  };

  // ── Request push notification permission ────────────────────────────────
  const requestPushPermission = async () => {
    if (typeof Notification === "undefined") return "unsupported";
    const result = await Notification.requestPermission();
    setPushPermission(result);
    return result;
  };

  return {
    isOnline,
    swReady,
    isInstalled,
    canInstall:  !!installPrompt && !isInstalled,
    promptInstall,
    pushPermission,
    requestPushPermission,
  };
}