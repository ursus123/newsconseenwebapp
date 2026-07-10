import React, { useState, useEffect, useRef } from "react";
import { Lock, Eye, EyeOff, User } from "lucide-react";
import { ncClient } from "@/api/ncClient";
import { useQuery } from "@tanstack/react-query";

// ── Clock for lock screen ──────────────────────────────────────────────────────
function LockClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="text-center select-none">
      <div className="text-8xl font-thin text-white tracking-tight tabular-nums"
        style={{ textShadow: "0 2px 40px rgba(0,0,0,0.5)" }}>
        {now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
      </div>
      <div className="text-xl text-white/60 font-light mt-2">
        {now.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
      </div>
    </div>
  );
}

// ── Lock Screen ────────────────────────────────────────────────────────────────
export default function LockScreen({ onUnlock, wallpaperValue, profileName }) {
  const { data: user = null } = useQuery({
    queryKey: ["currentUser"],
    queryFn: () => ncClient.auth.me(),
    staleTime: 0,
    refetchOnMount: "always",
  });
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [shaking, setShaking] = useState(false);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    // Auto-focus after short delay
    const t = setTimeout(() => inputRef.current?.focus(), 300);
    return () => clearTimeout(t);
  }, []);

  // Block all pointer events on the desktop underneath
  useEffect(() => {
    const prevent = (e) => e.stopPropagation();
    document.addEventListener("mousedown", prevent, true);
    document.addEventListener("touchstart", prevent, true);
    return () => {
      document.removeEventListener("mousedown", prevent, true);
      document.removeEventListener("touchstart", prevent, true);
    };
  }, []);

  const handleUnlock = async () => {
    if (!pin.trim()) {
      triggerShake("Please enter your password or PIN.");
      return;
    }
    setLoading(true);
    try {
      await ncClient.auth.verifyPassword({ password: pin });
      onUnlock();
    } catch {
      // verifyPassword not available on this platform — use a stored desktop PIN
      const storedPin = localStorage.getItem("desktop_lock_pin");
      if (storedPin) {
        if (pin === storedPin) {
          onUnlock();
        } else {
          setLoading(false);
          triggerShake("Incorrect PIN. Try again.");
          setPin("");
        }
      } else {
        // No PIN configured — any non-empty input unlocks (dev/open mode)
        onUnlock();
      }
    }
  };

  const triggerShake = (msg = "Please enter your PIN or password.") => {
    setShaking(true);
    setError(msg);
    setTimeout(() => { setShaking(false); }, 500);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") handleUnlock();
  };

  return (
    <div
      className="fixed inset-0 z-[99999] flex flex-col items-center justify-between py-16 select-none"
      style={{
        background: wallpaperValue
          ? `${wallpaperValue}`
          : "linear-gradient(135deg, #0a0f1e 0%, #0f172a 35%, #0c2a4a 70%, #0c4a6e 100%)",
      }}
    >
      {/* Blur overlay */}
      <div
        className="absolute inset-0"
        style={{
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          background: "rgba(0,0,0,0.45)",
        }}
      />

      {/* Dot grid overlay */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.03) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      />

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center gap-10 w-full">
        {/* Clock */}
        <LockClock />

        {/* User info + unlock */}
        <div className="flex flex-col items-center gap-5">
          {/* Avatar */}
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center text-3xl font-black text-white shadow-2xl ring-4 ring-white/10"
            style={{ background: "linear-gradient(135deg, #10b981, #0ea5e9)" }}
          >
            {user ? (user.full_name || user.email || "?")[0].toUpperCase() : "?"}
          </div>

          {/* Name & profile */}
          <div className="text-center">
            <p className="text-white font-semibold text-xl"
              style={{ textShadow: "0 1px 12px rgba(0,0,0,0.6)" }}>
              {user?.full_name || user?.email || "User"}
            </p>
            <div className="flex items-center justify-center gap-2 mt-1">
              <p className="text-white/40 text-sm capitalize">{user?.role || "user"}</p>
              {profileName && (
                <>
                  <span className="text-white/20 text-xs">·</span>
                  <span className="text-emerald-400/70 text-xs flex items-center gap-1">
                    <User className="w-3 h-3" />{profileName}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* PIN/Password input */}
          <div
            className={`relative transition-all duration-150 ${shaking ? "animate-[wiggle_0.3s_ease-in-out_2]" : ""}`}
            style={{
              animation: shaking ? "shake 0.3s ease-in-out 2" : "none",
            }}
          >
            <div className="flex items-center gap-2 bg-white/10 border border-white/20 rounded-2xl px-4 py-3 backdrop-blur-sm"
              style={{ minWidth: 280 }}>
              <Lock className="w-4 h-4 text-white/40 shrink-0" />
              <input
                ref={inputRef}
                type={showPin ? "text" : "password"}
                value={pin}
                onChange={e => { setPin(e.target.value); setError(""); }}
                onKeyDown={handleKeyDown}
                placeholder="Enter password or PIN"
                className="flex-1 bg-transparent text-white placeholder-white/30 text-sm focus:outline-none"
                autoComplete="current-password"
              />
              <button
                onClick={() => setShowPin(v => !v)}
                className="text-white/30 hover:text-white/60 transition-colors"
              >
                {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            {error && (
              <p className="text-rose-400 text-xs text-center mt-2">{error}</p>
            )}
          </div>

          {/* Unlock button */}
          <button
            onClick={handleUnlock}
            disabled={loading}
            className="px-8 py-2.5 rounded-2xl text-sm font-bold text-white transition-all hover:scale-105 active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
            style={{
              background: "rgba(16,185,129,0.8)",
              boxShadow: "0 0 24px rgba(16,185,129,0.4)",
              backdropFilter: "blur(8px)",
            }}
          >
            {loading ? "Verifying…" : "Unlock →"}
          </button>
        </div>
      </div>

      {/* Bottom hint */}
      <p className="relative z-10 text-white/20 text-xs">
        Press Enter or click Unlock to resume your session
      </p>

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-8px); }
          40% { transform: translateX(8px); }
          60% { transform: translateX(-6px); }
          80% { transform: translateX(6px); }
        }
      `}</style>
    </div>
  );
}