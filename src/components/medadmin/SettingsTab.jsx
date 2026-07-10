import React, { useState, useEffect } from "react";
import { ncClient } from "@/api/ncClient";
import { useMutation } from "@tanstack/react-query";
import { createRecord } from "@/services/dataService";
import { format } from "date-fns";
import { Lock, Bell, Monitor, Info, RefreshCw, AlertCircle, Sun, Moon, Check } from "lucide-react";

const PIN_KEY = (email) => `medadmin_pin_${email}`;
const SETTINGS_KEY = (email) => `medadmin_settings_${email}`;

function getSettings(email) {
  try { return JSON.parse(localStorage.getItem(SETTINGS_KEY(email)) || "{}"); } catch { return {}; }
}
function saveSettings(email, data) {
  try { localStorage.setItem(SETTINGS_KEY(email), JSON.stringify(data)); } catch {}
}

function SectionHeader({ icon: Icon, title }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <Icon className="w-4 h-4 text-blue-500" />
      <p className="text-xs font-black text-gray-400 uppercase tracking-widest">{title}</p>
    </div>
  );
}

function ToggleRow({ label, sublabel, value, onChange }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-gray-50 last:border-0">
      <div>
        <p className="text-sm font-semibold text-gray-700">{label}</p>
        {sublabel && <p className="text-xs text-gray-400">{sublabel}</p>}
      </div>
      <button
        onClick={() => onChange(!value)}
        className={`w-11 h-6 rounded-full transition-colors relative ${value ? "bg-blue-600" : "bg-gray-200"}`}
      >
        <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${value ? "translate-x-5" : "translate-x-0.5"}`} />
      </button>
    </div>
  );
}

export default function SettingsTab({ user, darkMode, onDarkModeChange, onRefresh, lastSync, darkModeKey }) {
  const [settings, setSettings] = useState({});
  const [pinStep, setPinStep] = useState(null); // null | 'enter' | 'confirm'
  const [pin1, setPin1] = useState("");
  const [pin2, setPin2] = useState("");
  const [pinSaved, setPinSaved] = useState(false);
  const [pinError, setPinError] = useState("");

  useEffect(() => {
    if (!user?.email) return;
    setSettings(getSettings(user.email));
  }, [user?.email]);

  const updateSetting = (key, value) => {
    const updated = { ...settings, [key]: value };
    setSettings(updated);
    saveSettings(user.email, updated);
  };

  const handleSavePin = () => {
    if (pin1.length !== 4) { setPinError("PIN must be 4 digits"); return; }
    if (pinStep === "enter") { setPinStep("confirm"); return; }
    if (pin1 !== pin2) { setPinError("PINs do not match. Try again."); setPin1(""); setPin2(""); setPinStep("enter"); return; }
    localStorage.setItem(PIN_KEY(user.email), pin1);
    setPinSaved(true); setPinStep(null); setPin1(""); setPin2("");
    setTimeout(() => setPinSaved(false), 3000);
  };

  const reportMut = useMutation({
    mutationFn: () => createRecord("task", {
      task_type: "incident_observation",
      title: `Problem Report from ${user?.full_name || user?.email}`,
      status: "open",
      priority: "high",
      scheduled_date: format(new Date(), "yyyy-MM-dd"),
      scheduled_time: format(new Date(), "HH:mm"),
      assigned_to_email: user?.email,
      internal_notes: `Auto-generated problem report via MedAdmin Settings`,
    }, user),
  });

  const cardCls = darkMode ? "bg-slate-800 border-slate-700" : "bg-white border-gray-100";

  return (
    <div className="p-4 space-y-5 pb-8">
      {/* My Profile */}
      <div className={`rounded-2xl border shadow-sm p-4 ${cardCls}`}>
        <SectionHeader icon={Info} title="My Profile" />
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center font-black text-blue-700 text-lg">
            {(user?.full_name || user?.email || "?")[0].toUpperCase()}
          </div>
          <div>
            <p className="font-bold text-gray-800">{user?.full_name || "—"}</p>
            <p className="text-xs text-gray-400">{user?.email}</p>
            <p className="text-xs text-gray-400">Role: <span className="font-semibold">{user?.role}</span></p>
          </div>
        </div>
      </div>

      {/* PIN */}
      <div className={`rounded-2xl border shadow-sm p-4 ${cardCls}`}>
        <SectionHeader icon={Lock} title="Administration PIN" />
        {pinStep === null && (
          <button onClick={() => setPinStep("enter")} className="flex items-center gap-2 px-4 py-3 w-full rounded-xl bg-blue-50 text-blue-700 font-bold text-sm hover:bg-blue-100">
            <Lock className="w-4 h-4" />
            {localStorage.getItem(PIN_KEY(user?.email)) ? "Change Administration PIN" : "Set Administration PIN"}
          </button>
        )}
        {pinStep && (
          <div className="space-y-3">
            <p className="text-sm font-semibold text-gray-700">{pinStep === "enter" ? "Enter new 4-digit PIN:" : "Confirm PIN:"}</p>
            <input
              type="password" inputMode="numeric" maxLength={4}
              value={pinStep === "enter" ? pin1 : pin2}
              onChange={(e) => pinStep === "enter" ? setPin1(e.target.value.replace(/\D/g, "")) : setPin2(e.target.value.replace(/\D/g, ""))}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 text-2xl font-black tracking-[1em] text-center focus:outline-none focus:ring-2 focus:ring-blue-400"
              placeholder="••••"
            />
            {pinError && <p className="text-xs text-red-600 font-semibold">{pinError}</p>}
            <div className="flex gap-2">
              <button onClick={() => { setPinStep(null); setPin1(""); setPin2(""); setPinError(""); }} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 font-bold text-sm">Cancel</button>
              <button onClick={handleSavePin} className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white font-bold text-sm">{pinStep === "enter" ? "Next" : "Save PIN"}</button>
            </div>
          </div>
        )}
        {pinSaved && (
          <div className="flex items-center gap-2 bg-emerald-50 rounded-xl px-3 py-2 mt-2">
            <Check className="w-4 h-4 text-emerald-600" />
            <p className="text-xs font-bold text-emerald-700">PIN saved successfully</p>
          </div>
        )}
      </div>

      {/* Notifications */}
      <div className={`rounded-2xl border shadow-sm p-4 ${cardCls}`}>
        <SectionHeader icon={Bell} title="Notifications" />
        <ToggleRow label="Notification Sound" sublabel="Play sound for medication alerts" value={!!settings.notifSound} onChange={(v) => updateSetting("notifSound", v)} />
        <ToggleRow label="Vibration" sublabel="Vibrate on mobile for alerts" value={!!settings.vibration} onChange={(v) => updateSetting("vibration", v)} />
      </div>

      {/* Display */}
      <div className={`rounded-2xl border shadow-sm p-4 ${cardCls}`}>
        <SectionHeader icon={Monitor} title="Display" />
        <div className="pb-3 border-b border-gray-50 mb-3">
          <p className="text-sm font-semibold text-gray-700 mb-2">Font Size</p>
          <div className="flex gap-2">
            {["Normal", "Large", "Extra Large"].map((size) => (
              <button key={size} onClick={() => updateSetting("fontSize", size)}
                className={`flex-1 py-2 rounded-xl text-xs font-bold border-2 transition-all ${settings.fontSize === size || (!settings.fontSize && size === "Normal") ? "bg-blue-600 text-white border-blue-600" : "border-gray-200 text-gray-500"}`}
              >{size}</button>
            ))}
          </div>
        </div>
        <ToggleRow label="High Contrast" sublabel="Increase text contrast" value={!!settings.highContrast} onChange={(v) => updateSetting("highContrast", v)} />
        <ToggleRow label="24-hour Time" sublabel="Use 24h format instead of AM/PM" value={!!settings.time24h} onChange={(v) => updateSetting("time24h", v)} />
        <div className="flex items-center justify-between py-3">
          <div className="flex items-center gap-2">
            {darkMode ? <Moon className="w-4 h-4 text-blue-400" /> : <Sun className="w-4 h-4 text-amber-500" />}
            <div>
              <p className="text-sm font-semibold text-gray-700">Dark Mode</p>
              <p className="text-xs text-gray-400">Reduce screen brightness for night shifts</p>
            </div>
          </div>
          <button onClick={() => onDarkModeChange(!darkMode)} className={`w-11 h-6 rounded-full transition-colors relative ${darkMode ? "bg-blue-600" : "bg-gray-200"}`}>
            <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${darkMode ? "translate-x-5" : "translate-x-0.5"}`} />
          </button>
        </div>
      </div>

      {/* About */}
      <div className={`rounded-2xl border shadow-sm p-4 ${cardCls}`}>
        <SectionHeader icon={Info} title="About" />
        <div className="space-y-2 text-sm text-gray-600 mb-4">
          <p>App Version: <span className="font-bold">2.0.0</span></p>
          <p>Last Sync: <span className="font-bold">{lastSync ? format(lastSync, "PPp") : "Never"}</span></p>
        </div>
        <div className="space-y-2">
          <button onClick={onRefresh} className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-blue-50 text-blue-700 font-bold text-sm hover:bg-blue-100">
            <RefreshCw className="w-4 h-4" /> Sync Now
          </button>
          <button
            onClick={() => reportMut.mutate()}
            disabled={reportMut.isPending || reportMut.isSuccess}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-red-50 text-red-700 font-bold text-sm hover:bg-red-100"
          >
            <AlertCircle className="w-4 h-4" />
            {reportMut.isSuccess ? "Problem Reported ✓" : "Report a Problem"}
          </button>
        </div>
      </div>
    </div>
  );
}