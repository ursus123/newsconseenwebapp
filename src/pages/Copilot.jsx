import React, { useState, useEffect } from "react";
import { Sparkles } from "lucide-react";
import { base44 } from "@/api/base44Client";
import CopilotChat from "@/components/copilot/copilotchat";

const COPILOT_BACKEND = import.meta.env.VITE_COPILOT_BACKEND || "anthropic";
const BACKEND_LABEL = COPILOT_BACKEND === "openai" ? "Powered by GPT-4o" : "Powered by Claude";

export default function Copilot() {
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    base44.auth.me().then(setCurrentUser).catch(() => {});
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
        <span className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold shrink-0">
          <Sparkles className="w-3 h-3" />
          {BACKEND_LABEL}
        </span>
      </div>

      {/* Chat — fills remaining height */}
      <div className="flex-1 min-h-0">
        <CopilotChat currentUser={currentUser} className="h-full" />
      </div>
    </div>
  );
}