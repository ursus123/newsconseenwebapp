import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Clock, ChevronRight, Pill } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";

const ALL_APPS = [
  {
    id: "clockinout",
    title: "Clock In / Out",
    subtitle: "Attendance tracking — fast, no friction",
    icon: Clock,
    color: "from-slate-800 to-slate-900",
    accent: "bg-emerald-400",
    page: "ClockInOut",
    status: "live",
  },
  {
    id: "medadmin",
    title: "Medication Administration",
    subtitle: "eMAR — point-of-care recording, IDD-ready",
    icon: Pill,
    color: "from-blue-700 to-blue-900",
    accent: "bg-blue-300",
    page: "MedAdmin",
    status: "live",
  },
];

export default function Applications() {
  const [user, setUser] = useState(null);
  useEffect(() => { base44.auth.me().then(setUser).catch(() => {}); }, []);

  const isAdmin = user?.role === "admin" || user?.role === "super_admin";

  const { data: accessRecords = [] } = useQuery({
    queryKey: ["userAppAccess"],
    queryFn: () => base44.entities.UserAppAccess.list(),
    enabled: !!user && !isAdmin,
  });

  // Admins see all apps; regular users see only their assigned apps
  const myRecord = accessRecords.find((r) => r.user_email === user?.email);
  const APPS = isAdmin
    ? ALL_APPS
    : myRecord
    ? ALL_APPS.filter((a) => myRecord.allowed_apps?.includes(a.page))
    : [];

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Applications</h1>
        <p className="text-sm text-slate-400 mt-1">Standalone tools built on top of your data</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        {APPS.map((app) => {
          const Icon = app.icon;
          return (
            <Link
              key={app.id}
              to={createPageUrl(app.page)}
              className={`group relative flex flex-col justify-between p-6 rounded-2xl bg-gradient-to-br ${app.color} shadow-lg hover:shadow-xl transition-all duration-200 hover:-translate-y-0.5 min-h-[180px] overflow-hidden`}
            >
              {/* Background orb */}
              <div className="absolute -right-6 -bottom-6 w-32 h-32 rounded-full bg-white/5" />
              <div className="absolute -right-2 -bottom-2 w-20 h-20 rounded-full bg-white/5" />

              <div className="flex items-start justify-between">
                <div className={`w-12 h-12 rounded-xl ${app.accent} flex items-center justify-center shadow-lg`}>
                  <Icon className="w-6 h-6 text-slate-900" />
                </div>
                {app.status === "live" && (
                  <span className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-400 uppercase tracking-wider">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Live
                  </span>
                )}
              </div>

              <div className="mt-auto">
                <h2 className="text-lg font-bold text-white">{app.title}</h2>
                <p className="text-sm text-white/50 mt-0.5">{app.subtitle}</p>
                <div className="flex items-center gap-1 mt-4 text-white/40 text-xs font-medium group-hover:text-white/70 transition-colors">
                  Open app <ChevronRight className="w-3.5 h-3.5" />
                </div>
              </div>
            </Link>
          );
        })}

        {/* Placeholder slots */}
        <div className="flex flex-col items-center justify-center p-6 rounded-2xl border-2 border-dashed border-slate-200 min-h-[180px] text-slate-300">
          <span className="text-3xl font-light">+</span>
          <span className="text-xs mt-2">More apps coming soon</span>
        </div>
      </div>
    </div>
  );
}