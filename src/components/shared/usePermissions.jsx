import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";

// Default pages per role (fallback when no RolePermissions record exists)
export const DEFAULT_PAGES = {
  super_admin: null, // no restriction — all pages
  admin: ["Dashboard", "Tasks", "Enterprises", "People", "Products", "Services", "Addresses", "Relationships", "Transactions", "Reports", "InviteUser", "Permissions"],
  user: ["Dashboard", "Tasks"],
};

export function usePermissions(user) {
  const role = user?.role;
  const companyId = user?.company_id;
  const isSuperAdmin = role === "super_admin";
  const isAdmin = role === "admin";
  const isUser = role === "user";

  const { data: perms = [] } = useQuery({
    queryKey: ["permissions", companyId, role],
    queryFn: () => companyId
      ? base44.entities.RolePermissions.filter({ company_id: companyId })
      : base44.entities.RolePermissions.filter({ company_id: null }),
    enabled: !!user && !isSuperAdmin,
  });

  if (isSuperAdmin) {
    return {
      allowedPages: null, // all pages
      can_create: true,
      can_edit: true,
      can_delete: true,
    };
  }

  const myPerm = perms.find((p) => p.target_role === role);

  const allowedPages = myPerm?.allowed_pages ?? DEFAULT_PAGES[role] ?? ["Dashboard", "Tasks"];
  const can_create = myPerm?.can_create ?? true;
  const can_edit = myPerm?.can_edit ?? true;
  const can_delete = myPerm?.can_delete ?? false;

  return { allowedPages, can_create, can_edit, can_delete };
}