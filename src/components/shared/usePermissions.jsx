import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";

export const ALL_ADMIN_PAGES = [
  "Dashboard", "Tasks", "Enterprises", "People", "Products",
  "Services", "Addresses", "Relationships", "Transactions",
  "Reports", "Applications", "ClockInOut", "MedAdmin", "StaffSchedule", "BarcodeScanner",
  "InviteUser", "UserManagement", "Permissions", "Billing", "Settings",
  "QueryBuilder", "DataModels", "EntityGraph",
];

export const ALL_APP_PAGES = ["Applications", "ClockInOut", "MedAdmin", "StaffSchedule", "BarcodeScanner", "StockCounter"];
// StaffSchedule is already included above

export const DEFAULT_PAGES = {
  super_admin: null,

  admin: [
    "Dashboard",
    "Enterprises", "People", "Products",
    "Services", "Addresses", "Relationships",
    "Tasks", "Transactions",
    "Reports", "QueryBuilder",
    "Applications",
    "UserManagement", "Permissions",
    "EntityGraph", "DataModels", "Pipelines", "Billing",
    "Settings",
  ],

  executive: [
    "Dashboard",
    "Reports", "QueryBuilder",
    "Enterprises", "People",
    "Applications",
    "Settings",
  ],

  user: [
    "Dashboard",
    "Tasks",
    "Applications",
    "Settings",
  ],
};

const SUPER_ADMIN_PERMS = {
  allowedPages: null,
  isSuperAdmin: true,
  isAdmin: false,
  isUser: false,
  companyId: null,
  isTenantScoped: true,
  l1_view: true, l1_create: true, l1_edit: true, l1_archive: true,
  l2_view: true, l2_assign: true, l2_unassign: true,
  l3_view: true, l3_create: true, l3_assign: true,
  l3_update_status: true, l3_complete: true,
  l4_view: true, l4_create_draft: true, l4_post: true, l4_void: true,
  l5_view: true,
  can_create: true, can_edit: true, can_delete: true,
};

// Zero-permission object returned when user has no company_id
// Prevents accidental access while account is being set up
const NO_TENANT_PERMS = {
  allowedPages: ["Dashboard"],
  isSuperAdmin: false,
  isAdmin: false,
  isUser: false,
  companyId: null,
  isTenantScoped: false,
  l1_view: false, l1_create: false, l1_edit: false, l1_archive: false,
  l2_view: false, l2_assign: false, l2_unassign: false,
  l3_view: false, l3_create: false, l3_assign: false,
  l3_update_status: false, l3_complete: false,
  l4_view: false, l4_create_draft: false, l4_post: false, l4_void: false,
  l5_view: false,
  can_create: false, can_edit: false, can_delete: false,
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
    l1_view: l1.can_view, l1_create: l1.can_create,
    l1_edit: l1.can_edit, l1_archive: l1.can_archive,
    l2_view: l2.can_view, l2_assign: l2.can_assign, l2_unassign: l2.can_unassign,
    l3_view: l3.can_view, l3_create: l3.can_create, l3_assign: l3.can_assign,
    l3_update_status: l3.can_update_status, l3_complete: l3.can_complete,
    l4_view: l4.can_view, l4_create_draft: l4.can_create_draft,
    l4_post: l4.can_post, l4_void: l4.can_void,
    l5_view: l5.can_view,
    can_create: l1.can_create,
    can_edit: l1.can_edit,
    can_delete: perm?.can_delete ?? (roleDefaults === ADMIN_DEFAULTS ? true : false),
  };
}

export function usePermissions(user) {
  const role = user?.role;
  const companyId = user?.company_id;
  const isSuperAdmin = role === "super_admin";

  const { data: perms = [] } = useQuery({
    queryKey: ["permissions", companyId, role],
    queryFn: () => {
      // FIX: always scope permission lookup to company_id
      // Never query by role alone — this could match another tenant's permissions
      if (companyId) {
        return base44.entities.RolePermissions.filter({
          company_id: companyId,
          target_role: role,
        });
      }
      // No company_id — return empty, NO_TENANT_PERMS will be returned below
      return Promise.resolve([]);
    },
    enabled: !!user && !isSuperAdmin,
  });

  // super_admin — full access, no tenant scope
  if (isSuperAdmin) return SUPER_ADMIN_PERMS;

  // No company_id — zero permissions, TenantGuard will show setup screen
  if (!companyId) return NO_TENANT_PERMS;

  const myPerm = perms.find((p) => p.target_role === role);
  const roleDefaults = role === "admin" ? ADMIN_DEFAULTS : USER_DEFAULTS;

  const allowedPages = myPerm?.allowed_pages?.length
    ? myPerm.allowed_pages
    : DEFAULT_PAGES[role] ?? ["Dashboard", "Tasks"];

  return {
    allowedPages,
    isSuperAdmin: false,
    isAdmin: role === "admin",
    isUser: role === "user",
    companyId,
    isTenantScoped: true,
    dataScope: myPerm?.data_scope ?? (role === "admin" ? "team" : "own"),
    ...flattenLayers(myPerm, roleDefaults),
  };
}