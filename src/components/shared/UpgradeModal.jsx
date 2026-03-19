import React from "react";
import { useNavigate } from "react-router-dom";
import { X, Zap, Check } from "lucide-react";
import { PLAN_LABELS, PLAN_PRICES } from "@/hooks/usePlanLimits";

const PLAN_FEATURES = {
  starter:      ["1 enterprise", "Up to 5 users", "People, Tasks, Transactions", "Basic dashboards", "CSV/Excel import"],
  professional: ["Up to 5 enterprises", "Up to 20 users", "Full analytics + QueryBuilder", "Superset BI dashboards", "Priority support"],
  consultant:   ["Unlimited enterprises", "Unlimited users", "White label options", "API access", "Dedicated support"],
};

const PLANS = ["starter", "professional", "consultant"];

export default function UpgradeModal({ open, onClose, reason, currentTier = "starter" }) {
  const navigate = useNavigate();
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Zap className="w-5 h-5 text-emerald-500" />
              <h2 className="text-lg font-bold text-slate-800">Upgrade your plan</h2>
            </div>
            {reason && <p className="text-sm text-slate-500">{reason}</p>}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors">
            <X className="w-4 h-4 text-slate-400" />
          </button>
        </div>

        {/* Current plan badge */}
        <div className="px-6 pt-4 pb-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 text-slate-600 text-xs font-semibold">
            Current plan: {PLAN_LABELS[currentTier]}
          </span>
        </div>

        {/* Plan cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-6 pt-3">
          {PLANS.map((plan) => {
            const isCurrent = plan === currentTier;
            const isPopular = plan === "professional";
            const price = PLAN_PRICES[plan];
            return (
              <div
                key={plan}
                className={`rounded-xl border-2 p-4 flex flex-col transition-all
                  ${isCurrent ? "border-slate-200 bg-slate-50" : isPopular ? "border-emerald-400 bg-emerald-50" : "border-slate-200 bg-white hover:border-slate-300"}`}
              >
                {isPopular && !isCurrent && (
                  <span className="self-start text-[10px] font-bold bg-emerald-500 text-white px-2 py-0.5 rounded-full mb-2">POPULAR</span>
                )}
                <p className="font-bold text-slate-800">{PLAN_LABELS[plan]}</p>
                <p className="text-2xl font-black text-slate-900 mt-1">${price.monthly}<span className="text-sm font-normal text-slate-400">/mo</span></p>
                <ul className="mt-3 space-y-1.5 flex-1">
                  {PLAN_FEATURES[plan].map((f) => (
                    <li key={f} className="flex items-start gap-1.5 text-xs text-slate-600">
                      <Check className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => { onClose(); navigate("/Billing"); }}
                  disabled={isCurrent}
                  className={`mt-4 w-full py-2 rounded-lg text-sm font-semibold transition-colors
                    ${isCurrent
                      ? "bg-slate-200 text-slate-400 cursor-default"
                      : isPopular
                      ? "bg-emerald-500 hover:bg-emerald-600 text-white"
                      : "bg-slate-800 hover:bg-slate-700 text-white"}`}
                >
                  {isCurrent ? "Current Plan" : `Upgrade to ${PLAN_LABELS[plan]}`}
                </button>
              </div>
            );
          })}
        </div>

        <div className="px-6 pb-6 text-center">
          <button onClick={onClose} className="text-xs text-slate-400 hover:text-slate-600 transition-colors underline">
            Maybe later
          </button>
        </div>
      </div>
    </div>
  );
}