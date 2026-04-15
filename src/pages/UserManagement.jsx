import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";

const RAILWAY_URL = "https://newsconseenwebapp-production.up.railway.app";
const RAILWAY_API_KEY = (import.meta["env"] || {})["VITE_RAILWAY_API_KEY"] || "";
const triggerETL = (entity) =>
  fetch(`${RAILWAY_URL}/load/${entity}-summary`, {
    method: "POST",
    headers: RAILWAY_API_KEY ? { "x-api-key": RAILWAY_API_KEY } : {},
  }).catch(() => {});
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Users, FileBarChart, CheckCircle2, Circle, Save, Loader2,
  ChevronDown, ChevronUp, UserPlus, Mail, CheckCircle, AlertCircle,
  Building2, Phone, ShieldCheck, Shield, ShieldAlert, RefreshCw, Search,
} from "lucide-react";

const ALL_APPS = [
  { id: "ClockInOut",          label: "Clock In / Out" },
  { id: "MedAdmin",            label: "Med Administration" },
  { id: "BarcodeScanner",      label: "Barcode Scanner" },
  { id: "StaffSchedule",       label: "Staff Scheduler" },
  { id: "LeaveRequest",        label: "Leave Request" },
  { id: "ExpenseClaim",        label: "Expense Claim" },
  { id: "IncidentReport",      label: "Incident Report" },
  { id: "VisitorLog",          label: "Visitor Log" },
  { id: "InspectionChecklist", label: "Inspection Checklist" },
  { id: "StockCounter",        label: "Stock Counter" },
  { id: "PurchaseOrder",       label: "Purchase Order" },
  { id: "MaintenanceRequest",  label: "Maintenance Request" },
  { id: "ShiftHandover",       label: "Shift Handover" },
  { id: "FieldVisitReport",    label: "Field Visit Report" },
  { id: "AttendanceRegister",  label: "Attendance Register" },
  { id: "TemperatureLog",      label: "Temperature Log" },
  { id: "CleaningSchedule",    label: "Cleaning Schedule" },
  { id: "DeliveryTracker",     label: "Delivery Tracker" },
  { id: "VehicleLog",          label: "Vehicle Log" },
  { id: "PettyCashLog",        label: "Petty Cash Log" },
  { id: "ReceiptScanner",      label: "Receipt Scanner" },
  { id: "BudgetTracker",       label: "Budget Tracker" },
  { id: "DonationTracker",     label: "Donation Tracker" },
  { id: "LicenseTracker",      label: "License Tracker" },
  { id: "DocumentExpiry",      label: "Document Expiry" },
  { id: "AssetRegister",       label: "Asset Register" },
  { id: "AssetMaintenance",    label: "Asset Maintenance" },
  { id: "GoodsReceived",       label: "Goods Received" },
  { id: "CarePlan",            label: "Care Plan" },
  { id: "FluidIntakeLog",      label: "Fluid Intake Log" },
  { id: "WoundCareLog",        label: "Wound Care Log" },
  { id: "FeeCollection",       label: "Fee Collection" },
  { id: "LibraryLog",          label: "Library Log" },
];

function Field({ label, required, children }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium text-slate-700">
        {label}{required && <span className="text-rose-500 ml-0.5">*</span>}
      </Label>
      {children}
    </div>
  );
}

function AppToggle({ app, selected, onToggle }) {
  const on = selected.includes(app.id);
  return (
    <button
      onClick={() => onToggle(app.id)}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-sm font-medium transition-all text-left
        ${on ? "bg-slate-900 border-slate-700 text-white" : "bg-white border-slate-200 text-slate-400 hover:border-slate-300"}`}
    >
      <span className={`flex-1 text-left ${on ? "text-white" : "text-slate-600"}`}>{app.label}</span>
      {on ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" /> : <Circle className="w-4 h-4 text-slate-300 shrink-0" />}
    </button>
  );
}

function ReportToggle({ report, selected, onToggle }) {
  const on = selected.includes(report.id);
  const typeColors = {
    financial: "bg-emerald-50 text-emerald-700", inventory: "bg-amber-50 text-amber-700",
    staff: "bg-blue-50 text-blue-700", client: "bg-purple-50 text-purple-700",
    performance: "bg-cyan-50 text-cyan-700", custom: "bg-slate-100 text-slate-600",
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

const statusBadgeColor = (s) => ({
  active:   "bg-emerald-50 text-emerald-700",
  invited:  "bg-amber-50 text-amber-700",
  inactive: "bg-rose-50 text-rose-600",
}[s] || "bg-slate-100 text-slate-500");

function UserAppCard({ user, accessRecord, allReports, onSave, saving, enterprises, onAssignCompany, onDeactivate, isSuperAdmin, currentUser }) {
  const initialApps = accessRecord?.allowed_apps ?? [];
  const initialReports = accessRecord?.allowed_reports ?? [];
  const [selectedApps, setSelectedApps] = useState(initialApps);
  const [selectedReports, setSelectedReports] = useState(initialReports);
  const [appsOpen, setAppsOpen] = useState(false);
  const [reportsOpen, setReportsOpen] = useState(false);
  const [companyId, setCompanyId] = useState(user.company_id || "");
  const [assigningCompany, setAssigningCompany] = useState(false);
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);

  useEffect(() => {
    setSelectedApps(accessRecord?.allowed_apps ?? []);
    setSelectedReports(accessRecord?.allowed_reports ?? []);
  }, [accessRecord]);

  useEffect(() => {
    setCompanyId(user.company_id || "");
  }, [user.company_id]);

  const toggleApp = (id) => setSelectedApps((s) => s.includes(id) ? s.filter((a) => a !== id) : [...s, id]);
  const toggleReport = (id) => setSelectedReports((s) => s.includes(id) ? s.filter((r) => r !== id) : [...s, id]);

  const handleAssignCompany = async () => {
    setAssigningCompany(true);
    await onAssignCompany(user, companyId);
    setAssigningCompany(false);
  };

  const assignableEnterprises = isSuperAdmin
    ? enterprises
    : enterprises.filter((e) => e.id === currentUser?.company_id);

  const isDirty =
    JSON.stringify([...selectedApps].sort()) !== JSON.stringify([...initialApps].sort()) ||
    JSON.stringify([...selectedReports].sort()) !== JSON.stringify([...initialReports].sort());

  const publishedReports = allReports.filter((r) => r.status === "published");
  const assignedEnterprise = enterprises.find((e) => e.id === user.company_id);
  const isSelf = user.email === currentUser?.email;
  const isInactive = user.status === "inactive";

  return (
    <Card className={`p-5 space-y-4 ${isInactive ? "opacity-60" : ""}`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-slate-800 truncate">{user.full_name || "—"}</p>
          <p className="text-xs text-slate-400 truncate">{user.email}</p>
          {assignedEnterprise ? (
            <p className="text-xs text-emerald-600 flex items-center gap-1 mt-0.5">
              <Building2 className="w-3 h-3" /> {assignedEnterprise.enterprise_name}
            </p>
          ) : (
            <p className="text-xs text-amber-500 flex items-center gap-1 mt-0.5">
              <ShieldAlert className="w-3 h-3" /> No enterprise assigned
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <Badge className={
            user.role === "super_admin" ? "bg-emerald-50 text-emerald-700" :
            user.role === "admin" ? "bg-violet-50 text-violet-700" :
            "bg-slate-100 text-slate-500"
          }>
            {user.role || "user"}
          </Badge>
          <Badge className={statusBadgeColor(user.status || "active")}>
            {user.status || "active"}
          </Badge>
        </div>
      </div>

      {/* Enterprise assignment */}
      <div className="space-y-2">
        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Enterprise</p>
        <div className="flex gap-2">
          <Select value={companyId} onValueChange={setCompanyId}>
            <SelectTrigger className="rounded-xl flex-1 text-sm">
              <SelectValue placeholder="Assign enterprise..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">— None —</SelectItem>
              {assignableEnterprises.map((e) => (
                <SelectItem key={e.id} value={e.id}>{e.enterprise_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {companyId !== (user.company_id || "") && (
            <Button size="sm" onClick={handleAssignCompany} disabled={assigningCompany}
              className="bg-emerald-600 hover:bg-emerald-700 rounded-xl shrink-0">
              {assigningCompany ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            </Button>
          )}
        </div>
      </div>

      {/* Apps (collapsible) */}
      <div className="space-y-2">
        <button
          onClick={() => setAppsOpen((o) => !o)}
          className="w-full flex items-center justify-between text-[11px] font-semibold text-slate-400 uppercase tracking-wider hover:text-slate-600 transition-colors"
        >
          <span>
            Apps
            <span className="normal-case ml-1.5 bg-slate-100 text-slate-600 rounded-full px-1.5 py-0.5 text-[10px]">
              {selectedApps.length} enabled
            </span>
          </span>
          {appsOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
        {appsOpen && (
          <div className="space-y-1.5 max-h-64 overflow-y-auto pr-0.5">
            {ALL_APPS.map((app) => (
              <AppToggle key={app.id} app={app} selected={selectedApps} onToggle={toggleApp} />
            ))}
          </div>
        )}
      </div>

      {/* Reports (collapsible) */}
      <div className="space-y-2">
        <button
          onClick={() => setReportsOpen((o) => !o)}
          className="w-full flex items-center justify-between text-[11px] font-semibold text-slate-400 uppercase tracking-wider hover:text-slate-600 transition-colors"
        >
          <span>
            Reports
            {selectedReports.length > 0 && (
              <span className="normal-case ml-1 bg-violet-100 text-violet-700 rounded-full px-1.5 py-0.5 text-[10px]">{selectedReports.length}</span>
            )}
          </span>
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
        <Button onClick={() => onSave(user, selectedApps, selectedReports, accessRecord)}
          disabled={saving} className="w-full bg-emerald-600 hover:bg-emerald-700 rounded-xl" size="sm">
          {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
          Save
        </Button>
      )}

      {/* Deactivate / Reactivate */}
      {!isSelf && (
        <div className="pt-1 border-t border-slate-100">
          {!confirmDeactivate ? (
            <button
              onClick={() => setConfirmDeactivate(true)}
              className={`text-xs w-full text-left transition-colors ${isInactive ? "text-emerald-600 hover:text-emerald-800" : "text-slate-400 hover:text-rose-500"}`}
            >
              {isInactive ? "↑ Reactivate user" : "Deactivate user"}
            </button>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-slate-600">
                {isInactive ? `Reactivate ${user.full_name || user.email}?` : `Deactivate ${user.full_name || user.email}? They will lose access immediately.`}
              </p>
              <div className="flex gap-2">
                <button onClick={() => { onDeactivate(user, isInactive ? "active" : "inactive"); setConfirmDeactivate(false); }}
                  className={`text-xs font-semibold px-2 py-1 rounded-lg transition-colors ${isInactive ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100" : "bg-rose-50 text-rose-600 hover:bg-rose-100"}`}>
                  {isInactive ? "Yes, reactivate" : "Yes, deactivate"}
                </button>
                <button onClick={() => setConfirmDeactivate(false)}
                  className="text-xs text-slate-400 hover:text-slate-600 px-2 py-1 rounded-lg hover:bg-slate-50 transition-colors">
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function InviteForm({ enterprises, isSuperAdmin, currentUser, onSuccess }) {
  const [form, setForm] = useState({ first_name: "", last_name: "", email: "", phone: "", company_id: "", role: "user" });
  const [status, setStatus] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const effectiveCompanyId = isSuperAdmin ? form.company_id : currentUser?.company_id;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.email || !form.first_name || !form.last_name) return;
    setStatus("loading");
    setErrorMsg("");
    try {
      await base44.users.inviteUser(form.email, form.role);
      if (effectiveCompanyId) {
        await base44.entities.PendingInvitation.create({
          email: form.email,
          company_id: effectiveCompanyId,
          role: form.role,
          invited_by: currentUser?.email,
        });
      }
      await base44.entities.Person.create({
        first_name: form.first_name, last_name: form.last_name, email: form.email,
        phone: form.phone || undefined, person_type: "staff", status: "active",
        company_id: effectiveCompanyId,
      });
      triggerETL("people");
      setStatus("success");
      setForm({ first_name: "", last_name: "", email: "", phone: "", company_id: "", role: "user" });
      onSuccess?.();
    } catch (err) {
      setStatus("error");
      setErrorMsg(err?.message || "Failed to send invitation. The user may already exist.");
    }
  };

  const myEnterprise = enterprises.find((e) => e.id === currentUser?.company_id);

  return (
    <Card className="p-6 space-y-5">
      <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
        <UserPlus className="w-4 h-4 text-emerald-600" />
        <span className="text-sm font-semibold text-slate-700">Invite New User</span>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="First Name" required>
            <Input value={form.first_name} onChange={(e) => set("first_name", e.target.value)} className="rounded-xl" placeholder="John" />
          </Field>
          <Field label="Last Name" required>
            <Input value={form.last_name} onChange={(e) => set("last_name", e.target.value)} className="rounded-xl" placeholder="Smith" />
          </Field>
        </div>
        <Field label="Email Address" required>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} className="rounded-xl pl-9" placeholder="john@company.com" />
          </div>
        </Field>
        <Field label="Phone Number">
          <div className="relative">
            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input type="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} className="rounded-xl pl-9" placeholder="+1 555 000 0000" />
          </div>
        </Field>

        {/* Enterprise — super_admin picks, admin sees read-only */}
        {isSuperAdmin ? (
          <Field label="Assign to Enterprise">
            <div className="relative">
              <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 z-10 pointer-events-none" />
              <Select value={form.company_id} onValueChange={(v) => set("company_id", v)}>
                <SelectTrigger className="rounded-xl pl-9">
                  <SelectValue placeholder="Select enterprise..." />
                </SelectTrigger>
                <SelectContent>
                  {enterprises.map((e) => (
                    <SelectItem key={e.id} value={e.id}>{e.enterprise_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </Field>
        ) : (
          <div className="bg-slate-50 rounded-xl px-4 py-3 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-slate-400 shrink-0" />
            <div>
              <p className="text-xs text-slate-400">Will be added to your enterprise</p>
              <p className="text-sm font-medium text-slate-700">{myEnterprise?.enterprise_name || "Your enterprise"}</p>
            </div>
          </div>
        )}

        <Field label="Role" required>
          <Select value={form.role} onValueChange={(v) => set("role", v)}>
            <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="user">User — sees only what admin allows</SelectItem>
              <SelectItem value="admin">Admin — manages their company's data</SelectItem>
              {isSuperAdmin && <SelectItem value="super_admin">Super Admin — sees all companies</SelectItem>}
            </SelectContent>
          </Select>
        </Field>

        {status === "success" && (
          <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-sm text-emerald-700">
            <CheckCircle className="w-4 h-4 shrink-0" /> Invitation sent successfully!
          </div>
        )}
        {status === "error" && (
          <div className="flex items-center gap-2 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 text-sm text-rose-700">
            <AlertCircle className="w-4 h-4 shrink-0" /> {errorMsg}
          </div>
        )}
        <Button type="submit" disabled={status === "loading" || !form.email || !form.first_name || !form.last_name}
          className="w-full bg-emerald-600 hover:bg-emerald-700 rounded-xl">
          {status === "loading" ? "Sending..." : <><UserPlus className="w-4 h-4 mr-2" /> Send Invitation</>}
        </Button>
      </form>
    </Card>
  );
}

export default function UserManagement() {
  const { data: currentUser = null } = useQuery({
    queryKey: ["currentUser"],
    queryFn: () => base44.auth.me(),
    staleTime: 0,
    refetchOnMount: "always",
  });
  const [savedMsg, setSavedMsg] = useState(null);
  const [savingEmail, setSavingEmail] = useState(null);
  const [search, setSearch] = useState("");
  const [filterRole, setFilterRole] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const qc = useQueryClient();

  const isAdmin = currentUser?.role === "admin" || currentUser?.role === "super_admin";
  const isSuperAdmin = currentUser?.role === "super_admin";

  const { data: appUsers = [] } = useQuery({
    queryKey: ["appUsers", currentUser?.company_id],
    queryFn: () => isSuperAdmin
      ? base44.entities.User.list()
      : base44.entities.User.filter({ company_id: currentUser.company_id }),
    enabled: !!currentUser && isAdmin,
    staleTime: 0,
    refetchOnMount: "always",
  });

  const { data: accessRecords = [] } = useQuery({
    queryKey: ["userAppAccess", currentUser?.company_id],
    queryFn: () => isSuperAdmin
      ? base44.entities.UserAppAccess.list()
      : base44.entities.UserAppAccess.filter({ company_id: currentUser.company_id }),
    enabled: !!currentUser && isAdmin,
    staleTime: 0,
    refetchOnMount: "always",
  });

  const { data: allReports = [] } = useQuery({
    queryKey: ["reports_mgmt", currentUser?.company_id],
    queryFn: () => isSuperAdmin
      ? base44.entities.Report.list("-created_date")
      : base44.entities.Report.filter({ company_id: currentUser.company_id }),
    enabled: !!currentUser && isAdmin,
    staleTime: 0,
    refetchOnMount: "always",
  });

  const { data: enterprises = [] } = useQuery({
    queryKey: ["enterprises-usermgmt", currentUser?.company_id],
    queryFn: () => isSuperAdmin
      ? base44.entities.Enterprise.list()
      : base44.entities.Enterprise.filter({ company_id: currentUser.company_id }),
    enabled: !!currentUser && isAdmin,
    staleTime: 0,
    refetchOnMount: "always",
  });

  const saveMut = useMutation({
    mutationFn: async ({ user, selectedApps, selectedReports, record }) => {
      const payload = {
        user_email: user.email,
        user_name: user.full_name || user.email,
        allowed_apps: selectedApps,
        allowed_reports: selectedReports,
        company_id: user.company_id || currentUser?.company_id,
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

  const deactivateMut = useMutation({
    mutationFn: ({ userId, status }) => base44.entities.User.update(userId, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["appUsers"] }),
  });

  const handleSave = (user, selectedApps, selectedReports, record) => {
    setSavingEmail(user.email);
    saveMut.mutate({ user, selectedApps, selectedReports, record });
  };

  const handleAssignCompany = async (user, companyId) => {
    const val = companyId === "none" ? null : companyId || null;
    await base44.entities.User.update(user.id, { company_id: val });
    qc.invalidateQueries({ queryKey: ["appUsers"] });
  };

  const handleDeactivate = (user, newStatus) => {
    deactivateMut.mutate({ userId: user.id, status: newStatus });
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

  const allManagerable = appUsers.filter((u) => u.role !== "super_admin");
  const unassignedCount = allManagerable.filter((u) => !u.company_id).length;
  const adminCount = allManagerable.filter((u) => u.role === "admin").length;
  const staffCount = allManagerable.filter((u) => u.role === "user").length;

  const manageableUsers = allManagerable
    .filter((u) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return u.email?.toLowerCase().includes(q) || u.full_name?.toLowerCase().includes(q);
    })
    .filter((u) => filterRole === "all" || u.role === filterRole)
    .filter((u) => {
      if (filterStatus === "unassigned") return !u.company_id;
      if (filterStatus === "all") return true;
      return (u.status || "active") === filterStatus;
    });

  const clearFilters = () => { setSearch(""); setFilterRole("all"); setFilterStatus("all"); };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
          <Users className="w-6 h-6 text-slate-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">User Management</h1>
          <p className="text-sm text-slate-400 mt-0.5">Invite users and control which apps and reports they can access.</p>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { icon: Users,       color: "bg-slate-100 text-slate-600",   value: allManagerable.length, label: "Total Users" },
          { icon: ShieldCheck, color: "bg-violet-50 text-violet-600",  value: adminCount,             label: "Admins" },
          { icon: Shield,      color: "bg-blue-50 text-blue-600",      value: staffCount,             label: "Staff" },
          { icon: ShieldAlert, color: unassignedCount > 0 ? "bg-amber-50 text-amber-600" : "bg-slate-100 text-slate-500", value: unassignedCount, label: "No Enterprise" },
        ].map(({ icon: Icon, color, value, label }) => (
          <div key={label} className="bg-white border border-slate-100 rounded-2xl px-4 py-3 flex items-center gap-3">
            <div className={`p-2 rounded-xl ${color}`}><Icon className="w-4 h-4" /></div>
            <div>
              <p className="text-xl font-black text-slate-800 leading-none">{value}</p>
              <p className="text-xs text-slate-500 mt-0.5">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Unassigned warning banner */}
      {unassignedCount > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-amber-800">⚠️ {unassignedCount} {unassignedCount === 1 ? "user has" : "users have"} no enterprise assigned</p>
            <p className="text-xs text-amber-700 mt-0.5">These users are blocked from accessing any data until assigned to an enterprise.</p>
          </div>
          <button
            onClick={() => setFilterStatus("unassigned")}
            className="shrink-0 text-xs font-semibold text-amber-700 hover:text-amber-900 whitespace-nowrap transition-colors">
            Show only →
          </button>
        </div>
      )}

      {/* Invite form */}
      <InviteForm
        enterprises={enterprises}
        isSuperAdmin={isSuperAdmin}
        currentUser={currentUser}
        onSuccess={() => qc.invalidateQueries({ queryKey: ["appUsers"] })}
      />

      {/* Registered users section */}
      <div>
        <div className="flex items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-slate-500" />
            <h2 className="text-sm font-semibold text-slate-700">Registered Users ({allManagerable.length})</h2>
          </div>
          <button
            onClick={() => { qc.invalidateQueries({ queryKey: ["appUsers"] }); qc.invalidateQueries({ queryKey: ["userAppAccess"] }); }}
            className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors" title="Refresh">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {/* Search + filter row */}
        <div className="flex flex-col sm:flex-row gap-2 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or email..."
              className="rounded-xl pl-9 text-sm"
            />
          </div>
          <Select value={filterRole} onValueChange={setFilterRole}>
            <SelectTrigger className="rounded-xl text-sm w-full sm:w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All roles</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
              <SelectItem value="user">User</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="rounded-xl text-sm w-full sm:w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All users</SelectItem>
              <SelectItem value="unassigned">No enterprise</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {allManagerable.length > 0 && (
          <p className="text-xs text-slate-400 mb-3">
            Showing {manageableUsers.length} of {allManagerable.length} users
          </p>
        )}

        {savedMsg && (
          <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-sm text-emerald-700 mb-4">
            <CheckCircle2 className="w-4 h-4" /> {savedMsg}
          </div>
        )}

        {/* Empty states */}
        {allManagerable.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p>No users yet — invite someone above.</p>
          </div>
        ) : manageableUsers.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            <Users className="w-8 h-8 mx-auto mb-3 opacity-30" />
            <p className="mb-3">No users match your filters.</p>
            <button onClick={clearFilters} className="text-sm text-emerald-600 hover:underline">Clear filters</button>
          </div>
        ) : (
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
                  enterprises={enterprises}
                  onAssignCompany={handleAssignCompany}
                  onDeactivate={handleDeactivate}
                  isSuperAdmin={isSuperAdmin}
                  currentUser={currentUser}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}