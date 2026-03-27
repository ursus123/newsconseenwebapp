import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell, BellOff, CheckCircle, AlertTriangle,
         Info, Send, RefreshCw, Settings, Phone,
         Mail, MessageSquare, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";

const RAILWAY_URL = "https://newsconseenwebapp-production.up.railway.app";

const SEVERITY_CONFIG = {
  critical: {
    color:  "bg-rose-50 text-rose-700 border-rose-200",
    badge:  "bg-rose-100 text-rose-700",
    icon:   "🔴",
    label:  "Critical",
  },
  warning: {
    color:  "bg-amber-50 text-amber-700 border-amber-200",
    badge:  "bg-amber-100 text-amber-700",
    icon:   "🟡",
    label:  "Warning",
  },
  info: {
    color:  "bg-blue-50 text-blue-700 border-blue-200",
    badge:  "bg-blue-100 text-blue-700",
    icon:   "🔵",
    label:  "Info",
  },
};

// ----------------------------------------------------------
// Alert card component
// ----------------------------------------------------------
function AlertCard({ alert }) {
  const cfg = SEVERITY_CONFIG[alert.severity] || SEVERITY_CONFIG.info;

  return (
    <div className={`border rounded-xl p-4 ${cfg.color}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span>{cfg.icon}</span>
            <span className="font-semibold text-sm">{alert.title}</span>
            <Badge className={`text-[10px] px-1.5 py-0.5 ${cfg.badge}`}>
              {cfg.label}
            </Badge>
          </div>
          <p className="text-xs opacity-80 leading-relaxed">{alert.message}</p>
          {alert.suggested_action && (
            <p className="text-xs mt-2 font-medium">
              💡 {alert.suggested_action}
            </p>
          )}
          {alert.enterprise_name && (
            <p className="text-[10px] mt-1.5 opacity-60">
              📍 {alert.enterprise_name}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------------
// Channel status badge
// ----------------------------------------------------------
function ChannelBadge({ name, icon: Icon, configured, note }) {
  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs ${
      configured
        ? "bg-emerald-50 border-emerald-200 text-emerald-700"
        : "bg-slate-50 border-slate-200 text-slate-500"
    }`}>
      <Icon className="w-3.5 h-3.5" />
      <span className="font-medium">{name}</span>
      {configured
        ? <CheckCircle className="w-3 h-3 ml-auto" />
        : <span className="ml-auto text-[10px] opacity-60">Not configured</span>}
    </div>
  );
}

// ----------------------------------------------------------
// Test channel panel
// ----------------------------------------------------------
function TestChannelPanel({ companyId }) {
  const [channel,    setChannel]    = useState("email");
  const [recipient,  setRecipient]  = useState("");
  const [testing,    setTesting]    = useState(false);
  const [testResult, setTestResult] = useState(null);
  const { toast } = useToast();

  const handleTest = async () => {
    if (!recipient.trim()) return;
    setTesting(true);
    setTestResult(null);

    try {
      const resp = await fetch(`${RAILWAY_URL}/alerts/test`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_id: companyId,
          channel,
          recipient: recipient.trim(),
        }),
      });

      if (resp.ok) {
        setTestResult({ success: true, message: `Test sent via ${channel}` });
        toast({ title: "Test notification sent", description: `Check your ${channel}` });
      } else {
        const err = await resp.json();
        setTestResult({ success: false, message: err.detail || "Send failed" });
      }
    } catch (e) {
      setTestResult({ success: false, message: "Could not reach notification service" });
    } finally {
      setTesting(false);
    }
  };

  const placeholders = {
    email:    "you@example.com",
    whatsapp: "+254712345678",
    sms:      "+254712345678",
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
      <h3 className="text-sm font-semibold text-slate-700">Test a channel</h3>
      <div className="flex gap-2">
        {["email", "whatsapp", "sms"].map(c => (
          <button
            key={c}
            onClick={() => setChannel(c)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all capitalize ${
              channel === c
                ? "bg-emerald-600 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {c === "email" ? <Mail className="w-3 h-3 inline mr-1" /> :
             c === "whatsapp" ? <MessageSquare className="w-3 h-3 inline mr-1" /> :
             <Phone className="w-3 h-3 inline mr-1" />}
            {c}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          value={recipient}
          onChange={e => setRecipient(e.target.value)}
          placeholder={placeholders[channel]}
          className="rounded-xl text-sm flex-1"
          onKeyDown={e => e.key === "Enter" && handleTest()}
        />
        <Button
          onClick={handleTest}
          disabled={testing || !recipient.trim()}
          size="sm"
          className="rounded-xl bg-emerald-600 hover:bg-emerald-700"
        >
          {testing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </Button>
      </div>
      {testResult && (
        <p className={`text-xs px-3 py-2 rounded-lg ${
          testResult.success
            ? "bg-emerald-50 text-emerald-700"
            : "bg-rose-50 text-rose-700"
        }`}>
          {testResult.success ? "✓ " : "✗ "}{testResult.message}
        </p>
      )}
    </div>
  );
}

// ----------------------------------------------------------
// Main AlertsPage
// ----------------------------------------------------------
export default function AlertsPage({ currentUser }) {
  const [previewing, setPreviewing] = useState(false);
  const [running,    setRunning]    = useState(false);
  const { toast } = useToast();

  const companyId = currentUser?.company_id;

  // Load channel status
  const { data: channelStatus } = useQuery({
    queryKey: ["alert-status"],
    queryFn: async () => {
      const resp = await fetch(`${RAILWAY_URL}/alerts/status`);
      return resp.json();
    },
    enabled: !!companyId,
    staleTime: 60000,
  });

  // Preview alerts (dry run)
  const { data: preview, refetch: refetchPreview, isFetching: previewLoading } = useQuery({
    queryKey: ["alert-preview", companyId],
    queryFn: async () => {
      const resp = await fetch(
        `${RAILWAY_URL}/alerts/preview?company_id=${companyId}`
      );
      return resp.json();
    },
    enabled: false,
  });

  const handlePreview = async () => {
    setPreviewing(true);
    await refetchPreview();
    setPreviewing(false);
  };

  const handleRunNow = async () => {
    setRunning(true);
    try {
      const resp = await fetch(`${RAILWAY_URL}/alerts/evaluate`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_id: companyId, dry_run: false }),
      });
      const result = await resp.json();
      toast({
        title: `Alert run complete`,
        description: `${result.alerts_fired} alerts · ${result.notifications_sent} notifications sent`,
      });
    } catch {
      toast({ title: "Alert run failed", variant: "destructive" });
    } finally {
      setRunning(false);
    }
  };

  const channels = channelStatus?.channels || {};
  const allAlerts = preview
    ? [
        ...(preview.critical || []),
        ...(preview.warning  || []),
        ...(preview.info     || []),
      ]
    : [];

  return (
    <div className="space-y-5 max-w-3xl mx-auto">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Bell className="w-5 h-5 text-emerald-600" />
            Operational Alerts
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Proactive intelligence — alerts run every 4 hours via Airflow
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="rounded-xl"
            onClick={handlePreview}
            disabled={previewing || !companyId}
          >
            {previewing
              ? <RefreshCw className="w-4 h-4 mr-1.5 animate-spin" />
              : <Play className="w-4 h-4 mr-1.5" />}
            Preview alerts
          </Button>
          <Button
            size="sm"
            className="rounded-xl bg-emerald-600 hover:bg-emerald-700"
            onClick={handleRunNow}
            disabled={running || !companyId}
          >
            {running
              ? <RefreshCw className="w-4 h-4 mr-1.5 animate-spin" />
              : <Send className="w-4 h-4 mr-1.5" />}
            Run now
          </Button>
        </div>
      </div>

      {/* Channel status */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4">
        <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-1.5">
          <Settings className="w-4 h-4" /> Notification channels
        </h3>
        <div className="grid grid-cols-3 gap-2">
          <ChannelBadge
            name="Email"
            icon={Mail}
            configured={channels.email?.configured}
            note={channels.email?.note}
          />
          <ChannelBadge
            name="WhatsApp"
            icon={MessageSquare}
            configured={channels.whatsapp?.configured}
            note={channels.whatsapp?.note}
          />
          <ChannelBadge
            name="SMS"
            icon={Phone}
            configured={channels.sms?.configured}
            note={channels.sms?.note}
          />
        </div>
        {channelStatus && !channels.email?.configured &&
         !channels.whatsapp?.configured && !channels.sms?.configured && (
          <p className="text-xs text-slate-400 mt-3 text-center">
            No channels configured. Set notification credentials in Railway environment variables.
          </p>
        )}
      </div>

      {/* Test channel */}
      {companyId && <TestChannelPanel companyId={companyId} />}

      {/* Alert preview */}
      {preview && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-700">
              Alert preview
              {preview.alert_count > 0 && (
                <span className="ml-2 px-2 py-0.5 bg-rose-100 text-rose-700 rounded-full text-[10px] font-bold">
                  {preview.alert_count} active
                </span>
              )}
            </h3>
            <span className="text-xs text-slate-400">Dry run — not sent</span>
          </div>

          {allAlerts.length === 0 ? (
            <div className="flex items-center gap-2 px-4 py-6 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-700 justify-center">
              <CheckCircle className="w-4 h-4" />
              <span className="text-sm font-medium">All clear — no alerts at this time</span>
            </div>
          ) : (
            <div className="space-y-2">
              {allAlerts.map((alert, i) => (
                <AlertCard key={i} alert={alert} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* How it works */}
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
        <h3 className="text-sm font-semibold text-slate-600 mb-2">How it works</h3>
        <div className="space-y-1.5 text-xs text-slate-500">
          <p>🕐 Every 4 hours, Airflow evaluates all alert rules against your analytics data</p>
          <p>🔴 Critical alerts → all configured channels immediately</p>
          <p>🟡 Warnings → preferred channel (email or WhatsApp)</p>
          <p>🔇 Frequency caps prevent duplicate alerts within the cap window</p>
          <p>📋 Every fired alert is logged to Base44 AlertLog for audit</p>
        </div>
      </div>
    </div>
  );
}
