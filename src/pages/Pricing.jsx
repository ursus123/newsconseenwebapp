import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, X, ChevronDown, ChevronUp, Zap } from "lucide-react";

const PLANS = [
  {
    key: "starter",
    name: "Starter",
    monthly: 49,
    annual: 39,
    tagline: "Best for small teams and single locations",
    features: [
      { text: "1 enterprise", included: true },
      { text: "Up to 5 users", included: true },
      { text: "People, Tasks, Transactions", included: true },
      { text: "Basic dashboards", included: true },
      { text: "CSV / Excel import", included: true },
      { text: "Email support", included: true },
      { text: "Analytics layer", included: false },
      { text: "QueryBuilder", included: false },
      { text: "Open data APIs", included: false },
    ],
    popular: false,
    color: "border-slate-200",
    btnClass: "bg-slate-800 hover:bg-slate-700 text-white",
  },
  {
    key: "professional",
    name: "Professional",
    monthly: 149,
    annual: 119,
    tagline: "Best for growing organizations",
    features: [
      { text: "Up to 5 enterprises", included: true },
      { text: "Up to 20 users", included: true },
      { text: "Everything in Starter", included: true },
      { text: "Full analytics (charts + reports)", included: true },
      { text: "QueryBuilder with open data APIs", included: true },
      { text: "Market Intelligence", included: true },
      { text: "Adaptive terminology by enterprise type", included: true },
      { text: "Priority support", included: true },
    ],
    popular: true,
    color: "border-emerald-400",
    btnClass: "bg-emerald-500 hover:bg-emerald-600 text-white",
  },
  {
    key: "consultant",
    name: "Consultant",
    monthly: 299,
    annual: 239,
    tagline: "Best for consultants managing multiple clients",
    features: [
      { text: "Unlimited enterprises", included: true },
      { text: "Unlimited users", included: true },
      { text: "Everything in Professional", included: true },
      { text: "White label options", included: true },
      { text: "API access", included: true },
      { text: "Bulk import for all entities", included: true },
      { text: "Dedicated support", included: true },
      { text: "Custom domain", included: true },
    ],
    popular: false,
    color: "border-slate-200",
    btnClass: "bg-slate-800 hover:bg-slate-700 text-white",
  },
];

const USE_CASES = [
  { emoji: "🏥", label: "Healthcare", desc: "Care homes · Home health · Clinics · Nursing facilities" },
  { emoji: "🏫", label: "Education", desc: "Schools · Training centers · Tutoring · Universities" },
  { emoji: "⛪", label: "Community", desc: "Churches · NGOs · Bible study groups · Community centers" },
  { emoji: "🌾", label: "Agriculture", desc: "Farms · Barns · Livestock operations · Aquaculture" },
  { emoji: "💼", label: "Business", desc: "SMBs · Departments · Franchises · Retail chains" },
  { emoji: "🤝", label: "Nonprofit", desc: "Charities · Foundations · Social organizations · SDGs" },
];

const FAQS = [
  { q: "Can I change plans later?", a: "Yes, upgrade or downgrade anytime from your billing settings. Changes take effect immediately." },
  { q: "What happens after the trial?", a: "You'll be prompted to add a payment method. Your data is never deleted — even if your subscription lapses." },
  { q: "Is my data secure?", a: "Yes. All data is isolated per workspace with enterprise-grade security. Each tenant's data is completely segregated." },
  { q: "Does it work for non-healthcare organizations?", a: "Absolutely. Newsconseen adapts its language and suggested workflows based on your enterprise type — care homes and church groups use the same powerful platform." },
];

function FaqItem({ q, a }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-slate-50 transition-colors">
        <span className="font-semibold text-slate-800 text-sm">{q}</span>
        {open ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
      </button>
      {open && <div className="px-6 pb-4"><p className="text-sm text-slate-500 leading-relaxed">{a}</p></div>}
    </div>
  );
}

export default function Pricing() {
  const navigate = useNavigate();
  const [annual, setAnnual] = useState(false);

  return (
    <div className="min-h-screen bg-white">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-4 border-b border-slate-100 max-w-6xl mx-auto">
        <div className="flex items-center gap-3">
          <div className="bg-emerald-500 rounded-xl w-9 h-9 flex items-center justify-center shadow-md">
            <span className="text-white font-bold text-base">N</span>
          </div>
          <span className="text-lg font-bold text-slate-800">Newsconseen</span>
        </div>
        <button onClick={() => navigate("/Dashboard")} className="text-sm font-medium text-slate-600 hover:text-slate-800 transition-colors">
          Sign in →
        </button>
      </nav>

      {/* Hero */}
      <div className="max-w-6xl mx-auto px-6 pt-16 pb-12 text-center">
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold mb-4">
          <Zap className="w-3.5 h-3.5" /> 14-day free trial — no card required
        </span>
        <h1 className="text-4xl sm:text-5xl font-black text-slate-900 tracking-tight mb-4">
          The operating system<br />for any enterprise
        </h1>
        <p className="text-lg text-slate-500 max-w-2xl mx-auto mb-3">
          From care homes to church groups, from farms to franchises —<br />
          Newsconseen runs any organized enterprise.
        </p>
        <p className="text-base text-slate-400 max-w-xl mx-auto mb-8">
          One platform. Adaptive terminology. Universal workflows.
        </p>

        {/* Billing toggle */}
        <div className="inline-flex items-center gap-3 bg-slate-100 p-1 rounded-xl">
          <button
            onClick={() => setAnnual(false)}
            className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${!annual ? "bg-white shadow text-slate-800" : "text-slate-500 hover:text-slate-700"}`}
          >
            Monthly
          </button>
          <button
            onClick={() => setAnnual(true)}
            className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-2 ${annual ? "bg-white shadow text-slate-800" : "text-slate-500 hover:text-slate-700"}`}
          >
            Annual
            <span className="bg-emerald-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">−20%</span>
          </button>
        </div>
      </div>

      {/* Plan cards */}
      <div className="max-w-6xl mx-auto px-6 pb-16">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {PLANS.map((plan) => (
            <div
              key={plan.key}
              className={`relative rounded-2xl border-2 p-8 flex flex-col transition-all hover:shadow-lg
                ${plan.popular ? "border-emerald-400 shadow-emerald-100 shadow-xl" : "border-slate-200 hover:border-slate-300"}`}
            >
              {plan.popular && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                  <span className="bg-emerald-500 text-white text-xs font-bold px-4 py-1 rounded-full shadow-md">Most Popular</span>
                </div>
              )}
              <div className="mb-6">
                <h3 className="text-xl font-bold text-slate-800">{plan.name}</h3>
                <p className="text-sm text-slate-400 mt-1">{plan.tagline}</p>
                <div className="mt-4 flex items-end gap-1">
                  <span className="text-5xl font-black text-slate-900">${annual ? plan.annual : plan.monthly}</span>
                  <span className="text-slate-400 text-sm mb-1.5">/month</span>
                </div>
                {annual && <p className="text-xs text-emerald-600 font-medium mt-1">Billed annually — save ${(plan.monthly - plan.annual) * 12}/yr</p>}
              </div>
              <ul className="space-y-3 flex-1 mb-8">
                {plan.features.map((f, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm">
                    {f.included ? <Check className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" /> : <X className="w-4 h-4 text-slate-300 mt-0.5 shrink-0" />}
                    <span className={f.included ? "text-slate-700" : "text-slate-400"}>{f.text}</span>
                  </li>
                ))}
              </ul>
              <button onClick={() => navigate("/Dashboard")} className={`w-full py-3 rounded-xl text-sm font-bold transition-all ${plan.btnClass}`}>
                Start Free Trial
              </button>
            </div>
          ))}
        </div>
        <p className="text-center text-sm text-slate-400 mt-8">All plans include a 14-day free trial. No credit card required.</p>
      </div>

      {/* Use Cases */}
      <div className="bg-slate-50 py-16">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-black text-slate-900 mb-3">Built for every enterprise</h2>
            <p className="text-slate-500 max-w-xl mx-auto">The same six layers — People, Products, Addresses, Services, Tasks, Transactions — power every type of organization.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {USE_CASES.map((uc) => (
              <div key={uc.label} className="bg-white rounded-2xl p-6 border border-slate-200 hover:shadow-md transition-shadow">
                <div className="text-4xl mb-3">{uc.emoji}</div>
                <h3 className="font-bold text-slate-800 text-base mb-1">{uc.label}</h3>
                <p className="text-sm text-slate-500">{uc.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* How it works */}
      <div className="max-w-4xl mx-auto px-6 py-16 text-center">
        <h2 className="text-3xl font-black text-slate-900 mb-4">The same way Windows runs any software,<br />Newsconseen runs any enterprise.</h2>
        <p className="text-slate-500 text-lg mb-10">When you sign up, tell us your enterprise type. The platform adapts its language, task types, and suggested workflows to match your world.</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {[
            { emoji: "🏥", from: "Clients + Caregivers", to: "Care records + Medication rounds" },
            { emoji: "🏫", from: "Students + Teachers", to: "Lessons + Assessments" },
            { emoji: "🌾", from: "Animals + Farm Hands", to: "Feeding rounds + Health checks" },
          ].map((ex) => (
            <div key={ex.emoji} className="bg-slate-50 rounded-2xl p-5 border border-slate-200">
              <div className="text-3xl mb-2">{ex.emoji}</div>
              <p className="text-sm font-semibold text-slate-700 mb-1">{ex.from}</p>
              <p className="text-xs text-slate-400">→ {ex.to}</p>
            </div>
          ))}
        </div>
      </div>

      {/* FAQ */}
      <div className="max-w-2xl mx-auto px-6 pb-20">
        <h2 className="text-2xl font-bold text-slate-800 text-center mb-8">Frequently asked questions</h2>
        <div className="space-y-3">
          {FAQS.map((faq, i) => <FaqItem key={i} {...faq} />)}
        </div>
        <p className="text-center text-sm text-slate-400 mt-8">
          Questions? Contact us at{" "}
          <a href="mailto:support@newsconseen.com" className="text-emerald-600 hover:underline">support@newsconseen.com</a>
        </p>
      </div>

      {/* Footer */}
      <div className="border-t border-slate-100 py-8 text-center text-xs text-slate-400">
        © {new Date().getFullYear()} Newsconseen — The universal enterprise operating system.
      </div>
    </div>
  );
}