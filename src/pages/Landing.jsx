import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Check, ChevronRight, Monitor, Layers, Zap, Grid3x3, Bell, Settings, Users, BarChart2, CheckSquare, Receipt, GitBranch, Code2, ArrowRight, Star, Globe, Shield, Cpu, Wifi, Package } from "lucide-react";

// ── Data ──────────────────────────────────────────────────────────────────────

const OS_COMPONENTS = [
  { icon: Monitor, title: "Desktop Shell", desc: "A workspace that adapts to every role.", color: "text-emerald-400", bg: "bg-emerald-500/10" },
  { icon: Layers, title: "Window Manager", desc: "Run multiple apps like a real OS.", color: "text-blue-400", bg: "bg-blue-500/10" },
  { icon: Grid3x3, title: "App Launcher", desc: "Every workflow, one click away.", color: "text-violet-400", bg: "bg-violet-500/10" },
  { icon: Bell, title: "Notification Center", desc: "Stay aware without being overwhelmed.", color: "text-amber-400", bg: "bg-amber-500/10" },
  { icon: Settings, title: "Settings & Permissions", desc: "Profiles, permissions, and org-level control.", color: "text-rose-400", bg: "bg-rose-500/10" },
];

const PAINS = [
  "Your workflows live in 12 different tools.",
  "Your data is scattered across spreadsheets, apps, and inboxes.",
  "Your team wastes hours switching contexts.",
  "Your systems don't talk to each other.",
];

const APPS = [
  { icon: CheckSquare, name: "Tasks", desc: "Track every workflow across your org.", color: "bg-emerald-500" },
  { icon: Receipt, name: "Ledger", desc: "Revenue, expenses, and full audit trails.", color: "bg-blue-500" },
  { icon: GitBranch, name: "Entity Graph", desc: "Visualize your org's relationships and structure.", color: "bg-violet-500" },
  { icon: Code2, name: "Query Builder", desc: "Ask questions of your data instantly.", color: "bg-amber-500" },
  { icon: Users, name: "People & Relationships", desc: "Staff, clients, contacts — unified.", color: "bg-rose-500" },
  { icon: BarChart2, name: "Dashboards", desc: "Live analytics, pinnable widgets, reports.", color: "bg-cyan-500" },
  { icon: Bell, name: "Notifications", desc: "Alerts, operational triggers, escalations.", color: "bg-orange-500" },
  { icon: Settings, name: "Settings", desc: "Branding, permissions, and custom domains.", color: "bg-slate-500" },
];

const WORKFLOW_STEPS = [
  { label: "Entity", sublabel: "Person / Enterprise / Item", color: "bg-emerald-500", glow: "shadow-emerald-500/40" },
  { label: "Task", sublabel: "Assign & track work", color: "bg-blue-500", glow: "shadow-blue-500/40" },
  { label: "Transaction", sublabel: "Capture the outcome", color: "bg-violet-500", glow: "shadow-violet-500/40" },
  { label: "Report", sublabel: "Visualize the result", color: "bg-amber-500", glow: "shadow-amber-500/40" },
  { label: "Insight", sublabel: "Act on intelligence", color: "bg-rose-500", glow: "shadow-rose-500/40" },
];

const ARCH_FEATURES = [
  { icon: Globe, title: "Multi-tenant", desc: "Every org is completely isolated and secure." },
  { icon: Cpu, title: "Modular", desc: "Install only the apps your org needs." },
  { icon: Wifi, title: "Browser-native", desc: "No install required. Works on any device." },
  { icon: Shield, title: "Role-aware", desc: "Fine-grained permissions per user and page." },
  { icon: Package, title: "Extensible", desc: "Build and publish custom apps on the platform." },
  { icon: Zap, title: "Offline-capable", desc: "Desktop shell works even without connectivity." },
];

const PERSONAS = [
  {
    emoji: "💼",
    title: "Consultant",
    tagline: "Build workflows for clients",
    points: ["Standardize processes across clients", "Deliver dashboards instantly", "White-label with your own domain"],
    color: "border-emerald-500/30 bg-emerald-500/5",
    badge: "bg-emerald-500/20 text-emerald-300",
  },
  {
    emoji: "📊",
    title: "BI Team",
    tagline: "Intelligence at org scale",
    points: ["Model data with visual query builder", "Build reusable analytics", "Connect open data APIs"],
    color: "border-blue-500/30 bg-blue-500/5",
    badge: "bg-blue-500/20 text-blue-300",
  },
  {
    emoji: "🏢",
    title: "Small Enterprise",
    tagline: "Run the entire business",
    points: ["Manage operations from one OS", "Track people & relationships", "Unify finance, HR, and inventory"],
    color: "border-violet-500/30 bg-violet-500/5",
    badge: "bg-violet-500/20 text-violet-300",
  },
  {
    emoji: "🏥",
    title: "Care Organization",
    tagline: "Purpose-built for care delivery",
    points: ["Medication administration & MAR", "Care plan tasks & incident logs", "Client & carer relationship tracking"],
    color: "border-rose-500/30 bg-rose-500/5",
    badge: "bg-rose-500/20 text-rose-300",
  },
];

const TESTIMONIALS = [
  { name: "Dr. Sarah O.", role: "Healthcare Director", quote: "Finally, one system that handles our clients, staff, meds, and reporting — without 8 different tools.", avatar: "S" },
  { name: "James K.", role: "Operations Consultant", quote: "I deploy this for clients in hours. The adaptive terminology alone saves days of customization.", avatar: "J" },
  { name: "Amara L.", role: "BI Analyst", quote: "The Query Builder with open data integration is genuinely the best thing I've used in years.", avatar: "A" },
];

const PLANS = [
  { name: "Starter", price: "$49", period: "/month", tagline: "For individuals & small teams", features: ["1 enterprise", "Up to 5 users", "Tasks, People, Transactions", "Basic dashboards"], popular: false, cta: "Start Free Trial", ctaStyle: "bg-white/10 hover:bg-white/20 text-white border border-white/20" },
  { name: "Professional", price: "$149", period: "/month", tagline: "For growing organizations", features: ["Up to 5 enterprises", "Up to 20 users", "Full analytics & reports", "QueryBuilder + open data", "Market Intelligence"], popular: true, cta: "Start Free Trial", ctaStyle: "bg-emerald-500 hover:bg-emerald-400 text-white" },
  { name: "Consultant", price: "$299", period: "/month", tagline: "For consultants & agencies", features: ["Unlimited enterprises", "Unlimited users", "White-label options", "API access", "Custom domain"], popular: false, cta: "Contact Sales", ctaStyle: "bg-white/10 hover:bg-white/20 text-white border border-white/20" },
];

// ── Animated workflow node ────────────────────────────────────────────────────
function WorkflowNode({ step, index, total }) {
  return (
    <div className="flex items-center">
      <div className="flex flex-col items-center gap-2">
        <div className={`w-14 h-14 rounded-2xl ${step.color} shadow-lg ${step.glow} flex items-center justify-center font-bold text-white text-sm`}>
          {index + 1}
        </div>
        <span className="font-bold text-white text-sm text-center">{step.label}</span>
        <span className="text-slate-500 text-[10px] text-center max-w-[80px] leading-tight">{step.sublabel}</span>
      </div>
      {index < total - 1 && (
        <div className="flex items-center mx-2 mt-[-20px]">
          <div className="w-8 h-[2px] bg-gradient-to-r from-slate-600 to-slate-500" />
          <ChevronRight className="w-4 h-4 text-slate-500 -ml-1" />
        </div>
      )}
    </div>
  );
}

// ── Desktop Mockup ────────────────────────────────────────────────────────────
function DesktopMockup() {
  return (
    <div className="relative w-full max-w-2xl mx-auto">
      {/* Glow */}
      <div className="absolute inset-0 bg-emerald-500/20 blur-3xl rounded-3xl scale-90" />
      
      {/* Screen */}
      <div className="relative bg-slate-900 rounded-2xl border border-white/10 shadow-2xl overflow-hidden">
        {/* Titlebar */}
        <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-950/80 border-b border-white/5">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-red-500/70" />
            <div className="w-3 h-3 rounded-full bg-yellow-500/70" />
            <div className="w-3 h-3 rounded-full bg-emerald-500/70" />
          </div>
          <div className="flex-1 flex items-center justify-center">
            <div className="flex items-center gap-2 bg-white/5 rounded-lg px-3 py-1">
              <div className="w-2 h-2 rounded-full bg-emerald-500" />
              <span className="text-[10px] text-slate-400 font-medium">Newsconseen OS</span>
            </div>
          </div>
        </div>

        {/* Desktop content */}
        <div className="bg-gradient-to-br from-slate-950 to-slate-900 p-4 min-h-[300px] relative">
          {/* Taskbar */}
          <div className="absolute bottom-0 left-0 right-0 h-10 bg-slate-950/90 border-t border-white/5 flex items-center px-3 gap-2">
            <div className="w-6 h-6 rounded-lg bg-emerald-500 flex items-center justify-center">
              <span className="text-white font-bold text-[8px]">N</span>
            </div>
            {["Tasks", "People", "Ledger", "Reports"].map(app => (
              <div key={app} className="px-2 py-1 bg-white/5 rounded text-[9px] text-slate-400 hover:bg-white/10 cursor-pointer">{app}</div>
            ))}
            <div className="flex-1" />
            <div className="text-[9px] text-slate-500">09:41 AM</div>
          </div>

          {/* App windows */}
          <div className="absolute top-4 left-4 w-44 bg-slate-800/90 rounded-xl border border-white/10 shadow-xl overflow-hidden">
            <div className="bg-slate-900/80 px-3 py-1.5 flex items-center gap-1.5">
              <div className="flex gap-1"><div className="w-2 h-2 rounded-full bg-red-400/60"/><div className="w-2 h-2 rounded-full bg-yellow-400/60"/><div className="w-2 h-2 rounded-full bg-green-400/60"/></div>
              <span className="text-[9px] text-slate-400 ml-1">Tasks</span>
            </div>
            <div className="p-2 space-y-1.5">
              {["Follow up with client", "Review medication MAR", "Staff roster — Thu"].map((t, i) => (
                <div key={i} className="flex items-center gap-1.5 text-[8px] text-slate-300">
                  <div className={`w-1.5 h-1.5 rounded-full ${i === 0 ? "bg-emerald-400" : i === 1 ? "bg-amber-400" : "bg-slate-500"}`} />
                  {t}
                </div>
              ))}
            </div>
          </div>

          <div className="absolute top-4 right-4 w-40 bg-slate-800/90 rounded-xl border border-white/10 shadow-xl overflow-hidden">
            <div className="bg-slate-900/80 px-3 py-1.5 flex items-center gap-1.5">
              <div className="flex gap-1"><div className="w-2 h-2 rounded-full bg-red-400/60"/><div className="w-2 h-2 rounded-full bg-yellow-400/60"/><div className="w-2 h-2 rounded-full bg-green-400/60"/></div>
              <span className="text-[9px] text-slate-400 ml-1">Dashboard</span>
            </div>
            <div className="p-2">
              <div className="text-[8px] text-slate-400 mb-1.5">Revenue (7d)</div>
              <div className="flex items-end gap-1 h-8">
                {[3, 5, 4, 7, 6, 8, 9].map((h, i) => (
                  <div key={i} style={{ height: `${h * 4}px` }} className="flex-1 bg-emerald-500/40 rounded-sm" />
                ))}
              </div>
              <div className="mt-1.5 text-[9px] text-emerald-400 font-bold">↑ 18% this week</div>
            </div>
          </div>

          {/* App launcher icons in center */}
          <div className="absolute bottom-12 left-1/2 -translate-x-1/2">
            <div className="grid grid-cols-4 gap-2">
              {[
                { color: "bg-emerald-500", label: "Tasks" },
                { color: "bg-blue-500", label: "People" },
                { color: "bg-violet-500", label: "Ledger" },
                { color: "bg-amber-500", label: "Reports" },
              ].map(a => (
                <div key={a.label} className="flex flex-col items-center gap-1">
                  <div className={`w-9 h-9 rounded-xl ${a.color} shadow-md flex items-center justify-center`}>
                    <span className="text-white text-[8px] font-bold">{a.label[0]}</span>
                  </div>
                  <span className="text-[7px] text-slate-400">{a.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Scrolling grid background ─────────────────────────────────────────────────
function GridBackground() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <svg className="absolute inset-0 w-full h-full opacity-[0.04]" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="white" strokeWidth="1"/>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
      </svg>
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl" />
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function Landing() {
  const navigate = useNavigate();
  const [activeWorkflow, setActiveWorkflow] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setActiveWorkflow(prev => (prev + 1) % WORKFLOW_STEPS.length);
    }, 1400);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-white">

      {/* ── NAV ─────────────────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-50 bg-slate-950/90 backdrop-blur-md border-b border-white/5">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-emerald-500 rounded-xl w-9 h-9 flex items-center justify-center shadow-md shadow-emerald-500/30">
              <span className="text-white font-bold text-base">N</span>
            </div>
            <span className="text-lg font-bold text-white">Newsconseen</span>
          </div>
          <div className="hidden md:flex items-center gap-6 text-sm text-slate-400">
            <a href="#components" className="hover:text-white transition-colors">Platform</a>
            <a href="#apps" className="hover:text-white transition-colors">Apps</a>
            <a href="#personas" className="hover:text-white transition-colors">Use Cases</a>
            <a href="#pricing" className="hover:text-white transition-colors">Pricing</a>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => navigate("/Dashboard")} className="text-sm text-slate-400 hover:text-white transition-colors">Sign in</button>
            <button onClick={() => navigate("/pricing")} className="bg-emerald-500 hover:bg-emerald-400 text-white text-sm font-bold px-4 py-2 rounded-xl transition-colors shadow-md shadow-emerald-500/20">
              Get Started
            </button>
          </div>
        </div>
      </nav>

      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden pt-20 pb-24">
        <GridBackground />
        <div className="relative max-w-7xl mx-auto px-6">
          <div className="text-center mb-14">
            <div className="inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 rounded-full px-4 py-1.5 mb-6">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-emerald-400 text-xs font-semibold tracking-wide">The Browser-Native Enterprise OS</span>
            </div>
            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-black tracking-tight text-white mb-6 leading-[1.05]">
              Your Organization.<br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400">One Operating System.</span>
            </h1>
            <p className="text-xl text-slate-400 max-w-2xl mx-auto mb-4 leading-relaxed">
              Tasks, data, workflows, and people — unified in a modular,<br className="hidden sm:block" /> browser-native OS built for real organizations.
            </p>
            <p className="text-slate-500 text-sm max-w-lg mx-auto mb-10">
              From care homes to consultancies, farms to franchises. One platform. Infinite configurations.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <button
                onClick={() => navigate("/Dashboard")}
                className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-white font-bold px-8 py-4 rounded-2xl text-base transition-all shadow-xl shadow-emerald-500/30 hover:shadow-emerald-500/50 hover:scale-105"
              >
                <Monitor className="w-5 h-5" /> Launch the Demo OS
              </button>
              <button
                onClick={() => navigate("/pricing")}
                className="flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-semibold px-6 py-4 rounded-2xl text-base transition-all"
              >
                View Pricing <ArrowRight className="w-4 h-4" />
              </button>
            </div>
            <p className="text-slate-600 text-xs mt-4">14-day free trial · No credit card required</p>
          </div>

          <DesktopMockup />
        </div>
      </section>

      {/* ── OS COMPONENTS ────────────────────────────────────────────────── */}
      <section id="components" className="py-24 bg-slate-900/50">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-14">
            <p className="text-emerald-400 text-xs font-bold tracking-widest uppercase mb-3">System Architecture</p>
            <h2 className="text-4xl font-black text-white mb-4">The OS Components</h2>
            <p className="text-slate-400 text-lg max-w-xl mx-auto">Not just an app. A full operating environment built for organizational work.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-5">
            {OS_COMPONENTS.map((comp) => (
              <div key={comp.title} className="bg-slate-900 border border-white/5 rounded-2xl p-6 hover:border-white/15 transition-all hover:-translate-y-1 group">
                <div className={`w-12 h-12 rounded-xl ${comp.bg} flex items-center justify-center mb-4`}>
                  <comp.icon className={`w-6 h-6 ${comp.color}`} />
                </div>
                <h3 className="font-bold text-white text-sm mb-2">{comp.title}</h3>
                <p className="text-slate-500 text-xs leading-relaxed">{comp.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PAIN SECTION ─────────────────────────────────────────────────── */}
      <section className="py-24">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-14">
            <p className="text-rose-400 text-xs font-bold tracking-widest uppercase mb-3">Why Newsconseen Exists</p>
            <h2 className="text-4xl font-black text-white mb-4">You know this feeling.</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-14">
            {PAINS.map((pain, i) => (
              <div key={i} className="flex items-start gap-4 bg-rose-500/5 border border-rose-500/15 rounded-2xl p-5">
                <div className="w-8 h-8 rounded-lg bg-rose-500/20 flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-rose-400 text-sm font-bold">✕</span>
                </div>
                <p className="text-slate-300 text-sm leading-relaxed">{pain}</p>
              </div>
            ))}
          </div>
          <div className="bg-gradient-to-r from-emerald-500/20 to-cyan-500/20 border border-emerald-500/30 rounded-2xl p-8 text-center">
            <div className="text-4xl mb-4">⚡</div>
            <h3 className="text-2xl font-black text-white mb-3">Newsconseen replaces the chaos.</h3>
            <p className="text-slate-300 text-lg max-w-xl mx-auto">One unified operating system. Every workflow. Every person. Every insight — in one place.</p>
          </div>
        </div>
      </section>

      {/* ── APPS ─────────────────────────────────────────────────────────── */}
      <section id="apps" className="py-24 bg-slate-900/50">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-14">
            <p className="text-violet-400 text-xs font-bold tracking-widest uppercase mb-3">Core Apps</p>
            <h2 className="text-4xl font-black text-white mb-4">Every workflow. One launcher.</h2>
            <p className="text-slate-400 text-lg max-w-xl mx-auto">Modular apps that install into your OS environment. Use what you need, hide what you don't.</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {APPS.map((app) => (
              <div key={app.name} className="bg-slate-900 border border-white/5 rounded-2xl p-5 hover:border-white/15 transition-all hover:-translate-y-1 cursor-pointer group">
                <div className={`w-12 h-12 rounded-xl ${app.color} shadow-lg flex items-center justify-center mb-3`}>
                  <app.icon className="w-6 h-6 text-white" />
                </div>
                <h3 className="font-bold text-white text-sm mb-1">{app.name}</h3>
                <p className="text-slate-500 text-xs leading-relaxed">{app.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ─────────────────────────────────────────────────── */}
      <section className="py-24">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-14">
            <p className="text-amber-400 text-xs font-bold tracking-widest uppercase mb-3">How It Works</p>
            <h2 className="text-4xl font-black text-white mb-4">Structure → Action → Intelligence</h2>
            <p className="text-slate-400 text-lg max-w-xl mx-auto">Every organization follows the same logic. Newsconseen maps it perfectly.</p>
          </div>
          <div className="flex flex-wrap items-start justify-center gap-2">
            {WORKFLOW_STEPS.map((step, i) => (
              <div key={i} className={`flex items-center transition-all duration-500 ${activeWorkflow === i ? "scale-105" : "scale-100 opacity-70"}`}>
                <div className="flex flex-col items-center gap-2">
                  <div className={`w-16 h-16 rounded-2xl ${step.color} shadow-xl flex items-center justify-center font-black text-white text-lg transition-all ${activeWorkflow === i ? `shadow-lg ${step.glow}` : ""}`}>
                    {i + 1}
                  </div>
                  <span className="font-bold text-white text-sm text-center">{step.label}</span>
                  <span className="text-slate-500 text-[10px] text-center max-w-[80px] leading-tight">{step.sublabel}</span>
                </div>
                {i < WORKFLOW_STEPS.length - 1 && (
                  <div className="flex items-center mx-3 mb-8">
                    <div className="w-6 h-[2px] bg-slate-700" />
                    <ChevronRight className="w-4 h-4 text-slate-600 -ml-1" />
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="mt-10 text-center">
            <p className="text-slate-500 text-sm italic">"Oh, this is not a toy — this is an OS."</p>
          </div>
        </div>
      </section>

      {/* ── ARCHITECTURE ─────────────────────────────────────────────────── */}
      <section className="py-24 bg-slate-900/50">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-14">
            <p className="text-cyan-400 text-xs font-bold tracking-widest uppercase mb-3">Architecture</p>
            <h2 className="text-4xl font-black text-white mb-4">Built for real organizations.</h2>
            <p className="text-slate-400 text-lg max-w-xl mx-auto">Engineered for production. Designed for simplicity.</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-5">
            {ARCH_FEATURES.map((f) => (
              <div key={f.title} className="bg-slate-900 border border-white/5 rounded-2xl p-6 hover:border-white/15 transition-all">
                <div className="w-10 h-10 bg-cyan-500/10 rounded-xl flex items-center justify-center mb-4">
                  <f.icon className="w-5 h-5 text-cyan-400" />
                </div>
                <h3 className="font-bold text-white text-sm mb-1.5">{f.title}</h3>
                <p className="text-slate-500 text-xs leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PERSONAS ─────────────────────────────────────────────────────── */}
      <section id="personas" className="py-24">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-14">
            <p className="text-emerald-400 text-xs font-bold tracking-widest uppercase mb-3">Use Cases</p>
            <h2 className="text-4xl font-black text-white mb-4">Who uses Newsconseen?</h2>
            <p className="text-slate-400 text-lg max-w-xl mx-auto">Every type of organized enterprise — one OS.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {PERSONAS.map((p) => (
              <div key={p.title} className={`border rounded-2xl p-6 ${p.color} transition-all hover:-translate-y-1`}>
                <div className="text-4xl mb-4">{p.emoji}</div>
                <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${p.badge} uppercase tracking-wide`}>{p.title}</span>
                <p className="text-white font-bold mt-3 mb-3 text-sm">{p.tagline}</p>
                <ul className="space-y-2">
                  {p.points.map((pt, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-slate-300">
                      <Check className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" />
                      {pt}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── TESTIMONIALS ─────────────────────────────────────────────────── */}
      <section className="py-24 bg-slate-900/50">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-14">
            <p className="text-amber-400 text-xs font-bold tracking-widest uppercase mb-3">Social Proof</p>
            <h2 className="text-4xl font-black text-white mb-4">What people are saying</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {TESTIMONIALS.map((t) => (
              <div key={t.name} className="bg-slate-900 border border-white/5 rounded-2xl p-6">
                <div className="flex items-center gap-1 mb-4">
                  {[1,2,3,4,5].map(s => <Star key={s} className="w-4 h-4 fill-amber-400 text-amber-400" />)}
                </div>
                <p className="text-slate-300 text-sm leading-relaxed mb-5 italic">"{t.quote}"</p>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-emerald-700 flex items-center justify-center text-white text-sm font-bold">
                    {t.avatar}
                  </div>
                  <div>
                    <p className="text-white text-sm font-semibold">{t.name}</p>
                    <p className="text-slate-500 text-xs">{t.role}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PRICING ──────────────────────────────────────────────────────── */}
      <section id="pricing" className="py-24">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-14">
            <p className="text-emerald-400 text-xs font-bold tracking-widest uppercase mb-3">Pricing</p>
            <h2 className="text-4xl font-black text-white mb-4">Simple, transparent pricing</h2>
            <p className="text-slate-400 text-lg max-w-xl mx-auto">Start free. Scale as you grow. Cancel anytime.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {PLANS.map((plan) => (
              <div key={plan.name} className={`relative rounded-2xl border p-8 flex flex-col transition-all ${plan.popular ? "border-emerald-500/50 bg-emerald-500/5 shadow-xl shadow-emerald-500/10" : "border-white/10 bg-slate-900 hover:border-white/20"}`}>
                {plan.popular && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                    <span className="bg-emerald-500 text-white text-[10px] font-bold px-4 py-1 rounded-full shadow-md">Most Popular</span>
                  </div>
                )}
                <div className="mb-6">
                  <h3 className="text-lg font-bold text-white">{plan.name}</h3>
                  <p className="text-slate-500 text-xs mt-1">{plan.tagline}</p>
                  <div className="mt-4 flex items-end gap-1">
                    <span className="text-4xl font-black text-white">{plan.price}</span>
                    <span className="text-slate-400 text-sm mb-1">{plan.period}</span>
                  </div>
                </div>
                <ul className="space-y-2.5 flex-1 mb-6">
                  {plan.features.map((f, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm text-slate-300">
                      <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => navigate(plan.name === "Consultant" ? "/pricing" : "/Dashboard")}
                  className={`w-full py-3 rounded-xl text-sm font-bold transition-all ${plan.ctaStyle}`}
                >
                  {plan.cta}
                </button>
              </div>
            ))}
          </div>
          <p className="text-center text-slate-600 text-xs mt-6">All plans include 14-day free trial · No credit card required · Cancel anytime</p>
        </div>
      </section>

      {/* ── CLOSING CTA ──────────────────────────────────────────────────── */}
      <section className="py-28 relative overflow-hidden">
        <GridBackground />
        <div className="relative max-w-3xl mx-auto px-6 text-center">
          <div className="inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 rounded-full px-4 py-1.5 mb-8">
            <Zap className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-emerald-400 text-xs font-semibold">Built for clarity. Designed for action.</span>
          </div>
          <h2 className="text-5xl sm:text-6xl font-black text-white mb-6 leading-tight">
            The OS for every<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400">organization.</span>
          </h2>
          <p className="text-slate-400 text-xl mb-10 max-w-lg mx-auto">
            Stop managing tools. Start running your organization from one unified OS.
          </p>
          <button
            onClick={() => navigate("/Dashboard")}
            className="inline-flex items-center gap-3 bg-emerald-500 hover:bg-emerald-400 text-white font-black px-10 py-5 rounded-2xl text-lg transition-all shadow-2xl shadow-emerald-500/30 hover:shadow-emerald-500/50 hover:scale-105"
          >
            <Monitor className="w-6 h-6" /> Launch the Demo OS
          </button>
          <p className="text-slate-600 text-xs mt-4">Free for 14 days · No credit card required</p>
        </div>
      </section>

      {/* ── FOOTER ───────────────────────────────────────────────────────── */}
      <footer className="border-t border-white/5 py-10">
        <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-emerald-500 rounded-xl w-8 h-8 flex items-center justify-center">
              <span className="text-white font-bold text-sm">N</span>
            </div>
            <span className="text-white font-bold">Newsconseen</span>
            <span className="text-slate-600 text-xs">The universal enterprise operating system</span>
          </div>
          <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6 text-sm text-slate-500">
            <span>140 River Rd, Apt 3, Orrington, ME 04474</span>
            <a href="tel:6823731189" className="hover:text-slate-400 transition-colors">(682) 373-1189</a>
            <a href="mailto:anewsconseen@gmail.com" className="hover:text-slate-400 transition-colors">anewsconseen@gmail.com</a>
            <button onClick={() => navigate("/pricing")} className="hover:text-slate-400 transition-colors">Pricing</button>
            <span>© {new Date().getFullYear()} Newsconseen</span>
          </div>
        </div>
      </footer>
    </div>
  );
}