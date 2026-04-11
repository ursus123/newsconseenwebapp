import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { CheckCircle2, Building2, Users, Target, ChevronRight, ChevronLeft } from "lucide-react";

const INDUSTRIES = [
  { value: "crm", label: "Sales / CRM", icon: "💼", desc: "Track deals, contacts, and pipelines" },
  { value: "healthcare", label: "Healthcare", icon: "🏥", desc: "Manage patients, clinics, and care" },
  { value: "education", label: "Education", icon: "🎓", desc: "Students, classes, and attendance" },
  { value: "logistics", label: "Logistics", icon: "🚚", desc: "Deliveries, routes, and inventory" },
  { value: "ngo", label: "NGO / Nonprofit", icon: "🌍", desc: "Members, programs, and donations" },
  { value: "other", label: "Other", icon: "⚙️", desc: "General business operations" },
];

const PEOPLE_LABELS = [
  { value: "Clients", label: "Clients" },
  { value: "Patients", label: "Patients" },
  { value: "Students", label: "Students" },
  { value: "Members", label: "Members" },
  { value: "Contacts", label: "Contacts" },
  { value: "People", label: "People (default)" },
];

export default function SetupWizard({ onComplete }) {
  const [step, setStep] = useState(0);
  const [industry, setIndustry] = useState("");
  const [peopleLabel, setPeopleLabel] = useState("");
  const [weekGoal, setWeekGoal] = useState("");
  const [saving, setSaving] = useState(false);

  const steps = [
    { title: "What's your industry?", subtitle: "We'll personalize your workspace" },
    { title: "What do you call your main people?", subtitle: "This sets labels across the app" },
    { title: "What's your main goal this week?", subtitle: "We'll highlight what matters most" },
  ];

  const handleFinish = async () => {
    setSaving(true);
    try {
      await base44.auth.updateMe({
        setup_complete: true,
        industry_mode: industry,
        people_label: peopleLabel || "People",
        week_goal: weekGoal,
      });
      onComplete({ industry_mode: industry, people_label: peopleLabel || "People", week_goal: weekGoal });
    } catch (e) {
      console.error(e);
    }
    setSaving(false);
  };

  return (
    <Dialog open>
      <DialogContent className="max-w-lg p-0 overflow-hidden rounded-2xl" hideClose>
        {/* Progress */}
        <div className="flex gap-1 p-6 pb-0">
          {steps.map((_, i) => (
            <div key={i} className={`h-1.5 flex-1 rounded-full transition-all ${i <= step ? "bg-emerald-500" : "bg-slate-200"}`} />
          ))}
        </div>

        <div className="px-8 pt-4 pb-2">
          <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wide">Step {step + 1} of 3</p>
          <h2 className="text-xl font-bold text-slate-800 mt-1">{steps[step].title}</h2>
          <p className="text-sm text-slate-500 mt-0.5">{steps[step].subtitle}</p>
        </div>

        <div className="px-8 py-4 min-h-[240px]">
          {step === 0 && (
            <div className="grid grid-cols-2 gap-3">
              {INDUSTRIES.map((ind) => (
                <button
                  key={ind.value}
                  onClick={() => setIndustry(ind.value)}
                  className={`text-left p-4 rounded-xl border-2 transition-all ${
                    industry === ind.value
                      ? "border-emerald-500 bg-emerald-50"
                      : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  <span className="text-2xl">{ind.icon}</span>
                  <p className="font-semibold text-slate-800 text-sm mt-1.5">{ind.label}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{ind.desc}</p>
                </button>
              ))}
            </div>
          )}

          {step === 1 && (
            <div className="grid grid-cols-2 gap-3">
              {PEOPLE_LABELS.map((pl) => (
                <button
                  key={pl.value}
                  onClick={() => setPeopleLabel(pl.value)}
                  className={`flex items-center gap-3 p-4 rounded-xl border-2 transition-all ${
                    peopleLabel === pl.value
                      ? "border-emerald-500 bg-emerald-50"
                      : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  <Users className="w-5 h-5 text-slate-500 shrink-0" />
                  <span className="font-semibold text-slate-800 text-sm">{pl.label}</span>
                </button>
              ))}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3">
                {[
                  "Onboard 5 new clients",
                  "Follow up on pending tasks",
                  "Review inventory levels",
                  "Set up my team",
                ].map((goal) => (
                  <button
                    key={goal}
                    onClick={() => setWeekGoal(goal)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-left transition-all ${
                      weekGoal === goal
                        ? "border-emerald-500 bg-emerald-50"
                        : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                    }`}
                  >
                    <Target className="w-4 h-4 text-slate-400 shrink-0" />
                    <span className="text-sm font-medium text-slate-700">{goal}</span>
                  </button>
                ))}
              </div>
              <input
                type="text"
                placeholder="Or type your own goal..."
                value={weekGoal}
                onChange={(e) => setWeekGoal(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400"
              />
            </div>
          )}
        </div>

        <div className="flex items-center justify-between px-8 py-5 border-t border-slate-100 bg-slate-50">
          {step > 0 ? (
            <Button variant="ghost" onClick={() => setStep((s) => s - 1)} className="text-slate-500">
              <ChevronLeft className="w-4 h-4 mr-1" /> Back
            </Button>
          ) : (
            <Button variant="ghost" onClick={() => { base44.auth.updateMe({ setup_complete: true }); onComplete({}); }} className="text-slate-400 text-xs">
              Skip setup
            </Button>
          )}

          {step < 2 ? (
            <Button
              onClick={() => setStep((s) => s + 1)}
              disabled={step === 0 && !industry}
              className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl px-6"
            >
              Continue <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          ) : (
            <Button
              onClick={handleFinish}
              disabled={saving}
              className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl px-6"
            >
              {saving ? "Saving..." : "Finish Setup ✓"}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}