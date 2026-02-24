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
  user: ["Dashboard", "Tasks", "Applications"],
};

export function usePermissions(user) {
  const role = user?.role;
  const companyId = user?.company_id;
  const isSuperAdmin = role === "super_admin";

  const { data: perms = [] } = useQuery({
    queryKey: ["permissions", companyId, role],
    queryFn: () => base44.entities.RolePermissions.filter({ company_id: companyId || null }),
    enabled: !!user && !isSuperAdmin,
  });

  // Super admin: unrestricted
  if (isSuperAdmin) {
    return {
      allowedPages: null,
      can_create: true,
      can_edit: true,
      can_delete: true,
    };
  }

  const myPerm = perms.find((p) => p.target_role === role);

  const allowedPages = myPerm?.allowed_pages?.length
    ? myPerm.allowed_pages
    : DEFAULT_PAGES[role] ?? ["Dashboard", "Tasks"];

  // Admins can always create/edit by default; users are more restricted
  const defaultCreate = role === "admin" ? true : false;
  const defaultEdit   = role === "admin" ? true : false;
  const defaultDelete = false;

  return {
    allowedPages,
    can_create: myPerm ? (myPerm.can_create ?? defaultCreate) : defaultCreate,
    can_edit:   myPerm ? (myPerm.can_edit   ?? defaultEdit)   : defaultEdit,
    can_delete: myPerm ? (myPerm.can_delete  ?? defaultDelete) : defaultDelete,
  };
}