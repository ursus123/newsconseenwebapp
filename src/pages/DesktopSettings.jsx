import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import {
  User, Lock, Building2, Shield, Palette, RefreshCw, Key, Info,
  Save, Eye, EyeOff, X, CheckCircle2, Monitor, Trash2, Database,
  Wifi, WifiOff, Cpu, HardDrive, ChevronRight,
} from "lucide-react";

// ── Helpers ───────────────────────────────────────────────────────────────────
function getInitials(name) {
  if (!name) return "?";
  return name.split(" ").map(n => n[0]).slice(0, 2).join("").toUpperCase();
}

function SectionTitle({ children, sub }) {
  return (
    <div className="mb-5">
      <h2 className="text-base font-bold text-white">{children}</h2>
      {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
    </div>
  );
}

function SettingRow({ label, sub, children }) {
  return (
    <div className="flex items-center justify-between py-3.5 border-b border-white/5 last:border-0 gap-4">
      <div className="min-w-0">
        <p className="text-sm text-slate-200">{label}</p>
        {sub && <p className="text-[11px] text-slate-500 mt-0.5">{sub}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Toggle({ checked, onChange }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className="w-10 h-6 rounded-full relative transition-colors"
      style={{ background: checked ? "#10b981" : "#334155" }}
    >
      <span
        className="absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all"
        style={{ left: checked ? 20 : 4 }}
      />
    </button>
  );
}

function OSInput({ value, onChange, placeholder, type = "text", readOnly }) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange && onChange(e.target.value)}
      placeholder={placeholder}
      readOnly={readOnly}
      className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
      style={{ minWidth: 0 }}
    />
  );
}

function SaveBtn({ onClick, saving, label = "Save Changes" }) {
  return (
    <button
      onClick={onClick}
      disabled={saving}
      className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all"
      style={{ background: saving ? "#1e293b" : "#10b981" }}
    >
      {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
      {saving ? "Saving…" : label}
    </button>
  );
}

function Toast({ msg, type, onDismiss }) {
  if (!msg) return null;
  return (
    <div
      className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm mb-4"
      style={{
        background: type === "success" ? "rgba(16,185,129,0.15)" : "rgba(239,68,68,0.15)",
        border: `1px solid ${type === "success" ? "rgba(16,185,129,0.3)" : "rgba(239,68,68,0.3)"}`,
        color: type === "success" ? "#6ee7b7" : "#fca5a5",
      }}
    >
      <CheckCircle2 className="w-4 h-4 shrink-0" />
      <span className="flex-1">{msg}</span>
      <button onClick={onDismiss}><X className="w-3.5 h-3.5 opacity-60 hover:opacity-100" /></button>
    </div>
  );
}

// ── Sidebar nav items ─────────────────────────────────────────────────────────
const NAV = [
  { id: "profile",     label: "Profile",      icon: User,       color: "#10b981" },
  { id: "enterprise",  label: "Enterprise",   icon: Building2,  color: "#0ea5e9" },
  { id: "permissions", label: "Permissions",  icon: Shield,     color: "#8b5cf6" },
  { id: "theme",       label: "Theme",        icon: Palette,    color: "#f59e0b" },
  { id: "sync",        label: "Sync",         icon: RefreshCw,  color: "#06b6d4" },
  { id: "security",    label: "Security",     icon: Lock,       color: "#f43f5e" },
  { id: "apikeys",     label: "API Keys",     icon: Key,        color: "#ec4899" },
  { id: "about",       label: "About System", icon: Info,       color: "#64748b" },
];

const WALLPAPERS = [
  { label: "Deep Ocean",   value: "linear-gradient(135deg, #0f172a 0%, #1e293b 40%, #0c4a6e 100%)" },
  { label: "Midnight",     value: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)" },
  { label: "Forest",       value: "linear-gradient(135deg, #064e3b 0%, #065f46 40%, #0f766e 100%)" },
  { label: "Indigo",       value: "linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #4338ca 100%)" },
  { label: "Crimson",      value: "linear-gradient(135deg, #450a0a 0%, #7f1d1d 40%, #991b1b 100%)" },
];

const ACCENTS = [
  { label: "Emerald", value: "#10b981" },
  { label: "Blue",    value: "#3b82f6" },
  { label: "Violet",  value: "#8b5cf6" },
  { label: "Amber",   value: "#f59e0b" },
  { label: "Rose",    value: "#f43f5e" },
  { label: "Cyan",    value: "#06b6d4" },
];

// ── Sections ──────────────────────────────────────────────────────────────────

function ProfileSection({ user, onUpdate }) {
  const [name, setName] = useState(user?.full_name || "");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [showPw, setShowPw]   = useState(false);
  const [curPw, setCurPw]     = useState("");
  const [newPw, setNewPw]     = useState("");
  const [confPw, setConfPw]   = useState("");
  const [pwSaving, setPwSaving] = useState(false);

  const saveProfile = async () => {
    setSaving(true);
    try {
      await base44.auth.updateMe({ full_name: name });
      onUpdate({ ...user, full_name: name });
      setToast({ type: "success", msg: "Profile updated." });
    } catch { setToast({ type: "error", msg: "Failed to update profile." }); }
    setSaving(false);
    setTimeout(() => setToast(null), 3000);
  };

  const savePassword = async () => {
    if (newPw !== confPw || newPw.length < 8) return;
    setPwSaving(true);
    try {
      const me = await base44.auth.me();
      await base44.auth.changePassword({ userId: me.id, currentPassword: curPw, newPassword: newPw });
      setToast({ type: "success", msg: "Password changed." });
      setCurPw(""); setNewPw(""); setConfPw("");
    } catch { setToast({ type: "error", msg: "Incorrect current password." }); }
    setPwSaving(false);
    setTimeout(() => setToast(null), 3000);
  };

  return (
    <div className="space-y-6">
      <SectionTitle sub="Manage your identity and credentials.">Profile & Account</SectionTitle>
      <Toast msg={toast?.msg} type={toast?.type} onDismiss={() => setToast(null)} />

      {/* Avatar */}
      <div className="flex items-center gap-4 p-4 rounded-2xl" style={{ background: "rgba(255,255,255,0.04)" }}>
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-white text-2xl font-black shrink-0"
          style={{ background: "linear-gradient(135deg,#10b981,#0ea5e9)" }}>
          {getInitials(name || user?.email)}
        </div>
        <div>
          <p className="text-white font-semibold">{name || "—"}</p>
          <p className="text-slate-500 text-xs">{user?.email}</p>
          <span className="inline-block mt-1 text-[10px] px-2 py-0.5 rounded-full font-bold"
            style={{ background: "rgba(139,92,246,0.2)", color: "#c4b5fd" }}>
            {user?.role || "user"}
          </span>
        </div>
      </div>

      {/* Name */}
      <div className="p-4 rounded-2xl space-y-3" style={{ background: "rgba(255,255,255,0.04)" }}>
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Display Name</p>
        <OSInput value={name} onChange={setName} placeholder="Your full name" />
        <div className="flex justify-end">
          <SaveBtn onClick={saveProfile} saving={saving} label="Update Name" />
        </div>
      </div>

      {/* Password */}
      <div className="p-4 rounded-2xl space-y-3" style={{ background: "rgba(255,255,255,0.04)" }}>
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Change Password</p>
          <button onClick={() => setShowPw(v => !v)} className="text-xs text-slate-500 hover:text-white flex items-center gap-1">
            {showPw ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            {showPw ? "Collapse" : "Expand"}
          </button>
        </div>
        {showPw && (
          <div className="space-y-2.5">
            <OSInput type="password" value={curPw} onChange={setCurPw} placeholder="Current password" />
            <OSInput type="password" value={newPw} onChange={setNewPw} placeholder="New password (min 8 chars)" />
            <OSInput type="password" value={confPw} onChange={setConfPw} placeholder="Confirm new password" />
            {confPw && newPw !== confPw && (
              <p className="text-xs text-rose-400">Passwords do not match</p>
            )}
            <div className="flex justify-end">
              <SaveBtn onClick={savePassword} saving={pwSaving} label="Change Password" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function EnterpriseSection({ user }) {
  const { data: enterprises = [] } = useQuery({
    queryKey: ["ent-settings"],
    queryFn: () => base44.entities.Enterprise.list(),
    enabled: !!user,
  });
  const ent = enterprises.find(e => e.id === user?.company_id) || enterprises[0];

  if (!ent) return (
    <div className="space-y-4">
      <SectionTitle sub="Enterprise configuration">Enterprise</SectionTitle>
      <div className="text-slate-500 text-sm p-6 text-center rounded-2xl" style={{ background: "rgba(255,255,255,0.04)" }}>
        No enterprise linked to your account.
      </div>
    </div>
  );

  const rows = [
    { label: "Enterprise Name",    value: ent.enterprise_name || "—" },
    { label: "Type",               value: ent.enterprise_type || "—" },
    { label: "City",               value: ent.city || "—" },
    { label: "Country",            value: ent.country || "—" },
    { label: "Status",             value: ent.status || "—" },
    { label: "Legal Structure",    value: ent.legal_structure || "—" },
    { label: "Subscription Tier",  value: ent.subscription_tier || "—" },
    { label: "Subscription Status",value: ent.subscription_status || "—" },
  ];

  return (
    <div className="space-y-4">
      <SectionTitle sub="Your organization settings (read-only — edit in Enterprises app).">Enterprise</SectionTitle>
      <div className="p-4 rounded-2xl space-y-1" style={{ background: "rgba(255,255,255,0.04)" }}>
        {rows.map(r => (
          <SettingRow key={r.label} label={r.label}>
            <span className="text-sm text-slate-400">{r.value}</span>
          </SettingRow>
        ))}
      </div>
      {ent.brand_logo_url && (
        <div className="p-4 rounded-2xl" style={{ background: "rgba(255,255,255,0.04)" }}>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Brand Logo</p>
          <img src={ent.brand_logo_url} alt="logo" className="h-12 object-contain rounded" />
        </div>
      )}
    </div>
  );
}

function PermissionsSection({ user }) {
  const APPS = [
    "Tasks", "Transactions", "People", "Enterprises", "Products",
    "Reports", "QueryBuilder", "MarketIntelligence", "Relationships",
    "AttendanceRegister", "MedAdmin", "ClockInOut", "StockCounter",
  ];
  const key = `app_access_${user?.email}`;
  const [allowed, setAllowed] = useState(() => {
    try { return JSON.parse(localStorage.getItem(key) || "null") || APPS; }
    catch { return APPS; }
  });
  const [saved, setSaved] = useState(false);

  const toggle = (app) => {
    setAllowed(prev => prev.includes(app) ? prev.filter(a => a !== app) : [...prev, app]);
  };

  const save = () => {
    localStorage.setItem(key, JSON.stringify(allowed));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="space-y-4">
      <SectionTitle sub="Configure which apps are accessible from the launcher.">Permissions & App Access</SectionTitle>
      {saved && <Toast msg="Access preferences saved." type="success" onDismiss={() => setSaved(false)} />}

      <div className="p-4 rounded-2xl space-y-1" style={{ background: "rgba(255,255,255,0.04)" }}>
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Your Role</p>
        <div className="flex items-center gap-3 mb-4">
          <Shield className="w-4 h-4 text-violet-400" />
          <span className="text-white font-semibold capitalize">{user?.role || "user"}</span>
          <span className="text-xs text-slate-500">· Role is managed by your administrator</span>
        </div>
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">App Visibility (Personal)</p>
        {APPS.map(app => (
          <SettingRow key={app} label={app}>
            <Toggle checked={allowed.includes(app)} onChange={() => toggle(app)} />
          </SettingRow>
        ))}
      </div>
      <div className="flex justify-end">
        <SaveBtn onClick={save} saving={false} label="Save Access" />
      </div>
    </div>
  );
}

function ThemeSection({ user }) {
  const wpKey = "desktop_wallpaper";
  const accentKey = `accent_${user?.email}`;

  const [wpIdx, setWpIdx] = useState(() => parseInt(localStorage.getItem(wpKey) || "0", 10));
  const [accent, setAccent] = useState(() => localStorage.getItem(accentKey) || "#10b981");
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem("desktop_darkmode") !== "false");
  const [saved, setSaved] = useState(false);

  const save = () => {
    localStorage.setItem(wpKey, String(wpIdx));
    localStorage.setItem(accentKey, accent);
    localStorage.setItem("desktop_darkmode", String(darkMode));
    // Dispatch so Desktop.jsx can react without reload
    window.dispatchEvent(new CustomEvent("desktop-theme-change", { detail: { wpIdx, accent, darkMode } }));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="space-y-4">
      <SectionTitle sub="Customize your desktop appearance.">Theme & Display</SectionTitle>
      {saved && <Toast msg="Theme applied." type="success" onDismiss={() => setSaved(false)} />}

      {/* Dark mode */}
      <div className="p-4 rounded-2xl" style={{ background: "rgba(255,255,255,0.04)" }}>
        <SettingRow label="Dark Mode" sub="Applies to Desktop Shell UI">
          <Toggle checked={darkMode} onChange={setDarkMode} />
        </SettingRow>
      </div>

      {/* Wallpaper */}
      <div className="p-4 rounded-2xl" style={{ background: "rgba(255,255,255,0.04)" }}>
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Wallpaper</p>
        <div className="grid grid-cols-5 gap-2">
          {WALLPAPERS.map((wp, i) => (
            <button
              key={i}
              onClick={() => setWpIdx(i)}
              className="relative aspect-video rounded-xl overflow-hidden border-2 transition-all"
              style={{
                background: wp.value,
                borderColor: wpIdx === i ? "#10b981" : "transparent",
                boxShadow: wpIdx === i ? "0 0 0 2px #10b981" : "none",
              }}
            >
              {wpIdx === i && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <CheckCircle2 className="w-4 h-4 text-white drop-shadow" />
                </div>
              )}
              <span className="absolute bottom-1 left-0 right-0 text-center text-[9px] text-white/70">
                {wp.label}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Accent color */}
      <div className="p-4 rounded-2xl" style={{ background: "rgba(255,255,255,0.04)" }}>
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Accent Color</p>
        <div className="flex gap-3 flex-wrap">
          {ACCENTS.map(a => (
            <button
              key={a.value}
              onClick={() => setAccent(a.value)}
              title={a.label}
              className="w-8 h-8 rounded-full border-2 transition-all"
              style={{
                background: a.value,
                borderColor: accent === a.value ? "white" : "transparent",
                boxShadow: accent === a.value ? `0 0 0 2px ${a.value}` : "none",
              }}
            />
          ))}
        </div>
      </div>

      <div className="flex justify-end">
        <SaveBtn onClick={save} saving={false} label="Apply Theme" />
      </div>
    </div>
  );
}

function SyncSection({ user }) {
  const key = `sync_prefs_${user?.email}`;
  const [prefs, setPrefs] = useState(() => {
    try { return { ...{ interval: "30", offline: false }, ...JSON.parse(localStorage.getItem(key) || "{}") }; }
    catch { return { interval: "30", offline: false }; }
  });
  const [saved, setSaved] = useState(false);
  const [clearing, setClearing] = useState(false);

  const set = (k, v) => setPrefs(p => ({ ...p, [k]: v }));

  const save = () => {
    localStorage.setItem(key, JSON.stringify(prefs));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const clearCache = async () => {
    setClearing(true);
    const keys = Object.keys(localStorage).filter(k =>
      k.startsWith("qb_") || k.startsWith("notif_") || k.startsWith("desktop_")
    );
    keys.forEach(k => localStorage.removeItem(k));
    await new Promise(r => setTimeout(r, 800));
    setClearing(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="space-y-4">
      <SectionTitle sub="Configure data synchronization and offline behavior.">Sync & Data</SectionTitle>
      {saved && <Toast msg="Settings saved." type="success" onDismiss={() => setSaved(false)} />}

      <div className="p-4 rounded-2xl space-y-1" style={{ background: "rgba(255,255,255,0.04)" }}>
        <SettingRow label="Offline Mode" sub="Disables live data fetching">
          <Toggle checked={prefs.offline} onChange={v => set("offline", v)} />
        </SettingRow>

        <SettingRow label="Data Refresh Interval" sub="How often to re-query backend">
          <select
            value={prefs.interval}
            onChange={e => set("interval", e.target.value)}
            className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none"
          >
            <option value="10">10 seconds</option>
            <option value="30">30 seconds</option>
            <option value="60">1 minute</option>
            <option value="300">5 minutes</option>
            <option value="0">Manual only</option>
          </select>
        </SettingRow>
      </div>

      <div className="p-4 rounded-2xl" style={{ background: "rgba(255,255,255,0.04)" }}>
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Cache Management</p>
        <p className="text-xs text-slate-500 mb-3">Clears locally stored preferences, query cache, and desktop config.</p>
        <button
          onClick={clearCache}
          disabled={clearing}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-rose-400 border border-rose-500/30 hover:bg-rose-500/10 transition-all"
        >
          {clearing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
          {clearing ? "Clearing…" : "Clear Local Cache"}
        </button>
      </div>

      <div className="flex justify-end">
        <SaveBtn onClick={save} saving={false} label="Save Sync Settings" />
      </div>
    </div>
  );
}

function SecuritySection({ user }) {
  const AUTO_LOCK_KEY = 'desktop_auto_lock_minutes';
  const [autoLockMins, setAutoLockMins] = useState(() =>
    parseInt(localStorage.getItem(AUTO_LOCK_KEY) || '0', 10)
  );
  const [saved, setSaved] = useState(false);

  const save = () => {
    localStorage.setItem(AUTO_LOCK_KEY, String(autoLockMins));
    // Notify the Desktop store
    window.dispatchEvent(new CustomEvent("desktop-auto-lock-change", { detail: { minutes: autoLockMins } }));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const lockNow = () => {
    window.dispatchEvent(new CustomEvent("desktop-lock"));
  };

  return (
    <div className="space-y-4">
      <SectionTitle sub="Configure session lock and security preferences.">Security & Lock Screen</SectionTitle>
      {saved && <Toast msg="Security settings saved." type="success" onDismiss={() => setSaved(false)} />}

      <div className="p-4 rounded-2xl space-y-1" style={{ background: "rgba(255,255,255,0.04)" }}>
        <SettingRow label="Auto-Lock After Inactivity" sub="Automatically locks the screen after X minutes of no activity. Set to 0 to disable.">
          <select
            value={autoLockMins}
            onChange={e => setAutoLockMins(parseInt(e.target.value, 10))}
            className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none"
          >
            <option value="0">Disabled</option>
            <option value="1">1 minute</option>
            <option value="5">5 minutes</option>
            <option value="10">10 minutes</option>
            <option value="15">15 minutes</option>
            <option value="30">30 minutes</option>
            <option value="60">1 hour</option>
          </select>
        </SettingRow>
      </div>

      <div className="p-4 rounded-2xl space-y-3" style={{ background: "rgba(255,255,255,0.04)" }}>
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Manual Lock</p>
        <p className="text-xs text-slate-500">Lock the screen immediately. You can also use <span className="font-mono text-slate-400">Ctrl+L</span> from the desktop.</p>
        <button
          onClick={lockNow}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white border border-rose-500/30 hover:bg-rose-500/10 transition-all"
          style={{ color: "#f87171" }}
        >
          <Lock className="w-4 h-4" />
          Lock Screen Now
        </button>
      </div>

      <div className="flex justify-end">
        <SaveBtn onClick={save} saving={false} label="Save Security Settings" />
      </div>
    </div>
  );
}

function ApiKeysSection({ user }) {
  const [show, setShow] = useState(false);
  const [copied, setCopied] = useState(false);
  const fakeKey = `b44_${btoa(user?.email || "user").slice(0, 12)}xxxxxxxxxxxx`;
  const pythonUrl = window.location.origin + "/api/v1";

  const copy = (val) => {
    navigator.clipboard.writeText(val);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-4">
      <SectionTitle sub="Access credentials for external integrations.">API Keys & Endpoints</SectionTitle>

      <div className="p-4 rounded-2xl space-y-4" style={{ background: "rgba(255,255,255,0.04)" }}>
        <div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Base44 API Key</p>
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm font-mono text-slate-400 truncate">
              {show ? fakeKey : "•".repeat(32)}
            </div>
            <button
              onClick={() => setShow(v => !v)}
              className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-all"
            >
              {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
            {show && (
              <button
                onClick={() => copy(fakeKey)}
                className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-all"
              >
                {copied ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <Key className="w-4 h-4" />}
              </button>
            )}
          </div>
          <p className="text-[11px] text-slate-600 mt-1">Never share this key publicly.</p>
        </div>

        <div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">API Endpoint</p>
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm font-mono text-slate-400 truncate">
              {pythonUrl}
            </div>
            <button
              onClick={() => copy(pythonUrl)}
              className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-all"
            >
              {copied ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <Key className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>

      <div className="p-4 rounded-2xl" style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.15)" }}>
        <p className="text-xs text-rose-400 font-semibold mb-1">⚠️ Key Rotation</p>
        <p className="text-xs text-slate-500">Contact your administrator to regenerate API keys. Key rotation invalidates all existing integrations.</p>
      </div>
    </div>
  );
}

function AboutSection({ user }) {
  const [pwaStatus, setPwaStatus] = useState("Not installed");
  const [storage, setStorage] = useState(null);

  useEffect(() => {
    if (window.matchMedia("(display-mode: standalone)").matches) setPwaStatus("Installed (standalone)");
    else if (window.navigator.standalone) setPwaStatus("Installed (iOS)");

    if (navigator.storage?.estimate) {
      navigator.storage.estimate().then(({ usage, quota }) => {
        setStorage({
          used: (usage / 1024 / 1024).toFixed(1),
          total: (quota / 1024 / 1024 / 1024).toFixed(1),
        });
      });
    }
  }, []);

  const ua = navigator.userAgent;
  const browser = ua.includes("Chrome") && !ua.includes("Edg") ? "Chrome"
    : ua.includes("Edg") ? "Edge"
    : ua.includes("Firefox") ? "Firefox"
    : ua.includes("Safari") ? "Safari"
    : "Browser";

  const rows = [
    { label: "Newsconseen OS",      value: "v3.1.0 (Desktop Shell)" },
    { label: "Build",               value: "2026.03.25" },
    { label: "Shell",               value: "Base44 Platform v3" },
    { label: "Browser",             value: browser },
    { label: "PWA Status",          value: pwaStatus },
    { label: "Platform",            value: navigator.platform },
    { label: "Storage Used",        value: storage ? `${storage.used} MB of ${storage.total} GB` : "Calculating…" },
    { label: "Logged In As",        value: user?.email || "—" },
    { label: "Role",                value: user?.role || "—" },
    { label: "Tenant",              value: user?.company_id || "—" },
  ];

  return (
    <div className="space-y-4">
      <SectionTitle sub="System information and build details.">About Newsconseen OS</SectionTitle>

      <div className="flex items-center gap-4 p-5 rounded-2xl" style={{ background: "rgba(255,255,255,0.04)" }}>
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-3xl"
          style={{ background: "rgba(16,185,129,0.15)", border: "1px solid rgba(16,185,129,0.3)" }}>
          🖥️
        </div>
        <div>
          <p className="text-white font-bold text-base">Newsconseen Desktop</p>
          <p className="text-slate-500 text-xs">Business Manager · OS Shell v3</p>
        </div>
      </div>

      <div className="p-4 rounded-2xl space-y-1" style={{ background: "rgba(255,255,255,0.04)" }}>
        {rows.map(r => (
          <SettingRow key={r.label} label={r.label}>
            <span className="text-sm text-slate-400 text-right max-w-[200px] truncate">{r.value}</span>
          </SettingRow>
        ))}
      </div>

      <div className="p-4 rounded-2xl text-center" style={{ background: "rgba(255,255,255,0.04)" }}>
        <p className="text-xs text-slate-600">© 2026 Newsconseen · All rights reserved</p>
        <p className="text-xs text-slate-700 mt-0.5">Built on Base44 Platform</p>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function DesktopSettings() {
  const [active, setActive] = useState("profile");
  const [user, setUser]     = useState(null);

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => {});
  }, []);

  if (!user) return (
    <div className="flex items-center justify-center h-screen"
      style={{ background: "#0a0f1e" }}>
      <div className="w-8 h-8 border-4 border-slate-700 border-t-emerald-500 rounded-full animate-spin" />
    </div>
  );

  const sections = { profile: ProfileSection, enterprise: EnterpriseSection, permissions: PermissionsSection, theme: ThemeSection, sync: SyncSection, security: SecuritySection, apikeys: ApiKeysSection, about: AboutSection };
  const ActiveSection = sections[active] || ProfileSection;

  return (
    <div
      className="flex h-screen overflow-hidden"
      style={{ background: "#080f1e", color: "white", fontFamily: "inherit" }}
    >
      {/* ── Left sidebar ────────────────────────────────────────── */}
      <div
        className="w-56 shrink-0 flex flex-col h-full py-4 overflow-y-auto"
        style={{ background: "rgba(255,255,255,0.03)", borderRight: "1px solid rgba(255,255,255,0.06)" }}
      >
        {/* Header */}
        <div className="px-5 mb-5">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center text-base"
              style={{ background: "rgba(255,255,255,0.08)" }}>
              ⚙️
            </div>
            <span className="text-white font-bold text-sm">Settings</span>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 space-y-0.5">
          {NAV.map(item => {
            const Icon = item.icon;
            const isActive = active === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActive(item.id)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all text-left"
                style={{
                  background: isActive ? `${item.color}1a` : "transparent",
                  color: isActive ? item.color : "#64748b",
                  border: isActive ? `1px solid ${item.color}33` : "1px solid transparent",
                }}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="flex-1">{item.label}</span>
                {isActive && <ChevronRight className="w-3.5 h-3.5 opacity-50" />}
              </button>
            );
          })}
        </nav>

        {/* User footer */}
        <div className="px-3 pt-4 mt-2" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="flex items-center gap-2.5 px-2 py-1.5">
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
              style={{ background: "linear-gradient(135deg,#10b981,#0ea5e9)" }}>
              {getInitials(user.full_name || user.email)}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-300 truncate">{user.full_name || user.email}</p>
              <p className="text-[10px] text-slate-600 capitalize">{user.role}</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Right content ────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-lg mx-auto">
          <ActiveSection user={user} onUpdate={setUser} />
        </div>
      </div>
    </div>
  );
}