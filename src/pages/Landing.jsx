import React, { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Send, Loader2, ArrowRight, Globe, Cpu, Users, BarChart2,
  Zap, Shield, GitBranch, Package, CheckSquare, Wifi, Database,
  Brain, TrendingUp, Map, RefreshCw, AlertCircle, ExternalLink,
  Code2, CheckCircle, Star,
} from "lucide-react";
import {
  BarChart, Bar, AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";

// ── Config ────────────────────────────────────────────────────────────────────
const RAILWAY_URL = import.meta.env.VITE_RAILWAY_URL
  || "https://newsconseenwebapp-production.up.railway.app";

const PALETTE = [
  "#10b981","#3b82f6","#f59e0b","#ef4444","#8b5cf6",
  "#06b6d4","#f97316","#84cc16","#ec4899","#14b8a6",
];

// ── Funnel telemetry ──────────────────────────────────────────────────────────
function trackEvent(event, properties = {}) {
  try {
    fetch(`${RAILWAY_URL}/telemetry/demo-event`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, properties }),
    }).catch(() => {});
  } catch (_) {}
}

// ── Tool progress labels ──────────────────────────────────────────────────────
const TOOL_LABELS = {
  web_search:              "Searching the web",
  search_public_data:      "Fetching market data",
  get_people_summary:      "Checking people data",
  get_transaction_summary: "Checking transactions",
  get_task_summary:        "Checking tasks",
  get_overdue_invoices:    "Checking invoices",
  get_ml_predictions:      "Running ML models",
  get_entity_risk_report:  "Analysing risk",
  get_enterprise_overview: "Checking enterprise data",
  get_network_overview:    "Checking network data",
  find_people_records:     "Searching people",
  find_task_records:       "Searching tasks",
};
const toolLabel = name =>
  TOOL_LABELS[name] || name.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());

// ── Content ───────────────────────────────────────────────────────────────────
const GREETING = {
  _id: "greeting",
  role: "assistant",
  content: "Hi, I'm **Idjwi** — the intelligence layer of Newsconseen.\n\nI can pull **live market data**, walk you through how Newsconseen works for your industry, explain what the autonomous agents do, or answer any question about the platform.\n\nWhat would you like to explore?",
  charts: [],
  citations: [],
  toolsCalled: [],
  streaming: false,
};

const STARTERS = [
  { label: "Show me a live chart",         q: "Show me GDP growth rates for the top 10 economies as a bar chart." },
  { label: "Idjwi for a pharmacy",         q: "How would Newsconseen work for a pharmacy? Walk me through what Idjwi tracks, answers, and automates." },
  { label: "What are autonomous agents?",  q: "What autonomous agents does Newsconseen run and what do they do automatically without being asked?" },
  { label: "Live exchange rates",          q: "Show me current exchange rates for major currencies against USD as a chart." },
  { label: "Newsconseen for an NGO",       q: "How would Newsconseen work for an NGO with 50 field staff? What does Idjwi answer day-to-day?" },
  { label: "How does the copilot work?",   q: "Explain how the Newsconseen copilot works — tools, data sources, and architecture." },
  { label: "What is Idjwi?",              q: "What is Idjwi, what can it do, and how is it different from a regular AI assistant?" },
  { label: "Newsconseen for a school",     q: "How would Newsconseen work for a school group with 5 campuses?" },
];

const TESTIMONIALS = [
  {
    quote: "Before Newsconseen, our field coordinator tracked 340 patients across four spreadsheets. Now Idjwi sends a daily briefing automatically.",
    role: "Operations Director", org: "Private Clinic Network", initials: "OD",
  },
  {
    quote: "We manage 12 school campuses. This is the first platform where I can see all 12 in one view, compare them, and get alerts when something's off.",
    role: "Chief Administrator", org: "Multi-Campus School Group", initials: "CA",
  },
  {
    quote: "The autonomous agents caught a supplier payment anomaly we would have missed for months. It flagged it, created a task, and notified the right person.",
    role: "Finance Manager", org: "Agricultural Cooperative", initials: "FM",
  },
];

const CAPABILITIES = [
  { icon: Globe,      color: "emerald", title: "Live Market Intelligence",  desc: "Real-time exchange rates, World Bank indicators, economic data, and industry news — contextualised for your sector." },
  { icon: Brain,      color: "violet",  title: "8 Autonomous Agents",       desc: "Operations, Revenue, Retention, Inventory, Compliance — agents that surface insights and take actions without being asked." },
  { icon: TrendingUp, color: "blue",    title: "ML Predictions",            desc: "Churn risk, demand forecasting, revenue trends, stockout probability — computed fresh on every record, every day." },
  { icon: Map,        color: "amber",   title: "Geospatial + OSM",          desc: "Competitor counts, facility proximity, demographic context — for any location in the world." },
  { icon: Shield,     color: "rose",    title: "Compliance & Risk",         desc: "OFAC sanctions screening, AML flags, World Bank governance scores — on every entity, automatically." },
  { icon: Database,   color: "cyan",    title: "35 Connectors",             desc: "QuickBooks, Shopify, Salesforce, M-Pesa, EHR systems, HRIS — pulled into one operating picture." },
];

const COLOUR = {
  emerald: { bg: "bg-emerald-500/10", text: "text-emerald-400", border: "border-emerald-500/20" },
  violet:  { bg: "bg-violet-500/10",  text: "text-violet-400",  border: "border-violet-500/20" },
  blue:    { bg: "bg-blue-500/10",    text: "text-blue-400",    border: "border-blue-500/20" },
  amber:   { bg: "bg-amber-500/10",   text: "text-amber-400",   border: "border-amber-500/20" },
  rose:    { bg: "bg-rose-500/10",    text: "text-rose-400",    border: "border-rose-500/20" },
  cyan:    { bg: "bg-cyan-500/10",    text: "text-cyan-400",    border: "border-cyan-500/20" },
};

const INDUSTRIES = [
  { emoji: "🏥", name: "Clinics & Hospitals",  example: "Track patients, medications, staff shifts, billing." },
  { emoji: "🎓", name: "Schools & Colleges",   example: "Enrolment, attendance, fees, staff timetables." },
  { emoji: "🌾", name: "Farms & Cooperatives", example: "Livestock rounds, harvests, input tracking, sales." },
  { emoji: "🏢", name: "NGOs & Charities",     example: "Beneficiary management, donor tracking, field tasks." },
  { emoji: "🚛", name: "Logistics & Delivery", example: "Fleet routing, delivery tasks, driver management." },
  { emoji: "🏪", name: "Retail & Franchises",  example: "Multi-branch stock, sales, staff, customer records." },
];

const LAYERS = [
  { number: "01", color: "emerald", title: "Enterprise OS",        subtitle: "The system of record",      desc: "People, enterprises, products, tasks, transactions, relationships, addresses. Every entity your organisation deals with — captured, structured, searchable." },
  { number: "02", color: "blue",    title: "Deployable Datamart",  subtitle: "The analytical engine",     desc: "Pre-aggregated analytics, ETL pipeline, PostgreSQL. Every stat card, chart, and ML model reads from here. Fast, clean, multi-tenant." },
  { number: "03", color: "violet",  title: "Foundry Intelligence", subtitle: "Idjwi + autonomous agents", desc: "The copilot, 8 autonomous agents, alerts, enrichment, connectors, ML models. The layer that makes your data act — not just sit." },
];

const PRICING_TIERS = [
  {
    name: "Starter", price: "Free", sub: "Forever free to start", highlighted: false,
    features: ["1 user", "All 7 core entities", "Idjwi copilot", "Basic dashboards", "Community support"],
    cta: "Start free", href: "/onboarding",
  },
  {
    name: "Growth", price: "Contact us", sub: "Full platform access", highlighted: true,
    features: ["Unlimited users", "All 8 autonomous agents", "35 connectors", "ML predictions", "Enrichment engine", "WhatsApp / Email alerts", "Priority support"],
    cta: "Get pricing", href: "/onboarding",
  },
  {
    name: "Enterprise", price: "Custom", sub: "White-label & multi-tenant", highlighted: false,
    features: ["White-label branding", "Custom domain", "Network intelligence", "SOC 2 compliance", "Audit trail", "Dedicated support & SLA"],
    cta: "Talk to us", href: "/onboarding",
  },
];

// ── Markdown renderer ─────────────────────────────────────────────────────────
function renderInline(text) {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g);
  return parts.map((p, i) => {
    if (p.startsWith("**") && p.endsWith("**"))
      return <strong key={i} className="font-semibold text-white">{p.slice(2, -2)}</strong>;
    if (p.startsWith("*") && p.endsWith("*") && p.length > 2)
      return <em key={i} className="italic text-slate-300">{p.slice(1, -1)}</em>;
    if (p.startsWith("`") && p.endsWith("`") && p.length > 2)
      return <code key={i} className="px-1.5 py-0.5 rounded bg-slate-700 text-emerald-300 text-[11px] font-mono">{p.slice(1, -1)}</code>;
    return p;
  });
}

function MarkdownContent({ content, streaming }) {
  const lines = (content || "").split("\n");
  const elements = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith("### "))
      elements.push(<h3 key={i} className="text-sm font-semibold text-white mt-3 mb-1">{renderInline(line.slice(4))}</h3>);
    else if (line.startsWith("## "))
      elements.push(<h2 key={i} className="text-sm font-bold text-white mt-4 mb-1.5">{renderInline(line.slice(3))}</h2>);
    else if (line.startsWith("# "))
      elements.push(<h1 key={i} className="text-base font-bold text-white mt-4 mb-2">{renderInline(line.slice(2))}</h1>);
    else if (line.startsWith("> "))
      elements.push(<blockquote key={i} className="border-l-2 border-emerald-500 pl-3 my-2 text-slate-400 italic text-sm">{renderInline(line.slice(2))}</blockquote>);
    else if (/^---+$/.test(line.trim()))
      elements.push(<hr key={i} className="border-slate-700 my-3" />);
    else if (line.startsWith("- ") || line.startsWith("* ")) {
      const items = [];
      while (i < lines.length && (lines[i].startsWith("- ") || lines[i].startsWith("* "))) {
        items.push(<li key={i} className="leading-relaxed">{renderInline(lines[i].slice(2))}</li>);
        i++;
      }
      elements.push(<ul key={`ul${i}`} className="list-disc list-inside space-y-0.5 my-2 text-sm text-slate-300">{items}</ul>);
      continue;
    } else if (/^\d+\.\s/.test(line)) {
      const items = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        items.push(<li key={i} className="leading-relaxed">{renderInline(lines[i].replace(/^\d+\.\s/, ""))}</li>);
        i++;
      }
      elements.push(<ol key={`ol${i}`} className="list-decimal list-inside space-y-0.5 my-2 text-sm text-slate-300">{items}</ol>);
      continue;
    } else if (line.includes("|") && lines[i + 1]?.match(/^[\s|:-]+$/)) {
      const headers = line.split("|").map(s => s.trim()).filter(Boolean);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].includes("|")) {
        rows.push(lines[i].split("|").map(s => s.trim()).filter(Boolean));
        i++;
      }
      elements.push(
        <div key={`tbl${i}`} className="my-3 rounded-xl border border-slate-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead className="bg-slate-800 border-b border-slate-700">
                <tr>{headers.map((h, hi) => <th key={hi} className="px-3 py-2 text-left text-[11px] font-bold text-slate-400 uppercase tracking-wide whitespace-nowrap">{h}</th>)}</tr>
              </thead>
              <tbody>
                {rows.map((r, ri) => (
                  <tr key={ri} className="border-b border-slate-800 last:border-0">
                    {r.map((c, ci) => <td key={ci} className="px-3 py-2 text-slate-300 whitespace-nowrap">{renderInline(c)}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      );
      continue;
    } else if (line.trim() === "")
      elements.push(<div key={i} className="h-1" />);
    else
      elements.push(<p key={i} className="text-sm leading-relaxed text-slate-300 mb-1.5">{renderInline(line)}</p>);
    i++;
  }
  return (
    <div className="space-y-0.5">
      {elements}
      {streaming && content && (
        <span className="inline-block w-0.5 h-3.5 bg-emerald-400 animate-pulse ml-0.5 align-middle" />
      )}
    </div>
  );
}

// ── Chart card ────────────────────────────────────────────────────────────────
function DemoChartCard({ config }) {
  if (!config) return null;
  const { type, title, data, keys = [], unit = "" } = config;

  // Graceful fallback: no chart data → render as table
  if (!data || data.length === 0) {
    return (
      <div className="mt-3 bg-slate-900 border border-slate-700 rounded-2xl p-4">
        <p className="text-xs text-slate-500">{title || "Chart"} — no data returned in demo mode.</p>
      </div>
    );
  }

  const fmtTick = v => typeof v !== "number" ? v : v >= 1e9 ? `${(v / 1e9).toFixed(1)}B` : v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v;
  const fmtTip  = (v, n) => [unit === "$" ? `$${Number(v).toLocaleString()}` : Number(v).toLocaleString(), n];
  const resolvedKeys = keys.length
    ? keys
    : [{ key: Object.keys(data[0] || {}).find(k => k !== "name") || "value", color: PALETTE[0] }];

  const chart = (() => {
    if (type === "pie") return (
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} innerRadius={30} paddingAngle={2}
          label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
          {data.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
        </Pie>
        <Tooltip formatter={(v, n) => [Number(v).toLocaleString(), n]} contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8, fontSize: 11 }} />
        <Legend wrapperStyle={{ fontSize: 10, color: "#94a3b8" }} />
      </PieChart>
    );
    if (type === "area") return (
      <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
        <defs>{resolvedKeys.map((k, i) => <linearGradient key={k.key} id={`dg-${k.key}`} x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={k.color || PALETTE[i]} stopOpacity={0.35} /><stop offset="95%" stopColor={k.color || PALETTE[i]} stopOpacity={0} /></linearGradient>)}</defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
        <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#94a3b8" }} />
        <YAxis tickFormatter={fmtTick} tick={{ fontSize: 10, fill: "#94a3b8" }} width={44} />
        <Tooltip formatter={fmtTip} contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8, fontSize: 11 }} />
        {resolvedKeys.map((k, i) => <Area key={k.key} type="monotone" dataKey={k.key} stroke={k.color || PALETTE[i]} fill={`url(#dg-${k.key})`} strokeWidth={2} />)}
        {resolvedKeys.length > 1 && <Legend wrapperStyle={{ fontSize: 10, color: "#94a3b8" }} />}
      </AreaChart>
    );
    return (
      <BarChart data={data} margin={{ top: 8, right: 12, bottom: data.length > 6 ? 24 : 4, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
        <XAxis dataKey="name" tick={{ fontSize: 9, fill: "#94a3b8" }} interval={0} angle={data.length > 6 ? -30 : 0} textAnchor={data.length > 6 ? "end" : "middle"} height={data.length > 6 ? 50 : 20} />
        <YAxis tickFormatter={fmtTick} tick={{ fontSize: 10, fill: "#94a3b8" }} width={44} />
        <Tooltip formatter={fmtTip} contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8, fontSize: 11 }} />
        {resolvedKeys.map((k, i) => <Bar key={k.key} dataKey={k.key} fill={k.color || PALETTE[i]} radius={[4, 4, 0, 0]} maxBarSize={48} />)}
        {resolvedKeys.length > 1 && <Legend wrapperStyle={{ fontSize: 10, color: "#94a3b8" }} />}
      </BarChart>
    );
  })();

  return (
    <div className="mt-3 bg-slate-900 border border-slate-700 rounded-2xl overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-700/60">
        <BarChart2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
        <span className="text-xs font-semibold text-slate-300 truncate">{title}</span>
      </div>
      <div className="p-3">
        <ResponsiveContainer width="100%" height={200}>{chart}</ResponsiveContainer>
      </div>
    </div>
  );
}

// ── Tool badges ───────────────────────────────────────────────────────────────
function ToolBadges({ toolsCalled }) {
  if (!toolsCalled || toolsCalled.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5 mt-2.5">
      {[...new Set(toolsCalled)].map(t => (
        <span key={t} className="inline-flex items-center gap-1 text-[10px] text-slate-500 bg-slate-800 border border-slate-700 rounded-full px-2 py-0.5">
          <Code2 className="w-2.5 h-2.5" /> {toolLabel(t)}
        </span>
      ))}
    </div>
  );
}

// ── Progress indicator ────────────────────────────────────────────────────────
function ProgressLabel({ label }) {
  return (
    <div className="flex items-center gap-2 text-xs text-slate-500 pl-11 py-1">
      <Loader2 className="w-3 h-3 animate-spin text-emerald-500 shrink-0" />
      <span>{label}</span>
    </div>
  );
}

// ── Message ───────────────────────────────────────────────────────────────────
function Message({ role, content, charts, citations, toolsCalled, streaming }) {
  const isUser = role === "user";
  const showDots = !isUser && streaming && !content;

  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
      <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold
        ${isUser
          ? "bg-slate-700 text-slate-300"
          : "bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/30"
        }`}>
        {isUser ? "You" : "I"}
      </div>
      <div className={`flex flex-col max-w-[85%] ${isUser ? "items-end" : "items-start"}`}>
        {!isUser && (
          <span className="text-[10px] font-semibold text-emerald-400 uppercase tracking-widest px-1 mb-1">Idjwi</span>
        )}
        <div className={`rounded-2xl px-4 py-3
          ${isUser
            ? "bg-slate-700 text-slate-100 rounded-tr-sm"
            : "bg-slate-800/80 border border-slate-700/50 rounded-tl-sm w-full"
          }`}>
          {isUser ? (
            <p className="text-sm leading-relaxed">{content}</p>
          ) : showDots ? (
            <div className="flex gap-1.5 items-center py-0.5">
              <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
              <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
              <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
            </div>
          ) : (
            <MarkdownContent content={content} streaming={streaming && !!content} />
          )}
        </div>
        {!isUser && charts && charts.length > 0 && (
          <div className="w-full space-y-2 mt-1">
            {charts.map((cfg, i) => <DemoChartCard key={i} config={cfg} />)}
          </div>
        )}
        {!isUser && !streaming && <ToolBadges toolsCalled={toolsCalled} />}
        {!isUser && !streaming && citations && citations.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2 px-1">
            {citations.map((c, i) => (
              <a key={i} href={c.url} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[10px] text-slate-500 hover:text-emerald-400 transition-colors">
                <ExternalLink className="w-2.5 h-2.5" />{(c.title || c.url || "Source").slice(0, 36)}
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Idjwi chat widget ─────────────────────────────────────────────────────────
function IdjwiChat() {
  const [messages, setMessages]       = useState([GREETING]);
  const [input, setInput]             = useState("");
  const [loading, setLoading]         = useState(false);
  const [rateLimited, setRateLimited] = useState(false);
  const [started, setStarted]         = useState(false);
  const [progressLabel, setProgressLabel] = useState(null);

  const inputRef   = useRef(null);
  const bottomRef  = useRef(null);
  const historyRef = useRef([]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading, progressLabel]);

  const updateMsg = useCallback((id, patch) => {
    setMessages(prev => prev.map(m => m._id === id ? { ...m, ...patch } : m));
  }, []);

  const send = async (text) => {
    const q = (text || input).trim();
    if (!q || loading || rateLimited) return;
    setInput("");
    setStarted(true);
    trackEvent("prompt_sent", { is_starter: !!text, length: q.length });

    const msgId = `msg-${Date.now()}`;
    const userHistory = historyRef.current.map(m => ({ role: m.role, content: m.content }));

    setMessages(prev => [
      ...prev,
      { _id: `u-${msgId}`, role: "user", content: q },
      { _id: msgId, role: "assistant", content: "", charts: [], citations: [], toolsCalled: [], streaming: true },
    ]);
    setLoading(true);
    setProgressLabel(null);

    let finalContent = "";
    let finalCharts  = [];
    let finalTools   = [];

    try {
      const resp = await fetch(`${RAILWAY_URL}/copilot/demo-stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, history: userHistory }),
      });

      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

      const reader  = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          let event;
          try { event = JSON.parse(line.slice(6)); } catch { continue; }

          if (event.type === "tool_start") {
            const lbl = `${toolLabel(event.tool)}…`;
            setProgressLabel(lbl);
            if (!finalTools.includes(event.tool)) finalTools.push(event.tool);

          } else if (event.type === "tool_done") {
            setProgressLabel("Processing results…");

          } else if (event.type === "text_delta") {
            finalContent += event.text;
            setProgressLabel(null);
            updateMsg(msgId, { content: finalContent });

          } else if (event.type === "chart") {
            finalCharts = [...finalCharts, event.config];
            updateMsg(msgId, { charts: finalCharts });
            trackEvent("chart_rendered", { type: event.config?.type });

          } else if (event.type === "done") {
            updateMsg(msgId, {
              content:     finalContent || "Done.",
              citations:   event.citations || [],
              toolsCalled: finalTools,
              streaming:   false,
            });
            if (event.rate_limited) setRateLimited(true);
            trackEvent("response_success", { tools: finalTools.length, has_chart: finalCharts.length > 0 });
            historyRef.current = [
              ...historyRef.current,
              { role: "user",      content: q },
              { role: "assistant", content: finalContent },
            ].slice(-16);

          } else if (event.type === "rate_limited") {
            setRateLimited(true);
            updateMsg(msgId, { content: "Demo limit reached.", streaming: false });

          } else if (event.type === "error") {
            updateMsg(msgId, {
              content:  finalContent || "Something went wrong. Please try again.",
              streaming: false,
            });
            trackEvent("response_error", { has_partial: finalContent.length > 0 });
          }
        }
      }

      // Ensure streaming flag is always cleared
      updateMsg(msgId, { streaming: false });

    } catch (e) {
      updateMsg(msgId, {
        content:  finalContent || "Connection interrupted. Please try again.",
        streaming: false,
      });
      trackEvent("response_error", { error: e.message });
    } finally {
      setLoading(false);
      setProgressLabel(null);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  const handleKey = e => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };

  return (
    <div className="relative w-full max-w-4xl mx-auto">
      <div className="absolute -inset-1 bg-gradient-to-r from-emerald-500/20 via-teal-500/10 to-emerald-500/20 rounded-3xl blur-xl" />

      <div className="relative bg-slate-900/95 backdrop-blur border border-slate-700/60 rounded-3xl overflow-hidden shadow-2xl shadow-black/50">

        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-800/80 bg-slate-950/60">
          <div className="relative">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/30">
              <span className="text-white font-black text-base">I</span>
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-400 rounded-full border-2 border-slate-950 animate-pulse" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white">Idjwi</p>
            <p className="text-[11px] text-emerald-400">Newsconseen Intelligence · All tools active</p>
          </div>
          <div className="ml-auto hidden sm:flex items-center gap-4 text-[10px] text-slate-500">
            <span className="flex items-center gap-1"><Globe className="w-3 h-3 text-emerald-500" /> Public data</span>
            <span className="flex items-center gap-1"><Brain className="w-3 h-3 text-violet-400" /> All tools</span>
            <span className="flex items-center gap-1"><BarChart2 className="w-3 h-3 text-blue-400" /> Charts</span>
          </div>
        </div>

        {/* Messages */}
        <div className="h-[55vh] min-h-[380px] md:h-[520px] overflow-y-auto px-5 py-5 space-y-5 scroll-smooth">
          {messages.map((m) => (
            <Message key={m._id} role={m.role} content={m.content}
              charts={m.charts} citations={m.citations}
              toolsCalled={m.toolsCalled} streaming={m.streaming} />
          ))}

          {/* Starter chips — before user has typed */}
          {!started && (
            <div className="flex flex-wrap gap-2 pt-1">
              {STARTERS.slice(0, 6).map((s, i) => (
                <button key={i} onClick={() => { trackEvent("starter_clicked", { label: s.label }); send(s.q); }}
                  disabled={loading}
                  className="text-xs text-slate-400 border border-slate-700 hover:border-emerald-500/50 hover:text-emerald-400 rounded-full px-3 py-1.5 transition-all hover:bg-emerald-500/5 disabled:opacity-40">
                  {s.label}
                </button>
              ))}
            </div>
          )}

          {/* Progress label when tool is running */}
          {loading && progressLabel && <ProgressLabel label={progressLabel} />}

          {rateLimited && (
            <div className="flex items-start gap-2 text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>Demo limit reached. <a href="/onboarding" className="underline font-medium" onClick={() => trackEvent("signup_clicked", { source: "rate_limit" })}>Sign up free</a> for unlimited Idjwi access with your own data.</span>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Post-conversation chips */}
        {started && !rateLimited && (
          <div className="px-5 pt-2 pb-1 flex gap-1.5 border-t border-slate-800/40 overflow-x-auto">
            {STARTERS.slice(0, 4).map((s, i) => (
              <button key={i} onClick={() => send(s.q)} disabled={loading}
                className="text-[11px] text-slate-500 border border-slate-800 hover:border-slate-600 hover:text-slate-300 rounded-full px-2.5 py-1 transition-all disabled:opacity-40 whitespace-nowrap shrink-0">
                {s.label}
              </button>
            ))}
          </div>
        )}

        {/* Input */}
        <div className="px-4 pb-4 pt-3">
          <div className="flex gap-2 items-end bg-slate-800/60 rounded-2xl border border-slate-700/60 focus-within:border-emerald-500/40 transition-colors px-4 py-3">
            <textarea ref={inputRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKey}
              rows={1} disabled={loading || rateLimited}
              placeholder="Ask about market data, your industry, how Newsconseen works…"
              className="flex-1 bg-transparent text-sm text-slate-200 placeholder-slate-500 resize-none outline-none leading-relaxed disabled:opacity-40 max-h-32 overflow-y-auto"
              style={{ minHeight: "24px" }} />
            <button onClick={() => send()} disabled={loading || !input.trim() || rateLimited}
              className="shrink-0 w-8 h-8 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-colors">
              {loading
                ? <Loader2 className="w-4 h-4 text-white animate-spin" />
                : <Send className="w-3.5 h-3.5 text-white" />
              }
            </button>
          </div>
          <p className="text-[10px] text-slate-600 mt-1.5 text-center">
            Idjwi · Powered by Claude · Full capabilities demo · No company data connected
          </p>
        </div>
      </div>
    </div>
  );
}

// ── App mockup ────────────────────────────────────────────────────────────────
function DashboardTab() {
  return (
    <div>
      <div className="grid grid-cols-2 gap-2 mb-3">
        {[
          { label: "Active Clients",  val: "1,247", trend: "+12%",          ok: true },
          { label: "Revenue (MTD)",   val: "$84,320", trend: "+8%",         ok: true },
          { label: "Tasks Due Today", val: "23",    trend: "6 overdue",     ok: false },
          { label: "Churn Risk",      val: "7",     trend: "Action needed", ok: false },
        ].map(s => (
          <div key={s.label} className="bg-slate-800/60 border border-slate-700/40 rounded-xl p-3">
            <p className="text-[9px] text-slate-500 mb-1 uppercase tracking-wide">{s.label}</p>
            <p className="text-sm font-bold text-white">{s.val}</p>
            <p className={`text-[10px] ${s.ok ? "text-emerald-400" : "text-amber-400"}`}>{s.trend}</p>
          </div>
        ))}
      </div>
      <div className="bg-slate-800/40 border border-slate-700/40 rounded-xl flex items-center justify-center h-20">
        <BarChart2 className="w-4 h-4 text-slate-600 mr-2" />
        <span className="text-xs text-slate-600">Revenue · 6-month trend chart</span>
      </div>
    </div>
  );
}

function CopilotTab() {
  return (
    <div className="space-y-3">
      <div className="flex gap-2 justify-end">
        <div className="bg-slate-700 rounded-xl rounded-tr-sm px-3 py-2 text-xs text-slate-300 max-w-[80%]">
          Which clients are at risk of churning?
        </div>
        <div className="w-6 h-6 rounded-full bg-slate-600 flex items-center justify-center text-[9px] text-slate-400 shrink-0 font-medium">Y</div>
      </div>
      <div className="flex gap-2">
        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-[9px] text-white shrink-0 font-bold">I</div>
        <div className="bg-slate-800/80 border border-slate-700/50 rounded-xl rounded-tl-sm px-3 py-2 text-xs text-slate-300 space-y-1 max-w-[90%]">
          <p>Based on your data, <span className="text-white font-semibold">7 clients</span> show high churn signals:</p>
          <p className="text-slate-400">· Sarah M. — no activity 42 days, outstanding invoice</p>
          <p className="text-slate-400">· Clinic B — last task completed 3 weeks late</p>
          <p className="text-emerald-400 text-[10px] mt-1.5">↳ Retention agent created follow-up tasks for all 7</p>
        </div>
      </div>
    </div>
  );
}

function AgentsTab() {
  return (
    <div className="space-y-2">
      {[
        { agent: "Revenue Agent",    action: "3 overdue invoices — WhatsApp reminders sent",    time: "2m ago",  status: "done" },
        { agent: "Retention Agent",  action: "7 clients declining engagement — tasks created",  time: "14m ago", status: "done" },
        { agent: "Inventory Agent",  action: "Stock below threshold — reorder task created",    time: "1h ago",  status: "pending" },
        { agent: "Compliance Agent", action: "Running OFAC screen on 12 new entities",         time: "now",     status: "running" },
      ].map((a, i) => (
        <div key={i} className="flex items-start gap-2 bg-slate-800/40 border border-slate-700/40 rounded-xl p-2.5">
          <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${
            a.status === "done" ? "bg-emerald-400" : a.status === "running" ? "bg-blue-400 animate-pulse" : "bg-amber-400"
          }`} />
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-semibold text-slate-400">{a.agent}</p>
            <p className="text-[11px] text-slate-300 leading-snug">{a.action}</p>
          </div>
          <span className="text-[10px] text-slate-600 shrink-0">{a.time}</span>
        </div>
      ))}
    </div>
  );
}

function AppMockup() {
  const [tab, setTab] = useState("dashboard");
  const TABS = [
    { id: "dashboard", label: "Dashboard", Icon: BarChart2 },
    { id: "copilot",   label: "Copilot",   Icon: Brain },
    { id: "agents",    label: "Agents",    Icon: Zap },
  ];
  const SIDEBAR = [BarChart2, Users, Package, CheckSquare, Database, Brain];

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl shadow-black/60">
      <div className="bg-slate-950 flex items-center gap-3 px-4 py-3 border-b border-slate-800">
        <div className="flex gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
          <span className="w-2.5 h-2.5 rounded-full bg-amber-500/60" />
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/60" />
        </div>
        <div className="flex-1 bg-slate-800 rounded-md px-3 py-1 text-[11px] text-slate-500">
          app.newsconseen.com
        </div>
      </div>
      <div className="flex h-[300px]">
        <div className="w-12 bg-slate-950/80 border-r border-slate-800 flex flex-col items-center py-3 gap-2.5">
          {SIDEBAR.map((Icon, i) => (
            <div key={i} className={`w-8 h-8 rounded-lg flex items-center justify-center ${i === 0 ? "bg-emerald-500/20" : ""}`}>
              <Icon className={`w-4 h-4 ${i === 0 ? "text-emerald-400" : "text-slate-600"}`} />
            </div>
          ))}
        </div>
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex items-center px-4 border-b border-slate-800 bg-slate-950/40">
            {TABS.map(({ id, label, Icon }) => (
              <button key={id} onClick={() => setTab(id)}
                className={`flex items-center gap-1.5 text-xs px-3 py-2.5 font-medium transition-colors border-b-2 ${
                  tab === id ? "text-emerald-400 border-emerald-400" : "text-slate-500 border-transparent hover:text-slate-300"
                }`}>
                <Icon className="w-3 h-3" /> {label}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            {tab === "dashboard" && <DashboardTab />}
            {tab === "copilot"   && <CopilotTab />}
            {tab === "agents"    && <AgentsTab />}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main landing page ─────────────────────────────────────────────────────────
export default function Landing() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");

  const handleGetStarted = () => {
    trackEvent("signup_clicked", { source: "cta" });
    if (email) navigate(`/onboarding?email=${encodeURIComponent(email)}`);
    else navigate("/onboarding");
  };

  return (
    <div className="min-h-screen bg-[#050b18] text-white overflow-x-hidden">

      {/* NAV */}
      <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 md:px-12 py-4
                      bg-[#050b18]/80 backdrop-blur-xl border-b border-slate-800/50">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/30">
            <span className="text-white font-black text-sm">N</span>
          </div>
          <span className="font-bold text-white text-sm tracking-tight">Newsconseen</span>
        </div>
        <div className="hidden md:flex items-center gap-8 text-sm text-slate-400">
          <a href="#how-it-works" className="hover:text-white transition-colors">How it works</a>
          <a href="#industries"   className="hover:text-white transition-colors">Industries</a>
          <a href="#pricing"      className="hover:text-white transition-colors">Pricing</a>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/app")}
            className="text-sm text-slate-400 hover:text-white transition-colors px-3 py-1.5">
            Sign in
          </button>
          <button onClick={() => { trackEvent("signup_clicked", { source: "nav" }); navigate("/onboarding"); }}
            className="text-sm font-semibold bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl transition-colors shadow-lg shadow-emerald-500/20">
            Get started
          </button>
        </div>
      </nav>

      {/* HERO */}
      <section className="relative pt-32 pb-16 px-6">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[500px] bg-emerald-500/4 rounded-full blur-3xl" />
          <div className="absolute top-24 left-1/2 -translate-x-1/2 w-[500px] h-[300px] bg-teal-500/6 rounded-full blur-2xl" />
        </div>
        <div className="relative max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-4 py-1.5 mb-6">
              <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
              <span className="text-xs font-semibold text-emerald-400 tracking-wider uppercase">Autonomous SME Operating System</span>
            </div>
            <h1 className="text-5xl md:text-7xl font-black leading-none tracking-tight mb-5">
              Your team runs on{" "}
              <span className="bg-gradient-to-r from-emerald-400 via-teal-300 to-emerald-400 bg-clip-text text-transparent">
                spreadsheets.
              </span>
            </h1>
            <p className="text-lg md:text-xl text-slate-400 max-w-2xl mx-auto mb-3 leading-relaxed">
              Scattered data, manual admin, zero visibility. Newsconseen replaces all three
              with one autonomous operating system — and Idjwi runs it.
            </p>
            <p className="text-sm text-slate-500 mb-10">
              Talk to Idjwi below. No signup required. All tools active.
            </p>
          </div>
          <IdjwiChat />
        </div>
      </section>

      {/* SOCIAL PROOF */}
      <section className="py-16 px-6">
        <div className="max-w-6xl mx-auto">
          <p className="text-center text-xs font-semibold text-slate-500 uppercase tracking-widest mb-10">
            What operators say
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {TESTIMONIALS.map((t, i) => (
              <div key={i} className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 flex flex-col">
                <div className="flex gap-0.5 mb-4">
                  {[...Array(5)].map((_, j) => <Star key={j} className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />)}
                </div>
                <p className="text-sm text-slate-300 leading-relaxed flex-1 mb-5">"{t.quote}"</p>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-xs font-bold text-emerald-400">
                    {t.initials}
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-white">{t.role}</p>
                    <p className="text-[10px] text-slate-500">{t.org}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* TRUST BAR */}
      <section className="border-y border-slate-800/60 py-5 px-6 bg-slate-900/30">
        <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-center gap-8">
          {[
            { icon: Brain,     label: "8 Autonomous Agents" },
            { icon: Wifi,      label: "35 Connectors" },
            { icon: Cpu,       label: "ML Models built-in" },
            { icon: Globe,     label: "Live public data APIs" },
            { icon: Shield,    label: "OFAC · AML · SOC 2" },
            { icon: GitBranch, label: "Multi-tenant network" },
          ].map(({ icon: Icon, label }) => (
            <div key={label} className="flex items-center gap-2 text-slate-400">
              <Icon className="w-4 h-4 text-emerald-500" />
              <span className="text-xs font-medium">{label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* CAPABILITIES */}
      <section className="py-24 px-6" id="features">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-xs font-semibold text-emerald-400 uppercase tracking-widest mb-3">Full operational intelligence</p>
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">What Idjwi does for your organisation every day</h2>
            <p className="text-slate-400 max-w-xl mx-auto">Connected to your data, Idjwi runs continuously — not just when you ask.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {CAPABILITIES.map(cap => {
              const c = COLOUR[cap.color];
              const Icon = cap.icon;
              return (
                <div key={cap.title} className={`${c.bg} border ${c.border} rounded-2xl p-6 hover:scale-[1.02] transition-transform`}>
                  <div className={`w-10 h-10 rounded-xl ${c.bg} border ${c.border} flex items-center justify-center mb-4`}>
                    <Icon className={`w-5 h-5 ${c.text}`} />
                  </div>
                  <h3 className="text-sm font-semibold text-white mb-2">{cap.title}</h3>
                  <p className="text-xs text-slate-400 leading-relaxed">{cap.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* APP MOCKUP */}
      <section className="py-16 px-6 bg-slate-900/20">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-10">
            <p className="text-xs font-semibold text-emerald-400 uppercase tracking-widest mb-3">Inside Newsconseen</p>
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-3">One platform. Three views.</h2>
            <p className="text-slate-400 text-sm max-w-lg mx-auto">
              Dashboard for visibility. Copilot for answers. Agents for action. All connected to the same data.
            </p>
          </div>
          <AppMockup />
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="py-24 px-6" id="how-it-works">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-xs font-semibold text-emerald-400 uppercase tracking-widest mb-3">Architecture</p>
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">Three layers. One operating system.</h2>
            <p className="text-slate-400 max-w-xl mx-auto">
              Newsconseen is the Palantir Foundry for SMEs — built on a universal ontology that works for any industry, any scale.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {LAYERS.map(layer => {
              const c = COLOUR[layer.color];
              return (
                <div key={layer.number} className="relative bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 overflow-hidden">
                  <div className={`absolute top-0 right-0 text-7xl font-black ${c.text} opacity-5 leading-none pr-2`}>{layer.number}</div>
                  <div className={`inline-flex items-center gap-1.5 ${c.bg} border ${c.border} rounded-full px-3 py-1 mb-4`}>
                    <span className={`text-[10px] font-bold ${c.text} uppercase tracking-wider`}>Layer {layer.number}</span>
                  </div>
                  <h3 className="text-lg font-bold text-white mb-1">{layer.title}</h3>
                  <p className={`text-xs font-semibold ${c.text} mb-3`}>{layer.subtitle}</p>
                  <p className="text-sm text-slate-400 leading-relaxed">{layer.desc}</p>
                  {layer.number !== "03" && (
                    <div className="mt-4 flex items-center gap-1 text-xs text-slate-600">
                      <ArrowRight className="w-3.5 h-3.5" /> feeds next layer
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* INDUSTRIES */}
      <section className="py-24 px-6 bg-slate-900/20" id="industries">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-xs font-semibold text-emerald-400 uppercase tracking-widest mb-3">Universal ontology</p>
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">Any industry. Same system.</h2>
            <p className="text-slate-400 max-w-xl mx-auto">
              Every organisation has people, places, things, tasks, and money. Newsconseen is built around that universal truth.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {INDUSTRIES.map(ind => (
              <div key={ind.name}
                className="bg-slate-900/50 border border-slate-800/60 rounded-2xl p-5 hover:border-slate-700 transition-colors group">
                <span className="text-3xl mb-3 block">{ind.emoji}</span>
                <h3 className="text-sm font-semibold text-white mb-1.5 group-hover:text-emerald-400 transition-colors">{ind.name}</h3>
                <p className="text-xs text-slate-500">{ind.example}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* AGENTS + CONNECTORS */}
      <section className="py-24 px-6">
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="bg-gradient-to-br from-violet-500/10 to-violet-900/10 border border-violet-500/20 rounded-3xl p-8">
            <div className="w-12 h-12 bg-violet-500/10 border border-violet-500/20 rounded-2xl flex items-center justify-center mb-5">
              <Brain className="w-6 h-6 text-violet-400" />
            </div>
            <h3 className="text-xl font-bold text-white mb-3">8 Autonomous Agents</h3>
            <p className="text-slate-400 text-sm leading-relaxed mb-5">
              Operations, Revenue, Retention, Inventory, Onboarding, Compliance, Network, and Market Research agents run continuously — surfacing insights and taking actions without being asked.
            </p>
            <div className="flex flex-wrap gap-2">
              {["Operations", "Revenue", "Retention", "Inventory", "Market Research"].map(a => (
                <span key={a} className="text-[11px] bg-violet-500/10 border border-violet-500/20 text-violet-300 rounded-full px-3 py-1">{a}</span>
              ))}
            </div>
          </div>
          <div className="bg-gradient-to-br from-blue-500/10 to-blue-900/10 border border-blue-500/20 rounded-3xl p-8">
            <div className="w-12 h-12 bg-blue-500/10 border border-blue-500/20 rounded-2xl flex items-center justify-center mb-5">
              <Wifi className="w-6 h-6 text-blue-400" />
            </div>
            <h3 className="text-xl font-bold text-white mb-3">35 Connectors</h3>
            <p className="text-slate-400 text-sm leading-relaxed mb-5">
              Connect your existing tools — accounting, CRM, EHR, HRIS, eCommerce, payment gateways, and more. Newsconseen pulls them into one operating picture.
            </p>
            <div className="flex flex-wrap gap-2">
              {["QuickBooks", "Shopify", "Salesforce", "M-Pesa", "WhatsApp"].map(a => (
                <span key={a} className="text-[11px] bg-blue-500/10 border border-blue-500/20 text-blue-300 rounded-full px-3 py-1">{a}</span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ENRICHMENT */}
      <section className="py-24 px-6 bg-slate-900/20">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-xs font-semibold text-emerald-400 uppercase tracking-widest mb-3">Enrichment engine</p>
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">Your data, made richer.</h2>
            <p className="text-slate-400 max-w-xl mx-auto">Every record is automatically enriched with external intelligence — without you lifting a finger.</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { icon: Shield,      label: "OFAC Sanctions",   sub: "SDN screening on every entity" },
              { icon: Globe,       label: "Geocoding",         sub: "Coordinates from any address" },
              { icon: Package,     label: "Drug data",         sub: "RxNorm, FDA, dosage, interactions" },
              { icon: TrendingUp,  label: "Churn prediction",  sub: "ML-predicted risk on every person" },
              { icon: BarChart2,   label: "Revenue trend",     sub: "Growth trajectory per enterprise" },
              { icon: AlertCircle, label: "AML flags",         sub: "Anti-money laundering signals" },
              { icon: Database,    label: "Company registry",  sub: "OpenCorporates enrichment" },
              { icon: RefreshCw,   label: "FX rates",          sub: "Live exchange rates on every tx" },
            ].map(({ icon: Icon, label, sub }) => (
              <div key={label} className="bg-slate-900/50 border border-slate-800/60 rounded-xl p-4 text-center">
                <Icon className="w-5 h-5 text-emerald-400 mx-auto mb-2" />
                <p className="text-xs font-semibold text-white mb-1">{label}</p>
                <p className="text-[10px] text-slate-500">{sub}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section className="py-24 px-6" id="pricing">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-xs font-semibold text-emerald-400 uppercase tracking-widest mb-3">Pricing</p>
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">Simple, transparent pricing</h2>
            <p className="text-slate-400 max-w-md mx-auto">Start free. Scale when you need to. No lock-in.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {PRICING_TIERS.map(tier => (
              <div key={tier.name} className={`relative bg-slate-900/60 border rounded-2xl p-6 flex flex-col ${
                tier.highlighted ? "border-emerald-500/40 shadow-xl shadow-emerald-500/10" : "border-slate-800"
              }`}>
                {tier.highlighted && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="bg-emerald-600 text-white text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider">Most popular</span>
                  </div>
                )}
                <div className="mb-5">
                  <p className="text-xs font-semibold text-slate-400 mb-1">{tier.name}</p>
                  <p className={`text-2xl font-black ${tier.highlighted ? "text-emerald-400" : "text-white"}`}>{tier.price}</p>
                  <p className="text-xs text-slate-500 mt-1">{tier.sub}</p>
                </div>
                <ul className="space-y-2.5 flex-1 mb-6">
                  {tier.features.map(f => (
                    <li key={f} className="flex items-start gap-2 text-xs text-slate-300">
                      <CheckCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />{f}
                    </li>
                  ))}
                </ul>
                <a href={tier.href} onClick={() => trackEvent("signup_clicked", { source: "pricing", tier: tier.name })}
                  className={`w-full py-2.5 rounded-xl text-sm font-semibold text-center transition-colors block ${
                    tier.highlighted
                      ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-500/20"
                      : "bg-slate-800 hover:bg-slate-700 text-slate-200"
                  }`}>
                  {tier.cta}
                </a>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 px-6 relative bg-slate-900/20">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-emerald-500/5 rounded-full blur-3xl" />
        </div>
        <div className="relative max-w-2xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-4 py-1.5 mb-6">
            <Zap className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-xs font-semibold text-emerald-400">Set up in under 5 minutes</span>
          </div>
          <h2 className="text-4xl md:text-5xl font-black text-white mb-4 leading-tight">
            You've seen what Idjwi can do.{" "}
            <span className="bg-gradient-to-r from-emerald-400 to-teal-300 bg-clip-text text-transparent">
              Imagine it on your data.
            </span>
          </h2>
          <p className="text-slate-400 mb-10">
            Everything Idjwi just showed you — market analysis, charts, live data — is the demo.
            Connect your organisation and Idjwi starts answering about your actual clients, revenue, staff, and risk.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center max-w-md mx-auto">
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleGetStarted()}
              placeholder="your@email.com"
              className="flex-1 bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 outline-none focus:border-emerald-500/60 transition-colors" />
            <button onClick={handleGetStarted}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold px-6 py-3 rounded-xl transition-colors shadow-xl shadow-emerald-500/20 flex items-center gap-2 justify-center whitespace-nowrap">
              Get started <ArrowRight className="w-4 h-4" />
            </button>
          </div>
          <p className="text-xs text-slate-600 mt-4">No credit card required. Free to start.</p>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-slate-800/60 py-8 px-6">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
              <span className="text-white font-black text-xs">N</span>
            </div>
            <span className="text-sm font-bold text-white">Newsconseen</span>
            <span className="text-slate-600 text-xs">· Autonomous SME Operating System</span>
          </div>
          <div className="flex items-center gap-6 text-xs text-slate-500">
            <a href="#pricing"    className="hover:text-slate-300 transition-colors">Pricing</a>
            <a href="#industries" className="hover:text-slate-300 transition-colors">Industries</a>
            <a href="/onboarding" className="hover:text-slate-300 transition-colors">Get started</a>
            <span>Intelligence by <span className="text-emerald-500">Idjwi</span></span>
          </div>
        </div>
      </footer>
    </div>
  );
}
