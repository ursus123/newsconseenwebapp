import React, { useState, useRef, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import {
  Send, Loader2, Sparkles, ThumbsUp, ThumbsDown, AlertTriangle,
  ChevronDown, ChevronUp, BarChart2, Globe, Brain, BookOpen,
  ExternalLink, Save, CheckCircle, RefreshCw, TrendingUp,
  PieChart as PieIcon, Activity, Copy, Check, Clock,
  MessageSquare, X, History, Download, ChevronRight,
} from "lucide-react";
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer,
} from "recharts";

const RAILWAY_URL   = "https://newsconseenwebapp-production.up.railway.app";
const RAILWAY_API_KEY = import.meta.env.VITE_RAILWAY_API_KEY || "";
const API_HEADERS   = RAILWAY_API_KEY
  ? { "Content-Type": "application/json", "x-api-key": RAILWAY_API_KEY }
  : { "Content-Type": "application/json" };

// ── Colour palette for charts ────────────────────────────────────────────────
const PALETTE = [
  "#10b981","#3b82f6","#f59e0b","#ef4444","#8b5cf6",
  "#06b6d4","#f97316","#84cc16","#ec4899","#14b8a6",
];

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

// ── Utility: format timestamp ────────────────────────────────────────────────
function fmtTime(ts) {
  if (!ts) return "";
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// ── Copy-to-clipboard hook ───────────────────────────────────────────────────
function useCopy(text) {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard not available */
    }
  }, [text]);
  return [copied, copy];
}

// ── Markdown prose renderer ──────────────────────────────────────────────────
// Custom component overrides give markdown a clean, document-like look.
const MD_COMPONENTS = {
  // Headings
  h1: ({ children }) => (
    <h1 className="text-base font-bold text-slate-800 mt-3 mb-1.5 first:mt-0">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-sm font-bold text-slate-800 mt-3 mb-1 first:mt-0">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-sm font-semibold text-slate-700 mt-2 mb-0.5 first:mt-0">{children}</h3>
  ),
  // Paragraphs — add small gap between consecutive paragraphs
  p: ({ children }) => (
    <p className="text-sm leading-relaxed text-slate-800 mb-2 last:mb-0">{children}</p>
  ),
  // Strong / bold
  strong: ({ children }) => (
    <strong className="font-semibold text-slate-900">{children}</strong>
  ),
  // Emphasis
  em: ({ children }) => <em className="italic text-slate-700">{children}</em>,
  // Bullet list
  ul: ({ children }) => (
    <ul className="list-disc list-inside space-y-0.5 my-1.5 text-sm text-slate-700">{children}</ul>
  ),
  // Ordered list
  ol: ({ children }) => (
    <ol className="list-decimal list-inside space-y-0.5 my-1.5 text-sm text-slate-700">{children}</ol>
  ),
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  // Blockquote
  blockquote: ({ children }) => (
    <blockquote className="border-l-3 border-emerald-400 pl-3 my-2 text-slate-600 italic text-sm">
      {children}
    </blockquote>
  ),
  // Horizontal rule
  hr: () => <hr className="border-slate-200 my-3" />,
  // Inline code — react-markdown v9 doesn't pass `inline` prop.
  // `pre` handles fenced code blocks; `code` here is always inline backticks.
  code: ({ children }) => (
    <code className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-800 text-[12px] font-mono border border-slate-200">
      {children}
    </code>
  ),
  // Code block (pre + code) — override both so the block renders cleanly
  pre: ({ children }) => (
    <pre className="bg-slate-900 text-slate-100 rounded-xl p-4 my-2 overflow-x-auto text-[12px] font-mono leading-relaxed">
      {/* Reset the inline code styles that the `code` component applies */}
      <code style={{ background: "transparent", border: "none", padding: 0, borderRadius: 0, color: "inherit" }}>
        {typeof children === "object" && children?.props?.children
          ? children.props.children
          : children}
      </code>
    </pre>
  ),
  // Links
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-blue-600 hover:text-blue-800 underline underline-offset-2"
    >
      {children}
    </a>
  ),
  // GFM Tables — styled like a proper data table
  table: ({ children }) => (
    <div className="my-3 overflow-x-auto rounded-xl border border-slate-200">
      <table className="w-full text-xs border-collapse">{children}</table>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="bg-slate-50 border-b border-slate-200">{children}</thead>
  ),
  tbody: ({ children }) => <tbody>{children}</tbody>,
  tr: ({ children }) => (
    <tr className="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors">
      {children}
    </tr>
  ),
  th: ({ children }) => (
    <th className="px-3 py-2 text-left text-[11px] font-bold text-slate-600 uppercase tracking-wide whitespace-nowrap">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="px-3 py-2 text-slate-700 whitespace-nowrap">{children}</td>
  ),
};

function MarkdownContent({ content }) {
  const [plugins, setPlugins] = useState([]);

  useEffect(() => {
    import("remark-gfm")
      .then(m => setPlugins([m.default || m]))
      .catch(() => setPlugins([]));
  }, []);

  return (
    <ReactMarkdown
      remarkPlugins={plugins}
      components={MD_COMPONENTS}
    >
      {content}
    </ReactMarkdown>
  );
}

// ── Inline chart renderer ────────────────────────────────────────────────────
function ChartCard({ config, onSave, companyId }) {
  const [saved, setSaved] = useState(false);
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

  const handleSaveChart = async () => {
    if (saved || !companyId) return;
    try {
      await fetch(`${RAILWAY_URL}/reports/save-chat`, {
        method: "POST",
        headers: API_HEADERS,
        body: JSON.stringify({
          company_id: companyId,
          title:      title || "Chart",
          content:    `Chart: ${title}`,
          charts:     [config],
          citations:  [],
          saved_at:   new Date().toISOString(),
        }),
      });
    } catch { /* non-critical */ }
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const chartEl = (() => {
    const resolvedKeys = keys.length
      ? keys
      : [{ key: Object.keys(data[0] || {}).find(k => k !== "name") || "value", color: PALETTE[0] }];

    if (type === "pie") {
      return (
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            outerRadius={80}
            innerRadius={30}
            paddingAngle={2}
            label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
            labelLine={false}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
            ))}
          </Pie>
          <Tooltip formatter={(v, n) => [Number(v).toLocaleString(), n]} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
        </PieChart>
      );
    }
    if (type === "area") {
      return (
        <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
          <defs>
            {resolvedKeys.map((k, i) => (
              <linearGradient key={k.key} id={`grad-${k.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor={k.color || PALETTE[i]} stopOpacity={0.3} />
                <stop offset="95%" stopColor={k.color || PALETTE[i]} stopOpacity={0.0} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis dataKey="name" tick={{ fontSize: 10 }} />
          <YAxis tickFormatter={fmtTick} tick={{ fontSize: 10 }} width={42} />
          <Tooltip formatter={fmtTooltip} contentStyle={{ borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 12 }} />
          {resolvedKeys.map((k, i) => (
            <Area
              key={k.key}
              type="monotone"
              dataKey={k.key}
              stroke={k.color || PALETTE[i]}
              fill={`url(#grad-${k.key})`}
              strokeWidth={2}
            />
          ))}
          {resolvedKeys.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} />}
        </AreaChart>
      );
    }
    if (type === "line") {
      return (
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis dataKey="name" tick={{ fontSize: 10 }} />
          <YAxis tickFormatter={fmtTick} tick={{ fontSize: 10 }} width={42} />
          <Tooltip formatter={fmtTooltip} contentStyle={{ borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 12 }} />
          {resolvedKeys.map((k, i) => (
            <Line
              key={k.key}
              type="monotone"
              dataKey={k.key}
              stroke={k.color || PALETTE[i]}
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 4 }}
            />
          ))}
          {resolvedKeys.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} />}
        </LineChart>
      );
    }
    // Default: bar
    return (
      <BarChart data={data} margin={{ top: 8, right: 12, bottom: data.length > 5 ? 20 : 4, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
        <XAxis
          dataKey="name"
          tick={{ fontSize: 10 }}
          interval={0}
          angle={data.length > 6 ? -35 : 0}
          textAnchor={data.length > 6 ? "end" : "middle"}
          height={data.length > 6 ? 50 : 20}
        />
        <YAxis tickFormatter={fmtTick} tick={{ fontSize: 10 }} width={44} />
        <Tooltip
          formatter={fmtTooltip}
          contentStyle={{ borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 12 }}
        />
        {resolvedKeys.map((k, i) => (
          <Bar key={k.key} dataKey={k.key} fill={k.color || PALETTE[i]} radius={[4, 4, 0, 0]} maxBarSize={48} />
        ))}
        {resolvedKeys.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} />}
      </BarChart>
    );
  })();

  return (
    <div className="mt-2 bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
      {/* Chart header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white">
        <BarChart2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
        <span className="text-xs font-semibold text-slate-700 flex-1 truncate">{title}</span>
        {companyId && (
          <button
            onClick={handleSaveChart}
            title="Save chart to Reports"
            className={`flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-medium transition-colors ${
              saved
                ? "text-emerald-600 bg-emerald-50"
                : "text-slate-400 hover:text-emerald-600 hover:bg-emerald-50"
            }`}
          >
            {saved ? <><Check className="w-3 h-3" /> Saved</> : <><Download className="w-3 h-3" /> Save</>}
          </button>
        )}
      </div>
      <div className="p-4" style={{ height: 240 }}>
        <ResponsiveContainer width="100%" height="100%">
          {chartEl}
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
                  <a href={c.url} target="_blank" rel="noopener noreferrer"
                    className="shrink-0 text-blue-500 hover:text-blue-700">
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

        const isChurn = ["churn", "retention", "survival", "risk"].some(k => model.includes(k));
        if (isChurn) {
          const hr    = res.high_risk ?? res.high_risk_count ?? null;
          const total = res.total ?? res.total_count ?? null;
          const pct   = hr != null && total ? Math.round((hr / total) * 100) : null;
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
                    <div className="h-full bg-gradient-to-r from-rose-400 to-rose-600 rounded-full"
                      style={{ width: `${Math.min(pct, 100)}%` }} />
                  </div>
                </div>
              )}
              <p className="text-[10px] text-slate-500">{model.replace(/_/g, " ")}</p>
            </div>
          );
        }

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
                    <span key={si}
                      className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                      style={{ background: `${PALETTE[si]}18`, color: PALETTE[si] }}>
                      {s.label || s.segment || `Seg ${si + 1}`}: {s.count}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        }

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

// ── Tool activity badges ─────────────────────────────────────────────────────
const TOOL_LABELS = {
  get_operator_context:    "Company context",
  get_people_summary:      "People data",
  get_transaction_summary: "Financials",
  get_task_summary:        "Tasks",
  get_product_summary:     "Inventory",
  get_network_overview:    "Network",
  get_ml_predictions:      "ML models",
  web_search:              "Web search",
  search_public_data:      "Public data",
  get_overdue_invoices:    "Overdue invoices",
  get_person_churn_risk:   "Churn risk",
  get_staff_availability:  "Staff availability",
  get_enterprise_overview: "Enterprises",
  get_service_overview:    "Services",
  get_relationship_summary:"Relationships",
  get_address_overview:    "Addresses",
};

function ToolActivity({ tools }) {
  if (!tools || tools.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {[...new Set(tools)].map((t, i) => (
        <span key={i}
          className="text-[9px] font-medium px-1.5 py-0.5 bg-emerald-50 text-emerald-600 rounded-full border border-emerald-100">
          {TOOL_LABELS[t] || t.replace(/_/g, " ")}
        </span>
      ))}
    </div>
  );
}

// ── Save-message button ──────────────────────────────────────────────────────
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
          title:      message.content.split("\n")[0].replace(/^#+\s*/, "").slice(0, 80) || "Copilot Report",
          content:    message.content,
          charts:     message.charts || [],
          citations:  message.citations || [],
          saved_at:   new Date().toISOString(),
        }),
      });
      setSaved(true);
    } catch {
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
  const [copied, doCopy] = useCopy(message.content || "");

  if (isThinking) {
    return (
      <div className="flex items-center gap-2 text-xs text-slate-400 py-1.5 px-1">
        <Loader2 className="w-3 h-3 animate-spin shrink-0" />
        <span>{message.content}</span>
        {message.tools?.length > 0 && <ToolActivity tools={message.tools} />}
      </div>
    );
  }

  const modeColor = MODES[mode]?.color || "emerald";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} mb-4`}>
      <div className={`max-w-[90%] flex flex-col gap-1 ${isUser ? "items-end" : "items-start"}`}>

        {/* Sender label */}
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

        {/* Bubble */}
        <div className={`px-4 py-3 rounded-2xl text-sm ${
          isUser
            ? `bg-gradient-to-br ${
                modeColor === "blue"   ? "from-blue-500 to-indigo-600"   :
                modeColor === "violet" ? "from-violet-500 to-purple-600" :
                                         "from-emerald-500 to-teal-600"
              } text-white rounded-tr-md shadow-sm`
            : "bg-white border border-slate-200 text-slate-800 rounded-tl-md shadow-sm"
        }`}>
          {isUser ? (
            <p className="leading-relaxed whitespace-pre-wrap">{message.content}</p>
          ) : (
            <div className="min-w-0">
              <MarkdownContent content={message.content} />
            </div>
          )}
        </div>

        {/* Charts */}
        {!isUser && message.charts?.length > 0 && (
          <div className="w-full space-y-2">
            {message.charts.map((cfg, i) => (
              <ChartCard key={i} config={cfg} companyId={companyId} />
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

        {/* Footer: timestamp + actions */}
        <div className={`flex items-center gap-1 mt-0.5 ${isUser ? "justify-end" : "justify-start"}`}>
          {message.timestamp && (
            <span className="text-[9px] text-slate-300 flex items-center gap-0.5">
              <Clock className="w-2.5 h-2.5" />
              {fmtTime(message.timestamp)}
            </span>
          )}

          {!isUser && (
            <>
              <button
                onClick={doCopy}
                title="Copy"
                className="flex items-center gap-1 p-1 rounded text-[10px] text-slate-300 hover:text-slate-500 transition-colors"
              >
                {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
              </button>

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
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── History panel ────────────────────────────────────────────────────────────
function HistoryPanel({ companyId, onRestore, onClose }) {
  const [reports, setReports]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    if (!companyId) return;
    setLoading(true);
    fetch(`${RAILWAY_URL}/reports/saved?company_id=${companyId}&limit=50`, {
      headers: RAILWAY_API_KEY ? { "x-api-key": RAILWAY_API_KEY } : {},
    })
      .then(r => r.json())
      .then(d => setReports(d.reports || []))
      .catch(() => setReports([]))
      .finally(() => setLoading(false));
  }, [companyId]);

  const preview = selected != null ? reports[selected] : null;

  return (
    <div className="absolute inset-0 z-20 flex bg-white rounded-2xl overflow-hidden">
      {/* Left: list */}
      <div className="w-52 shrink-0 border-r border-slate-100 flex flex-col">
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-slate-100 bg-slate-50">
          <div className="flex items-center gap-1.5">
            <History className="w-3.5 h-3.5 text-slate-500" />
            <span className="text-xs font-bold text-slate-700">Saved Chats</span>
          </div>
          <button onClick={onClose} className="p-0.5 rounded hover:bg-slate-200 transition-colors">
            <X className="w-3.5 h-3.5 text-slate-400" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-20">
              <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
            </div>
          ) : reports.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-24 gap-2 px-4 text-center">
              <MessageSquare className="w-5 h-5 text-slate-200" />
              <p className="text-[11px] text-slate-400">No saved chats yet. Use the Save button on any answer.</p>
            </div>
          ) : (
            reports.map((r, i) => (
              <button
                key={r.id || i}
                onClick={() => setSelected(i)}
                className={`w-full text-left px-3 py-2.5 border-b border-slate-50 transition-colors hover:bg-slate-50 ${
                  selected === i ? "bg-emerald-50" : ""
                }`}
              >
                <p className="text-[11px] font-medium text-slate-700 line-clamp-2 leading-snug">
                  {r.title || "Untitled"}
                </p>
                <p className="text-[9px] text-slate-400 mt-0.5">
                  {r.saved_at ? new Date(r.saved_at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : ""}
                </p>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Right: preview */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {preview ? (
          <>
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-100 bg-slate-50">
              <p className="text-xs font-bold text-slate-700 flex-1 truncate">{preview.title}</p>
              <button
                onClick={() => {
                  onRestore(preview);
                  onClose();
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-[11px] font-medium hover:bg-emerald-700 transition-colors"
              >
                Restore <ChevronRight className="w-3 h-3" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <div className="text-sm">
                <MarkdownContent content={preview.content} />
              </div>
              {preview.charts?.length > 0 && (
                <div className="mt-3 space-y-2">
                  {preview.charts.map((cfg, i) => (
                    <ChartCard key={i} config={cfg} companyId={companyId} />
                  ))}
                </div>
              )}
              {preview.citations?.length > 0 && (
                <div className="mt-2">
                  <CitationsPanel citations={preview.citations} />
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <History className="w-8 h-8 text-slate-200 mx-auto mb-2" />
              <p className="text-xs text-slate-400">Select a saved chat to preview</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main CopilotChat component ───────────────────────────────────────────────
export default function CopilotChat({ currentUser, className = "" }) {
  const [mode, setMode]           = useState("operations");
  const [messages, setMessages]   = useState([]);
  const [input, setInput]         = useState("");
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState(null);
  const [context, setContext]     = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  const messagesEndRef             = useRef(null);
  const inputRef                   = useRef(null);

  const companyId  = currentUser?.company_id;
  const modeConfig = MODES[mode];

  // Load context
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

  const switchMode = (m) => {
    setMode(m);
    setMessages([]);
    setError(null);
  };

  // Restore a saved chat into the messages list
  const restoreChat = (report) => {
    const restored = {
      id:          Date.now(),
      role:        "assistant",
      content:     report.content,
      charts:      report.charts || [],
      citations:   report.citations || [],
      tools_called:[],
      data:        {},
      timestamp:   report.saved_at,
    };
    setMessages([
      {
        id:        Date.now() - 1,
        role:      "user",
        content:   `[Restored] ${report.title}`,
        timestamp: report.saved_at,
      },
      restored,
    ]);
  };

  const sendMessage = useCallback(async (questionOverride = null) => {
    const question = (questionOverride || input).trim();
    if (!question || loading || !companyId) return;

    setInput("");
    setError(null);

    const userMsg = {
      id: Date.now(), role: "user", content: question, timestamp: new Date().toISOString(),
    };
    const thinkingMsg = {
      id: Date.now() + 1, role: "assistant", type: "thinking",
      content: "Analysing your question…", tools: [],
    };

    setMessages(prev => [...prev, userMsg, thinkingMsg]);
    setLoading(true);

    try {
      const history = messages
        .filter(m => m.type !== "thinking")
        .map(m => ({ role: m.role, content: m.content }));

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
        id:           Date.now() + 2,
        role:         "assistant",
        content:      result.answer,
        data:         result.data        || {},
        charts:       result.charts      || [],
        citations:    result.citations   || [],
        tools_called: result.tools_called || [],
        intent:       result.intent,
        feedback:     null,
        timestamp:    new Date().toISOString(),
      };

      setMessages(prev => [
        ...prev.filter(m => m.type !== "thinking"),
        assistantMsg,
      ]);

    } catch (err) {
      const msg       = err.message || "";
      const isNetwork = msg === "Failed to fetch" || msg === "Network request failed";
      setError(
        isNetwork
          ? "Could not reach python_layer. Check that Railway is running."
          : msg
      );
      setMessages(prev => prev.filter(m => m.type !== "thinking"));
    } finally {
      setLoading(false);
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
        body: JSON.stringify({ question, answer: msg?.content || "", company_id: companyId, rating }),
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
    <div className={`flex flex-col h-full bg-slate-50 rounded-2xl overflow-hidden relative ${className}`}>

      {/* History overlay */}
      {showHistory && (
        <HistoryPanel
          companyId={companyId}
          onRestore={restoreChat}
          onClose={() => setShowHistory(false)}
        />
      )}

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
          <div className="flex items-center gap-1.5">
            {context?.critical_alerts > 0 && (
              <span className="flex items-center gap-1 px-2 py-1 bg-rose-50 text-rose-600 rounded-lg text-xs font-medium">
                <AlertTriangle className="w-3 h-3" />
                {context.critical_alerts}
              </span>
            )}
            {/* History button */}
            <button
              onClick={() => setShowHistory(true)}
              title="View saved chats"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white text-xs text-slate-500 hover:bg-slate-50 hover:border-slate-300 transition-colors"
            >
              <History className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">History</span>
            </button>
            {/* Clear chat */}
            {hasMessages && (
              <button
                onClick={() => { setMessages([]); setError(null); }}
                title="Clear chat"
                className="p-1.5 rounded-xl border border-slate-200 bg-white text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Mode tabs */}
        <div className="flex border-t border-slate-100">
          {Object.values(MODES).map(m => {
            const Icon   = m.icon;
            const active = mode === m.key;
            return (
              <button
                key={m.key}
                onClick={() => switchMode(m.key)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors border-b-2 ${
                  active
                    ? m.color === "blue"   ? "border-blue-500 text-blue-600 bg-blue-50/50"
                    : m.color === "violet" ? "border-violet-500 text-violet-600 bg-violet-50/50"
                    :                        "border-emerald-500 text-emerald-600 bg-emerald-50/50"
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
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {!hasMessages && (
          <div className="flex flex-col items-center justify-center h-full gap-4 py-6">
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg bg-gradient-to-br ${
              modeConfig.color === "blue"   ? "from-blue-400 to-indigo-600"   :
              modeConfig.color === "violet" ? "from-violet-400 to-purple-600" :
                                              "from-emerald-400 to-teal-600"
            }`}>
              {React.createElement(modeConfig.icon, { className: "w-7 h-7 text-white" })}
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold text-slate-700 mb-1">
                {mode === "operations"  && "Ask me anything about your operations"}
                {mode === "market"      && "Deep market intelligence at your fingertips"}
                {mode === "ml"          && "ML-powered predictions and insights"}
              </p>
              <p className="text-xs text-slate-400 max-w-xs">
                {mode === "operations"  && "People, inventory, finances, and tasks — all grounded in real data. Answers include charts and tables."}
                {mode === "market"      && "Search the web, analyse industry data, and benchmark against public sources."}
                {mode === "ml"          && "Churn prediction, segmentation, demand forecasting, and more."}
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
          <div className="flex items-center gap-2 px-3 py-2.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 mb-3">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            <span>{error}</span>
            <button onClick={() => setError(null)} className="ml-auto text-rose-400 hover:text-rose-600">
              <X className="w-3 h-3" />
            </button>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="px-4 py-3 bg-white border-t border-slate-100">
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
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm resize-none focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition-all disabled:opacity-50 bg-slate-50"
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
              : <Send className="w-4 h-4" />
            }
          </button>
        </div>
        <p className="text-[10px] text-slate-300 mt-1.5 text-center">
          Markdown, charts &amp; tables auto-rendered · Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}
