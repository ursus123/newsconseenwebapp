import React, { useEffect, useRef } from "react";
import { CheckCircle2, ArrowRight } from "lucide-react";
import { getTermsFromEnterpriseType } from "@/config/enterpriseTerminology";

const NEXT_STEPS_BY_CATEGORY = {
  healthcare: [
    "Set up medication administration",
    "Import your staff and client list",
    "Configure your care services",
  ],
  education: [
    "Import your teaching staff and students",
    "Add your courses and programs",
    "Set up attendance tracking",
  ],
  community: [
    "Add your leaders and members",
    "Set up your programs and ministries",
    "Record your first contribution",
  ],
  agriculture: [
    "Add your animals or crop units",
    "Set up feeding and care schedules",
    "Record your first farm transaction",
  ],
  business: [
    "Import your products and inventory",
    "Create your first transaction",
    "Explore your analytics dashboard",
  ],
  nonprofit: [
    "Add your staff and beneficiaries",
    "Set up your programs",
    "Record your first grant or donation",
  ],
  government: [
    "Add your department staff",
    "Set up your public services",
    "Record your first budget item",
  ],
  other: [
    "Add your team members",
    "Create your first task",
    "Explore your analytics dashboard",
  ],
};

const CATEGORY_MAP = {
  healthcare: "healthcare", home_health: "healthcare", residential_care: "healthcare",
  education: "education", school: "education", university: "education", training: "education",
  community: "community", faith: "community", church: "community", nonprofit: "nonprofit",
  agriculture: "agriculture", farm: "agriculture", livestock: "agriculture",
  retail: "business", consulting: "business", technology: "business",
  manufacturing: "business", logistics: "business", hospitality: "business",
  government: "government", other: "other",
};

const DONE_MESSAGES = {
  healthcare:  "manage your care team, track medication rounds, and measure client outcomes",
  education:   "manage your teaching staff, track student activities, and measure learning outcomes",
  community:   "manage your volunteers, track programs, and grow your community",
  agriculture: "manage your farm team, track animal health, and record farm transactions",
  business:    "manage your team, track tasks, and measure business performance",
  nonprofit:   "manage your staff, track programs, and record donations",
  government:  "manage your department, track cases, and measure service delivery",
  other:       "manage your people, track activities, and measure your goals",
};

function Confetti() {
  const ref = useRef(null);
  useEffect(() => {
    const colors = ["#10b981", "#34d399", "#6ee7b7", "#a7f3d0", "#f59e0b", "#fcd34d"];
    const pieces = [];
    for (let i = 0; i < 60; i++) {
      const el = document.createElement("div");
      el.style.cssText = `
        position:absolute;width:8px;height:8px;border-radius:2px;
        background:${colors[i % colors.length]};
        left:${Math.random() * 100}%;top:-10px;
        animation:confettiFall ${1.5 + Math.random() * 2}s linear ${Math.random()}s forwards;
        transform:rotate(${Math.random() * 360}deg);
      `;
      ref.current?.appendChild(el);
      pieces.push(el);
    }
    return () => pieces.forEach((p) => p.remove());
  }, []);
  return (
    <>
      <style>{`@keyframes confettiFall { to { transform: translateY(400px) rotate(720deg); opacity: 0; } }`}</style>
      <div ref={ref} className="absolute inset-0 overflow-hidden pointer-events-none" />
    </>
  );
}

export default function StepDone({ summary, onComplete, completing }) {
  const { enterprise, people, items, tasks, invites, industry } = summary;
  const category = CATEGORY_MAP[industry] || "other";
  const nextSteps = NEXT_STEPS_BY_CATEGORY[category] || NEXT_STEPS_BY_CATEGORY.other;
  const doneMsg = DONE_MESSAGES[category] || DONE_MESSAGES.other;
  const enterpriseName = enterprise?.name || "Your enterprise";

  return (
    <div className="space-y-5 relative">
      <Confetti />
      <div className="text-center mb-6">
        <div className="text-6xl mb-3">🎉</div>
        <h2 className="text-2xl font-black text-slate-800">{enterpriseName} is ready.</h2>
        <p className="text-slate-500 text-sm mt-2 leading-relaxed max-w-xs mx-auto">
          You can now {doneMsg} — all in one place.
        </p>
      </div>

      <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 space-y-2">
        {enterprise && (
          <div className="flex items-center gap-2 text-sm">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
            <span className="text-slate-700"><span className="font-semibold">Enterprise:</span> {enterprise.name}</span>
          </div>
        )}
        <div className="flex items-center gap-2 text-sm">
          <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
          <span className="text-slate-700"><span className="font-semibold">{people}</span> people added</span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
          <span className="text-slate-700"><span className="font-semibold">{items}</span> products/services added</span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
          <span className="text-slate-700"><span className="font-semibold">{tasks}</span> tasks created</span>
        </div>
        {invites > 0 && (
          <div className="flex items-center gap-2 text-sm">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
            <span className="text-slate-700"><span className="font-semibold">{invites}</span> invites sent</span>
          </div>
        )}
      </div>

      <div>
        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Recommended Next Steps</p>
        <div className="space-y-2">
          {nextSteps.map((step, i) => (
            <div key={i} className="flex items-center gap-3 bg-slate-50 rounded-xl px-4 py-3 border border-slate-100">
              <div className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold flex items-center justify-center shrink-0">{i + 1}</div>
              <span className="text-sm text-slate-700">{step}</span>
            </div>
          ))}
        </div>
      </div>

      <button
        onClick={onComplete}
        disabled={completing}
        className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-base transition-colors disabled:opacity-60"
      >
        {completing ? (
          <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
        ) : (
          <>Enter {enterpriseName} <ArrowRight className="w-5 h-5" /></>
        )}
      </button>
    </div>
  );
}