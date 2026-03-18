import React from "react";
import { BarChart, Bar, PieChart, Pie, Cell, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { format, subMonths, parseISO } from "date-fns";

const TYPE_COLORS = {
  person_enterprise: "#3b82f6",
  item_enterprise: "#8b5cf6",
  item_person: "#f59e0b",
  person_service: "#06b6d4",
  enterprise_service: "#6366f1",
  person_address: "#14b8a6",
  enterprise_address: "#10b981",
};

const TYPE_LABELS = {
  person_enterprise: "Person→Enterprise",
  item_enterprise: "Item→Enterprise",
  item_person: "Item→Person",
  person_service: "Person→Service",
  enterprise_service: "Enterprise→Service",
  person_address: "Person→Address",
  enterprise_address: "Enterprise→Address",
};

export default function RelationshipAnalytics({ relationships }) {
  if (relationships.length < 3) return null;

  // Chart 1: People per enterprise
  const peMap = {};
  relationships.filter((r) => r.relationship_type === "person_enterprise" && r.status !== "archived").forEach((r) => {
    if (r.enterprise_name) peMap[r.enterprise_name] = (peMap[r.enterprise_name] || 0) + 1;
  });
  const peoplePerEnterprise = Object.entries(peMap).map(([name, count]) => ({ name: name.length > 16 ? name.slice(0, 14) + "…" : name, count })).sort((a, b) => b.count - a.count).slice(0, 8);

  // Chart 2: Type breakdown
  const typeMap = {};
  relationships.forEach((r) => { typeMap[r.relationship_type] = (typeMap[r.relationship_type] || 0) + 1; });
  const typeData = Object.entries(typeMap).map(([type, count]) => ({ name: TYPE_LABELS[type] || type, value: count, type }));

  // Chart 3: New per month (last 6)
  const monthData = Array.from({ length: 6 }, (_, i) => {
    const d = subMonths(new Date(), 5 - i);
    const key = format(d, "yyyy-MM");
    const count = relationships.filter((r) => r.start_date && r.start_date.startsWith(key)).length;
    return { month: format(d, "MMM"), count };
  });

  return (
    <div className="mt-8">
      <h2 className="text-base font-semibold text-slate-700 mb-4">Relationship Analytics</h2>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Bar chart */}
        <div className="bg-white rounded-2xl border border-slate-100 p-5">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4">People per Enterprise</p>
          {peoplePerEnterprise.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={peoplePerEnterprise} margin={{ left: -20 }}>
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="text-xs text-slate-400 text-center py-12">No person→enterprise data</p>}
        </div>

        {/* Pie chart */}
        <div className="bg-white rounded-2xl border border-slate-100 p-5">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4">Types Breakdown</p>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie data={typeData} cx="50%" cy="50%" innerRadius={45} outerRadius={70} dataKey="value" label={({ name, value }) => `${value}`} labelLine={false}>
                {typeData.map((entry, i) => <Cell key={i} fill={TYPE_COLORS[entry.type] || "#94a3b8"} />)}
              </Pie>
              <Tooltip formatter={(v, n) => [v, n]} />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {typeData.map((d, i) => (
              <span key={i} className="flex items-center gap-1 text-[10px] text-slate-500">
                <span className="w-2 h-2 rounded-full inline-block" style={{ background: TYPE_COLORS[d.type] || "#94a3b8" }} />
                {d.name}
              </span>
            ))}
          </div>
        </div>

        {/* Line chart */}
        <div className="bg-white rounded-2xl border border-slate-100 p-5">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4">New Relationships / Month</p>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={monthData} margin={{ left: -20 }}>
              <XAxis dataKey="month" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
              <Tooltip />
              <Line type="monotone" dataKey="count" stroke="#10b981" strokeWidth={2} dot={{ r: 3, fill: "#10b981" }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}