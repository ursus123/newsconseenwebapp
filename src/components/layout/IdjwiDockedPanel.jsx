/**
 * IdjwiDockedPanel — global summonable Idjwi panel
 *
 * Renders CopilotChat in a slide-in drawer so any page can ask Idjwi about
 * whatever is on screen without navigating away. Mounted once in Layout.jsx.
 *
 * Invoked:
 *   window.dispatchEvent(new CustomEvent("open-idjwi-panel", {
 *     detail: { initialMessage: "...", context: { entity_type, entity_id, entity_label } }
 *   }))
 */

import React, { useState, useEffect } from "react";
import ReactDOM from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { X, Sparkles, ExternalLink } from "lucide-react";
import CopilotChat from "@/components/copilot/copilotchat";

export default function IdjwiDockedPanel({ currentUser }) {
  const [open, setOpen] = useState(false);
  const [initialMessage, setInitialMessage] = useState("");
  const [panelContext, setPanelContext] = useState(null);
  const [nonce, setNonce] = useState(0);
  const navigate = useNavigate();

  // Open via global event
  useEffect(() => {
    function onOpen(e) {
      setInitialMessage(e.detail?.initialMessage || "");
      setPanelContext(e.detail?.context || null);
      setNonce(n => n + 1);
      setOpen(true);
    }
    window.addEventListener("open-idjwi-panel", onOpen);
    return () => window.removeEventListener("open-idjwi-panel", onOpen);
  }, []);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  useEffect(() => {
    const closeForGraphEvidence = () => setOpen(false);
    window.addEventListener("company-graph-citation-selected", closeForGraphEvidence);
    return () => window.removeEventListener("company-graph-citation-selected", closeForGraphEvidence);
  }, []);

  const panel = (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-[199] bg-black/20 backdrop-blur-[1px]"
            onClick={() => setOpen(false)}
          />
          <motion.div
            key="panel"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 380, damping: 36 }}
            className="fixed right-0 top-0 h-full z-[200] bg-white shadow-2xl flex flex-col border-l border-slate-200"
            style={{ width: "min(480px, 100vw)" }}
          >
            {/* Header */}
            <div className="flex-shrink-0 px-4 pt-4 pb-3 border-b border-slate-100 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center shrink-0">
                  <Sparkles className="w-4 h-4 text-white" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-800">Idjwi</p>
                  {panelContext?.entity_label && (
                    <p className="text-[11px] text-slate-400 truncate max-w-[280px]">
                      About: {panelContext.entity_label}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => { navigate(createPageUrl("idjwi")); setOpen(false); }}
                  title="Open full Idjwi"
                  className="flex items-center gap-1 px-2 py-1.5 text-[11px] font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 min-h-0">
              <CopilotChat
                key={nonce}
                currentUser={currentUser}
                className="h-full"
                initialMessage={initialMessage}
                pageContext={panelContext}
                autoSend={!!initialMessage}
              />
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );

  return ReactDOM.createPortal(panel, document.body);
}
