import { useAuth } from "@/lib/AuthContext";
import {
  canAccessPage,
  canPerformCrudOp,
  getDataRestrictions,
  getVisiblePages,
} from "@/config/permissions";

export function usePermissions() {
  const { user } = useAuth();

  const userRole = user?.role || "student";

  return {
    userRole,
    currentUser: user,
    canAccessPage: (pageName) => canAccessPage(userRole, pageName),
    canCreate: (entityName) => canPerformCrudOp(userRole, entityName, "create"),
    canRead: (entityName) => canPerformCrudOp(userRole, entityName, "read"),
    canUpdate: (entityName) => canPerformCrudOp(userRole, entityName, "update"),
    canDelete: (entityName) => canPerformCrudOp(userRole, entityName, "delete"),
    canPerform: (entityName, operation) => canPerformCrudOp(userRole, entityName, operation),
    getDataRestrictions: (entityName) => getDataRestrictions(userRole, entityName, user),
    getVisiblePages: () => getVisiblePages(userRole),
  };
}