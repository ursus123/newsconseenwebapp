import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";

// Full list of pages admins can access by default
export const ALL_ADMIN_PAGES = [
  "Dashboard", "Tasks", "Enterprises", "People", "Products",
  "Services", "Addresses", "Relationships", "Transactions",
  "Reports", "Applications", "ClockInOut", "MedAdmin", "InviteUser", "UserManagement", "Permissions"
];

export const ALL_APP_PAGES = ["Applications", "ClockInOut", "MedAdmin"];

// Default page access per role (fallback when no RolePermissions record exists)
export const DEFAULT_PAGES = {
  super_admin: null,        // null = unrestricted
  admin: ALL_ADMIN_PAGES,
  user: ["Dashboard", "Tasks", "Applications", "Reports"],
};

const SUPER_ADMIN_PERMS = {
  allowedPages: null,
  // Layer 1 — Master Data
  l1_view: true, l1_create: true, l1_edit: true, l1_archive: true,
  // Layer 2 — Relationships
  l2_view: true, l2_assign: true, l2_unassign: true,
  // Layer 3 — Tasks
  l3_view: true, l3_create: true, l3_assign: true, l3_update_status: true, l3_complete: true,
  // Layer 4 — Transactions
  l4_view: true, l4_create_draft: true, l4_post: true, l4_void: true,
  // Layer 5 — Dashboards
  l5_view: true,
  // Legacy flat flags (kept for backward compat)
  can_create: true, can_edit: true, can_delete: true,
};

const ADMIN_DEFAULTS = {
  layer1_master_data:   { can_view: true, can_create: true,  can_edit: true,  can_archive: true },
  layer2_relationships: { can_view: true, can_assign: true,  can_unassign: true },
  layer3_tasks:         { can_view: true, can_create: true,  can_assign: true, can_update_status: true, can_complete: true },
  layer4_transactions:  { can_view: true, can_create_draft: true, can_post: true, can_void: true },
  layer5_dashboards:    { can_view: true },
};

const USER_DEFAULTS = {
  layer1_master_data:   { can_view: true,  can_create: false, can_edit: false, can_archive: false },
  layer2_relationships: { can_view: true,  can_assign: false, can_unassign: false },
  layer3_tasks:         { can_view: true,  can_create: false, can_assign: false, can_update_status: true, can_complete: true },
  layer4_transactions:  { can_view: false, can_create_draft: false, can_post: false, can_void: false },
  layer5_dashboards:    { can_view: false },
};

function flattenLayers(perm, roleDefaults) {
  const l1 = { ...roleDefaults.layer1_master_data,   ...(perm?.layer1_master_data   || {}) };
  const l2 = { ...roleDefaults.layer2_relationships, ...(perm?.layer2_relationships || {}) };
  const l3 = { ...roleDefaults.layer3_tasks,         ...(perm?.layer3_tasks         || {}) };
  const l4 = { ...roleDefaults.layer4_transactions,  ...(perm?.layer4_transactions  || {}) };
  const l5 = { ...roleDefaults.layer5_dashboards,    ...(perm?.layer5_dashboards    || {}) };

  return {
    // Layer 1
    l1_view: l1.can_view,
    l1_create: l1.can_create,
    l1_edit: l1.can_edit,
    l1_archive: l1.can_archive,
    // Layer 2
    l2_view: l2.can_view,
    l2_assign: l2.can_assign,
    l2_unassign: l2.can_unassign,
    // Layer 3
    l3_view: l3.can_view,
    l3_create: l3.can_create,
    l3_assign: l3.can_assign,
    l3_update_status: l3.can_update_status,
    l3_complete: l3.can_complete,
    // Layer 4
    l4_view: l4.can_view,
    l4_create_draft: l4.can_create_draft,
    l4_post: l4.can_post,
    l4_void: l4.can_void,
    // Layer 5
    l5_view: l5.can_view,
    // Legacy flat flags
    can_create: l1.can_create,
    can_edit: l1.can_edit,
    can_delete: perm?.can_delete ?? false,
  };
}

export function usePermissions(user) {
  const role = user?.role;
  const companyId = user?.company_id;
  const isSuperAdmin = role === "super_admin";

  const { data: perms = [] } = useQuery({
    queryKey: ["permissions", companyId, role],
    queryFn: () => companyId
      ? base44.entities.RolePermissions.filter({ company_id: companyId })
      : base44.entities.RolePermissions.filter({ target_role: role }),
    enabled: !!user && !isSuperAdmin,
  });

  if (isSuperAdmin) return SUPER_ADMIN_PERMS;

  const myPerm = perms.find((p) => p.target_role === role);
  const roleDefaults = role === "admin" ? ADMIN_DEFAULTS : USER_DEFAULTS;

  const allowedPages = myPerm?.allowed_pages?.length
    ? myPerm.allowed_pages
    : DEFAULT_PAGES[role] ?? ["Dashboard", "Tasks"];

  return {
    allowedPages,
    ...flattenLayers(myPerm, roleDefaults),
  };
}