import React, { useState, useEffect } from "react";
import { WifiOff, Wifi, RefreshCw } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

/**
 * OfflineIndicator
 * Shows a small banner in the taskbar area when the user is offline.
 * Auto-hides after 3s when coming back online.
 */
export default function OfflineIndicator({ isOnline }) {
  const [showBackOnline, setShowBackOnline] = useState(false);
  const [prevOnline, setPrevOnline] = useState(isOnline);

  useEffect(() => {
    if (!prevOnline && isOnline) {
      // Just came back online
      setShowBackOnline(true);
      const t = setTimeout(() => setShowBackOnline(false), 3000);
      return () => clearTimeout(t);
    }
    setPrevOnline(isOnline);
  }, [isOnline]);

  const showOffline    = !isOnline;
  const showReconnected = showBackOnline && isOnline;

  return (
    <AnimatePresence>
      {(showOffline || showReconnected) && (
        <motion.div
          key={showOffline ? "offline" : "online"}
          initial={{ y: -40, opacity: 0 }}
          animate={{ y: 0,   opacity: 1 }}
          exit={{   y: -40,  opacity: 0 }}
          transition={{ type: "spring", stiffness: 400, damping: 30 }}
          className="fixed top-8 left-1/2 z-[99999] flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold shadow-xl"
          style={{
            transform: "translateX(-50%)",
            background: showOffline
              ? "rgba(239,68,68,0.95)"
              : "rgba(16,185,129,0.95)",
            backdropFilter: "blur(12px)",
            border: "1px solid rgba(255,255,255,0.2)",
            color: "white",
          }}
        >
          {showOffline ? (
            <>
              <WifiOff className="w-3.5 h-3.5" />
              Offline — using cached data
            </>
          ) : (
            <>
              <Wifi className="w-3.5 h-3.5" />
              Back online — syncing…
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}