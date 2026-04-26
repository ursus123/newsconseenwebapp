import React, { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Send, Loader2, ChevronRight, ArrowRight, Globe, Cpu, Users, BarChart2,
  Zap, Shield, GitBranch, Package, CheckSquare, Bell, Wifi, Database,
  Brain, TrendingUp, Map, RefreshCw, AlertCircle, ExternalLink,
} from "lucide-react";

const RAILWAY_URL = "https://newsconseenwebapp-production.up.railway.app";

// ── Idjwi starter prompts ─────────────────────────────────────────────────────
const STARTERS = [
  { label: "What is Idjwi?", q: "What is Idjwi and what can it do for my organisation?" },
  { label: "USD/KES rate today", q: "What is the current USD to KES exchange rate?" },
  { label: "Newsconseen for a clinic", q: "How would Newsconseen work for a healthcare clinic? Walk me through what Idjwi would track and answer." },
  { label: "East Africa market data", q: "Give me key economic indicators for East Africa — GDP, growth, population." },
  { label: "Clinic count in Nairobi", q: "How many clinics and health facilities are in Nairobi, Kenya?" },
  { label: "Newsconseen for a school", q: "How would Newsconseen work for a school? What would I track and what would Idjwi answer?" },
  { label: "What agents does it run?", q: "What autonomous agents does Newsconseen run and what do they do?" },
  { label: "How does the copilot work?", q: "How does the Newsconseen copilot work technically?" },
];

// ── Capability cards ──────────────────────────────────────────────────────────
const CAPABILITIES = [
  { icon: Globe, color: "emerald", title: "Live Public Intelligence", desc: "Exchange rates, World Bank data, economic indicators, business counts — all live." },
  { icon: Brain, color: "violet", title: "Market Analysis", desc: "Industry trends, competitor data, regulatory context — sourced from the live web." },
  { icon: Map, color: "blue", title: "Geospatial Insights", desc: "Facility counts, competitor proximity, demographic context by location." },
  { icon: Cpu, color: "amber", title: "App Navigator", desc: "Guides you through every Newsconseen feature in plain language." },
  { icon: TrendingUp, color: "rose", title: "Economic Research", desc: "UN data, World Bank indicators, country risk — contextualised for your sector." },
  { icon: Database, color: "cyan", title: "Drug & Regulatory Data", desc: "FDA drug data, medical device records, safety alerts — for regulated industries." },
];

const COLOUR = {
  emerald: { bg: "bg-emerald-500/10", text: "text-emerald-400", border: "border-emerald-500/20" },
  violet:  { bg: "bg-violet-500/10",  text: "text-violet-400",  border: "border-violet-500/20" },
  blue:    { bg: "bg-blue-500/10",    text: "text-blue-400",    border: "border-blue-500/20" },
  amber:   { bg: "bg-amber-500/10",   text: "text-amber-400",   border: "border-amber-500/20" },
  rose:    { bg: "bg-rose-500/10",    text: "text-rose-400",    border: "border-rose-500/20" },
  cyan:    { bg: "bg-cyan-500/10",    text: "text-cyan-400",    border: "border-cyan-500/20" },
};

// ── Industry verticals ────────────────────────────────────────────────────────
const INDUSTRIES = [
  { emoji: "🏥", name: "Clinics & Hospitals", example: "Track patients, medications, staff shifts, billing." },
  { emoji: "🎓", name: "Schools & Colleges", example: "Enrolment, attendance, fees, staff timetables." },
  { emoji: "🌾", name: "Farms & Cooperatives", example: "Livestock rounds, harvests, input tracking, sales." },
  { emoji: "🏢", name: "NGOs & Charities", example: "Beneficiary management, donor tracking, field tasks." },
  { emoji: "🚛", name: "Logistics & Delivery", example: "Fleet routing, delivery tasks, driver management." },
  { emoji: "🏪", name: "Retail & Franchises", example: "Multi-branch stock, sales, staff, customer records." },
];

// ── Three-layer cards ─────────────────────────────────────────────────────────
const LAYERS = [
  {
    number: "01", color: "emerald",
    title: "Enterprise OS",
    subtitle: "The system of record",
    desc: "People, enterprises, products, tasks, transactions, relationships, addresses. Every entity your organisation deals with — captured, structured, searchable.",
  },
  {
    number: "02", color: "blue",
    title: "Deployable Datamart",
    subtitle: "The analytical engine",
    desc: "Pre-aggregated analytics, ETL pipeline, PostgreSQL. Every stat card, chart, and ML model reads from here. Fast, clean, multi-tenant.",
  },
  {
    number: "03", color: "violet",
    title: "Foundry Intelligence",
    subtitle: "Idjwi + autonomous agents",
    desc: "The copilot, 8 autonomous agents, alerts, enrichment, connectors, ML models. The layer that makes your data act — not just sit.",
  },
];

// ── Message component ─────────────────────────────────────────────────────────
function Message({ role, content, citations }) {
  const isUser = role === "user";
  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
      {/* Avatar */}
      <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold
        ${isUser
          ? "bg-slate-700 text-slate-300"
          : "bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/30"
        }`}>
        {isUser ? "You" : "I"}
      </div>

      <div className={`flex flex-col gap-1.5 max-w-[82%] ${isUser ? "items-end" : "items-start"}`}>
        {!isUser && (
          <span className="text-[10px] font-semibold text-emerald-400 uppercase tracking-widest px-1">
            Idjwi
          </span>
        )}
        <div className={`rounded-2xl px-4 py-3 text-sm leading-relaxed
          ${isUser
            ? "bg-slate-700 text-slate-100 rounded-tr-sm"
            : "bg-slate-800/80 border border-slate-700/50 text-slate-200 rounded-tl-sm"
          }`}
          style={{ whiteSpace: "pre-wrap" }}
        >
          {content}
        </div>
        {citations && citations.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-1 px-1">
            {citations.map((c, i) => (
              <a key={i} href={c.url} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[10px] text-slate-400 hover:text-emerald-400 transition-colors">
                <ExternalLink className="w-2.5 h-2.5" />{c.title?.slice(0, 40) || "Source"}
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
      <div className="shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-xs font-bold text-white shadow-lg shadow-emerald-500/30">
        I
      </div>
      <div className="flex flex-col gap-1.5 items-start">
        <span className="text-[10px] font-semibold text-emerald-400 uppercase tracking-widest px-1">Idjwi</span>
        <div className="bg-slate-800/80 border border-slate-700/50 rounded-2xl rounded-tl-sm px-4 py-3 flex gap-1.5 items-center">
          <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
          <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
          <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
        </div>
      </div>
    </div>
  );
}

// ── Idjwi chat widget ─────────────────────────────────────────────────────────
function IdjwiChat() {
  const [messages, setMessages]   = useState([]);
  const [input, setInput]         = useState("");
  const [loading, setLoading]     = useState(false);
  const [rateLimited, setRateLimited] = useState(false);
  const [started, setStarted]     = useState(false);
  const inputRef   = useRef(null);
  const bottomRef  = useRef(null);
  const historyRef = useRef([]);

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
        signal: AbortSignal.timeout(45_000),
      });

      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();

      if (data.rate_limited) {
        setRateLimited(true);
      }

      const assistantMsg = {
        role: "assistant",
        content: data.answer || "I couldn't generate a response. Please try again.",
        citations: data.citations || [],
      };
      setMessages(prev => [...prev, assistantMsg]);
      historyRef.current = [
        ...historyRef.current,
        { role: "user", content: q },
        { role: "assistant", content: assistantMsg.content },
      ].slice(-16);

    } catch (e) {
      const errMsg = e.name === "TimeoutError"
        ? "The request timed out. Please try again."
        : "I encountered an error. Please try again.";
      setMessages(prev => [...prev, { role: "assistant", content: errMsg, citations: [] }]);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  const handleKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };

  return (
    <div className="relative w-full max-w-3xl mx-auto">
      {/* Glow effect */}
      <div className="absolute -inset-1 bg-gradient-to-r from-emerald-500/20 via-teal-500/10 to-emerald-500/20 rounded-3xl blur-xl" />

      <div className="relative bg-slate-900/90 backdrop-blur border border-slate-700/60 rounded-3xl overflow-hidden shadow-2xl shadow-black/40">

        {/* Chat header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-800/80 bg-slate-950/40">
          <div className="relative">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/30">
              <span className="text-white font-black text-base">I</span>
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-400 rounded-full border-2 border-slate-900 animate-pulse" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white">Idjwi</p>
            <p className="text-[11px] text-emerald-400">Newsconseen Intelligence · Demo Mode</p>
          </div>
          <div className="ml-auto flex items-center gap-1.5 text-[10px] text-slate-500 bg-slate-800/60 rounded-full px-2.5 py-1">
            <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full" />
            Live public data
          </div>
        </div>

        {/* Messages area */}
        <div className="h-80 overflow-y-auto px-5 py-5 space-y-5 scroll-smooth">
          {!started && messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border border-emerald-500/30 flex items-center justify-center">
                <Brain className="w-6 h-6 text-emerald-400" />
              </div>
              <div>
                <p className="text-slate-300 font-medium text-sm">Ask Idjwi anything</p>
                <p className="text-slate-500 text-xs mt-1">Market data · Product questions · App navigation · Economic research</p>
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <Message key={i} role={m.role} content={m.content} citations={m.citations} />
          ))}
          {loading && <TypingIndicator />}
          {rateLimited && (
            <div className="flex items-start gap-2 text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>Demo limit reached. <a href="/onboarding" className="underline font-medium">Sign up free</a> to get unlimited Idjwi access with your own data.</span>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Starter prompts */}
        {!started && (
          <div className="px-5 pb-3 flex flex-wrap gap-2">
            {STARTERS.slice(0, 5).map((s, i) => (
              <button
                key={i}
                onClick={() => send(s.q)}
                disabled={loading}
                className="text-xs text-slate-400 border border-slate-700 hover:border-emerald-500/50 hover:text-emerald-400 rounded-full px-3 py-1.5 transition-all hover:bg-emerald-500/5 disabled:opacity-40"
              >
                {s.label}
              </button>
            ))}
          </div>
        )}

        {/* Input */}
        <div className="px-4 pb-4 pt-2 border-t border-slate-800/60">
          <div className="flex gap-2 items-end bg-slate-800/60 rounded-2xl border border-slate-700/60 focus-within:border-emerald-500/40 transition-colors px-4 py-3">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              rows={1}
              disabled={loading || rateLimited}
              placeholder="Ask Idjwi about your market, industry, or how Newsconseen works…"
              className="flex-1 bg-transparent text-sm text-slate-200 placeholder-slate-500 resize-none outline-none leading-relaxed disabled:opacity-40 max-h-28 overflow-y-auto"
              style={{ minHeight: "24px" }}
            />
            <button
              onClick={() => send()}
              disabled={loading || !input.trim() || rateLimited}
              className="shrink-0 w-8 h-8 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
            >
              {loading
                ? <Loader2 className="w-4 h-4 text-white animate-spin" />
                : <Send className="w-3.5 h-3.5 text-white" />
              }
            </button>
          </div>
          <p className="text-[10px] text-slate-600 mt-2 text-center">
            Idjwi · Powered by Claude · Public demo — no company data
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

      {/* ── NAV ──────────────────────────────────────────────────────────────── */}
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
          <button
            onClick={() => navigate("/app")}
            className="text-sm text-slate-400 hover:text-white transition-colors px-3 py-1.5"
          >
            Sign in
          </button>
          <button
            onClick={() => navigate("/onboarding")}
            className="text-sm font-semibold bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl transition-colors shadow-lg shadow-emerald-500/20"
          >
            Get started
          </button>
        </div>
      </nav>

      {/* ── HERO ─────────────────────────────────────────────────────────────── */}
      <section className="relative pt-36 pb-24 px-6">
        {/* Background radial glow */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-emerald-500/5 rounded-full blur-3xl" />
          <div className="absolute top-32 left-1/2 -translate-x-1/2 w-[400px] h-[300px] bg-teal-500/8 rounded-full blur-2xl" />
        </div>

        <div className="relative max-w-4xl mx-auto text-center">
          {/* Tag */}
          <div className="inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-4 py-1.5 mb-6">
            <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
            <span className="text-xs font-semibold text-emerald-400 tracking-wider uppercase">
              Autonomous SME Operating System
            </span>
          </div>

          {/* Headline */}
          <h1 className="text-5xl md:text-7xl font-black leading-none tracking-tight mb-4">
            Meet{" "}
            <span className="bg-gradient-to-r from-emerald-400 via-teal-300 to-emerald-400 bg-clip-text text-transparent">
              Idjwi.
            </span>
          </h1>

          <p className="text-lg md:text-xl text-slate-400 max-w-2xl mx-auto mb-3 leading-relaxed">
            The intelligence layer for your organisation. Named after Idjwi Island — Africa's
            most self-sufficient island. Your business, just as autonomous.
          </p>

          <p className="text-sm text-slate-500 mb-12">
            Live public data · Web research · App navigation · Market analysis — try it now, no signup needed.
          </p>

          {/* Idjwi chat — the hero */}
          <IdjwiChat />

          {/* More starters below the widget */}
          <div className="mt-8 flex flex-wrap justify-center gap-2">
            {STARTERS.slice(5).map((s, i) => (
              <button key={i}
                onClick={() => {
                  document.querySelector("textarea")?.focus();
                  document.querySelector("textarea") &&
                    (document.querySelector("textarea").value = s.q);
                }}
                className="text-xs text-slate-500 border border-slate-800 hover:border-slate-600 hover:text-slate-300 rounded-full px-3 py-1.5 transition-all"
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ── TRUST BAR ────────────────────────────────────────────────────────── */}
      <section className="border-y border-slate-800/60 py-6 px-6 bg-slate-900/30">
        <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-center gap-8">
          {[
            { icon: Brain, label: "8 Autonomous Agents" },
            { icon: Wifi, label: "35 Connectors" },
            { icon: Cpu, label: "ML Models built-in" },
            { icon: Globe, label: "Live public data APIs" },
            { icon: Shield, label: "OFAC · AML · SOC 2" },
            { icon: GitBranch, label: "Multi-tenant network" },
          ].map(({ icon: Icon, label }) => (
            <div key={label} className="flex items-center gap-2 text-slate-400">
              <Icon className="w-4 h-4 text-emerald-500" />
              <span className="text-xs font-medium">{label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ── IDJWI CAPABILITIES ───────────────────────────────────────────────── */}
      <section className="py-24 px-6" id="features">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-xs font-semibold text-emerald-400 uppercase tracking-widest mb-3">What Idjwi can do right now</p>
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
              Intelligence without your data
            </h2>
            <p className="text-slate-400 max-w-xl mx-auto">
              Before you connect a single record, Idjwi already has access to a world of public intelligence. This is what it does from day one.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {CAPABILITIES.map((cap) => {
              const c = COLOUR[cap.color];
              const Icon = cap.icon;
              return (
                <div key={cap.title}
                  className={`${c.bg} border ${c.border} rounded-2xl p-6 hover:scale-[1.02] transition-transform`}>
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

      {/* ── HOW NEWSCONSEEN WORKS ─────────────────────────────────────────────── */}
      <section className="py-24 px-6 bg-slate-900/20" id="how-it-works">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-xs font-semibold text-emerald-400 uppercase tracking-widest mb-3">Architecture</p>
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
              Three layers. One operating system.
            </h2>
            <p className="text-slate-400 max-w-xl mx-auto">
              Newsconseen is the Palantir Foundry for SMEs. Built on a universal ontology that works for any industry, any scale.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {LAYERS.map((layer) => {
              const c = COLOUR[layer.color];
              return (
                <div key={layer.number} className="relative bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 overflow-hidden">
                  <div className={`absolute top-0 right-0 text-7xl font-black ${c.text} opacity-5 leading-none pr-2`}>
                    {layer.number}
                  </div>
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

      {/* ── INDUSTRIES ───────────────────────────────────────────────────────── */}
      <section className="py-24 px-6" id="industries">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-xs font-semibold text-emerald-400 uppercase tracking-widest mb-3">Universal ontology</p>
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
              Any industry. Same system.
            </h2>
            <p className="text-slate-400 max-w-xl mx-auto">
              Every organisation has people, places, things, tasks, and money. Newsconseen is built around that universal truth — not around your industry's jargon.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {INDUSTRIES.map((ind) => (
              <div key={ind.name}
                className="bg-slate-900/50 border border-slate-800/60 rounded-2xl p-5 hover:border-slate-700 transition-colors group">
                <span className="text-3xl mb-3 block">{ind.emoji}</span>
                <h3 className="text-sm font-semibold text-white mb-1.5 group-hover:text-emerald-400 transition-colors">
                  {ind.name}
                </h3>
                <p className="text-xs text-slate-500">{ind.example}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── AGENT + CONNECTORS FEATURE ROW ───────────────────────────────────── */}
      <section className="py-24 px-6 bg-slate-900/20">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">

            {/* Agents card */}
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

            {/* Connectors card */}
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
        </div>
      </section>

      {/* ── ENRICHMENT ROW ───────────────────────────────────────────────────── */}
      <section className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-xs font-semibold text-emerald-400 uppercase tracking-widest mb-3">Enrichment engine</p>
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
              Your data, made richer.
            </h2>
            <p className="text-slate-400 max-w-xl mx-auto">
              Every record in your system is automatically enriched with external intelligence — without you lifting a finger.
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { icon: Shield, label: "OFAC Sanctions", sub: "SDN screening on every entity" },
              { icon: Globe, label: "Geocoding", sub: "Coordinates from any address" },
              { icon: Package, label: "Drug data", sub: "RxNorm, FDA, dosage, interactions" },
              { icon: TrendingUp, label: "Churn prediction", sub: "ML-predicted risk on every person" },
              { icon: BarChart2, label: "Revenue trend", sub: "Growth trajectory per enterprise" },
              { icon: AlertCircle, label: "AML flags", sub: "Anti-money laundering signals" },
              { icon: Database, label: "Company registry", sub: "OpenCorporates enrichment" },
              { icon: RefreshCw, label: "FX rates", sub: "Live exchange rates stamped on tx" },
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

      {/* ── CTA ──────────────────────────────────────────────────────────────── */}
      <section className="py-24 px-6 relative">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-emerald-500/5 rounded-full blur-3xl" />
        </div>

        <div className="relative max-w-2xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-4 py-1.5 mb-6">
            <Zap className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-xs font-semibold text-emerald-400">Get started in 5 minutes</span>
          </div>

          <h2 className="text-4xl md:text-5xl font-black text-white mb-4 leading-tight">
            Ready to run your organisation{" "}
            <span className="bg-gradient-to-r from-emerald-400 to-teal-300 bg-clip-text text-transparent">
              autonomously?
            </span>
          </h2>

          <p className="text-slate-400 mb-10">
            Set up your first organisation in under 5 minutes. Idjwi starts working the moment you add your first record.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center max-w-md mx-auto">
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleGetStarted()}
              placeholder="your@email.com"
              className="flex-1 bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 outline-none focus:border-emerald-500/60 transition-colors"
            />
            <button
              onClick={handleGetStarted}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold px-6 py-3 rounded-xl transition-colors shadow-xl shadow-emerald-500/20 flex items-center gap-2 justify-center whitespace-nowrap"
            >
              Get started <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          <p className="text-xs text-slate-600 mt-4">No credit card required. Free to start.</p>
        </div>
      </section>

      {/* ── FOOTER ───────────────────────────────────────────────────────────── */}
      <footer className="border-t border-slate-800/60 py-10 px-6">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
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

        <div className="max-w-6xl mx-auto mt-6 pt-6 border-t border-slate-800/40 text-center">
          <p className="text-[11px] text-slate-600">
            Idjwi is named after Idjwi Island, Lake Kivu — DRC/Rwanda. Africa's most self-sufficient island.
            A fitting name for intelligence that makes your organisation self-sufficient.
          </p>
        </div>
      </footer>
    </div>
  );
}
