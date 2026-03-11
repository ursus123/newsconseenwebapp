import React, { useState } from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Building2, Users, Package, ClipboardList, CheckCircle2, ChevronRight, Sparkles, X } from "lucide-react";
import { Card } from "@/components/ui/card";

const STEPS = [
  {
    id: "enterprise",
    icon: Building2,
    color: "purple",
    title: "Create your first Enterprise",
    description: "An enterprise is the core entity — a business, client, or organisation you manage.",
    cta: "Go to Enterprises →",
    page: "Enterprises",
  },
  {
    id: "person",
    icon: Users,
    color: "blue",
    title: "Add your first Person",
    description: "People are staff, contractors, clients or any individual connected to your operations.",
    cta: "Go to People →",
    page: "People",
  },
  {
    id: "product",
    icon: Package,
    color: "amber",
    title: "Add a Service or Product",
    description: "Catalogue the items and services your enterprise delivers or consumes.",
    cta: "Go to Products →",
    page: "Products",
  },
  {
    id: "task",
    icon: ClipboardList,
    color: "emerald",
    title: "Create your first Task",
    description: "Tasks drive daily operations — assign work, track progress and trigger transactions.",
    cta: "Go to Tasks →",
    page: "Tasks",
  },
];

const COLOR_MAP = {
  purple: { bg: "bg-purple-50", icon: "text-purple-500", ring: "ring-purple-200", bar: "bg-purple-400" },
  blue:   { bg: "bg-blue-50",   icon: "text-blue-500",   ring: "ring-blue-200",   bar: "bg-blue-400"   },
  amber:  { bg: "bg-amber-50",  icon: "text-amber-500",  ring: "ring-amber-200",  bar: "bg-amber-400"  },
  emerald:{ bg: "bg-emerald-50",icon: "text-emerald-500",ring: "ring-emerald-200",bar: "bg-emerald-400"},
};

export default function OnboardingChecklist({ done = {} }) {
  const [dismissed, setDismissed] = useState(false);

  const completedIds = STEPS.filter((s) => done[s.id]).map((s) => s.id);
  const allDone = completedIds.length === STEPS.length;

  if (dismissed || allDone) return null;

  const pct = Math.round((completedIds.length / STEPS.length) * 100);

  return (
    <Card className="border border-indigo-100 bg-gradient-to-br from-white to-indigo-50/40 p-6 relative overflow-hidden">
      {/* dismiss */}
      <button
        onClick={() => setDismissed(true)}
        className="absolute top-4 right-4 text-slate-300 hover:text-slate-500 transition-colors"
        title="Dismiss"
      >
        <X className="w-4 h-4" />
      </button>

      {/* Header */}
      <div className="flex items-center gap-3 mb-1">
        <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center">
          <Sparkles className="w-4 h-4 text-indigo-500" />
        </div>
        <div>
          <h2 className="text-base font-bold text-slate-800">Getting started</h2>
          <p className="text-xs text-slate-400">Complete these steps to set up your workspace</p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mt-4 mb-5">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs text-slate-500 font-medium">{completedIds.length} of {STEPS.length} completed</span>
          <span className="text-xs font-bold text-indigo-500">{pct}%</span>
        </div>
        <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-indigo-400 rounded-full transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Steps */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {STEPS.map((step, idx) => {
          const isDone = !!done[step.id];
          const c = COLOR_MAP[step.color];
          const Icon = step.icon;
          return (
            <div
              key={step.id}
              className={`relative rounded-xl border p-4 flex flex-col gap-3 transition-all
                ${isDone
                  ? "bg-slate-50 border-slate-100 opacity-60"
                  : "bg-white border-slate-200 hover:border-indigo-200 hover:shadow-sm"
                }`}
            >
              {/* Step number / check */}
              <div className="flex items-start justify-between">
                <div className={`w-9 h-9 rounded-xl ${c.bg} flex items-center justify-center`}>
                  {isDone
                    ? <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                    : <Icon className={`w-5 h-5 ${c.icon}`} />
                  }
                </div>
                <span className="text-[11px] font-bold text-slate-300">0{idx + 1}</span>
              </div>

              <div className="flex-1">
                <p className={`text-sm font-semibold leading-tight ${isDone ? "line-through text-slate-400" : "text-slate-800"}`}>
                  {step.title}
                </p>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">{step.description}</p>
              </div>

              {!isDone && (
                <Link
                  to={createPageUrl(step.page)}
                  className="flex items-center gap-1 text-xs font-semibold text-indigo-500 hover:text-indigo-700 transition-colors mt-auto"
                >
                  {step.cta}
                  <ChevronRight className="w-3 h-3" />
                </Link>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}