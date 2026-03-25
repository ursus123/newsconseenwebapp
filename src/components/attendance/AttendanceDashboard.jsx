import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Building2, Users, CheckSquare, TrendingUp, ChevronRight, BookOpen } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

export default function AttendanceDashboard({ currentUser, onOpenClass, onOpenPerson }) {
  const [orgs, setOrgs] = useState([]);
  const [selectedOrg, setSelectedOrg] = useState(null);
  const [classes, setClasses] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadOrgs();
  }, [currentUser]);

  const loadOrgs = async () => {
    setLoading(true);
    const q = currentUser?.role === "super_admin" ? {} : { company_id: currentUser?.company_id };
    const all = await base44.entities.Enterprise.filter(q);
    setOrgs(all.filter(e => e.status === "active" || !e.status));
    if (all.length > 0) {
      const first = all.find(e => e.status === "active") || all[0];
      setSelectedOrg(first);
      await loadClasses(first, all);
    }
    setLoading(false);
  };

  const loadClasses = async (org, allEnterprises) => {
    const orgName = org.enterprise_name;
    const all = allEnterprises || await base44.entities.Enterprise.filter(
      currentUser?.role === "super_admin" ? {} : { company_id: currentUser?.company_id }
    );

    // Strategy 1: via enterprise_enterprise relationships (parent → child)
    const rels = await base44.entities.Relationship.filter({
      relationship_type: "enterprise_enterprise",
      enterprise_name: orgName,
      status: "active",
    });

    let cls = [];
    if (rels.length > 0) {
      const childNames = rels.map(r => r.secondary_enterprise).filter(Boolean);
      cls = all.filter(e => childNames.includes(e.enterprise_name) && (e.status === "active" || !e.status));
    }

    // Strategy 2: fallback — enterprises with parent_enterprise_id set to org.id
    if (cls.length === 0) {
      cls = all.filter(e => e.parent_enterprise_id === org.id && (e.status === "active" || !e.status));
    }

    setClasses(cls);

    // Load recent attendance sessions
    const tasks = await base44.entities.Task.filter({ task_type: "attendance", status: "completed" });
    const classIds = cls.map(c => c.id);
    setSessions(tasks.filter(t => classIds.includes(t.enterprise)));
  };

  const handleOrgChange = async (org) => {
    setSelectedOrg(org);
    await loadClasses(org.id);
  };

  // Chart data: sessions per class
  const chartData = classes.map(cls => ({
    name: cls.short_name || cls.enterprise_name?.slice(0, 12),
    sessions: sessions.filter(s => s.enterprise === cls.id).length,
  }));

  const totalStudentsEstimate = sessions.reduce((sum, s) => {
    const meta = s.outcome_notes ? (() => { try { return JSON.parse(s.outcome_notes); } catch { return {}; } })() : {};
    return sum + (meta.present?.length || 0) + (meta.absent?.length || 0) + (meta.late?.length || 0);
  }, 0);

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center">
          <BookOpen className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-800">Attendance Register</h1>
          <p className="text-sm text-slate-500">Track and manage attendance across your organization</p>
        </div>
      </div>

      {/* Org selector */}
      {orgs.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          {orgs.map(org => (
            <button key={org.id} onClick={() => handleOrgChange(org)}
              className={`px-4 py-2 rounded-xl text-sm font-medium border transition-all ${
                selectedOrg?.id === org.id
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-slate-600 border-slate-200 hover:border-blue-300"
              }`}>
              {org.enterprise_name}
            </button>
          ))}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Classes", value: classes.length, icon: Building2, color: "blue" },
          { label: "Sessions Recorded", value: sessions.length, icon: CheckSquare, color: "emerald" },
          { label: "Attendance Entries", value: totalStudentsEstimate, icon: Users, color: "violet" },
          { label: "This Week", value: sessions.filter(s => {
            const d = new Date(s.updated_date || s.created_date);
            const now = new Date();
            return (now - d) < 7 * 24 * 60 * 60 * 1000;
          }).length, icon: TrendingUp, color: "amber" },
        ].map(stat => (
          <div key={stat.label} className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm">
            <div className={`w-8 h-8 rounded-lg bg-${stat.color}-100 flex items-center justify-center mb-2`}>
              <stat.icon className={`w-4 h-4 text-${stat.color}-600`} />
            </div>
            <p className="text-2xl font-bold text-slate-800">{stat.value}</p>
            <p className="text-xs text-slate-500 mt-0.5">{stat.label}</p>
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Sessions chart */}
        {chartData.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
            <p className="text-sm font-semibold text-slate-700 mb-4">Sessions by Class</p>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="sessions" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Classes list */}
        <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
          <p className="text-sm font-semibold text-slate-700 mb-3">
            {selectedOrg ? `Classes in ${selectedOrg.enterprise_name}` : "Classes"}
          </p>
          {classes.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">
              No classes found. Create sub-enterprises to represent classes.
            </p>
          ) : (
            <div className="space-y-2">
              {classes.map(cls => {
                const clsSessions = sessions.filter(s => s.enterprise === cls.id).length;
                return (
                  <button key={cls.id} onClick={() => onOpenClass(cls)}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-slate-100 hover:border-blue-200 hover:bg-blue-50 transition-all text-left group">
                    <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center shrink-0">
                      <Building2 className="w-4 h-4 text-blue-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{cls.enterprise_name}</p>
                      <p className="text-xs text-slate-400">{clsSessions} session{clsSessions !== 1 ? "s" : ""} recorded</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-blue-500 transition-colors" />
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}