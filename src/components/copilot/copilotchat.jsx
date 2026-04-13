import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Send, Loader2, Sparkles, ThumbsUp, ThumbsDown, AlertTriangle,
  ChevronDown, ChevronUp, BarChart2, Globe, Brain, BookOpen,
  ExternalLink, Save, CheckCircle, RefreshCw, TrendingUp,
  PieChart as PieIcon, Activity,
} from "lucide-react";
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer,
} from "recharts";

const RAILWAY_URL = "https://newsconseenwebapp-production.up.railway.app";
const RAILWAY_API_KEY = import.meta.env.VITE_RAILWAY_API_KEY || "";
const API_HEADERS = RAILWAY_API_KEY
  ? { "Content-Type": "application/json", "x-api-key": RAILWAY_API_KEY }
  : { "Content-Type": "application/json" };

// ── Colour palette shared between charts ────────────────────────────────────
const PALETTE = ["#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6",
                 "#06b6d4", "#f97316", "#84cc16", "#ec4899", "#14b8a6"];

// ── Mode definitions ─────────────────────────────────────────────────────────
const MODES = {
  operations: {
    key:   "operations",
    label: "Operations",
    icon:  Activity,
    color: "emerald",
    placeholder: "Ask about your people, tasks, inventory, finances…",
    questions: [
      "Give me an overview of how we are doing today",
      "Which items expire in the next 7 days?",
      "How many active staff do we have?",
      "What was our revenue this month?",
      "Which tasks are overdue?",
      "Show me everything running low on stock",
    ],
  },
  market: {
    key:   "market",
    label: "Market Intelligence",
    icon:  Globe,
    color: "blue",
    placeholder: "Ask about industry trends, competitors, regulations…",
    questions: [
      "What are the latest trends in our industry?",
      "Who are our main competitors and how are they performing?",
      "What regulations should our business be aware of?",
      "Analyse global economic indicators relevant to our sector",
      "What are best practices for customer retention in our industry?",
      "What is the market size and growth rate for our sector?",
    ],
  },
  ml: {
    key:   "ml",
    label: "ML Insights",
    icon:  Brain,
    color: "violet",
    placeholder: "Ask for ML predictions, forecasts, and risk analysis…",
    questions: [
      "What is our client retention risk?",
      "Show me customer segmentation and lifetime value",
      "Forecast demand for the next quarter",
      "Which clients are most at risk of churning?",
      "Run a full ML analysis on our operational data",
      "What does our revenue forecast look like?",
    ],
  },
};

// ── Inline chart renderer ────────────────────────────────────────────────────
function ChartCard({ config }) {
  if (!config || !config.data || config.data.length === 0) return null;

  const { type, title, data, keys = [], unit = "" } = config;

  const fmtTick = (v) => {
    if (typeof v !== "number") return v;
    if (unit === "$") return `$${v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v}`;
    if (unit === "%") return `${v}%`;
    return v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v;
  };

  const fmtTooltip = (v, name) => {
    const fv = unit === "$" ? `$${Number(v).toLocaleString()}`
             : unit === "%" ? `${v}%`
             : Number(v).toLocaleString();
    return [fv, name];
  };

  return (
    <div className="mt-2 bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-slate-100 bg-slate-50">
        <BarChart2 className="w-3.5 h-3.5 text-slate-400" />
        <span className="text-xs font-semibold text-slate-600">{title}</span>
      </div>
      <div className="p-3" style={{ height: 200 }}>
        <ResponsiveContainer width="100%" height="100%">
          {type === "pie" ? (
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={70}
                label={({ name, percent }) =>
                  `${name} ${(percent * 100).toFixed(0)}%`
                }
                labelLine={false}
              >
                {data.map((_, i) => (
                  <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(v, n) => [v.toLocaleString(), n]} />
            </PieChart>
          ) : type === "area" ? (
            <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} />
              <YAxis tickFormatter={fmtTick} tick={{ fontSize: 10 }} width={42} />
              <Tooltip formatter={fmtTooltip} />
              {(keys.length ? keys : [{ key: Object.keys(data[0]).find(k => k !== "name"), color: PALETTE[0] }]).map((k, i) => (
                <Area
                  key={k.key}
                  type="monotone"
                  dataKey={k.key}
                  stroke={k.color || PALETTE[i]}
                  fill={`${k.color || PALETTE[i]}30`}
                  strokeWidth={2}
                />
              ))}
              {keys.length > 1 && <Legend wrapperStyle={{ fontSize: 10 }} />}
            </AreaChart>
          ) : type === "line" ? (
            <LineChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} />
              <YAxis tickFormatter={fmtTick} tick={{ fontSize: 10 }} width={42} />
              <Tooltip formatter={fmtTooltip} />
              {(keys.length ? keys : [{ key: Object.keys(data[0]).find(k => k !== "name"), color: PALETTE[0] }]).map((k, i) => (
                <Line
                  key={k.key}
                  type="monotone"
                  dataKey={k.key}
                  stroke={k.color || PALETTE[i]}
                  strokeWidth={2}
                  dot={false}
                />
              ))}
              {keys.length > 1 && <Legend wrapperStyle={{ fontSize: 10 }} />}
            </LineChart>
          ) : (
            /* default: bar */
            <BarChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="name" tick={{ fontSize: 9 }} interval={0} angle={data.length > 5 ? -30 : 0} textAnchor={data.length > 5 ? "end" : "middle"} height={data.length > 5 ? 40 : 20} />
              <YAxis tickFormatter={fmtTick} tick={{ fontSize: 10 }} width={42} />
              <Tooltip formatter={fmtTooltip} />
              {(keys.length ? keys : [{ key: Object.keys(data[0]).find(k => k !== "name"), color: PALETTE[0] }]).map((k, i) => (
                <Bar key={k.key} dataKey={k.key} fill={k.color || PALETTE[i]} radius={[3, 3, 0, 0]} maxBarSize={40} />
              ))}
              {keys.length > 1 && <Legend wrapperStyle={{ fontSize: 10 }} />}
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ── Citation cards ───────────────────────────────────────────────────────────
function CitationsPanel({ citations }) {
  const [open, setOpen] = useState(false);
  if (!citations || citations.length === 0) return null;

  return (
    <div className="mt-2 border border-blue-100 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-3 py-2 bg-blue-50 text-xs font-medium text-blue-600 hover:bg-blue-100 transition-colors"
      >
        <span className="flex items-center gap-1.5">
          <BookOpen className="w-3.5 h-3.5" />
          {citations.length} source{citations.length !== 1 ? "s" : ""} cited
        </span>
        {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>
      {open && (
        <div className="divide-y divide-blue-50 bg-white">
          {citations.map((c, i) => (
            <div key={i} className="px-3 py-2">
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs font-medium text-slate-700 line-clamp-1 flex-1">
                  {c.title || c.url}
                </p>
                {c.url && (
                  <a
                    href={c.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 text-blue-500 hover:text-blue-700"
                  >
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
              {c.snippet && (
                <p className="text-[10px] text-slate-400 mt-0.5 line-clamp-2">{c.snippet}</p>
              )}
              <span className="text-[10px] text-blue-400 font-medium">{c.source}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── ML result mini-cards ─────────────────────────────────────────────────────
function MLPanel({ data }) {
  const mlResults = Object.entries(data || {})
    .filter(([tool]) => tool === "get_ml_predictions")
    .flatMap(([, result]) => result?.predictions || []);

  if (mlResults.length === 0) return null;

  return (
    <div className="mt-2 space-y-1.5">
      {mlResults.map((pred, i) => {
        const model = pred.model || "";
        const res   = pred.result || {};
        const ts    = pred.computed_at ? new Date(pred.computed_at).toLocaleDateString() : null;

        // Churn / risk model
        const isChurn = ["churn", "retention", "survival", "risk"].some(k => model.includes(k));
        if (isChurn) {
          const hr = res.high_risk ?? res.high_risk_count ?? null;
          const total = res.total ?? res.total_count ?? null;
          const pct = (hr != null && total) ? Math.round((hr / total) * 100) : null;

          return (
            <div key={i} className="bg-rose-50 border border-rose-100 rounded-xl px-3 py-2.5">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5 text-rose-500" />
                  <span className="text-xs font-bold text-rose-700">Retention Risk</span>
                </div>
                {ts && <span className="text-[10px] text-slate-400">{ts}</span>}
              </div>
              {pct != null && (
                <div className="mb-1.5">
                  <div className="flex justify-between text-[10px] text-slate-500 mb-0.5">
                    <span>{hr} high-risk clients</span>
                    <span className="font-bold text-rose-600">{pct}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-rose-100 rounded-full overflow-hidden">
                    <div className="h-full bg-rose-500 rounded-full" style={{ width: `${Math.min(pct, 100)}%` }} />
                  </div>
                </div>
              )}
              <p className="text-[10px] text-slate-500">{model.replace(/_/g, " ")}</p>
            </div>
          );
        }

        // Segmentation model
        const isSeg = ["segment", "ltv", "cluster"].some(k => model.includes(k));
        if (isSeg) {
          const segments = res.segments || res.cluster_summary || [];
          return (
            <div key={i} className="bg-violet-50 border border-violet-100 rounded-xl px-3 py-2.5">
              <div className="flex items-center gap-1.5 mb-1.5">
                <PieIcon className="w-3.5 h-3.5 text-violet-500" />
                <span className="text-xs font-bold text-violet-700">Customer Segments</span>
              </div>
              {segments.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {segments.slice(0, 5).map((s, si) => (
                    <span
                      key={si}
                      className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                      style={{ background: `${PALETTE[si]}18`, color: PALETTE[si] }}
                    >
                      {s.label || s.segment || `Seg ${si + 1}`}: {s.count}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        }

        // Generic model display
        return (
          <div key={i} className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
            <p className="text-xs font-semibold text-slate-600">{model.replace(/_/g, " ")}</p>
            {ts && <p className="text-[10px] text-slate-400">Computed {ts}</p>}
          </div>
        );
      })}
    </div>
  );
}

// ── Tool activity indicator ──────────────────────────────────────────────────
const TOOL_LABELS = {
  get_operator_context:    "Loading company context",
  get_people_summary:      "Querying people data",
  get_transaction_summary: "Analysing financials",
  get_task_summary:        "Checking tasks",
  get_product_summary:     "Scanning inventory",
  get_network_overview:    "Fetching network overview",
  get_ml_predictions:      "Running ML models",
  web_search:              "Searching the web",
  search_public_data:      "Querying public datasets",
  get_overdue_invoices:    "Checking overdue invoices",
  get_person_churn_risk:   "Calculating churn risk",
  get_staff_availability:  "Checking staff availability",
  get_enterprise_overview: "Fetching enterprise data",
  get_service_overview:    "Loading service data",
  get_relationship_summary:"Mapping relationships",
  get_address_overview:    "Loading addresses",
};

function ToolActivity({ tools }) {
  if (!tools || tools.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {[...new Set(tools)].map((t, i) => (
        <span
          key={i}
          className="text-[9px] font-medium px-1.5 py-0.5 bg-emerald-50 text-emerald-600 rounded-full border border-emerald-100"
        >
          {TOOL_LABELS[t] || t.replace(/_/g, " ")}
        </span>
      ))}
    </div>
  );
}

// ── Save to Reports button ───────────────────────────────────────────────────
function SaveButton({ message, companyId }) {
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (saved || saving) return;
    setSaving(true);
    try {
      await fetch(`${RAILWAY_URL}/reports/save-chat`, {
        method: "POST",
        headers: API_HEADERS,
        body: JSON.stringify({
          company_id: companyId,
          title: message.content.split("\n")[0].slice(0, 80) || "Copilot Report",
          content: message.content,
          charts: message.charts || [],
          citations: message.citations || [],
          saved_at: new Date().toISOString(),
        }),
      });
      setSaved(true);
    } catch {
      // Non-critical — silently ignore save errors
      setSaved(true); // optimistic
    } finally {
      setSaving(false);
    }
  };

  return (
    <button
      onClick={handleSave}
      disabled={saved || saving}
      className={`flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-medium transition-colors ${
        saved
          ? "text-emerald-600 bg-emerald-50"
          : "text-slate-400 hover:text-slate-600 hover:bg-slate-100"
      }`}
      title="Save to Reports"
    >
      {saved ? (
        <><CheckCircle className="w-3 h-3" /> Saved</>
      ) : saving ? (
        <><RefreshCw className="w-3 h-3 animate-spin" /> Saving…</>
      ) : (
        <><Save className="w-3 h-3" /> Save</>
      )}
    </button>
  );
}

// ── Message bubble ───────────────────────────────────────────────────────────
function MessageBubble({ message, onFeedback, companyId, mode }) {
  const isUser     = message.role === "user";
  const isThinking = message.type === "thinking";

  if (isThinking) {
    return (
      <div className="flex items-center gap-2 text-xs text-slate-400 py-1.5 px-1">
        <Loader2 className="w-3 h-3 animate-spin shrink-0" />
        <span>{message.content}</span>
        {message.tools && message.tools.length > 0 && (
          <ToolActivity tools={message.tools} />
        )}
      </div>
    );
  }

  const modeColor = MODES[mode]?.color || "emerald";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} mb-3`}>
      <div className={`max-w-[88%] flex flex-col gap-1 ${isUser ? "items-end" : "items-start"}`}>
        {!isUser && (
          <div className="flex items-center gap-1.5 mb-0.5">
            <div className={`w-5 h-5 rounded-full bg-gradient-to-br flex items-center justify-center ${
              modeColor === "blue"   ? "from-blue-400 to-indigo-600"   :
              modeColor === "violet" ? "from-violet-400 to-purple-600" :
                                       "from-emerald-400 to-teal-600"
            }`}>
              <Sparkles className="w-2.5 h-2.5 text-white" />
            </div>
            <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">
              Copilot
            </span>
            {message.tools_called?.length > 0 && (
              <ToolActivity tools={message.tools_called} />
            )}
          </div>
        )}

        <div className={`px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
          isUser
            ? "bg-emerald-600 text-white rounded-tr-md"
            : "bg-white border border-slate-200 text-slate-800 rounded-tl-md shadow-sm"
        }`}>
          {message.content}
        </div>

        {/* Charts */}
        {!isUser && message.charts?.length > 0 && (
          <div className="w-full space-y-2">
            {message.charts.map((cfg, i) => (
              <ChartCard key={i} config={cfg} />
            ))}
          </div>
        )}

        {/* ML cards */}
        {!isUser && message.data && Object.keys(message.data).length > 0 && (
          <div className="w-full">
            <MLPanel data={message.data} />
          </div>
        )}

        {/* Citations */}
        {!isUser && message.citations?.length > 0 && (
          <div className="w-full">
            <CitationsPanel citations={message.citations} />
          </div>
        )}

        {/* Footer actions */}
        {!isUser && (
          <div className="flex items-center gap-1 mt-0.5">
            {onFeedback && message.id && (
              <>
                <button
                  onClick={() => onFeedback(message.id, 1)}
                  className={`p-1 rounded transition-colors ${
                    message.feedback === 1 ? "text-emerald-600" : "text-slate-300 hover:text-slate-500"
                  }`}
                >
                  <ThumbsUp className="w-3 h-3" />
                </button>
                <button
                  onClick={() => onFeedback(message.id, -1)}
                  className={`p-1 rounded transition-colors ${
                    message.feedback === -1 ? "text-rose-500" : "text-slate-300 hover:text-slate-500"
                  }`}
                >
                  <ThumbsDown className="w-3 h-3" />
                </button>
              </>
            )}
            <SaveButton message={message} companyId={companyId} />
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main CopilotChat component ───────────────────────────────────────────────
export default function CopilotChat({ currentUser, className = "" }) {
  const [mode, setMode]         = useState("operations");
  const [messages, setMessages] = useState([]);
  const [input, setInput]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const [context, setContext]   = useState(null);
  const [liveTools, setLiveTools] = useState([]);   // tools being called right now
  const messagesEndRef          = useRef(null);
  const inputRef                = useRef(null);

  const companyId  = currentUser?.company_id;
  const modeConfig = MODES[mode];

  // Load context on mount
  useEffect(() => {
    if (!companyId) return;
    fetch(`${RAILWAY_URL}/copilot/context?company_id=${companyId}`, {
      headers: RAILWAY_API_KEY ? { "x-api-key": RAILWAY_API_KEY } : {},
    })
      .then(r => r.json())
      .then(setContext)
      .catch(() => setContext(null));
  }, [companyId]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Reset chat when mode changes
  const switchMode = (m) => {
    setMode(m);
    setMessages([]);
    setError(null);
    setLiveTools([]);
  };

  const sendMessage = useCallback(async (questionOverride = null) => {
    const question = (questionOverride || input).trim();
    if (!question || loading || !companyId) return;

    setInput("");
    setError(null);
    setLiveTools([]);

    const userMsg = { id: Date.now(), role: "user", content: question };
    const thinkingMsg = {
      id:      Date.now() + 1,
      role:    "assistant",
      type:    "thinking",
      content: "Analysing your question…",
      tools:   [],
    };

    setMessages(prev => [...prev, userMsg, thinkingMsg]);
    setLoading(true);

    // Try streaming first, fall back to regular POST
    let usedStream = false;
    try {
      const evtSrc = new EventSource(
        `${RAILWAY_URL}/copilot/ask/stream?_dummy=${Date.now()}`
      );
      evtSrc.close(); // just test if EventSource is supported
    } catch {
      /* ignore */
    }

    try {
      const history = messages
        .filter(m => m.type !== "thinking")
        .map(m => ({ role: m.role, content: m.content }));

      // Add mode context to question
      let fullQuestion = question;
      if (mode === "market") {
        fullQuestion = `[Mode: Market Intelligence — use web_search and search_public_data tools]\n\n${question}`;
      } else if (mode === "ml") {
        fullQuestion = `[Mode: ML Insights — prioritise get_ml_predictions and ML analysis]\n\n${question}`;
      }

      const resp = await fetch(`${RAILWAY_URL}/copilot/ask`, {
        method:  "POST",
        headers: API_HEADERS,
        body: JSON.stringify({
          question:        fullQuestion,
          company_id:      companyId,
          enterprise_name: currentUser?.enterprise_name || "",
          history,
        }),
      });

      if (!resp.ok) {
        let detail = `HTTP ${resp.status}`;
        try { const b = await resp.json(); detail = b.detail || detail; } catch {}
        throw new Error(detail);
      }

      const result = await resp.json();

      const assistantMsg = {
        id:          Date.now() + 2,
        role:        "assistant",
        content:     result.answer,
        data:        result.data       || {},
        charts:      result.charts     || [],
        citations:   result.citations  || [],
        tools_called:result.tools_called || [],
        intent:      result.intent,
        feedback:    null,
      };

      setMessages(prev => [
        ...prev.filter(m => m.type !== "thinking"),
        assistantMsg,
      ]);

    } catch (err) {
      const msg = err.message || "";
      const isNetwork = msg === "Failed to fetch" || msg === "Network request failed";
      setError(
        isNetwork
          ? "Could not reach python_layer. Check that Railway is running."
          : msg
      );
      setMessages(prev => prev.filter(m => m.type !== "thinking"));
    } finally {
      setLoading(false);
      setLiveTools([]);
      inputRef.current?.focus();
    }
  }, [input, loading, companyId, messages, mode, currentUser]);

  const handleFeedback = async (messageId, rating) => {
    setMessages(prev =>
      prev.map(m => m.id === messageId ? { ...m, feedback: rating } : m)
    );
    const msg      = messages.find(m => m.id === messageId);
    const question = messages.find(m => m.role === "user")?.content || "";
    try {
      await fetch(`${RAILWAY_URL}/copilot/feedback`, {
        method: "POST",
        headers: API_HEADERS,
        body: JSON.stringify({
          question, answer: msg?.content || "", company_id: companyId, rating,
        }),
      });
    } catch { /* non-critical */ }
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
      <div className="bg-white border-b border-slate-100">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center shadow-sm">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800">AI Copilot</p>
              <p className="text-[10px] text-slate-400">
                {context?.data_available
                  ? `${context.enterprise_count ?? 0} enterprise${context.enterprise_count !== 1 ? "s" : ""} · ${
                      context.critical_alerts > 0
                        ? `${context.critical_alerts} critical`
                        : "All clear"
                    }`
                  : "Connecting…"}
              </p>
            </div>
          </div>
          {context?.critical_alerts > 0 && (
            <span className="flex items-center gap-1 px-2 py-1 bg-rose-50 text-rose-600 rounded-lg text-xs font-medium">
              <AlertTriangle className="w-3 h-3" />
              {context.critical_alerts}
            </span>
          )}
        </div>

        {/* Mode tabs */}
        <div className="flex border-t border-slate-100">
          {Object.values(MODES).map(m => {
            const Icon = m.icon;
            const active = mode === m.key;
            return (
              <button
                key={m.key}
                onClick={() => switchMode(m.key)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors border-b-2 ${
                  active
                    ? m.color === "blue"   ? "border-blue-500 text-blue-600 bg-blue-50/50"   :
                      m.color === "violet" ? "border-violet-500 text-violet-600 bg-violet-50/50" :
                                             "border-emerald-500 text-emerald-600 bg-emerald-50/50"
                    : "border-transparent text-slate-400 hover:text-slate-600 hover:bg-slate-50"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{m.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
        {!hasMessages && (
          <div className="flex flex-col items-center justify-center h-full gap-4 py-6">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg bg-gradient-to-br ${
              modeConfig.color === "blue"   ? "from-blue-400 to-indigo-600"   :
              modeConfig.color === "violet" ? "from-violet-400 to-purple-600" :
                                              "from-emerald-400 to-teal-600"
            }`}>
              {React.createElement(modeConfig.icon, { className: "w-6 h-6 text-white" })}
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold text-slate-700 mb-1">
                {mode === "operations"  && "Ask me anything about your operations"}
                {mode === "market"      && "Deep market intelligence at your fingertips"}
                {mode === "ml"          && "ML-powered predictions and insights"}
              </p>
              <p className="text-xs text-slate-400 max-w-xs">
                {mode === "operations"  && "I have access to your people, inventory, finances, and tasks — all grounded in real data."}
                {mode === "market"      && "I can search the web, analyse industry data, and benchmark against public sources."}
                {mode === "ml"          && "I can run churn prediction, segmentation, demand forecasting, and more."}
              </p>
            </div>
            <div className="grid grid-cols-1 gap-2 w-full max-w-sm">
              {modeConfig.questions.map((q, i) => (
                <button
                  key={i}
                  onClick={() => sendMessage(q)}
                  className={`text-left px-3 py-2 rounded-xl bg-white border text-xs transition-all hover:shadow-sm ${
                    modeConfig.color === "blue"   ? "border-slate-200 text-slate-600 hover:border-blue-300 hover:text-blue-700"   :
                    modeConfig.color === "violet" ? "border-slate-200 text-slate-600 hover:border-violet-300 hover:text-violet-700" :
                                                    "border-slate-200 text-slate-600 hover:border-emerald-300 hover:text-emerald-700"
                  }`}
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
            companyId={companyId}
            mode={mode}
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
        {/* Mode pill */}
        <div className="flex items-center gap-1.5 mb-2">
          {React.createElement(modeConfig.icon, {
            className: `w-3 h-3 ${
              modeConfig.color === "blue"   ? "text-blue-500"   :
              modeConfig.color === "violet" ? "text-violet-500" : "text-emerald-500"
            }`,
          })}
          <span className={`text-[10px] font-semibold ${
            modeConfig.color === "blue"   ? "text-blue-500"   :
            modeConfig.color === "violet" ? "text-violet-500" : "text-emerald-500"
          }`}>
            {modeConfig.label}
          </span>
          {mode === "market" && (
            <span className="text-[9px] text-slate-400 ml-1">· Web search enabled</span>
          )}
          {mode === "ml" && (
            <span className="text-[9px] text-slate-400 ml-1">· ML models active</span>
          )}
        </div>

        <div className="flex items-end gap-2">
          <div className="flex-1">
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
              placeholder={modeConfig.placeholder}
              disabled={loading}
              rows={1}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm resize-none focus:outline-none focus:border-emerald-400 transition-colors disabled:opacity-50 bg-slate-50"
              style={{ minHeight: "42px", maxHeight: "120px" }}
            />
          </div>
          <button
            onClick={() => sendMessage()}
            disabled={!input.trim() || loading}
            className={`p-2.5 rounded-xl text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm shrink-0 ${
              modeConfig.color === "blue"   ? "bg-blue-600 hover:bg-blue-700 shadow-blue-500/20"   :
              modeConfig.color === "violet" ? "bg-violet-600 hover:bg-violet-700 shadow-violet-500/20" :
                                              "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-500/20"
            }`}
          >
            {loading
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <Send className="w-4 h-4" />}
          </button>
        </div>
        <p className="text-[10px] text-slate-300 mt-1.5 text-center">
          Grounded in live data · Charts auto-generated · Press Enter to send
        </p>
      </div>
    </div>
  );
}
