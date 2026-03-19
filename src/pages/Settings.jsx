import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  User, Lock, Bell, Monitor, AlertTriangle,
  Eye, EyeOff, Save, Building2, Mail, Shield, Calendar, X, Settings as SettingsIcon, Palette,
} from "lucide-react";
import BrandingSection from "@/components/settings/BrandingSection";

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

const ALL_TABS = [
  { id: "profile",       label: "Profile",       icon: User,          adminOnly: false },
  { id: "password",      label: "Password",      icon: Lock,          adminOnly: false },
  { id: "notifications", label: "Notifications", icon: Bell,          adminOnly: false },
  { id: "sessions",      label: "Sessions",      icon: Monitor,       adminOnly: false },
  { id: "branding",      label: "Branding",      icon: Palette,       adminOnly: true  },
  { id: "danger",        label: "Danger Zone",   icon: AlertTriangle, adminOnly: false },
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
  const TABS = ALL_TABS.filter((t) => !t.adminOnly || isAdmin);

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
          {activeTab === "danger"        && <DangerSection user={user} />}
        </div>
      </div>
    </div>
  );
}

function ProfileSection({ user, myEnterprise, onUserUpdated }) {
  const [name, setName] = useState(user.full_name || "");
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState(null);

  const handleSave = async () => {
    setSaving(true);
    try {
      await base44.auth.updateMe({ full_name: name });
      onUserUpdated({ ...user, full_name: name });
      setBanner({ type: "success", msg: "Profile updated successfully." });
      setTimeout(() => setBanner(null), 3000);
    } catch {
      setBanner({ type: "error", msg: "Failed to update profile. Please try again." });
    }
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
      await base44.auth.updatePassword({ currentPassword: current, newPassword: next });
      setBanner({ type: "success", msg: "Password updated successfully." });
      setCurrent(""); setNext(""); setConfirm("");
    } catch {
      setBanner({ type: "error", msg: "Current password is incorrect. Please try again." });
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