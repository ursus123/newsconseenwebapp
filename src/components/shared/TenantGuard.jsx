import React from "react";
import { LogOut, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";

/**
 * TenantGuard — blocks access to app if multi-tenant isolation is not set up.
 * 
 * Security check:
 * - super_admin: allowed (sees all data)
 * - admin/user without company_id: BLOCKED (cannot access any data)
 * - admin/user with company_id: allowed (scoped to their enterprise)
 */
export default function TenantGuard({ currentUser, children }) {
  // Super admins bypass guard
  if (currentUser?.role === "super_admin") {
    return children;
  }

  // Admin/user without company_id is blocked
  if (!currentUser?.company_id) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
        <div className="max-w-md w-full mx-4 bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl p-8 text-center space-y-4">
          <div className="flex justify-center">
            <div className="p-3 bg-red-500/20 rounded-full">
              <AlertTriangle className="w-8 h-8 text-red-400" />
            </div>
          </div>

          <div>
            <h1 className="text-xl font-bold text-white mb-2">Account Setup Required</h1>
            <p className="text-sm text-slate-300 leading-relaxed">
              Your account has not been assigned to an enterprise workspace yet. 
              You cannot access any application data.
            </p>
          </div>

          <div className="bg-slate-700/50 rounded-lg p-3 border border-slate-600">
            <p className="text-xs text-slate-400 mb-1">Your account email:</p>
            <p className="text-sm font-mono text-slate-200 break-all">{currentUser?.email || "Unknown"}</p>
          </div>

          <p className="text-xs text-slate-400">
            Please contact your administrator to assign your account to an enterprise workspace.
          </p>

          <Button
            onClick={() => base44.auth.logout()}
            className="w-full bg-red-600 hover:bg-red-700 text-white gap-2"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </Button>
        </div>
      </div>
    );
  }

  // User has company_id — allowed
  return children;
}