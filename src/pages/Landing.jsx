import React, { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Send, Loader2, ArrowRight, Globe, Cpu, Users, BarChart2,
  Zap, Shield, GitBranch, Package, CheckSquare, Bell, Wifi, Database,
  Brain, TrendingUp, Map, RefreshCw, AlertCircle, ExternalLink, Code2,
} from "lucide-react";
import {
  BarChart, Bar, AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";

const RAILWAY_URL = "https://newsconseenwebapp-production.up.railway.app";

const PALETTE = [
  "#10b981","#3b82f6","#f59e0b","#ef4444","#8b5cf6",
  "#06b6d4","#f97316","#84cc16","#ec4899","#14b8a6",
];

// ── Starter prompts ───────────────────────────────────────────────────────────
const STARTERS = [
  { label: "What is Idjwi?",            q: "What is Idjwi and what can it do for my organisation?" },
  { label: "USD/KES rate today",         q: "What is the current USD to KES exchange rate and show me rates for major African currencies." },
  { label: "Newsconseen for a clinic",   q: "How would Newsconseen work for a healthcare clinic? Walk me through what Idjwi would track, what it would answer, and which agents would run." },
  { label: "East Africa economic data",  q: "Show me key economic indicators for East Africa — GDP, growth rates, population — with a chart." },
  { label: "Clinic count in Nairobi",    q: "How many clinics and health facilities are in Nairobi, Kenya?" },
  { label: "Newsconseen for a school",   q: "How would Newsconseen work for a school? What gets tracked and what does Idjwi answer day-to-day?" },
  { label: "Autonomous agents",          q: "What autonomous agents does Newsconseen run and what do they do automatically?" },
  { label: "How does the copilot work?", q: "Explain how the Newsconseen copilot works — tools, data sources, architecture." },
];

// ── Capability cards ──────────────────────────────────────────────────────────
const CAPABILITIES = [
  { icon: Globe,      color: "emerald", title: "Live Public Intelligence",  desc: "Exchange rates, World Bank data, economic indicators, business counts — all live." },
  { icon: Brain,      color: "violet",  title: "Market Analysis",           desc: "Industry trends, competitor data, regulatory context — sourced from the live web." },
  { icon: Map,        color: "blue",    title: "Geospatial Insights",        desc: "Facility counts, competitor proximity, demographic context by location." },
  { icon: Cpu,        color: "amber",   title: "App Navigator",             desc: "Guides you through every Newsconseen feature in plain language." },
  { icon: TrendingUp, color: "rose",    title: "Economic Research",         desc: "UN data, World Bank indicators, country risk — contextualised for your sector." },
  { icon: Database,   color: "cyan",    title: "Drug & Regulatory Data",    desc: "FDA drug data, medical device records, safety alerts — for regulated industries." },
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
  { number: "01", color: "emerald", title: "Enterprise OS",          subtitle: "The system of record",        desc: "People, enterprises, products, tasks, transactions, relationships, addresses. Every entity your organisation deals with — captured, structured, searchable." },
  { number: "02", color: "blue",    title: "Deployable Datamart",    subtitle: "The analytical engine",       desc: "Pre-aggregated analytics, ETL pipeline, PostgreSQL. Every stat card, chart, and ML model reads from here. Fast, clean, multi-tenant." },
  { number: "03", color: "violet",  title: "Foundry Intelligence",   subtitle: "Idjwi + autonomous agents",   desc: "The copilot, 8 autonomous agents, alerts, enrichment, connectors, ML models. The layer that makes your data act — not just sit." },
];

// ── Markdown renderer (dark theme) ────────────────────────────────────────────
function renderInline(text) {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g);
  return parts.map((p, i) => {
    if (p.startsWith("**") && p.endsWith("**"))
      return <strong key={i} className="font-semibold text-white">{p.slice(2,-2)}</strong>;
    if (p.startsWith("*") && p.endsWith("*") && p.length > 2)
      return <em key={i} className="italic text-slate-300">{p.slice(1,-1)}</em>;
    if (p.startsWith("`") && p.endsWith("`") && p.length > 2)
      return <code key={i} className="px-1.5 py-0.5 rounded bg-slate-700 text-emerald-300 text-[11px] font-mono">{p.slice(1,-1)}</code>;
    return p;
  });
}

function MarkdownContent({ content }) {
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
    } else if (line.includes("|") && lines[i+1]?.match(/^[\s|:-]+$/)) {
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
              <tbody>{rows.map((r, ri) => <tr key={ri} className="border-b border-slate-800 last:border-0"><td key={ri}>{r.map((c, ci) => <td key={ci} className="px-3 py-2 text-slate-300 whitespace-nowrap">{c}</td>)}</td></tr>)}</tbody>
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
  return <div className="space-y-0.5">{elements}</div>;
}

// ── Inline chart renderer (dark card) ────────────────────────────────────────
function DemoChartCard({ config }) {
  if (!config || !config.data || config.data.length === 0) return null;
  const { type, title, data, keys = [], unit = "" } = config;
  const fmtTick = v => typeof v !== "number" ? v : v >= 1e9 ? `${(v/1e9).toFixed(1)}B` : v >= 1e6 ? `${(v/1e6).toFixed(1)}M` : v >= 1000 ? `${(v/1000).toFixed(1)}k` : v;
  const fmtTip  = (v, n) => [unit === "$" ? `$${Number(v).toLocaleString()}` : Number(v).toLocaleString(), n];
  const resolvedKeys = keys.length
    ? keys
    : [{ key: Object.keys(data[0] || {}).find(k => k !== "name") || "value", color: PALETTE[0] }];

  const chart = (() => {
    if (type === "pie") return (
      <PieChart><Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} innerRadius={30} paddingAngle={2} label={({ name, percent }) => `${name} ${(percent*100).toFixed(0)}%`} labelLine={false}>
        {data.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
      </Pie><Tooltip formatter={(v,n) => [Number(v).toLocaleString(), n]} contentStyle={{ background:"#1e293b", border:"1px solid #334155", borderRadius:8, fontSize:11 }} /><Legend wrapperStyle={{ fontSize:10, color:"#94a3b8" }} /></PieChart>
    );
    if (type === "area") return (
      <AreaChart data={data} margin={{ top:8, right:12, bottom:4, left:0 }}>
        <defs>{resolvedKeys.map((k,i) => <linearGradient key={k.key} id={`dg-${k.key}`} x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={k.color||PALETTE[i]} stopOpacity={0.35}/><stop offset="95%" stopColor={k.color||PALETTE[i]} stopOpacity={0}/></linearGradient>)}</defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#334155"/>
        <XAxis dataKey="name" tick={{ fontSize:10, fill:"#94a3b8" }}/>
        <YAxis tickFormatter={fmtTick} tick={{ fontSize:10, fill:"#94a3b8" }} width={44}/>
        <Tooltip formatter={fmtTip} contentStyle={{ background:"#1e293b", border:"1px solid #334155", borderRadius:8, fontSize:11 }}/>
        {resolvedKeys.map((k,i) => <Area key={k.key} type="monotone" dataKey={k.key} stroke={k.color||PALETTE[i]} fill={`url(#dg-${k.key})`} strokeWidth={2}/>)}
        {resolvedKeys.length > 1 && <Legend wrapperStyle={{ fontSize:10, color:"#94a3b8" }}/>}
      </AreaChart>
    );
    return (
      <BarChart data={data} margin={{ top:8, right:12, bottom: data.length > 6 ? 24 : 4, left:0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#334155"/>
        <XAxis dataKey="name" tick={{ fontSize:9, fill:"#94a3b8" }} interval={0} angle={data.length > 6 ? -30 : 0} textAnchor={data.length > 6 ? "end" : "middle"} height={data.length > 6 ? 50 : 20}/>
        <YAxis tickFormatter={fmtTick} tick={{ fontSize:10, fill:"#94a3b8" }} width={44}/>
        <Tooltip formatter={fmtTip} contentStyle={{ background:"#1e293b", border:"1px solid #334155", borderRadius:8, fontSize:11 }}/>
        {resolvedKeys.map((k,i) => <Bar key={k.key} dataKey={k.key} fill={k.color||PALETTE[i]} radius={[4,4,0,0]} maxBarSize={48}/>)}
        {resolvedKeys.length > 1 && <Legend wrapperStyle={{ fontSize:10, color:"#94a3b8" }}/>}
      </BarChart>
    );
  })();

  return (
    <div className="mt-3 bg-slate-900 border border-slate-700 rounded-2xl overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-700/60">
        <BarChart2 className="w-3.5 h-3.5 text-emerald-400 shrink-0"/>
        <span className="text-xs font-semibold text-slate-300 truncate">{title}</span>
      </div>
      <div className="p-3">
        <ResponsiveContainer width="100%" height={200}>{chart}</ResponsiveContainer>
      </div>
    </div>
  );
}

// ── Tool call badge strip ─────────────────────────────────────────────────────
function ToolBadges({ toolsCalled }) {
  if (!toolsCalled || toolsCalled.length === 0) return null;
  const label = t => t.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  return (
    <div className="flex flex-wrap gap-1.5 mt-2.5">
      {[...new Set(toolsCalled)].map(t => (
        <span key={t} className="inline-flex items-center gap-1 text-[10px] text-slate-500 bg-slate-800 border border-slate-700 rounded-full px-2 py-0.5">
          <Code2 className="w-2.5 h-2.5"/> {label(t)}
        </span>
      ))}
    </div>
  );
}

// ── Message component ─────────────────────────────────────────────────────────
function Message({ role, content, charts, citations, toolsCalled }) {
  const isUser = role === "user";
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
          {isUser
            ? <p className="text-sm leading-relaxed">{content}</p>
            : <MarkdownContent content={content} />
          }
        </div>

        {/* Charts */}
        {!isUser && charts && charts.length > 0 && (
          <div className="w-full space-y-2 mt-1">
            {charts.map((cfg, i) => <DemoChartCard key={i} config={cfg} />)}
          </div>
        )}

        {/* Tool badges */}
        {!isUser && <ToolBadges toolsCalled={toolsCalled} />}

        {/* Citations */}
        {!isUser && citations && citations.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2 px-1">
            {citations.map((c, i) => (
              <a key={i} href={c.url} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[10px] text-slate-500 hover:text-emerald-400 transition-colors">
                <ExternalLink className="w-2.5 h-2.5"/>{(c.title || c.url || "Source").slice(0,36)}
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex gap-3">
      <div className="shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-xs font-bold text-white shadow-lg shadow-emerald-500/30">I</div>
      <div className="flex flex-col items-start">
        <span className="text-[10px] font-semibold text-emerald-400 uppercase tracking-widest px-1 mb-1">Idjwi</span>
        <div className="bg-slate-800/80 border border-slate-700/50 rounded-2xl rounded-tl-sm px-4 py-3 flex gap-1.5 items-center">
          <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay:"0ms" }}/>
          <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay:"150ms" }}/>
          <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay:"300ms" }}/>
        </div>
      </div>
    </div>
  );
}

// ── Idjwi chat widget ─────────────────────────────────────────────────────────
function IdjwiChat() {
  const [messages, setMessages]       = useState([]);
  const [input, setInput]             = useState("");
  const [loading, setLoading]         = useState(false);
  const [rateLimited, setRateLimited] = useState(false);
  const [started, setStarted]         = useState(false);
  const inputRef    = useRef(null);
  const bottomRef   = useRef(null);
  const historyRef  = useRef([]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const send = async (text) => {
    const q = (text || input).trim();
    if (!q || loading || rateLimited) return;
    setInput("");
    setStarted(true);

    const userMsg = { role: "user", content: q };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);

    const apiHistory = historyRef.current.map(m => ({ role: m.role, content: m.content }));

    try {
      const resp = await fetch(`${RAILWAY_URL}/copilot/demo-ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, history: apiHistory }),
        signal: AbortSignal.timeout(55_000),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();

      if (data.rate_limited) setRateLimited(true);

      const assistantMsg = {
        role: "assistant",
        content: data.answer || "I couldn't generate a response. Please try again.",
        charts: data.charts || [],
        citations: data.citations || [],
        toolsCalled: data.tools_called || [],
      };
      setMessages(prev => [...prev, assistantMsg]);
      historyRef.current = [
        ...historyRef.current,
        { role: "user", content: q },
        { role: "assistant", content: assistantMsg.content },
      ].slice(-16);
    } catch (e) {
      const errMsg = e.name === "TimeoutError"
        ? "The request timed out. Idjwi is thinking hard — please try again."
        : "I encountered an error. Please try again.";
      setMessages(prev => [...prev, { role: "assistant", content: errMsg, charts: [], citations: [], toolsCalled: [] }]);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  const handleKey = e => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };

  return (
    <div className="relative w-full max-w-4xl mx-auto">
      <div className="absolute -inset-1 bg-gradient-to-r from-emerald-500/20 via-teal-500/10 to-emerald-500/20 rounded-3xl blur-xl"/>

      <div className="relative bg-slate-900/95 backdrop-blur border border-slate-700/60 rounded-3xl overflow-hidden shadow-2xl shadow-black/50">

        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-800/80 bg-slate-950/60">
          <div className="relative">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/30">
              <span className="text-white font-black text-base">I</span>
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-400 rounded-full border-2 border-slate-950 animate-pulse"/>
          </div>
          <div>
            <p className="text-sm font-semibold text-white">Idjwi</p>
            <p className="text-[11px] text-emerald-400">Newsconseen Intelligence · Full demo — all tools active</p>
          </div>
          <div className="ml-auto flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-3 text-[10px] text-slate-500">
              <span className="flex items-center gap-1"><Globe className="w-3 h-3 text-emerald-500"/> Public data</span>
              <span className="flex items-center gap-1"><Brain className="w-3 h-3 text-violet-400"/> All tools</span>
              <span className="flex items-center gap-1"><BarChart2 className="w-3 h-3 text-blue-400"/> Charts</span>
            </div>
          </div>
        </div>

        {/* Messages area — large */}
        <div className="h-[520px] overflow-y-auto px-5 py-5 space-y-6 scroll-smooth">
          {!started && messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border border-emerald-500/30 flex items-center justify-center">
                <Brain className="w-7 h-7 text-emerald-400"/>
              </div>
              <div>
                <p className="text-slate-200 font-semibold text-base">Ask Idjwi anything</p>
                <p className="text-slate-500 text-sm mt-1.5 max-w-md">
                  This is a full demo of the Newsconseen copilot. All tools are active.
                  Try market data, economic research, or ask how Newsconseen works.
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-2 max-w-lg">
                {STARTERS.slice(0, 6).map((s, i) => (
                  <button key={i} onClick={() => send(s.q)} disabled={loading}
                    className="text-xs text-slate-400 border border-slate-700 hover:border-emerald-500/50 hover:text-emerald-400 rounded-full px-3 py-1.5 transition-all hover:bg-emerald-500/5 disabled:opacity-40">
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <Message key={i} role={m.role} content={m.content}
              charts={m.charts} citations={m.citations} toolsCalled={m.toolsCalled} />
          ))}
          {loading && <TypingIndicator/>}

          {rateLimited && (
            <div className="flex items-start gap-2 text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5"/>
              <span>Demo limit reached. <a href="/onboarding" className="underline font-medium">Sign up free</a> for unlimited Idjwi access with your own data.</span>
            </div>
          )}
          <div ref={bottomRef}/>
        </div>

        {/* Starter chips — shown after first message too */}
        {started && !rateLimited && (
          <div className="px-5 pt-2 flex flex-wrap gap-1.5 border-t border-slate-800/40">
            {STARTERS.slice(0, 4).map((s, i) => (
              <button key={i} onClick={() => send(s.q)} disabled={loading}
                className="text-[11px] text-slate-500 border border-slate-800 hover:border-slate-600 hover:text-slate-300 rounded-full px-2.5 py-1 transition-all disabled:opacity-40">
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
              placeholder="Ask about market data, how Newsconseen works, your industry, exchange rates…"
              className="flex-1 bg-transparent text-sm text-slate-200 placeholder-slate-500 resize-none outline-none leading-relaxed disabled:opacity-40 max-h-32 overflow-y-auto"
              style={{ minHeight: "24px" }}/>
            <button onClick={() => send()} disabled={loading || !input.trim() || rateLimited}
              className="shrink-0 w-8 h-8 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-colors">
              {loading
                ? <Loader2 className="w-4 h-4 text-white animate-spin"/>
                : <Send className="w-3.5 h-3.5 text-white"/>
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

// ── Main landing page ─────────────────────────────────────────────────────────
export default function Landing() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");

  const handleGetStarted = () => {
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
          <a href="#industries" className="hover:text-white transition-colors">Industries</a>
          <a href="#features" className="hover:text-white transition-colors">Features</a>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/app")}
            className="text-sm text-slate-400 hover:text-white transition-colors px-3 py-1.5">
            Sign in
          </button>
          <button onClick={() => navigate("/onboarding")}
            className="text-sm font-semibold bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl transition-colors shadow-lg shadow-emerald-500/20">
            Get started
          </button>
        </div>
      </nav>

      {/* HERO */}
      <section className="relative pt-32 pb-20 px-6">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[500px] bg-emerald-500/4 rounded-full blur-3xl"/>
          <div className="absolute top-24 left-1/2 -translate-x-1/2 w-[500px] h-[300px] bg-teal-500/6 rounded-full blur-2xl"/>
        </div>

        <div className="relative max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-4 py-1.5 mb-6">
              <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse"/>
              <span className="text-xs font-semibold text-emerald-400 tracking-wider uppercase">Autonomous SME Operating System</span>
            </div>

            <h1 className="text-5xl md:text-7xl font-black leading-none tracking-tight mb-4">
              Meet{" "}
              <span className="bg-gradient-to-r from-emerald-400 via-teal-300 to-emerald-400 bg-clip-text text-transparent">
                Idjwi.
              </span>
            </h1>

            <p className="text-lg md:text-xl text-slate-400 max-w-2xl mx-auto mb-3 leading-relaxed">
              The intelligence layer of Newsconseen. This is a live demo of the full copilot —
              all tools active, real public data, charts and everything. Connect your data to unlock it for your organisation.
            </p>

            <p className="text-sm text-slate-500 mb-10">
              Live market data · Web research · Charts · ML insights · App navigation — no signup needed to try.
            </p>
          </div>

          {/* Idjwi — full width, large */}
          <IdjwiChat/>
        </div>
      </section>

      {/* TRUST BAR */}
      <section className="border-y border-slate-800/60 py-5 px-6 bg-slate-900/30">
        <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-center gap-8">
          {[
            { icon: Brain,   label: "8 Autonomous Agents" },
            { icon: Wifi,    label: "35 Connectors" },
            { icon: Cpu,     label: "ML Models built-in" },
            { icon: Globe,   label: "Live public data APIs" },
            { icon: Shield,  label: "OFAC · AML · SOC 2" },
            { icon: GitBranch, label: "Multi-tenant network" },
          ].map(({ icon: Icon, label }) => (
            <div key={label} className="flex items-center gap-2 text-slate-400">
              <Icon className="w-4 h-4 text-emerald-500"/>
              <span className="text-xs font-medium">{label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* IDJWI CAPABILITIES */}
      <section className="py-24 px-6" id="features">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-xs font-semibold text-emerald-400 uppercase tracking-widest mb-3">What Idjwi can do in demo mode</p>
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">Intelligence before your data connects</h2>
            <p className="text-slate-400 max-w-xl mx-auto">
              Before you add a single record, Idjwi already has access to a world of public intelligence. This is live — try it above.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {CAPABILITIES.map(cap => {
              const c = COLOUR[cap.color];
              const Icon = cap.icon;
              return (
                <div key={cap.title} className={`${c.bg} border ${c.border} rounded-2xl p-6 hover:scale-[1.02] transition-transform`}>
                  <div className={`w-10 h-10 rounded-xl ${c.bg} border ${c.border} flex items-center justify-center mb-4`}>
                    <Icon className={`w-5 h-5 ${c.text}`}/>
                  </div>
                  <h3 className="text-sm font-semibold text-white mb-2">{cap.title}</h3>
                  <p className="text-xs text-slate-400 leading-relaxed">{cap.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="py-24 px-6 bg-slate-900/20" id="how-it-works">
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
                      <ArrowRight className="w-3.5 h-3.5"/> feeds next layer
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* INDUSTRIES */}
      <section className="py-24 px-6" id="industries">
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

      {/* AGENT + CONNECTORS */}
      <section className="py-24 px-6 bg-slate-900/20">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="bg-gradient-to-br from-violet-500/10 to-violet-900/10 border border-violet-500/20 rounded-3xl p-8">
              <div className="w-12 h-12 bg-violet-500/10 border border-violet-500/20 rounded-2xl flex items-center justify-center mb-5">
                <Brain className="w-6 h-6 text-violet-400"/>
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
                <Wifi className="w-6 h-6 text-blue-400"/>
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
        </div>
      </section>

      {/* ENRICHMENT */}
      <section className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-xs font-semibold text-emerald-400 uppercase tracking-widest mb-3">Enrichment engine</p>
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">Your data, made richer.</h2>
            <p className="text-slate-400 max-w-xl mx-auto">Every record is automatically enriched with external intelligence — without you lifting a finger.</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { icon: Shield,   label: "OFAC Sanctions",   sub: "SDN screening on every entity" },
              { icon: Globe,    label: "Geocoding",         sub: "Coordinates from any address" },
              { icon: Package,  label: "Drug data",         sub: "RxNorm, FDA, dosage, interactions" },
              { icon: TrendingUp, label: "Churn prediction", sub: "ML-predicted risk on every person" },
              { icon: BarChart2, label: "Revenue trend",    sub: "Growth trajectory per enterprise" },
              { icon: AlertCircle, label: "AML flags",      sub: "Anti-money laundering signals" },
              { icon: Database, label: "Company registry",  sub: "OpenCorporates enrichment" },
              { icon: RefreshCw, label: "FX rates",         sub: "Live exchange rates on every tx" },
            ].map(({ icon: Icon, label, sub }) => (
              <div key={label} className="bg-slate-900/50 border border-slate-800/60 rounded-xl p-4 text-center">
                <Icon className="w-5 h-5 text-emerald-400 mx-auto mb-2"/>
                <p className="text-xs font-semibold text-white mb-1">{label}</p>
                <p className="text-[10px] text-slate-500">{sub}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 px-6 relative">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-emerald-500/5 rounded-full blur-3xl"/>
        </div>
        <div className="relative max-w-2xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-4 py-1.5 mb-6">
            <Zap className="w-3.5 h-3.5 text-emerald-400"/>
            <span className="text-xs font-semibold text-emerald-400">Get started in 5 minutes</span>
          </div>
          <h2 className="text-4xl md:text-5xl font-black text-white mb-4 leading-tight">
            Ready to run your organisation{" "}
            <span className="bg-gradient-to-r from-emerald-400 to-teal-300 bg-clip-text text-transparent">autonomously?</span>
          </h2>
          <p className="text-slate-400 mb-10">
            Set up your organisation in under 5 minutes. Idjwi starts working the moment you add your first record.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center max-w-md mx-auto">
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleGetStarted()}
              placeholder="your@email.com"
              className="flex-1 bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 outline-none focus:border-emerald-500/60 transition-colors"/>
            <button onClick={handleGetStarted}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold px-6 py-3 rounded-xl transition-colors shadow-xl shadow-emerald-500/20 flex items-center gap-2 justify-center whitespace-nowrap">
              Get started <ArrowRight className="w-4 h-4"/>
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
            <a href="/pricing" className="hover:text-slate-300 transition-colors">Pricing</a>
            <a href="/onboarding" className="hover:text-slate-300 transition-colors">Get started</a>
            <span>Powered by <span className="text-emerald-500">Idjwi</span> (ee-JEE-wee)</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
