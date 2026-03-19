export const PLAN_LIMITS = {
  starter:      { enterprises: 1,        users: 5 },
  professional: { enterprises: 5,        users: 20 },
  consultant:   { enterprises: Infinity, users: Infinity },
};

export const PLAN_PRICES = {
  starter:      { monthly: 49,  annual: 39 },
  professional: { monthly: 149, annual: 119 },
  consultant:   { monthly: 299, annual: 239 },
};

export const PLAN_LABELS = {
  starter:      "Starter",
  professional: "Professional",
  consultant:   "Consultant",
};

/**
 * usePlanLimits — determine plan limits and usage for a tenant.
 *
 * @param {object} currentUser  - authenticated user object
 * @param {Array}  enterprises  - list of Enterprise records (scoped to company)
 * @param {Array}  users        - list of User records (scoped to company)
 */
export function usePlanLimits(currentUser, enterprises, users) {
  const enterprise = enterprises?.find(
    (e) => e.enterprise_name === currentUser?.company_id
  );
  const tier = enterprise?.subscription_tier || "professional";
  const limits = PLAN_LIMITS[tier] || PLAN_LIMITS.professional;

  const enterpriseCount = enterprises?.length || 0;
  const userCount = users?.length || 0;

  return {
    enterprise,
    tier,
    limits,
    enterpriseCount,
    userCount,
    canAddEnterprise: enterpriseCount < limits.enterprises,
    canAddUser: userCount < limits.users,
    isAtEnterpriseLimit: enterpriseCount >= limits.enterprises,
    isAtUserLimit: userCount >= limits.users,
  };
}