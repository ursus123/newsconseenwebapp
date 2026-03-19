import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { X, Zap } from "lucide-react";

function getDaysRemaining(trialEndsAt) {
  if (!trialEndsAt) return null;
  const end = new Date(trialEndsAt);
  end.setHours(23, 59, 59, 999);
  const now = new Date();
  const diff = Math.ceil((end - now) / (1000 * 60 * 60 * 24));
  return diff;
}

function getBannerStyle(days) {
  if (days === null) return null;
  if (days <= 0) return { bg: "bg-red-600", text: "text-white", btn: "bg-white text-red-600 hover:bg-red-50" };
  if (days <= 3) return { bg: "bg-red-500", text: "text-white", btn: "bg-white text-red-600 hover:bg-red-50" };
  if (days <= 7) return { bg: "bg-amber-400", text: "text-slate-900", btn: "bg-slate-900 text-white hover:bg-slate-800" };
  return { bg: "bg-emerald-500", text: "text-white", btn: "bg-white text-emerald-700 hover:bg-emerald-50" };
}

const SESSION_KEY = "trial_banner_dismissed";

export default function TrialBanner({ enterprise, userRole }) {
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const stored = sessionStorage.getItem(SESSION_KEY);
    if (stored) setDismissed(true);
  }, []);

  // Never show to super_admin
  if (userRole === "super_admin") return null;
  if (dismissed) return null;
  if (!enterprise) return null;
  if (enterprise.subscription_status !== "trial") return null;

  const days = getDaysRemaining(enterprise.trial_ends_at);
  const style = getBannerStyle(days);
  if (!style) return null;

  const dismiss = () => {
    setDismissed(true);
    sessionStorage.setItem(SESSION_KEY, "1");
  };

  return (
    <div className={`${style.bg} ${style.text} px-4 py-2.5 flex items-center justify-between gap-4 shrink-0`}>
      <div className="flex items-center gap-2 text-sm font-medium flex-1 min-w-0">
        <Zap className="w-4 h-4 shrink-0" />
        <span className="truncate">
          {days !== null && days <= 0
            ? "Your trial has expired. Add a payment method to continue."
            : `🎉 You are on a free trial — ${days} day${days === 1 ? "" : "s"} remaining. Upgrade now to keep access after your trial ends.`}
        </span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={() => navigate("/Billing")}
          className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-colors ${style.btn}`}
        >
          Upgrade Now →
        </button>
        <button onClick={dismiss} className="opacity-70 hover:opacity-100 transition-opacity">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}