import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import StepWorkspace from "@/components/onboarding/StepWorkspace";
import StepTeam from "@/components/onboarding/StepTeam";
import StepOfferings from "@/components/onboarding/StepOfferings";
import StepTask from "@/components/onboarding/StepTask";
import StepInvite from "@/components/onboarding/StepInvite";
import StepDone from "@/components/onboarding/StepDone";

const STEPS = [
  { label: "Workspace", time: "~2 min" },
  { label: "Team",      time: "~2 min" },
  { label: "Products",  time: "~1 min" },
  { label: "Tasks",     time: "~1 min" },
  { label: "Invite",    time: "~1 min" },
  { label: "Done",      time: "" },
];

const OPTIONAL_STEPS = [1, 2, 3, 4]; // 0-indexed

export default function Onboarding() {
  const navigate = useNavigate();
  const { refreshUser } = useAuth();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);

  // Per-step data
  const [workspaceData, setWorkspaceData] = useState({});
  const [workspaceErrors, setWorkspaceErrors] = useState({});
  const [people, setPeople] = useState([]);
  const [items, setItems] = useState([]);
  const [taskData, setTaskData] = useState({});
  const [taskErrors, setTaskErrors] = useState({});
  const [invites, setInvites] = useState([]);

  // Created entity refs
  const [createdEnterprise, setCreatedEnterprise] = useState(null);

  useEffect(() => {
    base44.auth.me().then((u) => {
      setCurrentUser(u);
      setWorkspaceData((prev) => ({ ...prev, full_name: prev.full_name || u.full_name || "" }));
    }).catch(() => {});
  }, []);

  // ── Validation ─────────────────────────────────────────────────────────────
  const validateWorkspace = () => {
    const err = {};
    if (!workspaceData.org_name?.trim()) err.org_name = "Organization name is required";
    if (!workspaceData.industry) err.industry = "Please select an industry";
    if (!workspaceData.country) err.country = "Please select a country";
    if (!workspaceData.full_name?.trim()) err.full_name = "Your name is required";
    setWorkspaceErrors(err);
    return Object.keys(err).length === 0;
  };

  const validateTask = () => {
    const err = {};
    if (!taskData.title?.trim()) err.title = "Task title is required";
    setTaskErrors(err);
    return Object.keys(err).length === 0;
  };

  // ── Step save actions ──────────────────────────────────────────────────────
  const saveWorkspace = async () => {
    if (!validateWorkspace()) return false;
    setSaving(true);
    try {
      const trialEnd = new Date();
      trialEnd.setDate(trialEnd.getDate() + 14);
      const trialEndsAt = trialEnd.toISOString().split("T")[0];

      const enterprise = await base44.entities.Enterprise.create({
        enterprise_name: workspaceData.org_name,
        enterprise_type: workspaceData.industry,
        country: workspaceData.country,
        status: "active",
        operating_status: "open",
        subscription_tier: "professional",
        subscription_status: "trial",
        trial_ends_at: trialEndsAt,
      });
      
      // Stamp enterprise's own id as company_id
      await base44.entities.Enterprise.update(enterprise.id, {
        company_id: enterprise.id
      });
      
      // Update admin user with this company_id
      await base44.auth.updateMe({
        company_id: enterprise.id,
        full_name: workspaceData.full_name,
      });
      
      setCreatedEnterprise({ ...enterprise, company_id: enterprise.id });
      return true;
    } catch (e) {
      console.error(e);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const saveTeam = async () => {
    if (people.length === 0) return true;
    setSaving(true);
    try {
      await Promise.all(people.map((p) =>
        base44.entities.Person.create({
          first_name: p.first_name,
          last_name: p.last_name,
          primary_role: p.role,
          person_type: p.person_type,
          status: "active",
          company_id: createdEnterprise?.enterprise_name,
        })
      ));
      return true;
    } catch (e) {
      console.error(e);
      return true; // non-blocking
    } finally {
      setSaving(false);
    }
  };

  const saveOfferings = async () => {
    if (items.length === 0) return true;
    setSaving(true);
    try {
      const products = items.filter((i) => i._type === "product");
      const services = items.filter((i) => i._type === "service");
      await Promise.all([
        ...products.map((p) =>
          base44.entities.Product.create({
            name: p.name,
            item_type: p.item_type,
            stock_quantity: Number(p.stock_quantity) || 0,
            unit_price: Number(p.unit_price) || 0,
            status: "active",
            company_id: createdEnterprise?.enterprise_name,
          })
        ),
        ...services.map((s) =>
          base44.entities.Service.create({
            name: s.name,
            category: s.category,
            pricing_model: s.pricing_model,
            price: Number(s.price) || 0,
            status: "active",
          })
        ),
      ]);
      return true;
    } catch (e) {
      console.error(e);
      return true;
    } finally {
      setSaving(false);
    }
  };

  const saveTask = async () => {
    if (!taskData.title?.trim()) return true;
    if (!validateTask()) return false;
    setSaving(true);
    try {
      await base44.entities.Task.create({
        title: taskData.title,
        task_type: taskData.task_type || "other",
        assigned_to_name: taskData.assigned_to_name || "",
        due_date: taskData.due_date || undefined,
        priority: taskData.priority || "normal",
        status: "open",
        enterprise: createdEnterprise?.enterprise_name || "",
        company_id: createdEnterprise?.enterprise_name,
      });
      return true;
    } catch (e) {
      console.error(e);
      return true;
    } finally {
      setSaving(false);
    }
  };

  const saveInvites = async () => {
    if (invites.length === 0) return true;
    setSaving(true);
    try {
      await Promise.all(invites.map(async (inv) => {
        await base44.users.inviteUser(inv.email, inv.role);
        await base44.integrations.Core.SendEmail({
          to: inv.email,
          subject: `You've been invited to join ${createdEnterprise?.enterprise_name} on Newsconseen`,
          body: `${workspaceData.full_name} has invited you to join ${createdEnterprise?.enterprise_name} on Newsconseen.\n\nGet started by visiting the app and signing in with this email address.`,
        });
      }));
      return true;
    } catch (e) {
      console.error(e);
      return true;
    } finally {
      setSaving(false);
    }
  };

  // ── Navigation ─────────────────────────────────────────────────────────────
  const handleNext = async () => {
    let ok = true;
    if (step === 0) ok = await saveWorkspace();
    if (step === 1) ok = await saveTeam();
    if (step === 2) ok = await saveOfferings();
    if (step === 3) ok = await saveTask();
    if (step === 4) ok = await saveInvites();
    if (ok) setStep((s) => s + 1);
  };

  const handleSkip = () => setStep((s) => s + 1);
  const handleBack = () => setStep((s) => s - 1);

  const handleComplete = async () => {
    setCompleting(true);
    try {
      await base44.auth.updateMe({ onboarding_complete: true });
      await refreshUser();
      navigate("/Dashboard");
    } catch (e) {
      console.error(e);
      navigate("/Dashboard");
    } finally {
      setCompleting(false);
    }
  };

  const progress = ((step) / (STEPS.length - 1)) * 100;
  const timeRemaining = step <= 1 ? "~2 min remaining" : step <= 4 ? "~1 min remaining" : "";

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Top gradient bar */}
      <div className="h-1.5 bg-slate-100">
        <div
          className="h-full bg-emerald-500 transition-all duration-500 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Header */}
      <div className="flex items-center justify-center pt-8 pb-4 px-4">
        <div className="flex items-center gap-3">
          <div className="bg-emerald-500 rounded-xl w-10 h-10 flex items-center justify-center shadow-md">
            <span className="text-white font-bold text-lg">N</span>
          </div>
          <span className="text-xl font-bold text-slate-800">Newsconseen</span>
        </div>
      </div>

      {/* Progress steps */}
      <div className="flex flex-col items-center px-4 mb-6">
        <p className="text-xs text-slate-400 mb-3">
          Step {step + 1} of {STEPS.length}
          {timeRemaining && <span className="ml-2 text-emerald-500 font-medium">{timeRemaining}</span>}
        </p>
        <div className="flex items-center gap-1">
          {STEPS.map((s, i) => (
            <React.Fragment key={i}>
              <div className="flex flex-col items-center">
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all
                    ${i < step ? "bg-emerald-500 text-white" : i === step ? "bg-emerald-500 text-white ring-4 ring-emerald-100" : "bg-slate-100 text-slate-400"}`}
                >
                  {i < step ? "✓" : i + 1}
                </div>
                <span className={`text-[9px] mt-1 font-medium hidden sm:block ${i === step ? "text-emerald-600" : "text-slate-400"}`}>{s.label}</span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={`w-6 sm:w-10 h-0.5 mb-3 transition-colors ${i < step ? "bg-emerald-400" : "bg-slate-100"}`} />
              )}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Step card */}
      <div className="flex-1 flex items-start justify-center px-4 pb-10">
        <div className="w-full max-w-lg bg-white rounded-3xl shadow-xl border border-slate-100 p-8">
          {step === 0 && (
            <StepWorkspace data={workspaceData} onChange={setWorkspaceData} errors={workspaceErrors} />
          )}
          {step === 1 && (
            <StepTeam people={people} onChange={setPeople} />
          )}
          {step === 2 && (
            <StepOfferings items={items} onChange={setItems} />
          )}
          {step === 3 && (
            <StepTask data={taskData} onChange={setTaskData} errors={taskErrors} people={people} />
          )}
          {step === 4 && (
            <StepInvite invites={invites} onChange={setInvites} />
          )}
          {step === 5 && (
            <StepDone
              summary={{
                enterprise: createdEnterprise ? { name: createdEnterprise.enterprise_name, industry: workspaceData.industry, country: workspaceData.country } : null,
                people: people.length,
                items: items.length,
                tasks: taskData.title ? 1 : 0,
                invites: invites.length,
                industry: workspaceData.industry,
              }}
              onComplete={handleComplete}
              completing={completing}
            />
          )}

          {/* Navigation buttons */}
          {step < 5 && (
            <div className="mt-8 flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <button
                  onClick={handleBack}
                  disabled={step === 0 || saving}
                  className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" /> Back
                </button>

                <button
                  onClick={handleNext}
                  disabled={saving}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-sm transition-colors disabled:opacity-60"
                >
                  {saving ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      {step === 4 ? "Send & Continue" : "Continue"}
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>

              {OPTIONAL_STEPS.includes(step) && (
                <button
                  onClick={handleSkip}
                  disabled={saving}
                  className="text-center text-xs text-slate-400 hover:text-slate-600 transition-colors py-1"
                >
                  {step === 1 ? "I'll add people later →" :
                   step === 2 ? "I'll add these later →" :
                   step === 3 ? "I'll create tasks later →" :
                   "I'll invite people later →"}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <p className="text-center text-xs text-slate-400 pb-6">
        Already have an account?{" "}
        <button onClick={() => base44.auth.redirectToLogin()} className="text-emerald-600 hover:underline font-medium">Sign in</button>
      </p>
    </div>
  );
}