import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, Clock, Pill, FileBarChart, CheckCircle2, Circle, Save, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";

const ALL_APPS = [
  { id: "ClockInOut", label: "Clock In / Out", icon: Clock, color: "bg-slate-800", accent: "text-emerald-400" },
  { id: "MedAdmin",   label: "Med Administration", icon: Pill, color: "bg-blue-800", accent: "text-blue-300" },
];

function AppToggle({ app, selected, onToggle }) {
  const Icon = app.icon;
  const on = selected.includes(app.id);
  return (
    <button
      onClick={() => onToggle(app.id)}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-medium transition-all text-left
        ${on ? "bg-slate-900 border-slate-700 text-white" : "bg-white border-slate-200 text-slate-400 hover:border-slate-300"}`}
    >
      <div className={`w-8 h-8 rounded-lg ${on ? app.color : "bg-slate-100"} flex items-center justify-center shrink-0`}>
        <Icon className={`w-4 h-4 ${on ? app.accent : "text-slate-400"}`} />
      </div>
      <span className={on ? "text-white" : "text-slate-600"}>{app.label}</span>
      <span className="ml-auto">
        {on ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <Circle className="w-4 h-4 text-slate-300" />}
      </span>
    </button>
  );
}

function ReportToggle({ report, selected, onToggle }) {
  const on = selected.includes(report.id);
  const typeColors = {
    financial: "bg-emerald-50 text-emerald-700",
    inventory: "bg-amber-50 text-amber-700",
    staff: "bg-blue-50 text-blue-700",
    client: "bg-purple-50 text-purple-700",
    performance: "bg-cyan-50 text-cyan-700",
    custom: "bg-slate-100 text-slate-600",
  };
  return (
    <button
      onClick={() => onToggle(report.id)}
      className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl border text-sm transition-all text-left
        ${on ? "bg-violet-900 border-violet-700 text-white" : "bg-white border-slate-200 text-slate-500 hover:border-slate-300"}`}
    >
      <FileBarChart className={`w-4 h-4 shrink-0 ${on ? "text-violet-300" : "text-slate-300"}`} />
      <div className="flex-1 min-w-0">
        <p className={`font-medium truncate ${on ? "text-white" : "text-slate-700"}`}>{report.title}</p>
        <Badge className={`text-[10px] mt-0.5 ${on ? "bg-white/10 text-white border-0" : typeColors[report.type]}`}>
          {report.type || "custom"}
        </Badge>
      </div>
      <span className="ml-auto shrink-0">
        {on ? <CheckCircle2 className="w-4 h-4 text-violet-300" /> : <Circle className="w-4 h-4 text-slate-300" />}
      </span>
    </button>
  );
}

function UserAppCard({ user, accessRecord, allReports, onSave, saving }) {
  const initialApps = accessRecord?.allowed_apps ?? [];
  const initialReports = accessRecord?.allowed_reports ?? [];
  const [selectedApps, setSelectedApps] = useState(initialApps);
  const [selectedReports, setSelectedReports] = useState(initialReports);
  const [reportsOpen, setReportsOpen] = useState(false);

  useEffect(() => {
    setSelectedApps(accessRecord?.allowed_apps ?? []);
    setSelectedReports(accessRecord?.allowed_reports ?? []);
  }, [accessRecord]);

  const toggleApp = (id) => setSelectedApps((s) => s.includes(id) ? s.filter((a) => a !== id) : [...s, id]);
  const toggleReport = (id) => setSelectedReports((s) => s.includes(id) ? s.filter((r) => r !== id) : [...s, id]);

  const isDirty =
    JSON.stringify([...selectedApps].sort()) !== JSON.stringify([...initialApps].sort()) ||
    JSON.stringify([...selectedReports].sort()) !== JSON.stringify([...initialReports].sort());

  const publishedReports = allReports.filter((r) => r.status === "published");

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-slate-800">{user.full_name || "—"}</p>
          <p className="text-xs text-slate-400">{user.email}</p>
        </div>
        <Badge className={
          user.role === "super_admin" ? "bg-emerald-50 text-emerald-700" :
          user.role === "admin" ? "bg-violet-50 text-violet-700" :
          "bg-slate-100 text-slate-500"
        }>
          {user.role || "user"}
        </Badge>
      </div>

      {/* Apps */}
      <div className="space-y-2">
        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Apps</p>
        {ALL_APPS.map((app) => (
          <AppToggle key={app.id} app={app} selected={selectedApps} onToggle={toggleApp} />
        ))}
      </div>

      {/* Reports */}
      <div className="space-y-2">
        <button
          onClick={() => setReportsOpen((o) => !o)}
          className="w-full flex items-center justify-between text-[11px] font-semibold text-slate-400 uppercase tracking-wider hover:text-slate-600 transition-colors"
        >
          <span>Reports {selectedReports.length > 0 && <span className="normal-case ml-1 bg-violet-100 text-violet-700 rounded-full px-1.5 py-0.5">{selectedReports.length}</span>}</span>
          {reportsOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
        {reportsOpen && (
          <div className="space-y-1.5 max-h-64 overflow-y-auto pr-0.5">
            {publishedReports.length === 0 ? (
              <p className="text-xs text-slate-400 py-2 text-center">No published reports available.</p>
            ) : (
              publishedReports.map((r) => (
                <ReportToggle key={r.id} report={r} selected={selectedReports} onToggle={toggleReport} />
              ))
            )}
          </div>
        )}
      </div>

      {isDirty && (
        <Button
          onClick={() => onSave(user, selectedApps, selectedReports, accessRecord)}
          disabled={saving}
          className="w-full bg-emerald-600 hover:bg-emerald-700 rounded-xl"
          size="sm"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
          Save
        </Button>
      )}
    </Card>
  );
}

export default function UserManagement() {
  const [currentUser, setCurrentUser] = useState(null);
  const [savedMsg, setSavedMsg] = useState(null);
  const [savingEmail, setSavingEmail] = useState(null);
  const qc = useQueryClient();

  useEffect(() => { base44.auth.me().then(setCurrentUser).catch(() => {}); }, []);

  const isAdmin = currentUser?.role === "admin" || currentUser?.role === "super_admin";

  const { data: appUsers = [] } = useQuery({
    queryKey: ["appUsers"],
    queryFn: () => base44.entities.User.list(),
    enabled: !!currentUser && isAdmin,
  });

  const { data: accessRecords = [] } = useQuery({
    queryKey: ["userAppAccess"],
    queryFn: () => base44.entities.UserAppAccess.list(),
    enabled: !!currentUser && isAdmin,
  });

  const { data: allReports = [] } = useQuery({
    queryKey: ["reports_mgmt"],
    queryFn: () => base44.entities.Report.list("-created_date"),
    enabled: !!currentUser && isAdmin,
  });

  const saveMut = useMutation({
    mutationFn: async ({ user, selectedApps, selectedReports, record }) => {
      const payload = {
        user_email: user.email,
        user_name: user.full_name || user.email,
        allowed_apps: selectedApps,
        allowed_reports: selectedReports,
      };
      if (record) return base44.entities.UserAppAccess.update(record.id, payload);
      return base44.entities.UserAppAccess.create(payload);
    },
    onSuccess: (_, { user }) => {
      qc.invalidateQueries({ queryKey: ["userAppAccess"] });
      setSavingEmail(null);
      setSavedMsg(`Saved for ${user.full_name || user.email}`);
      setTimeout(() => setSavedMsg(null), 3000);
    },
  });

  const handleSave = (user, selectedApps, selectedReports, record) => {
    setSavingEmail(user.email);
    saveMut.mutate({ user, selectedApps, selectedReports, record });
  };

  if (!currentUser) return null;

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-slate-400">
        <Users className="w-8 h-8" />
        <p className="font-medium">Admin access required.</p>
      </div>
    );
  }

  const manageableUsers = appUsers.filter((u) => u.role !== "super_admin");

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
          <Users className="w-6 h-6 text-slate-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">User Management</h1>
          <p className="text-sm text-slate-400 mt-0.5">Control which apps and reports each user can access.</p>
        </div>
      </div>

      {savedMsg && (
        <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-sm text-emerald-700">
          <CheckCircle2 className="w-4 h-4" /> {savedMsg}
        </div>
      )}

      {manageableUsers.length === 0 && (
        <div className="text-center py-16 text-slate-400">
          <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>No users found. Invite users first.</p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {manageableUsers.map((u) => {
          const record = accessRecords.find((r) => r.user_email === u.email);
          return (
            <UserAppCard
              key={u.id}
              user={u}
              accessRecord={record}
              allReports={allReports}
              onSave={handleSave}
              saving={savingEmail === u.email}
            />
          );
        })}
      </div>
    </div>
  );
}