import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Link2, Users, AlertTriangle, Package } from "lucide-react";

function SummaryCard({ icon: Icon, label, value, iconBg, iconColor, valueColor, subtitle }) {
  return (
    <Card className="border border-slate-100 rounded-2xl">
      <CardContent className="pt-5 pb-4 px-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">{label}</p>
            <p className={`text-2xl font-black ${valueColor || "text-slate-800"}`}>{value}</p>
            {subtitle && <p className="text-[11px] text-slate-400 mt-1">{subtitle}</p>}
          </div>
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${iconBg}`}>
            <Icon className={`w-5 h-5 ${iconColor}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function RelationshipSummaryCards({ relationships, people }) {
  const active = relationships.filter((r) => r.status === "active" || !r.status);

  const uniquePeopleAssigned = new Set(
    relationships.filter((r) => r.relationship_type === "person_enterprise" && (r.status === "active" || !r.status)).map((r) => r.person_name).filter(Boolean)
  ).size;

  const assignedPeopleNames = new Set(
    relationships.filter((r) => r.relationship_type === "person_enterprise" && (r.status === "active" || !r.status)).map((r) => r.person_name).filter(Boolean)
  );
  const unassigned = people.filter((p) => {
    const name = p.preferred_name || `${p.first_name} ${p.last_name}`.trim();
    return !assignedPeopleNames.has(name);
  }).length;

  const itemsAssigned = new Set(
    relationships.filter((r) => ["item_enterprise", "item_person"].includes(r.relationship_type) && (r.status === "active" || !r.status)).map((r) => r.item_name).filter(Boolean)
  ).size;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      <SummaryCard icon={Link2} label="Active Relationships" value={active.length} iconBg="bg-emerald-100" iconColor="text-emerald-600" />
      <SummaryCard icon={Users} label="People Assigned" value={uniquePeopleAssigned} iconBg="bg-blue-100" iconColor="text-blue-600" />
      <SummaryCard
        icon={AlertTriangle}
        label="Unassigned People"
        value={unassigned}
        iconBg={unassigned > 0 ? "bg-amber-100" : "bg-slate-100"}
        iconColor={unassigned > 0 ? "text-amber-600" : "text-slate-400"}
        valueColor={unassigned > 0 ? "text-amber-600" : "text-slate-500"}
        subtitle={unassigned > 0 ? "No enterprise assignment" : "All assigned"}
      />
      <SummaryCard icon={Package} label="Items Assigned" value={itemsAssigned} iconBg="bg-purple-100" iconColor="text-purple-600" />
    </div>
  );
}