import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CreditCard, Users, Building2, AlertTriangle, CheckCircle2,
  TrendingUp, Calendar, Shield, Zap, Loader2
} from "lucide-react";
import { PLAN_LABELS, PLAN_PRICES, PLAN_LIMITS } from "@/hooks/usePlanLimits";
import UpgradeModal from "@/components/shared/UpgradeModal";
import { format, differenceInDays } from "date-fns";

const STATUS_BADGE = {
  trial:     "bg-blue-50 text-blue-700 border-blue-200",
  active:    "bg-emerald-50 text-emerald-700 border-emerald-200",
  past_due:  "bg-red-50 text-red-700 border-red-200",
  cancelled: "bg-slate-100 text-slate-500 border-slate-200",
  expired:   "bg-red-50 text-red-700 border-red-200",
};

function UsageBar({ label, used, max }) {
  const pct = max === Infinity ? 0 : Math.min((used / max) * 100, 100);
  const atLimit = max !== Infinity && used >= max;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="text-slate-600 font-medium">{label}</span>
        <span className={`text-xs font-semibold ${atLimit ? "text-red-600" : "text-slate-500"}`}>
          {used} / {max === Infinity ? "∞" : max}
        </span>
      </div>
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${atLimit ? "bg-red-500" : pct > 80 ? "bg-amber-400" : "bg-emerald-500"}`}
          style={{ width: `${max === Infinity ? 0 : pct}%` }}
        />
      </div>
      {atLimit && (
        <p className="text-xs text-red-600 font-medium">Limit reached — upgrade to add more</p>
      )}
    </div>
  );
}

function CancelDialog({ onClose, onConfirm, loading }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-red-500" />
          </div>
          <h3 className="text-lg font-bold text-slate-800">Cancel subscription?</h3>
        </div>
        <p className="text-sm text-slate-500 leading-relaxed mb-6">
          Are you sure? Your workspace will remain accessible until the end of your current billing period.
          Your data will be retained for 30 days after cancellation.
        </p>
        <div className="flex gap-3">
          <Button variant="outline" className="flex-1 rounded-xl" onClick={onClose}>Keep plan</Button>
          <Button
            className="flex-1 rounded-xl bg-red-600 hover:bg-red-700 text-white"
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Yes, cancel"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function Billing() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: currentUser = null } = useQuery({
    queryKey: ["currentUser"],
    queryFn: () => base44.auth.me(),
    staleTime: 0,
    refetchOnMount: "always",
  });
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [showCancel, setShowCancel] = useState(false);

  const companyId = currentUser?.company_id;

  const { data: enterprises = [] } = useQuery({
    queryKey: ["enterprises_billing", companyId],
    queryFn: () => base44.entities.Enterprise.filter({ enterprise_name: companyId }),
    enabled: !!companyId,
    staleTime: 0,
    refetchOnMount: "always",
  });

  const { data: users = [] } = useQuery({
    queryKey: ["users_billing", companyId],
    queryFn: () => base44.entities.User.filter({ company_id: companyId }),
    enabled: !!companyId,
    staleTime: 0,
    refetchOnMount: "always",
  });

  const { data: people = [] } = useQuery({
    queryKey: ["people_billing", companyId],
    queryFn: () => base44.entities.Person.filter({ company_id: companyId }),
    enabled: !!companyId,
    staleTime: 0,
    refetchOnMount: "always",
  });

  const { data: products = [] } = useQuery({
    queryKey: ["products_billing", companyId],
    queryFn: () => base44.entities.Product.filter({ company_id: companyId }),
    enabled: !!companyId,
    staleTime: 0,
    refetchOnMount: "always",
  });

  const { data: transactions = [] } = useQuery({
    queryKey: ["transactions_billing", companyId],
    queryFn: () => base44.entities.Transaction.filter({ company_id: companyId }),
    enabled: !!companyId,
    staleTime: 0,
    refetchOnMount: "always",
  });

  const { data: tasks = [] } = useQuery({
    queryKey: ["tasks_billing", companyId],
    queryFn: () => base44.entities.Task.filter({ company_id: companyId }),
    enabled: !!companyId,
    staleTime: 0,
    refetchOnMount: "always",
  });

  const enterprise = enterprises.find((e) => e.enterprise_name === companyId) || enterprises[0];
  const tier = enterprise?.subscription_tier || "professional";
  const status = enterprise?.subscription_status || "trial";
  const limits = PLAN_LIMITS[tier] || PLAN_LIMITS.professional;
  const price = PLAN_PRICES[tier];

  const daysRemaining = enterprise?.trial_ends_at
    ? Math.max(0, differenceInDays(new Date(enterprise.trial_ends_at), new Date()))
    : null;

  const cancelMut = useMutation({
    mutationFn: () => base44.entities.Enterprise.update(enterprise.id, { subscription_status: "cancelled" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["enterprises_billing"] });
      setShowCancel(false);
    },
  });

  if (!currentUser) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
    </div>
  );

  if (currentUser.role !== "admin" && currentUser.role !== "super_admin") {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-slate-400">
        <Shield className="w-8 h-8" />
        <p className="font-medium">Admin access required.</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
          <CreditCard className="w-6 h-6 text-emerald-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Billing & Subscription</h1>
          <p className="text-sm text-slate-400 mt-0.5">Manage your plan, usage, and payment method.</p>
        </div>
      </div>

      {/* A. Current Plan */}
      <Card className="p-6 rounded-2xl">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Current Plan</p>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-2xl font-black text-slate-800">{PLAN_LABELS[tier]}</span>
              <Badge className={`border ${STATUS_BADGE[status]}`}>
                {status.charAt(0).toUpperCase() + status.slice(1).replace("_", " ")}
              </Badge>
            </div>
            <p className="text-3xl font-black text-slate-900 mt-2">
              ${price.monthly}<span className="text-sm font-normal text-slate-400">/month</span>
            </p>
          </div>
          <Button
            onClick={() => setShowUpgrade(true)}
            className="bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl shrink-0"
          >
            <Zap className="w-4 h-4 mr-1.5" /> Change Plan
          </Button>
        </div>

        {status === "trial" && daysRemaining !== null && (
          <div className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium ${daysRemaining <= 3 ? "bg-red-50 text-red-700" : "bg-blue-50 text-blue-700"}`}>
            <Calendar className="w-4 h-4 shrink-0" />
            Trial ends {enterprise.trial_ends_at ? format(new Date(enterprise.trial_ends_at), "MMMM d, yyyy") : "soon"} — {daysRemaining} day{daysRemaining === 1 ? "" : "s"} remaining
          </div>
        )}
        {status === "active" && (
          <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-emerald-50 text-emerald-700 text-sm font-medium">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            Subscription active
          </div>
        )}
        {status === "past_due" && (
          <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-50 text-red-700 text-sm font-medium">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            Payment past due — please update your payment method
          </div>
        )}
      </Card>

      {/* B. Usage */}
      <Card className="p-6 rounded-2xl">
        <div className="flex items-center gap-2 mb-5">
          <TrendingUp className="w-4 h-4 text-slate-500" />
          <h2 className="text-sm font-semibold text-slate-700">Plan Usage</h2>
        </div>
        <div className="space-y-5">
          <UsageBar label="Enterprises" used={enterprises.length} max={limits.enterprises} />
          <UsageBar label="Users" used={users.length} max={limits.users} />
          <div className="border-t border-slate-100 pt-4">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-4">Data volume</p>
            <div className="grid grid-cols-2 gap-4">
              <UsageBar label="People" used={people.length} max={limits.people ?? Infinity} />
              <UsageBar label="Products" used={products.length} max={limits.products ?? Infinity} />
              <UsageBar label="Transactions" used={transactions.length} max={limits.transactions ?? Infinity} />
              <UsageBar label="Tasks" used={tasks.length} max={limits.tasks ?? Infinity} />
            </div>
          </div>
        </div>
        {(enterprises.length >= limits.enterprises || users.length >= limits.users) && (
          <button
            onClick={() => setShowUpgrade(true)}
            className="mt-4 text-sm text-emerald-600 font-semibold hover:underline"
          >
            Upgrade for more →
          </button>
        )}
      </Card>

      {/* C. Payment Method */}
      <Card className="p-6 rounded-2xl">
        <div className="flex items-center gap-2 mb-5">
          <CreditCard className="w-4 h-4 text-slate-500" />
          <h2 className="text-sm font-semibold text-slate-700">Payment Method</h2>
        </div>
        {enterprise?.stripe_customer_id ? (
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-7 bg-slate-800 rounded-md flex items-center justify-center">
                <CreditCard className="w-4 h-4 text-white" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-700">Card on file</p>
                <p className="text-xs text-slate-400">Managed via Stripe</p>
              </div>
            </div>
            <Button variant="outline" size="sm" className="rounded-xl" onClick={() => navigate("/Billing")}>
              Update
            </Button>
          </div>
        ) : (
          <div className="text-center py-8">
            <CreditCard className="w-8 h-8 text-slate-300 mx-auto mb-3" />
            <p className="text-sm font-medium text-slate-600 mb-1">No payment method on file</p>
            <p className="text-xs text-slate-400 mb-4">Add a payment method before your trial ends to continue access.</p>
            <Button className="bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl">
              Add Payment Method
            </Button>
          </div>
        )}
      </Card>

      {/* D. Invoice History */}
      <Card className="p-6 rounded-2xl">
        <div className="flex items-center gap-2 mb-5">
          <Calendar className="w-4 h-4 text-slate-500" />
          <h2 className="text-sm font-semibold text-slate-700">Invoice History</h2>
        </div>
        <div className="text-center py-10">
          <p className="text-sm text-slate-400">
            No invoices yet — your first invoice will appear here after your trial ends.
          </p>
        </div>
      </Card>

      {/* E. Danger Zone */}
      {status !== "cancelled" && (
        <Card className="p-6 rounded-2xl border-red-100">
          <h2 className="text-sm font-semibold text-slate-700 mb-1">Danger Zone</h2>
          <p className="text-xs text-slate-400 mb-4">Cancelling will end your subscription at the end of the current billing period.</p>
          <Button
            variant="outline"
            className="border-red-300 text-red-600 hover:bg-red-50 rounded-xl"
            onClick={() => setShowCancel(true)}
          >
            Cancel Subscription
          </Button>
        </Card>
      )}

      {/* Modals */}
      <UpgradeModal
        open={showUpgrade}
        onClose={() => setShowUpgrade(false)}
        reason="Choose a plan that fits your needs"
        currentTier={tier}
      />
      {showCancel && (
        <CancelDialog
          onClose={() => setShowCancel(false)}
          onConfirm={() => cancelMut.mutate()}
          loading={cancelMut.isPending}
        />
      )}
    </div>
  );
}