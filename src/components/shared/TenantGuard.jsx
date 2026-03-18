import React from "react";
import { base44 } from "@/api/base44Client";
import { ShieldAlert, LogOut, Building2 } from "lucide-react";
import { useIsTenantScoped } from "@/components/shared/useDataQuery";

/**
 * TenantGuard
 * Wraps all app content and blocks access for users
 * who have no company_id assigned.
 *
 * This is the last line of defense against data leaks
 * for misconfigured accounts.
 */
export default function TenantGuard({ currentUser, children }) {
  const isSuperAdmin = currentUser?.role === "super_admin";
  const isTenantScoped = useIsTenantScoped(currentUser);

  // Super admin always passes through
  if (isSuperAdmin) return <>{children}</>;

  // Not loaded yet — show nothing (prevent flash)
  if (!currentUser) return null;

  // User exists but has no company_id — show block screen
  if (!isTenantScoped) {
    return (
      <div className="fixed inset-0 bg-slate-50 flex items-center justify-center z-50 p-6">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-slate-200 p-8 text-center">

          {/* Icon */}
          <div className="w-16 h-16 bg-amber-50 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <ShieldAlert className="w-8 h-8 text-amber-500" />
          </div>

          {/* Title */}
          <h1 className="text-xl font-bold text-slate-800 mb-2">
            Account Setup Required
          </h1>

          {/* Message */}
          <p className="text-slate-500 text-sm leading-relaxed mb-6">
            Your account has not been assigned to an enterprise 
            workspace yet. You need to be assigned to an enterprise 
            before you can access Newsconseen.
          </p>

          {/* User info */}
          <div className="bg-slate-50 rounded-xl px-4 py-3 mb-6 text-left">
            <p className="text-xs text-slate-400 mb-1">Signed in as</p>
            <p className="text-sm font-medium text-slate-700">
              {currentUser.email}
            </p>
            <p className="text-xs text-slate-400 capitalize mt-0.5">
              Role: {currentUser.role}
            </p>
          </div>

          {/* Instructions */}
          <div className="bg-blue-50 rounded-xl px-4 py-3 mb-6 text-left">
            <div className="flex items-start gap-2">
              <Building2 className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-semibold text-blue-700 mb-1">
                  What to do next
                </p>
                <p className="text-xs text-blue-600 leading-relaxed">
                  Contact your Newsconseen administrator and ask them 
                  to assign your account to an enterprise workspace 
                  in User Management.
                </p>
              </div>
            </div>
          </div>

          {/* Sign out button */}
          <button
            onClick={() => base44.auth.logout()}
            className="flex items-center gap-2 px-4 py-2.5 w-full justify-center rounded-xl border border-slate-200 text-sm text-slate-500 hover:text-red-500 hover:border-red-200 hover:bg-red-50 transition-all"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  // All good — render app content
  return <>{children}</>;
}