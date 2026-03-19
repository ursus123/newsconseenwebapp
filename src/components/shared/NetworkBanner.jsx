import React, { useState, useEffect } from "react";
import { Wifi, WifiOff } from "lucide-react";

export default function NetworkBanner() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showReconnected, setShowReconnected] = useState(false);

  useEffect(() => {
    const handleOffline = () => {
      setIsOnline(false);
      setShowReconnected(false);
    };
    const handleOnline = () => {
      setIsOnline(true);
      setShowReconnected(true);
      setTimeout(() => setShowReconnected(false), 3000);
    };

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
    };
  }, []);

  if (isOnline && !showReconnected) return null;

  if (!isOnline) {
    return (
      <div className="w-full bg-amber-500 text-white text-xs text-center py-2 font-medium flex items-center justify-center gap-1.5 z-[100]">
        <WifiOff className="w-3 h-3" />
        You are offline — changes may not be saved
      </div>
    );
  }

  if (showReconnected) {
    return (
      <div className="w-full bg-emerald-500 text-white text-xs text-center py-2 font-medium flex items-center justify-center gap-1.5 z-[100]">
        <Wifi className="w-3 h-3" />
        ✅ Back online — syncing your data
      </div>
    );
  }

  return null;
}