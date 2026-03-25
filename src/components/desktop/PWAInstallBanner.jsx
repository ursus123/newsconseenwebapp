import React, { useState } from "react";
import { Download, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

/**
 * PWAInstallBanner
 * Small bottom-left banner that prompts the user to install the PWA.
 * Only shows when the browser fires 'beforeinstallprompt'.
 */
export default function PWAInstallBanner({ canInstall, onInstall }) {
  const [dismissed, setDismissed] = useState(false);

  if (!canInstall || dismissed) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ x: -320, opacity: 0 }}
        animate={{ x: 0,    opacity: 1 }}
        exit={{   x: -320,  opacity: 0 }}
        transition={{ type: "spring", stiffness: 340, damping: 28, delay: 2 }}
        className="fixed bottom-16 left-3 z-[9998] flex items-center gap-3 px-4 py-3 rounded-2xl shadow-2xl"
        style={{
          background: "rgba(8,15,30,0.97)",
          border: "1px solid rgba(16,185,129,0.3)",
          backdropFilter: "blur(20px)",
          maxWidth: 300,
        }}
      >
        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0"
          style={{ background: "rgba(16,185,129,0.15)" }}>
          🖥️
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-white text-xs font-semibold">Install Newsconseen OS</p>
          <p className="text-slate-500 text-[11px] mt-0.5">Works offline, faster launch</p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={onInstall}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-white transition-all"
            style={{ background: "#10b981" }}
          >
            <Download className="w-3.5 h-3.5" />
            Install
          </button>
          <button
            onClick={() => setDismissed(true)}
            className="w-7 h-7 rounded-xl flex items-center justify-center text-slate-500 hover:text-white hover:bg-white/10 transition-all"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}