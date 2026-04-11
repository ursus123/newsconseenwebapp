import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { CheckCircle2, Circle, ChevronDown, ChevronUp, X } from "lucide-react";

const STEPS = [
  {
    key: "has_person",
    label: "Add your first Contact",
    desc: "Create a person record — a client, patient, or employee.",
    entity: "Person",
    link: "/People",
  },
  {
    key: "has_enterprise",
    label: "Add your first Account",
    desc: "Create an enterprise — a company, branch, or location.",
    entity: "Enterprise",
    link: "/Enterprises",
  },
  {
    key: "has_relationship",
    label: "Link a Contact to an Account",
    desc: "Connect a person to an enterprise in Relationships.",
    entity: "Relationship",
    link: "/Relationships",
  },
  {
    key: "has_task",
    label: "Create your first Task",
    desc: "Log a call, visit, or follow-up activity.",
    entity: "Task",
    link: "/Tasks",
  },
  {
    key: "has_transaction",
    label: "Record your first Transaction",
    desc: "Log revenue, an expense, or a stock movement.",
    entity: "Transaction",
    link: "/Transactions",
  },
];

export default function GettingStartedChecklist() {
  const [checks, setChecks] = useState({});
  const [collapsed, setCollapsed] = useState(false);
  const [dismissed, setDismissed] = useState(() => localStorage.getItem("checklist_dismissed") === "true");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (dismissed) return;
    Promise.all([
      base44.entities.Person.list("-created_date", 1),
      base44.entities.Enterprise.list("-created_date", 1),
      base44.entities.Relationship.list("-created_date", 1),
      base44.entities.Task.list("-created_date", 1),
      base44.entities.Transaction.list("-created_date", 1),
    ]).then(([people, enterprises, relationships, tasks, transactions]) => {
      setChecks({
        has_person: people.length > 0,
        has_enterprise: enterprises.length > 0,
        has_relationship: relationships.length > 0,
        has_task: tasks.length > 0,
        has_transaction: transactions.length > 0,
      });
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [dismissed]);

  if (dismissed) return null;

  const completed = STEPS.filter((s) => checks[s.key]).length;
  const allDone = completed === STEPS.length;

  const handleDismiss = () => {
    localStorage.setItem("checklist_dismissed", "true");
    setDismissed(true);
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center">
            <span className="text-emerald-600 text-sm font-bold">{completed}/{STEPS.length}</span>
          </div>
          <div>
            <h3 className="font-semibold text-slate-800 text-sm">Getting Started</h3>
            <div className="w-32 h-1.5 bg-slate-100 rounded-full mt-1">
              <div
                className="h-1.5 bg-emerald-500 rounded-full transition-all duration-500"
                style={{ width: `${(completed / STEPS.length) * 100}%` }}
              />
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setCollapsed(!collapsed)} className="text-slate-400 hover:text-slate-600 transition-colors p-1">
            {collapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </button>
          <button onClick={handleDismiss} className="text-slate-300 hover:text-slate-500 transition-colors p-1">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {!collapsed && (
        <div className="divide-y divide-slate-50">
          {STEPS.map((step) => {
            const done = checks[step.key];
            return (
              <a
                key={step.key}
                href={step.link}
                className={`flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50 transition-colors ${done ? "opacity-60" : ""}`}
              >
                {done ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                ) : (
                  <Circle className="w-5 h-5 text-slate-300 shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${done ? "line-through text-slate-400" : "text-slate-700"}`}>
                    {step.label}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">{step.desc}</p>
                </div>
                {!done && (
                  <span className="text-xs text-emerald-600 font-semibold shrink-0">Go →</span>
                )}
              </a>
            );
          })}
        </div>
      )}

      {allDone && !collapsed && (
        <div className="px-5 py-3 bg-emerald-50 border-t border-emerald-100 text-center">
          <p className="text-sm text-emerald-700 font-medium">🎉 You're all set! Great work getting started.</p>
          <button onClick={handleDismiss} className="text-xs text-emerald-500 mt-0.5 underline">Dismiss this card</button>
        </div>
      )}
    </div>
  );
}