import React, { useState, useRef, useEffect } from "react";
import { X, Send, Loader2, Sparkles, RefreshCw } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

// Simple markdown renderer — no external deps (avoids duplicate React from react-markdown)
function SimpleMarkdown({ text }) {
  const lines = text.split("\n");
  return (
    <div>
      {lines.map((line, i) => {
        if (line.startsWith("### ")) return <p key={i} className="font-semibold text-white mb-1">{line.slice(4)}</p>;
        if (line.startsWith("## "))  return <p key={i} className="font-semibold text-white mb-1">{line.slice(3)}</p>;
        if (line.startsWith("# "))   return <p key={i} className="font-bold text-white mb-1">{line.slice(2)}</p>;
        if (line.startsWith("- ") || line.startsWith("* ")) {
          return <div key={i} className="flex gap-1.5 mb-0.5"><span className="text-emerald-400 shrink-0">·</span><span>{renderInline(line.slice(2))}</span></div>;
        }
        if (/^\d+\.\s/.test(line)) {
          const [num, ...rest] = line.split(/\.\s/);
          return <div key={i} className="flex gap-1.5 mb-0.5"><span className="text-emerald-400 shrink-0">{num}.</span><span>{renderInline(rest.join(". "))}</span></div>;
        }
        if (line.trim() === "") return <div key={i} className="h-1.5" />;
        return <p key={i} className="mb-0.5">{renderInline(line)}</p>;
      })}
    </div>
  );
}

function renderInline(text) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={i} className="text-white font-semibold">{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`")) return <code key={i} className="text-emerald-300 bg-white/10 px-1 rounded text-[10px]">{part.slice(1, -1)}</code>;
    return part;
  });
}

const RAILWAY_URL   = "https://newsconseenwebapp-production.up.railway.app";
const RAILWAY_API_KEY = import.meta.env.VITE_RAILWAY_API_KEY || "";
const API_HEADERS   = RAILWAY_API_KEY
  ? { "Content-Type": "application/json", "x-api-key": RAILWAY_API_KEY }
  : { "Content-Type": "application/json" };

const idjwiHeaders = (user) => ({
  ...API_HEADERS,
  ...(RAILWAY_API_KEY ? { "x-idjwi-api-key": RAILWAY_API_KEY } : {}),
  ...(user?.email ? { "x-idjwi-user": user.email } : {}),
  ...(user?.role ? { "x-idjwi-role": user.role } : {}),
});

const QUICK_PROMPTS = [
  "How are we doing today?",
  "Which tasks are overdue?",
  "Show me this month's revenue",
  "Who are my busiest staff?",
];

function Message({ msg }) {
  const isUser = msg.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} mb-3`}>
      {!isUser && (
        <div className="w-6 h-6 rounded-lg bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-[11px] shrink-0 mr-2 mt-0.5">
          🧠
        </div>
      )}
      <div
        className={`max-w-[85%] rounded-2xl px-3 py-2 text-xs leading-relaxed ${
          isUser
            ? "bg-emerald-600 text-white rounded-br-sm"
            : "bg-white/8 text-slate-200 rounded-bl-sm border border-white/8"
        }`}
      >
        {isUser ? (
          msg.content
        ) : (
          <SimpleMarkdown text={msg.content} />
        )}
      </div>
    </div>
  );
}

export default function CopilotWidget({ open, onClose, user }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [sessionId]             = useState(() => `desktop_${Date.now()}`);
  const panelRef                = useRef(null);
  const inputRef                = useRef(null);
  const bottomRef               = useRef(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Focus input when opened
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 120);
  }, [open]);

  const send = async (text) => {
    const q = (text || input).trim();
    if (!q || loading) return;
    setInput("");
    setMessages(prev => [...prev, { role: "user", content: q }]);
    setLoading(true);

    try {
      const res = await fetch(`${RAILWAY_URL}/copilot/ask`, {
        method: "POST",
        headers: idjwiHeaders(user),
        body: JSON.stringify({
          question:   q,
          company_id: user?.company_id || "",
          session_id: sessionId,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setMessages(prev => [...prev, { role: "assistant", content: data.answer || data.response || data.message || "No response" }]);
    } catch (err) {
      setMessages(prev => [...prev, { role: "assistant", content: `Sorry, I couldn't connect to Idjwi right now. (${err.message})` }]);
    }
    setLoading(false);
  };

  const handleKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Panel */}
          <motion.div
            ref={panelRef}
            className="fixed right-0 top-0 bottom-0 z-[9995] flex flex-col overflow-hidden"
            style={{
              width: 380,
              background: "rgba(6,12,26,0.98)",
              borderLeft: "1px solid rgba(255,255,255,0.09)",
              boxShadow: "-24px 0 80px rgba(0,0,0,0.6)",
              backdropFilter: "blur(32px)",
              WebkitBackdropFilter: "blur(32px)",
            }}
            initial={{ x: 380 }}
            animate={{ x: 0 }}
            exit={{ x: 380 }}
            transition={{ type: "spring", stiffness: 340, damping: 32 }}
          >
            {/* Header */}
            <div
              className="shrink-0 flex items-center justify-between px-4 py-3"
              style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}
            >
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center">
                  <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                </div>
                <div>
                  <span className="text-white font-semibold text-sm">Idjwi</span>
                  <span className="ml-2 text-[10px] text-emerald-400 font-medium">AI</span>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {messages.length > 0 && (
                  <button
                    onClick={() => setMessages([])}
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-500 hover:text-slate-300 hover:bg-white/8 transition-all"
                    title="Clear conversation"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  onClick={onClose}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-500 hover:text-white hover:bg-white/8 transition-all"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-3">
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full pb-10 gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center text-2xl">
                    🧠
                  </div>
                  <p className="text-slate-300 text-sm font-medium">How can I help?</p>
                  <p className="text-slate-500 text-xs text-center">Ask about your operations, people, finances, tasks, or inventory.</p>
                  <div className="flex flex-col gap-2 w-full mt-2">
                    {QUICK_PROMPTS.map(p => (
                      <button
                        key={p}
                        onClick={() => send(p)}
                        className="text-left text-xs px-3 py-2 rounded-xl text-slate-300 hover:text-white transition-all"
                        style={{
                          background: "rgba(255,255,255,0.05)",
                          border: "1px solid rgba(255,255,255,0.08)",
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.09)"}
                        onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.05)"}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <>
                  {messages.map((m, i) => <Message key={i} msg={m} />)}
                  {loading && (
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-6 h-6 rounded-lg bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-[11px] shrink-0">
                        🧠
                      </div>
                      <div className="flex items-center gap-1.5 px-3 py-2 rounded-2xl rounded-bl-sm bg-white/8 border border-white/8">
                        <Loader2 className="w-3 h-3 text-emerald-400 animate-spin" />
                        <span className="text-xs text-slate-400">Thinking…</span>
                      </div>
                    </div>
                  )}
                  <div ref={bottomRef} />
                </>
              )}
            </div>

            {/* Input */}
            <div
              className="shrink-0 px-3 py-3"
              style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}
            >
              <div
                className="flex items-end gap-2 rounded-xl px-3 py-2"
                style={{
                  background: "rgba(255,255,255,0.07)",
                  border: "1px solid rgba(255,255,255,0.10)",
                }}
              >
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKey}
                  placeholder="Ask anything about your operations…"
                  rows={1}
                  className="flex-1 bg-transparent text-white text-xs placeholder-slate-500 outline-none resize-none leading-relaxed"
                  style={{ maxHeight: 80 }}
                />
                <button
                  onClick={() => send()}
                  disabled={!input.trim() || loading}
                  className="w-7 h-7 rounded-lg flex items-center justify-center transition-all shrink-0"
                  style={{
                    background: input.trim() && !loading ? "#10b981" : "rgba(255,255,255,0.08)",
                    color: input.trim() && !loading ? "white" : "#475569",
                  }}
                >
                  {loading
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <Send className="w-3.5 h-3.5" />
                  }
                </button>
              </div>
              <p className="text-[10px] text-slate-600 mt-1.5 px-1">Enter to send · Shift+Enter for new line</p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
