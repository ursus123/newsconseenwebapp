import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Globe } from "lucide-react";
import { base44 } from "@/api/base44Client";
import NetworkDashboard from "@/components/network/NetworkDashboard";
import NetworkMap from "@/components/network/NetworkMap";

export default function NetworkPage() {
  const { data: currentUser = null } = useQuery({
    queryKey: ["currentUser"],
    queryFn: () => base44.auth.me(),
    staleTime: 0,
    refetchOnMount: "always",
  });

  if (!currentUser) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-4 border-slate-200 border-t-indigo-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!currentUser.network_company_id) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center px-6">
        <Globe className="w-16 h-16 text-indigo-400 mb-5 opacity-80" />
        <h1 className="text-2xl font-bold text-slate-800 mb-3">Network Intelligence</h1>
        <p className="text-slate-500 max-w-md leading-relaxed mb-8">
          Your account is not connected to a network. Contact your administrator to receive
          a network join code, or generate one from the Settings page if you are a network admin.
        </p>
        <a
          href="/Settings"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 transition-colors"
        >
          <Globe className="w-4 h-4" />
          Go to Settings
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <NetworkDashboard
        networkId={currentUser.network_company_id}
        currentUser={currentUser}
      />
      <NetworkMap
        networkId={currentUser.network_company_id}
        currentUser={currentUser}
      />
    </div>
  );
}