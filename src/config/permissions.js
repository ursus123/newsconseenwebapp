/**
 * Role-based permission system for Base44 app
 * Defines page access and CRUD operations per role
 */

export const ROLE_HIERARCHY = {
  super_admin: 0,
  admin: 1,
  teacher: 2,
  staff: 3,
  student: 4,
};

export const ROLE_PERMISSIONS = {
  super_admin: {
    pages: ["*"], // access all pages
    crudOps: {
      entities: ["*"], // all entities
      operations: ["create", "read", "update", "delete"],
    },
  },
  admin: {
    pages: [
      "Dashboard",
      "People",
      "Enterprises",
      "Products",
      "Services",
      "Addresses",
      "Relationships",
      "Tasks",
      "Transactions",
      "Reports",
      "QueryBuilder",
      "Attendance",
      "Permissions",
      "UserManagement",
      "Billing",
    ],
    crudOps: {
      entities: [
        "Person",
        "Enterprise",
        "Product",
        "Service",
        "Address",
        "Relationship",
        "Task",
        "Transaction",
        "Attendance",
        "MasterDataOption",
      ],
      operations: ["create", "read", "update", "delete"],
    },
  },
  teacher: {
    pages: [
      "Dashboard",
      "People",
      "Attendance",
      "Tasks",
      "Transactions",
    ],
    crudOps: {
      entities: [
        "Person", // read/update only (own class)
        "Attendance",
        "Task",
        "Transaction",
      ],
      operations: ["read", "update"], // can mark attendance, create tasks
      operationsByEntity: {
        Attendance: ["create", "read", "update"],
        Task: ["create", "read", "update"],
        Transaction: ["read"],
        Person: ["read", "update"], // limited to students in class
      },
    },
    dataRestrictions: {
      Person: { person_type: "client" }, // can only see clients/students
      Task: { assigned_to_email: "{currentUserEmail}" }, // only own tasks
    },
  },
  staff: {
    pages: [
      "Dashboard",
      "People",
      "Tasks",
      "Transactions",
      "Attendance",
    ],
    crudOps: {
      entities: ["Person", "Task", "Transaction", "Attendance"],
      operations: ["read", "update"],
      operationsByEntity: {
        Task: ["create", "read", "update"],
        Attendance: ["create", "read", "update"],
        Person: ["read"],
        Transaction: ["read"],
      },
    },
    dataRestrictions: {
      Task: { assigned_to_email: "{currentUserEmail}" },
      Attendance: { marked_by: "{currentUserEmail}" },
    },
  },
  student: {
    pages: ["Dashboard", "Attendance"],
    crudOps: {
      entities: [],
      operations: ["read"],
    },
    dataRestrictions: {
      Person: { id: "{currentUserId}" }, // can only view own record
      Attendance: { person_id: "{currentUserId}" }, // can only see own attendance
    },
  },
};

/**
 * Check if a user role can access a specific page
 */
export function canAccessPage(userRole, pageName) {
  if (!ROLE_PERMISSIONS[userRole]) return false;
  const pages = ROLE_PERMISSIONS[userRole].pages;
  return pages.includes("*") || pages.includes(pageName);
}

/**
 * Check if a user role can perform a CRUD operation on an entity
 */
export function canPerformCrudOp(userRole, entityName, operation) {
  if (!ROLE_PERMISSIONS[userRole]) return false;
  const perms = ROLE_PERMISSIONS[userRole].crudOps;

  if (perms.operations.includes("*")) return true;
  if (perms.operationsByEntity?.[entityName]) {
    return perms.operationsByEntity[entityName].includes(operation);
  }
  return perms.operations.includes(operation) && (perms.entities.includes("*") || perms.entities.includes(entityName));
}

/**
 * Get data restrictions for a user role (used in filters)
 */
export function getDataRestrictions(userRole, entityName, currentUser) {
  const restrictions = ROLE_PERMISSIONS[userRole]?.dataRestrictions?.[entityName];
  if (!restrictions) return null;

  const result = {};
  Object.entries(restrictions).forEach(([key, value]) => {
    if (value === "{currentUserEmail}") {
      result[key] = currentUser?.email;
    } else if (value === "{currentUserId}") {
      result[key] = currentUser?.id;
    } else {
      result[key] = value;
    }
  });
  return result;
}

/**
 * Filter visible pages for a user based on their role
 */
export function getVisiblePages(userRole) {
  return ROLE_PERMISSIONS[userRole]?.pages || [];
}