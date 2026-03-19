import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Save, Upload, Globe, Lock, AlertTriangle, Copy, Check,
  Palette, Image, Building2, X, ExternalLink,
} from "lucide-react";

const DEFAULTS = {
  primaryColor: "#10b981",
  secondaryColor: "#1e293b",
  accentColor: "#6366f1",
};

const PRESETS = [
  { label: "Emerald",       primary: "#10b981", secondary: "#1e293b", accent: "#6366f1" },
  { label: "Ocean Blue",    primary: "#0ea5e9", secondary: "#0f172a", accent: "#6366f1" },
  { label: "Royal Purple",  primary: "#8b5cf6", secondary: "#1e1b4b", accent: "#ec4899" },
  { label: "Warm Red",      primary: "#ef4444", secondary: "#1c1917", accent: "#f59e0b" },
  { label: "Forest Green",  primary: "#16a34a", secondary: "#14532d", accent: "#84cc16" },
  { label: "Corporate Navy",primary: "#1d4ed8", secondary: "#1e3a5f", accent: "#0ea5e9" },
];

function Banner({ type, message, onDismiss }) {
  if (!message) return null;
  const ok = type === "success";
  return (
    <div className={`flex items-start justify-between gap-3 px-4 py-3 rounded-xl border text-sm
      ${ok ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-rose-50 border-rose-200 text-rose-800"}`}>
      <span>{ok ? "✅" : "❌"} {message}</span>
      {onDismiss && (
        <button onClick={onDismiss} className="shrink-0 opacity-60 hover:opacity-100"><X className="w-4 h-4" /></button>
      )}
    </div>
  );
}

function ToggleSwitch({ checked, onChange }) {
  return (
    <button onClick={() => onChange(!checked)}
      className={`w-10 h-6 rounded-full transition-colors relative shrink-0 ${checked ? "bg-emerald-500" : "bg-slate-200"}`}>
      <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${checked ? "left-5" : "left-1"}`} />
    </button>
  );
}

function ColorPicker({ label, helper, value, onChange }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-slate-700">{label}</label>
      <p className="text-xs text-slate-400">{helper}</p>
      <div className="flex items-center gap-2">
        <div className="relative">
          <input type="color" value={value} onChange={(e) => onChange(e.target.value)}
            className="w-10 h-10 rounded-xl border border-slate-200 cursor-pointer p-0.5" />
        </div>
        <Input value={value} onChange={(e) => onChange(e.target.value)}
          className="rounded-xl font-mono w-32 text-sm" maxLength={7} />
        <div className="w-8 h-8 rounded-lg border border-slate-200 shadow-sm" style={{ backgroundColor: value }} />
      </div>
    </div>
  );
}

function BrandingPreview({ appName, logoUrl, primaryColor, secondaryColor, accentColor, tagline }) {
  return (
    <div className="rounded-xl border border-slate-200 overflow-hidden text-xs shadow-sm">
      <div className="flex" style={{ minHeight: 120 }}>
        {/* Sidebar */}
        <div className="w-28 flex flex-col p-2 gap-1" style={{ backgroundColor: secondaryColor }}>
          <div className="flex items-center gap-1.5 mb-2 px-1 py-1">
            {logoUrl ? (
              <img src={logoUrl} alt={appName} className="h-5 w-auto object-contain max-w-[80px]" />
            ) : (
              <>
                <div className="w-5 h-5 rounded flex items-center justify-center text-white font-black text-[10px]"
                  style={{ backgroundColor: primaryColor }}>
                  {appName.charAt(0)}
                </div>
                <span className="text-white font-semibold text-[10px] truncate">{appName}</span>
              </>
            )}
          </div>
          {["Dashboard", "Tasks", "Reports"].map((item) => (
            <div key={item} className="px-2 py-1 rounded-lg text-[10px] font-medium text-white/60">{item}</div>
          ))}
          <div className="px-2 py-1 rounded-lg text-[10px] font-medium" style={{ backgroundColor: primaryColor + "22", color: primaryColor }}>
            Dashboard
          </div>
        </div>
        {/* Content */}
        <div className="flex-1 p-3 bg-slate-50 space-y-2">
          <p className="text-[11px] font-bold text-slate-800">Dashboard</p>
          <button className="px-3 py-1.5 rounded-lg text-white text-[10px] font-semibold" style={{ backgroundColor: primaryColor }}>
            Primary Button
          </button>
          <div className="flex gap-1.5 flex-wrap">
            <span className="px-2 py-0.5 rounded-full text-[10px] font-medium text-white" style={{ backgroundColor: accentColor }}>Badge</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-medium text-white" style={{ backgroundColor: primaryColor + "99" }}>Active</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function LoginPreview({ appName, logoUrl, tagline, primaryColor, supportEmail }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-center space-y-3">
      <div className="flex justify-center">
        {logoUrl ? (
          <img src={logoUrl} alt={appName} className="h-12 w-auto object-contain" />
        ) : (
          <div className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-black text-xl"
            style={{ backgroundColor: primaryColor }}>
            {appName.charAt(0)}
          </div>
        )}
      </div>
      <div>
        <p className="text-sm font-bold text-slate-800">{appName}</p>
        {tagline && <p className="text-xs text-slate-400 mt-0.5">{tagline}</p>}
      </div>
      <div className="space-y-2 text-left max-w-[200px] mx-auto">
        <div className="px-3 py-2 bg-white rounded-lg border border-slate-200 text-xs text-slate-300">Email</div>
        <div className="px-3 py-2 bg-white rounded-lg border border-slate-200 text-xs text-slate-300">Password</div>
        <button className="w-full py-2 rounded-lg text-white text-xs font-semibold" style={{ backgroundColor: primaryColor }}>
          Sign In
        </button>
      </div>
      {supportEmail && (
        <p className="text-[10px] text-slate-400">Need help? {supportEmail}</p>
      )}
    </div>
  );
}

export default function BrandingSection({ user, enterprise }) {
  const queryClient = useQueryClient();
  const logoInputRef = useRef();
  const faviconInputRef = useRef();

  const tier = enterprise?.subscription_tier || "professional";
  const isConsultant = tier === "consultant";
  const isPro = tier === "professional" || tier === "consultant";

  const [appName, setAppName] = useState(enterprise?.brand_name || "");
  const [tagline, setTagline] = useState(enterprise?.brand_tagline || "");
  const [supportEmail, setSupportEmail] = useState(enterprise?.brand_support_email || "");
  const [hideNewsconseen, setHideNewsconseen] = useState(enterprise?.brand_hide_newsconseen || false);
  const [logoUrl, setLogoUrl] = useState(enterprise?.brand_logo_url || "");
  const [faviconUrl, setFaviconUrl] = useState(enterprise?.brand_favicon_url || "");
  const [primaryColor, setPrimaryColor] = useState(enterprise?.brand_primary_color || DEFAULTS.primaryColor);
  const [secondaryColor, setSecondaryColor] = useState(enterprise?.brand_secondary_color || DEFAULTS.secondaryColor);
  const [accentColor, setAccentColor] = useState(enterprise?.brand_accent_color || DEFAULTS.accentColor);
  const [customDomain, setCustomDomain] = useState(enterprise?.brand_custom_domain || "");
  const [domainStatus, setDomainStatus] = useState("unverified");

  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState(null);
  const [copied, setCopied] = useState(false);

  // Sync when enterprise loads
  useEffect(() => {
    if (!enterprise) return;
    setAppName(enterprise.brand_name || "");
    setTagline(enterprise.brand_tagline || "");
    setSupportEmail(enterprise.brand_support_email || "");
    setHideNewsconseen(enterprise.brand_hide_newsconseen || false);
    setLogoUrl(enterprise.brand_logo_url || "");
    setFaviconUrl(enterprise.brand_favicon_url || "");
    setPrimaryColor(enterprise.brand_primary_color || DEFAULTS.primaryColor);
    setSecondaryColor(enterprise.brand_secondary_color || DEFAULTS.secondaryColor);
    setAccentColor(enterprise.brand_accent_color || DEFAULTS.accentColor);
    setCustomDomain(enterprise.brand_custom_domain || "");
  }, [enterprise?.id]);

  const handleLogoUpload = async (e, type = "logo") => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { setBanner({ type: "error", msg: "File too large. Max 2MB." }); return; }
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      if (type === "logo") setLogoUrl(file_url);
      else setFaviconUrl(file_url);
    } catch {
      // Fallback: read as data URL for preview
      const reader = new FileReader();
      reader.onload = (ev) => {
        if (type === "logo") setLogoUrl(ev.target.result);
        else setFaviconUrl(ev.target.result);
      };
      reader.readAsDataURL(file);
    }
    setUploading(false);
  };

  const handleSave = async () => {
    if (!enterprise?.id) return;
    setSaving(true);
    try {
      await base44.entities.Enterprise.update(enterprise.id, {
        brand_name: appName,
        brand_tagline: tagline,
        brand_logo_url: logoUrl,
        brand_primary_color: primaryColor,
        brand_secondary_color: secondaryColor,
        brand_accent_color: accentColor,
        brand_hide_newsconseen: hideNewsconseen,
        brand_support_email: supportEmail,
        brand_custom_domain: customDomain,
        brand_favicon_url: faviconUrl,
      });
      queryClient.invalidateQueries({ queryKey: ["branding"] });
      setBanner({ type: "success", msg: "Branding updated successfully! Reloading to apply changes…" });
      setTimeout(() => window.location.reload(), 1800);
    } catch {
      setBanner({ type: "error", msg: "Failed to save branding. Please try again." });
    }
    setSaving(false);
  };

  const dnsText = `Type\tName\tValue\nCNAME\t${customDomain.split(".")[0] || "ops"}\tapp.newsconseen.com\nTXT\t${customDomain.split(".")[0] || "ops"}\tnewsconseen-verify=${enterprise?.id || "your-company-id"}`;

  const handleCopyDns = () => {
    navigator.clipboard.writeText(dnsText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const previewAppName = appName || "Newsconseen";

  // Plan gate for starter
  if (!isPro) {
    return (
      <Card className="p-6 space-y-4">
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 space-y-3">
          <div className="flex items-center gap-2 text-amber-700 font-bold">
            <Lock className="w-5 h-5" /> White Label is a Professional / Consultant Plan feature
          </div>
          <p className="text-sm text-amber-700">Upgrade to unlock custom branding for your workspace.</p>
          <div className="space-y-1 text-sm text-amber-600">
            <p>✓ Custom logo and colors</p>
            <p>✓ Remove Newsconseen branding</p>
            <p>✓ Custom domain</p>
            <p>✓ Branded exports and reports</p>
          </div>
          <Button className="bg-amber-500 hover:bg-amber-600 text-white rounded-xl">Upgrade Plan →</Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      {banner && <Banner type={banner.type} message={banner.msg} onDismiss={() => setBanner(null)} />}

      {/* Consultant-only lock banner */}
      {!isConsultant && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
          <Lock className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-amber-700">Some features require Consultant plan</p>
            <p className="text-xs text-amber-600 mt-0.5">Remove branding and custom domain are Consultant-only ($299/month).</p>
          </div>
        </div>
      )}

      {/* SECTION A — Workspace Identity */}
      <Card className="p-6 space-y-4">
        <div>
          <h2 className="text-base font-bold text-slate-800 flex items-center gap-2"><Building2 className="w-4 h-4 text-slate-400" /> Workspace Identity</h2>
          <p className="text-sm text-slate-400 mt-0.5">Customize how your workspace appears to users</p>
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-slate-700">App Name</label>
          <Input value={appName} onChange={(e) => setAppName(e.target.value)} className="rounded-xl" placeholder="e.g. LaRacine Operations Hub" />
          <p className="text-xs text-slate-400">Replaces "Newsconseen" throughout the app</p>
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-slate-700">Tagline</label>
          <Input value={tagline} onChange={(e) => setTagline(e.target.value)} className="rounded-xl" placeholder="e.g. Powered by LaRacine" />
          <p className="text-xs text-slate-400">Shown on login page and reports</p>
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-slate-700">Support Email</label>
          <Input type="email" value={supportEmail} onChange={(e) => setSupportEmail(e.target.value)} className="rounded-xl" placeholder="admin@yourcompany.com" />
          <p className="text-xs text-slate-400">Users see this instead of Newsconseen support</p>
        </div>
        <div className={`flex items-center justify-between py-3 px-4 rounded-xl border ${isConsultant ? "border-slate-200" : "border-slate-100 opacity-60"}`}>
          <div>
            <p className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
              Remove Newsconseen Branding
              {!isConsultant && <Lock className="w-3.5 h-3.5 text-amber-500" />}
            </p>
            <p className="text-xs text-slate-400">Hide Newsconseen logo and name throughout the app</p>
          </div>
          <ToggleSwitch checked={hideNewsconseen} onChange={isConsultant ? setHideNewsconseen : () => {}} />
        </div>
        {hideNewsconseen && isConsultant && (
          <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>This will hide all Newsconseen branding. Your app name and logo will be shown instead.</span>
          </div>
        )}
      </Card>

      {/* SECTION B — Logo Upload */}
      <Card className="p-6 space-y-4">
        <div>
          <h2 className="text-base font-bold text-slate-800 flex items-center gap-2"><Image className="w-4 h-4 text-slate-400" /> Logo</h2>
          <p className="text-sm text-slate-400 mt-0.5">Your logo appears in the sidebar, login page, and exported reports</p>
        </div>

        {/* Logo preview / upload */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-700">Workspace Logo</label>
          {logoUrl ? (
            <div className="space-y-2">
              <div className="flex items-center justify-center bg-white rounded-xl border border-slate-200 p-4" style={{ width: 200, height: 80 }}>
                <img src={logoUrl} alt="Logo preview" className="max-h-full max-w-full object-contain" />
              </div>
              <button onClick={() => setLogoUrl("")} className="text-xs text-rose-500 hover:text-rose-700">Remove logo</button>
            </div>
          ) : (
            <div
              onClick={() => logoInputRef.current?.click()}
              className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-slate-200 rounded-xl p-6 cursor-pointer hover:border-emerald-300 hover:bg-emerald-50/30 transition-colors">
              <Upload className="w-6 h-6 text-slate-400" />
              <p className="text-sm text-slate-500">Click to upload logo</p>
              <p className="text-xs text-slate-400">PNG, JPG, SVG · Max 2MB · Recommended: 200×60px with transparent background</p>
            </div>
          )}
          <input ref={logoInputRef} type="file" accept=".png,.jpg,.jpeg,.svg" className="hidden" onChange={(e) => handleLogoUpload(e, "logo")} />
          {logoUrl && (
            <Button variant="outline" size="sm" onClick={() => logoInputRef.current?.click()} className="rounded-xl gap-2">
              <Upload className="w-3.5 h-3.5" /> Replace Logo
            </Button>
          )}
        </div>

        {/* Favicon */}
        <div className="space-y-2 pt-2 border-t border-slate-100">
          <label className="text-sm font-medium text-slate-700">Favicon</label>
          <p className="text-xs text-slate-400">Used as the browser tab icon (32×32px .ico or .png)</p>
          <div className="flex items-center gap-3">
            {faviconUrl ? (
              <img src={faviconUrl} alt="Favicon" className="w-8 h-8 object-contain rounded border border-slate-200" />
            ) : (
              <div className="w-8 h-8 rounded border border-dashed border-slate-200 flex items-center justify-center">
                <Image className="w-4 h-4 text-slate-300" />
              </div>
            )}
            <Button variant="outline" size="sm" onClick={() => faviconInputRef.current?.click()} className="rounded-xl gap-2">
              <Upload className="w-3.5 h-3.5" /> {faviconUrl ? "Replace" : "Upload"} Favicon
            </Button>
            {faviconUrl && (
              <button onClick={() => setFaviconUrl("")} className="text-xs text-rose-500 hover:text-rose-700">Remove</button>
            )}
          </div>
          <input ref={faviconInputRef} type="file" accept=".ico,.png" className="hidden" onChange={(e) => handleLogoUpload(e, "favicon")} />
        </div>

        {uploading && (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <div className="w-4 h-4 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" /> Uploading…
          </div>
        )}
      </Card>

      {/* SECTION C — Color Scheme */}
      <Card className="p-6 space-y-4">
        <div>
          <h2 className="text-base font-bold text-slate-800 flex items-center gap-2"><Palette className="w-4 h-4 text-slate-400" /> Color Scheme</h2>
          <p className="text-sm text-slate-400 mt-0.5">Customize the colors used throughout your workspace</p>
        </div>

        <div className="grid sm:grid-cols-3 gap-4">
          <ColorPicker label="Primary Color" helper="Buttons, active states, highlights" value={primaryColor} onChange={setPrimaryColor} />
          <ColorPicker label="Secondary Color" helper="Sidebar, headers, dark elements" value={secondaryColor} onChange={setSecondaryColor} />
          <ColorPicker label="Accent Color" helper="Badges, tags, highlights" value={accentColor} onChange={setAccentColor} />
        </div>

        {/* Presets */}
        <div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Preset Schemes</p>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <button key={p.label}
                onClick={() => { setPrimaryColor(p.primary); setSecondaryColor(p.secondary); setAccentColor(p.accent); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-medium text-slate-600 hover:border-slate-300 hover:bg-slate-50 transition-colors">
                <div className="flex gap-0.5">
                  <span className="w-3 h-3 rounded-full" style={{ backgroundColor: p.primary }} />
                  <span className="w-3 h-3 rounded-full" style={{ backgroundColor: p.secondary }} />
                  <span className="w-3 h-3 rounded-full" style={{ backgroundColor: p.accent }} />
                </div>
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <button onClick={() => { setPrimaryColor(DEFAULTS.primaryColor); setSecondaryColor(DEFAULTS.secondaryColor); setAccentColor(DEFAULTS.accentColor); }}
          className="text-xs text-slate-400 hover:text-slate-600 underline underline-offset-2">
          Reset to Newsconseen defaults
        </button>

        {/* Live Preview */}
        <div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Live Preview</p>
          <BrandingPreview
            appName={previewAppName} logoUrl={logoUrl}
            primaryColor={primaryColor} secondaryColor={secondaryColor} accentColor={accentColor}
            tagline={tagline}
          />
        </div>
      </Card>

      {/* SECTION D — Custom Domain */}
      <Card className={`p-6 space-y-4 ${!isConsultant ? "opacity-70" : ""}`}>
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
              <Globe className="w-4 h-4 text-slate-400" /> Custom Domain
              {!isConsultant && <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-semibold flex items-center gap-1"><Lock className="w-2.5 h-2.5" /> Consultant</span>}
            </h2>
            <p className="text-sm text-slate-400 mt-0.5">Show your workspace at your own domain</p>
          </div>
        </div>

        <div className="space-y-1.5">
          <Input value={customDomain} onChange={(e) => setCustomDomain(e.target.value)}
            disabled={!isConsultant}
            className="rounded-xl" placeholder="ops.yourcompany.com" />
          <p className="text-xs text-slate-400">Enter the domain you want to use. SSL is automatically provisioned.</p>
        </div>

        {customDomain && isConsultant && (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">Add these DNS records at your domain registrar:</p>
            <div className="bg-slate-900 rounded-xl p-4 font-mono text-xs text-slate-200 space-y-2">
              <div className="text-slate-500 grid grid-cols-3 gap-4 pb-1 border-b border-slate-700">
                <span>Type</span><span>Name</span><span>Value</span>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <span className="text-emerald-400">CNAME</span>
                <span>{customDomain.split(".")[0] || "ops"}</span>
                <span>app.newsconseen.com</span>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <span className="text-emerald-400">TXT</span>
                <span>{customDomain.split(".")[0] || "ops"}</span>
                <span className="truncate">newsconseen-verify={enterprise?.id || "id"}</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="outline" size="sm" className="rounded-xl gap-2" onClick={handleCopyDns}>
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? "Copied!" : "Copy DNS Records"}
              </Button>
              <div className="flex items-center gap-1.5 text-xs">
                {domainStatus === "verified" ? (
                  <span className="flex items-center gap-1 text-emerald-600 font-medium">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" /> Verified
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-amber-600 font-medium">
                    <span className="w-2 h-2 rounded-full bg-amber-400" /> Unverified
                  </span>
                )}
                <button onClick={() => setDomainStatus("pending")} className="text-slate-400 hover:text-slate-600 underline underline-offset-2 ml-2">
                  Check DNS Status
                </button>
              </div>
            </div>
            {domainStatus === "pending" && (
              <p className="text-xs text-amber-600">Pending verification. DNS changes can take up to 48 hours to propagate.</p>
            )}
          </div>
        )}
      </Card>

      {/* SECTION E — Login Page Preview */}
      <Card className="p-6 space-y-4">
        <div>
          <h2 className="text-base font-bold text-slate-800">Login Page Preview</h2>
          <p className="text-sm text-slate-400 mt-0.5">How your login page will appear with custom branding</p>
        </div>
        <LoginPreview
          appName={previewAppName} logoUrl={logoUrl}
          tagline={tagline} primaryColor={primaryColor}
          supportEmail={supportEmail}
        />
        {!hideNewsconseen && (
          <p className="text-xs text-slate-400 text-center">Powered by Newsconseen will appear in the footer</p>
        )}
      </Card>

      {/* Save Button */}
      <Button onClick={handleSave} disabled={saving || !enterprise?.id} className="w-full bg-emerald-600 hover:bg-emerald-700 rounded-xl py-3 text-base font-semibold">
        {saving ? (
          <span className="flex items-center gap-2"><div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Saving…</span>
        ) : (
          <span className="flex items-center gap-2"><Save className="w-4 h-4" /> Save Branding</span>
        )}
      </Button>
    </div>
  );
}