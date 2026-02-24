import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ShieldCheck, Users, Settings, Save, AlertCircle } from "lucide-react";

// All available pages in the app
const ALL_PAGES = [
  { key: "Dashboard", label: "Dashboard" },
  { key: "Tasks", label: "Tasks" },
  { key: "Enterprises", label: "Enterprises" },
  { key: "People", label: "People" },
  { key: "Products", label: "Products" },
  { key: "Services", label: "Services" },
  { key: "Addresses", label: "Addresses" },
  { key: "Relationships", label: "Relationships" },
  { key: "Transactions", label: "Transactions" },
  { key: "Reports", label: "Reports" },
  { key: "InviteUser", label: "Invite User" },
];

const DEFAULT_PAGES = {
  admin: ["Dashboard", "Tasks", "Enterprises", "People", "Products", "Services", "Addresses", "Relationships", "Transactions", "Reports", "InviteUser"],
  user: ["Dashboard", "Tasks"],
};

function PermissionCard({ title, subtitle, icon: Icon, perm, onSave, availablePages, isSuperAdmin }) {
  const [local, setLocal] = useState(null);

  useEffect(() => {
    if (perm) {
      setLocal({
        allowed_pages: perm.allowed_pages || DEFAULT_PAGES[perm.target_role] || [],
        can_create: perm.can_create ?? true,
        can_edit: perm.can_edit ?? true,
        can_delete: perm.can_delete ?? false,
      });
    } else {
      setLocal({
        allowed_pages: DEFAULT_PAGES[title === "Admin" ? "admin" : "user"] || [],
        can_create: true,
        can_edit: true,
        can_delete: false,
      });
    }
  }, [perm]);

  if (!local) return null;

  const togglePage = (page) => {
    setLocal((l) => ({
      ...l,
      allowed_pages: l.allowed_pages.includes(page)
        ? l.allowed_pages.filter((p) => p !== page)
        : [...l.allowed_pages, page],
    }));
  };

  const setFlag = (key, val) => setLocal((l) => ({ ...l, [key]: val }));

  return (
    <Card className="p-6 space-y-5">
      <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
        <div className="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center">
          <Icon className="w-4 h-4 text-emerald-600" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-slate-800">{title} Permissions</h3>
          <p className="text-xs text-slate-400">{subtitle}</p>
        </div>
      </div>

      {/* Page access */}
      <div>
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Page Access</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {availablePages.map((page) => {
            const checked = local.allowed_pages.includes(page.key);
            return (
              <button
                key={page.key}
                onClick={() => togglePage(page.key)}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-medium transition-all text-left ${
                  checked
                    ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                    : "bg-white border-slate-200 text-slate-400 hover:border-slate-300"
                }`}
              >
                <div className={`w-2 h-2 rounded-full ${checked ? "bg-emerald-500" : "bg-slate-200"}`} />
                {page.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* CRUD flags */}
      <div>
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Actions</p>
        <div className="space-y-3">
          {[
            { key: "can_create", label: "Can Create new records" },
            { key: "can_edit", label: "Can Edit existing records" },
            { key: "can_delete", label: "Can Delete records" },
          ].map(({ key, label }) => (
            <div key={key} className="flex items-center justify-between">
              <Label className="text-sm text-slate-600">{label}</Label>
              <Switch checked={local[key]} onCheckedChange={(v) => setFlag(key, v)} />
            </div>
          ))}
        </div>
      </div>

      <Button
        onClick={() => onSave(local)}
        className="w-full bg-emerald-600 hover:bg-emerald-700 rounded-xl"
      >
        <Save className="w-4 h-4 mr-2" /> Save Permissions
      </Button>
    </Card>
  );
}

export default function Permissions() {
  const [currentUser, setCurrentUser] = useState(null);
  const [saved, setSaved] = useState(false);
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
        (p) => p.target_role === target_role && (isSuperAdmin ? !p.company_id : p.company_id === companyId)
      );
      const payload = { ...data, target_role, set_by: currentUser.email, company_id: isSuperAdmin ? null : companyId };
      if (existing) return base44.entities.RolePermissions.update(existing.id, payload);
      return base44.entities.RolePermissions.create(payload);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["permissions"] }); setSaved(true); setTimeout(() => setSaved(false), 3000); },
  });

  if (!currentUser) return null;
  if (!isAdmin) return (
    <div className="flex items-center gap-2 text-slate-400 mt-20 justify-center">
      <AlertCircle className="w-5 h-5" /> You don't have access to this page.
    </div>
  );

  const adminPerm = perms.find((p) => p.target_role === "admin" && (isSuperAdmin ? !p.company_id : p.company_id === companyId));
  const userPerm = perms.find((p) => p.target_role === "user" && (isSuperAdmin ? !p.company_id : p.company_id === companyId));

  // Super admin can configure both admin & user pages
  // Regular admin can only configure user pages
  const adminAvailablePages = ALL_PAGES;
  const userAvailablePages = isAdmin && !isSuperAdmin
    ? ALL_PAGES.filter((p) => (adminPerm?.allowed_pages || DEFAULT_PAGES.admin).includes(p.key))
    : ALL_PAGES;

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
          <ShieldCheck className="w-5 h-5 text-emerald-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Permissions</h1>
          <p className="text-sm text-slate-400">
            {isSuperAdmin ? "Configure what admins and users can access across all companies." : "Configure what users in your company can see and do."}
          </p>
        </div>
      </div>

      {saved && (
        <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-sm text-emerald-700">
          <ShieldCheck className="w-4 h-4" /> Permissions saved successfully.
        </div>
      )}

      <div className={`grid gap-6 ${isSuperAdmin ? "grid-cols-1 lg:grid-cols-2" : "grid-cols-1 max-w-xl"}`}>
        {isSuperAdmin && (
          <PermissionCard
            title="Admin"
            subtitle="What admins can access (across all companies)"
            icon={Settings}
            perm={adminPerm}
            availablePages={adminAvailablePages}
            isSuperAdmin={isSuperAdmin}
            onSave={(data) => saveMut.mutate({ target_role: "admin", data })}
          />
        )}
        <PermissionCard
          title="User"
          subtitle={isSuperAdmin ? "What regular users can access (global default)" : "What users in your company can access"}
          icon={Users}
          perm={userPerm}
          availablePages={userAvailablePages}
          isSuperAdmin={isSuperAdmin}
          onSave={(data) => saveMut.mutate({ target_role: "user", data })}
        />
      </div>
    </div>
  );
}