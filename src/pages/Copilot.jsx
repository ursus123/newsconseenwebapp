import React, { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Sparkles, AlertTriangle, CheckCircle2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useLocation } from "react-router-dom";
import CopilotChat from "@/components/copilot/copilotchat";

const RAILWAY_URL = "https://newsconseenwebapp-production.up.railway.app";
const RAILWAY_API_KEY = import.meta.env.VITE_RAILWAY_API_KEY || "";
const COPILOT_BACKEND = import.meta.env.VITE_COPILOT_BACKEND || "anthropic";
const BACKEND_LABEL = COPILOT_BACKEND === "openai" ? "Powered by GPT-4o" : "Powered by Claude";

export default function Copilot() {
  const location = useLocation();
  const prefillMessage = location.state?.prefillMessage || "";
  const { data: currentUser = null } = useQuery({
    queryKey: ["currentUser"],
    queryFn: () => base44.auth.me(),
    staleTime: 0,
    refetchOnMount: "always",
  });
  const [backendStatus, setBackendStatus]   = useState(null); // null | "ok" | "degraded" | "unreachable"

  // Check copilot backend on mount
  useEffect(() => {
    fetch(`${RAILWAY_URL}/copilot/status`, {
      headers: RAILWAY_API_KEY ? { "x-api-key": RAILWAY_API_KEY } : {},
    })
      .then(r => r.json())
      .then(d => setBackendStatus(d.backend_available ? "ok" : "degraded"))
      .catch(() => setBackendStatus("unreachable"));
  }, []);

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center shadow-sm">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800">Operational Copilot</h1>
            <p className="text-xs text-slate-500">
              Ask anything about your operations — answers grounded in your data
            </p>
          </div>
        </div>

        <div className="hidden sm:flex items-center gap-2 shrink-0">
          {/* Backend status badge */}
          {backendStatus === "ok" && (
            <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold">
              <CheckCircle2 className="w-3 h-3" /> {BACKEND_LABEL}
            </span>
          )}
          {backendStatus === "degraded" && (
            <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-xs font-semibold">
              <AlertTriangle className="w-3 h-3" /> ANTHROPIC_API_KEY not set in Railway
            </span>
          )}
          {backendStatus === "unreachable" && (
            <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
              <AlertTriangle className="w-3 h-3" /> python_layer unreachable
            </span>
          )}
          {backendStatus === null && (
            <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-50 border border-slate-200 text-slate-500 text-xs">
              <Sparkles className="w-3 h-3 animate-pulse" /> Checking…
            </span>
          )}
        </div>
      </div>

      {/* Chat — fills remaining height */}
      <div className="flex-1 min-h-0">
        <CopilotChat currentUser={currentUser} className="h-full" initialMessage={prefillMessage} />
      </div>
    </div>
  );
}