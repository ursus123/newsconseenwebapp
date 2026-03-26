import React from "react";
import { usePermissions } from "@/hooks/usePermissions";
import { AlertCircle } from "lucide-react";

export default function ProtectedRoute({ pageName, children }) {
  const { canAccessPage } = usePermissions();

  if (!canAccessPage(pageName)) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-slate-800 mb-2">Access Denied</h1>
          <p className="text-slate-500">
            You don't have permission to access this page.
          </p>
        </div>
      </div>
    );
  }

  return children;
}