import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  ShieldCheck, Users, Settings, Save, AlertCircle, Eye,
  Database, Link2, ClipboardList, ArrowLeftRight, LayoutDashboard,
  Wrench, RefreshCw, CheckCircle2, Loader2
} from "lucide-react";
import { ALL_ADMIN_PAGES } from "@/components/shared/usePermissions";
import LayerCard from "@/components/permissions/LayerCard";
import PageAccessPanel from "@/components/permissions/PageAccessPanel";

const ALL_PAGES = [
  "Dashboard", "Enterprises", "People", "Products", "Services", "Addresses",
  "Relationships", "Tasks", "Transactions", "Reports", "Applications",
  "ClockInOut", "MedAdmin", "UserManagement", "InviteUser", "Permissions",
];

const USER_FORBIDDEN_PAGES = ["InviteUser", "Permissions", "UserManagement"];

const DEFAULT_PERMS = {
  admin: {
    allowed_pages: ALL_ADMIN_PAGES,
    data_scope: "team",
    layer1_master_data:  { can_view: true, can_create: true,  can_edit: true,  can_archive: true },
    layer2_relationships:{ can_view: true, can_assign: true,  can_unassign: true },
    layer3_tasks:        { can_view: true, can_create: true,  can_assign: true,  can_update_status: true, can_complete: true },
    layer4_transactions: { can_view: true, can_create_draft: true, can_post: true, can_void: true },
    layer5_dashboards:   { can_view: true },
    can_create: true, can_edit: true, can_delete: false,
    can_post_transactions: true, can_trigger_transactions: true,
  },
  user: {
    allowed_pages: ["Dashboard", "Tasks"],
    data_scope: "own",
    layer1_master_data:  { can_view: true,  can_create: false, can_edit: false, can_archive: false },
    layer2_relationships:{ can_view: true,  can_assign: false, can_unassign: false },
    layer3_tasks:        { can_view: true,  can_create: false, can_assign: false, can_update_status: true, can_complete: true },
    layer4_transactions: { can_view: false, can_create_draft: false, can_post: false, can_void: false },
    layer5_dashboards:   { can_view: false },
    can_create: false, can_edit: false, can_delete: false,
    can_post_transactions: false, can_trigger_transactions: false,
  },
};

const LAYERS = [
  {
    key: "layer1_master_data",
    layerNumber: 1,
    title: "Master Data",
    subtitle: "People · Enterprises · Items · Services · Addresses",
    color: "purple",
    icon: Database,
    fields: [
      { key: "can_view",    label: "View",    desc: "See master records", alwaysOn: true },
      { key: "can_create",  label: "Create",  desc: "Add new master records" },
      { key: "can_edit",    label: "Edit",    desc: "Modify existing records" },
      { key: "can_archive", label: "Archive", desc: "Deactivate without deleting" },
    ],
    adminFields: [
      { key: "can_view",    label: "View",    desc: "View own enterprise master records", alwaysOn: true },
      { key: "can_create",  label: "Create",  desc: "Add master records in own enterprise only" },
      { key: "can_edit",    label: "Edit",    desc: "Edit own enterprise records only" },
      { key: "can_archive", label: "Archive", desc: "Archive own enterprise records only" },
    ],
  },
  {
    key: "layer2_relationships",
    layerNumber: 2,
    title: "Relationships",
    subtitle: "Person↔Enterprise · Item↔Enterprise · Item↔Person",
    color: "blue",
    icon: Link2,
    fields: [
      { key: "can_view",     label: "View",     desc: "See assignments", alwaysOn: true },
      { key: "can_assign",   label: "Assign",   desc: "Create new relationships" },
      { key: "can_unassign", label: "Unassign", desc: "End relationships (history preserved)" },
    ],
  },
  {
    key: "layer3_tasks",
    layerNumber: 3,
    title: "Tasks",
    subtitle: "What should be done — not what changed",
    color: "sky",
    icon: ClipboardList,
    fields: [
      { key: "can_view",          label: "View",          desc: "See tasks", alwaysOn: true },
      { key: "can_create",        label: "Create",        desc: "Add new tasks" },
      { key: "can_assign",        label: "Assign",        desc: "Assign tasks to others" },
      { key: "can_update_status", label: "Update Status", desc: "Change task progress" },
      { key: "can_complete",      label: "Complete",      desc: "Mark tasks as done" },
    ],
  },
  {
    key: "layer4_transactions",
    layerNumber: 4,
    title: "Transactions",
    subtitle: "What actually happened — auditable & reversible",
    color: "rose",
    icon: ArrowLeftRight,
    fields: [
      { key: "can_view",         label: "View",         desc: "See transaction records" },
      { key: "can_create_draft", label: "Create Draft", desc: "Draft stock / sales / expenses" },
      { key: "can_post",         label: "Post",         desc: "Finalize and post transactions" },
      { key: "can_void",         label: "Void",         desc: "Reverse posted transactions" },
    ],
  },
  {
    key: "layer5_dashboards",
    layerNumber: 5,
    title: "Dashboards & Reports",
    subtitle: "Read-only intelligence — never a write surface",
    color: "amber",
    icon: LayoutDashboard,
    fields: [
      { key: "can_view", label: "View", desc: "Access dashboards and reports" },
    ],
  },
];

function PermissionCard({ title, subtitle, icon: Icon, roleKey, perm, onSave, availablePages, isSaving, isSuperAdmin: isSuper }) {
  const defaults = DEFAULT_PERMS[roleKey];
  const [local, setLocal] = useState(null);

  useEffect(() => {
    if (!perm && !local) {
      setLocal({ ...defaults });
      return;
    }
    if (perm) {
      setLocal({
        allowed_pages: perm.allowed_pages?.length ? perm.allowed_pages : defaults.allowed_pages,
        data_scope: perm.data_scope ?? defaults.data_scope,
        layer1_master_data:   { ...defaults.layer1_master_data,   ...(perm.layer1_master_data   || {}) },
        layer2_relationships: { ...defaults.layer2_relationships, ...(perm.layer2_relationships || {}) },
        layer3_tasks:         { ...defaults.layer3_tasks,         ...(perm.layer3_tasks         || {}) },
        layer4_transactions:  { ...defaults.layer4_transactions,  ...(perm.layer4_transactions  || {}) },
        layer5_dashboards:    { ...defaults.layer5_dashboards,    ...(perm.layer5_dashboards    || {}) },
        can_create: perm.can_create ?? defaults.can_create,
        can_edit:   perm.can_edit   ?? defaults.can_edit,
        can_delete: perm.can_delete ?? defaults.can_delete,
        can_post_transactions:     perm.can_post_transactions     ?? defaults.can_post_transactions,
        can_trigger_transactions:  perm.can_trigger_transactions  ?? defaults.can_trigger_transactions,
      });
    }
  }, [perm]);

  if (!local) return null;

  const togglePage = (key) =>
    setLocal((l) => ({
      ...l,
      allowed_pages: l.allowed_pages.includes(key)
        ? l.allowed_pages.filter((p) => p !== key)
        : [...l.allowed_pages, key],
    }));

  const setLayerFlag = (layerKey, fieldKey, val) =>
    setLocal((l) => ({ ...l, [layerKey]: { ...(l[layerKey] || {}), [fieldKey]: val } }));

  return (
    <Card className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
        <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
          <Icon className="w-5 h-5 text-emerald-600" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-slate-800">{title}</h3>
          <p className="text-xs text-slate-400">{subtitle}</p>
        </div>
      </div>

      {/* Page Access */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Eye className="w-4 h-4 text-slate-400" />
          <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Page Access</p>
        </div>
        <PageAccessPanel
          selected={local.allowed_pages}
          onChange={togglePage}
          available={availablePages}
          locked={[]}
        />
      </div>

      {/* Data Scope */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Database className="w-4 h-4 text-slate-400" />
          <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Data Visibility Scope</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {[
            { val: "own",  label: "Own only",       desc: "Only their own records" },
            { val: "team", label: "Team (Company)",  desc: "All records in their enterprise" },
            ...(isSuper ? [{ val: "all", label: "All companies", desc: "Super admin use only" }] : []),
          ].map(({ val, label, desc }) => (
            <button
              key={val}
              onClick={() => setLocal((l) => ({ ...l, data_scope: val }))}
              className={`flex-1 min-w-[100px] px-3 py-2.5 rounded-xl border text-sm font-medium transition-all text-left ${
                local.data_scope === val
                  ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                  : "bg-white border-slate-200 text-slate-500 hover:border-slate-300"
              }`}
            >
              <span className="block font-semibold">{label}</span>
              <span className="text-[11px] opacity-70">{desc}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 5 Permission Layers */}
      <div>
        <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-3">Permission Layers</p>
        <div className="space-y-3">
          {LAYERS.map((layer) => {
            const fields = (roleKey === "admin" && layer.adminFields) ? layer.adminFields : layer.fields;
            return (
              <LayerCard
                key={layer.key}
                layerNumber={layer.layerNumber}
                title={layer.title}
                subtitle={layer.subtitle}
                color={layer.color}
                fields={fields}
                values={local[layer.key]}
                onChange={(fieldKey, val) => setLayerFlag(layer.key, fieldKey, val)}
              />
            );
          })}
        </div>
      </div>

      <Button
        onClick={() => onSave(local)}
        disabled={isSaving}
        className="w-full bg-emerald-600 hover:bg-emerald-700 rounded-xl"
      >
        <Save className="w-4 h-4 mr-2" />
        {isSaving ? "Saving…" : "Save Permissions"}
      </Button>
    </Card>
  );
}

export default function Permissions() {
  const [currentUser, setCurrentUser] = useState(null);
  const [savedMsg, setSavedMsg] = useState(null);
  const qc = useQueryClient();

  useEffect(() => { base44.auth.me().then(setCurrentUser).catch(() => {}); }, []);

  const isSuperAdmin = currentUser?.role === "super_admin";
  const isAdmin = currentUser?.role === "admin" || isSuperAdmin;
  const companyId = currentUser?.company_id;

  const { data: perms = [] } = useQuery({
    queryKey: ["permissions", companyId],
    queryFn: () => isSuperAdmin
      ? base44.entities.RolePermissions.list()
      : base44.entities.RolePermissions.filter({ company_id: companyId }),
    enabled: !!currentUser && isAdmin,
  });

  const saveMut = useMutation({
    mutationFn: async ({ target_role, data }) => {
      if (!isSuperAdmin && !companyId) {
        throw new Error("Cannot save permissions: your account has no enterprise assigned. Contact your administrator.");
      }
      const existing = perms.find(
        (p) => p.target_role === target_role &&
          (isSuperAdmin ? !p.company_id : p.company_id === companyId)
      );
      const payload = {
        ...data,
        target_role,
        set_by: currentUser.email,
        company_id: isSuperAdmin ? null : companyId,
      };
      if (existing) return base44.entities.RolePermissions.update(existing.id, payload);
      return base44.entities.RolePermissions.create(payload);
    },
    onSuccess: (_, { target_role }) => {
      qc.invalidateQueries({ queryKey: ["permissions"] });
      setSavedMsg(`${target_role === "admin" ? "Admin" : "User"} permissions saved.`);
      setTimeout(() => setSavedMsg(null), 3000);
    },
    onError: (error) => {
      setSavedMsg("Error: " + error.message);
      setTimeout(() => setSavedMsg(null), 5000);
    },
  });

  if (!currentUser) return null;

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-slate-400">
        <AlertCircle className="w-8 h-8" />
        <p className="font-medium">You don't have access to this page.</p>
      </div>
    );
  }

  const adminPerm = perms.find((p) => p.target_role === "admin" && (isSuperAdmin ? !p.company_id : p.company_id === companyId));
  const userPerm  = perms.find((p) => p.target_role === "user"  && (isSuperAdmin ? !p.company_id : p.company_id === companyId));

  const adminAllowedPages = adminPerm?.allowed_pages?.length ? adminPerm.allowed_pages : DEFAULT_PERMS.admin.allowed_pages;
  const userAvailablePages = isSuperAdmin
    ? ALL_PAGES.filter((p) => !USER_FORBIDDEN_PAGES.includes(p))
    : ALL_PAGES.filter((p) => adminAllowedPages.includes(p) && !USER_FORBIDDEN_PAGES.includes(p));

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
          <ShieldCheck className="w-6 h-6 text-emerald-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Permissions</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            {isSuperAdmin
              ? "Configure global platform rules — what admins and users can access across all companies."
              : "Configure what users in your company can see and do. You cannot grant more than your own access."}
          </p>
        </div>
      </div>

      {/* Philosophy banner */}
      <div className="bg-slate-950 text-slate-300 rounded-2xl px-6 py-4 text-sm space-y-2">
        <div className="flex flex-wrap gap-3 items-center">
          <span className="font-bold text-white text-xs uppercase tracking-wider">Permission Layers:</span>
          {[
            { n: 1, label: "Master Data",    color: "bg-purple-600" },
            { n: 2, label: "Relationships",  color: "bg-blue-600" },
            { n: 3, label: "Tasks",          color: "bg-sky-600" },
            { n: 4, label: "Transactions",   color: "bg-rose-600" },
            { n: 5, label: "Dashboards",     color: "bg-amber-500" },
          ].map(({ n, label, color }, i, arr) => (
            <React.Fragment key={n}>
              <span className={`${color} text-white px-2.5 py-1 rounded-full text-xs font-bold`}>L{n} {label}</span>
              {i < arr.length - 1 && <span className="text-slate-600">→</span>}
            </React.Fragment>
          ))}
        </div>
        <p className="text-slate-500 text-xs italic">
          "Users may define reality, connect reality, plan work, record facts, or analyze outcomes — but never more than one layer at a time."
        </p>
      </div>

      {savedMsg && (
        <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-sm text-emerald-700">
          <ShieldCheck className="w-4 h-4" /> {savedMsg}
        </div>
      )}

      <div className={`grid gap-6 ${isSuperAdmin ? "grid-cols-1 xl:grid-cols-2" : "grid-cols-1 max-w-3xl"}`}>
        {isSuperAdmin && (
          <PermissionCard
            title="Admin Permissions"
            subtitle="What Enterprise Admins can access and do (global template)"
            icon={Settings}
            roleKey="admin"
            perm={adminPerm}
            availablePages={ALL_PAGES}
            isSaving={saveMut.isPending}
            onSave={(data) => saveMut.mutate({ target_role: "admin", data })}
          />
        )}
        <PermissionCard
          title="User / Worker Permissions"
          subtitle={isSuperAdmin
            ? "What regular users can access by default (global template)"
            : "What workers in your company can see and do"}
          icon={Users}
          roleKey="user"
          perm={userPerm}
          availablePages={userAvailablePages}
          isSaving={saveMut.isPending}
          onSave={(data) => saveMut.mutate({ target_role: "user", data })}
        />
      </div>
    </div>
  );
}