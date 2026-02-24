import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, Users, Settings, Save, AlertCircle, Lock, Eye, Database } from "lucide-react";
import { ALL_ADMIN_PAGES } from "@/components/shared/usePermissions";

const ALL_PAGES = [
  { key: "Dashboard",     label: "Dashboard",     group: "overview" },
  { key: "Tasks",         label: "Tasks",         group: "operations" },
  { key: "Enterprises",   label: "Enterprises",   group: "setup" },
  { key: "People",        label: "People",        group: "setup" },
  { key: "Products",      label: "Products",      group: "setup" },
  { key: "Services",      label: "Services",      group: "setup" },
  { key: "Addresses",     label: "Addresses",     group: "setup" },
  { key: "Relationships", label: "Relationships", group: "setup" },
  { key: "Transactions",  label: "Transactions",  group: "ledger" },
  { key: "Reports",       label: "Reports",       group: "intelligence" },
  { key: "InviteUser",    label: "Invite User",   group: "admin" },
  { key: "Permissions",   label: "Permissions",   group: "admin" },
];

const PAGE_GROUPS = {
  overview:     { label: "Overview",      color: "text-slate-500" },
  operations:   { label: "Operations",    color: "text-blue-600" },
  setup:        { label: "Setup",         color: "text-purple-600" },
  ledger:       { label: "Ledger",        color: "text-rose-600" },
  intelligence: { label: "Intelligence",  color: "text-amber-600" },
  admin:        { label: "Admin",         color: "text-emerald-600" },
};

// Pages users can never access regardless of permissions (enforced at runtime)
const USER_FORBIDDEN_PAGES = ["InviteUser", "Permissions", "Transactions"];

const DEFAULT_PERMS = {
  admin: { allowed_pages: ALL_ADMIN_PAGES, can_create: true, can_edit: true, can_delete: false, can_post_transactions: true, can_trigger_transactions: true, data_scope: "all" },
  user:  { allowed_pages: ["Dashboard", "Tasks"], can_create: false, can_edit: false, can_delete: false, can_post_transactions: false, can_trigger_transactions: false, data_scope: "own" },
};

function PageToggleGroup({ pages, selected, onChange, locked = [] }) {
  const groups = Object.entries(PAGE_GROUPS);
  return (
    <div className="space-y-4">
      {groups.map(([groupKey, groupMeta]) => {
        const groupPages = pages.filter((p) => p.group === groupKey);
        if (groupPages.length === 0) return null;
        return (
          <div key={groupKey}>
            <p className={`text-[10px] font-bold uppercase tracking-widest mb-2 ${groupMeta.color}`}>{groupMeta.label}</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {groupPages.map((page) => {
                const isLocked = locked.includes(page.key);
                const checked = selected.includes(page.key);
                return (
                  <button
                    key={page.key}
                    disabled={isLocked}
                    onClick={() => !isLocked && onChange(page.key)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-medium transition-all text-left
                      ${isLocked ? "opacity-40 cursor-not-allowed bg-slate-50 border-slate-100 text-slate-400" :
                        checked
                          ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                          : "bg-white border-slate-200 text-slate-400 hover:border-slate-300"
                      }`}
                  >
                    <div className={`w-2 h-2 rounded-full shrink-0 ${isLocked ? "bg-slate-200" : checked ? "bg-emerald-500" : "bg-slate-200"}`} />
                    {page.label}
                    {isLocked && <Lock className="w-3 h-3 ml-auto" />}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PermissionCard({ title, subtitle, icon: Icon, roleKey, perm, onSave, availablePages, lockedPages = [], isSaving }) {
  const defaults = DEFAULT_PERMS[roleKey];
  const [local, setLocal] = useState(null);

  useEffect(() => {
    setLocal(perm ? {
      allowed_pages: perm.allowed_pages?.length ? perm.allowed_pages : defaults.allowed_pages,
      can_create: perm.can_create ?? defaults.can_create,
      can_edit: perm.can_edit ?? defaults.can_edit,
      can_delete: perm.can_delete ?? defaults.can_delete,
      can_post_transactions: perm.can_post_transactions ?? defaults.can_post_transactions,
      can_trigger_transactions: perm.can_trigger_transactions ?? defaults.can_trigger_transactions,
      data_scope: perm.data_scope ?? defaults.data_scope,
    } : { ...defaults });
  }, [perm]);

  if (!local) return null;

  const togglePage = (key) =>
    setLocal((l) => ({
      ...l,
      allowed_pages: l.allowed_pages.includes(key)
        ? l.allowed_pages.filter((p) => p !== key)
        : [...l.allowed_pages, key],
    }));

  const setFlag = (key, val) => setLocal((l) => ({ ...l, [key]: val }));

  const actionFlags = [
    { key: "can_create",             label: "Can Create records",               desc: "Add new people, tasks, items, etc." },
    { key: "can_edit",               label: "Can Edit records",                 desc: "Modify existing data" },
    { key: "can_delete",             label: "Can Delete records",               desc: "Permanently remove data" },
    { key: "can_post_transactions",  label: "Can Post / Void Transactions",     desc: "Financial & stock ledger control" },
    { key: "can_trigger_transactions", label: "Can Trigger Transactions via Tasks", desc: "Indirectly affect ledger through task completion" },
  ];

  return (
    <Card className="p-6 space-y-6">
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
        <PageToggleGroup
          pages={availablePages}
          selected={local.allowed_pages}
          onChange={togglePage}
          locked={lockedPages}
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
            { val: "own",  label: "Own only",   desc: "Only their own records" },
            { val: "team", label: "Team",        desc: "Their enterprise/team" },
            { val: "all",  label: "All data",    desc: "Full enterprise data" },
          ].map(({ val, label, desc }) => (
            <button
              key={val}
              onClick={() => setFlag("data_scope", val)}
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

      {/* Action Rights */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <ShieldCheck className="w-4 h-4 text-slate-400" />
          <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Action Rights</p>
        </div>
        <div className="space-y-3">
          {actionFlags.map(({ key, label, desc }) => (
            <div key={key} className="flex items-center justify-between gap-4">
              <div>
                <Label className="text-sm text-slate-700 font-medium">{label}</Label>
                <p className="text-xs text-slate-400">{desc}</p>
              </div>
              <Switch checked={local[key]} onCheckedChange={(v) => setFlag(key, v)} />
            </div>
          ))}
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

  // Pages available to configure for each role
  const adminAvailablePages = ALL_PAGES;

  // Admins can only grant users access to pages the admin itself can access
  const adminAllowedPages = adminPerm?.allowed_pages?.length ? adminPerm.allowed_pages : DEFAULT_PERMS.admin.allowed_pages;
  const userAvailablePages = isSuperAdmin
    ? ALL_PAGES.filter((p) => !USER_FORBIDDEN_PAGES.includes(p.key))
    : ALL_PAGES.filter((p) => adminAllowedPages.includes(p.key) && !USER_FORBIDDEN_PAGES.includes(p.key));

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

      {/* Authority flow reminder */}
      <div className="bg-slate-950 text-slate-300 rounded-2xl px-6 py-4 text-sm flex flex-wrap gap-4 items-center">
        <span className="font-bold text-white">Authority Flow:</span>
        <span className="bg-emerald-600 text-white px-3 py-1 rounded-full text-xs font-bold">Super Admin</span>
        <span className="text-slate-600">→</span>
        <span className="bg-violet-600 text-white px-3 py-1 rounded-full text-xs font-bold">Enterprise Admin</span>
        <span className="text-slate-600">→</span>
        <span className="bg-slate-600 text-white px-3 py-1 rounded-full text-xs font-bold">User / Worker</span>
        <span className="text-slate-500 text-xs ml-auto">No role can grant more than it has.</span>
      </div>

      {savedMsg && (
        <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-sm text-emerald-700">
          <ShieldCheck className="w-4 h-4" /> {savedMsg}
        </div>
      )}

      <div className={`grid gap-6 ${isSuperAdmin ? "grid-cols-1 xl:grid-cols-2" : "grid-cols-1 max-w-2xl"}`}>
        {isSuperAdmin && (
          <PermissionCard
            title="Admin Permissions"
            subtitle="What Enterprise Admins can access and do (global template)"
            icon={Settings}
            roleKey="admin"
            perm={adminPerm}
            availablePages={adminAvailablePages}
            lockedPages={[]} // super_admin can configure everything
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
          lockedPages={[]} // locked pages are filtered out of available
          isSaving={saveMut.isPending}
          onSave={(data) => saveMut.mutate({ target_role: "user", data })}
        />
      </div>
    </div>
  );
}