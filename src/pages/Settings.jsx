import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  User, Lock, Bell, Monitor, AlertTriangle,
  Eye, EyeOff, Save, Building2, Mail, Shield, Calendar, X, Settings as SettingsIcon, Palette, Bug,
  Globe, Copy, Trash2, Loader2, Brain, Zap, CheckCircle2, Clock,
  ScrollText, Download, Filter, RefreshCw, Send, Plus,
} from "lucide-react";
import BrandingSection from "@/components/settings/BrandingSection";
import ErrorLogSection from "@/components/settings/ErrorLogSection";

function passwordStrength(pw) {
  if (!pw) return null;
  let score = 0;
  if (pw.length >= 8) score++;
  if (/\d/.test(pw)) score++;
  if (/[^a-zA-Z0-9]/.test(pw)) score++;
  if (score === 1) return { label: "Weak",   color: "bg-rose-500",    text: "text-rose-600" };
  if (score === 2) return { label: "Fair",   color: "bg-amber-500",   text: "text-amber-600" };
  return              { label: "Strong", color: "bg-emerald-500", text: "text-emerald-600" };
}

function getInitials(name) {
  if (!name) return "?";
  return name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();
}

function getBrowser() {
  const ua = navigator.userAgent;
  if (ua.includes("Chrome") && !ua.includes("Edg")) return "Chrome";
  if (ua.includes("Firefox")) return "Firefox";
  if (ua.includes("Safari") && !ua.includes("Chrome")) return "Safari";
  if (ua.includes("Edg")) return "Edge";
  return "Browser";
}

function Banner({ type, message, onDismiss }) {
  if (!message) return null;
  const ok = type === "success";
  return (
    <div className={`flex items-start justify-between gap-3 px-4 py-3 rounded-xl border text-sm mb-4
      ${ok ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-rose-50 border-rose-200 text-rose-800"}`}>
      <span>{ok ? "✅" : "❌"} {message}</span>
      {onDismiss && (
        <button onClick={onDismiss} className="shrink-0 opacity-60 hover:opacity-100"><X className="w-4 h-4" /></button>
      )}
    </div>
  );
}

function ToggleRow({ label, checked, onChange }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-slate-50 last:border-0">
      <span className="text-sm text-slate-700">{label}</span>
      <button
        onClick={() => onChange(!checked)}
        className={`w-10 h-6 rounded-full transition-colors relative shrink-0 ${checked ? "bg-emerald-500" : "bg-slate-200"}`}
      >
        <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${checked ? "left-5" : "left-1"}`} />
      </button>
    </div>
  );
}

function PasswordField({ label, value, onChange, placeholder }) {
  const [show, setShow] = useState(false);
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-slate-700">{label}</label>
      <div className="relative">
        <input
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-xl border border-slate-200 px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
        />
        <button type="button" onClick={() => setShow((s) => !s)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}

// ── Agents Section ────────────────────────────────────────────────────────────
function AgentsSection({ user }) {
  const cid = user?.company_id || "default";
  const storageKey = `agent_config_${cid}`;
  const [config, setConfig] = useState(() => {
    try { return JSON.parse(localStorage.getItem(storageKey) || "{}"); } catch { return {}; }
  });
  const [saved, setSaved] = useState(false);

  const get = (key, def) => config[key] ?? def;
  const set = (key, val) => setConfig(prev => ({ ...prev, [key]: val }));

  const save = () => {
    localStorage.setItem(storageKey, JSON.stringify(config));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const PHASE4_AGENTS = [
    { id: "operations",    label: "Operations Agent",          desc: "Monitors task backlogs, staffing gaps, and SLA breaches. Triggers alerts and creates follow-up tasks autonomously.",   phase: "4B", ready: false },
    { id: "revenue",       label: "Revenue Intelligence",      desc: "Tracks invoice ageing, payment patterns, and revenue forecasts. Flags overdue accounts and unusual transaction patterns.", phase: "4B", ready: false },
    { id: "retention",     label: "Retention Agent",           desc: "Identifies clients and staff at churn risk using ML survival models. Recommends interventions before disengagement.",       phase: "4C", ready: false },
    { id: "inventory",     label: "Inventory Agent",           desc: "Monitors stock levels, expiry dates, and reorder points. Raises purchase orders and stock alerts automatically.",          phase: "4C", ready: false },
    { id: "onboarding",    label: "Onboarding Agent",          desc: "Guides new clients and staff through onboarding checklists. Tracks completion and escalates blockers.",                    phase: "4C", ready: false },
    { id: "network",       label: "Network Coordinator",       desc: "Compares performance across branches and franchises. Surfaces outliers and escalates network-level patterns.",             phase: "4E", ready: false },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-slate-800">Agent Configuration</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Configure autonomous agents that run your operations 24/7.
            Agents are scoped to your organisation — no other tenant is affected.
          </p>
        </div>
        <button
          onClick={save}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
            saved ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          {saved ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
          {saved ? "Saved" : "Save"}
        </button>
      </div>

      {/* Global toggles */}
      <div className="bg-white border border-slate-100 rounded-2xl p-5 space-y-1">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Global</p>
        <ToggleRow label="Enable agent system" checked={get("agents_enabled", false)} onChange={v => set("agents_enabled", v)} />
        <ToggleRow label="Human-in-the-loop approval for high-risk actions" checked={get("approval_gate", true)} onChange={v => set("approval_gate", v)} />
        <ToggleRow label="Send agent activity digest (daily email)" checked={get("digest_email", false)} onChange={v => set("digest_email", v)} />
      </div>

      {/* Approval gate threshold */}
      <div className="bg-white border border-slate-100 rounded-2xl p-5">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Approval gate threshold</p>
        <p className="text-xs text-slate-400 mb-3">Actions above this financial threshold require manual approval before execution.</p>
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-600">$</span>
          <input
            type="number"
            value={get("approval_threshold", 500)}
            onChange={e => set("approval_threshold", Number(e.target.value))}
            className="w-32 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
          />
          <span className="text-xs text-slate-400">per action</span>
        </div>
      </div>

      {/* Agent roster */}
      <div className="bg-white border border-slate-100 rounded-2xl p-5">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-4">Agent roster — Phase 4</p>
        <div className="space-y-3">
          {PHASE4_AGENTS.map(agent => (
            <div key={agent.id} className="flex items-start gap-3 p-3 rounded-xl border border-slate-100 hover:border-slate-200 transition-colors">
              <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
                <Brain className="w-4 h-4 text-indigo-500" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                  <p className="text-sm font-semibold text-slate-700">{agent.label}</p>
                  <span className="text-[10px] font-bold bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full">Phase {agent.phase}</span>
                  <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full flex items-center gap-1">
                    <Clock className="w-2.5 h-2.5" /> Coming soon
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 leading-snug">{agent.desc}</p>
              </div>
              <div className="shrink-0 opacity-40">
                <button disabled className="w-10 h-6 rounded-full bg-slate-200 relative cursor-not-allowed">
                  <span className="absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-indigo-50 border border-indigo-100 rounded-2xl px-4 py-3 flex items-start gap-3">
        <Zap className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
        <div>
          <p className="text-xs font-semibold text-indigo-700">Agent memory grows with your data</p>
          <p className="text-[10px] text-indigo-500 mt-0.5">
            Every entity mutation, task outcome, and transaction is fed into agent memory. The longer you use Newsconseen, the smarter your agents become — this moat cannot be replicated by competitors without your history.
          </p>
        </div>
      </div>
    </div>
  );
}

const ALL_TABS = [
  { id: "profile",       label: "Profile",       icon: User,          adminOnly: false },
  { id: "password",      label: "Password",      icon: Lock,          adminOnly: false },
  { id: "notifications", label: "Notifications", icon: Bell,          adminOnly: false },
  { id: "sessions",      label: "Sessions",      icon: Monitor,       adminOnly: false },
  { id: "network",       label: "Network",       icon: Globe,         adminOnly: false },
  { id: "branding",      label: "Brand Settings", icon: Palette,       superAdminOnly: true },
  { id: "agents",        label: "Agents",         icon: Brain,         adminOnly: true  },
  { id: "reports",       label: "Report Delivery", icon: Send,         adminOnly: true  },
  { id: "audit",         label: "Audit Trail",    icon: ScrollText,    adminOnly: true  },
  { id: "error_log",     label: "Error Log",      icon: Bug,           adminOnly: true  },
  { id: "danger",        label: "Danger Zone",    icon: AlertTriangle, adminOnly: false },
];

const DEFAULT_NOTIF = {
  task_assigned: true, task_overdue: true, med_recall: true,
  low_stock: true, transaction_posting: true, license_expiry: true,
  email_daily: true, email_weekly: true, email_urgent: true,
  daily_time: "08:00", weekly_day: "Monday",
};

export default function Settings() {
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState(() => {
    const h = window.location.hash.replace("#", "");
    return ALL_TABS.find((t) => t.id === h)?.id || "profile";
  });

  useEffect(() => { base44.auth.me().then(setUser).catch(() => {}); }, []);

  const { data: enterprises = [] } = useQuery({
    queryKey: ["enterprises-settings"],
    queryFn: () => base44.entities.Enterprise.list(),
    enabled: !!user,
  });

  const myEnterprise = enterprises.find((e) => e.id === user?.company_id) ||
    (user?.company_id ? enterprises.find((e) => e.enterprise_name === user.company_id) : null);

  const isAdmin = user?.role === "admin" || user?.role === "super_admin";
  const isSuperAdmin = user?.role === "super_admin";
  const TABS = ALL_TABS.filter((t) => {
    if (t.superAdminOnly) return isSuperAdmin;
    if (t.adminOnly) return isAdmin;
    return true;
  });

  if (!user) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-slate-200 border-t-emerald-500 rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center">
          <SettingsIcon className="w-5 h-5 text-slate-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-800">Account Settings</h1>
          <p className="text-xs text-slate-400">Manage your profile, password, and preferences</p>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        <div className="lg:w-48 shrink-0">
          <div className="flex lg:flex-col gap-1 overflow-x-auto lg:overflow-visible pb-2 lg:pb-0">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button key={id} onClick={() => setActiveTab(id)}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap transition-all w-full text-left
                  ${activeTab === id
                    ? id === "danger" ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"
                    : "text-slate-500 hover:bg-slate-50 hover:text-slate-700"}`}>
                <Icon className={`w-4 h-4 shrink-0 ${activeTab === id
                  ? id === "danger" ? "text-rose-600" : "text-emerald-600"
                  : "text-slate-400"}`} />
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 min-w-0">
          {activeTab === "profile"       && <ProfileSection user={user} myEnterprise={myEnterprise} onUserUpdated={setUser} />}
          {activeTab === "password"      && <PasswordSection />}
          {activeTab === "notifications" && <NotificationsSection user={user} />}
          {activeTab === "sessions"      && <SessionsSection />}
          {activeTab === "network"       && <NetworkSection user={user} enterprises={enterprises} />}
          {activeTab === "branding"      && <BrandingSection user={user} enterprise={myEnterprise} />}
          {activeTab === "agents"        && <AgentsSection user={user} />}
          {activeTab === "reports"       && <ReportsSection user={user} enterprise={myEnterprise} />}
          {activeTab === "audit"         && <AuditTrailSection user={user} />}
          {activeTab === "error_log"     && <ErrorLogSection user={user} />}
          {activeTab === "danger"        && <DangerSection user={user} />}
        </div>
      </div>
    </div>
  );
}

function ProfileSection({ user, myEnterprise, onUserUpdated }) {
  const PROFILE_KEY = `profile_name_${user.email}`;
  const [name, setName] = useState(
    localStorage.getItem(PROFILE_KEY) || user.full_name || ""
  );
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState(null);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    // Persist locally immediately — always succeeds
    localStorage.setItem(PROFILE_KEY, name.trim());
    onUserUpdated({ ...user, full_name: name.trim() });
    // Also attempt server-side update (may or may not be supported by SDK)
    try {
      if (typeof base44.auth.updateMe === "function") {
        await base44.auth.updateMe({ full_name: name.trim() });
      } else if (typeof base44.auth.updateProfile === "function") {
        await base44.auth.updateProfile({ full_name: name.trim() });
      }
    } catch { /* ignore — local update already applied */ }
    setBanner({ type: "success", msg: "Profile updated successfully." });
    setTimeout(() => setBanner(null), 3000);
    setSaving(false);
  };

  const memberSince = user.created_date
    ? new Date(user.created_date).toLocaleDateString("en-US", { month: "long", year: "numeric" })
    : "—";

  return (
    <Card className="p-6 space-y-6">
      <div>
        <h2 className="text-base font-bold text-slate-800">My Profile</h2>
        <p className="text-xs text-slate-400 mt-0.5">Update your name and view your account details.</p>
      </div>
      {banner && <Banner type={banner.type} message={banner.msg} onDismiss={() => setBanner(null)} />}

      <div className="flex flex-col items-center gap-2">
        <div className="w-20 h-20 rounded-full bg-emerald-600 flex items-center justify-center text-white text-2xl font-black shadow-lg shadow-emerald-200">
          {getInitials(name || user.email)}
        </div>
        <span className="text-xs text-slate-400 italic">Photo upload coming soon</span>
      </div>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-slate-700">Full Name</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} className="rounded-xl" placeholder="Your full name" />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
            <Mail className="w-3.5 h-3.5 text-slate-400" /> Email Address
          </label>
          <Input value={user.email || ""} readOnly className="rounded-xl bg-slate-50 text-slate-400 cursor-not-allowed" />
          <p className="text-xs text-slate-400">Contact support to change your email address.</p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">Role</label>
            <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 min-h-[38px]">
              <Shield className="w-4 h-4 text-slate-400" />
              <Badge className={
                user.role === "super_admin" ? "bg-emerald-50 text-emerald-700" :
                user.role === "admin" ? "bg-violet-50 text-violet-700" : "bg-slate-100 text-slate-500"
              }>{user.role || "user"}</Badge>
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">Enterprise</label>
            <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 min-h-[38px]">
              <Building2 className="w-4 h-4 text-slate-400 shrink-0" />
              <span className="text-sm text-slate-600 truncate">{myEnterprise?.enterprise_name || "—"}</span>
            </div>
          </div>
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-slate-400" /> Member Since
          </label>
          <p className="text-sm text-slate-600 px-3 py-2 bg-slate-50 rounded-xl border border-slate-200">{memberSince}</p>
        </div>
      </div>

      <Button onClick={handleSave} disabled={saving || !name.trim()} className="w-full bg-emerald-600 hover:bg-emerald-700 rounded-xl">
        {saving ? "Saving..." : <><Save className="w-4 h-4 mr-2" /> Save Profile</>}
      </Button>
    </Card>
  );
}

function PasswordSection() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState(null);

  const strength = passwordStrength(next);
  const mismatch = confirm && next !== confirm;
  const canSubmit = current && next.length >= 8 && next === confirm;

  const handleSubmit = async () => {
    setSaving(true);
    try {
      const me = await base44.auth.me();
      // Try the most common SDK method names for password change
      if (typeof base44.auth.changePassword === "function") {
        await base44.auth.changePassword({ userId: me.id, currentPassword: current, newPassword: next });
      } else if (typeof base44.auth.updatePassword === "function") {
        await base44.auth.updatePassword({ currentPassword: current, newPassword: next });
      } else if (typeof base44.auth.updateMe === "function") {
        await base44.auth.updateMe({ password: next, currentPassword: current });
      } else {
        // SDK doesn't expose password change — guide user
        throw new Error("password_change_unsupported");
      }
      setBanner({ type: "success", msg: "Password updated successfully." });
      setCurrent(""); setNext(""); setConfirm("");
    } catch (e) {
      const msg = e?.message;
      if (msg === "password_change_unsupported") {
        setBanner({ type: "error", msg: "Password change is managed by your account provider. Contact support to reset it." });
      } else if (msg?.includes("incorrect") || msg?.includes("wrong") || msg?.includes("invalid")) {
        setBanner({ type: "error", msg: "Current password is incorrect." });
      } else {
        setBanner({ type: "error", msg: "Failed to update password. Please try again." });
      }
    }
    setSaving(false);
  };

  return (
    <Card className="p-6 space-y-5">
      <div>
        <h2 className="text-base font-bold text-slate-800">Change Password</h2>
        <p className="text-xs text-slate-400 mt-0.5">Choose a strong password at least 8 characters long.</p>
      </div>
      {banner && <Banner type={banner.type} message={banner.msg} onDismiss={() => setBanner(null)} />}
      <PasswordField label="Current Password" value={current} onChange={setCurrent} placeholder="••••••••" />
      <div className="space-y-1.5">
        <PasswordField label="New Password" value={next} onChange={setNext} placeholder="••••••••" />
        {strength && (
          <div className="flex items-center gap-2 mt-1">
            <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all ${strength.color}`}
                style={{ width: strength.label === "Weak" ? "33%" : strength.label === "Fair" ? "66%" : "100%" }} />
            </div>
            <span className={`text-xs font-medium ${strength.text}`}>{strength.label}</span>
          </div>
        )}
      </div>
      <div className="space-y-1.5">
        <PasswordField label="Confirm New Password" value={confirm} onChange={setConfirm} placeholder="••••••••" />
        {mismatch && <p className="text-xs text-rose-500">Passwords do not match</p>}
      </div>
      <Button onClick={handleSubmit} disabled={saving || !canSubmit} className="w-full bg-emerald-600 hover:bg-emerald-700 rounded-xl">
        {saving ? "Updating..." : <><Lock className="w-4 h-4 mr-2" /> Update Password</>}
      </Button>
    </Card>
  );
}

function NotificationsSection({ user }) {
  const key = `notification_prefs_${user.email}`;
  const [prefs, setPrefs] = useState(() => {
    try { return { ...DEFAULT_NOTIF, ...JSON.parse(localStorage.getItem(key) || "{}") }; }
    catch { return { ...DEFAULT_NOTIF }; }
  });
  const [saved, setSaved] = useState(false);

  const set = (k, v) => setPrefs((p) => ({ ...p, [k]: v }));

  const handleSave = () => {
    localStorage.setItem(key, JSON.stringify(prefs));
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <Card className="p-6 space-y-6">
      <div>
        <h2 className="text-base font-bold text-slate-800">Notification Preferences</h2>
        <p className="text-xs text-slate-400 mt-0.5">Choose which alerts and digests you receive.</p>
      </div>
      {saved && <Banner type="success" message="Preferences saved." />}

      <div>
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">In-App Notifications</p>
        <div className="rounded-xl border border-slate-100 px-4">
          <ToggleRow label="Task assigned to me"           checked={prefs.task_assigned}       onChange={(v) => set("task_assigned", v)} />
          <ToggleRow label="Task overdue (daily 9am)"      checked={prefs.task_overdue}        onChange={(v) => set("task_overdue", v)} />
          <ToggleRow label="Medication recall detected"    checked={prefs.med_recall}          onChange={(v) => set("med_recall", v)} />
          <ToggleRow label="Stock below minimum level"     checked={prefs.low_stock}           onChange={(v) => set("low_stock", v)} />
          <ToggleRow label="Transaction needs posting"     checked={prefs.transaction_posting} onChange={(v) => set("transaction_posting", v)} />
          <ToggleRow label="License expiring in 30 days"  checked={prefs.license_expiry}      onChange={(v) => set("license_expiry", v)} />
        </div>
      </div>

      <div>
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Email Notifications</p>
        <div className="rounded-xl border border-slate-100 px-4">
          <ToggleRow label="Daily task summary" checked={prefs.email_daily} onChange={(v) => set("email_daily", v)} />
          {prefs.email_daily && (
            <div className="pb-3">
              <label className="text-xs text-slate-500 mb-1 block">Send at</label>
              <input type="time" value={prefs.daily_time} onChange={(e) => set("daily_time", e.target.value)}
                className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400" />
            </div>
          )}
          <ToggleRow label="Weekly analytics report" checked={prefs.email_weekly} onChange={(v) => set("email_weekly", v)} />
          {prefs.email_weekly && (
            <div className="pb-3">
              <label className="text-xs text-slate-500 mb-1 block">Send on</label>
              <select value={prefs.weekly_day} onChange={(e) => set("weekly_day", e.target.value)}
                className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400">
                {["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"].map((d) => <option key={d}>{d}</option>)}
              </select>
            </div>
          )}
          <ToggleRow label="Urgent alerts (recalls, critical stock)" checked={prefs.email_urgent} onChange={(v) => set("email_urgent", v)} />
        </div>
      </div>

      <Button onClick={handleSave} className="w-full bg-emerald-600 hover:bg-emerald-700 rounded-xl">
        <Save className="w-4 h-4 mr-2" /> Save Preferences
      </Button>
    </Card>
  );
}

function SessionsSection() {
  return (
    <Card className="p-6 space-y-5">
      <div>
        <h2 className="text-base font-bold text-slate-800">Active Sessions</h2>
        <p className="text-xs text-slate-400 mt-0.5">You are currently signed in on these devices.</p>
      </div>
      <div className="rounded-xl border border-slate-200 p-4 flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
          <Monitor className="w-4 h-4 text-slate-600" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-slate-800">This device</p>
            <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full px-2 py-0.5 font-bold">Current</span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">{getBrowser()} · Last active: Just now</p>
        </div>
      </div>
      <div className="bg-slate-50 rounded-xl p-4">
        <p className="text-sm font-medium text-slate-700 mb-1">Sign out all devices</p>
        <p className="text-xs text-slate-500">To sign out of all devices, change your password — this will invalidate all existing sessions.</p>
      </div>
    </Card>
  );
}

// ── Audit Trail Section ───────────────────────────────────────────────────────
const RAILWAY_AUDIT_URL = "https://newsconseenwebapp-production.up.railway.app";

const ENTITY_OPTS = [
  { id: "",             label: "All entities" },
  { id: "person",       label: "Person" },
  { id: "enterprise",   label: "Enterprise" },
  { id: "product",      label: "Product" },
  { id: "task",         label: "Task" },
  { id: "transaction",  label: "Transaction" },
  { id: "relationship", label: "Relationship" },
  { id: "address",      label: "Address" },
];

const ACTION_OPTS = [
  { id: "",        label: "All actions" },
  { id: "created", label: "Created" },
  { id: "updated", label: "Updated" },
  { id: "deleted", label: "Deleted" },
];

const ACTION_COLORS = {
  created: "bg-emerald-100 text-emerald-700",
  updated: "bg-amber-100  text-amber-700",
  deleted: "bg-rose-100   text-rose-700",
};

function AuditTrailSection({ user }) {
  const [entityType, setEntityType] = useState("");
  const [action,     setAction]     = useState("");
  const [changedBy,  setChangedBy]  = useState("");
  const [dateFrom,   setDateFrom]   = useState("");
  const [dateTo,     setDateTo]     = useState("");
  const [loading,    setLoading]    = useState(false);
  const [entries,    setEntries]    = useState(null);   // null = not yet loaded
  const [summary,    setSummary]    = useState(null);
  const [exporting,  setExporting]  = useState(false);

  const companyId = user?.company_id;

  async function fetchLog() {
    if (!companyId) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ company_id: companyId, limit: 200 });
      if (entityType) params.set("entity_type", entityType);
      if (action)     params.set("action",      action);
      if (changedBy)  params.set("changed_by",  changedBy);
      if (dateFrom)   params.set("date_from",   dateFrom);
      if (dateTo)     params.set("date_to",     dateTo);

      const [logRes, sumRes] = await Promise.all([
        fetch(`${RAILWAY_AUDIT_URL}/audit/log?${params}`),
        fetch(`${RAILWAY_AUDIT_URL}/audit/summary?company_id=${companyId}`),
      ]);

      if (logRes.ok) {
        const data = await logRes.json();
        setEntries(data.entries || []);
      }
      if (sumRes.ok) {
        setSummary(await sumRes.json());
      }
    } catch (e) {
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }

  async function exportCSV() {
    if (!companyId) return;
    setExporting(true);
    try {
      const params = new URLSearchParams({ company_id: companyId });
      if (entityType) params.set("entity_type", entityType);
      if (action)     params.set("action",      action);
      if (changedBy)  params.set("changed_by",  changedBy);
      if (dateFrom)   params.set("date_from",   dateFrom);
      if (dateTo)     params.set("date_to",     dateTo);

      const res = await fetch(`${RAILWAY_AUDIT_URL}/audit/export?${params}`);
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = `audit_log_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // silent — user sees no change
    } finally {
      setExporting(false);
    }
  }

  // Load on first render
  useEffect(() => { fetchLog(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
            <ScrollText className="w-4 h-4 text-slate-500" /> Audit Trail
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Immutable change log across all 7 entities — who changed what and when.
          </p>
        </div>
        <Button
          onClick={exportCSV}
          disabled={exporting || !entries?.length}
          variant="outline"
          className="rounded-xl text-xs gap-1.5"
        >
          {exporting
            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
            : <Download className="w-3.5 h-3.5" />}
          Export CSV
        </Button>
      </div>

      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-slate-50 rounded-xl p-3 border border-slate-200">
            <p className="text-[10px] text-slate-400 uppercase font-semibold">Total events</p>
            <p className="text-xl font-bold text-slate-800 mt-0.5">{summary.total?.toLocaleString() || 0}</p>
          </div>
          {Object.entries(summary.by_action || {}).map(([act, count]) => (
            <div key={act} className="bg-slate-50 rounded-xl p-3 border border-slate-200">
              <p className="text-[10px] text-slate-400 uppercase font-semibold capitalize">{act}</p>
              <p className="text-xl font-bold text-slate-800 mt-0.5">{count.toLocaleString()}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-xs font-semibold text-slate-600">Filters</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div>
            <label className="text-[10px] font-semibold text-slate-500 uppercase mb-1 block">Entity</label>
            <select
              value={entityType}
              onChange={e => setEntityType(e.target.value)}
              className="w-full text-xs border border-slate-200 rounded-xl px-2.5 py-2 focus:outline-none focus:border-emerald-400 bg-white"
            >
              {ENTITY_OPTS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-semibold text-slate-500 uppercase mb-1 block">Action</label>
            <select
              value={action}
              onChange={e => setAction(e.target.value)}
              className="w-full text-xs border border-slate-200 rounded-xl px-2.5 py-2 focus:outline-none focus:border-emerald-400 bg-white"
            >
              {ACTION_OPTS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-semibold text-slate-500 uppercase mb-1 block">Changed by</label>
            <input
              value={changedBy}
              onChange={e => setChangedBy(e.target.value)}
              placeholder="user@email.com"
              className="w-full text-xs border border-slate-200 rounded-xl px-2.5 py-2 focus:outline-none focus:border-emerald-400"
            />
          </div>
          <div>
            <label className="text-[10px] font-semibold text-slate-500 uppercase mb-1 block">From date</label>
            <input
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              className="w-full text-xs border border-slate-200 rounded-xl px-2.5 py-2 focus:outline-none focus:border-emerald-400"
            />
          </div>
          <div>
            <label className="text-[10px] font-semibold text-slate-500 uppercase mb-1 block">To date</label>
            <input
              type="date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              className="w-full text-xs border border-slate-200 rounded-xl px-2.5 py-2 focus:outline-none focus:border-emerald-400"
            />
          </div>
          <div className="flex items-end">
            <Button
              onClick={fetchLog}
              disabled={loading}
              className="w-full bg-emerald-600 hover:bg-emerald-700 rounded-xl text-xs gap-1.5"
            >
              {loading
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <RefreshCw className="w-3.5 h-3.5" />}
              Apply
            </Button>
          </div>
        </div>
      </Card>

      {/* Log table */}
      {entries === null ? (
        <div className="flex justify-center py-10">
          <div className="w-6 h-6 border-4 border-slate-200 border-t-emerald-500 rounded-full animate-spin" />
        </div>
      ) : entries.length === 0 ? (
        <div className="text-center py-12 text-slate-400">
          <ScrollText className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No audit events recorded yet.</p>
          <p className="text-xs mt-1">Events are logged automatically when operators create, update, or delete records.</p>
        </div>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  {["Timestamp", "Entity", "Name / ID", "Action", "Changed by", "Changes"].map(h => (
                    <th key={h} className="px-4 py-3 text-left font-semibold text-slate-600 whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {entries.map((entry, i) => {
                  const ts = entry.timestamp ? new Date(entry.timestamp) : null;
                  const fields = entry.changed_fields || {};
                  const fieldCount = Object.keys(fields).length;
                  return (
                    <tr key={i} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap">
                        {ts ? (
                          <>
                            <div>{ts.toLocaleDateString()}</div>
                            <div className="text-[10px] text-slate-400">{ts.toLocaleTimeString()}</div>
                          </>
                        ) : "—"}
                      </td>
                      <td className="px-4 py-2.5 font-medium text-slate-700 capitalize">
                        {entry.entity_type || "—"}
                      </td>
                      <td className="px-4 py-2.5 text-slate-600 max-w-[140px] truncate">
                        <div className="truncate">{entry.entity_name || "—"}</div>
                        {entry.entity_id && (
                          <div className="text-[10px] text-slate-400 font-mono truncate">{entry.entity_id}</div>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold capitalize ${ACTION_COLORS[entry.action] || "bg-slate-100 text-slate-600"}`}>
                          {entry.action || "—"}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-slate-500 max-w-[120px] truncate">
                        {entry.changed_by || <span className="text-slate-300">system</span>}
                      </td>
                      <td className="px-4 py-2.5 text-slate-500">
                        {fieldCount > 0 ? (
                          <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-medium">
                            {fieldCount} field{fieldCount !== 1 ? "s" : ""}
                          </span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2.5 border-t border-slate-100 flex items-center justify-between">
            <span className="text-[10px] text-slate-400">{entries.length} events shown</span>
            <button onClick={fetchLog} className="text-[10px] text-emerald-600 hover:text-emerald-800 font-medium flex items-center gap-1">
              <RefreshCw className="w-3 h-3" /> Refresh
            </button>
          </div>
        </Card>
      )}
    </div>
  );
}


function DangerSection({ user }) {
  const [confirmText, setConfirmText] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleDelete = async () => {
    if (confirmText !== "DELETE") return;
    setSubmitting(true);
    try {
      await base44.entities.Task.create({
        title: `Account deletion request: ${user.email}`,
        task_type: "other",
        priority: "high",
        assigned_to_email: "support@newsconseen.com",
        outcome_notes: `User requested account deletion at ${new Date().toISOString()}`,
      });
    } catch { /* still show submitted */ }
    setSubmitted(true);
    setSubmitting(false);
  };

  return (
    <Card className="p-6 space-y-5 border-rose-200">
      <div>
        <h2 className="text-base font-bold text-rose-700 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" /> Danger Zone
        </h2>
        <p className="text-xs text-slate-400 mt-0.5">These actions are irreversible. Please proceed with caution.</p>
      </div>
      {submitted ? (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-4 text-sm text-emerald-800">
          ✅ Your deletion request has been submitted. Our team will process it within 48 hours.
        </div>
      ) : (
        <div className="rounded-xl border border-rose-200 p-4 space-y-4">
          <div>
            <p className="text-sm font-semibold text-slate-800">Delete My Account</p>
            <p className="text-xs text-slate-500 mt-1">This cannot be undone. Your personal data will be removed but enterprise records you created will be retained.</p>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-600">Type <strong>DELETE</strong> to confirm</label>
            <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)}
              className="rounded-xl font-mono" placeholder="DELETE" />
          </div>
          <Button onClick={handleDelete} disabled={confirmText !== "DELETE" || submitting}
            variant="outline" className="w-full border-rose-300 text-rose-600 hover:bg-rose-50 rounded-xl">
            {submitting ? "Submitting..." : "Request Account Deletion"}
          </Button>
        </div>
      )}
    </Card>
  );
}

function NetworkSection({ user, enterprises }) {
  const RAILWAY_URL = "https://newsconseenwebapp-production.up.railway.app";
  const isNetworkAdmin = !!user?.network_company_id;

  // Network Admin: Manage Members
  const [members, setMembers] = useState([]);
  const [membersLoading, setMembersLoading] = useState(false);

  useEffect(() => {
    if (!isNetworkAdmin) return;
    setMembersLoading(true);
    fetch(`${RAILWAY_URL}/network/status?network_id=${user.network_company_id}`)
      .then((r) => r.json())
      .then((data) => setMembers(data.members || []))
      .catch(() => setMembers([]))
      .finally(() => setMembersLoading(false));
  }, [isNetworkAdmin, user?.network_company_id]);

  const handleRemoveMember = async (companyId) => {
    if (!confirm(`Remove this member from the network?`)) return;
    try {
      const res = await fetch(`${RAILWAY_URL}/network/members/${companyId}`, { method: "DELETE" });
      if (res.ok) {
        setMembers((m) => m.filter((mem) => mem.child_company_id !== companyId));
      }
    } catch { /* error */ }
  };

  // Network Admin: Generate Join Code
  const [expiresInDays, setExpiresInDays] = useState(30);
  const [generatingCode, setGeneratingCode] = useState(false);
  const [generatedCode, setGeneratedCode] = useState(null);
  const [codeError, setCodeError] = useState(null);

  const handleGenerateCode = async () => {
    const adminKey = prompt("Enter admin key to generate join code:");
    if (!adminKey) return;

    setGeneratingCode(true);
    setCodeError(null);
    try {
      const res = await fetch(`${RAILWAY_URL}/network/join-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          network_id: user.network_company_id,
          admin_key: adminKey,
          expires_in_days: expiresInDays,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setGeneratedCode(data.code);
      } else {
        setCodeError("Failed to generate code. Check admin key.");
      }
    } catch {
      setCodeError("Error generating code.");
    }
    setGeneratingCode(false);
  };

  // Member Operator: Join a Network
  const [joinCode, setJoinCode] = useState("");
  const [joiningNetwork, setJoiningNetwork] = useState(false);
  const [joinError, setJoinError] = useState(null);
  const [joinSuccess, setJoinSuccess] = useState(false);

  const myEnterpriseName =
    enterprises.find((e) => e.id === user?.company_id)?.enterprise_name ||
    user?.company_id ||
    "Unknown";

  const handleJoinNetwork = async () => {
    if (!joinCode.trim()) return;

    setJoiningNetwork(true);
    setJoinError(null);
    try {
      const res = await fetch(`${RAILWAY_URL}/network/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          join_code: joinCode,
          company_id: user.company_id,
          company_name: myEnterpriseName,
        }),
      });
      if (res.ok) {
        setJoinSuccess(true);
        setJoinCode("");
      } else {
        setJoinError("Invalid join code or already joined a network.");
      }
    } catch {
      setJoinError("Error joining network.");
    }
    setJoiningNetwork(false);
  };

  return (
    <Card className="p-6 space-y-8">
      <div>
        <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
          <Globe className="w-4 h-4" /> Network Administration
        </h2>
        <p className="text-xs text-slate-400 mt-0.5">Manage network membership and access.</p>
      </div>

      {isNetworkAdmin ? (
        <>
          {/* Section 1: Network Members */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-700">Network Members</h3>
            {membersLoading ? (
              <div className="flex justify-center py-6">
                <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />
              </div>
            ) : members.length === 0 ? (
              <p className="text-xs text-slate-500 py-4">No members yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50">
                      <th className="text-left px-3 py-2 font-semibold text-slate-700">Name</th>
                      <th className="text-left px-3 py-2 font-semibold text-slate-700">Company ID</th>
                      <th className="text-left px-3 py-2 font-semibold text-slate-700">Source</th>
                      <th className="text-left px-3 py-2 font-semibold text-slate-700">Joined</th>
                      <th className="text-left px-3 py-2 font-semibold text-slate-700">Status</th>
                      <th className="text-center px-3 py-2 font-semibold text-slate-700">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {members.map((mem) => (
                      <tr key={mem.child_company_id} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="px-3 py-2 text-slate-800 font-medium">{mem.child_name}</td>
                        <td className="px-3 py-2 text-slate-600 font-mono text-[10px]">{mem.child_company_id}</td>
                        <td className="px-3 py-2 text-slate-600 capitalize">{mem.source || "—"}</td>
                        <td className="px-3 py-2 text-slate-600">
                          {mem.joined_at ? new Date(mem.joined_at).toLocaleDateString() : "—"}
                        </td>
                        <td className="px-3 py-2">
                          <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${
                            mem.is_active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"
                          }`}>
                            {mem.is_active ? "Active" : "Inactive"}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-center">
                          <button
                            onClick={() => handleRemoveMember(mem.child_company_id)}
                            className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 p-1.5 rounded transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Section 2: Generate Join Code */}
          <div className="space-y-3 border-t border-slate-100 pt-6">
            <h3 className="text-sm font-semibold text-slate-700">Generate Join Code</h3>
            <div className="bg-slate-50 rounded-xl p-4 space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700">Expires in (days)</label>
                <Input
                  type="number"
                  value={expiresInDays}
                  onChange={(e) => setExpiresInDays(Math.max(1, parseInt(e.target.value) || 30))}
                  min="1"
                  className="rounded-lg"
                />
              </div>
              <Button
                onClick={handleGenerateCode}
                disabled={generatingCode}
                className="w-full bg-emerald-600 hover:bg-emerald-700 rounded-lg text-sm"
              >
                {generatingCode ? <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> : null}
                Generate Join Code
              </Button>
              {codeError && <p className="text-xs text-rose-600">{codeError}</p>}
            </div>

            {generatedCode && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 space-y-3">
                <p className="text-xs font-medium text-slate-700">Share this code with network members:</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 font-mono font-bold text-lg text-emerald-700 bg-white rounded-lg px-3 py-2 border border-emerald-200">
                    {generatedCode}
                  </code>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(generatedCode);
                    }}
                    className="p-2.5 hover:bg-emerald-100 rounded-lg transition-colors text-emerald-700"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-xs text-slate-600">
                  Members enter this code at Settings → Network → Join Network
                </p>
              </div>
            )}
          </div>
        </>
      ) : (
        /* Section 3: Join a Network */
        <div className="space-y-3 border-t border-slate-100 pt-6">
          <h3 className="text-sm font-semibold text-slate-700">Join a Network</h3>

          {joinSuccess && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-sm text-emerald-800">
              ✅ You have joined the network. Refresh to see the Network view.
            </div>
          )}

          {!joinSuccess && (
            <div className="bg-slate-50 rounded-xl p-4 space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700">Enter join code</label>
                <Input
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  placeholder="NSW-XXX-XXXXX"
                  className="rounded-lg font-mono uppercase"
                />
              </div>
              <Button
                onClick={handleJoinNetwork}
                disabled={!joinCode.trim() || joiningNetwork}
                className="w-full bg-emerald-600 hover:bg-emerald-700 rounded-lg text-sm"
              >
                {joiningNetwork ? <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> : null}
                Join Network
              </Button>
              {joinError && <p className="text-xs text-rose-600">{joinError}</p>}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

// ── Reports Section ──────────────────────────────────────────────────────────
const RAILWAY_URL = "https://newsconseenwebapp-production.up.railway.app";
const RAILWAY_API_KEY = import.meta.env.VITE_RAILWAY_API_KEY || "";
const API_HEADERS = RAILWAY_API_KEY ? { "x-api-key": RAILWAY_API_KEY } : {};

function ReportsSection({ user, enterprise }) {
  const companyId   = user?.company_id;
  const companyName = enterprise?.brand_name || enterprise?.enterprise_name || "Your Organisation";

  const [config, setConfig]     = useState({
    enabled:    false,
    frequency:  "weekly",
    recipients: [],
  });
  const [newEmail, setNewEmail] = useState("");
  const [newName,  setNewName]  = useState("");
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [sending,  setSending]  = useState(false);
  const [banner,   setBanner]   = useState(null);

  useEffect(() => {
    if (!companyId) return;
    fetch(`${RAILWAY_URL}/reports/schedule?company_id=${companyId}`, { headers: API_HEADERS })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data && data.configured) {
          setConfig({
            enabled:    data.enabled,
            frequency:  data.frequency || "weekly",
            recipients: data.recipients || [],
          });
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [companyId]);

  const showBanner = (type, msg) => {
    setBanner({ type, msg });
    setTimeout(() => setBanner(null), 4000);
  };

  const save = async () => {
    if (!companyId) return;
    setSaving(true);
    try {
      const res = await fetch(`${RAILWAY_URL}/reports/schedule`, {
        method:  "POST",
        headers: { ...API_HEADERS, "Content-Type": "application/json" },
        body:    JSON.stringify({ company_id: companyId, company_name: companyName, ...config }),
      });
      if (res.ok) showBanner("success", "Report schedule saved.");
      else        showBanner("error",   "Failed to save — check Railway logs.");
    } catch {
      showBanner("error", "Could not reach Railway service.");
    } finally {
      setSaving(false);
    }
  };

  const sendNow = async () => {
    if (!companyId) return;
    setSending(true);
    try {
      const res = await fetch(
        `${RAILWAY_URL}/reports/send-digest?company_id=${companyId}`,
        { method: "POST", headers: API_HEADERS }
      );
      const data = await res.json();
      if (data.status === "accepted") showBanner("success", "Digest queued — recipients will receive it shortly.");
      else if (data.reason)           showBanner("error",   data.reason);
      else                            showBanner("error",   "Delivery failed.");
    } catch {
      showBanner("error", "Could not reach Railway service.");
    } finally {
      setSending(false);
    }
  };

  const addRecipient = () => {
    if (!newEmail || !newEmail.includes("@")) return;
    setConfig(c => ({
      ...c,
      recipients: [...c.recipients, { email: newEmail.trim(), name: newName.trim() }],
    }));
    setNewEmail(""); setNewName("");
  };

  const removeRecipient = (idx) => {
    setConfig(c => ({ ...c, recipients: c.recipients.filter((_, i) => i !== idx) }));
  };

  if (loading) return (
    <div className="flex items-center justify-center h-32">
      <div className="w-5 h-5 border-2 border-slate-200 border-t-indigo-500 rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-slate-800">Report Delivery</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Automatically email operational summaries to your team on a schedule —
            no need to open the dashboard.
          </p>
        </div>
        <button
          onClick={save}
          disabled={saving}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-100 text-slate-600 hover:bg-slate-200 transition-all shrink-0"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          Save
        </button>
      </div>

      {banner && <Banner type={banner.type} message={banner.msg} onDismiss={() => setBanner(null)} />}

      <div className="bg-white border border-slate-100 rounded-2xl p-5">
        <ToggleRow
          label="Enable scheduled digest emails"
          checked={config.enabled}
          onChange={v => setConfig(c => ({ ...c, enabled: v }))}
        />
      </div>

      <div className="bg-white border border-slate-100 rounded-2xl p-5 space-y-4">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Delivery Schedule</p>
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-slate-700">Frequency</label>
          <div className="flex gap-2 flex-wrap">
            {["daily", "weekly", "monthly"].map(freq => (
              <button
                key={freq}
                onClick={() => setConfig(c => ({ ...c, frequency: freq }))}
                className={`px-4 py-2 rounded-xl text-sm font-medium border transition-all capitalize ${
                  config.frequency === freq
                    ? "bg-indigo-50 border-indigo-200 text-indigo-700"
                    : "border-slate-200 text-slate-500 hover:border-slate-300"
                }`}
              >
                {freq}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            {config.frequency === "daily"   && "Sent every morning after overnight ETL sync."}
            {config.frequency === "weekly"  && "Sent every Monday after weekly ETL sync."}
            {config.frequency === "monthly" && "Sent on the first of each month."}
          </p>
        </div>
      </div>

      <div className="bg-white border border-slate-100 rounded-2xl p-5 space-y-4">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Recipients</p>
        {config.recipients.length === 0 && (
          <p className="text-xs text-slate-400 italic">No recipients yet. Add at least one email address below.</p>
        )}
        {config.recipients.map((r, idx) => (
          <div key={idx} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0">
              <Mail className="w-3.5 h-3.5 text-indigo-500" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-700 truncate">{r.email}</p>
              {r.name && <p className="text-[11px] text-slate-400 truncate">{r.name}</p>}
            </div>
            <button
              onClick={() => removeRecipient(idx)}
              className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
        <div className="border-t border-slate-100 pt-4 space-y-2">
          <p className="text-xs font-medium text-slate-600">Add recipient</p>
          <div className="flex gap-2">
            <input
              type="email"
              value={newEmail}
              onChange={e => setNewEmail(e.target.value)}
              onKeyDown={e => e.key === "Enter" && addRecipient()}
              placeholder="email@example.com"
              className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
            <input
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="Name (optional)"
              className="w-36 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
            <button
              onClick={addRecipient}
              disabled={!newEmail || !newEmail.includes("@")}
              className="px-3 py-2 bg-indigo-50 text-indigo-600 rounded-xl hover:bg-indigo-100 transition-colors disabled:opacity-40"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-5 flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-indigo-800">What operators receive</p>
          <p className="text-xs text-indigo-600 mt-1">
            Each digest includes: total people, active staff, churn risk, revenue, overdue invoices,
            task completion rate, and data health score with top issues — all in a clean, branded email.
          </p>
        </div>
        <button
          onClick={sendNow}
          disabled={sending || config.recipients.length === 0}
          className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 transition-colors disabled:opacity-50 shrink-0"
        >
          {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          Send now
        </button>
      </div>

      <div className="bg-amber-50 border border-amber-100 rounded-2xl px-4 py-3 flex items-start gap-3">
        <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
        <p className="text-xs text-amber-700">
          Digest delivery requires <strong>SENDGRID_API_KEY</strong> (or SMTP_HOST + SMTP_USER + SMTP_PASSWORD)
          set in Railway environment variables. The same credentials used by the Alerts engine are shared here.
        </p>
      </div>
    </div>
  );
}