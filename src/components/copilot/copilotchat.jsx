import React, { useState, useRef, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Send, Loader2, Sparkles, ThumbsUp, ThumbsDown,
         AlertTriangle, TrendingUp, Package, Users,
         CheckCircle, RefreshCw, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";

const RAILWAY_URL = "https://newsconseenwebapp-production.up.railway.app";
const RAILWAY_API_KEY = import.meta.env.VITE_RAILWAY_API_KEY || "";

// ----------------------------------------------------------
// Sample questions shown before first message
// ----------------------------------------------------------
const SAMPLE_QUESTIONS = [
  "Give me an overview of how we are doing today",
  "Which items expire in the next 7 days?",
  "How many active staff do we have?",
  "What was our revenue this month?",
  "Which tasks are overdue?",
  "Show me everything running low on stock",
];

// ----------------------------------------------------------
// Alert badge rendering
// ----------------------------------------------------------
function AlertBadge({ level, message }) {
  const config = {
    critical: { icon: "🔴", bg: "bg-rose-50 border-rose-200 text-rose-800" },
    warning:  { icon: "🟡", bg: "bg-amber-50 border-amber-200 text-amber-800" },
    ok:       { icon: "🟢", bg: "bg-emerald-50 border-emerald-200 text-emerald-700" },
  }[level] || { icon: "⚪", bg: "bg-slate-50 border-slate-200 text-slate-600" };

  return (
    <div className={`flex items-start gap-2 px-3 py-2 rounded-lg border text-xs ${config.bg}`}>
      <span>{config.icon}</span>
      <span>{message}</span>
    </div>
  );
}

// ----------------------------------------------------------
// Data summary card — shown alongside answers
// ----------------------------------------------------------
function DataCard({ data }) {
  const [expanded, setExpanded] = useState(false);

  if (!data || Object.keys(data).length === 0) return null;

  // Flatten tool results for display
  const summaries = Object.entries(data)
    .filter(([, result]) => result?.summary && Object.keys(result.summary).length > 0)
    .map(([tool, result]) => ({ tool, summary: result.summary, count: result.count }));

  const alerts = Object.values(data)
    .flatMap(r => r?.summary?.alerts || []);

  if (summaries.length === 0 && alerts.length === 0) return null;

  return (
    <div className="mt-2 border border-slate-200 rounded-xl overflow-hidden">
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between px-3 py-2 bg-slate-50 text-xs font-medium text-slate-500 hover:bg-slate-100 transition-colors"
      >
        <span className="flex items-center gap-1.5">
          <Sparkles className="w-3 h-3" />
          Data sources
          {alerts.length > 0 && (
            <span className="ml-1 px-1.5 py-0.5 bg-rose-100 text-rose-600 rounded-full text-[10px] font-bold">
              {alerts.filter(a => a.level === "critical").length} critical
            </span>
          )}
        </span>
        {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>

      {expanded && (
        <div className="px-3 py-2 space-y-2 bg-white">
          {alerts.map((alert, i) => (
            <AlertBadge key={i} level={alert.level} message={alert.message} />
          ))}
          {summaries.map(({ tool, summary, count }) => (
            <div key={tool} className="text-xs text-slate-500">
              <span className="font-medium text-slate-700 capitalize">
                {tool.replace("query_", "").replace(/_/g, " ")}
              </span>
              {" "}— {count} record{count !== 1 ? "s" : ""}
              {Object.keys(summary).length > 0 && (
                <div className="mt-1 grid grid-cols-2 gap-1">
                  {Object.entries(summary)
                    .filter(([k]) => k !== "alerts" && k !== "cities")
                    .slice(0, 6)
                    .map(([key, value]) => (
                      <div key={key} className="flex justify-between bg-slate-50 rounded px-2 py-1">
                        <span className="text-slate-400 capitalize">{key.replace(/_/g, " ")}</span>
                        <span className="font-medium text-slate-700">
                          {typeof value === "number"
                            ? value % 1 === 0 ? value.toLocaleString() : value.toFixed(1)
                            : String(value)}
                        </span>
                      </div>
                    ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------
// Message bubble
// ----------------------------------------------------------
function MessageBubble({ message, onFeedback }) {
  const isUser = message.role === "user";
  const isThinking = message.type === "thinking";

  if (isThinking) {
    return (
      <div className="flex items-center gap-2 text-xs text-slate-400 py-1">
        <Loader2 className="w-3 h-3 animate-spin" />
        <span>{message.content}</span>
      </div>
    );
  }

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} mb-3`}>
      <div className={`max-w-[85%] ${isUser ? "items-end" : "items-start"} flex flex-col gap-1`}>

        {!isUser && (
          <div className="flex items-center gap-1.5 mb-0.5">
            <div className="w-5 h-5 rounded-full bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center">
              <Sparkles className="w-3 h-3 text-white" />
            </div>
            <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">
              Copilot
            </span>
          </div>
        )}

        <div className={`px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
          isUser
            ? "bg-emerald-600 text-white rounded-tr-md"
            : "bg-white border border-slate-200 text-slate-800 rounded-tl-md shadow-sm"
        }`}>
          {message.content}
        </div>

        {/* Data card for assistant messages */}
        {!isUser && message.data && (
          <div className="w-full">
            <DataCard data={message.data} />
          </div>
        )}

        {/* Feedback buttons for assistant messages */}
        {!isUser && onFeedback && message.id && (
          <div className="flex items-center gap-1 mt-0.5">
            <button
              onClick={() => onFeedback(message.id, 1)}
              className={`p-1 rounded transition-colors ${
                message.feedback === 1
                  ? "text-emerald-600"
                  : "text-slate-300 hover:text-slate-500"
              }`}
            >
              <ThumbsUp className="w-3 h-3" />
            </button>
            <button
              onClick={() => onFeedback(message.id, -1)}
              className={`p-1 rounded transition-colors ${
                message.feedback === -1
                  ? "text-rose-500"
                  : "text-slate-300 hover:text-slate-500"
              }`}
            >
              <ThumbsDown className="w-3 h-3" />
            </button>
            {message.intent && message.intent !== "unknown" && (
              <span className="text-[10px] text-slate-300 ml-1">
                {message.intent.replace(/_/g, " ")}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ----------------------------------------------------------
// Main CopilotChat component
// ----------------------------------------------------------
export default function CopilotChat({ currentUser, className = "" }) {
  const [messages, setMessages]   = useState([]);
  const [input, setInput]         = useState("");
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState(null);
  const [context, setContext]     = useState(null);
  const messagesEndRef            = useRef(null);
  const inputRef                  = useRef(null);

  const companyId = currentUser?.company_id;

  // Load copilot context on mount
  useEffect(() => {
    if (!companyId) return;
    fetch(`${RAILWAY_URL}/copilot/context?company_id=${companyId}`, { headers: { "x-api-key": RAILWAY_API_KEY } })
      .then(r => r.json())
      .then(setContext)
      .catch(() => setContext(null));
  }, [companyId]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async (questionOverride = null) => {
    const question = (questionOverride || input).trim();
    if (!question || loading || !companyId) return;

    setInput("");
    setError(null);

    const userMsg = {
      id:      Date.now(),
      role:    "user",
      content: question,
    };

    const thinkingMsg = {
      id:      Date.now() + 1,
      role:    "assistant",
      type:    "thinking",
      content: "Analyzing your question...",
    };

    setMessages(prev => [...prev, userMsg, thinkingMsg]);
    setLoading(true);

    try {
      // Build history for multi-turn conversation
      const history = messages
        .filter(m => m.type !== "thinking")
        .map(m => ({ role: m.role, content: m.content }));

      const resp = await fetch(`${RAILWAY_URL}/copilot/ask`, {
        method:  "POST",
        headers: { "Content-Type": "application/json", "x-api-key": RAILWAY_API_KEY },
        body: JSON.stringify({
          question,
          company_id:      companyId,
          enterprise_name: currentUser?.enterprise_name || "",
          history,
        }),
      });

      if (!resp.ok) {
        // Try to extract detail from FastAPI error body
        let detail = `HTTP ${resp.status}`;
        try {
          const errBody = await resp.json();
          detail = errBody.detail || detail;
        } catch { /* ignore parse errors */ }
        throw new Error(detail);
      }

      const result = await resp.json();

      const assistantMsg = {
        id:       Date.now() + 2,
        role:     "assistant",
        content:  result.answer,
        data:     result.data,
        intent:   result.intent,
        feedback: null,
      };

      setMessages(prev => [
        ...prev.filter(m => m.type !== "thinking"),
        assistantMsg,
      ]);

    } catch (err) {
      const msg = err.message || "";
      // If it's a real network failure (no response at all)
      const isNetworkError = msg === "Failed to fetch" || msg === "Network request failed";
      setError(
        isNetworkError
          ? "Could not reach python_layer. Check that Railway is running."
          : msg
      );
      setMessages(prev => prev.filter(m => m.type !== "thinking"));
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleFeedback = async (messageId, rating) => {
    setMessages(prev =>
      prev.map(m => m.id === messageId ? { ...m, feedback: rating } : m)
    );

    const msg = messages.find(m => m.id === messageId);
    const question = messages.find(m => m.role === "user")?.content || "";

    try {
      await fetch(`${RAILWAY_URL}/copilot/feedback`, {
        method:  "POST",
        headers: { "Content-Type": "application/json", "x-api-key": RAILWAY_API_KEY },
        body: JSON.stringify({
          question,
          answer:     msg?.content || "",
          company_id: companyId,
          rating,
        }),
      });
    } catch {
      // Non-critical — feedback can fail silently
    }
  };

  const hasMessages = messages.filter(m => m.type !== "thinking").length > 0;

  if (!companyId) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400 text-sm">
        Sign in to use the Copilot
      </div>
    );
  }

  return (
    <div className={`flex flex-col h-full bg-slate-50 rounded-2xl overflow-hidden ${className}`}>

      {/* Header */}
      <div className="px-4 py-3 bg-white border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center shadow-sm">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-800">Operational Copilot</p>
            <p className="text-[10px] text-slate-400">
              {context?.data_available
                ? `${context.enterprise_count} enterprise${context.enterprise_count !== 1 ? "s" : ""} · ${
                    context.critical_alerts > 0
                      ? `${context.critical_alerts} critical alert${context.critical_alerts !== 1 ? "s" : ""}`
                      : "All clear"
                  }`
                : "Connecting to analytics..."}
            </p>
          </div>
        </div>
        {context?.critical_alerts > 0 && (
          <div className="flex items-center gap-1 px-2 py-1 bg-rose-50 text-rose-600 rounded-lg text-xs font-medium">
            <AlertTriangle className="w-3 h-3" />
            {context.critical_alerts}
          </div>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
        {!hasMessages && (
          <div className="flex flex-col items-center justify-center h-full gap-4 py-8">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center shadow-lg">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold text-slate-700 mb-1">
                Ask me anything about your operations
              </p>
              <p className="text-xs text-slate-400 max-w-xs">
                I have access to your people, inventory, finances, and tasks — all grounded in real data.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-2 w-full max-w-sm">
              {SAMPLE_QUESTIONS.map((q, i) => (
                <button
                  key={i}
                  onClick={() => sendMessage(q)}
                  className="text-left px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs text-slate-600 hover:border-emerald-300 hover:text-emerald-700 transition-all hover:shadow-sm"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map(msg => (
          <MessageBubble
            key={msg.id}
            message={msg}
            onFeedback={handleFeedback}
          />
        ))}

        {error && (
          <div className="flex items-center gap-2 px-3 py-2 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            {error}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="px-4 py-3 bg-white border-t border-slate-100">
        <div className="flex items-end gap-2">
          <div className="flex-1 relative">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              placeholder="Ask about your operations..."
              disabled={loading}
              rows={1}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm resize-none focus:outline-none focus:border-emerald-400 transition-colors disabled:opacity-50 bg-slate-50"
              style={{ minHeight: "42px", maxHeight: "120px" }}
            />
          </div>
          <button
            onClick={() => sendMessage()}
            disabled={!input.trim() || loading}
            className="p-2.5 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm shadow-emerald-500/20 shrink-0"
          >
            {loading
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <Send className="w-4 h-4" />}
          </button>
        </div>
        <p className="text-[10px] text-slate-300 mt-1.5 text-center">
          Answers are grounded in your analytics data · Press Enter to send
        </p>
      </div>
    </div>
  );
}
